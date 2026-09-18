const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
require.extensions['.ts']=(m,p)=>m._compile(ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,p);
const root=path.resolve(__dirname,'..');require.cache[path.join(root,'src/lib/googleAuth.ts')]={exports:{getCurrentUser:()=>null,getActiveGoogleAccountName:()=>''}};
const {workbook,memory}=require('./rowSyncFixture.cjs');
const {exportToSheets,importFromSheets,resolveHouseholdDeletionReview}=require('../src/lib/googleSheets.ts');
const {watchHouseholdDeletion,findHouseholdReviews,retainedHouseholds,reserveHousehold,relatedSignature,assertNoDeletedHouseholdReuse}=require('../src/utils/householdRetention.ts');
const {EMPTY_TEMPLE_INFO,EMPTY_MASTER_OPTIONS}=require('../src/data/initialData.ts');
const {generateNewHouseholdId}=require('../src/utils/dankaIdUtils.ts');
const temple={...EMPTY_TEMPLE_INFO,id:'temple-main',isMain:true,name:'試験寺院'};
const hh={id:'DK-01001',familyHead:'試験太郎',templeId:temple.id,familyMembers:[{id:'F1',name:'家族',householdId:'DK-01001'}]};
const past=[{id:'P1',householdId:hh.id,deathDate:'2000/01/01',templeId:temple.id}];
const tx=[{id:'T1',householdId:hh.id,date:'2026/09/01',amount:1000,type:'収入',category:'寄付',templeId:temple.id}];
const publish=(households,logs=[])=>exportToSheets('token','test-sheet',temple,households,past,[],tx,EMPTY_MASTER_OPTIONS,undefined,[],[temple],{deletedRecords:logs});
const read=()=>importFromSheets('token','test-sheet',{readOnly:true,requireCompleteSchema:true});
function remoteEdit(mock,amount,logId){
 const s=mock.sheets.get('出納・会計');s.rows[1][s.rows[0].indexOf('金額')]=amount;
 s.rows[1][s.rows[0].indexOf('__JBTD更新ID')]='remote-'+logId;
 mock.sheets.get('操作・削除履歴').rows.push([logId,'update','transaction','T1','会計を更新','2026-09-16T12:00:00Z',String(1800000000000+amount),'',temple.id,'他端末','','','','','remote-'+logId]);
}
test('household deletion retains past/accounting/family and ID; two decisions retain latest related data and acknowledge once',async()=>{
 const mock=workbook(),old=global.fetch;global.fetch=mock.fetch;
 try{
  await publish([hh]);await read();
  await watchHouseholdDeletion('test-sheet',hh.id,hh.familyHead);
  const childrenBefore=JSON.stringify(['過去帳','出納・会計','家族構成'].map(n=>mock.sheets.get(n).rows));
  await publish([],[{logId:'DELETE-1',id:hh.id,entityType:'household',actionType:'delete',deletedTimestamp:1700000000000}]);
  assert.equal(JSON.stringify(['過去帳','出納・会計','家族構成'].map(n=>mock.sheets.get(n).rows)),childrenBefore);
  let data=await read();assert.equal(data.households.length,0);assert.equal(data.pastRecords[0].householdId,hh.id);assert.equal(data.transactions[0].householdId,hh.id);
  assert.equal(data.householdReviews.length,0);assert.equal(retainedHouseholds()[hh.id].deleted,true);
  assert.notEqual(generateNewHouseholdId(temple.id,[],[temple]),hh.id);
  remoteEdit(mock,2000,'REMOTE-1');data=await read();assert.equal(data.householdReviews.length,1);
  const tombstone=structuredClone(mock.sheets.get('檀家名簿').rows[1]);
  mock.calls.length=0;
  await resolveHouseholdDeletionReview('token',data.householdReviews[0],false,{operator:'確認者',deviceInfo:'端末A'});
  const confirmationReads=mock.calls.filter(c=>c.url.includes('batchGet'));
  assert.equal(confirmationReads.length,3);
  assert(confirmationReads.every(c=>!decodeURIComponent(c.url).includes('一括会計設定') && !decodeURIComponent(c.url).includes('家族構成')));
  assert(confirmationReads.slice(1).every(c=>!decodeURIComponent(c.url).includes('過去帳') && !decodeURIComponent(c.url).includes('出納・会計')));
  assert.equal(mock.sheets.get('操作・削除履歴').rows.find(r=>String(r[0]).startsWith('HR-'))[9],'確認者');
  data=await read();assert.equal(data.householdReviews.length,0);assert.equal(data.households.length,0);assert.equal(data.transactions[0].amount,2000);
  assert.deepEqual(mock.sheets.get('檀家名簿').rows[1],tombstone);
  remoteEdit(mock,3000,'REMOTE-2');data=await read();assert.equal(data.householdReviews.length,1);
  const relatedBeforeRestore=JSON.stringify(['過去帳','出納・会計','家族構成'].map(n=>mock.sheets.get(n).rows));
  await resolveHouseholdDeletionReview('token',data.householdReviews[0],true);
  data=await read();assert.equal(data.households[0].id,hh.id);assert.equal(data.transactions[0].amount,3000);assert.equal(data.householdReviews.length,0);
  assert.equal(JSON.stringify(['過去帳','出納・会計','家族構成'].map(n=>mock.sheets.get(n).rows)),relatedBeforeRestore);
  assert.equal(mock.sheets.get('操作・削除履歴').rows.filter(r=>String(r[0]).startsWith('HR-')).length,2);
 }finally{global.fetch=old;}
});
test('a changed related record invalidates the prompt rather than restoring with stale confirmation',async()=>{
 const mock=workbook(),old=global.fetch;global.fetch=mock.fetch;
 try{
  await publish([hh]);await read();await watchHouseholdDeletion('test-sheet',hh.id,hh.familyHead);
  await publish([],[{logId:'D2',id:hh.id,entityType:'household',actionType:'delete',deletedTimestamp:1700000000000}]);
  remoteEdit(mock,4000,'R3');const data=await read();remoteEdit(mock,5000,'R4');mock.calls.length=0;
  await assert.rejects(resolveHouseholdDeletionReview('token',data.householdReviews[0],true),/確認中/);
  assert.equal(mock.writtenNames().length,0);assert.equal((await read()).transactions[0].amount,5000);
 }finally{global.fetch=old;}
});
test('the dialog exposes exactly two decisions and cannot dismiss by backdrop or Escape',()=>{
 const source=fs.readFileSync(path.join(root,'src/components/DeletedHouseholdReviewDialog.tsx'),'utf8');
 assert.equal((source.match(/<button\b/g)||[]).length,2);assert(source.includes('名簿に復帰する'));assert(source.includes('削除済みのままにする'));
 assert(!source.includes('onClose'));assert(!source.includes('後で確認'));assert(!source.includes('Escape'));
});
test('reserved deleted IDs are never allocated again, including six digit IDs, and imports cannot reuse them',()=>{
 reserveHousehold('DK-100005','削除済み',true);
 assert.equal(generateNewHouseholdId(temple.id,[],[temple]),'DK-100006');
 assert.throws(()=>assertNoDeletedHouseholdReuse([{id:'DK-100005'}]),/再利用/);
});
test('moving accounting to the fiscal archive alone is not an edit notification',()=>{
 const header=['伝票ID','世帯ID','金額'];const record=['T1','H1','1000'];
 assert.equal(relatedSignature({'出納・会計':[header,record],'出納アーカイブ':[header]},'H1'),relatedSignature({'出納・会計':[header],'出納アーカイブ':[header,record]},'H1'));
});
test('simultaneous deletion registration retains every household watch',async()=>{
 workbook();memory.set('row-sync-baseline-v1:test-sheet',{});
 await Promise.all([watchHouseholdDeletion('test-sheet','A','A'),watchHouseholdDeletion('test-sheet','B','B')]);
 assert.deepEqual(Object.keys(memory.get('household-deletion-watch-v1:test-sheet')).sort(),['A','B']);
});

