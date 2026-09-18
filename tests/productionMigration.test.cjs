const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),ts=require('typescript');
require.extensions['.ts']=(m,p)=>m._compile(ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,p);
const {workbook}=require('./rowSyncFixture.cjs');
const {createNewSpreadsheet}=require('../src/lib/googleSheets.ts');
const {saveIncrementalRows,captureRowReadBaseline}=require('../src/utils/rowSyncClient.ts');
test('new production workbook gets a baseline and accepts its first append without prior import',async()=>{
 const m=workbook('fresh-production'),original=global.fetch;
 global.fetch=async(url,opts)=>{
  assert.equal(url,'https://sheets.googleapis.com/v4/spreadsheets');
  const data=JSON.parse(opts.body);for(const sheet of data.sheets)m.add(sheet.properties.title,[]);
  return {ok:true,json:async()=>({spreadsheetId:'fresh-production'})};
 };
 try {assert.equal((await createNewSpreadsheet('token')).id,'fresh-production');}finally{global.fetch=original;}
 assert((await captureRowReadBaseline('fresh-production'))['檀家名簿']);
 const sheets=[...m.sheets.values()].map(({properties:p})=>({sheetId:p.sheetId,title:p.title,...p.gridProperties}));
 await saveIncrementalRows('token','fresh-production',[{range:"'檀家名簿'!A1",values:[['ID','名前'],['DK-00001','新規世帯']]}],sheets,m.fetch);
 assert.equal(m.sheets.get('檀家名簿').rows[1][0],'DK-00001');
 assert.equal(await captureRowReadBaseline('unread-existing'),undefined);
});
