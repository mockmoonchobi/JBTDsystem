import React, { useState, useEffect } from 'react';
import { 
  X, 
  Building2, 
  Calendar, 
  Plus, 
  Trash2, 
  Check, 
  Palette, 
  Globe, 
  ExternalLink,
  Settings,
  Copy,
  Layers,
  Edit2,
  RotateCcw,
  GripVertical,
  CheckCircle2,
  Sparkles,
  AlertTriangle,
  AlertOctagon,
  Database,
  ShieldAlert,
  Users,
  UserPlus,
  Phone,
  Mail,
  UserCheck,
  BookOpen,
  Coins
} from 'lucide-react';
import { TempleInfo, TempleProfile, MasterOptions, Household, PastRecord, Transaction, MemorialService, TempleTodo, Priest } from '../types';
import { INITIAL_MASTER_OPTIONS, EMPTY_MASTER_OPTIONS, DEFAULT_ANNUAL_EVENTS } from '../data/initialData';
import { SaveConfirmModal } from './SaveConfirmModal';
import { DeleteConfirmModal } from './DeleteConfirmModal';

interface TempleInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  temples?: TempleProfile[];
  activeTempleId?: string;
  onSaveTemples?: (temples: TempleProfile[], activeId?: string) => void;
  onDeleteTemple?: (templeId: string) => void;
  onResetDatabase?: () => void;
  // Associated record datasets for impact calculation & warning
  households?: Household[];
  pastRecords?: PastRecord[];
  transactions?: Transaction[];
  memorialServices?: MemorialService[];
  templeTodos?: TempleTodo[];
  // Registered priests
  priests?: Priest[];
  onSavePriests?: (priests: Priest[]) => void;
  // Master options per temple
  masterOptions?: MasterOptions;
  templeMasterOptionsMap?: Record<string, MasterOptions>;
  onSaveMasterOptions?: (newOptions: MasterOptions, templeId?: string, allMap?: Record<string, MasterOptions>) => void;
  initialTab?: 'basic' | 'master' | 'priests';
  // 後方互換用
  templeInfo?: TempleInfo;
  onSave?: (info: TempleInfo) => void;
}

const PRESET_COLORS = [
  { label: '黄金 (本寺標準)', value: '#D4AF37' },
  { label: '深緑 (兼務推奨)', value: '#2E7D32' },
  { label: '紺青 (兼務推奨)', value: '#1F4E79' },
  { label: '弁柄・茜', value: '#8C2D19' },
  { label: '紫苑 (高貴)', value: '#5C2D91' },
  { label: '墨黒 (重厚)', value: '#333333' },
  { label: '琥珀 (暖色)', value: '#D97706' },
  { label: '藍鉄 (洗練)', value: '#0F766E' },
];

type MasterCategoryTab = 'householdTypes' | 'statuses' | 'districts' | 'incomeCategories' | 'expenseCategories' | 'paymentMethods';

// Helper to reconcile chief priests from temple list with registered priests list
const reconcilePriestsWithTemples = (
  temples: TempleProfile[],
  existingPriests: Priest[]
): Priest[] => {
  const manualPriests = (existingPriests || []).filter((p) => !p.isAutoChief);

  const autoPriests: Priest[] = (temples || [])
    .filter((t) => t.chiefPriest && t.chiefPriest.trim() !== '')
    .map((t) => {
      const isMain = Boolean(t.isMain);
      const templeId = t.id || 'temple-main';
      const templeName = `${t.mountainName ? t.mountainName + ' ' : ''}${t.name || '（寺院名未設定）'}`;
      const prevAuto = (existingPriests || []).find((p) => p.isAutoChief && p.templeId === templeId);

      return {
        id: prevAuto?.id || `priest-chief-${templeId}`,
        name: t.chiefPriest.trim(),
        furigana: prevAuto?.name === t.chiefPriest.trim() ? (prevAuto?.furigana || '') : '',
        role: isMain ? '本寺住職' : '兼務寺住職',
        templeId,
        templeName,
        phone: prevAuto?.phone || t.phone || '',
        email: prevAuto?.email || '',
        notes: prevAuto?.notes || (isMain ? '本寺代表役員・住職' : '兼務寺住職'),
        isAutoChief: true,
        isMainChief: isMain,
      };
    });

  return [...autoPriests, ...manualPriests];
};

