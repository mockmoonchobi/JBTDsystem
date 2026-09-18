const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript');
const root = path.resolve(__dirname, '..');
const compile = text => ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
require.extensions['.ts'] = (module, filename) => module._compile(compile(fs.readFileSync(filename, 'utf8')), filename);
require.cache[path.join(root, 'src/lib/googleAuth.ts')] = { exports: { getCurrentUser: () => null, getActiveGoogleAccountName: () => '' } };
const { workbook: rowWorkbook, memory: rowMemory } = require('./rowSyncFixture.cjs');
const { readAllSheetData, SheetsWriteSafety } = require('../src/utils/sheetsReadSafety.ts');
const { stableMergeValue, verifyMergedReadback } = require('../src/utils/threeWaySheetsMerge.ts');
const sheet = (title, rowCount) => ({ properties: { title, gridProperties: { rowCount, columnCount: 100 } } });

test('second page failure rejects the whole import instead of returning 1999 records', async () => {
  let calls = 0;
  await assert.rejects(readAllSheetData([sheet('過去帳', 40001)], async ranges => {
    if (++calls === 2) throw Error('network failure');
    return ranges.map(range => ({ range, values: [['ID'], ...Array.from({ length: 1999 }, (_, i) => ['P' + i])] }));
  }), /network failure/);
  assert.equal(calls, 2);
});

test('empty or short intermediate pages do not truncate later records', async () => {
  for (const first of [[['ID'], ['P1']], [['ID']]]) {
    let calls = 0;
    const data = await readAllSheetData([sheet('過去帳', 6001)], async ranges => {
      calls++;
      return ranges.map(range => ({range, values: range.includes('!A1:') ? first : range.includes('!A6001:') ? [['P6001']] : []}));
    });
    assert.equal(calls, 1);
    assert.equal(data.get('過去帳').rows.at(-1)[0], 'P6001');
  }
});

test('missing batch ranges and malformed successful responses are errors, not empty tables', async () => {
  await assert.rejects(readAllSheetData([sheet('過去帳', 100), sheet('出納・会計', 100)], async () => [{ range: "'過去帳'!A1:B100" }]));
  for (const value of [{}, { range: 'x', values: {} }, { range: 'x', values: ['broken row'] }]) {
    await assert.rejects(readAllSheetData([sheet('過去帳', 100)], async () => [value]));
  }
});

test('a failed read blocks writes across retries and destinations until explicit acceptance', () => {
  const gate = new SheetsWriteSafety();
  assert.throws(() => gate.assertCanWrite('A'));
  gate.accept('A', 'complete');
  assert(gate.canWrite('A')); assert(!gate.canWrite('B'));
  assert(!gate.hasPending('complete')); assert(gate.hasPending('edited'));
  gate.block(); assert.throws(() => gate.assertCanWrite('A'));
  assert(!new SheetsWriteSafety().canWrite('A'), 'permission never survives a new app session');
  gate.accept('B', 'new snapshot'); assert(gate.canWrite('B')); assert(!gate.canWrite('A'));
});

