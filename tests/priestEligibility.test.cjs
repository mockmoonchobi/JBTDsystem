const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../src/utils/priestColorUtils.ts'), 'utf8');
const exportsObject = {};
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: exportsObject });
test('chief registration excludes concurrent posts in both parenthesis styles', () => {
  for (const name of ['', undefined, '山田（兼務）', '山田 (兼務) ', '山田（ 兼務 ）']) assert.equal(exportsObject.shouldRegisterChiefPriest(name), false);
  for (const name of ['山田', '山田（本務）']) assert.equal(exportsObject.shouldRegisterChiefPriest(name), true);
});
test('calendar excludes tanagyo-only priests while tanagyo retains them', () => {
  const priests = [{ id: 'normal' }, { id: 'only', isDanmu: false }, { id: 'legacy', isDanmuAssigned: false }, { id: 'override', isDanmu: true, isDanmuAssigned: false }];
  assert.deepEqual(Array.from(exportsObject.filterDanmuPriests(priests), p => p.id), ['normal', 'override']);
  assert.equal(exportsObject.filterDanmuPriests(priests, true), priests);
});
