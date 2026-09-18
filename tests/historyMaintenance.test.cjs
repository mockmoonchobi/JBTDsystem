const { test } = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), ts = require('typescript');
require.extensions['.ts'] = (m, p) => m._compile(ts.transpileModule(fs.readFileSync(p, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, p);
const { memory } = require('./rowSyncFixture.cjs');
const { HistoryMaintenanceClient } = require('../src/utils/historyMaintenance.ts');
const { CONTROL_SHEET, ARCHIVE_PREFIX, planHistoryCleanup, waitingDevices } = require('../src/utils/historyMaintenancePlan.ts');
const { queueAudit, pendingAudit, acknowledgeAudit, auditForExport } = require('../src/utils/pendingAudit.ts');
const { PURGE_LEDGER } = require('../src/utils/purgeLedger.ts');
const { ROW_META } = require('../src/utils/rowSyncPlan.ts');
const header = ['履歴ID', '種別', '対象エンティティ', '対象ID', '内容', '操作日時', '日時(ms)'];
const history = (n = 2001) => [header, ...Array.from({ length: n }, (_, i) => ['L' + i, 'update', 'transaction', 'T' + i, '=literal', '2026-01-01', String(1000 + i)])];
function simulator() {
  memory.clear();
  const sheets = new Map(), calls = []; let lose = false, reject = false, corrupt = false;
  function add(title, grid, sheetId) { const sheet = { sheetId, title, gridProperties: { rowCount: Math.max(grid.length, 1000), columnCount: 30 }, grid: structuredClone(grid) }; sheets.set(title, sheet); return sheet; }
  add('操作・削除履歴', history(), 1); add('檀家名簿', [['ID'], ['D1', '1']], 2); add('過去帳', [['ID'], ['P1', 'D1']], 3); add('出納・会計', [['ID'], ['T1', 'D1', 500]], 4);
  const response = (body, status = 200) => new Response(JSON.stringify(body), { status });
  const fetch = async (url, options = {}) => {
    const body = options.body ? JSON.parse(options.body) : undefined, u = new URL(url); calls.push({ url, body, method: options.method });
    if (u.searchParams.has('fields')) return response({ sheets: [...sheets.values()].map(({ grid, ...properties }) => ({ properties })) });
    if (u.pathname.endsWith('/values:batchGet')) return response({valueRanges:u.searchParams.getAll('ranges').map(range => {
      const title=range.match(/^'(.+)'!/)[1], bounds=range.match(/!A(\d+):ZZ(\d+)$/), sheet=sheets.get(title);
      if (!sheet) throw Error('missing sheet');
      return {range,values:sheet.grid.slice(Number(bounds[1])-1,Number(bounds[2])).map(r=>r.map(v=>String(v??'')))};
    })});
    if (u.pathname.includes('/values/')) {
      const range = decodeURIComponent(u.pathname.split('/values/')[1]), title = range.match(/^'(.+)'!/)[1], sheet = sheets.get(title);
      if (!sheet) return response({}, 400);
      const start = Number(range.match(/!A(\d+)/)?.[1] || 1) - 1;
      if (range.endsWith(':append')) { sheet.grid.push(...body.values); return response({}); }
      if (options.method === 'PUT') { body.values.forEach((r, i) => sheet.grid[start + i] = r); return response({}); }
      return response({ values: sheet.grid.slice(start).map(r => r.map(v => String(v ?? ''))) });
    }
    const destructive = body?.requests?.some(r => r.deleteDimension);
    if (destructive && reject) return response({}, 429);
    for (const r of body?.requests || []) {
      if (r.addSheet) {
        const p = r.addSheet.properties;
        if (sheets.has(p.title) || [...sheets.values()].some(s => s.sheetId === p.sheetId)) throw Error('duplicate sheet');
        add(p.title, [], p.sheetId);
      } else if (r.updateCells) {
        const w = r.updateCells, s = [...sheets.values()].find(s => s.sheetId === w.start.sheetId);
        w.rows.forEach((r, i) => { const row = s.grid[w.start.rowIndex + i] ||= []; r.values.forEach((c,j) => row[(w.start.columnIndex || 0)+j] = c.userEnteredValue.stringValue ?? c.userEnteredValue.numberValue); });
      } else if (r.copyPaste) {
        const { source, destination, pasteType } = r.copyPaste;
        assert.equal(pasteType, 'PASTE_VALUES');
        const from = [...sheets.values()].find(s => s.sheetId === source.sheetId);
        const to = [...sheets.values()].find(s => s.sheetId === destination.sheetId);
        const copied = structuredClone(from.grid.slice(source.startRowIndex, source.endRowIndex));
        copied.forEach((row, i) => { to.grid[destination.startRowIndex + i] = row.slice(source.startColumnIndex, source.endColumnIndex); });
      } else if (r.deleteSheet) { const sheet=[...sheets.values()].find(s=>s.sheetId===r.deleteSheet.sheetId);sheets.delete(sheet.title);
      } else if (r.deleteDimension) {
        const { sheetId, startIndex, endIndex, dimension } = r.deleteDimension.range, s = [...sheets.values()].find(s => s.sheetId === sheetId);
        assert.notEqual(s.title, CONTROL_SHEET); if (dimension === 'COLUMNS') s.grid.forEach(row=>{row.splice(startIndex,endIndex-startIndex);while(row.length&&row.at(-1)==null)row.pop();}); else s.grid.splice(startIndex, endIndex - startIndex);
      } else if (r.sortRange) {
        const {range,sortSpecs}=r.sortRange,s=[...sheets.values()].find(s=>s.sheetId===range.sheetId),col=sortSpecs[0].dimensionIndex;
        const sorted=s.grid.slice(range.startRowIndex,range.endRowIndex).sort((a,b)=>a[col]-b[col]);
        s.grid.splice(range.startRowIndex,sorted.length,...sorted);
      } else if (r.appendDimension) { const spec=r.appendDimension;const sheet=[...sheets.values()].find(s=>s.sheetId===spec.sheetId);if(spec.dimension==='ROWS')sheet.gridProperties.rowCount+=spec.length; } else if (r.updateSheetProperties) { const p = r.updateSheetProperties.properties; Object.assign([...sheets.values()].find(s => s.sheetId === p.sheetId).gridProperties, p.gridProperties); } else throw Error('unexpected mutation');
    }
    if (destructive && corrupt) sheets.get('操作・削除履歴').grid[1][4] = 'changed';
    if (destructive && lose) { lose = false; throw Error('response lost'); }
    return response({});
  };
  return { sheets, fetch, calls, lose: () => { lose = true; }, reject: () => { reject = true; }, corrupt: () => { corrupt = true; } };
}
async function setup() {
  const sim = simulator(); let reason = '';
  const a = new HistoryMaintenanceClient('sheet', 'owner', 'tab-a', sim.fetch, () => ''), b = new HistoryMaintenanceClient('sheet', 'guest', 'tab-b', sim.fetch, () => reason);
  await a.initialize('token'); await b.heartbeat('token');
  const rev = await b.beginRead('token'); await b.finishRead('token', rev);
  return { sim, a, b, dirty: value => { reason = value; } };
}

test('subsidiary purge physically removes active and deleted related rows, preserves other temples, and reserves IDs',async()=>{
 await pendingAudit();
 const {sim,a,b}=await setup();const id='temple-sub-1';
 sim.sheets.set('寺院一覧（本寺・兼務）',{sheetId:99,title:'寺院一覧（本寺・兼務）',gridProperties:{rowCount:100,columnCount:20},grid:[['寺院ID','寺院区分','寺院名'],['temple-main','本寺','本寺'],[id,'兼務','試験兼務寺']]});
 for(const [n,title] of ['マスタ_試験兼務寺','マスター_試験兼務寺','マスタ_本寺'].entries())sim.sheets.set(title,{sheetId:110+n,title,gridProperties:{rowCount:100,columnCount:20},grid:[['区分','名称'],['会計','布施']]});
 sim.sheets.get('檀家名簿').grid=[['ID','所属寺院ID',...ROW_META],['H1',id,'','','x'],['H2',id,'1','old','x'],['OTHER','temple-main','1','old','x']];
 sim.sheets.get('過去帳').grid=[['ID','世帯ID'],['P1','H2'],['P2','OTHER']];
 sim.sheets.get('出納・会計').grid=[['ID','世帯ID','金額'],['T1','H1',123],['T2','OTHER',456]];
 await a.prepareMerge('token');b.setMergeUiLocked(true);await b.heartbeat('token');assert(await a.confirmMergeStopped('token'));await a.markMergeSubmitted('token');
 await a.purgeSubsidiary('token',id);await a.finishMerge('token',true);
 assert.deepEqual(sim.sheets.get('檀家名簿').grid.slice(1).map(r=>r[0]),['OTHER']);
 assert.deepEqual(sim.sheets.get('過去帳').grid.slice(1).map(r=>r[0]),['P2']);
 assert.deepEqual(sim.sheets.get('出納・会計').grid.slice(1).map(r=>r[0]),['T2']);
 assert(!sim.sheets.has('マスタ_試験兼務寺'));assert(!sim.sheets.has('マスター_試験兼務寺'));assert(sim.sheets.has('マスタ_本寺'));
 assert(sim.sheets.get(PURGE_LEDGER).grid.some(r=>r[0]==='household'&&r[1]==='H2'));
 assert(sim.sheets.get('操作・削除履歴').grid.some(r=>String(r[0]).startsWith('PURGE-')));
 assert.equal((await a.read('token')).state.phase,'running');await b.heartbeat('token');
});

test('subsidiary purge verifies a lost response without deleting rows twice',async()=>{
 await pendingAudit();
 const {sim,a,b}=await setup();const id='temple-sub-1';
 sim.sheets.set('寺院一覧（本寺・兼務）',{sheetId:99,title:'寺院一覧（本寺・兼務）',gridProperties:{rowCount:100,columnCount:20},grid:[['寺院ID','寺院区分','寺院名'],['temple-main','本寺','本寺'],[id,'兼務','試験兼務寺']]});
 for(const [n,title] of ['マスタ_試験兼務寺','マスター_試験兼務寺','マスタ_本寺'].entries())sim.sheets.set(title,{sheetId:110+n,title,gridProperties:{rowCount:100,columnCount:20},grid:[['区分','名称'],['会計','布施']]});
 sim.sheets.get('檀家名簿').grid=[['ID','所属寺院ID',...ROW_META],['H1',id,'','','x'],['H2',id,'1','old','x'],['OTHER','temple-main','1','old','x']];
 sim.sheets.get('過去帳').grid=[['ID','世帯ID'],['P1','H2'],['P2','OTHER']];
 sim.sheets.get('出納・会計').grid=[['ID','世帯ID','金額'],['T1','H1',123],['T2','OTHER',456]];
 await a.prepareMerge('token');b.setMergeUiLocked(true);await b.heartbeat('token');assert(await a.confirmMergeStopped('token'));await a.markMergeSubmitted('token');
 sim.lose();await assert.rejects(a.purgeSubsidiary('token',id),/response lost/);await a.finishMerge('token',true);
 assert.equal(sim.calls.filter(c=>c.body?.requests?.some(r=>r.deleteDimension)).length,1);
 assert.deepEqual(sim.sheets.get('檀家名簿').grid.slice(1).map(r=>r[0]),['OTHER']);
 assert.deepEqual(sim.sheets.get('過去帳').grid.slice(1).map(r=>r[0]),['P2']);
 assert.deepEqual(sim.sheets.get('出納・会計').grid.slice(1).map(r=>r[0]),['T2']);
 assert(!sim.sheets.has('マスタ_試験兼務寺'));assert(!sim.sheets.has('マスター_試験兼務寺'));assert(sim.sheets.has('マスタ_本寺'));
 assert(sim.sheets.get(PURGE_LEDGER).grid.some(r=>r[0]==='household'&&r[1]==='H2'));
 assert(sim.sheets.get('操作・削除履歴').grid.some(r=>String(r[0]).startsWith('PURGE-')));
 assert.equal((await a.read('token')).state.phase,'running');await b.heartbeat('token');
});

test('cleanup sorts surviving rows atomically and preserves their IDs and links',async()=>{
 const {sim,a,b}=await setup();
 for(const [n,title] of ['マスタ_試験兼務寺','マスター_試験兼務寺','マスタ_本寺'].entries())sim.sheets.set(title,{sheetId:110+n,title,gridProperties:{rowCount:100,columnCount:20},grid:[['区分','名称'],['会計','布施']]});
 sim.sheets.get('檀家名簿').grid=[['ID','所属寺院ID','フリガナ',...ROW_META],['C','K2','アオキ','','','op'],['B','K1','ヤマダ','','','op'],['X','K1','アカイ','1','old','op'],['A','K1','ｱｵｷ','','','op']];
 sim.sheets.get('出納・会計').grid=[['ID','所属寺院ID','日付','世帯ID',...ROW_META],['T2','K1','2026/10/1','A','','','op'],['T1','K1','2026/2/1','B','','','op']];
 await a.prepare('token');await b.heartbeat('token');await a.cleanup('token');
 assert.deepEqual(sim.sheets.get('檀家名簿').grid.slice(1).map(r=>r[0]),['A','B','C']);
 assert.deepEqual(sim.sheets.get('出納・会計').grid.slice(1).map(r=>[r[0],r[3]]),[['T1','B'],['T2','A']]);
 const writes=sim.calls.filter(c=>c.body?.requests?.some(r=>r.sortRange));assert.equal(writes.length,1);
 assert.equal(writes[0].body.requests.filter(r=>r.sortRange).length,2);
});

 test('a same-browser tab can cancel preparation with pending audit without discarding it', async () => {
 const {sim,a}=await setup(); await a.prepare('token');
 queueAudit([{logId:'pending-cancel',id:'T1',deletedTimestamp:123,actionType:'update',entityType:'transaction'}]);
 const peer=new HistoryMaintenanceClient('sheet','owner','tab-peer',sim.fetch,()=> '');
 await peer.heartbeat('token'); await peer.resume('token');
 assert.equal(peer.view.state.phase,'running');
 assert.equal((await pendingAudit()).length,1);
 assert(!sim.calls.some(c=>c.body?.requests?.some(r=>r.deleteDimension)));
 });

test('maintenance acknowledges only history IDs confirmed in the destination baseline', async () => {
 const {a}=await setup();
 queueAudit([{logId:'confirmed',id:'T1'},{logId:'unknown',id:'T2'}]);
 memory.set('row-sync-baseline-v1:sheet', {'操作・削除履歴':[header,['confirmed']]});
 await a.heartbeat('token');
 assert.deepEqual((await pendingAudit()).map(e=>e.logId),['unknown']);
 assert.match(a.view.devices.find(d=>d.id===a.tab).reason,/1件/);
 memory.set('row-sync-baseline-v1:sheet', {'操作・削除履歴':[header,['confirmed'],['unknown']]});
 await a.heartbeat('token');
 assert.equal((await pendingAudit()).length,0);
 assert.equal(a.view.devices.find(d=>d.id===a.tab).reason,'');
});

test('merge waits for peer UI lock, preserves pending edits, and excludes every other writer',async()=>{
 const {a,b,dirty}=await setup();dirty('未保存の編集');
 await a.prepareMerge('token');await b.heartbeat('token');assert.equal(await a.confirmMergeStopped('token'),false);
 await assert.rejects(a.enterWrite('token'),/一時停止/);
 b.setMergeUiLocked(true);await b.heartbeat('token');assert.equal(await a.confirmMergeStopped('token'),true);
 await assert.rejects(b.enterWrite('token'),/一時停止/);await assert.rejects(a.cleanup('token'),/停止準備/);
 const release=await a.enterWrite('token');release();await a.markMergeSubmitted('token');
 await assert.rejects(a.finishMerge('token',false),/確認が必要/);
 await a.finishMerge('token',true);assert.equal(a.view.state.phase,'running');
 b.setMergeUiLocked(false);await b.heartbeat('token');assert.equal(b.view.devices.find(d=>d.id===b.tab).reason,'未保存の編集');
});
test('a non-admin tab can coordinate its merge but cannot bypass a newly joined peer',async()=>{
 const {a,b,sim}=await setup();await b.prepareMerge('token');a.setMergeUiLocked(true);await a.heartbeat('token');assert.equal(await b.confirmMergeStopped('token'),true);
 const late=new HistoryMaintenanceClient('sheet','late','late',sim.fetch,()=> '');await late.heartbeat('token');
 await assert.rejects(b.markMergeSubmitted('token'),/一時停止/);
 await b.finishMerge('token',false);assert.equal(b.view.state.phase,'running');
});
test('count-based cleanup keeps latest 1000 without a day limit, preserves physical order, rejects invalid IDs', () => {
  assert.throws(() => planHistoryCleanup(history(2000)), /不要/);
  const grid = history(2001); [grid[1], grid[2001]] = [grid[2001], grid[1]];
  const plan = planHistoryCleanup(grid); assert.equal(plan.kept.length, 1001); assert.equal(plan.archive.length, 1002);
  assert.equal(plan.kept[1][0], 'L2000'); assert.equal(plan.archive.at(-1)[0], 'L0');
  const duplicate = history(); duplicate[2][0] = duplicate[1][0]; assert.throws(() => planHistoryCleanup(duplicate), /重複/);
  const invalid = history(); invalid[2][6] = ''; assert.throws(() => planHistoryCleanup(invalid), /日時/);
});
test('unresponsive and dirty devices never expire; a guest cannot resume or clean', async () => {
  const { sim, a, b, dirty } = await setup(); await a.prepare('token');
  assert.equal(waitingDevices(a.view.devices, a.view.state.epoch).length, 1);
  await assert.rejects(a.cleanup('token'), /停止を確認できない/);
  dirty('未保存の編集'); await b.heartbeat('token'); await assert.rejects(a.cleanup('token'), /停止を確認できない/);
  await assert.rejects(b.resume('token'), /管理端末/);
  await assert.rejects(b.enterWrite('token'), /一時停止/);
  assert(!sim.calls.some(c => c.body?.requests?.some(r => r.deleteDimension)));
  await a.resume('token'); assert.equal(a.view.state.phase, 'running');
});
test('acknowledged cleanup deletes atomically, preserves all business rows, requires a new read before writing', async () => {
  const { sim, a, b } = await setup();
  const original = JSON.stringify(['檀家名簿', '過去帳', '出納・会計'].map(n => sim.sheets.get(n).grid));
  await a.prepare('token'); await b.heartbeat('token'); await a.cleanup('token');
  assert.equal(sim.sheets.get('操作・削除履歴').grid.length, 1001);
  assert(![...sim.sheets.keys()].some(n => n.startsWith(ARCHIVE_PREFIX)));
  assert(sim.sheets.has(PURGE_LEDGER));
  assert.equal(original, JSON.stringify(['檀家名簿', '過去帳', '出納・会計'].map(n => sim.sheets.get(n).grid)));
  const batches = sim.calls.filter(c => c.body?.requests?.some(r => r.deleteDimension)); assert.equal(batches.length, 1);
  assert(batches[0].body.requests.some(r => r.addSheet)); assert(!batches[0].body.requests.some(r => r.copyPaste));
  await a.resume('token'); await assert.rejects(b.enterWrite('token'), /最新の情報/);
  const rev = await b.beginRead('token'); await b.finishRead('token', rev); const release = await b.enterWrite('token'); release();
});
test('in-flight writes prevent a stop acknowledgement even if UI reports idle', async () => {
  const { a, b } = await setup(); const release = await b.enterWrite('token');
  await assert.rejects(a.prepare('token'), /連携は停止していません/);
  assert.equal(a.view.state.phase, 'running');
  release();
  await b.heartbeat('token'); await a.prepare('token'); await b.heartbeat('token'); await a.cleanup('token'); assert.equal(a.view.state.phase, 'preparing');
});
test('new devices joining while paused cannot write or bypass stop confirmation', async () => {
  const { sim, a, b } = await setup(); await a.prepare('token'); await b.heartbeat('token');
  const late = new HistoryMaintenanceClient('sheet', 'late', 'late-tab', sim.fetch, () => '未保存の編集');
  await late.heartbeat('token'); await assert.rejects(late.enterWrite('token'), /一時停止/);
  await assert.rejects(a.cleanup('token'), /停止を確認できない/);
});
test('lost response is verified without a second deletion; restart keeps the pending journal', async () => {
  const { sim, a, b } = await setup(); await a.prepare('token'); await b.heartbeat('token'); sim.lose();
  await assert.rejects(a.cleanup('token'), /response lost/); await assert.rejects(a.resume('token'), /整理結果/);
  const restarted = new HistoryMaintenanceClient('sheet', 'owner', 'tab-a', sim.fetch, () => '');
  await restarted.verifyCleanup('token'); await restarted.resume('token');
  assert.equal(sim.calls.filter(c => c.body?.requests?.some(r => r.deleteDimension)).length, 1);
  assert.equal(memory.get('history-cleanup-pending:sheet'), null);
});
test('missing local journal cannot release a submitted cleanup; unconfirmed non-commit never permits cancellation', async () => {
  const { sim, a, b } = await setup(); await a.prepare('token'); await b.heartbeat('token'); sim.lose();
  await assert.rejects(a.cleanup('token'), /response lost/);
  const journal = memory.get('history-cleanup-pending:sheet');
  memory.delete('history-cleanup-pending:sheet');
  await assert.rejects(a.verifyCleanup('token'), /確認記録が端末にありません/);
  memory.set('history-cleanup-pending:sheet', journal);
  for (const [name, grid] of Object.entries(journal.before)) sim.sheets.get(name).grid = structuredClone(grid);
  sim.sheets.delete(PURGE_LEDGER);
  await assert.rejects(a.verifyCleanup('token'), /まだ確定していません/);
  await assert.rejects(a.resume('token'), /整理結果/);
});
test('rejected writes leave history intact and allow verified cancellation; mismatched results stay stopped', async () => {
  let { sim, a, b } = await setup(); await a.prepare('token'); await b.heartbeat('token'); sim.reject();
  await assert.rejects(a.cleanup('token'), /429/); assert.equal(sim.sheets.get('操作・削除履歴').grid.length, 2002);
  await a.verifyCleanup('token'); await a.resume('token');
  ({ sim, a, b } = await setup()); await a.prepare('token'); await b.heartbeat('token'); sim.corrupt();
  await assert.rejects(a.cleanup('token'), /一致しません/); await assert.rejects(a.resume('token'), /整理結果/);
});
test('retired tab blocks its own writes and is exempt only after explicit safe leave', async () => {
  const { a, b, dirty } = await setup(); dirty('未保存'); await assert.rejects(b.leave('token'), /未保存/);
  dirty(''); await b.leave('token'); await assert.rejects(b.enterWrite('token'), /一時停止/);
  await a.prepare('token'); await a.cleanup('token');
});
test('unsent audit entries survive display limits and only verified IDs are acknowledged', async () => {
  memory.clear(); const entries = Array.from({ length: 2100 }, (_, i) => ({ logId: 'pending-' + i, id: 'H' + i, entityType: 'household', actionType: 'update', deletedTimestamp: i + 1 }));
  queueAudit(entries.slice(0, 1000)); queueAudit(entries.slice(1000));
  assert.equal((await pendingAudit()).length, 2100);
  assert.equal((await auditForExport([{ logId: 'old-archived', id: 'H' }], true)).length, 2100);
  await acknowledgeAudit({ '操作・削除履歴': [header, ['pending-0'], ['pending-1']] });
  assert.equal((await pendingAudit()).length, 2098);
  await acknowledgeAudit({ '操作・削除履歴': [header] }); assert.equal((await pendingAudit()).length, 2098);
  await acknowledgeAudit({ '操作・削除履歴': [header] }, true); assert.equal((await pendingAudit()).length, 0);
  assert.equal(memory.get('discarded-audit-v1').length, 2098);
});
test('same-browser closed-tab retirement uses a browser lock, never a heartbeat timeout', async () => {
  const { sim, a } = await setup();
  const closed = new HistoryMaintenanceClient('sheet', 'owner', 'closed-tab', sim.fetch, () => '');
  const alive = new HistoryMaintenanceClient('sheet', 'owner', 'alive-tab', sim.fetch, () => '');
  await closed.heartbeat('token'); await alive.heartbeat('token');
  const descriptor = Object.getOwnPropertyDescriptor(global, 'navigator');
  Object.defineProperty(global, 'navigator', { configurable: true, value: { locks: { request: async (name, options, callback) => callback(name.endsWith('closed-tab') ? {} : null) } } });
  try {
    await a.retireClosedTabs('token'); await a.read('token');
    assert.equal(a.view.devices.find(d => d.id === 'closed-tab').retired, true);
    assert.equal(a.view.devices.find(d => d.id === 'alive-tab').retired, false);
    assert.equal(a.view.devices.find(d => d.id === 'tab-b').retired, false);
  } finally { if (descriptor) Object.defineProperty(global, 'navigator', descriptor); else delete global.navigator; }
});
test('history readback permits retained older logs but never missing intended logs or extra business records', () => {
  const { verifyMergedReadback } = require('../src/utils/threeWaySheetsMerge.ts');
  const log = { logId: 'new', id: 'H', actionType: 'update' };
  assert(verifyMergedReadback([log], [log, { logId: 'old', id: 'H' }], 'deletedRecords'));
  assert(!verifyMergedReadback([log], [], 'deletedRecords'));
  assert(!verifyMergedReadback([{ id: 'H' }], [{ id: 'H' }, { id: 'H2' }], 'households'));
});
test('large history text is purged with small deletion requests, including interleaved rows', async () => {
  const { sim, a, b } = await setup();
  const grid = sim.sheets.get('操作・削除履歴').grid;
  for (let i = 1; i < grid.length; i++) grid[i][4] = '長い変更履歴'.repeat(300);
  [grid[1], grid[2001]] = [grid[2001], grid[1]];
  const expected = planHistoryCleanup(structuredClone(grid), 999);
  assert(Buffer.byteLength(JSON.stringify(expected.archive)) > 1800000);
  await a.prepare('token'); await b.heartbeat('token'); await a.cleanup('token');
  assert(![...sim.sheets.keys()].some(n => n.startsWith(ARCHIVE_PREFIX)));
  assert.deepEqual(sim.sheets.get('操作・削除履歴').grid.slice(0, -1), expected.kept);
  const batch = sim.calls.find(c => c.body?.requests?.some(r => r.deleteDimension));
  assert(Buffer.byteLength(JSON.stringify(batch.body)) < 10000);
  assert(!batch.body.requests.some(r => r.copyPaste));
});

test('permanent cleanup removes only flagged rows and reserves IDs; active related records survive', async () => {
  const { sim, a, b } = await setup();
  sim.sheets.get('檀家名簿').grid = [['檀家ID', '世帯主名', ...ROW_META], ['K2-1', '削除世帯', '1', 'date', 'op'], ['K2-2', '継続世帯', '', '', '']];
  sim.sheets.get('過去帳').grid = [['過去帳ID', '檀家ID', ...ROW_META], ['P1', 'K2-1', '', '', '']];
  sim.sheets.get('出納・会計').grid = [['会計ID', '檀家ID', ...ROW_META], ['T1', 'K2-1', '', '', ''], ['T2', 'K2-1', '1', 'date', 'op']];
  await a.prepare('token'); await b.heartbeat('token'); await a.cleanup('token');
  assert.equal(sim.sheets.get('檀家名簿').grid.length, 2);
  assert.equal(sim.sheets.get('過去帳').grid[1][0], 'P1');
  assert.equal(sim.sheets.get('出納・会計').grid[1][0], 'T1');
  const ledger = sim.sheets.get(PURGE_LEDGER).grid;
  assert(ledger.some(r => r[0] === 'household' && r[1] === 'K2-1' && r[3] === 'K2-'));
  assert(ledger.some(r => r[0] === 'transaction' && r[1] === 'T2'));
  assert(!JSON.stringify(ledger).includes('削除世帯'));
  await a.resume('token');
  sim.sheets.delete(PURGE_LEDGER);
  await assert.rejects(a.beginRead('token'));
  await assert.rejects(a.enterWrite('token'));
});

test('manual cleanup works below history threshold and repeated cleanup preserves reservations', async () => {
  const { sim, a, b } = await setup();
  sim.sheets.get('操作・削除履歴').grid = history(10);
  sim.sheets.get('檀家名簿').grid = [['檀家ID', ...ROW_META], ['K8-1', '1', 'date', 'op']];
  await a.prepare('token'); await b.heartbeat('token'); await a.cleanup('token');
  assert.equal(sim.sheets.get('操作・削除履歴').grid.length, 12);
  const first = structuredClone(sim.sheets.get(PURGE_LEDGER).grid);
  await a.resume('token');
  sim.sheets.get('檀家名簿').grid.push(['K8-2', '1', 'date', 'op']);
  await a.prepare('token'); await b.heartbeat('token'); await a.cleanup('token');
  assert.deepEqual(sim.sheets.get(PURGE_LEDGER).grid.slice(0, first.length), first);
  assert.equal(sim.sheets.get(PURGE_LEDGER).grid.length, first.length + 1);
});

test('purged IDs cannot be restored by reviewed merges or explicit restore; fiscal moves remain active', () => {
  const { planPermanentCleanup } = require('../src/utils/permanentCleanupPlan.ts');
  const { makeRowSyncPlan } = require('../src/utils/rowSyncPlan.ts');
  const before = { '操作・削除履歴': history(5), '檀家名簿': [['檀家ID', ...ROW_META], ['K2-1', '1', 'date', 'op']],
    '出納・会計': [['会計ID', ...ROW_META], ['T1', '1', 'date', 'op']], '出納アーカイブ': [['会計ID', ...ROW_META], ['T1', '', '', '']] };
  const plan = planPermanentCleanup(before, 'epoch', Date.now());
  assert(!plan.expected[PURGE_LEDGER].some(r => r[0] === 'transaction' && r[1] === 'T1'));
  const sheets = Object.keys(plan.expected).map((title, sheetId) => ({title, sheetId, rowCount: 100, columnCount: 30}));
  assert.throws(() => makeRowSyncPlan({'檀家名簿': [['檀家ID'], ['K2-1']]}, plan.expected, plan.expected, sheets, 'write', 'now', true, 'K2-1'), /完全削除済み/);
  assert.doesNotThrow(() => makeRowSyncPlan({'出納アーカイブ': [['会計ID'], ['T1']]}, plan.expected, plan.expected, sheets, 'write', 'now'));
});


test('invalid deletion flags stop cleanup before any destructive write', async () => {
  const {sim,a,b}=await setup();
  for(const [n,title] of ['マスタ_試験兼務寺','マスター_試験兼務寺','マスタ_本寺'].entries())sim.sheets.set(title,{sheetId:110+n,title,gridProperties:{rowCount:100,columnCount:20},grid:[['区分','名称'],['会計','布施']]});
 sim.sheets.get('檀家名簿').grid=[['檀家ID',...ROW_META],['K1-1','yes','date','op']];
  await a.prepare('token');await b.heartbeat('token');
  await assert.rejects(a.cleanup('token'),/削除済みフラグ/);
  assert(!sim.calls.some(c=>c.body?.requests?.some(r=>r.deleteDimension)));
  await a.resume('token');
});

test('ledger tampering blocks fresh reads even when the management tab remains intact', async () => {
  const {sim,a,b}=await setup();
  for(const [n,title] of ['マスタ_試験兼務寺','マスター_試験兼務寺','マスタ_本寺'].entries())sim.sheets.set(title,{sheetId:110+n,title,gridProperties:{rowCount:100,columnCount:20},grid:[['区分','名称'],['会計','布施']]});
 sim.sheets.get('檀家名簿').grid=[['檀家ID',...ROW_META],['K1-1','1','date','op']];
  await a.prepare('token');await b.heartbeat('token');await a.cleanup('token');await a.resume('token');
  sim.sheets.get(PURGE_LEDGER).grid[1][1]='K1-2';
  await assert.rejects(a.beginRead('token'),/管理情報が変更/);
});

test('legacy archive journals remain verifiable after switching to permanent cleanup', async () => {
  const {sim,a,b}=await setup();await a.prepare('token');await b.heartbeat('token');
  const before=structuredClone(sim.sheets.get('操作・削除履歴').grid),plan=planHistoryCleanup(before),archiveTitle=ARCHIVE_PREFIX+a.view.state.epoch;
  sim.sheets.set(archiveTitle,{title:archiveTitle,sheetId:555,gridProperties:{rowCount:3000,columnCount:30},grid:plan.archive});
  sim.sheets.get('操作・削除履歴').grid=plan.kept;
  memory.set('history-cleanup-pending:sheet',{epoch:a.view.state.epoch,before,kept:plan.kept,archive:plan.archive,archiveTitle,revision:'legacy-completed',outcome:'sending'});
  await a.verifyCleanup('token');await a.resume('token');
  assert.equal(a.view.state.revision,'legacy-completed');
  assert(sim.sheets.has(archiveTitle));
});

test('real exporter sends more than 1000 pending logs; importer and writer exclude archive/control tabs', async () => {
  const path = require('path');
  require.cache[path.resolve(__dirname, '../src/lib/googleAuth.ts')] = { exports: { getCurrentUser: () => null, getActiveGoogleAccountName: () => '' } };
  const { workbook } = require('./rowSyncFixture.cjs');
  const { exportToSheets, importFromSheets } = require('../src/lib/googleSheets.ts');
  const { EMPTY_TEMPLE_INFO, EMPTY_MASTER_OPTIONS } = require('../src/data/initialData.ts');
  const sim = workbook(), original = global.fetch; global.fetch = sim.fetch;
  const temple = { ...EMPTY_TEMPLE_INFO, id: 'temple-main', name: '検証寺', isMain: true };
  try {
    queueAudit(Array.from({ length: 2100 }, (_, i) => ({ logId: 'send-' + i, id: 'T' + i, entityType: 'transaction', actionType: 'update', deletedTimestamp: 1700000000000 + i })));
    await exportToSheets('token', 'test-sheet', temple, [], [], [], [], EMPTY_MASTER_OPTIONS, undefined, [], [temple]);
    assert.equal(sim.sheets.get('操作・削除履歴').rows.length, 2101); assert.equal((await pendingAudit()).length, 0);
    sim.add(CONTROL_SHEET, [['control-private']]); sim.add(ARCHIVE_PREFIX + 'old', [['履歴ID'], ['OLD']]); sim.calls.length = 0;
    const read = await importFromSheets('token', 'test-sheet', { requireCompleteSchema: true, readOnly: true });
    assert.equal(read.deletedRecords.length, 2100);
    assert(!Object.keys(memory.get('row-sync-baseline-v1:test-sheet')).some(n => n.startsWith('__JBTD')));
    assert(!sim.calls.filter(c => c.url.includes('values:batchGet')).some(c => decodeURIComponent(c.url).includes('__JBTD')));
    const {LEDGER_HEADER} = require('../src/utils/purgeLedger.ts');
    sim.add(PURGE_LEDGER, [LEDGER_HEADER, ['household', 'K25-1', '', 'K25-', 'cleanup']]);
    const withLedger = await importFromSheets('token', 'test-sheet', {requireCompleteSchema:true, readOnly:true});
    assert.equal(withLedger.households.length, 0);
    assert(memory.get('row-sync-baseline-v1:test-sheet')[PURGE_LEDGER]);
    sim.calls.length = 0;
    await exportToSheets('token', 'test-sheet', temple, [], [], [], [], EMPTY_MASTER_OPTIONS, undefined, [], [temple]);
    assert(!sim.calls.filter(c => c.url.includes('values:batchGet')).some(c => decodeURIComponent(c.url).includes(CONTROL_SHEET)));
    assert.equal(sim.sheets.get(PURGE_LEDGER).rows.length, 2);
  } finally { global.fetch = original; }
});


test('resume releases the maintenance overlay before awaiting the interactive data comparison', async () => {
  const source = fs.readFileSync(require('path').join(__dirname, '../src/components/HistoryMaintenancePanel.tsx'), 'utf8');
  const ast = ts.createSourceFile('panel.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let handler;
  const visit = node => {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'finish') handler = node.initializer.getText(ast);
    ts.forEachChild(node, visit);
  }; visit(ast); assert(handler);
  let view = { state: { phase: 'preparing' } }, closed = false, complete, reached;
  const started = new Promise(resolve => { reached = resolve; });
  const pending = new Promise(resolve => { complete = resolve; });
  const context = { setAutomatic() {}, setView: value => { view = value; }, previous: { current: '' }, onClose: () => { closed = true; },
    resume: { current: () => { assert.equal(view.state.phase, 'running'); assert(closed); reached(); return pending; } } };
  const js = ts.transpileModule('('+handler+')', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const action = require('vm').runInNewContext(js, context);
  const client = { view, resume: async () => { client.view = { state: { phase: 'running', revision: 'r1' } }; } };
  const result = action(client, 'token'); await started;
  assert.equal(view.state.phase, 'running'); assert(closed); complete(); await result;
  closed = false; context.resume.current = () => { throw Error('Cancellation must not reload or merge'); };
  await action(client, 'token', false); assert(closed);
});


test('guided cleanup starts only after explicit start and every device acknowledgement', async () => {
  const source = fs.readFileSync(require('path').join(__dirname, '../src/components/HistoryMaintenancePanel.tsx'), 'utf8');
  const ast = ts.createSourceFile('panel.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let effect;
  const visit = node => { if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect' && node.arguments[0].getText(ast).includes('await c.cleanup(t)')) effect = node.arguments[0].getText(ast); ts.forEachChild(node, visit); }; visit(ast); assert(effect);
  const js = ts.transpileModule('('+effect+')', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  for (const blocked of ['not-started', 'busy', 'waiting', 'guest', 'compacting', 'none']) {
    const calls = []; let done;
    const c = { isOwner: blocked !== 'guest', cleanup: async () => calls.push('cleanup'), count: async () => 1000 };
    const context = { automatic: blocked !== 'not-started', busy: blocked === 'busy', action: { current: false }, client: c,
      view: { state: { phase: blocked === 'compacting' ? 'compacting' : 'preparing' } }, waiting: blocked === 'waiting' ? [{}] : [],
      run: work => { done = work(c, 'token'); }, setCount: n => calls.push(n), finish: async () => calls.push('resume') };
    require('vm').runInNewContext(js, context)(); await done;
    assert.deepEqual(calls, blocked === 'none' ? ['cleanup', 1000, 'resume'] : []);
  }
});

