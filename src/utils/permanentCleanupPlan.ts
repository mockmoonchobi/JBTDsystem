import { activeGrid, ROW_META, Snapshot } from './rowSyncPlan';
import { PURGE_LEDGER, LEDGER_HEADER, RECORD_KINDS, readPurgeLedger } from './purgeLedger';
import { resolveExportSheetName } from './sheetsExportUtils';
import { encodedTemplePrefix, savedTemplePrefix } from './templePrefixes';
import { planHistoryCleanup } from './historyMaintenancePlan';
import { SORTED_TABLES, tableOrder } from './tableSort';
export function deletionRanges(indices: number[]) {
  const ranges: { startIndex: number; endIndex: number }[] = [];
  for (const index of indices) {
    const last = ranges[ranges.length - 1];
    if (last?.endIndex === index) last.endIndex++;
    else ranges.push({ startIndex: index, endIndex: index + 1 });
  }
  return ranges.reverse();
}
export function planPermanentCleanup(before: Snapshot, epoch: string, now: number) {
  const expected: Snapshot = structuredClone(before), ranges: Record<string, ReturnType<typeof deletionRanges>> = {}, counts: Record<string, number> = {};
  const entries = readPurgeLedger(before[PURGE_LEDGER]);
  const reserved = new Map(entries.map(r => [r[0] + ':' + r[1], r]));
  const titles = Object.keys(before);
  for (const [canonical, kind] of Object.entries(RECORD_KINDS)) {
    const title = resolveExportSheetName(canonical, titles), grid = before[title];
    if (!grid?.length || counts[title] !== undefined) continue;
    activeGrid(grid); // Validate all management columns and flags before deleting anything.
    const header = grid[0].map(String), flag = header.indexOf(ROW_META[0]);
    if (flag < 0 || !/ID|ＩＤ/i.test(header[0])) continue;
    const ids = new Set<string>(), deleted: number[] = [];
    grid.slice(1).forEach((row, i) => {
      if (!row.some(v => v !== '' && v != null)) return;
      const id = String(row[0] || '').trim();
      if (!id || ids.has(id)) throw new Error('IDが空または重複しています：' + title);
      ids.add(id);
      if (String(row[flag]) !== '1') return;
      // Fiscal moves leave a tombstone in the old accounting table. Keep that ID
      // usable in its active table; the surviving row continues to reserve it.
      const activeElsewhere = kind === 'transaction' && ['出納・会計', '出納アーカイブ'].some(n => {
        const other = resolveExportSheetName(n, titles);
        return other !== title && activeGrid(before[other] || []).slice(1).some(r => String(r[0]) === id);
      });
      const temple = String(row[header.indexOf('所属寺院ID')] || '');
      const household = kind === 'household' ? id : String(row[header.findIndex(h => /^(檀家ID|世帯ID)$/.test(h))] || '');
      const prefix = kind === 'temple' ? (savedTemplePrefix(id) || encodedTemplePrefix(id) || '') : (household.match(/^(DK|K\d+)-/i)?.[0].toUpperCase() || '');
      if (kind === 'temple' && id !== 'temple-main' && !prefix) throw new Error('寺院の使用済み接頭辞を確認できません。再連携してから整理してください。');
      if (!activeElsewhere) reserved.set(kind + ':' + id, reserved.get(kind + ':' + id) || [kind, id, temple, prefix, epoch]);
      deleted.push(i + 1);
    });
    if (deleted.length) { const removed = new Set(deleted); expected[title] = grid.filter((_, i) => !removed.has(i)); ranges[title] = deletionRanges(deleted); counts[title] = deleted.length; }
  }
  const historyTitle = resolveExportSheetName('操作・削除履歴', titles), history = before[historyTitle];
  if (!history || history[0]?.[0] !== '履歴ID') throw new Error('操作履歴を確認できません。');
  const total = history.slice(1).filter(r => r.some(v => v !== '' && v != null)).length;
  let removedHistory = 0;
  if (total > 2000) {
    const plan = planHistoryCleanup(history, 999);
    expected[historyTitle] = plan.kept; ranges[historyTitle] = plan.ranges; removedHistory = total - 999;
  }
  if (!removedHistory && !Object.keys(counts).length) throw new Error('現在、整理する古い履歴・削除済みデータはありません。');
  const summary = '整理：古い履歴 ' + removedHistory + '件、削除済みデータ ' + Object.entries(counts).map(([n,c]) => n + ' ' + c + '件').join('、');
  const audit = history[0].map((_, i) => [epoch, 'update', 'temple', epoch, summary, new Date(now).toISOString(), String(now)][i] || '');
  const auditIndex = expected[historyTitle].length;
  expected[historyTitle].push(audit);
  expected[PURGE_LEDGER] = [LEDGER_HEADER, ...reserved.values()];
  const sorts: Record<string, number[]> = {};
  for (const name of SORTED_TABLES) {
    const title = resolveExportSheetName(name, titles), grid = expected[title];
    if (!grid?.length) continue;
    const order = tableOrder(name, grid);
    if (order.some((index, i) => index !== i + 1)) {
      sorts[title] = order;
      expected[title] = [grid[0], ...order.map(i => grid[i])];
    }
  }
  return { expected, ranges, counts, removedHistory, historyTitle, audit, auditIndex, sorts };
}
