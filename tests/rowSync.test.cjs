const {test}=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path'), ts=require('typescript');
require.extensions['.ts']=(m,p)=>m._compile(ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,p);
const {workbook,memory}=require('./rowSyncFixture.cjs');
const {makeRowSyncPlan:plan,ROW_META,activeGrid}=require('../src/utils/rowSyncPlan.ts');
const {saveIncrementalRows:save,rememberRowSyncRead:remember,verifyRows,readPhysicalTables}=require('../src/utils/rowSyncClient.ts');
const schema=snapshot=>Object.keys(snapshot).map((title,i)=>({title,sheetId:i+1,rowCount:100,columnCount:100}));
const run=(desired,current,baseline=current,reviewed=false)=>plan(desired,current,baseline,schema(desired),'operation','2026-09-16',reviewed);
const history=[['履歴ID','種別','対象エンティティ','対象ID']];
const records=[['ID','名前'],['A','甲'],['B','乙']];

test('migration preserves existing rows; reordered input edits by ID and appends only new IDs',()=>{
 const before={'檀家名簿':records};
 const migrated=run(before,before);assert.deepEqual(migrated.summary,{added:0,updated:0,deleted:0});
 assert.equal(migrated.requests.length,1);assert.equal(migrated.requests[0].updateCells.rows.length,1);
 const changed=run({'檀家名簿':[records[0],['B','編集'],['A','甲'],['C','=literal']]},migrated.expected);
 assert.equal(changed.requests[0].updateCells.start.rowIndex,2);
 assert.equal(changed.expected['檀家名簿'][1][0],'A');
 assert.deepEqual(changed.summary,{added:1,updated:1,deleted:0});
 assert.deepEqual(changed.requests.find(r=>r.appendCells).appendCells.rows[0].values[1],{userEnteredValue:{stringValue:'=literal'}});
 assert.deepEqual(before['檀家名簿'],records);
 assert(!changed.requests.some(r=>r.repeatCell||r.deleteDimension||r.deleteSheet));
});
test('new deletion evidence creates tombstones; old evidence and unexplained disappearance fail closed',()=>{
 const current={'檀家名簿':records,'操作・削除履歴':history};
 const desired={'檀家名簿':[records[0],records[2]],'操作・削除履歴':history};
 assert.throws(()=>run(desired,current),/裏付け/);
 const logs=[...history,['D1','delete','household','A']];
 assert.throws(()=>run({...desired,'操作・削除履歴':logs},{...current,'操作・削除履歴':logs}),/裏付け/);
 const p=run({...desired,'操作・削除履歴':logs},current);
 assert.deepEqual(p.expected['檀家名簿'][1],['A','甲','1','2026-09-16','operation']);
 assert.deepEqual(activeGrid(p.expected['檀家名簿']),[records[0],records[2]]);
 assert.equal(run(current,p.expected).expected['檀家名簿'][1][2],'1');
 assert.throws(()=>run(current,p.expected,p.expected,true),/削除済み/);
 assert.equal(plan(current,p.expected,p.expected,schema(current),'restore','now',true,'A').expected['檀家名簿'][1][2],'');
});
test('sparse rows remain at physical indices; duplicate and missing IDs are rejected',()=>{
 const current={'過去帳':[records[0],records[1],[],records[2]]};
 const result=run({'過去帳':[records[0],['B','変更'],records[1]]},current);
 assert.deepEqual(result.expected['過去帳'][2],[]);
 assert.equal(result.requests.at(-1).updateCells.start.rowIndex,3);
 for(const rows of [[records[0],['','x']],[...records,records[1]]]) assert.throws(()=>run({'過去帳':rows},current),/ID/);
});
test('external edits, incomplete metadata and mismatched schemas stop before any plan can be sent',()=>{
 assert.equal(run({'過去帳':records},{'過去帳':[records[0],['A','他端末']]},{'過去帳':records}).expected['過去帳'][1][1],'他端末');
 assert.throws(()=>run({'過去帳':records},{'過去帳':[['ID','名前',ROW_META[0]],records[1]]}),/不完全/);
 assert.throws(()=>run({'過去帳':records},{'過去帳':[['ID','未知列'],records[1]]}),/列構成/);
 assert.throws(()=>activeGrid([['ID',...ROW_META],['A','unexpected']]),/不正/);
});
test('fiscal moves in both directions retain one active record and reuse the old tombstone',()=>{
 const head=['伝票ID','日付']; const old={'出納・会計':[head,['T','2025/04/01']],'出納アーカイブ':[head]};
 const archived=run({'出納・会計':[head],'出納アーカイブ':[head,['T','2025/04/01']]},old).expected;
 assert.equal(archived['出納・会計'][1][2],'1');
 const restored=run(old,archived).expected;
 assert.equal(restored['出納・会計'].length,2);assert.equal(restored['出納・会計'][1][2],'');
 assert.equal(restored['出納アーカイブ'][1][2],'1');
});
test('history retention never removes old rows when the device history reaches its cap',()=>{
 const old={'操作・削除履歴':[...history,['OLD','update','household','A']]};
 const next=run({'操作・削除履歴':[...history,['NEW','update','household','B']]},old);
 assert.equal(next.expected['操作・削除履歴'][1][0],'OLD');
 assert.equal(next.expected['操作・削除履歴'][2][0],'NEW');assert.equal(next.summary.deleted,0);
});
test('temple deletion permits linked rows but not another temple records',()=>{
 const h=['ID','所属寺院ID'];const current={'檀家名簿':[h,['A','T1'],['B','T2']],'操作・削除履歴':history};
 const logs=[...history,['D1','delete','temple','T1']];
 assert.equal(run({'檀家名簿':[h,['B','T2']],'操作・削除履歴':logs},current).summary.deleted,1);
 assert.throws(()=>run({'檀家名簿':[h],'操作・削除履歴':logs},current),/裏付け/);
});
test('verification accepts Google formatted booleans and amounts but rejects missing or different rows',()=>{
 assert(verifyRows({x:[['A',1000,true]]},{x:[['A','1,000','TRUE']]}));
 assert(!verifyRows({x:[['A',1000,true]]},{x:[['A','1,001','TRUE']]}));
 assert(!verifyRows({x:[['A']]},{x:[]}));
});
const spec=m=>[...m.sheets.values()].map(({properties:p})=>({sheetId:p.sheetId,title:p.title,...p.gridProperties}));
const updates=rows=>[{range:"'檀家名簿'!A1",values:rows}];
async function fixture(){const m=workbook('s');m.add('檀家名簿',records);await remember('s',{'檀家名簿':records});return m;}
test('lost response after atomic commit is reconciled after retry with no duplicate append',async()=>{
 const m=await fixture();const desired=[...records,['C','追加']];m.loseResponse();
 await assert.rejects(save('t','s',updates(desired),spec(m),m.fetch),/response lost/);
 assert(memory.get('row-sync-pending-v1:s'));assert.equal(m.sheets.get('檀家名簿').rows.length,4);
 m.calls.length=0;await save('t','s',updates(desired),spec(m),m.fetch);
 assert.equal(m.sheets.get('檀家名簿').rows.length,4);assert.equal(m.writtenNames().length,0);
 assert.equal(memory.get('row-sync-pending-v1:s'),null);
});
test('a rejected atomic request retains data; retry sends once and preserves the old rows',async()=>{
 const m=await fixture();m.fail(true);
 await assert.rejects(save('t','s',updates([...records,['C','追加']]),spec(m),m.fetch),/保存に失敗/);
 assert.deepEqual(m.sheets.get('檀家名簿').rows,records);m.fail(false);m.calls.length=0;
 await save('t','s',updates([...records,['C','追加']]),spec(m),m.fetch);
 assert.equal(m.calls.filter(c=>c.body.requests?.some(r=>r.updateCells)).length,1);
});
test('lost response is reconciled despite unrelated peer edits without replay or whole merge',async()=>{
 const m=await fixture();m.loseResponse();await assert.rejects(save('t','s',updates([...records,['C','追加']]),spec(m),m.fetch));
 m.sheets.get('檀家名簿').rows[1][1]='他端末';m.calls.length=0;
 await save('t','s',updates([...records,['C','追加']]),spec(m),m.fetch);
 assert.equal(m.sheets.get('檀家名簿').rows[1][1],'他端末');assert.equal(m.sheets.get('檀家名簿').rows.length,4);
 assert.equal(m.writtenNames().length,0);assert.equal(memory.get('row-sync-pending-v1:s'),null);
});

