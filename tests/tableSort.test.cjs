const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),ts=require('typescript');
require.extensions['.ts']=(m,p)=>m._compile(ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,p);
require.cache[path.resolve(__dirname,'../src/lib/googleAuth.ts')]={exports:{getCurrentUser:()=>null,getActiveGoogleAccountName:()=>''}};
const {sortTableGrid}=require('../src/utils/tableSort.ts');
test('kana width, date padding, blank dates and stable ties have deterministic ordering',()=>{
 const h=[['ID','所属寺院ID','フリガナ'],['b','K1','ヤマダ'],['a','K1','ｱｵｷ'],['c','K2','あおき']];
 const before=JSON.stringify(h);assert.deepEqual(sortTableGrid('檀家名簿',h).slice(1).map(r=>r[0]),['a','b','c']);assert.equal(JSON.stringify(h),before);
 const d=[['ID','予定日'],['late','2026/10/1'],['blank',''],['early','2026-2-1'],['tie','2026/2/1']];
 assert.deepEqual(sortTableGrid('法事予約',d).slice(1).map(r=>r[0]),['early','tie','late','blank']);
});
test('actual Excel output groups roster, deceased and accounting but merges dates across temples for schedules',()=>{
 const XLSX=require('xlsx'),old=XLSX.writeFile;let wb;XLSX.writeFile=v=>wb=v;
 const {exportToExcel}=require('../src/utils/excelUtils.ts');const {EMPTY_TEMPLE_INFO,EMPTY_MASTER_OPTIONS}=require('../src/data/initialData.ts');
 const temple={...EMPTY_TEMPLE_INFO,id:'K1',isMain:true,name:'試験'};
 const households=[{id:'h2',templeId:'K1',familyHead:'山田',furigana:'ヤマダ',familyMembers:[]},{id:'h1',templeId:'K1',familyHead:'青木',furigana:'アオキ',familyMembers:[]}];
 const records=[{id:'b',templeId:'K2',date:'2020/1/1',deathDate:'2020/1/1',scheduledDate:'2020/1/1',dueDate:'2020/1/1'}, {id:'a',templeId:'K1',date:'2026/2/1',deathDate:'2026/2/1',scheduledDate:'2026/2/1',dueDate:'2026/2/1'}];
 try {exportToExcel(temple,households,records,records,records,EMPTY_MASTER_OPTIONS,undefined,records,[temple,{...temple,id:'K2',name:'兼務試験',isMain:false}]);
 const ids=n=>XLSX.utils.sheet_to_json(wb.Sheets[n],{header:1}).slice(1).map(r=>r[0]);
 assert.deepEqual(ids('檀家名簿'),['h1','h2']);
 for(const n of ['過去帳','出納・会計'])assert.deepEqual(ids(n),['a','b']);
 for(const n of ['法事予約','寺院ToDo'])assert.deepEqual(ids(n),['b','a']);
 assert.equal(households[0].id,'h2');
 }finally{XLSX.writeFile=old;}
});
