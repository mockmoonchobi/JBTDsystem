import { activeGrid, ROW_META, Snapshot } from './rowSyncPlan';
import { appendCells, containsAppend, equalSheetsCells } from './accountingAppend';
import { ExportSheet } from './sheetsExportUtils';
export const HOUSEHOLD = '檀家名簿', HISTORY = '操作・削除履歴';
const str = (v: unknown) => String(v ?? '');
const equal = equalSheetsCells;
const sameGrid = (a: unknown[][], b: unknown[][]) => {
  const rows = (grid: unknown[][]) => grid.filter(row => row.some(v => str(v) !== ''));
  const left = rows(a), right = rows(b);
  return left.length === right.length && left.every((row,i) => equal(row,right[i]));
};
function byId(rows: unknown[][]) {
  const result = new Map<string, unknown[]>();
  for (const row of rows.filter(r => r.some(v => str(v)))) {
    const id = str(row[0]);
    if (!id || result.has(id)) throw new Error('IDが空または重複しています。削除を停止しました。');
    result.set(id, row);
  }
  return result;
}
export function householdDeletions(desired: Snapshot, baseline: Snapshot, changed?: Set<string>) {
  const old = activeGrid(baseline[HOUSEHOLD] || []), next = desired[HOUSEHOLD];
  if (!old.length || !next || !equal(old[0], next[0] || [])) return null;
  const existing = byId(old.slice(1)), remaining = byId(next.slice(1));
  for (const [id, row] of remaining) if (!existing.has(id) || !equal(row, existing.get(id)!)) return null;
  const ids = [...existing.keys()].filter(id => !remaining.has(id));
  if (!ids.length) return null;
  const oldLogs = activeGrid(baseline[HISTORY] || []), logGrid = desired[HISTORY];
  if (!logGrid || !oldLogs.length || !equal(oldLogs[0],logGrid[0])) return null;
  const prior = byId(oldLogs.slice(1)), logs = byId(logGrid.slice(1));
  for (const [id,row] of logs) if (prior.has(id) && !equal(row,prior.get(id)!)) return null;
  const added = [...logs].filter(([id])=>!prior.has(id)).map(([,row])=>row);
  if (!added.length || added.some(r=>!['delete','batch_delete'].includes(str(r[1])) || str(r[2])!=='household' || !ids.includes(str(r[3]))) || ids.some(id=>!added.some(r=>str(r[3])===id))) return null;
  for (const [title,grid] of Object.entries(desired)) {
    if (title===HOUSEHOLD || title===HISTORY || (changed && !changed.has(title))) continue;
    const original=activeGrid(baseline[title] || []);
    if (title==='家族構成') {
      if (!original.length || !equal(original[0],grid[0])) return null;
      const column=original[0].findIndex(h=>str(h).includes('檀家ID') || h==='世帯ID');
      const members=byId(grid.slice(1)), oldMembers=byId(original.slice(1));
      for (const [id,row] of members) if (!oldMembers.has(id) || !equal(row,oldMembers.get(id)!)) return null;
      const allDeleted=new Set([...ids,...(baseline[HOUSEHOLD] || []).slice(1).filter(r=>str(r[baseline[HOUSEHOLD][0].indexOf(ROW_META[0])])==='1').map(r=>str(r[0]))]);
      for (const [id,row] of oldMembers) if (!members.has(id) && (column<0 || !allDeleted.has(str(row[column])))) return null;
    } else if (!sameGrid(original,grid)) return null;
  }
  return {ids, logs:[logGrid[0],...added]};
}
export function deletionPlan(change: NonNullable<ReturnType<typeof householdDeletions>>, current: Snapshot, sheets: ExportSheet[], op: string) {
  const raw=current[HOUSEHOLD], history=current[HISTORY];
  if (!raw?.length || !history?.length || !equal(history[0],[...change.logs[0],...ROW_META])) return null;
  const offset=raw[0].indexOf(ROW_META[0]);
  if (offset<0 || !equal(raw[0].slice(offset),ROW_META)) return null;
  const records=byId(raw.slice(1)), logs=byId(history.slice(1));
  const sheet=sheets.find(s=>s.title===HOUSEHOLD)!, audit=sheets.find(s=>s.title===HISTORY)!;
  const requests:any[]=[], deleted:unknown[][]=[];
  for (const id of change.ids) {
    const row=records.get(id);
    if (!row) throw new Error('削除対象の檀家IDが見つかりません。再連携で確認してください: '+id);
    const flag=str(row[offset]);
    if (!['','0','1'].includes(flag)) throw new Error('削除済みフラグが不正です。');
    const result=[...row];
    if (flag!=='1') {
      const metadata=['1',new Date().toISOString(),op];
      metadata.forEach((v,i)=>result[offset+i]=v);
      requests.push({updateCells:{start:{sheetId:sheet.sheetId,rowIndex:raw.indexOf(row),columnIndex:offset},fields:'userEnteredValue',rows:[{values:metadata.map(stringValue=>({userEnteredValue:{stringValue}}))}]}});
    }
    deleted.push(result);
  }
  const appended:unknown[][]=[];
  for (const row of change.logs.slice(1)) {
    if (logs.has(str(row[0]))) {
      if (!equal(logs.get(str(row[0]))!.slice(0,change.logs[0].length),row)) throw new Error('操作履歴IDが一致しません。');
      appended.push(logs.get(str(row[0]))!);
    } else appended.push([...row,'','',op]);
  }
  const newLogs=appended.filter(r=>!logs.has(str(r[0])));
  if (newLogs.length) requests.push(appendCells(audit.sheetId,newLogs));
  return {requests,expected:{[HOUSEHOLD]:[raw[0],...deleted],[HISTORY]:[history[0],...appended]}};
}
export function verifyHouseholdDeletion(expected: Snapshot, actual: Snapshot) {
  try {
    const raw=actual[HOUSEHOLD];
    if (!raw?.length || !equal(expected[HOUSEHOLD][0],raw[0])) return false;
    const records=byId(raw.slice(1)), flag=raw[0].indexOf(ROW_META[0]);
    return expected[HOUSEHOLD].slice(1).every(row=>str(records.get(str(row[0]))?.[flag])==='1') && containsAppend({[HISTORY]:expected[HISTORY]},actual);
  } catch { return false; }
}
/** Acknowledge only our deletion flags and logs, never unseen peer business changes. */
export function acceptHouseholdDeletion(baseline: Snapshot, expected: Snapshot): Snapshot {
  const rows=baseline[HOUSEHOLD], flag=rows[0].indexOf(ROW_META[0]);
  const updates=byId(expected[HOUSEHOLD].slice(1)), logIds=new Set(baseline[HISTORY].slice(1).map(r=>str(r[0])));
  return {...baseline,[HOUSEHOLD]:rows.map((row,i)=> i && updates.has(str(row[0])) ? [...Array.from({length:flag},(_,i)=>row[i] ?? ''),...ROW_META.map((_,i)=>updates.get(str(row[0]))![flag+i] ?? '')] : row),
    [HISTORY]:[...baseline[HISTORY],...expected[HISTORY].slice(1).filter(r=>!logIds.has(str(r[0])))]};
}
