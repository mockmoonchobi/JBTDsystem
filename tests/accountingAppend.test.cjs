const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),ts=require('typescript');
require.extensions['.ts']=(m,p)=>m._compile(ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,p);
const {workbook}=require('./rowSyncFixture.cjs');
const {saveIncrementalRows:save,rememberRowSyncRead:remember}=require('../src/utils/rowSyncClient.ts');
const {ROW_META}=require('../src/utils/rowSyncPlan.ts');
const {accountingAdditions,makeAccountingAppend,containsAppend}=require('../src/utils/accountingAppend.ts');
const {hasOnlyNewAccounting}=require('../src/utils/threeWaySheetsMerge.ts');
const head=['ID','金額'],loghead=['履歴ID','操作','種別','対象ID'];
const snapshot=()=>({'出納・会計':[[...head,...ROW_META]],'操作・削除履歴':[[...loghead,...ROW_META]]});
const desired=id=>({'出納・会計':[head,[id,1000]],'操作・削除履歴':[loghead,['log-'+id,'create','transaction',id]]});
const updates=d=>Object.entries(d).map(([name,values])=>({range:"'"+name+"'!A1",values}));
const spec=m=>[...m.sheets.values()].map(({properties:p})=>({sheetId:p.sheetId,title:p.title,...p.gridProperties}));
async function setup(){const m=workbook('append');for(const [t,g]of Object.entries(snapshot()))m.add(t,g);await remember('append',snapshot());return m;}

test('independent devices append to server-selected rows; concurrent additions survive verification',async()=>{
 const m=await setup(), base=snapshot();
 const peer=makeAccountingAppend(accountingAdditions(desired('B'),base),base,spec(m),'peer');
 let inserted=false;
 const request=async(url,o,...rest)=>{
  const result=await m.fetch(url,o,...rest);
  if(o?.method==='POST'&&!inserted){inserted=true;await m.fetch(url,{method:'POST',body:JSON.stringify({requests:peer.requests})});}
  return result;
 };
 await save('t','append',updates(desired('A')),spec(m),request);
 assert.deepEqual(m.sheets.get('出納・会計').rows.slice(1).map(r=>r[0]),['A','B']);
 assert(m.calls.filter(c=>c.body.requests).every(c=>c.body.requests.every(r=>r.appendCells)));
 assert.equal(m.calls.filter(c=>c.url.includes('batchGet')).length,2);
 assert.equal(m.memory.get('row-sync-pending-v1:append'),null);
});

test('lost acknowledgement is verified by immutable operation and never appended twice',async()=>{
 const m=await setup();m.loseResponse();
 await assert.rejects(save('t','append',updates(desired('A')),spec(m),m.fetch),/response lost/);
 await save('t','append',updates(desired('A')),spec(m),m.fetch);
 assert.equal(m.calls.filter(c=>c.body.requests).length,1);
 assert.equal(m.sheets.get('出納・会計').rows.length,2);
});

test('two tabs retain separate read baselines despite shared browser storage',async()=>{
 const m=await setup();
 const filename=require.resolve('../src/utils/rowSyncClient.ts'),original=require.cache[filename];
 delete require.cache[filename];const second=require(filename);require.cache[filename]=original;
 await second.rememberRowSyncRead('append',snapshot());
 await save('t','append',updates(desired('A')),spec(m),m.fetch);
 await second.saveIncrementalRows('t','append',updates(desired('B')),spec(m),m.fetch);
 assert.deepEqual(m.sheets.get('出納・会計').rows.slice(1).map(r=>r[0]),['A','B']);
 assert.equal(m.calls.filter(c=>c.body.requests).length,2);
});

test('uncertain request not yet visible is not automatically replayed',async()=>{
 const m=await setup();
 await assert.rejects(save('t','append',updates(desired('A')),spec(m),async(url,o)=>{if(o?.method==='POST')throw Error('timeout');return m.fetch(url,o);}),/timeout/);
 await assert.rejects(save('t','append',updates(desired('A')),spec(m),m.fetch),/二重登録/);
 assert.equal(m.calls.filter(c=>c.body.requests).length,0);
});

