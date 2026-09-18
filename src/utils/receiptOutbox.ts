import { DeletedRecordEntry, Transaction } from '../types';
import { stableMergeValue } from './threeWaySheetsMerge';
/** Select durable creates only. A subsequent edit/delete of the same ID is not a receipt append. */
export function receiptOperations(entries: DeletedRecordEntry[], transactions: Transaction[]): DeletedRecordEntry[] {
  const current=new Map(transactions.map(t=>[t.id,t]));
  const counts=new Map<string,number>();
  for (const entry of entries) if (entry.entityType==='transaction') counts.set(entry.id,(counts.get(entry.id)||0)+1);
  return entries.filter(e=>e.entityType==='transaction' && e.actionType==='create' && e.logId && e.afterData?.id===e.id &&
    counts.get(e.id)===1 && current.has(e.id) && stableMergeValue(e.afterData)===stableMergeValue(current.get(e.id)));
}
