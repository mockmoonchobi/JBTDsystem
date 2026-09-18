const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),ts=require('typescript'),vm=require('vm');
const source=fs.readFileSync('src/App.tsx','utf8'), ast=ts.createSourceFile('app.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let callback;
function visit(n){if(ts.isCallExpression(n)&&n.expression.getText(ast)==='setActiveTempleId'&&n.arguments[0]&&ts.isArrowFunction(n.arguments[0])&&n.arguments[0].getText(ast).includes('mergeResult.temples'))callback=n.arguments[0].getText(ast);ts.forEachChild(n,visit);}visit(ast);assert(callback);
const select=vm.runInNewContext(ts.transpileModule('('+callback+')',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,{mergeResult:{temples:[{id:'main'},{id:'sub1'},{id:'sub2'}]},mainTemple:{id:'main'}});
test('sync retains the latest sub-temple selection, including a selection made during the read',()=>{assert.equal(select('sub1'),'sub1');assert.equal(select('sub2'),'sub2');});
test('sync preserves all-temples view and initializes an unknown startup selection',()=>{assert.equal(select('ALL'),'ALL');assert.equal(select('temple-main'),'main');});
