const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = process.env.JBTD_TEST_SOURCE_ROOT || path.resolve(__dirname, '..');
// Run the repository TypeScript directly on Node 20 without a browser or login.
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, filename);
const authPath = path.join(root, 'src/lib/googleAuth.ts');
require.cache[authPath] = { exports: { getCurrentUser: () => null, getActiveGoogleAccountName: () => '' } };
const source = (file) => require(path.join(root, file));
const { syncTobaTodosList } = source('src/utils/tobaTodoSync.ts');
const { mergeGenericEntityList } = source('src/utils/syncMergeUtils.ts');
const { exportToSheets } = source('src/lib/googleSheets.ts');
const { INITIAL_TEMPLE_INFO, EMPTY_MASTER_OPTIONS } = source('src/data/initialData.ts');
const service = { id: 'S1', householdId: 'H1', templeId: 'T1', scheduledDate: '2026/09/20', scheduledTime: '10:00', tobaCount: 1, dharmaName: 'テスト精霊' };

test('same household/day services retain separate toba tasks', () => {
  const first = syncTobaTodosList(service, []);
  const both = syncTobaTodosList({ ...service, id: 'S2' }, first);
  assert.equal(both.length, 2);
  assert.deepEqual(new Set(both.map(t => t.relatedServiceId)), new Set(['S1', 'S2']));
  assert.deepEqual(syncTobaTodosList({ ...service, id: 'S2', tobaCount: 0 }, first), first);
});

test('explicit links win over legacy date matches, including compatibility serviceId', () => {
  const linked = syncTobaTodosList(service, [])[0];
  const legacy = { ...linked, id: 'legacy', relatedServiceId: undefined, serviceId: undefined };
  const result = syncTobaTodosList({ ...service, scheduledTime: '11:00' }, [legacy, linked]);
  assert.equal(result.find(t => t.id === 'legacy').dueTime, legacy.dueTime);
  assert.equal(result.find(t => t.id === linked.id).dueTime, '11:00');
  const compatible = { ...linked, relatedServiceId: undefined, serviceId: 'S1' };
  assert.equal(syncTobaTodosList({ ...service, id: 'S2' }, [compatible]).length, 2);
});

test('changed toba deadline wins on another device, even for immediate edits', () => {
  const first = syncTobaTodosList(service, []);
  const updated = syncTobaTodosList({ ...service, scheduledDate: '2026/09/25' }, first, { oldService: service });
  // The spreadsheet round trip carries date/time columns, not updatedAt.
  const roundTripped = updated.map(({ updatedAt, ...todo }) => todo);
  const merged = mergeGenericEntityList(first, roundTripped).merged;
  assert.equal(merged[0].dueDate, '2026/09/25');
  assert.equal(updated[0].createdAt, first[0].createdAt);
  assert.equal(updated[0].completed, first[0].completed);
});

test('deleting a service preserves tasks explicitly linked to another same-day service', () => {
  const appSource = fs.readFileSync(path.join(root, 'src/App.tsx'), 'utf8');
  const ast = ts.createSourceFile('App.tsx', appSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let handler;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'handleDeleteService') handler = node.initializer.getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert(handler);
  const compiled = ts.transpileModule(`const handler = ${handler}; handler('S1');`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const first = syncTobaTodosList(service, [])[0];
  const other = { ...first, id: 'TD-S2', relatedServiceId: 'S2' };
  let remaining;
  const noop = () => {};
  vm.runInNewContext(compiled, {
    memorialServices: [service, { ...service, id: 'S2' }], templeTodos: [first, other], syncStateRef: { current: {} },
    recordHistory: noop, getCurrentOperatorInfo: () => ({}), recordDeletedRecord: noop, recordDeletedRecordsBatch: noop,
    normalizeDateInput: value => value, getPreviousDay: () => '2026/09/19', refreshDeletedRecords: noop,
    setMemorialServices: noop, saveJsonState: noop, setTempleTodos: value => { remaining = value; },
    safeStorage: { getItem: () => null },
  });
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].relatedServiceId, 'S2');
});