test('durable journal failure causes zero data writes',async()=>{
 const m=await fixture();const storage=require('../src/utils/storageUtils.ts'),old=storage.idbSet;
 storage.idbSet=async()=>{throw Error('quota');};
 try{await assert.rejects(save('t','s',updates([...records,['C','追加']]),spec(m),m.fetch),/quota/);assert.equal(m.writtenNames().length,0);}finally{storage.idbSet=old;}
});
test('explicit discard accepts a complete remote snapshot and archives the uncertain save without writing Sheets',async()=>{
 const m=await fixture();m.loseResponse();await assert.rejects(save('t','s',updates([...records,['C','追加']]),spec(m),m.fetch));
 m.sheets.get('檀家名簿').rows[1][1]='他端末';
 const snapshot={'檀家名簿':m.sheets.get('檀家名簿').rows};const pending=structuredClone(memory.get('row-sync-pending-v1:s'));m.calls.length=0;
 await remember('s',snapshot,true);
 assert.equal(memory.get('row-sync-pending-v1:s'),null);
 assert.deepEqual(memory.get('row-sync-baseline-v1:s'),snapshot);
 assert.deepEqual(memory.get('row-sync-discarded-v1:s').pending,pending);
 assert.equal(m.calls.length,0);
});
test('discard recovery retains the pending journal if its backup cannot be persisted',async()=>{
 const m=await fixture();m.loseResponse();await assert.rejects(save('t','s',updates([...records,['C','追加']]),spec(m),m.fetch));
 const pending=structuredClone(memory.get('row-sync-pending-v1:s'));const baseline=structuredClone(memory.get('row-sync-baseline-v1:s'));
 const storage=require('../src/utils/storageUtils.ts'),old=storage.idbSet;storage.idbSet=async()=>{throw Error('quota');};
 try{await assert.rejects(remember('s',{'檀家名簿':records},true),/quota/);}finally{storage.idbSet=old;}
 assert.deepEqual(memory.get('row-sync-pending-v1:s'),pending);assert.deepEqual(memory.get('row-sync-baseline-v1:s'),baseline);
});
test('later-page failure and wrong sheet responses never become a new baseline',async()=>{
 const m=await fixture();const original=structuredClone(memory.get('row-sync-baseline-v1:s'));
 let calls=0;await assert.rejects(readPhysicalTables('t','s',[{...spec(m)[0],rowCount:42001}],async(url,opts)=>++calls===2?new Response('{}',{status:400}):m.fetch(url,opts)),/HTTP 400/);
 assert.deepEqual(memory.get('row-sync-baseline-v1:s'),original);
 await assert.rejects(readPhysicalTables('t','s',spec(m),async()=>new Response(JSON.stringify({valueRanges:[{range:"'別の表'!A1:ZZ100",values:[]}]}))),/不完全/);
});
test('thirty tables use two read requests, preserving all rows and rejecting incomplete batches',async()=>{
 const m=workbook('batch');for(let i=0;i<30;i++)m.add('表'+i,[['ID'],['R'+i]]);
 const result=await readPhysicalTables('t','batch',spec(m),m.fetch);
 assert.equal(m.calls.length,2);assert.equal(Object.keys(result).length,30);assert.deepEqual(result['表29'],[['ID'],['R29']]);
 await assert.rejects(readPhysicalTables('t','batch',spec(m),async(url,opts)=>{
   const response=await m.fetch(url,opts),body=await response.json();body.valueRanges.pop();return new Response(JSON.stringify(body));
 }),/不完全/);
});
test('quota errors do not retry in a tight loop or send data writes',async()=>{
 const m=await fixture();let calls=0;
 await assert.rejects(save('t','s',updates([...records,['C','追加']]),spec(m),async()=>{calls++;return new Response('{}',{status:429});}),/約1分/);
 assert.equal(calls,1);assert.deepEqual(m.sheets.get('檀家名簿').rows,records);
 const root=path.resolve(__dirname,'..');require.cache[path.join(root,'src/lib/googleAuth.ts')]={exports:{getCurrentUser:()=>null,getActiveGoogleAccountName:()=>''}};
 const {fetchWithRetry}=require('../src/lib/googleSheets.ts');const old=global.fetch;calls=0;
 global.fetch=async()=>{calls++;return new Response('{}',{status:429});};
 try{assert.equal((await fetchWithRetry('https://sheets.googleapis.com/test')).status,429);assert.equal(calls,1);}finally{global.fetch=old;}
});
test('history polling finds newly appended logs beyond the original first thirty rows',async()=>{
 const root=path.resolve(__dirname,'..');require.cache[path.join(root,'src/lib/googleAuth.ts')]={exports:{getCurrentUser:()=>null,getActiveGoogleAccountName:()=>''}};
 const {fetchLatestOperationLogs}=require('../src/lib/googleSheets.ts');
 const m=workbook();m.add('操作・削除履歴',[['履歴ID','種別','対象エンティティ','対象ID','内容','日時','日時(ms)'],...Array.from({length:100},(_,i)=>['L'+i,'update','household','A','','',i+1])]);
 const old=global.fetch;global.fetch=m.fetch;
 try{const result=await fetchLatestOperationLogs('t','test-sheet',30);assert.equal(result.latestTimestamp,100);assert.equal(result.logs[0].logId,'L99');assert.equal(result.logs.length,30);}finally{global.fetch=old;}
});


