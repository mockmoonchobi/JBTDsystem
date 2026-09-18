import { HOUSEHOLD, HISTORY, householdDeletions, deletionPlan, verifyHouseholdDeletion, acceptHouseholdDeletion } from './householdDeletion';
import { pendingOwner, isClosedPendingOwner } from './pendingOwnership';
import { PURGE_LEDGER, readPurgeLedger } from './purgeLedger';
import { rememberTemplePrefixes } from './templePrefixes';
import { acknowledgeAudit, captureClosedAuditIds, discardCapturedAudit, currentPageAudit } from './pendingAudit';
import { isMaintenanceSheet } from './historyMaintenancePlan';
import { idbGet, idbSet } from './storageUtils';
import { ExportSheet, resolveExportSheetName } from './sheetsExportUtils';
import { SheetUpdate } from './sheetsExportCache';
import { activeGrid, fingerprint, groupUpdates, makeRowSyncPlanResponsive, Snapshot, ROW_META } from './rowSyncPlan';
import { accountingAdditions, makeAccountingAppend, containsAppend, APPEND_TABLES } from './accountingAppend';

type Requester = (url: string, options?: RequestInit, retries?: number, backoff?: number, timeout?: number) => Promise<Response>;
const baseKey = (id: string) => 'row-sync-baseline-v1:' + id;
const pageBaselines = new Map<string, Snapshot>();
async function loadRowBaseline(id: string): Promise<Snapshot | undefined> {
  const shared = await idbGet<Snapshot>(baseKey(id));
  return shared && Object.keys(shared).length ? pageBaselines.get(id) || shared : shared;
}
async function acceptRowBaseline(id: string, snapshot: Snapshot) {
  await idbSet(baseKey(id), snapshot);
  pageBaselines.set(id, snapshot);
}
const journalKey = (id: string) => 'row-sync-pending-v1:' + id;
const quote = (name: string) => "'" + name.replace(/'/g, "''") + "'";
const same = (a: Snapshot, b: Snapshot) => Object.keys(a).every(name => fingerprint(a[name]) === fingerprint(b[name] || []));
export function verifyRows(expected: Snapshot, actual: Snapshot): boolean {
  return Object.keys(expected).every(name => {
    const a = expected[name].filter(r => r.some(v => v !== '' && v != null));
    const b = (actual[name] || []).filter(r => r.some(v => v !== '' && v != null));
    if (APPEND_TABLES.includes(name) && a.length && b.length) return containsAppend({ [name]: a }, { [name]: b });
    return a.length === b.length && a.every((row, i) => {
      const max = Math.max(row.length, b[i].length);
      for (let c = 0; c < max; c++) {
        const x = row[c] ?? '', y = b[i][c] ?? '';
        if (typeof x === 'boolean' && String(y).toUpperCase() === String(x).toUpperCase()) continue;
        if (typeof x === 'number' && Number.isFinite(x) && String(y).trim() !== '' && Number(String(y).replace(/,/g, '')) === x) continue;
        if (String(x) !== String(y)) return false;
      }
      return true;
    });
  });
}
/** Verify this write's cells only; unrelated peer rows are not part of its result. */
export function verifyRowChanges(before: Snapshot, expected: Snapshot, actual: Snapshot): boolean {
  const committed = new Set<string>();
  for(const [title,grid] of Object.entries(expected)) if(title.includes('履歴')) {
    const opCol=grid[0]?.indexOf(ROW_META[2])??-1;
    const live=new Map((actual[title]||[]).slice(1).map(r=>[String(r[0]),r]));
    for(const r of grid.slice(1)) if(opCol>=0 && r[opCol] && live.has(String(r[0])) && verifyRows({log:[r]},{log:[live.get(String(r[0]))!]})) committed.add(String(r[opCol]));
  }
  for (const [title, grid] of Object.entries(expected)) {
    const found = actual[title];
    if (!found?.length || fingerprint([grid[0]]) !== fingerprint([found[0]])) return false;
    const keyed = /ID|ＩＤ/i.test(String(grid[0][0]));
    const key = (r: unknown[], i: number) => keyed ? String(r[0]) : String(i);
    const index = (rows: unknown[][]) => new Map(rows.slice(1).map((r,i)=>[key(r,i),r] as const).filter(([,r])=>r.some(v=>v!==''&&v!=null)));
    const prior = index(before[title] || []), current = index(found);
    if (current.size !== found.slice(1).filter(r=>r.some(v=>v!==''&&v!=null)).length) return false;
    for (let i=1;i<grid.length;i++) {
      const row=grid[i], id=key(row,i-1), old=prior.get(id);
      if (old && fingerprint([old])===fingerprint([row])) continue;
      const saved=current.get(id); if (!saved) return false;
      const opCol=grid[0].indexOf(ROW_META[2]), flag=grid[0].indexOf(ROW_META[0]);
      // An immutable history row proves the atomic request committed even when a
      // later terminal has already changed this record. Do not replay our values.
      if(opCol>=0 && committed.has(String(row[opCol])) && saved[opCol] && String(saved[opCol])!==String(row[opCol]) &&
        !(String(row[flag])==='1' && String(saved[flag])!=='1')) continue;
      for(let c=0;c<row.length;c++) {
        if(old && fingerprint([[old[c]]])===fingerprint([[row[c]]])) continue;
        if (!verifyRows({cell:[[row[c]]]}, {cell:[[saved[c]]]})) return false;
      }
    }
  }
  return true;
}
const verifyPending = (pending: any, actual: Snapshot) => pending.kind === 'row-patch'
  ? verifyRowChanges(pending.before,pending.expected,actual) : verifyRows(pending.expected,actual);

/** Called only after the complete importer succeeds; never turn a partial read into a baseline. */
export async function rememberRowSyncRead(id: string, snapshot: Snapshot, discardPendingLocalChanges = false, allowUncertainComparison = false, startupReset?: {auditIds: string[]; operationId?: string}): Promise<void> {
  const pending = await idbGet<any>(journalKey(id));
  const discardStartupJournal = !!pending && !!startupReset?.operationId && pending.operationId === startupReset.operationId;
  if (pending && !discardStartupJournal && !discardPendingLocalChanges && !(pending.kind === 'household-delete' ? verifyHouseholdDeletion(pending.expected, snapshot) : pending.kind === 'accounting-append' ? containsAppend(pending.expected, snapshot) : verifyPending(pending, snapshot) || same(pending.before, snapshot))) {
    if (allowUncertainComparison) return; // Read for review only; retain the write barrier and journal.
    throw new Error('前回の保存結果を確定できません。Googleシートの確認が必要です。端末の変更は保持しています。');
  }
  // Only an explicit discard-and-read may abandon an uncertain write. Preserve
  // its evidence before accepting the complete remote snapshot; never write Sheets.
  if (pending && (discardPendingLocalChanges || discardStartupJournal)) {
    await idbSet('row-sync-discarded-v1:' + id, { pending, remote: snapshot, discardedAt: new Date().toISOString() });
  }
  await acknowledgeAudit(snapshot, discardPendingLocalChanges);
  await acceptRowBaseline(id, snapshot);
  if (pending && (!startupReset || discardStartupJournal)) await idbSet(journalKey(id), null);
  if (startupReset) await discardCapturedAudit(startupReset.auditIds);
}

async function readAppendTables(token: string, id: string, sheets: ExportSheet[], request: Requester): Promise<Snapshot> {
  const selected = sheets.filter(s => APPEND_TABLES.includes(s.title) || s.title === PURGE_LEDGER || s.title === '出納アーカイブ');
  const query = selected.map(s => 'ranges=' + encodeURIComponent(quote(s.title) + '!A:ZZ')).join('&');
  const res = await request('https://sheets.googleapis.com/v4/spreadsheets/' + id + '/values:batchGet?' + query + '&valueRenderOption=UNFORMATTED_VALUE', { headers: { Authorization: 'Bearer ' + token } });
  if (!res.ok) throw Object.assign(new Error('新規会計の保存確認に失敗しました（HTTP ' + res.status + '）。'), { status: res.status, isAuthError: res.status === 401 });
  const data = await res.json();
  if (!Array.isArray(data.valueRanges) || data.valueRanges.length !== selected.length) throw new Error('新規会計の確認応答が不完全です。');
  return Object.fromEntries(selected.map((s, i) => {
    const item = data.valueRanges[i];
    if (typeof item.range !== 'string' || !(item.range.startsWith(quote(s.title) + '!') || item.range.startsWith(s.title + '!')) ||
      !Array.isArray(item.values) || item.values.some((r: unknown) => !Array.isArray(r))) throw new Error('新規会計の確認範囲が不完全です。');
    return [s.title, item.values];
  }));
}

async function tryAccountingAppend(token: string, id: string, desired: Snapshot, baseline: Snapshot, sheets: ExportSheet[], request: Requester, changed?: Set<string>, onProgress?: (stage: string) => void, operations?: Snapshot): Promise<boolean> {
  const pending = await idbGet<any>(journalKey(id));
  if (pending && pending.kind !== 'accounting-append') return false;
  const additions = operations || accountingAdditions(desired, baseline, changed);
  if (!pending && !additions) return false;
  if (!pending && additions && !Object.keys(additions).length) return true;
  onProgress?.('新規会計と操作履歴の保存状況を確認しています');
  const before = await readAppendTables(token, id, sheets, request);
  if (pending) {
    // A late server response is possible even when no rows are visible yet.
    // Never resend an uncertain append, even after another device appends rows.
    if (!containsAppend(pending.expected, before)) throw new Error('新規会計の保存結果をまだ確認できません。二重登録を防ぐため再送を停止しています。データ連携で再確認してください。');
    await acknowledgeAudit(pending.expected);
    const accepted = { ...baseline };
    for (const [title, grid] of (pending.owner === await pendingOwner() ? Object.entries(pending.expected) : []) as [string, unknown[][]][]) {
      const ids = new Set((accepted[title] || []).slice(1).map(r => String(r[0])));
      accepted[title] = [...(accepted[title] || [grid[0]]), ...grid.slice(1).filter(r => !ids.has(String(r[0])))];
    }
    await acceptRowBaseline(id, accepted);
    await idbSet(journalKey(id), null);
    return tryAccountingAppend(token, id, desired, accepted, sheets, request, changed, onProgress, operations);
  }
  if (baseline[PURGE_LEDGER] && !before[PURGE_LEDGER]) throw new Error('使用済みIDの管理シートがありません。');
  const reserved = new Set(readPurgeLedger(before[PURGE_LEDGER]).filter(r => r[0] === 'transaction').map(r => r[1]));
  const archived = new Set((before['出納アーカイブ'] || []).slice(1).map(r => String(r[0])));
  if (additions!['出納・会計'].slice(1).some(r => reserved.has(String(r[0])) || archived.has(String(r[0])))) throw new Error('削除済みIDまたはアーカイブ済みIDの再登録を検出しました。');
  const op = crypto.randomUUID();
  const plan = makeAccountingAppend(additions!, before, sheets, op);
  if (!plan) return false;
  const record = { kind: 'accounting-append', version: 1, owner: await pendingOwner(), operationId: op, before, expected: plan.expected };
  await idbSet(journalKey(id), record);
  onProgress?.('新規会計をまとめて追記しています');
  if (plan.requests.length) {
  const response = await request('https://sheets.googleapis.com/v4/spreadsheets/' + id + ':batchUpdate', {
    method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify({ requests: plan.requests }),
  }, 1, 600, 45000);
  if (!response.ok) {
    if (response.status >= 400 && response.status < 500 && response.status !== 408) await idbSet(journalKey(id), null);
    throw Object.assign(new Error('新規会計の追記に失敗しました（HTTP ' + response.status + '）。'), { status: response.status, isAuthError: response.status === 401 });
  }
  }
  onProgress?.('追記した会計の保存結果を確認しています');
  const actual = await readAppendTables(token, id, sheets, request);
  if (!containsAppend(plan.expected, actual)) throw new Error('新規会計の保存結果を確認できません。自動再送せず停止しました。');
  await acknowledgeAudit(plan.expected);
  // Do not acknowledge unseen peer changes as our local baseline.
  const accepted = { ...baseline };
  for (const [title, grid] of Object.entries(plan.expected)) {
    const known = new Set((baseline[title] || []).slice(1).map(r => String(r[0])));
    accepted[title] = [...(baseline[title] || [grid[0]]), ...grid.slice(1).filter(r => !known.has(String(r[0])))];
  }
  await acceptRowBaseline(id, accepted);
  await idbSet(journalKey(id), null);
  return true;
}
/** Explicit operations never fall back to a whole-workbook plan or maintenance merge. */
export async function saveAccountingOperations(token: string, id: string, operations: Snapshot, sheets: ExportSheet[], request: Requester, onProgress?: (stage: string) => void): Promise<void> {
  if (Object.keys(operations).some(t => !APPEND_TABLES.includes(t)) || APPEND_TABLES.some(t => !operations[t]?.length)) throw new Error('受付の送信データが不完全です。');
  const empty = Object.fromEntries(APPEND_TABLES.map(t => [t, [[...operations[t][0], ...ROW_META]]]));
  if (!accountingAdditions(operations, empty)) throw new Error('受付の作成内容と操作履歴が一致しません。');
  const run = async () => {
    const baseline = await loadRowBaseline(id);
    if (!baseline) throw new Error('受付の保存先を確認できません。先にGoogleシートを読み込んでください。');
    if (!await tryAccountingAppend(token,id,operations,baseline,sheets,request,undefined,onProgress,operations))
      throw new Error('受付用シートの構成、または前回の保存状態を確認できません。端末の受付は保持しています。');
  };
  if (typeof navigator !== 'undefined' && navigator.locks) await navigator.locks.request('jbtd-row-save-'+id,run);
  else await run();
}
async function tryHouseholdDeletion(token: string, id: string, desired: Snapshot, baseline: Snapshot, sheets: ExportSheet[], request: Requester, changed?: Set<string>, onProgress?: (stage: string) => void): Promise<boolean> {
  const pending = await idbGet<any>(journalKey(id));
  if (pending && pending.kind !== 'household-delete') return false;
  const changes = householdDeletions(desired, baseline, changed);
  if (!pending && !changes) return false;
  const selected = sheets.filter(s => s.title === HOUSEHOLD || s.title === HISTORY);
  if (selected.length !== 2) return false;
  onProgress?.('削除する檀家と操作履歴を確認しています');
  const before = await readPhysicalTables(token, id, selected, request);
  if (pending) {
    if (!verifyHouseholdDeletion(pending.expected, before)) throw new Error('檀家削除の保存結果をまだ確認できません。自動再送せず停止しています。データ連携で確認してください。');
    await acknowledgeAudit(pending.expected);
    const accepted = pending.owner === await pendingOwner() ? acceptHouseholdDeletion(baseline, pending.expected) : baseline;
    await acceptRowBaseline(id, accepted);
    await idbSet(journalKey(id), null);
    if (!householdDeletions(desired, accepted, changed)) return false;
    return tryHouseholdDeletion(token,id,desired,accepted,sheets,request,changed,onProgress);
  }
  if (fingerprint([before[HOUSEHOLD]?.[0] || []]) !== fingerprint([baseline[HOUSEHOLD]?.[0] || []])) return false;
  const op = crypto.randomUUID(), plan = deletionPlan(changes!, before, sheets, op);
  if (!plan) return false;
  const record = {kind:'household-delete',version:1,owner:await pendingOwner(),operationId:op,before,expected:plan.expected};
  await idbSet(journalKey(id),record);
  if (plan.requests.length) {
    onProgress?.('檀家の削除フラグと操作履歴を保存しています');
    const response = await request('https://sheets.googleapis.com/v4/spreadsheets/'+id+':batchUpdate', {
      method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({requests:plan.requests}),
    },1,600,45000);
    if (!response.ok) {
      if (response.status >= 400 && response.status < 500 && response.status !== 408) await idbSet(journalKey(id),null);
      throw Object.assign(new Error('檀家削除の保存に失敗しました（HTTP '+response.status+'）。'),{status:response.status,isAuthError:response.status===401});
    }
  }
  onProgress?.('削除した檀家の保存結果を確認しています');
  // appendCells can grow the history grid. Read the complete selected columns,
  // without relying on the row count captured before the append.
  const query=selected.map(s=>'ranges='+encodeURIComponent(quote(s.title)+'!A:ZZ')).join('&');
  const response=await request('https://sheets.googleapis.com/v4/spreadsheets/'+id+'/values:batchGet?'+query+'&valueRenderOption=FORMATTED_VALUE',{headers:{Authorization:'Bearer '+token}});
  if (!response.ok) throw new Error('檀家削除の保存確認に失敗しました（HTTP '+response.status+'）。');
  const values=(await response.json()).valueRanges;
  if (!Array.isArray(values) || values.length!==selected.length || values.some((v:any,i:number)=>typeof v.range!=='string' || !(v.range.startsWith(quote(selected[i].title)+'!') || v.range.startsWith(selected[i].title+'!')) || !Array.isArray(v.values))) throw new Error('檀家削除の確認応答が不完全です。');
  const actual=Object.fromEntries(selected.map((s,i)=>[s.title,values[i].values]));
  if (!verifyHouseholdDeletion(plan.expected,actual)) throw new Error('檀家削除の保存結果を確認できません。自動再送せず停止しました。');
  await acknowledgeAudit(plan.expected);
  await acceptRowBaseline(id,acceptHouseholdDeletion(baseline,plan.expected));
  await idbSet(journalKey(id),null);
  return true;
}
export function hideTombstones(map: Map<string, { headers: string[]; rows: any[][] }>): Snapshot {
  const original: Snapshot = {};
  for (const [name, data] of map) {
    const grid = [data.headers, ...data.rows];
    original[name] = grid;
    if (name === PURGE_LEDGER) { readPurgeLedger(grid); map.delete(name); continue; }
    const visible = activeGrid(grid);
    map.set(name, { headers: (visible[0] || []).map(String), rows: visible.slice(1) });
  }
  rememberTemplePrefixes(original);
  return original;
}
export async function readPhysicalTables(token: string, id: string, sheets: ExportSheet[], request: Requester): Promise<Snapshot> {
  const result: Snapshot = {};
  const ranges: { title: string; start: number; end: number; range: string }[] = [];
  for (const sheet of sheets.filter(s => !isMaintenanceSheet(s.title))) {
    result[sheet.title] = [];
    for (let start = 1; start <= sheet.rowCount; start += 2000) {
      const end = Math.min(start + 1999, sheet.rowCount);
      const range = quote(sheet.title) + '!A' + start + ':ZZ' + end;
      ranges.push({ title: sheet.title, start, end, range });
    }
  }
  // One request per 20 ranges, rather than one request per table/page.
  for (let offset = 0; offset < ranges.length; offset += 20) {
    const batch = ranges.slice(offset, offset + 20);
    const query = batch.map(item => 'ranges=' + encodeURIComponent(item.range)).join('&');
    const response = await request('https://sheets.googleapis.com/v4/spreadsheets/' + id + '/values:batchGet?' +
      query + '&valueRenderOption=FORMATTED_VALUE', { headers: { Authorization: 'Bearer ' + token } });
    if (!response.ok) throw Object.assign(new Error(response.status === 429
      ? 'Googleのアクセス回数制限に達しました。端末の編集は保持しています。約1分待ってから再連携してください（HTTP 429）。'
      : '保存前後の確認に失敗しました（HTTP ' + response.status + '）。'), { status: response.status, isAuthError: response.status === 401 });
    const body = await response.json();
    if (!Array.isArray(body.valueRanges) || body.valueRanges.length !== batch.length) throw new Error('保存前後の読込応答が不完全です。');
    for (let index = 0; index < batch.length; index++) {
      const { title, start, end } = batch[index];
      const value = body.valueRanges[index];
      const bounds = typeof value?.range === 'string' ? value.range.match(/!A(\d+):[A-Z]+(\d+)$/) : null;
      if (!bounds || Number(bounds[1]) !== start || Number(bounds[2]) !== end ||
          (!value.range.startsWith(quote(title) + '!') && !value.range.startsWith(title + '!')) ||
          (value.values !== undefined && (!Array.isArray(value.values) || value.values.some((r: unknown) => !Array.isArray(r))))) {
        throw new Error('保存前後の読込応答が不完全です。');
      }
      const rows = value.values || [];
      if (rows.length > end - start + 1) throw new Error('読込行数が不正です。');
      const grid = result[title];
      for (let i = 0; i <= end - start; i++) grid.push(rows[i] || []);
    }
  }
  for (const grid of Object.values(result)) {
    while (grid.length && !grid[grid.length - 1].some(v => v !== '' && v != null)) grid.pop();
  }
  return result;
}

async function saveIncrementalRowsCore(
  token: string, id: string, updates: SheetUpdate[], sheets: ExportSheet[],
  request: Requester, reviewed = false, changedTables?: Set<string>, restoreHouseholdId?: string, onProgress?: (stage: string) => void, deletedRecordIds: string[] = [],
): Promise<void> {
  let baseline = await loadRowBaseline(id);
  if (!baseline) throw new Error('追記方式の同期基準がありません。一度Googleシートを読み込んでください。');
  if (!reviewed && await tryHouseholdDeletion(token, id, groupUpdates(updates), baseline, sheets, request, changedTables, onProgress)) return;
  baseline = await loadRowBaseline(id) || baseline;
  if (!reviewed && await tryAccountingAppend(token, id, groupUpdates(updates), baseline, sheets, request, changedTables, onProgress)) return;
  baseline = await loadRowBaseline(id) || baseline;
  const desired = groupUpdates(updates);
  if(changedTables) for(const name of Object.keys(desired)) if(!changedTables.has(name)) delete desired[name];
  const names = new Set(Object.keys(desired).map(n=>resolveExportSheetName(n,sheets.map(s=>s.title))));
  names.add(PURGE_LEDGER);
  names.add(resolveExportSheetName('操作・削除履歴',sheets.map(s=>s.title)));
  const pending = await idbGet<any>(journalKey(id));
  for(const title of Object.keys(pending?.expected || {})) names.add(title);
  const selectedSheets = sheets.filter(s=>names.has(s.title));
  onProgress?.('変更対象のテーブルを確認しています');
  const before = await readPhysicalTables(token, id, selectedSheets, request);
  if (pending) {
    if (verifyPending(pending, before)) {
      baseline = pending.owner === await pendingOwner() && pending.desired ? advanceLocalRows(baseline,pending.desired,pending.expected,sheets.map(s=>s.title)) : baseline;
      await acceptRowBaseline(id, baseline);
      await idbSet(journalKey(id), null);
    } else if (same(pending.before, before)) {
      await idbSet(journalKey(id), null);
    } else if (reviewed) {
      await idbSet('row-sync-reviewed-v1:' + id, { pending, before });
      baseline = before;
      // Keep the old journal until the replacement plan is durably recorded.
    } else throw new Error('前回の保存結果が不明です。再送せず停止しました。');
  }
  const op = crypto.randomUUID();
  // Keep generated timestamps in unchanged tables from producing spurious edits.
  if (changedTables) for (const name of Object.keys(desired)) {
    if (!changedTables.has(name)) {
      const title = resolveExportSheetName(name, sheets.map(s => s.title));
      delete desired[name]; // Unchanged tables must not participate in this write.
    }
  }
  const historyTitle = resolveExportSheetName('操作・削除履歴', sheets.map(s=>s.title));
  if (desired['操作・削除履歴'] && before[historyTitle]?.length && fingerprint([activeGrid(before[historyTitle])[0]]) === fingerprint([desired['操作・削除履歴'][0]])) {
    const remoteLogs = activeGrid(before[historyTitle]);
    const oldIds = new Set(activeGrid(baseline[historyTitle] || []).slice(1).map(r=>String(r[0])));
    const byId = new Map(remoteLogs.slice(1).map(r=>[String(r[0]),r]));
    for (const row of desired['操作・削除履歴'].slice(1)) {
      const key=String(row[0]);
      if (!oldIds.has(key) && byId.has(key) && fingerprint([byId.get(key)!]) !== fingerprint([row])) throw new Error('操作履歴IDの内容が一致しません: ' + key);
      if (!oldIds.has(key) && !byId.has(key)) byId.set(key,row);
    }
    desired['操作・削除履歴']=[remoteLogs[0],...byId.values()];
    baseline={...baseline,[historyTitle]:before[historyTitle]};
  }
  onProgress?.('変更する行を比較・計算しています');
  const plan = await makeRowSyncPlanResponsive(desired, before, baseline, sheets, op, new Date().toISOString(), reviewed, restoreHouseholdId, deletedRecordIds);
  if (!plan.requests.length) {
    // A previous successful send may have lost its acknowledgement locally.
    await acknowledgeAudit(before);
    if (reviewed && pending) {
      await acceptRowBaseline(id, before);
      await idbSet(journalKey(id), null);
    }
    return;
  }
  const record = { kind: 'row-patch', version: 1, owner: await pendingOwner(), operationId: op, before, desired, expected: plan.expected, summary: plan.summary };
  // Persist both sides before sending. Failure here means zero data writes.
  // Keep one last pre-save snapshot per destination, not an unbounded full copy per edit.
  onProgress?.('書き込み前の確認記録を端末に保存しています');
  await idbSet('row-sync-backup-v1:' + id, record);
  await idbSet(journalKey(id), record);
  onProgress?.('変更した行をGoogleシートに書き込んでいます');
  const response = await request('https://sheets.googleapis.com/v4/spreadsheets/' + id + ':batchUpdate', {
    method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests: plan.requests }),
  }, 1, 600, 45000);
  if (!response.ok) {
    if(response.status>=400 && response.status<500 && response.status!==408) await idbSet(journalKey(id),null);
    throw new Error('行単位の保存に失敗しました（HTTP ' + response.status + '）。再連携で結果を確認してください。');
  }
  const grownSheets = selectedSheets.map(s => ({ ...s, rowCount: Math.max(s.rowCount, (plan.expected[s.title]?.length || 0) + 100) }));
  // Reload actual grid metadata: never request beyond the allocated grid.
  onProgress?.('書き込み後のシート構成を確認しています');
  const metadata = await request('https://sheets.googleapis.com/v4/spreadsheets/' + id + '?fields=sheets.properties(sheetId,title,gridProperties)', {
    headers: { Authorization: 'Bearer ' + token },
  });
  if (!metadata.ok) throw new Error('保存後のシート確認に失敗しました。再連携してください。');
  const properties = (await metadata.json()).sheets;
  if (!Array.isArray(properties)) throw new Error('保存後の構成情報が不完全です。');
  const verifiedSheets = grownSheets.map(s => {
    const p = properties.find((v: any) => v.properties?.sheetId === s.sheetId)?.properties;
    if (!p || p.title !== s.title || !Number.isInteger(p.gridProperties?.rowCount)) throw new Error('保存後のシートが一致しません。');
    return { ...s, rowCount: p.gridProperties.rowCount };
  });
  onProgress?.('変更対象の保存結果を確認しています');
  const actual = await readPhysicalTables(token, id, verifiedSheets, request);
  onProgress?.('書き込んだ行と保存結果を照合しています');
  if (!verifyRowChanges(before, plan.expected, actual)) throw new Error('保存後の内容が一致しません。自動再送せず停止しました。');
  onProgress?.('保存確認の結果を端末に記録しています');
  await acknowledgeAudit(actual);
  await acceptRowBaseline(id, advanceLocalRows(baseline,desired,plan.expected,sheets.map(s=>s.title)));
  await idbSet(journalKey(id), null);
}