function sheetMock(failure) {
  const calls = [];
  const sheets = [{ properties: { title: '独自メモ', sheetId: 99, gridProperties: { rowCount: 1000, columnCount: 100 } } },
    { properties: { title: '法事・予約一覧', sheetId: 100, gridProperties: { rowCount: 1000, columnCount: 100 } } },
    { properties: { title: '削除履歴', sheetId: 101, gridProperties: { rowCount: 1000, columnCount: 100 } } }];
  return { calls, sheets, fetch: async (url, options = {}) => {
    const body = options.body ? JSON.parse(options.body) : undefined;
    calls.push({ url, body });
    const reply = (data, status = 200) => new Response(JSON.stringify(data), { status });
    if (url.includes('?fields=')) return reply({ sheets });
    if (body?.requests?.some(r => r.updateCells)) {
      if (failure) return reply({ error: { message: 'simulated rejected write' } }, failure);
      return reply({ replies: body.requests.map(() => ({})) });
    }
    if (body?.requests) return reply({ replies: body.requests.map(r => {
      if (!r.addSheet) return {};
      const sheet = { properties: { ...r.addSheet.properties, sheetId: 200 + sheets.length } };
      sheets.push(sheet);
      return { addSheet: sheet };
    }) });
    if (failure && url.endsWith('values:batchUpdate')) return reply({ error: { message: 'simulated rejected write' } }, failure);
    return reply({});
  } };
}

async function runExport(mock, exportOptions) {
  const original = global.fetch;
  global.fetch = mock.fetch;
  try {
    await exportToSheets('test-token', 'test-sheet', INITIAL_TEMPLE_INFO,
      [], [], [], [], EMPTY_MASTER_OPTIONS, undefined, [], [], exportOptions);
  } finally { global.fetch = original; }
}

test('full export replaces managed sheets atomically and preserves custom tabs', async () => {
  const mock = sheetMock();
  await runExport(mock);
  assert.equal(mock.calls.filter(c => c.url.includes('batchClear') || c.url.endsWith(':clear')).length, 0);
  const writes = mock.calls.filter(c => c.body?.requests?.some(r => r.updateCells));
  assert.equal(writes.length, 1);
  const requests = writes[0].body.requests;
  const clearedIds = requests.filter(r => r.repeatCell).map(r => r.repeatCell.range.sheetId);
  assert(!clearedIds.includes(99));
  assert(clearedIds.includes(100));
  assert(clearedIds.includes(101));
  assert.deepEqual(new Set(clearedIds), new Set(requests.filter(r => r.updateCells).map(r => r.updateCells.start.sheetId)));
  assert(!mock.sheets.some(s => s.properties.title === '法事予約'));
  assert(!mock.sheets.some(s => s.properties.title === '操作・削除履歴'));
});

test('selected-table export never clears or writes another table', async () => {
  const mock = sheetMock();
  await runExport(mock, { targetTablesOnly: ['法事予約'] });
  const writes = mock.calls.filter(c => c.body?.requests?.some(r => r.updateCells));
  assert.equal(writes.length, 1);
  for (const request of writes[0].body.requests) {
    assert.equal(request.repeatCell?.range.sheetId ?? request.updateCells?.start.sheetId, 100);
  }
});

test('rejected/oversized export never sends a separate destructive clear', async () => {
  for (const status of [400, 413]) {
    const mock = sheetMock(status);
    await assert.rejects(runExport(mock));
    assert(!mock.calls.some(c => c.url.includes('batchClear') || c.url.endsWith(':clear')));
  }
});