const ast = ts.createSourceFile('App.tsx', fs.readFileSync(path.join(root, 'src/App.tsx'), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function fn(name) {
  let source;
  const visit = n => {
    if (ts.isVariableDeclaration(n) && n.name.getText(ast) === name) source = ts.isCallExpression(n.initializer) ? n.initializer.arguments[0].getText(ast) : n.initializer.getText(ast);
    if (ts.isFunctionDeclaration(n) && n.name?.text === name) source = n.getText(ast);
    ts.forEachChild(n, visit);
  };
  visit(ast); assert(source, name); return source;
}
test('ordinary save failures never escalate into a workbook merge', () => {
  let expression;
  const visit = n => {
    if (ts.isBinaryExpression(n) && n.left.getText(ast) === 'openConflictReview') expression = n.right.getText(ast);
    ts.forEachChild(n, visit);
  };
  visit(ast); assert(expression);
  const route = message => vm.runInNewContext(compile(expression), { receiptSave: false, err: { message } });
  for (const message of ['削除操作の裏付けがないデータ減少を検出しました: 出納・会計 / TX-1', '削除済みIDの再登録を検出しました', '他の操作による変更']) assert.equal(route(message), false);
  for (const message of ['HTTP 429', 'タイムアウト', '保存後の内容が一致しません', '']) assert.equal(route(message), false);
});

function harness() {
  const data = { templeInfo: { name: '試験寺院' }, temples: [], households: [{ id: 'H1' }], pastRecords: [{ id: 'P1' }], transactions: [{ id: 'T1', amount: 1000 }], deletedRecords: [], memorialServices: [], templeTodos: [], masterOptions: {}, templeMasterOptionsMap: {}, priests: [], noticeTemplates: { higan: '', niibon: '' }, batchAccountingData: null, disasterEvents: [] };
  const statuses = [], queuedAudit = [], gate = new SheetsWriteSafety();
  let auditRevision = 0;
  const context = { directorySaveTables:require('../src/utils/directorySaveScope.ts').directorySaveTables, recordSyncReason() {}, hasOnlyIndependentPendingChanges: require('../src/utils/threeWaySheetsMerge.ts').hasOnlyIndependentPendingChanges, receiptOperations: require('../src/utils/receiptOutbox.ts').receiptOperations, autoSyncDueRef: {current:null}, maintenanceStopped: () => false,
    queueAudit: entries => { if (entries.length) auditRevision++; queuedAudit.push(...entries); }, pendingAudit: async () => queuedAudit, currentPageAudit: async () => queuedAudit,
    retainedHouseholds: () => ({}), setHouseholdReviews() {},
    getAllSavedNoticeTemplates: () => [], getSavedBatchAccountingConfig: () => null,
    planSheetsMerge: require('../src/utils/threeWaySheetsMerge.ts').planSheetsMerge, alert() {}, describeAccountingMismatch: require('../src/utils/threeWaySheetsMerge.ts').describeAccountingMismatch, stableMergeValue, verifyMergedReadback, crypto: require('node:crypto'),
    MAX_DELETED_LOG_LENGTH: 1000, getActiveGoogleAccountName: () => 'テスト操作者',
    setMergeProgress() {}, setMergeSaving() {}, isAuthError: e => e?.status === 401, clearCachedAccessToken() {},
    readMergeBaseline: async () => ({ version: 1, sheetId: 'sheet', local: data, remote: data }),
    acknowledgeSheets: async () => {}, idbGet: async () => null, draftKey: id => id,
    restoreMergeChoices: async draft => draft, saveMergeDraft: async () => {}, backupMergeAttempt: async () => {},
    askMerge: async () => null, mergeDraftRef: { current: null },
    syncStateRef: { current: structuredClone(data) }, writeSafetyRef: { current: gate },
    isSyncInProgressRef: { current: false }, isCleanWritingRef: { current: false }, isImportingRef: { current: false },
    isStartupLauncherOpenRef: { current: false }, getLocalAuditRevision: () => auditRevision, changedDuringImport: require('../src/utils/importChangeGuard.ts').changedDuringImport, withoutSharedHistory: require('../src/utils/importChangeGuard.ts').withoutSharedHistory, hasLocalAuditChanges: () => false,
    lastSyncedSignatureRef: { current: '' }, loadDeletedRecordsLog: () => context.syncStateRef.current.deletedRecords,
    safeStorage: { getItem: () => '{"id":"sheet"}', setItem() {} }, saveJsonState() {},
    setSyncStatus: value => statuses.push(value), setSyncErrorMessage() {}, setLastSyncTime() {}, setSyncCompletion() {}, setIsInitialLoaded() {},
    safeImportWithAutoRecovery: async () => ({ data: { ...structuredClone(data), totalRecordsCount: 3 }, sheet: { id: 'sheet' } }),
    applyRemoteSheetsDataRef: { current: remote => { context.syncStateRef.current = remote; } },
    exportToSheets() { throw Error('read-only sync attempted a write'); },
  };
  vm.runInNewContext(compile(`${fn('getSheetsPayload')}; ${fn('computePayloadSignature')}; const read = ${fn('syncWithGoogleDrive')}; globalThis.read = read; globalThis.payload = getSheetsPayload;`), { ...context, getFiscalRetentionKey: () => '', globalThis: context });
  return { context, gate, statuses, data };
}

test('background sync uses the remote records even against newer local records, with no write-back', async () => {
  const { context, gate, statuses, data } = harness();
  gate.accept('sheet', JSON.stringify(context.payload(context.syncStateRef.current)));
  context.safeImportWithAutoRecovery = async () => ({ data, sheet: { id: 'sheet' } });
  // The function closure uses the original mock: alter the remote application to test empty collections.
  context.applyRemoteSheetsDataRef.current = remote => { context.syncStateRef.current = { ...remote, transactions: [], priests: [], noticeTemplates: { higan: '', niibon: '' } }; };
  await context.read('token', 'sheet');
  assert.equal(context.syncStateRef.current.transactions.length, 0);
  assert(gate.canWrite('sheet')); assert.equal(statuses.at(-1), 'synced');
  assert(!gate.hasPending(JSON.stringify(context.payload(context.syncStateRef.current))));
});

test('remote household deletion applies silently on an idle device without a write-back', async () => {
  const { context, gate, statuses, data } = harness();
  gate.accept('sheet', JSON.stringify(context.payload(context.syncStateRef.current)));
  const remote = { ...structuredClone(data), households: [] };
  const env = { ...context, getSheetsPayload: context.payload, computePayloadSignature: JSON.stringify,
    retainedHouseholds: () => ({ H1: { name: '削除された檀家', deleted: true } }),
    alert: () => { throw Error('ordinary deletion must not show a popup'); },
    safeImportWithAutoRecovery: async () => ({ data: remote, sheet: { id: 'sheet' } }),
  };
  const read = vm.runInNewContext(compile(`(${fn('syncWithGoogleDrive')})`), env);
  await read('token', 'sheet');
  assert.equal(context.syncStateRef.current.households.length, 0);
  assert.equal(context.syncStateRef.current.transactions.length, 1);
  assert.equal(statuses.at(-1), 'synced');
  assert(gate.canWrite('sheet'));
});

test('read failure preserves device data and keeps every ordinary write blocked', async () => {
  const { context, gate, statuses } = harness();
  const original = structuredClone(context.syncStateRef.current);
  // Recompile with a failed transport, retaining the same safety and device references.
  const failed = { ...context, safeImportWithAutoRecovery: async () => { throw Error('second page failed'); }, getSheetsPayload: context.payload };
  const read = vm.runInNewContext(compile(`(${fn('syncWithGoogleDrive')})`), failed);
  await assert.rejects(read('token', 'sheet', true), /second page failed/);
  assert.deepEqual(context.syncStateRef.current, original);
  assert(!gate.canWrite('sheet')); assert.equal(statuses.at(-1), 'error');
});

test('the export wrapper blocks writes after a failure and never redirects to a different sheet', async () => {
  const gate = new SheetsWriteSafety(); let writes = 0;
  const write = vm.runInNewContext(compile(`(${fn('safeExportWithAutoRecovery')})`), { writeSafetyRef: { current: gate } });
  await assert.rejects(write('token', 'sheet', async () => { writes++; })); assert.equal(writes, 0);
  gate.accept('sheet', 'ok');
  await assert.rejects(write('token', 'sheet', async () => { writes++; throw Error('404'); }));
  await assert.rejects(write('token', 'sheet', async () => { writes++; })); assert.equal(writes, 1);
});

function mergeHarness() {
  const { context, gate, data } = harness();
  let remote = structuredClone(data), saved = null, acknowledgements = 0, writes = 0, reviews = 0;
  context.syncStateRef.current.transactions[0].amount = 2000;
  const { planSheetsMerge } = require('../src/utils/threeWaySheetsMerge.ts');
  const env = { ...context, getSheetsPayload: context.payload, computePayloadSignature: JSON.stringify,
    getActiveGoogleAccountName: () => '操作者', MAX_DELETED_LOG_LENGTH: 1000,
    safeImportWithAutoRecovery: async () => ({ data: structuredClone(remote), sheet: { id: 'sheet' } }),
    importFromSheets: async () => structuredClone(remote),
    idbGet: async () => saved,
    saveMergeDraft: async draft => { saved = structuredClone(draft); },
    backupMergeAttempt: async () => {},
    acknowledgeSheets: async () => { acknowledgements++; },
    askMerge: async draft => {
      reviews++;
      const p = planSheetsMerge(draft.base, draft.local, draft.remote);
      const choices = Object.fromEntries(p.conflicts.map(c => [c.key, { side: 'local', fingerprint: c.fingerprint }]));
      return planSheetsMerge(draft.base, draft.local, draft.remote, choices).merged;
    },
    exportToSheets: async (...args) => {
      writes++;
      remote = { templeInfo: args[2], households: args[3], pastRecords: args[4], memorialServices: args[5], transactions: args[6], masterOptions: args[7], noticeTemplates: args[8], templeTodos: args[9], temples: args[10], ...args[11] };
      for(const key of args[11].deletedRecordIds || []) { const [kind,...parts]=key.split(':');const table={transaction:'transactions',household:'households',pastRecord:'pastRecords'}[kind];if(table)remote[table]=remote[table].filter(r=>r.id!==parts.join(':')); }
      delete remote.deletedRecordIds;
      delete remote.onProgress; // Progress callbacks are transport options, not sheet data.
    },
  };
  return { env, gate, context, run: () => vm.runInNewContext(compile(`(${fn('syncWithGoogleDrive')})`), env)('token', 'sheet'),
    get remote() { return remote; }, get saved() { return saved; }, get writes() { return writes; }, get reviews() { return reviews; }, get acknowledgements() { return acknowledgements; } };
}

test('a successful read followed by the real auto-save effect never echoes the downloaded data', async () => {
  const { context } = harness();
  await context.read('token', 'sheet');
  let effect;
  const visit = n => {
    if (ts.isCallExpression(n) && n.expression.getText(ast) === 'useEffect' && n.arguments[0]?.getText(ast).includes('const performAutoSync')) effect = n.arguments[0].getText(ast);
    ts.forEachChild(n, visit);
  };
  visit(ast);
  const timers = [], writes = [];
  const auto = { ...context, ...context.syncStateRef.current, isInitialLoaded: true,
    getAccessToken: async () => 'token', getSavedBatchAccountingData: () => null, getSavedDisasterMemorialEvents: () => [],
    getFiscalRetentionKey: () => '', getSheetsPayload: context.payload,
    directorySaveTables:()=>undefined,safeExportWithAutoRecovery: async (...args) => writes.push(args),
    setTimeout: callback => { timers.push(callback); return timers.length; }, clearTimeout() {}, console,
  };
  vm.runInNewContext(compile(`${fn('computePayloadSignature')}; (${effect})();`), auto);
  for (const timer of timers) timer();
  await new Promise(setImmediate);
  assert.equal(writes.length, 0);
});

function importMock() {
  const tables = new Map([
    ['寺院一覧（本寺・兼務）', [['寺院ID', '寺院名'], ['temple-main', '試験寺院']]],
    ['檀家名簿', [['ID', '世帯主名']]],
    ['過去帳', [['ID', '命日'], ...Array.from({ length: 4500 }, (_, i) => ['P' + i, '2000/01/01'])]],
    ['出納・会計', [['伝票ID', '日付', '金額', '勘定科目'], ['T1', '2026/09/01', '1000', '寄付']]],
  ]);
  let fail = '', omit = false;
  const calls = [];
  return { tables, calls, fail: text => { fail = text; }, omit: () => { omit = true; }, fetch: async (url, options = {}) => {
    calls.push(url); assert(!options.method || options.method === 'GET', 'reader must not make mutations');
    if (!url.includes('/values:batchGet')) return new Response(JSON.stringify({ sheets: [...tables].map(([title, rows]) => sheet(title, Math.max(100, rows.length))) }));
    const ranges = new URL(url).searchParams.getAll('ranges');
    if (fail && ranges.some(range => range.includes(fail))) return new Response('{}', { status: 400 });
    const valueRanges = ranges.map(range => {
      const title = range.match(/^'((?:[^']|'')+)'/)[1].replace(/''/g, "'");
      const bounds = range.match(/!A(\d+):ZZ(\d+)/);
      return { range, values: bounds ? tables.get(title).slice(Number(bounds[1]) - 1, Number(bounds[2])) : tables.get(title) };
    });
    return new Response(JSON.stringify({ valueRanges: omit ? valueRanges.slice(0, -1) : valueRanges }));
  } };
}