test('200 receipts and logs are one atomic append, with no full-workbook verification',async()=>{
 const m=await setup(), d={'出納・会計':[head],'操作・削除履歴':[loghead]};
 for(let i=0;i<200;i++){d['出納・会計'].push(['T'+i,i]);d['操作・削除履歴'].push(['L'+i,'create','transaction','T'+i]);}
 await save('t','append',updates(d),spec(m),m.fetch);
 const writes=m.calls.filter(c=>c.body.requests);
 assert.equal(writes.length,1);assert.equal(writes[0].body.requests.length,2);
 assert.equal(m.sheets.get('出納・会計').rows.length,201);
 assert.equal(m.sheets.get('操作・削除履歴').rows.length,201);
});

test('edits, missing records, unrelated logs and duplicate IDs do not use the fast path',()=>{
 const b=snapshot();b['出納・会計'].push(['old',1000,'','','op']);
 assert.equal(accountingAdditions(desired('A'),b),null);
 const d=desired('A');d['出納・会計'].push(['old',999]);assert.equal(accountingAdditions(d,b),null);
 d['出納・会計'][2][1]=1000;assert(accountingAdditions(d,b));
 d['操作・削除履歴'].push(['bad','delete','household','H']);assert.equal(accountingAdditions(d,b),null);
 const plan=makeAccountingAppend(accountingAdditions(desired('A'),snapshot()),snapshot(),[{title:'出納・会計',sheetId:1},{title:'操作・削除履歴',sheetId:2}],'op');
 const dup=structuredClone(plan.expected);dup['出納・会計'].push(dup['出納・会計'][1]);assert(!containsAppend(plan.expected,dup));
});

test('history polling defers to a pure receipt upload but still reviews edits and deletions',()=>{
 const base={local:{transactions:[{id:'old',amount:1}],deletedRecords:[],households:[]}};
 const local={...base.local,transactions:[...base.local.transactions,{id:'new',amount:2}],deletedRecords:[{logId:'L',id:'new',entityType:'transaction',actionType:'create'}]};
 assert(hasOnlyNewAccounting(base,local));
 assert(!hasOnlyNewAccounting(base,{...local,transactions:[{id:'new',amount:2}]}));
 assert(!hasOnlyNewAccounting(base,{...local,households:[{id:'H'}]}));
});

test('the real exporter selects the receipt fast path after a complete initial read',async()=>{
 const root=path.resolve(__dirname,'..');require.cache[path.join(root,'src/lib/googleAuth.ts')]={exports:{getCurrentUser:()=>null,getActiveGoogleAccountName:()=>''}};
 const {exportToSheets,importFromSheets}=require('../src/lib/googleSheets.ts');
 const {EMPTY_TEMPLE_INFO,EMPTY_MASTER_OPTIONS}=require('../src/data/initialData.ts');
 const m=workbook('real-append'),old=global.fetch;global.fetch=m.fetch;
 const temple={...EMPTY_TEMPLE_INFO,id:'temple-main',isMain:true,name:'試験寺院'};
 const publish=(tx,logs=[])=>exportToSheets('token','real-append',temple,[],[],[],tx,EMPTY_MASTER_OPTIONS,undefined,[],[temple],{deletedRecords:logs,onlyChangedTables:true,targetTablesOnly:logs.length ? ['出納・会計','出納アーカイブ','操作・削除履歴'] : undefined});
 try {
  await publish([]);await importFromSheets('token','real-append',{requireCompleteSchema:true,readOnly:true});
  m.calls.length=0;
  await publish([{id:'TX-new',templeId:temple.id,date:'2026/09/17',amount:1000,type:'収入',category:'寄付',notes:'受付'}],[{logId:'L-new',id:'TX-new',entityType:'transaction',actionType:'create',deletedAt:'2026-09-17T00:00:00Z',deletedTimestamp:1789603200000}]);
  const writes=m.calls.filter(c=>c.body.requests?.some(r=>r.appendCells||r.updateCells));
  assert.equal(writes.length,1);assert(writes[0].body.requests.every(r=>r.appendCells));
  const reads=m.calls.filter(c=>c.url.includes('values:batchGet'));
  assert.equal(reads.length,2);
  assert(reads.every(c=>!decodeURIComponent(c.url).includes('檀家名簿')));
 } finally {global.fetch=old;}
});

