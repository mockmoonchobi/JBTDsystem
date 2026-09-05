import React, { useState, useMemo, useEffect } from 'react';
import { 
  Household, 
  TempleProfile, 
  TempleInfo, 
  Priest, 
  Transaction,
  TransactionCategory,
  MasterOptions
} from '../types';
import { 
  X, 
  Coins, 
  Check, 
  User, 
  Calendar as CalendarIcon, 
  ArrowDownUp, 
  AlertCircle, 
  CheckCircle2, 
  Receipt, 
  Filter,
  DollarSign,
  Layers,
  ChevronDown,
  Tag
} from 'lucide-react';
import { getTodayDateString } from '../utils/calendarUtils';
import { INITIAL_INCOME_CATEGORIES } from '../data/initialData';

interface TanagyoBatchAccountingModalProps {
  isOpen: boolean;
  onClose: () => void;
  households: Household[];
  temples?: TempleProfile[];
  templeInfo: TempleInfo;
  priests?: Priest[];
  transactions: Transaction[];
  onAddBatchTransactions: (transactions: Transaction[]) => void;
  activeTempleId?: string;
  masterOptions?: MasterOptions;
  templeMasterOptionsMap?: Record<string, MasterOptions>;
}

interface HouseholdRowState {
  householdId: string;
  selected: boolean;
  priestName: string;
  date: string;
  timeSlot: string;
  order: number;
  familyHead: string;
  address: string;
  templeId?: string;
  templeName: string;
  amount: number;
  category: string;
  notes: string;
  alreadyRecorded: boolean;
  existingAmount?: number;
}