test('real importer reads 4500 records and accounting; a failed later page never returns a partial dataset', async () => {
  const { importFromSheets } = require('../src/lib/googleSheets.ts');
  const mock = importMock(), original = global.fetch; global.fetch = mock.fetch;
  try {
    const imported = await importFromSheets('token', 'sheet', { requireCompleteSchema: true });
    assert.equal(imported.pastRecords.length, 4500); assert.equal(imported.transactions.length, 1);
    mock.fail('A2001');
    await assert.rejects(importFromSheets('token', 'sheet', { requireCompleteSchema: true }), /完全に読み取れません/);
    mock.fail('出納・会計');
    await assert.rejects(importFromSheets('token', 'sheet', { requireCompleteSchema: true }), /完全に読み取れません/);
  } finally { global.fetch = original; }
});

test('real importer rejects missing mandatory tables and missing batch results', async () => {
  const { importFromSheets } = require('../src/lib/googleSheets.ts');
  const mock = importMock(), original = global.fetch; global.fetch = mock.fetch;
  try {
    mock.tables.delete('出納・会計');
    await assert.rejects(importFromSheets('token', 'sheet', { requireCompleteSchema: true }), /必須シート/);
    mock.omit();
    await assert.rejects(importFromSheets('token', 'sheet', { requireCompleteSchema: true }), /完全に読み取れません/);
  } finally { global.fetch = original; }
});
test('explicit reset read clears uncertain writes only after the entire required dataset was read',async()=>{
 const {importFromSheets}=require('../src/lib/googleSheets.ts');const mock=importMock(),old=global.fetch;global.fetch=mock.fetch;
 const pending={before:{'過去帳':[['ID'],['BEFORE']]},expected:{'過去帳':[['ID'],['EXPECTED']]}};
 rowMemory.set('row-sync-pending-v1:reset-test',structuredClone(pending));
 try{
   await assert.rejects(importFromSheets('token','reset-test',{requireCompleteSchema:true,readOnly:true}),/確定できません/);
   mock.fail('A2001');
   await assert.rejects(importFromSheets('token','reset-test',{requireCompleteSchema:true,readOnly:true,discardPendingLocalChanges:true}));
   assert.deepEqual(rowMemory.get('row-sync-pending-v1:reset-test'),pending);
   mock.fail('');
   const data=await importFromSheets('token','reset-test',{requireCompleteSchema:true,readOnly:true,discardPendingLocalChanges:true});
   assert.equal(data.pastRecords.length,4500);assert.equal(rowMemory.get('row-sync-pending-v1:reset-test'),null);
 }finally{global.fetch=old;}
});
test('only the explicit reset handler opts into discarding an uncertain row save',async()=>{
 const calls=[];const context={syncWithGoogleDrive:async(...args)=>{calls.push(args);return {success:true};},clearHistory(){},setSelectedIdsForPrint(){},setExcludedHouseholdIds(){}};
 await vm.runInNewContext(compile(`(${fn('handleResetAndCleanImportFromSheets')})('token','sheet');`),context);
 assert.deepEqual(calls[0],['token','sheet',true,false,true]);
 assert(fn('syncWithGoogleDrive').includes('discardPendingLocalChanges = false'));
});

