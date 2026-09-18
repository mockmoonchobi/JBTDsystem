import { createSyncYield } from './syncResponsiveness';
import { RESERVATION_DETAILS_HEADER } from './reservationSheetDetails';
import { PURGE_LEDGER, readPurgeLedger, RECORD_KINDS } from './purgeLedger';
import { encodedTemplePrefix, savedTemplePrefix } from './templePrefixes';
import { ExportSheet, resolveExportSheetName } from './sheetsExportUtils';
import { SheetUpdate } from './sheetsExportCache';

export type Grid = unknown[][];
export type Snapshot = Record<string, Grid>;
export const ROW_META = ['__JBTD削除済', '__JBTD削除日時', '__JBTD更新ID'];
const cell = (v: unknown) => v === undefined || v === null ? '' : String(v);
const trimRow = (row: unknown[]) => {
  const r = row.map(cell);
  while (r.length && r[r.length - 1] === '') r.pop();
  return r;
};
export const fingerprint = (grid: Grid) => JSON.stringify(grid.map(trimRow).filter(r => r.length));
export function activeGrid(grid: Grid): Grid {
  if (!grid.length) return [];
  const columns = ROW_META.map(h => grid[0].indexOf(h));
  if (columns.every(i => i < 0)) return grid;
  if (columns.some(i => i < 0)) throw new Error('追記方式の管理列が不完全です。書き込みを停止しました。');
  const business = grid[0].map((_, i) => i).filter(i => !columns.includes(i));
  const rows = grid.slice(1).filter(row => {
    const flag = cell(row[columns[0]]);
    if (flag !== '' && flag !== '0' && flag !== '1') throw new Error('削除済みフラグが不正です。');
    return flag !== '1';
  });
  return [grid[0], ...rows].map(row => business.map(i => row[i] ?? ''));
}
export function groupUpdates(updates: SheetUpdate[]): Snapshot {
  const out: Snapshot = {};
  for (const u of updates) {
    const match = u.range.match(/^'((?:[^']|'')+)'!A([1-9]\d*)$/);
    if (!match) throw new Error('出力範囲が不正です。');
    const name = match[1].replace(/''/g, "'");
    const rows = out[name] ||= [];
    const start = Number(match[2]) - 1;
    if (start !== rows.length) throw new Error('出力データの行が連続していません。');
    rows.push(...u.values);
  }
  return out;
}
const entity: Record<string, string> = {
  '檀家名簿':'household', '家族構成':'familyMember', '過去帳':'pastRecord',
  '法事予約':'memorialService', '寺院ToDo':'templeTodo', '出納・会計':'transaction',
  '出納アーカイブ':'transaction', '寺院一覧（本寺・兼務）':'temple', '寺院情報':'temple',
  '登録僧侶一覧':'priest', '案内文テンプレート':'noticeTemplate', '戦没・災害物故者命日設定':'disasterMemorial',
};
function cells(row: unknown[]) {
  if (row.some(value => typeof value === 'number' && !Number.isFinite(value))) throw new Error('無効な数値が含まれています。');
  return { values: row.map(value => ({ userEnteredValue:
    typeof value === 'number' ? { numberValue: value } :
    typeof value === 'boolean' ? { boolValue: value } : { stringValue: cell(value) } })) };
}
function changed(a: unknown[], b: unknown[]) { return JSON.stringify(trimRow(a)) !== JSON.stringify(trimRow(b)); }

