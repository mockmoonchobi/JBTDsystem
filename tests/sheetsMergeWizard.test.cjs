const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), vm = require('vm'), ts = require('typescript');
const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
require.extensions['.ts'] = (m, file) => m._compile(compile(fs.readFileSync(file, 'utf8')), file);
const merger = require('../src/utils/threeWaySheetsMerge.ts');

test('wizard permits immediate comparison and requires explicit conflict selection before committing', async () => {
  const slots = []; let cursor = 0, tree, saved, committed, plans = 0;
  const React = { createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
    useMemo: (fn, deps) => { const i=cursor++, old=slots[i]; if (!old || deps.some((d,j)=>d!==old.deps[j])) slots[i]={deps,value:fn()}; return slots[i].value; },
    useState: initial => { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial; return [slots[i], v => { slots[i] = typeof v === 'function' ? v(slots[i]) : v; }]; } };
  const ctx = { exports: {}, require: name => name === 'react' ? React : name.includes('mergePresentation') ? require('../src/utils/mergePresentation.ts') : {...merger,planSheetsMerge:(...args)=>{plans++;return merger.planSheetsMerge(...args);}} };
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
  render(); assert(!button('比較結果を確認').props.disabled);
  button('比較結果を確認').props.onClick(); render();
  assert(button('最終確認へ').props.disabled);
  await button('この内容を採用').props.onClick(); render(); assert(saved);
  assert.equal(plans,1,'choosing a side must not recompare the whole dataset');
  button('Googleシートをすべて採用して読み込む').props.onClick(); assert.equal(committed,props.request.remote); committed=null;
  assert(!button('最終確認へ').props.disabled); button('最終確認へ').props.onClick(); render();
  assert(!committed); assert(!button('他端末を停止して統合・保存').props.disabled);
  assert.equal(plans,2,'recompute only for final review');
  button('Googleシートをすべて採用して読み込む').props.onClick(); assert.equal(committed,props.request.remote); committed=null;
  button('他端末を停止して統合・保存').props.onClick(); assert.equal(committed.households[0].phone, '222');
  const footer = find(n => n.type === 'footer', tree);
  assert(find(n => n.type === 'button' && text(n).trim() === '他端末を停止して統合・保存', footer), 'commit button must remain outside the scrolling content');
  button('戻る').props.onClick(); render();
  committed=null;
  await button('この端末の内容をすべて採用').props.onClick(); render();
  assert(!committed, 'bulk selection must still require final confirmation');
  assert(Object.values(saved).every(c=>c.side==='local'));
  assert(!button('他端末を停止して統合・保存').props.disabled);
  props.request={...props.request,message:'最新データで再確認',choices:saved};slots.length=0;render();
  assert(!button('他端末を停止して統合・保存').props.disabled,'unchanged choices should reopen final review');
  props.request={...props.request,remote:{households:[{id:'H1',phone:'444'}]}};slots.length=0;render();
  assert(button('最終確認へ').props.disabled,'changed conflict must require a new choice without returning to preparation');
  props.request={...props.request,choices:{},base:{local:{households:[{id:'H1',phone:'111'},{id:'H2',phone:'111'}]},remote:{households:[{id:'H1',phone:'111'},{id:'H2',phone:'111'}]}},local:{households:[{id:'H1',phone:'222'},{id:'H2',phone:'222'}]},remote:{households:[{id:'H1',phone:'333'},{id:'H2',phone:'333'}]}};
  slots.length=0;render();
  assert(!button('次へ').props.disabled,'unselected first record must not prevent browsing');
  button('次へ').props.onClick();render();
  assert(!button('前へ').props.disabled);assert(button('最終確認へ').props.disabled);
  await button('この内容を採用').props.onClick();render();
  assert(button('最終確認へ').props.disabled,'earlier unselected records must still block final confirmation');
  button('未選択の項目へ').props.onClick();render();
  assert(button('前へ').props.disabled);
  await button('この内容を採用').props.onClick();render();button('次へ').props.onClick();render();
  assert(!button('最終確認へ').props.disabled);
});