test('comparison reads return templates without persisting them into the device', async () => {
  const { importFromSheets } = require('../src/lib/googleSheets.ts');
  const storage = require('../src/utils/storageUtils.ts');
  const mock = importMock(), originalFetch = global.fetch, originalSave = storage.saveJsonState;
  const saves = [];
  storage.saveJsonState = (...args) => saves.push(args);
  mock.tables.set('案内文テンプレート', [['テンプレートID', 'テンプレート名称', '用紙種別', '法要区分', '案内文本文'], ['N1', '確認用', 'A4', '自由文書', 'シート側の本文']]);
  global.fetch = mock.fetch;
  try {
    const result = await importFromSheets('token', 'sheet', { requireCompleteSchema: true, readOnly: true });
    assert.equal(result.allNoticeTemplates[0].content, 'シート側の本文');
    assert.equal(saves.filter(([key]) => key !== 'retained-household-ids-v1' && key !== 'temple-prefix-reservations-v1').length, 0, 'a comparison must not update local settings; observed IDs may only be reserved');
  } finally { global.fetch = originalFetch; storage.saveJsonState = originalSave; }
});

test('history transport retains 401 rather than reporting an empty history', async () => {
  const { fetchLatestOperationLogs } = require('../src/lib/googleSheets.ts');
  const original = global.fetch; global.fetch = async () => new Response('{}', { status: 401 });
  try { await assert.rejects(fetchLatestOperationLogs('expired', 'sheet'), e => e.status === 401 && e.isAuthError); }
  finally { global.fetch = original; }
});