test('reservation details and intentionally blank fields survive a real Sheets round trip',async()=>{
 const authPath=path.resolve(__dirname,'../src/lib/googleAuth.ts');require.cache[authPath]={exports:{getCurrentUser:()=>null,getActiveGoogleAccountName:()=>''}};
 const {exportToSheets,importFromSheets}=require('../src/lib/googleSheets.ts');
 const {verifyMergedReadback}=require('../src/utils/threeWaySheetsMerge.ts');
 const {EMPTY_TEMPLE_INFO,EMPTY_MASTER_OPTIONS}=require('../src/data/initialData.ts');
 const sim=workbook(),old=global.fetch;global.fetch=sim.fetch;
 const temple={...EMPTY_TEMPLE_INFO,id:'temple-main',name:'検証寺',isMain:true};
 const service={id:'S1',templeId:'temple-main',householdId:'',deceasedId:'',deceasedName:'',dharmaName:'',memorialType:'年忌法要',scheduledDate:'2026/09/17',scheduledTime:'終日',endTime:'終日',isAllDay:true,venue:'',chiefMourner:'試験',attendeeCount:0,offeringAmount:0,tobaCount:0,tobaFee:0,tobaType:'',tobaSponsors:[],status:'未入金',receptionCheckedIn:false,accountingRecorded:false,isCompleted:true,noticeText:'案内本文',receptionTime:'12:30',additionalDeceased:[{deceasedId:'P2',deceasedName:'試験二',dharmaName:'試験戒名',memorialType:'三回忌'}],tobaItems:[{id:'TB1',sponsorName:'試験',dharmaName:'試験戒名'}]};
 try{
 await exportToSheets('t','test-sheet',temple,[],[],[service],[],EMPTY_MASTER_OPTIONS,undefined,[],[temple]);
 const remote=await importFromSheets('t','test-sheet',{requireCompleteSchema:true,readOnly:true});
 const actual=remote.memorialServices.find(s=>s.id==='S1');
 const changed=Object.keys(service).filter(k=>!verifyMergedReadback(service[k],actual?.[k],k));
 assert(verifyMergedReadback(service,actual), 'Changed reservation fields: '+changed.join(', '));
 const grid=sim.sheets.get('法事予約').rows, column=grid[0].indexOf('追加予約情報');
 grid.forEach(r=>r.splice(column,1));
 await importFromSheets('t','test-sheet',{requireCompleteSchema:true,readOnly:true});
 await exportToSheets('t','test-sheet',temple,[],[],[service],[],EMPTY_MASTER_OPTIONS,undefined,[],[temple],{reviewedMerge:true});
 const upgraded=await importFromSheets('t','test-sheet',{requireCompleteSchema:true,readOnly:true});
 assert(verifyMergedReadback(service,upgraded.memorialServices[0]),'legacy schema upgrade loses details');
 }finally{global.fetch=old;}
});


