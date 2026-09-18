import React, { useEffect, useState } from 'react';

export function MergeProgress({ stage, reason }: { stage: string; reason?: string }) {
  const [started] = useState(Date.now);
  const [stageStarted, setStageStarted] = useState(Date.now);
  const [now, setNow] = useState(Date.now);
  useEffect(() => { setStageStarted(Date.now()); }, [stage]);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  return <div role="dialog" aria-modal="true" aria-label="データの統合中" className="fixed inset-0 z-[100000] bg-black/70 flex items-center justify-center p-4 font-sans">
    <section className="w-full max-w-lg bg-[#F9F7F2] border border-[#D4AF37] p-6 shadow-2xl text-[#1A1A1A]">
      <h2 className="font-bold text-lg">統合データの確認・保存中</h2>
      <p className="mt-3 text-sm whitespace-pre-wrap break-words">開始理由：{reason || '未取得（このタブでは開始理由を記録できていません）'}</p>
      <p className="mt-1 text-xs text-[#666666]">診断版 09-18 A</p>
      <div role="status" aria-live="polite" className="flex items-center gap-3 my-5">
        <span aria-hidden="true" className="h-6 w-6 shrink-0 animate-spin rounded-full border-2 border-[#D1CEC7] border-t-[#8C2D19]" />
        <p className="font-bold">{stage || '統合内容を確認しています'}</p>
      </div>
      <p className="text-sm text-[#666666]">この処理：{Math.max(0, Math.floor((now - stageStarted) / 1000))}秒 ／ 全体：{Math.max(0, Math.floor((now - started) / 1000))}秒</p>
      <p className="text-sm mt-3">処理が終わるまで、この画面を閉じずにお待ちください。</p>
    </section>
  </div>;
}