test('replacement preserves literal text, numeric amounts and quoted sheet names', () => {
  const { buildSheetReplacementRequests } = source('src/utils/sheetsExportUtils.ts');
  const requests = buildSheetReplacementRequests([{ range: "'マスタ_O''Brien'!A1001", values: [['09012345678', '=1+1', 5000, '', null, '行1\n行2']] }],
    [{ title: "マスタ_O'Brien", sheetId: 12, rowCount: 2000, columnCount: 30 }]);
  const update = requests[1].updateCells;
  assert.equal(update.start.rowIndex, 1000);
  assert.deepEqual(update.rows[0].values.map(c => c.userEnteredValue), [
    { stringValue: '09012345678' }, { stringValue: '=1+1' }, { numberValue: 5000 }, undefined, undefined, { stringValue: '行1\n行2' },
  ]);
});

test('storage waits for commit, rejects abort and retries the latest failed data', async () => {
  const originalWindow = global.window;
  const transactions = [];
  const saved = new Map();
  global.window = { indexedDB: { open() {
    const open = {};
    queueMicrotask(() => { open.result = { close() {}, transaction() {
      const tx = { objectStore() { return { put(value, key) {
        const request = {};
        tx.commit = () => { saved.set(key, value); tx.oncomplete?.(); };
        tx.fail = () => { tx.error = new Error('simulated quota abort'); tx.onabort?.(); };
        queueMicrotask(() => request.onsuccess?.());
        return request;
      } }; } };
      transactions.push(tx);
      return tx;
    } }; open.onsuccess(); });
    return open;
  } } };
  const storage = source('src/utils/storageUtils.ts');
  const tick = () => new Promise(resolve => setImmediate(resolve));
  try {
    let done = false;
    const writing = storage.idbSet('temple_households', ['first']).then(() => { done = true; });
    await tick();
    assert.equal(done, false, 'request success must not imply durable commit');
    transactions[0].commit();
    await writing;
    const failed = storage.idbSet('temple_households', ['latest']);
    const rejected = assert.rejects(failed, /quota abort/);
    await tick();
    transactions[1].fail();
    await rejected;
    assert.equal(storage.hasStorageFailures(), true);
    assert.deepEqual(saved.get('temple_households'), ['first']);
    const retry = storage.retryFailedStorageWrites();
    await tick();
    transactions[2].commit();
    await retry;
    assert.deepEqual(saved.get('temple_households'), ['latest']);
    assert.equal(storage.hasStorageFailures(), false);
    const oldFailure = storage.idbSet('temple_households', ['old failure']);
    const oldRejected = assert.rejects(oldFailure);
    await tick();
    transactions[3].fail();
    await oldRejected;
    const newEdit = storage.idbSet('temple_households', ['newer edit']);
    await tick();
    const retryDuringEdit = storage.retryFailedStorageWrites();
    await tick();
    transactions[4].commit();
    transactions[5].commit();
    await Promise.all([newEdit, retryDuringEdit]);
    assert.deepEqual(saved.get('temple_households'), ['newer edit']);
  } finally { global.window = originalWindow; }
});

test('legacy SMTP endpoint cannot send mail even with SMTP configured', async () => {
  const routes = new Map();
  const app = { use() {}, get(url, handler) { routes.set('GET '+url, handler); }, post(url, handler) { routes.set('POST '+url, handler); }, listen() {} };
  const express = Object.assign(() => app, { json: () => () => {}, urlencoded: () => () => {}, static: () => () => {} });
  let sends = 0;
  const compiled = ts.transpileModule(fs.readFileSync(path.join(root, 'server.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(compiled, { exports: {}, console, process: { env: { NODE_ENV: 'production', SMTP_HOST: 'example.invalid', SMTP_USER: 'test' }, cwd: () => root }, require(name) {
    if (name === 'express') return express;
    if (name === 'vite') return {};
    if (name === 'dotenv') return { config() {} };
    if (name === 'nodemailer') return { createTransport: () => ({ sendMail: async () => { sends++; return {}; } }) };
    return require(name);
  } });
  const response = { code: 200, body: null, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  await routes.get('POST /api/send-tanagyo-email')({ body: { to: 'someone@example.invalid', html: 'test' } }, response);
  assert.equal(response.code, 410);
  assert.equal(sends, 0);
});
