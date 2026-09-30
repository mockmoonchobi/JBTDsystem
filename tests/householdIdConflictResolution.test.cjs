const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const compile = s => ts.transpileModule(s, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
}).outputText;

require.extensions['.ts'] = (m, f) => m._compile(compile(fs.readFileSync(f, 'utf8')), f);

const { 
  detectHouseholdIdConflicts, 
  createDefaultResolutions 
} = require('../src/utils/householdConflictUtils.ts');

const { 
  convertTableToData 
} = require('../src/utils/externalImportUtils.ts');

test('detectHouseholdIdConflicts identifies both file-file duplicates and file-existing collisions', () => {
  const existingHouseholds = [
    { id: 'DK-00100', familyHead: '山田 太郎', address: '東京都港区1-1', phone: '03-1111-2222', templeId: 'temple-main' },
    { id: 'DK-00200', familyHead: '鈴木 一郎', address: '東京都品川区2-2', phone: '03-3333-4444', templeId: 'temple-main' },
  ];

  const headers = ['ID', '氏名', '住所', '電話'];
  const rawRows = [
    ['DK-00100', '山田 次郎', '埼玉県さいたま市3-3', '048-111-222'], // collision with existing DK-00100
    ['DK-00300', '佐藤 兄', '千葉県千葉市4-4', '043-111-222'],   // duplicate within file with row below
    ['DK-00300', '佐藤 弟', '神奈川県横浜市5-5', '045-111-222'],
    ['DK-00400', '単独 檀家', '東京都世田谷区', '03-5555-6666'], // unique ID
  ];

  const mapping = { id: 'ID', familyHead: '氏名', address: '住所', phone: '電話' };

  const conflicts = detectHouseholdIdConflicts(headers, rawRows, mapping, {
    existingHouseholds,
    targetTempleId: 'temple-main',
    conflictMode: 'append',
  });

  assert.equal(conflicts.length, 2);

  // First conflict on DK-00100 (Existing + File row 0)
  const c100 = conflicts.find(c => c.conflictId === 'DK-00100');
  assert(c100);
  assert.equal(c100.candidates.length, 2);
  assert.equal(c100.candidates[0].source, 'existing');
  assert.equal(c100.candidates[0].familyHead, '山田 太郎');
  assert.equal(c100.candidates[1].source, 'file');
  assert.equal(c100.candidates[1].familyHead, '山田 次郎');

  // Second conflict on DK-00300 (File row 1 + File row 2)
  const c300 = conflicts.find(c => c.conflictId === 'DK-00300');
  assert(c300);
  assert.equal(c300.candidates.length, 2);
  assert.equal(c300.candidates[0].source, 'file');
  assert.equal(c300.candidates[0].familyHead, '佐藤 兄');
  assert.equal(c300.candidates[1].source, 'file');
  assert.equal(c300.candidates[1].familyHead, '佐藤 弟');
});

test('householdConflictResolutions: Secondary added as Family Member to Primary', () => {
  const existingHouseholds = [
    { id: 'DK-00100', familyHead: '山田 太郎', address: '東京都港区1-1', phone: '03-1111-2222', templeId: 'temple-main', familyMembers: [] },
  ];

  const headers = ['ID', '氏名', '住所', '電話'];
  const rawRows = [
    ['DK-00100', '山田 次郎', '埼玉県さいたま市3-3', '048-111-222'], // collision on DK-00100
  ];
  const mapping = { id: 'ID', familyHead: '氏名', address: '住所', phone: '電話' };

  // Resolution: Existing "山田 太郎" is Primary, incoming "山田 次郎" is added as family (弟)
  const resolutions = {
    'DK-00100': {
      conflictId: 'DK-00100',
      primaryCandidateId: 'existing-DK-00100',
      secondaryDecisions: {
        'file-row-0': {
          action: 'add_as_family',
          relationship: '弟',
        }
      }
    }
  };

  const result = convertTableToData('household', headers, rawRows, mapping, {
    existingHouseholds,
    conflictMode: 'append',
    targetTempleId: 'temple-main',
    householdConflictResolutions: resolutions,
  });

  // Exactly 1 household remains with ID DK-00100
  const primaryH = result.households.find(h => h.id === 'DK-00100');
  assert(primaryH);
  assert.equal(primaryH.familyHead, '山田 太郎');

  // "山田 次郎" is in familyMembers of DK-00100!
  assert.equal(primaryH.familyMembers.length, 1);
  assert.equal(primaryH.familyMembers[0].name, '山田 次郎');
  assert.equal(primaryH.familyMembers[0].relationship, '弟');
  assert.equal(primaryH.familyMembers[0].phone, '048-111-222');
  assert.equal(primaryH.familyMembers[0].address, '埼玉県さいたま市3-3');

  // Stats
  assert.equal(result.stats.conflictsResolved, 1);
  assert.equal(result.stats.familyMembersAdded, 1);
  assert.equal(result.stats.householdsCreated, 0);
});

