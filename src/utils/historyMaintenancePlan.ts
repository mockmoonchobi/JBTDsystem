import { fingerprint } from './rowSyncPlan';

export const CONTROL_SHEET = '__JBTD同期管理';
export const ARCHIVE_PREFIX = '__JBTD履歴保管_';
export const isMaintenanceSheet = (title: string) => title === CONTROL_SHEET || title.startsWith(ARCHIVE_PREFIX);
export interface MaintenanceState {
  version: 1; owner: string; initiatorTab?: string; purpose?: 'merge'; mergeDevice?: string; mergeReady?: boolean; mergeSubmitted?: boolean; phase: 'running' | 'preparing' | 'compacting'; epoch: string; revision: string; submitted?: boolean; ledgerFingerprint?: string;
}
export interface MaintenanceDevice {
  id: string; device: string; name: string; ack: string; reason: string; retired: boolean; row: number;
}
export function waitingDevices(devices: MaintenanceDevice[], epoch: string): MaintenanceDevice[] {
  return devices.filter(d => !d.retired && (d.ack !== epoch || !!d.reason));
}
/** History portion of cleanup; record deletion is planned separately. */
export function planHistoryCleanup(grid: unknown[][], keepCount = 1000) {
  if (grid[0]?.[0] !== '履歴ID') throw new Error('履歴の見出しを確認できません。整理を中止しました。');
  const rows = grid.slice(1).map((row, index) => ({ row, index: index + 1 })).filter(x => x.row.some(v => v !== '' && v != null));
  const ids = rows.map(x => String(x.row[0] || ''));
  if (ids.some(id => !id) || new Set(ids).size !== ids.length) throw new Error('履歴IDが不正または重複しています。整理を中止しました。');
  if (rows.some(x => !Number.isFinite(Number(x.row[6])) || Number(x.row[6]) <= 0)) throw new Error('履歴の日時を確認できません。整理を中止しました。');
  if (rows.length <= 2000) throw new Error('履歴が2,000件以下のため整理は不要です。');
  const keep = new Set([...rows].sort((a, b) => Number(b.row[6]) - Number(a.row[6]) || b.index - a.index).slice(0, keepCount).map(x => x.index));
  const removed = rows.filter(x => !keep.has(x.index));
  const indices = new Set(removed.map(x => x.index));
  const ranges: { startIndex: number; endIndex: number }[] = [];
  for (const { index } of removed) {
    const last = ranges[ranges.length - 1];
    if (last?.endIndex === index) last.endIndex++;
    else ranges.push({ startIndex: index, endIndex: index + 1 });
  }
  return { archive: [grid[0], ...removed.map(x => x.row)], kept: grid.filter((_, i) => !indices.has(i)), ranges: ranges.reverse(), count: rows.length };
}
export const sameHistory = (a: unknown[][], b: unknown[][]) => fingerprint(a) === fingerprint(b);
