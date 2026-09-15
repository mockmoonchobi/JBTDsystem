import React, { useMemo, useState } from 'react';
import { Dataset, MergeBaseline, MergeChoices, planSheetsMerge, mergeFieldLabels } from '../utils/threeWaySheetsMerge';

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
  if (typeof value === 'object') return <dl className="space-y-1">{Object.entries(value).filter(([key]) => !['updatedAt', 'createdAt', 'updatedDate', 'createdDate', 'updatedTime', 'createdTime'].includes(key)).map(([key, v]) => <div key={key}><dt className="font-bold">{fieldLabels[key] || key}</dt><dd className="pl-2"><Value value={v} /></dd></div>)}</dl>;
  return <span className="whitespace-pre-wrap break-all">{String(value)}</span>;
}
export function SheetsMergeWizard({ request, onSaveChoices, onConfirm, onCancel }: Props) {
  const [step, setStep] = useState<'prepare' | 'choose' | 'review'>('prepare');
  const [choices, setChoices] = useState<MergeChoices>(request.choices);
  const [index, setIndex] = useState(0);
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const result = useMemo(() => {
    try { return { plan: planSheetsMerge(request.base, request.local, request.remote, choices), error: '' }; }
    catch (e: any) { return { plan: null, error: e.message }; }
  }, [request, choices]);
  const plan = result.plan;
  const conflict = plan?.conflicts[index];
  const choose = async (side: 'local' | 'remote') => {
    if (!conflict) return;
    setSaving(true); setError('');
    const next = { ...choices, [conflict.key]: { side, fingerprint: conflict.fingerprint } };
    try { await onSaveChoices(next); setChoices(next); }
    catch { setError('選択内容を端末に保存できません。保存容量などを確認してください。'); }
    finally { setSaving(false); }
  };
  return <div className="fixed inset-0 z-[100000] bg-black/60 flex items-center justify-center p-2 sm:p-5" role="dialog" aria-modal="true" aria-labelledby="merge-title">
    <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[95dvh] overflow-y-auto p-4 sm:p-6 text-stone-900 font-sans space-y-4">
      <h2 id="merge-title" className="text-xl font-bold">端末とGoogleシートの変更を統合</h2>
      {request.message && <p className="bg-amber-50 p-3">{request.message}</p>}
      {(error || result.error) && <p role="alert" className="text-red-700">{error || result.error}</p>}
      {step === 'prepare' && <>
        <p>端末の未送信の編集を残しながら、Googleシートの変更を取り込みます。競合しない変更は自動で統合案に含めます。</p>
        {!request.base && <p className="bg-amber-50 p-3">以前の同期基準がないため、異なる内容は削除と決めつけずに確認します。</p>}
        <p>他端末に未送信の編集がある場合は先に退避し、この端末の統合後に1台ずつ統合してください。Googleシートの直接編集も止めてください。</p>
        <label className="flex items-start gap-3 p-3 border rounded"><input className="mt-1" type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} /><span>他端末と別タブのアプリを閉じ、進行中の保存がないことを確認しました。完了までこの1台だけで作業します。</span></label>
        <button className="px-5 py-3 bg-[#8C2D19] text-white rounded disabled:opacity-40" disabled={!confirmed || !plan} onClick={() => setStep(plan!.conflicts.length ? 'choose' : 'review')}>比較結果を確認</button>
      </>}
      {step === 'choose' && conflict && <>
        <p className="font-bold">競合 {index + 1} / {plan!.conflicts.length}：{conflict.label}</p>
        <details className="p-3 bg-stone-50"><summary>前回同期時点の内容</summary><Value value={conflict.base} /></details>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{(['local', 'remote'] as const).map(side => <div key={side} className="border rounded p-3 space-y-3 min-w-0">
          <h3 className="font-bold">{side === 'local' ? 'この端末' : 'Googleシート'}</h3>
          <div className="max-h-64 overflow-auto text-sm"><Value value={conflict[side]} /></div>
          <button type="button" aria-pressed={choices[conflict.key]?.fingerprint === conflict.fingerprint && choices[conflict.key]?.side === side} disabled={saving} onClick={() => choose(side)} className="w-full py-3 border rounded aria-pressed:bg-[#8C2D19] aria-pressed:text-white">この内容を採用</button>
        </div>)}</div>
        <div className="flex flex-wrap gap-3"><button className="border rounded px-4 py-3" disabled={index === 0 || saving} onClick={() => setIndex(i => i - 1)}>前へ</button>
          <button className="border rounded px-4 py-3" disabled={saving || choices[conflict.key]?.fingerprint !== conflict.fingerprint} onClick={() => index + 1 < plan!.conflicts.length ? setIndex(i => i + 1) : setStep('review')}> {index + 1 < plan!.conflicts.length ? '次へ' : '最終確認へ'}</button></div>
      </>}
      {step === 'review' && plan && <>
        <h3 className="font-bold">Googleシートに反映する変更</h3>
        {plan.errors.length > 0 && <div role="alert" className="text-red-700">{plan.errors.slice(0, 10).map((message, i) => <p key={i}>{message}</p>)}</div>}
        <ul className="space-y-1">{plan.summary.map(s => <li key={s.table}>{s.label}：追加 {s.added}件・変更 {s.updated}件・削除 {s.deleted}件</li>)}</ul>
        <details className="border rounded p-3" onToggle={e => setShowPreview(e.currentTarget.open)}><summary>統合後の内容を確認</summary>{showPreview && <div className="max-h-72 overflow-auto text-sm"><Value value={plan.merged} /></div>}</details>
        <p>保存直前にシートを再確認します。別の変更が見つかった場合は再比較します。確認中の選択は、内容が変わっていないものだけ引き継ぎます。</p>
        <p className="text-sm text-stone-600">操作履歴は既存仕様に合わせて最新1,000件を保存します。統合前の双方のデータと履歴は、この端末の統合バックアップに残します。</p>
        <div className="flex flex-wrap gap-3"><button className="border rounded px-4 py-3" onClick={() => { setIndex(0); setStep(plan.conflicts.length ? 'choose' : 'prepare'); }}>戻る</button>
          <button className="bg-[#8C2D19] text-white rounded px-4 py-3 disabled:opacity-40" disabled={saving || !!plan.unresolved.length || !!plan.errors.length} onClick={() => onConfirm(plan.merged)}>統合してGoogleシートへ保存</button></div>
      </>}
      <button className="text-stone-600 underline py-2" disabled={saving} onClick={onCancel}>保留して閉じる（編集と選択を保持）</button>
    </div>
  </div>;
}