test('a real Sheets export/import round trip satisfies merge readback verification', async () => {
  const { importFromSheets, exportToSheets } = require('../src/lib/googleSheets.ts');
  const mock = rowWorkbook('sheet');
  const original = global.fetch; global.fetch = mock.fetch;
  const { EMPTY_TEMPLE_INFO, EMPTY_MASTER_OPTIONS } = require('../src/data/initialData.ts');
  const templeInfo = {...EMPTY_TEMPLE_INFO, id:'temple-main',name:'試験寺院',isMain:true};
  try {
    await exportToSheets('token','sheet',templeInfo,[{id:'H1',familyHead:'山田太郎',phone:'111',templeId:'temple-main'}],
      [{id:'P1',householdId:'H1',deathDate:'2000/01/01',templeId:'temple-main'}],[],
      [{id:'T1',date:'2026/09/01',amount:1000,type:'収入',category:'寄付',templeId:'temple-main'}],EMPTY_MASTER_OPTIONS,undefined,[],[templeInfo]);
    const remote = await importFromSheets('token', 'sheet', { requireCompleteSchema: true, readOnly: true });
    remote.households[0].phone = '222'; remote.transactions[0].amount = 2000;
    remote.allNoticeTemplates = [{ id: 'N1', name: '確認用案内', title: '文書タイトル', type: 'kaku2_memo', category: 'custom', content: '比較する本文' }];
    remote.transactions.push({ ...remote.transactions[0], id: 'ARCHIVE-1', date: '2020/01/01', amount: 7000 });
    remote.batchAccountingConfig = { id: 'config-temple-main', templeId: 'temple-main', configDate: '令和8年9月15日', cat1: '法要布施', notes1: '', defaultAmount1: 1000, cat2: '護持会費', notes2: '', defaultAmount2: '', cat3: '特別寄付', notes3: '', defaultAmount3: '', appliedPreset: 'default' };
    remote.batchAccountingData = { ...remote.batchAccountingConfig, entries: { H1: { householdId: 'H1', check1: true, amount1: 1000, check2: false, amount2: '', check3: false, amount3: '' } } };
    const { context } = harness(), intended = context.payload(remote);
    await exportToSheets('token', 'sheet', intended.templeInfo, intended.households, intended.pastRecords, intended.memorialServices, intended.transactions,
      intended.masterOptions, intended.noticeTemplates, intended.templeTodos, intended.temples,
      { targetTempleId: 'ALL', ...intended, reviewedMerge: true });
    const actual = context.payload(await importFromSheets('token', 'sheet', { requireCompleteSchema: true, readOnly: true }));
    const mismatches = Object.keys(intended).filter(key => !verifyMergedReadback(intended[key], actual[key], key));
    assert(verifyMergedReadback(intended, actual), JSON.stringify({ mismatches, intended, actual }));
  } finally { global.fetch = original; }
});

