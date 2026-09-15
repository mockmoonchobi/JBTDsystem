const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const compile = text => ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
require.extensions['.ts'] = (module, filename) => module._compile(compile(fs.readFileSync(filename, 'utf8')), filename);
require.cache[path.join(root, 'src/lib/googleAuth.ts')] = { exports: { getCurrentUser: () => null, getActiveGoogleAccountName: () => '' } };
const load = p => require(path.join(root,p));
const { buildDeletedTimestampMap } = load('src/utils/deletedRecordsLog.ts');
const { mergeGenericEntityList, mergeDatasetsWithAuditPriority } = load('src/utils/syncMergeUtils.ts');
const { formatGoogleSheetDiffCell, parseGoogleSheetDiffCell } = load('src/utils/diffUtils.ts');
const { isDanmuPriest, filterDanmuPriests, parseDanmuFlag } = load('src/utils/priestColorUtils.ts');
const { partitionTransactionsByFiscalRetention, partitionTransactionsByTempleFiscalRetention, getJapanDateString, getFiscalRetentionKey } = load('src/utils/fiscalYearUtils.ts');
const { exportToSheets, importFromSheets } = load('src/lib/googleSheets.ts');
const { EMPTY_TEMPLE_INFO, EMPTY_MASTER_OPTIONS } = load('src/data/initialData.ts');
const { syncTobaTodosList } = load('src/utils/tobaTodoSync.ts');
const { withUpdateAudit } = load('src/utils/auditUtils.ts');
const temple = { ...EMPTY_TEMPLE_INFO, id:'temple-main', name:'試験寺院', isMain:true, fiscalYearStartMonth:4, fiscalYearStartDay:1 };
const state = () => ({ templeInfo:temple, temples:[temple], households:[], pastRecords:[], memorialServices:[], templeTodos:[], transactions:[], familyMembers:[], priests:[], masterOptions:EMPTY_MASTER_OPTIONS, templeMasterOptionsMap:{}, noticeTemplates:{higan:'',niibon:''}, deletedRecords:[] });
const ast = ts.createSourceFile('App.tsx',fs.readFileSync(path.join(root,'src/App.tsx'),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
function appFunction(name) {
  let text;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) text = ts.isCallExpression(node.initializer) ? node.initializer.arguments[0].getText(ast) : node.initializer.getText(ast);
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) text = node.getText(ast);
    ts.forEachChild(node,visit);
  }
  visit(ast); assert(text, name); return text;
}

test('restored records survive merging and restored services no longer suppress linked todos', () => {
  const time = Date.parse('2026-09-14T12:00:00Z');
  const logs = [
    {id:'S1',entityType:'memorialService',actionType:'delete',deletedTimestamp:time-10000},
    {id:'S1',entityType:'memorialService',actionType:'restore',deletedTimestamp:time},
  ];
  const deleted = buildDeletedTimestampMap(logs);
  assert(!deleted.has('S1'));
  const service = {id:'S1',updatedAt:new Date(time).toISOString(),scheduledDate:'2026/09/20',templeId:temple.id};
  assert.equal(mergeGenericEntityList([service],[],deleted).merged.length,1);
  const local = {...state(), memorialServices:[service], templeTodos:[{id:'TD1',category:'塔婆揮毫',relatedServiceId:'S1',dueDate:'2026/09/20',templeId:temple.id}], deletedRecords:logs};
  const merged = mergeDatasetsWithAuditPriority(local,{...local,totalRecordsCount:2,hasAnyData:true});
  assert.equal(merged.memorialServices.length,1);
  assert.equal(merged.templeTodos.length,1);
  assert(buildDeletedTimestampMap([...logs,{...logs[0],deletedTimestamp:time+10000}]).has('S1'), 'a later deletion must still win');
});

