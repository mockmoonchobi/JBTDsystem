import { planSubsidiaryPurge } from './subsidiaryPurgePlan';
import { waitForSheetsQuota, recordSheetsQuota } from './sheetsQuota';
import { readPhysicalTables } from './rowSyncClient';
import { PURGE_LEDGER, readPurgeLedger } from './purgeLedger';
import { planPermanentCleanup } from './permanentCleanupPlan';
import { tableSortRequests } from './tableSort';
import { fingerprint, Snapshot } from './rowSyncPlan';
import { idbGetStrict as idbGet, idbSet, safeStorage, hasStorageFailures } from './storageUtils';
import { pendingAudit, acknowledgeAudit } from './pendingAudit';
import { CONTROL_SHEET, MaintenanceDevice, MaintenanceState, waitingDevices, sameHistory } from './historyMaintenancePlan';

type View = { state: MaintenanceState; devices: MaintenanceDevice[]; sheetId: number };
type Fetcher = (url: string, options?: RequestInit) => Promise<Response>;
const quote = (s: string) => "'" + s.replace(/'/g, "''") + "'";
const cell = (value: unknown) => ({ userEnteredValue: { stringValue: String(value ?? '') } });
const rows = (grid: unknown[][]) => grid.map(row => ({ values: row.map(cell) }));
const ledgerDigest = async (grid: unknown[][]) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(fingerprint(grid))))).map(b => b.toString(16).padStart(2, '0')).join('');
const pausedError = () => new Error('データ統合または履歴整理のため、データ連携を一時停止しています。端末の編集は保持しています。開始したタブで処理状況を確認してください。');
let localStatus: () => string = () => 'アプリの準備中';
export function setMaintenanceLocalStatus(check: () => string) { localStatus = check; }
let identity: Promise<{ device: string; tab: string }> | undefined;
function browserIdentity() {
  return identity ||= (async () => {
    let device = safeStorage.getItem('history-manager-device-v1');
    if (!device) {
      device = crypto.randomUUID();
      if (!safeStorage.setItem('history-manager-device-v1', device)) throw new Error('端末の識別情報を保存できません。');
    }
    let tab = sessionStorage.getItem('history-manager-tab-v1') || crypto.randomUUID();
    // Duplicated tabs copy sessionStorage. A browser lock prevents sharing an acknowledgement.
    if (!navigator.locks) throw new Error('このブラウザーでは安全な端末停止を利用できません。対応ブラウザーをご利用ください。');
    const acquire = (id: string) => new Promise<boolean>(resolve => {
      navigator.locks.request('jbtd-history-tab-' + id, { ifAvailable: true }, lock => {
        resolve(!!lock);
        return lock ? new Promise<void>(() => {}) : undefined;
      }).catch(() => resolve(false));
    });
    if (!await acquire(tab)) { tab = crypto.randomUUID(); if (!await acquire(tab)) throw new Error('端末の識別を確認できません。'); }
    sessionStorage.setItem('history-manager-tab-v1', tab);
    return { device, tab };
  })();
}

