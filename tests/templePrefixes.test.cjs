const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
require.extensions['.ts']=(m,p)=>m._compile(ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,p);
const storage=require('../src/utils/storageUtils.ts');const memory=new Map();
storage.loadJsonState=(key,fallback)=>structuredClone(memory.get(key)||fallback);
storage.saveJsonState=(key,value)=>memory.set(key,structuredClone(value));
const {rememberTemplePrefixes,allocateTempleId}=require('../src/utils/templePrefixes.ts');
const {getTemplePrefix,cleanAndNormalizeHouseholdId}=require('../src/utils/dankaIdUtils.ts');
const {makeRowSyncPlan}=require('../src/utils/rowSyncPlan.ts');
test('deleted empty temples and household prefixes stay reserved; allocation exceeds K9 and survives order changes',()=>{
 memory.clear();
 rememberTemplePrefixes({
  '寺院一覧（本寺・兼務）':[['寺院ID','寺院区分'],['temple-main','本寺'],['temple-sub-K9-old','兼務寺'],['legacy-uuid','兼務寺']],
  '檀家名簿':[['檀家ID','所属寺院ID','__JBTD削除済'],['K2-01000','deleted-temple','1'],['K5-01000','legacy-uuid','']]
 });
 const id=allocateTempleId([]); assert.equal(getTemplePrefix(id),'K10-');
 const next=allocateTempleId([]); assert.equal(getTemplePrefix(next),'K11-');
 assert.equal(getTemplePrefix('legacy-uuid',[{id:'legacy-uuid'},{id}]),'K5-');
 assert.equal(getTemplePrefix('legacy-uuid',[{id},{id:'legacy-uuid'}]),'K5-');
 assert.equal(cleanAndNormalizeHouseholdId('K2-01000',id),'K10-01000');
 assert.equal(cleanAndNormalizeHouseholdId('K10-01000'),'K10-01000');
});
test('writer refuses two different temple IDs claiming the same namespace, including retained tombstones',()=>{
 memory.clear();const title='寺院一覧（本寺・兼務）';
 const current={[title]:[['寺院ID','__JBTD削除済','__JBTD削除日時','__JBTD更新ID'],['temple-sub-K10-old','1','','']]};
 assert.throws(()=>makeRowSyncPlan({[title]:[['寺院ID'],['temple-sub-K10-new']]},current,current,[{title,sheetId:1,rowCount:1000,columnCount:20}],'op','now'),/接頭辞が重複/);
});


test('fresh devices reserve purged household IDs and temple namespaces from the remote ledger',()=>{
 memory.clear();
 const {PURGE_LEDGER,LEDGER_HEADER}=require('../src/utils/purgeLedger.ts');
 const {registerHouseholdSnapshot,assertNoDeletedHouseholdReuse}=require('../src/utils/householdRetention.ts');
 const snapshot={[PURGE_LEDGER]:[LEDGER_HEADER,['temple','temple-sub-K25-old','','K25-','cleanup'],['household','K25-01000','temple-sub-K25-old','K25-','cleanup']]};
 rememberTemplePrefixes(snapshot);registerHouseholdSnapshot(snapshot);
 assert.equal(getTemplePrefix(allocateTempleId([])),'K26-');
 assert.throws(()=>assertNoDeletedHouseholdReuse([{id:'K25-01000'}]),/削除済み/);
 const title='寺院一覧（本寺・兼務）',current={...snapshot,[title]:[['寺院ID','__JBTD削除済','__JBTD削除日時','__JBTD更新ID']]};
 assert.throws(()=>makeRowSyncPlan({[title]:[['寺院ID'],['temple-sub-K25-new']]},current,current,[{title,sheetId:1,rowCount:1000,columnCount:20}],'op','now',true),/接頭辞は再利用/);
});