test('journal stores immutable baselines and choices across new instances; persistence errors propagate', async () => {
  const data = new Map(); let fail = false;
  const storage = { idbGet: async key => data.get(key) || null, idbSet: async (key, value) => { if (fail) throw Error('disk full'); data.set(key, structuredClone(value)); } };
  const load = () => { const ctx = { exports: {}, require: name => name === './pendingAudit' ? { getLocalAuditRevision: () => 0 } : storage }; vm.runInNewContext(compile(fs.readFileSync(path.join(__dirname, '../src/utils/sheetsMergeJournal.ts'), 'utf8')), ctx); return ctx.exports; };
  const first = load(), local = { households: [{ id: 'H1', phone: '111' }] };
  await first.acknowledgeSheets('A', local, local); local.households[0].phone = '222';
  await first.saveMergeDraft({ version: 1, id: 'draft', sheetId: 'A', local, remote: {}, choices: { key: { side: 'local', fingerprint: 'v' } }, phase: 'review' });
  const next = load(); assert.equal((await next.readMergeBaseline('A')).local.households[0].phone, '111');
  assert.equal(await next.readMergeBaseline('B'), null);
  assert.equal(data.get(next.draftKey('A')).local.households[0].phone, '222');
  assert.equal(data.get(next.draftKey('A')).choices.key.side, 'local');
  const draft=data.get(next.draftKey('A'));
  await next.saveMergeChoices(draft,{key:{side:'remote',fingerprint:'v'}});
  assert.equal(data.get(next.draftKey('A')).choices.key.side,'local','choice persistence must not rewrite the full draft');
  assert.equal((await next.restoreMergeChoices(draft)).choices.key.side,'remote');
  assert.equal((await next.restoreMergeChoices({...draft,id:'new'})).choices.key.side,'local','old choices must not leak into a different draft');
  await next.acknowledgeSheets('A', local, local);
  assert.equal((await first.readMergeBaseline('A')).local.households[0].phone, '111');
  assert.equal((await next.readMergeBaseline('A')).local.households[0].phone, '222');
  fail = true; await assert.rejects(next.acknowledgeSheets('A', local, local), /disk full/);
  assert.equal((await next.readMergeBaseline('A')).local.households[0].phone, '222');
});

test('accounting presentation hides IDs and shows only differing edited fields without changing records',()=>{
 const {presentValue,changedValues,presentConflict,presentChanges}=require('../src/utils/mergePresentation.ts');
 const before={id:'TX-123',templeId:'temple-main',householdId:'DK-00001',receiptNumber:'R99',date:'2026-09-17',type:'income',category:'護持会費',amount:1000,description:'年会費'};
 const after={...before,amount:2000};
 assert.deepEqual(Object.keys(presentValue(before,'transactions')),['date','type','category','amount','description']);
 assert.deepEqual(changedValues(before,after,'transactions'),[{amount:'1,000円'},{amount:'2,000円'}]);
 assert.equal(presentValue(before,'transactions').type,'収入');
 const c={key:JSON.stringify(['transactions','TX-123']),label:'会計 / 年会費 [TX-123]',fingerprint:'x',base:before,local:undefined,remote:after};
 const view=presentConflict(c,{transactions:[]},{transactions:[after]});
 assert.equal(view.local,undefined);assert(!JSON.stringify(view).includes('TX-123'));assert(!JSON.stringify(view).includes('R99'));
 const changes=presentChanges({transactions:[{'処理':'変更','変更前':before,'変更後':after}]});
 assert.deepEqual(changes.transactions[0]['変更後'],{amount:'2,000円'});assert.equal(after.id,'TX-123');assert.equal(after.receiptNumber,'R99');
});

test('one accounting addition previews accounting only, excluding unchanged templates',()=>{
 const base={transactions:[],allNoticeTemplates:[{id:'template',content:'text'}]};
 const local={...base,transactions:[{id:'T1',amount:100,date:'2026-09-17'}]};
 const plan=merger.planSheetsMerge({version:1,sheetId:'A',local:base,remote:base},local,base);
 assert.equal(plan.summary.find(s=>s.table==='transactions').added,1);
 assert.deepEqual(Object.keys(plan.changes),['transactions']);
 assert.equal(plan.changes.transactions[0]['処理'],'追加');
 assert.equal(plan.changes.transactions[0]['変更後'].id,'T1');
 assert.deepEqual(plan.merged.allNoticeTemplates,base.allNoticeTemplates);
});
