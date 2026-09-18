import { stableMergeValue } from './threeWaySheetsMerge';
// Startup history is shared between tabs; business data and local actions remain guarded.
export function changedDuringImport(before: string, after: string, startup: boolean, auditBefore: number, auditAfter: number, launcherOnly = false): boolean {
  if (!startup) return before !== after;
  if (auditBefore !== auditAfter) return true;
  const business = (value: string) => { const data = JSON.parse(value); delete data.deletedRecords;
    // These settings are read directly from shared browser storage, not this tab's editor.
    if (launcherOnly) { delete data.allNoticeTemplates; delete data.batchAccountingConfig; }
    return stableMergeValue(data); };
  return business(before) !== business(after);
}

export function withoutSharedHistory(data: any) { const { deletedRecords, ...business } = data; return business; }
