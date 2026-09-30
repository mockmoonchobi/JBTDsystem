const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const ts = require('typescript');

const compile = (s) =>
  ts.transpileModule(s, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;

require.extensions['.ts'] = (m, f) => m._compile(compile(fs.readFileSync(f, 'utf8')), f);

const {
  buildInitialLineageMap,
  evaluateItemMatch,
  registerConfirmedSpiritToLineage,
  extractGivenName,
  extractSurname,
} = require('../src/utils/kakochoLineageMatching.ts');

test('extractGivenName and extractSurname parse names correctly', () => {
  assert.equal(extractSurname('佐藤 太郎'), '佐藤');
  assert.equal(extractGivenName('佐藤 太郎'), '太郎');
  assert.equal(extractSurname('萩原宏一'), '萩原');
  assert.equal(extractGivenName('萩原宏一'), '宏一');
  assert.equal(extractSurname('山田花'), '山田');
  assert.equal(extractGivenName('山田花'), '花');
});

test('Household notes partial match with sponsor surname or given name boosts confidence by +10%', () => {
  // Household has married daughter "鈴木 花子", notes mention "実家: 佐藤家。連絡先長男: 太郎"
  const households = [
    {
      id: 'DK-0001',
      templeId: 'temple-main',
      familyHead: '鈴木 花子',
      notes: '実家: 佐藤家。連絡先長男: 太郎（横浜在住）',
    },
    {
      id: 'DK-0002',
      templeId: 'temple-main',
      familyHead: '伊藤 一郎',
      notes: '',
    },
  ];

  const lineageMap = buildInitialLineageMap(households, [], 'temple-main');

  // Past record with sponsor "佐藤 健一" (surname "佐藤" matches in DK-0001 notes!)
  const itemSurnameMatch = {
    index: 0,
    rowIdx: 0,
    dharmaName: '釋法然信士',
    secularName: '佐藤 祖父',
    householdHeadName: '佐藤 健一',
    rawRow: [],
  };

  const candidatesSurname = evaluateItemMatch(itemSurnameMatch, lineageMap, 'temple-main');
  const candSurname = candidatesSurname.find((c) => c.household.id === 'DK-0001');
  assert(candSurname);
  assert.equal(candSurname.confidenceScore, 12, 'Should get 12% match from notes surname partial match');
  assert(candSurname.title.includes('名簿備考欄と施主の姓が一致（+10%）'));

  // Past record with sponsor "高橋 太郎" (given name "太郎" matches in DK-0001 notes!)
  const itemGivenNameMatch = {
    index: 1,
    rowIdx: 1,
    dharmaName: '釋清信士',
    secularName: '高橋 祖父',
    householdHeadName: '高橋 太郎',
    rawRow: [],
  };

  const candidatesGiven = evaluateItemMatch(itemGivenNameMatch, lineageMap, 'temple-main');
  const candGiven = candidatesGiven.find((c) => c.household.id === 'DK-0001');
  assert(candGiven);
  assert.equal(candGiven.confidenceScore, 12, 'Should get 12% match from notes given name partial match');
  assert(candGiven.title.includes('名簿備考欄と施主の名が一致（+10%）'));
});

test('Confirming a spirit dynamically links older spirits whose sponsor matches the confirmed sponsor (芋づる式・家系連動)', () => {
  // Household head in roster is married daughter "鈴木 花子"
  const households = [
    {
      id: 'DK-0010',
      templeId: 'temple-main',
      familyHead: '鈴木 花子',
      notes: '旧姓: 佐藤',
    },
    {
      id: 'DK-0020',
      templeId: 'temple-main',
      familyHead: '田中 次郎',
      notes: '',
    },
  ];

  const lineageMap = buildInitialLineageMap(households, [], 'temple-main');

  // Recent spirit (died 2010), sponsor "佐藤 太郎" (living far away)
  const recentSpirit = {
    dharmaName: '釋清明居士',
    secularName: '佐藤 清',
    deathDate: '2010-04-12',
    deathYear: 2010,
    householdHeadName: '佐藤 太郎',
  };

  // Older spirit (died 1980), sponsor was ALSO "佐藤 太郎"!
  const olderSpirit1 = {
    index: 1,
    rowIdx: 1,
    dharmaName: '釋妙華大姉',
    secularName: '佐藤 ハナ',
    deathDate: '1980-09-20',
    deathYear: 1980,
    householdHeadName: '佐藤 太郎',
    rawRow: [],
  };

  // Before confirmation, olderSpirit1 matches DK-0010 with only 12% (notes partial match) or 0%
  const candidatesBefore = evaluateItemMatch(olderSpirit1, lineageMap, 'temple-main');
  const topBefore = candidatesBefore.find((c) => c.household.id === 'DK-0010');
  assert(topBefore.confidenceScore < 80, 'Score should be low before confirmation');

  // NOW the user confirms recentSpirit to household DK-0010!
  registerConfirmedSpiritToLineage(lineageMap, 'DK-0010', recentSpirit);

  // Recalculate olderSpirit1 against the updated lineage map
  const candidatesAfter = evaluateItemMatch(olderSpirit1, lineageMap, 'temple-main');
  const topAfter = candidatesAfter[0];

  assert(topAfter, 'Top candidate must exist');
  assert.equal(topAfter.household.id, 'DK-0010');
  assert.equal(topAfter.confidenceScore, 95, 'Should jump to 95% due to confirmed spirit sponsor match');
  assert(topAfter.title.includes('家系連動'));
  assert(topAfter.explanation.includes('先に確定された精霊'));

  // Test an even older spirit (died 1960), whose sponsor was "佐藤 清" (secular name of recentSpirit!)
  const olderSpirit2 = {
    index: 2,
    rowIdx: 2,
    dharmaName: '釋道真信士',
    secularName: '佐藤 忠',
    deathDate: '1960-03-01',
    deathYear: 1960,
    householdHeadName: '佐藤 清',
    rawRow: [],
  };

  const candidatesAfter2 = evaluateItemMatch(olderSpirit2, lineageMap, 'temple-main');
  const topAfter2 = candidatesAfter2[0];
  assert.equal(topAfter2.household.id, 'DK-0010');
  assert.equal(topAfter2.confidenceScore, 90, 'Ancestor secular name match should be 90%');

  // Test another older spirit with same confirmed surname "佐藤" (no head name)
  const olderSpirit3 = {
    index: 3,
    rowIdx: 3,
    dharmaName: '釋順信士',
    secularName: '佐藤 勝',
    deathDate: '1950-01-10',
    deathYear: 1950,
    rawRow: [],
  };

  const candidatesAfter3 = evaluateItemMatch(olderSpirit3, lineageMap, 'temple-main');
  const candAfter3 = candidatesAfter3.find((c) => c.household.id === 'DK-0010');
  assert.equal(candAfter3.confidenceScore, 45, 'Confirmed surname should match with 45% (same as other same-surname candidates)');
});
