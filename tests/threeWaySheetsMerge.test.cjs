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
test('household deletion remains deleted during merge; restoration is a separate explicit decision', () => {
  const b = dataset(), l = clone(b), r = clone(b); l.households = [];
  const p = plan(baseline(b), l, r); assert.equal(p.conflicts.length,0);
  assert.equal(plan(baseline(b), l, r, select(p, 'local')).merged.households.length, 0);
  assert.equal(plan(baseline(b), l, r, select(p, 'remote')).merged.households.length, 0);
});
test('deleting a household preserves a concurrently added child and its original household ID', () => {
  const b = dataset(), l = clone(b), r = clone(b); l.households = [];
  r.pastRecords = [{ id: 'P1', householdId: 'H1' }];
  const p = plan(baseline(b), l, r); assert(!p.conflicts.some(c => c.key.includes('related')));
  const local = plan(baseline(b), l, r, select(p, 'local'));
  assert.equal(local.merged.households.length, 0); assert.equal(local.merged.pastRecords.length, 1); assert.equal(local.errors.length, 0);
  const remote = plan(baseline(b), l, r, select(p, 'remote'));
  assert.equal(remote.merged.households.length, 0); assert.equal(remote.merged.pastRecords.length, 1);
});
test('financial amount and income/expense changes are resolved as one transaction', () => {
  const b = dataset(); b.transactions = [{ id: 'T1', amount: 1000, type: '収入' }];
  const l = clone(b), r = clone(b); l.transactions[0].amount = 2000; r.transactions[0].type = '支出';
  const p = plan(baseline(b), l, r); assert.equal(p.conflicts.length, 1);
  assert.deepEqual(plan(baseline(b), l, r, select(p, 'local')).merged.transactions[0], l.transactions[0]);
});