/** Cooperative stop protocol, not a server lock. Unknown/offline participants never expire. */
export class HistoryMaintenanceClient {
  view: View | null = null;
  private writers = 0;
  private mergeUiLocked = false;
  setMergeUiLocked(value: boolean) { this.mergeUiLocked = value; }
  get ownsMerge() { return this.view?.state.purpose === 'merge' && this.view.state.mergeDevice === this.device && this.view.state.initiatorTab === this.tab; }
  private canOperate(view: View) { return view.state.phase === 'running' || this.ownsMerge && view.state.mergeReady === true; }
  private serial: Promise<unknown> = Promise.resolve();
  private seenRevision: string | undefined;
  private retired = false;
  constructor(readonly id: string, readonly device: string, readonly tab: string,
    private request: Fetcher = (url, options) => fetch(url, options), private status: () => string = () => localStatus()) {}
  get isOwner() { return this.view?.state.owner === this.device; }
  get stopped() { return this.retired || !!this.view && this.view.state.phase !== 'running'; }
  private exclusive<T>(work: () => Promise<T>): Promise<T> {
    const next = this.serial.catch(() => {}).then(work); this.serial = next; return next;
  }
  private async adminCommand<T>(work: () => Promise<T>): Promise<T> {
    if (typeof navigator !== 'undefined' && navigator.locks) return navigator.locks.request('jbtd-history-admin-' + this.id, work);
    return work(); // non-browser test harness; browser identities require Web Locks
  }
  private async api(token: string, path: string, body?: unknown, method = 'POST'): Promise<any> {
    const url = 'https://sheets.googleapis.com/v4/spreadsheets/' + this.id + path;
    const requestMethod = body === undefined ? 'GET' : method;
    await waitForSheetsQuota(url, requestMethod);
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await this.request(url, {
        method: body === undefined ? 'GET' : method, signal: controller.signal,
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      await recordSheetsQuota(url, response, requestMethod);
      if (!response.ok) throw Object.assign(new Error('履歴整理の状態を確認・保存できません（HTTP ' + response.status + '）。整理は実行せず停止します。'), { status: response.status, isAuthError: response.status === 401 });
      return await response.json();
    } finally { clearTimeout(timer); }
  }
  private async metadata(token: string) {
    const value = await this.api(token, '?fields=sheets.properties(sheetId,title,gridProperties)');
    if (!Array.isArray(value.sheets)) throw new Error('シートの構成情報が不完全です。');
    return value.sheets.map((s: any) => s.properties);
  }
  async read(token: string): Promise<View | null> {
    const sheetId = this.view?.sheetId ?? (await this.metadata(token)).find((s: any) => s.title === CONTROL_SHEET)?.sheetId;
    if (sheetId === undefined) { this.view = null; return null; }
    const data = await this.api(token, '/values/' + encodeURIComponent(quote(CONTROL_SHEET) + '!A1:B'));
    if (!Array.isArray(data.values) || !data.values[0]?.[0]) throw new Error('同期管理情報が不完全です。停止状態を解除できません。');
    const state = JSON.parse(data.values[0][0]) as MaintenanceState;
    if (state.version !== 1 || !state.owner || !state.revision || !['running', 'preparing', 'compacting'].includes(state.phase) || (state.phase !== 'running' && !state.epoch)) throw new Error('同期管理情報を確認できません。');
    const devices: MaintenanceDevice[] = [];
    data.values.slice(2).forEach((r: any[], i: number) => {
      if (!r?.length) return;
      const d = JSON.parse(r[1]);
      if (!r[0] || d.id !== r[0] || typeof d.device !== 'string' || !d.device || typeof d.retired !== 'boolean' || typeof d.reason !== 'string' || typeof d.ack !== 'string' || devices.some(x => x.id === d.id)) throw new Error('端末の停止確認情報が不正です。');
      devices.push({ ...d, row: i + 3 });
    });
    this.view = { state, devices, sheetId };
    return this.view;
  }
  private async reason() {
    if (this.writers) return '書き込み処理中';
    if (this.view?.state.purpose === 'merge') return this.ownsMerge || this.mergeUiLocked ? '' : '画面の停止を待っています';
    const local = this.status(); if (local) return local;
    if (hasStorageFailures()) return '端末への保存を確認できません';
    if (await idbGet('row-sync-pending-v1:' + this.id)) return '前回の保存結果が未確定';
    if ((await pendingAudit()).length) {
      // Only a complete, previously verified read/save can confirm queued IDs.
      const verified = await idbGet<Snapshot>('row-sync-baseline-v1:' + this.id);
      if (verified) await acknowledgeAudit(verified);
      const remaining = await pendingAudit();
      if (remaining.length) return `シートへの保存を確認できない操作履歴が${remaining.length}件あります`;
    }
    return '';
  }
  private async reportInner(token: string, view: View, reason: string, retired = false) {
    const d = view.devices.find(d => d.id === this.tab);
    const value = { id: this.tab, device: this.device, name: (typeof navigator !== 'undefined' && /Mobi|Android|iPhone/i.test(navigator.userAgent) ? 'スマホ' : 'PC') + ' ' + this.tab.slice(0, 6),
      reason, ack: !reason && (view.state.phase === 'preparing' || view.state.phase === 'compacting' && d?.ack === view.state.epoch) ? view.state.epoch : '', retired };
    if (d && JSON.stringify({ ...d, row: undefined }) === JSON.stringify(value)) return false;
    if (d) {
      await this.api(token, '/values/' + encodeURIComponent(quote(CONTROL_SHEET) + '!A' + d.row + ':B' + d.row) + '?valueInputOption=RAW', { values: [[this.tab, JSON.stringify(value)]] }, 'PUT');
    } else {
      await this.api(token, '/values/' + encodeURIComponent(quote(CONTROL_SHEET) + '!A3:B') + ':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS', { values: [[this.tab, JSON.stringify(value)]] });
    }
    return true;
  }
  async heartbeat(token: string) {
    return this.exclusive(async () => {
      const view = await this.read(token); if (!view) return null;
      if (this.retired) return view;
      const changed = await this.reportInner(token, view, await this.reason());
      return changed ? await this.read(token) : view;
    });
  }
  async initialize(token: string) { return this.adminCommand(() => this.initializeCore(token)); }
  private async initializeCore(token: string) {
    if (await this.reason()) throw new Error('同期・未保存の編集・確認事項を解消してから管理端末を設定してください。');
    if (await this.read(token)) throw new Error('管理端末は既に設定されています。');
    const sheetId = 1900091800;
    const state: MaintenanceState = { version: 1, owner: this.device, phase: 'running', epoch: '', revision: crypto.randomUUID() };
    await this.api(token, ':batchUpdate', { requests: [
      { addSheet: { properties: { sheetId, title: CONTROL_SHEET, gridProperties: { rowCount: 1000, columnCount: 2 } } } },
      { updateCells: { start: { sheetId, rowIndex: 0, columnIndex: 0 }, rows: rows([[JSON.stringify(state)], ['端末ID', '停止確認']]), fields: 'userEnteredValue' } },
    ] });
    await this.read(token); await this.acceptRevision(state.revision); await this.heartbeat(token);
  }
  private async validateLedger(token: string, view: View | null) {
    if (!view?.state.ledgerFingerprint) return;
    const ledger = await this.history(token, PURGE_LEDGER);
    readPurgeLedger(ledger);
    if (await ledgerDigest(ledger) !== view.state.ledgerFingerprint) throw new Error('使用済みIDの管理情報が変更されています。連携を停止しました。');
  }
  async beginRead(token: string) {
    const view = await this.read(token);
    if (this.retired || view && !this.canOperate(view)) throw pausedError();
    await this.validateLedger(token, view);
    return view?.state.revision;
  }
  async finishRead(token: string, revision?: string) {
    const current = await this.beginRead(token);
    if (current !== revision) throw new Error('読込中に履歴の整理状態が変わりました。もう一度データ連携してください。');
    if (revision) await this.acceptRevision(revision);
  }
  private async acceptRevision(revision: string) {
    await idbSet('history-seen-revision:' + this.id + ':' + this.tab, revision); this.seenRevision = revision;
  }
  async enterWrite(token: string): Promise<() => void> {
    this.writers++;
    try {
      await this.exclusive(async () => {
        const view = await this.read(token); if (!view) return;
        if (this.retired || !this.canOperate(view)) throw pausedError();
        await this.validateLedger(token, view);
        this.seenRevision ||= await idbGet<string>('history-seen-revision:' + this.id + ':' + this.tab);
        if (this.seenRevision !== view.state.revision) throw new Error('履歴が整理されました。データ連携で最新の情報を読み込んでから保存してください。');
        await this.reportInner(token, view, '書き込み処理中');
        const fresh = await this.read(token);
        if (!fresh || !this.canOperate(fresh)) throw pausedError();
      });
      return () => { this.writers--; };
    } catch (error) { this.writers--; throw error; }
  }
  private async changeState(token: string, view: View, state: MaintenanceState) {
    const acquiringMerge = view.state.phase === 'running' && state.purpose === 'merge' && state.mergeDevice === this.device && state.initiatorTab === this.tab;
    if (view.state.owner !== this.device && !this.ownsMerge && !acquiringMerge) throw new Error('この端末は管理端末ではありません。');
    await this.api(token, '/values/' + encodeURIComponent(quote(CONTROL_SHEET) + '!A1') + '?valueInputOption=RAW', { values: [[JSON.stringify(state)]] }, 'PUT');
    const actual = await this.read(token);
    if (JSON.stringify(actual?.state) !== JSON.stringify(state)) throw new Error('整理状態が変わりました。実行を停止しました。');
    // Wake sibling tabs immediately; their acknowledgement still comes from Sheets.
    if (typeof window !== 'undefined') safeStorage.setItem('jbtd-maintenance-wake', crypto.randomUUID());
  }
  async purgeSubsidiary(token: string, templeId: string) {
    const view=await this.read(token);
    if(!view || !this.ownsMerge || !view.state.mergeReady) throw pausedError();
    await this.validateLedger(token,view);
    const properties=await this.metadata(token), before=await this.cleanupSnapshot(token,properties);
    const plan=planSubsidiaryPurge(before,templeId,view.state.epoch);
    const digest=await ledgerDigest(plan.expected[PURGE_LEDGER]);
    const requests:any[]=[];
    let ledger=properties.find((s:any)=>s.title===PURGE_LEDGER);
    if(!ledger){let sheetId=Math.max(0,...properties.map((s:any)=>s.sheetId))+1;ledger={sheetId,title:PURGE_LEDGER};requests.push({addSheet:{properties:{...ledger,gridProperties:{rowCount:Math.max(1000,plan.expected[PURGE_LEDGER].length+100),columnCount:5}}}});}
    else if(ledger.gridProperties.rowCount<plan.expected[PURGE_LEDGER].length) requests.push({updateSheetProperties:{properties:{sheetId:ledger.sheetId,gridProperties:{rowCount:plan.expected[PURGE_LEDGER].length+100}},fields:'gridProperties.rowCount'}});
    const start=before[PURGE_LEDGER]?.length||0;
    requests.push({updateCells:{start:{sheetId:ledger.sheetId,rowIndex:start,columnIndex:0},rows:rows(plan.expected[PURGE_LEDGER].slice(start)),fields:'userEnteredValue'}});
    for(const title of plan.deletedSheets) requests.push({deleteSheet:{sheetId:properties.find((s:any)=>s.title===title).sheetId}});
    for(const [title,ranges]of Object.entries(plan.ranges))for(const range of ranges)requests.push({deleteDimension:{range:{sheetId:properties.find((s:any)=>s.title===title).sheetId,dimension:'ROWS',...range}}});
    const history=properties.find((s:any)=>s.title===plan.historyTitle);
    const removed=(plan.ranges[plan.historyTitle]||[]).reduce((n,r)=>n+r.endIndex-r.startIndex,0);
    if(plan.auditIndex>=history.gridProperties.rowCount-removed) requests.push({appendDimension:{sheetId:history.sheetId,dimension:'ROWS',length:1}});
    requests.push({updateCells:{start:{sheetId:history.sheetId,rowIndex:plan.auditIndex,columnIndex:0},rows:rows([plan.audit]),fields:'userEnteredValue'}});
    requests.push({updateCells:{start:{sheetId:view.sheetId,rowIndex:0,columnIndex:0},rows:rows([[JSON.stringify({...view.state,mergeSubmitted:true,ledgerFingerprint:digest})]]),fields:'userEnteredValue'}});
    if(new TextEncoder().encode(JSON.stringify(requests)).length>1800000) throw new Error('削除対象が多すぎるため、一括削除を開始できません。');
    const key='subsidiary-purge-pending:'+this.id;
    if(await idbGet(key)) throw new Error('前回の完全削除の確認が必要です。再実行を停止しました。');
    const fresh=await this.cleanupSnapshot(token,await this.metadata(token));
    if(!this.sameSnapshot(before,fresh))throw new Error('確認中にデータが変更されました。完全削除は行っていません。');
    await this.markMergeSubmitted(token);
    await idbSet(key,{templeId,expected:plan.expected});
    await this.api(token,':batchUpdate',{requests});
    const actual=await this.cleanupSnapshot(token,await this.metadata(token));
    if(!this.sameSnapshot(plan.expected,actual))throw new Error('完全削除の結果を確認できません。操作停止を維持しています。');
    await idbSet(key,null);
    return plan;
  }
  async prepareMerge(token: string) {
    return this.adminCommand(async () => {
      const view = await this.heartbeat(token);
      if (!view) throw new Error('統合前に管理端末を設定してください。');
      if (this.ownsMerge) return;
      if (view.state.phase !== 'running') throw pausedError();
      await this.changeState(token, view, {...view.state, phase:'preparing', purpose:'merge', mergeDevice:this.device, initiatorTab:this.tab, epoch:crypto.randomUUID(), mergeReady:false, mergeSubmitted:false});
      await this.heartbeat(token);
    });
  }
  async confirmMergeStopped(token: string) {
    const view = await this.heartbeat(token);
    if (!view || !this.ownsMerge) throw pausedError();
    if (waitingDevices(view.devices, view.state.epoch).some(d => d.id !== this.tab)) return false;
    if (!view.state.mergeReady) await this.changeState(token, view, {...view.state, mergeReady:true});
    return true;
  }
  async markMergeSubmitted(token: string) {
    const view = await this.read(token);
    if (!view || !this.ownsMerge || !view.state.mergeReady || waitingDevices(view.devices, view.state.epoch).some(d => d.id !== this.tab)) throw pausedError();
    await this.changeState(token, view, {...view.state, mergeSubmitted:true});
  }
  async finishMerge(token: string, verified: boolean) {
    const view = await this.read(token);
    if (!view || !this.ownsMerge) throw pausedError();
    if (!verified && view.state.mergeSubmitted) throw new Error('統合結果の確認が必要です。');
    if (verified) {
      const pending=await idbGet<any>('subsidiary-purge-pending:'+this.id);
      if(pending){
        const actual=await this.cleanupSnapshot(token,await this.metadata(token));
        if(!this.sameSnapshot(pending.expected,actual)) throw new Error('兼務寺院の完全削除の結果を確認できません。操作停止を維持しています。');
        await idbSet('subsidiary-purge-pending:'+this.id,null);
      }
    }
    if (verified && (await idbGet('row-sync-pending-v1:' + this.id) || await idbGet('subsidiary-purge-pending:' + this.id))) throw new Error('統合の保存結果を確認できません。');
    const {purpose, mergeDevice, mergeReady, mergeSubmitted, ...rest} = view.state;
    await this.changeState(token, view, {...rest, phase:'running', epoch:'', revision:verified ? crypto.randomUUID() : rest.revision});
    if (this.view) await this.acceptRevision(this.view.state.revision);
  }
  async prepare(token: string) { return this.adminCommand(() => this.prepareCore(token)); }
  private async prepareCore(token: string) {
    const reason = await this.reason();
    if (reason) throw new Error('整理を開始できません：' + reason + '。未確認の操作内容を確認してください。');
    const view = await this.heartbeat(token);
    if (!view || view.state.phase !== 'running') throw new Error('整理を開始できる状態ではありません。');
    const busy = view.devices.filter(d => !d.retired && d.reason);
    if (busy.length) throw new Error('まだ保存・確認が必要なタブがあります：' + busy.map(d => d.name + '（' + d.reason + '）').join('、') + '。各タブの同期を完了してから再度整理してください。連携は停止していません。');
    await this.changeState(token, view, { ...view.state, phase: 'preparing', initiatorTab: this.tab, epoch: crypto.randomUUID() });
    await this.heartbeat(token);
  }
  async resume(token: string) { return this.adminCommand(() => this.resumeCore(token)); }
  private async resumeCore(token: string) {
    const view = await this.read(token); if (!view) return;
    if (view.state.purpose === 'merge') throw new Error('統合画面から結果を確認してください。');
    if (view.state.phase === 'compacting' || view.state.submitted || await idbGet('history-cleanup-pending:' + this.id)) throw new Error('整理結果の確認が必要です。「整理結果を確認」を実行してください。');
    await this.changeState(token, view, { ...view.state, phase: 'running', epoch: '' });
  }
  async leave(token: string) {
    if (await this.reason()) throw new Error('未保存の編集・未送信履歴・確認事項を解消してから連携を停止してください。');
    await this.exclusive(async () => {
      const view = await this.read(token); if (!view || view.state.phase !== 'running') throw new Error('整理中は端末登録を解除できません。');
      this.retired = true;
      await this.reportInner(token, view, '', true);
    });
  }
  async rejoin(token: string) { this.retired = false; await this.heartbeat(token); }
  async retireClosedTabs(token: string) {
    if (await this.reason()) throw new Error('このブラウザーの未保存の編集・保存結果不明を先に解消してください。');
    if (typeof navigator === 'undefined' || !navigator.locks) throw new Error('閉じたタブを確認できません。');
    await this.exclusive(async () => {
      const view = await this.read(token);
      if (!view || view.state.phase !== 'running') throw new Error('整理を取り消してから実行してください。');
      for (const d of view.devices.filter(d => d.device === this.device && d.id !== this.tab && !d.retired)) {
        // A missing heartbeat is never proof of closure. Only the browser's lock
        // service can prove that this same-browser tab no longer holds its lock.
        await navigator.locks.request('jbtd-history-tab-' + d.id, { ifAvailable: true }, async lock => {
          if (!lock) return;
          if (await this.reason()) throw new Error('端末の保存状態が変わりました。');
          const fresh = await this.read(token);
          if (!fresh || fresh.state.phase !== 'running') throw pausedError();
          await this.api(token, '/values/' + encodeURIComponent(quote(CONTROL_SHEET) + '!A' + d.row + ':B' + d.row) + '?valueInputOption=RAW',
            { values: [[d.id, JSON.stringify({ ...d, row: undefined, retired: true, reason: '', ack: '' })]] }, 'PUT');
        });
      }
    });
  }
  private async history(token: string, title: string) {
    const data = await this.api(token, '/values/' + encodeURIComponent(quote(title) + '!A1:ZZ') + '?valueRenderOption=FORMATTED_VALUE');
    if (data.values !== undefined && !Array.isArray(data.values)) throw new Error('データを完全に読み込めません。');
    return (data.values || []) as unknown[][];
  }
  async count(token: string) { return (await this.history(token, '操作・削除履歴')).slice(1).filter(r => r.some(v => v !== '' && v != null)).length; }
  async cleanup(token: string) { return this.adminCommand(() => this.cleanupCore(token)); }
  private async cleanupCore(token: string) {
    const view = await this.heartbeat(token);
    if (!view || view.state.purpose === 'merge' || view.state.owner !== this.device || view.state.phase !== 'preparing') throw new Error('管理端末で停止準備を行ってください。');
    if (waitingDevices(view.devices, view.state.epoch).length) throw new Error('停止を確認できない端末があります。整理は実行しません。');
    if (await this.reason()) throw new Error('この端末に未解決の処理があります。');
    if (await idbGet('history-cleanup-pending:' + this.id)) throw new Error('前回の整理結果を先に確認してください。');
    const properties = await this.metadata(token);
    const before = await this.cleanupSnapshot(token, properties);
    await this.validateLedger(token, view);
    const plan = planPermanentCleanup(before, view.state.epoch, Date.now());
    const ledgerFingerprint = await ledgerDigest(plan.expected[PURGE_LEDGER]);
    const journal = { version: 2, epoch: view.state.epoch, before, expected: plan.expected, counts: plan.counts, removed: plan.removedHistory, revision: crypto.randomUUID(), ledgerFingerprint, outcome: 'prepared' };
    await this.changeState(token, view, { ...view.state, phase: 'compacting' });
    const frozen = await this.read(token);
    if (!frozen || frozen.state.epoch !== view.state.epoch || waitingDevices(frozen.devices, view.state.epoch).length || await this.reason()) throw new Error('停止確認が変わりました。整理を実行せず停止しました。');
    const fresh = await this.cleanupSnapshot(token, await this.metadata(token));
    if (!this.sameSnapshot(before, fresh)) throw new Error('停止確認後にデータが変わりました。整理を中止しました。');
    const requests: any[] = [];
    let ledger = properties.find((s: any) => s.title === PURGE_LEDGER);
    if (!ledger) {
      let sheetId = Math.floor(Math.random() * 1000000000); while (properties.some((s: any) => s.sheetId === sheetId)) sheetId++;
      ledger = { sheetId, title: PURGE_LEDGER };
      requests.push({ addSheet: { properties: { ...ledger, gridProperties: { rowCount: Math.max(1000, plan.expected[PURGE_LEDGER].length), columnCount: 5 } } } });
    } else if (ledger.gridProperties.rowCount < plan.expected[PURGE_LEDGER].length) {
      requests.push({ updateSheetProperties: { properties: { sheetId: ledger.sheetId, gridProperties: { rowCount: plan.expected[PURGE_LEDGER].length + 100 } }, fields: 'gridProperties.rowCount' } });
    }
    // Append only new reservations, never resend or erase the existing ledger.
    const ledgerStart = before[PURGE_LEDGER]?.length || 0;
    const newReservations = plan.expected[PURGE_LEDGER].slice(ledgerStart);
    if (newReservations.length) requests.push({ updateCells: { start: { sheetId: ledger.sheetId, rowIndex: ledgerStart, columnIndex: 0 }, rows: rows(newReservations), fields: 'userEnteredValue' } });
    for (const [title, ranges] of Object.entries(plan.ranges)) {
      const sheetId = properties.find((s: any) => s.title === title).sheetId;
      requests.push(...ranges.map(range => ({ deleteDimension: { range: { sheetId, dimension: 'ROWS', ...range } } })));
    }
    const history = properties.find((s: any) => s.title === plan.historyTitle);
    for (const [title, order] of Object.entries(plan.sorts)) {
      const sheet = properties.find((s: any) => s.title === title);
      requests.push(...tableSortRequests(sheet.sheetId, sheet.gridProperties.columnCount, order));
    }
    const deletedHistory = (plan.ranges[plan.historyTitle] || []).reduce((n, r) => n + r.endIndex - r.startIndex, 0);
    if (plan.auditIndex >= history.gridProperties.rowCount - deletedHistory) requests.push({ appendDimension: { sheetId: history.sheetId, dimension: 'ROWS', length: 1 } });
    requests.push({ updateCells: { start: { sheetId: history.sheetId, rowIndex: plan.auditIndex, columnIndex: 0 }, rows: rows([plan.audit]), fields: 'userEnteredValue' } });
    requests.push({ updateCells: { start: { sheetId: view.sheetId, rowIndex: 0, columnIndex: 0 }, rows: rows([[JSON.stringify({ ...frozen.state, submitted: true, ledgerFingerprint })]]), fields: 'userEnteredValue' } });
    if (new TextEncoder().encode(JSON.stringify(requests)).length > 1800000) throw new Error('整理対象が多すぎるため安全に一括整理できません。データを変更せず停止しました。');
    await idbSet('history-cleanup-pending:' + this.id, journal);
    await this.changeState(token, frozen, { ...frozen.state, submitted: true });
    journal.outcome = 'sending';
    await idbSet('history-cleanup-pending:' + this.id, journal);
    // One atomic request: ID reservations, physical deletion and audit succeed together. Never auto-retry.
    try { await this.api(token, ':batchUpdate', { requests }); }
    catch (error: any) {
      if (error.status >= 400 && error.status < 500 && error.status !== 408) {
        await idbSet('history-cleanup-pending:' + this.id, { ...journal, outcome: 'rejected' });
      }
      throw error;
    }
    await this.verifyCleanupCore(token);
  }
  private async cleanupSnapshot(token: string, properties: any[]): Promise<Snapshot> {
    const sheets = properties.map(s => ({ sheetId: s.sheetId, title: s.title, rowCount: s.gridProperties?.rowCount, columnCount: s.gridProperties?.columnCount }));
    if (sheets.some(s => !Number.isInteger(s.rowCount) || s.rowCount < 1)) throw new Error('シートの行数を確認できません。');
    const prefix = 'https://sheets.googleapis.com/v4/spreadsheets/' + this.id;
    return readPhysicalTables(token, this.id, sheets, async url => {
      if (!url.startsWith(prefix + '/values:batchGet?')) throw new Error('整理の読込範囲が不正です。');
      return new Response(JSON.stringify(await this.api(token, url.slice(prefix.length))), { status: 200 });
    });
  }
  private sameSnapshot(a: Snapshot, b: Snapshot) {
    return Object.keys(a).length === Object.keys(b).length && Object.keys(a).every(k => b[k] && fingerprint(a[k]) === fingerprint(b[k]));
  }
  async verifyCleanup(token: string) { return this.adminCommand(() => this.verifyCleanupCore(token)); }
  private async verifyCleanupCore(token: string) {
    const view = await this.read(token);
    if (!view || view.state.owner !== this.device || view.state.phase === 'running') throw new Error('整理結果の確認状態ではありません。');
    const journal = await idbGet<any>('history-cleanup-pending:' + this.id);
    if (!journal) { // Shared marker also protects against loss of browser storage.
      if (view.state.submitted) throw new Error('整理の確認記録が端末にありません。保存結果を確定できないため停止状態を維持します。');
      await this.changeState(token, view, { ...view.state, phase: 'preparing' }); return;
    }
    if (journal.epoch !== view.state.epoch) throw new Error('整理の確認記録が一致しません。停止状態を維持します。');
    if (journal.version === 2) {
      const actual = await this.cleanupSnapshot(token, await this.metadata(token));
      if (this.sameSnapshot(actual, journal.before)) {
        if (journal.outcome === 'sending') throw new Error('送信した整理処理の結果がまだ確定していません。停止状態を維持します。');
        await this.changeState(token, view, { ...view.state, phase: 'preparing', submitted: false });
        await idbSet('history-cleanup-pending:' + this.id, null); return;
      }
      if (!this.sameSnapshot(actual, journal.expected) || view.state.ledgerFingerprint !== journal.ledgerFingerprint) throw new Error('整理結果が一致しません。自動再送・連携再開はせず停止しています。');
      await idbSet('history-cleanup-last:' + this.id, { removed: journal.removed, counts: journal.counts, permanent: true });
      await this.changeState(token, view, { ...view.state, phase: 'preparing', revision: journal.revision, submitted: false });
      await idbSet('history-cleanup-pending:' + this.id, null); return;
    }
    // Complete uncertain legacy archive operations without changing their meaning.
    const properties = await this.metadata(token), archived = properties.some((s: any) => s.title === journal.archiveTitle);
    const actual = await this.history(token, '操作・削除履歴');
    if (!archived && sameHistory(actual, journal.before)) {
      if (journal.outcome === 'sending') throw new Error('送信した整理処理の結果がまだ確定していません。遅れて実行される可能性があるため停止状態を維持します。');
      await this.changeState(token, view, { ...view.state, phase: 'preparing', submitted: false });
      await idbSet('history-cleanup-pending:' + this.id, null); return;
    }
    if (!archived || !sameHistory(actual, journal.kept) || !sameHistory(await this.history(token, journal.archiveTitle), journal.archive)) throw new Error('整理結果が一致しません。自動再送・連携再開はせず停止しています。');
    await idbSet('history-cleanup-last:' + this.id, { archiveTitle: journal.archiveTitle, removed: journal.archive.length - 1, retained: journal.kept.length - 1 });
    await this.changeState(token, view, { ...view.state, phase: 'preparing', revision: journal.revision, submitted: false });
    await idbSet('history-cleanup-pending:' + this.id, null);
  }
}

const clients = new Map<string, HistoryMaintenanceClient>();
export async function maintenanceClient(id: string) {
  if (!clients.has(id)) { const who = await browserIdentity(); if (!clients.has(id)) clients.set(id, new HistoryMaintenanceClient(id, who.device, who.tab)); }
  return clients.get(id)!;
}
export const maintenanceStopped = () => [...clients.values()].some(c => c.stopped);
export async function guardSheetsMutation(url: string, options?: RequestInit): Promise<() => void> {
  if (typeof window === 'undefined' || !options?.method || options.method === 'GET') return () => {};
  const match = url.match(/^https:\/\/sheets\.googleapis\.com\/v4\/spreadsheets\/([^/:?]+)/);
  if (!match) return () => {};
  const token = new Headers(options.headers).get('Authorization')?.replace(/^Bearer /, '');
  if (!token) throw new Error('Googleとの認証を確認できません。');
  return (await maintenanceClient(match[1])).enterWrite(token);
}
