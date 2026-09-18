import React, { useMemo, useState } from 'react';
import { Dataset, MergeBaseline, MergeChoices, planSheetsMerge, mergeFieldLabels, stableMergeValue } from '../utils/threeWaySheetsMerge';

import { presentConflict, presentChanges } from '../utils/mergePresentation';

export interface SheetsMergeRequest {
  id: string; base: MergeBaseline | null; local: Dataset; remote: Dataset;
  choices: MergeChoices; message?: string;
}
interface Props {
  request: SheetsMergeRequest;
  onSaveChoices: (choices: MergeChoices) => Promise<void>;
  onConfirm: (data: Dataset) => void;
  onCancel: () => void;
}
const fieldLabels: Record<string, string> = {
  ...mergeFieldLabels,
  familyHead: '世帯主', phone: '電話番号', mobile: '携帯番号', address: '住所', id: 'ID',
  householdId: '檀家ID', templeId: '寺院ID', amount: '金額', type: '収支', category: '科目',
  date: '日付', description: '摘要', notes: '備考', paymentMethod: '支払方法', name: '氏名',
  secularName: '俗名', dharmaName: '戒名', deathDate: '命日', familyMembers: '家族',
};
function Value({ value }: { value: any }) {
  const [limit, setLimit] = useState(20);
  if (value === undefined) return <span className="font-bold text-red-700">レコード・項目なし（削除または未登録）</span>;
  if (value === null || value === '') return <span>空欄</span>;
  if (typeof value === 'boolean') return <span>{value ? 'あり' : 'なし'}</span>;
  if (Array.isArray(value)) return <div className="space-y-2">{value.length ? value.slice(0, limit).map((v, i) => <div key={i} className="border-b pb-2"><Value value={v} /></div>) : 'なし'}{value.length > limit && <button className="underline py-2" onClick={() => setLimit(n => n + 20)}>続きを表示（残り{value.length - limit}件）</button>}</div>;
  if (typeof value === 'object') return Object.keys(value).length ? <dl className="space-y-1">{Object.entries(value).map(([key, v]) => <div key={key}><dt className="font-bold">{fieldLabels[key] || key}</dt><dd className="pl-2"><Value value={v} /></dd></div>)}</dl> : <span>表示項目に違いはありません（管理情報のみ異なります）。</span>;
  return <span className="whitespace-pre-wrap break-all">{String(value)}</span>;
}
export function SheetsMergeWizard({ request, onSaveChoices, onConfirm, onCancel }: Props) {
  const [choices, setChoices] = useState<MergeChoices>(request.choices);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const initialResult = useMemo(() => {
    try { return { plan: planSheetsMerge(request.base, request.local, request.remote, request.choices), error: '' }; }
    catch (e: any) { return { plan: null, error: e.message }; }
  }, [request]);
  const [step, setStep] = useState<'prepare' | 'choose' | 'review'>(() => request.message && initialResult.plan ? (initialResult.plan.unresolved.length ? 'choose' : 'review') : 'prepare');
  const [index, setIndex] = useState(() => request.message && initialResult.plan ? Math.max(0, initialResult.plan.conflicts.findIndex(c => initialResult.plan!.unresolved.some(u => u.key === c.key))) : 0);
  const result = useMemo(() => {
    if (step !== 'review') return initialResult;
    try { return { plan: planSheetsMerge(request.base, request.local, request.remote, choices), error: '' }; }
    catch (e: any) { return { plan: null, error: e.message }; }
  }, [step, initialResult, request, choices]);
  const plan = result.plan;
  const changes = useMemo(() => plan && step === 'review' ? presentChanges(plan.changes) : {}, [plan, step]);
  const onlyRemote = useMemo(() => plan && step === 'review' && stableMergeValue(plan.merged) === stableMergeValue(request.remote), [plan, step, request.remote]);
  const unresolved = plan?.conflicts.filter(c => choices[c.key]?.fingerprint !== c.fingerprint) || [];
  const conflict = plan?.conflicts[index];
  const display = useMemo(() => conflict ? presentConflict(conflict, request.local, request.remote) : null, [conflict, request.local, request.remote]);
  const choose = async (side: 'local' | 'remote') => {
    if (!conflict) return;
    setSaving(true); setError('');
    const next = { ...choices, [conflict.key]: { side, fingerprint: conflict.fingerprint } };
    try { await onSaveChoices(next); setChoices(next); }
    catch { setError('選択内容を端末に保存できません。保存容量などを確認してください。'); }
    finally { setSaving(false); }
  };
  const chooseAllLocal = async () => {
    if (!plan || saving) return;
    setSaving(true); setError('');
    const next = Object.fromEntries(plan.conflicts.map(c => [c.key, { side: 'local' as const, fingerprint: c.fingerprint }]));
    try { await onSaveChoices(next); setChoices(next); setStep('review'); }
    catch { setError('選択内容を端末に保存できません。保存容量などを確認してください。'); }
    finally { setSaving(false); }
  };
  return <div className="fixed inset-0 z-[100000] bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 font-sans" role="dialog" aria-modal="true" aria-labelledby="merge-title">
    <div className="bg-white border border-[#D4AF37] shadow-2xl w-full max-w-4xl max-h-[92dvh] flex flex-col overflow-hidden text-[#1A1A1A]">
      <header className="bg-[#1A1A1A] text-[#F9F7F2] px-4 py-4 sm:px-6 border-b border-[#D4AF37] shrink-0">
        <h2 id="merge-title" className="text-base sm:text-lg font-bold font-serif tracking-wider">端末とGoogleシートの変更を統合</h2>
        <p className="mt-1 text-xs text-[#CCCCCC]">データ連携 ／ 変更内容の確認</p>
      </header>
      <ol aria-label="統合の手順" className="grid grid-cols-3 shrink-0 border-b border-[#D1CEC7] bg-[#F2EFE9] text-xs sm:text-sm font-bold">
        {(['prepare', 'choose', 'review'] as const).map((item, i) => <li key={item} aria-current={step === item ? 'step' : undefined} className={'px-2 py-3 text-center border-b-2 ' + (step === item ? 'border-[#D4AF37] bg-white text-[#1A1A1A]' : 'border-transparent text-[#777777]')}>{i + 1}　{['準備', '競合の確認', '最終確認'][i]}</li>)}
      </ol>
      <div className="overflow-y-auto flex-1 min-h-0 p-4 sm:p-6 space-y-4 text-sm leading-relaxed">
      {request.message && <p className="bg-amber-50 p-3">{request.message}</p>}
      {(error || result.error) && <p role="alert" className="text-red-700">{error || result.error}</p>}
      {step === 'prepare' && <>
        <p>端末の未送信の編集を残しながら、Googleシートの変更を取り込みます。競合しない変更は自動で統合案に含めます。</p>
        {!request.base && <p className="bg-amber-50 p-3">以前の同期基準がないため、異なる内容は削除と決めつけずに確認します。</p>}
        <p>まず変更内容を比較してください。この端末の変更を保存する場合は、他端末の操作を一時停止してから統合します。</p>
        <button className="px-5 py-3 bg-[#8C2D19] hover:bg-[#6F2314] font-bold text-white rounded-none disabled:opacity-40 disabled:cursor-not-allowed" disabled={!plan} onClick={() => setStep(plan!.conflicts.length ? 'choose' : 'review')}>比較結果を確認</button>

      </>}
      {step === 'choose' && conflict && <>
        <p className="text-sm text-[#666666]">未選択：{unresolved.length}件。選択せずに前後の内容を閲覧できます。</p>
        <p className="font-bold">競合 {index + 1} / {plan!.conflicts.length}：{display?.label}</p>
        <details className="p-3 bg-[#F9F7F2]"><summary>前回同期時点の内容</summary><Value value={display?.base} /></details>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{(['local', 'remote'] as const).map(side => <div key={side} className="border border-[#D1CEC7] rounded-none p-3 space-y-3 min-w-0">
          <h3 className="font-bold">{side === 'local' ? 'この端末' : 'Googleシート'}</h3>
          <div className="max-h-64 overflow-auto text-sm"><Value value={display?.[side]} /></div>
          <button type="button" aria-pressed={choices[conflict.key]?.fingerprint === conflict.fingerprint && choices[conflict.key]?.side === side} disabled={saving} onClick={() => choose(side)} className="w-full py-3 border rounded-none aria-pressed:bg-[#8C2D19] aria-pressed:text-white">この内容を採用</button>
        </div>)}</div>
        <div className="flex flex-wrap gap-3"><button className="border border-[#D1CEC7] rounded-none px-4 py-3" disabled={index === 0 || saving} onClick={() => setIndex(i => i - 1)}>前へ</button>
          <button className="border border-[#D1CEC7] rounded-none px-4 py-3" disabled={saving || (index + 1 === plan!.conflicts.length && unresolved.length > 0)} onClick={() => index + 1 < plan!.conflicts.length ? setIndex(i => i + 1) : setStep('review')}> {index + 1 < plan!.conflicts.length ? '次へ' : '最終確認へ'}</button>
          {unresolved.length > 0 && <button disabled={saving} className="border border-[#D1CEC7] px-4 py-3" onClick={() => setIndex(plan!.conflicts.findIndex(c => c.key === unresolved[0].key))}>未選択の項目へ</button>}</div>
      </>}
      {step === 'review' && plan && <>
        <h3 className="font-serif font-bold tracking-wider border-b border-[#D1CEC7] pb-2">Googleシートに反映する変更</h3>
        {plan.errors.length > 0 && <div role="alert" className="text-red-700">{plan.errors.slice(0, 10).map((message, i) => <p key={i}>{message}</p>)}</div>}
        <ul className="grid sm:grid-cols-2 gap-2 bg-[#F9F7F2] border border-[#D1CEC7] p-3">{plan.summary.map(s => <li key={s.table}>{s.label}：追加 {s.added}件・変更 {s.updated}件・削除 {s.deleted}件</li>)}</ul>
        <div className="border border-[#D1CEC7] rounded-none p-3"><h4 className="font-bold mb-3">Googleシートに反映する変更内容</h4><div className="text-sm">{Object.keys(plan.changes).length ? <Value value={changes} /> : <p>変更はありません。</p>}</div></div>

        <p>保存直前にシートを再確認します。別の変更が見つかった場合は再比較します。確認中の選択は、内容が変わっていないものだけ引き継ぎます。</p>
        <p className="text-sm text-[#666666]">Googleシートへの保存が必要な場合は、他端末の停止と最新データを確認してから実行します。</p>

      </>}
      </div>
      <footer className="shrink-0 bg-[#F9F7F2] border-t border-[#D1CEC7] px-4 py-3 sm:px-6 space-y-2">
        {step === 'review' && plan && <>
        <div className="flex flex-wrap gap-3"><button className="border border-[#D1CEC7] rounded-none px-4 py-3" onClick={() => { setIndex(0); setStep(plan.conflicts.length ? 'choose' : 'prepare'); }}>戻る</button>
          <button className="bg-[#8C2D19] hover:bg-[#6F2314] font-bold text-white rounded-none px-4 py-3 disabled:opacity-40 disabled:cursor-not-allowed" disabled={saving || !!plan.unresolved.length || !!plan.errors.length} onClick={() => onConfirm(plan.merged)}>{onlyRemote ? 'Googleシートの内容を読み込む' : '他端末を停止して統合・保存'}</button></div>
        </>}
        {saving && <p role="status" className="text-sm font-bold animate-pulse">選択を保存中…</p>}
        <p className="text-xs text-[#666666]">端末の未送信変更を破棄して、Googleシートの内容に戻すこともできます。</p>
        <p className="text-xs text-[#666666]">「この端末」を一括採用すると、競合する項目をすべて端末側にして最終確認へ進みます。他端末だけの追加・変更は統合案に残ります。</p>
        <button disabled={saving || !plan} className="border border-[#D1CEC7] bg-white px-4 py-2.5 text-sm font-bold mr-2 disabled:opacity-40" onClick={chooseAllLocal}>この端末の内容をすべて採用</button>
        <button disabled={saving} className="border border-[#8C2D19] text-[#8C2D19] bg-white px-4 py-2.5 text-sm font-bold mr-2 disabled:opacity-40" onClick={() => onConfirm(request.remote)}>Googleシートをすべて採用して読み込む</button>
        <button className="border border-[#D1CEC7] bg-white px-4 py-2.5 text-sm font-bold text-[#444444] hover:bg-[#F2EFE9] disabled:opacity-40 disabled:cursor-not-allowed disabled:cursor-not-allowed" disabled={saving} onClick={onCancel}>保留して閉じる（編集と選択を保持）</button></footer>
    </div>
  </div>;
}