/** One atomic batch: stable ID updates, new tail rows, tombstones; never whole-sheet clearing. */
function* rowSyncPlanSteps(
  desired: Snapshot, current: Snapshot, baseline: Snapshot, sheets: ExportSheet[],
  operationId: string, now: string, reviewed = false, restoreHouseholdId?: string, deletedRecordIds: string[] = [],
) {
  const reservations = readPurgeLedger(current[PURGE_LEDGER]);
  if (baseline[PURGE_LEDGER] && !current[PURGE_LEDGER]) throw new Error('使用済みIDの管理シートがありません。');
  if (desired[PURGE_LEDGER]) throw new Error('使用済みIDの管理シートは通常保存できません。');
  const reserved = new Set(reservations.map(r => r[0] + ':' + r[1]));
  const requests: any[] = [];
  const expected: Snapshot = {};
  const titles = sheets.map(s => s.title);
  const oldHistoryTitle = resolveExportSheetName('操作・削除履歴', Object.keys(baseline));
  const oldLogIds = new Set((activeGrid(baseline[oldHistoryTitle] || []).slice(1)).map(r => cell(r[0])));
  const history = desired['操作・削除履歴'] || [];
  const deletionProof = new Set(history.slice(1)
    .filter(r => !oldLogIds.has(cell(r[0])) && ['delete', 'batch_delete'].includes(cell(r[1])))
    .map(r => cell(r[2]) + ':' + cell(r[3])));
  const accountingEditProof = new Set(history.slice(1)
    .filter(r => !oldLogIds.has(cell(r[0])) && cell(r[2]) === 'transaction' && !['delete', 'batch_delete'].includes(cell(r[1])))
    .map(r => cell(r[3])));
  const txIds = new Set(['出納・会計', '出納アーカイブ'].flatMap(t => (desired[t] || []).slice(1).map(r => cell(r[0]))));
  const summary = { added: 0, updated: 0, deleted: 0 };
  for (const [name, target] of Object.entries(desired)) {
    yield;
    const title = resolveExportSheetName(name, titles);
    const sheet = sheets.find(s => s.title === title);
    if (!sheet) throw new Error('出力先がありません: ' + name);
    let raw = current[title] || [];
    const base = baseline[title];
    if (base === undefined && raw.some(r => trimRow(r).length)) throw new Error('同期基準がありません。Googleシートを再読込してください: ' + title);
    const recordRebase = !reviewed && !!base &&
      !changed(activeGrid(base)[0] || [], activeGrid(raw)[0] || []);
    if (base && fingerprint(base) !== fingerprint(raw) && !recordRebase) {
      throw new Error('他の操作による変更を検出しました。再連携で確認してください: ' + title);
    }
    const headers = target[0]?.map(cell);
    if (!headers?.length) throw new Error('出力見出しがありません。');
    let oldHeaders = raw[0]?.map(cell) || [];
    let businessHeaders = oldHeaders.filter(h => !ROW_META.includes(h));
    // Explicitly supported atomic schema extensions. Existing tombstones and
    // row IDs are carried forward; all other schema changes still fail closed.
    const addedHeader = name === '法事予約' ? RESERVATION_DETAILS_HEADER : name === '檀家名簿' ? '屋号' : undefined;
    const extendSchema = !!addedHeader && headers.at(-1) === addedHeader &&
      businessHeaders.length > 0 && !changed(businessHeaders, headers.slice(0, -1));
    if (extendSchema) {
      const meta = ROW_META.map(h => oldHeaders.indexOf(h));
      if (meta.some(i => i >= 0) && meta.some((i, n) => i !== businessHeaders.length + n)) throw new Error('管理列が不完全です: ' + title);
      raw = raw.map((row, index) => [...businessHeaders.map((_, c) => row[c] ?? ''), index === 0 ? addedHeader : '', ...row.slice(businessHeaders.length)]);
      oldHeaders = raw[0].map(cell);
      businessHeaders = oldHeaders.filter(h => !ROW_META.includes(h));
    }
    if (businessHeaders.length && changed(businessHeaders, headers)) throw new Error('列構成が異なるため保存を停止しました: ' + title);
    const metaPresent = ROW_META.map(h => oldHeaders.indexOf(h));
    if (metaPresent.some(i => i >= 0) && metaPresent.some(i => i < 0)) throw new Error('管理列が不完全です: ' + title);
    if (metaPresent[0] >= 0 && metaPresent.some((v, i) => v !== headers.length + i)) throw new Error('管理列の位置が変更されています: ' + title);
    const width = headers.length;
    const physical: Grid = raw.map(r => [...r]);
    physical[0] = [...headers, ...ROW_META];
    const edits = new Map<number, unknown[]>();
    const appended: unknown[][] = [];
    if (extendSchema) raw.forEach((row, i) => edits.set(i, row));
    if (changed(oldHeaders, physical[0])) edits.set(0, physical[0]);
    const positional = !/ID|ＩＤ/i.test(headers[0]);
    const key = (row: unknown[], index: number) => positional ? 'row:' + index : cell(row[0]).trim();
    const existing = new Map<string, { index: number; row: unknown[] }>();
    for (let index = 1; index < raw.length; index++) {
      if (index % 128 === 0) yield;
      if (!trimRow(raw[index]).length) continue;
      const id = key(raw[index], index);
      if (!id || existing.has(id)) throw new Error('IDが空または重複しています: ' + title);
      const flag = cell(raw[index][width]);
      if (flag && flag !== '0' && flag !== '1') throw new Error('削除済みフラグが不正です: ' + title);
      existing.set(id, { index, row: raw[index] });
    }
    const baselineRows = new Map((base || []).slice(1).map((r,i) => [key(r,i+1), r]));
    const incoming = new Set<string>();
    for (let index = 1; index < target.length; index++) {
      if (index % 128 === 0) yield;
      let row = headers.map((_, c) => target[index][c] ?? '');
      const id = key(row, index);
      if (!id || incoming.has(id)) throw new Error('端末のIDが空または重複しています: ' + title);
      if (reserved.has(RECORD_KINDS[name] + ':' + id)) throw new Error('完全削除済みのIDは再利用・復帰できません：' + id);
      if (RECORD_KINDS[name] === 'temple' && reservations.some(r => r[0] === 'temple' && r[1] !== id && r[3] && r[3] === (encodedTemplePrefix(id) || savedTemplePrefix(id)))) throw new Error('使用済みの寺院接頭辞は再利用できません。');
      incoming.add(id);
      const previous = existing.get(id);
      const original = baselineRows.get(id);
      if (recordRebase && previous && original) {
        // Apply only this terminal's changed fields, never its stale snapshot.
        row = row.map((v,c) => changed([original[c]], [v]) ? v : previous.row[c] ?? '');
      }
      if (recordRebase && previous && !original && changed(previous.row.slice(0,width),row)) throw new Error('新規IDが既に使用されています: ' + title + ' / ' + id);
      const keepDeleted = !(name === '檀家名簿' && restoreHouseholdId === id) && recordRebase && !!original && cell(previous?.row[width]) === '1';
      if ((name === '寺院一覧（本寺・兼務）' || name === '寺院情報') && /^temple-sub-K/i.test(id)) {
        const prefix = encodedTemplePrefix(id);
        const otherIds = [...existing.keys(), ...target.slice(1).map(r => cell(r[0]))];
        if (otherIds.some(other => other !== id && (savedTemplePrefix(other) || encodedTemplePrefix(other)) === prefix)) {
          throw new Error('寺院の檀家ID接頭辞が重複しています：' + prefix + '。再連携して寺院設定を確認してください。');
        }
      }

      const otherAccounting = name === '出納・会計' ? '出納アーカイブ' : name === '出納アーカイブ' ? '出納・会計' : '';
      const fiscalMove = otherAccounting && activeGrid(current[resolveExportSheetName(otherAccounting, titles)] || []).slice(1).some(r => cell(r[0]) === id) &&
        !(desired[otherAccounting] || []).slice(1).some(r => cell(r[0]) === id);
      const retainDeleted = (keepDeleted && !fiscalMove) || reviewed && deletedRecordIds.includes(RECORD_KINDS[name] + ':' + id);
      if (retainDeleted && !previous) throw new Error('削除済み行が見つかりません: ' + id);
      if (!retainDeleted && name === '檀家名簿' && previous && cell(previous.row[width]) === '1' && restoreHouseholdId !== id) {
        throw new Error('削除済みの檀家IDは再利用できません。名簿への復帰は削除した端末の確認画面から行ってください: ' + id);
      }
      if (!retainDeleted && previous && cell(previous.row[width]) === '1' && !reviewed && !positional && !fiscalMove) {
        // Another tab may have deleted this unchanged accounting row while we deleted a different one.
        // Keep the authoritative tombstone; actual edits or explicit restoration still require review.
        if (otherAccounting && !accountingEditProof.has(id) && !changed(previous.row.slice(0, width), row)) continue;
        throw new Error('削除済みIDの再登録を検出しました。再連携で確認してください: ' + title + ' / ' + id);
      }
      const compareRow = (r: unknown[]) => name === '案内文テンプレート' ? r.filter((_, c) => headers[c] !== '最終更新日時') : r;
      if (!retainDeleted && previous && cell(previous.row[width]) !== '1' && !changed(compareRow(previous.row.slice(0, width)), compareRow(row))) continue;
      if (retainDeleted && previous && !changed(previous.row.slice(0,width), row)) continue;
      const rowIndex = previous?.index ?? physical.length;
      const next = retainDeleted ? [...row, '1', previous!.row[width + 1] || now, operationId] : [...row, '', '', operationId];
      physical[rowIndex] = next;
      if (!previous && !positional) appended.push(next);
      else edits.set(rowIndex, next);
      summary[previous ? 'updated' : 'added']++;
    }
    let checkedDeleted = 0;
    for (const [id, previous] of existing) {
      if (++checkedDeleted % 128 === 0) yield;
      if (incoming.has(id) || cell(previous.row[width]) === '1' || name === '操作・削除履歴') continue;
      if (recordRebase && !baselineRows.has(id)) continue; // Preserve unseen peer creations.
      const kind = entity[name];
      const templeColumn = headers.indexOf('所属寺院ID');
      const householdColumn = headers.findIndex(h => h.includes('檀家ID') || h === '世帯ID');
      if (name === '家族構成' && householdColumn >= 0 && !deletionProof.has('familyMember:' + id)) {
        const householdId = cell(previous.row[householdColumn]);
        const hh = current[resolveExportSheetName('檀家名簿', titles)] || [];
        const flag = hh[0]?.indexOf(ROW_META[0]) ?? -1;
        if (deletionProof.has('household:' + householdId) || hh.slice(1).some(r => cell(r[0]) === householdId && cell(r[flag]) === '1')) continue;
      }
      const permitted = reviewed || !kind || deletionProof.has(kind + ':' + id) ||
        (templeColumn >= 0 && deletionProof.has('temple:' + cell(previous.row[templeColumn]))) ||
        (name === '家族構成' && householdColumn >= 0 && deletionProof.has('household:' + cell(previous.row[householdColumn]))) ||
        (kind === 'transaction' && txIds.has(id));
      if (!permitted) throw new Error('削除操作の裏付けがないデータ減少を検出しました: ' + title + ' / ' + id);
      const next = [...headers.map((_, c) => previous.row[c] ?? ''), '1', now, operationId];
      physical[previous.index] = next;
      edits.set(previous.index, next);
      summary.deleted++;
    }
    expected[title] = physical;
    const serverAppend = !positional;
    if (serverAppend && width + 3 > sheet.columnCount) {
      requests.push({ updateSheetProperties: { properties: { sheetId: sheet.sheetId, gridProperties: { columnCount: width + 3 } }, fields: 'gridProperties.columnCount' } });
    } else if (!serverAppend && (physical.length > sheet.rowCount || width + 3 > sheet.columnCount)) {
      requests.push({ updateSheetProperties: { properties: { sheetId: sheet.sheetId, gridProperties: {
        rowCount: Math.max(physical.length + 100, sheet.rowCount), columnCount: Math.max(width + 3, sheet.columnCount),
      } }, fields: 'gridProperties(rowCount,columnCount)' } });
    }
    // Group adjacent changed rows only; untouched data cells are never rewritten.
    let start = -1, rows: unknown[][] = [];
    const flush = () => {
      if (!rows.length) return;
      requests.push({ updateCells: { start: { sheetId: sheet.sheetId, rowIndex: start, columnIndex: 0 }, rows: rows.map(cells), fields: 'userEnteredValue' } });
      rows = [];
    };
    for (const [index, row] of [...edits].sort((a, b) => a[0] - b[0])) {
      if (!reviewed && !extendSchema && index > 0 && raw[index]) {
        flush();
        const prior = raw[index];
        for (let c=0;c<row.length;c++) {
          if (!changed([prior[c]], [row[c]])) continue;
          requests.push({updateCells:{start:{sheetId:sheet.sheetId,rowIndex:index,columnIndex:c},rows:[cells([row[c]])],fields:'userEnteredValue'}});
        }
        continue;
      }

      if (rows.length && index !== start + rows.length) flush();
      if (!rows.length) start = index;
      rows.push(row);
    }
    flush();
    if (appended.length) requests.push({ appendCells: { sheetId: sheet.sheetId, rows: appended.map(cells), fields: 'userEnteredValue' } });
  }
  return { requests, expected, summary };
}

export function makeRowSyncPlan(...args: Parameters<typeof rowSyncPlanSteps>) {
  const steps = rowSyncPlanSteps(...args);
  let step = steps.next();
  while (!step.done) step = steps.next();
  return step.value;
}
export async function makeRowSyncPlanResponsive(...args: Parameters<typeof rowSyncPlanSteps>) {
  const steps = rowSyncPlanSteps(...args), yieldUI = createSyncYield();
  let step = steps.next();
  while (!step.done) { const pause = yieldUI(); if (pause) await pause; step = steps.next(); }
  return step.value;
}
