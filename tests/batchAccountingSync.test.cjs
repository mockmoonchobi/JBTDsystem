const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),ts=require('typescript');
const ast=ts.createSourceFile('App.tsx',fs.readFileSync('src/App.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),functions={};let effect;
function visit(n){if(ts.isVariableDeclaration(n)&&['handleAddBatchTransactions','handleSaveBatchAccountingData','handleSaveTempleConfiguration'].includes(n.name.getText(ast)))functions[n.name.getText(ast)]=n.initializer.getText(ast);if(ts.isCallExpression(n)&&n.expression.getText(ast)==='useEffect'&&n.arguments[0]?.getText(ast).includes('const performAutoSync'))effect=n.arguments[0].getText(ast);ts.forEachChild(n,visit);}visit(ast);
const compile=s=>ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
test('150 accounting entries and reception clearing use one verified save, with no competing writer or premature green status',async()=>{
 const state={templeInfo:{id:'temple-main'},temples:[],households:[],pastRecords:[],memorialServices:[],templeTodos:[],transactions:[{id:'existing'}],masterOptions:{},noticeTemplates:{},templeMasterOptionsMap:{},priests:[],deletedRecords:[],disasterEvents:[]};
 const logs=[],timers=[],statuses=[],writes=[];let complete,config;
 const c={...state,syncStateRef:{current:state},activeTempleId:'temple-main',confirmDeletedHouseholdEdit:()=>true,recordHistory(){},resolveTxTempleId:()=> 'temple-main',normalizeDateInput:v=>v,withCreationAudit:v=>v,getCurrentOperatorInfo:()=>({operator:'test',deviceInfo:'test'}),formatTransactionLogDesc:t=>t.id,
 recordOperationLog:(id,entityType,actionType)=>logs.push({logId:id,id,entityType,actionType}),setTransactions:f=>state.transactions=f(state.transactions),setBatchAccountingData:v=>state.batchAccountingData=v,saveBatchAccountingData(){},saveBatchAccountingConfig:v=>config=v,refreshDeletedRecords(){},cleanWriteSpecificTablesToGoogleSheets(){throw Error('competing partial write');},
 autoSyncDueRef: {current:null}, maintenanceStopped:()=>false,isInitialLoaded:true,isImportingRef:{current:false},isCleanWritingRef:{current:false},isSyncInProgressRef:{current:false},lastSyncedSignatureRef:{current:''},writeSafetyRef:{current:{canWrite:()=>true,accept(){}}},getSheetsPayload:v=>v,getAccessToken:async()=> 't',safeStorage:{getItem:()=>'{"id":"sheet"}',setItem(){}},getSavedBatchAccountingData:()=>state.batchAccountingData,getSavedBatchAccountingConfig:()=>config,getSavedDisasterMemorialEvents:()=>[],loadDeletedRecordsLog:()=>logs,getAllSavedNoticeTemplates:()=>[],computePayloadSignature:JSON.stringify,readMergeBaseline:async()=>null,currentPageAudit:async()=>[],receiptOperations:()=>[],directorySaveTables:()=>undefined,safeExportWithAutoRecovery:async(t,id,fn)=>fn(id),acknowledgeSheets:async()=>{},exportToSheets:async(...args)=>{writes.push(args);await new Promise(r=>complete=r);},setSyncStatus:s=>statuses.push(s),setLastSyncTime(){},setSyncErrorMessage(){},isAuthError:()=>false,setTimeout:fn=>{timers.push(fn);return timers.length;},clearTimeout(){},console};
 const context=vm.createContext(c),run=name=>vm.runInContext(compile('('+functions[name]+')'),context),runEffect=()=>vm.runInContext(compile('('+effect+')()'),context);
 run('handleAddBatchTransactions')(Array.from({length:150},(_,i)=>({id:'T'+i,date:'2026/09/18',amount:1000})));
 run('handleSaveBatchAccountingData')({entries:{},templeId:'temple-main',configDate:'2026/09/18'});
 assert.equal(logs.length,151);assert.equal(writes.length,0);
 runEffect();timers.shift()();await new Promise(setImmediate);
 assert.equal(writes.length,1);assert.equal(writes[0][6].length,151);assert.equal(Object.keys(writes[0][11].batchAccountingData.entries).length,0);assert.equal(writes[0][11].deletedRecords.length,151);
 assert.deepEqual(statuses,['syncing']);assert(c.isSyncInProgressRef.current);
 complete();await new Promise(setImmediate);assert.deepEqual(statuses,['syncing','synced']);
 runEffect();timers.shift()();await new Promise(setImmediate);assert.equal(writes.length,1);
});

test('autosave sends receipt operations only and leaves entries created during upload for the next save',async()=>{
 const state={templeInfo:{id:'main'},temples:[],households:[],pastRecords:[],memorialServices:[],templeTodos:[],transactions:[{id:'A',amount:1}],masterOptions:{},noticeTemplates:{},templeMasterOptionsMap:{},priests:[],deletedRecords:[],disasterEvents:[]};
 let pending=[{id:'A',logId:'LA',entityType:'transaction',actionType:'create',afterData:state.transactions[0]}],release;
 let base={local:{...state,transactions:[]}};const timers=[],sent=[];
 const c={...state,syncStateRef:{current:state},autoSyncDueRef:{current:null},maintenanceStopped:()=>false,isInitialLoaded:true,isImportingRef:{current:false},isCleanWritingRef:{current:false},isSyncInProgressRef:{current:false},lastSyncedSignatureRef:{current:''},writeSafetyRef:{current:{canWrite:()=>true,accept(){}}},getSheetsPayload:v=>v,getAccessToken:async()=> 't',safeStorage:{getItem:()=>'{"id":"sheet"}',setItem(){}},getSavedBatchAccountingData:()=>null,getSavedBatchAccountingConfig:()=>null,getSavedDisasterMemorialEvents:()=>[],loadDeletedRecordsLog:()=>pending,getAllSavedNoticeTemplates:()=>[],computePayloadSignature:JSON.stringify,readMergeBaseline:async()=>base,currentPageAudit:async()=>pending,receiptOperations:entries=>entries,
 appendAccountingReceipts:async(t,id,entries)=>{sent.push(entries.map(e=>e.id));await new Promise(r=>release=r);},
 acknowledgeReceiptOperations:async(id,entries)=>{const ids=new Set(entries.map(e=>e.id));pending=pending.filter(e=>!ids.has(e.id));base={local:{...base.local,transactions:[...base.local.transactions,...entries.map(e=>e.afterData)]}};},
 safeExportWithAutoRecovery(){throw Error('whole workbook export must not run');},setSyncStatus(){},setLastSyncTime(){},setSyncErrorMessage(){},isAuthError:()=>false,setTimeout:fn=>{timers.push(fn);return timers.length;},clearTimeout(){},console};
 const run=()=>vm.runInNewContext(compile('('+effect+')()'),c);
 run();timers.shift()();await new Promise(setImmediate);
 assert.deepEqual(sent,[['A']]);
 const t={id:'B',amount:2};state.transactions=[...state.transactions,t];pending=[...pending,{id:'B',logId:'LB',entityType:'transaction',actionType:'create',afterData:t}];
 release();await new Promise(setImmediate);
 assert.deepEqual(pending.map(e=>e.id),['B']);
 run();timers.shift()();await new Promise(setImmediate);assert.deepEqual(sent,[['A'],['B']]);
 release();await new Promise(setImmediate);assert.equal(pending.length,0);assert.equal(c.isSyncInProgressRef.current,false);
});

test('temple creation followed by settings edit during upload waits and saves latest configuration without merge',async()=>{
 const state={templeInfo:{id:'temple-main'},temples:[],households:[],pastRecords:[],memorialServices:[],templeTodos:[],transactions:[],masterOptions:{},noticeTemplates:{},templeMasterOptionsMap:{},priests:[],deletedRecords:[],disasterEvents:[]};
 const timers=[],statuses=[],writes=[],accepted=[];let complete;
 const c={...state,syncStateRef:{current:state},
 handleSaveTemples:(rows,id,defer)=>{assert(defer);state.temples=rows;},handleSaveMasterOptions:(options,id,map,defer)=>{assert(defer);state.templeMasterOptionsMap=map;},handleSavePriests:(rows,defer)=>{assert(defer);state.priests=rows;},cleanWriteSpecificTablesToGoogleSheets(){throw Error('competing writer');},
 autoSyncDueRef:{current:null},maintenanceStopped:()=>false,isInitialLoaded:true,isImportingRef:{current:false},isCleanWritingRef:{current:false},isSyncInProgressRef:{current:false},lastSyncedSignatureRef:{current:''},writeSafetyRef:{current:{canWrite:()=>true,accept(){}}},getSheetsPayload:v=>v,getAccessToken:async()=> 't',safeStorage:{getItem:()=>'{"id":"sheet"}',setItem(){}},getSavedBatchAccountingData:()=>undefined,getSavedBatchAccountingConfig:()=>undefined,getSavedDisasterMemorialEvents:()=>[],loadDeletedRecordsLog:()=>[],getAllSavedNoticeTemplates:()=>[],computePayloadSignature:JSON.stringify,readMergeBaseline:async()=>null,currentPageAudit:async()=>[],receiptOperations:()=>[],directorySaveTables:()=>undefined,safeExportWithAutoRecovery:async(t,id,fn)=>fn(id),acknowledgeSheets:async(id,local)=>accepted.push(local),exportToSheets:async(...args)=>{writes.push(structuredClone(args));await new Promise(r=>complete=r);},setSyncStatus:s=>statuses.push(s),setLastSyncTime(){},setSyncErrorMessage:m=>{assert.equal(m,null);},isAuthError:()=>false,setTimeout:fn=>{timers.push(fn);return timers.length;},clearTimeout(){},console};
 const ctx=vm.createContext(c),save=vm.runInContext(compile('('+functions.handleSaveTempleConfiguration+')'),ctx),runEffect=()=>vm.runInContext(compile('('+effect+')()'),ctx);
 save([{id:'sub',name:'新寺院',phone:'111'}],'sub',{}, {sub:{}},[]);
 runEffect();timers.shift()();await new Promise(setImmediate);assert.equal(writes.length,1);
 save([{id:'sub',name:'新寺院',phone:'222'}],'sub',{}, {sub:{categories:['布施']}},[]);
 runEffect();assert.equal(timers.length,0);assert.equal(writes.length,1);assert.deepEqual(statuses,['syncing']);
 complete();await new Promise(setImmediate);assert.equal(accepted[0].temples[0].phone,'111');assert.equal(state.temples[0].phone,'222');
 runEffect();timers.shift()();await new Promise(setImmediate);assert.equal(writes.length,2);assert.equal(writes[1][10][0].phone,'222');assert.deepEqual(writes[1][11].templeMasterOptionsMap.sub.categories,['布施']);
 complete();await new Promise(setImmediate);assert.equal(accepted[1].temples[0].phone,'222');assert.deepEqual(statuses,['syncing','synced','syncing','synced']);
 runEffect();timers.shift()();await new Promise(setImmediate);assert.equal(writes.length,2);
});
