const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const ts = require('typescript');

// Inspect googleSheets.ts and excelUtils.ts to ensure loose 'マスタ' is not in findSheet master aliases
test('masterSheetName lookup does not use loose aliases that substring-match per-temple sheets', () => {
  const gsSource = fs.readFileSync('src/lib/googleSheets.ts', 'utf8');
  const xlSource = fs.readFileSync('src/utils/excelUtils.ts', 'utf8');

  // Should NOT contain loose 'マスタ', 'マスター', '設定' in masterSheetName lookup
  assert.match(gsSource, /const masterSheetName = findSheet\(\['マスタ設定（総合）', 'マスタ設定'\]\);/);
  assert.match(xlSource, /const masterSheetName = findSheet\(\['マスタ設定（総合）', 'マスタ設定'\]\);/);
});

test('per-temple master sheet parsing does not default to temple-main on unmatched sheet name', () => {
  const gsSource = fs.readFileSync('src/lib/googleSheets.ts', 'utf8');
  const xlSource = fs.readFileSync('src/utils/excelUtils.ts', 'utf8');

  // Check that matchedId is initialized to null
  assert.match(gsSource, /let matchedId:\s*string\s*\|\s*null\s*=\s*null;/);
  assert.match(xlSource, /let matchedId:\s*string\s*\|\s*null\s*=\s*null;/);

  // Check that only matchedId writes into templeMasterOptionsMap
  assert.match(gsSource, /if\s*\(matchedId\)\s*\{\s*templeMasterOptionsMap\[matchedId\]\s*=\s*parsed;\s*\}/);
  assert.match(xlSource, /if\s*\(matchedId\)\s*\{\s*templeMasterOptionsMap\[matchedId\]\s*=\s*parsed;\s*\}/);
});

test('placeholder temporary branch temple 新兼務寺院 does not export master sheets', () => {
  const gsSource = fs.readFileSync('src/lib/googleSheets.ts', 'utf8');
  const xlSource = fs.readFileSync('src/utils/excelUtils.ts', 'utf8');

  assert.match(gsSource, /if \(!t\.isMain && \(t\.name === '新兼務寺院' \|\| !t\.name\?\.trim\(\)\)\) return;/);
  assert.match(xlSource, /if \(!t\.isMain && \(t\.name === '新兼務寺院' \|\| !t\.name\?\.trim\(\)\)\) return;/);
});
