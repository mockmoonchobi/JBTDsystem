import { activeGrid, ROW_META, Snapshot, Grid } from './rowSyncPlan';
import { ExportSheet, resolveExportSheetName } from './sheetsExportUtils';

export const APPEND_TABLES = ['出納・会計', '操作・削除履歴'];
const value = (v: unknown) => String(v ?? '');
export const equalSheetsCells = (a: unknown[], b: unknown[]) => {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? '', y = b[i] ?? '';
    if (value(x) === value(y)) continue;
    if (typeof x === 'number' && Number.isFinite(x) && value(y).trim() && Number(value(y).replace(/,/g, '')) === x) continue;
    if (typeof y === 'number' && Number.isFinite(y) && value(x).trim() && Number(value(x).replace(/,/g, '')) === y) continue;
    if ((typeof x === 'boolean' || typeof y === 'boolean') && value(x).toUpperCase() === value(y).toUpperCase()) continue;
    return false;
  }
  return true;
};

const equal = equalSheetsCells;

/** Only genuinely new accounting and its audit entries qualify. Never infer deletion. */
export function accountingAdditions(desired: Snapshot, baseline: Snapshot, changed?: Set<string>): Snapshot | null {
  const added: Snapshot = {};
  for (const [name, target] of Object.entries(desired)) {
    if (changed && !changed.has(name)) continue;
    const title = resolveExportSheetName(name, Object.keys(baseline));
    const old = activeGrid(baseline[title] || []);
    if (!APPEND_TABLES.includes(name)) {
      // Sheets returns formatted numeric cells; templates also receive an
      // export-time timestamp even when the document itself was not edited.
      const comparable = (grid: Grid) => grid.filter(row => row.some(v => value(v) !== '')).map(row =>
        name === '案内文テンプレート' ? row.filter((_, i) => i !== 5) : row);
      const before = comparable(old), after = comparable(target);
      if (before.length !== after.length || !before.every((row,i) => equal(row,after[i]))) return null;
      continue;
    }
    if (!old.length || !equal(old[0], target[0] || [])) return null;
    const current = new Map(target.slice(1).map(r => [value(r[0]), r]));
    if (current.size !== target.length - 1 || current.has('')) return null;
    // The displayed history is capped. Missing old history entries are not deletions.
    for (const row of old.slice(1)) {
      const next = current.get(value(row[0]));
      if (name !== '操作・削除履歴' && !next) return null;
      if (next && !equal(row, next)) return null;
      current.delete(value(row[0]));
    }
    added[name] = [target[0], ...current.values()];
  }
  const tx = added['出納・会計'];
  if (!tx) return null;
  if (tx.length === 1 && (!added['操作・削除履歴'] || added['操作・削除履歴'].length === 1)) return {};
  const ids = new Set(tx.slice(1).map(r => value(r[0])));
  const logs = added['操作・削除履歴'];
  if (!logs || logs.length < 2 || logs.slice(1).some(r =>
    !['create', 'add'].includes(value(r[1])) || value(r[2]) !== 'transaction' || !ids.has(value(r[3])))) return null;
  if ([...ids].some(id => !logs.slice(1).some(r => value(r[3]) === id))) return null;
  return added;
}

export function appendCells(sheetId: number, rows: Grid) {
  return { appendCells: { sheetId, fields: 'userEnteredValue', rows: rows.map(row => ({ values: row.map(v => ({
    userEnteredValue: typeof v === 'number' ? { numberValue: v } : typeof v === 'boolean' ? { boolValue: v } : { stringValue: value(v) },
  })) })) } };
}

/** An atomic batch appends both the accounting rows and their audit evidence. */
export function makeAccountingAppend(additions: Snapshot, current: Snapshot, sheets: ExportSheet[], operationId: string) {
  const expected: Snapshot = {}, requests: any[] = [];
  for (const [name, grid] of Object.entries(additions)) {
    if (grid.length < 2) continue;
    const title = resolveExportSheetName(name, sheets.map(s => s.title));
    const raw = current[title];
    const headers = [...grid[0], ...ROW_META];
    const sheet = sheets.find(s => s.title === title);
    if (!raw || !sheet) return null;
    if (!equal(raw[0], headers)) {
      // An untouched legacy workbook has exactly the business columns. Add only
      // metadata headings in the same atomic batch as the receipt and audit.
      // Partial metadata and unknown columns must never be guessed or overwritten.
      if (!equal(raw[0] || [], grid[0])) return null;
      if (sheet.columnCount !== undefined && sheet.columnCount < headers.length) {
        requests.push({ updateSheetProperties: { properties: { sheetId: sheet.sheetId, gridProperties: { columnCount: headers.length } }, fields: 'gridProperties.columnCount' } });
      }
      requests.push({ updateCells: { start: { sheetId: sheet.sheetId, rowIndex: 0, columnIndex: grid[0].length },
        rows: [{ values: ROW_META.map(name => ({ userEnteredValue: { stringValue: name } })) }], fields: 'userEnteredValue' } });
    }
    const existing = new Map<string, unknown[]>();
    for (const row of raw.slice(1).filter(r => r.some(v => value(v)))) {
      const id = value(row[0]);
      if (!id || existing.has(id)) throw new Error('IDが空または重複しています: ' + title);
      existing.set(id, row);
    }
    const rows: Grid = [], confirmed: Grid = [];
    for (const row of grid.slice(1)) {
      const saved = existing.get(value(row[0]));
      if (saved) {
        // A verified identical UUID is already saved, not a competing new record.
        // Never reuse a tombstoned ID or accept a business-value mismatch.
        if (!['', '0'].includes(value(saved[grid[0].length])) || !equal(row, saved.slice(0, grid[0].length)))
          throw new Error('他の操作による変更を検出しました。新規会計のIDを確認してください: ' + value(row[0]));
        confirmed.push(saved);
        continue;
      }
      if (row.some(v => typeof v === 'number' && !Number.isFinite(v))) throw new Error('無効な金額が含まれています。');
      rows.push([...row, '', '', operationId]);
    }
    expected[title] = [headers, ...confirmed, ...rows];
    if (rows.length) requests.push(appendCells(sheets.find(s => s.title === title)!.sheetId, rows));
  }
  return { expected, requests };
}

/** Verify our immutable operation, accepting unrelated concurrent appends. */
export function containsAppend(expected: Snapshot, actual: Snapshot): boolean {
  return Object.entries(expected).every(([name, grid]) => {
    const rows = actual[name] || [];
    if (!equal(grid[0], rows[0] || [])) return false;
    const byId = new Map<string, unknown[][]>();
    for (const row of rows.slice(1)) {
      const id = value(row[0]);
      if (!byId.has(id)) byId.set(id, []);
      byId.get(id)!.push(row);
    }
    return grid.slice(1).every(row => {
      const matches = byId.get(value(row[0])) || [];
      return matches.length === 1 && equal(row, matches[0]);
    });
  });
}
