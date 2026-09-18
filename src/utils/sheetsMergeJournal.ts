import { getLocalAuditRevision } from './pendingAudit';
import { idbGet, idbSet } from './storageUtils';
import { Dataset, MergeBaseline, MergeChoices } from './threeWaySheetsMerge';

export interface MergeDraft {
  version: 1; id: string; sheetId: string; base: MergeBaseline | null;
  local: Dataset; remote: Dataset; choices: MergeChoices;
  intended?: Dataset; phase: 'review' | 'sending' | 'verified';
}
export const baselineKey = (id: string) => `sheets_merge_baseline_v1:${id}`;
export const draftKey = (id: string) => `sheets_merge_draft_v1:${id}`;
const tabBaselines = new Map<string, MergeBaseline>();
const auditRevisions = new Map<string, number>();
export const hasLocalAuditChanges = (id: string) => auditRevisions.has(id) && auditRevisions.get(id) !== getLocalAuditRevision();
export async function readMergeBaseline(id: string): Promise<MergeBaseline | null> {
  const cached = tabBaselines.get(id);
  if (cached) return JSON.parse(JSON.stringify(cached));
  const saved = await idbGet<MergeBaseline>(baselineKey(id));
  return saved?.version === 1 && saved.sheetId === id && saved.local && saved.remote ? saved : null;
}
export async function acknowledgeSheets(id: string, local: Dataset, remote: Dataset) {
  const auditRevision = getLocalAuditRevision();
  // Snapshot before awaiting; future edits must not alter the acknowledged base.
  const saved: MergeBaseline = JSON.parse(JSON.stringify({ version: 1, sheetId: id, local, remote }));
  await idbSet(baselineKey(id), saved);
  tabBaselines.set(id, saved);
  auditRevisions.set(id, auditRevision);
}
export async function saveMergeDraft(draft: MergeDraft) {
  await idbSet(draftKey(draft.sheetId), JSON.parse(JSON.stringify(draft)));
}
export async function saveMergeChoices(draft: MergeDraft, choices: MergeChoices) {
  await idbSet(draftKey(draft.sheetId) + ':choices', { id: draft.id, choices });
}
export async function restoreMergeChoices(draft: MergeDraft | null) {
  if (!draft) return draft;
  const saved = await idbGet<{ id: string; choices: MergeChoices }>(draftKey(draft.sheetId) + ':choices');
  return saved?.id === draft.id && draft.phase === 'review' ? { ...draft, choices: saved.choices } : draft;
}
export async function backupMergeAttempt(draft: MergeDraft) {
  // Keep the original local and remote copies even after later attempts.
  await idbSet(`sheets_merge_backup_v1:${draft.id}`, JSON.parse(JSON.stringify(draft)));
}

/** Advance only the operations actually confirmed, leaving other edits unacknowledged. */
export async function acknowledgeReceiptOperations(id: string, entries: import('../types').DeletedRecordEntry[]) {
  const base=await readMergeBaseline(id);
  if (!base) throw new Error('受付の同期基準を確認できません。');
  const add=(data: Dataset) => {
    const transactions=new Map((data.transactions || []).map((t:any)=>[t.id,t]));
    const logs=new Map((data.deletedRecords || []).map((e:any)=>[e.logId,e]));
    for(const entry of entries){transactions.set(entry.id,entry.afterData);logs.set(entry.logId,entry);}
    return {...data,transactions:[...transactions.values()],deletedRecords:[...logs.values()]};
  };
  await acknowledgeSheets(id,add(base.local),add(base.remote));
}
