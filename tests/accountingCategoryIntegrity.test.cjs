const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function loadTsModule(relPath, extraMocks = {}) {
  const fullPath = path.join(__dirname, '..', relPath);
  const source = fs.readFileSync(fullPath, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;

  const mod = { exports: {} };
  const customRequire = (reqPath) => {
    if (extraMocks[reqPath]) return extraMocks[reqPath];
    if (reqPath === './accountingCategoryUtils') {
      return loadTsModule('src/utils/accountingCategoryUtils.ts');
    }
    return require(reqPath);
  };
  const fn = new Function('require', 'module', 'exports', transpiled);
  fn(customRequire, mod, mod.exports);
  return mod.exports;
}

const catUtils = loadTsModule('src/utils/accountingCategoryUtils.ts');

test('resolveConfiguredCategory strictly uses user-configured categories and never fabricates 法要布施', () => {
  const userCategories = ['祠堂金', '維持費', '特別志納'];
  assert.equal(catUtils.resolveConfiguredCategory('法要布施', userCategories), '祠堂金');
  assert.equal(catUtils.resolveConfiguredCategory('', userCategories), '祠堂金');
  assert.equal(catUtils.resolveConfiguredCategory(undefined, userCategories), '祠堂金');
  assert.equal(catUtils.resolveConfiguredCategory('維持費', userCategories), '維持費');
  assert.equal(catUtils.resolveConfiguredCategory(' 祠堂金 ', userCategories), '祠堂金');

  // Another user's completely different configuration
  const otherUserCategories = ['御供養料', '境内維持費'];
  assert.equal(catUtils.resolveConfiguredCategory('祠堂金', otherUserCategories), '御供養料');
  assert.equal(catUtils.resolveConfiguredCategory('法要布施', otherUserCategories), '御供養料');

  // Empty master configuration must return '' rather than any hardcoded category
  assert.equal(catUtils.resolveConfiguredCategory('法要布施', []), '');
  assert.equal(catUtils.resolveConfiguredCategory('', []), '');
});

test('resolveKeywordConfiguredCategory never returns strings outside configured list', () => {
  const custom = ['祠堂金', '年忌志納', '本堂維持'];
  assert.equal(catUtils.resolveKeywordConfiguredCategory(custom, ['護持', '会費'], 1), '年忌志納');
  assert.equal(catUtils.resolveKeywordConfiguredCategory(custom, ['寄付'], 2), '本堂維持');
  assert.equal(catUtils.resolveKeywordConfiguredCategory(custom, ['維持'], 0), '本堂維持');
  assert.equal(catUtils.resolveKeywordConfiguredCategory([], ['布施'], 0), '');
});

test('getEditCategoryOptions exposes non-master existing category so selecting 1st configured item triggers onChange', () => {
  const configured = ['祠堂金', '維持費'];
  const res = catUtils.getEditCategoryOptions('法要布施', configured);
  assert.equal(res.isExternal, true);
  assert.equal(res.currentValue, '法要布施');
  assert.deepEqual(res.options, ['法要布施', '祠堂金', '維持費']);

  const resConfigured = catUtils.getEditCategoryOptions('祠堂金', configured);
  assert.equal(resConfigured.isExternal, false);
  assert.equal(resConfigured.currentValue, '祠堂金');
  assert.deepEqual(resConfigured.options, ['祠堂金', '維持費']);

  const resEmpty = catUtils.getEditCategoryOptions('', configured);
  assert.equal(resEmpty.isExternal, false);
  assert.equal(resEmpty.currentValue, '');
  assert.deepEqual(resEmpty.options, ['祠堂金', '維持費']);
});

test('parseTypedCategoryValue preserves colons inside category names', () => {
  assert.deepEqual(catUtils.parseTypedCategoryValue('収入:祠堂金'), { type: '収入', category: '祠堂金' });
  assert.deepEqual(catUtils.parseTypedCategoryValue('収入:特別:祠堂金'), { type: '収入', category: '特別:祠堂金' });
  assert.deepEqual(catUtils.parseTypedCategoryValue('支出:営繕:本堂'), { type: '支出', category: '営繕:本堂' });
  assert.deepEqual(catUtils.parseTypedCategoryValue('収入:'), { type: '収入', category: '' });
});

test('buildFiscalCategorySummary computes every recorded category including non-master and 科目未設定収入/支出', () => {
  const configuredIncome = ['祠堂金', '維持費'];
  const configuredExpense = ['光熱費', '修繕費'];
  const txs = [
    { id: '1', type: '収入', category: '祠堂金', amount: 30000 },
    { id: '2', type: '収入', category: ' 祠堂金 ', amount: 10000 },
    { id: '3', type: '収入', category: '法要布施', amount: 50000 }, // non-master
    { id: '4', type: '収入', category: '', amount: 5000 }, // unset
    { id: '5', type: '収入', category: '   ', amount: 2000 }, // unset whitespace
    { id: '6', type: '支出', category: '光熱費', amount: 12000 },
    { id: '7', type: '支出', category: '旧管理費', amount: 8000 }, // non-master
    { id: '8', type: '支出', category: '', amount: 3000 }, // unset
  ];

  const summary = catUtils.buildFiscalCategorySummary(txs, configuredIncome, configuredExpense);

  // Configured categories appear first in configured order, followed by all recorded extra/unset categories
  assert.deepEqual(summary.incomeDisplayCategories, ['祠堂金', '維持費', '法要布施', '科目未設定収入']);
  assert.deepEqual(summary.expenseDisplayCategories, ['光熱費', '修繕費', '旧管理費', '科目未設定支出']);

  assert.equal(summary.incomeCategoryTotals['祠堂金'], 40000);
  assert.equal(summary.incomeCategoryTotals['維持費'], 0);
  assert.equal(summary.incomeCategoryTotals['法要布施'], 50000);
  assert.equal(summary.incomeCategoryTotals['科目未設定収入'], 7000);
  assert.equal(summary.operationalIncome, 97000);

  assert.equal(summary.expenseCategoryTotals['光熱費'], 12000);
  assert.equal(summary.expenseCategoryTotals['修繕費'], 0);
  assert.equal(summary.expenseCategoryTotals['旧管理費'], 8000);
  assert.equal(summary.expenseCategoryTotals['科目未設定支出'], 3000);
  assert.equal(summary.totalExpense, 23000);

  // Strict accounting invariant: sum of all displayed rows === operational total
  const sumDisplayedIncome = summary.incomeDisplayCategories.reduce(
    (acc, cat) => acc + (summary.incomeCategoryTotals[cat] || 0),
    0
  );
  const sumDisplayedExpense = summary.expenseDisplayCategories.reduce(
    (acc, cat) => acc + (summary.expenseCategoryTotals[cat] || 0),
    0
  );
  assert.equal(sumDisplayedIncome, summary.operationalIncome);
  assert.equal(sumDisplayedExpense, summary.totalExpense);
});

test('batchAccountingUtils strictly respects user-configured income categories and preserves empty cells', () => {
  const batchUtils = loadTsModule('src/utils/batchAccountingUtils.ts', {
    './storageUtils': { safeStorage: {}, loadJsonState: () => null, saveJsonState: () => {} },
    './memorialCalculator': {
      formatJapaneseEraDate: (d) => d,
      getHouseholdSponsorName: () => '',
      getHouseholdSponsorInfo: () => ({}),
    },
  });

  const temple = {
    id: 'temple-main',
    tobaType1: '施餓鬼塔婆',
    feeType1: '年間維持',
    masterOptions: {
      incomeCategories: ['祠堂金', '寺門維持費', '志納金'],
    },
  };

  const cfg = batchUtils.getDefaultBatchAccountingConfig(temple);
  assert.equal(cfg.cat1, '祠堂金');
  assert.equal(cfg.cat2, '祠堂金');
  assert.equal(cfg.cat3, '志納金');

  // Empty master categories -> never fabricates '法要布施'
  const emptyCfg = batchUtils.getDefaultBatchAccountingConfig({ id: 'temple-empty', tobaType1: '塔婆' }, []);
  assert.equal(emptyCfg.cat1, '');
  assert.equal(emptyCfg.cat2, '');
  assert.equal(emptyCfg.cat3, '');

  // Sheet parsing preserves blank category cells
  const parsed = batchUtils.parseBatchAccountingConfigFromRows([
    ['設定ID', '受付日付', '項目1勘定科目', '項目2勘定科目', '項目3勘定科目'],
    ['config-1', '2026/05/01', '', '', ''],
  ]);
  assert.equal(parsed.cat1, '');
  assert.equal(parsed.cat2, '');
  assert.equal(parsed.cat3, '');
});

test('Google Sheets & Excel transaction readers do not silently fill blank categories with 法要布施', () => {
  const sheetsSrc = fs.readFileSync(path.join(__dirname, '../src/lib/googleSheets.ts'), 'utf8');
  const excelSrc = fs.readFileSync(path.join(__dirname, '../src/utils/excelUtils.ts'), 'utf8');
  assert.ok(!sheetsSrc.includes("|| '法要布施'"), 'googleSheets.ts must not substitute 法要布施 for blank categories');
  assert.ok(!excelSrc.includes("? '法要布施' : '管理費'"), 'excelUtils.ts must not substitute 法要布施/管理費 for blank categories');
});
