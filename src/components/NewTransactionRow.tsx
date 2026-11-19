import React, { useState, useEffect, useMemo } from 'react';
import { Plus } from 'lucide-react';
import { Transaction, Household, TransactionCategory, TempleInfo } from '../types';
import { formatJapaneseEraDate, normalizeDateInput, NormalizeDateOptions } from '../utils/memorialCalculator';
import {
  normalizeCategoryList,
  parseTypedCategoryValue,
  resolveConfiguredCategory,
} from '../utils/accountingCategoryUtils';

export interface NewTransactionRowProps {
  incomeCategories: string[];
  expenseCategories: string[];
  paymentMethodOptions: string[];
  accountingDateOptions: NormalizeDateOptions;
  templeInfo: TempleInfo;
  householdMap: Map<string, Household>;
  onAddTransaction: (transaction: Transaction) => void;
}

/**
 * 出納帳最下行の新規記帳入力欄コンポーネント
 * 
 * 【パフォーマンス最適化】
 * 親コンポーネント（AccountingManager）から完全に状態（state）を分離・独立化。
 * 日付、科目、摘要、金額を1文字入力・変換・削除するたびの再描画を本コンポーネント内のみに限定し、
 * 上部の出納一覧テーブル（数百〜数千行）の不要な再レンダリングを100%遮断します。
 */
