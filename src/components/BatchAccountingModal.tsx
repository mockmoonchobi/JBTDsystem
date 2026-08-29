import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { 
  X, 
  Search, 
  CheckCircle2, 
  Receipt, 
  Layers, 
  Sparkles, 
  Coins,
  Building2,
  Calendar,
  Users,
  Save,
  Clock,
  Trash2
} from 'lucide-react';
import { Household, Transaction, MasterOptions, TempleInfo, TransactionCategory, BatchAccountingData, HouseholdBatchEntry, BatchAccountingConfig } from '../types';
import { formatCurrency, formatJapaneseEraDate, normalizeDateInput, NormalizeDateOptions } from '../utils/memorialCalculator';
import { 
  getSavedBatchAccountingData, 
  getSavedBatchAccountingConfig,
  saveBatchAccountingData, 
  saveBatchAccountingConfig,
  clearBatchAccountingData,
  clearBatchAccountingEntries,
  getDefaultBatchAccountingData,
  getDefaultBatchAccountingConfig,
  resolveCategoryForFeeItem
} from '../utils/batchAccountingUtils';

interface BatchAccountingModalProps {
  isOpen: boolean;
  onClose: () => void;
  households: Household[];
  templeInfo: TempleInfo;
  masterOptions?: MasterOptions;
  onAddBatchTransactions: (transactions: Transaction[]) => void;
  initialBatchData?: BatchAccountingData;
  onSaveBatchData?: (data: BatchAccountingData) => void;
}

const KANA_GROUPS = [
  { label: 'すべて', chars: [] },
  { label: 'あ', chars: ['あ', 'い', 'う', 'え', 'お', 'ア', 'イ', 'ウ', 'エ', 'オ', 'a', 'i', 'u', 'e', 'o'] },
  { label: 'か', chars: ['か', 'き', 'く', 'け', 'こ', 'が', 'ぎ', 'ぐ', 'げ', 'ご', 'カ', 'キ', 'ク', 'ケ', 'コ', 'ガ', 'ギ', 'グ', 'ゲ', 'ゴ', 'k', 'g'] },
  { label: 'さ', chars: ['さ', 'し', 'す', 'せ', 'そ', 'ざ', 'じ', 'ず', 'ぜ', 'ぞ', 'サ', 'シ', 'ス', 'セ', 'ソ', 'ザ', 'ジ', 'ズ', 'ゼ', 'ゾ', 's', 'z'] },
  { label: 'た', chars: ['た', 'ち', 'つ', 'て', 'と', 'だ', 'ぢ', 'づ', 'で', 'ど', 'タ', 'チ', 'ツ', 'テ', 'ト', 'ダ', 'ヂ', 'ヅ', 'デ', 'ド', 't', 'd'] },
  { label: 'な', chars: ['な', 'に', 'ぬ', 'ね', 'の', 'ナ', 'ニ', 'ヌ', 'ネ', 'ノ', 'n'] },
  { label: 'は', chars: ['は', 'ひ', 'ふ', 'へ', 'ほ', 'ば', 'び', 'ぶ', 'べ', 'ぼ', 'ぱ', 'ぴ', 'ぷ', 'ぺ', 'ぽ', 'ハ', 'ヒ', 'フ', 'ヘ', 'ホ', 'バ', 'ビ', 'ブ', 'ベ', 'ボ', 'パ', 'ピ', 'プ', 'ペ', 'ポ', 'h', 'b', 'p'] },
  { label: 'ま', chars: ['ま', 'み', 'む', 'め', 'も', 'マ', 'ミ', 'ム', 'メ', 'モ', 'm'] },
  { label: 'や', chars: ['や', 'ゆ', 'よ', 'ヤ', 'ユ', 'ヨ', 'y'] },
  { label: 'ら', chars: ['ら', 'り', 'る', 'れ', 'ろ', 'ラ', 'リ', 'ル', 'レ', 'ロ', 'r'] },
  { label: 'わ', chars: ['わ', 'を', 'ん', 'ワ', 'ヲ', 'ン', 'w'] },
];

