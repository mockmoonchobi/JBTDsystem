import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
  CreditCard, 
  Plus, 
  Search, 
  Printer, 
  X,
  Trash2,
  Edit,
  Save,
  Calendar,
  FileText,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Database,
  RefreshCw,
  CheckCircle2,
  Layers
} from 'lucide-react';
import { Transaction, Household, TransactionCategory, TempleInfo, MasterOptions, BatchAccountingData } from '../types';
import { INITIAL_INCOME_CATEGORIES, INITIAL_EXPENSE_CATEGORIES, INITIAL_MASTER_OPTIONS } from '../data/initialData';
import { formatCurrency, formatJapaneseEraDate, normalizeDateInput, NormalizeDateOptions } from '../utils/memorialCalculator';
import { DeleteConfirmModal } from './DeleteConfirmModal';
import { AccountingFiscalReportModal } from './AccountingFiscalReportModal';
import { BatchAccountingModal } from './BatchAccountingModal';
import {
  getAvailableFiscalYears,
  getFiscalYearInfo,
  getFiscalYearOfDate,
  isDateInFiscalYear,
  isCarryoverTransaction,
  isAutoCarryoverTransaction,
  calculatePriorCarryoverBalance,
  stripAutoCarryoverTransactions,
  compareTransactionsChronological,
  getJapaneseEra,
} from '../utils/fiscalYearUtils';
import { ImportTargetType } from '../utils/externalImportUtils';

interface AccountingManagerProps {
  transactions: Transaction[];
  households: Household[];
  templeInfo: TempleInfo;
  masterOptions?: MasterOptions;
  batchAccountingData?: BatchAccountingData | null;
  onSaveBatchAccountingData?: (data: BatchAccountingData) => void;
  onAddTransaction: (transaction: Transaction) => void;
  onAddBatchTransactions?: (transactions: Transaction[]) => void;
  onUpdateTransaction?: (transaction: Transaction) => void;
  onDeleteTransaction: (id: string) => void;
  onOpenImportModal?: (target?: ImportTargetType) => void;
  onSyncTransactions?: (transactions: Transaction[]) => void;
}

