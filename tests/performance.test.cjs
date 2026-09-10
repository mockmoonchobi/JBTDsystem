const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const compile = text => ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
require.extensions['.ts'] = (module, filename) => module._compile(compile(fs.readFileSync(filename, 'utf8')), filename);
require.cache[path.join(root, 'src/lib/googleAuth.ts')] = { exports: { getCurrentUser: () => null, getActiveGoogleAccountName: () => '' } };
const { sortHouseholds, getHouseholdNiibonStatus, compareHouseholdsGojuon } = require('../src/utils/memorialCalculator.ts');
const { SheetsExportCache } = require('../src/utils/sheetsExportCache.ts');
const { exportToSheets, importFromSheets } = require('../src/lib/googleSheets.ts');
const { EMPTY_TEMPLE_INFO, EMPTY_MASTER_OPTIONS } = require('../src/data/initialData.ts');

test('niibon sort retains the prior ordering for both seasons and directions without full-table comparator scans', () => {
  const year = new Date().getFullYear();
  const households = Array.from({ length: 80 }, (_, i) => ({ id: `H${i}`, familyHead: `世帯${i}`, furigana: i % 2 ? 'サトウ' : 'アオキ' })).reverse();
  const records = households.flatMap((h, i) => [
    { id: `P${i}`, householdId: h.id, deathDate: `${year - i % 3}/06/15` },
    { id: `Q${i}`, householdId: h.id, deathDate: i % 2 ? '' : `${year}/08/01`, niibon: i % 4 ? '' : '令和8年新盆' },
  ]);
  for (const season of ['7月盆', '8月盆']) for (const order of ['asc', 'desc']) {
    const rank = h => { const s = getHouseholdNiibonStatus(records, h.id, season); return s.isCurrentYearNiibon ? 1 : s.isNextYearNiibon ? 2 : 3; };
    const expected = [...households].sort((a, b) => (rank(a) - rank(b) || compareHouseholdsGojuon(a, b)) * (order === 'asc' ? 1 : -1));
    let wholeTableFilters = 0;
    records.filter = function(fn) { wholeTableFilters++; return Array.prototype.filter.call(this, fn); };
    assert.deepEqual(sortHouseholds(households, 'niibon', order, EMPTY_MASTER_OPTIONS, records, season), expected);
    assert.equal(wholeTableFilters, 0);
    delete records.filter;
  }
  assert.equal(households[0].id, 'H79', 'input order must not be mutated');
  assert.equal(sortHouseholds(households, 'niibon').length, households.length);
});

test('export baseline uses exact values, requires commit, isolates destinations and invalidates pending plans', () => {
  const cache = new SheetsExportCache();
  const updates = [{ range: "'檀家名簿'!A1", values: [['ID', '名前'], ['H1', '元の名前']] }];
  const initial = cache.plan('A', updates, true);
  assert.equal(initial.updates.length, 1);
  assert.equal(cache.plan('A', updates, true).updates.length, 1, 'uncommitted request is not a baseline');
  initial.commit();
  assert.equal(cache.plan('A', structuredClone(updates), true).updates.length, 0);
  updates[0].values[1][1] = '編集済';
  assert.equal(cache.plan('A', updates, true).updates.length, 1, 'nested in-place changes are detected');
  const pending = cache.plan('A', updates, true);
  cache.invalidate();
  pending.commit();
  assert.equal(cache.plan('A', updates, true).updates.length, 1);
  cache.plan('A', updates, true).commit();
  assert.equal(cache.plan('B', updates, true).updates.length, 1);
  assert.equal(cache.plan('A', updates, false).updates.length, 1, 'manual export always writes');
});

function sheetMock() {
  const calls = [], sheets = [{ properties: { title: '独自メモ', sheetId: 99, gridProperties: { rowCount: 1000, columnCount: 100 } } }];
  let failWrite = false;
  const fetch = async (url, options = {}) => {
    const body = options.body ? JSON.parse(options.body) : undefined;
    calls.push({ url, body, bytes: Buffer.byteLength(options.body || '') });
    if (url.includes('?fields=')) return new Response(JSON.stringify({ sheets }));
    if (failWrite && body?.requests?.some(r => r.updateCells)) return new Response(JSON.stringify({ error: { message: 'rejected' } }), { status: 400 });
    const replies = (body?.requests || []).map(r => {
      if (!r.addSheet) return {};
      const sheet = { properties: { ...r.addSheet.properties, sheetId: 100 + sheets.length } };
      sheets.push(sheet);
      return { addSheet: sheet };
    });
    return new Response(JSON.stringify({ replies }));
  };
  const writtenNames = () => calls.flatMap(c => c.body?.requests || []).filter(r => r.updateCells).map(r => sheets.find(s => s.properties.sheetId === r.updateCells.start.sheetId).properties.title);
  return { calls, sheets, fetch, writtenNames, fail(value) { failWrite = value; } };
}

