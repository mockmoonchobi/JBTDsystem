import { Snapshot } from './rowSyncPlan';
import { deletionRanges } from './permanentCleanupPlan';
import { PURGE_LEDGER, LEDGER_HEADER, RECORD_KINDS, readPurgeLedger } from './purgeLedger';
import { encodedTemplePrefix, savedTemplePrefix } from './templePrefixes';
import { resolveExportSheetName } from './sheetsExportUtils';
const text=(v:unknown)=>String(v??'');
export function planSubsidiaryPurge(before:Snapshot, templeId:string, epoch:string) {
  const titles=Object.keys(before), table=(name:string)=>before[resolveExportSheetName(name,titles)]||[];
  const temples=table('寺院一覧（本寺・兼務）');
  const temple=temples.slice(1).find(r=>text(r[0])===templeId);
  if(!temple || templeId==='temple-main' || text(temple[temples[0].indexOf('寺院区分')])==='本寺') throw new Error('本寺または存在しない寺院は完全削除できません。');
  const householdIds=new Set<string>(),serviceIds=new Set<string>();
  const owned=(header:unknown[],row:unknown[])=>header.some((h,i)=>['所属寺院ID','寺院ID'].includes(text(h)) && text(row[i])===templeId) || header.some((h,i)=>['世帯ID','檀家ID'].includes(text(h))&&householdIds.has(text(row[i]))) || header.some((h,i)=>['関連法事ID','関連法要ID','法事予約ID'].includes(text(h))&&serviceIds.has(text(row[i])));
  const households=table('檀家名簿');for(const row of households.slice(1))if(owned(households[0],row))householdIds.add(text(row[0]));
  const services=table('法事予約');for(const row of services.slice(1))if(owned(services[0],row))serviceIds.add(text(row[0]));
  const expected:Snapshot=structuredClone(before), ranges:Record<string,ReturnType<typeof deletionRanges>>={},counts:Record<string,number>={};
  // Per-temple masters have no temple ID column: remove their dedicated tabs.
  const aliases = (row: unknown[]) => ['寺院名','略称','寺院略称'].map(h => text(row[temples[0].indexOf(h)]).trim()).filter(Boolean);
  const names = new Set(aliases(temple));
  const otherNames = new Set(temples.slice(1).filter(r => r !== temple).flatMap(aliases));
  const deletedSheets = titles.filter(title => /^マスタ[ー]?_/.test(title) && names.has(title.replace(/^マスタ[ー]?_/, '').trim()));
  for (const title of deletedSheets) {
    if (otherNames.has(title.replace(/^マスタ[ー]?_/, '').trim())) throw new Error('複数の寺院で同名のマスタを使用しています。寺院名・略称を確認してください。');
    counts[title] = Math.max(0, before[title].length - 1);
    delete expected[title];
  }
  const reserved=new Map(readPurgeLedger(before[PURGE_LEDGER]).map(r=>[r[0]+':'+r[1],r]));
  for(const [title,grid]of Object.entries(before)){
    if(title.startsWith('__JBTD') || deletedSheets.includes(title) || !grid.length)continue;
    const canonical=Object.keys(RECORD_KINDS).find(n=>resolveExportSheetName(n,titles)===title), kind=canonical&&RECORD_KINDS[canonical];
    const deleted:number[]=[];
    grid.slice(1).forEach((row,index)=>{
      if(!owned(grid[0],row))return;
      deleted.push(index+1);
      if(kind && row[0]){
        const id=text(row[0]),prefix=kind==='temple'?(savedTemplePrefix(id)||encodedTemplePrefix(id)||''):(kind==='household'?id.match(/^(DK|K\d+)-/)?.[0]||'':'');
        reserved.set(kind+':'+id,reserved.get(kind+':'+id)||[kind,id,templeId,prefix,epoch]);
      }
    });
    if(deleted.length){ranges[title]=deletionRanges(deleted);counts[title]=deleted.length;const indices=new Set(deleted);expected[title]=grid.filter((_,i)=>!indices.has(i));}
  }
  const historyTitle=resolveExportSheetName('操作・削除履歴',titles), history=expected[historyTitle];
  if(!history?.length)throw new Error('操作履歴の見出しがありません。');
  const now=Date.now(), description='兼務寺院の完全削除：'+Object.entries(counts).map(([title,count])=>title+' '+count+'件').join('／');
  const values:Record<string,unknown>={'履歴ID':'PURGE-'+epoch,'種別':'delete','対象エンティティ':'temple','対象ID':templeId,'対象名称/内容':description,'内容':description,'操作日時':new Date(now).toISOString(),'日時(ms)':String(now),'操作者':'管理端末','端末・環境':'兼務寺院の完全削除','__JBTD更新ID':epoch};
  const audit=history[0].map(h=>values[text(h)]??'');
  const auditIndex=history.length;history.push(audit);
  expected[PURGE_LEDGER]=[LEDGER_HEADER,...reserved.values()];
  return {expected,ranges,deletedSheets,counts,historyTitle,audit,auditIndex,householdIds:[...householdIds]};
}