test('history JSON round-trips braces, multiline notes, quotes and old raw JSON', () => {
  for (const notes of ['{旧備考}','文中 {括弧} と }','複数行\n{test}\n末尾','引用 "a" \\ b']) {
    const entry = {actionType:'update',diffs:[{field:'notes',label:'備考',before:notes,after:'変更後'}],beforeData:{id:'H1',notes},afterData:{id:'H1',notes:'変更後'}};
    const {actionType,...expected}=entry;
    assert.deepEqual(parseGoogleSheetDiffCell(formatGoogleSheetDiffCell(entry)),expected);
    assert.deepEqual(parseGoogleSheetDiffCell(JSON.stringify(expected,null,2)),expected);
  }
  assert.deepEqual(parseGoogleSheetDiffCell('説明のみ {不正JSON}'),{});
});

test('Japan midnight, January and non-first-day fiscal starts retain exactly current and prior years', () => {
  const transactions = [{id:'old',date:'2025/04/01'},{id:'prior',date:'2026/04/01'},{id:'new',date:'2027/04/01'},{id:'undated',date:''}];
  const before = partitionTransactionsByFiscalRetention(transactions,temple,new Date('2027-03-31T23:59:59+09:00'));
  const after = partitionTransactionsByFiscalRetention(transactions,temple,new Date('2027-04-01T00:00:00+09:00'));
  assert.equal(before.currentFY,2026); assert.equal(after.currentFY,2027);
  assert.equal(before.archiveTransactions.length,0);
  assert.deepEqual(after.archiveTransactions.map(tx=>tx.id),['old']);
  assert.equal(getJapanDateString(new Date('2027-03-31T15:00:00Z')),'2027-04-01');
  const jan={...temple,id:'jan',isMain:false,fiscalYearStartMonth:1};
  const mixed=[{id:'A',templeId:temple.id,date:'2024/05/01'},{id:'B',templeId:jan.id,date:'2024/05/01'}];
  const result=partitionTransactionsByTempleFiscalRetention(mixed,temple,[temple,jan],new Date('2026-01-01T00:00:00+09:00'));
  assert.deepEqual(result.activeTransactions.map(tx=>tx.id),['A']);
  assert.deepEqual(result.archiveTransactions.map(tx=>tx.id),['B']);
  const july={...temple,fiscalYearStartMonth:7,fiscalYearStartDay:15};
  assert.equal(partitionTransactionsByFiscalRetention([],july,new Date('2027-07-14T23:59:59+09:00')).currentFY,2026);
  assert.equal(partitionTransactionsByFiscalRetention([],july,new Date('2027-07-15T00:00:00+09:00')).currentFY,2027);
});

function workbookMock() {
  const sheets = new Map(), calls=[]; let nextId=1, failWrite=false, failReadTitle='';
  const add=(title,rows=[])=>{const sheet={properties:{title,sheetId:nextId++,gridProperties:{rowCount:1000,columnCount:100}},rows};sheets.set(title,sheet);return sheet;};
  const fetch=async(url,options={})=>{
    const body=options.body ? JSON.parse(options.body) : {};calls.push({url,body});
    const response=(data,status=200)=>new Response(JSON.stringify(data),{status});
    if(url.includes('?fields=')) return response({sheets:[...sheets.values()].map(({properties})=>({properties}))});
    const read=range=>{const match=range.match(/^'((?:[^']|'')+)'/);return sheets.get(match?.[1].replace(/''/g,"'"))?.rows || [];};
    if(url.includes('/values:batchGet')) {
      if(failReadTitle) return response({},400);
      return response({valueRanges:new URL(url).searchParams.getAll('ranges').map(range=>({range,values:read(range)}))});
    }
    if(url.includes('/values/')) {const range=decodeURIComponent(url.split('/values/')[1].split('?')[0]);return range.includes(failReadTitle)&&failReadTitle ? response({},400) : response({values:read(range)});}
    if(failWrite && body.requests?.some(r=>r.updateCells)) return response({error:{message:'simulated atomic rejection'}},400);
    const replies=(body.requests||[]).map(request=>{
      if(request.addSheet){const sheet=add(request.addSheet.properties.title);return {addSheet:{properties:sheet.properties}};}
      if(request.repeatCell?.fields==='userEnteredValue') {const sheet=[...sheets.values()].find(s=>s.properties.sheetId===request.repeatCell.range.sheetId);sheet.rows=[];}
      if(request.updateCells){const write=request.updateCells;const sheet=[...sheets.values()].find(s=>s.properties.sheetId===write.start.sheetId);write.rows.forEach((row,index)=>{sheet.rows[write.start.rowIndex+index]=row.values.map(cell=>{const value=cell.userEnteredValue;return value?.stringValue??value?.numberValue??value?.boolValue??'';});});}
      return {};
    });return response({replies});
  };
  return {sheets,calls,fetch,add,failWrite(value){failWrite=value;},failRead(title){failReadTitle=title;}};
}
const exportState=(data,options={})=>exportToSheets('test-token','test-sheet',data.templeInfo,data.households,data.pastRecords,data.memorialServices,data.transactions,data.masterOptions,data.noticeTemplates,data.templeTodos,data.temples,{priests:data.priests,deletedRecords:data.deletedRecords,...options});

