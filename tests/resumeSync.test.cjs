const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),ts=require('typescript'),vm=require('vm');
const ast=ts.createSourceFile('app.tsx',fs.readFileSync('src/App.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let effect;
function visit(n){if(ts.isCallExpression(n)&&n.expression.getText(ast)==='useEffect'&&n.arguments[0]?.getText(ast).includes('const resumeVisibleSync'))effect=n.arguments[0].getText(ast);ts.forEachChild(n,visit);}visit(ast);assert(effect);
const code=ts.transpileModule('('+effect+')()',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
function setup(overrides={}){
 const listeners={},calls=[];
 const events={addEventListener:(name,fn)=>listeners[name]=fn,removeEventListener:name=>delete listeners[name]};
 const c={writeSafetyRef:{current:{canWrite:()=>true}},hasOnlyIndependentPendingChanges:()=>false,getSheetsPayload:v=>v,syncStateRef:{current:{}},currentPageAudit:async()=>[],document:{...events,visibilityState:'visible'},window:events,navigator:{onLine:true},isStartupLauncherOpenRef:{current:false},dataLinkOpenRef:{current:false},mergeRequest:null,mergeSaving:false,maintenanceStopped:()=>false,manualSyncInProgressRef:{current:false},isSyncInProgressRef:{current:false},isCleanWritingRef:{current:false},isImportingRef:{current:false},resumeCheckRef:{current:{busy:false,last:0}},syncStatus:'error',syncErrorMessage:'通信タイムアウト',loadJsonState:()=>({id:'sheet'}),getAccessToken:async()=>{calls.push('token');return 'token';},fetchLatestOperationLogs:async()=>({logs:[{logId:'known'}]}),readMergeBaseline:async()=>({remote:{deletedRecords:[{logId:'known'}]}}),syncWithGoogleDriveRef:{current:async(...args)=>calls.push(['read',...args])},setSyncStatus:s=>calls.push(['status',s]),setSyncErrorMessage:m=>calls.push(['message',m]),clearCachedAccessToken:()=>calls.push('clear'),isAuthError:e=>e.status===401,...overrides};
 const dispose=vm.runInNewContext(code,c);
 return {c,calls,dispose,wake:async()=>{listeners.focus();await new Promise(setImmediate);}};
}
test('returning with valid authorization resumes with a normal pull, never a clean reset',async()=>{const h=setup();await h.wake();assert.deepEqual(h.calls.find(c=>Array.isArray(c)&&c[0]==='read'),['read','token','sheet']);await h.wake();assert.equal(h.calls.filter(c=>c==='token').length,1);});
test('expired or absent token requests a click instead of opening login or reading data',async()=>{for(const missing of [true,false]){const h=setup(missing?{getAccessToken:async()=>null}:{fetchLatestOperationLogs:async()=>{throw {status:401};}});await h.wake();assert(!h.calls.some(c=>Array.isArray(c)&&c[0]==='read'));assert(h.calls.some(c=>Array.isArray(c)&&c[0]==='message'&&c[1].includes('再接続')));}});
test('uncertain save, maintenance, hidden page and review never resume automatically',async()=>{for(const props of [{syncErrorMessage:'保存後の内容が一致しません'},{maintenanceStopped:()=>true},{mergeSaving:true},{document:{visibilityState:'hidden',addEventListener(){},removeEventListener(){}}}]){const h=setup(props);await h.wake();assert.equal(h.calls.length,0);}});
test('unchanged remote history does not trigger a full download on a healthy connection',async()=>{const h=setup({syncStatus:'synced',syncErrorMessage:null});await h.wake();assert.deepEqual(h.calls,['token']);});

test('focusing a tab with new mobile receipts leaves upload to autosync instead of opening merge',async()=>{
 const h=setup({syncStatus:'synced',syncErrorMessage:null,hasOnlyIndependentPendingChanges:()=>true,fetchLatestOperationLogs:async()=>({logs:[{logId:'other-device-new'}]})});
 await h.wake();assert(!h.calls.some(c=>Array.isArray(c)&&c[0]==='read'));
});
