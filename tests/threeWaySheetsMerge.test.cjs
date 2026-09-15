const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), ts = require('typescript');
require.extensions['.ts'] = (m, file) => m._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, file);
const { planSheetsMerge: plan, stableMergeValue, verifyMergedReadback } = require('../src/utils/threeWaySheetsMerge.ts');
const clone = v => JSON.parse(JSON.stringify(v));
const dataset = () => ({ households: [{ id: 'H1', phone: '111', address: '旧住所', familyMembers: [] }], pastRecords: [], transactions: [], memorialServices: [], temples: [], deletedRecords: [] });
const baseline = b => ({ version: 1, sheetId: 'S1', local: clone(b), remote: clone(b) });
const select = (p, side) => Object.fromEntries(p.conflicts.map(c => [c.key, { side, fingerprint: c.fingerprint }]));

test('independent household fields and records merge without mutating any input', () => {
  const b = dataset(), l = clone(b), r = clone(b);
  l.households[0].phone = '222'; r.households[0].address = '新住所';
  r.transactions.push({ id: 'T1', householdId: 'H1', amount: 1000 });
  const before = JSON.stringify([b, l, r]), p = plan(baseline(b), l, r);
  assert.equal(p.conflicts.length, 0); assert.equal(p.merged.households[0].phone, '222');
  assert.equal(p.merged.households[0].address, '新住所'); assert.equal(p.merged.transactions.length, 1);
  assert.equal(JSON.stringify([b, l, r]), before);
});
test('same field conflicts require a choice and changed remote values invalidate that choice', () => {
  const b = dataset(), l = clone(b), r = clone(b); l.households[0].phone = '222'; r.households[0].phone = '333';
  const p = plan(baseline(b), l, r); assert.equal(p.unresolved.length, 1);
  const choices = select(p, 'local'), resolved = plan(baseline(b), l, r, choices);
  assert.equal(resolved.merged.households[0].phone, '222'); assert.equal(resolved.unresolved.length, 0);
  r.households[0].phone = '444'; assert.equal(plan(baseline(b), l, r, choices).unresolved.length, 1);
});
test('identical edits and audit-only changes do not create conflicts', () => {
  const b = dataset(), l = clone(b), r = clone(b); l.households[0].phone = r.households[0].phone = '222';
  l.households[0].updatedAt = 'different clocks'; r.households[0].updatedAt = 'another clock';
  assert.equal(plan(baseline(b), l, r).conflicts.length, 0);
});
test('separate round-trip baselines prevent importer defaults from looking like edits', () => {
  const b = dataset(), r = clone(b); r.households[0].status = '一般';
  const bas = baseline(b); bas.remote = clone(r); const l = clone(b); l.households[0].phone = '222';
  assert.equal(plan(bas, l, r).conflicts.length, 0);
});
test('unknown baseline never infers absence to be a deletion and duplicate new IDs conflict', () => {
  const l = dataset(), r = dataset(); r.households = [];
  assert.equal(plan(null, l, r).unresolved.length, 1);
  const b = dataset(); b.households = []; r.households = [{ id: 'H1', phone: 'different person' }];
  assert.equal(plan(baseline(b), l, r).unresolved.length, 1);
});
test('deletion requires explicit confirmation even if the other side is unchanged', () => {
  const b = dataset(), l = clone(b), r = clone(b); l.households = [];
  const p = plan(baseline(b), l, r); assert(p.conflicts.length);
  assert.equal(plan(baseline(b), l, r, select(p, 'local')).merged.households.length, 0);
  assert.equal(plan(baseline(b), l, r, select(p, 'remote')).merged.households.length, 1);
});
test('deleting a household versus adding a child is resolved together, with dangling choices rejected', () => {
  const b = dataset(), l = clone(b), r = clone(b); l.households = [];
  r.pastRecords = [{ id: 'P1', householdId: 'H1' }];
  const p = plan(baseline(b), l, r); assert(p.conflicts.some(c => c.key.includes('related')));
  const local = plan(baseline(b), l, r, select(p, 'local'));
  assert.equal(local.merged.households.length, 0); assert.equal(local.merged.pastRecords.length, 0); assert.equal(local.errors.length, 0);
  const remote = plan(baseline(b), l, r, select(p, 'remote'));
  assert.equal(remote.merged.households.length, 1); assert.equal(remote.merged.pastRecords.length, 1);
});
test('financial amount and income/expense changes are resolved as one transaction', () => {
  const b = dataset(); b.transactions = [{ id: 'T1', amount: 1000, type: '収入' }];
  const l = clone(b), r = clone(b); l.transactions[0].amount = 2000; r.transactions[0].type = '支出';
  const p = plan(baseline(b), l, r); assert.equal(p.conflicts.length, 1);
  assert.deepEqual(plan(baseline(b), l, r, select(p, 'local')).merged.transactions[0], l.transactions[0]);
});

test('keeping an edited parent also restores links; choosing deletion preserves deliberately unlinked children', () => {
  const b = dataset(); b.pastRecords = [{ id: 'P1', householdId: 'H1' }];
  const l = clone(b), r = clone(b); l.households = []; l.pastRecords[0].householdId = '';
  r.households[0].phone = 'edited';
  const p = plan(baseline(b), l, r); assert(p.conflicts.some(c => c.key.includes('related')));
  const kept = plan(baseline(b), l, r, select(p, 'remote'));
  assert.equal(kept.merged.pastRecords.length, 1); assert.equal(kept.merged.pastRecords[0].householdId, 'H1');
  const removed = plan(baseline(b), l, r, select(p, 'local'));
  assert.equal(removed.merged.households.length, 0); assert.equal(removed.merged.pastRecords.length, 1);
  assert.equal(removed.merged.pastRecords[0].householdId, '');
});
test('histories remain audit evidence; an old deletion must not remove a restored record', () => {
  const b = dataset(), l = clone(b), r = clone(b);
  l.deletedRecords = [{ id: 'H1', logId: 'old', actionType: 'delete', deletedTimestamp: 1 }];
  r.deletedRecords = [{ id: 'H1', logId: 'new', actionType: 'update', deletedTimestamp: 2 }];
  const p = plan(baseline(b), l, r); assert.equal(p.merged.households.length, 1); assert.equal(p.merged.deletedRecords.length, 2);
});
test('duplicate IDs including family IDs are rejected rather than silently collapsed', () => {
  const b = dataset(), l = clone(b); l.households.push(clone(l.households[0]));
  assert.throws(() => plan(baseline(b), l, b), /ID/);
  l.households.pop(); l.households[0].familyMembers = [{ id: 'F1' }, { id: 'F1' }];
  assert.throws(() => plan(baseline(b), l, b), /ID/);
});
test('readback checks records and values, permits imported default fields and normalizes dates', () => {
  const expected = { transactions: [{ id: 'T1', amount: 1000, date: '2026-9-1' }] };
  assert(verifyMergedReadback(expected, { transactions: [{ id: 'T1', amount: 1000, date: '2026/09/01', notes: '' }] }));
  assert(!verifyMergedReadback(expected, { transactions: [] }));
  assert(!verifyMergedReadback(expected, { transactions: [{ id: 'T1', amount: 999, date: '2026/09/01' }] }));
});
test('collection ordering and empty imported defaults are not changes', () => {
  assert.equal(stableMergeValue({ households: [{ id: 'B' }, { id: 'A', notes: '' }] }), stableMergeValue({ households: [{ id: 'A', checked: false }, { id: 'B' }] }));
});