export const BatchAccountingModal: React.FC<BatchAccountingModalProps> = ({
  isOpen,
  onClose,
  households,
  templeInfo,
  masterOptions,
  onAddBatchTransactions,
  initialBatchData,
  onSaveBatchData,
}) => {
  const incomeCategories = useMemo(() => {
    const list = masterOptions?.incomeCategories || templeInfo?.masterOptions?.incomeCategories || ['法要布施', '護持会費', '特別寄付', '墓地管理費', '繰越金', '雑収入'];
    return list.length > 0 ? list : ['法要布施', '護持会費', '特別寄付', '墓地管理費'];
  }, [masterOptions, templeInfo]);

  // Helper to map fee item name to corresponding income category
  const resolveCategoryForFee = (feeName: string, fallback: string = '法要布施'): string => {
    if (!feeName) return fallback;
    const trimmed = feeName.trim();
    if (templeInfo?.feeType1 === trimmed && templeInfo.feeType1Category) return templeInfo.feeType1Category;
    if (templeInfo?.feeType2 === trimmed && templeInfo.feeType2Category) return templeInfo.feeType2Category;
    if (templeInfo?.feeType3 === trimmed && templeInfo.feeType3Category) return templeInfo.feeType3Category;
    if (templeInfo?.feeTypeMapping && templeInfo.feeTypeMapping[trimmed]) return templeInfo.feeTypeMapping[trimmed];
    if (masterOptions?.feeTypeMapping && masterOptions.feeTypeMapping[trimmed]) return masterOptions.feeTypeMapping[trimmed];
    if (incomeCategories.includes(trimmed)) return trimmed;
    if (trimmed.includes('護持') || trimmed.includes('会費')) return incomeCategories.find((c) => c.includes('護持') || c.includes('会費')) || '護持会費';
    if (trimmed.includes('墓地') || trimmed.includes('管理')) return incomeCategories.find((c) => c.includes('墓地') || c.includes('管理')) || '墓地管理費';
    if (trimmed.includes('寄付') || trimmed.includes('整備')) return incomeCategories.find((c) => c.includes('寄付')) || '特別寄付';
    return fallback;
  };

  // 1. Top Settings Bar State: 1 Date, 3 Categories, 3 Provisos (Descriptions), 3 Default Amounts
  const todayEra = formatJapaneseEraDate(new Date().toISOString().slice(0, 10), false);
  const [configDate, setConfigDate] = useState<string>(todayEra);

  // Column 1
  const [cat1, setCat1] = useState<string>('法要布施');
  const [notes1, setNotes1] = useState<string>('');
  const [defaultAmount1, setDefaultAmount1] = useState<number | ''>('');

  // Column 2
  const [cat2, setCat2] = useState<string>('護持会費');
  const [notes2, setNotes2] = useState<string>('');
  const [defaultAmount2, setDefaultAmount2] = useState<number | ''>('');

  // Column 3
  const [cat3, setCat3] = useState<string>('特別寄付');
  const [notes3, setNotes3] = useState<string>('');
  const [defaultAmount3, setDefaultAmount3] = useState<number | ''>('');

  // Track active preset indicator
  const [appliedPreset, setAppliedPreset] = useState<string>('default');

  // 2. Household Entries Map: householdId -> entry data
  const [entries, setEntries] = useState<Record<string, HouseholdBatchEntry>>({});

  // 3. Persistence & Save status
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState<boolean>(false);
  const isLoadedRef = useRef<boolean>(false);

  // Load saved state when modal opens
  useEffect(() => {
    if (isOpen) {
      const targetTempleId = templeInfo?.id || 'temple-main';
      const savedConfig = getSavedBatchAccountingConfig(targetTempleId);
      const savedData = initialBatchData || getSavedBatchAccountingData(targetTempleId);
      const configSource = savedConfig || (savedData ? {
        id: `config-${targetTempleId}`,
        configDate: savedData.configDate,
        cat1: savedData.cat1,
        notes1: savedData.notes1,
        defaultAmount1: savedData.defaultAmount1,
        cat2: savedData.cat2,
        notes2: savedData.notes2,
        defaultAmount2: savedData.defaultAmount2,
        cat3: savedData.cat3,
        notes3: savedData.notes3,
        defaultAmount3: savedData.defaultAmount3,
        appliedPreset: savedData.appliedPreset,
        templeId: savedData.templeId,
        lastSavedAt: savedData.lastSavedAt,
      } : null) || getDefaultBatchAccountingConfig(templeInfo);

      if (configSource) {
        if (configSource.configDate) setConfigDate(configSource.configDate);
        if (configSource.cat1 !== undefined) setCat1(configSource.cat1 || '法要布施');
        if (configSource.notes1 !== undefined) setNotes1(configSource.notes1);
        if (configSource.defaultAmount1 !== undefined) setDefaultAmount1(configSource.defaultAmount1);

        if (configSource.cat2 !== undefined) setCat2(configSource.cat2 || '護持会費');
        if (configSource.notes2 !== undefined) setNotes2(configSource.notes2);
        if (configSource.defaultAmount2 !== undefined) setDefaultAmount2(configSource.defaultAmount2);

        if (configSource.cat3 !== undefined) setCat3(configSource.cat3 || '特別寄付');
        if (configSource.notes3 !== undefined) setNotes3(configSource.notes3);
        if (configSource.defaultAmount3 !== undefined) setDefaultAmount3(configSource.defaultAmount3);

        if (configSource.appliedPreset) setAppliedPreset(configSource.appliedPreset);
      }

      if (savedData && savedData.entries) {
        setEntries(savedData.entries);
        if (savedData.lastSavedAt) {
          try {
            setLastSavedAt(new Date(savedData.lastSavedAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
          } catch {
            setLastSavedAt(null);
          }
        }
      } else {
        setEntries({});
        setLastSavedAt(null);
      }
      setHasUnsavedChanges(false);
      isLoadedRef.current = true;
    } else {
      isLoadedRef.current = false;
    }
  }, [isOpen, templeInfo, initialBatchData]);

  // Current batch state object constructor
  const getCurrentBatchData = useCallback((): BatchAccountingData => {
    return {
      configDate,
      cat1,
      notes1,
      defaultAmount1,
      cat2,
      notes2,
      defaultAmount2,
      cat3,
      notes3,
      defaultAmount3,
      appliedPreset,
      entries,
      templeId: templeInfo?.id || 'temple-main',
      lastSavedAt: new Date().toISOString(),
    };
  }, [configDate, cat1, notes1, defaultAmount1, cat2, notes2, defaultAmount2, cat3, notes3, defaultAmount3, appliedPreset, entries, templeInfo]);

  // Handle closing modal with automatic save & Google Sheets sync
  const handleCloseModal = useCallback(() => {
    try {
      const dataToSave = getCurrentBatchData();
      saveBatchAccountingData(dataToSave);
      saveBatchAccountingConfig({
        id: `config-${dataToSave.templeId || 'temple-main'}`,
        configDate: dataToSave.configDate,
        cat1: dataToSave.cat1,
        notes1: dataToSave.notes1,
        defaultAmount1: dataToSave.defaultAmount1,
        cat2: dataToSave.cat2,
        notes2: dataToSave.notes2,
        defaultAmount2: dataToSave.defaultAmount2,
        cat3: dataToSave.cat3,
        notes3: dataToSave.notes3,
        defaultAmount3: dataToSave.defaultAmount3,
        appliedPreset: dataToSave.appliedPreset,
        templeId: dataToSave.templeId,
        lastSavedAt: dataToSave.lastSavedAt,
      });
      if (onSaveBatchData) {
        onSaveBatchData(dataToSave);
      }
    } catch (err) {
      console.warn('Error saving batch accounting data on close:', err);
    }
    onClose();
  }, [getCurrentBatchData, onSaveBatchData, onClose]);

  // Preset 1: Apply all Temple feeTypes
  const handleApplyTempleFeesPreset = () => {
    const tFee1 = templeInfo?.feeType1?.trim() || '';
    const tFee2 = templeInfo?.feeType2?.trim() || '';
    const tFee3 = templeInfo?.feeType3?.trim() || '';

    setNotes1(tFee1);
    setCat1(tFee1 ? (templeInfo?.feeType1Category || resolveCategoryForFee(tFee1, '護持会費')) : '法要布施');
    setDefaultAmount1(tFee1 ? (templeInfo?.feeType1DefaultAmount ?? 5000) : '');

    setNotes2(tFee2);
    setCat2(tFee2 ? (templeInfo?.feeType2Category || resolveCategoryForFee(tFee2, '護持会費')) : '護持会費');
    setDefaultAmount2(tFee2 ? (templeInfo?.feeType2DefaultAmount ?? 3000) : '');

    setNotes3(tFee3);
    setCat3(tFee3 ? (templeInfo?.feeType3Category || resolveCategoryForFee(tFee3, '特別寄付')) : '特別寄付');
    setDefaultAmount3(tFee3 ? (templeInfo?.feeType3DefaultAmount ?? '') : '');

    setAppliedPreset('temple_fees');
    setHasUnsavedChanges(true);
  };

  // Preset 2: Segaki Toba + Temple Fee 1 + Memorial
  const handleApplySegakiPreset = () => {
    const toba1 = templeInfo?.tobaType1?.trim() || '施餓鬼塔婆';
    const tFee1 = templeInfo?.feeType1?.trim() || '';

    setNotes1(`${toba1}料`);
    setCat1('法要布施');
    setDefaultAmount1(3000);

    setNotes2(tFee1);
    setCat2(tFee1 ? (templeInfo?.feeType1Category || resolveCategoryForFee(tFee1, '護持会費')) : '護持会費');
    setDefaultAmount2(tFee1 ? (templeInfo?.feeType1DefaultAmount ?? 5000) : '');

    setNotes3('');
    setCat3('特別寄付');
    setDefaultAmount3('');

    setAppliedPreset('segaki');
    setHasUnsavedChanges(true);
  };

  // Preset 3: Higan (彼岸会法要 + 護持会費 + 志納金)
  const handleApplyHiganPreset = () => {
    const tFee1 = templeInfo?.feeType1?.trim() || '';

    setNotes1('彼岸塔婆料');
    setCat1('法要布施');
    setDefaultAmount1(3000);

    setNotes2(tFee1);
    setCat2(tFee1 ? (templeInfo?.feeType1Category || resolveCategoryForFee(tFee1, '護持会費')) : '護持会費');
    setDefaultAmount2(tFee1 ? (templeInfo?.feeType1DefaultAmount ?? 5000) : '');

    setNotes3('');
    setCat3('特別寄付');
    setDefaultAmount3('');

    setAppliedPreset('higan');
    setHasUnsavedChanges(true);
  };

  // 3. Filter & Search State
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedKana, setSelectedKana] = useState<string>('すべて');
  const [filterType, setFilterType] = useState<'all' | 'segakiOnly' | 'tanagyoOnly' | 'enteredOnly'>('all');

  const [isSuccessToast, setIsSuccessToast] = useState<string | null>(null);

  // Helper to determine specific household amount for a column
  const getHouseholdDefaultAmount = (h: Household, colIndex: 1 | 2 | 3): number | '' => {
    const note = colIndex === 1 ? notes1 : colIndex === 2 ? notes2 : notes3;
    const globalDefault = colIndex === 1 ? defaultAmount1 : colIndex === 2 ? defaultAmount2 : defaultAmount3;

    // Check if column note corresponds to feeType1
    if (note && templeInfo?.feeType1 && note.includes(templeInfo.feeType1.trim())) {
      if (h.fee1Amount !== undefined && h.fee1Amount !== null && Number(h.fee1Amount) > 0) {
        return Number(h.fee1Amount);
      }
      if (h.fee1 !== undefined && h.fee1 !== null && Number(h.fee1) > 0) {
        return Number(h.fee1);
      }
    }

    // Check if column note corresponds to feeType2
    if (note && templeInfo?.feeType2 && note.includes(templeInfo.feeType2.trim())) {
      if (h.fee2Amount !== undefined && h.fee2Amount !== null && Number(h.fee2Amount) > 0) {
        return Number(h.fee2Amount);
      }
      if (h.fee2 !== undefined && h.fee2 !== null && Number(h.fee2) > 0) {
        return Number(h.fee2);
      }
    }

    // Check if column note corresponds to feeType3
    if (note && templeInfo?.feeType3 && note.includes(templeInfo.feeType3.trim())) {
      if (h.fee3Amount !== undefined && h.fee3Amount !== null && Number(h.fee3Amount) > 0) {
        return Number(h.fee3Amount);
      }
      if (h.fee3 !== undefined && h.fee3 !== null && Number(h.fee3) > 0) {
        return Number(h.fee3);
      }
    }

    // Fallback: column 2 often matches fee1, column 3 matches fee2 if feeTypes not strictly set
    if (colIndex === 2 && (note.includes('護持会費') || note.includes('会費'))) {
      if (h.fee1Amount !== undefined && h.fee1Amount !== null && Number(h.fee1Amount) > 0) {
        return Number(h.fee1Amount);
      }
    }
    if (colIndex === 3 && (note.includes('墓地') || note.includes('管理費'))) {
      if (h.fee2Amount !== undefined && h.fee2Amount !== null && Number(h.fee2Amount) > 0) {
        return Number(h.fee2Amount);
      }
    }

    return globalDefault;
  };

  // Toggle Check 1
  const handleToggleCheck1 = (household: Household) => {
    const householdId = household.id;
    setEntries((prev) => {
      const current = prev[householdId] || {
        householdId,
        check1: false,
        amount1: '',
        check2: false,
        amount2: '',
        check3: false,
        amount3: '',
      };
      const nextCheck = !current.check1;
      const autoAmt = getHouseholdDefaultAmount(household, 1);
      return {
        ...prev,
        [householdId]: {
          ...current,
          check1: nextCheck,
          amount1: nextCheck ? (autoAmt !== '' ? autoAmt : '') : '',
        },
      };
    });
  };

  // Toggle Check 2
  const handleToggleCheck2 = (household: Household) => {
    const householdId = household.id;
    setEntries((prev) => {
      const current = prev[householdId] || {
        householdId,
        check1: false,
        amount1: '',
        check2: false,
        amount2: '',
        check3: false,
        amount3: '',
      };
      const nextCheck = !current.check2;
      const autoAmt = getHouseholdDefaultAmount(household, 2);
      return {
        ...prev,
        [householdId]: {
          ...current,
          check2: nextCheck,
          amount2: nextCheck ? (autoAmt !== '' ? autoAmt : '') : '',
        },
      };
    });
  };

  // Toggle Check 3
  const handleToggleCheck3 = (household: Household) => {
    const householdId = household.id;
    setEntries((prev) => {
      const current = prev[householdId] || {
        householdId,
        check1: false,
        amount1: '',
        check2: false,
        amount2: '',
        check3: false,
        amount3: '',
      };
      const nextCheck = !current.check3;
      const autoAmt = getHouseholdDefaultAmount(household, 3);
      return {
        ...prev,
        [householdId]: {
          ...current,
          check3: nextCheck,
          amount3: nextCheck ? (autoAmt !== '' ? autoAmt : '') : '',
        },
      };
    });
  };

  // Change custom amount 1
  const handleChangeAmount1 = (householdId: string, val: string) => {
    const num = val === '' ? '' : Number(val);
    setEntries((prev) => {
      const current = prev[householdId] || {
        householdId,
        check1: true,
        amount1: '',
        check2: false,
        amount2: '',
        check3: false,
        amount3: '',
      };
      return {
        ...prev,
        [householdId]: {
          ...current,
          check1: num !== '' && num > 0 ? true : current.check1,
          amount1: num,
        },
      };
    });
  };

  // Change custom amount 2
  const handleChangeAmount2 = (householdId: string, val: string) => {
    const num = val === '' ? '' : Number(val);
    setEntries((prev) => {
      const current = prev[householdId] || {
        householdId,
        check1: false,
        amount1: '',
        check2: true,
        amount2: '',
        check3: false,
        amount3: '',
      };
      return {
        ...prev,
        [householdId]: {
          ...current,
          check2: num !== '' && num > 0 ? true : current.check2,
          amount2: num,
        },
      };
    });
  };

  // Change custom amount 3
  const handleChangeAmount3 = (householdId: string, val: string) => {
    const num = val === '' ? '' : Number(val);
    setEntries((prev) => {
      const current = prev[householdId] || {
        householdId,
        check1: false,
        amount1: '',
        check2: false,
        amount2: '',
        check3: true,
        amount3: '',
      };
      return {
        ...prev,
        [householdId]: {
          ...current,
          check3: num !== '' && num > 0 ? true : current.check3,
          amount3: num,
        },
      };
    });
  };

  // Reset a specific household's entry
  const handleClearHousehold = (householdId: string) => {
    setEntries((prev) => {
      const next = { ...prev };
      delete next[householdId];
      return next;
    });
    setHasUnsavedChanges(true);
  };

  // Clear all entries immediately without warning (clears local state entries & storage; config remains intact)
  const handleClearAllEntries = () => {
    setEntries({});
    clearBatchAccountingEntries(templeInfo?.id);
    const updatedData: BatchAccountingData = {
      ...getCurrentBatchData(),
      entries: {},
      lastSavedAt: new Date().toISOString(),
    };
    saveBatchAccountingConfig({
      id: `config-${updatedData.templeId || 'temple-main'}`,
      configDate: updatedData.configDate,
      cat1: updatedData.cat1,
      notes1: updatedData.notes1,
      defaultAmount1: updatedData.defaultAmount1,
      cat2: updatedData.cat2,
      notes2: updatedData.notes2,
      defaultAmount2: updatedData.defaultAmount2,
      cat3: updatedData.cat3,
      notes3: updatedData.notes3,
      defaultAmount3: updatedData.defaultAmount3,
      appliedPreset: updatedData.appliedPreset,
      templeId: updatedData.templeId,
      lastSavedAt: updatedData.lastSavedAt,
    });
    if (onSaveBatchData) {
      onSaveBatchData(updatedData);
    }
    setHasUnsavedChanges(false);
    setLastSavedAt(null);
    setIsSuccessToast('入力データ（受付チェック・金額）を全クリアしました。');
    setTimeout(() => {
      setIsSuccessToast(null);
    }, 3000);
  };

  // Column active flags (Column is active only if notes is not blank)
  const isCol1Active = Boolean(notes1 && notes1.trim());
  const isCol2Active = Boolean(notes2 && notes2.trim());
  const isCol3Active = Boolean(notes3 && notes3.trim());
  const activeColCount = (isCol1Active ? 1 : 0) + (isCol2Active ? 1 : 0) + (isCol3Active ? 1 : 0);

  // Filtered Households
  const filteredHouseholds = useMemo(() => {
    const query = (searchTerm || '').trim().toLowerCase();

    const filtered = households.filter((h) => {
      // 1. Search Query
      if (query) {
        const nameMatch = (h.familyHead || '').toLowerCase().includes(query);
        const kanaMatch = (h.furigana || '').toLowerCase().includes(query);
        const idMatch = (h.id || '').toLowerCase().includes(query);
        const typeMatch = (h.householdType || '').toLowerCase().includes(query);
        const statusMatch = (h.status || '').toLowerCase().includes(query);
        const districtMatch = (h.district || '').toLowerCase().includes(query);
        const notesMatch = (h.notes || '').toLowerCase().includes(query);
        
        // 施餓鬼塔婆・棚経検索
        const segakiHeadMatch = (h.segakiTamegaki || '').toLowerCase().includes(query) || (h.isSegakiToba && '施餓鬼塔婆'.includes(query));
        const segakiMemberMatch = h.familyMembers?.some(m => 
          (m.name || '').toLowerCase().includes(query) ||
          (m.segakiTamegaki || '').toLowerCase().includes(query) ||
          (m.isSegakiToba && '施餓鬼塔婆'.includes(query))
        );
        const tanagyoMatch = (h.tanagyoAddress || '').toLowerCase().includes(query) ||
          (h.tanagyoNotes || '').toLowerCase().includes(query) ||
          (h.tanagyoMonthlyVisit && '棚経'.includes(query));

        const matchesQuery = nameMatch || kanaMatch || idMatch || typeMatch || statusMatch || districtMatch || notesMatch || segakiHeadMatch || segakiMemberMatch || tanagyoMatch;
        if (!matchesQuery) return false;
      }

      // 2. Kana Index Filter
      if (selectedKana !== 'すべて') {
        const group = KANA_GROUPS.find((g) => g.label === selectedKana);
        if (group && group.chars.length > 0) {
          const firstChar = (h.furigana || h.familyHead || '').charAt(0);
          if (!group.chars.includes(firstChar)) {
            return false;
          }
        }
      }

      // 3. Quick Type Filter
      if (filterType === 'segakiOnly') {
        const hasSegaki = h.isSegakiToba || h.familyMembers?.some((m) => m.isSegakiToba);
        if (!hasSegaki) return false;
      } else if (filterType === 'tanagyoOnly') {
        if (!h.tanagyoMonthlyVisit) return false;
      } else if (filterType === 'enteredOnly') {
        const entry = entries[h.id];
        const isEntered = entry && (
          (isCol1Active && entry.check1 && entry.amount1 !== '') ||
          (isCol2Active && entry.check2 && entry.amount2 !== '') ||
          (isCol3Active && entry.check3 && entry.amount3 !== '')
        );
        if (!isEntered) return false;
      }

      return true;
    });

    // 必ず五十音順（ふりがな順、未設定時は世帯主名）にソート
    return filtered.sort((a, b) => {
      const furiganaA = (a.furigana || a.familyHead || '').trim();
      const furiganaB = (b.furigana || b.familyHead || '').trim();
      return furiganaA.localeCompare(furiganaB, 'ja');
    });
  }, [households, searchTerm, selectedKana, filterType, entries, isCol1Active, isCol2Active, isCol3Active]);

  // Calculate Active Summary for all entries
  const generatedRecordsSummary = useMemo(() => {
    let count1 = 0;
    let sum1 = 0;
    let count2 = 0;
    let sum2 = 0;
    let count3 = 0;
    let sum3 = 0;
    const recordsToCreate: {
      household: Household;
      category: string;
      notes: string;
      amount: number;
    }[] = [];

    Object.entries(entries).forEach(([householdId, entry]) => {
      const hh = households.find((h) => h.id === householdId);
      if (!hh) return;

      if (isCol1Active && entry.check1 && typeof entry.amount1 === 'number' && entry.amount1 > 0) {
        count1++;
        sum1 += entry.amount1;
        recordsToCreate.push({
          household: hh,
          category: cat1 || '法要布施',
          notes: notes1.trim(),
          amount: entry.amount1,
        });
      }

      if (isCol2Active && entry.check2 && typeof entry.amount2 === 'number' && entry.amount2 > 0) {
        count2++;
        sum2 += entry.amount2;
        recordsToCreate.push({
          household: hh,
          category: cat2 || '護持会費',
          notes: notes2.trim(),
          amount: entry.amount2,
        });
      }

      if (isCol3Active && entry.check3 && typeof entry.amount3 === 'number' && entry.amount3 > 0) {
        count3++;
        sum3 += entry.amount3;
        recordsToCreate.push({
          household: hh,
          category: cat3 || '特別寄付',
          notes: notes3.trim(),
          amount: entry.amount3,
        });
      }
    });

    const totalCount = count1 + count2 + count3;
    const totalSum = sum1 + sum2 + sum3;

    return {
      count1,
      sum1,
      count2,
      sum2,
      count3,
      sum3,
      totalCount,
      totalSum,
      recordsToCreate,
    };
  }, [entries, households, cat1, notes1, cat2, notes2, cat3, notes3, isCol1Active, isCol2Active, isCol3Active]);

  // Execute Batch Creation directly without warning
  const handleExecuteBatch = () => {
    if (generatedRecordsSummary.recordsToCreate.length === 0) {
      return;
    }

    const dateOptions: NormalizeDateOptions = {
      mode: 'accounting',
      fiscalStartMonth: templeInfo?.fiscalYearStartMonth ?? 4,
    };
    const normalizedDate = normalizeDateInput(configDate, dateOptions) || new Date().toISOString().slice(0, 10).replace(/-/g, '/');

    const newTransactions: Transaction[] = generatedRecordsSummary.recordsToCreate.map((item, index) => {
      const ts = Date.now();
      const rand = Math.random().toString(36).slice(2, 7);
      return {
        id: `TX-${ts}-${rand}-${index + 1}`,
        templeId: item.household.templeId || templeInfo.id || 'temple-main',
        date: normalizedDate,
        householdId: item.household.id,
        householdHeadName: item.household.familyHead,
        category: item.category as TransactionCategory,
        type: '収入',
        amount: item.amount,
        paymentMethod: '現金受付',
        receiptNumber: `R-${normalizedDate.replace(/\//g, '').slice(2)}-${String(ts).slice(-4)}-${index + 1}`,
        notes: item.notes,
      };
    });

    onAddBatchTransactions(newTransactions);

    // Clear entries on successful execution, while preserving the configuration
    clearBatchAccountingEntries(templeInfo?.id);
    const updatedData: BatchAccountingData = {
      ...getCurrentBatchData(),
      entries: {},
      lastSavedAt: new Date().toISOString(),
    };
    saveBatchAccountingConfig({
      id: `config-${updatedData.templeId || 'temple-main'}`,
      configDate: updatedData.configDate,
      cat1: updatedData.cat1,
      notes1: updatedData.notes1,
      defaultAmount1: updatedData.defaultAmount1,
      cat2: updatedData.cat2,
      notes2: updatedData.notes2,
      defaultAmount2: updatedData.defaultAmount2,
      cat3: updatedData.cat3,
      notes3: updatedData.notes3,
      defaultAmount3: updatedData.defaultAmount3,
      appliedPreset: updatedData.appliedPreset,
      templeId: updatedData.templeId,
      lastSavedAt: updatedData.lastSavedAt,
    });
    if (onSaveBatchData) {
      onSaveBatchData(updatedData);
    }

    setEntries({});
    setHasUnsavedChanges(false);
    setLastSavedAt(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto font-serif">
      <div className="bg-[#F9F7F2] w-full max-w-7xl max-h-[96vh] flex flex-col border border-[#D4AF37] shadow-2xl overflow-hidden rounded-xs">
        
        {/* Modal Header */}
        <div className="bg-[#1A1A1A] border-b border-[#D4AF37] px-4 py-3 text-[#F9F7F2] flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-[#D4AF37] text-[#1A1A1A] flex items-center justify-center font-bold font-sans text-sm">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg sm:text-xl font-bold tracking-wider text-[#F9F7F2]">
                  一括会計処理
                </h3>
                <span className="px-2 py-0.5 bg-[#D4AF37]/20 border border-[#D4AF37]/40 text-[#D4AF37] text-xs font-sans font-bold">
                  寺院集金項目連動
                </span>
              </div>
              <p className="text-xs text-[#CCCCCC] font-sans mt-0.5">
                入力中は快適に作業できるようGoogleシート連携は行われません。「保存して閉じる」または「☓」実行時にGoogleシートへ自動連携されます。
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2 font-sans">
            {lastSavedAt && (
              <span className="hidden sm:inline-flex items-center space-x-1 text-[11px] text-[#A0A0A0] bg-[#2A2A2A] px-2 py-1 border border-[#444] rounded-xs">
                <Clock className="w-3 h-3 text-[#D4AF37]" />
                <span>端末保存済 ({lastSavedAt})</span>
              </span>
            )}

            <button
              onClick={handleCloseModal}
              className="p-1.5 text-[#CCCCCC] hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              title="保存して閉じる"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Top Success Notification Banner */}
        {isSuccessToast && (
          <div className="bg-emerald-900 border-b border-emerald-500 text-emerald-100 px-4 py-2 text-sm flex items-center justify-between font-sans shrink-0 animate-fadeIn">
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              <span className="font-bold">{isSuccessToast}</span>
            </div>
            <button 
              onClick={() => setIsSuccessToast(null)}
              className="text-xs text-emerald-300 hover:text-white underline cursor-pointer"
            >
              閉じる
            </button>
          </div>
        )}

        {/* Preset Selector Bar */}
        <div className="bg-[#1F1F1F] border-b border-[#3A3A3A] px-4 py-2 flex flex-wrap items-center justify-between gap-2 font-sans text-xs">
          <div className="flex items-center space-x-2 text-gray-300">
            <Sparkles className="w-3.5 h-3.5 text-[#D4AF37]" />
            <span className="font-bold text-white">受付項目プリセット切替:</span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {(templeInfo?.feeType1 || templeInfo?.feeType2 || templeInfo?.feeType3) && (
              <button
                type="button"
                onClick={handleApplyTempleFeesPreset}
                className={`px-2.5 py-1 text-xs font-bold border transition-colors flex items-center space-x-1 cursor-pointer rounded-xs ${
                  appliedPreset === 'temple_fees'
                    ? 'bg-[#D4AF37] text-[#1A1A1A] border-[#D4AF37]'
                    : 'bg-[#2A2A2A] text-[#D4AF37] border-[#D4AF37]/60 hover:bg-[#333]'
                }`}
                title="寺院設定で登録されている集金項目（護持会費・墓地管理費等）をそのまま3枠に読み込みます"
              >
                <Building2 className="w-3 h-3" />
                <span>🏛️ 寺院設定の集金項目を読み込む（{templeInfo.feeType1 || '項目1'}{templeInfo.feeType2 ? `・${templeInfo.feeType2}` : ''}）</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleApplySegakiPreset}
              className={`px-2.5 py-1 text-xs font-bold border transition-colors flex items-center space-x-1 cursor-pointer rounded-xs ${
                appliedPreset === 'segaki'
                  ? 'bg-[#D4AF37] text-[#1A1A1A] border-[#D4AF37]'
                  : 'bg-[#2A2A2A] text-gray-300 border-gray-600 hover:bg-[#333]'
              }`}
            >
              <span>🎋 施餓鬼塔婆 ＋ 護持会費</span>
            </button>

            <button
              type="button"
              onClick={handleApplyHiganPreset}
              className={`px-2.5 py-1 text-xs font-bold border transition-colors flex items-center space-x-1 cursor-pointer rounded-xs ${
                appliedPreset === 'higan'
                  ? 'bg-[#D4AF37] text-[#1A1A1A] border-[#D4AF37]'
                  : 'bg-[#2A2A2A] text-gray-300 border-gray-600 hover:bg-[#333]'
              }`}
            >
              <span>🌸 彼岸会法要 ＋ 護持会費</span>
            </button>
          </div>
        </div>

        {/* 1. TOP CONFIGURATION BAR (設定バー: 日付・科目1・摘要1・金額1・科目2・摘要2・金額2・科目3・摘要3・金額3 ＆ 全入金処理ボタン) */}
        <div className="bg-[#242424] text-[#F9F7F2] p-3 border-b-2 border-[#D4AF37] font-sans shrink-0 shadow-md">
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
            
            {/* Left/Middle: Date & 3 Preset Columns (順番: 日付 科目1 摘要1 金額1 科目2 摘要2 金額2 科目3 摘要3 金額3) */}
            <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-10 gap-2 items-end">
              
              {/* 日付 */}
              <div className="space-y-1 lg:col-span-1">
                <label className="text-[11px] font-bold text-[#D4AF37] block">
                  ① 受付日付
                </label>
                <input
                  type="text"
                  value={configDate}
                  onChange={(e) => {
                    setConfigDate(e.target.value);
                    setHasUnsavedChanges(true);
                  }}
                  placeholder="令和8年8月21日"
                  className="w-full bg-[#1A1A1A] border border-[#555] text-white px-2 py-1.5 text-xs focus:border-[#D4AF37] focus:outline-none"
                />
              </div>

              {/* 科目１ */}
              <div className="space-y-1 lg:col-span-1">
                <label className="text-[11px] font-bold text-amber-300 block truncate" title="科目１（勘定科目）">
                  科目１（勘定科目）
                </label>
                <select
                  value={cat1}
                  onChange={(e) => {
                    setCat1(e.target.value);
                    setAppliedPreset('custom');
                    setHasUnsavedChanges(true);
                  }}
                  className="w-full bg-[#1A1A1A] border border-[#555] text-white px-1.5 py-1.5 text-xs focus:border-[#D4AF37] focus:outline-none"
                >
                  {incomeCategories.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              {/* 摘要１ */}
              <div className="space-y-1 lg:col-span-1">
                <label className="text-[11px] font-bold text-amber-300 block truncate" title="摘要１">
                  摘要１
                </label>
                <input
                  type="text"
                  value={notes1}
                  onChange={(e) => {
                    const val = e.target.value;
                    setNotes1(val);
                    setAppliedPreset('custom');
                    setHasUnsavedChanges(true);
                    const autoCat = resolveCategoryForFee(val, cat1);
                    if (autoCat !== cat1) setCat1(autoCat);
                  }}
                  placeholder="施餓鬼塔婆料（空欄で非表示）"
                  className="w-full bg-[#1A1A1A] border border-[#555] text-white px-2 py-1.5 text-xs focus:border-[#D4AF37] focus:outline-none"
                />
              </div>

              {/* 金額１ */}
              <div className="space-y-1 lg:col-span-1">
                <label className="text-[11px] font-bold text-amber-300 block truncate" title="金額１(初期値)">
                  金額１ (円)
                </label>
                <input
                  type="number"
                  value={defaultAmount1}
                  onChange={(e) => {
                    setDefaultAmount1(e.target.value === '' ? '' : Number(e.target.value));
                    setAppliedPreset('custom');
                    setHasUnsavedChanges(true);
                  }}
                  placeholder="3000"
                  step="1000"
                  className="w-full bg-[#1A1A1A] border border-[#555] text-white px-2 py-1.5 text-xs font-mono font-bold focus:border-[#D4AF37] focus:outline-none"
                />
              </div>

              {/* 科目２ */}
              <div className="space-y-1 lg:col-span-1">
                <label className="text-[11px] font-bold text-sky-300 block truncate" title="科目２（勘定科目）">
                  科目２（勘定科目）
                </label>
                <select
                  value={cat2}
                  onChange={(e) => {
                    setCat2(e.target.value);
                    setAppliedPreset('custom');
                    setHasUnsavedChanges(true);
                  }}
                  className="w-full bg-[#1A1A1A] border border-[#555] text-white px-1.5 py-1.5 text-xs focus:border-[#D4AF37] focus:outline-none"
                >
                  {incomeCategories.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              {/* 摘要２ */}
              <div className="space-y-1 lg:col-span-1">
                <label className="text-[11px] font-bold text-sky-300 block truncate" title="摘要２">
                  摘要２
                </label>
                <input
                  type="text"
                  value={notes2}
                  onChange={(e) => {
                    const val = e.target.value;
                    setNotes2(val);
                    setAppliedPreset('custom');
                    setHasUnsavedChanges(true);
                    const autoCat = resolveCategoryForFee(val, cat2);
                    if (autoCat !== cat2) setCat2(autoCat);
                  }}
                  placeholder="護持会費（空欄で非表示）"
                  className="w-full bg-[#1A1A1A] border border-[#555] text-white px-2 py-1.5 text-xs focus:border-[#D4AF37] focus:outline-none"
                />
              </div>

              {/* 金額２ */}
              <div className="space-y-1 lg:col-span-1">
                <label className="text-[11px] font-bold text-sky-300 block truncate" title="金額２(初期値)">
                  金額２ (円)
                </label>
                <input
                  type="number"
                  value={defaultAmount2}
                  onChange={(e) => {
                    setDefaultAmount2(e.target.value === '' ? '' : Number(e.target.value));
                    setAppliedPreset('custom');
                    setHasUnsavedChanges(true);
                  }}
                  placeholder="5000"
                  step="1000"
                  className="w-full bg-[#1A1A1A] border border-[#555] text-white px-2 py-1.5 text-xs font-mono font-bold focus:border-[#D4AF37] focus:outline-none"
                />
              </div>

              {/* 科目３ */}
              <div className="space-y-1 lg:col-span-1">
                <label className="text-[11px] font-bold text-emerald-300 block truncate" title="科目３（勘定科目）">
                  科目３（勘定科目）
                </label>
                <select
                  value={cat3}
                  onChange={(e) => {
                    setCat3(e.target.value);
                    setAppliedPreset('custom');
                    setHasUnsavedChanges(true);
                  }}
                  className="w-full bg-[#1A1A1A] border border-[#555] text-white px-1.5 py-1.5 text-xs focus:border-[#D4AF37] focus:outline-none"
                >
                  {incomeCategories.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              {/* 摘要３ */}
              <div className="space-y-1 lg:col-span-1">
                <label className="text-[11px] font-bold text-emerald-300 block truncate" title="摘要３">
                  摘要３
                </label>
                <input
                  type="text"
                  value={notes3}
                  onChange={(e) => {
                    const val = e.target.value;
                    setNotes3(val);
                    setAppliedPreset('custom');
                    setHasUnsavedChanges(true);
                    const autoCat = resolveCategoryForFee(val, cat3);
                    if (autoCat !== cat3) setCat3(autoCat);
                  }}
                  placeholder="特別寄付（空欄で非表示）"
                  className="w-full bg-[#1A1A1A] border border-[#555] text-white px-2 py-1.5 text-xs focus:border-[#D4AF37] focus:outline-none"
                />
              </div>

              {/* 金額３ */}
              <div className="space-y-1 lg:col-span-1">
                <label className="text-[11px] font-bold text-emerald-300 block truncate" title="金額３(初期値)">
                  金額３ (円)
                </label>
                <input
                  type="number"
                  value={defaultAmount3}
                  onChange={(e) => {
                    setDefaultAmount3(e.target.value === '' ? '' : Number(e.target.value));
                    setAppliedPreset('custom');
                    setHasUnsavedChanges(true);
                  }}
                  placeholder="3000"
                  step="1000"
                  className="w-full bg-[#1A1A1A] border border-[#555] text-white px-2 py-1.5 text-xs font-mono font-bold focus:border-[#D4AF37] focus:outline-none"
                />
              </div>

            </div>

            {/* Right: 「全入金処理」ボタン */}
            <div className="flex items-center space-x-2 shrink-0 self-end lg:self-center">
              <button
                type="button"
                onClick={handleExecuteBatch}
                disabled={generatedRecordsSummary.recordsToCreate.length === 0}
                className={`px-4 py-2.5 font-bold text-sm tracking-wider flex items-center space-x-2 shadow-lg transition-all cursor-pointer ${
                  generatedRecordsSummary.recordsToCreate.length > 0
                    ? 'bg-[#D4AF37] hover:bg-[#c29f2f] text-[#1A1A1A] hover:scale-[1.02]'
                    : 'bg-[#444] text-[#888] cursor-not-allowed'
                }`}
              >
                <CheckCircle2 className="w-5 h-5" />
                <span>全入金処理</span>
                <span className="ml-1 px-2 py-0.5 bg-[#1A1A1A] text-[#D4AF37] text-xs font-mono rounded-xs">
                  {generatedRecordsSummary.totalCount}件 / {formatCurrency(generatedRecordsSummary.totalSum)}
                </span>
              </button>
            </div>

          </div>
        </div>

        {/* 2. SEARCH & FIFTY-SOUNDS (五十音) INDEX BAR */}
        <div className="bg-[#EFECE6] border-b border-[#D1CEC7] p-2.5 sm:px-4 sm:py-2.5 font-sans shrink-0 space-y-2">
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2">
            
            {/* Search Box */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-[#777]" />
              <input
                type="text"
                placeholder="施主名・檀家ID・区分1・区分2・施餓鬼塔婆・棚経・備考などで検索..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-white border border-[#D1CEC7] pl-9 pr-8 py-1.5 text-sm text-[#1A1A1A] focus:border-[#1A1A1A] focus:outline-none"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2.5 top-2 text-[#999] hover:text-[#333]"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Quick Filter Tabs */}
            <div className="flex items-center space-x-1 text-xs">
              <button
                type="button"
                onClick={() => setFilterType('all')}
                className={`px-2.5 py-1.5 border transition-colors cursor-pointer font-bold ${
                  filterType === 'all'
                    ? 'bg-[#1A1A1A] text-white border-[#1A1A1A]'
                    : 'bg-white text-[#555] border-[#D1CEC7] hover:bg-gray-50'
                }`}
              >
                全檀家 ({households.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterType('segakiOnly')}
                className={`px-2.5 py-1.5 border transition-colors cursor-pointer font-bold ${
                  filterType === 'segakiOnly'
                    ? 'bg-amber-800 text-white border-amber-800'
                    : 'bg-white text-amber-900 border-[#D1CEC7] hover:bg-amber-50'
                }`}
              >
                施餓鬼塔婆対象
              </button>
              <button
                type="button"
                onClick={() => setFilterType('tanagyoOnly')}
                className={`px-2.5 py-1.5 border transition-colors cursor-pointer font-bold ${
                  filterType === 'tanagyoOnly'
                    ? 'bg-emerald-800 text-white border-emerald-800'
                    : 'bg-white text-emerald-900 border-[#D1CEC7] hover:bg-emerald-50'
                }`}
              >
                棚経対象
              </button>
              <button
                type="button"
                onClick={() => setFilterType('enteredOnly')}
                className={`px-2.5 py-1.5 border transition-colors cursor-pointer font-bold ${
                  filterType === 'enteredOnly'
                    ? 'bg-indigo-800 text-white border-indigo-800'
                    : 'bg-white text-indigo-900 border-[#D1CEC7] hover:bg-indigo-50'
                }`}
              >
                受付入力中のみ ({Object.keys(entries).length})
              </button>
            </div>
          </div>

          {/* Fifty-Sounds (五十音順) Index */}
          <div className="flex flex-wrap items-center gap-1 pt-1 border-t border-[#D1CEC7]/60">
            <span className="text-[11px] text-[#666] font-bold mr-1">五十音:</span>
            {KANA_GROUPS.map((g) => (
              <button
                key={g.label}
                type="button"
                onClick={() => setSelectedKana(g.label)}
                className={`px-2 py-0.5 text-xs font-bold transition-all cursor-pointer rounded-xs ${
                  selectedKana === g.label
                    ? 'bg-[#D4AF37] text-[#1A1A1A] shadow-xs'
                    : 'bg-white text-[#444] border border-[#D1CEC7] hover:bg-gray-100'
                }`}
              >
                {g.label}
              </button>
            ))}
            <span className="text-xs text-[#777] ml-auto">
              表示中: <strong className="text-[#1A1A1A]">{filteredHouseholds.length}</strong> 件
            </span>
          </div>
        </div>

        {/* 3. ROBUST RECEPTION LEDGER TABLE (項目名: 施主名 / 摘要1 / 摘要2 / 摘要3 / 世帯合計) */}
        <div className="flex-1 overflow-y-auto p-2 sm:p-4 font-serif bg-white">
          <div className="border border-[#D1CEC7] shadow-xs overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs sm:text-sm">
              <thead className="bg-[#1A1A1A] text-[#F9F7F2] sticky top-0 z-10 font-sans select-none">
                <tr>
                  <th className="py-2.5 px-3 border-r border-[#333] font-bold min-w-[220px]">
                    施主名 (檀家情報)
                  </th>
                  {isCol1Active && (
                    <th className="py-2.5 px-3 border-r border-[#333] font-bold min-w-[190px] bg-amber-950/60 text-amber-200">
                      <div className="flex items-center justify-between">
                        <span className="truncate">{notes1.trim()}</span>
                        <span className="text-[11px] font-bold px-1.5 py-0.2 bg-amber-900/80 text-amber-200 rounded-2xs border border-amber-700/50">
                          {cat1}
                        </span>
                      </div>
                    </th>
                  )}
                  {isCol2Active && (
                    <th className="py-2.5 px-3 border-r border-[#333] font-bold min-w-[190px] bg-sky-950/60 text-sky-200">
                      <div className="flex items-center justify-between">
                        <span className="truncate">{notes2.trim()}</span>
                        <span className="text-[11px] font-bold px-1.5 py-0.2 bg-sky-900/80 text-sky-200 rounded-2xs border border-sky-700/50">
                          {cat2}
                        </span>
                      </div>
                    </th>
                  )}
                  {isCol3Active && (
                    <th className="py-2.5 px-3 border-r border-[#333] font-bold min-w-[190px] bg-emerald-950/60 text-emerald-200">
                      <div className="flex items-center justify-between">
                        <span className="truncate">{notes3.trim()}</span>
                        <span className="text-[11px] font-bold px-1.5 py-0.2 bg-emerald-900/80 text-emerald-200 rounded-2xs border border-emerald-700/50">
                          {cat3}
                        </span>
                      </div>
                    </th>
                  )}
                  {activeColCount === 0 && (
                    <th className="py-2.5 px-3 border-r border-[#333] font-normal text-gray-400 text-center">
                      項目未設定（上部の設定バーで摘要名を入力してください）
                    </th>
                  )}
                  <th className="py-2.5 px-3 font-bold min-w-[130px] text-right">
                    世帯合計
                  </th>
                  <th className="py-2.5 px-2 font-bold w-12 text-center">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E0D8]">
                {filteredHouseholds.length === 0 ? (
                  <tr>
                    <td colSpan={activeColCount === 0 ? 3 : activeColCount + 3} className="py-12 text-center text-[#888] font-sans">
                      <Users className="w-8 h-8 mx-auto mb-2 text-[#BBB]" />
                      該当する檀信徒が見つかりませんでした。
                    </td>
                  </tr>
                ) : (
                  filteredHouseholds.map((h, index) => {
                    const entry = entries[h.id] || {
                      householdId: h.id,
                      check1: false,
                      amount1: '',
                      check2: false,
                      amount2: '',
                      check3: false,
                      amount3: '',
                    };

                    const amt1 = isCol1Active && typeof entry.amount1 === 'number' && entry.check1 ? entry.amount1 : 0;
                    const amt2 = isCol2Active && typeof entry.amount2 === 'number' && entry.check2 ? entry.amount2 : 0;
                    const amt3 = isCol3Active && typeof entry.amount3 === 'number' && entry.check3 ? entry.amount3 : 0;
                    const rowTotal = amt1 + amt2 + amt3;
                    const isRowActive = rowTotal > 0 || (isCol1Active && entry.check1) || (isCol2Active && entry.check2) || (isCol3Active && entry.check3);

                    const indAmt1 = getHouseholdDefaultAmount(h, 1);
                    const indAmt2 = getHouseholdDefaultAmount(h, 2);
                    const indAmt3 = getHouseholdDefaultAmount(h, 3);

                    const hasCustomFee1 = indAmt1 !== '' && indAmt1 !== defaultAmount1;
                    const hasCustomFee2 = indAmt2 !== '' && indAmt2 !== defaultAmount2;
                    const hasCustomFee3 = indAmt3 !== '' && indAmt3 !== defaultAmount3;

                    return (
                      <tr 
                        key={h.id}
                        className={`transition-colors ${
                          isRowActive 
                            ? 'bg-amber-50/70 hover:bg-amber-100/60' 
                            : index % 2 === 0 ? 'bg-white hover:bg-[#F9F7F2]' : 'bg-[#FAF8F5] hover:bg-[#F2EFE9]'
                        }`}
                      >
                        {/* 1. 施主名 & 檀家詳細 */}
                        <td className="py-2.5 px-3 border-r border-[#E5E0D8] align-middle">
                          <div className="flex items-start justify-between gap-1.5">
                            <div>
                              <div className="text-[11px] text-[#777] font-sans leading-none mb-0.5">
                                {h.furigana || '　'}
                              </div>
                              <div className="font-bold text-sm text-[#1A1A1A] flex items-center gap-1.5">
                                <span>{h.familyHead}</span>
                                {h.district && (
                                  <span className="text-[10px] font-sans px-1.5 py-0.2 bg-gray-200 text-gray-700 font-normal rounded-xs">
                                    {h.district}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-1 mt-1 text-[10px] font-sans text-[#666]">
                                <span className="font-mono bg-[#EAE7E0] px-1 py-0.2 rounded-xs text-[#444]">
                                  {h.id}
                                </span>
                                {h.householdType && (
                                  <span className="px-1 py-0.2 border border-gray-300 text-gray-600 rounded-xs">
                                    {h.householdType}
                                  </span>
                                )}
                                {h.status && h.status !== '正常' && (
                                  <span className="px-1 py-0.2 bg-amber-100 text-amber-800 rounded-xs">
                                    {h.status}
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* 施餓鬼塔婆 / 棚経バッジ */}
                            <div className="flex flex-col items-end gap-1 shrink-0 font-sans">
                              {(h.isSegakiToba || h.familyMembers?.some(m => m.isSegakiToba)) && (
                                <span className="text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-900 border border-amber-300 font-bold rounded-xs flex items-center gap-0.5">
                                  <span>塔婆あり</span>
                                </span>
                              )}
                              {h.tanagyoMonthlyVisit && (
                                <span className="text-[10px] px-1.5 py-0.5 bg-emerald-100 text-emerald-900 border border-emerald-300 font-bold rounded-xs flex items-center gap-0.5">
                                  <span>棚経あり</span>
                                </span>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* 2. 項目１ (チェックボックス + 金額入力) */}
                        {isCol1Active && (
                          <td className="py-2 px-3 border-r border-[#E5E0D8] align-middle bg-amber-50/30">
                            <div className="space-y-1">
                              <div className="flex items-center space-x-2">
                                <label className="flex items-center cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={entry.check1}
                                    onChange={() => handleToggleCheck1(h)}
                                    className="w-4 h-4 text-amber-600 focus:ring-amber-500 border-gray-300 rounded-xs cursor-pointer"
                                  />
                                </label>
                                <div className="relative flex-1">
                                  <span className="absolute left-2 top-1.5 text-xs text-gray-500 font-mono">¥</span>
                                  <input
                                    type="number"
                                    step="1000"
                                    value={entry.amount1}
                                    onChange={(e) => handleChangeAmount1(h.id, e.target.value)}
                                    placeholder={indAmt1 !== '' ? String(indAmt1) : (defaultAmount1 !== '' ? String(defaultAmount1) : '金額')}
                                    className={`w-full pl-6 pr-2 py-1 text-xs font-mono font-bold border transition-colors ${
                                      entry.check1
                                        ? 'bg-white border-amber-500 text-[#1A1A1A] shadow-xs'
                                        : 'bg-transparent border-gray-200 text-gray-400 focus:bg-white focus:text-[#1A1A1A]'
                                    } focus:outline-none focus:border-amber-600`}
                                  />
                                </div>
                              </div>
                              {hasCustomFee1 && (
                                <div className="text-[10px] font-sans text-amber-800 flex items-center gap-1 pl-6">
                                  <Coins className="w-2.5 h-2.5" />
                                  <span>個別金額: {formatCurrency(Number(indAmt1))}</span>
                                </div>
                              )}
                            </div>
                          </td>
                        )}

                        {/* 3. 項目２ (チェックボックス + 金額入力) */}
                        {isCol2Active && (
                          <td className="py-2 px-3 border-r border-[#E5E0D8] align-middle bg-sky-50/30">
                            <div className="space-y-1">
                              <div className="flex items-center space-x-2">
                                <label className="flex items-center cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={entry.check2}
                                    onChange={() => handleToggleCheck2(h)}
                                    className="w-4 h-4 text-sky-600 focus:ring-sky-500 border-gray-300 rounded-xs cursor-pointer"
                                  />
                                </label>
                                <div className="relative flex-1">
                                  <span className="absolute left-2 top-1.5 text-xs text-gray-500 font-mono">¥</span>
                                  <input
                                    type="number"
                                    step="1000"
                                    value={entry.amount2}
                                    onChange={(e) => handleChangeAmount2(h.id, e.target.value)}
                                    placeholder={indAmt2 !== '' ? String(indAmt2) : (defaultAmount2 !== '' ? String(defaultAmount2) : '金額')}
                                    className={`w-full pl-6 pr-2 py-1 text-xs font-mono font-bold border transition-colors ${
                                      entry.check2
                                        ? 'bg-white border-sky-500 text-[#1A1A1A] shadow-xs'
                                        : 'bg-transparent border-gray-200 text-gray-400 focus:bg-white focus:text-[#1A1A1A]'
                                    } focus:outline-none focus:border-sky-600`}
                                  />
                                </div>
                              </div>
                              {hasCustomFee2 && (
                                <div className="text-[10px] font-sans text-sky-800 flex items-center gap-1 pl-6">
                                  <Coins className="w-2.5 h-2.5" />
                                  <span>個別金額: {formatCurrency(Number(indAmt2))}</span>
                                </div>
                              )}
                            </div>
                          </td>
                        )}

                        {/* 4. 項目３ (チェックボックス + 金額入力) */}
                        {isCol3Active && (
                          <td className="py-2 px-3 border-r border-[#E5E0D8] align-middle bg-emerald-50/30">
                            <div className="space-y-1">
                              <div className="flex items-center space-x-2">
                                <label className="flex items-center cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={entry.check3}
                                    onChange={() => handleToggleCheck3(h)}
                                    className="w-4 h-4 text-emerald-600 focus:ring-emerald-500 border-gray-300 rounded-xs cursor-pointer"
                                  />
                                </label>
                                <div className="relative flex-1">
                                  <span className="absolute left-2 top-1.5 text-xs text-gray-500 font-mono">¥</span>
                                  <input
                                    type="number"
                                    step="1000"
                                    value={entry.amount3}
                                    onChange={(e) => handleChangeAmount3(h.id, e.target.value)}
                                    placeholder={indAmt3 !== '' ? String(indAmt3) : (defaultAmount3 !== '' ? String(defaultAmount3) : '手動入力')}
                                    className={`w-full pl-6 pr-2 py-1 text-xs font-mono font-bold border transition-colors ${
                                      entry.check3
                                        ? 'bg-white border-emerald-500 text-[#1A1A1A] shadow-xs'
                                        : 'bg-transparent border-gray-200 text-gray-400 focus:bg-white focus:text-[#1A1A1A]'
                                    } focus:outline-none focus:border-emerald-600`}
                                  />
                                </div>
                              </div>
                              {hasCustomFee3 && (
                                <div className="text-[10px] font-sans text-emerald-800 flex items-center gap-1 pl-6">
                                  <Coins className="w-2.5 h-2.5" />
                                  <span>個別金額: {formatCurrency(Number(indAmt3))}</span>
                                </div>
                              )}
                            </div>
                          </td>
                        )}

                        {/* 項目未設定時 */}
                        {activeColCount === 0 && (
                          <td className="py-3 px-3 border-r border-[#E5E0D8] text-center text-gray-400 text-xs font-sans">
                            上部の設定バーで摘要名を入力すると受付項目が表示されます
                          </td>
                        )}

                        {/* 5. 世帯合計 */}
                        <td className="py-2 px-3 text-right align-middle font-mono">
                          {rowTotal > 0 ? (
                            <span className="font-bold text-sm text-[#1A1A1A] bg-amber-200/70 px-2 py-0.5 border border-amber-400 rounded-xs shadow-xs">
                              {formatCurrency(rowTotal)}
                            </span>
                          ) : (
                            <span className="text-gray-400 text-xs">-</span>
                          )}
                        </td>

                        {/* 6. 操作 (行クリア) */}
                        <td className="py-2 px-2 text-center align-middle">
                          {isRowActive && (
                            <button
                              type="button"
                              onClick={() => handleClearHousehold(h.id)}
                              className="text-gray-400 hover:text-red-600 p-1 transition-colors cursor-pointer"
                              title="この施主の入力をクリア"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="bg-[#1A1A1A] text-[#F9F7F2] px-4 py-3 border-t border-[#D4AF37] flex flex-col sm:flex-row items-center justify-between gap-3 font-sans shrink-0">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            <div className="flex items-center space-x-2">
              <span className="text-[#999]">入力済み施主数:</span>
              <strong className="text-white font-mono text-sm">{Object.keys(entries).length} 件</strong>
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-[#999]">生成出納レコード総数:</span>
              <strong className="text-[#D4AF37] font-mono text-sm">{generatedRecordsSummary.totalCount} 件</strong>
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-[#999]">合計受付金額:</span>
              <strong className="text-emerald-400 font-mono text-base font-bold">
                {formatCurrency(generatedRecordsSummary.totalSum)}
              </strong>
            </div>
            {lastSavedAt && (
              <span className="text-[#888] text-[11px] font-mono">
                （最終保存: {lastSavedAt}）
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {Object.keys(entries).length > 0 && (
              <button
                type="button"
                onClick={handleClearAllEntries}
                className="px-3 py-2 bg-[#2A2A2A] hover:bg-red-950/70 text-red-300 hover:text-red-100 border border-red-800/60 text-xs font-bold transition-colors cursor-pointer flex items-center space-x-1 shadow-xs"
                title="入力中の受付データをクリア"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>全クリア</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleCloseModal}
              className="px-4 py-2 bg-[#333] hover:bg-[#444] text-[#E0E0E0] hover:text-white text-xs font-bold transition-colors cursor-pointer flex items-center space-x-1.5 border border-[#555]"
            >
              <Save className="w-3.5 h-3.5 text-[#D4AF37]" />
              <span>保存して閉じる</span>
            </button>

            <button
              type="button"
              onClick={handleExecuteBatch}
              disabled={generatedRecordsSummary.recordsToCreate.length === 0}
              className={`px-5 py-2 font-bold text-xs tracking-wider flex items-center space-x-1.5 shadow-md transition-all cursor-pointer ${
                generatedRecordsSummary.recordsToCreate.length > 0
                  ? 'bg-[#D4AF37] hover:bg-[#c29f2f] text-[#1A1A1A]'
                  : 'bg-[#444] text-[#888] cursor-not-allowed'
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>全入金処理を実行する ({generatedRecordsSummary.totalCount}件)</span>
            </button>
          </div>
        </div>

      </div>

    </div>
  );
};
