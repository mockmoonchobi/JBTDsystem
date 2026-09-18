const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),ts=require('typescript');
require.extensions['.ts']=(m,p)=>m._compile(ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,p);
const {changedDuringImport:changed}=require('../src/utils/importChangeGuard.ts');
const before=JSON.stringify({households:[{id:'A',name:'before'}],deletedRecords:[]});
const history=JSON.stringify({households:[{id:'A',name:'before'}],deletedRecords:[{logId:'remote'}]});
test('startup tolerates a shared history refresh but ordinary reads retain the guard',()=>{
 assert.equal(changed(before,history,true,0,0),false);
 assert.equal(changed(before,history,false,0,0),true);
});
test('startup still rejects business edits and new local audit actions',()=>{
 assert.equal(changed(before,history,true,0,1),true);
 assert.equal(changed(before,JSON.stringify({households:[{id:'A',name:'edited'}],deletedRecords:[]}),true,0,0),true);
 assert.equal(changed(before,before,true,0,0),false);
});

test('launcher ignores shared settings refreshed by another tab but protects business edits and local actions',()=>{
 const a=JSON.stringify({households:[{id:'A'}],allNoticeTemplates:[],batchAccountingConfig:null});
 const b=JSON.stringify({households:[{id:'A'}],allNoticeTemplates:[{id:'N'}],batchAccountingConfig:{cat1:'new'}});
 assert.equal(changed(a,b,true,0,0,true),false);
 assert.equal(changed(a,b,true,0,0,false),true);
 assert.equal(changed(a,b,true,0,1,true),true);
 assert.equal(changed(a,b.replace('"A"','"B"'),true,0,0,true),true);
});
test('save timestamps alone do not count as business edits',()=>{
 assert.equal(changed(JSON.stringify({batchAccountingConfig:{cat1:'A',lastSavedAt:'old'}}),JSON.stringify({batchAccountingConfig:{cat1:'A',lastSavedAt:'new'}}),true,0,0),false);
});
