const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.join(__dirname, '..');

// Transpile dankaIdUtils.ts to JS for testing
const dankaIdUtilsSource = fs.readFileSync(path.join(root, 'src/utils/dankaIdUtils.ts'), 'utf8');
const compiledDankaIdUtils = ts.transpileModule(dankaIdUtilsSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;

const dankaIdModule = { exports: {} };
const fn = new Function('require', 'module', 'exports', compiledDankaIdUtils);
fn(require, dankaIdModule, dankaIdModule.exports);

const {
  getUnlinkedHouseholdId,
  isUnlinkedHouseholdId,
  cleanAndNormalizeHouseholdId,
  generateNewHouseholdId,
  UNLINKED_HOUSEHOLD_ID
} = dankaIdModule.exports;

test('getUnlinkedHouseholdId returns temple-specific reserved 99999 IDs', () => {
  const temples = [
    { id: 'temple-main', name: '本寺' },
    { id: 'temple-k0', name: '兼務寺1' },
    { id: 'temple-k1', name: '兼務寺2' },
  ];

  // 本寺 -> DK-99999
  assert.equal(getUnlinkedHouseholdId('temple-main', temples), 'DK-99999');
  assert.equal(getUnlinkedHouseholdId(undefined, temples), 'DK-99999');

  // 兼務寺 -> K0-99999, K1-99999
  assert.equal(getUnlinkedHouseholdId('temple-k0', temples), 'K0-99999');
  assert.equal(getUnlinkedHouseholdId('temple-k1', temples), 'K1-99999');
});

test('isUnlinkedHouseholdId accurately detects all unlinked representations', () => {
  assert.equal(isUnlinkedHouseholdId('DK-99999'), true);
  assert.equal(isUnlinkedHouseholdId('K0-99999'), true);
  assert.equal(isUnlinkedHouseholdId('K1-99999'), true);
  assert.equal(isUnlinkedHouseholdId('K2-99999'), true);
  assert.equal(isUnlinkedHouseholdId('99999'), true);
  assert.equal(isUnlinkedHouseholdId('UNLINKED'), true);
  assert.equal(isUnlinkedHouseholdId('DK-UNLINKED'), true);

  // 通常の檀家IDは未設定とは判定しない
  assert.equal(isUnlinkedHouseholdId('DK-00001'), false);
  assert.equal(isUnlinkedHouseholdId('K0-00001'), false);
  assert.equal(isUnlinkedHouseholdId('DK-00123'), false);
});

test('generateNewHouseholdId never generates 99999 and avoids potential conflicts', () => {
  const temples = [
    { id: 'temple-main', name: '本寺' },
    { id: 'temple-k0', name: '兼務寺1' },
  ];

  // 空の世帯リストから本寺新規ID採番
  const id1 = generateNewHouseholdId('temple-main', [], temples);
  assert.equal(id1, 'DK-00001');

  // 兼務寺新規ID採番
  const idK0 = generateNewHouseholdId('temple-k0', [], temples);
  assert.equal(idK0, 'K0-00001');

  // 未設定ID (DK-99999) が精霊レコードや世帯に存在していても、通常採番は連番から行われること
  const existingPastRecords = [
    { id: 'P1', householdId: 'DK-99999' },
    { id: 'P2', householdId: 'DK-00001' },
  ];
  const existingHouseholds = [
    { id: 'DK-00001', familyHead: '山田' }
  ];

  const nextId = generateNewHouseholdId('temple-main', existingHouseholds, temples, existingPastRecords);
  assert.equal(nextId, 'DK-00002');
  assert.notEqual(nextId, 'DK-99999');
});
