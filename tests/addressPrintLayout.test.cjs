const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),ts=require('typescript');
require.extensions['.ts']=(m,p)=>m._compile(ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,p);
const {layoutVerticalAddress:layout}=require('../src/utils/addressPrintLayout.ts');
test('spaces do not force a break; postcard and envelopes use their own available height',()=>{
 const address='東京都千代田区丸の内一丁目一番一号　丸の内ビル三階';
 assert.equal(layout(address,230,18,16).lines.length,1);
 assert.equal(layout(address,105,13,12).lines.length,2);
 assert.equal(layout('東京都港区芝公園　四丁目七番',105,13,12).lines.length,1);
});
test('fitting two-column addresses prefer the street/building space and preserve text',()=>{
 const first='東京都千代田区丸の内一丁目一番一号',second='丸の内ビル三階';
 assert.deepEqual(layout(first+' '+second,105,13,12).lines,[first,second]);
});
test('long unspaced and supplementary Unicode addresses keep every character and fit both columns',()=>{
 const text='𠮷野町葛󠄀飾区長い建物名'.repeat(12),result=layout(text,105,13,12);
 assert.equal(result.lines.join(''),text);assert.equal(result.lines.length,2);
 const {toGraphemes}=require('../src/utils/unicodeUtils.ts');
 for(let i=0;i<2;i++)assert(toGraphemes(result.lines[i]).length*result.sizes[i]*96/72*1.025<=105*96/25.4);
});
test('measurement uses real font extents and keeps long-print measurement costs bounded',()=>{
 assert.equal(layout('住所 建物',105,13,12,()=>999).lines.length,2);
 let count=0;layout('長'.repeat(1000),105,13,12,(s,p)=>{count++;return s.length*p;});assert(count<35);
 assert.deepEqual(layout('　 ',105,13,12).lines,[]);
});
