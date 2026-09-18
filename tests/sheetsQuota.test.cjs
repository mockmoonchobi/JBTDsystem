const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),ts=require('typescript');
require.extensions['.ts']=(m,p)=>m._compile(ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,p);
const {createSheetsQuota}=require('../src/utils/sheetsQuota.ts');
function setup(){let now=100000;const data=new Map(),waits=[];const env={now:()=>now,sleep:async ms=>{waits.push(ms);now+=ms;},read:k=>structuredClone(data.get(k)),write:(k,v)=>data.set(k,structuredClone(v)),exclusive:async(k,f)=>f()};return {a:createSheetsQuota(env),b:createSheetsQuota(env),waits};}
test('separate windows share a rolling read budget; a write has an independent budget',async()=>{
 const {a,b,waits}=setup();for(let i=0;i<45;i++)await (i%2?a:b).acquire('GET');
 await b.acquire('POST');assert.deepEqual(waits,[]);
 await b.acquire('GET');assert.deepEqual(waits,[60000]);
 await a.acquire('GET');assert.equal(waits.length,1);
});
test('429 cooldown is shared and respects Retry-After without resending the failed request',async()=>{
 const {a,b,waits}=setup();await a.limited('GET','90');await b.acquire('GET');assert.deepEqual(waits,[90000]);
 await b.limited('GET','invalid');await a.acquire('GET');assert.deepEqual(waits,[90000,60000]);
});