test('receipts created during an earlier upload keep their audit queued for the next batch',async()=>{
 const m=await setup();const {queueAudit,currentPageAudit,auditForExport,getLocalAuditRevision,acknowledgeAudit}=require('../src/utils/pendingAudit.ts');
 const entry=id=>({logId:'log-'+id,id,entityType:'transaction',actionType:'create',deletedTimestamp:1000});
 queueAudit([entry('A')]);const boundary=getLocalAuditRevision();
 queueAudit([entry('B')]);
 const first=await auditForExport([],true,true,boundary);assert.deepEqual(first.map(e=>e.id),['A']);
 await acknowledgeAudit({'操作・削除履歴':[loghead,['log-A','create','transaction','A']]});
 assert.deepEqual((await currentPageAudit()).map(e=>e.id),['B']);
 assert.deepEqual((await auditForExport([],true,true)).map(e=>e.id),['B']);
});
test('identical already-saved receipt is confirmed without duplicate append; changed or deleted rows still stop',()=>{
 const additions=accountingAdditions(desired('A'),snapshot());
 const sheets=[{title:'出納・会計',sheetId:1},{title:'操作・削除履歴',sheetId:2}];
 const first=makeAccountingAppend(additions,snapshot(),sheets,'first');
 const second=makeAccountingAppend(additions,first.expected,sheets,'second');
 assert.equal(second.requests.length,0);assert(containsAppend(second.expected,first.expected));
 for(const mutate of [r=>r[1]=999,r=>r[2]='1']){
   const remote=structuredClone(first.expected);mutate(remote['出納・会計'][1]);
   assert.throws(()=>makeAccountingAppend(additions,remote,sheets,'third'),/他の操作/);
 }
});
test('saving identical receipts already present on Sheets issues no mutation',async()=>{
 const m=await setup();const d=desired('already');
 const plan=makeAccountingAppend(accountingAdditions(d,snapshot()),snapshot(),spec(m),'peer');
 for(const [title,grid] of Object.entries(plan.expected))m.sheets.get(title).rows=structuredClone(grid);
 await save('t','append',updates(d),spec(m),m.fetch);
 assert.equal(m.calls.filter(c=>c.body.requests).length,0);
 assert.equal(m.sheets.get('出納・会計').rows.length,2);
});
test('first receipt upload after import tolerates unchanged formatted coordinates and generated template timestamps',()=>{
 const b=snapshot(),d=desired('A');
 b['檀家名簿']=[['ID','緯度'],['H','35.600000']];d['檀家名簿']=[['ID','緯度'],['H',35.6]];
 b['案内文テンプレート']=[['ID','名前','種類','分類','本文','更新日'],['N','案内','A4','custom','本文','old']];
 d['案内文テンプレート']=[['ID','名前','種類','分類','本文','更新日'],['N','案内','A4','custom','本文','new']];
 assert(accountingAdditions(d,b,new Set(Object.keys(d))));
 d['案内文テンプレート'][1][4]='本文の編集';assert.equal(accountingAdditions(d,b,new Set(Object.keys(d))),null);
});
test('two tabs append 12 receipts each after import with formatted unrelated tables',async()=>{
 const m=await setup(),b=snapshot();
 b['檀家名簿']=[['ID','緯度'],['H','35.600000']];
 b['案内文テンプレート']=[['ID','名前','種類','分類','本文','更新日'],['N','案内','A4','custom','本文','old']];
 m.add('檀家名簿',b['檀家名簿']);m.add('案内文テンプレート',b['案内文テンプレート']);
 await remember('append',b);
 const filename=require.resolve('../src/utils/rowSyncClient.ts'),original=require.cache[filename];delete require.cache[filename];const second=require(filename);require.cache[filename]=original;
 await second.rememberRowSyncRead('append',b);
 const batch=prefix=>{
  const d={'檀家名簿':[['ID','緯度'],['H',35.6]],'案内文テンプレート':[b['案内文テンプレート'][0],['N','案内','A4','custom','本文','new']], '出納・会計':[head],'操作・削除履歴':[loghead]};
  for(let i=0;i<12;i++){const id=prefix+i;d['出納・会計'].push([id,1000]);d['操作・削除履歴'].push(['L'+id,'create','transaction',id]);}return d;
 };
 for(const [client,prefix] of [[save,'A'],[second.saveIncrementalRows,'B']]){const d=batch(prefix);await client('t','append',updates(d),spec(m),m.fetch,false,new Set(Object.keys(d)));}
 const writes=m.calls.filter(c=>c.body.requests);
 assert.equal(writes.length,2);assert(writes.every(c=>c.body.requests.every(r=>r.appendCells)));
 assert.equal(m.sheets.get('出納・会計').rows.length,25);
 assert.equal(new Set(m.sheets.get('出納・会計').rows.slice(1).map(r=>r[0])).size,24);
});

