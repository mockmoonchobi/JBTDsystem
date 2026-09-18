const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
require.extensions['.ts']=(m,p)=>m._compile(ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,p);
const {compareTransactionsChronological:compare}=require('../src/utils/fiscalYearUtils.ts');
test('accounting order is date then creation time, with ID only for identical times',()=>{
 const rows=[{id:'A',date:'2026/09/17',createdTime:'15:00',receiptNumber:'1'}, {id:'Z',date:'2026/09/17',createdTime:'9:05:10',receiptNumber:'99'}, {id:'B',date:'2026/09/17',createdTime:'09:05:10'}, {id:'Y',date:'2026/09/16',createdTime:'23:59:59'}];
 assert.deepEqual([...rows].sort(compare).map(r=>r.id),['Y','B','Z','A']);
 assert.deepEqual([...rows].sort((a,b)=>compare(b,a)).map(r=>r.id),['A','Z','B','Y']);
});