test('the 10-second monitor reads only recent history and pulls only on incoming changes', async () => {
  let effect;
  const visit = n => {
    if (ts.isCallExpression(n) && n.expression.getText(ast) === 'useEffect' && n.arguments[0]?.getText(ast).includes('const checkOperationLogs')) effect = n.arguments[0].getText(ast);
    ts.forEachChild(n, visit);
  };
  visit(ast);
  for (const incoming of [false, true]) for (const deleting of [false, true]) {
    const timers = [], calls = [], gate = new SheetsWriteSafety(); gate.accept('sheet', 'ok');
    const context = { autoSyncDueRef: {current:null}, maintenanceStopped: () => false,
      isInitialLoaded: true, syncStatus: 'synced', document: { visibilityState: 'visible' },
      isStartupLauncherOpenRef: { current: false }, isCleanWritingRef: { current: false }, isSyncInProgressRef: { current: false }, isImportingRef: { current: false },
      writeSafetyRef: { current: gate }, safeStorage: { getItem: () => '{"id":"sheet"}' }, getAccessToken: async () => 'token',
      loadDeletedRecordsLog: () => [{ logId: 'known' }, { logId: 'new' }],
      currentPageAudit: async () => deleting ? Array.from({length:5},(_,i)=>({id:'H'+i,logId:'D'+i,entityType:'household',actionType:'delete'})) : [], hasOnlyIndependentPendingChanges: require('../src/utils/threeWaySheetsMerge.ts').hasOnlyIndependentPendingChanges, getSheetsPayload: v => v, syncStateRef: {current:{households:[]}}, readMergeBaseline: async () => ({local:{households:deleting ? Array.from({length:5},(_,i)=>({id:'H'+i})) : []},remote:{deletedRecords:[{logId:'known'}]}}),
      fetchLatestOperationLogs: async (...args) => { calls.push(['history', ...args]); return { logs: [{ logId: incoming ? 'new' : 'known' }] }; },
      syncWithGoogleDriveRef: { current: async (...args) => calls.push(['pull', ...args]) },
      setTimeout: (callback, delay) => { timers.push({ callback, delay }); return timers.length; }, clearTimeout() {},
      setSyncStatus() {}, setSyncErrorMessage() {},
      exportToSheets() { throw Error('monitor attempted to write'); },
    };
    vm.runInNewContext(compile(`(${effect})();`), context);
    assert.equal(timers[0].delay, 5000); timers.shift().callback(); await new Promise(setImmediate);
    assert.equal(timers[0].delay, 10000);
    assert.equal(calls.filter(call => call[0] === 'history').length, 1);
    assert.equal(calls.filter(call => call[0] === 'pull').length, incoming && !deleting ? 1 : 0);
  }
});

function initializationHarness() {
  const { context, gate } = harness();
  const calls = [], timers = [];
  Object.assign(context, {
    SPREADSHEET_NAME: '試験用シート', getSheetsPayload: context.payload, computePayloadSignature: JSON.stringify,
    loadJsonState: () => ({ id: 'old-sheet' }),
    deleteAllExistingSpreadsheetsByName: async (...args) => calls.push(['delete', ...args]),
    createNewSpreadsheet: async () => { calls.push(['create']); return { id: 'new-sheet', url: 'test' }; },
    saveDeletedRecordsLog() {}, getSavedBatchAccountingData: () => null, getSavedDisasterMemorialEvents: () => [],
    setDeletedRecords() {},
    setTimeout: callback => { timers.push(callback); }, isAuthError: () => false, console,
  });
  context.safeStorage.removeItem = () => {};
  const run = transport => vm.runInNewContext(compile(`(${fn('cleanWriteToGoogleSheets')})`), { ...context, exportToSheets: transport });
  return { context, gate, calls, timers, run };
}

test('explicit initialization works after a failed read and enables only the new destination after success', async () => {
  const { context, gate, calls, timers, run } = initializationHarness();
  gate.accept('old-sheet', 'previous'); gate.block();
  let finish;
  const initialize = run(async (...args) => {
    calls.push(['write', ...args]);
    assert(!gate.canWrite('old-sheet')); assert(!gate.canWrite('new-sheet'));
    await new Promise(resolve => { finish = resolve; });
  });
  const pending = initialize('token'); await new Promise(setImmediate);
  assert(context.isCleanWritingRef.current); assert(context.isImportingRef.current);
  assert.equal(calls.at(-1)[2], 'new-sheet');
  assert.equal(calls.at(-1)[5][0].id, 'P1', 'exports the terminal backup past records');
  assert.equal(calls.at(-1)[7][0].amount, 1000, 'exports the terminal backup transactions');
  finish(); const result = await pending;
  assert(result.success); assert(gate.canWrite('new-sheet')); assert(!gate.canWrite('old-sheet'));
  timers.forEach(callback => callback());
  assert(!context.isCleanWritingRef.current);
});

