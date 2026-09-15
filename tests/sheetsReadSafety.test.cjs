const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript');
const root = path.resolve(__dirname, '..');
const compile = text => ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
require.extensions['.ts'] = (module, filename) => module._compile(compile(fs.readFileSync(filename, 'utf8')), filename);
require.cache[path.join(root, 'src/lib/googleAuth.ts')] = { exports: { getCurrentUser: () => null, getActiveGoogleAccountName: () => '' } };
const { readAllSheetData, SheetsWriteSafety } = require('../src/utils/sheetsReadSafety.ts');
const { stableMergeValue, verifyMergedReadback } = require('../src/utils/threeWaySheetsMerge.ts');
const sheet = (title, rowCount) => ({ properties: { title, gridProperties: { rowCount, columnCount: 100 } } });

test('second page failure rejects the whole import instead of returning 1999 records', async () => {
  let calls = 0;
  await assert.rejects(readAllSheetData([sheet('過去帳', 4001)], async ranges => {
    if (++calls === 2) throw Error('network failure');
    return [{ range: ranges[0], values: [['ID'], ...Array.from({ length: 1999 }, (_, i) => ['P' + i])] }];
  }), /network failure/);
  assert.equal(calls, 2);
});

test('empty or short intermediate pages do not truncate later records', async () => {
  for (const first of [[['ID'], ['P1']], [['ID']]]) {
    let calls = 0;
    const data = await readAllSheetData([sheet('過去帳', 6001)], async ranges => {
      calls++;
      return [{ range: ranges[0], values: calls === 1 ? first : calls === 4 ? [['P6001']] : [] }];
    });
    assert.equal(calls, 4);
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
function harness() {
  const data = { templeInfo: { name: '試験寺院' }, temples: [], households: [{ id: 'H1' }], pastRecords: [{ id: 'P1' }], transactions: [{ id: 'T1', amount: 1000 }], deletedRecords: [], memorialServices: [], templeTodos: [], masterOptions: {}, templeMasterOptionsMap: {}, priests: [], noticeTemplates: { higan: '', niibon: '' }, batchAccountingData: null, disasterEvents: [] };
  const statuses = [], gate = new SheetsWriteSafety();
  const context = {
    getAllSavedNoticeTemplates: () => [], getSavedBatchAccountingConfig: () => null,
    stableMergeValue, verifyMergedReadback, crypto: require('node:crypto'),
    MAX_DELETED_LOG_LENGTH: 1000, getActiveGoogleAccountName: () => 'テスト操作者',
    setMergeSaving() {}, isAuthError: e => e?.status === 401, clearCachedAccessToken() {},
    readMergeBaseline: async () => ({ version: 1, sheetId: 'sheet', local: data, remote: data }),
    acknowledgeSheets: async () => {}, idbGet: async () => null, draftKey: id => id,
    saveMergeDraft: async () => {}, backupMergeAttempt: async () => {},
    askMerge: async () => null, mergeDraftRef: { current: null },
    syncStateRef: { current: structuredClone(data) }, writeSafetyRef: { current: gate },
    isSyncInProgressRef: { current: false }, isCleanWritingRef: { current: false }, isImportingRef: { current: false },
    lastSyncedSignatureRef: { current: '' }, loadDeletedRecordsLog: () => context.syncStateRef.current.deletedRecords,
    safeStorage: { getItem: () => '{"id":"sheet"}', setItem() {} }, saveJsonState() {},
    setSyncStatus: value => statuses.push(value), setSyncErrorMessage() {}, setLastSyncTime() {}, setIsInitialLoaded() {},
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

test('pending edits and edits during download are preserved and block automatic replacement', async () => {
  const { context, gate } = harness();
  gate.accept('sheet', JSON.stringify(context.payload(context.syncStateRef.current)));
  context.syncStateRef.current.transactions[0].amount = 2000;
  await assert.rejects(context.read('token', 'sheet'), /保留/);
  assert.equal(context.syncStateRef.current.transactions[0].amount, 2000);
  assert(!gate.canWrite('sheet'));
  const concurrent = { ...context, getSheetsPayload: context.payload, safeImportWithAutoRecovery: async () => {
    context.syncStateRef.current.transactions[0].amount = 3000;
    return { data: {}, sheet: { id: 'sheet' } };
  } };
  const read = vm.runInNewContext(compile(`(${fn('syncWithGoogleDrive')})`), concurrent);
  await assert.rejects(read('token', 'sheet', true), /読み込み中/);
  assert.equal(context.syncStateRef.current.transactions[0].amount, 3000);
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
    },
  };
  return { env, gate, context, run: () => vm.runInNewContext(compile(`(${fn('syncWithGoogleDrive')})`), env)('token', 'sheet'),
    get remote() { return remote; }, get saved() { return saved; }, get writes() { return writes; }, get reviews() { return reviews; }, get acknowledgements() { return acknowledgements; } };
}

test('explicit merge writes only after review and fresh read, then acknowledges a verified result', async () => {
  const h = mergeHarness();
  h.remote.households[0].phone = 'other-device';
  const result = await h.run();
  assert(result.success); assert.equal(h.writes, 1); assert.equal(h.acknowledgements, 1);
  assert.equal(h.remote.households[0].phone, 'other-device'); assert.equal(h.remote.transactions[0].amount, 2000);
  assert(h.gate.canWrite('sheet')); assert.equal(h.saved.phase, 'verified');
});
test('remote edits made during review cause a second comparison before any write', async () => {
  const h = mergeHarness(), ask = h.env.askMerge;
  h.env.askMerge = async draft => { const selected = await ask(draft); if (h.reviews === 1) h.remote.households[0].phone = 'arrived-during-review'; return selected; };
  await h.run(); assert.equal(h.reviews, 2); assert.equal(h.writes, 1);
  assert.equal(h.remote.households[0].phone, 'arrived-during-review');
});
test('lost response retains local edits and a sending journal; reconnect verifies instead of replaying', async () => {
  const h = mergeHarness(), send = h.env.exportToSheets;
  h.env.exportToSheets = async (...args) => { await send(...args); throw Error('response lost'); };
  await assert.rejects(h.run(), /response lost/);
  assert.equal(h.saved.phase, 'sending'); assert(!h.gate.canWrite('sheet')); assert.equal(h.acknowledgements, 0);
  assert.equal(h.context.syncStateRef.current.transactions[0].amount, 2000);
  h.env.exportToSheets = send;
  await h.run(); assert.equal(h.writes, 1, 'do not re-send an already applied merge'); assert(h.gate.canWrite('sheet'));
});
test('failed journal persistence prevents sending, and edits during review prevent overwrite', async () => {
  const h = mergeHarness(); h.env.saveMergeDraft = async () => { throw Error('disk full'); };
  await assert.rejects(h.run(), /disk full/); assert.equal(h.writes, 0); assert(!h.gate.canWrite('sheet'));
  const changed = mergeHarness(), ask = changed.env.askMerge;
  changed.env.askMerge = async draft => { const selected = await ask(draft); changed.context.syncStateRef.current.transactions[0].amount = 3000; return selected; };
  await assert.rejects(changed.run(), /確認中に端末/); assert.equal(changed.writes, 0);
  assert.equal(changed.context.syncStateRef.current.transactions[0].amount, 3000);
});
test('readback mismatch does not accept the baseline or replace the local dataset', async () => {
  const h = mergeHarness(), send = h.env.exportToSheets;
  h.env.exportToSheets = async (...args) => { await send(...args); h.remote.transactions = []; };
  await assert.rejects(h.run(), /一致しません/); assert.equal(h.acknowledgements, 0); assert(!h.gate.canWrite('sheet'));
  assert.equal(h.context.syncStateRef.current.transactions.length, 1);
});

test('a first connection with only local settings still requires review', async () => {
  const h = mergeHarness();
  for (const key of ['households', 'pastRecords', 'transactions', 'memorialServices', 'templeTodos', 'deletedRecords']) h.context.syncStateRef.current[key] = [];
  h.env.readMergeBaseline = async () => null;
  let prompted = false; h.env.askMerge = async () => { prompted = true; return null; };
  await assert.rejects(h.run(), /保留/); assert(prompted); assert.equal(h.writes, 0);
  assert.equal(h.context.syncStateRef.current.templeInfo.name, '試験寺院');
});

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
    safeExportWithAutoRecovery: async (...args) => writes.push(args),
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
    assert.equal(saves.length, 0, 'a comparison must not update local settings');
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
  const initial = importMock(); initial.tables.set('過去帳', [['ID', '命日'], ['P1', '2000/01/01']]);
  initial.tables.set('檀家名簿', [['ID', '世帯主名', '電話番号'], ['H1', '山田太郎', '111']]);
  const sheets = [...initial.tables].map(([title, rows], i) => ({ properties: { sheetId: i + 1, title, gridProperties: { rowCount: Math.max(100, rows.length), columnCount: 100 } }, rows }));
  const original = global.fetch;
  global.fetch = async (url, options = {}) => {
    if (options.method === 'POST' && url.endsWith(':batchUpdate')) {
      const replies = [];
      for (const request of JSON.parse(options.body).requests) {
        if (request.addSheet) {
          const properties = { sheetId: sheets.length + 1, gridProperties: { rowCount: 100, columnCount: 100 }, ...request.addSheet.properties };
          sheets.push({ properties, rows: [] }); replies.push({ addSheet: { properties } });
        } else {
          replies.push({});
          if (request.repeatCell?.fields?.includes('userEnteredValue')) {
            const range = request.repeatCell.range, s = sheets.find(s => s.properties.sheetId === range.sheetId);
            for (let row = range.startRowIndex || 0; row < (range.endRowIndex || s.rows.length); row++) s.rows[row] = [];
          }
          if (request.updateCells) {
            const update = request.updateCells, range = update.range || update.start;
            const s = sheets.find(s => s.properties.sheetId === range.sheetId);
            const start = range.startRowIndex ?? range.rowIndex ?? 0;
            for (let i = 0; i < (update.rows || []).length; i++) s.rows[start + i] = update.rows[i].values.map(cell => {
              const v = cell.userEnteredValue || {}; return v.stringValue ?? v.numberValue ?? v.boolValue ?? '';
            });
          }
          if (request.updateSheetProperties) {
            const p = request.updateSheetProperties.properties, s = sheets.find(s => s.properties.sheetId === p.sheetId);
            if (s && p.gridProperties) Object.assign(s.properties.gridProperties, p.gridProperties);
          }
        }
      }
      return new Response(JSON.stringify({ replies }));
    }
    if (url.includes('/values:batchGet')) {
      const valueRanges = new URL(url).searchParams.getAll('ranges').map(range => {
        const title = range.match(/^'((?:[^']|'')+)'/)[1].replace(/''/g, "'");
        const s = sheets.find(s => s.properties.title === title), bounds = range.match(/!A(\d+):ZZ(\d+)/);
        const values = bounds ? s.rows.slice(+bounds[1] - 1, +bounds[2]) : [...s.rows];
        while (values.length && (!values.at(-1) || !values.at(-1).length)) values.pop();
        return { range, values: values.map(row => (row || []).map(v => String(v))) };
      });
      return new Response(JSON.stringify({ valueRanges }));
    }
    return new Response(JSON.stringify({ spreadsheetId: 'sheet', sheets: sheets.map(({ properties }) => ({ properties })) }));
  };
  try {
    const remote = await importFromSheets('token', 'sheet', { requireCompleteSchema: true, readOnly: true });
    remote.households[0].phone = '222'; remote.transactions[0].amount = 2000;
    remote.allNoticeTemplates = [{ id: 'N1', name: '確認用案内', title: '文書タイトル', type: 'kaku2_memo', category: 'custom', content: '比較する本文' }];
    remote.transactions.push({ ...remote.transactions[0], id: 'ARCHIVE-1', date: '2020/01/01', amount: 7000 });
    remote.batchAccountingConfig = { id: 'config-temple-main', templeId: 'temple-main', configDate: '令和8年9月15日', cat1: '法要布施', notes1: '', defaultAmount1: 1000, cat2: '護持会費', notes2: '', defaultAmount2: '', cat3: '特別寄付', notes3: '', defaultAmount3: '', appliedPreset: 'default' };
    remote.batchAccountingData = { ...remote.batchAccountingConfig, entries: { H1: { householdId: 'H1', check1: true, amount1: 1000, check2: false, amount2: '', check3: false, amount3: '' } } };
    const { context } = harness(), intended = context.payload(remote);
    await exportToSheets('token', 'sheet', intended.templeInfo, intended.households, intended.pastRecords, intended.memorialServices, intended.transactions,
      intended.masterOptions, intended.noticeTemplates, intended.templeTodos, intended.temples,
      { targetTempleId: 'ALL', ...intended });
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
  for (const incoming of [false, true]) {
    const timers = [], calls = [], gate = new SheetsWriteSafety(); gate.accept('sheet', 'ok');
    const context = {
      isInitialLoaded: true, syncStatus: 'synced', document: { visibilityState: 'visible' },
      isStartupLauncherOpenRef: { current: false }, isCleanWritingRef: { current: false }, isSyncInProgressRef: { current: false }, isImportingRef: { current: false },
      writeSafetyRef: { current: gate }, safeStorage: { getItem: () => '{"id":"sheet"}' }, getAccessToken: async () => 'token',
      loadDeletedRecordsLog: () => [{ logId: 'known' }],
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
    assert.equal(calls.filter(call => call[0] === 'pull').length, incoming ? 1 : 0);
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
