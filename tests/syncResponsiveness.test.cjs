const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),ts=require('typescript');
require.extensions['.ts']=(m,p)=>m._compile(ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,p);
const {createSyncYield}=require('../src/utils/syncResponsiveness.ts');
test('large conversion yields to UI without skipping or reordering rows',async()=>{
 let time=0,pauses=0;const yieldUI=createSyncYield(()=>time,async()=>{pauses++;time+=1;});const rows=[];
 for(let i=0;i<20000;i++){if(i%128===0){const p=yieldUI();if(p)await p;}rows.push(i);time+=0.05;}
 assert(pauses>50);assert.equal(rows.length,20000);assert(rows.every((v,i)=>v===i));
});
test('small conversion does not introduce artificial waits',()=>{let pauses=0;const yieldUI=createSyncYield(()=>0,async()=>{pauses++;});for(let i=0;i<100;i++)assert.equal(yieldUI(),undefined);assert.equal(pauses,0);});
