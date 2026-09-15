import React, { useMemo, useState } from 'react';
import { Transaction } from '../../types';
import { normalizeDateInput } from '../../utils/memorialCalculator';

interface MobileHouseholdAccountingProps {
  householdId: string;
  transactions: Transaction[];
}

export const MobileHouseholdAccounting: React.FC<MobileHouseholdAccountingProps> = ({ householdId, transactions }) => {
  const [visibleCount, setVisibleCount] = useState(20);
  const records = useMemo(() => transactions
    // Household IDs are shared with desktop accounting, including combined temple accounts.
    .filter((transaction) => !!householdId && transaction.householdId === householdId)
    .sort((a, b) => {
      const dateA = normalizeDateInput(a.date || '');
      const dateB = normalizeDateInput(b.date || '');
      return dateB.localeCompare(dateA);
    }), [householdId, transactions]);

  return (
    <section className="space-y-2" aria-label="当家の会計データ">
      <h4 className="font-bold text-[#8C2D19]">当家の会計 ({records.length}件)</h4>
      <p className="text-xs text-stone-600">端末に読み込まれている会計データを新しい日付順で表示します。</p>
      {records.length === 0 ? (
        <div className="p-4 bg-white border border-dashed border-[#D1CEC7] rounded-xs text-center text-stone-600">
          この家に紐づく会計データはありません。
        </div>
      ) : (
        <ul className="space-y-2">
          {records.slice(0, visibleCount).map((record) => (
            <li key={record.id} className="p-3 bg-white border border-stone-200 rounded-xs space-y-2 break-words">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-stone-600">{normalizeDateInput(record.date || '') || record.date || '日付未登録'}</span>
                <span className={`font-bold ${record.type === '支出' ? 'text-red-700' : 'text-emerald-800'}`}>
                  {record.type}　{record.amount.toLocaleString('ja-JP')}円
                </span>
              </div>
              <div className="font-bold text-stone-900">{record.category || '科目未登録'}</div>
              {record.description && <p className="whitespace-pre-wrap">{record.description}</p>}
              {record.paymentMethod && <p className="text-stone-600">支払方法: {record.paymentMethod}</p>}
              {record.receiptNumber && <p className="text-stone-600">領収書番号: {record.receiptNumber}</p>}
              {record.notes && <p className="text-stone-600 whitespace-pre-wrap">備考: {record.notes}</p>}
            </li>
          ))}
        </ul>
      )}
      {records.length > visibleCount && (
        <button type="button" onClick={() => setVisibleCount((count) => count + 20)}
          className="w-full min-h-11 bg-white border border-[#D1CEC7] rounded-xs font-bold text-[#8C2D19] cursor-pointer">
          続きを表示（残り{records.length - visibleCount}件）
        </button>
      )}
    </section>
  );
};
