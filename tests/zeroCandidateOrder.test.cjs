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
  toHiraganaKey,
} = require('../src/utils/kakochoLineageMatching.ts');

test('toHiraganaKey properly converts katakana to hiragana and strips spaces', () => {
  assert.equal(toHiraganaKey('アイダ タロウ'), 'あいだたろう');
  assert.equal(toHiraganaKey('さとう じろう'), 'さとうじろう');
  assert.equal(toHiraganaKey(''), '');
});

test('evaluateItemMatch NEVER returns 0 candidates when households exist', () => {
  const households = [
    { id: 'DK-0001', templeId: 'temple-main', familyHead: '渡辺 太郎', furigana: 'ワタナベ タロウ' },
    { id: 'DK-0002', templeId: 'temple-main', familyHead: '相田 一郎', furigana: 'アイダ イチロウ' },
    { id: 'DK-0003', templeId: 'temple-main', familyHead: '伊藤 次郎', furigana: 'イトウ ジロウ' },
    { id: 'DK-0004', templeId: 'temple-main', familyHead: '上野 三郎', furigana: 'ウエノ サブロウ' },
    { id: 'DK-0005', templeId: 'temple-main', familyHead: '江口 四郎', furigana: 'エグチ シロウ' },
    { id: 'DK-0006', templeId: 'temple-main', familyHead: '太田 五郎', furigana: 'オオタ ゴロウ' },
  ];

  const lineageMap = buildInitialLineageMap(households, [], 'temple-main');

  // Completely unrelated past record (no matches possible)
  const item = {
    index: 0,
    rowIdx: 0,
    dharmaName: '釋法然信士',
    secularName: '鈴木 健',
    householdHeadName: '鈴木 忠男',
    rawRow: [],
  };

  const candidates = evaluateItemMatch(item, lineageMap, 'temple-main');

  // Candidate count must NOT be 0! It should contain all 6 households.
  assert.equal(candidates.length, 6);

  // All should have 0% confidence
  for (const c of candidates) {
    assert.equal(c.confidenceScore, 0);
    assert.equal(c.matchType, 'none');
  }

  // They must be sorted in exact 五十音順 (あいうえお順):
  // 相田 (アイダ) -> 伊藤 (イトウ) -> 上野 (ウエノ) -> 江口 (エグチ) -> 太田 (オオタ) -> 渡辺 (ワタナベ)
  const heads = candidates.map((c) => c.household.familyHead);
  assert.deepEqual(heads, [
    '相田 一郎',
    '伊藤 次郎',
    '上野 三郎',
    '江口 四郎',
    '太田 五郎',
    '渡辺 太郎',
  ]);
});

test('evaluateItemMatch displays ALL candidates with identical probabilities and does not cut them off', () => {
  // Create 15 households with identical surname '佐藤'
  const households = [];
  for (let i = 1; i <= 15; i++) {
    households.push({
      id: `DK-${String(i).padStart(4, '0')}`,
      templeId: 'temple-main',
      familyHead: `佐藤 ${String.fromCharCode(64 + i)}男`, // 佐藤 A男, 佐藤 B男...
      furigana: `サトウ ${i}`,
    });
  }

  // Add 1 household with completely different surname
  households.push({
    id: 'DK-9999',
    templeId: 'temple-main',
    familyHead: '青木 太郎',
    furigana: 'アオキ タロウ',
  });

  const lineageMap = buildInitialLineageMap(households, [], 'temple-main');

  const item = {
    index: 0,
    rowIdx: 0,
    dharmaName: '釋信士',
    secularName: '佐藤 健',
    householdHeadName: '佐藤 祖父',
    rawRow: [],
  };

  const candidates = evaluateItemMatch(item, lineageMap, 'temple-main');

  // All 15 佐藤 households should match same surname (e.g. 45%), plus 青木 at 0%
  const satoCandidates = candidates.filter((c) => c.confidenceScore > 0);
  assert.equal(satoCandidates.length, 15, 'All 15 same-probability candidates must be present, never capped at 8');

  // All 16 households total must be present
  assert.equal(candidates.length, 16);

  // The last candidate is 青木 at 0%
  assert.equal(candidates[15].household.familyHead, '青木 太郎');
  assert.equal(candidates[15].confidenceScore, 0);
});
