const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), ts = require('typescript');

const root = path.resolve(__dirname, '..');

// Set up window & localStorage mock for Node environment
const storageStore = new Map();
global.window = {
  localStorage: {
    getItem: (key) => storageStore.get(key) ?? null,
    setItem: (key, val) => storageStore.set(key, String(val)),
    removeItem: (key) => storageStore.delete(key),
    clear: () => storageStore.clear(),
    get length() { return storageStore.size; },
    key: (i) => Array.from(storageStore.keys())[i],
  },
  sessionStorage: {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  },
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => true,
};

require.cache[path.join(root, 'src/lib/googleAuth.ts')] = {
  exports: { getCurrentUser: () => null, getActiveGoogleAccountName: () => '' },
};

const compile = (source) =>
  ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
require.extensions['.ts'] = (m, file) => m._compile(compile(fs.readFileSync(file, 'utf8')), file);

const { saveDeletedRecordsLog, loadDeletedRecordsLog, clearDeletedRecordsLog } = require('../src/utils/deletedRecordsLog.ts');
const { clearAllStartupCaches } = require('../src/utils/startupCleanup.ts');
const { safeStorage } = require('../src/utils/storageUtils.ts');

test('clearDeletedRecordsLog resets storage and in-memory deleted records', () => {
  saveDeletedRecordsLog([
    {
      id: 'hh-1',
      entityType: 'household',
      actionType: 'delete',
      label: '田中家 削除',
      deletedAt: '2026/10/25 10:00:00',
      deletedTimestamp: Date.now(),
      operator: 'Google連携ユーザー',
      deviceInfo: 'PC',
    },
  ]);
  assert.equal(loadDeletedRecordsLog().length, 1);

  clearDeletedRecordsLog();
  assert.equal(loadDeletedRecordsLog().length, 0);
  assert.equal(loadDeletedRecordsLog().length, 0);
});

test('clearAllStartupCaches purges operation history and temporary caches', async () => {
  // Populate simulated caches
  saveDeletedRecordsLog([
    {
      id: 'past-99',
      entityType: 'pastRecord',
      actionType: 'create',
      label: '過去帳追加：釈迦如来',
      deletedAt: '2026/10/25 12:00:00',
      deletedTimestamp: Date.now(),
      operator: 'Google連携ユーザー',
    },
  ]);
  safeStorage.setItem('household_sort_key', 'familyHead');
  safeStorage.setItem('household_sort_order', 'desc');

  assert.equal(loadDeletedRecordsLog().length, 1);
  assert.equal(safeStorage.getItem('household_sort_key'), 'familyHead');

  await clearAllStartupCaches();

  assert.equal(loadDeletedRecordsLog().length, 0);
  assert.equal(safeStorage.getItem('household_sort_key'), null);
  assert.equal(safeStorage.getItem('household_sort_order'), null);
});
