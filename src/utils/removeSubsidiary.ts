import { Dataset } from './threeWaySheetsMerge';
/** Explicit subsidiary removal only. Ordinary household deletion never uses this. */
export function removeSubsidiary(data: Dataset, templeId: string) {
  const temple=(data.temples||[]).find((t:any)=>t.id===templeId);
  if (!temple || temple.isMain || templeId==='temple-main') throw new Error('本寺または存在しない寺院は削除できません。');
  const householdIds=new Set((data.households||[]).filter((r:any)=>r.templeId===templeId).map((r:any)=>r.id));
  const serviceIds=new Set((data.memorialServices||[]).filter((r:any)=>r.templeId===templeId || householdIds.has(r.householdId)).map((r:any)=>r.id));
  const belongs=(r:any)=>r.templeId===templeId || householdIds.has(r.householdId) || serviceIds.has(r.relatedServiceId);
  const kinds:Record<string,string>={households:'household',pastRecords:'pastRecord',transactions:'transaction',memorialServices:'memorialService',templeTodos:'templeTodo',priests:'priest',disasterEvents:'disasterMemorial',allNoticeTemplates:'noticeTemplate',familyMembers:'familyMember'};
  const next={...data}, counts:Record<string,number>={}, removed:any[]=[];
  for(const [table,kind] of Object.entries(kinds)){
    const rows=data[table]||[], targets=rows.filter(belongs);
    counts[table]=targets.length;next[table]=rows.filter((r:any)=>!belongs(r));
    for(const r of targets){removed.push({id:r.id,entityType:kind,label:r.familyHead||r.name||r.title||r.notes||r.id,templeId});
      if(table==='households') for(const f of r.familyMembers||[]) removed.push({id:f.id,entityType:'familyMember',label:f.name||f.id,templeId});}
  }
  counts.familyMembers=removed.filter(r=>r.entityType==='familyMember').length;
  next.temples=(data.temples||[]).filter((r:any)=>r.id!==templeId);
  next.templeMasterOptionsMap={...data.templeMasterOptionsMap};delete next.templeMasterOptionsMap[templeId];
  if(data.templeInfo?.id===templeId) next.templeInfo=next.temples.find((r:any)=>r.isMain)||next.temples[0];
  if(data.batchAccountingData?.templeId===templeId) next.batchAccountingData=null;
  if(data.batchAccountingConfig?.templeId===templeId) next.batchAccountingConfig=null;
  return {next,counts,removed,temple};
}
