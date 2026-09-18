import React from 'react';
import type { HouseholdReview } from '../utils/householdRetention';

export function DeletedHouseholdReviewDialog({ review, busy, error, onChoose }: {
  review?: HouseholdReview; busy: boolean; error: string; onChoose: (restore: boolean) => void;
}) {
  if (!review) return null;
  return <div className="fixed inset-0 z-[100010] bg-black/50 flex items-center justify-center p-4 font-sans">
    <section role="alertdialog" aria-modal="true" aria-labelledby="deleted-household-title" aria-describedby="deleted-household-description" className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 text-slate-900">
      <h2 id="deleted-household-title" className="text-lg font-bold mb-4">削除した檀家の関連情報が更新されました</h2>
      <p id="deleted-household-description">削除した檀家「{review.name}」様ですが、{review.time ? `${review.time}の` : ''}会計・過去帳の関連情報に変更があります。檀家削除を取りやめ、名簿に復帰しますか？</p>
      <p className="mt-3 text-sm">どちらを選んでも、関連する会計・過去帳の記録は保持します。復帰する場合も最新の情報を維持します。</p>
      {error && <p role="alert" className="mt-3 text-red-700">{error}</p>}
      {busy && <p role="status" className="mt-3">最新の内容を確認・保存しています…</p>}
      <div className="mt-6 flex flex-col sm:flex-row gap-3">
        <button autoFocus disabled={busy} onClick={() => onChoose(false)} className="border rounded-lg px-4 py-3 font-bold disabled:opacity-50">削除済みのままにする</button>
        <button disabled={busy} onClick={() => onChoose(true)} className="bg-blue-700 text-white rounded-lg px-4 py-3 font-bold disabled:opacity-50">名簿に復帰する</button>
      </div>
    </section>
  </div>;
}