function advanceLocalRows(baseline: Snapshot, desired: Snapshot, expected: Snapshot, titles: string[]): Snapshot {
  const accepted = {...baseline};
  for(const [name, target] of Object.entries(desired)) {
    const title=resolveExportSheetName(name,titles), grid=expected[title];if(!grid)continue;
    const keyed=/ID|ＩＤ/i.test(String(target[0]?.[0]));
    const key=(r:unknown[],i:number)=>keyed?String(r[0]):String(i);
    const rows=new Map(target.slice(1).map((r,i)=>[key(r,i),r]));
    const prior=new Set((baseline[title]||[]).slice(1).map((r,i)=>key(r,i)));
    accepted[title]=[grid[0],...grid.slice(1).flatMap((r,i)=>{
      const id=key(r,i), local=rows.get(id);
      if(!local && !prior.has(id))return [];
      return [local ? [...target[0].map((_,c)=>local[c]??''),...r.slice(target[0].length)] : r];
    })];
  }
  return accepted;
}

/** Same-browser tabs must hold one lock across read, plan, commit and verification. */
export async function saveIncrementalRows(...args: Parameters<typeof saveIncrementalRowsCore>): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.locks) {
    return navigator.locks.request('jbtd-row-save-' + args[1], () => saveIncrementalRowsCore(...args));
  }
  return saveIncrementalRowsCore(...args);
}

export async function captureStartupReset(id: string) {
  const auditIds = await captureClosedAuditIds();
  const journal = await idbGet<any>(journalKey(id));
  return { auditIds, operationId: journal && await isClosedPendingOwner(journal.owner) ? journal.operationId as string : undefined };
}

export async function captureCurrentPageReset(id: string) {
  const auditIds = (await currentPageAudit()).map(e => e.logId!);
  const journal = await idbGet<any>(journalKey(id));
  return {auditIds, operationId: journal?.owner === await pendingOwner() ? journal.operationId as string : undefined};
}

export async function captureRowReadBaseline(id: string) { return loadRowBaseline(id); }
export async function restoreRowReadBaseline(id: string, snapshot: Snapshot | undefined) { if(snapshot) await acceptRowBaseline(id,snapshot); }
