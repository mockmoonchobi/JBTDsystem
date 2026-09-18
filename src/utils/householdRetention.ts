import { pendingOwner, isClosedPendingOwner } from './pendingOwnership';
import { PURGE_LEDGER, readPurgeLedger } from './purgeLedger';
import { idbGet, idbSet, loadJsonState, saveJsonState } from './storageUtils';
import { activeGrid, fingerprint, ROW_META, Snapshot } from './rowSyncPlan';
import { resolveExportSheetName } from './sheetsExportUtils';

const registryKey = 'retained-household-ids-v1';
export function retainedHouseholds(): Record<string, { name: string; deleted: boolean }> { return loadJsonState(registryKey, {}); }
export function reserveHousehold(id: string, name: string, deleted = false) {
  const registry = retainedHouseholds();
  saveJsonState(registryKey, { ...registry, [id]: { name, deleted } });
}
export function assertNoDeletedHouseholdReuse(rows: { id: string }[]) {
  const registry = retainedHouseholds();
  const blocked = rows.filter(r => registry[r.id]?.deleted);
  if (blocked.length) throw new Error(`削除済みの檀家ID（${blocked.map(r => r.id).join('、')}）を含むため名簿の取込を停止しました。別の家へのID再利用はできません。`);
}
export function confirmDeletedHouseholdEdit(ids: (string | undefined)[]): boolean {
  const registry = retainedHouseholds();
  const names = [...new Set(ids)].filter((id): id is string => !!id && registry[id]?.deleted).map(id => registry[id].name);
  return !names.length || window.confirm(`檀家「${names.join('、')}」様は既に削除されています。名簿は復帰せず、関連する会計・過去帳の入力を保存しますか？`);
}
export function registerHouseholdSnapshot(snapshot: Snapshot) {
  const rows = snapshot[resolveExportSheetName('檀家名簿', Object.keys(snapshot))] || [];
  const header = rows[0] || [], flag = header.indexOf(ROW_META[0]), name = header.indexOf('世帯主名');
  const registry = { ...retainedHouseholds() };
  for (const row of rows.slice(1)) if (row[0]) registry[String(row[0])] = { name: String(row[name] || row[0]), deleted: String(row[flag]) === '1' };
  for (const row of readPurgeLedger(snapshot[PURGE_LEDGER])) if (row[0] === 'household') registry[row[1]] = { name: row[1], deleted: true };
  saveJsonState(registryKey, registry);
}
export function relatedSignature(snapshot: Snapshot, id: string): string {
  return relatedSignatures(snapshot).get(id) || JSON.stringify([['過去帳', '[]'], ['出納・会計', '[]']]);
}
function relatedSignatures(snapshot: Snapshot): Map<string, string> {
  const grouped = new Map<string, unknown[][][]>();
  [['過去帳'], ['出納・会計', '出納アーカイブ']].forEach((names, group) => {
    for (const name of names) {
      const rows = activeGrid(snapshot[resolveExportSheetName(name, Object.keys(snapshot))] || []);
      const column = (rows[0] || []).findIndex(h => /^(檀家ID|世帯ID)$/.test(String(h)));
      if (column < 0) continue;
      for (const row of rows.slice(1)) {
        const id = String(row[column] || '');
        if (!id) continue;
        if (!grouped.has(id)) grouped.set(id, [[], []]);
        grouped.get(id)![group].push(row);
      }
    }
  });
  return new Map([...grouped].map(([id, groups]) => [id, JSON.stringify(groups.map((records, group) =>
    [group === 0 ? '過去帳' : '出納・会計', fingerprint(records.sort((a, b) => String(a[0]).localeCompare(String(b[0]))))]))]));
}
export interface HouseholdReview { id: string; name: string; sheetId: string; revision: string; signature: string; time: string }
interface Watch { name: string; signature: string; owner?: string }
const watchKey = (id: string) => 'household-deletion-watch-v1:' + id;
let watchQueue: Promise<unknown> = Promise.resolve();
export function watchHouseholdDeletion(sheetId: string, id: string, name: string): Promise<void> {
  const result = watchQueue.catch(() => {}).then(async () => {
  const snapshot = await idbGet<Snapshot>('row-sync-baseline-v1:' + sheetId);
  if (!snapshot) throw new Error('削除の前にGoogleシートを読み込んでください。');
  const watches = await idbGet<Record<string, Watch>>(watchKey(sheetId)) || {};
  await idbSet(watchKey(sheetId), { ...watches, [id]: { name, signature: relatedSignature(snapshot || {}, id), owner: await pendingOwner() } });
  });
  watchQueue = result;
  return result;
}
/** Reset only this page and expired pages after a complete startup read. */
export async function resetHouseholdReviewWatches(sheetId: string) {
  const result = watchQueue.catch(() => {}).then(async () => {
    const owner = await pendingOwner();
    const watches = await idbGet<Record<string, Watch>>(watchKey(sheetId)) || {};
    const retained: Record<string, Watch> = {};
    for (const [id, watch] of Object.entries(watches)) {
      if (watch.owner !== owner && !(await isClosedPendingOwner(watch.owner))) retained[id] = watch;
    }
    await idbSet(watchKey(sheetId), retained);
  });
  watchQueue = result;
  await result;
}
export async function findHouseholdReviews(sheetId: string, snapshot: Snapshot): Promise<HouseholdReview[]> {
  const watches = await idbGet<Record<string, Watch>>(watchKey(sheetId)) || {};
  const rows = snapshot[resolveExportSheetName('檀家名簿', Object.keys(snapshot))] || [];
  const header = rows[0] || [], flag = header.indexOf(ROW_META[0]), revision = header.indexOf(ROW_META[2]);
  const history = activeGrid(snapshot[resolveExportSheetName('操作・削除履歴', Object.keys(snapshot))] || []);
  const out: HouseholdReview[] = [];
  const signatures = relatedSignatures(snapshot);
  for (const row of rows.slice(1)) {
    const id = String(row[0] || ''), watch = watches[id];
    if (!watch || (watch.owner && watch.owner !== await pendingOwner()) || String(row[flag]) !== '1') continue;
    const signature = signatures.get(id) || JSON.stringify([['過去帳', '[]'], ['出納・会計', '[]']]);
    if (signature === watch.signature) continue;
    const relatedIds = new Set<string>();
    for (const name of ['過去帳', '出納・会計', '出納アーカイブ']) {
      const grid = activeGrid(snapshot[resolveExportSheetName(name, Object.keys(snapshot))] || []);
      const col = (grid[0] || []).findIndex(h => /^(檀家ID|世帯ID)$/.test(String(h)));
      for (const r of grid.slice(1)) if (col >= 0 && String(r[col]) === id) relatedIds.add(String(r[0]));
    }
    const times = history.slice(1).filter(r => ['transaction', 'pastRecord'].includes(String(r[2])) && relatedIds.has(String(r[3]))).map(r => Number(r[6])).filter(n => Number.isFinite(n) && n > 0);
    out.push({ id, name: watch.name, sheetId, revision: String(row[revision] || ''), signature,
      time: times.length ? new Date(Math.max(...times)).toLocaleString('ja-JP') : '' });
  }
  return out;
}
export async function acknowledgeHouseholdReview(review: HouseholdReview) {
  const watches = await idbGet<Record<string, Watch>>(watchKey(review.sheetId)) || {};
  await idbSet(watchKey(review.sheetId), { ...watches, [review.id]: { name: review.name, signature: review.signature, owner: await pendingOwner() } });
}
