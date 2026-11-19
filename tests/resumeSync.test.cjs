const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),ts=require('typescript'),vm=require('vm');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,f);
const ast=ts.createSourceFile('app.tsx',fs.readFileSync('src/App.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let effect;
function visit(n){if(ts.isCallExpression(n)&&n.expression.getText(ast)==='useEffect'&&n.arguments[0]?.getText(ast).includes('const resumeVisibleSync'))effect=n.arguments[0].getText(ast);ts.forEachChild(n,visit);}visit(ast);assert(effect);
const code=ts.transpileModule('('+effect+')()',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
function setup(overrides={}){
 const listeners={},calls=[];
 const events={addEventListener:(name,fn)=>listeners[name]=fn,removeEventListener:name=>delete listeners[name]};
 const base={syncStatus:'error',syncErrorMessage:'通信タイムアウト',mergeSaving:false,...overrides};
 const resumeStateRef={current:{syncStatus:base.syncStatus,syncErrorMessage:base.syncErrorMessage,mergeSaving:base.mergeSaving}};
 const c={writeSafetyRef:{current:{canWrite:()=>true}},hasOnlyIndependentPendingChanges:()=>false,getSheetsPayload:v=>v,syncStateRef:{current:{}},currentPageAudit:async()=>[],document:{...events,visibilityState:'visible'},window:events,navigator:{onLine:true},isStartupLauncherOpenRef:{current:false},dataLinkOpenRef:{current:false},mergeRequest:null,mergeSaving:base.mergeSaving,maintenanceStopped:()=>false,manualSyncInProgressRef:{current:false},isSyncInProgressRef:{current:false},isCleanWritingRef:{current:false},isImportingRef:{current:false},resumeCheckRef:{current:{busy:false,last:0}},resumeStateRef,syncStatus:base.syncStatus,syncErrorMessage:base.syncErrorMessage,loadJsonState:()=>({id:'sheet'}),getAccessToken:async()=>{calls.push('token');return 'token';},fetchLatestOperationLogs:async()=>({logs:[{logId:'known'}]}),readMergeBaseline:async()=>({remote:{deletedRecords:[{logId:'known'}]}}),syncWithGoogleDriveRef:{current:async(...args)=>calls.push(['read',...args])},setSyncStatus:s=>{resumeStateRef.current.syncStatus=s;calls.push(['status',s]);},setSyncErrorMessage:m=>{resumeStateRef.current.syncErrorMessage=m;calls.push(['message',m]);},clearCachedAccessToken:()=>calls.push('clear'),isAuthError:e=>e.status===401,...overrides};
 const dispose=vm.runInNewContext(code,c);
 return {c,calls,dispose,
  wake:async()=>{listeners.focus();await new Promise(setImmediate);},
  wakeVisible:async()=>{listeners.visibilitychange();await new Promise(setImmediate);},
  wakeOnline:async()=>{listeners.online();await new Promise(setImmediate);},
 };
}
test('returning with valid authorization resumes with a normal pull, never a clean reset',async()=>{const h=setup();await h.wake();assert.deepEqual(h.calls.find(c=>Array.isArray(c)&&c[0]==='read'),['read','token','sheet']);await h.wake();assert.equal(h.calls.filter(c=>c==='token').length,1);});
test('expired or absent token requests a click instead of opening login or reading data',async()=>{for(const missing of [true,false]){const h=setup(missing?{getAccessToken:async()=>null}:{fetchLatestOperationLogs:async()=>{throw {status:401};}});await h.wake();assert(!h.calls.some(c=>Array.isArray(c)&&c[0]==='read'));assert(h.calls.some(c=>Array.isArray(c)&&c[0]==='message'&&c[1].includes('再接続')));}});
test('uncertain save, maintenance, hidden page and review never resume automatically',async()=>{for(const props of [{syncErrorMessage:'保存後の内容が一致しません'},{maintenanceStopped:()=>true},{mergeSaving:true},{document:{visibilityState:'hidden',addEventListener(){},removeEventListener(){}}}]){const h=setup(props);await h.wake();assert.equal(h.calls.length,0);}});
test('unchanged remote history does not trigger a full download on a healthy connection',async()=>{const h=setup({syncStatus:'synced',syncErrorMessage:null});await h.wake();assert.deepEqual(h.calls,['token']);});

test('focusing a tab with new mobile receipts leaves upload to autosync instead of opening merge',async()=>{
 const h=setup({syncStatus:'synced',syncErrorMessage:null,hasOnlyIndependentPendingChanges:()=>true,fetchLatestOperationLogs:async()=>({logs:[{logId:'other-device-new'}]})});
 await h.wake();assert(!h.calls.some(c=>Array.isArray(c)&&c[0]==='read'));
});

test('tab visibility return is not blocked by a focus check from 10 seconds ago, while rapid back-to-back checks are deduplicated',async()=>{
 const h=setup({syncStatus:'synced',syncErrorMessage:null,fetchLatestOperationLogs:async()=>({logs:[{logId:'other-device-new'}]})});
 h.c.resumeCheckRef.current.last=Date.now()-10000;
 await h.wake();
 assert.equal(h.calls.filter(c=>c==='token').length,0);
 await h.wakeVisible();
 assert.equal(h.calls.filter(c=>c==='token').length,1);
 assert.deepEqual(h.calls.find(c=>Array.isArray(c)&&c[0]==='read'),['read','token','sheet']);
 await h.wakeVisible();
 assert.equal(h.calls.filter(c=>c==='token').length,1);
});

test('idle terminal with existing shared history in baseline still pulls incoming remote updates on tab return',async()=>{
 const {hasOnlyIndependentPendingChanges}=require('../src/utils/threeWaySheetsMerge.ts');
 const h=setup({
  syncStatus:'synced',
  syncErrorMessage:null,
  hasOnlyIndependentPendingChanges,
  syncStateRef:{current:{households:[{id:'H1',name:'山田'}],deletedRecords:[{logId:'known',id:'H1',actionType:'update'}]}},
  currentPageAudit:async()=>[],
  readMergeBaseline:async()=>({
   local:{households:[{id:'H1',name:'山田'}],deletedRecords:[{logId:'known',id:'H1',actionType:'update'}]},
   remote:{deletedRecords:[{logId:'known'}]},
  }),
  fetchLatestOperationLogs:async()=>({logs:[{logId:'remote-new'},{logId:'known'}]}),
 });
 await h.wakeVisible();
 assert.deepEqual(h.calls.find(c=>Array.isArray(c)&&c[0]==='read'),['read','token','sheet']);
});

test('aborted mid-flight resume check does not burn the cooldown window',async()=>{
 let resolveLogs;
 const h=setup({
  syncStatus:'synced',
  syncErrorMessage:null,
  fetchLatestOperationLogs:()=>new Promise(r=>{resolveLogs=r;}),
 });
 await h.wakeVisible();
 h.c.isSyncInProgressRef.current=true;
 resolveLogs({logs:[{logId:'other-device-new'}]});
 await new Promise(setImmediate);
 assert.equal(h.c.resumeCheckRef.current.last,0);
 assert.equal(h.c.resumeCheckRef.current.busy,false);
 h.c.isSyncInProgressRef.current=false;
 h.c.fetchLatestOperationLogs=async()=>({logs:[{logId:'other-device-new'}]});
 await h.wakeVisible();
 assert.deepEqual(h.calls.find(c=>Array.isArray(c)&&c[0]==='read'),['read','token','sheet']);
});
