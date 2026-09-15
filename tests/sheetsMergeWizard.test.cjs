const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), vm = require('vm'), ts = require('typescript');
const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
require.extensions['.ts'] = (m, file) => m._compile(compile(fs.readFileSync(file, 'utf8')), file);
const merger = require('../src/utils/threeWaySheetsMerge.ts');

test('wizard requires maintenance acknowledgement and explicit conflict selection before committing', async () => {
  const slots = []; let cursor = 0, tree, saved, committed;
  const React = { createElement: (type, props, ...children) => ({ type, props: props || {}, children }), useMemo: fn => fn(),
    useState: initial => { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], v => { slots[i] = typeof v === 'function' ? v(slots[i]) : v; }]; } };
  const ctx = { exports: {}, require: name => name === 'react' ? React : merger };
  vm.runInNewContext(compile(fs.readFileSync(path.join(__dirname, '../src/components/SheetsMergeWizard.tsx'), 'utf8')), ctx);
  const base = { households: [{ id: 'H1', phone: '111' }] };
  const props = { request: { id: 'request', base: { local: base, remote: base }, local: { households: [{ id: 'H1', phone: '222' }] }, remote: { households: [{ id: 'H1', phone: '333' }] }, choices: {} },
    onSaveChoices: async choices => { saved = choices; }, onConfirm: data => { committed = data; }, onCancel() {} };
  const render = () => { cursor = 0; tree = ctx.exports.SheetsMergeWizard(props); };
  const text = node => Array.isArray(node) ? node.map(text).join('') : node && typeof node === 'object' ? text(node.children) : node == null || typeof node === 'boolean' ? '' : String(node);
  const find = (predicate, node) => {
    if (!node) return;
    if (Array.isArray(node)) { for (const n of node) { const result = find(predicate, n); if (result) return result; } }
    else if (typeof node === 'object') { if (predicate(node)) return node; return find(predicate, node.children); }
  };
  const button = label => { const result = find(n => n.type === 'button' && text(n).trim() === label, tree); assert(result, label); return result; };
  render(); assert(button('比較結果を確認').props.disabled);
  find(n => n.type === 'input', tree).props.onChange({ target: { checked: true } }); render();
  button('比較結果を確認').props.onClick(); render();
  assert(button('最終確認へ').props.disabled);
  await button('この内容を採用').props.onClick(); render(); assert(saved);
  assert(!button('最終確認へ').props.disabled); button('最終確認へ').props.onClick(); render();
  assert(!committed); assert(!button('統合してGoogleシートへ保存').props.disabled);
  button('統合してGoogleシートへ保存').props.onClick(); assert.equal(committed.households[0].phone, '222');
});

test('journal stores immutable baselines and choices across new instances; persistence errors propagate', async () => {
  const data = new Map(); let fail = false;
  const storage = { idbGet: async key => data.get(key) || null, idbSet: async (key, value) => { if (fail) throw Error('disk full'); data.set(key, structuredClone(value)); } };
  const load = () => { const ctx = { exports: {}, require: () => storage }; vm.runInNewContext(compile(fs.readFileSync(path.join(__dirname, '../src/utils/sheetsMergeJournal.ts'), 'utf8')), ctx); return ctx.exports; };
  const first = load(), local = { households: [{ id: 'H1', phone: '111' }] };
  await first.acknowledgeSheets('A', local, local); local.households[0].phone = '222';
  await first.saveMergeDraft({ version: 1, id: 'draft', sheetId: 'A', local, remote: {}, choices: { key: { side: 'local', fingerprint: 'v' } }, phase: 'review' });
  const next = load(); assert.equal((await next.readMergeBaseline('A')).local.households[0].phone, '111');
  assert.equal(await next.readMergeBaseline('B'), null);
  assert.equal(data.get(next.draftKey('A')).local.households[0].phone, '222');
  assert.equal(data.get(next.draftKey('A')).choices.key.side, 'local');
  fail = true; await assert.rejects(next.acknowledgeSheets('A', local, local), /disk full/);
  assert.equal((await next.readMergeBaseline('A')).local.households[0].phone, '111');
});