test('auto export skips identical tables, writes deletions atomically, retries failures and resets after import', async () => {
  const mock = sheetMock(), originalFetch = global.fetch, OriginalDate = global.Date;
  global.fetch = mock.fetch;
  const households = [{ id: 'H1', familyHead: '世帯1', familyMembers: [] }];
  const past = [{ id: 'P1', householdId: 'H1', deathDate: '2000/01/01' }];
  const transactions = [{ id: 'T1', date: '2026/09/01', amount: 1000, type: 'income', category: '寄付' }];
  const batchAccountingData = { entries: { H1: { check1: true, amount1: 1000 } } };
  const run = (options = { onlyChangedTables: true }) => exportToSheets('token', 'incremental-test', EMPTY_TEMPLE_INFO, households, past, [], transactions, EMPTY_MASTER_OPTIONS, undefined, [], [], { batchAccountingData, ...options });
  try {
    await run({});
    mock.calls.length = 0;
    global.Date = class extends OriginalDate { constructor(...args) { super(...(args.length ? args : ['2030-02-03T04:05:06Z'])); } };
    await run();
    assert.equal(mock.calls.length, 0, 'export-time audit/template timestamps must not dirty unchanged data: ' + mock.writtenNames().join(', '));
    transactions[0].amount = 2000;
    await run();
    assert.deepEqual(mock.writtenNames(), ['出納・会計']);
    assert(!mock.calls.some(c => c.url.includes('batchClear')));
    mock.calls.length = 0;
    households[0].familyMembers.push({ id: 'F1', name: '家族', householdId: 'H1' });
    await run();
    assert(mock.writtenNames().includes('家族構成'));
    assert(!mock.writtenNames().includes('過去帳'));
    mock.calls.length = 0;
    households[0].familyHead = '新しい世帯主';
    await run();
    assert(mock.writtenNames().includes('一括会計受付'), 'derived household names must still update when no config date is saved');
    mock.calls.length = 0;
    past.length = 0;
    await run();
    assert.deepEqual(mock.writtenNames(), ['過去帳']);
    const atomic = mock.calls.find(c => c.body?.requests?.some(r => r.updateCells)).body.requests;
    assert.equal(atomic.filter(r => r.repeatCell).length, 1);
    assert.equal(atomic.find(r => r.updateCells).updateCells.rows.length, 1, 'last deletion leaves only the header');
    transactions[0].amount = 3000;
    mock.fail(true);
    await assert.rejects(run());
    mock.fail(false);
    mock.calls.length = 0;
    await run();
    assert(mock.writtenNames().includes('出納・会計'));
    assert(mock.writtenNames().length > 1, 'unknown/failed outcome forces a fresh baseline');
    // Even a failed import invalidates the baseline rather than assuming the
    // external workbook is still identical to the last export.
    global.fetch = async () => new Response('{}', { status: 400 });
    await assert.rejects(importFromSheets('token', 'incremental-test'));
    global.fetch = mock.fetch;
    mock.calls.length = 0;
    await run();
    assert(mock.writtenNames().length > 1);
  } finally { global.fetch = originalFetch; global.Date = OriginalDate; }
});

function freshStorage() {
  const writes = [], local = new Map();
  const window = { addEventListener() {}, localStorage: { setItem(k,v) { local.set(k,v); }, getItem(k) { return local.get(k) || null; }, removeItem(k) { local.delete(k); } }, indexedDB: { open() {
    const request = {};
    queueMicrotask(() => {
      request.result = { close() {}, transaction() {
        const tx = { objectStore() { return { put(value,key) {
          writes.push({ key, value });
          const req = {};
          queueMicrotask(() => { req.onsuccess?.(); queueMicrotask(() => tx.oncomplete?.()); });
          return req;
        } }; } };
        return tx;
      } };
      request.onsuccess();
    });
    return request;
  } } };
  const context = { exports: {}, window, console, setTimeout };
  vm.runInNewContext(compile(fs.readFileSync(path.join(root,'src/utils/storageUtils.ts'),'utf8')), context);
  return { storage: context.exports, window, writes, local };
}