test('memo template migration repairs classification and duplicates without losing edited text',()=>{
  const {normalizeNoticeTemplates,parseNoticeTemplatePaperType}=load('src/utils/noticeTemplateUtils.ts');
  const legacy={id:'tpl-kaku2-memo-default',name:'【角２宛名メモ】標準',type:'postcard',content:'原文',isDefault:true};
  const repaired=normalizeNoticeTemplates([legacy,{...legacy},{...legacy,content:'編集済みの文章'},
    {id:'custom-first',name:'通常のはがき',type:'postcard',content:'本文',isDefault:true}]);
  assert.equal(repaired.length,3);
  assert.deepEqual(repaired.map(t=>t.content),['原文','編集済みの文章','本文']);
  assert.equal(new Set(repaired.map(t=>t.id)).size,3);
  assert(repaired.every(t=>!t.isDefault));
  assert.deepEqual(normalizeNoticeTemplates(repaired),repaired);
  for(const type of ['角２宛名面メモ','角2宛名メモ','kaku2_memo']) assert.equal(parseNoticeTemplatePaperType(type),'kaku2_memo');
  assert.equal(parseNoticeTemplatePaperType('A4用紙'),'a4');
});

test('deleted memo templates stay deleted across reloads, including an empty list',()=>{
  const {saveAllNoticeTemplates,getAllSavedNoticeTemplates}=load('src/utils/memorialCalculator.ts');
  const before=getAllSavedNoticeTemplates();
  try {
    const postcards=[{id:'custom-card',name:'はがき',type:'postcard',content:'本文'}];
    saveAllNoticeTemplates(postcards);
    for(let i=0;i<5;i++) assert.equal(getAllSavedNoticeTemplates().length,1);
    saveAllNoticeTemplates([]);
    assert.deepEqual(getAllSavedNoticeTemplates(),[]);
  }finally{saveAllNoticeTemplates(before);}
});

test('all three paper types survive repeated Sheets and Excel round trips without multiplying',async()=>{
  const {saveAllNoticeTemplates,getAllSavedNoticeTemplates}=load('src/utils/memorialCalculator.ts');
  const originalFetch=global.fetch, originalTemplates=getAllSavedNoticeTemplates();
  const mock=workbookMock();global.fetch=mock.fetch;
  const XLSX=require('xlsx'),{exportToExcel,importFromExcel}=load('src/utils/excelUtils.ts');
  const originalWrite=XLSX.writeFile;
  const templates=[
    {id:'tpl-kaku2-memo-default',name:'【角２宛名面メモ】標準',type:'kaku2_memo',category:'custom',content:'{施主名}様\n重要書類在中'},
    {id:'test-card',name:'はがき文',type:'postcard',category:'custom',content:'はがきの文章'},
    {id:'test-a4',name:'A4文',type:'a4',category:'custom',content:'A4の文章'}];
  try {
    saveAllNoticeTemplates(templates);
    for(let i=0;i<3;i++) {
      await exportState(state());
      assert.equal(mock.sheets.get('案内文テンプレート').rows[1][2],'角２宛名面メモ');
      await importFromSheets('test-token','test-sheet');
      assert.deepEqual(getAllSavedNoticeTemplates().map(t=>[t.id,t.type,t.content,t.isDefault]),templates.map(t=>[t.id,t.type,t.content,false]));
      let workbook;XLSX.writeFile=wb=>{workbook=wb;};
      exportToExcel(temple,[],[],[],[],EMPTY_MASTER_OPTIONS);
      const rows=XLSX.utils.sheet_to_json(workbook.Sheets['案内文テンプレート'],{header:1});
      assert.equal(rows[1][2],'角２宛名面メモ');
      await importFromExcel({arrayBuffer:async()=>XLSX.write(workbook,{type:'buffer',bookType:'xlsx'})});
      assert.deepEqual(getAllSavedNoticeTemplates().map(t=>[t.id,t.type,t.content,t.isDefault]),templates.map(t=>[t.id,t.type,t.content,false]));
    }
  }finally{global.fetch=originalFetch;XLSX.writeFile=originalWrite;saveAllNoticeTemplates(originalTemplates);}
});

