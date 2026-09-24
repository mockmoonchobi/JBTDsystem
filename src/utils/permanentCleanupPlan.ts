import { activeGrid, ROW_META, Snapshot } from './rowSyncPlan';
import { PURGE_LEDGER, LEDGER_HEADER, RECORD_KINDS, readPurgeLedger } from './purgeLedger';
import { resolveExportSheetName } from './sheetsExportUtils';
import { encodedTemplePrefix, savedTemplePrefix } from './templePrefixes';
import { planHistoryCleanup } from './historyMaintenancePlan';
import { SORTED_TABLES, tableOrder } from './tableSort';
import { extractTempleFiscalConfigs, getFiscalYearOfDate, getJapanDateString } from './fiscalYearUtils';

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

  // 1. 会計年度を過ぎた過年度出納データ（前々年度以前）のアーカイブ移動対象を特定
  const txTitle = resolveExportSheetName('出納・会計', titles);
  const txGrid = before[txTitle];
  const archivedTxIndices: number[] = [];
  const archivedTxRows: unknown[][] = [];
  const archivedTxIds = new Set<string>();

  if (txGrid && txGrid.length > 1) {
    const { configs, fallback } = extractTempleFiscalConfigs(before);
    const txHeader = txGrid[0].map(String);
    const flagIdx = txHeader.indexOf(ROW_META[0]);
    const dateIdx = txHeader.findIndex(h => /^(日付|取引日|年月日)$/i.test(h));
    const templeIdIdx = txHeader.findIndex(h => /^(所属寺院ID|寺院ID)$/i.test(h));
    const todayStr = getJapanDateString(new Date(now));

    if (dateIdx >= 0) {
      txGrid.slice(1).forEach((row, i) => {
        if (!row.some(v => v !== '' && v != null)) return;
        const id = String(row[0] || '').trim();
        if (!id) return;
        // 削除済みフラグがある行は通常の削除処理に任せる
        if (flagIdx >= 0 && String(row[flagIdx]) === '1') return;

        const dateStr = String(row[dateIdx] || '').trim();
        if (!dateStr) return; // 日付なしはアクティブに残す

        const templeId = templeIdIdx >= 0 ? String(row[templeIdIdx] || '').trim() : '';
        const cfg = configs.get(templeId) || fallback;
        const currentFY = getFiscalYearOfDate(todayStr, cfg as any);
        const priorFY = currentFY - 1;
        const txFY = getFiscalYearOfDate(dateStr, cfg as any);

        // 前々年度以前（txFY < priorFY）の取引を出納アーカイブへ移動
        if (txFY < priorFY) {
          archivedTxIndices.push(i + 1); // 1-based index (header is 0)
          archivedTxRows.push(row);
          archivedTxIds.add(id);
        }
      });
    }
  }

  // 2. 各シートの削除・アーカイブ処理
  for (const [canonical, kind] of Object.entries(RECORD_KINDS)) {
    const title = resolveExportSheetName(canonical, titles), grid = before[title];
    if (!grid?.length || counts[title] !== undefined) continue;
    activeGrid(grid); // Validate all management columns and flags before deleting anything.
    const header = grid[0].map(String), flag = header.indexOf(ROW_META[0]);
    if (flag < 0 || !/ID|ＩＤ/i.test(header[0])) continue;
    const ids = new Set<string>(), deleted: number[] = [];
    const isTxSheet = (canonical === '出納・会計');

    grid.slice(1).forEach((row, i) => {
      if (!row.some(v => v !== '' && v != null)) return;
      const id = String(row[0] || '').trim();
      if (!id || ids.has(id)) throw new Error('IDが空または重複しています：' + title);
      ids.add(id);

      const isTombstone = String(row[flag]) === '1';
      const isArchivedMove = isTxSheet && archivedTxIds.has(id);

      if (!isTombstone && !isArchivedMove) return;

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
      
      // アーカイブ移動された行はID予約台帳（完全削除）には含めない
      if (!activeElsewhere && !isArchivedMove) {
        reserved.set(kind + ':' + id, reserved.get(kind + ':' + id) || [kind, id, temple, prefix, epoch]);
      }
      deleted.push(i + 1);
    });
    if (deleted.length) {
      const removed = new Set(deleted);
      expected[title] = grid.filter((_, i) => !removed.has(i));
      ranges[title] = deletionRanges(deleted);
      counts[title] = deleted.length;
    }
  }

  // 3. 出納アーカイブシートへの追加行の反映
  let archiveAppends: { title: string; rows: unknown[][]; isNewSheet: boolean } | undefined = undefined;
  if (archivedTxRows.length > 0) {
    const archiveTitle = resolveExportSheetName('出納アーカイブ', titles);
    const existingArchiveGrid = before[archiveTitle];
    if (existingArchiveGrid && existingArchiveGrid.length > 0) {
      expected[archiveTitle] = [...existingArchiveGrid, ...archivedTxRows];
      archiveAppends = { title: archiveTitle, rows: archivedTxRows, isNewSheet: false };
    } else {
      const headerRow = txGrid[0];
      expected[archiveTitle] = [headerRow, ...archivedTxRows];
      archiveAppends = { title: archiveTitle, rows: archivedTxRows, isNewSheet: true };
    }
  }

  // 4. 操作・削除履歴の整理
  const historyTitle = resolveExportSheetName('操作・削除履歴', titles), history = before[historyTitle];
  if (!history || history[0]?.[0] !== '履歴ID') throw new Error('操作履歴を確認できません。');
  const total = history.slice(1).filter(r => r.some(v => v !== '' && v != null)).length;
  let removedHistory = 0;
  if (total > 2000) {
    const plan = planHistoryCleanup(history, 999);
    expected[historyTitle] = plan.kept; ranges[historyTitle] = plan.ranges; removedHistory = total - 999;
  }

  const archiveCount = archivedTxRows.length;
  if (!removedHistory && !Object.keys(counts).length && !archiveCount) {
    throw new Error('現在、整理する古い履歴・削除済みデータはありません。');
  }

  const summaryParts: string[] = [];
  if (removedHistory > 0) summaryParts.push('古い履歴 ' + removedHistory + '件');
  if (archiveCount > 0) summaryParts.push('過年度出納アーカイブ ' + archiveCount + '件');
  const deletedSummary = Object.entries(counts)
    .map(([n, c]) => {
      const isTx = (n === txTitle);
      const actualPurged = isTx ? c - archiveCount : c;
      return actualPurged > 0 ? `${n} ${actualPurged}件` : '';
    })
    .filter(Boolean)
    .join('、');
  if (deletedSummary) summaryParts.push('削除済みデータ ' + deletedSummary);

  const summary = '整理：' + (summaryParts.join('、') || '完了');
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
  return { expected, ranges, counts, removedHistory, archiveCount, archiveAppends, historyTitle, audit, auditIndex, sorts };
}