export const AccountingManager: React.FC<AccountingManagerProps> = ({
  transactions,
  households,
  templeInfo,
  masterOptions,
  batchAccountingData,
  onSaveBatchAccountingData,
  onAddTransaction,
  onAddBatchTransactions,
  onUpdateTransaction,
  onDeleteTransaction,
  onOpenImportModal,
  onSyncTransactions,
}) => {
  const incomeCategories = masterOptions?.incomeCategories || [];
  const expenseCategories = masterOptions?.expenseCategories || [];

  const paymentMethodOptions = masterOptions?.paymentMethods || [];

  // Clean raw transactions (strip any legacy auto-generated carryover records)
  const cleanTransactions = useMemo(() => {
    return stripAutoCarryoverTransactions(transactions);
  }, [transactions]);

  // Clean up legacy auto-carryover records once if any exist in stored state
  useEffect(() => {
    const hasLegacyCarryover = transactions.some((tx) => isAutoCarryoverTransaction(tx));
    if (hasLegacyCarryover && onSyncTransactions) {
      onSyncTransactions(cleanTransactions);
    }
  }, [transactions, cleanTransactions, onSyncTransactions]);

  // Current fiscal year number (e.g. 2026)
  const currentFY = useMemo(() => {
    return getFiscalYearOfDate(new Date().toISOString().slice(0, 10), templeInfo);
  }, [templeInfo]);

  const availableFYs = useMemo(() => {
    return getAvailableFiscalYears(cleanTransactions, templeInfo);
  }, [cleanTransactions, templeInfo]);

  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | '収入' | '支出'>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');

  // Default to CURRENT FISCAL YEAR (現行の会計年度) for best performance & direct focus
  const [fiscalYearFilter, setFiscalYearFilter] = useState<string>(() => String(currentFY));

  const selectedFYNumber = useMemo(() => {
    if (fiscalYearFilter === 'ALL') return null;
    const n = Number(fiscalYearFilter);
    return isNaN(n) ? null : n;
  }, [fiscalYearFilter]);

  const [isReportModalOpen, setIsReportModalOpen] = useState<boolean>(false);
  const [isBatchModalOpen, setIsBatchModalOpen] = useState<boolean>(false);

  const [receiptModalTx, setReceiptModalTx] = useState<Transaction | null>(null);
  const [receiptPayerName, setReceiptPayerName] = useState<string>('');
  const [receiptHonorific, setReceiptHonorific] = useState<string>('様');
  const [receiptProviso, setReceiptProviso] = useState<string>('');

  // Calculate dynamic prior carryover for selected fiscal year from all previous transactions
  const priorCarryover = useMemo(() => {
    if (!selectedFYNumber) return null;
    return calculatePriorCarryoverBalance(cleanTransactions, selectedFYNumber, templeInfo);
  }, [cleanTransactions, selectedFYNumber, templeInfo]);

  // 世帯IDまたは取引情報から施主名（敬称なし）を取得
  const getPayerDisplayName = (tx: Transaction): string => {
    let name = '';
    if (tx.householdId) {
      const matched = households.find((h) => h.id === tx.householdId);
      if (matched && matched.familyHead) {
        name = matched.familyHead;
      }
    }
    if (!name && tx.householdHeadName) {
      name = tx.householdHeadName;
    }
    // 「様」「殿」「御中」等を除去
    const clean = name.replace(/\s*(様|殿|御中)$/, '').trim();
    if (isAutoCarryoverTransaction(tx) || clean.includes('繰越')) {
      return '';
    }
    return clean;
  };

  // 表示用の摘要文字列（施主と紐づけられている場合は「施主　〇〇」を前置）
  const getDisplayNotes = (tx: Transaction): string => {
    const payer = getPayerDisplayName(tx);
    const rawNotes = (tx.notes || '').trim();
    const cleanNote = payer && rawNotes.startsWith(payer) ? rawNotes.slice(payer.length).trim() : rawNotes;

    if (payer) {
      if (cleanNote) {
        return `施主　${payer} ${cleanNote}`;
      }
      return `施主　${payer}`;
    }
    return rawNotes || '—';
  };

  const handleOpenReceiptModal = (tx: Transaction) => {
    setReceiptModalTx(tx);
    
    // 氏名の初期値：檀家IDと紐づくならば、施主氏名を貼り付け、それ以外は摘要を貼り付け
    let payer = '';
    if (tx.householdId) {
      const matched = households.find((h) => h.id === tx.householdId);
      if (matched && matched.familyHead) {
        payer = matched.familyHead;
      }
    }
    if (!payer) {
      payer = tx.notes || tx.householdHeadName || '檀信徒';
    }

    let honorific = '様';
    if (payer.endsWith('御中')) {
      honorific = '御中';
      payer = payer.replace(/\s*御中$/, '');
    } else if (payer.endsWith('殿')) {
      honorific = '殿';
      payer = payer.replace(/\s*殿$/, '');
    } else if (payer.endsWith('様')) {
      honorific = '様';
      payer = payer.replace(/\s*様$/, '');
    }

    setReceiptPayerName(payer.trim());
    setReceiptHonorific(honorific);

    // 但し書きの初期値：摘要を貼り付け（空の場合は科目名を基にしたデフォルト）＋末尾に「として」
    let proviso = tx.notes ? tx.notes.trim() : `${tx.category} 御納入分`;
    if (proviso && !proviso.endsWith('として')) {
      proviso = `${proviso}として`;
    }
    setReceiptProviso(proviso);
  };

  // Delete Confirmation Modal State
  const [deleteTargetTx, setDeleteTargetTx] = useState<Transaction | null>(null);

  // Inline Row Editing State
  const [editingTxId, setEditingTxId] = useState<string | null>(null);
  const [inlineTxForm, setInlineTxForm] = useState<Partial<Transaction> | null>(null);

  // New inline transaction entry state (ALWAYS VISIBLE AT BOTTOM)
  const todayEraDate = formatJapaneseEraDate(new Date().toISOString().slice(0, 10), false);
  const [newTxForm, setNewTxForm] = useState<Partial<Transaction>>({
    date: todayEraDate,
    householdId: '',
    householdHeadName: '',
    category: incomeCategories[0] || '法要布施',
    type: '収入',
    amount: undefined,
    paymentMethod: '現金受付',
    receiptNumber: `R-${Date.now().toString().slice(-6)}`,
    notes: '',
  });

  // Date normalization options for accounting
  const accountingDateOptions = useMemo<NormalizeDateOptions>(() => ({
    mode: 'accounting',
    fiscalStartMonth: templeInfo?.fiscalYearStartMonth ?? 4,
    fiscalYear: fiscalYearFilter !== 'ALL' ? Number(fiscalYearFilter) : undefined,
  }), [templeInfo?.fiscalYearStartMonth, fiscalYearFilter]);

  const handleSaveNewTx = () => {
    if (!newTxForm.amount || newTxForm.amount <= 0) {
      alert('出納の金額を入力してください。');
      return;
    }

    const normalizedDate = normalizeDateInput(newTxForm.date || '', accountingDateOptions) || new Date().toISOString().slice(0, 10).replace(/-/g, '/');

    const matchedHousehold = newTxForm.householdId ? households.find((h) => h.id === newTxForm.householdId) : null;
    const resolvedTxTempleId = matchedHousehold?.templeId || templeInfo?.id || 'temple-main';

    const completeTx: Transaction = {
      id: `TX-${Date.now()}`,
      templeId: resolvedTxTempleId,
      date: normalizedDate,
      householdId: newTxForm.householdId || '',
      householdHeadName: newTxForm.householdHeadName || '',
      category: (newTxForm.category as TransactionCategory) || (incomeCategories[0] as any) || '法要布施',
      type: newTxForm.type || '収入',
      amount: Number(newTxForm.amount) || 0,
      paymentMethod: newTxForm.paymentMethod || '現金受付',
      receiptNumber: newTxForm.receiptNumber || `R-${Date.now().toString().slice(-6)}`,
      notes: newTxForm.notes || '',
    };

    onAddTransaction(completeTx);

    // Reset for next quick entry line
    setNewTxForm({
      date: formatJapaneseEraDate(new Date().toISOString().slice(0, 10), false),
      householdId: '',
      householdHeadName: '',
      category: incomeCategories[0] || '法要布施',
      type: '収入',
      amount: undefined,
      paymentMethod: '現金受付',
      receiptNumber: `R-${Date.now().toString().slice(-6)}`,
      notes: '',
    });
  };

  const handleStartInlineEdit = (tx: Transaction) => {
    setEditingTxId(tx.id);
    setInlineTxForm({
      ...tx,
      date: formatJapaneseEraDate(tx.date, false),
      notes: tx.notes !== undefined && tx.notes !== '' ? tx.notes : (tx.householdHeadName || ''),
    });
  };

  const handleSaveInlineEdit = () => {
    if (!inlineTxForm || !inlineTxForm.id) return;
    const normalizedDate = normalizeDateInput(inlineTxForm.date || '', accountingDateOptions) || '2026/08/09';

    const completeTx: Transaction = {
      id: inlineTxForm.id,
      date: normalizedDate,
      householdId: inlineTxForm.householdId,
      householdHeadName: inlineTxForm.householdHeadName || '',
      category: (inlineTxForm.category as TransactionCategory) || '法要布施',
      type: inlineTxForm.type || '収入',
      amount: Number(inlineTxForm.amount) || 0,
      paymentMethod: inlineTxForm.paymentMethod || '現金受付',
      receiptNumber: inlineTxForm.receiptNumber || `R-${Date.now()}`,
      notes: inlineTxForm.notes || '',
    };

    if (onUpdateTransaction) {
      onUpdateTransaction(completeTx);
    }
    setEditingTxId(null);
    setInlineTxForm(null);
  };

  const handleCancelInlineEdit = () => {
    setEditingTxId(null);
    setInlineTxForm(null);
  };

  const filteredTransactions = useMemo(() => {
    const searchLower = (searchTerm || '').trim().toLowerCase();
    return cleanTransactions.filter((t) => {
      if (!t) return false;
      const displayNotes = getDisplayNotes(t).toLowerCase();
      const payerName = getPayerDisplayName(t).toLowerCase();
      const matchesSearch =
        !searchLower ||
        displayNotes.includes(searchLower) ||
        payerName.includes(searchLower) ||
        (t.householdHeadName || '').toLowerCase().includes(searchLower) ||
        (t.receiptNumber || '').toLowerCase().includes(searchLower) ||
        (t.notes || '').toLowerCase().includes(searchLower) ||
        (t.category || '').toLowerCase().includes(searchLower) ||
        (t.paymentMethod || '').toLowerCase().includes(searchLower) ||
        (t.date && t.date.includes(searchLower));

      const matchesType = typeFilter === 'ALL' || t.type === typeFilter;
      const matchesCategory = categoryFilter === 'ALL' || t.category === categoryFilter;
      const matchesFY = fiscalYearFilter === 'ALL' || isDateInFiscalYear(t.date, Number(fiscalYearFilter), templeInfo);

      return matchesSearch && matchesType && matchesCategory && matchesFY;
    });
  }, [cleanTransactions, searchTerm, typeFilter, categoryFilter, fiscalYearFilter, templeInfo, households]);

  // Sort State (Default: Date Ascending / 年月日での昇順ソート)
  type AccountingSortKey = 'date' | 'category' | 'householdHeadName' | 'income' | 'expense';
  type SortOrder = 'asc' | 'desc';

  const [sortKey, setSortKey] = useState<AccountingSortKey>('date');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');

  const handleSort = (key: AccountingSortKey) => {
    if (sortKey === key) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortOrder('asc');
    }
  };

  // Sort transactions and dynamically calculate running balance from dynamic opening carryover
  const sortedTransactions = useMemo(() => {
    const allMasterCats = [...incomeCategories, ...expenseCategories];

    const sorted = [...filteredTransactions].sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'date') {
        const dateA = a.date || '';
        const dateB = b.date || '';
        cmp = dateA.localeCompare(dateB);
        if (cmp === 0) {
          return (a.receiptNumber || a.id || '').localeCompare(b.receiptNumber || b.id || '');
        }
      } else if (sortKey === 'category') {
        const idxA = allMasterCats.indexOf(a.category);
        const idxB = allMasterCats.indexOf(b.category);
        if (idxA !== -1 && idxB !== -1) {
          cmp = idxA - idxB;
        } else if (idxA !== -1) {
          cmp = -1;
        } else if (idxB !== -1) {
          cmp = 1;
        } else {
          cmp = (a.category || '').localeCompare(b.category || '', 'ja');
        }
      } else if (sortKey === 'householdHeadName') {
        const textA = getDisplayNotes(a);
        const textB = getDisplayNotes(b);
        cmp = textA.localeCompare(textB, 'ja');
      } else if (sortKey === 'income') {
        const valA = a.type === '収入' ? a.amount : 0;
        const valB = b.type === '収入' ? b.amount : 0;
        cmp = valA - valB;
      } else if (sortKey === 'expense') {
        const valA = a.type === '支出' ? a.amount : 0;
        const valB = b.type === '支出' ? b.amount : 0;
        cmp = valA - valB;
      }

      if (cmp === 0 && sortKey !== 'date') {
        cmp = compareTransactionsChronological(a, b);
      }

      return sortOrder === 'asc' ? cmp : -cmp;
    });

    // Opening balance starts with dynamic prior carryover if viewing a specific fiscal year
    let currentBalance = (selectedFYNumber && priorCarryover) ? priorCarryover.priorBalance : 0;
    return sorted.map((t) => {
      if (t.type === '収入') {
        currentBalance += t.amount;
      } else {
        currentBalance -= t.amount;
      }
      return {
        ...t,
        runningBalance: currentBalance,
      };
    });
  }, [filteredTransactions, sortKey, sortOrder, incomeCategories, expenseCategories, selectedFYNumber, priorCarryover]);

  const selectedFYInfo = useMemo(() => {
    if (!selectedFYNumber) return null;
    return getFiscalYearInfo(selectedFYNumber, templeInfo);
  }, [selectedFYNumber, templeInfo]);

  // Overall Financial Summary for the active filter view
  const financialSummary = useMemo(() => {
    let income = 0;
    let expense = 0;
    filteredTransactions.forEach((t) => {
      if (t.type === '収入') income += t.amount || 0;
      else if (t.type === '支出') expense += t.amount || 0;
    });

    const netPeriod = income - expense;
    const openingCarryover = (selectedFYNumber && priorCarryover) ? priorCarryover.priorBalance : 0;
    const closingBalance = openingCarryover + netPeriod;

    return {
      income,
      expense,
      netPeriod,
      openingCarryover,
      closingBalance,
    };
  }, [filteredTransactions, selectedFYNumber, priorCarryover]);

  // Scroll Container Ref for sticking header & auto-scrolling to bottom (new entry line)
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to the bottom on mount, data changes, or filter changes so the latest data & new entry row are immediately visible
  useEffect(() => {
    if (scrollContainerRef.current) {
      const el = scrollContainerRef.current;
      const timer = setTimeout(() => {
        el.scrollTop = el.scrollHeight;
      }, 60);
      return () => clearTimeout(timer);
    }
  }, [sortedTransactions.length, fiscalYearFilter, categoryFilter, typeFilter]);

  const handleConfirmDelete = () => {
    if (deleteTargetTx) {
      onDeleteTransaction(deleteTargetTx.id);
      setDeleteTargetTx(null);
      if (editingTxId === deleteTargetTx.id) {
        setEditingTxId(null);
        setInlineTxForm(null);
      }
    }
  };

  return (
    <div className="space-y-2">
      <div className="space-y-2 no-print">
        {/* Top Banner (Compact Height) */}
        <div className="bg-[#1A1A1A] border-b border-[#D4AF37] px-3 py-2.5 sm:px-4 sm:py-2.5 shadow-md flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2 font-serif text-[#F9F7F2]">
          <div>
            <div className="flex items-center flex-wrap gap-2.5">
              <div className="w-7 h-7 bg-[#D4AF37] text-[#1A1A1A] flex items-center justify-center font-bold font-sans text-xs shrink-0">
                会計
              </div>
              <h2 className="text-lg sm:text-xl font-bold text-[#F9F7F2] tracking-wider">会計管理システム</h2>
              <div className="flex items-center gap-1.5 flex-wrap">
                {templeInfo?.accountingMode === 'combined' ? (
                  <div className="px-2 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/50 text-[11px] font-sans font-bold flex items-center gap-1 shadow-xs whitespace-nowrap">
                    <span>全寺院合算（本寺集約処理）</span>
                  </div>
                ) : (
                  <div className="px-2 py-0.5 bg-[#2A2A2A] text-[#D4AF37] border border-[#D4AF37]/40 text-[11px] font-sans font-bold flex items-center gap-1 shadow-xs whitespace-nowrap">
                    <span>{templeInfo.name || '個別寺院'} 会計</span>
                  </div>
                )}
                <div className="px-2 py-0.5 bg-emerald-950/80 text-emerald-300 border border-emerald-500/60 text-[11px] font-sans font-bold flex items-center gap-1.5 shadow-xs whitespace-nowrap">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  <span>総レコード数：{cleanTransactions.length.toLocaleString('ja-JP')}件</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2 font-sans text-xs">
            <button
              onClick={() => setIsBatchModalOpen(true)}
              className="px-3 py-1.5 bg-[#2A2A2A] hover:bg-[#383838] text-[#F9F7F2] border border-[#D4AF37]/60 hover:border-[#D4AF37] font-bold uppercase tracking-wider transition-all flex items-center space-x-1.5 shadow-md cursor-pointer whitespace-nowrap text-xs"
              title="彼岸・施餓鬼・供養料などの一括受付と出納帳への一括登録"
            >
              <Layers className="w-3.5 h-3.5 text-[#D4AF37]" />
              <span>一括会計処理</span>
            </button>

            <button
              onClick={() => setIsReportModalOpen(true)}
              className="px-3 py-1.5 bg-[#D4AF37] hover:bg-[#c29f2f] text-[#1A1A1A] font-bold uppercase tracking-wider transition-colors flex items-center space-x-1.5 shadow-md cursor-pointer whitespace-nowrap text-xs"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>帳簿・決算書を印刷 (年度別)</span>
            </button>
          </div>
        </div>

        {/* Filter & Accounting Ledger Table */}
        <div className="bg-white border border-[#D1CEC7] shadow-sm overflow-hidden space-y-2 p-2.5 sm:p-3 font-serif">
          <div className="flex flex-col md:flex-row items-center justify-between gap-2 text-sm font-sans">
            <div className="relative flex-1 w-full">
              <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-[#888888]" />
              <input
                type="text"
                placeholder="摘要・領収番号・科目・備考で検索..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-[#F9F7F2] border border-[#D1CEC7] pl-8 pr-2.5 py-1.5 text-[#2D2D2D] text-sm focus:border-[#1A1A1A] focus:outline-none"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Fiscal Year Filter */}
              <select
                value={fiscalYearFilter}
                onChange={(e) => setFiscalYearFilter(e.target.value)}
                className="bg-[#F9F7F2] border border-[#D1CEC7] text-[#2D2D2D] px-3 py-1.5 focus:border-[#1A1A1A] focus:outline-none font-bold text-sm"
              >
                <option value="ALL">すべての会計年度 (全期間)</option>
                {availableFYs.map((fy) => (
                  <option key={fy.year} value={fy.year}>
                    {fy.fullLabel}
                  </option>
                ))}
              </select>

              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as any)}
                className="bg-[#F9F7F2] border border-[#D1CEC7] text-[#2D2D2D] px-3 py-1.5 focus:border-[#1A1A1A] focus:outline-none font-bold text-sm"
              >
                <option value="ALL">すべての収支</option>
                <option value="収入">収入のみ</option>
                <option value="支出">支出のみ</option>
              </select>

              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="bg-[#F9F7F2] border border-[#D1CEC7] text-[#2D2D2D] px-3 py-1.5 focus:border-[#1A1A1A] focus:outline-none font-bold text-sm"
              >
                <option value="ALL">すべての勘定科目</option>
                <optgroup label="【 収入の部 】">
                  {incomeCategories.map((cat) => (
                    <option key={`inc-${cat}`} value={cat}>
                      {cat}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="【 支出の部 】">
                  {expenseCategories.map((cat) => (
                    <option key={`exp-${cat}`} value={cat}>
                      {cat}
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>
          </div>

          {/* Traditional Ledger Table - Optimized with clear, larger readable font */}
          <div ref={scrollContainerRef} className="max-h-[calc(100vh-360px)] min-h-[300px] overflow-y-auto overflow-x-auto relative border border-[#D1CEC7] bg-white shadow-xs">
            <table className="w-full text-left text-sm text-[#2D2D2D] border-collapse table-auto">
              <thead className="sticky top-0 z-10 bg-[#1A1A1A] text-[#D4AF37] font-serif border-b border-[#D4AF37] select-none shadow-sm text-sm">
                <tr>
                  <th
                    onClick={() => handleSort('date')}
                    className="sticky top-0 bg-[#1A1A1A] px-3 py-2.5 font-bold whitespace-nowrap cursor-pointer hover:bg-[#2A2A2A] transition-colors w-[125px]"
                  >
                    年月日
                    {sortKey === 'date' ? (
                      sortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-[#D4AF37] inline ml-1" /> : <ArrowDown className="w-3.5 h-3.5 text-[#D4AF37] inline ml-1" />
                    ) : (
                      <ArrowUpDown className="w-3.5 h-3.5 text-[#777777] inline ml-1" />
                    )}
                  </th>
                  <th
                    onClick={() => handleSort('category')}
                    className="sticky top-0 bg-[#1A1A1A] px-2.5 py-2.5 font-bold whitespace-nowrap cursor-pointer hover:bg-[#2A2A2A] transition-colors min-w-[155px]"
                  >
                    勘定科目
                    {sortKey === 'category' ? (
                      sortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-[#D4AF37] inline ml-1" /> : <ArrowDown className="w-3.5 h-3.5 text-[#D4AF37] inline ml-1" />
                    ) : (
                      <ArrowUpDown className="w-3.5 h-3.5 text-[#777777] inline ml-1" />
                    )}
                  </th>
                  <th
                    onClick={() => handleSort('householdHeadName')}
                    className="sticky top-0 bg-[#1A1A1A] px-3 py-2.5 font-bold whitespace-nowrap cursor-pointer hover:bg-[#2A2A2A] transition-colors max-w-[240px]"
                  >
                    摘要
                    {sortKey === 'householdHeadName' ? (
                      sortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-[#D4AF37] inline ml-1" /> : <ArrowDown className="w-3.5 h-3.5 text-[#D4AF37] inline ml-1" />
                    ) : (
                      <ArrowUpDown className="w-3.5 h-3.5 text-[#777777] inline ml-1" />
                    )}
                  </th>
                  <th
                    onClick={() => handleSort('income')}
                    className="sticky top-0 bg-[#1A1A1A] px-3 py-2.5 font-bold text-right whitespace-nowrap cursor-pointer hover:bg-[#2A2A2A] transition-colors w-[120px]"
                  >
                    収入金額
                    {sortKey === 'income' ? (
                      sortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-[#D4AF37] inline ml-1" /> : <ArrowDown className="w-3.5 h-3.5 text-[#D4AF37] inline ml-1" />
                    ) : (
                      <ArrowUpDown className="w-3.5 h-3.5 text-[#777777] inline ml-1" />
                    )}
                  </th>
                  <th
                    onClick={() => handleSort('expense')}
                    className="sticky top-0 bg-[#1A1A1A] px-3 py-2.5 font-bold text-right whitespace-nowrap cursor-pointer hover:bg-[#2A2A2A] transition-colors w-[120px]"
                  >
                    支出金額
                    {sortKey === 'expense' ? (
                      sortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-[#D4AF37] inline ml-1" /> : <ArrowDown className="w-3.5 h-3.5 text-[#D4AF37] inline ml-1" />
                    ) : (
                      <ArrowUpDown className="w-3.5 h-3.5 text-[#777777] inline ml-1" />
                    )}
                  </th>
                  <th className="sticky top-0 bg-[#1A1A1A] px-3 py-2.5 font-bold text-right whitespace-nowrap w-[130px]">
                    残高
                  </th>
                  <th className="sticky top-0 bg-[#1A1A1A] px-2.5 py-2.5 font-bold text-right whitespace-nowrap w-[95px]">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0EFEA]">
                {/* Virtual Opening Carryover Row (for specific fiscal year view) */}
                {selectedFYInfo && priorCarryover && (typeFilter === 'ALL' || typeFilter === '収入') && !searchTerm && (
                  <tr className="bg-[#FAF8F5] border-b border-[#E5E2DA] font-serif text-[#1A1A1A]">
                    <td className="px-3 py-2 font-bold whitespace-nowrap text-[#555555]">
                      {formatJapaneseEraDate(selectedFYInfo.startDateStr, false)}
                    </td>
                    <td className="px-2.5 py-2 font-sans whitespace-nowrap">
                      <span className="px-2 py-0.5 bg-[#EBE7DF] border border-[#D1CEC7] text-[#1A1A1A] font-serif text-xs font-bold inline-block whitespace-nowrap">
                        前期繰越
                      </span>
                    </td>
                    <td className="px-3 py-2 text-[#444444] font-sans max-w-[240px]">
                      <div className="font-bold text-[#1A1A1A] flex items-center space-x-1.5 truncate">
                        <span className="px-1.5 py-0.5 text-[10px] bg-[#EBE7DF] text-[#1A1A1A] border border-[#D1CEC7] font-bold font-sans shrink-0">
                          前年度決算
                        </span>
                        <span className="truncate text-sm">前年度期末残高の繰越</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right font-serif font-bold text-sm text-emerald-800 whitespace-nowrap">
                      {formatCurrency(priorCarryover.priorBalance)}
                    </td>
                    <td className="px-3 py-2 text-right font-serif font-bold text-sm text-[#888888] whitespace-nowrap">
                      —
                    </td>
                    <td className="px-3 py-2 text-right font-serif font-bold text-sm text-[#1A1A1A] whitespace-nowrap">
                      {formatCurrency(priorCarryover.priorBalance)}
                    </td>
                    <td className="px-2.5 py-2 text-right font-sans text-xs text-[#777777] whitespace-nowrap">
                      (基準繰越)
                    </td>
                  </tr>
                )}
                {sortedTransactions.map((t, tIdx) => {
                  const isEditingThisTx = editingTxId === t.id && inlineTxForm;

                  if (isEditingThisTx && inlineTxForm) {
                    return (
                      <tr key={`tx-row-${t.id || tIdx}-${tIdx}`} className="bg-[#FFFDF0] font-sans">
                        {/* 年月日 (編集時) */}
                        <td className="px-2 py-1.5">
                          <input
                            type="text"
                            value={inlineTxForm.date || ''}
                            onChange={(e) => setInlineTxForm({ ...inlineTxForm, date: e.target.value })}
                            onFocus={(e) => e.target.select()}
                            onBlur={(e) => {
                              const normalized = normalizeDateInput(e.target.value, accountingDateOptions);
                              if (normalized) {
                                setInlineTxForm({ ...inlineTxForm, date: formatJapaneseEraDate(normalized, false) });
                              }
                            }}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleSaveInlineEdit(); }}
                            placeholder="例: 20260607"
                            className="w-full bg-white border border-[#1A1A1A] px-1.5 py-1 font-mono text-sm font-bold"
                          />
                        </td>
                        {/* 勘定科目 (編集時) */}
                        <td className="px-2 py-1.5">
                          <select
                            value={`${inlineTxForm.type || '収入'}:${inlineTxForm.category || incomeCategories[0] || '法要布施'}`}
                            onChange={(e) => {
                              const [newType, newCat] = e.target.value.split(':') as ['収入' | '支出', string];
                              setInlineTxForm({
                                ...inlineTxForm,
                                type: newType,
                                category: newCat,
                              });
                            }}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleSaveInlineEdit(); }}
                            className="w-full bg-white border border-[#1A1A1A] px-1.5 py-1 text-sm font-bold whitespace-nowrap"
                          >
                            <optgroup label="【 収入の部 】">
                              {incomeCategories.map((cat) => (
                                <option key={`収入:${cat}`} value={`収入:${cat}`}>
                                  {cat}
                                </option>
                              ))}
                            </optgroup>
                            <optgroup label="【 支出の部 】">
                              {expenseCategories.map((cat) => (
                                <option key={`支出:${cat}`} value={`支出:${cat}`}>
                                  {cat}
                                </option>
                              ))}
                            </optgroup>
                          </select>
                        </td>
                        {/* 決済方法 / 摘要 (編集時) */}
                        <td className="px-2 py-1.5 max-w-[240px]">
                          <div className="flex items-center space-x-1.5">
                            <select
                              value={inlineTxForm.paymentMethod || paymentMethodOptions[0] || '現金受付'}
                              onChange={(e) => setInlineTxForm({ ...inlineTxForm, paymentMethod: e.target.value as any })}
                              onKeyDown={(e) => { if (e.key === 'Enter') handleSaveInlineEdit(); }}
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
                              value={inlineTxForm.notes || ''}
                              onChange={(e) => setInlineTxForm({ ...inlineTxForm, notes: e.target.value })}
                              onKeyDown={(e) => { if (e.key === 'Enter') handleSaveInlineEdit(); }}
                              placeholder="備考・摘要"
                              className="flex-1 bg-white border border-[#1A1A1A] px-1.5 py-1 text-sm font-bold min-w-0"
                            />
                          </div>
                        </td>
                        {/* 収入金額 (編集時) */}
                        <td className="px-2 py-1.5">
                          <input
                            type="number"
                            disabled={inlineTxForm.type !== '収入'}
                            value={inlineTxForm.type === '収入' ? (inlineTxForm.amount || '') : ''}
                            onChange={(e) => setInlineTxForm({ ...inlineTxForm, amount: Number(e.target.value) })}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleSaveInlineEdit(); }}
                            placeholder={inlineTxForm.type === '収入' ? '金額' : '―'}
                            className={`w-full px-1.5 py-1 text-sm font-mono font-bold text-right border ${
                              inlineTxForm.type === '収入'
                                ? 'bg-emerald-50 border-emerald-600 text-emerald-900'
                                : 'bg-gray-100 border-gray-300 text-gray-400 cursor-not-allowed'
                            }`}
                          />
                        </td>
                        {/* 支出金額 (編集時) */}
                        <td className="px-2 py-1.5">
                          <input
                            type="number"
                            disabled={inlineTxForm.type !== '支出'}
                            value={inlineTxForm.type === '支出' ? (inlineTxForm.amount || '') : ''}
                            onChange={(e) => setInlineTxForm({ ...inlineTxForm, amount: Number(e.target.value) })}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleSaveInlineEdit(); }}
                            placeholder={inlineTxForm.type === '支出' ? '金額' : '―'}
                            className={`w-full px-1.5 py-1 text-sm font-mono font-bold text-right border ${
                              inlineTxForm.type === '支出'
                                ? 'bg-rose-50 border-rose-600 text-rose-900'
                                : 'bg-gray-100 border-gray-300 text-gray-400 cursor-not-allowed'
                            }`}
                          />
                        </td>
                        {/* 残高 (編集時) */}
                        <td className="px-3 py-1.5 text-right font-mono text-sm text-[#888888]">
                          {formatCurrency(t.runningBalance)}
                        </td>
                        {/* 操作 (編集時) */}
                        <td className="px-2 py-1.5 text-right space-x-1 whitespace-nowrap">
                          <button
                            onClick={handleSaveInlineEdit}
                            className="px-2.5 py-1 bg-[#D4AF37] hover:bg-[#c29f2f] text-[#1A1A1A] font-bold text-xs inline-flex items-center space-x-0.5 shadow-sm cursor-pointer"
                          >
                            <Save className="w-3.5 h-3.5" />
                            <span>保存</span>
                          </button>
                          <button
                            onClick={handleCancelInlineEdit}
                            className="px-2 py-1 bg-white border border-[#D1CEC7] text-[#1A1A1A] font-bold text-xs hover:bg-[#EBE7DF] cursor-pointer"
                          >
                            <span>取消</span>
                          </button>
                          <button
                            onClick={() => setDeleteTargetTx(t)}
                            className="px-2 py-1 bg-rose-50 border border-rose-300 text-rose-800 font-bold text-xs hover:bg-rose-100 cursor-pointer"
                          >
                            削除
                          </button>
                        </td>
                      </tr>
                    );
                  }

                  return (
                    <tr
                      key={`tx-row-${t.id || tIdx}-${tIdx}`}
                      onDoubleClick={() => handleStartInlineEdit(t)}
                      className="hover:bg-[#F9F7F2] transition-colors cursor-pointer border-b border-[#F0EFEA]"
                      title="ダブルクリックで行のまま直接編集"
                    >
                      {/* 1. 年月日 (元号表記 - コンパクト) */}
                      <td className="px-3 py-2 font-bold text-[#1A1A1A] whitespace-nowrap text-sm">
                        {formatJapaneseEraDate(t.date, false)}
                      </td>

                      {/* 2. 勘定科目 (区分バッジ付き - 1行で折り返さず表示) */}
                      <td className="px-2.5 py-2 font-sans whitespace-nowrap">
                        <div className="flex items-center space-x-1.5 whitespace-nowrap">
                          <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded shrink-0 whitespace-nowrap ${
                            t.type === '収入'
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                              : 'bg-rose-100 text-rose-800 border border-rose-300'
                          }`}>
                            {t.type === '収入' ? '収入' : '支出'}
                          </span>
                          <span className="px-2 py-0.5 bg-[#F9F7F2] border border-[#D1CEC7] text-[#1A1A1A] font-serif text-sm font-bold inline-block whitespace-nowrap">
                            {t.category}
                          </span>
                        </div>
                      </td>

                      {/* 3. 摘要・決済方法 (施主と紐づけされている場合は「施主　〇〇」を小さく薄い文字で表示) */}
                      <td className="px-3 py-2 text-[#444444] font-sans max-w-[280px]">
                        {(() => {
                          const payer = getPayerDisplayName(t);
                          const rawNotes = (t.notes || '').trim();
                          const cleanNote = payer && rawNotes.startsWith(payer) ? rawNotes.slice(payer.length).trim() : rawNotes;

                          return (
                            <div className="flex items-center space-x-1.5 truncate" title={getDisplayNotes(t)}>
                              {isAutoCarryoverTransaction(t) && (
                                <span className="px-1.5 py-0.5 text-[10px] bg-amber-100 text-amber-900 border border-amber-300 font-bold font-sans whitespace-nowrap shrink-0">
                                  期初繰越
                                </span>
                              )}
                              {payer && (
                                <span className="text-xs text-[#736B5E] font-normal shrink-0">
                                  施主　{payer}
                                </span>
                              )}
                              <span className="font-bold text-[#1A1A1A] text-sm truncate">
                                {cleanNote || (!payer ? '—' : '')}
                              </span>
                              <span className="text-xs text-[#888888] bg-[#F2EFE9] px-1.5 py-0.5 rounded shrink-0 whitespace-nowrap">
                                {t.paymentMethod}
                              </span>
                              {t.receiptNumber && (
                                <span className="text-[11px] text-[#999999] shrink-0 font-mono">No.{t.receiptNumber}</span>
                              )}
                            </div>
                          );
                        })()}
                      </td>

                      {/* 4. 収入金額 */}
                      <td className="px-3 py-2 text-right font-serif font-bold text-sm text-emerald-800 whitespace-nowrap">
                        {t.type === '収入' ? formatCurrency(t.amount) : '—'}
                      </td>

                      {/* 5. 支出金額 */}
                      <td className="px-3 py-2 text-right font-serif font-bold text-sm text-rose-800 whitespace-nowrap">
                        {t.type === '支出' ? formatCurrency(t.amount) : '—'}
                      </td>

                      {/* 6. 残高 */}
                      <td className="px-3 py-2 text-right font-serif font-bold text-sm text-[#1A1A1A] whitespace-nowrap bg-[#FAF9F5]">
                        {formatCurrency(t.runningBalance)}
                      </td>

                      {/* 7. 操作 */}
                      <td className="px-2.5 py-2 text-right font-sans space-x-1 whitespace-nowrap">
                        {t.type === '収入' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenReceiptModal(t);
                            }}
                            className="px-2 py-0.5 bg-[#1A1A1A] hover:bg-[#333333] text-[#D4AF37] border border-[#D4AF37] text-xs font-bold uppercase tracking-wider transition-colors mr-0.5 cursor-pointer"
                          >
                            領収
                          </button>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStartInlineEdit(t);
                          }}
                          className="p-1 text-[#444444] hover:text-[#1A1A1A] hover:bg-[#F0EFEA] rounded cursor-pointer inline-block"
                          title="行内編集"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteTargetTx(t);
                          }}
                          className="p-1 text-rose-700 hover:bg-rose-50 rounded cursor-pointer inline-block"
                          title="削除"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {/* 期末締め・次期繰越 (会計年度選択時の末尾行) */}
                {fiscalYearFilter !== 'ALL' && selectedFYInfo && (
                  <tr className="bg-[#FAF9F5] border-t-2 border-b border-[#1A1A1A] font-serif">
                    {/* 1. 年月日 */}
                    <td className="px-3 py-2 font-bold font-sans text-sm text-[#1A1A1A] whitespace-nowrap">
                      {formatJapaneseEraDate(selectedFYInfo.endDateStr, false)}
                    </td>

                    {/* 2. 勘定科目 */}
                    <td className="px-2.5 py-2 font-bold text-sm whitespace-nowrap">
                      <div className="flex items-center space-x-1.5 whitespace-nowrap">
                        <span className="px-1.5 py-0.5 text-[10px] bg-[#EBE7DF] text-[#1A1A1A] border border-[#D1CEC7] font-bold font-sans whitespace-nowrap">
                          期末締
                        </span>
                        <span className="font-bold text-[#1A1A1A] text-sm">次期繰越</span>
                      </div>
                    </td>

                    {/* 3. 摘要 */}
                    <td className="px-3 py-2 text-sm text-[#555555] font-sans max-w-[240px]">
                      <div className="font-bold text-[#1A1A1A] truncate text-sm">
                        次期（{getJapaneseEra(Number(fiscalYearFilter) + 1).replace('年', '')}年度）への繰越金
                      </div>
                    </td>

                    {/* 4. 収入金額 */}
                    <td className="px-3 py-2 text-right font-mono font-bold text-sm text-[#888888]">
                      ―
                    </td>

                    {/* 5. 支出金額 */}
                    <td className="px-3 py-2 text-right font-mono font-bold text-sm text-[#888888]">
                      ―
                    </td>

                    {/* 6. 残高 */}
                    <td className="px-3 py-2 text-right font-serif font-bold text-sm text-[#1A1A1A] whitespace-nowrap bg-[#F4F2EB]">
                      {formatCurrency(financialSummary.closingBalance)}
                    </td>

                    {/* 7. 操作 */}
                    <td className="px-2.5 py-2 text-right font-sans text-xs text-[#888888] whitespace-nowrap">
                      <span className="inline-flex items-center px-2 py-0.5 bg-[#EBE7DF] text-[#666666] text-[10px] font-bold">
                        決算結び
                      </span>
                    </td>
                  </tr>
                )}

                {/* ALWAYS-VISIBLE NEW TRANSACTION ENTRY ROW AT BOTTOM OF TABLE (Compact) */}
                <tr className="bg-[#FFFDF0] border-2 border-[#D4AF37] font-sans">
                  {/* 年月日 */}
                  <td className="px-2 py-1.5">
                    <input
                      type="text"
                      value={newTxForm.date || ''}
                      onChange={(e) => setNewTxForm({ ...newTxForm, date: e.target.value })}
                      onFocus={(e) => e.target.select()}
                      onBlur={(e) => {
                        const normalized = normalizeDateInput(e.target.value, accountingDateOptions);
                        if (normalized) {
                          setNewTxForm({ ...newTxForm, date: formatJapaneseEraDate(normalized, false) });
                        }
                      }}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleSaveNewTx(); }}
                      placeholder="例: 20260607"
                      className="w-full bg-white border border-[#1A1A1A] px-1.5 py-1 font-mono text-sm font-bold"
                    />
                  </td>
                  {/* 勘定科目 (グループ化・1行表示) */}
                  <td className="px-2 py-1.5">
                    <select
                      value={`${newTxForm.type || '収入'}:${newTxForm.category || incomeCategories[0] || '法要布施'}`}
                      onChange={(e) => {
                        const [newType, newCat] = e.target.value.split(':') as ['収入' | '支出', string];
                        setNewTxForm({
                          ...newTxForm,
                          type: newType,
                          category: newCat,
                        });
                      }}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleSaveNewTx(); }}
                      className="w-full bg-white border border-[#1A1A1A] px-1.5 py-1 text-sm font-bold whitespace-nowrap"
                    >
                      <optgroup label="【 収入の部 】">
                        {incomeCategories.map((cat) => (
                          <option key={`収入:${cat}`} value={`収入:${cat}`}>
                            {cat}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="【 支出の部 】">
                        {expenseCategories.map((cat) => (
                          <option key={`支出:${cat}`} value={`支出:${cat}`}>
                            {cat}
                          </option>
                        ))}
                      </optgroup>
                    </select>
                  </td>
                  {/* 決済方法 / 摘要 (1行入力スタイル) */}
                  <td className="px-2 py-1.5 max-w-[240px]">
                    <div className="flex items-center space-x-1.5">
                      <select
                        value={newTxForm.paymentMethod || paymentMethodOptions[0] || '現金受付'}
                        onChange={(e) => setNewTxForm({ ...newTxForm, paymentMethod: e.target.value as any })}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleSaveNewTx(); }}
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
                        value={newTxForm.notes || ''}
                        onChange={(e) => setNewTxForm({ ...newTxForm, notes: e.target.value })}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleSaveNewTx(); }}
                        placeholder="備考・摘要"
                        className="flex-1 bg-white border border-[#1A1A1A] px-1.5 py-1 text-sm font-bold min-w-0"
                      />
                    </div>
                  </td>
                  {/* 収入金額 */}
                  <td className="px-2 py-1.5">
                    <input
                      type="number"
                      disabled={newTxForm.type !== '収入'}
                      value={newTxForm.type === '収入' ? (newTxForm.amount ?? '') : ''}
                      onChange={(e) => setNewTxForm({ ...newTxForm, amount: e.target.value ? Number(e.target.value) : undefined })}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleSaveNewTx(); }}
                      placeholder={newTxForm.type === '収入' ? '金額入力' : '―'}
                      className={`w-full px-1.5 py-1 text-sm font-mono font-bold text-right border ${
                        newTxForm.type === '収入'
                          ? 'bg-emerald-50 border-emerald-600 text-emerald-900 font-bold'
                          : 'bg-gray-100 border-gray-300 text-gray-400 cursor-not-allowed'
                      }`}
                    />
                  </td>
                  {/* 支出金額 */}
                  <td className="px-2 py-1.5">
                    <input
                      type="number"
                      disabled={newTxForm.type !== '支出'}
                      value={newTxForm.type === '支出' ? (newTxForm.amount ?? '') : ''}
                      onChange={(e) => setNewTxForm({ ...newTxForm, amount: e.target.value ? Number(e.target.value) : undefined })}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleSaveNewTx(); }}
                      placeholder={newTxForm.type === '支出' ? '金額入力' : '―'}
                      className={`w-full px-1.5 py-1 text-sm font-mono font-bold text-right border ${
                        newTxForm.type === '支出'
                          ? 'bg-rose-50 border-rose-600 text-rose-900 font-bold'
                          : 'bg-gray-100 border-gray-300 text-gray-400 cursor-not-allowed'
                      }`}
                    />
                  </td>
                  {/* 残高 */}
                  <td className="px-3 py-1.5 text-right font-mono text-[#888888] text-xs font-bold">
                    (新規記帳)
                  </td>
                  {/* 登録ボタン */}
                  <td className="px-2 py-1.5 text-right whitespace-nowrap">
                    <button
                      onClick={handleSaveNewTx}
                      className="px-3 py-1 bg-[#D4AF37] hover:bg-[#c29f2f] text-[#1A1A1A] font-bold text-xs inline-flex items-center space-x-1 shadow-sm cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      <span>登録</span>
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Receipt Modal */}
      {receiptModalTx && (
        <div className="fixed inset-0 z-50 bg-[#1A1A1A]/80 backdrop-blur-xs flex items-center justify-center p-4 font-serif print:p-0 print:bg-white">
          <div className="bg-white border border-[#D1CEC7] p-6 max-w-lg w-full text-[#2D2D2D] space-y-4 shadow-2xl print:border-none print:shadow-none print:max-w-none print:w-full print:p-0">
            <div className="flex justify-between items-center border-b border-[#D1CEC7] pb-2 no-print">
              <h3 className="text-base font-bold text-[#1A1A1A]">御布施・納入 領収書</h3>
              <button onClick={() => setReceiptModalTx(null)} className="text-[#888888] hover:text-[#1A1A1A]">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-white text-[#1A1A1A] p-6 font-serif border-2 border-[#1A1A1A] space-y-4 print-ink-saver">
              <div className="text-center border-b border-[#D1CEC7] pb-3">
                <h4 className="text-2xl font-bold tracking-[0.3em] text-[#1A1A1A]">領 収 証</h4>
                <div className="text-[10pt] text-[#666666] font-mono mt-1">No. {receiptModalTx.receiptNumber}</div>
              </div>

              {/* 氏名欄 (自動入力・直接変更可能) */}
              <div className="space-y-1 font-sans">
                <label className="text-xs font-bold text-[#666666] block no-print">宛名・氏名（書き換え可能）</label>
                <div className="flex items-baseline space-x-1 border-b-2 border-[#D4AF37] print:border-b print:border-black pb-0.5">
                  <input
                    type="text"
                    value={receiptPayerName}
                    onChange={(e) => setReceiptPayerName(e.target.value)}
                    className="text-xl font-bold text-[#1A1A1A] font-serif bg-transparent px-1 py-0.5 flex-1 focus:outline-none"
                    placeholder="氏名・宛名 (例: 山田 太郎)"
                  />
                  <select
                    value={receiptHonorific}
                    onChange={(e) => setReceiptHonorific(e.target.value)}
                    className="text-xl font-bold text-[#1A1A1A] font-serif bg-transparent focus:outline-none cursor-pointer no-print px-1 py-0.5"
                  >
                    <option value="様">様</option>
                    <option value="殿">殿</option>
                    <option value="御中">御中</option>
                    <option value="なし">（なし）</option>
                  </select>
                  <span className="text-xl font-bold text-[#1A1A1A] font-serif px-1 whitespace-nowrap hidden print:inline">
                    {receiptHonorific === 'なし' ? '' : receiptHonorific}
                  </span>
                </div>
              </div>

              <div className="bg-white p-3.5 border border-[#D1CEC7] print:border-black text-center">
                <span className="text-xs text-[#666666] font-serif block mb-1 no-print">受領金額</span>
                <div className="text-2xl sm:text-3xl font-bold text-[#1A1A1A] font-serif tracking-wider">
                  一金、{receiptModalTx.amount.toLocaleString('ja-JP')}円也
                </div>
              </div>

              {/* 但し書き (自動入力・直接変更可能) */}
              <div className="text-sm space-y-2 text-[#444444] font-sans">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-[#666666] block no-print">但し書き（書き換え可能）</label>
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-[#1A1A1A] whitespace-nowrap font-serif text-base">但し:</span>
                    <input
                      type="text"
                      value={receiptProviso}
                      onChange={(e) => setReceiptProviso(e.target.value)}
                      className="text-base font-bold text-[#1A1A1A] font-serif bg-white border-b border-[#D1CEC7] print:border-black px-2 py-1 w-full focus:outline-none"
                      placeholder="但し書き (例: 年回法要布施 御納入分として)"
                    />
                  </div>
                </div>
                <div className="flex justify-between pt-1.5 text-xs text-[#666666]">
                  <span>受納日: {receiptModalTx.date}</span>
                  <span>受領方法: {receiptModalTx.paymentMethod}</span>
                </div>
              </div>

              <div className="text-right border-t border-[#D1CEC7] print:border-black pt-3 text-xs leading-tight">
                <div className="font-bold text-[#1A1A1A]">{templeInfo.mountainName} {templeInfo.name}</div>
                <div>住職 {templeInfo.chiefPriest}</div>
                <div className="text-[9pt] text-[#666666]">〒{templeInfo.postalCode} {templeInfo.address}</div>
              </div>
            </div>

            <div className="flex justify-end space-x-2 font-sans no-print">
              <button
                onClick={() => setReceiptModalTx(null)}
                className="px-4 py-2 bg-[#F9F7F2] border border-[#D1CEC7] text-[#444444] font-bold text-xs hover:bg-[#EBE7DF]"
              >
                閉じる
              </button>
              <button
                onClick={() => {
                  try {
                    window.focus();
                    window.print();
                  } catch (e) {
                    alert("キーボードの [Ctrl + P] または [Cmd + P] を押して印刷してください。");
                  }
                }}
                className="px-4 py-2 bg-[#1A1A1A] hover:bg-[#333333] text-[#D4AF37] font-bold text-xs uppercase tracking-wider flex items-center space-x-1 cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5 text-[#D4AF37]" />
                <span>領収書を印刷</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Batch Accounting Modal (彼岸・施餓鬼・供養料等の高速一括受付) */}
      <BatchAccountingModal
        isOpen={isBatchModalOpen}
        onClose={() => setIsBatchModalOpen(false)}
        households={households}
        templeInfo={templeInfo}
        masterOptions={masterOptions}
        initialBatchData={batchAccountingData || undefined}
        onSaveBatchData={onSaveBatchAccountingData}
        onAddBatchTransactions={(newTxList) => {
          if (onAddBatchTransactions) {
            onAddBatchTransactions(newTxList);
          } else if (onSyncTransactions) {
            onSyncTransactions([...newTxList, ...cleanTransactions]);
          } else {
            newTxList.forEach((t) => onAddTransaction(t));
          }
        }}
      />

      {/* Fiscal Report Modal */}
      <AccountingFiscalReportModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        transactions={transactions}
        templeInfo={templeInfo}
        masterOptions={masterOptions || INITIAL_MASTER_OPTIONS}
      />

      {/* Delete Confirmation Modal */}
      <DeleteConfirmModal
        isOpen={!!deleteTargetTx}
        title="会計データの削除"
        message="削除しますか？"
        itemName={deleteTargetTx ? `${deleteTargetTx.category} (${formatCurrency(deleteTargetTx.amount)})` : undefined}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTargetTx(null)}
      />
    </div>
  );
};
