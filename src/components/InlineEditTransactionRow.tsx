import React, { useState, useMemo } from 'react';
import { Save } from 'lucide-react';
import { Transaction, TransactionCategory } from '../types';
import { formatCurrency, formatJapaneseEraDate, normalizeDateInput, NormalizeDateOptions } from '../utils/memorialCalculator';
import {
  normalizeCategoryList,
  normalizeCategoryName,
  parseTypedCategoryValue,
  UNSET_INCOME_CATEGORY,
  UNSET_EXPENSE_CATEGORY,
} from '../utils/accountingCategoryUtils';

export interface InlineEditTransactionRowProps {
  transaction: Transaction & { runningBalance?: number };
  incomeCategories: string[];
  expenseCategories: string[];
  paymentMethodOptions: string[];
  accountingDateOptions: NormalizeDateOptions;
  onSave: (updated: Transaction) => void;
  onCancel: () => void;
  onDelete: (transaction: Transaction) => void;
}

/**
 * 行内編集用コンポーネント
 * 
 * 【パフォーマンス最適化】
 * 編集中にキー入力するたびの再描画を本コンポーネント内に閉じ込め、
 * 他の出納行（数百〜数千行）が再レンダリングされるのを防止します。
 */
export const InlineEditTransactionRow: React.FC<InlineEditTransactionRowProps> = React.memo(({
  transaction,
  incomeCategories,
  expenseCategories,
  paymentMethodOptions,
  accountingDateOptions,
  onSave,
  onCancel,
  onDelete,
}) => {
  const normalizedIncomeCategories = useMemo(
    () => normalizeCategoryList(incomeCategories),
    [incomeCategories]
  );
  const normalizedExpenseCategories = useMemo(
    () => normalizeCategoryList(expenseCategories),
    [expenseCategories]
  );

  const [form, setForm] = useState<Partial<Transaction>>(() => ({
    ...transaction,
    category: normalizeCategoryName(transaction.category),
    date: formatJapaneseEraDate(transaction.date, false),
    notes: transaction.notes !== undefined && transaction.notes !== '' ? transaction.notes : (transaction.householdHeadName || ''),
  }));

  const currentType: '収入' | '支出' = form.type === '支出' ? '支出' : '収入';
  const currentCategory = normalizeCategoryName(form.category);
  const originalType: '収入' | '支出' = transaction.type === '支出' ? '支出' : '収入';
  const originalCategory = normalizeCategoryName(transaction.category);

  // 既存レコードがマスタ外科目（例：削除済み・旧科目）を持っている場合、選択肢に含めて見た目と内部値を一致させる
  const extraIncomeCategory =
    originalType === '収入' && originalCategory && !normalizedIncomeCategories.includes(originalCategory)
      ? originalCategory
      : currentType === '収入' && currentCategory && !normalizedIncomeCategories.includes(currentCategory)
      ? currentCategory
      : null;

  const extraExpenseCategory =
    originalType === '支出' && originalCategory && !normalizedExpenseCategories.includes(originalCategory)
      ? originalCategory
      : currentType === '支出' && currentCategory && !normalizedExpenseCategories.includes(currentCategory)
      ? currentCategory
      : null;

  const hasEmptyCurrentCategory = !currentCategory;

  const handleSave = () => {
    const normalizedDate = normalizeDateInput(form.date || '', accountingDateOptions) || transaction.date;

    const completeTx: Transaction = {
      ...transaction,
      date: normalizedDate,
      householdId: form.householdId,
      householdHeadName: form.householdHeadName || '',
      category: normalizeCategoryName(form.category) as TransactionCategory,
      type: currentType,
      amount: Number(form.amount) || 0,
      paymentMethod: form.paymentMethod || transaction.paymentMethod,
      receiptNumber: form.receiptNumber || transaction.receiptNumber,
      notes: form.notes || '',
    };

    onSave(completeTx);
  };

  return (
    <tr className="bg-[#FFFDF0] font-sans border-b border-[#D4AF37]">
      {/* 1. 年月日 (編集時) */}
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

      {/* 2. 勘定科目 (編集時) */}
      <td className="px-2 py-1.5">
        <select
          value={`${currentType}:${currentCategory}`}
          onChange={(e) => {
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
          {hasEmptyCurrentCategory && (
            <option value={`${currentType}:`}>
              {currentType === '支出' ? UNSET_EXPENSE_CATEGORY : UNSET_INCOME_CATEGORY}
            </option>
          )}
          <optgroup label="【 収入の部 】">
            {extraIncomeCategory && (
              <option key={`収入:${extraIncomeCategory}`} value={`収入:${extraIncomeCategory}`}>
                {extraIncomeCategory}（マスタ外）
              </option>
            )}
            {normalizedIncomeCategories.map((cat) => (
              <option key={`収入:${cat}`} value={`収入:${cat}`}>
                {cat}
              </option>
            ))}
          </optgroup>
          <optgroup label="【 支出の部 】">
            {extraExpenseCategory && (
              <option key={`支出:${extraExpenseCategory}`} value={`支出:${extraExpenseCategory}`}>
                {extraExpenseCategory}（マスタ外）
              </option>
            )}
            {normalizedExpenseCategories.map((cat) => (
              <option key={`支出:${cat}`} value={`支出:${cat}`}>
                {cat}
              </option>
            ))}
          </optgroup>
        </select>
      </td>

      {/* 3. 決済方法 / 摘要 (編集時) */}
      <td className="px-2 py-1.5 min-w-[200px]">
        <div className="flex items-center space-x-1.5">
          <select
            value={form.paymentMethod || paymentMethodOptions[0] || '現金受付'}
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

      {/* 4. 収入金額 (編集時) */}
      <td className="px-2 py-1.5">
        <input
          type="number"
          disabled={form.type !== '収入'}
          value={form.type === '収入' ? (form.amount ?? '') : ''}
          onChange={(e) => setForm((prev) => ({ ...prev, amount: e.target.value ? Number(e.target.value) : undefined }))}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
          placeholder={form.type === '収入' ? '金額' : '―'}
          className={`w-full px-1.5 py-1 text-sm font-mono font-bold text-right border ${
            form.type === '収入'
              ? 'bg-emerald-50 border-emerald-600 text-emerald-900'
              : 'bg-gray-100 border-gray-300 text-gray-400 cursor-not-allowed'
          }`}
        />
      </td>

      {/* 5. 支出金額 (編集時) */}
      <td className="px-2 py-1.5">
        <input
          type="number"
          disabled={form.type !== '支出'}
          value={form.type === '支出' ? (form.amount ?? '') : ''}
          onChange={(e) => setForm((prev) => ({ ...prev, amount: e.target.value ? Number(e.target.value) : undefined }))}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
          placeholder={form.type === '支出' ? '金額' : '―'}
          className={`w-full px-1.5 py-1 text-sm font-mono font-bold text-right border ${
            form.type === '支出'
              ? 'bg-rose-50 border-rose-600 text-rose-900'
              : 'bg-gray-100 border-gray-300 text-gray-400 cursor-not-allowed'
          }`}
        />
      </td>

      {/* 6. 残高 (編集時) */}
      <td className="px-3 py-1.5 text-right font-mono text-sm text-[#888888]">
        {formatCurrency(transaction.runningBalance || 0)}
      </td>

      {/* 7. 操作 (編集時) */}
      <td className="px-2 py-1.5 text-right space-x-1 whitespace-nowrap">
        <button
          onClick={handleSave}
          className="px-2.5 py-1 bg-[#D4AF37] hover:bg-[#c29f2f] text-[#1A1A1A] font-bold text-xs inline-flex items-center space-x-0.5 shadow-sm cursor-pointer"
        >
          <Save className="w-3.5 h-3.5" />
          <span>保存</span>
        </button>
        <button
          onClick={onCancel}
          className="px-2 py-1 bg-white border border-[#D1CEC7] text-[#1A1A1A] font-bold text-xs hover:bg-[#EBE7DF] cursor-pointer"
        >
          <span>取消</span>
        </button>
        <button
          onClick={() => onDelete(transaction)}
          className="px-2 py-1 bg-rose-50 border border-rose-300 text-rose-800 font-bold text-xs hover:bg-rose-100 cursor-pointer"
        >
          削除
        </button>
      </td>
    </tr>
  );
});
