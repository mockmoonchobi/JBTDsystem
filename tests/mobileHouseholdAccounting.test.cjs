const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), vm = require('vm'), ts = require('typescript');
const compile = source => ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true,
} }).outputText;
require.extensions['.ts'] = (m, file) => m._compile(compile(fs.readFileSync(file, 'utf8')), file);
const dates = require('../src/utils/memorialCalculator.ts');

function mount(transactions, householdId = 'DK1') {
  const slots = []; let cursor = 0, tree;
  const React = {
    createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
    useMemo: fn => fn(),
    useState: initial => {
      const i = cursor++; if (!(i in slots)) slots[i] = initial;
      return [slots[i], v => { slots[i] = typeof v === 'function' ? v(slots[i]) : v; }];
    },
  };
  const context = { exports: {}, require: name => name === 'react' ? React : dates };
  vm.runInNewContext(compile(fs.readFileSync(path.join(__dirname, '../src/components/mobile/MobileHouseholdAccounting.tsx'), 'utf8')), context);
  const props = { transactions, householdId };
  const render = () => { cursor = 0; tree = context.exports.MobileHouseholdAccounting(props); };
  const nodes = (type, node = tree) => !node ? [] : Array.isArray(node) ? node.flatMap(n => nodes(type, n ?? null)) :
    typeof node === 'object' ? [...(node.type === type ? [node] : []), ...nodes(type, node.children ?? null)] : [];
  const text = (node = tree) => Array.isArray(node) ? node.map(n => text(n ?? null)).join('') :
    typeof node === 'object' && node ? text(node.children ?? null) : node == null || typeof node === 'boolean' ? '' : String(node);
  render();
  return { nodes, text, render, props };
}
const transaction = (id, date, extra = {}) => ({ id, date, householdId: 'DK1', householdHeadName: '同じ姓', type: '収入', amount: 1000, category: '寄付', ...extra });

test('mobile accounting uses household IDs, includes combined accounts and sorts dates without changing source data', () => {
  const records = [transaction('old', '2023/3/1'), transaction('other', '2026/10/1', { householdId: 'DK2' }),
    transaction('unlinked', '2026/10/1', { householdId: '' }), transaction('new', '2026-09-15', { templeId: 'temple-sub', type: '支出', amount: 2500, description: '返金内容', notes: '備考の詳細' }),
    transaction('middle', '2026/2/1'), transaction('undated', '')];
  const before = JSON.stringify(records), view = mount(records);
  assert.deepEqual(view.nodes('li').map(n => n.props.key), ['new', 'middle', 'old', 'undated']);
  assert.match(view.text(), /支出　2,500円/);
  assert.match(view.text(), /返金内容/); assert.match(view.text(), /備考の詳細/);
  assert.equal(JSON.stringify(records), before);
});

test('mobile accounting paginates and reflects newly received transactions', () => {
  const view = mount(Array.from({ length: 25 }, (_, i) => transaction(String(i), '2026/09/15')));
  assert.equal(view.nodes('li').length, 20);
  view.nodes('button')[0].props.onClick(); view.render();
  assert.equal(view.nodes('li').length, 25); assert.equal(view.nodes('button').length, 0);
  view.props.transactions = [transaction('received', '2026/09/16'), ...view.props.transactions]; view.render();
  assert.equal(view.nodes('li')[0].props.key, 'received');
});

test('empty or missing household IDs never show unlinked accounting', () => {
  for (const id of ['DK2', '']) {
    const view = mount([transaction('one', '2026/09/15'), transaction('none', '', { householdId: '' })], id);
    assert.equal(view.nodes('li').length, 0);
    assert.match(view.text(), /この家に紐づく会計データはありません/);
  }
});

