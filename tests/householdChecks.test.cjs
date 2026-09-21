const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),ts=require('typescript');
require.extensions['.ts']=(m,p)=>m._compile(ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,p);
require.cache[path.resolve(__dirname,'../src/lib/googleAuth.ts')]={exports:{getCurrentUser:()=>null,getActiveGoogleAccountName:()=>''}};
const {workbook}=require('./rowSyncFixture.cjs');
const {exportToSheets,importFromSheets}=require('../src/lib/googleSheets.ts');
const XLSX=require('xlsx');let captured;XLSX.writeFile=wb=>{captured=wb};
const {exportToExcel,importFromExcel}=require('../src/utils/excelUtils.ts');
const {EMPTY_TEMPLE_INFO,EMPTY_MASTER_OPTIONS}=require('../src/data/initialData.ts');
const {CHECK_HEADERS,CHECK_LABEL_HEADERS,checkedLabels,parseHouseholdCheck}=require('../src/utils/householdChecks.ts');
const {convertTableToData,autoMapColumns,HOUSEHOLD_MAPPING_FIELDS}=require('../src/utils/externalImportUtils.ts');
const temples=[{...EMPTY_TEMPLE_INFO,id:'temple-main',isMain:true,name:'本寺',checkLabel1:'領収済',checkLabel2:'後日郵送',checkLabel3:'連絡必要'},{...EMPTY_TEMPLE_INFO,id:'temple-sub-K1-test',isMain:false,name:'兼務寺',checkLabel1:'案内済',checkLabel2:'',checkLabel3:'確認済'}];
const households=Array.from({length:8},(_,i)=>({id:(i%2?'K1':'DK')+'-0100'+i,templeId:temples[i%2].id,familyHead:'テスト'+i,familyMembers:[],check1:!!(i&1),check2:!!(i&2),check3:!!(i&4)}));
function check(r){for(const h of households){const a=r.households.find(x=>x.id===h.id);assert(a);for(const k of ['check1','check2','check3'])assert.equal(a[k],h[k]);}for(const t of temples){const a=r.temples.find(x=>x.id===t.id);assert(a);for(const k of ['checkLabel1','checkLabel2','checkLabel3'])assert.equal(a[k],t[k]);}}
function strip(rows,names){const indexes=rows[0].map((v,i)=>names.includes(v)?i:-1).filter(i=>i>=0).reverse();for(const r of rows)for(const i of indexes)r.splice(i,1);}
test('configured labels print only when checked; renaming retains slot identity',()=>{
 assert.deepEqual(checkedLabels({check1:true,check2:false,check3:true},temples[0]),['領収済','連絡必要']);
 assert.deepEqual(checkedLabels({check1:true,check2:true},{...temples[1],checkLabel1:'名称変更'}),['名称変更']);
 for(const x of ['FALSE','off','0','＋ off','',null])assert.equal(parseHouseholdCheck(x),false);
 for(const x of [true,1,'TRUE','on','✓ on','✓'])assert.equal(parseHouseholdCheck(x),true);
});
test('Sheets round trip retains all combinations and temple-specific labels',async()=>{
 const mock=workbook(),old=global.fetch;global.fetch=mock.fetch;
 try{let list=households;for(let i=0;i<2;i++){
 await exportToSheets('token','test-sheet',temples[0],list,[],[],[],EMPTY_MASTER_OPTIONS,undefined,[],temples,{deletedRecords:[]});
 const r=await importFromSheets('token','test-sheet',{requireCompleteSchema:true,readOnly:true});check(r);list=r.households;
 }}finally{global.fetch=old;}
});
test('legacy Sheets extend check columns atomically while preserving deleted rows and IDs',async()=>{
 const mock=workbook(),old=global.fetch;global.fetch=mock.fetch;
 const publish=(hs)=>exportToSheets('token','test-sheet',temples[0],hs,[],[],[],EMPTY_MASTER_OPTIONS,undefined,[],temples,{deletedRecords:[]});
 const read=()=>importFromSheets('token','test-sheet',{requireCompleteSchema:true,readOnly:true});
 try{
 await publish(households);
 const hh=mock.sheets.get('檀家名簿');strip(hh.rows,CHECK_HEADERS);
 const tm=mock.sheets.get('寺院一覧（本寺・兼務）');strip(tm.rows,CHECK_LABEL_HEADERS);
 const deleted=[...hh.rows[1]];deleted[0]='DK-09990';const flag=hh.rows[0].indexOf('__JBTD削除済');assert(flag>=0);deleted[flag]='1';hh.rows.push(deleted);
 const legacy=await read();assert(legacy.households.every(h=>h.check1===false&&h.check2===false&&h.check3===false));
 await publish(households);check(await read());
 assert.equal(hh.rows.find(r=>r[0]==='DK-09990')[hh.rows[0].indexOf('__JBTD削除済')],'1');assert.equal(hh.rows.length,10);
 }finally{global.fetch=old;}
});
test('Excel combined/single temple export and legacy import preserve check fields',async()=>{
 const read=()=>importFromExcel({arrayBuffer:async()=>XLSX.write(captured,{type:'buffer',bookType:'xlsx'})});
 exportToExcel(temples[0],households,[],[],[],EMPTY_MASTER_OPTIONS,undefined,[],temples);check(await read());
 for(const name of ['檀家名簿','寺院一覧（本寺・兼務）']){const rows=XLSX.utils.sheet_to_json(captured.Sheets[name],{header:1});strip(rows,[...CHECK_HEADERS,...CHECK_LABEL_HEADERS]);captured.Sheets[name]=XLSX.utils.aoa_to_sheet(rows);}
 const legacy=await read();assert(legacy.households.every(h=>h.check1===false));
 exportToExcel(temples[0],households,[],[],[],EMPTY_MASTER_OPTIONS,undefined,[],temples,{targetTempleId:temples[1].id});
 const single=await read();assert(single.households.every(h=>h.check1===true));assert.equal(single.temples[0].checkLabel1,'案内済');
});
test('wizard imports on/off values and explicitly clears checked values on merge',()=>{
 const headers=['施主名','チェック項目1','チェック項目2','チェック項目3'];const mapping=autoMapColumns(headers,HOUSEHOLD_MAPPING_FIELDS);mapping.familyHead='施主名';
 assert.equal(mapping.check1,'チェック項目1');
 const added=convertTableToData('household',headers,[['テスト','TRUE','FALSE','1']],mapping,{existingHouseholds:[],conflictMode:'append',targetTempleId:'temple-main'}).importedHouseholds[0];assert.equal(added.check1,true);assert.equal(added.check2,false);assert.equal(added.check3,true);
 const result=convertTableToData('household',headers,[['テスト','off','on','0']],mapping,{existingHouseholds:[added],conflictMode:'merge',targetTempleId:'temple-main'});assert.equal(result.importedHouseholds[0].check1,false);
});