test('reservation schema extension preserves tombstones, row IDs, old values and input snapshots',()=>{
 const title='法事予約',old=[['予約ID','名称',...ROW_META],['A','有効','','','old'],['B','削除','1','yesterday','delete']];
 const current={[title]:old},copy=structuredClone(current);
 const desired={[title]:[['予約ID','名称','追加予約情報'],['A','有効','{"isAllDay":true}']]};
 const result=run(desired,current);
 assert.deepEqual(current,copy);
 assert.deepEqual(result.expected[title][2],['B','削除','','1','yesterday','delete']);
 assert.deepEqual(result.expected[title][1],['A','有効','{"isAllDay":true}','','','operation']);
 assert.equal(result.requests.length,1);
 assert.equal(result.requests[0].updateCells.rows.length,3);
 assert.throws(()=>run({[title]:[['予約ID','名称','不明な列'],['A','有効','']]},current),/列構成/);
});

test('no-op retry acknowledges remote audit without deleting unknown pending entries or writing sheets',async()=>{
 const {queueAudit,pendingAudit}=require('../src/utils/pendingAudit.ts');
 const m=await fixture(); await save('t','s',updates(records),spec(m),m.fetch);
 m.add('操作・削除履歴',[history[0],['saved','update','household','A']]);
 queueAudit([{logId:'saved',id:'A'},{logId:'unsaved',id:'B'}]);
 m.calls.length=0;
 await save('t','s',updates(records),spec(m),m.fetch);
 assert.deepEqual((await pendingAudit()).map(e=>e.logId),['unsaved']);
 assert.equal(m.writtenNames().length,0);
});

