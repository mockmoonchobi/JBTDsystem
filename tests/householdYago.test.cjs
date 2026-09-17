const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
require.extensions['.ts']=(m,p)=>m._compile(ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,p);
require.cache[path.resolve(__dirname,'../src/lib/googleAuth.ts')]={exports:{getCurrentUser:()=>null,getActiveGoogleAccountName:()=>''}};
const {showYagoInList}=require('../src/utils/householdYago.ts');
const {convertTableToData,autoMapColumns,HOUSEHOLD_MAPPING_FIELDS,COMBINED_MAPPING_FIELDS}=require('../src/utils/externalImportUtils.ts');
const XLSX=require('xlsx');let captured;XLSX.writeFile=wb=>{captured=wb};
const {exportToExcel,importFromExcel}=require('../src/utils/excelUtils.ts');
const {EMPTY_TEMPLE_INFO,EMPTY_MASTER_OPTIONS}=require('../src/data/initialData.ts');
test('list default follows registered yago and preserves explicit preferences',()=>{
 assert.equal(showYagoInList([{yago:'  '}]),false);assert.equal(showYagoInList([{yago:'山屋'}]),true);
 assert.equal(showYagoInList([{yago:'山屋'}],false),false);assert.equal(showYagoInList([],true),true);
});
test('wizard detects and imports optional yago without a separate reading field',()=>{
 for(const fields of [HOUSEHOLD_MAPPING_FIELDS,COMBINED_MAPPING_FIELDS]){
  assert.equal(autoMapColumns(['屋号'],fields).yago,'屋号');assert(!fields.some(f=>/yago.*(kana|reading)/i.test(f.key)));
 }
 const r=convertTableToData('household',['施主名','屋号'],[['試験太郎',' 山屋 ']],{familyHead:'施主名',yago:'屋号'},{existingHouseholds:[],conflictMode:'append',targetTempleId:'temple-main'});
 assert.equal(r.importedHouseholds[0].yago,'山屋');
});
test('Excel preserves yago and reads legacy workbooks without the new column',async()=>{
 const temple={...EMPTY_TEMPLE_INFO,id:'temple-main',isMain:true,name:'試験寺院'};
 exportToExcel(temple,[{id:'DK-01001',familyHead:'試験太郎',yago:'山屋',templeId:temple.id,familyMembers:[]}],[],[],[],EMPTY_MASTER_OPTIONS,undefined,[],[temple]);
 const read=()=>importFromExcel({arrayBuffer:async()=>XLSX.write(captured,{type:'buffer',bookType:'xlsx'})});
 assert.equal((await read()).households.find(h=>h.id==='DK-01001').yago,'山屋');
 const rows=XLSX.utils.sheet_to_json(captured.Sheets['檀家名簿'],{header:1});const idx=rows[0].indexOf('屋号');assert(idx>=0);
 rows.forEach(row=>row.splice(idx,1));captured.Sheets['檀家名簿']=XLSX.utils.aoa_to_sheet(rows);
 assert.equal((await read()).households.find(h=>h.id==='DK-01001').yago,'');
});