test('householdConflictResolutions: Secondary assigned a New ID (independent household without spirits)', () => {
  const existingHouseholds = [
    { id: 'DK-00100', familyHead: '山田 太郎', address: '東京都港区1-1', templeId: 'temple-main' },
  ];

  const headers = ['ID', '氏名', '住所'];
  const rawRows = [
    ['DK-00100', '山田 次郎', '埼玉県さいたま市3-3'],
  ];
  const mapping = { id: 'ID', familyHead: '氏名', address: '住所' };

  // Resolution: Existing "山田 太郎" is Primary, incoming "山田 次郎" gets new_id
  const resolutions = {
    'DK-00100': {
      conflictId: 'DK-00100',
      primaryCandidateId: 'existing-DK-00100',
      secondaryDecisions: {
        'file-row-0': {
          action: 'new_id',
        }
      }
    }
  };

  const result = convertTableToData('household', headers, rawRows, mapping, {
    existingHouseholds,
    conflictMode: 'append',
    targetTempleId: 'temple-main',
    householdConflictResolutions: resolutions,
  });

  // Two households in result: DK-00100 and a newly generated ID
  assert.equal(result.households.length, 2);
  const original = result.households.find(h => h.id === 'DK-00100');
  assert.equal(original.familyHead, '山田 太郎');

  const newH = result.households.find(h => h.familyHead === '山田 次郎');
  assert(newH);
  assert.notEqual(newH.id, 'DK-00100');
  assert(newH.id.startsWith('DK-'));
  assert.equal(result.stats.conflictsResolved, 1);
  assert.equal(result.stats.householdsCreated, 1);
});

test('householdConflictResolutions: Secondary skipped', () => {
  const existingHouseholds = [
    { id: 'DK-00100', familyHead: '山田 太郎', templeId: 'temple-main' },
  ];

  const headers = ['ID', '氏名'];
  const rawRows = [
    ['DK-00100', '山田 太郎（重複不要行）'],
  ];
  const mapping = { id: 'ID', familyHead: '氏名' };

  const resolutions = {
    'DK-00100': {
      conflictId: 'DK-00100',
      primaryCandidateId: 'existing-DK-00100',
      secondaryDecisions: {
        'file-row-0': {
          action: 'skip',
        }
      }
    }
  };

  const result = convertTableToData('household', headers, rawRows, mapping, {
    existingHouseholds,
    conflictMode: 'append',
    targetTempleId: 'temple-main',
    householdConflictResolutions: resolutions,
  });

  assert.equal(result.households.length, 1);
  assert.equal(result.households[0].familyHead, '山田 太郎');
  assert.equal(result.stats.conflictsResolved, 1);
  assert.equal(result.stats.householdsCreated, 0);
  assert(result.stats.warnings.some(w => w.includes('取り込みをスキップ')));
});

test('householdConflictResolutions: Within-file duplicate resolved with Row 1 as Primary and Row 2 as Family', () => {
  const existingHouseholds = [];
  const headers = ['ID', '氏名', '住所'];
  const rawRows = [
    ['DK-00050', '佐藤 兄', '千葉県千葉市1-1'],
    ['DK-00050', '佐藤 弟', '神奈川県横浜市2-2'],
  ];
  const mapping = { id: 'ID', familyHead: '氏名', address: '住所' };

  const resolutions = {
    'DK-00050': {
      conflictId: 'DK-00050',
      primaryCandidateId: 'file-row-0',
      secondaryDecisions: {
        'file-row-1': {
          action: 'add_as_family',
          relationship: '弟',
        }
      }
    }
  };

  const result = convertTableToData('household', headers, rawRows, mapping, {
    existingHouseholds,
    conflictMode: 'append',
    targetTempleId: 'temple-main',
    householdConflictResolutions: resolutions,
  });

  assert.equal(result.households.length, 1);
  const head = result.households[0];
  assert.equal(head.id, 'DK-00050');
  assert.equal(head.familyHead, '佐藤 兄');
  assert.equal(head.familyMembers.length, 1);
  assert.equal(head.familyMembers[0].name, '佐藤 弟');
  assert.equal(head.familyMembers[0].relationship, '弟');
  assert.equal(head.familyMembers[0].address, '神奈川県横浜市2-2');
});