test('explicit receipt operations ignore unrelated baseline changes and support two tabs of 12 receipts',async()=>{
 const m=await setup();
 const client=require('../src/utils/rowSyncClient.ts');
 const base=snapshot();base['檀家名簿']=[['ID'],['H-old']];m.add('檀家名簿',[['ID'],['H-peer']]);
 await remember('append',base);
 const filename=require.resolve('../src/utils/rowSyncClient.ts'),original=require.cache[filename];
 delete require.cache[filename];const second=require(filename);require.cache[filename]=original;
 await second.rememberRowSyncRead('append',base);
 for(const [prefix,c] of [['A',client],['B',second]]){
  const d={'出納・会計':[head],'操作・削除履歴':[loghead]};
  for(let i=0;i<12;i++){d['出納・会計'].push([prefix+i,1000]);d['操作・削除履歴'].push(['L'+prefix+i,'create','transaction',prefix+i]);}
  await c.saveAccountingOperations('t','append',d,spec(m),m.fetch);
 }
 assert.equal(m.sheets.get('出納・会計').rows.length,25);
 assert.equal(m.sheets.get('操作・削除履歴').rows.length,25);
 assert(m.calls.filter(c=>c.body.requests).every(c=>c.body.requests.every(r=>r.appendCells)));
 assert(m.calls.filter(c=>c.url.includes('batchGet')).every(c=>!decodeURIComponent(c.url).includes('檀家名簿')));
 assert.equal(m.sheets.get('檀家名簿').rows[1][0],'H-peer');
});

test('explicit receipt retry verifies a lost response without a second append',async()=>{
 const m=await setup(),{saveAccountingOperations:send}=require('../src/utils/rowSyncClient.ts');m.loseResponse();
 await assert.rejects(send('t','append',desired('A'),spec(m),m.fetch),/response lost/);
 await send('t','append',desired('A'),spec(m),m.fetch);
 assert.equal(m.calls.filter(c=>c.body.requests).length,1);
 assert.equal(m.sheets.get('出納・会計').rows.length,2);
});

test('receipt outbox excludes later edits or deletions without discarding other new receipts',()=>{
 const {receiptOperations}=require('../src/utils/receiptOutbox.ts');
 const tx=[{id:'A',amount:1},{id:'B',amount:2},{id:'C',amount:4}];
 const entries=tx.map(t=>({id:t.id,logId:'L'+t.id,entityType:'transaction',actionType:'create',afterData:{...t}}));
 entries[2].afterData.amount=3;
 entries.push({id:'B',logId:'edit-B',entityType:'transaction',actionType:'update'});
 assert.deepEqual(receiptOperations(entries,tx).map(e=>e.id),['A']);
 assert.deepEqual(receiptOperations(entries,[]),[]);
});

test('dedicated receipt API round-trips persisted notes without building unrelated tables',async()=>{
 const root=path.resolve(__dirname,'..');require.cache[path.join(root,'src/lib/googleAuth.ts')]={exports:{getCurrentUser:()=>null,getActiveGoogleAccountName:()=>''}};
 const {exportToSheets,importFromSheets,appendAccountingReceipts}=require('../src/lib/googleSheets.ts');
 const {EMPTY_TEMPLE_INFO,EMPTY_MASTER_OPTIONS}=require('../src/data/initialData.ts');
 const m=workbook('receipt-api'),old=global.fetch;global.fetch=m.fetch;
 const temple={...EMPTY_TEMPLE_INFO,id:'temple-main',isMain:true,name:'試験寺院'};
 try{
  await exportToSheets('token','receipt-api',temple,[],[],[],[],EMPTY_MASTER_OPTIONS,undefined,[],[temple],{deletedRecords:[]});
  await importFromSheets('token','receipt-api',{requireCompleteSchema:true,readOnly:true});
  const t={id:'receipt-uuid',templeId:temple.id,date:'2026/09/17',amount:1000,type:'収入',category:'護持会費',notes:'受付摘要',paymentMethod:'現金受付',createdDate:'2026/09/17',createdTime:'12:34:56'};
  const e={logId:'receipt-log',id:t.id,templeId:t.templeId,entityType:'transaction',actionType:'create',afterData:t,deletedAt:'2026-09-17T03:34:56Z',deletedTimestamp:1789616096000};
  m.calls.length=0;
  await appendAccountingReceipts('token','receipt-api',[e],[temple]);
  await appendAccountingReceipts('token','receipt-api',[e],[temple]);
  assert.equal(m.calls.filter(c=>c.body.requests).length,1);
  assert(m.calls.filter(c=>c.url.includes('batchGet')).every(c=>!decodeURIComponent(c.url).includes('檀家名簿')));
  const read=await importFromSheets('token','receipt-api',{requireCompleteSchema:true,readOnly:true});
  assert.equal(read.transactions.length,1);assert.equal(read.transactions[0].notes,'受付摘要');
  assert.equal(read.transactions[0].paymentMethod,'現金受付');
 }finally{global.fetch=old;}
});