export const NewTransactionRow: React.FC<NewTransactionRowProps> = React.memo(({
  incomeCategories,
  expenseCategories,
  paymentMethodOptions,
  accountingDateOptions,
  templeInfo,
  householdMap,
  onAddTransaction,
}) => {
  const normalizedIncomeCategories = useMemo(
    () => normalizeCategoryList(incomeCategories),
    [incomeCategories]
  );
  const normalizedExpenseCategories = useMemo(
    () => normalizeCategoryList(expenseCategories),
    [expenseCategories]
  );
  const normalizedPaymentMethods = useMemo(
    () => normalizeCategoryList(paymentMethodOptions),
    [paymentMethodOptions]
  );

  const defaultType: '収入' | '支出' =
    normalizedIncomeCategories.length > 0
      ? '収入'
      : normalizedExpenseCategories.length > 0
      ? '支出'
      : '収入';
  const defaultCategory =
    defaultType === '収入'
      ? (normalizedIncomeCategories[0] || '')
      : (normalizedExpenseCategories[0] || '');
  const defaultMethod = normalizedPaymentMethods[0] || '現金受付';

  const [form, setForm] = useState<Partial<Transaction>>(() => ({
    date: formatJapaneseEraDate(new Date().toISOString().slice(0, 10), false),
    householdId: '',
    householdHeadName: '',
    category: defaultCategory,
    type: defaultType,
    amount: undefined,
    paymentMethod: defaultMethod,
    receiptNumber: `R-${Date.now().toString().slice(-6)}`,
    notes: '',
  }));

  // 勘定科目マスタや寺院切替で選択肢が変わった場合、現在選択中の科目を最新マスタと同期
  useEffect(() => {
    setForm((prev) => {
      const currentType: '収入' | '支出' = prev.type === '支出' ? '支出' : '収入';
      const activeList = currentType === '収入' ? normalizedIncomeCategories : normalizedExpenseCategories;
      const fallbackList = currentType === '収入' ? normalizedExpenseCategories : normalizedIncomeCategories;
      const fallbackType: '収入' | '支出' = currentType === '収入' ? '支出' : '収入';

      let nextType: '収入' | '支出' = currentType;
      let nextCategory = '';

      if (activeList.length > 0) {
        nextCategory = resolveConfiguredCategory(prev.category, activeList);
      } else if (fallbackList.length > 0) {
        nextType = fallbackType;
        nextCategory = fallbackList[0];
      }

      const nextMethod =
        normalizedPaymentMethods.length > 0
          ? (prev.paymentMethod && normalizedPaymentMethods.includes(prev.paymentMethod)
              ? prev.paymentMethod
              : normalizedPaymentMethods[0])
          : (prev.paymentMethod || '現金受付');

      if (prev.type === nextType && prev.category === nextCategory && prev.paymentMethod === nextMethod) {
        return prev;
      }
      return {
        ...prev,
        type: nextType,
        category: nextCategory,
        paymentMethod: nextMethod as any,
      };
    });
  }, [normalizedIncomeCategories, normalizedExpenseCategories, normalizedPaymentMethods]);

  const handleSave = () => {
    if (!form.amount || form.amount <= 0) {
      alert('出納の金額を入力してください。');
      return;
    }

    const txType: '収入' | '支出' = form.type === '支出' ? '支出' : '収入';
    const activeList = txType === '収入' ? normalizedIncomeCategories : normalizedExpenseCategories;
    const resolvedCategory = resolveConfiguredCategory(form.category, activeList);
    if (!resolvedCategory) {
      alert('勘定科目が設定されていません。寺院設定から勘定科目を登録してください。');
      return;
    }

    const normalizedDate = normalizeDateInput(form.date || '', accountingDateOptions) || new Date().toISOString().slice(0, 10).replace(/-/g, '/');
    const matchedHousehold = form.householdId ? householdMap.get(form.householdId) : null;
    const resolvedTxTempleId = matchedHousehold?.templeId || templeInfo?.id || 'temple-main';

    const completeTx: Transaction = {
      id: `TX-${crypto.randomUUID()}`,
      templeId: resolvedTxTempleId,
      date: normalizedDate,
      householdId: form.householdId || '',
      householdHeadName: form.householdHeadName || '',
      category: resolvedCategory as TransactionCategory,
      type: txType,
      amount: Number(form.amount) || 0,
      paymentMethod: form.paymentMethod || defaultMethod,
      receiptNumber: form.receiptNumber || `R-${Date.now().toString().slice(-6)}`,
      notes: form.notes || '',
    };

    onAddTransaction(completeTx);

    // 次の素早い記帳のための初期化（日付や決済方法は前回値を維持または当日に戻す）
    setForm({
      date: formatJapaneseEraDate(new Date().toISOString().slice(0, 10), false),
      householdId: '',
      householdHeadName: '',
      category: defaultCategory,
      type: defaultType,
      amount: undefined,
      paymentMethod: defaultMethod,
      receiptNumber: `R-${Date.now().toString().slice(-6)}`,
      notes: '',
    });
  };

  const hasAnyCategory = normalizedIncomeCategories.length > 0 || normalizedExpenseCategories.length > 0;
  const selectValue = hasAnyCategory && form.category ? `${form.type || defaultType}:${form.category}` : '';

  return (
    <tr className="bg-[#FFFDF0] border-2 border-[#D4AF37] font-sans">
      {/* 1. 年月日 (元号表記 & 西暦数字即時変換対応) */}
      <td className="px-2 py-1.5">
        <input
          type="text"
          value={form.date || ''}
          onChange={(e) => setForm((prev) => ({ ...prev, date: e.target.value }))}
          onFocus={(e) => e.target.select()}
          onBlur={(e) => {
            const normalized = normalizeDateInput(e.target.value, accountingDateOptions);
            if (normalized) {
              setForm((prev) => ({ ...prev, date: formatJapaneseEraDate(normalized, false) }));
            }
          }}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
          placeholder="例: 20260607"
          className="w-full bg-white border border-[#1A1A1A] px-1.5 py-1 font-mono text-sm font-bold"
        />
      </td>

      {/* 2. 勘定科目 (グループ化・1行表示) */}
      <td className="px-2 py-1.5">
        <select
          value={selectValue}
          onChange={(e) => {
            if (!e.target.value) return;
            const { type: newType, category: newCat } = parseTypedCategoryValue(e.target.value);
            setForm((prev) => ({
              ...prev,
              type: newType,
              category: newCat,
            }));
          }}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
          className="w-full bg-white border border-[#1A1A1A] px-1.5 py-1 text-sm font-bold whitespace-nowrap"
        >
          {!hasAnyCategory && (
            <option value="">勘定科目未設定</option>
          )}
          {normalizedIncomeCategories.length > 0 && (
            <optgroup label="【 収入の部 】">
              {normalizedIncomeCategories.map((cat) => (
                <option key={`収入:${cat}`} value={`収入:${cat}`}>
                  {cat}
                </option>
              ))}
            </optgroup>
          )}
          {normalizedExpenseCategories.length > 0 && (
            <optgroup label="【 支出の部 】">
              {normalizedExpenseCategories.map((cat) => (
                <option key={`支出:${cat}`} value={`支出:${cat}`}>
                  {cat}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </td>

      {/* 3. 決済方法 / 摘要 (1行入力スタイル) */}
      <td className="px-2 py-1.5 max-w-[240px]">
        <div className="flex items-center space-x-1.5">
          <select
            value={form.paymentMethod || defaultMethod}
            onChange={(e) => setForm((prev) => ({ ...prev, paymentMethod: e.target.value as any }))}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
            className="w-24 bg-white border border-[#1A1A1A] px-1.5 py-1 text-xs shrink-0"
          >
            {paymentMethodOptions.map((pm) => (
              <option key={pm} value={pm}>
                {pm}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={form.notes || ''}
            onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
            placeholder="備考・摘要"
            className="flex-1 bg-white border border-[#1A1A1A] px-1.5 py-1 text-sm font-bold min-w-0"
          />
        </div>
      </td>

      {/* 4. 収入金額 */}
      <td className="px-2 py-1.5">
        <input
          type="number"
          disabled={form.type !== '収入'}
          value={form.type === '収入' ? (form.amount ?? '') : ''}
          onChange={(e) => setForm((prev) => ({ ...prev, amount: e.target.value ? Number(e.target.value) : undefined }))}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
          placeholder={form.type === '収入' ? '金額入力' : '―'}
          className={`w-full px-1.5 py-1 text-sm font-mono font-bold text-right border ${
            form.type === '収入'
              ? 'bg-emerald-50 border-emerald-600 text-emerald-900 font-bold'
              : 'bg-gray-100 border-gray-300 text-gray-400 cursor-not-allowed'
          }`}
        />
      </td>

      {/* 5. 支出金額 */}
      <td className="px-2 py-1.5">
        <input
          type="number"
          disabled={form.type !== '支出'}
          value={form.type === '支出' ? (form.amount ?? '') : ''}
          onChange={(e) => setForm((prev) => ({ ...prev, amount: e.target.value ? Number(e.target.value) : undefined }))}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
          placeholder={form.type === '支出' ? '金額入力' : '―'}
          className={`w-full px-1.5 py-1 text-sm font-mono font-bold text-right border ${
            form.type === '支出'
              ? 'bg-rose-50 border-rose-600 text-rose-900 font-bold'
              : 'bg-gray-100 border-gray-300 text-gray-400 cursor-not-allowed'
          }`}
        />
      </td>

      {/* 6. 残高 */}
      <td className="px-3 py-1.5 text-right font-mono text-[#888888] text-xs font-bold">
        (新規記帳)
      </td>

      {/* 7. 登録ボタン */}
      <td className="px-2 py-1.5 text-right whitespace-nowrap">
        <button
          onClick={handleSave}
          className="px-3 py-1 bg-[#D4AF37] hover:bg-[#c29f2f] text-[#1A1A1A] font-bold text-xs inline-flex items-center space-x-1 shadow-sm cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>登録</span>
        </button>
      </td>
    </tr>
  );
});
