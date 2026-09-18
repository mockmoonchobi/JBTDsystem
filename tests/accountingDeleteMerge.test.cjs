const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),ts=require('typescript');
require.extensions['.ts']=(m,p)=>m._compile(ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,p);
const root=path.resolve(__dirname,'..');require.cache[path.join(root,'src/lib/googleAuth.ts')]={exports:{getCurrentUser:()=>null,getActiveGoogleAccountName:()=>''}};
const {workbook}=require('./rowSyncFixture.cjs');
const {exportToSheets,importFromSheets}=require('../src/lib/googleSheets.ts');
const {planSheetsMerge,verifyMergedReadback}=require('../src/utils/threeWaySheetsMerge.ts');
const {EMPTY_TEMPLE_INFO,EMPTY_MASTER_OPTIONS}=require('../src/data/initialData.ts');
test('one-character edit versus nine deletions survives reviewed export and full import',async()=>{
 const mock=workbook(),old=global.fetch;global.fetch=mock.fetch;
 const temple={...EMPTY_TEMPLE_INFO,id:'temple-main',isMain:true,name:'試験寺院'};
 const publish=(tx,logs=[],reviewed=false)=>exportToSheets('token','test-sheet',temple,[],[],[],tx,EMPTY_MASTER_OPTIONS,undefined,[],[temple],{deletedRecords:logs,reviewedMerge:reviewed});
 const read=()=>importFromSheets('token','test-sheet',{requireCompleteSchema:true,readOnly:true});
 try {
  await publish(Array.from({length:10},(_,i)=>({id:'TX-'+i,templeId:temple.id,date:'2026/09/01',amount:1000,type:'収入',category:'寄付',notes:'元'})));
  const initial=await read();const local=structuredClone(initial);local.transactions[0].notes='編集';
  const logs=initial.transactions.slice(0,9).map((t,i)=>({logId:'DEL-'+i,id:t.id,entityType:'transaction',actionType:'delete',deletedAt:'2026-09-17T00:00:00Z',deletedTimestamp:1789603200000+i}));
  await publish(initial.transactions.slice(9),logs);const remote=await read();
  const base={version:1,sheetId:'test-sheet',local:{transactions:initial.transactions},remote:{transactions:initial.transactions}};
  const l={transactions:local.transactions},r={transactions:remote.transactions};const first=planSheetsMerge(base,l,r);
  const choices=Object.fromEntries(first.conflicts.map(c=>[c.key,{side:'local',fingerprint:c.fingerprint}]));
  const selected=planSheetsMerge(base,l,r,choices).merged.transactions;
  await publish(selected,remote.deletedRecords,true);const actual=await read();
  assert(verifyMergedReadback(selected,actual.transactions,'transactions'),JSON.stringify({selected,actual:actual.transactions}));
 } finally {global.fetch=old;}
});