export const TempleInfoModal: React.FC<TempleInfoModalProps> = ({
  isOpen,
  onClose,
  temples: initialTemples,
  activeTempleId: initialActiveId,
  onSaveTemples,
  onDeleteTemple,
  onResetDatabase,
  households = [],
  pastRecords = [],
  transactions = [],
  memorialServices = [],
  templeTodos = [],
  priests: initialPriests = [],
  onSavePriests,
  masterOptions,
  templeMasterOptionsMap = {},
  onSaveMasterOptions,
  initialTab = 'basic',
  templeInfo,
  onSave,
}) => {
  // Normalize temples list
  const [templeList, setTempleList] = useState<TempleProfile[]>(() => {
    if (initialTemples && initialTemples.length > 0) {
      return initialTemples;
    }
    if (templeInfo) {
      return [{ ...templeInfo, id: templeInfo.id || 'temple-main', isMain: true, color: templeInfo.color || '#D4AF37' }];
    }
    return [];
  });

  const [selectedTempleId, setSelectedTempleId] = useState<string>(() => {
    return initialActiveId || (initialTemples && initialTemples[0]?.id) || 'temple-main';
  });

  // Registered Priests state
  const [priestList, setPriestList] = useState<Priest[]>(() => {
    const baseTemples = initialTemples && initialTemples.length > 0 ? initialTemples : (templeInfo ? [templeInfo] : []);
    const basePriests = Array.isArray(initialPriests) ? initialPriests : [];
    return reconcilePriestsWithTemples(baseTemples, basePriests);
  });

  const [isPriestModalOpen, setIsPriestModalOpen] = useState<boolean>(false);
  const [editingPriest, setEditingPriest] = useState<Partial<Priest> | null>(null);

  const [activeTab, setActiveTab] = useState<'basic' | 'master' | 'priests'>(
    initialTab === 'master' ? 'master' : initialTab === 'priests' ? 'priests' : 'basic'
  );
  const [activeMasterCategory, setActiveMasterCategory] = useState<MasterCategoryTab>('householdTypes');
  
  // Sub-temple delete state
  const [templeToDelete, setTempleToDelete] = useState<TempleProfile | null>(null);
  const [isDeleteAgreed, setIsDeleteAgreed] = useState<boolean>(false);

  // Priest delete state
  const [priestToDelete, setPriestToDelete] = useState<Priest | null>(null);

  // Database full reset state
  const [showResetDbModal, setShowResetDbModal] = useState<boolean>(false);
  const [isResetDbAgreed, setIsResetDbAgreed] = useState<boolean>(false);

  // Master Options state map for each temple
  const [masterStateMap, setMasterStateMap] = useState<Record<string, MasterOptions>>(() => {
    const map: Record<string, MasterOptions> = {};
    const baseList = initialTemples && initialTemples.length > 0 ? initialTemples : (templeInfo ? [templeInfo] : []);
    baseList.forEach((t) => {
      const id = t.id || 'temple-main';
      map[id] = templeMasterOptionsMap[id] || t.masterOptions || masterOptions || EMPTY_MASTER_OPTIONS;
    });
    if (map['temple-main'] === undefined && masterOptions) {
      map['temple-main'] = masterOptions;
    }
    return map;
  });

  // Master Options inline editing states
  const [newItemText, setNewItemText] = useState('');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingText, setEditingText] = useState('');
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [notificationMessage, setNotificationMessage] = useState<string | null>(null);
  const [showSaveConfirm, setShowSaveConfirm] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      const currentTemples = initialTemples && initialTemples.length > 0 ? initialTemples : (templeInfo ? [templeInfo] : []);
      if (initialTemples && initialTemples.length > 0) {
        setTempleList(initialTemples);
        setSelectedTempleId(initialActiveId && initialActiveId !== 'ALL' ? initialActiveId : initialTemples[0].id || 'temple-main');
      } else if (templeInfo) {
        setTempleList([{ ...templeInfo, id: templeInfo.id || 'temple-main', isMain: true, color: templeInfo.color || '#D4AF37' }]);
        setSelectedTempleId(templeInfo.id || 'temple-main');
      }

      // Reconcile priests
      const currentPriests = Array.isArray(initialPriests) ? initialPriests : [];
      setPriestList(reconcilePriestsWithTemples(currentTemples, currentPriests));

      // Initialize Master State Map
      const map: Record<string, MasterOptions> = {};
      currentTemples.forEach((t) => {
        const id = t.id || 'temple-main';
        map[id] = templeMasterOptionsMap[id] || t.masterOptions || (id === initialActiveId ? masterOptions : (masterOptions || EMPTY_MASTER_OPTIONS));
      });
      if (initialActiveId && initialActiveId !== 'ALL' && masterOptions) {
        map[initialActiveId] = masterOptions;
      }
      setMasterStateMap(map);

      if (initialTab) {
        setActiveTab(initialTab);
      }
      setIsDeleteAgreed(false);
      setShowResetDbModal(false);
      setIsResetDbAgreed(false);
    }
  }, [isOpen, initialTemples, initialActiveId, templeInfo, templeMasterOptionsMap, masterOptions, initialTab, initialPriests]);

  if (!isOpen) return null;

  const currentTempleIndex = templeList.findIndex((t) => t.id === selectedTempleId);
  const currentTemple: TempleProfile = (currentTempleIndex >= 0 ? templeList[currentTempleIndex] : templeList[0]) || {
    id: 'temple-main',
    name: '',
    sect: '',
    mountainName: '',
    chiefPriest: '',
    postalCode: '',
    address: '',
    phone: '',
    isMain: true,
    color: '#D4AF37',
  };

  const updateCurrentTemple = (updates: Partial<TempleProfile>) => {
    setTempleList((prev) => {
      const idx = prev.findIndex((t) => t.id === currentTemple.id);
      if (idx === -1) return prev;
      const next = [...prev];
      next[idx] = { ...next[idx], ...updates };
      return next;
    });

    if (updates.tobaType1 !== undefined || updates.tobaType2 !== undefined || updates.tobaType3 !== undefined) {
      const t1 = (updates.tobaType1 !== undefined ? updates.tobaType1 : (currentTemple.tobaType1 !== undefined ? currentTemple.tobaType1 : '施餓鬼塔婆')).trim();
      const t2 = (updates.tobaType2 !== undefined ? updates.tobaType2 : (currentTemple.tobaType2 || '')).trim();
      const t3 = (updates.tobaType3 !== undefined ? updates.tobaType3 : (currentTemple.tobaType3 || '')).trim();
      const newTobaTypes = [t1, t2, t3].filter(Boolean);
      setMasterStateMap((prev) => {
        const curM = prev[currentTemple.id || 'temple-main'] || currentMasterOptions || EMPTY_MASTER_OPTIONS;
        return {
          ...prev,
          [currentTemple.id || 'temple-main']: {
            ...curM,
            tobaTypes: newTobaTypes.length > 0 ? newTobaTypes : ['施餓鬼塔婆'],
          },
        };
      });
    }

    if (
      updates.feeType1 !== undefined ||
      updates.feeType2 !== undefined ||
      updates.feeType3 !== undefined ||
      updates.feeType1Category !== undefined ||
      updates.feeType2Category !== undefined ||
      updates.feeType3Category !== undefined
    ) {
      const f1 = (updates.feeType1 !== undefined ? updates.feeType1 : (currentTemple.feeType1 || '')).trim();
      const f2 = (updates.feeType2 !== undefined ? updates.feeType2 : (currentTemple.feeType2 || '')).trim();
      const f3 = (updates.feeType3 !== undefined ? updates.feeType3 : (currentTemple.feeType3 || '')).trim();
      const c1 = updates.feeType1Category !== undefined ? updates.feeType1Category : (currentTemple.feeType1Category || '');
      const c2 = updates.feeType2Category !== undefined ? updates.feeType2Category : (currentTemple.feeType2Category || '');
      const c3 = updates.feeType3Category !== undefined ? updates.feeType3Category : (currentTemple.feeType3Category || '');
      const newFeeTypes = [f1, f2, f3].filter(Boolean);
      const newFeeMapping: Record<string, string> = { ...(currentTemple.feeTypeMapping || {}) };
      if (f1 && c1) newFeeMapping[f1] = c1;
      if (f2 && c2) newFeeMapping[f2] = c2;
      if (f3 && c3) newFeeMapping[f3] = c3;

      setMasterStateMap((prev) => {
        const curM = prev[currentTemple.id || 'temple-main'] || currentMasterOptions || EMPTY_MASTER_OPTIONS;
        return {
          ...prev,
          [currentTemple.id || 'temple-main']: {
            ...curM,
            feeTypes: newFeeTypes,
            feeTypeMapping: newFeeMapping,
          },
        };
      });
    }
  };

  const handleAddNewTemple = () => {
    // 兼務寺院（0〜9）の空いている連番インデックスを探索
    const existingSubIndices = templeList
      .filter((t) => !t.isMain)
      .map((t) => {
        const m = t.id.match(/sub-(\d+)/i);
        return m ? parseInt(m[1], 10) : -1;
      });
    let nextSubIdx = 0;
    while (existingSubIndices.includes(nextSubIdx) && nextSubIdx < 10) {
      nextSubIdx++;
    }
    if (nextSubIdx >= 10) {
      nextSubIdx = Math.min(templeList.filter((t) => !t.isMain).length, 9);
    }
    const newId = `temple-sub-${nextSubIdx}`;
    const mainTemple = templeList.find((t) => t.isMain) || templeList[0] || currentTemple;
    const newTemple: TempleProfile = {
      id: newId,
      name: '新兼務寺院',
      shortName: '新兼務寺院',
      sect: currentTemple.sect || '',
      mountainName: '',
      chiefPriest: currentTemple.chiefPriest ? `${currentTemple.chiefPriest} (兼務)` : '',
      postalCode: '',
      address: '',
      phone: '',
      fax: '',
      website: '',
      websiteUrl: '',
      bonSeason: currentTemple.bonSeason || '8月盆',
      fiscalYearStartMonth: 4,
      fiscalYearStartDay: 1,
      fiscalYearEndMonth: 3,
      fiscalYearEndDay: 31,
      annualEvents: DEFAULT_ANNUAL_EVENTS,
      isMain: false,
      color: PRESET_COLORS[(templeList.length) % PRESET_COLORS.length].value,
    };

    // 新規兼務寺院にはデフォルトで本寺のマスタ設定をコピーして割り当て
    const mainMaster = masterStateMap[mainTemple.id || 'temple-main'] || masterOptions || EMPTY_MASTER_OPTIONS;
    setMasterStateMap((prev) => ({
      ...prev,
      [newId]: JSON.parse(JSON.stringify(mainMaster)),
    }));

    const nextList = [...templeList, newTemple];
    setTempleList(nextList);
    setSelectedTempleId(newId);
    showNotice(`兼務寺院「新兼務寺院」を追加しました（本寺のマスタ設定を初期適用）`);
  };

  const handleRequestDeleteTemple = (temple: TempleProfile, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (temple.isMain) {
      alert('本寺（メイン寺院）は削除できません。');
      return;
    }
    setIsDeleteAgreed(false);
    setTempleToDelete(temple);
  };

  const handleConfirmDeleteTemple = () => {
    if (!templeToDelete) return;
    const targetId = templeToDelete.id;
    const targetName = templeToDelete.name;
    const nextList = templeList.filter((x) => x.id !== targetId);
    setTempleList(nextList);
    const nextActiveId = nextList[0]?.id || 'temple-main';
    if (selectedTempleId === targetId) {
      setSelectedTempleId(nextActiveId);
    }
    setTempleToDelete(null);
    setIsDeleteAgreed(false);

    if (onDeleteTemple) {
      onDeleteTemple(targetId);
    } else if (onSaveTemples) {
      onSaveTemples(nextList, nextActiveId);
    }

    showNotice(`兼務寺院「${targetName}」および関連レコードを完全に削除しました`);
  };

  const handleExecuteResetDatabase = () => {
    setShowResetDbModal(false);
    setIsResetDbAgreed(false);
    if (onResetDatabase) {
      onResetDatabase();
    }
    onClose();
  };

  // ==================== MASTER OPTIONS HELPERS ====================
  const currentMasterOptions: MasterOptions = masterStateMap[currentTemple.id || 'temple-main'] || masterOptions || EMPTY_MASTER_OPTIONS;
  const currentMasterItemList = currentMasterOptions[activeMasterCategory] ?? [];

  const showNotice = (text: string) => {
    setNotificationMessage(text);
    setTimeout(() => {
      setNotificationMessage(null);
    }, 4000);
  };

  const updateCurrentMasterOptions = (updatedOptions: MasterOptions) => {
    setMasterStateMap((prev) => ({
      ...prev,
      [currentTemple.id || 'temple-main']: updatedOptions,
    }));
  };

  const handleAddMasterItem = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = newItemText.trim();
    if (!trimmed) return;

    if (currentMasterItemList.includes(trimmed)) {
      alert('同じ名前の項目が既に存在します。');
      return;
    }

    const updatedList = [...currentMasterItemList, trimmed];
    updateCurrentMasterOptions({
      ...currentMasterOptions,
      [activeMasterCategory]: updatedList,
    });
    setNewItemText('');
  };

  const handleDeleteMasterItem = (indexToDelete: number) => {
    const updatedList = currentMasterItemList.filter((_, idx) => idx !== indexToDelete);
    updateCurrentMasterOptions({
      ...currentMasterOptions,
      [activeMasterCategory]: updatedList,
    });
    if (editingIndex === indexToDelete) {
      setEditingIndex(null);
    } else if (editingIndex !== null && editingIndex > indexToDelete) {
      setEditingIndex(editingIndex - 1);
    }
  };

  const handleReorderMasterItem = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= currentMasterItemList.length || toIndex >= currentMasterItemList.length) {
      return;
    }
    const updatedList = [...currentMasterItemList];
    const [movedItem] = updatedList.splice(fromIndex, 1);
    updatedList.splice(toIndex, 0, movedItem);

    updateCurrentMasterOptions({
      ...currentMasterOptions,
      [activeMasterCategory]: updatedList,
    });

    if (editingIndex === fromIndex) {
      setEditingIndex(toIndex);
    } else if (editingIndex !== null) {
      if (fromIndex < editingIndex && toIndex >= editingIndex) {
        setEditingIndex(editingIndex - 1);
      } else if (fromIndex > editingIndex && toIndex <= editingIndex) {
        setEditingIndex(editingIndex + 1);
      }
    }
  };

  const handleStartEditMasterItem = (index: number) => {
    setEditingIndex(index);
    setEditingText(currentMasterItemList[index]);
  };

  const handleSaveEditMasterItem = (index: number) => {
    const trimmed = editingText.trim();
    if (!trimmed) {
      handleDeleteMasterItem(index);
      return;
    }

    const isDuplicate = currentMasterItemList.some((item, idx) => idx !== index && item === trimmed);
    if (isDuplicate) {
      alert('同じ名前の項目が既に存在します。');
      return;
    }

    const updatedList = [...currentMasterItemList];
    updatedList[index] = trimmed;
    updateCurrentMasterOptions({
      ...currentMasterOptions,
      [activeMasterCategory]: updatedList,
    });
    setEditingIndex(null);
    setEditingText('');
  };

  // 本寺の区分・勘定科目マスタをすべての兼務寺院に一括コピー
  const handleCopyMainToAllSubTemples = () => {
    const mainTemple = templeList.find((t) => t.isMain) || templeList[0];
    const mainId = mainTemple?.id || 'temple-main';
    const mainOptions = masterStateMap[mainId] || masterOptions || EMPTY_MASTER_OPTIONS;

    const subTemples = templeList.filter((t) => !t.isMain);
    if (subTemples.length === 0) {
      alert('兼務寺院が登録されていません。「＋ 兼務寺院を追加」から兼務寺院をご登録ください。');
      return;
    }

    const confirmMsg = `【本寺（${mainTemple.name}）のマスタを一括コピー】\n\n本寺の「区分1・区分2・役職・収入科目・支出科目・納入方法」の全マスタ設定を、以下のすべての兼務寺院（${subTemples.length}寺）に上書き同期します。\n\n対象寺院:\n${subTemples.map((t) => `・${t.name}`).join('\n')}\n\nよろしいですか？`;
    if (!window.confirm(confirmMsg)) return;

    const newMap: Record<string, MasterOptions> = { ...masterStateMap };
    subTemples.forEach((st) => {
      const sId = st.id || 'temple-sub';
      newMap[sId] = JSON.parse(JSON.stringify(mainOptions));
    });

    setMasterStateMap(newMap);
    showNotice(`本寺（${mainTemple.name}）のマスタ設定を全兼務寺院（${subTemples.length}寺）に一括コピーしました`);
  };

  // 他の特定寺院から現在の寺院にマスタをコピー
  const handleCopyFromSpecificTemple = (sourceTempleId: string) => {
    const sourceTemple = templeList.find((t) => t.id === sourceTempleId);
    if (!sourceTemple) return;

    const sourceOptions = masterStateMap[sourceTempleId] || EMPTY_MASTER_OPTIONS;
    const confirmMsg = `「${sourceTemple.name}」のマスタ設定を、現在の寺院「${currentTemple.name}」にコピーして上書きしますか？`;
    if (!window.confirm(confirmMsg)) return;

    updateCurrentMasterOptions(JSON.parse(JSON.stringify(sourceOptions)));
    showNotice(`「${sourceTemple.name}」のマスタ設定を「${currentTemple.name}」にコピーしました`);
  };

  // 初期標準値にリセット
  const handleResetCurrentMasterToDefault = () => {
    if (!window.confirm(`「${currentTemple.name}」のマスタ設定を初期標準値にリセットしますか？`)) return;
    updateCurrentMasterOptions(JSON.parse(JSON.stringify(INITIAL_MASTER_OPTIONS)));
    showNotice(`「${currentTemple.name}」のマスタ設定を初期標準値に戻しました`);
  };

  // ==================== PRIEST MANAGEMENT HELPERS ====================
  const reconciledPriestList = reconcilePriestsWithTemples(templeList, priestList);

  const handleOpenAddPriestModal = () => {
    setEditingPriest({
      id: `priest-${Date.now()}`,
      name: '',
      furigana: '',
      role: '副住職',
      templeId: selectedTempleId || 'temple-main',
      templeName: `${currentTemple.mountainName ? currentTemple.mountainName + ' ' : ''}${currentTemple.name || ''}`,
      phone: '',
      email: '',
      notes: '',
      isAutoChief: false,
      isMainChief: false,
    });
    setIsPriestModalOpen(true);
  };

  const handleOpenEditPriestModal = (priest: Priest) => {
    setEditingPriest({ ...priest });
    setIsPriestModalOpen(true);
  };

  const handleSavePriestModal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPriest || !editingPriest.name?.trim()) {
      alert('僧侶氏名を入力してください。');
      return;
    }

    const trimmedName = editingPriest.name.trim();
    const updatedPriest: Priest = {
      id: editingPriest.id || `priest-${Date.now()}`,
      name: trimmedName,
      furigana: editingPriest.furigana?.trim() || '',
      role: editingPriest.role?.trim() || '僧侶',
      templeId: editingPriest.templeId || '',
      templeName: editingPriest.templeName?.trim() || '',
      phone: editingPriest.phone?.trim() || '',
      email: editingPriest.email?.trim() || '',
      notes: editingPriest.notes?.trim() || '',
      isAutoChief: Boolean(editingPriest.isAutoChief),
      isMainChief: Boolean(editingPriest.isMainChief),
    };

    let nextTemples = templeList;
    // If auto chief priest is edited, sync chiefPriest name and phone with the temple profile
    if (updatedPriest.isAutoChief && updatedPriest.templeId) {
      nextTemples = templeList.map((t) => {
        if (t.id === updatedPriest.templeId) {
          return {
            ...t,
            chiefPriest: updatedPriest.name,
            phone: updatedPriest.phone || t.phone,
          };
        }
        return t;
      });
      setTempleList(nextTemples);
      if (onSaveTemples) {
        onSaveTemples(nextTemples, selectedTempleId);
      }
    }

    const nextPriests = (() => {
      const idx = priestList.findIndex((p) => p.id === updatedPriest.id);
      if (idx >= 0) {
        const next = [...priestList];
        next[idx] = updatedPriest;
        return next;
      }
      return [...priestList, updatedPriest];
    })();

    setPriestList(nextPriests);
    if (onSavePriests) {
      onSavePriests(reconcilePriestsWithTemples(nextTemples, nextPriests));
    }

    setIsPriestModalOpen(false);
    setEditingPriest(null);
    showNotice(`僧侶「${trimmedName}」の情報を保存しました`);
  };

  const handleDeletePriest = (priestId: string) => {
    const target = reconciledPriestList.find((p) => p.id === priestId);
    if (target) {
      setPriestToDelete(target);
    }
  };

  const executeDeletePriest = () => {
    if (!priestToDelete) return;
    const target = priestToDelete;
    const priestId = target.id;

    let nextTemples = templeList;
    // もし住職連動の僧侶の場合は、寺院基本情報の住職名欄をクリア
    if (target.isAutoChief && target.templeId) {
      nextTemples = templeList.map((t) => {
        if (t.id === target.templeId) {
          return {
            ...t,
            chiefPriest: '',
          };
        }
        return t;
      });
      setTempleList(nextTemples);
      if (onSaveTemples) {
        onSaveTemples(nextTemples, selectedTempleId);
      }
    }

    const nextPriests = priestList.filter((p) => p.id !== priestId);
    setPriestList(nextPriests);

    const reconciled = reconcilePriestsWithTemples(nextTemples, nextPriests);
    if (onSavePriests) {
      onSavePriests(reconciled);
    }

    showNotice(`僧侶「${target.name}」を登録一覧から削除しました`);
    setPriestToDelete(null);
  };

  // ==================== SUBMIT ====================
  const executeSaveAndClose = () => {
    // 1. 各寺院オブジェクト内に masterOptions をセットし、tobaType1/2/3 と masterOptions.tobaTypes を完全同期
    const nowIso = new Date().toISOString();
    const todayStr = nowIso.split('T')[0];
    const timeStr = new Date().toLocaleTimeString('ja-JP');
    const newMasterMap: Record<string, MasterOptions> = {};
    const updatedTempleProfiles = templeList.map((t) => {
      const tId = t.id || 'temple-main';
      const existingMaster = masterStateMap[tId] || t.masterOptions || EMPTY_MASTER_OPTIONS;

      const t1 = t.tobaType1 !== undefined ? t.tobaType1.trim() : '施餓鬼塔婆';
      const t2 = (t.tobaType2 || '').trim();
      const t3 = (t.tobaType3 || '').trim();
      const derivedTobaTypes = [t1, t2, t3].filter(Boolean);

      const f1 = (t.feeType1 || '').trim();
      const f2 = (t.feeType2 || '').trim();
      const f3 = (t.feeType3 || '').trim();
      const derivedFeeTypes = [f1, f2, f3].filter(Boolean);

      const feeMapping: Record<string, string> = { ...(existingMaster.feeTypeMapping || {}), ...(t.feeTypeMapping || {}) };
      if (f1 && t.feeType1Category) feeMapping[f1] = t.feeType1Category;
      if (f2 && t.feeType2Category) feeMapping[f2] = t.feeType2Category;
      if (f3 && t.feeType3Category) feeMapping[f3] = t.feeType3Category;

      const updatedMaster: MasterOptions = {
        ...existingMaster,
        tobaTypes: derivedTobaTypes.length > 0 ? derivedTobaTypes : (existingMaster.tobaTypes && existingMaster.tobaTypes.length > 0 ? existingMaster.tobaTypes : ['施餓鬼塔婆']),
        feeTypes: derivedFeeTypes,
        feeTypeMapping: feeMapping,
      };

      newMasterMap[tId] = updatedMaster;

      return {
        ...t,
        tobaType1: t1,
        tobaType2: t2,
        tobaType3: t3,
        feeType1: f1,
        feeType1Category: t.feeType1Category || (f1 ? (feeMapping[f1] || f1) : undefined),
        feeType1DefaultAmount: t.feeType1DefaultAmount,
        feeType2: f2,
        feeType2Category: t.feeType2Category || (f2 ? (feeMapping[f2] || f2) : undefined),
        feeType2DefaultAmount: t.feeType2DefaultAmount,
        feeType3: f3,
        feeType3Category: t.feeType3Category || (f3 ? (feeMapping[f3] || f3) : undefined),
        feeType3DefaultAmount: t.feeType3DefaultAmount,
        feeTypeMapping: feeMapping,
        masterOptions: updatedMaster,
        updatedAt: nowIso,
        updatedDate: todayStr,
        updatedTime: timeStr,
      };
    });

    const activeProfile = updatedTempleProfiles.find((t) => t.id === selectedTempleId) || updatedTempleProfiles[0];

    // 2. 寺院リスト保存
    if (onSaveTemples) {
      onSaveTemples(updatedTempleProfiles, selectedTempleId);
    } else if (onSave && activeProfile) {
      onSave(activeProfile);
    }

    // 3. マスタ設定保存
    if (onSaveMasterOptions) {
      const activeOptions = activeProfile?.masterOptions || newMasterMap[selectedTempleId] || newMasterMap['temple-main'] || currentMasterOptions;
      onSaveMasterOptions(activeOptions, selectedTempleId, newMasterMap);
    }

    // 4. 登録僧侶リスト保存
    if (onSavePriests) {
      onSavePriests(reconcilePriestsWithTemples(updatedTempleProfiles, priestList));
    }

    setShowSaveConfirm(false);
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    executeSaveAndClose();
  };

  const handleRequestClose = () => {
    setShowSaveConfirm(true);
  };

  // Calculated impact for deletion
  const deletingTempleTargetId = templeToDelete?.id || '';
  const deletingTempleHouseholds = households.filter((h) => (h.templeId || 'temple-main') === deletingTempleTargetId);
  const deletingTempleHhIdSet = new Set(deletingTempleHouseholds.map((h) => h.id));
  const deletingTemplePastRecords = pastRecords.filter(
    (r) => (r.templeId || 'temple-main') === deletingTempleTargetId || (r.householdId && deletingTempleHhIdSet.has(r.householdId))
  );
  const deletingTempleTransactions = transactions.filter(
    (t) => (t.templeId || 'temple-main') === deletingTempleTargetId || (t.householdId && deletingTempleHhIdSet.has(t.householdId))
  );
  const deletingTempleMemorialServices = memorialServices.filter(
    (s) => s.templeId === deletingTempleTargetId || (s.householdId && deletingTempleHhIdSet.has(s.householdId))
  );
  const deletingTempleTodos = templeTodos.filter(
    (td) => td.templeId === deletingTempleTargetId || (td.householdId && deletingTempleHhIdSet.has(td.householdId))
  );
  const totalDeletingRecordsCount =
    deletingTempleHouseholds.length +
    deletingTemplePastRecords.length +
    deletingTempleTransactions.length +
    deletingTempleMemorialServices.length +
    deletingTempleTodos.length;

  const masterCategoryTabs: { id: MasterCategoryTab; label: string; desc: string; count: number }[] = [
    { id: 'householdTypes', label: '区分１ (種別)', desc: '正檀家・特別檀家・信徒など', count: (currentMasterOptions.householdTypes || []).length },
    { id: 'statuses', label: '区分２ (現況)', desc: '世帯の現況・連絡状況等の分類（任意）', count: (currentMasterOptions.statuses || []).length },
    { id: 'districts', label: '役職 (地区・役職)', desc: '総代・世話人・役員・地区など', count: (currentMasterOptions.districts || []).length },
    { id: 'incomeCategories', label: '収入勘定科目', desc: '法要布施・護持会費・寄付など', count: (currentMasterOptions.incomeCategories || []).length },
    { id: 'expenseCategories', label: '支出勘定科目', desc: '寺務費・営繕費・法要費など', count: (currentMasterOptions.expenseCategories || []).length },
    { id: 'paymentMethods', label: '納入・受取方法', desc: '現金・銀行振込・QRなど', count: (currentMasterOptions.paymentMethods || []).length },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-[#1A1A1A]/80 backdrop-blur-xs flex items-center justify-center p-4 font-serif">
      <div className="bg-white border border-[#D1CEC7] p-6 max-w-4xl w-full text-[#2D2D2D] space-y-4 shadow-2xl max-h-[94vh] flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center border-b border-[#D1CEC7] pb-3 shrink-0">
          <div className="flex items-center space-x-2">
            <Building2 className="w-5 h-5 text-[#1A1A1A]" />
            <div>
              <h3 className="text-lg font-bold text-[#1A1A1A]">寺院情報・兼務寺院・区分/勘定科目マスタ設定</h3>
              <p className="text-[11px] text-[#666666] font-sans">
                本寺および兼務寺院の諸元、会計年度、寺院別区分・勘定科目マスタ、年間行事を一括管理します
              </p>
            </div>
          </div>
          <button onClick={handleRequestClose} className="text-[#888888] hover:text-[#1A1A1A] p-1 cursor-pointer" title="閉じる">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Notification Toast if any */}
        {notificationMessage && (
          <div className="bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs px-3 py-2 flex items-center space-x-2 font-sans shrink-0 animate-fade-in shadow-xs">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="font-bold">{notificationMessage}</span>
          </div>
        )}

        {/* Temple Selector & List Bar */}
        <div className="bg-[#FAF9F5] border border-[#E5E0D8] p-3 shrink-0 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#444444] font-sans flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-[#D4AF37]" />
              登録寺院一覧（編集対象を選択）:
            </span>
            <button
              type="button"
              onClick={handleAddNewTemple}
              className="px-2.5 py-1 bg-[#1A1A1A] hover:bg-[#333333] text-[#D4AF37] text-xs font-bold flex items-center space-x-1 shadow-xs cursor-pointer font-sans"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>＋ 兼務寺院を追加</span>
            </button>
          </div>

          <div className="flex flex-wrap gap-2 pt-1 font-sans">
            {templeList.map((temple) => {
              const isSelected = temple.id === selectedTempleId;
              return (
                <div
                  key={temple.id || temple.name}
                  onClick={() => setSelectedTempleId(temple.id || 'temple-main')}
                  className={`flex items-center space-x-2 px-3 py-1.5 border text-xs cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-white border-[#1A1A1A] text-[#1A1A1A] font-bold shadow-sm ring-1 ring-[#1A1A1A]'
                      : 'bg-[#F2EFE9] border-[#D1CEC7] text-[#666666] hover:bg-white hover:text-[#1A1A1A]'
                  }`}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: temple.color || '#D4AF37' }}
                  />
                  <div className="flex items-center space-x-1.5">
                    {temple.isMain ? (
                      <span className="px-1 py-0.2 bg-[#D4AF37]/20 text-[#8C6D1F] text-[10px] font-bold">本寺</span>
                    ) : (
                      <span className="px-1 py-0.2 bg-emerald-100 text-emerald-800 text-[10px] font-bold">兼務</span>
                    )}
                    <span>{temple.mountainName ? `${temple.mountainName} ` : ''}{temple.name || '（寺院名未設定）'}</span>
                  </div>
                  {!temple.isMain && (
                    <button
                      type="button"
                      onClick={(e) => handleRequestDeleteTemple(temple, e)}
                      className="text-[#999999] hover:text-rose-600 ml-1 p-0.5"
                      title="この兼務寺院を削除"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Tab Navigation for Selected Temple and Priests */}
        <div className="flex flex-wrap border-b border-[#D1CEC7] font-sans text-xs shrink-0 bg-[#F9F7F2]">
          <button
            type="button"
            onClick={() => setActiveTab('basic')}
            className={`px-4 py-2.5 font-bold flex items-center space-x-1.5 border-b-2 transition-colors cursor-pointer ${
              activeTab === 'basic'
                ? 'border-[#1A1A1A] text-[#1A1A1A] bg-white border-t border-x border-[#D1CEC7] -mb-[1px]'
                : 'border-transparent text-[#666666] hover:text-[#1A1A1A]'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>【{currentTemple.name || '寺院名未設定'}】 基本情報・会計年度</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('master')}
            className={`px-4 py-2.5 font-bold flex items-center space-x-1.5 border-b-2 transition-colors cursor-pointer ${
              activeTab === 'master'
                ? 'border-[#1A1A1A] text-[#1A1A1A] bg-white border-t border-x border-[#D1CEC7] -mb-[1px]'
                : 'border-transparent text-[#666666] hover:text-[#1A1A1A]'
            }`}
          >
            <Settings className="w-3.5 h-3.5 text-[#D4AF37]" />
            <span>【{currentTemple.name || '寺院名未設定'}】 区分・勘定科目マスタ</span>
            <span className="px-1.5 py-0.2 bg-[#D4AF37]/20 text-[#8C6D1F] text-[10px] font-bold rounded-sm">
              寺院別
            </span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('priests')}
            className={`px-4 py-2.5 font-bold flex items-center space-x-1.5 border-b-2 transition-colors cursor-pointer ${
              activeTab === 'priests'
                ? 'border-[#1A1A1A] text-[#1A1A1A] bg-white border-t border-x border-[#D1CEC7] -mb-[1px]'
                : 'border-transparent text-[#666666] hover:text-[#1A1A1A]'
            }`}
          >
            <Users className="w-3.5 h-3.5 text-[#1A1A1A]" />
            <span>登録僧侶一覧</span>
            <span className="px-1.5 py-0.2 bg-gray-100 text-gray-700 text-[10px] font-bold rounded-sm">
              {reconciledPriestList.length}名
            </span>
          </button>
        </div>

        {/* Content Form */}
        <form onSubmit={handleSubmit} className="space-y-4 text-xs font-sans overflow-y-auto pr-1 flex-1">
          {/* ==================== TAB 1: BASIC INFO ==================== */}
          {activeTab === 'basic' && (
            <div className="space-y-4">
              <div className="bg-[#FAF9F5] p-3.5 border border-[#D1CEC7] space-y-3">
                <div className="flex items-center justify-between border-b border-[#E5E0D8] pb-1.5">
                  <span className="font-bold text-[#1A1A1A] text-xs flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-[#D4AF37]" />
                    寺院区分 & テーマカラー
                  </span>
                  <div className="flex items-center space-x-2">
                    <label className="flex items-center space-x-1.5 cursor-pointer font-bold">
                      <input
                        type="checkbox"
                        checked={currentTemple.isMain || false}
                        onChange={(e) => {
                          const isMain = e.target.checked;
                          if (isMain) {
                            // 他の寺院のisMainをfalseに
                            setTempleList((prev) =>
                              prev.map((t) => ({ ...t, isMain: t.id === currentTemple.id }))
                            );
                          } else {
                            updateCurrentTemple({ isMain: false });
                          }
                        }}
                        className="rounded-xs border-[#D1CEC7] text-[#1A1A1A]"
                      />
                      <span>本寺（メイン寺院）に指定</span>
                    </label>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-[#555555] mb-1">
                      テーマ識別カラー（ヘッダー・名簿・バッジ表示用）
                    </label>
                    <div className="flex items-center space-x-2">
                      <input
                        type="color"
                        value={currentTemple.color || '#D4AF37'}
                        onChange={(e) => updateCurrentTemple({ color: e.target.value })}
                        className="w-8 h-8 p-0 border border-[#D1CEC7] cursor-pointer rounded-xs"
                      />
                      <div className="flex flex-wrap gap-1">
                        {PRESET_COLORS.map((c) => (
                          <button
                            key={c.value}
                            type="button"
                            onClick={() => updateCurrentTemple({ color: c.value })}
                            className="w-5 h-5 rounded-xs border border-white shadow-xs cursor-pointer hover:scale-110 transition-transform"
                            style={{ backgroundColor: c.value }}
                            title={c.label}
                          />
                        ))}
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-[#555555] mb-1">
                      略称（タブ・ボタン表示用）
                    </label>
                    <input
                      type="text"
                      placeholder="例: 圓福寺 または 第2兼務"
                      value={currentTemple.shortName || ''}
                      onChange={(e) => updateCurrentTemple({ shortName: e.target.value })}
                      className="w-full bg-white border border-[#D1CEC7] px-2.5 py-1.5 focus:border-[#1A1A1A] focus:outline-hidden"
                    />
                  </div>
                </div>
              </div>

              {/* 寺院基本諸元 */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-[#555555] mb-1">山号</label>
                  <input
                    type="text"
                    placeholder="例: 慈光山"
                    value={currentTemple.mountainName || ''}
                    onChange={(e) => updateCurrentTemple({ mountainName: e.target.value })}
                    className="w-full bg-[#FAF9F5] border border-[#D1CEC7] px-2.5 py-1.5 focus:border-[#1A1A1A] focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-[#555555] mb-1">寺院名 *</label>
                  <input
                    type="text"
                    placeholder="例: 圓福寺"
                    value={currentTemple.name || ''}
                    onChange={(e) => updateCurrentTemple({ name: e.target.value })}
                    required
                    className="w-full bg-white border border-[#D1CEC7] px-2.5 py-1.5 font-bold focus:border-[#1A1A1A] focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-[#555555] mb-1">宗派</label>
                  <input
                    type="text"
                    placeholder="例: 曹洞宗"
                    value={currentTemple.sect || ''}
                    onChange={(e) => updateCurrentTemple({ sect: e.target.value })}
                    className="w-full bg-[#FAF9F5] border border-[#D1CEC7] px-2.5 py-1.5 focus:border-[#1A1A1A] focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-[#555555] mb-1">住職名（代表者）</label>
                  <input
                    type="text"
                    placeholder="例: 釈 孝徳"
                    value={currentTemple.chiefPriest || ''}
                    onChange={(e) => updateCurrentTemple({ chiefPriest: e.target.value })}
                    className="w-full bg-[#FAF9F5] border border-[#D1CEC7] px-2.5 py-1.5 focus:border-[#1A1A1A] focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-[#555555] mb-1">郵便番号</label>
                  <input
                    type="text"
                    placeholder="例: 123-4567"
                    value={currentTemple.postalCode || ''}
                    onChange={(e) => updateCurrentTemple({ postalCode: e.target.value })}
                    className="w-full bg-[#FAF9F5] border border-[#D1CEC7] px-2.5 py-1.5 focus:border-[#1A1A1A] focus:outline-hidden"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[#555555] mb-1">所在地（住所）</label>
                <input
                  type="text"
                  placeholder="例: 東京都文京区本郷 1-2-3"
                  value={currentTemple.address || ''}
                  onChange={(e) => updateCurrentTemple({ address: e.target.value })}
                  className="w-full bg-[#FAF9F5] border border-[#D1CEC7] px-2.5 py-1.5 focus:border-[#1A1A1A] focus:outline-hidden"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-[#555555] mb-1">電話番号</label>
                  <input
                    type="text"
                    placeholder="例: 03-1234-5678"
                    value={currentTemple.phone || ''}
                    onChange={(e) => updateCurrentTemple({ phone: e.target.value })}
                    className="w-full bg-[#FAF9F5] border border-[#D1CEC7] px-2.5 py-1.5 focus:border-[#1A1A1A] focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-[#555555] mb-1">FAX番号</label>
                  <input
                    type="text"
                    placeholder="例: 03-1234-5679"
                    value={currentTemple.fax || ''}
                    onChange={(e) => updateCurrentTemple({ fax: e.target.value })}
                    className="w-full bg-[#FAF9F5] border border-[#D1CEC7] px-2.5 py-1.5 focus:border-[#1A1A1A] focus:outline-hidden"
                  />
                </div>
              </div>

              {/* 公式ホームページURL */}
              <div className="bg-[#FAF9F5] p-3 border border-[#D1CEC7] space-y-1.5">
                <label className="block text-[11px] font-bold text-[#1A1A1A] flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-[#D4AF37]" />
                  公式ホームページ（URL）
                </label>
                <div className="flex items-center space-x-2">
                  <input
                    type="url"
                    placeholder="https://example-temple.jp"
                    value={currentTemple.websiteUrl || currentTemple.website || ''}
                    onChange={(e) => updateCurrentTemple({ websiteUrl: e.target.value, website: e.target.value })}
                    className="flex-1 bg-white border border-[#D1CEC7] px-2.5 py-1.5 focus:border-[#1A1A1A] focus:outline-hidden text-xs"
                  />
                  {(currentTemple.websiteUrl || currentTemple.website) && (
                    <a
                      href={currentTemple.websiteUrl || currentTemple.website}
                      target="_blank"
                      rel="noreferrer"
                      className="px-2.5 py-1.5 bg-[#1A1A1A] text-[#D4AF37] text-xs font-bold flex items-center space-x-1 hover:bg-[#333333] transition-colors"
                      title="ブラウザで開く"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>確認</span>
                    </a>
                  )}
                </div>
                <p className="text-[10px] text-[#777777]">
                  ※ 案内状や封筒、寺報・通信状の印刷時に寺院公式ホームページとして記載されます。
                </p>
              </div>

              {/* 会計年度・お盆時期設定 */}
              <div className="bg-[#FAF9F5] p-3.5 border border-[#D1CEC7] space-y-3">
                <div className="font-bold text-[#1A1A1A] text-xs border-b border-[#E5E0D8] pb-1.5 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-[#D4AF37]" />
                  会計年度期間 & お盆時期設定
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-[#555555] mb-1">お盆時期（新盆の算出基準）</label>
                    <select
                      value={currentTemple.bonSeason || '8月盆'}
                      onChange={(e) => updateCurrentTemple({ bonSeason: e.target.value as any })}
                      className="w-full bg-white border border-[#D1CEC7] px-2.5 py-1.5 focus:border-[#1A1A1A] focus:outline-hidden"
                    >
                      <option value="8月盆">8月盆（月遅れ盆・全国標準 / 8月13日〜16日）</option>
                      <option value="7月盆">7月盆（東京・都市部標準 / 7月13日〜16日）</option>
                      <option value="旧暦盆">旧暦盆（南西諸島など）</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-[#555555] mb-1">会計年度の開始月日</label>
                    <div className="flex items-center space-x-1.5">
                      <select
                        value={currentTemple.fiscalYearStartMonth || 4}
                        onChange={(e) => {
                          const m = Number(e.target.value);
                          const endM = m === 1 ? 12 : m - 1;
                          updateCurrentTemple({
                            fiscalYearStartMonth: m,
                            fiscalYearStartDay: 1,
                            fiscalYearEndMonth: endM,
                            fiscalYearEndDay: endM === 2 ? 28 : [4, 6, 9, 11].includes(endM) ? 30 : 31,
                          });
                        }}
                        className="bg-white border border-[#D1CEC7] px-2.5 py-1.5 focus:border-[#1A1A1A] focus:outline-hidden flex-1"
                      >
                        <option value={1}>1月1日開始（暦年会計 1/1〜12/31）</option>
                        <option value={4}>4月1日開始（一般年度 4/1〜翌3/31）</option>
                        <option value={10}>10月1日開始（秋季年度 10/1〜翌9/30）</option>
                        <option value={12}>12月1日開始（12/1〜翌11/30）</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              {/* 塔婆申込種類設定（最大3種類） */}
              <div className="bg-[#FAF9F5] p-3.5 border border-[#D1CEC7] space-y-3">
                <div className="flex items-center justify-between border-b border-[#E5E0D8] pb-1.5">
                  <div className="font-bold text-[#1A1A1A] text-xs flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-[#D4AF37]" />
                    <span>塔婆申込の種類設定（最大3種類）</span>
                  </div>
                  <span className="text-[10px] text-[#777777]">
                    ※ 空欄の項目は名簿や検索プルダウンに表示されません
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-[#1A1A1A] mb-1 flex items-center justify-between">
                      <span>塔婆申込１（標準）</span>
                      <span className="text-[10px] text-[#D4AF37] font-bold">基本デフォルト</span>
                    </label>
                    <input
                      type="text"
                      placeholder="例: 施餓鬼塔婆"
                      value={currentTemple.tobaType1 !== undefined ? currentTemple.tobaType1 : '施餓鬼塔婆'}
                      onChange={(e) => updateCurrentTemple({ tobaType1: e.target.value })}
                      className="w-full bg-white border border-[#D1CEC7] px-2.5 py-1.5 font-bold focus:border-[#1A1A1A] focus:outline-hidden"
                    />
                    <p className="text-[10px] text-[#888888] mt-0.5">
                      ※ 施餓鬼法要などの主塔婆
                    </p>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-[#555555] mb-1">
                      塔婆申込２（任意）
                    </label>
                    <input
                      type="text"
                      placeholder="例: 彼岸塔婆、春季彼岸"
                      value={currentTemple.tobaType2 || ''}
                      onChange={(e) => updateCurrentTemple({ tobaType2: e.target.value })}
                      className="w-full bg-white border border-[#D1CEC7] px-2.5 py-1.5 focus:border-[#1A1A1A] focus:outline-hidden"
                    />
                    <p className="text-[10px] text-[#888888] mt-0.5">
                      ※ 入力すると名簿に第2塔婆枠が表示
                    </p>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-[#555555] mb-1">
                      塔婆申込３（任意）
                    </label>
                    <input
                      type="text"
                      placeholder="例: 合同供養、十王塔婆"
                      value={currentTemple.tobaType3 || ''}
                      onChange={(e) => updateCurrentTemple({ tobaType3: e.target.value })}
                      className="w-full bg-white border border-[#D1CEC7] px-2.5 py-1.5 focus:border-[#1A1A1A] focus:outline-hidden"
                    />
                    <p className="text-[10px] text-[#888888] mt-0.5">
                      ※ 入力すると名簿に第3塔婆枠が表示
                    </p>
                  </div>
                </div>
              </div>

              {/* 集金の種類設定（最大3種類） ＆ 勘定科目マッピング */}
              <div className="bg-[#FAF9F5] p-3.5 border border-[#D1CEC7] space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-[#E5E0D8] pb-1.5 gap-1">
                  <div className="font-bold text-[#1A1A1A] text-xs flex items-center gap-1.5">
                    <Coins className="w-3.5 h-3.5 text-[#D4AF37]" />
                    <span>集金項目の設定 ＆ 会計連動（勘定科目マッピング）</span>
                  </div>
                  <span className="text-[10px] text-[#777777]">
                    ※ 一括会計処理（高速受付）や檀家名簿の集金枠に自動連動します
                  </span>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] text-[#666666] font-sans">
                  <span>各集金項目の名称と、連動する収入勘定科目を設定できます（金額は各檀家世帯ごとに個別に管理されます）。</span>
                  <button
                    type="button"
                    onClick={() => {
                      updateCurrentTemple({
                        feeType1: '護持会費',
                        feeType1Category: '護持会費',
                        feeType2: '墓地管理費',
                        feeType2Category: '墓地管理費',
                      });
                    }}
                    className="px-2 py-0.5 bg-white hover:bg-gray-100 border border-[#D1CEC7] text-[#1A1A1A] text-[10px] font-bold rounded-xs cursor-pointer shrink-0 self-start sm:self-auto"
                  >
                    標準プリセットを適用（護持会費・墓地管理費）
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {/* 集金項目１ */}
                  <div className="bg-white p-2.5 border border-[#D1CEC7] space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-[#1A1A1A]">集金項目１</span>
                      <span className="text-[9px] px-1.5 py-0.2 bg-[#D4AF37]/20 text-[#8C6D1F] font-bold rounded-2xs">第1枠</span>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-[#666666] mb-0.5">項目名称</label>
                      <input
                        type="text"
                        placeholder="例: 護持会費"
                        value={currentTemple.feeType1 || ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          const updates: Partial<TempleProfile> = { feeType1: val };
                          if (!currentTemple.feeType1Category && val) {
                            updates.feeType1Category = val;
                          }
                          updateCurrentTemple(updates);
                        }}
                        className="w-full bg-[#FAF9F5] border border-[#D1CEC7] px-2 py-1 text-xs font-bold focus:border-[#1A1A1A] focus:outline-hidden"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-[#666666] mb-0.5">連動する勘定科目（収入）</label>
                      <select
                        value={currentTemple.feeType1Category || (currentTemple.feeType1 ? currentTemple.feeType1 : '護持会費')}
                        onChange={(e) => updateCurrentTemple({ feeType1Category: e.target.value })}
                        className="w-full bg-white border border-[#D1CEC7] px-2 py-1 text-xs text-[#1A1A1A] focus:border-[#1A1A1A] focus:outline-hidden"
                      >
                        {(currentMasterOptions.incomeCategories || ['護持会費', '法要布施', '墓地管理費', '特別寄付', '繰越金', 'その他']).map((cat) => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* 集金項目２ */}
                  <div className="bg-white p-2.5 border border-[#D1CEC7] space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-[#1A1A1A]">集金項目２</span>
                      <span className="text-[9px] px-1.5 py-0.2 bg-gray-100 text-gray-700 font-bold rounded-2xs">第2枠</span>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-[#666666] mb-0.5">項目名称</label>
                      <input
                        type="text"
                        placeholder="例: 墓地管理費"
                        value={currentTemple.feeType2 || ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          const updates: Partial<TempleProfile> = { feeType2: val };
                          if (!currentTemple.feeType2Category && val) {
                            updates.feeType2Category = val;
                          }
                          updateCurrentTemple(updates);
                        }}
                        className="w-full bg-[#FAF9F5] border border-[#D1CEC7] px-2 py-1 text-xs font-bold focus:border-[#1A1A1A] focus:outline-hidden"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-[#666666] mb-0.5">連動する勘定科目（収入）</label>
                      <select
                        value={currentTemple.feeType2Category || (currentTemple.feeType2 ? currentTemple.feeType2 : '墓地管理費')}
                        onChange={(e) => updateCurrentTemple({ feeType2Category: e.target.value })}
                        className="w-full bg-white border border-[#D1CEC7] px-2 py-1 text-xs text-[#1A1A1A] focus:border-[#1A1A1A] focus:outline-hidden"
                      >
                        {(currentMasterOptions.incomeCategories || ['護持会費', '法要布施', '墓地管理費', '特別寄付', '繰越金', 'その他']).map((cat) => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* 集金項目３ */}
                  <div className="bg-white p-2.5 border border-[#D1CEC7] space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-[#1A1A1A]">集金項目３</span>
                      <span className="text-[9px] px-1.5 py-0.2 bg-gray-100 text-gray-700 font-bold rounded-2xs">第3枠</span>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-[#666666] mb-0.5">項目名称</label>
                      <input
                        type="text"
                        placeholder="例: 境内整備費、特別賦課金"
                        value={currentTemple.feeType3 || ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          const updates: Partial<TempleProfile> = { feeType3: val };
                          if (!currentTemple.feeType3Category && val) {
                            updates.feeType3Category = val;
                          }
                          updateCurrentTemple(updates);
                        }}
                        className="w-full bg-[#FAF9F5] border border-[#D1CEC7] px-2 py-1 text-xs font-bold focus:border-[#1A1A1A] focus:outline-hidden"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-[#666666] mb-0.5">連動する勘定科目（収入）</label>
                      <select
                        value={currentTemple.feeType3Category || (currentTemple.feeType3 ? currentTemple.feeType3 : '特別寄付')}
                        onChange={(e) => updateCurrentTemple({ feeType3Category: e.target.value })}
                        className="w-full bg-white border border-[#D1CEC7] px-2 py-1 text-xs text-[#1A1A1A] focus:border-[#1A1A1A] focus:outline-hidden"
                      >
                        {(currentMasterOptions.incomeCategories || ['護持会費', '法要布施', '墓地管理費', '特別寄付', '繰越金', 'その他']).map((cat) => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              {/* 兼務寺院の削除エリア（非本寺のみ表示） */}
              {!currentTemple.isMain && (
                <div className="bg-rose-50 border-2 border-rose-200 p-4 space-y-2.5 mt-4 rounded-xs shadow-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rose-200 pb-2">
                    <div className="flex items-center space-x-2 text-rose-900 font-bold text-xs">
                      <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                      <span>兼務寺院「{currentTemple.name}」の削除設定</span>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => handleRequestDeleteTemple(currentTemple, e)}
                      className="px-3.5 py-1.5 bg-rose-700 hover:bg-rose-800 text-white font-bold text-xs flex items-center space-x-1.5 transition-colors cursor-pointer shadow-xs"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>この兼務寺院（{currentTemple.name}）を削除する</span>
                    </button>
                  </div>
                  <p className="text-[11px] text-rose-800 leading-relaxed">
                    ※ 兼務寺院「{currentTemple.name}」を削除すると、この兼務寺院に所属する檀家世帯名簿・過去帳・会計帳簿・法事予約・寺院ToDoなどの<strong>すべての関連データが完全に消去</strong>されます。
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ==================== TAB 2: MASTER OPTIONS (区分・勘定科目) ==================== */}
          {activeTab === 'master' && (
            <div className="space-y-4">
              {/* Batch Actions & Synchronization Bar */}
              <div className="bg-[#FAF8F5] border-2 border-[#D4AF37]/80 p-3 space-y-2.5 shadow-xs">
                <div className="flex items-center justify-between border-b border-[#EBE7DF] pb-2">
                  <div className="flex items-center space-x-2">
                    <Sparkles className="w-4 h-4 text-[#D4AF37]" />
                    <span className="font-bold text-xs uppercase tracking-wider text-[#1A1A1A]">
                      本寺・兼務寺院 マスタ一括コピー ＆ 連携操作
                    </span>
                  </div>
                  <span className="text-[10px] text-[#666666]">
                    現在編集中の寺院: <strong className="text-[#1A1A1A]">{currentTemple.name}</strong> ({currentTemple.isMain ? '本寺' : '兼務'})
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {/* Action 1: 本寺のマスタを全兼務寺院に一括コピー */}
                  <button
                    type="button"
                    onClick={handleCopyMainToAllSubTemples}
                    className="py-2 px-3 bg-[#1A1A1A] hover:bg-[#333333] text-[#D4AF37] border border-[#D4AF37] font-bold text-xs flex items-center justify-center space-x-1.5 transition-colors cursor-pointer shadow-xs"
                    title="本寺の区分・勘定科目マスタをすべての兼務寺院に一括コピーして同期します"
                  >
                    <Layers className="w-4 h-4 text-[#D4AF37]" />
                    <span>本寺のマスタ設定を【全兼務寺院に一括コピー】</span>
                  </button>

                  {/* Action 2: 他寺院からのコピー or 初期値リセット */}
                  <div className="flex items-center space-x-1.5">
                    {templeList.length > 1 && (
                      <select
                        onChange={(e) => {
                          if (e.target.value) {
                            handleCopyFromSpecificTemple(e.target.value);
                            e.target.value = '';
                          }
                        }}
                        defaultValue=""
                        className="bg-white border border-[#D1CEC7] px-2 py-1.5 text-xs text-[#333333] font-bold flex-1 focus:outline-hidden"
                      >
                        <option value="" disabled>他寺院からマスタをコピー...</option>
                        {templeList
                          .filter((t) => t.id !== currentTemple.id)
                          .map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name} ({t.isMain ? '本寺' : '兼務'}) のマスタを適用
                            </option>
                          ))}
                      </select>
                    )}

                    <button
                      type="button"
                      onClick={handleResetCurrentMasterToDefault}
                      className="px-2.5 py-1.5 bg-white hover:bg-gray-100 border border-[#D1CEC7] text-[#555555] hover:text-[#1A1A1A] text-xs font-bold flex items-center space-x-1 transition-colors shrink-0 cursor-pointer"
                      title="初期標準マスタにリセット"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>初期値に戻す</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Master Category Selector Sub-tabs */}
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-1 bg-[#F2EFE9] p-1 border border-[#D1CEC7]">
                {masterCategoryTabs.map((cat) => {
                  const isActive = activeMasterCategory === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => {
                        setActiveMasterCategory(cat.id);
                        setEditingIndex(null);
                        setEditingText('');
                        setNewItemText('');
                      }}
                      className={`py-2 px-1 text-center transition-all cursor-pointer flex flex-col items-center justify-center ${
                        isActive
                          ? 'bg-white text-[#1A1A1A] font-bold shadow-xs border-b-2 border-[#D4AF37]'
                          : 'text-[#666666] hover:bg-white/60 hover:text-[#1A1A1A]'
                      }`}
                    >
                      <span className="text-[11px] truncate w-full">{cat.label}</span>
                      <span className={`text-[10px] px-1.5 py-0.2 rounded-full mt-0.5 ${
                        isActive ? 'bg-[#D4AF37]/20 text-[#8C6D1F] font-bold' : 'bg-gray-200 text-gray-600'
                      }`}>
                        {cat.count}件
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Current Master Category Editor */}
              <div className="bg-white border border-[#D1CEC7] p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-[#EBE7DF] pb-2">
                  <div>
                    <h4 className="font-bold text-xs text-[#1A1A1A] flex items-center gap-1.5">
                      <Settings className="w-3.5 h-3.5 text-[#D4AF37]" />
                      <span>「{masterCategoryTabs.find((c) => c.id === activeMasterCategory)?.label}」の設定一覧</span>
                      <span className="text-[#888888] font-normal text-[11px]">
                        （{currentTemple.name} 専用マスタ）
                      </span>
                    </h4>
                    <p className="text-[11px] text-[#666666] mt-0.5">
                      {masterCategoryTabs.find((c) => c.id === activeMasterCategory)?.desc}。ドラッグまたは上下で順序を並べ替えられます。
                    </p>
                  </div>
                </div>

                {/* Add New Master Item Input */}
                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    placeholder={`新しい${masterCategoryTabs.find((c) => c.id === activeMasterCategory)?.label}の項目名を入力...`}
                    value={newItemText}
                    onChange={(e) => setNewItemText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddMasterItem();
                      }
                    }}
                    className="flex-1 bg-[#FAF9F5] border border-[#D1CEC7] px-3 py-1.5 text-xs focus:border-[#1A1A1A] focus:outline-hidden"
                  />
                  <button
                    type="button"
                    onClick={handleAddMasterItem}
                    disabled={!newItemText.trim()}
                    className="px-4 py-1.5 bg-[#1A1A1A] hover:bg-[#333333] disabled:opacity-40 text-[#D4AF37] text-xs font-bold flex items-center space-x-1 transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>追加</span>
                  </button>
                </div>

                {/* Master Items List */}
                <div className="space-y-1.5 max-h-[36vh] overflow-y-auto pr-1">
                  {currentMasterItemList.length === 0 ? (
                    <div className="text-center py-6 text-xs text-[#888888] bg-[#FAF9F5] border border-dashed border-[#D1CEC7]">
                      登録されている項目がありません。上の入力欄から項目を追加してください。
                    </div>
                  ) : (
                    currentMasterItemList.map((item, index) => {
                      const isEditing = editingIndex === index;
                      const isDragging = draggedIndex === index;
                      const isOver = dragOverIndex === index;

                      return (
                        <div
                          key={`${item}-${index}`}
                          draggable={!isEditing}
                          onDragStart={() => setDraggedIndex(index)}
                          onDragOver={(e) => {
                            e.preventDefault();
                            setDragOverIndex(index);
                          }}
                          onDragLeave={() => {
                            if (dragOverIndex === index) setDragOverIndex(null);
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            if (draggedIndex !== null) {
                              handleReorderMasterItem(draggedIndex, index);
                              setDraggedIndex(null);
                              setDragOverIndex(null);
                            }
                          }}
                          className={`flex items-center justify-between p-2 border transition-colors ${
                            isDragging
                              ? 'opacity-40 bg-gray-100 border-[#999999]'
                              : isOver
                              ? 'bg-amber-50 border-[#D4AF37]'
                              : 'bg-[#FAF9F5] border-[#E5E0D8] hover:bg-white hover:border-[#D1CEC7]'
                          }`}
                        >
                          <div className="flex items-center space-x-2 flex-1">
                            <span className="cursor-grab text-[#999999] hover:text-[#333333] p-0.5">
                              <GripVertical className="w-3.5 h-3.5" />
                            </span>
                            <span className="text-[10px] text-[#888888] font-mono w-4">
                              {index + 1}.
                            </span>

                            {isEditing ? (
                              <input
                                type="text"
                                value={editingText}
                                onChange={(e) => setEditingText(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    handleSaveEditMasterItem(index);
                                  } else if (e.key === 'Escape') {
                                    setEditingIndex(null);
                                  }
                                }}
                                autoFocus
                                className="flex-1 bg-white border border-[#D4AF37] px-2 py-0.5 text-xs font-bold focus:outline-hidden"
                              />
                            ) : (
                              <span className="font-bold text-[#1A1A1A] text-xs">{item}</span>
                            )}
                          </div>

                          <div className="flex items-center space-x-1">
                            {isEditing ? (
                              <button
                                type="button"
                                onClick={() => handleSaveEditMasterItem(index)}
                                className="px-2 py-1 bg-emerald-800 text-white text-[10px] font-bold flex items-center space-x-0.5 cursor-pointer"
                              >
                                <Check className="w-3 h-3" />
                                <span>確定</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleStartEditMasterItem(index)}
                                className="text-[#666666] hover:text-[#1A1A1A] p-1 transition-colors cursor-pointer"
                                title="名称を変更"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleDeleteMasterItem(index)}
                              className="text-[#999999] hover:text-rose-600 p-1 transition-colors cursor-pointer"
                              title="項目を削除"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ==================== TAB 3: REGISTERED PRIESTS ==================== */}
          {activeTab === 'priests' && (
            <div className="space-y-4">
              <div className="bg-[#FAF9F5] p-4 border border-[#D1CEC7] space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E5E0D8] pb-2.5">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1.5 font-bold text-[#1A1A1A] text-xs">
                      <Users className="w-4 h-4 text-[#D4AF37]" />
                      <span>登録僧侶一覧（本寺・兼務寺住職 ＆ 副住職・手伝い助法僧侶）</span>
                      <span className="px-2 py-0.5 bg-[#1A1A1A] text-[#D4AF37] text-[10px] font-bold rounded-sm ml-1">
                        合計 {reconciledPriestList.length}名
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-500 font-sans">
                      本寺・兼務寺の住職名は寺院基本情報と自動連動します。副住職や法要・棚経をお手伝いいただく助法僧侶も個別に追加・管理できます。
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleOpenAddPriestModal}
                    className="px-3 py-1.5 bg-[#1A1A1A] hover:bg-[#333333] text-[#D4AF37] text-xs font-bold flex items-center space-x-1.5 shadow-xs cursor-pointer font-sans"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>＋ 僧侶を追加</span>
                  </button>
                </div>

                {reconciledPriestList.length === 0 ? (
                  <div className="p-8 text-center bg-white border border-dashed border-[#D1CEC7] text-gray-400 space-y-2">
                    <Users className="w-8 h-8 mx-auto opacity-30" />
                    <p className="text-xs">登録されている僧侶はいません。</p>
                    <p className="text-[11px] text-gray-400">
                      寺院の基本情報で住職名を入力するか、「＋ 僧侶を追加」ボタンから副住職・手伝い僧侶を登録してください。
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
                    {reconciledPriestList.map((priest) => {
                      const isAuto = Boolean(priest.isAutoChief);
                      const isMainChief = Boolean(priest.isMainChief);

                      return (
                        <div
                          key={priest.id}
                          className={`p-3 border rounded-xs flex flex-col justify-between transition-all ${
                            isMainChief
                              ? 'bg-gradient-to-br from-[#FCFBF7] to-[#F7F3E9] border-[#D4AF37]/80 shadow-xs'
                              : isAuto
                              ? 'bg-gradient-to-br from-[#F4F9F5] to-[#EBF5ED] border-emerald-300 shadow-xs'
                              : 'bg-white border-[#D1CEC7] hover:border-[#1A1A1A] shadow-2xs'
                          }`}
                        >
                          <div className="space-y-2">
                            <div className="flex items-start justify-between gap-1.5 border-b border-gray-100/80 pb-1.5">
                              <div className="space-y-0.5 min-w-0">
                                <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
                                  <span
                                    className={`px-1.5 py-0.5 text-[9px] font-bold rounded-2xs ${
                                      isMainChief
                                        ? 'bg-[#D4AF37]/20 text-[#8C6D1F] border border-[#D4AF37]/40'
                                        : isAuto
                                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                        : priest.role?.includes('副住職')
                                        ? 'bg-indigo-100 text-indigo-800 border border-indigo-200'
                                        : 'bg-amber-100 text-amber-900 border border-amber-200'
                                    }`}
                                  >
                                    {priest.role || '僧侶'}
                                  </span>
                                  {isAuto && (
                                    <span className="text-[9px] text-gray-400 bg-gray-100 px-1 py-0.2 rounded-2xs">
                                      自動連動
                                    </span>
                                  )}
                                </div>
                                <h5 className="font-bold text-sm text-[#1A1A1A] truncate mt-0.5" title={priest.name}>
                                  {priest.name || '（未設定）'}
                                </h5>
                                {priest.furigana && (
                                  <div className="text-[10px] text-gray-500 truncate">{priest.furigana}</div>
                                )}
                              </div>

                              <div className="flex items-center space-x-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => handleOpenEditPriestModal(priest)}
                                  className="p-1 text-gray-600 hover:text-[#1A1A1A] hover:bg-gray-200/70 rounded-xs transition-colors"
                                  title="僧侶情報を編集"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeletePriest(priest.id)}
                                  className="p-1 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-xs transition-colors cursor-pointer"
                                  title={isAuto ? "住職・僧侶登録を解除して削除" : "僧侶を削除"}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>

                            <div className="text-[11px] text-gray-600 space-y-1">
                              <div className="flex items-center gap-1.5 truncate">
                                <Building2 className="w-3 h-3 text-gray-400 shrink-0" />
                                <span className="text-gray-400 text-[10px]">所属:</span>
                                <span className="font-medium text-gray-800 truncate" title={priest.templeName || ''}>
                                  {priest.templeName || '所属寺院未指定'}
                                </span>
                              </div>

                              {priest.phone && (
                                <div className="flex items-center gap-1.5 truncate">
                                  <Phone className="w-3 h-3 text-gray-400 shrink-0" />
                                  <span className="text-gray-700 truncate">{priest.phone}</span>
                                </div>
                              )}

                              {priest.email && (
                                <div className="flex items-center gap-1.5 truncate">
                                  <Mail className="w-3 h-3 text-gray-400 shrink-0" />
                                  <span className="text-gray-700 truncate">{priest.email}</span>
                                </div>
                              )}

                              {priest.notes && (
                                <div className="pt-1 border-t border-gray-100 text-[10px] text-gray-500 line-clamp-2" title={priest.notes}>
                                  {priest.notes}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="bg-amber-50/70 border border-amber-200 p-3 rounded-xs text-[11px] text-amber-900 space-y-1">
                <div className="font-bold flex items-center gap-1">
                  <Check className="w-3.5 h-3.5 text-amber-700" />
                  <span>法要予約・棚経（お盆巡回）での僧侶割り当て連動</span>
                </div>
                <p>
                  ここで登録された僧侶は、法事・法要予約カレンダーの「担当僧侶」選択や、お盆棚経の巡回担当者プルダウンに自動で候補として表示されます。
                </p>
              </div>
            </div>
          )}

          {/* Footer Action Controls */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-[#D1CEC7] shrink-0 font-sans">
            <div className="flex items-center space-x-3">
              <span className="text-[11px] text-[#666666]">
                登録寺院数: <strong>{templeList.length}寺</strong>（本寺: {templeList.find((t) => t.isMain)?.name || '未指定'}）
              </span>
              {onResetDatabase && (
                <button
                  type="button"
                  onClick={() => {
                    setIsResetDbAgreed(false);
                    setShowResetDbModal(true);
                  }}
                  className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-300 font-bold text-[11px] flex items-center space-x-1.5 transition-colors cursor-pointer rounded-xs"
                  title="データベースを完全に初期化して全データをリセットします"
                >
                  <Database className="w-3.5 h-3.5 text-rose-600" />
                  <span>データベース完全初期化</span>
                </button>
              )}
            </div>

            <div className="flex space-x-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-[#FAF9F5] border border-[#D1CEC7] text-[#555555] font-bold text-xs hover:bg-[#EBE7DF] transition-colors cursor-pointer"
              >
                キャンセル
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-[#1A1A1A] hover:bg-[#333333] text-[#D4AF37] border border-[#D4AF37] font-bold text-xs uppercase tracking-wider transition-colors shadow-xs cursor-pointer flex items-center space-x-1.5"
              >
                <Check className="w-4 h-4" />
                <span>寺院設定＆マスタを保存</span>
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Save Confirmation Modal */}
      <SaveConfirmModal
        isOpen={showSaveConfirm}
        title="寺院設定・マスタ設定の保存確認"
        message="編集中の寺院情報・区分マスタを保存しますか？"
        description="「保存して閉じる」を押すと変更内容を反映して閉じます。「保存せずに閉じる」を押すと今回の編集は破棄されます。"
        onSaveAndClose={executeSaveAndClose}
        onDiscardAndClose={() => {
          setShowSaveConfirm(false);
          onClose();
        }}
        onCancel={() => setShowSaveConfirm(false)}
      />

      {/* Priest Add / Edit Sub-Modal */}
      {isPriestModalOpen && editingPriest && (
        <div className="fixed inset-0 z-60 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 font-sans animate-fade-in">
          <div className="bg-white border border-[#D1CEC7] p-6 max-w-lg w-full space-y-4 shadow-2xl rounded-xs">
            <div className="flex justify-between items-center border-b border-[#E5E0D8] pb-2.5">
              <div className="flex items-center space-x-2">
                <Users className="w-5 h-5 text-[#1A1A1A]" />
                <h4 className="font-bold text-[#1A1A1A] text-sm">
                  {editingPriest.isAutoChief
                    ? '住職情報の確認・編集（寺院情報と自動連動）'
                    : editingPriest.name
                    ? '僧侶情報の編集'
                    : '新しい僧侶の追加'}
                </h4>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsPriestModalOpen(false);
                  setEditingPriest(null);
                }}
                className="text-gray-400 hover:text-gray-700 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSavePriestModal} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block font-bold text-[#333333]">
                    僧侶氏名 <span className="text-rose-600">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="例: 田中 慈光"
                    value={editingPriest.name || ''}
                    onChange={(e) => setEditingPriest({ ...editingPriest, name: e.target.value })}
                    className="w-full bg-[#FAF9F5] border border-[#D1CEC7] px-2.5 py-1.5 focus:bg-white focus:border-[#1A1A1A] focus:outline-hidden"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block font-bold text-[#555555]">フリガナ</label>
                  <input
                    type="text"
                    placeholder="例: タナカ ジコウ"
                    value={editingPriest.furigana || ''}
                    onChange={(e) => setEditingPriest({ ...editingPriest, furigana: e.target.value })}
                    className="w-full bg-[#FAF9F5] border border-[#D1CEC7] px-2.5 py-1.5 focus:bg-white focus:border-[#1A1A1A] focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block font-bold text-[#333333]">役職・役割</label>
                  <input
                    type="text"
                    placeholder="例: 副住職、助法僧侶、衆僧など"
                    list="priest-role-suggestions"
                    value={editingPriest.role || ''}
                    onChange={(e) => setEditingPriest({ ...editingPriest, role: e.target.value })}
                    className="w-full bg-[#FAF9F5] border border-[#D1CEC7] px-2.5 py-1.5 focus:bg-white focus:border-[#1A1A1A] focus:outline-hidden"
                  />
                  <datalist id="priest-role-suggestions">
                    <option value="本寺住職" />
                    <option value="兼務寺住職" />
                    <option value="副住職" />
                    <option value="助法僧侶" />
                    <option value="衆僧" />
                    <option value="客僧" />
                    <option value="役僧" />
                    <option value="随身" />
                    <option value="他寺院手伝い僧侶" />
                  </datalist>
                </div>

                <div className="space-y-1">
                  <label className="block font-bold text-[#333333]">所属寺院・出仕先</label>
                  <select
                    value={editingPriest.templeId || (editingPriest.templeName ? '__EXTERNAL__' : '')}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === '__EXTERNAL__') {
                        setEditingPriest({
                          ...editingPriest,
                          templeId: '',
                          templeName: editingPriest.templeName || '外部寺院（他寺）',
                        });
                      } else {
                        const targetT = templeList.find((t) => t.id === val);
                        setEditingPriest({
                          ...editingPriest,
                          templeId: val,
                          templeName: targetT
                            ? `${targetT.mountainName ? targetT.mountainName + ' ' : ''}${targetT.name || ''}`
                            : '',
                        });
                      }
                    }}
                    className="w-full bg-[#FAF9F5] border border-[#D1CEC7] px-2.5 py-1.5 focus:bg-white focus:border-[#1A1A1A] focus:outline-hidden"
                  >
                    {templeList.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.isMain ? '【本寺】' : '【兼務】'} {t.mountainName ? `${t.mountainName} ` : ''}{t.name}
                      </option>
                    ))}
                    <option value="__EXTERNAL__">外部寺院・他寺院（手伝い・客僧など）</option>
                  </select>
                </div>
              </div>

              {(!editingPriest.templeId || editingPriest.templeId === '__EXTERNAL__') && (
                <div className="space-y-1 bg-amber-50/60 p-2.5 border border-amber-200">
                  <label className="block font-bold text-amber-950 text-[11px]">
                    外部所属寺院名（手伝い元・本寺以外の自坊など）:
                  </label>
                  <input
                    type="text"
                    placeholder="例: 泰平寺（近隣手伝い）、吉祥寺など"
                    value={editingPriest.templeName || ''}
                    onChange={(e) => setEditingPriest({ ...editingPriest, templeName: e.target.value })}
                    className="w-full bg-white border border-[#D1CEC7] px-2.5 py-1.5 focus:border-[#1A1A1A] focus:outline-hidden"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block font-bold text-[#555555] flex items-center gap-1">
                    <Phone className="w-3 h-3 text-gray-400" />
                    <span>電話番号 / 携帯</span>
                  </label>
                  <input
                    type="text"
                    placeholder="例: 090-1234-5678"
                    value={editingPriest.phone || ''}
                    onChange={(e) => setEditingPriest({ ...editingPriest, phone: e.target.value })}
                    className="w-full bg-[#FAF9F5] border border-[#D1CEC7] px-2.5 py-1.5 focus:bg-white focus:border-[#1A1A1A] focus:outline-hidden"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block font-bold text-[#555555] flex items-center gap-1">
                    <Mail className="w-3 h-3 text-gray-400" />
                    <span>メールアドレス</span>
                  </label>
                  <input
                    type="email"
                    placeholder="例: priest@example.com"
                    value={editingPriest.email || ''}
                    onChange={(e) => setEditingPriest({ ...editingPriest, email: e.target.value })}
                    className="w-full bg-[#FAF9F5] border border-[#D1CEC7] px-2.5 py-1.5 focus:bg-white focus:border-[#1A1A1A] focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="block font-bold text-[#555555]">備考・担当法要・特記事項</label>
                <textarea
                  rows={2}
                  placeholder="例: 彼岸会・施餓鬼会の助法・式衆。法事予約や棚経の出仕担当など。"
                  value={editingPriest.notes || ''}
                  onChange={(e) => setEditingPriest({ ...editingPriest, notes: e.target.value })}
                  className="w-full bg-[#FAF9F5] border border-[#D1CEC7] px-2.5 py-1.5 focus:bg-white focus:border-[#1A1A1A] focus:outline-hidden"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-[#E5E0D8]">
                <button
                  type="button"
                  onClick={() => {
                    setIsPriestModalOpen(false);
                    setEditingPriest(null);
                  }}
                  className="px-4 py-1.5 bg-[#F2EFE9] border border-[#D1CEC7] text-xs font-bold text-[#555555] hover:bg-[#E5E0D8] transition-colors cursor-pointer"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  className="px-5 py-1.5 bg-[#1A1A1A] hover:bg-[#333333] text-[#D4AF37] text-xs font-bold flex items-center space-x-1 shadow-xs transition-colors cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>僧侶情報を保存</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Sub-temple Confirmation Modal (With Strong Warning & Record Statistics) */}
      {templeToDelete && (
        <div className="fixed inset-0 z-60 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 font-sans animate-fade-in">
          <div className="bg-white border-2 border-rose-600 p-6 max-w-lg w-full space-y-4 shadow-2xl rounded-xs">
            <div className="flex items-center space-x-2 text-rose-700 font-bold text-base border-b border-rose-200 pb-2">
              <ShieldAlert className="w-6 h-6 text-rose-600 shrink-0" />
              <span>兼務寺院「{templeToDelete.name}」完全消去の警告</span>
            </div>

            <div className="bg-rose-50 border border-rose-300 p-3.5 space-y-2 rounded-xs text-xs text-rose-950">
              <p className="font-bold leading-relaxed flex items-center gap-1.5 text-rose-900">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>【警告】兼務寺院および関連するすべてのレコードが完全に消去されます</span>
              </p>
              <p className="text-[11px] leading-relaxed text-[#444444]">
                兼務寺院「<strong>{templeToDelete.mountainName ? `${templeToDelete.mountainName} ` : ''}{templeToDelete.name}</strong>」を削除すると、この兼務寺院に紐づく以下の全データがデータベース（IndexedDBおよびローカルストレージ）から<strong>永久に抹消</strong>され、復元できなくなります。
              </p>
            </div>

            {/* Record Statistics Grid */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold text-[#555555]">削除対象となる関連レコード明細:</span>
              <div className="grid grid-cols-2 gap-2 bg-[#FAF9F5] p-3 border border-[#E5E0D8] text-xs">
                <div className="flex justify-between py-1 border-b border-[#EBE7DF]">
                  <span className="text-[#666666]">檀家・世帯データ:</span>
                  <strong className={deletingTempleHouseholds.length > 0 ? 'text-rose-700 font-bold' : 'text-[#333333]'}>
                    {deletingTempleHouseholds.length} 件
                  </strong>
                </div>
                <div className="flex justify-between py-1 border-b border-[#EBE7DF]">
                  <span className="text-[#666666]">過去帳（戒名・俗名）:</span>
                  <strong className={deletingTemplePastRecords.length > 0 ? 'text-rose-700 font-bold' : 'text-[#333333]'}>
                    {deletingTemplePastRecords.length} 件
                  </strong>
                </div>
                <div className="flex justify-between py-1 border-b border-[#EBE7DF]">
                  <span className="text-[#666666]">会計出納明細データ:</span>
                  <strong className={deletingTempleTransactions.length > 0 ? 'text-rose-700 font-bold' : 'text-[#333333]'}>
                    {deletingTempleTransactions.length} 件
                  </strong>
                </div>
                <div className="flex justify-between py-1 border-b border-[#EBE7DF]">
                  <span className="text-[#666666]">法事・法要予約データ:</span>
                  <strong className={deletingTempleMemorialServices.length > 0 ? 'text-rose-700 font-bold' : 'text-[#333333]'}>
                    {deletingTempleMemorialServices.length} 件
                  </strong>
                </div>
                <div className="flex justify-between py-1 col-span-2">
                  <span className="text-[#666666]">寺院ToDo・タスク:</span>
                  <strong className={deletingTempleTodos.length > 0 ? 'text-rose-700 font-bold' : 'text-[#333333]'}>
                    {deletingTempleTodos.length} 件
                  </strong>
                </div>
              </div>
              <div className="text-[10px] text-right font-bold text-rose-700 pt-0.5">
                合計消去対象: {totalDeletingRecordsCount} 件のレコード + 兼務寺院専用マスタ
              </div>
            </div>

            {/* Explicit Agreement Checkbox */}
            <div className="bg-amber-50/80 border border-amber-300 p-3 rounded-xs">
              <label className="flex items-start space-x-2.5 cursor-pointer text-xs font-bold text-amber-950">
                <input
                  type="checkbox"
                  checked={isDeleteAgreed}
                  onChange={(e) => setIsDeleteAgreed(e.target.checked)}
                  className="mt-0.5 rounded-xs border-amber-400 text-rose-600 focus:ring-rose-500"
                />
                <span className="leading-snug">
                  兼務寺院「{templeToDelete.name}」に関連する全レコード（計 {totalDeletingRecordsCount} 件）が完全消去されることを確認・承諾しました
                </span>
              </label>
            </div>

            <div className="flex justify-end space-x-2 pt-3 border-t border-[#E5E0D8]">
              <button
                type="button"
                onClick={() => {
                  setTempleToDelete(null);
                  setIsDeleteAgreed(false);
                }}
                className="px-4 py-2 bg-[#F2EFE9] border border-[#D1CEC7] text-xs font-bold text-[#555555] hover:bg-[#E5E0D8] transition-colors cursor-pointer"
              >
                キャンセル
              </button>
              <button
                type="button"
                disabled={!isDeleteAgreed}
                onClick={handleConfirmDeleteTemple}
                className="px-5 py-2 bg-rose-700 hover:bg-rose-800 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold flex items-center space-x-1.5 shadow-xs transition-colors cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                <span>兼務寺院を完全消去する</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Database Full Reset Confirmation Modal */}
      {showResetDbModal && (
        <div className="fixed inset-0 z-60 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 font-sans animate-fade-in">
          <div className="bg-white border-2 border-rose-700 p-6 max-w-lg w-full space-y-4 shadow-2xl rounded-xs">
            <div className="flex items-center space-x-2 text-rose-800 font-bold text-base border-b border-rose-200 pb-2">
              <AlertOctagon className="w-6 h-6 text-rose-600 shrink-0" />
              <span>データベース完全初期化（全データ消去）</span>
            </div>

            <div className="bg-rose-50 border border-rose-300 p-4 space-y-2 rounded-xs text-xs text-rose-950">
              <p className="font-bold leading-relaxed flex items-center gap-1.5 text-rose-900">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>【最重要警告】すべてのデータが初期化されます</span>
              </p>
              <p className="text-[11px] leading-relaxed text-[#333333]">
                本システム内に保存されているすべてのデータ（<strong>本寺・兼務寺院の情報、全檀家名簿、全過去帳、全会計出納帳、全法事予約、寺院ToDo、マスタ設定等</strong>）を完全に消去し、システムを初期状態にリセットします。
              </p>
              <p className="text-[11px] leading-relaxed text-rose-700 font-bold">
                ※ この操作は取り消せません。必要なデータがある場合は、事前に「Excel出力」または「Googleスプレッドシート同期」でバックアップを保存してください。
              </p>
            </div>

            {/* Confirmation Actions */}
            <div className="flex justify-end space-x-3 pt-3 border-t border-[#E5E0D8]">
              <button
                type="button"
                onClick={() => {
                  setShowResetDbModal(false);
                  setIsResetDbAgreed(false);
                }}
                className="px-4 py-2 bg-[#F2EFE9] border border-[#D1CEC7] text-xs font-bold text-[#555555] hover:bg-[#E5E0D8] transition-colors cursor-pointer"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={handleExecuteResetDatabase}
                className="px-5 py-2 bg-rose-700 hover:bg-rose-800 text-white text-xs font-bold flex items-center space-x-1.5 shadow-xs transition-colors cursor-pointer"
              >
                <Database className="w-4 h-4" />
                <span>データベースを完全に初期化する</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Priest Delete Confirmation Modal */}
      <DeleteConfirmModal
        isOpen={!!priestToDelete}
        onClose={() => setPriestToDelete(null)}
        onConfirm={executeDeletePriest}
        title="登録僧侶の削除"
        message={`登録僧侶「${priestToDelete?.name || ''}」（${priestToDelete?.role || '僧侶'}）を登録一覧から削除してもよろしいですか？${
          priestToDelete?.isAutoChief ? '\n※ この僧侶は寺院住職に設定されています。削除すると該当寺院の住職名欄も自動的にクリアされます。' : ''
        }`}
        confirmLabel="僧侶を削除する"
      />
    </div>
  );
};