test('responsive save planning preserves exact deletion requests for a large table',async()=>{
 const {makeRowSyncPlanResponsive}=require('../src/utils/rowSyncPlan.ts');
 const rows=[['ID','名前'],...Array.from({length:20000},(_,i)=>['H'+i,'name'+i])];
 const before={'檀家名簿':rows,'操作・削除履歴':history};
 const desired={'檀家名簿':rows.slice(0,-1),'操作・削除履歴':[...history,['D-last','delete','household','H19999']]};
 const args=[desired,before,before,schema(before),'op','now'];
 const expected=plan(...args);
 assert.deepEqual(await makeRowSyncPlanResponsive(...args),expected);
 assert.equal(expected.summary.deleted,1);
});

test('two tabs deleting the same record serialize read-through-verification and retain both audit entries',async()=>{
 const m=await fixture();m.add('操作・削除履歴',history);
 await remember('s',{'檀家名簿':records,'操作・削除履歴':history});
 const original=Object.getOwnPropertyDescriptor(globalThis,'navigator');let chain=Promise.resolve(),active=0,max=0;
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{locks:{request:(name,work)=>{
   assert.equal(name,'jbtd-row-save-s');const job=chain.then(async()=>{active++;max=Math.max(max,active);try{return await work();}finally{active--;}});chain=job.catch(()=>{});return job;
 }}}});
 try{
 const output=log=>[...updates([records[0],records[2]]),{range:"'操作・削除履歴'!A1",values:[...history,[log,'delete','household','A']]}];
 await Promise.all([save('t','s',output('L1'),spec(m),m.fetch),save('t','s',output('L2'),spec(m),m.fetch)]);
 assert.equal(max,1);
 const grid=m.sheets.get('檀家名簿').rows;
 assert.equal(grid[1][grid[0].indexOf(ROW_META[0])],'1');
 assert.deepEqual(activeGrid(grid),[records[0],records[2]]);
 assert.deepEqual(m.sheets.get('操作・削除履歴').rows.slice(1).map(r=>r[0]),['L1','L2']);
 assert.equal(memory.get('row-sync-pending-v1:s'),null);
 }finally{if(original)Object.defineProperty(globalThis,'navigator',original);else delete globalThis.navigator;}
});