test('directory-only export with a cold cache ignores concurrent batch configuration changes',async()=>{
 const root=path.resolve(__dirname,'..');require.cache[path.join(root,'src/lib/googleAuth.ts')]={exports:{getCurrentUser:()=>null,getActiveGoogleAccountName:()=>''}};
 const {exportToSheets,importFromSheets}=require('../src/lib/googleSheets.ts');
 const {directorySaveTables}=require('../src/utils/directorySaveScope.ts');
 const {EMPTY_TEMPLE_INFO,EMPTY_MASTER_OPTIONS}=require('../src/data/initialData.ts');
 const m=workbook('directory-scope'),old=global.fetch;global.fetch=m.fetch;
 const temple={...EMPTY_TEMPLE_INFO,id:'temple-main',isMain:true,name:'試験寺院'};
 const hh={id:'H1',templeId:temple.id,familyHead:'変更前',familyMembers:[]};
 const before={households:[hh],batchAccountingConfig:null,deletedRecords:[]};
 const after={...before,households:[{...hh,familyHead:'変更後'}]};
 const scope=directorySaveTables(before,after);assert.deepEqual(scope,['檀家名簿','家族構成','操作・削除履歴']);
 assert.deepEqual(directorySaveTables(before,{...after,batchAccountingConfig:{cat1:'changed'}}),['檀家名簿','家族構成','一括会計設定','操作・削除履歴']);
 try{
  await exportToSheets('t','directory-scope',temple,[hh],[],[],[],EMPTY_MASTER_OPTIONS,undefined,[],[temple],{deletedRecords:[]});
  await importFromSheets('t','directory-scope',{requireCompleteSchema:true,readOnly:true});
  const config=m.sheets.get('一括会計設定');config.rows[1]=['peer-config','他端末の設定'];
  const saved=structuredClone(config.rows);m.calls.length=0;
  await exportToSheets('t','directory-scope',temple,after.households,[],[],[],EMPTY_MASTER_OPTIONS,undefined,[],[temple],{deletedRecords:[],onlyChangedTables:true,targetTablesOnly:scope});
  assert.deepEqual(config.rows,saved);
  const result=await importFromSheets('t','directory-scope',{requireCompleteSchema:true,readOnly:true});
  assert.equal(result.households[0].familyHead,'変更後');
 }finally{global.fetch=old;}
});

