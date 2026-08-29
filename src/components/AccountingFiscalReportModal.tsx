import React, { useState, useMemo } from 'react';
import { X, Printer, Calendar } from 'lucide-react';
import { Transaction, TempleInfo, MasterOptions } from '../types';
import { INITIAL_INCOME_CATEGORIES, INITIAL_EXPENSE_CATEGORIES } from '../data/initialData';
import { formatCurrency, formatJapaneseEraDate } from '../utils/memorialCalculator';
import {
  getAvailableFiscalYears,
  getFiscalYearInfo,
  getFiscalYearOfDate,
  isDateInFiscalYear,
  isCarryoverTransaction,
  calculatePriorCarryoverBalance,
  stripAutoCarryoverTransactions,
  compareTransactionsChronological,
  getJapaneseEra,
  FiscalYearInfo,
} from '../utils/fiscalYearUtils';

interface AccountingFiscalReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  transactions: Transaction[];
  templeInfo: TempleInfo;
  masterOptions: MasterOptions;
}

export const AccountingFiscalReportModal: React.FC<AccountingFiscalReportModalProps> = ({
  isOpen,
  onClose,
  transactions,
  templeInfo,
  masterOptions,
}) => {
  const currentFY = useMemo(
    () => getFiscalYearOfDate(new Date().toISOString().slice(0, 10), templeInfo),
    [templeInfo]
  );

  const cleanTransactions = useMemo(() => {
    return stripAutoCarryoverTransactions(transactions);
  }, [transactions]);

  const availableFYs = useMemo(() => {
    return getAvailableFiscalYears(cleanTransactions, templeInfo);
  }, [cleanTransactions, templeInfo]);

  const [selectedFYYear, setSelectedFYYear] = useState<number>(() => currentFY);
  const [reportType, setReportType] = useState<'settlement' | 'ledger'>('settlement');

  const selectedFYInfo: FiscalYearInfo = useMemo(() => {
    return getFiscalYearInfo(selectedFYYear, templeInfo);
  }, [selectedFYYear, templeInfo]);

  const incomeCategories = masterOptions?.incomeCategories || [];
  const expenseCategories = masterOptions?.expenseCategories || [];

  // Prior carryover dynamically calculated from all previous transactions before this fiscal year
  const priorCarryover = useMemo(() => {
    return calculatePriorCarryoverBalance(cleanTransactions, selectedFYYear, templeInfo);
  }, [cleanTransactions, selectedFYYear, templeInfo]);

  // Filter transactions in selected fiscal year and sort chronologically
  const fyTransactions = useMemo(() => {
    return cleanTransactions
      .filter((t) => isDateInFiscalYear(t.date, selectedFYYear, templeInfo))
      .sort((a, b) => compareTransactionsChronological(a, b));
  }, [cleanTransactions, selectedFYYear, templeInfo]);

  // Financial calculations for Settlement (収支決算)
  const settlementData = useMemo(() => {
    const incomeCategoryTotals: Record<string, number> = {};
    const expenseCategoryTotals: Record<string, number> = {};

    incomeCategories.forEach((cat) => (incomeCategoryTotals[cat] = 0));
    expenseCategories.forEach((cat) => (expenseCategoryTotals[cat] = 0));

    let operationalIncome = 0;
    let totalExpense = 0;

    fyTransactions.forEach((t) => {
      if (t.type === '収入') {
        const cat = t.category || 'その他収入';
        incomeCategoryTotals[cat] = (incomeCategoryTotals[cat] || 0) + (t.amount || 0);
        operationalIncome += t.amount || 0;
      } else if (t.type === '支出') {
        const cat = t.category || 'その他支出';
        expenseCategoryTotals[cat] = (expenseCategoryTotals[cat] || 0) + (t.amount || 0);
        totalExpense += t.amount || 0;
      }
    });

    const carryoverIncome = priorCarryover.priorBalance; // 前期繰越金 (動的計算)
    const totalIncome = carryoverIncome + operationalIncome; // 収入の部合計（繰越金を含む）
    const netPeriodBalance = operationalIncome - totalExpense; // 当期実質収支差額 (収入 - 支出)
    const nextCarryoverBalance = carryoverIncome + netPeriodBalance; // 次期繰越金 (前期繰越 + 当期差額)

    return {
      incomeCategoryTotals,
      expenseCategoryTotals,
      carryoverIncome,
      operationalIncome,
      totalIncome,
      totalExpense,
      netPeriodBalance,
      nextCarryoverBalance,
    };
  }, [fyTransactions, incomeCategories, expenseCategories, priorCarryover]);

  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#1A1A1A]/80 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 font-serif overflow-y-auto print:p-0 print:m-0 print:bg-white print:static print:block">
      <div className="bg-white border border-[#D1CEC7] w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl rounded-none text-[#2D2D2D] my-auto print:max-w-none print:w-full print:border-none print:shadow-none print:max-h-none print:p-0">
        {/* Modal Header Controls (Hidden during print) */}
        <div className="p-4 bg-[#1A1A1A] border-b border-[#D4AF37] text-[#F9F7F2] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 no-print">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-[#D4AF37] text-[#1A1A1A] flex items-center justify-center font-bold text-xs font-sans">
              帳票
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-lg font-bold text-[#F9F7F2] tracking-wider">
                  会計年度 決算書・出納帳 印刷出力
                </h3>
                <span className="px-2 py-0.5 bg-[#D4AF37]/20 border border-[#D4AF37] text-[#D4AF37] text-[10px] font-sans font-bold">
                  省インク・シンプル印刷対応
                </span>
              </div>
              <p className="text-xs text-[#CCCCCC] font-sans">
                {templeInfo.mountainName} {templeInfo.name} 会計年度基準 ({selectedFYInfo.fullLabel})
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handlePrint}
              className="px-4 py-2 bg-[#D4AF37] hover:bg-[#c29f2f] text-[#1A1A1A] font-bold text-xs uppercase tracking-wider flex items-center space-x-1.5 shadow-md transition-colors"
            >
              <Printer className="w-4 h-4" />
              <span>帳票・決算書を印刷</span>
            </button>
            <button onClick={onClose} className="p-1.5 text-[#CCCCCC] hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Filter and Report Type Selection Toolbar (Hidden during print) */}
        <div className="p-4 bg-[#F9F7F2] border-b border-[#D1CEC7] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 font-sans text-xs no-print">
          <div className="flex items-center space-x-2">
            <Calendar className="w-4 h-4 text-[#1A1A1A]" />
            <span className="font-bold text-[#1A1A1A]">対象会計年度:</span>
            <select
              value={selectedFYYear}
              onChange={(e) => setSelectedFYYear(Number(e.target.value))}
              className="bg-white border border-[#1A1A1A] p-2 font-bold text-sm text-[#1A1A1A] focus:outline-none"
            >
              {availableFYs.map((fy) => (
                <option key={fy.year} value={fy.year}>
                  {fy.fullLabel}
                </option>
              ))}
            </select>
          </div>

          {/* Report Type Switcher */}
          <div className="bg-[#EBE7DF] p-1 border border-[#D1CEC7] flex space-x-1">
            <button
              onClick={() => setReportType('settlement')}
              className={`px-3 py-1.5 font-bold transition-colors ${
                reportType === 'settlement'
                  ? 'bg-[#1A1A1A] text-[#D4AF37]'
                  : 'text-[#444444] hover:text-[#1A1A1A]'
              }`}
            >
              ① 収支決算書 (科目別集計)
            </button>
            <button
              onClick={() => setReportType('ledger')}
              className={`px-3 py-1.5 font-bold transition-colors ${
                reportType === 'ledger'
                  ? 'bg-[#1A1A1A] text-[#D4AF37]'
                  : 'text-[#444444] hover:text-[#1A1A1A]'
              }`}
            >
              ② 会計出納帳・総勘定元帳 ({fyTransactions.length}件)
            </button>
          </div>
        </div>

        {/* PRINTABLE AREA (A4 format) */}
        <div className="flex-1 overflow-y-auto p-6 sm:p-10 bg-white font-serif text-[#1A1A1A] print:p-6 print:py-4 print:m-0 print:overflow-visible">
          <div className="max-w-3xl mx-auto space-y-6 print:max-w-none print:w-full print-ink-saver print:space-y-3 a4-single-page">
            {/* Title & Temple Info Header */}
            <div className="text-center border-b-2 border-[#1A1A1A] pb-4 print:pb-2 space-y-1 print:space-y-0.5">
              <p className="text-xs text-[#555555] tracking-widest font-sans print:text-[10px]">
                宗教法人 {templeInfo.name} 会計計算書類
              </p>
              <h1 className="text-2xl font-bold tracking-widest text-[#1A1A1A] print:text-xl">
                {reportType === 'settlement'
                  ? `${selectedFYInfo.eraLabel} 収支決算書`
                  : `${selectedFYInfo.eraLabel} 会計出納帳・総勘定元帳`}
              </h1>
              <p className="text-xs text-[#444444] font-sans print:text-[10px]">
                自 {formatJapaneseEraDate(selectedFYInfo.startDateStr, false)} 至 {formatJapaneseEraDate(selectedFYInfo.endDateStr, false)}
              </p>
            </div>

            {/* Document Body - 1. 収支決算書 */}
            {reportType === 'settlement' && (
              <div className="space-y-5 print:space-y-2.5">
                {/* 2-Column Summary: Income vs Expense */}
                <div className="grid grid-cols-1 md:grid-cols-2 print:grid-cols-2 gap-4 print:gap-3">
                  {/* 収入の部 */}
                  <div className="border border-[#1A1A1A] p-3 print:p-2 bg-white">
                    <div className="border-b-2 border-[#1A1A1A] pb-1.5 mb-2 flex justify-between items-center bg-[#F4F2EB] print:bg-white text-[#1A1A1A] p-1.5 -m-3 print:-m-2 mb-2">
                      <span className="font-bold text-xs print:text-[11px] tracking-wider">【 収入の部 】</span>
                      <span className="text-xs font-mono font-bold text-[#1A1A1A]">
                        {formatCurrency(settlementData.totalIncome)}
                      </span>
                    </div>
                    <table className="w-full text-xs print:text-[10px] text-left border-collapse">
                      <thead>
                        <tr className="border-b border-[#1A1A1A] text-[#1A1A1A] font-sans font-bold">
                          <th className="py-0.5">勘定科目</th>
                          <th className="py-0.5 text-right">金額 (円)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#D1CEC7]">
                        {/* 前期繰越金 (動的表示) */}
                        <tr className="font-bold bg-[#F9F7F2]/80 text-[#1A1A1A]">
                          <td className="py-0.5 flex items-center space-x-1">
                            <span>前期繰越金</span>
                            <span className="text-[9px] text-[#666666] font-normal">(前年度決算より)</span>
                          </td>
                          <td className="py-0.5 text-right font-mono">
                            {formatCurrency(settlementData.carryoverIncome)}
                          </td>
                        </tr>

                        {incomeCategories.map((cat) => {
                          const amount = settlementData.incomeCategoryTotals[cat] || 0;
                          return (
                            <tr key={cat} className={amount > 0 ? 'font-bold text-[#1A1A1A]' : 'text-[#777777]'}>
                              <td className="py-0.5">{cat}</td>
                              <td className="py-0.5 text-right font-mono">
                                {formatCurrency(amount)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="border-t border-[#D1CEC7] text-[#555555] text-[11px] print:text-[9.5px]">
                          <td className="py-0.5">当期実質収入計</td>
                          <td className="py-0.5 text-right font-mono">
                            {formatCurrency(settlementData.operationalIncome)}
                          </td>
                        </tr>
                        <tr className="border-t-2 border-[#1A1A1A] font-bold text-xs print:text-[11px] bg-white text-[#1A1A1A]">
                          <td className="py-1">収入合計 (繰越含む)</td>
                          <td className="py-1 text-right font-mono">
                            {formatCurrency(settlementData.totalIncome)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  {/* 支出の部 */}
                  <div className="border border-[#1A1A1A] p-3 print:p-2 bg-white">
                    <div className="border-b-2 border-[#1A1A1A] pb-1.5 mb-2 flex justify-between items-center bg-[#F4F2EB] print:bg-white text-[#1A1A1A] p-1.5 -m-3 print:-m-2 mb-2">
                      <span className="font-bold text-xs print:text-[11px] tracking-wider">【 支出の部 】</span>
                      <span className="text-xs font-mono font-bold text-[#1A1A1A]">
                        {formatCurrency(settlementData.totalExpense)}
                      </span>
                    </div>
                    <table className="w-full text-xs print:text-[10px] text-left border-collapse">
                      <thead>
                        <tr className="border-b border-[#1A1A1A] text-[#1A1A1A] font-sans font-bold">
                          <th className="py-0.5">勘定科目</th>
                          <th className="py-0.5 text-right">金額 (円)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#D1CEC7]">
                        {expenseCategories.map((cat) => {
                          const amount = settlementData.expenseCategoryTotals[cat] || 0;
                          return (
                            <tr key={cat} className={amount > 0 ? 'font-bold text-[#1A1A1A]' : 'text-[#777777]'}>
                              <td className="py-0.5">{cat}</td>
                              <td className="py-0.5 text-right font-mono">
                                {formatCurrency(amount)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-[#1A1A1A] font-bold text-xs print:text-[11px] bg-white text-[#1A1A1A]">
                          <td className="py-1">支出計</td>
                          <td className="py-1 text-right font-mono">
                            {formatCurrency(settlementData.totalExpense)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>

                {/* 収支総括・差引残高計算表 */}
                <div className="border-2 border-[#1A1A1A] p-3 print:p-2 bg-white space-y-2 print:space-y-1">
                  <h4 className="font-bold text-xs print:text-[11px] border-b border-[#1A1A1A] pb-0.5 tracking-wider text-center text-[#1A1A1A]">
                    【 {selectedFYInfo.eraLabel} 収支決算総括・差引繰越表 】
                  </h4>
                  <div className="grid grid-cols-2 md:grid-cols-5 print:grid-cols-5 gap-2 text-xs print:text-[10px] font-sans">
                    <div className="border border-[#1A1A1A] p-1.5 print:p-1 bg-[#F9F7F2]">
                      <span className="text-[#555555] text-[10px] block">① 前期繰越金</span>
                      <span className="text-xs sm:text-sm font-mono font-bold text-[#1A1A1A]">
                        {formatCurrency(settlementData.carryoverIncome)}
                      </span>
                    </div>
                    <div className="border border-[#1A1A1A] p-1.5 print:p-1 bg-white">
                      <span className="text-[#555555] text-[10px] block">② 当期実質収入</span>
                      <span className="text-xs sm:text-sm font-mono font-bold text-[#1A1A1A]">
                        {formatCurrency(settlementData.operationalIncome)}
                      </span>
                    </div>
                    <div className="border border-[#1A1A1A] p-1.5 print:p-1 bg-white">
                      <span className="text-[#555555] text-[10px] block">③ 当期支出総額</span>
                      <span className="text-xs sm:text-sm font-mono font-bold text-[#1A1A1A]">
                        {formatCurrency(settlementData.totalExpense)}
                      </span>
                    </div>
                    <div className="border border-[#1A1A1A] p-1.5 print:p-1 bg-white">
                      <span className="text-[#555555] text-[10px] block">④ 当期差引 (②-③)</span>
                      <span className={`text-xs sm:text-sm font-mono font-bold ${settlementData.netPeriodBalance >= 0 ? 'text-[#1A1A1A]' : 'text-rose-700'}`}>
                        {formatCurrency(settlementData.netPeriodBalance)}
                      </span>
                    </div>
                    <div className="border-2 border-[#1A1A1A] p-1.5 print:p-1 bg-[#F9F7F2] text-[#1A1A1A] col-span-2 md:col-span-1 print:col-span-1">
                      <span className="text-[#555555] text-[10px] block font-bold">⑤ 次期繰越 (①+④)</span>
                      <span className="text-xs sm:text-sm font-mono font-bold text-[#1A1A1A]">
                        {formatCurrency(settlementData.nextCarryoverBalance)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Signature & Temple Seal Area */}
                <div className="pt-4 print:pt-2 border-t border-[#1A1A1A] grid grid-cols-2 gap-6 print:gap-4 text-xs print:text-[10px]">
                  <div className="space-y-1">
                    <p className="font-bold">【 寺院所在地 】</p>
                    <p>{templeInfo.mountainName} {templeInfo.name}</p>
                    <p>〒{templeInfo.postalCode} {templeInfo.address}</p>
                    <p>電話: {templeInfo.phone}</p>
                  </div>
                  <div className="border border-[#1A1A1A] p-3 print:p-2 space-y-2 print:space-y-1 bg-white">
                    <p className="text-center font-bold border-b border-[#1A1A1A] pb-0.5 text-[11px] print:text-[10px]">
                      上記通りの決算内容を監査・承認いたしました。
                    </p>
                    <div className="flex justify-between items-end pt-2 print:pt-1">
                      <div>
                        <p className="text-[10px] text-[#555555]">代表役員 (住職)</p>
                        <p className="font-bold text-xs">{templeInfo.chiefPriest} 印</p>
                      </div>
                      <div className="w-10 h-10 border border-dashed border-[#1A1A1A] flex items-center justify-center text-[9px] text-[#555555]">
                        朱印
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Document Body - 2. 会計出納帳・総勘定元帳 */}
            {reportType === 'ledger' && (
              <div className="space-y-4 print:space-y-2">
                <div className="text-right text-xs print:text-[10px] font-sans text-[#555555]">
                  該当件数: <span className="font-bold text-[#1A1A1A]">{fyTransactions.length}件</span>
                </div>

                {fyTransactions.length === 0 ? (
                  <div className="border border-dashed border-[#1A1A1A] p-8 text-center text-xs text-[#555555]">
                    指定の会計年度 ({selectedFYInfo.fullLabel}) に登録されている取引記録はありません。
                  </div>
                ) : (
                  <table className="w-full text-left text-xs print:text-[10px] border-collapse border border-[#1A1A1A]">
                    <thead className="bg-[#F4F2EB] print:bg-white text-[#1A1A1A] border-y-2 border-[#1A1A1A]">
                      <tr>
                        <th className="p-2 print:py-1 print:px-1.5 border-r border-[#1A1A1A] font-bold">年月日</th>
                        <th className="p-2 print:py-1 print:px-1.5 border-r border-[#1A1A1A] font-bold">勘定科目</th>
                        <th className="p-2 print:py-1 print:px-1.5 border-r border-[#1A1A1A] font-bold">摘要</th>
                        <th className="p-2 print:py-1 print:px-1.5 border-r border-[#1A1A1A] font-bold">決済方法</th>
                        <th className="p-2 print:py-1 print:px-1.5 border-r border-[#1A1A1A] font-bold text-right">収入金額</th>
                        <th className="p-2 print:py-1 print:px-1.5 border-r border-[#1A1A1A] font-bold text-right">支出金額</th>
                        <th className="p-2 print:py-1 print:px-1.5 text-right font-bold">差引残高</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#D1CEC7] font-sans">
                      {(() => {
                        const rows: React.ReactNode[] = [];
                        let runningBalance = settlementData.carryoverIncome;
                        const prevFYEra = getJapaneseEra(selectedFYYear - 1).replace('年', '');

                        // 1. 期首・前期繰越レコードを帳簿の最上行に仮想表示
                        rows.push(
                          <tr key="carryover-from-prev-fy" className="bg-[#F9F7F2] font-bold border-b border-[#1A1A1A]">
                            <td className="p-2 print:py-1 print:px-1.5 border-r border-[#D1CEC7] font-bold whitespace-nowrap">
                              {formatJapaneseEraDate(selectedFYInfo.startDateStr, false)}
                            </td>
                            <td className="p-2 print:py-1 print:px-1.5 border-r border-[#D1CEC7] font-serif font-bold text-[#1A1A1A]">
                              前期繰越
                            </td>
                            <td className="p-2 print:py-1 print:px-1.5 border-r border-[#D1CEC7] text-[#1A1A1A]">
                              【期首繰越】前年度（{prevFYEra}年度）決算より繰越
                            </td>
                            <td className="p-2 print:py-1 print:px-1.5 border-r border-[#D1CEC7] text-[#555555]">
                              期首残高
                            </td>
                            <td className="p-2 print:py-1 print:px-1.5 border-r border-[#D1CEC7] text-right font-mono font-bold text-[#1A1A1A]">
                              {settlementData.carryoverIncome >= 0 ? formatCurrency(settlementData.carryoverIncome) : '―'}
                            </td>
                            <td className="p-2 print:py-1 print:px-1.5 border-r border-[#D1CEC7] text-right font-mono font-bold text-[#1A1A1A]">
                              {settlementData.carryoverIncome < 0 ? formatCurrency(Math.abs(settlementData.carryoverIncome)) : '―'}
                            </td>
                            <td className="p-2 print:py-1 print:px-1.5 text-right font-mono font-bold text-[#1A1A1A] bg-[#EBE7DF]/50">
                              {formatCurrency(runningBalance)}
                            </td>
                          </tr>
                        );

                        // 2. 当該年度の実績取引レコード
                        fyTransactions.forEach((tx) => {
                          if (tx.type === '収入') {
                            runningBalance += tx.amount || 0;
                          } else {
                            runningBalance -= tx.amount || 0;
                          }
                          rows.push(
                            <tr key={tx.id} className="hover:bg-[#F9F7F2]">
                              <td className="p-2 print:py-1 print:px-1.5 border-r border-[#D1CEC7] font-bold whitespace-nowrap">
                                {formatJapaneseEraDate(tx.date, false)}
                              </td>
                              <td className="p-2 print:py-1 print:px-1.5 border-r border-[#D1CEC7] font-serif font-bold">
                                {tx.category}
                              </td>
                              <td className="p-2 print:py-1 print:px-1.5 border-r border-[#D1CEC7]">
                                {tx.householdHeadName || tx.notes || '—'}
                              </td>
                              <td className="p-2 print:py-1 print:px-1.5 border-r border-[#D1CEC7] text-[#444444]">
                                {tx.paymentMethod}
                              </td>
                              <td className="p-2 print:py-1 print:px-1.5 border-r border-[#D1CEC7] text-right font-mono font-bold text-[#1A1A1A]">
                                {tx.type === '収入' ? formatCurrency(tx.amount) : '―'}
                              </td>
                              <td className="p-2 print:py-1 print:px-1.5 border-r border-[#D1CEC7] text-right font-mono font-bold text-[#1A1A1A]">
                                {tx.type === '支出' ? formatCurrency(tx.amount) : '―'}
                              </td>
                              <td className="p-2 print:py-1 print:px-1.5 text-right font-mono font-bold text-[#1A1A1A]">
                                {formatCurrency(runningBalance)}
                              </td>
                            </tr>
                          );
                        });

                        // 3. 期末締・次期繰越レコードを帳簿の末尾に表示
                        const nextFYEra = getJapaneseEra(selectedFYYear + 1).replace('年', '');
                        rows.push(
                          <tr key="carryover-to-next-fy" className="bg-[#F9F7F2] font-bold border-t-2 border-[#1A1A1A]">
                            <td className="p-2 print:py-1 print:px-1.5 border-r border-[#D1CEC7] font-bold whitespace-nowrap">
                              {formatJapaneseEraDate(selectedFYInfo.endDateStr, false)}
                            </td>
                            <td className="p-2 print:py-1 print:px-1.5 border-r border-[#D1CEC7] font-serif font-bold text-[#1A1A1A]">
                              次期繰越
                            </td>
                            <td className="p-2 print:py-1 print:px-1.5 border-r border-[#D1CEC7] text-[#1A1A1A]">
                              【期末決算結び】次期（{nextFYEra}年度）への繰越金
                            </td>
                            <td className="p-2 print:py-1 print:px-1.5 border-r border-[#D1CEC7] text-[#555555]">
                              振替結び
                            </td>
                            <td className="p-2 print:py-1 print:px-1.5 border-r border-[#D1CEC7] text-right font-mono text-[#888888]">
                              ―
                            </td>
                            <td className="p-2 print:py-1 print:px-1.5 border-r border-[#D1CEC7] text-right font-mono text-[#888888]">
                              ―
                            </td>
                            <td className="p-2 print:py-1 print:px-1.5 text-right font-mono font-bold text-[#1A1A1A] bg-[#EBE7DF]/50">
                              {formatCurrency(settlementData.nextCarryoverBalance)}
                            </td>
                          </tr>
                        );

                        return rows;
                      })()}
                    </tbody>
                    <tfoot>
                      <tr className="bg-white border-t-2 border-b border-[#1A1A1A] font-bold text-[#1A1A1A]">
                        <td colSpan={4} className="p-2 print:py-1 print:px-1.5 border-r border-[#1A1A1A] text-right">
                          【年度実質収支差額】
                        </td>
                        <td className="p-2 print:py-1 print:px-1.5 border-r border-[#1A1A1A] text-right font-mono">
                          {formatCurrency(settlementData.totalIncome)}
                        </td>
                        <td className="p-2 print:py-1 print:px-1.5 border-r border-[#1A1A1A] text-right font-mono">
                          {formatCurrency(settlementData.totalExpense)}
                        </td>
                        <td className="p-2 print:py-1 print:px-1.5 text-right font-mono">
                          {formatCurrency(settlementData.nextCarryoverBalance)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer (Hidden during print) */}
        <div className="p-4 bg-[#F9F7F2] border-t border-[#D1CEC7] flex justify-between items-center text-xs font-sans no-print">
          <p className="text-[#666666]">
            ※印刷ボタンを押すと、ブラウザ標準の印刷機能が呼び出されます。(A4縦サイズ推奨)
          </p>
          <div className="flex space-x-2">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-white border border-[#D1CEC7] text-[#444444] font-bold hover:bg-[#EBE7DF]"
            >
              閉じる
            </button>
            <button
              onClick={handlePrint}
              className="px-4 py-2 bg-[#1A1A1A] text-[#D4AF37] font-bold hover:bg-[#333333] flex items-center space-x-1"
            >
              <Printer className="w-4 h-4" />
              <span>印刷画面へ</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