test('startup reset discards captured closed-tab operations but preserves a live tab and operations arriving during read',async()=>{
 const m=await fixture();const {captureStartupReset}=require('../src/utils/rowSyncClient.ts');
 const previousWindow=Object.getOwnPropertyDescriptor(globalThis,'window'),previousNavigator=Object.getOwnPropertyDescriptor(globalThis,'navigator');
 Object.defineProperty(globalThis,'window',{configurable:true,value:{}});
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{locks:{request:async(name,options,work)=>work(name.endsWith('live')?null:{})}}});
 try {
 memory.set('pending-audit-v1',[{logId:'old',__pendingOwner:'closed'},{logId:'other-tab',__pendingOwner:'live'},{logId:'legacy'}]);
 const scope=await captureStartupReset('s');assert.deepEqual(scope.auditIds,['old','legacy']);
 memory.set('pending-audit-v1',[...memory.get('pending-audit-v1'),{logId:'arrived-during-read',__pendingOwner:'closed'}]);
 await remember('s',{'檀家名簿':records},false,true,scope);
 assert.deepEqual(memory.get('pending-audit-v1').map(e=>e.logId),['other-tab','arrived-during-read']);
 assert.equal(m.calls.length,0);
 }finally{if(previousWindow)Object.defineProperty(globalThis,'window',previousWindow);else delete globalThis.window;if(previousNavigator)Object.defineProperty(globalThis,'navigator',previousNavigator);else delete globalThis.navigator;}
});
test('ordinary reconnect preserves unsent history; capturing startup cleanup alone does not discard it',async()=>{
 await fixture();const {captureStartupReset}=require('../src/utils/rowSyncClient.ts');
 memory.set('pending-audit-v1',[{logId:'unsent'}]);
 const scope=await captureStartupReset('s');assert.deepEqual(scope.auditIds,['unsent']);
 assert.equal(memory.get('pending-audit-v1').length,1);
 await remember('s',{'檀家名簿':records},false,true);
 assert.equal(memory.get('pending-audit-v1').length,1);
});

test('independent accounting deletions retain both tombstones and still reject edits to deleted records',async()=>{
 const m=workbook('s'),table='出納・会計',rows=[['ID','金額'],['T1',100],['T2',200],['T3',300]];
 m.add(table,rows);m.add('操作・削除履歴',history);await remember('s',{[table]:rows,'操作・削除履歴':history});
 const output=(remaining,log,id)=>[{range:"'出納・会計'!A1",values:remaining},{range:"'操作・削除履歴'!A1",values:[...history,[log,'delete','transaction',id]]}];
 await save('t','s',output([rows[0],rows[2],rows[3]],'L1','T1'),spec(m),m.fetch);
 await save('t','s',output([rows[0],rows[1],rows[3]],'L2','T2'),spec(m),m.fetch);
 assert.deepEqual(activeGrid(m.sheets.get(table).rows),[rows[0],rows[3]]);
 assert.deepEqual(m.sheets.get('操作・削除履歴').rows.slice(1).map(r=>r[0]),['L1','L2']);
 const before=structuredClone(memory.get('row-sync-baseline-v1:s'));
 assert.deepEqual(plan({[table]:[rows[0],['T1',999],rows[3]],'操作・削除履歴':history},before,before,spec(m),'op','now').expected[table][1].slice(0,3),['T1',999,'1']);
 assert.equal(plan({[table]:[rows[0],rows[1],rows[3]],'操作・削除履歴':[...history,['restore','restore','transaction','T1']]},before,before,spec(m),'op','now').expected[table][1][2],'1');
});

test('adding yago preserves physical rows and deleted metadata',()=>{
 const before={'檀家名簿':[['ID','名前',...ROW_META],['A','甲','','old','op1'],['B','乙','1','deleted','op2']]};
 const p=run({'檀家名簿':[['ID','名前','屋号'],['A','甲','山屋']]},before);
 assert.deepEqual(p.expected['檀家名簿'][0],['ID','名前','屋号',...ROW_META]);
 assert.deepEqual(p.expected['檀家名簿'][2],['B','乙','','1','deleted','op2']);
 assert.equal(p.expected['檀家名簿'][1][2],'山屋');
 assert.equal(p.summary.deleted,0);
});

