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
  Trash2,
  Filter,
  Check
} from 'lucide-react';
import { Household, Transaction, MasterOptions, TempleInfo, TransactionCategory, BatchAccountingData, HouseholdBatchEntry, BatchAccountingConfig } from '../types';
import { formatCurrency, formatJapaneseEraDate, normalizeDateInput, NormalizeDateOptions } from '../utils/memorialCalculator';
import { SaveConfirmModal } from './SaveConfirmModal';
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
  const [showSaveConfirm, setShowSaveConfirm] = useState<boolean>(false);
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

  // Handle executing save & Google Sheets sync
  const executeSaveAndClose = useCallback(() => {
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
    setHasUnsavedChanges(false);
    setShowSaveConfirm(false);
    onClose();
  }, [getCurrentBatchData, onSaveBatchData, onClose]);

  const handleSaveButton = () => {
    if (!hasUnsavedChanges) {
      // 変更がない場合は保存をスキップするガード: データの再保存・履歴記録・Googleシート同期を行わず、単にモーダルを閉じる
      onClose();
      return;
    }
    executeSaveAndClose();
  };

  const handleRequestClose = () => {
    if (!hasUnsavedChanges) {
      onClose();
      return;
    }
    setShowSaveConfirm(true);
  };

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
  const [filterType, setFilterType] = useState<'all' | 'enteredOnly'>('all');

  // 塔婆絞り込みポップアップ用ステート
  const [isTobaFilterModalOpen, setIsTobaFilterModalOpen] = useState<boolean>(false);
  const [tobaFilter, setTobaFilter] = useState<'all' | 'anyToba' | 'segakiOnly' | 'toba1Only' | 'toba2Only' | 'toba3Only'>('all');

  // 集金項目絞り込みポップアップ用ステート
  const [isFeeFilterModalOpen, setIsFeeFilterModalOpen] = useState<boolean>(false);
  const [selectedFeeFilters, setSelectedFeeFilters] = useState<string[]>([]);

  const [isSuccessToast, setIsSuccessToast] = useState<string | null>(null);

  // Helper to determine if a household has an explicitly registered individual amount for a column
  const getHouseholdCustomFee = (h: Household, colIndex: 1 | 2 | 3): number | null => {
    const note = colIndex === 1 ? notes1 : colIndex === 2 ? notes2 : notes3;

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

    // Fallback: column note includes '護持会費' or '会費' -> maps to fee1
    if (note && (note.includes('護持会費') || note.includes('会費'))) {
      if (h.fee1Amount !== undefined && h.fee1Amount !== null && Number(h.fee1Amount) > 0) {
        return Number(h.fee1Amount);
      }
      if (h.fee1 !== undefined && h.fee1 !== null && Number(h.fee1) > 0) {
        return Number(h.fee1);
      }
    }

    // Fallback: column note includes '墓地' or '管理費' -> maps to fee2
    if (note && (note.includes('墓地') || note.includes('管理費'))) {
      if (h.fee2Amount !== undefined && h.fee2Amount !== null && Number(h.fee2Amount) > 0) {
        return Number(h.fee2Amount);
      }
      if (h.fee2 !== undefined && h.fee2 !== null && Number(h.fee2) > 0) {
        return Number(h.fee2);
      }
    }

    return null;
  };

  // Helper to determine specific household amount for a column
  const getHouseholdDefaultAmount = (h: Household, colIndex: 1 | 2 | 3): number | '' => {
    const custom = getHouseholdCustomFee(h, colIndex);
    if (custom !== null) {
      return custom;
    }
    const globalDefault = colIndex === 1 ? defaultAmount1 : colIndex === 2 ? defaultAmount2 : defaultAmount3;
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
        
        // 塔婆検索
        const segakiHeadMatch = (h.segakiTamegaki || '').toLowerCase().includes(query) || (h.isSegakiToba && '施餓鬼塔婆'.includes(query));
        const segakiMemberMatch = h.familyMembers?.some(m => 
          (m.name || '').toLowerCase().includes(query) ||
          (m.segakiTamegaki || '').toLowerCase().includes(query) ||
          (m.isSegakiToba && '施餓鬼塔婆'.includes(query))
        );
        const toba1Match = Boolean(templeInfo?.tobaType1 && h.toba1Applied && templeInfo.tobaType1.toLowerCase().includes(query));
        const toba2Match = Boolean(templeInfo?.tobaType2 && h.toba2Applied && templeInfo.tobaType2.toLowerCase().includes(query));
        const toba3Match = Boolean(templeInfo?.tobaType3 && h.toba3Applied && templeInfo.tobaType3.toLowerCase().includes(query));

        const matchesQuery = nameMatch || kanaMatch || idMatch || typeMatch || statusMatch || districtMatch || notesMatch || segakiHeadMatch || segakiMemberMatch || toba1Match || toba2Match || toba3Match;
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
      if (filterType === 'enteredOnly') {
        const entry = entries[h.id];
        const isEntered = entry && (
          (isCol1Active && entry.check1 && entry.amount1 !== '') ||
          (isCol2Active && entry.check2 && entry.amount2 !== '') ||
          (isCol3Active && entry.check3 && entry.amount3 !== '')
        );
        if (!isEntered) return false;
      }

      // 4. 塔婆絞り込みフィルター
      if (tobaFilter !== 'all') {
        const isSegakiToba = Boolean(h.isSegakiToba || h.familyMembers?.some((m) => m.isSegakiToba));
        const isToba1 = Boolean(h.toba1Applied);
        const isToba2 = Boolean(h.toba2Applied);
        const isToba3 = Boolean(h.toba3Applied);
        const hasAnyTobaApp = Boolean(h.tobaApplications && Object.keys(h.tobaApplications).length > 0);
        const hasAnyToba = isSegakiToba || isToba1 || isToba2 || isToba3 || hasAnyTobaApp;

        if (tobaFilter === 'anyToba' && !hasAnyToba) return false;
        if (tobaFilter === 'segakiOnly' && !isSegakiToba) return false;
        if (tobaFilter === 'toba1Only' && !isToba1) return false;
        if (tobaFilter === 'toba2Only' && !isToba2) return false;
        if (tobaFilter === 'toba3Only' && !isToba3) return false;
      }

      // 5. 集金項目絞り込みフィルター（選択された項目のうち、いずれかに金額が入力されている檀家を抽出：OR検索）
      if (selectedFeeFilters.length > 0) {
        const matchesAnyFee = selectedFeeFilters.some((feeKey) => {
          if (feeKey === 'fee1') {
            return (h.fee1Amount !== undefined && Number(h.fee1Amount) > 0) ||
                   (h.fee1 !== undefined && Number(h.fee1) > 0);
          } else if (feeKey === 'fee2') {
            return (h.fee2Amount !== undefined && Number(h.fee2Amount) > 0) ||
                   (h.fee2 !== undefined && Number(h.fee2) > 0);
          } else if (feeKey === 'fee3') {
            return (h.fee3Amount !== undefined && Number(h.fee3Amount) > 0) ||
                   (h.fee3 !== undefined && Number(h.fee3) > 0);
          }
          return false;
        });
        if (!matchesAnyFee) return false;
      }

      return true;
    });

    // 必ず五十音順（ふりがな順、未設定時は世帯主名）にソート
    return filtered.sort((a, b) => {
      const furiganaA = (a.furigana || a.familyHead || '').trim();
      const furiganaB = (b.furigana || b.familyHead || '').trim();
      return furiganaA.localeCompare(furiganaB, 'ja');
    });
  }, [households, searchTerm, selectedKana, filterType, tobaFilter, selectedFeeFilters, entries, isCol1Active, isCol2Active, isCol3Active, templeInfo]);

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
        receiptNumber: `R-${normalizedDate.replace(/\//g, '').slice(2)}-${String(ts).slice(-4)}-${String(index + 1).padStart(4, '0')}`,
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
                入力中は快適に作業できるようGoogleシート連携は行われません。変更を保存して閉じる際にGoogleシートへ自動連携されます。
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
              type="button"
              onClick={handleRequestClose}
              className="p-1.5 text-[#CCCCCC] hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              title="閉じる"
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

        {/* 1. TOP CONFIGURATION BAR (設定バー: 科目1・摘要1・金額1・科目2・摘要2・金額2・科目3・摘要3・金額3) */}
        <div className="bg-[#242424] text-[#F9F7F2] p-3 border-b-2 border-[#D4AF37] font-sans shrink-0 shadow-md">
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
            
            {/* 3 Preset Columns (順番: 科目1 摘要1 金額1 科目2 摘要2 金額2 科目3 摘要3 金額3) */}
            <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-9 gap-2 items-end">
              
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
                placeholder="施主名・檀家ID・区分1・区分2・塔婆・備考などで検索..."
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

            {/* Quick Filter & Popup Filter Buttons */}
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <button
                type="button"
                onClick={() => {
                  setFilterType('all');
                  setTobaFilter('all');
                  setSelectedFeeFilters([]);
                }}
                className={`px-2.5 py-1.5 border transition-colors cursor-pointer font-bold ${
                  filterType === 'all' && tobaFilter === 'all' && selectedFeeFilters.length === 0
                    ? 'bg-[#1A1A1A] text-white border-[#1A1A1A]'
                    : 'bg-white text-[#555] border-[#D1CEC7] hover:bg-gray-50'
                }`}
              >
                全檀家 ({households.length})
              </button>

              {/* 塔婆絞り込みポップアップトリガーボタン */}
              <button
                type="button"
                onClick={() => setIsTobaFilterModalOpen(true)}
                className={`px-2.5 py-1.5 border transition-colors cursor-pointer font-bold flex items-center space-x-1 ${
                  tobaFilter !== 'all'
                    ? 'bg-amber-800 text-white border-amber-800 shadow-xs'
                    : 'bg-white text-amber-900 border-[#D1CEC7] hover:bg-amber-50'
                }`}
              >
                <Filter className="w-3 h-3" />
                <span>
                  塔婆絞り込み
                  {tobaFilter === 'anyToba' && ' (すべて)'}
                  {tobaFilter === 'segakiOnly' && ' (施餓鬼)'}
                  {tobaFilter === 'toba1Only' && ` (${templeInfo?.tobaType1 || '塔婆1'})`}
                  {tobaFilter === 'toba2Only' && ` (${templeInfo?.tobaType2 || '塔婆2'})`}
                  {tobaFilter === 'toba3Only' && ` (${templeInfo?.tobaType3 || '塔婆3'})`}
                </span>
                {tobaFilter !== 'all' && (
                  <span className="ml-1 w-2 h-2 rounded-full bg-amber-300 inline-block" />
                )}
              </button>

              {/* 集金項目絞り込みポップアップトリガーボタン */}
              <button
                type="button"
                onClick={() => setIsFeeFilterModalOpen(true)}
                className={`px-2.5 py-1.5 border transition-colors cursor-pointer font-bold flex items-center space-x-1 ${
                  selectedFeeFilters.length > 0
                    ? 'bg-emerald-800 text-white border-emerald-800 shadow-xs'
                    : 'bg-white text-emerald-900 border-[#D1CEC7] hover:bg-emerald-50'
                }`}
              >
                <Filter className="w-3 h-3" />
                <span>
                  集金項目絞り込み
                  {selectedFeeFilters.length > 0 && ` (${selectedFeeFilters.length}件)`}
                </span>
                {selectedFeeFilters.length > 0 && (
                  <span className="ml-1 w-2 h-2 rounded-full bg-emerald-300 inline-block" />
                )}
              </button>

              <button
                type="button"
                onClick={() => setFilterType(filterType === 'enteredOnly' ? 'all' : 'enteredOnly')}
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

                    const customFee1 = getHouseholdCustomFee(h, 1);
                    const customFee2 = getHouseholdCustomFee(h, 2);
                    const customFee3 = getHouseholdCustomFee(h, 3);

                    const hasCustomFee1 = customFee1 !== null;
                    const hasCustomFee2 = customFee2 !== null;
                    const hasCustomFee3 = customFee3 !== null;

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

                            {/* 塔婆バッジ */}
                            <div className="flex flex-col items-end gap-1 shrink-0 font-sans">
                              {(h.isSegakiToba || h.familyMembers?.some(m => m.isSegakiToba) || h.toba1Applied || h.toba2Applied || h.toba3Applied || (h.tobaApplications && Object.keys(h.tobaApplications).length > 0)) && (
                                <span className="text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-900 border border-amber-300 font-bold rounded-xs flex items-center gap-0.5">
                                  <span>塔婆あり</span>
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
                                <div className="text-[10px] font-sans text-red-600 font-bold flex items-center gap-1 pl-6">
                                  <Coins className="w-2.5 h-2.5 text-red-600 shrink-0" />
                                  <span>個別金額: {formatCurrency(Number(customFee1))}</span>
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
                                <div className="text-[10px] font-sans text-red-600 font-bold flex items-center gap-1 pl-6">
                                  <Coins className="w-2.5 h-2.5 text-red-600 shrink-0" />
                                  <span>個別金額: {formatCurrency(Number(customFee2))}</span>
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
                                <div className="text-[10px] font-sans text-red-600 font-bold flex items-center gap-1 pl-6">
                                  <Coins className="w-2.5 h-2.5 text-red-600 shrink-0" />
                                  <span>個別金額: {formatCurrency(Number(customFee3))}</span>
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
          <div className="flex flex-wrap items-center gap-3">
            {/* 受付日付（全入金処理の左側） */}
            <div className="flex items-center space-x-2 bg-[#252525] px-2.5 py-1.5 border border-[#555] rounded-xs shadow-xs">
              <label className="text-xs font-bold text-[#D4AF37] whitespace-nowrap flex items-center space-x-1 shrink-0">
                <Calendar className="w-3.5 h-3.5 text-[#D4AF37]" />
                <span>受付日付:</span>
              </label>
              <input
                type="text"
                value={configDate}
                onChange={(e) => {
                  setConfigDate(e.target.value);
                  setHasUnsavedChanges(true);
                }}
                onBlur={() => {
                  if (configDate.trim()) {
                    const norm = normalizeDateInput(configDate, {
                      mode: 'accounting',
                      fiscalStartMonth: templeInfo?.fiscalYearStartMonth ?? 4,
                    });
                    if (norm) {
                      setConfigDate(formatJapaneseEraDate(norm, false));
                    }
                  }
                }}
                placeholder="令和8年8月21日 または 8/21"
                className="w-36 sm:w-44 bg-[#141414] border border-[#666] text-white px-2 py-1 text-xs focus:border-[#D4AF37] focus:outline-none rounded-xs font-mono"
                title="入金処理で記帳される受付日付（例: 8/21 または 令和8年8月21日）"
              />
            </div>

            <button
              type="button"
              onClick={handleExecuteBatch}
              disabled={generatedRecordsSummary.recordsToCreate.length === 0}
              className={`px-5 py-2 font-bold text-xs tracking-wider flex items-center space-x-1.5 shadow-md transition-all cursor-pointer rounded-xs ${
                generatedRecordsSummary.recordsToCreate.length > 0
                  ? 'bg-[#D4AF37] hover:bg-[#c29f2f] text-[#1A1A1A]'
                  : 'bg-[#444] text-[#888] cursor-not-allowed'
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>全入金処理を実行する ({generatedRecordsSummary.totalCount}件)</span>
            </button>

            {Object.keys(entries).length > 0 && (
              <button
                type="button"
                onClick={handleClearAllEntries}
                className="px-3 py-2 bg-[#2A2A2A] hover:bg-red-950/70 text-red-300 hover:text-red-100 border border-red-800/60 text-xs font-bold transition-colors cursor-pointer flex items-center space-x-1 shadow-xs rounded-xs"
                title="入力中の受付データをクリア"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>全クリア</span>
              </button>
            )}

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#CCCCCC] pl-2 border-l border-[#444]">
              <div className="flex items-center space-x-1.5">
                <span className="text-[#999]">入力施主:</span>
                <strong className="text-white font-mono">{Object.keys(entries).length}件</strong>
              </div>
              <div className="flex items-center space-x-1.5">
                <span className="text-[#999]">合計:</span>
                <strong className="text-emerald-400 font-mono font-bold">
                  {formatCurrency(generatedRecordsSummary.totalSum)}
                </strong>
              </div>
              {lastSavedAt && (
                <span className="text-[#888] text-[11px] font-mono">
                  ({lastSavedAt})
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleSaveButton}
              className="px-5 py-2 bg-[#D4AF37] hover:bg-[#c29f2f] text-[#1A1A1A] hover:text-black text-xs font-bold transition-all cursor-pointer flex items-center space-x-1.5 rounded-xs shadow-md"
            >
              <Save className="w-4 h-4" />
              <span>保存して閉じる</span>
            </button>
          </div>
        </div>

      </div>

      {/* ========================================================================= */}
      {/* 塔婆絞り込みポップアップモーダル                                             */}
      {/* ========================================================================= */}
      {isTobaFilterModalOpen && (
        <div className="fixed inset-0 z-60 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#FAF8F5] border border-[#D1CEC7] shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-150">
            {/* Header */}
            <div className="bg-[#1A1A1A] text-[#F9F7F2] px-4 py-3 border-b border-[#D4AF37] flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Filter className="w-4 h-4 text-[#D4AF37]" />
                <h3 className="font-bold text-sm">塔婆対象の絞り込み</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsTobaFilterModalOpen(false)}
                className="text-[#D1CEC7] hover:text-white p-1 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="p-4 space-y-2 text-xs font-sans">
              <p className="text-[#555] mb-3 leading-relaxed">
                表示対象とする塔婆の種類を選択してください。選択した条件に合致する檀家のみが一覧に表示されます。
              </p>

              <div className="space-y-1.5">
                {[
                  {
                    id: 'all',
                    title: 'すべての檀家（塔婆による絞り込みを解除）',
                    desc: '塔婆の有無に関係なく全檀家を表示します',
                    count: households.length
                  },
                  {
                    id: 'anyToba',
                    title: '塔婆ありの檀家すべて（いずれかの塔婆対象）',
                    desc: '施餓鬼塔婆または塔婆1〜3等の申込がある世帯',
                    count: households.filter(h => h.isSegakiToba || h.familyMembers?.some(m => m.isSegakiToba) || h.toba1Applied || h.toba2Applied || h.toba3Applied || (h.tobaApplications && Object.keys(h.tobaApplications).length > 0)).length
                  },
                  {
                    id: 'segakiOnly',
                    title: '施餓鬼塔婆対象の檀家のみ',
                    desc: '世帯主または家族に施餓鬼塔婆の登録がある世帯',
                    count: households.filter(h => h.isSegakiToba || h.familyMembers?.some(m => m.isSegakiToba)).length
                  },
                  ...(templeInfo?.tobaType1 ? [{
                    id: 'toba1Only',
                    title: `${templeInfo.tobaType1} 対象のみ`,
                    desc: `寺院設定「${templeInfo.tobaType1}」の申込がある世帯`,
                    count: households.filter(h => h.toba1Applied).length
                  }] : []),
                  ...(templeInfo?.tobaType2 ? [{
                    id: 'toba2Only',
                    title: `${templeInfo.tobaType2} 対象のみ`,
                    desc: `寺院設定「${templeInfo.tobaType2}」の申込がある世帯`,
                    count: households.filter(h => h.toba2Applied).length
                  }] : []),
                  ...(templeInfo?.tobaType3 ? [{
                    id: 'toba3Only',
                    title: `${templeInfo.tobaType3} 対象のみ`,
                    desc: `寺院設定「${templeInfo.tobaType3}」の申込がある世帯`,
                    count: households.filter(h => h.toba3Applied).length
                  }] : []),
                ].map((item) => {
                  const isSelected = tobaFilter === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setTobaFilter(item.id as any);
                        setIsTobaFilterModalOpen(false);
                      }}
                      className={`w-full text-left p-3 border transition-colors flex items-center justify-between cursor-pointer ${
                        isSelected
                          ? 'bg-amber-50 border-amber-600 text-amber-950 font-bold shadow-xs'
                          : 'bg-white border-[#D1CEC7] hover:bg-gray-50 text-[#333]'
                      }`}
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center space-x-2">
                          <span>{item.title}</span>
                          <span className="text-[10px] px-1.5 py-0.2 bg-gray-200 text-gray-700 font-mono font-normal rounded-xs">
                            {item.count}件
                          </span>
                        </div>
                        <div className="text-[11px] text-[#777] font-normal">
                          {item.desc}
                        </div>
                      </div>
                      <div className="pl-3 shrink-0">
                        <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                          isSelected ? 'border-amber-600 bg-amber-600 text-white' : 'border-gray-300 bg-white'
                        }`}>
                          {isSelected && <Check className="w-2.5 h-2.5" />}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Footer */}
            <div className="bg-[#EFECE6] border-t border-[#D1CEC7] px-4 py-2.5 flex items-center justify-between font-sans text-xs">
              <button
                type="button"
                onClick={() => {
                  setTobaFilter('all');
                  setIsTobaFilterModalOpen(false);
                }}
                className="text-[#666] hover:text-[#1A1A1A] underline cursor-pointer"
              >
                絞り込みを解除（すべて表示）
              </button>
              <button
                type="button"
                onClick={() => setIsTobaFilterModalOpen(false)}
                className="px-4 py-1.5 bg-[#1A1A1A] text-white hover:bg-[#333] transition-colors font-bold cursor-pointer"
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 集金項目絞り込みポップアップモーダル                                         */}
      {/* ========================================================================= */}
      {isFeeFilterModalOpen && (
        <div className="fixed inset-0 z-60 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#FAF8F5] border border-[#D1CEC7] shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-150">
            {/* Header */}
            <div className="bg-[#1A1A1A] text-[#F9F7F2] px-4 py-3 border-b border-[#D4AF37] flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Filter className="w-4 h-4 text-[#D4AF37]" />
                <h3 className="font-bold text-sm">集金項目の絞り込み</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsFeeFilterModalOpen(false)}
                className="text-[#D1CEC7] hover:text-white p-1 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="p-4 space-y-3 text-xs font-sans">
              <p className="text-[#555] leading-relaxed">
                寺院設定で設定されている集金項目（護持会費・墓地管理費等）に金額が入力されている檀家を抽出します。複数チェックした場合は、<strong>いずれかの項目に金額が入力されている檀家</strong>（OR条件）が一覧に表示されます。
              </p>

              <div className="space-y-1.5">
                {[
                  { key: 'fee1', label: templeInfo?.feeType1 || '項目1（護持会費等）' },
                  { key: 'fee2', label: templeInfo?.feeType2 || '項目2（墓地管理費等）' },
                  { key: 'fee3', label: templeInfo?.feeType3 || '項目3' },
                ].filter(item => Boolean(item.label && item.label.trim())).map((item) => {
                  const isChecked = selectedFeeFilters.includes(item.key);
                  const count = households.filter(h => {
                    if (item.key === 'fee1') {
                      return (h.fee1Amount !== undefined && Number(h.fee1Amount) > 0) || (h.fee1 !== undefined && Number(h.fee1) > 0);
                    }
                    if (item.key === 'fee2') {
                      return (h.fee2Amount !== undefined && Number(h.fee2Amount) > 0) || (h.fee2 !== undefined && Number(h.fee2) > 0);
                    }
                    if (item.key === 'fee3') {
                      return (h.fee3Amount !== undefined && Number(h.fee3Amount) > 0) || (h.fee3 !== undefined && Number(h.fee3) > 0);
                    }
                    return false;
                  }).length;

                  return (
                    <label
                      key={item.key}
                      className={`w-full p-3 border transition-colors flex items-center justify-between cursor-pointer select-none ${
                        isChecked
                          ? 'bg-emerald-50 border-emerald-600 text-emerald-950 font-bold shadow-xs'
                          : 'bg-white border-[#D1CEC7] hover:bg-gray-50 text-[#333]'
                      }`}
                    >
                      <div className="flex items-center space-x-2.5">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedFeeFilters([...selectedFeeFilters, item.key]);
                            } else {
                              setSelectedFeeFilters(selectedFeeFilters.filter(k => k !== item.key));
                            }
                          }}
                          className="w-4 h-4 text-emerald-600 focus:ring-emerald-500 border-gray-300 rounded-xs cursor-pointer"
                        />
                        <span>{item.label}</span>
                      </div>
                      <span className="text-[10px] px-1.5 py-0.2 bg-gray-200 text-gray-700 font-mono font-normal rounded-xs">
                        登録: {count}件
                      </span>
                    </label>
                  );
                })}
              </div>

              {selectedFeeFilters.length > 0 && (
                <div className="bg-emerald-50 border border-emerald-200 p-2 text-emerald-800 text-[11px] rounded-xs">
                  現在 <strong>{selectedFeeFilters.length}</strong> 項目を選択中（いずれかに金額がある檀家を表示）
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="bg-[#EFECE6] border-t border-[#D1CEC7] px-4 py-2.5 flex items-center justify-between font-sans text-xs">
              <button
                type="button"
                onClick={() => {
                  setSelectedFeeFilters([]);
                  setIsFeeFilterModalOpen(false);
                }}
                className="text-[#666] hover:text-[#1A1A1A] underline cursor-pointer"
              >
                全項目の選択をクリア
              </button>
              <button
                type="button"
                onClick={() => setIsFeeFilterModalOpen(false)}
                className="px-4 py-1.5 bg-[#1A1A1A] text-white hover:bg-[#333] transition-colors font-bold cursor-pointer"
              >
                適用して閉じる
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Save Confirmation Modal */}
      <SaveConfirmModal
        isOpen={showSaveConfirm}
        title="一括会計処理の保存確認"
        message="変更を保存しますか？"
        description="「変更を保存」を押すと、変更内容が反映されて画面が閉じます。「変更を破棄」を押すと、編集作業内容は破棄して画面を閉じます。"
        onSaveAndClose={executeSaveAndClose}
        onDiscardAndClose={() => {
          setShowSaveConfirm(false);
          setHasUnsavedChanges(false);
          onClose();
        }}
        onCancel={() => setShowSaveConfirm(false)}
        cancelText="キャンセル"
        discardText="変更を破棄"
        saveText="変更を保存"
      />
    </div>
  );
};