test('clean startup accepts restored Sheets without replaying stale household review watches',async()=>{
 const mock=workbook(),old=global.fetch;global.fetch=mock.fetch;
 try{
  await publish([hh]);await read();await watchHouseholdDeletion('test-sheet',hh.id,hh.familyHead);
  await publish([],[{logId:'D-reset',id:hh.id,entityType:'household',actionType:'delete',deletedTimestamp:1700000000000}]);
  remoteEdit(mock,2222,'R-reset');assert.equal((await read()).householdReviews.length,1);
  const started=await importFromSheets('token','test-sheet',{readOnly:true,requireCompleteSchema:true,startupReset:true});
  assert.equal(started.householdReviews.length,0);assert.equal(started.transactions[0].amount,2222);
  assert.equal((await read()).householdReviews.length,0);
 }finally{global.fetch=old;}
});

test('startup watch reset retains another live tab and clears only own or expired watches',async()=>{
 const ownership=require('../src/utils/pendingOwnership.ts'), retention=require('../src/utils/householdRetention.ts');
 const storage=require('../src/utils/storageUtils.ts');const original=ownership.isClosedPendingOwner;
 const owner=await ownership.pendingOwner();
 try{
  ownership.isClosedPendingOwner=async id=>!id||id==='closed';
  await storage.idbSet('household-deletion-watch-v1:scope',{own:{name:'own',signature:'x',owner},old:{name:'old',signature:'x',owner:'closed'},legacy:{name:'legacy',signature:'x'},peer:{name:'peer',signature:'x',owner:'live'}});
  await retention.resetHouseholdReviewWatches('scope');
  assert.deepEqual(Object.keys(await storage.idbGet('household-deletion-watch-v1:scope')),['peer']);
 }finally{ownership.isClosedPendingOwner=original;}
});