test('settings and snapshots persist once, including localStorage failure; cached import is synchronous', async () => {
  const { storage, window, writes, local } = freshStorage();
  const data = { name: '寺院' }, table = [{ id: 'H1' }];
  storage.saveJsonState('temple_info', data);
  storage.saveJsonState('temple_safety_snapshot', { households: table });
  storage.cacheJsonState('temple_households', table);
  assert.equal(storage.loadJsonState('temple_households', null), table);
  assert.equal(writes.length, 0);
  storage.saveJsonState('temple_households', table);
  await new Promise(setImmediate);
  assert.equal(writes.length, 3);
  assert.equal(writes.find(w => w.key === 'temple_info').value, data);
  assert.equal(local.get('temple_info'), JSON.stringify(data));
  window.localStorage.setItem = () => { throw Error('quota'); };
  storage.saveJsonState('temple_info', { name: '変更' });
  await new Promise(setImmediate);
  assert.equal(writes.length, 4, 'fallback must write one typed value, not JSON plus object');
});

test('auto sync exports the current snapshot, preserves empty deletions, and wakes edits made in flight', async () => {
  const ast = ts.createSourceFile('App.tsx', fs.readFileSync(path.join(root,'src/App.tsx'),'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let effect, dependencies;
  const visit = n => {
    if (ts.isCallExpression(n) && n.expression.getText(ast) === 'useEffect' && n.arguments[0]?.getText(ast).includes('const performAutoSync')) {
      effect = n.arguments[0].getText(ast); dependencies = n.arguments[1].getText(ast);
    }
    ts.forEachChild(n,visit);
  };
  visit(ast);
  assert(dependencies.includes('isSyncSettled'));
  const state = { templeInfo: {}, temples: [], households: [{ id: 'H1' }], pastRecords: [], memorialServices: [], templeTodos: [], transactions: [], masterOptions: {}, noticeTemplates: {}, templeMasterOptionsMap: {}, priests: [], deletedRecords: [], disasterEvents: [] };
  const timers = [], exports = [], statuses = [];
  let finish;
  const context = {
    ...state, isInitialLoaded: true,
    syncStateRef: { current: state }, isImportingRef: { current: false }, isCleanWritingRef: { current: false }, isSyncInProgressRef: { current: false }, lastSyncedSignatureRef: { current: '' },
    getAccessToken: async () => 'token', safeStorage: { getItem: () => '{"id":"sheet"}', setItem() {} },
    getSavedBatchAccountingData: () => undefined, getSavedDisasterMemorialEvents: () => [], loadDeletedRecordsLog: () => [], computePayloadSignature: JSON.stringify,
    safeExportWithAutoRecovery: async (token,id,callback) => callback(id),
    exportToSheets: async (...args) => { exports.push(args); if (exports.length === 1) await new Promise(resolve => { finish = resolve; }); },
    setSyncStatus: status => statuses.push(status), setLastSyncTime() {}, setSyncErrorMessage() {}, isAuthError: () => false,
    setTimeout: callback => { timers.push(callback); return timers.length; }, clearTimeout() {}, console,
  };
  const runEffect = () => vm.runInNewContext(compile(`(${effect})();`), context);
  runEffect(); timers.shift()();
  await new Promise(setImmediate);
  assert.equal(context.isSyncInProgressRef.current, true);
  context.syncStateRef.current = { ...state, households: [] };
  runEffect();
  assert.equal(timers.length, 0, 'do not overlap exports');
  finish(); await new Promise(setImmediate);
  assert.equal(statuses.at(-1), 'synced');
  runEffect(); timers.shift()(); await new Promise(setImmediate);
  assert.equal(exports.length, 2);
  assert.equal(exports[1][3].length, 0, 'stale render must not resurrect the last deleted household');
  assert.equal(exports[1][11].onlyChangedTables, true);
  runEffect(); timers.shift()(); await new Promise(setImmediate);
  assert.equal(exports.length, 2, 'settled status must not produce an export loop');
});