test('priest target flags survive Sheets and Excel round trips, including legacy flags', async()=>{
  const originalFetch=global.fetch;const mock=workbookMock();global.fetch=mock.fetch;
  const XLSX=require('xlsx'),{exportToExcel,importFromExcel}=load('src/utils/excelUtils.ts');const originalWrite=XLSX.writeFile;
  const data={...state(),priests:[{id:'P1',name:'対象外僧侶',role:'助法',templeId:temple.id,isDanmu:false,color:'#123456'},{id:'P2',name:'旧設定',role:'助法',templeId:temple.id,isDanmuAssigned:false},{id:'P3',name:'担当僧侶',role:'助法',templeId:temple.id,isDanmu:true}]};
  try {
    await exportState(data);
    const imported=await importFromSheets('test-token','test-sheet');
    assert.deepEqual(imported.priests.map(isDanmuPriest),[false,false,true]);
    assert.deepEqual(filterDanmuPriests(imported.priests).map(p=>p.id),['P3']);
    assert.equal(imported.priests[0].color,'#123456');
    let workbook;XLSX.writeFile=wb=>{workbook=wb;};
    exportToExcel(data.templeInfo,[],[],[],[],data.masterOptions,undefined,[],data.temples,{priests:data.priests});
    assert(workbook);
    const buffer=XLSX.write(workbook,{type:'buffer',bookType:'xlsx'});
    const excel=await importFromExcel({arrayBuffer:async()=>buffer});
    assert.deepEqual(excel.priests.map(isDanmuPriest),[false,false,true]);
    for(const value of ['対象外','非担当','false','0','不可']) assert.equal(parseDanmuFlag(value),false);
  } finally {global.fetch=originalFetch;XLSX.writeFile=originalWrite;}
});

test('fiscal rollover moves records atomically and import detects overdue layout without edits',async()=>{
  const OriginalDate=global.Date,originalFetch=global.fetch,mock=workbookMock();global.fetch=mock.fetch;
  const freeze=iso=>{global.Date=class extends OriginalDate {constructor(...args){super(...(args.length?args:[iso]));}};};
  const data={...state(),transactions:[{id:'TX-OLD',date:'2025/04/01',amount:12345,type:'収入',category:'寄付',templeId:temple.id},{id:'TX-KEEP',date:'2026/04/01',amount:2345,type:'支出',category:'管理費',templeId:temple.id}]};
  try {
    freeze('2027-03-31T14:59:59Z');await exportState(data);
    assert.equal(mock.sheets.get('出納・会計').rows.length,3);
    freeze('2027-03-31T15:00:00Z');
    const overdue=await importFromSheets('test-token','test-sheet');
    assert.equal(overdue.needsFiscalRetentionSync,true);
    const before=JSON.stringify([...mock.sheets].map(([name,sheet])=>[name,sheet.rows]));
    mock.failWrite(true);
    await assert.rejects(exportState(data,{targetTablesOnly:['出納・会計']}));
    assert.equal(JSON.stringify([...mock.sheets].map(([name,sheet])=>[name,sheet.rows])),before);
    mock.failWrite(false);mock.calls.length=0;
    await exportState(data,{targetTablesOnly:['出納・会計']});
    assert.equal(mock.calls.filter(c=>c.body.requests?.some(r=>r.updateCells)).length,1);
    assert.equal(mock.sheets.get('出納・会計').rows[1][0],'TX-KEEP');
    assert.equal(mock.sheets.get('出納アーカイブ').rows[1][0],'TX-OLD');
    const roundtrip=await importFromSheets('test-token','test-sheet');
    assert.equal(roundtrip.needsFiscalRetentionSync,false);
    assert.deepEqual(new Map(roundtrip.transactions.map(t=>[t.id,t.amount])),new Map(data.transactions.map(t=>[t.id,t.amount])));
    mock.failRead('出納アーカイブ');await assert.rejects(importFromSheets('test-token','test-sheet'),/完全に読み取れません/);
  } finally {global.Date=OriginalDate;global.fetch=originalFetch;}
});