test('explicit initialization can create the first destination, but failure and concurrent sync remain blocked', async () => {
  const { context, gate, calls, run } = initializationHarness();
  const failed = run(async () => { throw Error('write failed'); });
  await assert.rejects(failed('token'), /write failed/);
  assert(!gate.canWrite('old-sheet')); assert(!gate.canWrite('new-sheet'));
  const count = calls.length;
  await assert.rejects(failed('token'), /別の同期処理/);
  assert.equal(calls.length, count, 'no deletion or creation during a concurrent operation');
  const fresh = initializationHarness();
  fresh.context.loadJsonState = () => null;
  const result = await fresh.run(async () => {})('token');
  assert(result.success); assert(fresh.gate.canWrite('new-sheet'));
});
test('local deletion wins over a remote edit without requiring wizard selection',async()=>{
 const h=mergeHarness();h.context.syncStateRef.current.transactions=[];
 h.context.syncStateRef.current.deletedRecords=[{logId:'D',id:'T1',entityType:'transaction',actionType:'delete',deletedTimestamp:1000}];
 h.remote.transactions[0].amount=1500;h.env.askMerge=async()=>{throw Error('wizard must not open');};
 await h.run();assert.equal(h.writes,1);assert.equal(h.remote.transactions.length,0);
});

test('idle tab applies household deletions without maintenance or writes despite old display history',async()=>{
 const h=mergeHarness();h.context.syncStateRef.current.transactions[0].amount=1000;
 h.context.syncStateRef.current.deletedRecords=[{logId:'old-display',id:'old',actionType:'update'}];
 h.remote.households=[];h.remote.deletedRecords=[{logId:'D',id:'H1',entityType:'household',actionType:'delete',deletedTimestamp:1000}];
 h.env.hasLocalAuditChanges=()=>true;h.env.currentPageAudit=async()=>[];
 h.env.window={};h.env.maintenanceClient=async()=>({ownsMerge:false,prepareMerge(){throw Error('must not freeze');}});
 h.env.askMerge=async()=>{throw Error('must not review');};
 await h.run();assert.equal(h.writes,0);assert.equal(h.context.syncStateRef.current.households.length,0);
});

test('a shared display-history update during comparison is not a local editing conflict',async()=>{
 const h=mergeHarness(),ask=h.env.askMerge;
 h.env.askMerge=async draft=>{const selected=await ask(draft);h.context.syncStateRef.current.deletedRecords=[{logId:'other-tab-history',id:'other',actionType:'update'}];return selected;};
 await h.run();assert.equal(h.writes,1);
});
test('automatic merge marks its UI busy before freezing peers',async()=>{
 const h=mergeHarness();h.context.syncStateRef.current.transactions=[];
 h.context.syncStateRef.current.deletedRecords=[{logId:'D',id:'T1',entityType:'transaction',actionType:'delete',deletedTimestamp:1000}];
 let busy=false;h.env.setMergeSaving=v=>busy=v;h.env.window={};
 const client={ownsMerge:false,view:{state:{}},prepareMerge:async()=>{assert(busy);},confirmMergeStopped:async()=>true,markMergeSubmitted:async()=>{},finishMerge:async()=>{}};
 h.env.maintenanceClient=async()=>client;
 await h.run();assert.equal(busy,false);assert.equal(h.writes,1);
});

test('reconnect delivers new receipts before any workbook import or merge, preserving unrelated edits',async()=>{
 const h=mergeHarness();const t={id:'new-receipt',amount:1200,templeId:'main'};
 h.context.syncStateRef.current.transactions.push(t);
 const entry={id:t.id,logId:'new-log',entityType:'transaction',actionType:'create',afterData:t};
 h.env.currentPageAudit=async()=>[entry];
 let sent=0,acked=0;
 h.env.appendAccountingReceipts=async(token,id,entries)=>{sent++;assert.equal(entries[0],entry);};
 h.env.acknowledgeReceiptOperations=async(id,entries)=>{acked++;assert.equal(entries[0],entry);};
 h.env.safeImportWithAutoRecovery=async()=>{throw Error('whole workbook read must not run');};
 await h.run();
 assert.equal(sent,1);assert.equal(acked,1);assert.equal(h.reviews,0);assert.equal(h.writes,0);
 assert.equal(h.context.syncStateRef.current.transactions[0].amount,2000);
 assert.equal(h.context.syncStateRef.current.transactions[1].id,t.id);
 assert(h.gate.canWrite('sheet'));
 assert.equal(h.context.isSyncInProgressRef.current,false);
});

test('conflicting edits to the same directory field use the later save without a choice',async()=>{
 const h=mergeHarness();h.context.syncStateRef.current.transactions[0].amount=1000;
 h.context.syncStateRef.current.households[0].phone='local';h.remote.households[0].phone='remote';
 await h.run();assert.equal(h.reviews,0);assert.equal(h.remote.households[0].phone,'local');
});

test('a directory edit arriving during polling goes back to ordinary saving, not maintenance',async()=>{
 const h=mergeHarness();h.context.syncStateRef.current.transactions[0].amount=1000;
 const baseline=await h.env.readMergeBaseline();baseline.local=h.context.payload(baseline.local);h.env.readMergeBaseline=async()=>baseline;
 let logs=[];h.env.currentPageAudit=async()=>logs;
 h.env.safeImportWithAutoRecovery=async()=>{
  h.context.syncStateRef.current.households[0].phone='new input';
  logs=[{id:'H1',logId:'U1',entityType:'household',actionType:'update'}];
  return {data:h.remote,sheet:{id:'sheet'}};
 };
 h.env.askMerge=async()=>{throw Error('must not review');};
 await h.run();assert.equal(h.writes,0);assert.equal(h.context.syncStateRef.current.households[0].phone,'new input');assert(h.gate.canWrite('sheet'));
});

