const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),ts=require('typescript');
require.extensions['.ts']=(m,p)=>m._compile(ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,p);
require.cache[path.resolve(__dirname,'../src/lib/googleAuth.ts')]={exports:{getCurrentUser:()=>null,getActiveGoogleAccountName:()=>''}};
const {workbook}=require('./rowSyncFixture.cjs');
const {exportToSheets,importFromSheets}=require('../src/lib/googleSheets.ts');
const XLSX=require('xlsx');let captured;XLSX.writeFile=wb=>{captured=wb};
const {exportToExcel,importFromExcel}=require('../src/utils/excelUtils.ts');
const {EMPTY_TEMPLE_INFO,EMPTY_MASTER_OPTIONS}=require('../src/data/initialData.ts');
const u=require('../src/utils/tobaUtils.ts');
const temple={...EMPTY_TEMPLE_INFO,id:'temple-main',isMain:true,name:'試験寺院',tobaType1:'春供養',tobaType2:'夏供養',tobaType3:'秋供養'};
const types=['塔婆申込１','塔婆申込２','塔婆申込３'];
function households(){return [0,1,2,3].map(mask=>{
 let h={id:'DK-0100'+mask,templeId:temple.id,familyHead:'世帯主'+mask,familyMembers:[{id:'FM-'+mask,name:'施主'+mask,isChiefMourner:true,isSponsor:true}]};
 for(const type of types){h=u.setHouseholdTobaApplication(h,type,Boolean(mask&1),'世帯主の為書き',temple);h=u.setHouseholdSponsorTobaApplication(h,type,Boolean(mask&2),'施主の為書き',temple);}
 return h;
});}
function check(list){for(let mask=0;mask<4;mask++){
 const h=list.find(h=>h.id==='DK-0100'+mask);assert(h);
 for(const type of types){assert.equal(u.getHouseholdTobaApplication(h,type,temple).applied,Boolean(mask&1));assert.equal(u.getHouseholdSponsorTobaApplication(h,type,temple).applied,Boolean(mask&2));assert.equal(u.getHouseholdTobaCount(h,type,temple),(mask&1?1:0)+(mask&2?1:0));assert.equal(u.getHouseholdTobaApplication(h,type,temple).tamegaki,'世帯主の為書き');assert.equal(u.getHouseholdSponsorTobaApplication(h,type,temple).tamegaki,'施主の為書き');}
}}
test('sponsor selection leaves the head independent for all three application types',()=>check(households()));
test('Sheets repeated round trips preserve none, head only, sponsor only and both',async()=>{
 const mock=workbook(),old=global.fetch;global.fetch=mock.fetch;
 try{let list=households();for(let i=0;i<2;i++){
 await exportToSheets('token','test-sheet',temple,list,[],[],[],EMPTY_MASTER_OPTIONS,undefined,[],[temple],{deletedRecords:[]});
 list=(await importFromSheets('token','test-sheet',{requireCompleteSchema:true,readOnly:true})).households;check(list);
 }}finally{global.fetch=old;}
});
test('Excel round trip preserves each applicant independently',async()=>{
 exportToExcel(temple,households(),[],[],[],EMPTY_MASTER_OPTIONS,undefined,[],[temple]);
 const result=await importFromExcel({arrayBuffer:async()=>XLSX.write(captured,{type:'buffer',bookType:'xlsx'})});check(result.households);
});
