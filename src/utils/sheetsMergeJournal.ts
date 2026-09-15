import { idbGet, idbSet } from './storageUtils';
import { Dataset, MergeBaseline, MergeChoices } from './threeWaySheetsMerge';

export interface MergeDraft {
  version: 1; id: string; sheetId: string; base: MergeBaseline | null;
  local: Dataset; remote: Dataset; choices: MergeChoices;
  intended?: Dataset; phase: 'review' | 'sending' | 'verified';
}
export const baselineKey = (id: string) => `sheets_merge_baseline_v1:${id}`;
export const draftKey = (id: string) => `sheets_merge_draft_v1:${id}`;
export async function readMergeBaseline(id: string): Promise<MergeBaseline | null> {
  const saved = await idbGet<MergeBaseline>(baselineKey(id));
  return saved?.version === 1 && saved.sheetId === id && saved.local && saved.remote ? saved : null;
}
export async function acknowledgeSheets(id: string, local: Dataset, remote: Dataset) {
  // Snapshot before awaiting; future edits must not alter the acknowledged base.
  const saved: MergeBaseline = JSON.parse(JSON.stringify({ version: 1, sheetId: id, local, remote }));
  await idbSet(baselineKey(id), saved);
}
export async function saveMergeDraft(draft: MergeDraft) {
  await idbSet(draftKey(draft.sheetId), JSON.parse(JSON.stringify(draft)));
}
export async function backupMergeAttempt(draft: MergeDraft) {
  // Keep the original local and remote copies even after later attempts.
  await idbSet(`sheets_merge_backup_v1:${draft.id}`, JSON.parse(JSON.stringify(draft)));
}
