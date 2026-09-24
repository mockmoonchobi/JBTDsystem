import { pendingAudit } from '../utils/pendingAudit';
import type { DeletedRecordEntry } from '../types';
import React, { useEffect, useRef, useState } from 'react';
import { getAccessToken } from '../lib/googleAuth';
import { idbGet, safeStorage } from '../utils/storageUtils';
import { HistoryMaintenanceClient, maintenanceClient } from '../utils/historyMaintenance';
import { waitingDevices } from '../utils/historyMaintenancePlan';
import { ROW_META, type Snapshot } from '../utils/rowSyncPlan';
import { RECORD_KINDS } from '../utils/purgeLedger';
import { resolveExportSheetName } from '../utils/sheetsExportUtils';
import { extractTempleFiscalConfigs, getFiscalYearOfDate, getJapanDateString } from '../utils/fiscalYearUtils';

export function HistoryMaintenancePanel({ enabled, onResume, open, onClose, onCountChange, mergeActive = false }: { mergeActive?: boolean; enabled: boolean; onResume: () => Promise<void>; open: boolean; onClose: () => void; onCountChange: (count: number | null) => void }) {
  const [client, setClient] = useState<HistoryMaintenanceClient>();
  const [view, setView] = useState<HistoryMaintenanceClient['view']>(null);
  const [count, setCount] = useState<number | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [deletedCounts, setDeletedCounts] = useState<Record<string, number>>({});
  const [archiveCount, setArchiveCount] = useState<number>(0);
  const [unconfirmed, setUnconfirmed] = useState<DeletedRecordEntry[]>([]);
  const lastPurpose = useRef<string | undefined>(undefined);
  const [automatic, setAutomatic] = useState(false);
  const [left, setLeft] = useState(false), [confirmed, setConfirmed] = useState(false);
  const action = useRef(false), resume = useRef(onResume), previous = useRef(''); resume.current = onResume;
  useEffect(() => { onCountChange(enabled ? count : null); }, [count, enabled, onCountChange]);
  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    let disposed = false, checking = false, wakeRequested = false, timer: ReturnType<typeof setTimeout>;
    const check = async () => {
      if (checking || disposed) return;
      checking = true;
      try {
        if (action.current) return;
        const id = JSON.parse(safeStorage.getItem('temple_google_sheet_info') || '{}').id;
        const token = await getAccessToken(); if (!id || !token || disposed) return;
        const c = await maintenanceClient(id), state = await c.heartbeat(token);
        if (disposed) return;
        stopped = c.stopped;
        setClient(c); setView(state ? { ...state } : null);
        if (state?.state.phase !== 'running') lastPurpose.current = state?.state.purpose;
        setUnconfirmed(await pendingAudit());
        const snapshot = await idbGet<Snapshot>('row-sync-baseline-v1:' + id);
        setCount(snapshot?.['操作・削除履歴'] ? snapshot['操作・削除履歴'].slice(1).filter(r => r.some(v => v !== '' && v != null)).length : null);
        const eligible = new Set(Object.keys(RECORD_KINDS).map(n => resolveExportSheetName(n, Object.keys(snapshot || {}))));
        setDeletedCounts(Object.fromEntries(Object.entries(snapshot || {}).filter(([n]) => eligible.has(n)).map(([n, grid]) => [n, grid.slice(1).filter(r => String(r[grid[0]?.indexOf(ROW_META[0]) ?? -1]) === '1').length]).filter(([, count]) => Number(count) > 0)));

        const txTitle = resolveExportSheetName('出納・会計', Object.keys(snapshot || {}));
        const txGrid = snapshot?.[txTitle];
        if (txGrid && txGrid.length > 1) {
          const { configs, fallback } = extractTempleFiscalConfigs(snapshot!);
          const txHeader = txGrid[0].map(String);
          const flagIdx = txHeader.indexOf(ROW_META[0]);
          const dateIdx = txHeader.findIndex(h => /^(日付|取引日|年月日)$/i.test(h));
          const templeIdIdx = txHeader.findIndex(h => /^(所属寺院ID|寺院ID)$/i.test(h));
          const todayStr = getJapanDateString();
          let arch = 0;
          if (dateIdx >= 0) {
            txGrid.slice(1).forEach(row => {
              if (!row.some(v => v !== '' && v != null)) return;
              if (flagIdx >= 0 && String(row[flagIdx]) === '1') return;
              const d = String(row[dateIdx] || '').trim();
              if (!d) return;
              const tId = templeIdIdx >= 0 ? String(row[templeIdIdx] || '').trim() : '';
              const cfg = configs.get(tId) || fallback;
              const curFY = getFiscalYearOfDate(todayStr, cfg as any);
              if (getFiscalYearOfDate(d, cfg as any) < curFY - 1) arch++;
            });
          }
          setArchiveCount(arch);
        } else {
          setArchiveCount(0);
        }
        const signature = state ? state.state.phase + ':' + state.state.revision : '';
        if (state?.state.phase === 'running' && previous.current && previous.current !== signature && !left) {
          previous.current = signature;
          setBusy(true);
          try { await resume.current(); } finally { setBusy(false); }
        } else if (state?.state.phase === 'running') previous.current = signature;
      } catch (e: any) { if (!disposed) setError(e.message || '整理状態を確認できません。'); }
      finally { checking = false; if (!disposed) timer = setTimeout(check, wakeRequested ? 0 : stopped ? 10000 : 30000); wakeRequested = false; }
    };
    void check();
    const wake = () => { clearTimeout(timer); if (checking) { wakeRequested = true; return; } void check(); };
    const storageWake = (event: StorageEvent) => { if (event.key === 'jbtd-maintenance-wake') wake(); };
    // Single scheduled poll; visibility wakes are handled on the next tick to avoid overlapping writes.
    window.addEventListener('online', wake);
    window.addEventListener('storage', storageWake);
    window.addEventListener('jbtd-maintenance-wake', wake);
    return () => { disposed = true; clearTimeout(timer); window.removeEventListener('online', wake); window.removeEventListener('storage', storageWake); window.removeEventListener('jbtd-maintenance-wake', wake); };
  }, [enabled, left]);
  const run = async (work: (c: HistoryMaintenanceClient, token: string) => Promise<void>) => {
    if (!client || action.current) return;
    lastPurpose.current = client.view?.state.purpose;
    action.current = true; setBusy(true); setError('');
    try {
      const token = await getAccessToken(); if (!token) throw new Error('データ連携から再ログインしてください。');
      await work(client, token);
      const state = await client.heartbeat(token); setView(state ? { ...state } : null);
    } catch (e: any) { setAutomatic(false); setError(e.message || '履歴整理を完了できませんでした。'); }
    finally {
      if (client.view) setView({ ...client.view });
      action.current = false; setBusy(false);
    }
  };
  const finish = async (c: HistoryMaintenanceClient, t: string, reload = true) => {
    await c.resume(t);
    setView(c.view ? { ...c.view } : null);
    previous.current = 'running:' + c.view?.state.revision;
    setAutomatic(false);
    onClose();
    if (reload) await resume.current();
  };
  const paused = !!view && view.state.phase !== 'running';
  const waiting = view ? waitingDevices(view.devices, view.state.epoch) : [];
  useEffect(() => {
    if (view?.state.purpose === 'merge' || !automatic || busy || action.current || !client?.isOwner || view?.state.phase !== 'preparing' || waiting.length) return;
    void run(async (c, t) => {
      await c.cleanup(t);
      setCount(await c.count(t));
      await finish(c, t);
    });
  }, [automatic, busy, view]);
  useEffect(() => {
    client?.setMergeUiLocked(paused && view?.state.purpose === 'merge' && !client.ownsMerge);
    if (paused && view?.state.purpose === 'merge' && !client?.ownsMerge) window.dispatchEvent(new Event('jbtd-maintenance-wake'));
    return () => client?.setMergeUiLocked(false);
  }, [client, paused, view?.state.purpose]);
  if (!enabled || (mergeActive && client?.ownsMerge)) return null;
  const primary = 'rounded-lg bg-blue-700 px-5 py-3 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed';
  const secondary = 'rounded-lg border border-slate-300 px-4 py-3 text-sm font-bold hover:bg-slate-50 disabled:opacity-50';
  const recovering = paused && !automatic;
  const controls = view?.state.purpose !== 'merge' && !!client?.isOwner && (!view?.state.initiatorTab || view.state.initiatorTab === client.tab);
  const canCancel = view?.state.phase === 'preparing' && !view.state.submitted;
  // Merge progress never exposes history cleanup controls or completion content.
  if (view?.state.purpose === 'merge' || (busy && lastPurpose.current === 'merge')) return <div className="fixed inset-0 z-[100030] flex items-center justify-center bg-black/60 p-4 font-sans">
    <section role="dialog" aria-modal="true" aria-label="データの統合" tabIndex={-1} ref={el => el?.focus()} onKeyDown={e => { if (e.key === 'Tab' && (busy || !client?.ownsMerge)) e.preventDefault(); }} className="w-full max-w-lg rounded-2xl border border-amber-700/30 bg-[#fffdf7] p-6 text-stone-800 shadow-xl">
      <h2 className="text-xl font-bold">{client?.ownsMerge ? (busy ? 'データの統合を確認しています' : '統合の完了を確認できていません') : 'ただいまデータ統合のためメンテナンス中です'}</h2>
      <div role="status" className="my-5 flex items-center gap-3"><span aria-hidden="true" className={`h-6 w-6 shrink-0 rounded-full border-4 border-stone-200 border-t-amber-700 ${busy || !client?.ownsMerge ? 'animate-spin' : ''}`}/><p>{busy ? '最新のデータを確認しています…' : client?.ownsMerge ? '下のボタンから確認を再開してください。' : '統合を開始したタブでの確認を待っています。'}</p></div>
      <p className="text-sm leading-6">{client?.ownsMerge ? '安全のため、各端末の操作を停止しています。確認を再開するとGoogleシートを読み直し、必要な場合は競合を再確認します。' : 'このタブでは操作を一時停止しています。統合を開始したタブで確認を完了すると、通常画面に戻ります。'}入力途中の内容は保持しています。</p>
      {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
      {client?.ownsMerge && !mergeActive && <button disabled={busy} className="mt-5 rounded-lg bg-stone-900 px-5 py-3 font-bold text-white disabled:opacity-50" onClick={() => run(async () => { await resume.current(); onClose(); })}>中断した統合の確認を再開する</button>}
    </section>
  </div>;
  return <>
    {(open || paused || busy) && <div className="fixed inset-0 z-[100030] flex items-center justify-center bg-slate-950/50 p-4 font-sans">
      <section tabIndex={-1} ref={element => { if (element && !element.contains(document.activeElement)) element.focus(); }} onKeyDown={event => {
        if (event.key !== 'Tab') return;
        const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), summary')).filter(element => element.getClientRects().length > 0);
        const first = items[0], last = items[items.length - 1];
        if (!first) { event.preventDefault(); return; }
        if (event.shiftKey && (document.activeElement === first || document.activeElement === event.currentTarget)) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }} role="dialog" aria-modal="true" aria-labelledby="history-maintenance-title" className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-2xl bg-white p-6 text-slate-900 shadow-xl">
        <p className="text-xs font-bold text-slate-500">操作履歴</p>
        <h2 id="history-maintenance-title" className="mt-1 text-xl font-bold">{paused && !controls ? 'ただいまメンテナンス中です' : busy ? '履歴を確認・整理しています' : automatic ? 'ほかの端末を確認しています' : recovering ? '整理を一時停止しています' : '履歴・削除済みデータを整理する'}</h2>
        {(busy || paused) && <div role="status" aria-live="polite" className="my-5 flex items-center gap-3 rounded-xl bg-blue-50 p-4 text-blue-900">
          <span aria-hidden="true" className="h-6 w-6 shrink-0 animate-spin rounded-full border-4 border-blue-200 border-t-blue-700" />
          <div><p className="font-bold">{busy ? '処理中…' : '整理の完了を待っています…'}</p><p className="mt-1 text-sm">{controls ? 'この画面を開いたままお待ちください。' : '操作を一時凍結しています。入力途中の内容は保持されます。メンテナンスが終了すると自動で戻ります。'}</p></div>
        </div>}
        {client && <p className="mt-2 text-xs text-slate-500">このタブ：{view?.devices.find(d => d.id === client.tab)?.name || client.tab.slice(0, 6)}</p>}
        {!paused && <>
          <div className="my-5 rounded-xl bg-slate-50 p-4">
            <span className="text-sm text-slate-600">シートに保存されている履歴</span>
            <p className="mt-1 text-2xl font-bold">{count === null ? '確認中…' : count.toLocaleString() + '件'}</p>
            <p className="mt-2 text-xs text-slate-500">最終同期時の件数です。端末の履歴表示件数とは異なります。</p>
          </div>
          <p className="text-sm leading-6">履歴が2,000件を超えている場合は最新1,000件（今回の整理記録を含む）を残します。削除済みのデータも完全に消去します。使用中の名簿・過去帳・会計は残ります。</p>
          {archiveCount > 0 && (
            <div className="mt-3 rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900">
              <p className="font-bold">過年度会計アーカイブ（自動移行）</p>
              <p className="mt-1">前々年度以前の出納データ <strong>{archiveCount.toLocaleString()}件</strong> を「出納アーカイブ」へ安全に移動します。</p>
            </div>
          )}
          {Object.keys(deletedCounts).length > 0 && <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm"><p className="font-bold">完全削除するデータ（最終同期時）</p><ul className="mt-2">{Object.entries(deletedCounts).map(([name, count]) => <li key={name}>{name}：{count.toLocaleString()}件</li>)}</ul></div>}
          <p className="mt-2 text-sm leading-6">開始後は、端末の確認から整理、連携の再開まで自動で進みます。</p>
        </>}
        {automatic && <>
          <ol className="my-5 flex gap-3 text-sm font-bold" aria-label="整理の進み具合">
            <li className="text-blue-700">1 端末確認</li><li className={busy ? 'text-blue-700' : 'text-slate-400'}>2 履歴整理</li><li className="text-slate-400">3 連携再開</li>
          </ol>
          <p className="text-sm leading-6">{busy ? 'この画面を開いたままお待ちください。' : '各端末の保存が終わるのを待っています。確認できると自動で進みます。'}</p>
        </>}
        {recovering && controls && <p className="mt-4 text-sm leading-6">{canCancel ? '端末の保存完了を確認するため、整理を待機しています。取消すると全タブの連携を再開できます。' : '整理結果を確認してから通常画面に戻ります。削除を重ねて実行することはありません。'}</p>}
        {paused && controls && waiting.length > 0 && <div className="mt-4 rounded-xl bg-amber-50 p-4 text-sm">
          <p className="font-bold">確認が必要な端末</p>
          <ul className="mt-2 space-y-2">{waiting.map(d => <li key={d.id}>{d.name}{d.id === client?.tab ? '（このタブ）' : ''}：{d.reason || '応答を待っています'}</li>)}</ul>
          <p className="mt-3 leading-6">整理中は保存できません。まず「整理を取り消して戻る」を押し、入力したタブの操作履歴から「今すぐ同期」を実行してください。全タブの同期が完了してから整理をやり直してください。同じブラウザの未送信履歴はタブ間で共有されます。</p>
        </div>}
        {unconfirmed.length > 0 && <details className="mt-4 border border-amber-300 bg-amber-50 p-4 text-sm">
          <summary className="cursor-pointer font-bold">保存を確認できない操作：{unconfirmed.length}件（内容を確認）</summary>
          <p className="mt-3 leading-6">再読込後も、シートに保存されたことを確認できない操作が残っています。この一覧の表示では、削除の再実行や履歴の消去は行いません。</p>
          <ul className="mt-3 max-h-60 overflow-y-auto space-y-3">{unconfirmed.map(entry => <li key={entry.logId} className="border-b border-amber-200 pb-2">
            <p className="font-bold">{entry.label || entry.id}</p>
            <p>ID：{entry.id} ／ {entry.actionType === 'delete' || entry.actionType === 'batch_delete' ? '削除' : entry.actionType === 'create' || entry.actionType === 'batch_create' ? '作成' : '更新・その他'}</p>
            <p>{entry.deletedAt ? new Date(entry.deletedAt).toLocaleString('ja-JP') : ''}</p>
          </li>)}</ul>
        </details>}
        {error && <div role="alert" className="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-800"><p className="font-bold">整理を完了できませんでした</p><p className="mt-2 leading-6">{error}</p></div>}
        {!view && <div className="mt-5 space-y-3 text-sm">
          <p>初回のみ、整理を行う端末を登録します。</p>
          <label className="flex items-start gap-2 leading-6"><input className="mt-1" type="checkbox" disabled={busy} checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />全端末の保存を終え、旧版アプリとシートの直接編集を終了しました</label>
          <button disabled={busy || !confirmed || !client} onClick={() => run((c, t) => c.initialize(t))} className={primary}>この端末を管理端末にする</button>
        </div>}
        {view && !paused && <div className="mt-5">
          {!client?.isOwner ? <p className="text-sm">履歴の整理は、管理端末から行ってください。</p> : <>
            <p className="mb-3 text-sm">整理中はほかの端末のデータ連携も一時停止します。</p>
            <button disabled={busy || left} onClick={() => run(async (c, t) => { await c.prepare(t); setAutomatic(true); })} className={primary}>履歴・削除済みデータを完全削除する</button>
          </>}
        </div>}
        {paused && !controls && <p className="mt-4 text-sm">履歴・削除済みデータを整理しています。この画面を開いたままお待ちください。</p>}
        <div className="mt-5 flex flex-wrap gap-2">
          {paused && client?.ownsMerge && <button disabled={busy} onClick={() => run(async () => { await resume.current(); })} className={primary}>中断した統合の確認を再開する</button>}
          {paused && controls && <button disabled={busy} onClick={() => run(async (c, t) => { setAutomatic(false); if (canCancel) { await finish(c, t, false); } else { await c.verifyCleanup(t); await finish(c, t); } })} className={recovering ? primary : secondary}>{canCancel ? '整理を取り消して戻る' : '整理結果を確認して戻る'}</button>}
          {paused && controls && canCancel && error && <button disabled={busy} onClick={() => run(async (c, t) => { await c.verifyCleanup(t); await finish(c, t); })} className={secondary}>整理結果を確認して戻る</button>}
          {!paused && <button disabled={busy} onClick={onClose} className={secondary}>閉じる</button>}
        </div>
        {!busy && view?.state.phase === 'running' && <details className="mt-5 border-t pt-3 text-sm text-slate-600">
          <summary className="cursor-pointer">端末の管理</summary>
          <ul className="my-3 space-y-1">{view.devices.map(d => <li key={d.id}>{d.name}：{d.retired ? '連携停止済み' : d.reason || '連携中'}</li>)}</ul>
          <div className="flex flex-wrap gap-2">
            <button disabled={busy} onClick={() => run(async (c, t) => { if (left) { await c.rejoin(t); setLeft(false); onClose(); await resume.current(); } else { await c.leave(t); setLeft(true); } })} className={secondary}>{left ? 'この端末の連携を再開' : 'この端末の連携を停止'}</button>
            {client?.isOwner && <button disabled={busy || left} onClick={() => run((c, t) => c.retireClosedTabs(t))} className={secondary}>閉じたタブの登録を整理</button>}
          </div>
        </details>}
      </section>
    </div>}
  </>;
}
