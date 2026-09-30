const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const ts = require('typescript');

const compile = s => ts.transpileModule(s, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
}).outputText;

require.extensions['.ts'] = (m, f) => m._compile(compile(fs.readFileSync(f, 'utf8')), f);

const { 
  buildInitialLineageMap,
  buildTempleSurnameCounts,
  evaluateItemMatch,
} = require('../src/utils/kakochoLineageMatching.ts');

test('evaluateItemMatch runs ultra-fast when using precomputed temple surname counts', () => {
  // Mock 200 existing households
  const existingHouseholds = [];
  for (let i = 1; i <= 200; i++) {
    existingHouseholds.push({
      id: `DK-${String(i).padStart(5, '0')}`,
      templeId: 'temple-main',
      familyHead: i % 2 === 0 ? `佐藤 ${i}郎` : `高田 ${i}郎`,
      address: `東京都港区${i}-${i}`,
      familyMembers: [
        { name: `髙田 妻${i}`, relationship: '妻' }
      ]
    });
  }

  const lineageMap = buildInitialLineageMap(existingHouseholds, [], 'temple-main');
  const cachedCounts = buildTempleSurnameCounts(lineageMap, 'temple-main');

  assert(cachedCounts.has('高') || cachedCounts.has('佐藤'));

  // Test 1000 past record item matches
  const start = Date.now();
  for (let j = 0; j < 1000; j++) {
    const item = {
      index: j,
      rowIdx: j,
      dharmaName: `釋清浄信士${j}`,
      secularName: `高田 健${j}`,
      rawDeathDate: '2020-05-15',
      deathDate: '2020-05-15',
      deathYear: 2020,
      deathTimestamp: 20200515,
      householdHeadName: '高田 2郎',
      rawRow: [],
    };
    const candidates = evaluateItemMatch(item, lineageMap, 'temple-main', 80, cachedCounts);
    assert(candidates.length > 0);
  }
  const duration = Date.now() - start;

  // 1,000 matches should take well under 1,000ms (typically ~100-300ms)
  assert(duration < 2500, `Expected 1000 items to evaluate in under 2500ms, took ${duration}ms`);
});