test('mixed consecutive household edits and deletions remain eligible for normal saving',()=>{
 const {hasOnlyIndependentPendingChanges}=require('../src/utils/threeWaySheetsMerge.ts');
 const base={local:{households:[{id:'A',name:'A'},{id:'B',name:'B'},{id:'C',name:'C'}],deletedRecords:[]}};
 const local={households:[{id:'B',name:'edited B'},{id:'C',name:'C'}],deletedRecords:[{id:'A',logId:'D',entityType:'household',actionType:'delete'},{id:'B',logId:'U',entityType:'household',actionType:'update'}]};
 assert(hasOnlyIndependentPendingChanges(base,local));
 local.households=local.households.filter(r=>r.id!=='C');assert(!hasOnlyIndependentPendingChanges(base,local));
 local.deletedRecords.push({id:'C',logId:'D2',entityType:'household',actionType:'delete'});assert(hasOnlyIndependentPendingChanges(base,local));
});

test('history-only pending operations save only history without stopping peers or opening merge',async()=>{
 const h=mergeHarness();h.context.syncStateRef.current.transactions[0].amount=1000;
 const base=await h.env.readMergeBaseline();base.local=h.context.payload(base.local);h.env.readMergeBaseline=async()=>base;
 h.env.currentPageAudit=async()=>[{id:'H1',logId:'audit-only',entityType:'household',actionType:'update'}];
 const calls=[];h.env.exportToSheets=async(...args)=>calls.push(args[11]);
 h.env.askMerge=async()=>{throw Error('must not merge');};
 await h.run();assert.equal(calls.length,1);assert.deepEqual(Array.from(calls[0].targetTablesOnly),['操作・削除履歴']);
 assert.equal(calls[0].deletedRecords[0].logId,'audit-only');assert(h.gate.canWrite('sheet'));
});

// Ordinary synchronization now queues row operations instead of opening the retired
// workbook-review flow. Failure/uncertainty is verified by rowSync integration tests.
test('ordinary reconnect saves pending edits without a full read, wizard, or peer lock',async()=>{
 const h=mergeHarness();h.env.askMerge=()=>{throw Error('wizard');};h.env.maintenanceClient=()=>{throw Error('peer lock');};
 h.env.safeImportWithAutoRecovery=()=>{throw Error('unnecessary full read');};
 await h.run();assert.equal(h.writes,1);assert.equal(h.reviews,0);assert.equal(h.acknowledgements,1);assert.equal(h.context.syncStateRef.current.transactions[0].amount,2000);
});
test('new local edits during upload remain pending for the next save',async()=>{
 const h=mergeHarness();let accepted;h.env.acknowledgeSheets=async(id,local)=>accepted=structuredClone(local);
 h.env.exportToSheets=async()=>{h.context.syncStateRef.current.transactions=[{id:'T1',amount:3000}];};
 await h.run();assert.equal(accepted.transactions[0].amount,2000);assert.equal(h.context.syncStateRef.current.transactions[0].amount,3000);assert.equal(h.reviews,0);
});
test('record write failure leaves edits and does not acknowledge or launch a wizard',async()=>{
 const h=mergeHarness();h.env.exportToSheets=async()=>{throw Error('HTTP 429');};
 await assert.rejects(h.run(),/429/);assert.equal(h.acknowledgements,0);assert.equal(h.reviews,0);assert.equal(h.context.syncStateRef.current.transactions[0].amount,2000);assert(!h.gate.canWrite('sheet'));
});
test('missing baseline blocks unknown local settings without a whole-workbook wizard',async()=>{
 const h=mergeHarness();h.env.readMergeBaseline=async()=>null;
 await assert.rejects(h.run(),/基準/);assert.equal(h.writes,0);assert.equal(h.reviews,0);
});
test('editing during a remote read preserves local input and returns to ordinary autosave',async()=>{
 const h=mergeHarness();h.context.syncStateRef.current.transactions[0].amount=1000;
 h.env.safeImportWithAutoRecovery=async()=>{h.context.syncStateRef.current.transactions=[{id:'T1',amount:3333}];return {data:h.remote,sheet:{id:'sheet'}};};
 await h.run();assert.equal(h.context.syncStateRef.current.transactions[0].amount,3333);assert.equal(h.writes,0);assert.equal(h.reviews,0);assert(h.gate.canWrite('sheet'));
});
test('only explicit subsidiary removal starts maintenance; ordinary synchronization has no merge calls',()=>{
 const body=fn('syncWithGoogleDrive');assert(!body.includes('askMerge('));assert(!body.includes('prepareMerge('));assert(!body.includes('planSheetsMerge('));
 assert(fn('handleDeleteSubTemple').includes('prepareMerge('));
});