test('reviewed edit of a deleted row preserves tombstone and first deletion time',()=>{
 for(const title of ['檀家名簿','出納・会計','過去帳']){
  const kind={'檀家名簿':'household','出納・会計':'transaction','過去帳':'pastRecord'}[title];
  const current={[title]:[['ID','名前',...ROW_META],['A','old','1','first-deletion','old-op']]};
  const desired={[title]:[['ID','名前'],['A','edited']]};
  const result=plan(desired,current,current,schema(desired),'new-op','later',true,undefined,[kind+':A']);
  assert.deepEqual(result.expected[title][1],['A','edited','1','first-deletion','new-op']);
  assert.equal(activeGrid(result.expected[title]).length,1);
 }
});

test('a second deletion leaves the first tombstone time untouched',()=>{
 const current={'過去帳':[['ID','名前',...ROW_META],['A','old','1','first','old-op']]};
 const result=run({'過去帳':[['ID','名前']]},current,current,true);
 assert.deepEqual(result.expected['過去帳'][1],current['過去帳'][1]);assert.equal(result.requests.length,0);
});

test('household field updates coexist with peer tombstones without a merge or restoration',()=>{
 const base={'檀家名簿':[['ID','名前','電話',...ROW_META],['A','甲','111','','','old'],['B','乙','222','','','old']]};
 const remote=structuredClone(base);remote['檀家名簿'][1]=['A','甲','999','1','first-delete','peer'];
 for(const same of [false,true]){
  const desired={'檀家名簿':[['ID','名前','電話'],['A',same?'甲編集':'甲','111'],['B',same?'乙':'乙編集','222']]};
  const result=run(desired,remote,base);
  assert.deepEqual(result.expected['檀家名簿'][1].slice(0,5),['A',same?'甲編集':'甲','999','1','first-delete']);
  assert.equal(result.expected['檀家名簿'][2][1],same?'乙':'乙編集');
 }
});

test('normal household save merges peer deletion history and keeps a concurrent tombstone',async()=>{
 const m=workbook('edit-delete');
 const base={'檀家名簿':[['ID','名前',...ROW_META],['A','old','','','old']], '操作・削除履歴':[['履歴ID','種別','対象エンティティ','対象ID',...ROW_META]]};
 for(const [title,rows]of Object.entries(base))m.add(title,structuredClone(rows));
 await remember('edit-delete',base);
 m.sheets.get('檀家名簿').rows[1]=['A','old','1','first','peer'];
 m.sheets.get('操作・削除履歴').rows.push(['peer-delete','delete','household','A','','','peer']);
 const desired={'檀家名簿':[['ID','名前'],['A','edited']], '操作・削除履歴':[['履歴ID','種別','対象エンティティ','対象ID'],['own-edit','update','household','A']]};
 const sheets=[...m.sheets.values()].map(s=>({...s.properties,...s.properties.gridProperties}));
 await save('t','edit-delete',Object.entries(desired).map(([title,values])=>({range:"'"+title+"'!A1",values})),sheets,m.fetch,false,new Set(Object.keys(desired)));
 assert.deepEqual(m.sheets.get('檀家名簿').rows[1].slice(0,4),['A','edited','1','first']);
 assert.deepEqual(m.sheets.get('操作・削除履歴').rows.slice(1).map(r=>r[0]),['peer-delete','own-edit']);
});