test('household deletion and a concurrent accounting edit retain the original links and accounting value', () => {
  const b = dataset(); b.pastRecords = [{ id: 'P1', householdId: 'H1' }];
  b.transactions=[{id:'TX1',householdId:'H1',amount:1000}];
  const l = clone(b), r = clone(b); l.households = [];r.transactions[0].amount=2000;
  r.households[0].phone = 'edited';
  const p = plan(baseline(b), l, r); assert.equal(p.conflicts.length,0);
  const kept = plan(baseline(b), l, r, select(p, 'remote'));
  assert.equal(kept.merged.pastRecords.length, 1); assert.equal(kept.merged.pastRecords[0].householdId, 'H1');
  const removed = plan(baseline(b), l, r, select(p, 'local'));
  assert.equal(removed.merged.households.length, 0); assert.equal(removed.merged.pastRecords.length, 1);
  assert.equal(removed.merged.pastRecords[0].householdId, 'H1');
  assert.equal(removed.merged.transactions[0].amount,2000);
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

test('fresh explicit deletion wins over an edit on either side while unrelated additions survive',()=>{
 const b={transactions:[{id:'T',amount:100,notes:'元'}],deletedRecords:[]};
 for(const deletedSide of ['local','remote']) {
  const edited={transactions:[{id:'T',amount:200,notes:'編集'},{id:'N',amount:300}],deletedRecords:[]};
  const deleted={transactions:[],deletedRecords:[{logId:'D',id:'T',entityType:'transaction',actionType:'delete',deletedTimestamp:1000}]};
  const p=plan(baseline(b),deletedSide==='local'?deleted:edited,deletedSide==='remote'?deleted:edited);
  assert.equal(p.conflicts.length,0);assert.deepEqual(p.merged.transactions.map(r=>r.id),['N']);
  assert.equal(p.deletionResolutions.length,1);assert.equal(p.deletionResolutions[0].discardedLocalEdit,deletedSide==='remote');
 }
});
test('old deletion logs and missing rows without deletion evidence still require review',()=>{
 const log={logId:'old',id:'T',entityType:'transaction',actionType:'delete',deletedTimestamp:100};
 const b={transactions:[{id:'T',amount:100}],deletedRecords:[log]};
 const local={transactions:[{id:'T',amount:200}],deletedRecords:[log]};
 for(const logs of [[],[log]]) {
  const p=plan(baseline(b),local,{transactions:[],deletedRecords:logs});
  assert.equal(p.deletionResolutions.length,0);assert.equal(p.conflicts.length,1);
 }
});
test('household delete priority retains accounting and deceased records',()=>{
 const b=dataset();b.pastRecords=[{id:'P',householdId:'H1'}];
 const l=clone(b),r=clone(b);l.households[0].phone='222';l.transactions=[{id:'T',householdId:'H1',amount:100}];
 r.households=[];r.deletedRecords=[{logId:'D',id:'H1',entityType:'household',actionType:'delete',deletedTimestamp:1000}];
 const p=plan(baseline(b),l,r);assert.equal(p.conflicts.length,0);assert.equal(p.merged.households.length,0);
 assert.equal(p.merged.transactions[0].householdId,'H1');assert.equal(p.merged.pastRecords[0].householdId,'H1');
});

test('unknown household affiliations are never silently moved to the main temple',()=>{
 const {sanitizeAppDataset}=require('../src/utils/sanitizeDataUtils.ts');
 const base={temples:[{id:'temple-main',isMain:true,name:'本寺'}],households:[],pastRecords:[],transactions:[],memorialServices:[],templeTodos:[],familyMembers:[]};
 for(const id of ['H-464','K9-00001']) {
  const input={...base,households:[{id,familyHead:'確認対象',templeId:'missing-temple'}]};
  assert.throws(()=>sanitizeAppDataset(input),/所属寺院を確認できません/);
  assert.equal(input.households[0].templeId,'missing-temple');
 }
 const input={...base,households:[{id:'H-464',familyHead:'既存',templeId:'temple-main'}]};
 assert.equal(sanitizeAppDataset(input).households[0].id,'H-464');
});


test('only proven household removals defer background imports; mixed work and missing evidence do not', () => {
  const {hasOnlyHouseholdDeletions: qualifies} = require('../src/utils/threeWaySheetsMerge.ts');
  const b = dataset(); b.households = Array.from({length:6}, (_,i)=>({id:'H'+i,name:'Name'+i}));
  b.transactions = [{id:'T',householdId:'H0',amount:1000}];
  const l = clone(b); l.households = l.households.slice(5);
  l.deletedRecords = Array.from({length:5},(_,i)=>({id:'H'+i,logId:'D'+i,entityType:'household',actionType:'delete'}));
  assert(qualifies(baseline(b),l));
  for (const mutate of [x=>x.deletedRecords.pop(), x=>x.transactions[0].amount++, x=>x.households[0].name='Edit', x=>x.households.push({id:'New'}), x=>x.households.push(x.households[0]), x=>x.deletedRecords[0].actionType='update']) {
    const other=clone(l); mutate(other); assert(!qualifies(baseline(b),other));
  }
  const old=baseline(b);old.local.deletedRecords=clone(l.deletedRecords);assert(!qualifies(old,l));
});
test('mobile receipt description alias does not turn 12 saved additions into updates',()=>{
 const b=dataset(),l=clone(b),r=clone(b);
 for(let i=0;i<12;i++) {const row={id:'TX-'+i,type:'収入',amount:1000,notes:'受付',date:'2026/09/17'};l.transactions.push({...row,description:'受付'});r.transactions.push(row);}
 const p=plan(baseline(b),l,r);
 assert.equal(p.conflicts.length,0);assert.equal(p.summary.find(s=>s.table==='transactions').updated,0);
 const newOnly=plan(baseline(b),l,b);assert.equal(newOnly.summary.find(s=>s.table==='transactions').added,12);
 r.transactions[0].amount=2000;assert.equal(plan(baseline(b),l,r).conflicts.length,1);
});
test('saved mobile merge drafts verify without an endless description-alias mismatch',()=>{
 const {describeAccountingMismatch}=require('../src/utils/threeWaySheetsMerge.ts');
 const intended=Array.from({length:12},(_,i)=>({id:'TX-'+i,type:'収入',amount:1000,notes:'護持会費',description:'護持会費'}));
 const actual=intended.map(({description,...row})=>row);
 assert(verifyMergedReadback({transactions:intended},{transactions:actual}));
 assert.equal(describeAccountingMismatch(intended,actual),'');
 actual[0].notes='布施';assert(!verifyMergedReadback({transactions:intended},{transactions:actual}));
 assert(describeAccountingMismatch(intended,actual).includes('異なります'));
});
test('accounting review displays persisted notes and does not invent a missing description',()=>{
 const {presentValue,changedValues,presentChanges}=require('../src/utils/mergePresentation.ts');
 const before={id:'T',date:'2026/09/17',category:'護持会費',amount:1000,notes:'保険料'};
 const after={...before,description:'保険料'};
 assert.equal(presentValue(before,'transactions').description,'保険料');
 assert.deepEqual(changedValues(before,after,'transactions'),[{},{}]);
 const changed={...after,notes:'新摘要'};
 const display=presentChanges({transactions:[{'処理':'変更','変更前':before,'変更後':changed}]}).transactions[0];
 assert.equal(display['変更前'].description,'保険料');assert.equal(display['変更後'].description,'新摘要');
 assert(display['対象'].includes('新摘要'));
 assert.equal(presentValue({...changed,notes:''},'transactions').description,'');
});

test('reservation removal never groups or deletes its accounting, even during a concurrent payment edit',()=>{
 const old={memorialServices:[{id:'S1'}],transactions:[{id:'T1',relatedServiceId:'S1',amount:1000}],deletedRecords:[]};
 const local={...old,memorialServices:[],deletedRecords:[{id:'S1',logId:'D',entityType:'memorialService',actionType:'delete',deletedTimestamp:1}]};
 const remote={...old,transactions:[{...old.transactions[0],amount:2000}]};
 const result=plan({version:1,sheetId:'s',local:old,remote:old},local,remote,{},true);
 assert.deepEqual(result.merged.memorialServices,[]);assert.equal(result.merged.transactions[0].amount,2000);assert.equal(result.merged.transactions[0].relatedServiceId,'S1');assert.equal(result.errors.length,0);assert.equal(result.unresolved.length,0);
});