export const TanagyoBatchAccountingModal: React.FC<TanagyoBatchAccountingModalProps> = ({
  isOpen,
  onClose,
  households = [],
  temples = [],
  templeInfo,
  priests = [],
  transactions = [],
  onAddBatchTransactions,
  activeTempleId = 'ALL',
  masterOptions,
  templeMasterOptionsMap,
}) => {
  // 絞り込みフィルター（定義を先に配置）
  const [filterPriest, setFilterPriest] = useState<string>('ALL');
  const [filterDate, setFilterDate] = useState<string>('ALL');
  const [filterTemple, setFilterTemple] = useState<string>('ALL');
  const [hideAlreadyRecorded, setHideAlreadyRecorded] = useState<boolean>(false);

  // 寺院情報設定（区分・勘定科目マスタ）で登録されている収入勘定科目を完全解決
  const incomeCategories = useMemo(() => {
    const catsSet = new Set<string>();

    // 1. 絞り込み寺院が指定されている場合
    if (filterTemple !== 'ALL') {
      const fromMap = templeMasterOptionsMap?.[filterTemple]?.incomeCategories;
      if (fromMap && fromMap.length > 0) fromMap.forEach((c) => c && catsSet.add(c.trim()));

      const foundTemple = temples.find((t) => t.id === filterTemple);
      const fromTemple = foundTemple?.masterOptions?.incomeCategories;
      if (fromTemple && fromTemple.length > 0) fromTemple.forEach((c) => c && catsSet.add(c.trim()));
    }

    // 2. 指定寺院で見つからなかった場合、または 'ALL' の場合、全寺院・全マスタから確実に統合
    if (catsSet.size === 0) {
      // templeMasterOptionsMap の全寺院から抽出
      if (templeMasterOptionsMap) {
        Object.values(templeMasterOptionsMap).forEach((m) => {
          (m.incomeCategories || []).forEach((c) => c && catsSet.add(c.trim()));
        });
      }

      // temples プロファイル一覧の masterOptions から抽出
      if (temples && temples.length > 0) {
        temples.forEach((t) => {
          (t.masterOptions?.incomeCategories || []).forEach((c) => c && catsSet.add(c.trim()));
        });
      }

      // masterOptions prop から抽出
      if (masterOptions?.incomeCategories && masterOptions.incomeCategories.length > 0) {
        masterOptions.incomeCategories.forEach((c) => c && catsSet.add(c.trim()));
      }

      // templeInfo.masterOptions から抽出
      if (templeInfo?.masterOptions?.incomeCategories && templeInfo.masterOptions.incomeCategories.length > 0) {
        templeInfo.masterOptions.incomeCategories.forEach((c) => c && catsSet.add(c.trim()));
      }

      // localStorage (temple_master_options, temple_master_options_map) から最新の設定を抽出
      try {
        const rawMap = localStorage.getItem('temple_master_options_map');
        if (rawMap) {
          const parsed = JSON.parse(rawMap);
          Object.values(parsed).forEach((m: any) => {
            (m?.incomeCategories || []).forEach((c: string) => c && catsSet.add(c.trim()));
          });
        }
        const rawSingle = localStorage.getItem('temple_master_options');
        if (rawSingle) {
          const parsed = JSON.parse(rawSingle);
          (parsed?.incomeCategories || []).forEach((c: string) => c && catsSet.add(c.trim()));
        }
      } catch {}
    }

    const list = Array.from(catsSet).filter(Boolean);
    if (list.length > 0) {
      return list;
    }

    return INITIAL_INCOME_CATEGORIES || [
      '法要布施',
      '護持会費',
      '墓地管理費',
      '開眼・納骨布施',
      '特別寄付',
      '年間維持費',
      '境内整備寄付',
      '雑収入',
      'その他収入'
    ];
  }, [masterOptions, templeInfo, filterTemple, activeTempleId, templeMasterOptionsMap, temples]);

  // 寺院情報設定マスタから納入受取方法を解決
  const paymentMethodOptions = useMemo(() => {
    const paySet = new Set<string>();
    if (filterTemple !== 'ALL') {
      const fromMap = templeMasterOptionsMap?.[filterTemple]?.paymentMethods;
      if (fromMap && fromMap.length > 0) fromMap.forEach((p) => p && paySet.add(p.trim()));
    }
    if (paySet.size === 0) {
      if (templeMasterOptionsMap) {
        Object.values(templeMasterOptionsMap).forEach((m) => {
          (m.paymentMethods || []).forEach((p) => p && paySet.add(p.trim()));
        });
      }
      if (masterOptions?.paymentMethods) {
        masterOptions.paymentMethods.forEach((p) => p && paySet.add(p.trim()));
      }
      if (templeInfo?.masterOptions?.paymentMethods) {
        templeInfo.masterOptions.paymentMethods.forEach((p) => p && paySet.add(p.trim()));
      }
    }
    const list = Array.from(paySet).filter(Boolean);
    if (list.length > 0) return list;
    return ['現金受付', 'QR受付時', '銀行振込', '郵便振替', 'その他'];
  }, [masterOptions, templeInfo, filterTemple, activeTempleId, templeMasterOptionsMap]);

  // 一括設定項目
  const [batchCategory, setBatchCategory] = useState<string>('お布施');
  const [batchNotes, setBatchNotes] = useState<string>('お盆棚経供養料');
  const [dateMode, setDateMode] = useState<'visitDate' | 'fixedDate'>('visitDate');
  const [fixedDate, setFixedDate] = useState<string>(getTodayDateString());
  const [batchPaymentMethod, setBatchPaymentMethod] = useState<string>('現金受付');
  const [quickAmountInput, setQuickAmountInput] = useState<number>(10000);

  // 勘定科目選択ポップアップ表示ステート（null のときは一括用、string のときは該当行の householdId 用）
  const [showCategoryPopup, setShowCategoryPopup] = useState<boolean>(false);
  const [popupTargetRowId, setPopupTargetRowId] = useState<string | null>(null);

  // 各行の入力状態
  const [rows, setRows] = useState<HouseholdRowState[]>([]);

  // 寺院情報設定マスタに登録されている最適な初期勘定科目を自動選択
  useEffect(() => {
    if (!isOpen || incomeCategories.length === 0) return;

    // 既に現在の科目がマスタに含まれていればそのまま維持
    if (incomeCategories.includes(batchCategory)) return;

    // 「棚経」「お盆」「供養」など棚経関連の科目がマスタに存在すれば最優先
    const preferred = 
      incomeCategories.find((c) => c.includes('棚経') || c.includes('盆')) ||
      incomeCategories.find((c) => c.includes('供養')) ||
      incomeCategories.find((c) => c === 'お布施' || c.includes('布施')) ||
      incomeCategories[0];

    if (preferred) {
      setBatchCategory(preferred);
    }
  }, [isOpen, incomeCategories]);

  // 納入受取方法の初期値同期
  useEffect(() => {
    if (!isOpen || paymentMethodOptions.length === 0) return;
    if (!paymentMethodOptions.includes(batchPaymentMethod)) {
      setBatchPaymentMethod(paymentMethodOptions[0] || '現金受付');
    }
  }, [isOpen, paymentMethodOptions]);

  // 寺院名解決ヘルパー
  const getCleanTempleName = (tId?: string): string => {
    const mainTemple = temples.find((t) => t.isMain) || temples[0];
    const mainTempleId = mainTemple?.id || templeInfo.id || 'temple-main';
    const targetId = tId || mainTempleId;
    const found = temples.find((t) => t.id === targetId);
    return found?.name || templeInfo.name || '自寺';
  };

  // モーダルが開かれた時に行データを初期化・構築
  useEffect(() => {
    if (!isOpen) return;

    // 1. 棚経対象の檀家を抽出
    const tanagyoList = households.filter((h) => !!h.tanagyoMonthlyVisit);

    // 2. 出納帳の既存棚経データを検出用マップ（householdId -> 登録金額）
    const existingTxMap = new Map<string, number>();
    transactions.forEach((tx) => {
      if (tx.householdId && (tx.notes?.includes('棚経') || tx.category?.includes('棚経') || tx.category?.includes('布施'))) {
        existingTxMap.set(tx.householdId, (existingTxMap.get(tx.householdId) || 0) + (tx.amount || 0));
      }
    });

    // 3. 各世帯を「担当僧侶別」→「日付順」→「順番順」に並び替え
    const sorted = [...tanagyoList].sort((a, b) => {
      // 担当僧侶
      const priestA = a.tanagyoPriestName || '未割当';
      const priestB = b.tanagyoPriestName || '未割当';
      if (priestA !== priestB) return priestA.localeCompare(priestB, 'ja');

      // 日程
      const dateA = a.tanagyoDate || '9999-99-99';
      const dateB = b.tanagyoDate || '9999-99-99';
      if (dateA !== dateB) return dateA.localeCompare(dateB, 'ja', { numeric: true });

      // 時間帯（午前 -> 午後 -> その他）
      const timeSlotWeight = (slot?: string) => {
        if (slot === '午前') return 1;
        if (slot === '午後') return 2;
        return 3;
      };
      const slotA = timeSlotWeight(a.tanagyoTimeSlot);
      const slotB = timeSlotWeight(b.tanagyoTimeSlot);
      if (slotA !== slotB) return slotA - slotB;

      // 巡回順番
      const orderA = a.tanagyoOrder ?? 9999;
      const orderB = b.tanagyoOrder ?? 9999;
      if (orderA !== orderB) return orderA - orderB;

      // 世帯主名
      return (a.familyHead || '').localeCompare(b.familyHead || '', 'ja');
    });

    // 初期勘定科目を決定
    const initialCategory = 
      incomeCategories.find((c) => c.includes('棚経') || c.includes('盆')) ||
      incomeCategories.find((c) => c.includes('供養')) ||
      incomeCategories.find((c) => c === 'お布施' || c.includes('布施')) ||
      incomeCategories[0] ||
      batchCategory ||
      'お布施';

    // 4. 行状態の生成
    const initialRows: HouseholdRowState[] = sorted.map((h, idx) => {
      const already = existingTxMap.has(h.id);
      const existingAmt = existingTxMap.get(h.id);
      return {
        householdId: h.id,
        // 既に計上されている場合は二重登録防止のためデフォルトで非選択
        selected: !already,
        priestName: h.tanagyoPriestName || '担当未定',
        date: h.tanagyoDate || '日程未定',
        timeSlot: h.tanagyoTimeSlot || '未定',
        order: h.tanagyoOrder ?? (idx + 1),
        familyHead: h.familyHead,
        address: h.tanagyoAddress || h.address || '住所未登録',
        templeId: h.templeId,
        templeName: getCleanTempleName(h.templeId),
        amount: 10000, // 標準的な棚経供養料初期値（一括変更可能）
        category: initialCategory,
        notes: batchNotes || 'お盆棚経供養料',
        alreadyRecorded: already,
        existingAmount: existingAmt,
      };
    });

    setRows(initialRows);
  }, [isOpen, households, transactions]);

  // 利用可能な担当僧侶一覧（フィルター用）
  const priestFilterOptions = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => set.add(r.priestName));
    return Array.from(set);
  }, [rows]);

  // 利用可能な日程一覧（フィルター用）
  const dateFilterOptions = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => set.add(r.date));
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ja', { numeric: true }));
  }, [rows]);

  // 一括勘定科目変更の反映（全行の勘定科目も更新）
  const handleBatchCategoryChange = (newCat: string) => {
    setBatchCategory(newCat);
    setRows((prev) =>
      prev.map((r) => ({
        ...r,
        category: newCat,
      }))
    );
  };

  // 個別行の勘定科目変更
  const handleRowCategoryChange = (householdId: string, newCat: string) => {
    setRows((prev) =>
      prev.map((r) => (r.householdId === householdId ? { ...r, category: newCat } : r))
    );
  };

  // 一括摘要変更の反映
  const handleApplyBatchNotesToAll = () => {
    setRows((prev) =>
      prev.map((r) => ({
        ...r,
        notes: batchNotes,
      }))
    );
  };

  // 一括金額変更の反映（選択中の世帯または全世帯）
  const handleApplyBatchAmount = (amt: number) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.selected) {
          return { ...r, amount: amt };
        }
        return r;
      })
    );
  };

  // 絞り込み後の行
  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (filterPriest !== 'ALL' && r.priestName !== filterPriest) return false;
      if (filterDate !== 'ALL' && r.date !== filterDate) return false;
      if (filterTemple !== 'ALL' && (r.templeId || 'temple-main') !== filterTemple) return false;
      if (hideAlreadyRecorded && r.alreadyRecorded) return false;
      return true;
    });
  }, [rows, filterPriest, filterDate, filterTemple, hideAlreadyRecorded]);

  // 全選択 / 全解除
  const handleToggleSelectAll = (checked: boolean) => {
    const visibleIds = new Set(filteredRows.map((r) => r.householdId));
    setRows((prev) =>
      prev.map((r) => {
        if (visibleIds.has(r.householdId)) {
          return { ...r, selected: checked };
        }
        return r;
      })
    );
  };

  // 個別行の選択トグル
  const handleToggleRow = (householdId: string) => {
    setRows((prev) =>
      prev.map((r) => (r.householdId === householdId ? { ...r, selected: !r.selected } : r))
    );
  };

  // 個別行の金額変更
  const handleRowAmountChange = (householdId: string, value: number) => {
    setRows((prev) =>
      prev.map((r) => (r.householdId === householdId ? { ...r, amount: isNaN(value) ? 0 : value } : r))
    );
  };

  // 個別行の摘要変更
  const handleRowNotesChange = (householdId: string, notes: string) => {
    setRows((prev) =>
      prev.map((r) => (r.householdId === householdId ? { ...r, notes } : r))
    );
  };

  // 選択中の集計
  const selectedRows = useMemo(() => {
    return rows.filter((r) => r.selected);
  }, [rows]);

  const totalSelectedAmount = useMemo(() => {
    return selectedRows.reduce((sum, r) => sum + (r.amount || 0), 0);
  }, [selectedRows]);

  // 出納帳に一括登録実行
  const handleSubmitBatch = () => {
    if (selectedRows.length === 0) {
      alert('計上対象の世帯が1件も選択されていません。');
      return;
    }

    const now = new Date();
    const currentYear = now.getFullYear();
    const today = getTodayDateString();

    const newTransactions: Transaction[] = selectedRows.map((r, index) => {
      // 日付の決定
      let txDate = today;
      if (dateMode === 'visitDate') {
        if (r.date && r.date !== '日程未定') {
          // 例: '8/13' -> '2026-08-13' 形式に整形
          if (r.date.includes('/')) {
            const [m, d] = r.date.split('/');
            const mm = m.padStart(2, '0');
            const dd = d.padStart(2, '0');
            txDate = `${currentYear}-${mm}-${dd}`;
          } else if (r.date.includes('-')) {
            txDate = r.date;
          }
        }
      } else {
        txDate = fixedDate || today;
      }

      const receiptNo = `棚-${txDate.replace(/-/g, '').slice(2)}-${String(index + 1).padStart(3, '0')}`;

      return {
        id: `tx-tanagyo-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 5)}`,
        templeId: r.templeId || 'temple-main',
        date: txDate,
        householdId: r.householdId,
        householdHeadName: r.familyHead,
        category: (r.category || batchCategory) as TransactionCategory,
        type: '収入',
        amount: r.amount || 0,
        paymentMethod: batchPaymentMethod,
        receiptNumber: receiptNo,
        notes: r.notes || `${r.priestName} 棚経供養料`,
      };
    });

    onAddBatchTransactions(newTransactions);
    alert(`棚経の会計データ【${newTransactions.length}件 / 合計 ¥${totalSelectedAmount.toLocaleString()}】を出納帳に一括計上しました。`);
    onClose();
  };

  if (!isOpen) return null;

  const isAllVisibleSelected = filteredRows.length > 0 && filteredRows.every((r) => r.selected);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white border-2 border-[#8C2D19] shadow-2xl rounded-xs w-full max-w-6xl max-h-[92vh] flex flex-col font-sans text-[#1A1A1A]">
        {/* Modal Header */}
        <div className="bg-[#1A1A1A] text-white px-5 py-3.5 flex items-center justify-between border-b-2 border-[#D4AF37]">
          <div className="flex items-center space-x-3">
            <Coins className="w-5 h-5 text-[#D4AF37]" />
            <div>
              <h3 className="font-serif font-black text-base sm:text-lg tracking-wider text-[#D4AF37]">
                お盆棚経 会計一括入力（出納帳一括計上）
              </h3>
              <p className="text-xs text-gray-300">
                巡回担当・日付・巡回順序で並んだ各檀信徒への棚経供養料・お布施を一括して出納帳へ計上します。
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-white p-1 rounded-xs transition-colors cursor-pointer"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Top Control Panel: 一括設定項目 */}
        <div className="bg-[#FAF7F0] border-b border-[#D1CEC7] p-4 space-y-3 shrink-0">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            {/* 1. 勘定科目（項目・寺院情報設定マスタ連動） */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="font-black text-gray-700 flex items-center gap-1">
                  <span>勘定科目（収入）</span>
                  <span className="text-[10px] text-amber-800 bg-amber-100 border border-amber-300 px-1 py-0.2 rounded-xs font-bold">
                    寺院設定連動
                  </span>
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setPopupTargetRowId(null);
                    setShowCategoryPopup(true);
                  }}
                  className="text-[11px] font-bold text-[#8C2D19] hover:text-[#702414] hover:underline flex items-center gap-0.5 cursor-pointer"
                  title="寺院情報設定で設定された勘定科目一覧ポップアップを開く"
                >
                  <Layers className="w-3 h-3" />
                  <span>ポップアップ選択</span>
                </button>
              </div>

              {/* クイック切替セレクト ＆ ポップアップ一覧ボタン */}
              <div className="flex items-center gap-1">
                <select
                  value={batchCategory}
                  onChange={(e) => handleBatchCategoryChange(e.target.value)}
                  className="flex-1 bg-white border border-gray-300 font-bold px-2 py-1.5 rounded-xs focus:ring-1 focus:ring-[#8C2D19] text-xs"
                  title="寺院情報設定で設定された勘定科目一覧"
                >
                  {incomeCategories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                  {!incomeCategories.includes(batchCategory) && (
                    <option value={batchCategory}>{batchCategory}</option>
                  )}
                </select>
                <button
                  type="button"
                  onClick={() => {
                    setPopupTargetRowId(null);
                    setShowCategoryPopup(true);
                  }}
                  className="px-2 py-1.5 bg-[#8C2D19] hover:bg-[#702414] text-white font-bold rounded-xs cursor-pointer text-xs flex items-center gap-1 shrink-0 shadow-xs"
                  title="寺院情報設定で設定された勘定科目一覧ポップアップを開く"
                >
                  <Coins className="w-3 h-3" />
                  <span>科目一覧</span>
                </button>
              </div>
            </div>

            {/* 2. 摘要を一括で入れる欄 */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="font-black text-gray-700">摘要（一括反映）</label>
                <button
                  type="button"
                  onClick={handleApplyBatchNotesToAll}
                  className="text-[10px] font-bold text-[#8C2D19] hover:underline cursor-pointer"
                >
                  全行に上書き反映
                </button>
              </div>
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  value={batchNotes}
                  onChange={(e) => setBatchNotes(e.target.value)}
                  placeholder="例: お盆棚経供養料"
                  className="w-full bg-white border border-gray-300 font-bold px-2.5 py-1.5 rounded-xs focus:ring-1 focus:ring-[#8C2D19]"
                />
              </div>
            </div>

            {/* 3. 計上日設定 */}
            <div>
              <label className="block font-black text-gray-700 mb-1">
                入金計上日
              </label>
              <div className="space-y-1.5">
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="radio"
                      name="dateMode"
                      checked={dateMode === 'visitDate'}
                      onChange={() => setDateMode('visitDate')}
                      className="text-[#8C2D19] focus:ring-[#8C2D19]"
                    />
                    <span className="font-bold text-gray-800">各世帯の訪問日</span>
                  </label>
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="radio"
                      name="dateMode"
                      checked={dateMode === 'fixedDate'}
                      onChange={() => setDateMode('fixedDate')}
                      className="text-[#8C2D19] focus:ring-[#8C2D19]"
                    />
                    <span className="font-bold text-gray-800">指定日</span>
                  </label>
                </div>
                {dateMode === 'fixedDate' && (
                  <input
                    type="date"
                    value={fixedDate}
                    onChange={(e) => setFixedDate(e.target.value)}
                    className="w-full bg-white border border-gray-300 font-bold px-2 py-1 rounded-xs"
                  />
                )}
              </div>
            </div>

            {/* 4. 入金方法 & クイック金額一括適用 */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="font-black text-gray-700">
                  金額一括セット
                </label>
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-gray-500 font-bold">納入方法:</span>
                  <select
                    value={batchPaymentMethod}
                    onChange={(e) => setBatchPaymentMethod(e.target.value)}
                    className="bg-white border border-gray-300 font-bold px-1.5 py-0.5 rounded-xs text-[11px] focus:ring-1 focus:ring-[#8C2D19]"
                    title="寺院情報設定マスタの納入方法"
                  >
                    {paymentMethodOptions.map((pm) => (
                      <option key={pm} value={pm}>
                        {pm}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  step="1000"
                  value={quickAmountInput}
                  onChange={(e) => setQuickAmountInput(Number(e.target.value))}
                  className="w-24 bg-white border border-gray-300 font-bold px-2 py-1.5 rounded-xs text-right"
                />
                <button
                  type="button"
                  onClick={() => handleApplyBatchAmount(quickAmountInput)}
                  className="px-2 py-1.5 bg-[#8C2D19] hover:bg-[#702414] text-white font-bold rounded-xs cursor-pointer text-xs"
                >
                  反映
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyBatchAmount(5000)}
                  className="px-1.5 py-1.5 bg-white border border-gray-300 hover:bg-gray-100 font-bold rounded-xs text-[11px]"
                >
                  5千
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyBatchAmount(10000)}
                  className="px-1.5 py-1.5 bg-white border border-gray-300 hover:bg-gray-100 font-bold rounded-xs text-[11px]"
                >
                  1万
                </button>
              </div>
            </div>
          </div>

          {/* Filtering Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-gray-200 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 text-gray-500 font-bold">
                <Filter className="w-3.5 h-3.5" />
                <span>絞り込み:</span>
              </div>

              {/* 担当僧侶フィルター */}
              <select
                value={filterPriest}
                onChange={(e) => setFilterPriest(e.target.value)}
                className="bg-white border border-gray-300 font-bold px-2 py-1 rounded-xs"
              >
                <option value="ALL">全担当僧侶 ({rows.length}件)</option>
                {priestFilterOptions.map((p) => (
                  <option key={p} value={p}>
                    担当: {p} ({rows.filter((r) => r.priestName === p).length}件)
                  </option>
                ))}
              </select>

              {/* 訪問日程フィルター */}
              <select
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
                className="bg-white border border-gray-300 font-bold px-2 py-1 rounded-xs"
              >
                <option value="ALL">全訪問日程</option>
                {dateFilterOptions.map((d) => (
                  <option key={d} value={d}>
                    訪問日: {d}
                  </option>
                ))}
              </select>

              {/* 所属寺院フィルター */}
              {temples && temples.length > 1 && (
                <select
                  value={filterTemple}
                  onChange={(e) => setFilterTemple(e.target.value)}
                  className="bg-white border border-gray-300 font-bold px-2 py-1 rounded-xs"
                >
                  <option value="ALL">全寺院（合算）</option>
                  {temples.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              )}

              {/* 未計上のみ表示 */}
              <label className="flex items-center gap-1 cursor-pointer ml-1 font-bold text-gray-700">
                <input
                  type="checkbox"
                  checked={hideAlreadyRecorded}
                  onChange={(e) => setHideAlreadyRecorded(e.target.checked)}
                  className="rounded-xs text-[#8C2D19] focus:ring-[#8C2D19]"
                />
                <span>未計上のみ表示</span>
              </label>
            </div>

            <div className="text-gray-500 font-bold">
              表示件数: <strong className="text-black">{filteredRows.length}</strong> 軒
            </div>
          </div>
        </div>

        {/* Main Table: 担当、日付、順番順に並んだ世帯リスト */}
        <div className="flex-1 overflow-y-auto p-4">
          <table className="w-full text-xs text-left border-collapse">
            <thead className="bg-[#FAF7F0] sticky top-0 z-10 border-b-2 border-gray-300 shadow-2xs">
              <tr className="text-gray-700 font-black">
                <th className="p-2 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={isAllVisibleSelected}
                    onChange={(e) => handleToggleSelectAll(e.target.checked)}
                    className="rounded-xs text-[#8C2D19] focus:ring-[#8C2D19]"
                    title="表示中の全世帯を選択/解除"
                  />
                </th>
                <th className="p-2 w-28">担当僧侶</th>
                <th className="p-2 w-28">訪問日時</th>
                <th className="p-2 w-12 text-center">順序</th>
                <th className="p-2 w-36">世帯主名（施主名）</th>
                <th className="p-2 w-24">所属寺院</th>
                <th className="p-2 w-28">勘定科目</th>
                <th className="p-2 min-w-[140px]">住所</th>
                <th className="p-2 w-32 text-right">金額 (円)</th>
                <th className="p-2 min-w-[150px]">個別摘要</th>
                <th className="p-2 w-20 text-center">出納状態</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={11} className="p-8 text-center text-gray-500 font-bold">
                    条件に一致する棚経対象世帯がありません。
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => (
                  <tr
                    key={row.householdId}
                    className={`hover:bg-amber-50/50 transition-colors ${
                      row.selected ? 'bg-amber-50/20' : 'opacity-70 bg-white'
                    }`}
                  >
                    {/* チェックボックス */}
                    <td className="p-2 text-center">
                      <input
                        type="checkbox"
                        checked={row.selected}
                        onChange={() => handleToggleRow(row.householdId)}
                        className="rounded-xs text-[#8C2D19] focus:ring-[#8C2D19] cursor-pointer"
                      />
                    </td>

                    {/* 担当僧侶 */}
                    <td className="p-2 font-bold text-gray-800">
                      {row.priestName}
                    </td>

                    {/* 訪問日時 */}
                    <td className="p-2 font-bold text-gray-700">
                      {row.date} {row.timeSlot}
                    </td>

                    {/* 順序 */}
                    <td className="p-2 text-center font-bold text-gray-600">
                      {row.order}
                    </td>

                    {/* 世帯主名（施主名） */}
                    <td className="p-2 font-black text-sm text-[#1A1A1A]">
                      {row.familyHead} 様
                    </td>

                    {/* 所属寺院 */}
                    <td className="p-2 text-gray-600">
                      <span className="bg-gray-100 px-1.5 py-0.5 rounded-xs border border-gray-200">
                        {row.templeName}
                      </span>
                    </td>

                    {/* 勘定科目（寺院情報設定マスタ連動・行個別変更可能） */}
                    <td className="p-2">
                      <div className="flex items-center gap-1">
                        <select
                          value={row.category || batchCategory}
                          onChange={(e) => handleRowCategoryChange(row.householdId, e.target.value)}
                          disabled={!row.selected}
                          className={`flex-1 min-w-0 px-1.5 py-1 border font-bold text-xs rounded-xs ${
                            row.selected
                              ? 'bg-white border-gray-300 text-gray-800 focus:ring-1 focus:ring-[#8C2D19]'
                              : 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed'
                          }`}
                          title="この世帯の勘定科目（寺院情報設定マスタ）"
                        >
                          {incomeCategories.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                          {!incomeCategories.includes(row.category || batchCategory) && (
                            <option value={row.category || batchCategory}>
                              {row.category || batchCategory}
                            </option>
                          )}
                        </select>
                        {row.selected && (
                          <button
                            type="button"
                            onClick={() => {
                              setPopupTargetRowId(row.householdId);
                              setShowCategoryPopup(true);
                            }}
                            className="p-1 bg-white hover:bg-amber-50 text-[#8C2D19] border border-gray-300 rounded-xs cursor-pointer text-xs shrink-0"
                            title="寺院情報設定の勘定科目一覧ポップアップから選択"
                          >
                            <Layers className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>

                    {/* 住所 */}
                    <td className="p-2 text-gray-600 truncate max-w-[200px]" title={row.address}>
                      {row.address}
                    </td>

                    {/* 金額の入力欄 */}
                    <td className="p-2 text-right">
                      <div className="relative">
                        <span className="absolute left-2 top-2 text-gray-400 font-bold">¥</span>
                        <input
                          type="number"
                          step="1000"
                          value={row.amount || ''}
                          onChange={(e) => handleRowAmountChange(row.householdId, Number(e.target.value))}
                          disabled={!row.selected}
                          className={`w-full text-right pl-6 pr-2 py-1 border font-mono font-bold rounded-xs ${
                            row.selected
                              ? 'bg-white border-gray-300 text-[#1A1A1A] focus:border-[#8C2D19] focus:ring-1 focus:ring-[#8C2D19]'
                              : 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed'
                          }`}
                        />
                      </div>
                    </td>

                    {/* 摘要入力欄 */}
                    <td className="p-2">
                      <input
                        type="text"
                        value={row.notes}
                        onChange={(e) => handleRowNotesChange(row.householdId, e.target.value)}
                        disabled={!row.selected}
                        className={`w-full px-2 py-1 border font-bold text-xs rounded-xs ${
                          row.selected
                            ? 'bg-white border-gray-300 text-gray-800'
                            : 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed'
                        }`}
                      />
                    </td>

                    {/* 出納状態バッジ */}
                    <td className="p-2 text-center">
                      {row.alreadyRecorded ? (
                        <span
                          className="px-1.5 py-0.5 bg-green-100 text-green-800 font-bold text-[10px] rounded-xs border border-green-300 whitespace-nowrap"
                          title={`出納帳に計上済 (¥${(row.existingAmount || 0).toLocaleString()})`}
                        >
                          計上済
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 bg-gray-100 text-gray-500 font-bold text-[10px] rounded-xs whitespace-nowrap">
                          未計上
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Modal Footer */}
        <div className="bg-[#FAF7F0] border-t-2 border-[#D1CEC7] px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-4">
            <div className="text-xs text-gray-600">
              計上対象: <strong className="text-sm font-black text-[#8C2D19]">{selectedRows.length}</strong> 件 / 全{rows.length}件
            </div>
            <div className="text-sm text-gray-800">
              合計金額: <strong className="text-lg font-black text-[#1A1A1A] font-mono">¥{totalSelectedAmount.toLocaleString()}</strong>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 bg-white hover:bg-gray-100 text-gray-700 font-bold text-xs rounded-xs transition-colors cursor-pointer"
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={handleSubmitBatch}
              disabled={selectedRows.length === 0}
              className={`px-5 py-2 text-white font-black text-xs rounded-xs shadow-md flex items-center gap-1.5 transition-colors ${
                selectedRows.length > 0
                  ? 'bg-[#8C2D19] hover:bg-[#702414] cursor-pointer'
                  : 'bg-gray-400 cursor-not-allowed'
              }`}
            >
              <Check className="w-4 h-4" />
              <span>出納帳に一括計上・保存する ({selectedRows.length}件)</span>
            </button>
          </div>
        </div>
      </div>

      {/* 勘定科目選択ポップアップモーダル（寺院情報設定マスタ連動） */}
      {showCategoryPopup && (() => {
        const targetRow = popupTargetRowId ? rows.find((r) => r.householdId === popupTargetRowId) : null;
        const currentActiveCat = targetRow ? (targetRow.category || batchCategory) : batchCategory;

        return (
          <div className="fixed inset-0 z-70 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3">
            <div className="bg-white border-2 border-[#8C2D19] shadow-2xl rounded-xs max-w-lg w-full p-4 sm:p-5 animate-in fade-in zoom-in-95 space-y-3 font-sans text-gray-900">
              {/* ポップアップヘッダー */}
              <div className="flex items-center justify-between border-b border-gray-200 pb-2.5">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-amber-100 text-[#8C2D19] rounded-xs">
                    <Coins className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm sm:text-base text-gray-900 flex items-center gap-1.5">
                      <span>{targetRow ? `【${targetRow.familyHead} 様】の勘定科目選択` : '勘定科目の選択（一括）'}</span>
                      <span className="text-[10px] text-amber-800 bg-amber-100 border border-amber-300 px-1.5 py-0.5 rounded-xs font-bold">
                        寺院情報設定 連動
                      </span>
                    </h4>
                    <p className="text-[11px] text-gray-500">
                      寺院情報設定（区分・勘定科目マスタ）に登録されている収入勘定科目（全{incomeCategories.length}件）です。
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCategoryPopup(false)}
                  className="text-gray-400 hover:text-gray-700 p-1 rounded-xs cursor-pointer"
                  title="閉じる"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* ポップアップコンテンツ: 科目ボタングリッド */}
              <div className="py-1">
                <div className="text-xs font-bold text-gray-700 mb-2.5 flex items-center justify-between">
                  <span>適用したい科目をクリックしてください：</span>
                  <span className="text-[11px] text-[#8C2D19]">
                    現在選択中: <strong className="font-black underline">{currentActiveCat}</strong>
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-64 overflow-y-auto pr-1">
                  {incomeCategories.map((cat) => {
                    const isSelected = currentActiveCat === cat;
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => {
                          if (popupTargetRowId) {
                            handleRowCategoryChange(popupTargetRowId, cat);
                          } else {
                            handleBatchCategoryChange(cat);
                          }
                          setShowCategoryPopup(false);
                        }}
                        className={`p-2.5 text-left border rounded-xs transition-all cursor-pointer flex items-center justify-between text-xs ${
                          isSelected
                            ? 'bg-[#8C2D19] text-white border-[#8C2D19] font-black shadow-xs ring-1 ring-[#8C2D19]'
                            : 'bg-[#FAF9F5] text-gray-800 border-gray-300 hover:border-[#8C2D19] hover:bg-amber-50/60 font-bold'
                        }`}
                      >
                        <span className="truncate">{cat}</span>
                        {isSelected && <Check className="w-4 h-4 text-white shrink-0 ml-1" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* ポップアップフッター */}
              <div className="pt-2.5 border-t border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                <span className="text-[11px] text-gray-500">
                  ※科目の追加・並べ替えは「寺院情報設定 ＞ 区分・勘定科目マスタ」で設定できます。
                </span>
                <button
                  type="button"
                  onClick={() => setShowCategoryPopup(false)}
                  className="px-4 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold rounded-xs cursor-pointer text-xs self-end sm:self-auto"
                >
                  閉じる
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