for(const [table,kind] of Object.entries({'檀家名簿':'household','過去帳':'pastRecord','法事予約':'memorialService','寺院ToDo':'templeTodo','出納・会計':'transaction','登録僧侶一覧':'priest','案内文テンプレート':'noticeTemplate','戦没・災害物故者命日設定':'disasterMemorial'})) {
 test(table+': independent edits and deletion/edits write cells without resurrecting or overwriting peers',()=>{
  const head=['ID','名称','備考',...ROW_META];const base={[table]:[head,['A','甲','旧','','','old'],['B','乙','旧','','','old']],'操作・削除履歴':history};
  const current=structuredClone(base);current[table][1]=['A','甲','他端末','1','first-delete','peer'];current[table][2][2]='peer B';current[table].push(['C','peer new','note','','','peer']);
  const desired={[table]:[head.slice(0,3),['A','編集','旧'],['B','乙','旧']],'操作・削除履歴':history};
  const result=run(desired,current,base);const saved=result.expected[table];
  assert.deepEqual(saved[1].slice(0,5),['A','編集','他端末','1','first-delete']);assert.equal(saved[2][2],'peer B');assert.equal(saved[3][0],'C');
  const patches=result.requests.filter(r=>r.updateCells&&r.updateCells.start.rowIndex===1).map(r=>r.updateCells.start.columnIndex);
  assert(patches.includes(1));assert(!patches.includes(2));assert(!patches.includes(3));assert(!patches.includes(4));
  const deleting={[table]:[head.slice(0,3),['B','乙','旧']],'操作・削除履歴':[...history,['delete','delete',kind,'A']]};
  assert.equal(run(deleting,current,base).expected[table][1][4],'first-delete');
 });
}
test('success verification ignores peer additions and unrelated edits but still detects missing own write',()=>{
 const {verifyRowChanges}=require('../src/utils/rowSyncClient.ts');
 const before={data:[['ID','名称',...ROW_META],['A','old','','','x'],['B','old','','','x']]};
 const expected=structuredClone(before);expected.data[1]=['A','saved','','','mine'];
 const actual=structuredClone(expected);actual.data[2][1]='peer';actual.data.push(['C','peer new','','','peer']);
 assert(verifyRowChanges(before,expected,actual));actual.data[1][1]='old';assert(!verifyRowChanges(before,expected,actual));
});
test('a later update after atomic commit is accepted only with immutable operation evidence',()=>{
 const {verifyRowChanges}=require('../src/utils/rowSyncClient.ts');
 const before={data:[['ID','名称',...ROW_META],['A','old','','','old']],'操作・削除履歴':[['履歴ID',...ROW_META]]};
 const expected=structuredClone(before);expected.data[1]=['A','saved','','','mine'];expected['操作・削除履歴'].push(['LOG','','','mine']);
 const actual=structuredClone(expected);actual.data[1]=['A','later','','','peer'];
 assert(verifyRowChanges(before,expected,actual));actual['操作・削除履歴'].pop();assert(!verifyRowChanges(before,expected,actual));
});
test('a subsequent local save does not replay an unseen peer field from the last acknowledgement',async()=>{
 const m=await fixture();const initial=await require('../src/utils/rowSyncClient.ts').captureRowReadBaseline('s');
 m.sheets.get('檀家名簿').rows[1][1]='peer';
 await save('t','s',updates([records[0],records[1],['B','first']]),spec(m),m.fetch);
 await save('t','s',updates([records[0],records[1],['B','second']]),spec(m),m.fetch);
 assert.equal(m.sheets.get('檀家名簿').rows[1][1],'peer');assert.equal(m.sheets.get('檀家名簿').rows[2][1],'second');
});

test('two overlapping requests preserve delete flags and later field edits without whole-table verification',async()=>{
 const m=workbook('overlap'), table='過去帳', head=['ID','名称',...ROW_META], h=['履歴ID','種別','対象エンティティ','対象ID',...ROW_META];
 const base={[table]:[head,['A','元','','','old'],['B','別','','','old']],'操作・削除履歴':[h]};
 m.add(table,base[table]);m.add('操作・削除履歴',base['操作・削除履歴']);
 const deletion=plan({[table]:[head.slice(0,2),['B','別']],'操作・削除履歴':[h.slice(0,4),['D','delete','pastRecord','A']]},base,base,spec(m),'delete-op','first');
 const edit=plan({[table]:[head.slice(0,2),['A','編集'],['B','別']],'操作・削除履歴':[h.slice(0,4),['E','update','pastRecord','A']]},base,base,spec(m),'edit-op','second');
 for(const p of [deletion,edit])await m.fetch('https://sheets.googleapis.com/v4/spreadsheets/overlap:batchUpdate',{method:'POST',body:JSON.stringify({requests:p.requests})});
 const actual=Object.fromEntries([...m.sheets].map(([n,s])=>[n,s.rows]));
 assert.deepEqual(actual[table][1].slice(0,4),['A','編集','1','first']);
 const {verifyRowChanges}=require('../src/utils/rowSyncClient.ts');assert(verifyRowChanges(base,deletion.expected,actual));assert(verifyRowChanges(base,edit.expected,actual));
});
