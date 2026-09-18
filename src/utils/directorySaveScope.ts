import { Dataset, stableMergeValue } from './threeWaySheetsMerge';
/** Scope ordinary saves by acknowledged business changes, never export-cache warmth. */
export function directorySaveTables(before: Dataset | undefined, after: Dataset): string[] | undefined {
  if (!before) return undefined;
  const tables = new Set<string>();
  const changed = (key: string) => stableMergeValue(before[key]) !== stableMergeValue(after[key]);
  const mapping: Record<string,string[]> = {
    households:['檀家名簿','家族構成'], familyMembers:['家族構成'], pastRecords:['過去帳'],
    transactions:['出納・会計','出納アーカイブ'], memorialServices:['法事予約'], templeTodos:['寺院ToDo'],
    priests:['登録僧侶一覧'], allNoticeTemplates:['案内文テンプレート'], noticeTemplates:['案内文テンプレート'],
    batchAccountingConfig:['一括会計設定'], batchAccountingData:['一括会計受付'], disasterEvents:['戦没・災害物故者命日設定'],
  };
  for (const [key,names] of Object.entries(mapping)) if(changed(key)) names.forEach(n=>tables.add(n));
  if(changed('templeInfo') || changed('temples')) {
    tables.add('寺院一覧（本寺・兼務）');tables.add('寺院情報');
    const fiscal=(data:Dataset)=>[data.templeInfo,...(data.temples||[])].filter(Boolean).map(t=>[t.id,t.fiscalYearStartMonth,t.fiscalYearStartDay,t.fiscalYearEndMonth,t.fiscalYearEndDay]);
    if(stableMergeValue(fiscal(before))!==stableMergeValue(fiscal(after))) {tables.add('出納・会計');tables.add('出納アーカイブ');}
  }
  const oldTemples=new Map((before.temples||[]).map((t:any)=>[t.id,t]));
  for(const t of after.temples||[]) {
    const old:any=oldTemples.get(t.id), title=`マスタ_${t.shortName || t.name}`;
    if(!old || (old.shortName || old.name)!==(t.shortName || t.name) ||
      stableMergeValue(before.templeMasterOptionsMap?.[t.id])!==stableMergeValue(after.templeMasterOptionsMap?.[t.id])) tables.add(title);
  }
  // Legacy global masters can supply defaults to temples without their own map.
  if(changed('masterOptions')) for(const t of after.temples||[]) {
    if(!after.templeMasterOptionsMap?.[t.id]) tables.add(`マスタ_${t.shortName || t.name}`);
  }
  tables.add('操作・削除履歴');
  return [...tables];
}