test('cold-cache reception save excludes a populated remote master absent from this tabs baseline',async()=>{
 const {exportToSheets,importFromSheets}=require('../src/lib/googleSheets.ts');
 const {directorySaveTables}=require('../src/utils/directorySaveScope.ts');
 const {EMPTY_TEMPLE_INFO,EMPTY_MASTER_OPTIONS}=require('../src/data/initialData.ts');
 const m=workbook('receipt-master-scope'),old=global.fetch;global.fetch=m.fetch;
 const main={...EMPTY_TEMPLE_INFO,id:'temple-main',isMain:true,name:'受付寺院'};
 const other={...main,id:'temple-sub-K8-test',isMain:false,name:'大福院'};
 const tx={id:'T1',templeId:main.id,date:'2026/09/18',amount:1000,type:'収入',category:'布施'};
 try {
  await exportToSheets('t','receipt-master-scope',main,[],[],[],[tx],EMPTY_MASTER_OPTIONS,undefined,[],[main,other],{deletedRecords:[]});
  // This tab loaded before the other tab created the master sheet.
  m.sheets.delete('マスタ_大福院');
  const read=await importFromSheets('t','receipt-master-scope',{requireCompleteSchema:true,readOnly:true});
  m.add('マスタ_大福院',[['区分','値'],['重要','他端末の設定']]);const original=structuredClone(m.sheets.get('マスタ_大福院').rows);
  const before={temples:[main,other],transactions:[tx],batchAccountingData:null,templeMasterOptionsMap:{},masterOptions:EMPTY_MASTER_OPTIONS,deletedRecords:[]};
  const next={...before,transactions:[{...tx,amount:2000}],batchAccountingData:{templeId:main.id,configDate:'2026/09/18',entries:{}}};
  await assert.rejects(exportToSheets('t','receipt-master-scope',main,[],[],[],next.transactions,EMPTY_MASTER_OPTIONS,undefined,[],[main,other],{...next,onlyChangedTables:true}),/同期基準がありません.*マスタ_大福院/);
  const scope=directorySaveTables(before,next);assert(!scope.some(n=>n.startsWith('マスタ')));m.calls.length=0;
  await exportToSheets('t','receipt-master-scope',main,[],[],[],next.transactions,EMPTY_MASTER_OPTIONS,undefined,[],[main,other],{...next,onlyChangedTables:true,targetTablesOnly:scope});
  assert.deepEqual(m.sheets.get('マスタ_大福院').rows,original);assert(!m.writtenNames().includes('マスタ_大福院'));
  assert(!m.calls.some(c=>c.url.includes('batchGet')&&decodeURIComponent(c.url).includes('マスタ_大福院')));
  const result=await importFromSheets('t','receipt-master-scope',{requireCompleteSchema:true,readOnly:true});assert.equal(result.transactions[0].amount,2000);
 }finally{global.fetch=old;}
});
test('editing one temple master excludes other temple masters',()=>{
 const {directorySaveTables}=require('../src/utils/directorySaveScope.ts');
 const before={temples:[{id:'a',name:'甲寺'},{id:'b',name:'乙寺'}],templeMasterOptionsMap:{a:{x:1},b:{x:1}}};
 assert.deepEqual(directorySaveTables(before,{...before,templeMasterOptionsMap:{a:{x:2},b:{x:1}}}),['マスタ_甲寺','操作・削除履歴']);
});

test('first accounting operation upgrades legacy headings atomically without rewriting old rows',async()=>{
 const {saveAccountingOperations,captureRowReadBaseline}=require('../src/utils/rowSyncClient.ts');
 const m=workbook('legacy-operations');
 const base={'出納・会計':[head,['old',500]],'操作・削除履歴':[loghead,['old-log','create','transaction','old']]};
 for(const [title,rows]of Object.entries(base))m.add(title,rows);
 await remember('legacy-operations',base);
 await saveAccountingOperations('t','legacy-operations',desired('new'),spec(m),m.fetch);
 assert.deepEqual(m.sheets.get('出納・会計').rows[1],['old',500]);
 assert.deepEqual(m.sheets.get('出納・会計').rows[0],[...head,...ROW_META]);
 assert.deepEqual((await captureRowReadBaseline('legacy-operations'))['出納・会計'][0],[...head,...ROW_META]);
 const writes=m.calls.filter(c=>c.body.requests);
 assert.equal(writes.length,1);assert.equal(writes[0].body.requests.filter(r=>r.updateCells).length,2);
 assert(writes[0].body.requests.filter(r=>r.updateCells).every(r=>r.updateCells.start.rowIndex===0));
 await saveAccountingOperations('t','legacy-operations',desired('next'),spec(m),m.fetch);
 assert.deepEqual(m.sheets.get('出納・会計').rows.slice(1).map(r=>r[0]),['old','new','next']);
});

test('receipt schema migration rejects partial or unknown headings without producing a write',()=>{
 for(const extra of [[ROW_META[0]],['unknown']]){
  const current={'出納・会計':[[...head,...extra]],'操作・削除履歴':[[...loghead,...ROW_META]]};
  assert.equal(makeAccountingAppend(desired('new'),current,[{title:'出納・会計',sheetId:1},{title:'操作・削除履歴',sheetId:2}],'op'),null);
 }
});
