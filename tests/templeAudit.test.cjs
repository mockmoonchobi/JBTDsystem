const { test } = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path'), vm = require('vm'), ts = require('typescript');
const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
require.extensions['.ts'] = (m, p) => m._compile(compile(fs.readFileSync(p, 'utf8')), p);
const { templeContentChanged, templeValueKey, stampTempleUpdate } = require('../src/utils/templeAudit.ts');
const { EMPTY_TEMPLE_INFO, EMPTY_MASTER_OPTIONS } = require('../src/data/initialData.ts');
const main = { ...EMPTY_TEMPLE_INFO, id: 'temple-main', isMain: true, name: '本寺', updatedAt: '2026-08-01T00:00:00.000Z' };
const sub = { ...main, id: 'temple-sub-1', isMain: false, name: '兼務寺', createdAt: '2020-01-01T00:00:00.000Z' };
const now = new Date('2026-09-16T18:04:05.000Z');
function getFunction(file, name) {
  const ast = ts.createSourceFile(file, fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let result;
  const visit = n => { if (ts.isVariableDeclaration(n) && n.name.getText(ast) === name) result = n.initializer.getText(ast); ts.forEachChild(n, visit); };
  visit(ast); assert(result, name); return result;
}
test('only business edits stamp a temple; creation fields remain unknown or retain their original values', () => {
  assert.equal(stampTempleUpdate({ ...main, updatedAt: now.toISOString() }, main, now), main);
  const edited = stampTempleUpdate({ ...main, phone: '123', createdAt: now.toISOString() }, main, now);
  assert.equal(edited.updatedAt, now.toISOString()); assert.equal(edited.updatedDate, '2026/09/17'); assert.equal(edited.updatedTime, '03:04:05');
  assert.equal(edited.createdAt, undefined); assert.equal(edited.createdDate, undefined);
  assert.equal(stampTempleUpdate({ ...sub, phone: '123', createdAt: '' }, sub, now).createdAt, sub.createdAt);
  for (const edit of [{ fiscalYearStartMonth: 5 }, { isMain: true }, { bankInfo: '口座' }, { masterOptions: { ...EMPTY_MASTER_OPTIONS, statuses: ['変更'] } }]) {
    assert(templeContentChanged({ ...sub, ...edit }, sub));
  }
});
test('real modal save does not normalize or stamp untouched temples; editing a different temple preserves them', () => {
  for (const change of [false, true]) {
    let saved;
    const masters = { [main.id]: EMPTY_MASTER_OPTIONS, [sub.id]: EMPTY_MASTER_OPTIONS };
    const context = { onSaveConfiguration: undefined, templeContentChanged, templeValueKey, EMPTY_MASTER_OPTIONS,
      initialSnapshotRef: { current: JSON.stringify({ temples: [main, sub], master: masters }) },
      templeList: [main, change ? { ...sub, phone: '123' } : sub], masterStateMap: masters,
      selectedTempleId: sub.id, onSaveTemples: rows => { saved = rows; }, onSaveMasterOptions: undefined, onSavePriests: undefined,
      setShowSaveConfirm() {}, onClose() {}, onSave: undefined };
    vm.runInNewContext(compile(`(${getFunction('components/TempleInfoModal.tsx', 'executeSaveAndClose')})();`), context);
    assert.equal(saved[0], main); assert.equal(saved[0].updatedAt, main.updatedAt);
    if (!change) assert.equal(saved[1], sub);
    else { assert.equal(saved[1].phone, '123'); assert.equal(saved[1].updatedAt, sub.updatedAt, 'timestamps are assigned centrally by the application'); }
  }
});
test('real application save stamps and logs only the changed temple, including fiscal fields', () => {
  for (const change of [false, true]) {
    let saved, writes = 0; const logs = [];
    const context = { stampTempleUpdate, templeContentChanged, syncStateRef: { current: { temples: [main, sub] } },
      activeTempleId: main.id, isFirstSetupAfterEmptyStartupRef: { current: false },
      recordHistory() {}, getCurrentOperatorInfo: () => ({ operator: 'テスト', deviceInfo: 'PC' }),
      recordOperationLog: (...args) => logs.push(args), refreshDeletedRecords() {}, setTemples: rows => { saved = rows; },
      saveJsonState() {}, setActiveTempleId() {}, safeStorage: { setItem() {} }, setTempleInfo() {},
      cleanWriteSpecificTablesToGoogleSheets: () => { writes++; } };
    const save = vm.runInNewContext(compile(`(${getFunction('App.tsx', 'handleSaveTemples')})`), context);
    save([main, change ? { ...sub, fiscalYearStartMonth: 5 } : sub], sub.id);
    assert.equal(saved[0], main); assert.equal(saved[0].createdAt, undefined);
    assert.equal(writes, change ? 1 : 0); assert.equal(logs.length, change ? 1 : 0);
    if (change) { assert.notEqual(saved[1].updatedAt, sub.updatedAt); assert.equal(logs[0][0], sub.id); }
    else assert.equal(saved[1], sub);
  }
});
test('Sheets round trip preserves blank creation/update dates and never rewrites an untouched temple row', async () => {
  require.cache[path.resolve(__dirname, '../src/lib/googleAuth.ts')] = { exports: { getCurrentUser: () => null, getActiveGoogleAccountName: () => '' } };
  const { workbook } = require('./rowSyncFixture.cjs');
  const { exportToSheets, importFromSheets } = require('../src/lib/googleSheets.ts');
  const sim = workbook(), previous = global.fetch; global.fetch = sim.fetch;
  const unknown = { ...main, updatedAt: undefined };
  const publish = temples => exportToSheets('token', 'test-sheet', temples[0], [], [], [], [], EMPTY_MASTER_OPTIONS, undefined, [], temples);
  try {
    await publish([unknown, sub]);
    const table = sim.sheets.get('寺院一覧（本寺・兼務）'), original = structuredClone(table.rows[1]);
    assert.equal(original[table.rows[0].indexOf('作成日時')], ''); assert.equal(original[table.rows[0].indexOf('更新日時')], '');
    const read = await importFromSheets('token', 'test-sheet', { requireCompleteSchema: true, readOnly: true });
    assert.equal(read.temples[0].createdAt, undefined); assert.equal(read.temples[0].updatedAt, undefined);
    await publish([unknown, stampTempleUpdate({ ...sub, phone: '123' }, sub, now)]);
    assert.deepEqual(table.rows[1], original);
    assert.equal(table.rows[2][table.rows[0].indexOf('更新日時')], now.toISOString());
  } finally { global.fetch = previous; }
});


test('sub-temple deletion exports related family and reservation deletions with their audit proof', async () => {
  const { workbook } = require('./rowSyncFixture.cjs');
  const { exportToSheets, exportSpecificTablesToSheets } = require('../src/lib/googleSheets.ts');
  const sim = workbook(), previous = global.fetch; global.fetch = sim.fetch;
  const family = { id: 'F1', householdId: 'H1', name: '家族' };
  const hh = { id: 'H1', familyHead: '世帯', templeId: sub.id, familyMembers: [family] };
  const service = { id: 'S1', householdId: 'H1', templeId: sub.id, scheduledDate: '2026/09/20' };
  const masters = { [main.id]: EMPTY_MASTER_OPTIONS, [sub.id]: EMPTY_MASTER_OPTIONS };
  const state = { templeInfo: main, temples: [main, sub], households: [hh], pastRecords: [], transactions: [],
    memorialServices: [service], templeTodos: [], templeMasterOptionsMap: masters };
  const logs = []; let saving;
  const publish = (s, tables) => (tables ? exportSpecificTablesToSheets : exportToSheets)(
    'token', 'test-sheet', ...(tables ? [tables] : []), s.templeInfo, s.households, s.pastRecords,
    s.memorialServices, s.transactions, EMPTY_MASTER_OPTIONS, undefined, s.templeTodos, s.temples,
    { templeMasterOptionsMap: s.templeMasterOptionsMap, deletedRecords: logs });
  try {
    await publish(state);
    const {removeSubsidiary}=require('../src/utils/removeSubsidiary.ts');
    const plan=removeSubsidiary(state,sub.id);
    logs.push(...[{id:sub.id,entityType:'temple'},...plan.removed].map((item,i)=>({...item,logId:'D'+i,actionType:'batch_delete',deletedTimestamp:1700000000000})));
    const context={syncStateRef:{current:plan.next}};
    await publish(plan.next);
    assert.deepEqual(Object.keys(context.syncStateRef.current.templeMasterOptionsMap), [main.id]);
    for (const title of ['寺院一覧（本寺・兼務）','檀家名簿','家族構成','法事予約']) {
      const rows = sim.sheets.get(title).rows;
      const deletedColumn = rows[0].indexOf('__JBTD削除済');
      assert(deletedColumn >= 0, title + ' tombstone column');
      const row = title === '寺院一覧（本寺・兼務）' ? rows[2] : rows[1];
      assert.equal(String(row[deletedColumn]), '1', title);
    }
    // A subsequent full save must not fail after the deletion proof was already sent.
    await publish(context.syncStateRef.current);
  } finally { global.fetch = previous; }
});


test('partial-save failure exposes the actual reason and releases its write flag', async () => {
  let message, status;
  const context = { useCallback: fn => fn, getAccessToken: async () => 'token',
    safeStorage: { getItem: () => JSON.stringify({ id: 'test-sheet' }) },
    isSyncInProgressRef: { current: false }, isImportingRef: { current: false }, isCleanWritingRef: { current: false },
    writeSafetyRef: { current: { assertCanWrite() {} } }, syncStateRef: { current: {} },
    setSyncStatus: value => { status = value; }, setFiscalSyncTick() {}, setSyncErrorMessage: value => { message = value; },
    safeExportWithAutoRecovery: async () => { throw Error('保存前後の確認に失敗しました（HTTP 429）。'); },
    console: { warn() {} } };
  const save = vm.runInNewContext(compile('('+getFunction('App.tsx','cleanWriteSpecificTablesToGoogleSheets')+')'), context);
  await save(['寺院一覧（本寺・兼務）']);
  assert.equal(status, 'error'); assert.equal(message, '保存前後の確認に失敗しました（HTTP 429）。');
  assert.equal(context.isCleanWritingRef.current, false);
});


test('closing unchanged temple settings does not start master or priest writes during deletion sync', () => {
  const master = { statuses: ['通常'] }, priests = [{ id: 'P1', name: '住職' }];
  const context = { templeValueKey, syncStateRef: { current: { priests, masterOptions: master, templeMasterOptionsMap: { main: master } } },
    recordHistory() { throw Error('unchanged settings started a write'); } };
  const priestsSave = vm.runInNewContext(compile('('+getFunction('App.tsx','handleSavePriests')+')'), context);
  const masterSave = vm.runInNewContext(compile('('+getFunction('App.tsx','handleSaveMasterOptions')+')'), context);
  priestsSave(structuredClone(priests));
  masterSave(structuredClone(master), 'main', { main: structuredClone(master) });
  masterSave(structuredClone(master), 'main'); masterSave(structuredClone(master));
});


test('creating a sub-temple after deletion or beyond ten temples never reuses its ID', () => {
  const { randomUUID } = require('node:crypto');
  const issued = new Set(['temple-sub-0', 'temple-sub-9']);
  const context = { allocateTempleId: require('../src/utils/templePrefixes.ts').allocateTempleId, retainedHouseholds: () => ({}), households: [], crypto: { randomUUID }, templeList: [main], currentTemple: main,
    masterStateMap: {}, masterOptions: EMPTY_MASTER_OPTIONS, EMPTY_MASTER_OPTIONS,
    DEFAULT_ANNUAL_EVENTS: [], PRESET_COLORS: [{ value: 'blue' }],
    setMasterStateMap() {}, setSelectedTempleId() {}, showNotice() {},
    setTempleList: rows => { context.templeList = rows; } };
  const add = vm.runInNewContext(compile('('+getFunction('components/TempleInfoModal.tsx','handleAddNewTemple')+')'), context);
  for (let i = 0; i < 30; i++) {
    add(); const created = context.templeList.at(-1);
    assert.match(created.id, /^temple-sub-K\d+-[0-9a-f-]{36}$/);
    assert(!issued.has(created.id)); issued.add(created.id);
    if (i < 10) context.templeList = [main];
  }
});


test('temple settings save defers every section to the regular autosave', () => {
  for (const changed of [true, false]) {
    const state = { temples: [main], templeMasterOptionsMap: {}, priests: [] };
    const writes = [], flags = [];
    const profiles = changed ? [{ ...main, phone: '123' }] : [main];
    const context = { templeValueKey, syncStateRef: { current: state },
      handleSaveTemples: (rows, id, defer) => { flags.push(defer); state.temples = rows; },
      handleSaveMasterOptions: (options,id,map,defer) => { flags.push(defer); state.templeMasterOptionsMap = map; },
      handleSavePriests: (rows,defer) => { flags.push(defer); state.priests = rows; },
      cleanWriteSpecificTablesToGoogleSheets: tables => writes.push({ tables: [...tables], state: structuredClone(state) }) };
    vm.runInNewContext(compile('('+getFunction('App.tsx','handleSaveTempleConfiguration')+')'), context)(profiles,main.id,EMPTY_MASTER_OPTIONS,{},[]);
    assert.deepEqual(flags,[true,true,true]); assert.equal(writes.length, 0);
    assert.equal(state.temples[0].phone, profiles[0].phone);
  }
});


test('import logs actual added, updated and deleted counts and writes data with its audit once', () => {
 const { importChanges } = require('../src/utils/importAudit.ts');
 const old = { id:'H1', familyHead:'旧名', templeId:main.id }, removed = { id:'H2', familyHead:'削除', templeId:main.id };
 const state = { households:[old,removed], pastRecords:[], transactions:[], memorialServices:[], templeMasterOptionsMap:{} };
 const logs=[],writes=[];
 const context = { importChanges, crypto:require('node:crypto'), syncStateRef:{current:state}, households:state.households, transactions:[], temples:[main], activeTempleId:main.id,
  activeMasterOptions:EMPTY_MASTER_OPTIONS, assertNoDeletedHouseholdReuse(){}, recordHistory(){},
  getCurrentOperatorInfo:()=>({operator:'操作者',deviceInfo:'PC'}), recordOperationLog:(...args)=>logs.push(args), refreshDeletedRecords(){},
  setHouseholds(){},setPastRecords(){},setTransactions(){},setMemorialServices(){},saveJsonState(){},
  handleSaveMasterOptions:(a,b,c,defer)=>assert(defer), cleanWriteSpecificTablesToGoogleSheets:tables=>writes.push({tables,state:context.syncStateRef.current}) };
 const save=vm.runInNewContext(compile('('+getFunction('App.tsx','handleImportExternalSuccess')+')'),context);
 save({households:[{...old,familyHead:'変更'},{id:'H3',familyHead:'追加',templeId:main.id}],pastRecords:[{id:'P1',templeId:main.id}],mode:'replace',targetTempleId:main.id,masterOptions:EMPTY_MASTER_OPTIONS});
 const summary=logs.find(l=>l[0].startsWith('import-'));
 assert(summary[3].includes('名簿：追加1件・更新1件・削除1件'));
 assert(summary[3].includes('過去帳：追加1件・更新0件・削除0件'));
 assert.equal(summary[5],'操作者');assert(logs.some(l=>l[0]==='H2'&&l[2]==='delete'));
 assert.equal(writes.length,1);assert.equal(writes[0].state.households[0].familyHead,'変更');
});

test('subsidiary deletion waits for peer stop and verifies before resuming',async()=>{
 const {removeSubsidiary}=require('../src/utils/removeSubsidiary.ts');
 let remote={templeInfo:main,temples:[main,sub],households:[{id:'H',templeId:sub.id}],transactions:[{id:'T',householdId:'H'}],pastRecords:[{id:'P',householdId:'H'}],templeMasterOptionsMap:{},deletedRecords:[]};
 const events=[],logs=[];
 const client={prepareMerge:async()=>events.push('stop'),confirmMergeStopped:async()=>{events.push('stopped');return true;},markMergeSubmitted:async()=>events.push('submit'),purgeSubsidiary:async(t,id)=>{events.push('write');remote=removeSubsidiary(remote,id).next;},finishMerge:async(t,ok)=>events.push(ok?'resume':'cancel')};
 const c={recordSyncReason(){},isSyncInProgressRef:{current:false},isImportingRef:{current:false},isCleanWritingRef:{current:false},getAccessToken:async()=> 't',safeStorage:{getItem:()=>'{"id":"sheet"}',setItem(){}},currentPageAudit:async()=>logs,setMergeSaving(){},setMergeProgress(){},maintenanceClient:async()=>client,importFromSheets:async()=>{events.push('read');return remote;},getSheetsPayload:v=>v,removeSubsidiary,window:{confirm:()=>true},recordDeletedRecordsBatch:items=>logs.push(...items.map((e,i)=>({...e,logId:'L'+i}))),exportToSheets:async(t,id,info,hh,past,mem,tx,master,notice,todos,temples,opts)=>{events.push('write');remote={templeInfo:info,households:hh,pastRecords:past,transactions:tx,temples,deletedRecords:opts.deletedRecords};},applyRemoteSheetsDataRef:{current:data=>c.syncStateRef.current=data},syncStateRef:{current:remote},acknowledgeSheets:async()=>events.push('ack'),writeSafetyRef:{current:{accept(){}}},lastSyncedSignatureRef:{current:''},computePayloadSignature:JSON.stringify,setSyncStatus(){},setSyncErrorMessage(){},setIsTempleModalOpen(){},setHouseholdReviews(){}};
 await vm.runInNewContext(compile('('+getFunction('App.tsx','handleDeleteSubTemple')+')'),c)(sub.id);
 assert.deepEqual(events,['stop','stopped','read','submit','write','read','ack','resume']);
 assert.equal(remote.transactions.length,0);assert.equal(remote.pastRecords.length,0);assert.equal(c.isCleanWritingRef.current,false);
 assert.throws(()=>removeSubsidiary(remote,main.id),/本寺/);
});