test('legacy restoration table names write the requested records rather than only logs',async()=>{
  const original=global.fetch,mock=workbookMock();global.fetch=mock.fetch;
  try {
    const data={...state(),households:[{id:'H1',familyHead:'復元世帯',templeId:temple.id}],memorialServices:[{id:'S1',scheduledDate:'2026/09/20',templeId:temple.id}]};
    await exportState(data,{targetTablesOnly:['檀家・世帯','法要予約','操作・削除履歴']});
    assert.equal(mock.sheets.get('檀家名簿').rows[1][0],'H1');
    assert.equal(mock.sheets.get('法事予約').rows[1][0],'S1');
  }finally{global.fetch=original;}
});

test('history restoration immediately publishes service and linked toba deadline before export',()=>{
  const service={id:'S1',householdId:'H1',scheduledDate:'2026/09/25',scheduledTime:'10:00',tobaCount:1,templeId:temple.id};
  const data={...state(),memorialServices:[service],templeTodos:syncTobaTodosList(service,[])};
  const exported=[];const context={...data,syncStateRef:{current:data},activeTempleId:temple.id,withUpdateAudit,syncTobaTodosList,
    getCurrentOperatorInfo:()=>({}),recordOperationLog(){},recordDeletedRecordsBatch(){},refreshDeletedRecords(){},formatTodoLogDesc:()=>'',saveJsonState(){},
    cleanWriteSpecificTablesToGoogleSheets:async tables=>{exported.push({tables,service:context.syncStateRef.current.memorialServices[0],todo:context.syncStateRef.current.templeTodos[0]});}};
  for(const name of ['Households','PastRecords','Transactions','MemorialServices','TempleTodos']) context['set'+name]=()=>{};
  const entry={id:'S1',entityType:'memorialService',actionType:'update',diffs:[{field:'scheduledDate',label:'法要日',before:'2026/09/20',after:'2026/09/25'}]};
  context.entry=entry;
  vm.runInNewContext(compile(`const updateServiceTodos=${appFunction('updateServiceTodos')}; const restore=${appFunction('handleRestoreFromLog')}; restore(entry);`),context);
  assert.equal(exported[0].service.scheduledDate,'2026/09/20');
  assert.equal(exported[0].todo.dueDate,'2026/09/20');
  assert(exported[0].tables.includes('寺院ToDo'));
});

test('unchanged payload signatures still change at the owning temple fiscal boundary',()=>{
  const OriginalDate=global.Date, payload=state();
  const signature=()=>vm.runInNewContext(compile(appFunction('getSheetsPayload')+'; '+appFunction('computePayloadSignature')+'; computePayloadSignature(payload);'),{payload,getFiscalRetentionKey,Date:global.Date});
  try {
    global.Date=class extends OriginalDate {constructor(...args){super(...(args.length?args:['2027-03-31T14:59:59Z']));}};
    const before=signature();
    global.Date=class extends OriginalDate {constructor(...args){super(...(args.length?args:['2027-03-31T15:00:00Z']));}};
    assert.notEqual(signature(),before);
  }finally{global.Date=OriginalDate;}
});
