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
  buildTempleFullNameCounts,
  buildTempleSurnameCounts,
} = require('../src/utils/kakochoLineageMatching.ts');

test('同姓同名の檀家が名簿に複数いた場合、両家とも適合度50%にする', () => {
  // Two households in the same temple with the EXACT same name "山田 太郎"
  const households = [
    {
      id: 'DK-0001',
      templeId: 'temple-main',
      familyHead: '山田 太郎',
      furigana: 'ヤマダ タロウ',
      address: '東京都港区赤坂1-1',
    },
    {
      id: 'DK-0002',
      templeId: 'temple-main',
      familyHead: '山田 太郎',
      furigana: 'ヤマダ タロウ',
      address: '東京都世田谷区桜丘2-2',
    },
    {
      id: 'DK-0003',
      templeId: 'temple-main',
      familyHead: '鈴木 次郎',
      furigana: 'スズキ ジロウ',
    },
  ];

  const lineageMap = buildInitialLineageMap(households, [], 'temple-main');

  // Past record where sponsor is "山田 太郎"
  const item = {
    index: 0,
    rowIdx: 0,
    dharmaName: '釋清信士',
    secularName: '山田 正男',
    householdHeadName: '山田 太郎',
    rawRow: [],
  };

  const candidates = evaluateItemMatch(item, lineageMap, 'temple-main');

  const cand1 = candidates.find((c) => c.household.id === 'DK-0001');
  const cand2 = candidates.find((c) => c.household.id === 'DK-0002');

  assert(cand1, 'DK-0001 should be a candidate');
  assert(cand2, 'DK-0002 should be a candidate');

  // User requirement: "同姓同名の檀家がいた時の処理は、両家とも５０％にしてください。"
  assert.equal(cand1.confidenceScore, 50, 'DK-0001 should have exactly 50%');
  assert.equal(cand2.confidenceScore, 50, 'DK-0002 should have exactly 50%');
  assert(cand1.title.includes('同姓同名檀家（両家50%）'));
  assert(cand2.title.includes('同姓同名檀家（両家50%）'));

  // Neither should be >= 80% (which would falsely mark one as recommended)
  assert.equal(candidates[0].confidenceScore, 50);
});

test('檀家名簿の施主と俗名の姓の一致も45%として判定される', () => {
  const households = [
    {
      id: 'DK-0010',
      templeId: 'temple-main',
      familyHead: '佐藤 健太',
      furigana: 'サトウ ケンタ',
    },
    {
      id: 'DK-0011',
      templeId: 'temple-main',
      familyHead: '佐藤 次郎',
      furigana: 'サトウ ジロウ',
    },
    {
      id: 'DK-0020',
      templeId: 'temple-main',
      familyHead: '高橋 勇気',
      furigana: 'タカハシ ユウキ',
    },
    {
      id: 'DK-0021',
      templeId: 'temple-main',
      familyHead: '高橋 誠一',
      furigana: 'タカハシ セイイチ',
    },
    {
      id: 'DK-0030',
      templeId: 'temple-main',
      familyHead: '鈴木 忠雄',
      furigana: 'スズキ タダオ',
    },
  ];

  const lineageMap = buildInitialLineageMap(households, [], 'temple-main');

  // Case 1: Past record has NO sponsor name, but deceased secular name is "佐藤 一郎"
  // It should match "佐藤 健太" with 45% based on secular name surname!
  const itemNoSponsor = {
    index: 0,
    rowIdx: 0,
    dharmaName: '釋法円信士',
    secularName: '佐藤 一郎',
    rawRow: [],
  };

  const candidates1 = evaluateItemMatch(itemNoSponsor, lineageMap, 'temple-main');
  const candSato1 = candidates1.find((c) => c.household.id === 'DK-0010');
  assert(candSato1, 'Household DK-0010 should match on secular surname 佐藤');
  assert.equal(candSato1.confidenceScore, 45, 'Secular surname match should be 45%');
  assert(candSato1.title.includes('俗名同姓檀家候補'));
  assert(candSato1.explanation.includes('佐藤'));

  // Case 2: Past record has sponsor "高橋 誠" AND secular name "佐藤 一郎"
  // DK-0020 matches sponsor surname "高橋" (45%)
  // DK-0010 matches secular surname "佐藤" (45%)
  const itemDifferentSponsor = {
    index: 1,
    rowIdx: 1,
    dharmaName: '釋清華大姉',
    secularName: '佐藤 一郎',
    householdHeadName: '高橋 誠',
    rawRow: [],
  };

  const candidates2 = evaluateItemMatch(itemDifferentSponsor, lineageMap, 'temple-main');
  const candTakahashi = candidates2.find((c) => c.household.id === 'DK-0020');
  const candSato2 = candidates2.find((c) => c.household.id === 'DK-0010');

  assert(candTakahashi, 'DK-0020 should match sponsor surname 高橋');
  assert.equal(candTakahashi.confidenceScore, 45);

  assert(candSato2, 'DK-0010 should match secular surname 佐藤');
  assert.equal(candSato2.confidenceScore, 45);
  assert(candSato2.title.includes('俗名同姓檀家候補'));
});
