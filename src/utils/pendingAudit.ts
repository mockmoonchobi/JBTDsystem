import { pendingOwner, isClosedPendingOwner } from './pendingOwnership';
import type { DeletedRecordEntry } from '../types';
import { idbGetStrict as idbGet, idbSet, idbUpdate } from './storageUtils';
import type { Snapshot } from './rowSyncPlan';
import { resolveExportSheetName } from './sheetsExportUtils';

const key = 'pending-audit-v1';
let chain: Promise<void> = Promise.resolve();
let failure: unknown;
let localAuditRevision = 0;
const entryRevisions = new Map<string, number>();
export const getLocalAuditRevision = () => localAuditRevision;
function serialized(work: () => Promise<void>): Promise<void> {
  const result = chain.then(work);
  chain = result.catch(error => { failure = error; });
  return result;
}
export function queueAudit(entries: DeletedRecordEntry[]): void {
  if (entries.length) localAuditRevision++;
  entries.forEach(e => { if (e.logId) entryRevisions.set(e.logId, localAuditRevision); });
  void serialized(async () => {
    if (failure) throw failure;
    const owner = await pendingOwner();
    await idbUpdate<DeletedRecordEntry[]>(key, stored => {
      const map = new Map((stored || []).map(e => [e.logId, e]));
      entries.forEach(e => { if (!e.logId) throw new Error('未送信履歴のIDがありません。'); map.set(e.logId, { ...e, __pendingOwner: owner } as DeletedRecordEntry); });
      return [...map.values()];
    });
  }).catch(() => {});
}
export async function pendingAudit(): Promise<DeletedRecordEntry[]> {
  await chain;
  if (failure) throw new Error('未送信履歴を端末に保存できません。整理・送信を停止しました。画面を閉じずに端末データを退避してください。');
  return (await idbGet<(DeletedRecordEntry & { __pendingOwner?: string })[]>(key) || []).map(({ __pendingOwner, ...entry }) => entry);
}
export async function acknowledgeAudit(snapshot: Snapshot, discard = false): Promise<void> {
  await serialized(async () => {
    if (failure) throw failure;
    const entries = await idbGet<DeletedRecordEntry[]>(key) || [];
    const logs = snapshot[resolveExportSheetName('操作・削除履歴', Object.keys(snapshot))] || [];
    const confirmed = new Set(logs.slice(1).map(r => String(r[0])));
    if (discard && entries.length) await idbSet('discarded-audit-v1', entries);
    const discardedIds = new Set(entries.map(e => e.logId));
    await idbUpdate<DeletedRecordEntry[]>(key, current => (current || []).filter(e =>
      discard ? !discardedIds.has(e.logId) : !confirmed.has(e.logId || '')));
  });
}
export async function auditForExport(display: DeletedRecordEntry[], managed: boolean, ownOnly = false, throughRevision = localAuditRevision): Promise<DeletedRecordEntry[]> {
  const pending = ownOnly ? await currentPageAudit() : await pendingAudit();
  // In managed workbooks only the durable outbox may append new history.
  // Old display/Excel history must not resurrect rows removed by maintenance.
  const map = new Map((managed ? [] : display).map(e => [e.logId, e]));
  pending.filter(e => (entryRevisions.get(e.logId || '') || 0) <= throughRevision).forEach(e => map.set(e.logId, e));
  return [...map.values()];
}

export async function captureClosedAuditIds(): Promise<string[]> {
  await pendingAudit();
  const entries = await idbGet<(DeletedRecordEntry & {__pendingOwner?:string})[]>(key) || [];
  const closed = new Map<string | undefined, boolean>();
  for (const entry of entries) if (!closed.has(entry.__pendingOwner)) closed.set(entry.__pendingOwner, await isClosedPendingOwner(entry.__pendingOwner));
  return entries.filter(e => closed.get(e.__pendingOwner)).map(e => e.logId!);
}
export async function discardCapturedAudit(ids: string[]): Promise<void> {
  const selected = new Set(ids);
  await serialized(async () => {
    if (failure) throw failure;
    const entries = await idbGet<DeletedRecordEntry[]>(key) || [];
    const discarded = entries.filter(e => selected.has(e.logId!));
    if (discarded.length) await idbSet('discarded-audit-v1', discarded);
    await idbUpdate<DeletedRecordEntry[]>(key, current => (current || []).filter(e => !selected.has(e.logId!)));
  });
}

export async function currentPageAudit(): Promise<DeletedRecordEntry[]> {
  await pendingAudit();
  const owner = await pendingOwner();
  return (await idbGet<(DeletedRecordEntry & {__pendingOwner?:string})[]>(key) || [])
    .filter(e => e.__pendingOwner === owner).map(({__pendingOwner, ...entry}) => entry);
}
