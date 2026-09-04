import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  Search, 
  Plus, 
  Printer, 
  QrCode, 
  Edit,
  Trash2, 
  Users, 
  Home, 
  CheckSquare, 
  Square,
  ChevronLeft,
  ChevronRight,
  List,
  User,
  BookOpen,
  Calendar,
  Sparkles,
  X,
  Phone,
  Mail,
  MapPin,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  FilterX,
  Save,
  Database,
  Layers,
  Clock,
  CheckCircle2,
  AlertCircle,
  FileText,
  ScrollText,
  Coins,
  SlidersHorizontal,
  RotateCcw,
  Check,
  Eye,
  EyeOff,
  Camera
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Household, PastRecord, Transaction, TransactionCategory, MasterOptions, FamilyMember, TempleInfo, TempleProfile, MemorialService, TempleTodo } from '../types';
import { calculateMemorialMilestones, getJapaneseEra, formatJapaneseEraDate, normalizeDateInput, NormalizeDateOptions, calculateNiibonFromDeathDate, isRelevantNiibon, sortHouseholds, formatCurrency, getHouseholdSponsorName, getHouseholdSponsorInfo, isHouseholdSponsorSegakiToba, toggleHouseholdSponsorSegakiToba, getHouseholdNiibonStatus } from '../utils/memorialCalculator';
import { SingleHouseholdKakochoImportModal } from './SingleHouseholdKakochoImportModal';
import { useVirtualScroll } from '../hooks/useVirtualScroll';

export type ListColumnKey =
  | 'idTomb'         // ID/墓地
  | 'familyHeadName' // 世帯主名
  | 'district'       // 役職
  | 'householdType'  // 区分１
  | 'status'         // 区分２
  | 'niibon'         // 新盆
  | 'address'        // 住所
  | 'phone'          // 固定電話
  | 'mobile'         // 携帯電話
  | 'toba'           // 塔婆
  | 'tamegaki'       // 為書き
  | 'fee'            // 集金
  | 'tanagyo'        // 棚経
  | 'notes'          // 備考
  | 'pastCount'      // 精霊数
  | 'accountingCount';// 会計記録数

export interface ListColumnConfig {
  key: ListColumnKey;
  label: string;
  description: string;
  enabled: boolean;
}

export const DEFAULT_LIST_COLUMNS: ListColumnConfig[] = [
  { key: 'idTomb', label: 'ID/墓地', description: '檀家IDと墓地番号・納骨堂位置', enabled: true },
  { key: 'district', label: '役職', description: '役職・地区プルダウン', enabled: true },
  { key: 'householdType', label: '区分１', description: '区分１（正檀家・特別檀家等）', enabled: true },
  { key: 'status', label: '区分２', description: '区分２（状況・ステータス等）', enabled: true },
  { key: 'niibon', label: '新盆', description: '本年度・来年度の新盆対象状況', enabled: true },
  { key: 'address', label: '住所', description: '郵便番号および住所', enabled: true },
  { key: 'phone', label: '固定電話', description: '固定電話番号', enabled: true },
  { key: 'mobile', label: '携帯電話', description: '携帯電話番号', enabled: false },
  { key: 'toba', label: '塔婆', description: '塔婆申込状況・本数（種類切替対応）', enabled: true },
  { key: 'tamegaki', label: '為書き', description: '施主・世帯の塔婆・施餓鬼為書き', enabled: false },
  { key: 'fee', label: '集金', description: '護持会費等の集金金額入力', enabled: true },
  { key: 'tanagyo', label: '棚経', description: '棚経伺い対象・希望状況', enabled: true },
  { key: 'familyHeadName', label: '世帯主名', description: '世帯主の氏名（施主名と別の場合等）', enabled: false },
  { key: 'notes', label: '備考', description: '世帯の備考メモ', enabled: false },
  { key: 'pastCount', label: '精霊数', description: '紐づく過去帳（物故者）の登録件数', enabled: false },
  { key: 'accountingCount', label: '会計記録数', description: '紐づく会計・布施記録の件数', enabled: false },
];

export type SortKey =
  | 'id'
  | 'familyHead'
  | 'familyHeadName'
  | 'address'
  | 'district'
  | 'householdType'
  | 'status'
  | 'tombNumber'
  | 'niibon'
  | 'isSegakiToba'
  | 'tobaApplication'
  | 'tanagyoMonthlyVisit'
  | 'feeAmount'
  | 'phone'
  | 'mobile'
  | 'tamegaki'
  | 'notes'
  | 'pastCount'
  | 'accountingCount';

export type SortOrder = 'asc' | 'desc';
import { 
  getTobaSlots,
  getEffectiveTobaTypes, 
  getHouseholdTobaApplication, 
  setHouseholdTobaApplication, 
  getFamilyMemberTobaApplication, 
  setFamilyMemberTobaApplication, 
  isHouseholdAppliedForToba, 
  getHouseholdTobaCount,
  getHouseholdSponsorTobaApplication,
  setHouseholdSponsorTobaApplication,
  isHouseholdSponsorAppliedForToba,
  toggleHouseholdSponsorTobaApplication
} from '../utils/tobaUtils';
import {
  getFeeSlots,
  getEffectiveFeeTypes,
  getHouseholdFeeAmount,
  setHouseholdFeeAmount,
  formatFeeAmount,
  matchFeeSlot,
  FeeSlotDef
} from '../utils/feeUtils';
import { getRokuyo, calculateEndTime, getPreviousDay, getTodayDateString } from '../utils/calendarUtils';
import { DeleteConfirmModal } from './DeleteConfirmModal';
import { DateInputWithEra, TimeSelectorInput } from './DateTimeInputs';
import { safeStorage } from '../utils/storageUtils';
import { HouseholdAddressBookPrintModal } from './HouseholdAddressBookPrintModal';
import { HouseholdReceptionSheetPrintModal } from './HouseholdReceptionSheetPrintModal';
import { SegakiPatronModal } from './SegakiPatronModal';
import { HouseholdListColumnConfigModal } from './HouseholdListColumnConfigModal';

interface HouseholdListProps {
  households: Household[];
  pastRecords: PastRecord[];
  transactions?: Transaction[];
  masterOptions?: MasterOptions;
  templeName?: string;
  templeInfo?: TempleInfo;
  temples?: TempleProfile[];
  activeTempleId?: string;
  priests?: { id: string; name: string; role?: string; isMain?: boolean }[];
  memorialServices?: MemorialService[];
  familyMembers?: FamilyMember[];
  onAddTransaction?: (transaction: Transaction) => void;
  onUpdateTransaction?: (transaction: Transaction) => void;
  onDeleteTransaction?: (id: string) => void;
  onOpenAddModal: () => void;
  onEditHousehold: (household: Household) => void;
  onDeleteHousehold: (id: string) => void;
  onAddPastRecord: (record: PastRecord) => void;
  onUpdatePastRecord: (record: PastRecord) => void;
  onDeletePastRecord: (id: string) => void;
  onCreateMemorialService: (record: PastRecord, milestoneType: string, date: string) => void;
  onAddService?: (service: MemorialService) => void;
  onAddTodo?: (todo: TempleTodo) => void;
  selectedIdsForPrint: string[];
  setSelectedIdsForPrint: React.Dispatch<React.SetStateAction<string[]>>;
  onNavigateToPrint: () => void;
  onOpenImportModal?: () => void;
  onUpdateSortedHouseholds?: (sorted: Household[]) => void;
  externalSortKey?: SortKey;
  externalSortOrder?: 'asc' | 'desc';
  onSortChange?: (key: SortKey, order: 'asc' | 'desc') => void;
  externalExcludedIds?: string[];
  onToggleExcludeHousehold?: (id: string) => void;
  onRecordHistory?: (description: string) => void;
  onBatchUpdateHouseholds?: (updatedList: Household[], description?: string) => void;
  onBatchAddPastRecords?: (records: PastRecord[], description?: string) => void;
}

interface BatchChangeRequest {
  field: 'district' | 'householdType' | 'status' | 'isSegakiToba' | 'tobaApplication' | 'tanagyoMonthlyVisit';
  fieldName: string;
  newValue: any;
  displayValue: string;
  targetHousehold: Household;
  selectedHouseholds: Household[];
  tobaType?: string;
}

export const HouseholdList: React.FC<HouseholdListProps> = ({
  households,
  pastRecords,
  transactions = [],
  masterOptions,
  templeName,
  templeInfo,
  temples = [],
  activeTempleId = 'temple-main',
  priests = [],
  memorialServices = [],
  familyMembers = [],
  onAddTransaction,
  onUpdateTransaction,
  onDeleteTransaction,
  onOpenAddModal,
  onEditHousehold,
  onDeleteHousehold,
  onAddPastRecord,
  onUpdatePastRecord,
  onDeletePastRecord,
  onCreateMemorialService,
  onAddService,
  onAddTodo,
  selectedIdsForPrint,
  setSelectedIdsForPrint,
  onNavigateToPrint,
  onOpenImportModal,
  onUpdateSortedHouseholds,
  externalSortKey,
  externalSortOrder,
  onSortChange,
  externalExcludedIds,
  onToggleExcludeHousehold,
  onRecordHistory,
  onBatchUpdateHouseholds,
  onBatchAddPastRecords,
}) => {
  // Batch Change Modal State for Multi-Selected rows
  const [batchConfirmRequest, setBatchConfirmRequest] = useState<BatchChangeRequest | null>(null);
  // Single Household Kakocho AI Import Modal state
  const [singleImportModalHousehold, setSingleImportModalHousehold] = useState<Household | null>(null);
  // View mode state: 'list' (all households table/grid) or 'individual' (single household card view with past records)
  const [viewMode, setViewMode] = useState<'list' | 'individual'>('list');
  const [selectedIndividualId, setSelectedIndividualId] = useState<string>(households[0]?.id || '');

  // Address Book, Reception Sheet & Toba Patron Print Modal States
  const [isAddressBookModalOpen, setIsAddressBookModalOpen] = useState<boolean>(false);
  const [isReceptionSheetModalOpen, setIsReceptionSheetModalOpen] = useState<boolean>(false);
  const [isTobaPatronModalOpen, setIsTobaPatronModalOpen] = useState<boolean>(false);

  // Scroll preservation refs for returning from individual view to list
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const lastListScrollTopRef = useRef<number>(0);
  const lastSelectedHouseholdIdRef = useRef<string | null>(null);

  // Scroll ref for individual view content area
  const individualContentRef = useRef<HTMLDivElement>(null);

  // Reset individual content scroll to top when switching selected household or entering individual view
  useEffect(() => {
    if (viewMode === 'individual' && individualContentRef.current) {
      individualContentRef.current.scrollTop = 0;
    }
  }, [selectedIndividualId, viewMode]);

  // Restore scroll position when returning to list view
  useEffect(() => {
    if (viewMode === 'list') {
      const restoreScroll = () => {
        if (tableContainerRef.current) {
          tableContainerRef.current.scrollTop = lastListScrollTopRef.current;
        }
        if (lastSelectedHouseholdIdRef.current) {
          const rowEl = document.getElementById(`household-row-${lastSelectedHouseholdIdRef.current}`);
          if (rowEl) {
            rowEl.scrollIntoView({ block: 'nearest' });
          }
        }
      };

      // Immediate and next frame restore for reliable positioning
      restoreScroll();
      const raf = requestAnimationFrame(restoreScroll);
      const timer = setTimeout(restoreScroll, 50);
      return () => {
        cancelAnimationFrame(raf);
        clearTimeout(timer);
      };
    }
  }, [viewMode]);

  // Inline Household Edit State (for seen-as-is direct editing in individual view)
  const [isEditingHouseholdInline, setIsEditingHouseholdInline] = useState(false);
  const [inlineHouseholdForm, setInlineHouseholdForm] = useState<Household | null>(null);

  // Inline Family Members Edit State
  const [isEditingFamilyInline, setIsEditingFamilyInline] = useState(false);
  const [inlineFamilyMembers, setInlineFamilyMembers] = useState<FamilyMember[]>([]);

  // Inline Past Record Edit State
  const [editingPastRecordId, setEditingPastRecordId] = useState<string | null>(null);
  const [inlinePastRecordForm, setInlinePastRecordForm] = useState<Partial<PastRecord> | null>(null);

  // Unique options for filter, dropdowns & display (combining Master options and households)
  const districts = useMemo(() => {
    const fromMaster = masterOptions?.districts || [];
    const fromHouseholds = households.map((h) => h.district).filter(Boolean) as string[];
    const set = new Set([...fromMaster, ...fromHouseholds]);
    return Array.from(set).filter(Boolean);
  }, [masterOptions?.districts, households]);

  const householdTypeList = useMemo(() => {
    const fromMaster = masterOptions?.householdTypes || ['正檀家', '役員', '信徒', '特別檀家', '縁故'];
    const fromHouseholds = households.map((h) => h.householdType).filter(Boolean) as string[];
    const set = new Set([...fromMaster, ...fromHouseholds]);
    return Array.from(set).filter(Boolean);
  }, [masterOptions?.householdTypes, households]);

  const statusList = useMemo(() => {
    const fromMaster = masterOptions?.statuses || [];
    const fromHouseholds = households.map((h) => h.status).filter(Boolean) as string[];
    const set = new Set([...fromMaster, ...fromHouseholds]);
    return Array.from(set).filter(Boolean);
  }, [masterOptions?.statuses, households]);

  // New Household Creation Handler (Opens directly in Individual View)
  const handleStartAddNewHousehold = () => {
    const newId = `H-${Math.floor(100 + Math.random() * 900)}`;
    const newH: Household = {
      id: newId,
      familyHead: '',
      furigana: '',
      householdType: '',
      status: '',
      postalCode: '',
      address: '',
      phone: '',
      district: '',
      tombNumber: '',
      qrToken: `QR-${newId}`,
      familyMembers: [],
      createdAt: new Date().toISOString().split('T')[0],
    };

    onEditHousehold(newH);
    setSelectedIndividualId(newId);
    setViewMode('individual');
    setIsEditingHouseholdInline(true);
    setInlineHouseholdForm(newH);
  };

  // Inline New Past Record in Individual View State
  const [isAddingNewPastRecordInline, setIsAddingNewPastRecordInline] = useState(false);
  const [newPastRecordForm, setNewPastRecordForm] = useState<Partial<PastRecord>>({
    deathDate: '',
    dharmaName: '',
    secularName: '',
    relationship: '',
    ageAtDeath: undefined,
    notes: '',
  });

  const handleStartAddNewPastRecordInline = () => {
    if (!currentIndividualHousehold) return;
    setIsAddingNewPastRecordInline(true);
    setNewPastRecordForm({
      deathDate: '',
      dharmaName: '',
      secularName: '',
      relationship: '',
      ageAtDeath: undefined,
      niibon: undefined,
      notes: '',
      burialLocation: currentIndividualHousehold.tombNumber || '',
    });
  };

  const handleSaveNewPastRecordInline = () => {
    if (!currentIndividualHousehold) return;
    if (!newPastRecordForm.dharmaName && !newPastRecordForm.secularName) {
      alert('戒名（法名）または俗名を入力してください。');
      return;
    }
    const normalizedDate = newPastRecordForm.deathDate && newPastRecordForm.deathDate.trim()
      ? (normalizeDateInput(newPastRecordForm.deathDate, { mode: 'pastRecord' }) || '')
      : '';
    const calculatedNiibon = normalizedDate ? calculateNiibonFromDeathDate(normalizedDate, templeInfo?.bonSeason || '8月盆') : undefined;

    const rawAge = newPastRecordForm.ageAtDeath;
    const parsedAge = rawAge !== undefined && rawAge !== null && String(rawAge).trim() !== ''
      ? Number(rawAge)
      : undefined;

    const completeRecord: PastRecord = {
      id: `KC-${Date.now()}`,
      householdId: currentIndividualHousehold.id,
      householdHeadName: currentIndividualHousehold.familyHead,
      dharmaName: newPastRecordForm.dharmaName || '',
      secularName: newPastRecordForm.secularName || '',
      deathDate: normalizedDate,
      ageAtDeath: parsedAge !== undefined && !isNaN(parsedAge) && parsedAge > 0 ? parsedAge : undefined,
      relationship: newPastRecordForm.relationship || '',
      burialLocation: newPastRecordForm.burialLocation || currentIndividualHousehold.tombNumber || '',
      niibon: newPastRecordForm.niibon !== undefined && newPastRecordForm.niibon.trim() !== '' ? newPastRecordForm.niibon : (calculatedNiibon || undefined),
      notes: newPastRecordForm.notes || '',
    };

    onAddPastRecord(completeRecord);
    setIsAddingNewPastRecordInline(false);
  };

  // Inline Transaction Edit State
  const [editingTransactionId, setEditingTransactionId] = useState<string | null>(null);
  const [inlineTxForm, setInlineTxForm] = useState<Partial<Transaction> | null>(null);

  // Delete Target States for Modals
  const [deleteTargetHousehold, setDeleteTargetHousehold] = useState<Household | null>(null);
  const [deleteTargetPastRecord, setDeleteTargetPastRecord] = useState<PastRecord | null>(null);
  const [deleteTargetTx, setDeleteTargetTx] = useState<Transaction | null>(null);

  // Exclude state (抽出外管理)
  const [internalExcludedIds, setInternalExcludedIds] = useState<string[]>([]);
  const excludedIds = externalExcludedIds !== undefined ? externalExcludedIds : internalExcludedIds;
  const [showExcludedMode, setShowExcludedMode] = useState<'active' | 'excluded'>('active');

  const setAllExcludedIds = (ids: string[]) => {
    if (onRecordHistory) {
      onRecordHistory(ids.length > 0 ? '抽出外レコードを設定' : '抽出設定を解除');
    }
    if (ids.length > 0) {
      const excludedSet = new Set(ids);
      setSelectedIdsForPrint((prev) => prev.filter((id) => !excludedSet.has(id)));
    }
    if (onToggleExcludeHousehold && externalExcludedIds !== undefined) {
      // Clear or set via diff or direct update if supported
      // For toggle-based API, we can iterate or directly update internal
      const current = new Set(externalExcludedIds);
      const target = new Set(ids);
      // Toggle differences
      for (const id of households.map((h) => h.id)) {
        if (target.has(id) !== current.has(id)) {
          onToggleExcludeHousehold(id);
        }
      }
    } else {
      setInternalExcludedIds(ids);
    }
  };

  const toggleExcludeHousehold = (id: string) => {
    setSelectedIdsForPrint((prev) => prev.filter((item) => item !== id));
    if (onToggleExcludeHousehold) {
      onToggleExcludeHousehold(id);
    } else {
      setInternalExcludedIds((prev) =>
        prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
      );
    }
  };

  // Current active temple profile
  const currentActiveTemple = useMemo(() => {
    if (activeTempleId && activeTempleId !== 'ALL') {
      return temples.find((t) => t.id === activeTempleId) || templeInfo;
    }
    return temples.find((t) => t.isMain) || templeInfo || temples[0];
  }, [activeTempleId, temples, templeInfo]);

  // Toba Slots & Types from active temple settings (configured slots 1, 2, 3)
  const effectiveTobaSlots = useMemo(() => getTobaSlots(currentActiveTemple), [currentActiveTemple]);
  const effectiveTobaTypes = useMemo(() => effectiveTobaSlots.map((s) => s.name), [effectiveTobaSlots]);

  const [selectedTobaType, setSelectedTobaType] = useState<string>(() => {
    return safeStorage.getItem('household_selected_toba_type') || (effectiveTobaTypes[0] || '施餓鬼塔婆');
  });

  // Ensure selectedTobaType is in effectiveTobaTypes
  const activeTobaType = effectiveTobaTypes.includes(selectedTobaType) ? selectedTobaType : (effectiveTobaTypes[0] || '施餓鬼塔婆');

  // Keep selectedTobaType in sync when effectiveTobaTypes change
  useEffect(() => {
    if (effectiveTobaTypes.length > 0 && !effectiveTobaTypes.includes(selectedTobaType)) {
      const fallback = effectiveTobaTypes[0] || '施餓鬼塔婆';
      setSelectedTobaType(fallback);
      safeStorage.setItem('household_selected_toba_type', fallback);
    }
  }, [effectiveTobaTypes, selectedTobaType]);

  // Fee Slots & Types from active temple settings (configured slots 1, 2, 3)
  const effectiveFeeSlots = useMemo(() => getFeeSlots(currentActiveTemple), [currentActiveTemple]);
  const effectiveFeeTypes = useMemo(() => effectiveFeeSlots.map((s) => s.name), [effectiveFeeSlots]);

  const [selectedFeeType, setSelectedFeeType] = useState<string>(() => {
    return safeStorage.getItem('household_selected_fee_type') || (effectiveFeeTypes[0] || '');
  });

  // Ensure selectedFeeType is valid
  const activeFeeType = effectiveFeeTypes.includes(selectedFeeType)
    ? selectedFeeType
    : (effectiveFeeTypes[0] || '');

  // Keep selectedFeeType in sync when effectiveFeeTypes change
  useEffect(() => {
    if (effectiveFeeTypes.length > 0 && !effectiveFeeTypes.includes(selectedFeeType)) {
      const fallback = effectiveFeeTypes[0] || '';
      setSelectedFeeType(fallback);
      safeStorage.setItem('household_selected_fee_type', fallback);
    }
  }, [effectiveFeeTypes, selectedFeeType]);

  // Search & Filter & Sort state
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [districtFilter, setDistrictFilter] = useState<string>('ALL');
  const [tobaFilter, setTobaFilter] = useState<'ALL' | 'checked' | 'unchecked'>('ALL');
  const [tanagyoFilter, setTanagyoFilter] = useState<'ALL' | 'checked' | 'unchecked'>('ALL');

  // Sort state with safeStorage persistence
  const [internalSortKey, setInternalSortKey] = useState<SortKey>(() => {
    return (safeStorage.getItem('household_sort_key') as SortKey) || 'id';
  });
  const [internalSortOrder, setInternalSortOrder] = useState<SortOrder>(() => {
    return (safeStorage.getItem('household_sort_order') as SortOrder) || 'asc';
  });

  // リスト表示項目の増減・並び替え設定
  const [showColumnConfigModal, setShowColumnConfigModal] = useState(false);
  const [listColumns, setListColumns] = useState<ListColumnConfig[]>(() => {
    try {
      const saved = safeStorage.getItem('household_list_column_config');
      if (saved) {
        const parsed = JSON.parse(saved) as ListColumnConfig[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          const validKeys = new Set(DEFAULT_LIST_COLUMNS.map((c) => c.key));
          const savedKeys = new Set(parsed.map((c) => c.key));
          const merged = parsed.filter((c) => validKeys.has(c.key));
          DEFAULT_LIST_COLUMNS.forEach((def) => {
            if (!savedKeys.has(def.key)) {
              merged.push({ ...def });
            }
          });
          return merged;
        }
      }
    } catch (e) {
      console.error('Failed to load household_list_column_config', e);
    }
    return DEFAULT_LIST_COLUMNS;
  });

  const saveListColumns = (newCols: ListColumnConfig[]) => {
    setListColumns(newCols);
    try {
      safeStorage.setItem('household_list_column_config', JSON.stringify(newCols));
    } catch (e) {
      console.error('Failed to save household_list_column_config', e);
    }
  };

  const sortKey = (externalSortKey as SortKey) || internalSortKey;
  const sortOrder = (externalSortOrder as SortOrder) || internalSortOrder;

  const handleSort = (key: SortKey) => {
    let nextOrder: SortOrder = 'asc';
    let nextKey: SortKey = key;
    if (sortKey === key) {
      nextOrder = sortOrder === 'asc' ? 'desc' : 'asc';
    } else {
      nextKey = key;
      nextOrder = 'asc';
    }

    if (onSortChange) {
      onSortChange(nextKey, nextOrder);
    } else {
      setInternalSortKey(nextKey);
      setInternalSortOrder(nextOrder);
    }

    safeStorage.setItem('household_sort_key', nextKey);
    safeStorage.setItem('household_sort_order', nextOrder);
  };

  // Modals state
  const [activeQrModalHousehold, setActiveQrModalHousehold] = useState<Household | null>(null);

  // Past Record Add/Edit Modal
  const [showPastRecordModal, setShowPastRecordModal] = useState(false);
  const [editingPastRecord, setEditingPastRecord] = useState<PastRecord | null>(null);
  const [pastRecordFormData, setPastRecordFormData] = useState<Partial<PastRecord>>({});

  // Booking Hub Modal for Household (法要塔婆予約ポップアップ)
  const [activeHouseholdForBooking, setActiveHouseholdForBooking] = useState<Household | null>(null);
  const bookingPastRecordsScrollRef = useRef<HTMLDivElement>(null);

  // Past records for the booking hub modal (逆修・命日なしの精霊は法要予約対象から除外)
  const bookingHouseholdPastRecords = useMemo(() => {
    if (!activeHouseholdForBooking) return [];
    return pastRecords
      .filter((r) => r.householdId === activeHouseholdForBooking.id && !!r.deathDate && r.deathDate.trim() !== '')
      .sort((a, b) => {
        const normA = normalizeDateInput(a.deathDate || '');
        const normB = normalizeDateInput(b.deathDate || '');
        if (normA && normB) return normA.localeCompare(normB);
        if (normA && !normB) return -1;
        if (!normA && normB) return 1;
        return (a.dharmaName || a.secularName || '').localeCompare(b.dharmaName || b.secularName || '');
      });
  }, [pastRecords, activeHouseholdForBooking]);

  // Family members for the booking household
  const bookingHouseholdFamilyMembers = useMemo(() => {
    if (!activeHouseholdForBooking) return [];
    return familyMembers.filter((m) => m.householdId === activeHouseholdForBooking.id);
  }, [familyMembers, activeHouseholdForBooking]);

  // Auto scroll to bottom if records > 10 in booking hub modal
  useEffect(() => {
    if (activeHouseholdForBooking) {
      const timer = setTimeout(() => {
        if (bookingPastRecordsScrollRef.current && bookingHouseholdPastRecords.length > 10) {
          bookingPastRecordsScrollRef.current.scrollTop = bookingPastRecordsScrollRef.current.scrollHeight;
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [activeHouseholdForBooking, bookingHouseholdPastRecords.length]);

  // Sub-modal 1: Service Booking Modal (法要予定設定フォーム)
  const [bookingServiceModal, setBookingServiceModal] = useState<{
    household: Household;
    pastRecord?: PastRecord;
    defaultMilestone?: string;
    defaultDate?: string;
    isFuneralOrPrayerMode?: boolean;
  } | null>(null);

  const [bookingServiceForm, setBookingServiceForm] = useState<{
    chiefMourner: string;
    memorialType: string;
    scheduledDate: string;
    scheduledTime: string;
    venue: string;
    address: string;
    attendeeCount: number;
    tobaCount: number;
    tobaFee: number;
    tobaType: string;
    tobaSponsors: string[];
    notes: string;
  }>({
    chiefMourner: '',
    memorialType: '年忌法要',
    scheduledDate: getTodayDateString('/'),
    scheduledTime: '11:00',
    venue: '本堂',
    address: '',
    attendeeCount: 10,
    tobaCount: 1,
    tobaFee: 3000,
    tobaType: '大塔婆',
    tobaSponsors: [''],
    notes: '',
  });

  // Sub-modal 2: Toba Booking Modal (塔婆予約設定フォーム)
  const [bookingTobaModal, setBookingTobaModal] = useState<{
    household: Household;
    pastRecord?: PastRecord;
    defaultDate?: string;
  } | null>(null);

  const [bookingTobaForm, setBookingTobaForm] = useState<{
    chiefMourner: string;
    deliveryDate: string;
    tobaCount: number;
    tobaFee: number;
    tobaType: string;
    tamegaki: string;
    tobaSponsors: string[];
    notes: string;
  }>({
    chiefMourner: '',
    deliveryDate: getTodayDateString('/'),
    tobaCount: 1,
    tobaFee: 3000,
    tobaType: '大塔婆',
    tamegaki: '為先祖代々菩提',
    tobaSponsors: [''],
    notes: '',
  });

  // Open Service Booking Modal for a specific spirit or household
  const handleOpenBookingService = (
    household: Household,
    pastRecord?: PastRecord,
    initialTypeOverride?: string,
    isFuneralOrPrayerMode?: boolean
  ) => {
    let initialType = initialTypeOverride || '年忌法要';
    // 予定登録の日付は常に「当日」をデフォルトに設定
    let initialDate = getTodayDateString('/');

    if (!initialTypeOverride && pastRecord && pastRecord.deathDate) {
      const milestones = calculateMemorialMilestones(pastRecord.deathDate);
      const currentYear = new Date().getFullYear();
      const currentOrNextMilestone = milestones.find((m) => m.targetYear >= currentYear);
      if (currentOrNextMilestone) {
        initialType = currentOrNextMilestone.type;
      }
    }

    const isFuneralOrPrayer = isFuneralOrPrayerMode ?? (!pastRecord && Boolean(initialTypeOverride));
    const defaultChief = getHouseholdSponsorName(household) || household.familyHead || '';
    
    // 所属寺院の特定（兼務寺院対応）
    const targetTempleId = household.templeId || (activeTempleId !== 'ALL' ? activeTempleId : (temples.find(t => t.isMain)?.id || 'temple-main'));
    const targetTemple = temples.find(t => t.id === targetTempleId);
    const templeVenue = `${targetTemple?.name || templeInfo?.name || '自寺'} 本堂`;
    
    // 檀家の住所が自動入力されるのは「棚経」「枕経」のみ。それ以外は寺院本堂をデフォルト設定（書き換え可能）
    const isHomeService = initialType === '棚経' || initialType === '枕経';
    const initialVenue = isHomeService ? (household.address || '自宅') : templeVenue;
    const initialAddress = household.address || '';

    let defaultNotes = pastRecord ? `${pastRecord.dharmaName || pastRecord.secularName} ${initialType}` : '';
    if (initialTypeOverride && !pastRecord) {
      defaultNotes = `${initialTypeOverride} 予約`;
    }

    // 葬儀・枕経・祈祷等の予約では塔婆はデフォルト0本
    const defaultTobaCount = isFuneralOrPrayer ? 0 : (isHomeService ? 0 : 1);
    const initialTobaType = effectiveTobaTypes[0] || '施餓鬼塔婆';

    setBookingServiceForm({
      chiefMourner: defaultChief,
      memorialType: initialType,
      scheduledDate: initialDate,
      scheduledTime: '11:00',
      venue: initialVenue,
      address: initialAddress,
      attendeeCount: 10,
      tobaCount: defaultTobaCount,
      tobaFee: 3000,
      tobaType: initialTobaType,
      tobaSponsors: defaultTobaCount > 0 ? [defaultChief] : [],
      notes: defaultNotes,
    });

    setBookingServiceModal({
      household,
      pastRecord,
      defaultMilestone: initialType,
      defaultDate: initialDate,
      isFuneralOrPrayerMode: isFuneralOrPrayer,
    });
  };

  // Save Service Booking
  const handleSaveBookingService = (e: React.FormEvent) => {
    e.preventDefault();
    if (!bookingServiceModal) return;
    const { household, pastRecord } = bookingServiceModal;

    const targetTempleId = household.templeId || (activeTempleId !== 'ALL' ? activeTempleId : (temples.find(t => t.isMain)?.id || 'temple-main'));
    const targetTemple = temples.find(t => t.id === targetTempleId);
    const normalizedDate = normalizeDateInput(bookingServiceForm.scheduledDate) || bookingServiceForm.scheduledDate;
    const calculatedEndTime = calculateEndTime(bookingServiceForm.scheduledTime, 60);
    const finalVenue = (bookingServiceForm.venue || '').trim() || `${targetTemple?.name || templeInfo?.name || '自寺'} 本堂`;
    const finalAddress = (bookingServiceForm.address || '').trim();

    const newService: MemorialService = {
      id: `MS-${Date.now()}`,
      templeId: targetTempleId,
      householdId: household.id,
      deceasedId: pastRecord?.id || '',
      deceasedName: pastRecord?.secularName || '',
      dharmaName: pastRecord?.dharmaName || '',
      memorialType: bookingServiceForm.memorialType,
      scheduledDate: normalizedDate,
      scheduledTime: bookingServiceForm.scheduledTime,
      endTime: calculatedEndTime,
      venue: finalVenue,
      address: finalAddress, // 住所の記述通りにする
      status: '法要前',
      chiefMourner: bookingServiceForm.chiefMourner || getHouseholdSponsorName(household) || household.familyHead,
      attendeeCount: Number(bookingServiceForm.attendeeCount) || 10,
      offeringAmount: 0,
      tobaCount: Number(bookingServiceForm.tobaCount) || 0,
      tobaFee: Number(bookingServiceForm.tobaFee) || 3000,
      tobaType: bookingServiceForm.tobaType,
      tobaSponsors: bookingServiceForm.tobaSponsors || [],
      notes: bookingServiceForm.notes || '',
      receptionCheckedIn: false,
      accountingRecorded: false,
    };

    if (onAddService) {
      onAddService(newService);
    } else {
      onCreateMemorialService(pastRecord || { id: '', householdId: household.id, householdHeadName: getHouseholdSponsorName(household) || household.familyHead, dharmaName: '', secularName: '', deathDate: normalizedDate, relationship: '', burialLocation: '', templeId: targetTempleId }, bookingServiceForm.memorialType, normalizedDate);
    }

    // If tobaCount > 0, auto-register Todo task for previous day
    if (Number(bookingServiceForm.tobaCount) > 0 && onAddTodo) {
      const prevDate = getPreviousDay(normalizedDate);
      const validSponsors = (bookingServiceForm.tobaSponsors || []).filter((s) => s.trim() !== '');
      const sponsorStr = validSponsors.length > 0 ? validSponsors.join('・') : (bookingServiceForm.chiefMourner || getHouseholdSponsorName(household) || household.familyHead);
      
      const newTodo: TempleTodo = {
        id: `TD-${Date.now()}`,
        templeId: targetTempleId,
        title: `【塔婆作成タスク】${pastRecord?.dharmaName || (getHouseholdSponsorName(household) || household.familyHead) + '様'} (${bookingServiceForm.memorialType}) 塔婆${bookingServiceForm.tobaCount}本 (施主: ${sponsorStr})`,
        dueDate: prevDate,
        dueTime: '16:00',
        priority: 'high',
        category: '塔婆準備',
        completed: false,
        householdId: household.id,
        householdHeadName: bookingServiceForm.chiefMourner || getHouseholdSponsorName(household) || household.familyHead,
        notes: `法事日時: ${normalizedDate} ${bookingServiceForm.scheduledTime}～\n塔婆種別: ${bookingServiceForm.tobaType}\n本数: ${bookingServiceForm.tobaCount}本\n志主: ${sponsorStr}\n戒名: ${pastRecord?.dharmaName || '先祖代々'}${targetTemple?.name ? `\n寺院: ${targetTemple.name}` : ''}`,
        createdAt: new Date().toISOString().slice(0, 10).replace(/-/g, '/'),
      };
      onAddTodo(newTodo);
    }

    alert(`【予定を登録しました】\n施主: ${bookingServiceForm.chiefMourner} 様\n種別: ${bookingServiceForm.memorialType}\n日時: ${normalizedDate} ${bookingServiceForm.scheduledTime}～\n会場: ${finalVenue}\n\nカレンダー画面に切り替わります。`);
    setBookingServiceModal(null);
  };

  // Open Toba Booking Modal for a specific spirit or household
  const handleOpenBookingToba = (household: Household, pastRecord?: PastRecord) => {
    const todayFormatted = new Date().toISOString().slice(0, 10).replace(/-/g, '/');
    const defaultChief = household.familyHead || '';
    const defaultTamegaki = pastRecord?.dharmaName 
      ? `為 ${pastRecord.dharmaName} 菩提` 
      : `為 ${household.familyHead}家先祖代々供養`;

    const initialTobaType = activeTobaType || effectiveTobaTypes[0] || '施餓鬼塔婆';

    setBookingTobaForm({
      chiefMourner: defaultChief,
      deliveryDate: todayFormatted,
      tobaCount: 1,
      tobaFee: 3000,
      tobaType: initialTobaType,
      tamegaki: defaultTamegaki,
      tobaSponsors: [defaultChief],
      notes: pastRecord ? `${pastRecord.dharmaName || pastRecord.secularName}` : '',
    });

    setBookingTobaModal({
      household,
      pastRecord,
      defaultDate: todayFormatted,
    });
  };

  // Save Toba Booking
  const handleSaveBookingToba = (e: React.FormEvent) => {
    e.preventDefault();
    if (!bookingTobaModal) return;
    const { household, pastRecord } = bookingTobaModal;

    const normalizedDate = normalizeDateInput(bookingTobaForm.deliveryDate) || bookingTobaForm.deliveryDate;
    const validSponsors = (bookingTobaForm.tobaSponsors || []).filter((s) => s.trim() !== '');
    const sponsorStr = validSponsors.length > 0 ? validSponsors.join('・') : (bookingTobaForm.chiefMourner || household.familyHead);

    // Auto register Todo task
    if (onAddTodo) {
      const prevDate = getPreviousDay(normalizedDate);
      const newTodo: TempleTodo = {
        id: `TD-${Date.now()}`,
        title: `【塔婆作成タスク】${bookingTobaForm.tamegaki} 塔婆${bookingTobaForm.tobaCount}本 (施主: ${sponsorStr})`,
        dueDate: prevDate,
        dueTime: '16:00',
        priority: 'high',
        category: '塔婆準備',
        completed: false,
        householdId: household.id,
        householdHeadName: bookingTobaForm.chiefMourner || household.familyHead,
        notes: `受取/供養日: ${normalizedDate}\n塔婆種別: ${bookingTobaForm.tobaType}\n本数: ${bookingTobaForm.tobaCount}本\n志主: ${sponsorStr}\n為書き: ${bookingTobaForm.tamegaki}${bookingTobaForm.notes ? `\n備考: ${bookingTobaForm.notes}` : ''}`,
        createdAt: new Date().toISOString().slice(0, 10).replace(/-/g, '/'),
      };
      onAddTodo(newTodo);
    }

    alert(`【塔婆予約を受付しました】\n志主: ${sponsorStr} 様\n受取/供養日: ${normalizedDate}\n本数: ${bookingTobaForm.tobaCount}本 (${bookingTobaForm.tobaType})\n為書き: ${bookingTobaForm.tamegaki}\n\n前日ToDoタスクに「塔婆作成タスク」が登録されました。`);
    setBookingTobaModal(null);
  };

  // Accounting Transaction Modal & Inline Entry State
  const [newHouseholdTxForm, setNewHouseholdTxForm] = useState<Partial<Transaction>>({
    date: formatJapaneseEraDate(new Date().toISOString().slice(0, 10), false),
    category: '法要布施' as any,
    amount: undefined,
    notes: '',
  });

  const handleSaveNewHouseholdTx = () => {
    if (!currentIndividualHousehold) return;
    if (!newHouseholdTxForm.amount || Number(newHouseholdTxForm.amount) <= 0) {
      alert('会計出納の金額を入力してください。');
      return;
    }

    const normalizedDate = normalizeDateInput(newHouseholdTxForm.date || '') || new Date().toISOString().slice(0, 10).replace(/-/g, '/');

    const newTx: Transaction = {
      id: `TX-${Date.now()}`,
      date: normalizedDate,
      householdId: currentIndividualHousehold.id,
      householdHeadName: `${currentIndividualHousehold.familyHead} 殿`,
      category: (newHouseholdTxForm.category as TransactionCategory) || '法要布施',
      type: '収入',
      amount: Number(newHouseholdTxForm.amount),
      paymentMethod: '現金受付',
      receiptNumber: `R-${Math.floor(100000 + Math.random() * 900000)}`,
      notes: newHouseholdTxForm.notes || '',
    };

    if (onAddTransaction) {
      onAddTransaction(newTx);
    }

    setNewHouseholdTxForm({
      date: formatJapaneseEraDate(new Date().toISOString().slice(0, 10), false),
      category: '法要布施' as any,
      amount: undefined,
      notes: '',
    });
  };

  const [showTransactionModal, setShowTransactionModal] = useState(false);
  const [transactionFormData, setTransactionFormData] = useState<{
    date: string;
    category: TransactionCategory;
    amount: number | '';
    householdHeadName: string;
    notes: string;
    paymentMethod: '現金受付' | 'QR受付時' | '銀行振込' | '郵便振替';
  }>({
    date: new Date().toISOString().split('T')[0],
    category: '法要布施',
    amount: '',
    householdHeadName: '',
    notes: '',
    paymentMethod: '現金受付',
  });

  const handleOpenAddTransaction = () => {
    setTransactionFormData({
      date: new Date().toISOString().split('T')[0],
      category: '法要布施',
      amount: '',
      householdHeadName: currentIndividualHousehold ? `${currentIndividualHousehold.familyHead} 殿` : '',
      notes: '',
      paymentMethod: '現金受付',
    });
    setShowTransactionModal(true);
  };

  const handleSaveTransaction = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentIndividualHousehold) return;
    if (!transactionFormData.amount || Number(transactionFormData.amount) <= 0) {
      alert('収入金額を正しく入力してください。');
      return;
    }

    const newTx: Transaction = {
      id: `TX-${Date.now()}`,
      date: transactionFormData.date || new Date().toISOString().split('T')[0],
      householdId: currentIndividualHousehold.id,
      householdHeadName: transactionFormData.householdHeadName || currentIndividualHousehold.familyHead,
      category: transactionFormData.category,
      type: '収入',
      amount: Number(transactionFormData.amount),
      paymentMethod: transactionFormData.paymentMethod,
      receiptNumber: `R-${Math.floor(100000 + Math.random() * 900000)}`,
      notes: transactionFormData.notes,
    };

    if (onAddTransaction) {
      onAddTransaction(newTx);
    }
    setShowTransactionModal(false);
  };

  // Filtered households list
  const filteredHouseholds = useMemo(() => {
    return households.filter((h) => {
      if (!h) return false;
      const isExcluded = (excludedIds || []).includes(h.id);
      if (showExcludedMode === 'active' && isExcluded) return false;
      if (showExcludedMode === 'excluded' && !isExcluded) return false;

      // 区分１ Filter
      const matchesType = typeFilter === 'ALL' || (h.householdType || '') === typeFilter;
      if (!matchesType) return false;

      // 区分２ Filter
      const matchesStatus =
        statusFilter === 'ALL'
          ? true
          : statusFilter === '__UNSET__'
          ? !(h.status || '').trim()
          : (h.status || '') === statusFilter;
      if (!matchesStatus) return false;

      // 役職 Filter
      const matchesDistrict = districtFilter === 'ALL' || (h.district || '') === districtFilter;
      if (!matchesDistrict) return false;

      // 塔婆申込 Filter (選択された塔婆種類で判定)
      const hTemple = temples.find((t) => (t.id || 'temple-main') === (h.templeId || 'temple-main')) || currentActiveTemple;
      const isTobaApplied = isHouseholdAppliedForToba(h, activeTobaType, hTemple);
      const matchesToba =
        tobaFilter === 'ALL'
          ? true
          : tobaFilter === 'checked'
          ? isTobaApplied
          : !isTobaApplied;
      if (!matchesToba) return false;

      // 棚経 Filter
      const isTanagyo = Boolean(h.tanagyoMonthlyVisit);
      const matchesTanagyo =
        tanagyoFilter === 'ALL'
          ? true
          : tanagyoFilter === 'checked'
          ? isTanagyo
          : !isTanagyo;
      if (!matchesTanagyo) return false;

      const term = (searchTerm || '').trim().toLowerCase();
      if (!term) {
        return true;
      }

      const head = (h.familyHead || '').toLowerCase();
      const furi = (h.furigana || '').toLowerCase();
      const addr = (h.address || '').toLowerCase();
      const hid = (h.id || '').toLowerCase();
      const ph = (h.phone || '').toLowerCase();
      const mob = (h.mobile || '').toLowerCase();
      const eml = (h.email || '').toLowerCase();
      const tomb = (h.tombNumber || '').toLowerCase();
      const htype = (h.householdType || '').toLowerCase();
      const hstat = (h.status || '').toLowerCase();
      const hdist = (h.district || '').toLowerCase();
      const notes = (h.notes || '').toLowerCase();
      const tanagyoNotes = (h.tanagyoNotes || '').toLowerCase();
      const familySearchText = (h.familyMembers || [])
        .map((m) => `${m.name || ''} ${m.furigana || ''} ${m.notes || ''} ${m.address || ''}`)
        .join(' ')
        .toLowerCase();
      const householdPastRecords = pastRecords.filter((r) => r.householdId === h.id);
      const pastSearchText = householdPastRecords
        .map((r) => `${r.dharmaName || ''} ${r.secularName || ''} ${r.niibon || ''} ${r.notes || ''} ${calculateNiibonFromDeathDate(r.deathDate, templeInfo?.bonSeason || '8月盆')}`)
        .join(' ')
        .toLowerCase();

      const matchesSearch =
        head.includes(term) ||
        furi.includes(term) ||
        addr.includes(term) ||
        hid.includes(term) ||
        ph.includes(term) ||
        mob.includes(term) ||
        eml.includes(term) ||
        tomb.includes(term) ||
        htype.includes(term) ||
        hstat.includes(term) ||
        hdist.includes(term) ||
        notes.includes(term) ||
        tanagyoNotes.includes(term) ||
        familySearchText.includes(term) ||
        pastSearchText.includes(term);

      return matchesSearch;
    });
  }, [households, excludedIds, showExcludedMode, searchTerm, typeFilter, statusFilter, districtFilter, tobaFilter, activeTobaType, tanagyoFilter, pastRecords, templeInfo?.bonSeason]);

  // Sorted households list based on sortKey and sortOrder
  const sortedHouseholds = useMemo(() => {
    return sortHouseholds(filteredHouseholds, sortKey, sortOrder, masterOptions, pastRecords, templeInfo?.bonSeason || '8月盆', activeTobaType, activeFeeType, transactions);
  }, [filteredHouseholds, sortKey, sortOrder, masterOptions, pastRecords, templeInfo?.bonSeason, activeTobaType, activeFeeType, transactions]);

  // 仮想スクロール (Virtual Scroll) による高速描画
  const {
    topSpacerHeight: householdTopSpacerHeight,
    bottomSpacerHeight: householdBottomSpacerHeight,
    virtualIndices: householdVirtualIndices,
  } = useVirtualScroll({
    count: sortedHouseholds.length,
    estimateItemHeight: 52,
    overscan: 60,
    containerRef: tableContainerRef,
    defaultContainerHeight: 600,
    disableThreshold: 800,
  });

  // Current selected individual household
  const currentHouseholdIndex = sortedHouseholds.findIndex((h) => h.id === selectedIndividualId);
  const currentIndividualHousehold =
    sortedHouseholds.find((h) => h.id === selectedIndividualId) ||
    sortedHouseholds[0] ||
    households[0];

  // Target temple and configured toba slots for current individual household
  const individualHouseholdTemple = useMemo(() => {
    if (!currentIndividualHousehold) return currentActiveTemple;
    return temples.find((t) => (t.id || 'temple-main') === (currentIndividualHousehold.templeId || 'temple-main')) || currentActiveTemple;
  }, [currentIndividualHousehold, temples, currentActiveTemple]);

  const individualTobaSlots = useMemo(() => {
    return getTobaSlots(individualHouseholdTemple);
  }, [individualHouseholdTemple]);

  const individualFeeSlots = useMemo(() => {
    return getFeeSlots(individualHouseholdTemple);
  }, [individualHouseholdTemple]);

  // 個別表示モード時に検索条件やフィルタが変更された場合、該当リスト内の先頭世帯を自動選択
  useEffect(() => {
    if (viewMode === 'individual' && sortedHouseholds.length > 0) {
      const existsInSorted = sortedHouseholds.some((h) => h.id === selectedIndividualId);
      if (!existsInSorted) {
        setSelectedIndividualId(sortedHouseholds[0].id);
      }
    }
  }, [viewMode, sortedHouseholds, selectedIndividualId]);

  // Past records for the current selected individual household (sorted by date ascending, records without deathDate at bottom)
  const currentHouseholdPastRecords = useMemo(() => {
    if (!currentIndividualHousehold) return [];
    return pastRecords
      .filter((r) => r.householdId === currentIndividualHousehold.id)
      .sort((a, b) => {
        const normA = normalizeDateInput(a.deathDate || '');
        const normB = normalizeDateInput(b.deathDate || '');
        if (normA && normB) {
          return normA.localeCompare(normB);
        }
        if (normA && !normB) return -1;
        if (!normA && normB) return 1;
        return (a.dharmaName || a.secularName || '').localeCompare(b.dharmaName || b.secularName || '');
      });
  }, [pastRecords, currentIndividualHousehold]);

  // Accounting transactions for the current selected individual household (sorted by date ascending)
  const currentHouseholdTransactions = useMemo(() => {
    if (!currentIndividualHousehold || !transactions) return [];
    return (transactions || [])
      .filter((t) => t.householdId === currentIndividualHousehold.id)
      .sort((a, b) => {
        const normA = normalizeDateInput(a.date || '');
        const normB = normalizeDateInput(b.date || '');
        if (normA && normB) {
          return normA.localeCompare(normB);
        }
        if (normA) return -1;
        if (normB) return 1;
        return (a.date || '').localeCompare(b.date || '');
      });
  }, [transactions, currentIndividualHousehold]);

  // Scroll refs to manage auto-scrolling to bottom when records exceed 10
  const pastRecordsScrollRef = useRef<HTMLDivElement>(null);
  const transactionsScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (viewMode === 'individual') {
      const timer = setTimeout(() => {
        if (pastRecordsScrollRef.current && currentHouseholdPastRecords.length > 10) {
          pastRecordsScrollRef.current.scrollTop = pastRecordsScrollRef.current.scrollHeight;
        }
        if (transactionsScrollRef.current && currentHouseholdTransactions.length > 10) {
          transactionsScrollRef.current.scrollTop = transactionsScrollRef.current.scrollHeight;
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [viewMode, selectedIndividualId, currentHouseholdPastRecords.length, currentHouseholdTransactions.length]);

  // 抽出条件（区分・役職・検索・抽出外モード等）の変更時、抽出外となったレコードの一括選択を自動的に解除する
  useEffect(() => {
    const validExtractedIds = new Set(sortedHouseholds.map((h) => h.id));
    setSelectedIdsForPrint((prev) => {
      const filtered = prev.filter((id) => validExtractedIds.has(id));
      if (filtered.length !== prev.length) {
        return filtered;
      }
      return prev;
    });
  }, [sortedHouseholds, setSelectedIdsForPrint]);

  // Batch Print Selection logic
  const isAllSelected =
    sortedHouseholds.length > 0 &&
    sortedHouseholds.every((h) => selectedIdsForPrint.includes(h.id));

  const toggleSelectAll = () => {
    if (isAllSelected) {
      // 全解除：すべての選択を解除
      setSelectedIdsForPrint([]);
    } else {
      // 全選択：抽出外のレコードの選択は全て解除し、現在抽出されているレコードのみを選択
      setSelectedIdsForPrint(sortedHouseholds.map((h) => h.id));
    }
  };

  const toggleSelectOne = (id: string) => {
    if (selectedIdsForPrint.includes(id)) {
      setSelectedIdsForPrint(selectedIdsForPrint.filter((item) => item !== id));
    } else {
      setSelectedIdsForPrint([...selectedIdsForPrint, id]);
    }
  };

  // Batch Change Handlers for Table columns (役職, 区分１, 区分２, 塔婆申込, 棚経)
  const handleTriggerFieldChange = (
    household: Household,
    field: 'district' | 'householdType' | 'status' | 'isSegakiToba' | 'tobaApplication' | 'tanagyoMonthlyVisit',
    newValue: any,
    fieldName: string,
    displayValue: string,
    tobaType?: string
  ) => {
    const isSelected = selectedIdsForPrint.includes(household.id);
    const selectedHouseholds = households.filter((h) => selectedIdsForPrint.includes(h.id));

    // 選択状態であり、かつ選択中の世帯が1件以上ある場合
    if (isSelected && selectedHouseholds.length > 0) {
      setBatchConfirmRequest({
        field,
        fieldName,
        newValue,
        displayValue,
        targetHousehold: household,
        selectedHouseholds,
        tobaType,
      });
    } else {
      // 選択されていない行の操作、または選択件数が0件の場合：その世帯のみ更新
      if (field === 'tobaApplication') {
        const typeToUse = tobaType || activeTobaType;
        const hhTemple = temples.find((t) => (t.id || 'temple-main') === (household.templeId || 'temple-main')) || currentActiveTemple;
        const currentApp = getHouseholdSponsorTobaApplication(household, typeToUse, hhTemple);
        const updated = setHouseholdSponsorTobaApplication(household, typeToUse, {
          applied: newValue,
          tamegaki: currentApp.tamegaki || (household.segakiTamegaki || ''),
        }, undefined, hhTemple);
        onEditHousehold(updated);
      } else if (field === 'isSegakiToba') {
        const updated = toggleHouseholdSponsorSegakiToba(household, newValue);
        onEditHousehold(updated);
      } else {
        onEditHousehold({
          ...household,
          [field]: newValue,
        });
      }
    }
  };

  const handleApplyBatchChange = () => {
    if (!batchConfirmRequest) return;
    const { field, fieldName, newValue, displayValue, selectedHouseholds, tobaType } = batchConfirmRequest;
    const typeToUse = tobaType || activeTobaType;
    const updatedList = selectedHouseholds.map((h) => {
      const hhTemple = temples.find((t) => (t.id || 'temple-main') === (h.templeId || 'temple-main')) || currentActiveTemple;
      if (field === 'tobaApplication') {
        const currentApp = getHouseholdSponsorTobaApplication(h, typeToUse, hhTemple);
        return setHouseholdSponsorTobaApplication(h, typeToUse, {
          applied: newValue,
          tamegaki: currentApp.tamegaki || (h.segakiTamegaki || ''),
        }, undefined, hhTemple);
      }
      if (field === 'isSegakiToba') {
        return toggleHouseholdSponsorSegakiToba(h, newValue);
      }
      return {
        ...h,
        [field]: newValue,
      };
    });
    const desc = `選択中${updatedList.length}件の【${fieldName}】を「${displayValue}」に一括変更`;
    if (onBatchUpdateHouseholds) {
      onBatchUpdateHouseholds(updatedList, desc);
    } else {
      updatedList.forEach((h) => onEditHousehold(h));
    }
    setBatchConfirmRequest(null);
  };

  // Switch to individual view for a specific household
  const handleSelectIndividualHousehold = (id: string) => {
    if (tableContainerRef.current) {
      lastListScrollTopRef.current = tableContainerRef.current.scrollTop;
    }
    lastSelectedHouseholdIdRef.current = id;
    setSelectedIndividualId(id);
    setViewMode('individual');
    setIsEditingHouseholdInline(false);
    setInlineHouseholdForm(null);
    setIsEditingFamilyInline(false);
    setInlineFamilyMembers([]);
    setEditingPastRecordId(null);
    setEditingTransactionId(null);
  };

  // Navigation handlers in individual view
  const handlePrevHousehold = () => {
    if (sortedHouseholds.length === 0) return;
    const prevIdx = (currentHouseholdIndex - 1 + sortedHouseholds.length) % sortedHouseholds.length;
    setSelectedIndividualId(sortedHouseholds[prevIdx].id);
    setIsEditingHouseholdInline(false);
    setInlineHouseholdForm(null);
    setIsEditingFamilyInline(false);
    setInlineFamilyMembers([]);
    setEditingPastRecordId(null);
    setEditingTransactionId(null);
  };

  const handleNextHousehold = () => {
    if (sortedHouseholds.length === 0) return;
    const nextIdx = (currentHouseholdIndex + 1) % sortedHouseholds.length;
    setSelectedIndividualId(sortedHouseholds[nextIdx].id);
    setIsEditingHouseholdInline(false);
    setInlineHouseholdForm(null);
    setIsEditingFamilyInline(false);
    setInlineFamilyMembers([]);
    setEditingPastRecordId(null);
    setEditingTransactionId(null);
  };

  // Inline Household Editing Handlers
  const handleStartInlineHouseholdEdit = () => {
    if (currentIndividualHousehold) {
      setIsEditingHouseholdInline(true);
      setInlineHouseholdForm({ ...currentIndividualHousehold });
    }
  };

  const handleSaveInlineHousehold = () => {
    if (inlineHouseholdForm) {
      if (!inlineHouseholdForm.familyHead.trim()) {
        alert('世帯主氏名（戸主名）を入力してください。');
        return;
      }
      onEditHousehold(inlineHouseholdForm);
      setIsEditingHouseholdInline(false);
      setInlineHouseholdForm(null);
    }
  };

  const handleCancelInlineHousehold = () => {
    if (currentIndividualHousehold && (!currentIndividualHousehold.familyHead || currentIndividualHousehold.familyHead.trim() === '')) {
      onDeleteHousehold(currentIndividualHousehold.id);
      const remaining = households.filter((h) => h.id !== currentIndividualHousehold.id);
      if (remaining.length > 0) {
        setSelectedIndividualId(remaining[0].id);
      }
    }
    setIsEditingHouseholdInline(false);
    setInlineHouseholdForm(null);
  };

  // Inline Family Members Editing Handlers
  const handleStartInlineFamilyEdit = () => {
    if (currentIndividualHousehold) {
      setIsEditingFamilyInline(true);
      setInlineFamilyMembers(
        currentIndividualHousehold.familyMembers
          ? currentIndividualHousehold.familyMembers.map((m) => ({ ...m }))
          : []
      );
    }
  };

  const handleAddInlineFamilyMember = () => {
    const newMember: FamilyMember = {
      id: `FM-${Date.now()}`,
      householdId: currentIndividualHousehold?.id || '',
      name: '',
      furigana: '',
      relationship: '家族',
      phone: '',
      address: '',
      isSegakiToba: false,
    };
    setInlineFamilyMembers((prev) => [...prev, newMember]);
  };

  const handleSaveInlineFamilyMembers = () => {
    if (currentIndividualHousehold) {
      const updatedHousehold: Household = {
        ...currentIndividualHousehold,
        familyMembers: inlineFamilyMembers.filter((m) => m.name.trim() !== '' || m.relationship.trim() !== ''),
      };
      onEditHousehold(updatedHousehold);
      setIsEditingFamilyInline(false);
    }
  };

  // Inline Past Record Editing Handlers
  const handleStartInlinePastRecordEdit = (record: PastRecord) => {
    setEditingPastRecordId(record.id);
    setInlinePastRecordForm({ ...record });
  };

  const handleSaveInlinePastRecord = () => {
    if (!inlinePastRecordForm || !inlinePastRecordForm.id) return;
    const normalizedDate = inlinePastRecordForm.deathDate && inlinePastRecordForm.deathDate.trim()
      ? (normalizeDateInput(inlinePastRecordForm.deathDate, { mode: 'pastRecord' }) || '')
      : '';
    const rawAge = inlinePastRecordForm.ageAtDeath;
    const parsedAge = rawAge !== undefined && rawAge !== null && String(rawAge).trim() !== ''
      ? Number(rawAge)
      : undefined;

    const updatedRecord: PastRecord = {
      id: inlinePastRecordForm.id,
      householdId: inlinePastRecordForm.householdId || currentIndividualHousehold?.id || '',
      householdHeadName: inlinePastRecordForm.householdHeadName || currentIndividualHousehold?.familyHead || '',
      dharmaName: inlinePastRecordForm.dharmaName || '',
      secularName: inlinePastRecordForm.secularName || '',
      deathDate: normalizedDate,
      ageAtDeath: parsedAge !== undefined && !isNaN(parsedAge) && parsedAge > 0 ? parsedAge : undefined,
      relationship: inlinePastRecordForm.relationship || '',
      burialLocation: inlinePastRecordForm.burialLocation || '',
      niibon: inlinePastRecordForm.niibon !== undefined && inlinePastRecordForm.niibon.trim() !== '' ? inlinePastRecordForm.niibon : undefined,
      notes: inlinePastRecordForm.notes || '',
    };
    onUpdatePastRecord(updatedRecord);
    setEditingPastRecordId(null);
    setInlinePastRecordForm(null);
  };

  const handleCancelInlinePastRecord = () => {
    setEditingPastRecordId(null);
    setInlinePastRecordForm(null);
  };

  // Inline Transaction Editing Handlers
  const handleStartInlineTransactionEdit = (tx: Transaction) => {
    setEditingTransactionId(tx.id);
    setInlineTxForm({ ...tx });
  };

  const handleSaveInlineTransaction = () => {
    if (!inlineTxForm || !inlineTxForm.id) return;
    const normalizedDate = normalizeDateInput(inlineTxForm.date || '', {
      mode: 'accounting',
      fiscalStartMonth: templeInfo?.fiscalYearStartMonth ?? 4
    }) || '2026/08/08';
    const updatedTx: Transaction = {
      id: inlineTxForm.id,
      date: normalizedDate,
      householdId: inlineTxForm.householdId || currentIndividualHousehold?.id || '',
      householdHeadName: inlineTxForm.householdHeadName || currentIndividualHousehold?.familyHead || '',
      category: inlineTxForm.category || '法要布施',
      type: inlineTxForm.type || '収入',
      amount: Number(inlineTxForm.amount) || 0,
      paymentMethod: inlineTxForm.paymentMethod || '現金受付',
      receiptNumber: inlineTxForm.receiptNumber || `R-${Date.now()}`,
      notes: inlineTxForm.notes || '',
    };
    if (onUpdateTransaction) {
      onUpdateTransaction(updatedTx);
    }
    setEditingTransactionId(null);
    setInlineTxForm(null);
  };

  const handleCancelInlineTransaction = () => {
    setEditingTransactionId(null);
    setInlineTxForm(null);
  };

  // Open Past Record modal for current household
  const handleOpenAddPastRecord = () => {
    if (!currentIndividualHousehold) return;
    setEditingPastRecord(null);
    setPastRecordFormData({
      id: `KC-${Math.floor(500 + Math.random() * 500)}`,
      householdId: currentIndividualHousehold.id,
      householdHeadName: currentIndividualHousehold.familyHead,
      dharmaName: '',
      secularName: '',
      deathDate: '',
      ageAtDeath: undefined,
      relationship: '',
      burialLocation: currentIndividualHousehold.tombNumber || '',
      niibon: undefined,
      notes: '',
    });
    setShowPastRecordModal(true);
  };

  const handleOpenEditPastRecord = (record: PastRecord) => {
    setEditingPastRecord(record);
    setPastRecordFormData(record);
    setShowPastRecordModal(true);
  };

  const handleSavePastRecord = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pastRecordFormData.dharmaName && !pastRecordFormData.secularName) {
      alert('戒名（法名）または俗名を入力してください。');
      return;
    }

    const normalizedDate = pastRecordFormData.deathDate && pastRecordFormData.deathDate.trim()
      ? (normalizeDateInput(pastRecordFormData.deathDate, { mode: 'pastRecord' }) || '')
      : '';
    const autoNiibon = normalizedDate ? calculateNiibonFromDeathDate(normalizedDate, templeInfo?.bonSeason || '8月盆') : undefined;

    const rawAge = pastRecordFormData.ageAtDeath;
    const parsedAge = rawAge !== undefined && rawAge !== null && String(rawAge).trim() !== ''
      ? Number(rawAge)
      : undefined;

    const completeRecord: PastRecord = {
      id: pastRecordFormData.id || `KC-${Date.now()}`,
      householdId: pastRecordFormData.householdId || currentIndividualHousehold?.id || '',
      householdHeadName: pastRecordFormData.householdHeadName !== undefined
        ? pastRecordFormData.householdHeadName
        : (currentIndividualHousehold?.familyHead || ''),
      dharmaName: pastRecordFormData.dharmaName || '',
      secularName: pastRecordFormData.secularName || '',
      deathDate: normalizedDate,
      ageAtDeath: parsedAge !== undefined && !isNaN(parsedAge) && parsedAge > 0 ? parsedAge : undefined,
      relationship: pastRecordFormData.relationship || '',
      burialLocation: pastRecordFormData.burialLocation || currentIndividualHousehold?.tombNumber || '',
      niibon: pastRecordFormData.niibon !== undefined && pastRecordFormData.niibon.trim() !== '' ? pastRecordFormData.niibon : (autoNiibon || undefined),
      notes: pastRecordFormData.notes || '',
    };

    if (editingPastRecord) {
      onUpdatePastRecord(completeRecord);
    } else {
      onAddPastRecord(completeRecord);
    }
    setShowPastRecordModal(false);
  };

  return (
    <div className="flex flex-col space-y-0">
      {/* Top Banner & View Switcher Bar */}
      <div className={`bg-[#1A1A1A] border-b border-[#D4AF37] p-3.5 sm:p-4 shadow-md flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 font-serif text-[#F9F7F2] shrink-0 ${
        viewMode === 'individual' ? 'sticky top-0 sm:top-[96px] z-20' : ''
      }`}>
        <div>
          <div className="flex items-center flex-wrap gap-3">
            <div className="w-8 h-8 bg-[#D4AF37] text-[#1A1A1A] flex items-center justify-center font-bold font-sans text-xs shrink-0">
              名帳
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-[#F9F7F2] tracking-wider">
              檀家名簿管理
            </h2>
            <div className="px-2.5 py-1 bg-emerald-950/80 text-emerald-300 border border-emerald-500/60 text-xs font-sans font-bold flex items-center gap-1.5 shadow-xs whitespace-nowrap">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>総レコード数：{households.length.toLocaleString('ja-JP')}件</span>
            </div>
          </div>
        </div>

        {/* Mode Switcher Buttons & Print Buttons */}
        <div className="flex flex-wrap items-center gap-2 font-sans text-xs">
          <button
            onClick={() => setIsAddressBookModalOpen(true)}
            className="px-3 py-2 bg-[#2A2A2A] hover:bg-[#333333] text-[#D4AF37] border border-[#D4AF37] font-bold tracking-wider transition-colors flex items-center space-x-1.5 shadow-xs cursor-pointer"
            title="1ページ目表紙＋2ページ目以降五十音順A4名簿・過去帳最新4件印刷"
          >
            <Printer className="w-4 h-4 text-[#D4AF37]" />
            <span>住所録印刷</span>
          </button>

          <button
            onClick={() => setIsReceptionSheetModalOpen(true)}
            className="px-3 py-2 bg-[#2A2A2A] hover:bg-[#333333] text-[#D4AF37] border border-[#D4AF37] font-bold tracking-wider transition-colors flex items-center space-x-1.5 shadow-xs cursor-pointer"
            title="五十音順2列・手書き記入欄（塔婆・盆供）・新盆/棚経朱文字印字"
          >
            <Printer className="w-4 h-4 text-[#D4AF37]" />
            <span>受付表印刷</span>
          </button>

          <button
            onClick={() => setIsTobaPatronModalOpen(true)}
            className="px-3 py-2 bg-[#2A2A2A] hover:bg-[#333333] text-[#D4AF37] border border-[#D4AF37] font-bold tracking-wider transition-colors flex items-center space-x-1.5 shadow-xs cursor-pointer"
            title="塔婆申込施主一覧・五十音順2段組リスト（施餓鬼・彼岸・合同供養等）"
          >
            <ScrollText className="w-4 h-4 text-[#D4AF37]" />
            <span>塔婆施主印刷</span>
          </button>

          <button
            onClick={() => setViewMode('list')}
            className={`px-3.5 py-2 font-bold tracking-wider uppercase transition-colors flex items-center space-x-1.5 ${
              viewMode === 'list'
                ? 'bg-[#D4AF37] text-[#1A1A1A]'
                : 'bg-[#2A2A2A] text-[#F9F7F2] hover:bg-[#333333] border border-[#444444]'
            }`}
          >
            <List className="w-4 h-4" />
            <span>リスト表示</span>
          </button>

          <button
            onClick={() => {
              setViewMode('individual');
              if (!selectedIndividualId && households.length > 0) {
                setSelectedIndividualId(households[0].id);
              }
            }}
            className={`px-3.5 py-2 font-bold tracking-wider uppercase transition-colors flex items-center space-x-1.5 ${
              viewMode === 'individual'
                ? 'bg-[#D4AF37] text-[#1A1A1A]'
                : 'bg-[#2A2A2A] text-[#F9F7F2] hover:bg-[#333333] border border-[#444444]'
            }`}
          >
            <User className="w-4 h-4" />
            <span>個別表示</span>
          </button>

          <button
            onClick={handleStartAddNewHousehold}
            className="px-3.5 py-2 bg-[#D4AF37] hover:bg-[#c29f2f] text-[#1A1A1A] font-bold tracking-wider uppercase transition-colors flex items-center space-x-1.5 shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>新規檀徒</span>
          </button>
        </div>
      </div>

      {/* SEARCH & FILTER BAR (List view only) */}
      {viewMode === 'list' && (
        <div className="bg-white border-x border-b border-[#D1CEC7] p-2.5 sm:p-3 shadow-2xs space-y-2 font-serif shrink-0">
          {/* 1行目: 検索ウインドウ、役職、区分１、区分２、施餓鬼塔婆、棚経 */}
          <div className="flex flex-wrap items-center gap-2 font-sans text-xs">
            {/* 検索ウインドウ */}
            <div className="relative flex-1 min-w-[200px] sm:min-w-[240px]">
              <Search className="w-4 h-4 absolute left-3 top-2 text-[#888888]" />
              <input
                type="text"
                placeholder="世帯主・ふりがな・役職・住所・電話・備考・墓地番号・ID等で検索..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-[#F9F7F2] border border-[#D1CEC7] rounded-none pl-9 pr-4 py-1.5 text-[#2D2D2D] text-xs focus:border-[#1A1A1A] focus:bg-white focus:outline-none transition-colors font-sans"
              />
            </div>

            {/* 役職 */}
            <div className="flex items-center space-x-1 shrink-0">
              <span className="text-xs text-[#666666] font-bold whitespace-nowrap">役職:</span>
              <select
                value={districtFilter}
                onChange={(e) => setDistrictFilter(e.target.value)}
                className={`border rounded-none px-2 py-1.5 text-xs focus:border-[#1A1A1A] focus:outline-none transition-colors cursor-pointer ${
                  districtFilter !== 'ALL'
                    ? 'bg-amber-50 border-amber-500 text-amber-950 font-bold'
                    : 'bg-[#F9F7F2] border-[#D1CEC7] text-[#2D2D2D]'
                }`}
              >
                <option value="ALL">全ての役職</option>
                {districts.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>

            {/* 区分１ */}
            <div className="flex items-center space-x-1 shrink-0">
              <span className="text-xs text-[#666666] font-bold whitespace-nowrap">区分１:</span>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className={`border rounded-none px-2 py-1.5 text-xs focus:border-[#1A1A1A] focus:outline-none transition-colors cursor-pointer ${
                  typeFilter !== 'ALL'
                    ? 'bg-indigo-50 border-indigo-400 text-indigo-950 font-bold'
                    : 'bg-[#F9F7F2] border-[#D1CEC7] text-[#2D2D2D]'
                }`}
              >
                <option value="ALL">全ての区分１</option>
                {householdTypeList.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            {/* 区分２ */}
            <div className="flex items-center space-x-1 shrink-0">
              <span className="text-xs text-[#666666] font-bold whitespace-nowrap">区分２:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className={`border rounded-none px-2 py-1.5 text-xs focus:border-[#1A1A1A] focus:outline-none transition-colors cursor-pointer ${
                  statusFilter !== 'ALL'
                    ? 'bg-emerald-50 border-emerald-500 text-emerald-950 font-bold'
                    : 'bg-[#F9F7F2] border-[#D1CEC7] text-[#2D2D2D]'
                }`}
              >
                <option value="ALL">全ての区分２</option>
                {statusList.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
                <option value="__UNSET__">（未設定・空欄）</option>
              </select>
            </div>

            {/* 塔婆申込 (種類切替プルダウン + 申込状況) */}
            <div className="flex items-center space-x-1 shrink-0 bg-amber-50/60 p-1 border border-amber-200">
              <span className="text-xs text-amber-950 font-bold whitespace-nowrap flex items-center space-x-1">
                <ScrollText className="w-3.5 h-3.5 text-amber-700 inline" />
                <span>塔婆:</span>
              </span>
              <select
                value={activeTobaType}
                onChange={(e) => {
                  const val = e.target.value;
                  setSelectedTobaType(val);
                  safeStorage.setItem('household_selected_toba_type', val);
                }}
                className="border border-amber-300 rounded-none px-2 py-1.5 text-xs bg-white text-amber-950 font-bold focus:border-[#1A1A1A] focus:outline-none transition-colors cursor-pointer"
                title="表示・絞り込み対象の塔婆種類を切り替え"
              >
                {effectiveTobaSlots.map((slot) => (
                  <option key={slot.slot} value={slot.name}>
                    {slot.name}
                  </option>
                ))}
              </select>
              <select
                value={tobaFilter}
                onChange={(e) => setTobaFilter(e.target.value as any)}
                className={`border rounded-none px-2 py-1.5 text-xs focus:border-[#1A1A1A] focus:outline-none transition-colors cursor-pointer ${
                  tobaFilter !== 'ALL'
                    ? 'bg-orange-50 border-orange-500 text-orange-950 font-bold'
                    : 'bg-white border-[#D1CEC7] text-[#2D2D2D]'
                }`}
              >
                <option value="ALL">全て</option>
                <option value="checked">申込済 (有)</option>
                <option value="unchecked">未申込 (無)</option>
              </select>
            </div>

            {/* 棚経 */}
            <div className="flex items-center space-x-1 shrink-0">
              <span className="text-xs text-[#666666] font-bold whitespace-nowrap">棚経:</span>
              <select
                value={tanagyoFilter}
                onChange={(e) => setTanagyoFilter(e.target.value as any)}
                className={`border rounded-none px-2 py-1.5 text-xs focus:border-[#1A1A1A] focus:outline-none transition-colors cursor-pointer ${
                  tanagyoFilter !== 'ALL'
                    ? 'bg-teal-50 border-teal-500 text-teal-950 font-bold'
                    : 'bg-[#F9F7F2] border-[#D1CEC7] text-[#2D2D2D]'
                }`}
              >
                <option value="ALL">全て</option>
                <option value="checked">棚経対象 (伺う)</option>
                <option value="unchecked">棚経対象外</option>
              </select>
            </div>
          </div>

          {/* 2行目: 全選択/解除、該当数⚫️件、一括印刷選択中⚫️件、抽出外レコード表示（⚫️件）、抽出解除 */}
          <div className="flex flex-wrap items-center justify-between pt-2 border-t border-[#F0EFEA] text-xs text-[#666666] font-sans gap-2">
            <div className="flex flex-wrap items-center gap-3">
              {/* 全選択 / 解除 */}
              <button
                onClick={toggleSelectAll}
                className="flex items-center space-x-1.5 px-2.5 py-1 bg-[#F9F7F2] hover:bg-[#EBE7DF] border border-[#D1CEC7] text-[#2D2D2D] font-bold transition-colors cursor-pointer shadow-2xs"
                title="表示中の全レコードを選択または選択解除します"
              >
                {isAllSelected ? (
                  <CheckSquare className="w-4 h-4 text-[#1A1A1A]" />
                ) : (
                  <Square className="w-4 h-4 text-[#888888]" />
                )}
                <span>全選択 / 解除</span>
              </button>

              {/* 該当数 ⚫️件 */}
              <span className="whitespace-nowrap">
                該当数: <strong className="text-[#1A1A1A] font-mono text-sm">{sortedHouseholds.length}</strong> 件
              </span>

              {/* 一括印刷選択中 ⚫️件 */}
              <span className="whitespace-nowrap">
                一括印刷選択中: <strong className="text-indigo-800 font-mono text-sm">{selectedIdsForPrint.length}</strong> 件
              </span>

              {/* 抽出外レコード表示（⚫️件） */}
              <button
                onClick={() => {
                  const currentVisibleIds = filteredHouseholds.map((h) => h.id);
                  setAllExcludedIds(currentVisibleIds);
                  setShowExcludedMode('active');
                  setTypeFilter('ALL');
                  setStatusFilter('ALL');
                  setDistrictFilter('ALL');
                  setTobaFilter('ALL');
                  setTanagyoFilter('ALL');
                  setSearchTerm('');
                }}
                className="px-2.5 py-1 text-xs font-bold transition-colors border flex items-center space-x-1 bg-[#F9F7F2] hover:bg-amber-50 text-amber-900 border-[#D1CEC7] cursor-pointer shadow-2xs"
                title="現在表示中のレコードを非表示にし、非表示のレコードを表示します（検索・区分等の条件はクリアされます）"
              >
                <FilterX className="w-3.5 h-3.5" />
                <span>抽出外レコード表示 ({households.length - filteredHouseholds.length}件)</span>
              </button>

              {/* 抽出解除 */}
              <button
                onClick={() => {
                  setAllExcludedIds([]);
                  setShowExcludedMode('active');
                  setTypeFilter('ALL');
                  setStatusFilter('ALL');
                  setDistrictFilter('ALL');
                  setTobaFilter('ALL');
                  setTanagyoFilter('ALL');
                  setSearchTerm('');
                }}
                className="px-2.5 py-1 text-xs font-bold transition-colors border bg-[#F9F7F2] hover:bg-[#EBE7DF] text-[#444444] border-[#D1CEC7] cursor-pointer shadow-2xs"
                title="全ての抽出外設定、区分１・区分２、役職、塔婆申込、棚経、検索ワードをクリアし、全レコードを表示します"
              >
                抽出解除
              </button>
            </div>

            {/* 右側アクション（一括印刷、リスト表示編集） */}
            <div className="flex items-center space-x-2">
              {/* 一括印刷ボタン */}
              {selectedIdsForPrint.length > 0 && (
                <button
                  onClick={onNavigateToPrint}
                  className="flex items-center space-x-1.5 px-3 py-1 bg-[#1A1A1A] hover:bg-[#333333] text-[#D4AF37] border border-[#D4AF37] transition-colors text-xs font-bold tracking-wider cursor-pointer shadow-2xs"
                >
                  <Printer className="w-3.5 h-3.5 text-[#D4AF37]" />
                  <span>選択中の {selectedIdsForPrint.length} 件を長3封筒・はがき印刷へ</span>
                </button>
              )}

              {/* リスト表示編集ボタン */}
              <button
                type="button"
                onClick={() => setShowColumnConfigModal(true)}
                className="flex items-center space-x-1.5 px-3 py-1 bg-white hover:bg-[#FAF9F5] text-[#1A1A1A] hover:text-[#000000] border border-[#D1CEC7] hover:border-[#1A1A1A] transition-colors text-xs font-bold shadow-2xs cursor-pointer"
                title="リスト表示に表示する項目の選択と並び順を編集します"
              >
                <SlidersHorizontal className="w-3.5 h-3.5 text-[#D4AF37]" />
                <span>リスト表示編集</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VIEW MODE 1: リスト表示 (All Households Row/Table View) */}
      {viewMode === 'list' && (
        <div className="font-sans flex flex-col flex-1 min-h-0 space-y-0">
          {/* Table Container */}
          <div ref={tableContainerRef} className="max-h-[calc(100vh-270px)] min-h-[350px] overflow-y-auto overflow-x-auto bg-white border-x border-b border-[#D1CEC7] shadow-xs relative">
            <table className="w-full text-left border-collapse font-sans text-xs">
              <thead className="sticky top-0 z-20 bg-[#1A1A1A] text-[#F9F7F2] border-b border-[#D4AF37] select-none shadow-sm">
                <tr className="bg-[#1A1A1A]">
                  {/* チェックボックス（常時表示・最左・固定） */}
                  <th className="sticky top-0 left-0 z-30 bg-[#1A1A1A] px-2 py-2.5 w-10 min-w-10 max-w-10 text-center">
                    <button onClick={toggleSelectAll} className="focus:outline-none cursor-pointer" title="全選択/解除">
                      {isAllSelected ? (
                        <CheckSquare className="w-3.5 h-3.5 text-[#D4AF37] mx-auto" />
                      ) : (
                        <Square className="w-3.5 h-3.5 text-[#888888] mx-auto" />
                      )}
                    </button>
                  </th>

                  {/* 施主名（常時表示・左固定） */}
                  <th
                    onClick={() => handleSort('familyHead')}
                    className="sticky top-0 left-10 z-30 bg-[#1A1A1A] px-3 py-2.5 font-bold tracking-wider cursor-pointer hover:bg-[#2A2A2A] transition-colors whitespace-nowrap border-r border-[#333333] shadow-[2px_0_4px_-1px_rgba(0,0,0,0.3)]"
                  >
                    施主名
                    {sortKey === 'familyHead' ? (
                      sortOrder === 'asc' ? <ArrowUp className="w-3 h-3 text-[#D4AF37] inline ml-1" /> : <ArrowDown className="w-3 h-3 text-[#D4AF37] inline ml-1" />
                    ) : (
                      <ArrowUpDown className="w-3 h-3 text-[#777777] inline ml-1" />
                    )}
                  </th>

                  {/* 動的設定列 */}
                  {listColumns.filter((c) => c.enabled).map((col) => {
                    switch (col.key) {
                      case 'idTomb':
                        return (
                          <th
                            key="idTomb"
                            onClick={() => handleSort('id')}
                            className="sticky top-0 bg-[#1A1A1A] px-2 py-2.5 font-bold tracking-wider cursor-pointer hover:bg-[#2A2A2A] transition-colors whitespace-nowrap"
                          >
                            ID/墓地
                            {sortKey === 'id' || sortKey === 'tombNumber' ? (
                              sortOrder === 'asc' ? <ArrowUp className="w-3 h-3 text-[#D4AF37] inline ml-1" /> : <ArrowDown className="w-3 h-3 text-[#D4AF37] inline ml-1" />
                            ) : (
                              <ArrowUpDown className="w-3 h-3 text-[#777777] inline ml-1" />
                            )}
                          </th>
                        );
                      case 'familyHeadName':
                        return (
                          <th
                            key="familyHeadName"
                            onClick={() => handleSort('familyHeadName')}
                            className="sticky top-0 bg-[#1A1A1A] px-2 py-2.5 font-bold tracking-wider cursor-pointer hover:bg-[#2A2A2A] transition-colors whitespace-nowrap"
                          >
                            世帯主名
                            {sortKey === 'familyHeadName' ? (
                              sortOrder === 'asc' ? <ArrowUp className="w-3 h-3 text-[#D4AF37] inline ml-1" /> : <ArrowDown className="w-3 h-3 text-[#D4AF37] inline ml-1" />
                            ) : (
                              <ArrowUpDown className="w-3 h-3 text-[#777777] inline ml-1" />
                            )}
                          </th>
                        );
                      case 'district':
                        return (
                          <th
                            key="district"
                            onClick={() => handleSort('district')}
                            className="sticky top-0 bg-[#1A1A1A] px-2 py-2.5 font-bold tracking-wider cursor-pointer hover:bg-[#2A2A2A] transition-colors whitespace-nowrap"
                          >
                            役職
                            {sortKey === 'district' ? (
                              sortOrder === 'asc' ? <ArrowUp className="w-3 h-3 text-[#D4AF37] inline ml-1" /> : <ArrowDown className="w-3 h-3 text-[#D4AF37] inline ml-1" />
                            ) : (
                              <ArrowUpDown className="w-3 h-3 text-[#777777] inline ml-1" />
                            )}
                          </th>
                        );
                      case 'householdType':
                        return (
                          <th
                            key="householdType"
                            onClick={() => handleSort('householdType')}
                            className="sticky top-0 bg-[#1A1A1A] px-2 py-2.5 font-bold tracking-wider cursor-pointer hover:bg-[#2A2A2A] transition-colors whitespace-nowrap"
                          >
                            区分１
                            {sortKey === 'householdType' ? (
                              sortOrder === 'asc' ? <ArrowUp className="w-3 h-3 text-[#D4AF37] inline ml-1" /> : <ArrowDown className="w-3 h-3 text-[#D4AF37] inline ml-1" />
                            ) : (
                              <ArrowUpDown className="w-3 h-3 text-[#777777] inline ml-1" />
                            )}
                          </th>
                        );
                      case 'status':
                        return (
                          <th
                            key="status"
                            onClick={() => handleSort('status')}
                            className="sticky top-0 bg-[#1A1A1A] px-2 py-2.5 font-bold tracking-wider cursor-pointer hover:bg-[#2A2A2A] transition-colors whitespace-nowrap"
                          >
                            区分２
                            {sortKey === 'status' ? (
                              sortOrder === 'asc' ? <ArrowUp className="w-3 h-3 text-[#D4AF37] inline ml-1" /> : <ArrowDown className="w-3 h-3 text-[#D4AF37] inline ml-1" />
                            ) : (
                              <ArrowUpDown className="w-3 h-3 text-[#777777] inline ml-1" />
                            )}
                          </th>
                        );
                      case 'niibon':
                        return (
                          <th
                            key="niibon"
                            onClick={() => handleSort('niibon')}
                            className="sticky top-0 bg-[#1A1A1A] px-2 py-2.5 font-bold tracking-wider cursor-pointer hover:bg-[#2A2A2A] transition-colors text-center whitespace-nowrap text-[#D4AF37]"
                            title="新盆（本年度・来年度）で並べ替え"
                          >
                            新盆
                            {sortKey === 'niibon' ? (
                              sortOrder === 'asc' ? <ArrowUp className="w-3 h-3 text-[#D4AF37] inline ml-1" /> : <ArrowDown className="w-3 h-3 text-[#D4AF37] inline ml-1" />
                            ) : (
                              <ArrowUpDown className="w-3 h-3 text-[#777777] inline ml-1" />
                            )}
                          </th>
                        );
                      case 'address':
                        return (
                          <th
                            key="address"
                            onClick={() => handleSort('address')}
                            className="sticky top-0 bg-[#1A1A1A] px-2 py-2.5 font-bold tracking-wider cursor-pointer hover:bg-[#2A2A2A] transition-colors whitespace-nowrap"
                          >
                            住所
                            {sortKey === 'address' ? (
                              sortOrder === 'asc' ? <ArrowUp className="w-3 h-3 text-[#D4AF37] inline ml-1" /> : <ArrowDown className="w-3 h-3 text-[#D4AF37] inline ml-1" />
                            ) : (
                              <ArrowUpDown className="w-3 h-3 text-[#777777] inline ml-1" />
                            )}
                          </th>
                        );
                      case 'phone':
                        return (
                          <th
                            key="phone"
                            onClick={() => handleSort('phone')}
                            className="sticky top-0 bg-[#1A1A1A] px-2 py-2.5 font-bold tracking-wider cursor-pointer hover:bg-[#2A2A2A] transition-colors whitespace-nowrap"
                          >
                            固定電話
                            {sortKey === 'phone' ? (
                              sortOrder === 'asc' ? <ArrowUp className="w-3 h-3 text-[#D4AF37] inline ml-1" /> : <ArrowDown className="w-3 h-3 text-[#D4AF37] inline ml-1" />
                            ) : (
                              <ArrowUpDown className="w-3 h-3 text-[#777777] inline ml-1" />
                            )}
                          </th>
                        );
                      case 'mobile':
                        return (
                          <th
                            key="mobile"
                            onClick={() => handleSort('mobile')}
                            className="sticky top-0 bg-[#1A1A1A] px-2 py-2.5 font-bold tracking-wider cursor-pointer hover:bg-[#2A2A2A] transition-colors whitespace-nowrap"
                          >
                            携帯電話
                            {sortKey === 'mobile' ? (
                              sortOrder === 'asc' ? <ArrowUp className="w-3 h-3 text-[#D4AF37] inline ml-1" /> : <ArrowDown className="w-3 h-3 text-[#D4AF37] inline ml-1" />
                            ) : (
                              <ArrowUpDown className="w-3 h-3 text-[#777777] inline ml-1" />
                            )}
                          </th>
                        );
                      case 'toba':
                        return (
                          <th
                            key="toba"
                            className="sticky top-0 bg-[#1A1A1A] px-2 py-1.5 font-bold tracking-wider text-center whitespace-nowrap"
                          >
                            <div className="flex items-center justify-center space-x-1">
                              <select
                                value={activeTobaType}
                                onChange={(e) => {
                                  e.stopPropagation();
                                  const val = e.target.value;
                                  setSelectedTobaType(val);
                                  safeStorage.setItem('household_selected_toba_type', val);
                                }}
                                onClick={(e) => e.stopPropagation()}
                                className="bg-[#2A2A2A] hover:bg-[#333333] text-[#D4AF37] border border-[#555555] rounded-none px-1.5 py-1 text-xs font-bold focus:outline-none focus:border-[#D4AF37] cursor-pointer transition-colors"
                                title="塔婆申込の種類を切り替え"
                              >
                                {effectiveTobaSlots.map((slot) => (
                                  <option key={slot.slot} value={slot.name}>
                                    {slot.name}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                onClick={() => handleSort('tobaApplication')}
                                className="p-1 text-[#888888] hover:text-[#D4AF37] transition-colors cursor-pointer"
                                title={`${activeTobaType}の申込状況で並べ替え`}
                              >
                                {sortKey === 'tobaApplication' || sortKey === 'isSegakiToba' ? (
                                  sortOrder === 'asc' ? <ArrowUp className="w-3 h-3 text-[#D4AF37]" /> : <ArrowDown className="w-3 h-3 text-[#D4AF37]" />
                                ) : (
                                  <ArrowUpDown className="w-3 h-3" />
                                )}
                              </button>
                            </div>
                          </th>
                        );
                      case 'tamegaki':
                        return (
                          <th
                            key="tamegaki"
                            onClick={() => handleSort('tamegaki')}
                            className="sticky top-0 bg-[#1A1A1A] px-2 py-2.5 font-bold tracking-wider cursor-pointer hover:bg-[#2A2A2A] transition-colors whitespace-nowrap"
                          >
                            為書き
                            {sortKey === 'tamegaki' ? (
                              sortOrder === 'asc' ? <ArrowUp className="w-3 h-3 text-[#D4AF37] inline ml-1" /> : <ArrowDown className="w-3 h-3 text-[#D4AF37] inline ml-1" />
                            ) : (
                              <ArrowUpDown className="w-3 h-3 text-[#777777] inline ml-1" />
                            )}
                          </th>
                        );
                      case 'fee':
                        return (
                          <th
                            key="fee"
                            className="sticky top-0 bg-[#1A1A1A] px-2 py-1.5 font-bold tracking-wider text-center whitespace-nowrap"
                          >
                            <div className="flex items-center justify-center space-x-1">
                              {effectiveFeeSlots.length > 1 ? (
                                <select
                                  value={activeFeeType}
                                  onChange={(e) => {
                                    e.stopPropagation();
                                    const val = e.target.value;
                                    setSelectedFeeType(val);
                                    safeStorage.setItem('household_selected_fee_type', val);
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                  className="bg-[#2A2A2A] hover:bg-[#333333] text-[#D4AF37] border border-[#555555] rounded-none px-1.5 py-1 text-xs font-bold focus:outline-none focus:border-[#D4AF37] cursor-pointer transition-colors"
                                  title="集金項目の種類を切り替え"
                                >
                                  {effectiveFeeSlots.map((slot) => (
                                    <option key={slot.slot} value={slot.name}>
                                      {slot.name}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <span className="text-[#D4AF37] px-1 text-xs font-bold whitespace-nowrap">
                                  {effectiveFeeSlots[0]?.name || '集金'}
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={() => handleSort('feeAmount')}
                                className="p-1 text-[#888888] hover:text-[#D4AF37] transition-colors cursor-pointer"
                                title={`${activeFeeType || '集金'}の金額で並べ替え`}
                              >
                                {sortKey === 'feeAmount' ? (
                                  sortOrder === 'asc' ? <ArrowUp className="w-3 h-3 text-[#D4AF37]" /> : <ArrowDown className="w-3 h-3 text-[#D4AF37]" />
                                ) : (
                                  <ArrowUpDown className="w-3 h-3" />
                                )}
                              </button>
                            </div>
                          </th>
                        );
                      case 'tanagyo':
                        return (
                          <th
                            key="tanagyo"
                            onClick={() => handleSort('tanagyoMonthlyVisit')}
                            className="sticky top-0 bg-[#1A1A1A] px-1.5 py-2.5 font-bold tracking-wider cursor-pointer hover:bg-[#2A2A2A] transition-colors text-center whitespace-nowrap"
                            title="棚経伺いの対象状況で並べ替え"
                          >
                            棚経
                            {sortKey === 'tanagyoMonthlyVisit' ? (
                              sortOrder === 'asc' ? <ArrowUp className="w-3 h-3 text-[#D4AF37] inline ml-1" /> : <ArrowDown className="w-3 h-3 text-[#D4AF37] inline ml-1" />
                            ) : (
                              <ArrowUpDown className="w-3 h-3 text-[#777777] inline ml-1" />
                            )}
                          </th>
                        );
                      case 'notes':
                        return (
                          <th
                            key="notes"
                            onClick={() => handleSort('notes')}
                            className="sticky top-0 bg-[#1A1A1A] px-2 py-2.5 font-bold tracking-wider cursor-pointer hover:bg-[#2A2A2A] transition-colors whitespace-nowrap"
                          >
                            備考
                            {sortKey === 'notes' ? (
                              sortOrder === 'asc' ? <ArrowUp className="w-3 h-3 text-[#D4AF37] inline ml-1" /> : <ArrowDown className="w-3 h-3 text-[#D4AF37] inline ml-1" />
                            ) : (
                              <ArrowUpDown className="w-3 h-3 text-[#777777] inline ml-1" />
                            )}
                          </th>
                        );
                      case 'pastCount':
                        return (
                          <th
                            key="pastCount"
                            onClick={() => handleSort('pastCount')}
                            className="sticky top-0 bg-[#1A1A1A] px-2 py-2.5 font-bold tracking-wider cursor-pointer hover:bg-[#2A2A2A] transition-colors text-center whitespace-nowrap"
                          >
                            精霊数
                            {sortKey === 'pastCount' ? (
                              sortOrder === 'asc' ? <ArrowUp className="w-3 h-3 text-[#D4AF37] inline ml-1" /> : <ArrowDown className="w-3 h-3 text-[#D4AF37] inline ml-1" />
                            ) : (
                              <ArrowUpDown className="w-3 h-3 text-[#777777] inline ml-1" />
                            )}
                          </th>
                        );
                      case 'accountingCount':
                        return (
                          <th
                            key="accountingCount"
                            onClick={() => handleSort('accountingCount')}
                            className="sticky top-0 bg-[#1A1A1A] px-2 py-2.5 font-bold tracking-wider cursor-pointer hover:bg-[#2A2A2A] transition-colors text-center whitespace-nowrap"
                          >
                            会計記録数
                            {sortKey === 'accountingCount' ? (
                              sortOrder === 'asc' ? <ArrowUp className="w-3 h-3 text-[#D4AF37] inline ml-1" /> : <ArrowDown className="w-3 h-3 text-[#D4AF37] inline ml-1" />
                            ) : (
                              <ArrowUpDown className="w-3 h-3 text-[#777777] inline ml-1" />
                            )}
                          </th>
                        );
                      default:
                        return null;
                    }
                  })}

                  {/* 抽出外（常時表示・最右・右固定） */}
                  <th className="sticky top-0 right-0 z-30 bg-[#1A1A1A] px-2 py-2.5 font-bold tracking-wider text-center whitespace-nowrap border-l border-[#333333] shadow-[-2px_0_4px_-1px_rgba(0,0,0,0.3)]">
                    抽出外
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-[#EBE7DF]">
                {sortedHouseholds.length === 0 ? (
                  <tr>
                    <td colSpan={listColumns.filter((c) => c.enabled).length + 3} className="p-12 text-center text-[#888888]">
                      条件に一致する檀家世帯が見つかりませんでした。
                    </td>
                  </tr>
                ) : (
                  <>
                    {householdTopSpacerHeight > 0 && (
                      <tr style={{ height: `${householdTopSpacerHeight}px` }} aria-hidden="true">
                        <td
                          colSpan={listColumns.filter((c) => c.enabled).length + 3}
                          style={{ height: `${householdTopSpacerHeight}px`, padding: 0, border: 0 }}
                        />
                      </tr>
                    )}
                    {householdVirtualIndices.map((hIdx) => {
                      const household = sortedHouseholds[hIdx];
                      if (!household) return null;
                      const isSelected = selectedIdsForPrint.includes(household.id);
                      const enabledCols = listColumns.filter((c) => c.enabled);
                      const stickyCellBg = isSelected
                        ? 'bg-[#FEF9EE] group-hover:bg-[#FDF3D8]'
                        : 'bg-white group-hover:bg-[#F9F7F2]';

                      return (
                        <tr
                          key={`household-row-${household.id || hIdx}-${hIdx}`}
                          id={`household-row-${household.id}`}
                          onDoubleClick={() => handleSelectIndividualHousehold(household.id)}
                          className={`transition-colors cursor-pointer group ${
                            isSelected ? 'bg-[#FEF9EE] hover:bg-[#FDF3D8]' : 'hover:bg-[#F9F7F2]'
                          }`}
                          title="ダブルクリックで個別表示へ切り替え"
                        >
                        {/* Checkbox (常時表示・最左・固定) */}
                        <td
                          className={`sticky left-0 z-10 px-2 py-2 text-center w-10 min-w-10 max-w-10 transition-colors ${stickyCellBg}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleSelectOne(household.id);
                          }}
                        >
                          {isSelected ? (
                            <CheckSquare className="w-3.5 h-3.5 text-[#1A1A1A] mx-auto" />
                          ) : (
                            <Square className="w-3.5 h-3.5 text-[#CCCCCC] group-hover:text-[#888888] mx-auto" />
                          )}
                        </td>

                        {/* 施主名 (常時表示・左固定) */}
                        <td className={`sticky left-10 z-10 px-3 py-2 whitespace-nowrap border-r border-[#EBE7DF] shadow-[2px_0_4px_-1px_rgba(0,0,0,0.06)] transition-colors ${stickyCellBg}`}>
                          {(() => {
                            const sponsorInfo = getHouseholdSponsorInfo(household);
                            return (
                              <>
                                {sponsorInfo.furigana && (
                                  <div className="text-[10px] text-[#888888] leading-tight truncate max-w-[160px]">
                                    {sponsorInfo.furigana}
                                  </div>
                                )}
                                <div className="text-sm font-bold text-[#1A1A1A] font-serif leading-tight">
                                  {sponsorInfo.sponsorName || '（施主未登録）'}
                                </div>
                              </>
                            );
                          })()}
                        </td>

                        {/* 動的設定列 */}
                        {enabledCols.map((col) => {
                          switch (col.key) {
                            case 'idTomb':
                              return (
                                <td key="idTomb" className="px-2 py-2 whitespace-nowrap">
                                  <div className="font-mono font-bold text-[#1A1A1A] text-xs leading-tight">
                                    {household.id}
                                  </div>
                                  <div className="text-[10px] text-[#888888] font-serif leading-tight">
                                    {household.tombNumber || '-'}
                                  </div>
                                </td>
                              );
                            case 'familyHeadName':
                              return (
                                <td key="familyHeadName" className="px-2 py-2 whitespace-nowrap">
                                  {household.furigana && (
                                    <div className="text-[10px] text-[#888888] leading-tight truncate max-w-[130px]">
                                      {household.furigana}
                                    </div>
                                  )}
                                  <div className="text-xs font-bold text-[#2D2D2D] font-serif leading-tight">
                                    {household.familyHead || '（世帯主未設定）'}
                                  </div>
                                </td>
                              );
                            case 'district':
                              return (
                                <td key="district" className="px-2 py-1.5 whitespace-nowrap text-[#444444] font-medium text-xs font-sans" onClick={(e) => e.stopPropagation()}>
                                  <select
                                    value={household.district || ''}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      handleTriggerFieldChange(
                                        household,
                                        'district',
                                        val,
                                        '役職',
                                        val || '（未設定）'
                                      );
                                    }}
                                    className="bg-white border border-[#D1CEC7] hover:border-[#1A1A1A] text-xs font-sans px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-[#D4AF37] max-w-[130px] truncate cursor-pointer transition-colors"
                                    title="役職・地区を変更（選択状態の時は一括変更可）"
                                  >
                                    <option value="">- 未設定 -</option>
                                    {districts.map((d) => (
                                      <option key={d} value={d}>
                                        {d}
                                      </option>
                                    ))}
                                  </select>
                                </td>
                              );
                            case 'householdType':
                              return (
                                <td key="householdType" className="px-2 py-1.5 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                                  <select
                                    value={household.householdType || '正檀家'}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      handleTriggerFieldChange(
                                        household,
                                        'householdType',
                                        val,
                                        '区分１',
                                        val
                                      );
                                    }}
                                    className="bg-indigo-50/90 text-indigo-900 border border-indigo-200 hover:border-indigo-400 font-bold text-xs font-sans px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer transition-colors"
                                    title="区分１を変更（選択状態の時は一括変更可）"
                                  >
                                    {householdTypeList.map((ht) => (
                                      <option key={ht} value={ht}>
                                        {ht}
                                      </option>
                                    ))}
                                  </select>
                                </td>
                              );
                            case 'status':
                              return (
                                <td key="status" className="px-2 py-1.5 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                                  <select
                                    value={household.status || ''}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      handleTriggerFieldChange(
                                        household,
                                        'status',
                                        val,
                                        '区分２',
                                        val || '（未設定）'
                                      );
                                    }}
                                    className={`font-bold text-xs font-sans px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer transition-colors border ${
                                      household.status
                                        ? 'bg-emerald-50 text-emerald-900 border-emerald-200 hover:border-emerald-400'
                                        : 'bg-white text-[#888888] border-[#D1CEC7] hover:border-[#1A1A1A]'
                                    }`}
                                    title="区分２を変更（選択状態の時は一括変更可）"
                                  >
                                    <option value="">- 未設定 -</option>
                                    {statusList.map((st) => (
                                      <option key={st} value={st}>
                                        {st}
                                      </option>
                                    ))}
                                  </select>
                                </td>
                              );
                            case 'niibon':
                              return (
                                <td key="niibon" className="px-2 py-2 text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                                  {(() => {
                                    const niibonStatus = getHouseholdNiibonStatus(pastRecords, household.id, templeInfo?.bonSeason || '8月盆');
                                    if (!niibonStatus.hasNiibon) {
                                      return <span className="text-[#AAAAAA] font-sans text-xs">—</span>;
                                    }
                                    return (
                                      <div className="flex flex-col items-center justify-center gap-1">
                                        {niibonStatus.isCurrentYearNiibon && (
                                          <span
                                            className="inline-flex items-center px-1.5 py-0.5 text-[11px] font-bold bg-amber-50 text-amber-900 border border-amber-300 rounded-xs"
                                            title={`本年度新盆対象: ${niibonStatus.currentYearRecords.map(r => `${r.dharmaName || r.secularName || '精霊'} (没:${r.deathDate || '-'})`).join('、')}`}
                                          >
                                            {niibonStatus.currentYearLabel}
                                          </span>
                                        )}
                                        {niibonStatus.isNextYearNiibon && (
                                          <span
                                            className="inline-flex items-center px-1.5 py-0.5 text-[11px] font-bold bg-sky-50 text-sky-900 border border-sky-300 rounded-xs"
                                            title={`来年度新盆対象: ${niibonStatus.nextYearRecords.map(r => `${r.dharmaName || r.secularName || '精霊'} (没:${r.deathDate || '-'})`).join('、')}`}
                                          >
                                            {niibonStatus.nextYearLabel}
                                          </span>
                                        )}
                                      </div>
                                    );
                                  })()}
                                </td>
                              );
                            case 'address':
                              return (
                                <td key="address" className="px-2 py-2 max-w-[120px] sm:max-w-[160px] truncate text-xs text-[#2D2D2D]" title={household.address ? `〒${household.postalCode || ''} ${household.address}` : ''}>
                                  {household.postalCode ? <span className="text-[10px] text-[#777777] font-mono mr-1">〒{household.postalCode}</span> : null}
                                  <span>{household.address || '-'}</span>
                                </td>
                              );
                            case 'phone':
                              return (
                                <td key="phone" className="px-2 py-2 whitespace-nowrap font-mono text-[#2D2D2D] text-xs">
                                  {household.phone || '-'}
                                </td>
                              );
                            case 'mobile':
                              return (
                                <td key="mobile" className="px-2 py-2 whitespace-nowrap font-mono text-[#2D2D2D] text-xs">
                                  {household.mobile || '-'}
                                </td>
                              );
                            case 'toba':
                              return (
                                <td key="toba" className="px-1.5 py-2 text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                                  {(() => {
                                    const hhTemple = temples.find((t) => (t.id || 'temple-main') === (household.templeId || 'temple-main')) || currentActiveTemple;
                                    const sponsorApp = getHouseholdSponsorTobaApplication(household, activeTobaType, hhTemple);
                                    const isSponsorApplied = Boolean(sponsorApp.applied);
                                    const sponsorName = getHouseholdSponsorName(household);
                                    const isHeadApplied = Boolean(getHouseholdTobaApplication(household, activeTobaType, hhTemple).applied);
                                    const memberApps = (household.familyMembers || []).filter(m => getFamilyMemberTobaApplication(m, activeTobaType, hhTemple).applied);
                                    const totalTobaCount = (isHeadApplied ? 1 : 0) + memberApps.length;

                                    return (
                                      <div className="flex items-center justify-center space-x-1">
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const nextVal = !isSponsorApplied;
                                            handleTriggerFieldChange(
                                              household,
                                              'tobaApplication',
                                              nextVal,
                                              activeTobaType,
                                              nextVal ? `${activeTobaType}申込（有）` : '未申込（無）',
                                              activeTobaType
                                            );
                                          }}
                                          className={`px-2 py-1 text-xs font-sans font-bold transition-colors border flex items-center space-x-1 cursor-pointer ${
                                            isSponsorApplied
                                              ? 'bg-[#1A1A1A] text-[#D4AF37] border-[#D4AF37] hover:bg-[#333333]'
                                              : 'bg-white text-[#888888] border-[#D1CEC7] hover:border-[#1A1A1A] hover:text-[#1A1A1A]'
                                          }`}
                                          title={
                                            isSponsorApplied
                                              ? `${activeTobaType}: 申込済（施主: ${sponsorName}${sponsorApp.tamegaki ? ` / 為: ${sponsorApp.tamegaki}` : ''} / クリックで切替）`
                                              : `${activeTobaType}: 未申込（施主: ${sponsorName} / クリックで登録）`
                                          }
                                        >
                                          <span className="font-bold text-xs">{isSponsorApplied ? '✓' : '＋'}</span>
                                          <span>{isSponsorApplied ? '申込済' : '未申込'}</span>
                                        </button>
                                        {((!isSponsorApplied && totalTobaCount > 0) || (isSponsorApplied && totalTobaCount > 1)) && (
                                          <span
                                            className="px-1.5 py-0.5 text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300"
                                            title={
                                              !isSponsorApplied
                                                ? `施主(${sponsorName})は未申込ですが、世帯主または家族が申込中 / 合計${totalTobaCount}本`
                                                : `施主以外にも申込あり / 合計${totalTobaCount}本`
                                            }
                                          >
                                            計{totalTobaCount}本
                                          </span>
                                        )}
                                      </div>
                                    );
                                  })()}
                                </td>
                              );
                            case 'tamegaki':
                              return (
                                <td key="tamegaki" className="px-2 py-2 whitespace-nowrap text-xs max-w-[130px] truncate text-[#444444]" title={getHouseholdSponsorTobaApplication(household, activeTobaType, temples.find((t) => (t.id || 'temple-main') === (household.templeId || 'temple-main')) || currentActiveTemple).tamegaki || ''}>
                                  {getHouseholdSponsorTobaApplication(household, activeTobaType, temples.find((t) => (t.id || 'temple-main') === (household.templeId || 'temple-main')) || currentActiveTemple).tamegaki || '-'}
                                </td>
                              );
                            case 'fee':
                              return (
                                <td key="fee" className="px-1.5 py-2 text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                                  {(() => {
                                    const curAmount = getHouseholdFeeAmount(household, activeFeeType, currentActiveTemple);
                                    return (
                                      <div className="flex items-center justify-center">
                                        <div className="relative flex items-center">
                                          <span className="absolute left-1.5 text-[10px] text-[#888888] font-bold">¥</span>
                                          <input
                                            type="text"
                                            inputMode="numeric"
                                            placeholder="—"
                                            value={curAmount !== undefined ? curAmount : ''}
                                            onChange={(e) => {
                                              const raw = e.target.value.replace(/[^0-9]/g, '');
                                              const num = raw !== '' ? parseInt(raw, 10) : undefined;
                                              const updated = setHouseholdFeeAmount(household, activeFeeType, num, currentActiveTemple);
                                              onEditHousehold(updated);
                                            }}
                                            className="w-20 pl-4 pr-1.5 py-1 text-xs text-right font-mono font-bold bg-white border border-[#D1CEC7] hover:border-[#888888] focus:border-[#D4AF37] focus:bg-[#FAF9F5] focus:outline-none transition-colors"
                                            title={`${household.familyHead} 様: ${activeFeeType} 金額（半角数字）`}
                                          />
                                        </div>
                                      </div>
                                    );
                                  })()}
                                </td>
                              );
                            case 'tanagyo':
                              return (
                                <td key="tanagyo" className="px-1.5 py-2 text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const nextVal = !household.tanagyoMonthlyVisit;
                                      handleTriggerFieldChange(
                                        household,
                                        'tanagyoMonthlyVisit',
                                        nextVal,
                                        '棚経',
                                        nextVal ? '棚経対象（有）' : '対象外（無）'
                                      );
                                    }}
                                    className={`px-2 py-1 text-xs font-sans font-bold transition-colors border flex items-center space-x-1 mx-auto cursor-pointer ${
                                      household.tanagyoMonthlyVisit
                                        ? 'bg-[#2D3748] text-[#ED8936] border-[#ED8936] hover:bg-[#1A202C]'
                                        : 'bg-white text-[#888888] border-[#D1CEC7] hover:border-[#1A1A1A] hover:text-[#1A1A1A]'
                                    }`}
                                    title={household.tanagyoMonthlyVisit ? '棚経: 伺い対象（クリックで切替）' : '棚経: 対象外（クリックで切替）'}
                                  >
                                    <span className="font-bold text-xs">{household.tanagyoMonthlyVisit ? '✓' : '＋'}</span>
                                    <span>{household.tanagyoMonthlyVisit ? '棚経対象' : '対象外'}</span>
                                  </button>
                                </td>
                              );
                            case 'notes':
                              return (
                                <td key="notes" className="px-2 py-2 max-w-[140px] truncate text-xs text-[#555555]" title={household.notes || ''}>
                                  {household.notes || '-'}
                                </td>
                              );
                            case 'pastCount':
                              return (
                                <td key="pastCount" className="px-2 py-2 text-center whitespace-nowrap font-mono text-xs font-bold text-[#2D2D2D]">
                                  {pastRecords.filter((p) => p.householdId === household.id).length}
                                  <span className="text-[10px] text-[#888888] font-normal ml-0.5">柱</span>
                                </td>
                              );
                            case 'accountingCount':
                              return (
                                <td key="accountingCount" className="px-2 py-2 text-center whitespace-nowrap font-mono text-xs font-bold text-[#2D2D2D]">
                                  {(transactions || []).filter((t) => t.householdId === household.id).length}
                                  <span className="text-[10px] text-[#888888] font-normal ml-0.5">件</span>
                                </td>
                              );
                            default:
                              return null;
                          }
                        })}

                        {/* 抽出外 (常時表示・右固定) */}
                        <td
                          className={`sticky right-0 z-10 px-2 py-2 text-center whitespace-nowrap border-l border-[#EBE7DF] shadow-[-2px_0_4px_-1px_rgba(0,0,0,0.06)] transition-colors ${stickyCellBg}`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            onClick={() => toggleExcludeHousehold(household.id)}
                            className={`px-2 py-1 border text-xs font-sans font-bold transition-colors flex items-center space-x-1 mx-auto cursor-pointer ${
                              excludedIds.includes(household.id)
                                ? 'bg-amber-100 hover:bg-amber-200 text-amber-900 border-amber-400'
                                : 'bg-[#F9F7F2] hover:bg-amber-50 text-amber-900 border-[#D1CEC7] hover:border-amber-300'
                            }`}
                            title="この世帯の抽出外設定を切り替えます"
                          >
                            <FilterX className="w-3.5 h-3.5" />
                            <span>{excludedIds.includes(household.id) ? '抽出外中' : '抽出外'}</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {householdBottomSpacerHeight > 0 && (
                    <tr style={{ height: `${householdBottomSpacerHeight}px` }} aria-hidden="true">
                      <td
                        colSpan={listColumns.filter((c) => c.enabled).length + 3}
                        style={{ height: `${householdBottomSpacerHeight}px`, padding: 0, border: 0 }}
                      />
                    </tr>
                  )}
                </>
              )}
            </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VIEW MODE 2: 個別表示 (Individual Household Detail + Past Records) */}
      {viewMode === 'individual' && (
        <div className="flex flex-col flex-1 min-h-0 font-serif space-y-0">
          {/* Individual Navigation Bar */}
          <div className="bg-white border-x border-b border-[#D1CEC7] p-3 sm:p-4 shadow-2xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 shrink-0">
            {/* Back to list & Keyword Search */}
            <div className="flex flex-1 items-center space-x-3">
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className="px-3.5 py-2 bg-[#F9F7F2] hover:bg-[#EBE7DF] border border-[#D1CEC7] text-[#1A1A1A] font-bold text-xs flex items-center space-x-1 font-sans shrink-0 cursor-pointer shadow-xs transition-colors"
                title="リスト一覧へ戻る（現在の検索状態は維持されます）"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>リスト一覧へ戻る</span>
              </button>

              {/* Keyword Search in Individual View */}
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-[#888888]" />
                <input
                  type="text"
                  placeholder="世帯主・ふりがな・役職・住所・電話・墓地番号・IDで検索..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-[#F9F7F2] border border-[#D1CEC7] pl-9 pr-7 py-1.5 text-[#2D2D2D] text-xs focus:border-[#1A1A1A] focus:bg-white focus:outline-none transition-colors font-sans"
                />
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => setSearchTerm('')}
                    className="absolute right-2 top-1.5 text-[#888888] hover:text-[#1A1A1A] text-xs font-bold px-1 cursor-pointer"
                    title="検索をクリア"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            {/* Pagination & Next/Prev Navigation */}
            <div className="flex items-center justify-between md:justify-end space-x-3 font-sans text-xs shrink-0">
              <span className="text-[#888888]">
                {sortedHouseholds.length > 0
                  ? `${currentHouseholdIndex >= 0 ? currentHouseholdIndex + 1 : 1} / ${sortedHouseholds.length} 世帯`
                  : '0 / 0 世帯'}
                {searchTerm && <span className="text-[#B8860B] font-bold ml-1">（検索中）</span>}
              </span>

              <div className="flex space-x-1">
                <button
                  type="button"
                  onClick={handlePrevHousehold}
                  disabled={sortedHouseholds.length <= 1}
                  className="p-1.5 bg-[#F9F7F2] hover:bg-[#EBE7DF] disabled:opacity-40 disabled:cursor-not-allowed border border-[#D1CEC7] text-[#1A1A1A] cursor-pointer"
                  title="前の世帯"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={handleNextHousehold}
                  disabled={sortedHouseholds.length <= 1}
                  className="p-1.5 bg-[#F9F7F2] hover:bg-[#EBE7DF] disabled:opacity-40 disabled:cursor-not-allowed border border-[#D1CEC7] text-[#1A1A1A] cursor-pointer"
                  title="次の世帯"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* 検索結果が0件の場合 */}
          {sortedHouseholds.length === 0 ? (
            <div className="bg-white border-x border-b border-[#D1CEC7] p-12 text-center text-[#888888] font-sans shadow-sm">
              <p className="text-base font-bold text-[#444444] mb-2">検索条件に一致する檀家世帯が見つかりませんでした。</p>
              <p className="text-xs text-[#888888] mb-4">検索キーワード: 「{searchTerm}」</p>
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="px-4 py-2 bg-[#1A1A1A] text-[#D4AF37] border border-[#D4AF37] text-xs font-bold hover:bg-[#333333] cursor-pointer transition-colors shadow-sm"
              >
                検索条件をクリアして全件表示
              </button>
            </div>
          ) : currentIndividualHousehold ? (
            <div ref={individualContentRef} className="bg-white border-x border-b border-[#D1CEC7] shadow-sm overflow-y-auto max-h-[calc(100vh-235px)] min-h-[400px]">
              {/* Header Banner */}
            <div className="bg-[#1A1A1A] text-[#F9F7F2] p-6 border-b border-[#D4AF37] flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="w-full md:w-auto space-y-1">
                <div className="flex flex-wrap items-center gap-2 mb-1 font-sans">
                  <span className="text-xs font-mono bg-[#2A2A2A] text-[#D4AF37] border border-[#D4AF37]/50 px-2 py-0.5">
                    檀家ID: {currentIndividualHousehold.id}
                  </span>
                  {isEditingHouseholdInline && inlineHouseholdForm ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex items-center space-x-1.5 bg-[#2A2A2A] border border-[#D4AF37]/70 px-2 py-0.5">
                        <span className="text-[11px] font-bold text-[#D4AF37]">区分１:</span>
                        <select
                          value={inlineHouseholdForm.householdType || ''}
                          onChange={(e) => setInlineHouseholdForm({ ...inlineHouseholdForm, householdType: e.target.value })}
                          className="bg-transparent text-white text-xs font-bold focus:outline-none cursor-pointer"
                        >
                          <option value="" className="bg-[#2A2A2A] text-gray-300">（未設定・空欄）</option>
                          {householdTypeList.map((t) => (
                            <option key={t} value={t} className="bg-[#2A2A2A] text-white">{t}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex items-center space-x-1.5 bg-[#2A2A2A] border border-[#D4AF37]/70 px-2 py-0.5">
                        <span className="text-[11px] font-bold text-emerald-400">区分２:</span>
                        <select
                          value={inlineHouseholdForm.status || ''}
                          onChange={(e) => setInlineHouseholdForm({ ...inlineHouseholdForm, status: e.target.value })}
                          className="bg-transparent text-white text-xs font-bold focus:outline-none cursor-pointer"
                        >
                          <option value="" className="bg-[#2A2A2A] text-gray-300">（未設定・空欄）</option>
                          {statusList.map((s) => (
                            <option key={s} value={s} className="bg-[#2A2A2A] text-white">{s}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ) : (
                    <>
                      <span className="text-xs font-bold text-white bg-[#333333] px-2 py-0.5">
                        区分１: {currentIndividualHousehold.householdType}
                      </span>
                      {currentIndividualHousehold.status && (
                        <span className="text-xs font-bold text-emerald-300 bg-emerald-900/60 px-2 py-0.5">
                          区分２: {currentIndividualHousehold.status}
                        </span>
                      )}
                      {(() => {
                        const isSegakiChecked = isHouseholdSponsorSegakiToba(currentIndividualHousehold);
                        const sponsorName = getHouseholdSponsorName(currentIndividualHousehold);
                        return (
                          <button
                            type="button"
                            onClick={() => {
                              const updated = toggleHouseholdSponsorSegakiToba(currentIndividualHousehold);
                              onEditHousehold(updated);
                            }}
                            className={`text-xs font-bold px-2.5 py-0.5 border transition-colors flex items-center space-x-1 cursor-pointer ${
                              isSegakiChecked
                                ? 'bg-[#D4AF37] text-[#1A1A1A] border-[#D4AF37] hover:bg-[#c29f2f]'
                                : 'bg-[#2A2A2A] text-[#CCCCCC] border-[#555555] hover:text-white hover:border-[#888888]'
                            }`}
                            title="クリックで施主の施餓鬼塔婆申込を登録/解除"
                          >
                            <span className="font-bold">{isSegakiChecked ? '✓' : '＋'}</span>
                            <span>{isSegakiChecked ? `施主(${sponsorName}) 塔婆: 申込済` : `施主(${sponsorName}) 塔婆: 未申込`}</span>
                          </button>
                        );
                      })()}
                      <span className="text-[11px] font-sans text-[#D4AF37] bg-[#2A2A2A] px-2 py-0.5 border border-[#D4AF37]/30">
                        💡 ダブルクリックで見たまま編集
                      </span>
                    </>
                  )}
                </div>

                {isEditingHouseholdInline && inlineHouseholdForm ? (
                  <div className="space-y-1 pt-1">
                    <input
                      type="text"
                      value={inlineHouseholdForm.furigana}
                      onChange={(e) => setInlineHouseholdForm({ ...inlineHouseholdForm, furigana: e.target.value })}
                      placeholder="フリガナ"
                      className="bg-[#2A2A2A] text-white border border-[#555] px-2 py-1 text-xs w-full max-w-sm"
                    />
                    <div className="flex items-center space-x-2">
                      <input
                        type="text"
                        value={inlineHouseholdForm.familyHead}
                        onChange={(e) => setInlineHouseholdForm({ ...inlineHouseholdForm, familyHead: e.target.value })}
                        placeholder="世帯主名"
                        className="bg-white text-[#1A1A1A] border border-[#D4AF37] px-3 py-1 font-bold text-lg w-full max-w-sm"
                      />
                      <span className="text-[#CCCCCC]">様</span>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="text-xs text-[#CCCCCC] font-sans tracking-wide">{currentIndividualHousehold.furigana}</div>
                    <h1
                      onDoubleClick={handleStartInlineHouseholdEdit}
                      className="text-2xl sm:text-3xl font-bold text-[#F9F7F2] mt-1 cursor-pointer hover:opacity-80"
                      title="ダブルクリックで直接編集"
                    >
                      {currentIndividualHousehold.familyHead} <span className="text-base font-normal text-[#CCCCCC]">様</span>
                    </h1>
                  </>
                )}
              </div>

              {/* Top Quick Actions */}
              <div className="flex flex-wrap items-center gap-2 font-sans text-xs">
                {isEditingHouseholdInline ? (
                  <div className="flex space-x-2">
                    <button
                      onClick={handleSaveInlineHousehold}
                      className="px-3.5 py-2 bg-[#D4AF37] hover:bg-[#c29f2f] text-[#1A1A1A] font-bold transition-colors flex items-center space-x-1.5 shadow-sm"
                      title="世帯情報を保存"
                    >
                      <Save className="w-4 h-4" />
                      <span>保存する</span>
                    </button>
                    <button
                      onClick={handleCancelInlineHousehold}
                      className="px-3.5 py-2 bg-[#2A2A2A] hover:bg-[#333333] text-[#F9F7F2] border border-[#555555] font-bold transition-colors"
                    >
                      <span>キャンセル</span>
                    </button>
                  </div>
                ) : (
                  <>
                    <button
                      onClick={handleStartInlineHouseholdEdit}
                      className="px-3.5 py-2 bg-[#D4AF37] hover:bg-[#c29f2f] text-[#1A1A1A] font-bold transition-colors flex items-center space-x-1.5 shadow-sm"
                      title="世帯情報を直接編集"
                    >
                      <Edit className="w-4 h-4" />
                      <span>世帯情報を編集</span>
                    </button>
                    <button
                      onClick={() => setDeleteTargetHousehold(currentIndividualHousehold)}
                      className="px-3.5 py-2 bg-rose-950/80 hover:bg-rose-900 text-rose-100 border border-rose-700 font-bold transition-colors flex items-center space-x-1.5"
                      title="この檀家世帯を削除します"
                    >
                      <Trash2 className="w-4 h-4 text-rose-300" />
                      <span>世帯を削除</span>
                    </button>

                    <button
                      onClick={() => setActiveQrModalHousehold(currentIndividualHousehold)}
                      className="px-3.5 py-2 bg-[#2A2A2A] hover:bg-[#333333] text-[#F9F7F2] border border-[#555555] font-bold transition-colors flex items-center space-x-1.5"
                    >
                      <QrCode className="w-4 h-4 text-[#D4AF37]" />
                      <span>受付QRコード</span>
                    </button>

                    <button
                      onClick={() => {
                        setSelectedIdsForPrint([currentIndividualHousehold.id]);
                        onNavigateToPrint();
                      }}
                      className="px-3.5 py-2 bg-[#D4AF37] hover:bg-[#c29f2f] text-[#1A1A1A] font-bold transition-colors flex items-center space-x-1.5"
                    >
                      <Printer className="w-4 h-4" />
                      <span>封筒・はがき印刷へ</span>
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Individual Household Information Grid (In-place direct view/edit) */}
            <div
              onDoubleClick={handleStartInlineHouseholdEdit}
              className={`p-6 grid grid-cols-1 md:grid-cols-3 gap-6 text-xs font-sans text-[#2D2D2D] border-b border-[#F0EFEA] transition-colors ${
                isEditingHouseholdInline ? 'bg-[#FAF9F5]' : 'cursor-pointer hover:bg-[#FAF9F5]'
              }`}
              title="ダブルクリックで見たまま世帯情報を編集"
            >
              <div className="space-y-2">
                <h3 className="font-serif font-bold text-[#1A1A1A] text-sm border-b border-[#D1CEC7] pb-1 flex items-center space-x-1">
                  <MapPin className="w-4 h-4 text-[#888888]" />
                  <span>所在地・連絡先</span>
                </h3>

                {isEditingHouseholdInline && inlineHouseholdForm ? (
                  <div className="space-y-2">
                    <div>
                      <label className="block text-[#888888] font-bold mb-0.5">郵便番号</label>
                      <input
                        type="text"
                        value={inlineHouseholdForm.postalCode}
                        onChange={(e) => setInlineHouseholdForm({ ...inlineHouseholdForm, postalCode: e.target.value })}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleSaveInlineHousehold(); }}
                        className="bg-white border border-[#1A1A1A] p-1.5 text-xs w-full font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[#888888] font-bold mb-0.5">住所</label>
                      <input
                        type="text"
                        value={inlineHouseholdForm.address}
                        onChange={(e) => setInlineHouseholdForm({ ...inlineHouseholdForm, address: e.target.value })}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleSaveInlineHousehold(); }}
                        className="bg-white border border-[#1A1A1A] p-1.5 text-xs w-full"
                      />
                    </div>
                    <div>
                      <label className="block text-[#888888] font-bold mb-0.5">固定電話</label>
                      <input
                        type="text"
                        value={inlineHouseholdForm.phone}
                        onChange={(e) => setInlineHouseholdForm({ ...inlineHouseholdForm, phone: e.target.value })}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleSaveInlineHousehold(); }}
                        className="bg-white border border-[#1A1A1A] p-1.5 text-xs w-full font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[#888888] font-bold mb-0.5">携帯電話</label>
                      <input
                        type="text"
                        value={inlineHouseholdForm.mobile || ''}
                        onChange={(e) => setInlineHouseholdForm({ ...inlineHouseholdForm, mobile: e.target.value })}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleSaveInlineHousehold(); }}
                        className="bg-white border border-[#1A1A1A] p-1.5 text-xs w-full font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[#888888] font-bold mb-0.5">メール</label>
                      <input
                        type="text"
                        value={inlineHouseholdForm.email || ''}
                        onChange={(e) => setInlineHouseholdForm({ ...inlineHouseholdForm, email: e.target.value })}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleSaveInlineHousehold(); }}
                        className="bg-white border border-[#1A1A1A] p-1.5 text-xs w-full"
                      />
                    </div>
                  </div>
                ) : (
                  <>
                    <div>
                      <span className="text-[#888888]">郵便番号:</span> 〒{currentIndividualHousehold.postalCode || '未登録'}
                    </div>
                    <div>
                      <span className="text-[#888888]">住所:</span> {currentIndividualHousehold.address || '未登録'}
                    </div>
                    <div>
                      <span className="text-[#888888]">固定電話:</span> <span className="font-mono">{currentIndividualHousehold.phone || '未登録'}</span>
                    </div>
                    <div>
                      <span className="text-[#888888]">携帯電話:</span> <span className="font-mono">{currentIndividualHousehold.mobile || '未登録'}</span>
                    </div>
                    <div>
                      <span className="text-[#888888]">メール:</span> {currentIndividualHousehold.email || '未登録'}
                    </div>
                  </>
                )}
              </div>

              <div className="space-y-2">
                <h3 className="font-serif font-bold text-[#1A1A1A] text-sm border-b border-[#D1CEC7] pb-1 flex items-center space-x-1">
                  <Home className="w-4 h-4 text-[#888888]" />
                  <span>寺院管理情報</span>
                </h3>

                {isEditingHouseholdInline && inlineHouseholdForm ? (
                  <div className="space-y-2">
                    <div>
                      <label className="block text-[#888888] font-bold mb-0.5">役職</label>
                      <input
                        type="text"
                        list="household-district-options"
                        value={inlineHouseholdForm.district}
                        onChange={(e) => setInlineHouseholdForm({ ...inlineHouseholdForm, district: e.target.value })}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleSaveInlineHousehold(); }}
                        className="bg-white border border-[#1A1A1A] p-1.5 text-xs w-full font-bold"
                        placeholder="例: 総代, 世話人, 役員"
                      />
                      <datalist id="household-district-options">
                        {districts.map((d) => (
                          <option key={d} value={d} />
                        ))}
                      </datalist>
                    </div>
                    <div>
                      <label className="block text-[#888888] font-bold mb-0.5">墓地・納骨堂位置</label>
                      <input
                        type="text"
                        value={inlineHouseholdForm.tombNumber || ''}
                        onChange={(e) => setInlineHouseholdForm({ ...inlineHouseholdForm, tombNumber: e.target.value })}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleSaveInlineHousehold(); }}
                        className="bg-white border border-[#1A1A1A] p-1.5 text-xs w-full font-serif"
                      />
                    </div>

                    <div className="pt-2 border-t border-[#D1CEC7] space-y-2">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="block text-[11px] font-bold text-[#1A1A1A]">
                            塔婆申込・為書き設定（世帯主）:
                          </label>
                          <span className="text-[10px] text-[#777777]">
                            ※設定された塔婆枠のみ表示
                          </span>
                        </div>
                        {individualTobaSlots.map((slot) => {
                          const tobaType = slot.name;
                          const app = getHouseholdTobaApplication(inlineHouseholdForm, tobaType, individualHouseholdTemple);
                          return (
                            <div key={slot.slot} className="p-2 bg-white border border-[#D1CEC7] space-y-1.5">
                              <label className="flex items-center space-x-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={!!app.applied}
                                  onChange={(e) => {
                                    const updated = setHouseholdTobaApplication(
                                      inlineHouseholdForm,
                                      tobaType,
                                      e.target.checked,
                                      app.tamegaki,
                                      individualHouseholdTemple
                                    );
                                    setInlineHouseholdForm(updated);
                                  }}
                                  className="w-4 h-4 accent-[#1A1A1A]"
                                />
                                <span className="font-bold text-xs text-[#1A1A1A]">
                                  {tobaType} 申込
                                </span>
                              </label>
                              {app.applied && (
                                <div className="pl-6 pt-1">
                                  <label className="block text-[10px] font-bold text-amber-950 mb-0.5">
                                    為書き (回向対象):
                                  </label>
                                  <input
                                    type="text"
                                    placeholder="例: 〇〇家先祖代々精霊、為 亡父〇〇"
                                    value={app.tamegaki || ''}
                                    onChange={(e) => {
                                      const updated = setHouseholdTobaApplication(
                                        inlineHouseholdForm,
                                        tobaType,
                                        true,
                                        e.target.value,
                                        individualHouseholdTemple
                                      );
                                      setInlineHouseholdForm(updated);
                                    }}
                                    className="w-full bg-[#FAF9F5] border border-[#1A1A1A] p-1.5 text-xs text-[#1A1A1A] font-serif"
                                  />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* 個別集金・徴収費（設定がある場合のみ表示） */}
                      {individualFeeSlots.length > 0 && (
                        <div className="space-y-2 pt-1">
                          <div className="flex items-center justify-between">
                            <label className="block text-[11px] font-bold text-[#1A1A1A] flex items-center space-x-1">
                              <Coins className="w-3.5 h-3.5 text-[#D4AF37]" />
                              <span>個別集金・徴収費設定:</span>
                            </label>
                            <span className="text-[10px] text-[#777777]">
                              ※寺院情報で設定された項目のみ
                            </span>
                          </div>
                          {individualFeeSlots.map((slot) => {
                            const feeType = slot.name;
                            const amount = getHouseholdFeeAmount(inlineHouseholdForm, feeType, individualHouseholdTemple);
                            return (
                              <div key={slot.slot} className="p-2 bg-white border border-[#D1CEC7] flex items-center justify-between gap-2">
                                <label className="text-xs font-bold text-[#1A1A1A] shrink-0">
                                  {feeType}:
                                </label>
                                <div className="relative flex items-center">
                                  <span className="absolute left-2 text-xs text-[#888888] font-bold">¥</span>
                                  <input
                                    type="text"
                                    inputMode="numeric"
                                    placeholder="金額未設定"
                                    value={amount !== undefined ? amount : ''}
                                    onChange={(e) => {
                                      const raw = e.target.value.replace(/[^0-9]/g, '');
                                      const num = raw !== '' ? parseInt(raw, 10) : undefined;
                                      const updated = setHouseholdFeeAmount(inlineHouseholdForm, feeType, num, individualHouseholdTemple);
                                      setInlineHouseholdForm(updated);
                                    }}
                                    className="w-32 pl-5 pr-2 py-1 text-xs text-right font-mono font-bold bg-[#FAF9F5] border border-[#1A1A1A] focus:border-[#D4AF37] focus:outline-none"
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      <div className="space-y-2 p-2.5 bg-[#F9F7F2] border border-[#D1CEC7]">
                        <label className="flex items-center space-x-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={!!inlineHouseholdForm.tanagyoMonthlyVisit}
                            onChange={(e) => setInlineHouseholdForm({ ...inlineHouseholdForm, tanagyoMonthlyVisit: e.target.checked })}
                            className="w-4 h-4 accent-[#1A1A1A]"
                          />
                          <span className="font-bold text-xs text-[#1A1A1A]">棚経 / 月参り 伺い対象</span>
                        </label>
                        {inlineHouseholdForm.tanagyoMonthlyVisit && (
                          <div className="space-y-2 pt-1 border-t border-[#D1CEC7]/60">
                            <div className="grid grid-cols-3 gap-1.5">
                              {/* 訪問日 (例: 8/14) */}
                              <div>
                                <label className="block text-[10px] font-bold text-[#555555] mb-0.5">訪問日</label>
                                <input
                                  type="text"
                                  placeholder="例: 8/14"
                                  value={inlineHouseholdForm.tanagyoDate || ''}
                                  onChange={(e) => setInlineHouseholdForm({ ...inlineHouseholdForm, tanagyoDate: e.target.value })}
                                  className="w-full bg-white border border-[#D1CEC7] p-1.5 text-xs font-bold text-[#1A1A1A] font-mono"
                                />
                              </div>

                              {/* 午前/午後 */}
                              <div>
                                <label className="block text-[10px] font-bold text-[#555555] mb-0.5">時間帯</label>
                                <select
                                  value={inlineHouseholdForm.tanagyoTimeSlot || '午前'}
                                  onChange={(e) => setInlineHouseholdForm({ ...inlineHouseholdForm, tanagyoTimeSlot: e.target.value as any })}
                                  className="w-full bg-white border border-[#D1CEC7] p-1.5 text-xs font-bold text-[#1A1A1A]"
                                >
                                  <option value="午前">午前</option>
                                  <option value="午後">午後</option>
                                  <option value="時間未定">時間未定</option>
                                </select>
                              </div>

                              {/* 担当僧侶 */}
                              <div>
                                <label className="block text-[10px] font-bold text-[#555555] mb-0.5">担当僧侶</label>
                                <select
                                  value={inlineHouseholdForm.tanagyoPriestId || ''}
                                  onChange={(e) => {
                                    const pId = e.target.value;
                                    const selectedPriest = priests.find((p) => p.id === pId);
                                    setInlineHouseholdForm({
                                      ...inlineHouseholdForm,
                                      tanagyoPriestId: pId,
                                      tanagyoPriestName: selectedPriest?.name || (pId ? pId : ''),
                                    });
                                  }}
                                  className="w-full bg-white border border-[#D1CEC7] p-1.5 text-xs font-bold text-[#1A1A1A]"
                                >
                                  <option value="">- 未設定 -</option>
                                  {priests.map((p) => (
                                    <option key={p.id} value={p.id}>
                                      {p.name} {p.role ? `(${p.role})` : ''}
                                    </option>
                                  ))}
                                  {templeInfo?.chiefPriest && !priests.some((p) => p.name === templeInfo.chiefPriest) && (
                                    <option value={templeInfo.chiefPriest}>
                                      {templeInfo.chiefPriest} (住職)
                                    </option>
                                  )}
                                </select>
                              </div>
                            </div>

                            {/* 伺い先住所 */}
                            <div>
                              <label className="block text-[10px] font-bold text-[#555555] mb-0.5">伺い先住所</label>
                              <input
                                type="text"
                                placeholder="空欄時は世帯住所を適用"
                                value={inlineHouseholdForm.tanagyoAddress || ''}
                                onChange={(e) => setInlineHouseholdForm({ ...inlineHouseholdForm, tanagyoAddress: e.target.value })}
                                className="w-full bg-white border border-[#D1CEC7] p-1.5 text-xs text-[#1A1A1A]"
                              />
                            </div>

                            {/* 訪問特記メモ & 順序 */}
                            <div className="grid grid-cols-4 gap-1.5">
                              <div className="col-span-3">
                                <label className="block text-[10px] font-bold text-[#555555] mb-0.5">棚経訪問特記</label>
                                <input
                                  type="text"
                                  placeholder="例: 10時半希望、新盆のため仏壇前"
                                  value={inlineHouseholdForm.tanagyoNotes || ''}
                                  onChange={(e) => setInlineHouseholdForm({ ...inlineHouseholdForm, tanagyoNotes: e.target.value })}
                                  className="w-full bg-white border border-[#D1CEC7] p-1.5 text-xs text-[#1A1A1A]"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-bold text-[#555555] mb-0.5">巡回順序</label>
                                <input
                                  type="number"
                                  placeholder="番号"
                                  value={inlineHouseholdForm.tanagyoOrder ?? ''}
                                  onChange={(e) => setInlineHouseholdForm({ ...inlineHouseholdForm, tanagyoOrder: e.target.value ? Number(e.target.value) : undefined })}
                                  className="w-full bg-white border border-[#D1CEC7] p-1.5 text-xs text-[#1A1A1A] font-mono text-center"
                                />
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div>
                      <span className="text-[#888888]">役職:</span> <strong>{currentIndividualHousehold.district || '-'}</strong>
                    </div>
                    <div>
                      <span className="text-[#888888]">墓地・納骨堂位置:</span> <strong className="font-serif text-sm text-[#1A1A1A]">{currentIndividualHousehold.tombNumber || '未登録'}</strong>
                    </div>
                    <div>
                      <span className="text-[#888888]">登録日:</span> {formatJapaneseEraDate(currentIndividualHousehold.createdAt || '', false)}
                    </div>
                    {/* 塔婆申込 & 棚経/月参り 表示 */}
                    <div className="pt-2 border-t border-[#EBE7DF] space-y-2 font-sans">
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[#888888] font-bold text-xs block">塔婆申込状況（施主・世帯主）:</span>
                          <span className="text-[10px] text-[#777777]">※設定枠のみ</span>
                        </div>
                        {individualTobaSlots.map((slot) => {
                          const tobaType = slot.name;
                          const app = getHouseholdSponsorTobaApplication(currentIndividualHousehold, tobaType, individualHouseholdTemple);
                          const isApplied = Boolean(app.applied);
                          const sponsorName = getHouseholdSponsorName(currentIndividualHousehold);
                          const tamegaki = app.tamegaki || '';

                          return (
                            <div key={slot.slot} className="bg-white p-1.5 border border-[#EBE7DF] space-y-1">
                              <div className="flex items-center justify-between">
                                <span className="text-[#1A1A1A] font-bold text-xs">
                                  {tobaType}:
                                </span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const nextVal = !isApplied;
                                    const updated = setHouseholdSponsorTobaApplication(
                                      currentIndividualHousehold,
                                      tobaType,
                                      nextVal,
                                      tamegaki,
                                      individualHouseholdTemple
                                    );
                                    onEditHousehold(updated);
                                  }}
                                  className={`px-2 py-0.5 text-xs font-bold border transition-colors flex items-center space-x-1 cursor-pointer ${
                                    isApplied
                                      ? 'bg-[#1A1A1A] text-[#D4AF37] border-[#D4AF37] hover:bg-[#333333]'
                                      : 'bg-white text-[#666666] border-[#D1CEC7] hover:border-[#1A1A1A] hover:text-[#1A1A1A]'
                                  }`}
                                  title={`クリックで${tobaType}申込を登録/解除`}
                                >
                                  <span className="font-bold">{isApplied ? '✓' : '＋'}</span>
                                  <span>{isApplied ? `申込済（${sponsorName}）` : '未申込'}</span>
                                </button>
                              </div>
                              {isApplied && (
                                <div className="text-[11px] bg-amber-50/80 border border-amber-200 px-2 py-0.5 flex items-center justify-between">
                                  <span className="text-[#666666] font-bold">為書き:</span>
                                  <span className="font-serif font-bold text-[#1A1A1A]">
                                    {tamegaki ? `為 ${tamegaki}` : '（為書き未登録・先祖代々等）'}
                                  </span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* 個別集金・徴収費 表示（設定がある場合のみ表示） */}
                      {individualFeeSlots.length > 0 && (
                        <div className="space-y-1.5 pt-1 border-t border-[#EBE7DF]">
                          <div className="flex items-center justify-between">
                            <span className="text-[#888888] font-bold text-xs flex items-center space-x-1">
                              <Coins className="w-3.5 h-3.5 text-[#D4AF37]" />
                              <span>個別集金・徴収費:</span>
                            </span>
                            <span className="text-[10px] text-[#777777]">※設定枠のみ</span>
                          </div>
                          {individualFeeSlots.map((slot) => {
                            const feeType = slot.name;
                            const amount = getHouseholdFeeAmount(currentIndividualHousehold, feeType, individualHouseholdTemple);
                            return (
                              <div key={slot.slot} className="bg-white p-1.5 border border-[#EBE7DF] flex items-center justify-between">
                                <span className="text-[#1A1A1A] font-bold text-xs">{feeType}:</span>
                                <span className="font-mono font-bold text-xs text-[#1A1A1A]">
                                  {amount !== undefined ? formatFeeAmount(amount) : <span className="text-[#AAAAAA] font-normal">未設定</span>}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      <div className="space-y-1 bg-[#F9F7F2] p-2 border border-[#EBE7DF]">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-1.5">
                            <span className="text-[#888888] font-bold text-xs">棚経/月参り:</span>
                            {currentIndividualHousehold.tanagyoMonthlyVisit ? (
                              <span className="px-2 py-0.5 bg-emerald-900 text-emerald-100 font-bold text-[10px]">
                                ✓ 伺い対象
                              </span>
                            ) : (
                              <span className="text-[#888888] text-[11px]">対象外</span>
                            )}
                          </div>
                          {currentIndividualHousehold.tanagyoMonthlyVisit && (
                            <span className="text-[11px] font-bold font-mono text-[#D4AF37] bg-[#1A1A1A] px-1.5 py-0.5">
                              {currentIndividualHousehold.tanagyoDate || '日程未定'} {currentIndividualHousehold.tanagyoTimeSlot || ''}
                            </span>
                          )}
                        </div>
                        {currentIndividualHousehold.tanagyoMonthlyVisit && (
                          <div className="text-[11px] text-[#444444] space-y-0.5 pt-1 border-t border-[#D1CEC7]/40">
                            <div className="flex items-center justify-between">
                              <span>担当: <strong className="text-[#1A1A1A]">{currentIndividualHousehold.tanagyoPriestName || '未割当'}</strong></span>
                              {currentIndividualHousehold.tanagyoOrder && (
                                <span className="font-mono text-[10px] text-[#666666]">巡回順: No.{currentIndividualHousehold.tanagyoOrder}</span>
                              )}
                            </div>
                            <div className="text-[10px] text-[#666666] truncate">
                              伺い先: {currentIndividualHousehold.tanagyoAddress || currentIndividualHousehold.address || '世帯住所'}
                            </div>
                            {currentIndividualHousehold.tanagyoNotes && (
                              <div className="text-[10px] text-amber-800 bg-amber-50 px-1 py-0.5 border border-amber-200">
                                特記: {currentIndividualHousehold.tanagyoNotes}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div className="space-y-2 md:col-span-1">
                <h3 className="font-serif font-bold text-[#1A1A1A] text-sm border-b border-[#D1CEC7] pb-1">
                  寺院備考・伝達事項
                </h3>
                {isEditingHouseholdInline && inlineHouseholdForm ? (
                  <textarea
                    value={inlineHouseholdForm.notes || ''}
                    onChange={(e) => setInlineHouseholdForm({ ...inlineHouseholdForm, notes: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSaveInlineHousehold();
                      }
                    }}
                    rows={4}
                    placeholder="寺院備考・メモ事項を入力（Enterキーで保存、Shift+Enterで改行）"
                    className="w-full bg-white border border-[#1A1A1A] p-2 text-xs leading-relaxed"
                  />
                ) : (
                  <div className="bg-[#F9F7F2] p-3 border border-[#EBE7DF] text-[#444444] min-h-[80px] leading-relaxed whitespace-pre-wrap">
                    {currentIndividualHousehold.notes || '備考事項はありません。'}
                  </div>
                )}
              </div>
            </div>

            {/* FAMILY MEMBERS SECTION (家族構成) */}
            <div className="p-6 border-b border-[#F0EFEA] bg-[#F9F7F2]">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center space-x-2">
                  <h3 className="font-serif font-bold text-[#1A1A1A] text-base flex items-center space-x-2">
                    <Users className="w-4 h-4 text-[#D4AF37]" />
                    <span>家族構成 ({currentIndividualHousehold.familyMembers?.length || 0}名)</span>
                  </h3>
                  <span className="text-[11px] text-[#666666] font-sans">
                    （ふりがな・個別住所・施餓鬼塔婆チェック対応）
                  </span>
                </div>

                {!isEditingFamilyInline ? (
                  <button
                    onClick={handleStartInlineFamilyEdit}
                    className="px-3 py-1 bg-[#1A1A1A] hover:bg-[#333333] text-[#D4AF37] font-bold text-xs flex items-center space-x-1.5 transition-colors shadow-sm"
                    title="家族構成情報を直接編集"
                  >
                    <Edit className="w-3.5 h-3.5" />
                    <span>家族構成を編集</span>
                  </button>
                ) : (
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={handleAddInlineFamilyMember}
                      className="px-3 py-1 bg-white border border-[#1A1A1A] hover:bg-[#EBE7DF] text-[#1A1A1A] font-bold text-xs flex items-center space-x-1 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>+ 家族を追加</span>
                    </button>
                    <button
                      onClick={handleSaveInlineFamilyMembers}
                      className="px-3 py-1 bg-[#D4AF37] hover:bg-[#c29f2f] text-[#1A1A1A] font-bold text-xs flex items-center space-x-1 transition-colors shadow-sm"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>保存</span>
                    </button>
                    <button
                      onClick={() => setIsEditingFamilyInline(false)}
                      className="px-2.5 py-1 bg-[#2A2A2A] hover:bg-[#333333] text-white font-bold text-xs border border-[#555] transition-colors"
                    >
                      <span>キャンセル</span>
                    </button>
                  </div>
                )}
              </div>

              {!isEditingFamilyInline ? (
                (!currentIndividualHousehold.familyMembers || currentIndividualHousehold.familyMembers.length === 0) ? (
                  <div
                    onDoubleClick={handleStartInlineFamilyEdit}
                    className="text-xs text-[#888888] font-sans italic cursor-pointer hover:bg-white p-2 border border-dashed border-transparent hover:border-[#D1CEC7]"
                  >
                    家族構成情報は未登録です。「家族構成を編集」ボタンまたはダブルクリックで家族を追加・編集できます。
                  </div>
                ) : (
                  <div
                    onDoubleClick={handleStartInlineFamilyEdit}
                    className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 font-sans text-xs cursor-pointer"
                    title="ダブルクリックで直接編集"
                  >
                    {currentIndividualHousehold.familyMembers.map((member, i) => {
                      const appliedTobaList = individualTobaSlots
                        .map((slot) => ({ 
                          slot, 
                          type: slot.name, 
                          app: getFamilyMemberTobaApplication(member, slot.name, individualHouseholdTemple) 
                        }))
                        .filter((item) => item.app.applied);

                      return (
                        <div key={`ind-fm-${member.id || i}-${i}`} className={`bg-white border p-3 space-y-1.5 transition-colors ${member.isChiefMourner || member.isSponsor ? 'border-[#8C2D19] bg-[#FFFDF0]/60 ring-1 ring-[#8C2D19]/30' : 'border-[#D1CEC7] hover:border-[#1A1A1A]'}`}>
                          <div className="flex justify-between items-start">
                            <div>
                              {member.furigana && (
                                <div className="text-[10px] text-[#888888]">{member.furigana}</div>
                              )}
                              <div className="font-bold text-[#1A1A1A] text-sm flex items-center space-x-1.5">
                                <span>{member.name}</span>
                                {(member.isChiefMourner || member.isSponsor) && (
                                  <span className="text-[9px] bg-[#8C2D19] text-white px-1.5 py-0.5 font-bold shadow-xs">
                                    ★ 施主
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center space-x-1">
                              <span className="text-[10px] bg-[#1A1A1A] text-[#D4AF37] px-2 py-0.5 font-bold">
                                {member.relationship}
                              </span>
                            </div>
                          </div>

                          {/* 塔婆申込バッジ & 為書き表示 */}
                          {appliedTobaList.length > 0 && (
                            <div className="space-y-1 pt-1 border-t border-[#F0ECE1]">
                              {appliedTobaList.map(({ slot, type, app }) => (
                                <div key={slot.slot} className="text-[11px] bg-amber-50/80 border border-amber-200 px-1.5 py-0.5 space-y-0.5">
                                  <div className="flex items-center justify-between font-bold text-amber-950">
                                    <span>{type}</span>
                                    <span className="text-[10px] text-amber-800">申込済</span>
                                  </div>
                                  {app.tamegaki && (
                                    <div className="font-serif text-[#1A1A1A]">
                                      為 {app.tamegaki}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}

                          {member.phone && <div className="text-[#666666] font-mono text-[11px]">TEL: {member.phone}</div>}
                          {member.address && <div className="text-[#666666] text-[11px] truncate">住所: {member.address}</div>}
                        </div>
                      );
                    })}
                  </div>
                )
              ) : (
                <div className="space-y-2 font-sans text-xs">
                  {inlineFamilyMembers.length === 0 ? (
                    <div className="p-4 bg-white border border-[#D1CEC7] text-[#888888] italic text-center">
                      家族が登録されていません。上の「+ 家族を追加」ボタンで入力行を追加できます。
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {inlineFamilyMembers.map((member, idx) => (
                        <div key={`inline-fm-${member.id || idx}-${idx}`} className={`bg-white border p-3 space-y-2 shadow-sm ${member.isChiefMourner || member.isSponsor ? 'border-[#8C2D19] ring-1 ring-[#8C2D19]/40' : 'border-[#1A1A1A]'}`}>
                          <div className="flex items-center space-x-2">
                            <input
                              type="text"
                              placeholder="氏名（例: 山田 太郎）"
                              value={member.name}
                              onChange={(e) => {
                                const updated = [...inlineFamilyMembers];
                                updated[idx] = { ...updated[idx], name: e.target.value };
                                setInlineFamilyMembers(updated);
                              }}
                              className="bg-[#F9F7F2] border border-[#D1CEC7] p-1.5 text-xs text-[#1A1A1A] font-bold w-full focus:border-[#1A1A1A] focus:outline-none"
                            />
                            <input
                              type="text"
                              placeholder="ふりがな"
                              value={member.furigana || ''}
                              onChange={(e) => {
                                const updated = [...inlineFamilyMembers];
                                updated[idx] = { ...updated[idx], furigana: e.target.value };
                                setInlineFamilyMembers(updated);
                              }}
                              className="bg-[#F9F7F2] border border-[#D1CEC7] p-1.5 text-xs text-[#1A1A1A] w-28 focus:border-[#1A1A1A] focus:outline-none"
                            />
                            <input
                              type="text"
                              placeholder="続柄"
                              value={member.relationship}
                              onChange={(e) => {
                                const updated = [...inlineFamilyMembers];
                                updated[idx] = { ...updated[idx], relationship: e.target.value };
                                setInlineFamilyMembers(updated);
                              }}
                              className="bg-[#F9F7F2] border border-[#D1CEC7] p-1.5 text-xs text-[#1A1A1A] font-bold w-20 focus:border-[#1A1A1A] focus:outline-none"
                            />
                          </div>
                          <div className="flex items-center space-x-2">
                            <input
                              type="text"
                              placeholder="電話番号"
                              value={member.phone || ''}
                              onChange={(e) => {
                                const updated = [...inlineFamilyMembers];
                                updated[idx] = { ...updated[idx], phone: e.target.value };
                                setInlineFamilyMembers(updated);
                              }}
                              className="bg-[#F9F7F2] border border-[#D1CEC7] p-1.5 text-xs font-mono text-[#1A1A1A] w-full focus:border-[#1A1A1A] focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                setInlineFamilyMembers(inlineFamilyMembers.filter((_, i) => i !== idx));
                              }}
                              className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 font-bold shrink-0"
                              title="この家族を削除"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-[#F0ECE1]">
                            <input
                              type="text"
                              placeholder="住所（別居・現住所等）"
                              value={member.address || ''}
                              onChange={(e) => {
                                const updated = [...inlineFamilyMembers];
                                updated[idx] = { ...updated[idx], address: e.target.value };
                                setInlineFamilyMembers(updated);
                              }}
                              className="bg-[#FAF9F5] border border-[#D1CEC7] p-1 text-[11px] text-[#1A1A1A] flex-1 min-w-[140px] focus:border-[#1A1A1A] focus:outline-none"
                            />
                            {/* 施主指定チェックボックス */}
                            <label className={`flex items-center space-x-1 cursor-pointer px-2 py-1 border shrink-0 transition-colors ${member.isChiefMourner || member.isSponsor ? 'bg-[#8C2D19] text-white border-[#8C2D19]' : 'bg-stone-100 text-[#1A1A1A] border-[#CCCCCC] hover:border-[#8C2D19]'}`} title="この人物を世帯の「現在の施主」として指定（他地域在住の子息など）">
                              <input
                                type="checkbox"
                                checked={!!(member.isChiefMourner || member.isSponsor)}
                                onChange={(e) => {
                                  const checked = e.target.checked;
                                  const updated = inlineFamilyMembers.map((m, i) => ({
                                    ...m,
                                    isChiefMourner: i === idx ? checked : false,
                                    isSponsor: i === idx ? checked : false,
                                  }));
                                  setInlineFamilyMembers(updated);
                                }}
                                className="w-3.5 h-3.5 accent-[#8C2D19]"
                              />
                              <span className="font-bold text-[10px]">施主指定</span>
                            </label>
                          </div>

                          {/* 家族の塔婆申込 & 為書き設定 (スロット一覧) */}
                          <div className="pt-2 border-t border-[#F0ECE1] space-y-1.5 bg-[#FAF9F5] p-2">
                            <span className="block text-[10px] font-bold text-[#555555]">塔婆申込・為書き:</span>
                            {individualTobaSlots.map((slot) => {
                              const tobaType = slot.name;
                              const app = getFamilyMemberTobaApplication(member, tobaType, individualHouseholdTemple);
                              return (
                                <div key={slot.slot} className="space-y-1 p-1 bg-white border border-[#E5E2DC]">
                                  <label className="flex items-center space-x-1.5 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={!!app.applied}
                                      onChange={(e) => {
                                        const updatedMember = setFamilyMemberTobaApplication(
                                          member,
                                          tobaType,
                                          e.target.checked,
                                          app.tamegaki,
                                          individualHouseholdTemple
                                        );
                                        const updated = [...inlineFamilyMembers];
                                        updated[idx] = updatedMember;
                                        setInlineFamilyMembers(updated);
                                      }}
                                      className="w-3.5 h-3.5 accent-[#1A1A1A]"
                                    />
                                    <span className="font-bold text-[10px] text-[#1A1A1A]">{tobaType}</span>
                                  </label>
                                  {app.applied && (
                                    <input
                                      type="text"
                                      placeholder="為書き (例: 亡〇〇)"
                                      value={app.tamegaki || ''}
                                      onChange={(e) => {
                                        const updatedMember = setFamilyMemberTobaApplication(
                                          member,
                                          tobaType,
                                          true,
                                          e.target.value,
                                          individualHouseholdTemple
                                        );
                                        const updated = [...inlineFamilyMembers];
                                        updated[idx] = updatedMember;
                                        setInlineFamilyMembers(updated);
                                      }}
                                      className="bg-[#FAF9F5] border border-[#1A1A1A] p-1 text-[11px] text-[#1A1A1A] font-serif w-full focus:outline-none"
                                    />
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* INTEGRATED PAST RECORDS (過去帳・物故者データ) SECTION */}
            <div className="p-6 space-y-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b-2 border-[#1A1A1A] pb-3">
                <div className="flex items-center space-x-3">
                  <div className="w-7 h-7 bg-[#1A1A1A] text-[#D4AF37] flex items-center justify-center font-bold text-xs">
                    過去
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-[#1A1A1A]">
                      {getHouseholdSponsorName(currentIndividualHousehold) || currentIndividualHousehold.familyHead} 様 過去帳（物故者データ）
                    </h2>
                    <p className="text-xs text-[#666666] font-sans">
                      この世帯に属するご先祖・ご物故者の記録です。（行をダブルクリックでそのまま直接編集）
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSingleImportModalHousehold(currentIndividualHousehold)}
                    className="px-3.5 py-2 bg-[#FAF7F0] hover:bg-[#F0ECE1] text-[#8C2D19] border border-[#D4AF37] font-bold text-xs uppercase tracking-wider font-sans transition-colors flex items-center space-x-1.5 shadow-xs cursor-pointer"
                    title="Word・Excel・CSV・メモ帳テキストからこの世帯の精霊（戒名）を一括取り込み"
                  >
                    <FileText className="w-4 h-4 text-[#8C2D19]" />
                    <Sparkles className="w-3.5 h-3.5 text-[#D4AF37]" />
                    <span>Word・Excel・テキスト取込</span>
                  </button>

                  <button
                    onClick={handleStartAddNewPastRecordInline}
                    className="px-4 py-2 bg-[#1A1A1A] hover:bg-[#333333] text-[#D4AF37] font-bold text-xs uppercase tracking-wider font-sans transition-colors flex items-center space-x-1.5 shadow-sm cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>新規精霊</span>
                  </button>
                </div>
              </div>

              {/* List of Past Records for this household (Row/Table view) */}
              {currentHouseholdPastRecords.length === 0 && !isAddingNewPastRecordInline ? (
                <div className="bg-[#F9F7F2] border border-dashed border-[#D1CEC7] p-8 text-center text-[#888888] font-sans text-xs space-y-3">
                  <BookOpen className="w-8 h-8 text-[#CCCCCC] mx-auto" />
                  <p className="font-bold text-[#444444]">この世帯には過去帳（物故者データ）が未登録です。</p>
                  <p>WordやExcel、メモ帳のテキストから一括読み取るか、「新規精霊」から手動入力できます。</p>
                  <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setSingleImportModalHousehold(currentIndividualHousehold)}
                      className="px-4 py-2 bg-[#FAF7F0] hover:bg-[#F0ECE1] text-[#8C2D19] border border-[#D4AF37] font-bold text-xs flex items-center space-x-1.5 shadow-xs cursor-pointer"
                    >
                      <FileText className="w-4 h-4 text-[#8C2D19]" />
                      <Sparkles className="w-3.5 h-3.5 text-[#D4AF37]" />
                      <span>Word・Excel・テキストから過去帳取り込み</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleStartAddNewPastRecordInline}
                      className="px-4 py-2 bg-[#1A1A1A] hover:bg-[#333333] text-[#D4AF37] font-bold text-xs flex items-center space-x-1.5 shadow-xs cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      <span>新規精霊を手動登録</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  ref={pastRecordsScrollRef}
                  className={`bg-white border border-[#D1CEC7] shadow-sm font-serif ${
                    currentHouseholdPastRecords.length > 10
                      ? 'max-h-[480px] overflow-y-auto overflow-x-auto scrollbar-left'
                      : 'overflow-x-auto'
                  }`}
                >
                  <div className="w-full">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-[#1A1A1A] text-[#D4AF37] font-sans uppercase tracking-wider font-bold border-b border-[#D4AF37] sticky top-0 z-10">
                        <tr>
                          <th className="px-2.5 py-3 whitespace-nowrap bg-[#1A1A1A] w-[110px]">年月日</th>
                          <th className="px-4 py-3 whitespace-nowrap bg-[#1A1A1A] min-w-[240px] text-left">戒名</th>
                          <th className="px-2 py-3 whitespace-nowrap bg-[#1A1A1A] w-[85px] text-center">新盆</th>
                          <th className="px-2 py-3 whitespace-nowrap bg-[#1A1A1A] w-[100px]">当時の施主名</th>
                          <th className="px-1 py-3 whitespace-nowrap bg-[#1A1A1A] w-[60px] text-center">続柄</th>
                          <th className="px-1 py-3 whitespace-nowrap bg-[#1A1A1A] w-[85px]">俗名</th>
                          <th className="px-1 py-3 whitespace-nowrap bg-[#1A1A1A] w-[50px] text-center">享年</th>
                          <th className="px-2.5 py-3 text-right font-sans whitespace-nowrap bg-[#1A1A1A] w-[60px]">操作</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#EBE7DF] text-[#2D2D2D]">
                      {/* NEW PAST RECORD INLINE ENTRY ROW */}
                      {isAddingNewPastRecordInline && (
                        <React.Fragment>
                          <tr className="bg-[#FFFDF0] border-2 border-[#D4AF37] font-sans">
                            {/* 年月日 */}
                            <td className="px-2 py-1.5">
                              <input
                                type="text"
                                value={newPastRecordForm.deathDate || ''}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  const autoNiibon = calculateNiibonFromDeathDate(val, templeInfo?.bonSeason || '8月盆');
                                  setNewPastRecordForm({
                                    ...newPastRecordForm,
                                    deathDate: val,
                                    niibon: autoNiibon || newPastRecordForm.niibon
                                  });
                                }}
                                onFocus={(e) => e.target.select()}
                                onBlur={(e) => {
                                  const normalized = normalizeDateInput(e.target.value, { mode: 'pastRecord' });
                                  if (normalized) {
                                    setNewPastRecordForm({
                                      ...newPastRecordForm,
                                      deathDate: formatJapaneseEraDate(normalized, false),
                                      niibon: calculateNiibonFromDeathDate(normalized, templeInfo?.bonSeason || '8月盆') || newPastRecordForm.niibon
                                    });
                                  }
                                }}
                                onKeyDown={(e) => { if (e.key === 'Enter') handleSaveNewPastRecordInline(); }}
                                placeholder="例: 令和8年8月8日"
                                className="w-full bg-white border border-[#1A1A1A] p-1 text-xs font-mono font-bold"
                              />
                            </td>
                            {/* 戒名 */}
                            <td className="px-3 py-1.5">
                              <input
                                type="text"
                                value={newPastRecordForm.dharmaName || ''}
                                onChange={(e) => setNewPastRecordForm({ ...newPastRecordForm, dharmaName: e.target.value })}
                                onKeyDown={(e) => { if (e.key === 'Enter') handleSaveNewPastRecordInline(); }}
                                placeholder="戒名・法名 *"
                                className="w-full bg-white border border-[#1A1A1A] p-1 text-xs font-serif font-bold text-sm"
                              />
                            </td>
                            {/* 新盆 */}
                            <td className="px-2 py-1.5">
                              <input
                                type="text"
                                value={newPastRecordForm.niibon || ''}
                                onChange={(e) => setNewPastRecordForm({ ...newPastRecordForm, niibon: e.target.value })}
                                onKeyDown={(e) => { if (e.key === 'Enter') handleSaveNewPastRecordInline(); }}
                                placeholder="新盆 (例: 令和8年新盆)"
                                className="w-full bg-white border border-[#1A1A1A] p-1 text-xs font-bold text-[#D4AF37]"
                              />
                            </td>
                            {/* 施主名 (固定) */}
                            <td className="px-2 py-1.5 font-bold whitespace-nowrap">
                              {currentIndividualHousehold.familyHead} 殿
                            </td>
                            {/* 続柄 */}
                            <td className="px-1 py-1.5">
                              <input
                                type="text"
                                value={newPastRecordForm.relationship || ''}
                                onChange={(e) => setNewPastRecordForm({ ...newPastRecordForm, relationship: e.target.value })}
                                onKeyDown={(e) => { if (e.key === 'Enter') handleSaveNewPastRecordInline(); }}
                                placeholder="続柄"
                                className="w-full bg-white border border-[#1A1A1A] p-1 text-xs text-center"
                              />
                            </td>
                            {/* 俗名 */}
                            <td className="px-1 py-1.5">
                              <input
                                type="text"
                                value={newPastRecordForm.secularName || ''}
                                onChange={(e) => setNewPastRecordForm({ ...newPastRecordForm, secularName: e.target.value })}
                                onKeyDown={(e) => { if (e.key === 'Enter') handleSaveNewPastRecordInline(); }}
                                placeholder="俗名"
                                className="w-full bg-white border border-[#1A1A1A] p-1 text-xs"
                              />
                            </td>
                            {/* 享年 */}
                            <td className="px-1 py-1.5">
                              <input
                                type="number"
                                value={newPastRecordForm.ageAtDeath || ''}
                                onChange={(e) => setNewPastRecordForm({ ...newPastRecordForm, ageAtDeath: Number(e.target.value) })}
                                onKeyDown={(e) => { if (e.key === 'Enter') handleSaveNewPastRecordInline(); }}
                                className="w-full bg-white border border-[#1A1A1A] p-1 text-xs font-mono text-center"
                              />
                            </td>
                            {/* 操作 */}
                            <td className="px-2.5 py-1.5 text-right whitespace-nowrap space-x-1">
                              <button
                                onClick={handleSaveNewPastRecordInline}
                                className="px-3 py-1 bg-[#D4AF37] hover:bg-[#c29f2f] text-[#1A1A1A] font-bold text-xs inline-flex items-center space-x-1 shadow-sm"
                              >
                                <Save className="w-3.5 h-3.5" />
                                <span>保存</span>
                              </button>
                              <button
                                onClick={() => setIsAddingNewPastRecordInline(false)}
                                className="px-2.5 py-1 bg-white border border-[#D1CEC7] text-[#1A1A1A] font-bold text-xs hover:bg-[#EBE7DF]"
                              >
                                <span>取消</span>
                              </button>
                            </td>
                          </tr>
                          <tr className="bg-[#FFFDF0] font-sans border-b border-[#D4AF37]">
                            <td colSpan={8} className="p-2">
                              <div className="flex items-center space-x-1.5">
                                <span className="font-bold text-xs text-[#1A1A1A] whitespace-nowrap">備考メモ:</span>
                                <input
                                  type="text"
                                  value={newPastRecordForm.notes || ''}
                                  onChange={(e) => setNewPastRecordForm({ ...newPastRecordForm, notes: e.target.value })}
                                  onKeyDown={(e) => { if (e.key === 'Enter') handleSaveNewPastRecordInline(); }}
                                  placeholder="メモ・特記事項"
                                  className="w-full bg-white border border-[#1A1A1A] px-2 py-1 text-xs"
                                />
                              </div>
                            </td>
                          </tr>
                        </React.Fragment>
                      )}
                      {currentHouseholdPastRecords.map((record, rIdx) => {
                        const isEditingThisRecord = editingPastRecordId === record.id && inlinePastRecordForm;
                        const headName = record.householdHeadName || currentIndividualHousehold.familyHead || '—';

                        if (isEditingThisRecord && inlinePastRecordForm) {
                          return (
                            <React.Fragment key={`ind-past-${record.id || rIdx}-${rIdx}`}>
                              <tr className="bg-[#FFFDF0] font-sans">
                                {/* 年月日 (編集時) */}
                                <td className="px-2 py-1.5">
                                  <input
                                    type="text"
                                    value={inlinePastRecordForm.deathDate || ''}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      const autoNiibon = calculateNiibonFromDeathDate(val, templeInfo?.bonSeason || '8月盆');
                                      setInlinePastRecordForm({
                                        ...inlinePastRecordForm,
                                        deathDate: val,
                                        niibon: autoNiibon || inlinePastRecordForm.niibon
                                      });
                                    }}
                                    onFocus={(e) => e.target.select()}
                                    onBlur={(e) => {
                                      const normalized = normalizeDateInput(e.target.value, { mode: 'pastRecord' });
                                      if (normalized) {
                                        setInlinePastRecordForm({
                                          ...inlinePastRecordForm,
                                          deathDate: formatJapaneseEraDate(normalized, false),
                                          niibon: calculateNiibonFromDeathDate(normalized, templeInfo?.bonSeason || '8月盆') || inlinePastRecordForm.niibon
                                        });
                                      }
                                    }}
                                    onKeyDown={(e) => { if (e.key === 'Enter') handleSaveInlinePastRecord(); }}
                                    placeholder="例: 令和5年10月15日"
                                    className="w-full bg-white border border-[#1A1A1A] p-1 text-xs font-mono font-bold"
                                  />
                                </td>
                                {/* 戒名 (編集時) */}
                                <td className="px-3 py-1.5">
                                  <input
                                    type="text"
                                    value={inlinePastRecordForm.dharmaName || ''}
                                    onChange={(e) => setInlinePastRecordForm({ ...inlinePastRecordForm, dharmaName: e.target.value })}
                                    onKeyDown={(e) => { if (e.key === 'Enter') handleSaveInlinePastRecord(); }}
                                    placeholder="戒名"
                                    className="w-full bg-white border border-[#1A1A1A] p-1 text-xs font-serif font-bold text-sm"
                                  />
                                </td>
                                {/* 新盆 (編集時) */}
                                <td className="px-2 py-1.5">
                                  <input
                                    type="text"
                                    value={inlinePastRecordForm.niibon || ''}
                                    onChange={(e) => setInlinePastRecordForm({ ...inlinePastRecordForm, niibon: e.target.value })}
                                    onKeyDown={(e) => { if (e.key === 'Enter') handleSaveInlinePastRecord(); }}
                                    placeholder="新盆"
                                    className="w-full bg-white border border-[#1A1A1A] p-1 text-xs font-bold text-[#D4AF37]"
                                  />
                                </td>
                                {/* 当時の施主名 (編集時) */}
                                <td className="px-2 py-1.5">
                                  <input
                                    type="text"
                                    value={inlinePastRecordForm.householdHeadName || ''}
                                    onChange={(e) => setInlinePastRecordForm({ ...inlinePastRecordForm, householdHeadName: e.target.value })}
                                    onKeyDown={(e) => { if (e.key === 'Enter') handleSaveInlinePastRecord(); }}
                                    placeholder="施主名"
                                    className="w-full bg-white border border-[#1A1A1A] p-1 text-xs font-bold"
                                  />
                                </td>
                                {/* 続柄 (編集時) */}
                                <td className="px-1 py-1.5">
                                  <input
                                    type="text"
                                    value={inlinePastRecordForm.relationship || ''}
                                    onChange={(e) => setInlinePastRecordForm({ ...inlinePastRecordForm, relationship: e.target.value })}
                                    onKeyDown={(e) => { if (e.key === 'Enter') handleSaveInlinePastRecord(); }}
                                    placeholder="続柄"
                                    className="w-full bg-white border border-[#1A1A1A] p-1 text-xs text-center"
                                  />
                                </td>
                                {/* 俗名 (編集時) */}
                                <td className="px-1 py-1.5">
                                  <input
                                    type="text"
                                    value={inlinePastRecordForm.secularName || ''}
                                    onChange={(e) => setInlinePastRecordForm({ ...inlinePastRecordForm, secularName: e.target.value })}
                                    onKeyDown={(e) => { if (e.key === 'Enter') handleSaveInlinePastRecord(); }}
                                    placeholder="俗名"
                                    className="w-full bg-white border border-[#1A1A1A] p-1 text-xs"
                                  />
                                </td>
                                {/* 享年 (編集時) */}
                                <td className="px-1 py-1.5">
                                  <input
                                    type="number"
                                    value={inlinePastRecordForm.ageAtDeath || ''}
                                    onChange={(e) => setInlinePastRecordForm({ ...inlinePastRecordForm, ageAtDeath: Number(e.target.value) })}
                                    onKeyDown={(e) => { if (e.key === 'Enter') handleSaveInlinePastRecord(); }}
                                    className="w-full bg-white border border-[#1A1A1A] p-1 text-xs font-mono text-center"
                                  />
                                </td>
                                {/* 操作 (編集時) */}
                                <td className="px-2.5 py-1.5 text-right whitespace-nowrap space-x-1">
                                  <button
                                    onClick={handleSaveInlinePastRecord}
                                    className="px-2.5 py-1 bg-[#D4AF37] hover:bg-[#c29f2f] text-[#1A1A1A] font-bold text-xs inline-flex items-center space-x-1 shadow-sm"
                                  >
                                    <Save className="w-3 h-3" />
                                    <span>保存</span>
                                  </button>
                                  <button
                                    onClick={handleCancelInlinePastRecord}
                                    className="px-2 py-1 bg-white border border-[#D1CEC7] text-[#1A1A1A] font-bold text-xs hover:bg-[#EBE7DF]"
                                  >
                                    <span>取消</span>
                                  </button>
                                </td>
                              </tr>
                              <tr className="bg-[#FFFDF0] font-sans">
                                <td colSpan={8} className="p-2 border-t border-dashed border-[#D1CEC7]">
                                  <div className="flex flex-col sm:flex-row items-center gap-3">
                                    <div className="flex items-center space-x-1.5">
                                      <span className="font-bold text-xs text-[#1A1A1A] whitespace-nowrap">檀信徒ID:</span>
                                      <input
                                        type="text"
                                        value={inlinePastRecordForm.householdId || ''}
                                        onChange={(e) => setInlinePastRecordForm({ ...inlinePastRecordForm, householdId: e.target.value })}
                                        onKeyDown={(e) => { if (e.key === 'Enter') handleSaveInlinePastRecord(); }}
                                        placeholder="例: H-1001"
                                        className="bg-white border border-[#1A1A1A] px-2 py-1 text-xs font-mono w-28 font-bold"
                                      />
                                    </div>
                                    <div className="flex-1 w-full flex items-center space-x-1.5">
                                      <span className="font-bold text-xs text-[#1A1A1A] whitespace-nowrap">備考:</span>
                                      <input
                                        type="text"
                                        value={inlinePastRecordForm.notes || ''}
                                        onChange={(e) => setInlinePastRecordForm({ ...inlinePastRecordForm, notes: e.target.value })}
                                        onKeyDown={(e) => { if (e.key === 'Enter') handleSaveInlinePastRecord(); }}
                                        placeholder="備考メモ（Enterキーで保存）"
                                        className="w-full bg-white border border-[#1A1A1A] px-2 py-1 text-xs"
                                      />
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            </React.Fragment>
                          );
                        }

                        const showNiibonBadge = isRelevantNiibon(record.niibon, record.deathDate, templeInfo?.bonSeason || '8月盆');
                        const effectiveNiibon = showNiibonBadge
                          ? (record.niibon || calculateNiibonFromDeathDate(record.deathDate, templeInfo?.bonSeason || '8月盆') || '—')
                          : '—';

                        return (
                          <React.Fragment key={`ind-past-${record.id || rIdx}-${rIdx}`}>
                            <tr
                              onDoubleClick={() => handleStartInlinePastRecordEdit(record)}
                              className="hover:bg-[#F9F7F2] transition-colors cursor-pointer"
                              title="ダブルクリックで行のまま直接編集"
                            >
                              {/* 年月日 (元号のみ表示) */}
                              <td className="px-2.5 py-3 font-bold text-[#1A1A1A] whitespace-nowrap">
                                {record.deathDate ? formatJapaneseEraDate(record.deathDate, false) : (
                                  <span className="text-[#8C2D19] font-serif font-bold tracking-widest">逆　修</span>
                                )}
                              </td>
                              {/* 戒名 */}
                              <td className="px-4 py-3 font-bold text-[#1A1A1A] text-sm tracking-wide">
                                {record.dharmaName}
                              </td>
                              {/* 新盆 */}
                              <td className="px-2 py-3 whitespace-nowrap font-bold text-[#8C6B1B] text-xs text-center">
                                {effectiveNiibon !== '—' ? (
                                  <span className="px-1.5 py-0.5 bg-[#FFF9E6] border border-[#D4AF37] rounded-xs">
                                    {effectiveNiibon}
                                  </span>
                                ) : (
                                  <span className="text-[#AAAAAA]">ー</span>
                                )}
                              </td>
                              {/* 当時の施主名 */}
                              <td className="px-2 py-3 font-bold text-[#1A1A1A] whitespace-nowrap">
                                {headName}
                              </td>
                              {/* 続柄 (前後の余白を狭めて配置) */}
                              <td className="px-1 py-3 text-[#444444] whitespace-nowrap text-center">
                                {record.relationship || '—'}
                              </td>
                              {/* 俗名 */}
                              <td className="px-1 py-3 text-[#444444] whitespace-nowrap">
                                {record.secularName || '—'}
                              </td>
                              {/* 享年 (俗名との間を狭めて配置) */}
                              <td className="px-1 py-3 font-mono text-[#2D2D2D] whitespace-nowrap text-center">
                                {record.ageAtDeath ? `${record.ageAtDeath}歳` : '—'}
                              </td>
                              {/* 操作 */}
                              <td className="px-2.5 py-3 text-right font-sans whitespace-nowrap">
                                <div className="flex items-center justify-end space-x-1.5" onClick={(e) => e.stopPropagation()}>
                                  <button
                                    onClick={() => setDeleteTargetPastRecord(record)}
                                    className="p-1.5 bg-[#F9F7F2] hover:bg-rose-50 text-rose-700 border border-[#D1CEC7] transition-colors"
                                    title="削除"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                            {record.notes && record.notes.trim() !== '' && (
                              <tr className="bg-[#FAF9F5] border-t-0">
                                <td colSpan={8} className="px-3.5 py-1.5 text-[#555555] font-sans pl-8 text-xs border-b border-[#EBE7DF]">
                                  <span className="font-bold text-[#1A1A1A] mr-2">【備考】</span>{record.notes}
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            </div>

            {/* INTEGRATED ACCOUNTING RECORDS (会計記録) SECTION */}
            <div className="p-6 space-y-4 border-t-2 border-[#EBE7DF]">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b-2 border-[#1A1A1A] pb-3">
                <div className="flex items-center space-x-3">
                  <div className="w-7 h-7 bg-[#1A1A1A] text-[#D4AF37] flex items-center justify-center font-bold text-xs font-sans">
                    会計
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-[#1A1A1A]">
                      {getHouseholdSponsorName(currentIndividualHousehold) || currentIndividualHousehold.familyHead} 様 会計・布施記録
                    </h2>
                    <p className="text-xs text-[#666666] font-sans">
                      この世帯との護持会費、法要布施、納骨費等の会計受納記録です。（行をダブルクリックで編集）
                    </p>
                  </div>
                </div>

                <button
                  onClick={handleOpenAddTransaction}
                  className="px-4 py-2 bg-[#1A1A1A] hover:bg-[#333333] text-[#D4AF37] font-bold text-xs uppercase tracking-wider font-sans transition-colors flex items-center space-x-1.5 shadow-sm"
                >
                  <Plus className="w-4 h-4" />
                  <span>+ 会計記録を追加</span>
                </button>
              </div>

              {/* List of Accounting Transactions for this household (Row/Table view) */}
              <div
                ref={transactionsScrollRef}
                className={`bg-white border border-[#D1CEC7] shadow-sm font-sans ${
                  currentHouseholdTransactions.length > 10
                    ? 'max-h-[480px] overflow-y-auto overflow-x-auto scrollbar-left'
                    : 'overflow-x-auto'
                }`}
              >
                <div className="w-full">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-[#1A1A1A] text-[#D4AF37] uppercase tracking-wider font-bold border-b border-[#D4AF37] sticky top-0 z-10">
                      <tr>
                        <th className="p-3.5 whitespace-nowrap bg-[#1A1A1A]">年月日</th>
                        <th className="p-3.5 whitespace-nowrap bg-[#1A1A1A]">科目</th>
                        <th className="p-3.5 whitespace-nowrap bg-[#1A1A1A]">備考・摘要</th>
                        <th className="p-3.5 text-right whitespace-nowrap bg-[#1A1A1A]">収入金額</th>
                        <th className="p-3.5 text-right whitespace-nowrap bg-[#1A1A1A]">操作</th>
                      </tr>
                    </thead>
                  <tbody className="divide-y divide-[#EBE7DF] text-[#2D2D2D]">
                    {currentHouseholdTransactions.map((tx, tIdx) => {
                      const isEditingThisTx = editingTransactionId === tx.id && inlineTxForm;

                      if (isEditingThisTx && inlineTxForm) {
                        return (
                          <tr key={`ind-tx-${tx.id || tIdx}-${tIdx}`} className="bg-[#FFFDF0]">
                            {/* 年月日 (編集時) */}
                            <td className="p-2">
                              <input
                                type="text"
                                value={inlineTxForm.date || ''}
                                onChange={(e) => setInlineTxForm({ ...inlineTxForm, date: e.target.value })}
                                onFocus={(e) => e.target.select()}
                                onBlur={(e) => {
                                  const normalized = normalizeDateInput(e.target.value, {
                                    mode: 'accounting',
                                    fiscalStartMonth: templeInfo?.fiscalYearStartMonth ?? 4
                                  });
                                  if (normalized) {
                                    setInlineTxForm({ ...inlineTxForm, date: formatJapaneseEraDate(normalized, false) });
                                  }
                                }}
                                onKeyDown={(e) => { if (e.key === 'Enter') handleSaveInlineTransaction(); }}
                                placeholder="例: 令和8年8月8日"
                                className="w-full bg-white border border-[#1A1A1A] p-1 font-mono text-xs font-bold"
                              />
                            </td>
                            {/* 科目 (編集時) */}
                            <td className="p-2">
                              <select
                                value={inlineTxForm.category || '法要布施'}
                                onChange={(e) => setInlineTxForm({ ...inlineTxForm, category: e.target.value as any })}
                                onKeyDown={(e) => { if (e.key === 'Enter') handleSaveInlineTransaction(); }}
                                className="w-full bg-white border border-[#1A1A1A] p-1 text-xs font-bold"
                              >
                                {masterOptions?.incomeCategories ? (
                                  masterOptions.incomeCategories.map((c) => (
                                    <option key={c} value={c}>
                                      {c}
                                    </option>
                                  ))
                                ) : (
                                  <>
                                    <option value="法要布施">法要布施</option>
                                    <option value="護持会費">護持会費</option>
                                    <option value="墓地管理費">墓地管理費</option>
                                    <option value="開眼・納骨布施">開眼・納骨布施</option>
                                    <option value="寄付金">寄付金</option>
                                    <option value="その他">その他</option>
                                  </>
                                )}
                              </select>
                            </td>
                            {/* 備考 (編集時) */}
                            <td className="p-2">
                              <input
                                type="text"
                                value={inlineTxForm.notes || ''}
                                onChange={(e) => setInlineTxForm({ ...inlineTxForm, notes: e.target.value })}
                                onKeyDown={(e) => { if (e.key === 'Enter') handleSaveInlineTransaction(); }}
                                placeholder="備考・メモ"
                                className="w-full bg-white border border-[#1A1A1A] p-1 text-xs"
                              />
                            </td>
                            {/* 金額 (編集時) */}
                            <td className="p-2 text-right">
                              <input
                                type="number"
                                value={inlineTxForm.amount || 0}
                                onChange={(e) => setInlineTxForm({ ...inlineTxForm, amount: Number(e.target.value) })}
                                onKeyDown={(e) => { if (e.key === 'Enter') handleSaveInlineTransaction(); }}
                                className="w-28 bg-white border border-[#1A1A1A] p-1 text-xs font-mono font-bold text-right"
                              />
                            </td>
                            {/* 操作 (編集時) */}
                            <td className="p-2 text-right whitespace-nowrap space-x-1">
                              <button
                                onClick={handleSaveInlineTransaction}
                                className="px-2.5 py-1 bg-[#D4AF37] hover:bg-[#c29f2f] text-[#1A1A1A] font-bold text-xs inline-flex items-center space-x-1 shadow-sm"
                              >
                                <Save className="w-3 h-3" />
                                <span>保存</span>
                              </button>
                              <button
                                onClick={handleCancelInlineTransaction}
                                className="px-2 py-1 bg-white border border-[#D1CEC7] text-[#1A1A1A] font-bold text-xs hover:bg-[#EBE7DF]"
                              >
                                <span>取消</span>
                              </button>
                            </td>
                          </tr>
                        );
                      }

                      return (
                        <tr
                          key={`ind-tx-${tx.id || tIdx}-${tIdx}`}
                          onDoubleClick={() => handleStartInlineTransactionEdit(tx)}
                          className="hover:bg-[#F9F7F2] transition-colors cursor-pointer"
                          title="ダブルクリックで行のまま直接編集"
                        >
                          {/* 年月日 (元号表記のみ) */}
                          <td className="p-3.5 font-bold text-[#1A1A1A] whitespace-nowrap">
                            {formatJapaneseEraDate(tx.date, false)}
                          </td>
                          {/* 科目 */}
                          <td className="p-3.5 font-bold text-[#1A1A1A] whitespace-nowrap">
                            <span className="px-2.5 py-0.5 bg-[#F9F7F2] border border-[#D1CEC7] text-[#1A1A1A] text-xs font-bold">
                              {tx.category}
                            </span>
                          </td>
                          {/* 備考 */}
                          <td className="p-3.5 text-[#444444]">
                            {tx.notes || '—'}
                          </td>
                          {/* 収入金額 */}
                          <td className="p-3.5 text-right font-mono font-bold text-emerald-900 text-sm whitespace-nowrap">
                            ￥{tx.amount.toLocaleString()}
                          </td>
                          {/* 操作 */}
                          <td className="p-3.5 text-right whitespace-nowrap">
                            <button
                              onClick={() => setDeleteTargetTx(tx)}
                              className="p-1.5 bg-[#F9F7F2] hover:bg-rose-50 text-rose-700 border border-[#D1CEC7] transition-colors"
                              title="削除"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}

                    {/* ALWAYS-VISIBLE INLINE ENTRY ROW AT BOTTOM */}
                    <tr className="bg-[#FFFDF0] border-2 border-[#D4AF37]">
                      <td className="p-2">
                        <input
                          type="text"
                          value={newHouseholdTxForm.date || ''}
                          onChange={(e) => setNewHouseholdTxForm({ ...newHouseholdTxForm, date: e.target.value })}
                          onFocus={(e) => e.target.select()}
                          onBlur={(e) => {
                            const normalized = normalizeDateInput(e.target.value, {
                              mode: 'accounting',
                              fiscalStartMonth: templeInfo?.fiscalYearStartMonth ?? 4
                            });
                            if (normalized) {
                              setNewHouseholdTxForm({ ...newHouseholdTxForm, date: formatJapaneseEraDate(normalized, false) });
                            }
                          }}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleSaveNewHouseholdTx(); }}
                          placeholder="令和8年8月8日"
                          className="w-full bg-white border border-[#1A1A1A] p-1.5 font-mono text-xs font-bold"
                        />
                      </td>
                      <td className="p-2">
                        <select
                          value={newHouseholdTxForm.category || '法要布施'}
                          onChange={(e) => setNewHouseholdTxForm({ ...newHouseholdTxForm, category: e.target.value as any })}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleSaveNewHouseholdTx(); }}
                          className="w-full bg-white border border-[#1A1A1A] p-1.5 text-xs font-bold"
                        >
                          {masterOptions?.incomeCategories ? (
                            masterOptions.incomeCategories.map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))
                          ) : (
                            <>
                              <option value="法要布施">法要布施</option>
                              <option value="護持会費">護持会費</option>
                              <option value="墓地管理費">墓地管理費</option>
                              <option value="開眼・納骨布施">開眼・納骨布施</option>
                              <option value="寄付金">寄付金</option>
                              <option value="その他">その他</option>
                            </>
                          )}
                        </select>
                      </td>
                      <td className="p-2">
                        <input
                          type="text"
                          value={newHouseholdTxForm.notes || ''}
                          onChange={(e) => setNewHouseholdTxForm({ ...newHouseholdTxForm, notes: e.target.value })}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleSaveNewHouseholdTx(); }}
                          placeholder="摘要・メモ（自由記述）"
                          className="w-full bg-white border border-[#1A1A1A] p-1.5 text-xs"
                        />
                      </td>
                      <td className="p-2 text-right">
                        <input
                          type="number"
                          value={newHouseholdTxForm.amount ?? ''}
                          onChange={(e) => setNewHouseholdTxForm({ ...newHouseholdTxForm, amount: e.target.value ? Number(e.target.value) : undefined })}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleSaveNewHouseholdTx(); }}
                          placeholder="金額"
                          className="w-28 bg-emerald-50 border border-emerald-600 p-1.5 text-xs font-mono font-bold text-right text-emerald-900"
                        />
                      </td>
                      <td className="p-2 text-right whitespace-nowrap">
                        <button
                          onClick={handleSaveNewHouseholdTx}
                          className="px-3 py-1.5 bg-[#D4AF37] hover:bg-[#c29f2f] text-[#1A1A1A] font-bold text-xs inline-flex items-center space-x-1 shadow-sm cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>登録</span>
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )}

      {/* Modal 3: Household QR Modal */}
      {activeQrModalHousehold && (
        <div className="fixed inset-0 z-50 bg-[#1A1A1A]/80 backdrop-blur-xs flex items-center justify-center p-4 font-serif">
          <div className="bg-white border border-[#D1CEC7] p-6 max-w-sm w-full text-center text-[#2D2D2D] space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-[#D1CEC7] pb-3">
              <h3 className="text-base font-bold text-[#1A1A1A]">受付用 QR コード</h3>
              <button onClick={() => setActiveQrModalHousehold(null)} className="text-[#888888] hover:text-[#1A1A1A]">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-white p-4 border border-[#D1CEC7] inline-block shadow-inner">
              <QRCodeSVG
                value={activeQrModalHousehold.id}
                size={180}
                level="M"
                includeMargin={true}
              />
            </div>

            <div>
              <h4 className="text-xl font-bold text-[#1A1A1A]">
                {activeQrModalHousehold.familyHead} 殿
              </h4>
              <p className="text-xs text-[#888888] font-sans font-mono">ID: {activeQrModalHousehold.id}</p>
              <p className="text-xs text-[#1A1A1A] font-bold mt-1">墓地位置: {activeQrModalHousehold.tombNumber}</p>
            </div>

            <p className="text-[11px] text-[#666666] font-sans bg-[#F9F7F2] p-2.5 border border-[#EBE7DF]">
              法要受付・行事来寺の際、本QRコードをスキャンすると一瞬で受付記録と布施処理を行えます。
            </p>

            <button
              onClick={() => {
                try {
                  window.focus();
                  window.print();
                } catch (e) {
                  alert("キーボードの [Ctrl + P] または [Cmd + P] を押して印刷してください。");
                }
              }}
              className="w-full py-2.5 bg-[#1A1A1A] hover:bg-[#333333] text-[#D4AF37] font-bold text-xs tracking-wider uppercase font-sans transition-colors cursor-pointer"
            >
              QR札を印刷・発行する
            </button>
          </div>
        </div>
      )}

      {/* Delete Household Confirm Modal */}
      <DeleteConfirmModal
        isOpen={!!deleteTargetHousehold}
        title="世帯データの削除"
        message="削除しますか？"
        itemName={deleteTargetHousehold ? `${deleteTargetHousehold.familyHead} 殿` : undefined}
        onConfirm={() => {
          if (deleteTargetHousehold) {
            onDeleteHousehold(deleteTargetHousehold.id);
            setDeleteTargetHousehold(null);
            setViewMode('list');
          }
        }}
        onCancel={() => setDeleteTargetHousehold(null)}
      />

      {/* Delete Past Record Confirm Modal */}
      <DeleteConfirmModal
        isOpen={!!deleteTargetPastRecord}
        title="過去帳データの削除"
        message="削除しますか？"
        itemName={deleteTargetPastRecord ? `${deleteTargetPastRecord.dharmaName} 様` : undefined}
        onConfirm={() => {
          if (deleteTargetPastRecord) {
            onDeletePastRecord(deleteTargetPastRecord.id);
            setDeleteTargetPastRecord(null);
          }
        }}
        onCancel={() => setDeleteTargetPastRecord(null)}
      />

      {/* Delete Transaction Confirm Modal */}
      <DeleteConfirmModal
        isOpen={!!deleteTargetTx}
        title="会計記録の削除"
        message="削除しますか？"
        itemName={deleteTargetTx ? `${deleteTargetTx.category} (￥${deleteTargetTx.amount.toLocaleString()})` : undefined}
        onConfirm={() => {
          if (deleteTargetTx && onDeleteTransaction) {
            onDeleteTransaction(deleteTargetTx.id);
            setDeleteTargetTx(null);
          }
        }}
        onCancel={() => setDeleteTargetTx(null)}
      />

      {/* Accounting Transaction Modal */}
      {showTransactionModal && (
        <div className="fixed inset-0 z-50 bg-[#1A1A1A]/80 backdrop-blur-xs flex items-center justify-center p-4 font-serif">
          <div className="bg-white border border-[#D1CEC7] p-6 max-w-md w-full text-[#2D2D2D] space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-[#D1CEC7] pb-3">
              <h3 className="text-base font-bold text-[#1A1A1A]">会計・布施記録の追加</h3>
              <button onClick={() => setShowTransactionModal(false)} className="text-[#888888] hover:text-[#1A1A1A]">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveTransaction} className="space-y-4 font-sans text-xs">
              <div>
                <label className="block font-bold text-[#1A1A1A] mb-1">受納年月日</label>
                <input
                  type="text"
                  value={transactionFormData.date}
                  onChange={(e) => setTransactionFormData({ ...transactionFormData, date: e.target.value })}
                  placeholder="例: 2026-08-09"
                  className="w-full bg-[#F9F7F2] border border-[#D1CEC7] p-2 font-mono text-xs focus:border-[#1A1A1A] focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-[#1A1A1A] mb-1">勘定科目</label>
                <select
                  value={transactionFormData.category}
                  onChange={(e) => setTransactionFormData({ ...transactionFormData, category: e.target.value as TransactionCategory })}
                  className="w-full bg-[#F9F7F2] border border-[#D1CEC7] p-2 text-xs focus:border-[#1A1A1A] focus:outline-none font-bold"
                >
                  <option value="法要布施">法要布施</option>
                  <option value="護持会費">護持会費</option>
                  <option value="墓地管理費">墓地管理費</option>
                  <option value="開眼・納骨布施">開眼・納骨布施</option>
                  <option value="特別寄付">特別寄付</option>
                  <option value="年間維持費">年間維持費</option>
                  <option value="境内整備費">境内整備費</option>
                  <option value="その他">その他</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-[#1A1A1A] mb-1">摘要・施主名（文章変更可能）</label>
                <input
                  type="text"
                  value={transactionFormData.householdHeadName}
                  onChange={(e) => setTransactionFormData({ ...transactionFormData, householdHeadName: e.target.value })}
                  placeholder="施主名・摘要文章"
                  className="w-full bg-white border border-[#1A1A1A] p-2 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                />
                <p className="text-[10px] text-[#888888] mt-0.5">※自動入力された施主名は文章として自由に変更・追記できます。</p>
              </div>

              <div>
                <label className="block font-bold text-[#1A1A1A] mb-1">収入金額 (円) *</label>
                <input
                  type="number"
                  value={transactionFormData.amount}
                  onChange={(e) => setTransactionFormData({ ...transactionFormData, amount: e.target.value === '' ? '' : Number(e.target.value) })}
                  placeholder="例: 30000"
                  required
                  className="w-full bg-[#F9F7F2] border border-[#D1CEC7] p-2 font-mono text-sm font-bold focus:border-[#1A1A1A] focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-[#1A1A1A] mb-1">受領方法</label>
                <select
                  value={transactionFormData.paymentMethod}
                  onChange={(e) => setTransactionFormData({ ...transactionFormData, paymentMethod: e.target.value as any })}
                  className="w-full bg-[#F9F7F2] border border-[#D1CEC7] p-2 text-xs focus:border-[#1A1A1A] focus:outline-none"
                >
                  <option value="現金受付">現金受付</option>
                  <option value="QR受付時">QR受付時</option>
                  <option value="銀行振込">銀行振込</option>
                  <option value="郵便振替">郵便振替</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-[#1A1A1A] mb-1">備考・メモ</label>
                <input
                  type="text"
                  value={transactionFormData.notes}
                  onChange={(e) => setTransactionFormData({ ...transactionFormData, notes: e.target.value })}
                  placeholder="備考（年回法要、塔婆代含む等）"
                  className="w-full bg-[#F9F7F2] border border-[#D1CEC7] p-2 text-xs focus:border-[#1A1A1A] focus:outline-none"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-[#EBE7DF]">
                <button
                  type="button"
                  onClick={() => setShowTransactionModal(false)}
                  className="px-4 py-2 bg-[#F9F7F2] border border-[#D1CEC7] text-[#444444] font-bold text-xs hover:bg-[#EBE7DF]"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#1A1A1A] hover:bg-[#333333] text-[#D4AF37] font-bold text-xs uppercase tracking-wider flex items-center space-x-1"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>記録を保存</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Batch Change Confirmation Modal (役職・区分１・区分２・施餓鬼塔婆・棚経の一括変更) */}
      {batchConfirmRequest && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-[#FAF9F5] border border-[#1A1A1A] max-w-lg w-full shadow-2xl p-6 relative">
            <button
              onClick={() => setBatchConfirmRequest(null)}
              className="absolute top-4 right-4 text-[#888888] hover:text-[#1A1A1A] p-1 transition-colors"
              title="閉じる"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-start space-x-3 mb-4">
              <div className="w-10 h-10 bg-[#1A1A1A] text-[#D4AF37] flex items-center justify-center flex-shrink-0">
                <CheckSquare className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-serif font-bold text-base text-[#1A1A1A]">
                  選択世帯の一括変更
                </h3>
                <p className="text-xs text-[#777777] font-serif">
                  現在 {batchConfirmRequest.selectedHouseholds.length} 件の世帯がチェック選択されています
                </p>
              </div>
            </div>

            <div className="bg-white border border-[#E5E0D8] p-4 mb-5 space-y-3">
              <div className="text-sm font-serif text-[#1A1A1A] leading-relaxed">
                選択中の<span className="font-bold text-[#1A1A1A]">【{batchConfirmRequest.fieldName}】</span>（計 {batchConfirmRequest.selectedHouseholds.length} 件）を全て「<span className="font-bold text-[#D4AF37] bg-[#1A1A1A] px-2 py-0.5">{batchConfirmRequest.displayValue}</span>」に変更しますか？
              </div>

              {/* 対象世帯のプレビュー（数件） */}
              <div className="pt-2 border-t border-[#F0ECE1]">
                <div className="text-[11px] text-[#888888] mb-1.5 font-bold">対象世帯:</div>
                <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto pr-1">
                  {batchConfirmRequest.selectedHouseholds.map((h) => (
                    <span
                      key={h.id}
                      className="inline-block bg-[#F4F1EA] text-[#333333] border border-[#DDD7CD] px-2 py-0.5 text-[11px] font-serif"
                    >
                      {h.familyHead || h.id}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end items-center gap-3 pt-3 border-t border-[#EBE7DF]">
              <button
                type="button"
                onClick={() => setBatchConfirmRequest(null)}
                className="px-4 py-2.5 bg-[#F9F7F2] border border-[#D1CEC7] text-[#555555] hover:bg-[#EBE7DF] hover:text-[#1A1A1A] text-xs font-bold transition-colors"
              >
                キャンセル
              </button>

              <button
                type="button"
                onClick={handleApplyBatchChange}
                className="px-5 py-2.5 bg-[#1A1A1A] hover:bg-[#333333] text-[#D4AF37] border border-[#D4AF37] text-xs font-bold uppercase tracking-wider flex items-center justify-center space-x-1.5 shadow-md transition-colors"
              >
                <CheckSquare className="w-3.5 h-3.5" />
                <span>変更</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 4: 檀家別 過去帳精霊一覧・法要/塔婆予約ハブポップアップ */}
      {activeHouseholdForBooking && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in duration-150 font-sans">
          <div className="bg-[#FAF9F5] border-2 border-[#1A1A1A] max-w-4xl w-full shadow-2xl p-5 sm:p-6 relative flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="flex justify-between items-start pb-3 border-b border-[#D1CEC7]">
              <div>
                <div className="flex items-center space-x-2">
                  <div className="w-8 h-8 bg-[#1A1A1A] text-[#D4AF37] flex items-center justify-center flex-shrink-0">
                    <Calendar className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-serif font-bold text-base sm:text-lg text-[#1A1A1A] flex items-center gap-2">
                      <span>【{getHouseholdSponsorName(activeHouseholdForBooking) || activeHouseholdForBooking.familyHead} 様】過去帳精霊一覧・法要/塔婆予約</span>
                    </h3>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-[#666666] mt-0.5">
                      <span className="font-mono bg-[#EBE7DF] px-1.5 py-0.5 text-[#1A1A1A]">世帯ID: {activeHouseholdForBooking.id}</span>
                      {activeHouseholdForBooking.tombNumber && (
                        <span className="bg-[#EBE7DF] px-1.5 py-0.5 text-[#1A1A1A]">墓地: {activeHouseholdForBooking.tombNumber}</span>
                      )}
                      {activeHouseholdForBooking.district && (
                        <span className="bg-[#EBE7DF] px-1.5 py-0.5 text-[#1A1A1A]">役職: {activeHouseholdForBooking.district}</span>
                      )}
                      {activeHouseholdForBooking.householdType && (
                        <span className="bg-indigo-50 text-indigo-900 border border-indigo-200 px-1.5 py-0.5 font-bold">
                          {activeHouseholdForBooking.householdType}
                        </span>
                      )}
                      <span className="text-[#888888]">
                        登録精霊: <strong className="text-[#1A1A1A]">{bookingHouseholdPastRecords.length}</strong> 件
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setActiveHouseholdForBooking(null)}
                className="text-[#888888] hover:text-[#1A1A1A] p-1.5 transition-colors cursor-pointer"
                title="閉じる"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Sub-header / Guidance */}
            <div className="bg-[#F2EFE9] border border-[#DDD7CD] px-3 py-2 my-3 text-xs text-[#444444] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="flex items-center space-x-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[#D4AF37] flex-shrink-0" />
                <span>法要予定や塔婆を予約する対象の精霊（故人）の横にあるボタンをクリックしてください。</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  handleSelectIndividualHousehold(activeHouseholdForBooking.id);
                  setActiveHouseholdForBooking(null);
                  handleStartAddNewPastRecordInline();
                }}
                className="text-[11px] font-bold text-[#1A1A1A] hover:text-[#D4AF37] flex items-center space-x-1 underline cursor-pointer self-end sm:self-auto"
              >
                <Plus className="w-3 h-3" />
                <span>この世帯に新規精霊（過去帳）を追加</span>
              </button>
            </div>

            {/* Past Records List Table with Scroll container */}
            <div 
              ref={bookingPastRecordsScrollRef}
              className="flex-1 overflow-y-auto max-h-[380px] bg-white border border-[#D1CEC7] shadow-inner divide-y divide-[#EBE7DF]"
            >
              {bookingHouseholdPastRecords.length === 0 ? (
                <div className="p-8 text-center space-y-3">
                  <BookOpen className="w-8 h-8 text-[#CCCCCC] mx-auto" />
                  <p className="text-sm font-serif text-[#777777]">
                    この世帯にはまだ過去帳（精霊）が登録されていません。
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => handleOpenBookingService(activeHouseholdForBooking)}
                      className="px-3.5 py-1.5 bg-[#1A1A1A] hover:bg-[#333333] text-[#D4AF37] border border-[#D4AF37] text-xs font-bold transition-colors flex items-center space-x-1.5 cursor-pointer shadow-xs"
                    >
                      <Calendar className="w-3.5 h-3.5" />
                      <span>世帯主名で法要予約</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenBookingToba(activeHouseholdForBooking)}
                      className="px-3.5 py-1.5 bg-[#2D3748] hover:bg-[#1A202C] text-[#FAF089] border border-[#FAF089]/60 text-xs font-bold transition-colors flex items-center space-x-1.5 cursor-pointer shadow-xs"
                    >
                      <Layers className="w-3.5 h-3.5" />
                      <span>世帯主名で塔婆予約</span>
                    </button>
                  </div>
                </div>
              ) : (
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="sticky top-0 bg-[#2D2D2D] text-[#F9F7F2] z-10 select-none shadow-xs">
                    <tr>
                      <th className="px-3 py-2 font-bold tracking-wider">戒名（法名）</th>
                      <th className="px-2 py-2 font-bold tracking-wider">俗名・続柄</th>
                      <th className="px-2 py-2 font-bold tracking-wider whitespace-nowrap">没年月日 / 享年</th>
                      <th className="px-2 py-2 font-bold tracking-wider">直近・該当年忌</th>
                      <th className="px-3 py-2 font-bold tracking-wider text-right whitespace-nowrap">予約アクション</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EBE7DF]">
                    {bookingHouseholdPastRecords.map((record) => {
                      const milestones = record.deathDate ? calculateMemorialMilestones(record.deathDate) : [];
                      const currentYear = new Date().getFullYear();
                      const upcomingMilestone = milestones.find((m) => m.targetYear >= currentYear);
                      const isCurrentYear = upcomingMilestone?.targetYear === currentYear;

                      return (
                        <tr
                          key={record.id}
                          className="hover:bg-[#F9F7F2] transition-colors"
                        >
                          {/* 戒名 */}
                          <td className="px-3 py-2.5">
                            <div className="font-serif font-bold text-sm text-[#1A1A1A] leading-tight">
                              {record.dharmaName || ''}
                            </div>
                            {record.notes && (
                              <div className="text-[10px] text-[#888888] line-clamp-1 mt-0.5">{record.notes}</div>
                            )}
                          </td>

                          {/* 俗名・続柄 */}
                          <td className="px-2 py-2.5">
                            <div className="text-xs font-bold text-[#333333] leading-tight font-serif">
                              {record.secularName || '-'}
                            </div>
                            {record.relationship && (
                              <div className="text-[10px] text-[#777777] leading-tight">
                                {record.relationship}
                              </div>
                            )}
                          </td>

                          {/* 没年月日 / 享年 */}
                          <td className="px-2 py-2.5 whitespace-nowrap">
                            <div className="text-xs font-serif text-[#1A1A1A] leading-tight">
                              {record.deathDate ? formatJapaneseEraDate(record.deathDate, true) : (
                                <span className="text-[#8C2D19] font-serif font-bold tracking-widest">逆　修</span>
                              )}
                            </div>
                            <div className="text-[10px] text-[#666666] leading-tight">
                              享年 {record.ageAtDeath ? `${record.ageAtDeath} 歳` : '-'}
                            </div>
                          </td>

                          {/* 直近・該当年忌 */}
                          <td className="px-2 py-2.5">
                            {upcomingMilestone ? (
                              <div className="inline-flex items-center gap-1">
                                <span className={`px-1.5 py-0.5 text-[10px] font-bold ${
                                  isCurrentYear
                                    ? 'bg-amber-100 text-amber-900 border border-amber-300'
                                    : 'bg-stone-100 text-stone-700 border border-stone-300'
                                }`}>
                                  {upcomingMilestone.type} ({upcomingMilestone.targetYear}年)
                                </span>
                              </div>
                            ) : (
                              <span className="text-[10px] text-[#999999]">-</span>
                            )}
                          </td>

                          {/* 予約アクションボタン */}
                          <td className="px-3 py-2.5 text-right whitespace-nowrap">
                            <div className="inline-flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleOpenBookingService(activeHouseholdForBooking, record)}
                                className="px-2.5 py-1 bg-[#1A1A1A] hover:bg-[#333333] text-[#D4AF37] border border-[#D4AF37] text-[11px] font-bold transition-colors flex items-center space-x-1 cursor-pointer shadow-xs active:scale-95"
                                title="この精霊の法要予定を予約設定"
                              >
                                <Calendar className="w-3 h-3 text-[#D4AF37]" />
                                <span>法要予定</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenBookingToba(activeHouseholdForBooking, record)}
                                className="px-2.5 py-1 bg-[#2D3748] hover:bg-[#1A202C] text-[#FAF089] border border-[#FAF089]/70 text-[11px] font-bold transition-colors flex items-center space-x-1 cursor-pointer shadow-xs active:scale-95"
                                title="この精霊の塔婆予約を設定"
                              >
                                <Layers className="w-3 h-3 text-[#FAF089]" />
                                <span>塔婆予約</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Footer */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-[#D1CEC7] mt-3">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleOpenBookingService(activeHouseholdForBooking, undefined, '葬儀', true)}
                  className="px-3 py-1.5 bg-[#8C2D19] hover:bg-[#6D2313] text-[#FAF089] border border-[#8C2D19] text-xs font-bold transition-colors flex items-center space-x-1 cursor-pointer shadow-xs active:scale-95"
                >
                  <Plus className="w-3.5 h-3.5 text-[#FAF089]" />
                  <span>葬儀・枕経・祈禱等の予約</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleOpenBookingService(activeHouseholdForBooking)}
                  className="px-3 py-1.5 bg-[#F9F7F2] hover:bg-[#EBE7DF] text-[#1A1A1A] border border-[#D1CEC7] text-xs font-bold transition-colors flex items-center space-x-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>その他（先祖代々等）で法要予約</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleOpenBookingToba(activeHouseholdForBooking)}
                  className="px-3 py-1.5 bg-[#F9F7F2] hover:bg-[#EBE7DF] text-[#1A1A1A] border border-[#D1CEC7] text-xs font-bold transition-colors flex items-center space-x-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>先祖代々等で塔婆予約</span>
                </button>
              </div>
              <button
                type="button"
                onClick={() => setActiveHouseholdForBooking(null)}
                className="px-5 py-2 bg-[#1A1A1A] hover:bg-[#333333] text-[#D4AF37] font-bold text-xs uppercase tracking-wider cursor-pointer"
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 5: 法要予定設定フォーム (Service Booking Modal) */}
      {bookingServiceModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in duration-150 font-sans">
          <div className="bg-[#FAF9F5] border-2 border-[#1A1A1A] max-w-xl w-full shadow-2xl p-5 sm:p-6 relative flex flex-col max-h-[92vh] overflow-y-auto">
            {/* Header */}
            <div className="flex justify-between items-center pb-3 border-b border-[#D1CEC7] mb-4">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-[#1A1A1A] text-[#D4AF37] flex items-center justify-center flex-shrink-0">
                  <Calendar className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-serif font-bold text-base text-[#1A1A1A]">
                    {bookingServiceModal.isFuneralOrPrayerMode ? '葬儀・枕経・祈祷 予約設定フォーム' : '法要・葬儀・祈祷 予約設定フォーム'}
                  </h3>
                  <div className="text-xs text-[#777777]">
                    世帯（施主）: {getHouseholdSponsorName(bookingServiceModal.household) || bookingServiceModal.household.familyHead} 様
                    {bookingServiceModal.pastRecord && ` (故人: ${bookingServiceModal.pastRecord.dharmaName || bookingServiceModal.pastRecord.secularName})`}
                  </div>
                </div>
              </div>
              <button
                onClick={() => setBookingServiceModal(null)}
                className="text-[#888888] hover:text-[#1A1A1A] p-1.5 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveBookingService} className="space-y-4 text-xs font-sans">
              {/* 施主選択（家族構成より選択可能） */}
              <div className="bg-white p-3 border border-[#D1CEC7] space-y-1.5">
                <label className="block text-xs font-bold text-[#1A1A1A]">
                  施主（申込者） <span className="text-red-500">*</span>
                </label>
                <div className="flex gap-2">
                  <select
                    value={bookingServiceForm.chiefMourner}
                    onChange={(e) => {
                      const val = e.target.value;
                      setBookingServiceForm((prev) => ({
                        ...prev,
                        chiefMourner: val,
                        tobaSponsors: [val, ...prev.tobaSponsors.slice(1)],
                      }));
                    }}
                    className="flex-1 px-3 py-1.5 border border-[#D1CEC7] bg-[#F9F7F2] font-serif text-xs focus:ring-1 focus:ring-[#D4AF37] focus:outline-none"
                  >
                    {(() => {
                      const sponsor = getHouseholdSponsorName(bookingServiceModal.household);
                      const head = bookingServiceModal.household.familyHead;
                      return (
                        <>
                          <option value={sponsor || head}>
                            {sponsor || head} 様 {sponsor && sponsor !== head ? '(指定施主)' : '(世帯主)'}
                          </option>
                          {sponsor && sponsor !== head && (
                            <option value={head}>
                              {head} 様 (世帯主)
                            </option>
                          )}
                        </>
                      );
                    })()}
                    {bookingHouseholdFamilyMembers
                      .filter((m) => m.name !== getHouseholdSponsorName(bookingServiceModal.household) && m.name !== bookingServiceModal.household.familyHead)
                      .map((m) => (
                        <option key={m.id} value={m.name}>
                          {m.name} 様 ({m.relationship || '家族'})
                        </option>
                      ))}
                  </select>
                  <input
                    type="text"
                    value={bookingServiceForm.chiefMourner}
                    onFocus={(e) => e.target.select()}
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                    onChange={(e) => {
                      const val = e.target.value;
                      setBookingServiceForm((prev) => ({
                        ...prev,
                        chiefMourner: val,
                        tobaSponsors: [val, ...prev.tobaSponsors.slice(1)],
                      }));
                    }}
                    placeholder="施主名直接入力"
                    className="w-36 px-2 py-1.5 border border-[#D1CEC7] bg-white text-xs font-serif focus:ring-1 focus:ring-[#D4AF37] focus:outline-none"
                  />
                </div>
                <div className="text-[10px] text-[#777777]">
                  ※家族構成から施主を選択するか、直接名前を入力できます。
                </div>
              </div>

              {/* 法要種別 & 日時 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#1A1A1A] mb-1">
                    法要・用務種別 <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={bookingServiceForm.memorialType}
                    onChange={(e) => {
                      const selectedType = e.target.value;
                      const isHome = selectedType === '棚経' || selectedType === '枕経';
                      const defaultVenue = isHome ? (bookingServiceModal.household.address || '') : `${templeInfo?.name || '自寺'} 本堂`;
                      setBookingServiceForm((prev) => ({
                        ...prev,
                        memorialType: selectedType,
                        venue: defaultVenue,
                      }));
                    }}
                    className="w-full px-3 py-1.5 border border-[#D1CEC7] bg-white font-serif text-xs focus:ring-1 focus:ring-[#D4AF37] focus:outline-none font-bold"
                  >
                    {!bookingServiceModal.isFuneralOrPrayerMode && (
                      <optgroup label="年忌・追善法要">
                        <option value="四十九日">四十九日</option>
                        <option value="百ヶ日">百ヶ日</option>
                        <option value="一周忌">一周忌</option>
                        <option value="三回忌">三回忌</option>
                        <option value="七回忌">七回忌</option>
                        <option value="十三回忌">十三回忌</option>
                        <option value="十七回忌">十七回忌</option>
                        <option value="二十三回忌">二十三回忌</option>
                        <option value="二十七回忌">二十七回忌</option>
                        <option value="三十三回忌">三十三回忌</option>
                        <option value="五十回忌">五十回忌</option>
                        <option value="年忌法要">年忌法要</option>
                        <option value="納骨法要">納骨法要</option>
                        <option value="開眼供養">開眼供養</option>
                      </optgroup>
                    )}
                    <optgroup label={bookingServiceModal.isFuneralOrPrayerMode ? "葬儀・枕経・祈祷・各種用務" : "葬儀・枕経・祈祷・その他"}>
                      <option value="葬儀">葬儀</option>
                      <option value="通夜">通夜</option>
                      <option value="枕経">枕経</option>
                      <option value="祈祷・厄除">祈祷・厄除</option>
                      <option value="棚経">棚経 (お盆巡回)</option>
                      <option value="月参り">月参り</option>
                      <option value="その他">その他</option>
                    </optgroup>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#1A1A1A] mb-1">
                    会場・場所
                  </label>
                  <input
                    type="text"
                    value={bookingServiceForm.venue}
                    onFocus={(e) => e.target.select()}
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                    onChange={(e) => setBookingServiceForm((prev) => ({ ...prev, venue: e.target.value }))}
                    placeholder="例: 本堂、自宅、斎場、墓前"
                    className="w-full px-3 py-1.5 border border-[#D1CEC7] bg-white text-xs font-serif focus:ring-1 focus:ring-[#D4AF37] focus:outline-none font-medium"
                  />
                </div>
              </div>

              {/* 訪問先住所・場所住所 */}
              <div>
                <label className="block text-xs font-bold text-[#1A1A1A] mb-1">
                  訪問先住所・場所住所 <span className="text-gray-500 text-[10px] font-normal">（Googleマップ検索対象。空欄時は「会場・場所」を検索）</span>
                </label>
                <input
                  type="text"
                  value={bookingServiceForm.address}
                  onFocus={(e) => e.target.select()}
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                  onChange={(e) => setBookingServiceForm((prev) => ({ ...prev, address: e.target.value }))}
                  placeholder="例: 東京都世田谷区経堂1-2-3 (自宅や斎場の住所)"
                  className="w-full px-3 py-1.5 border border-[#D1CEC7] bg-white text-xs font-serif focus:ring-1 focus:ring-[#D4AF37] focus:outline-none"
                />
              </div>

              {/* 法要日時 */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <div className="flex items-center justify-between mb-1">
                    <div className="text-xs font-bold text-[#1A1A1A]">法要予定日 <span className="text-red-500">*</span></div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setBookingServiceForm((prev) => ({ ...prev, scheduledDate: getTodayDateString('/') }))}
                        className="px-1.5 py-0.5 bg-[#1A1A1A] text-[#D4AF37] hover:bg-[#333333] font-bold text-[10px] cursor-pointer"
                        title="今日（当日）の日付を設定"
                      >
                        今日
                      </button>
                      {bookingServiceModal.pastRecord?.deathDate && (() => {
                        const milestones = calculateMemorialMilestones(bookingServiceModal.pastRecord!.deathDate!);
                        const curYear = new Date().getFullYear();
                        const milestone = milestones.find((m) => m.targetYear >= curYear);
                        if (milestone?.scheduledDate) {
                          const normMilestoneDate = normalizeDateInput(milestone.scheduledDate) || milestone.scheduledDate;
                          return (
                            <button
                              type="button"
                              onClick={() => setBookingServiceForm((prev) => ({ ...prev, scheduledDate: normMilestoneDate }))}
                              className="px-1.5 py-0.5 bg-[#FAF6F0] text-[#8C2D19] border border-[#E8E1D5] hover:bg-[#F3EDE2] font-bold text-[10px] cursor-pointer"
                              title={`祥月命日 (${normMilestoneDate}) を設定`}
                            >
                              祥月命日 ({normMilestoneDate})
                            </button>
                          );
                        }
                        return null;
                      })()}
                    </div>
                  </div>
                  <DateInputWithEra
                    value={bookingServiceForm.scheduledDate}
                    onChange={(d) => setBookingServiceForm((prev) => ({ ...prev, scheduledDate: d }))}
                    memorialServices={memorialServices}
                    required
                    placeholder="例: 2026/08/25"
                  />
                </div>

                <div>
                  <TimeSelectorInput
                    label="開始時刻"
                    value={bookingServiceForm.scheduledTime || '11:00'}
                    onChange={(t) => setBookingServiceForm((prev) => ({ ...prev, scheduledTime: t }))}
                    required
                    placeholder="11:00"
                  />
                </div>
              </div>

              {/* 塔婆入力セクション */}
              <div className="bg-amber-50/70 border border-amber-200 p-3 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-1.5">
                    <Layers className="w-4 h-4 text-amber-800" />
                    <span className="font-bold text-xs text-amber-900">塔婆の予約・志主登録</span>
                  </div>
                  <span className="text-[10px] text-amber-800 bg-amber-100 px-2 py-0.5 border border-amber-300">
                    ※登録時に法事前日ToDoタスクへ自動登録
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-[#333333] mb-0.5">
                      塔婆本数 {bookingServiceModal.isFuneralOrPrayerMode && <span className="text-gray-500 font-normal">（不要な場合は0本のまま）</span>}
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="50"
                      value={bookingServiceForm.tobaCount}
                      onFocus={(e) => e.target.select()}
                      onClick={(e) => (e.target as HTMLInputElement).select()}
                      onChange={(e) => {
                        const count = Math.max(0, parseInt(e.target.value, 10) || 0);
                        const currentSponsors = [...bookingServiceForm.tobaSponsors];
                        while (currentSponsors.length < count) {
                          currentSponsors.push('');
                        }
                        setBookingServiceForm((prev) => ({
                          ...prev,
                          tobaCount: count,
                          tobaSponsors: currentSponsors.slice(0, Math.max(1, count)),
                        }));
                      }}
                      className="w-full px-3 py-1.5 border border-amber-300 bg-white font-mono text-xs focus:ring-1 focus:ring-amber-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-[#333333] mb-0.5">
                      塔婆種別
                    </label>
                    <select
                      value={bookingServiceForm.tobaType}
                      onChange={(e) => setBookingServiceForm((prev) => ({ ...prev, tobaType: e.target.value }))}
                      className="w-full px-3 py-1.5 border border-amber-300 bg-white text-xs focus:ring-1 focus:ring-amber-500 focus:outline-none font-bold"
                    >
                      <optgroup label="寺院設定・塔婆申込種類">
                        {effectiveTobaSlots.map((slot) => (
                          <option key={slot.slot} value={slot.name}>
                            {slot.name}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="塔婆サイズ・規格">
                        <option value="大塔婆">大塔婆 (6尺)</option>
                        <option value="中塔婆">中塔婆 (5尺)</option>
                        <option value="小塔婆">小塔婆 (4尺)</option>
                        <option value="経木塔婆">経木塔婆</option>
                      </optgroup>
                    </select>
                  </div>
                </div>

                {bookingServiceForm.tobaCount > 0 && (
                  <div className="space-y-1.5 pt-1">
                    <label className="block text-[11px] font-bold text-[#333333]">
                      塔婆志主名（1本目は施主名が自動反映）
                    </label>
                    {bookingServiceForm.tobaSponsors.map((sponsor, sIdx) => (
                      <div key={sIdx} className="flex items-center gap-2">
                        <span className="text-[10px] text-amber-800 w-12 font-bold">{sIdx + 1}本目:</span>
                        <input
                          type="text"
                          value={sponsor}
                          onFocus={(e) => e.target.select()}
                          onClick={(e) => (e.target as HTMLInputElement).select()}
                          onChange={(e) => {
                            const newSponsors = [...bookingServiceForm.tobaSponsors];
                            newSponsors[sIdx] = e.target.value;
                            setBookingServiceForm((prev) => ({ ...prev, tobaSponsors: newSponsors }));
                          }}
                          placeholder={sIdx === 0 ? "施主名（デフォルト）" : "志主名を入力"}
                          className="flex-1 px-2.5 py-1 border border-amber-300 bg-white text-xs font-serif focus:ring-1 focus:ring-amber-500 focus:outline-none"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 備考 */}
              <div>
                <label className="block text-xs font-bold text-[#1A1A1A] mb-1">
                  法要メモ・連絡事項
                </label>
                <textarea
                  value={bookingServiceForm.notes}
                  onChange={(e) => setBookingServiceForm((prev) => ({ ...prev, notes: e.target.value }))}
                  rows={2}
                  placeholder="控え室の準備、持ち込み品、食事手配など"
                  className="w-full px-3 py-1.5 border border-[#D1CEC7] bg-white text-xs font-serif focus:ring-1 focus:ring-[#D4AF37] focus:outline-none"
                />
              </div>

              <div className="flex justify-end items-center gap-3 pt-3 border-t border-[#D1CEC7]">
                <button
                  type="button"
                  onClick={() => setBookingServiceModal(null)}
                  className="px-4 py-2 bg-[#F9F7F2] border border-[#D1CEC7] text-[#555555] hover:bg-[#EBE7DF] text-xs font-bold transition-colors cursor-pointer"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#1A1A1A] hover:bg-[#333333] text-[#D4AF37] border border-[#D4AF37] text-xs font-bold uppercase tracking-wider flex items-center space-x-1.5 shadow-md cursor-pointer"
                >
                  <Calendar className="w-3.5 h-3.5" />
                  <span>法要予定を登録</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 6: 塔婆予約設定フォーム (Toba Booking Modal) */}
      {bookingTobaModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in duration-150 font-sans">
          <div className="bg-[#FAF9F5] border-2 border-[#1A1A1A] max-w-lg w-full shadow-2xl p-5 sm:p-6 relative flex flex-col max-h-[92vh] overflow-y-auto">
            {/* Header */}
            <div className="flex justify-between items-center pb-3 border-b border-[#D1CEC7] mb-4">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-[#2D3748] text-[#FAF089] flex items-center justify-center flex-shrink-0">
                  <Layers className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-serif font-bold text-base text-[#1A1A1A]">
                    塔婆予約 受付フォーム
                  </h3>
                  <div className="text-xs text-[#777777]">
                    世帯: {bookingTobaModal.household.familyHead} 殿
                    {bookingTobaModal.pastRecord && ` (精霊: ${bookingTobaModal.pastRecord.dharmaName || bookingTobaModal.pastRecord.secularName})`}
                  </div>
                </div>
              </div>
              <button
                onClick={() => setBookingTobaModal(null)}
                className="text-[#888888] hover:text-[#1A1A1A] p-1.5 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveBookingToba} className="space-y-4 text-xs font-sans">
              {/* 施主・志主選択 */}
              <div className="bg-white p-3 border border-[#D1CEC7] space-y-1.5">
                <label className="block text-xs font-bold text-[#1A1A1A]">
                  志主（施主） <span className="text-red-500">*</span>
                </label>
                <div className="flex gap-2">
                  <select
                    value={bookingTobaForm.chiefMourner}
                    onChange={(e) => {
                      const val = e.target.value;
                      setBookingTobaForm((prev) => ({
                        ...prev,
                        chiefMourner: val,
                        tobaSponsors: [val, ...prev.tobaSponsors.slice(1)],
                      }));
                    }}
                    className="flex-1 px-3 py-1.5 border border-[#D1CEC7] bg-[#F9F7F2] font-serif text-xs focus:ring-1 focus:ring-[#D4AF37] focus:outline-none"
                  >
                    <option value={bookingTobaModal.household.familyHead}>
                      {bookingTobaModal.household.familyHead} (世帯主)
                    </option>
                    {bookingHouseholdFamilyMembers.map((m) => (
                      <option key={m.id} value={m.name}>
                        {m.name} ({m.relationship || '家族'})
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={bookingTobaForm.chiefMourner}
                    onFocus={(e) => e.target.select()}
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                    onChange={(e) => {
                      const val = e.target.value;
                      setBookingTobaForm((prev) => ({
                        ...prev,
                        chiefMourner: val,
                        tobaSponsors: [val, ...prev.tobaSponsors.slice(1)],
                      }));
                    }}
                    placeholder="志主名直接入力"
                    className="w-36 px-2 py-1.5 border border-[#D1CEC7] bg-white text-xs font-serif focus:ring-1 focus:ring-[#D4AF37] focus:outline-none"
                  />
                </div>
              </div>

              {/* 為書き & 受取/供養日 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#1A1A1A] mb-1">
                    為書き（戒名・供養名） <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={bookingTobaForm.tamegaki}
                    onFocus={(e) => e.target.select()}
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                    onChange={(e) => setBookingTobaForm((prev) => ({ ...prev, tamegaki: e.target.value }))}
                    placeholder="為 ○○居士菩提 / 先祖代々"
                    required
                    className="w-full px-3 py-1.5 border border-[#D1CEC7] bg-white text-xs font-serif focus:ring-1 focus:ring-[#D4AF37] focus:outline-none"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <div className="text-xs font-bold text-[#1A1A1A]">受取・供養日 <span className="text-red-500">*</span></div>
                    <button
                      type="button"
                      onClick={() => setBookingTobaForm((prev) => ({ ...prev, deliveryDate: getTodayDateString('/') }))}
                      className="px-1.5 py-0.5 bg-[#1A1A1A] text-[#D4AF37] hover:bg-[#333333] font-bold text-[10px] cursor-pointer"
                      title="今日（当日）の日付を設定"
                    >
                      今日
                    </button>
                  </div>
                  <DateInputWithEra
                    value={bookingTobaForm.deliveryDate}
                    onChange={(d) => setBookingTobaForm((prev) => ({ ...prev, deliveryDate: d }))}
                    memorialServices={memorialServices}
                    required
                    placeholder="例: 2026/08/25"
                  />
                </div>
              </div>

              {/* 塔婆種別 & 本数 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#1A1A1A] mb-1">
                    塔婆種別
                  </label>
                  <select
                    value={bookingTobaForm.tobaType}
                    onChange={(e) => setBookingTobaForm((prev) => ({ ...prev, tobaType: e.target.value }))}
                    className="w-full px-3 py-1.5 border border-[#D1CEC7] bg-white text-xs focus:ring-1 focus:ring-[#D4AF37] focus:outline-none font-bold"
                  >
                    <optgroup label="寺院設定・塔婆申込種類">
                      {effectiveTobaSlots.map((slot) => (
                        <option key={slot.slot} value={slot.name}>
                          {slot.name}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="塔婆サイズ・規格">
                      <option value="大塔婆">大塔婆 (6尺)</option>
                      <option value="中塔婆">中塔婆 (5尺)</option>
                      <option value="小塔婆">小塔婆 (4尺)</option>
                      <option value="経木塔婆">経木塔婆</option>
                    </optgroup>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#1A1A1A] mb-1">
                    本数 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={bookingTobaForm.tobaCount}
                    onFocus={(e) => e.target.select()}
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                    onChange={(e) => {
                      const count = Math.max(1, parseInt(e.target.value, 10) || 1);
                      const currentSponsors = [...bookingTobaForm.tobaSponsors];
                      while (currentSponsors.length < count) {
                        currentSponsors.push('');
                      }
                      setBookingTobaForm((prev) => ({
                        ...prev,
                        tobaCount: count,
                        tobaSponsors: currentSponsors.slice(0, count),
                      }));
                    }}
                    required
                    className="w-full px-3 py-1.5 border border-[#D1CEC7] bg-white font-mono text-xs focus:ring-1 focus:ring-[#D4AF37] focus:outline-none"
                  />
                </div>
              </div>

              {/* 志主名リスト */}
              <div className="bg-[#F2EFE9] border border-[#DDD7CD] p-3 space-y-2">
                <label className="block text-[11px] font-bold text-[#333333]">
                  志主名一覧（1本目は施主名が自動入力）
                </label>
                {bookingTobaForm.tobaSponsors.map((sponsor, sIdx) => (
                  <div key={sIdx} className="flex items-center gap-2">
                    <span className="text-[10px] text-[#666666] w-12 font-bold">{sIdx + 1}本目:</span>
                    <input
                      type="text"
                      value={sponsor}
                      onChange={(e) => {
                        const newSponsors = [...bookingTobaForm.tobaSponsors];
                        newSponsors[sIdx] = e.target.value;
                        setBookingTobaForm((prev) => ({ ...prev, tobaSponsors: newSponsors }));
                      }}
                      placeholder={sIdx === 0 ? "施主名（デフォルト）" : "志主名を入力"}
                      className="flex-1 px-2.5 py-1 border border-[#D1CEC7] bg-white text-xs font-serif focus:ring-1 focus:ring-[#D4AF37] focus:outline-none"
                    />
                  </div>
                ))}
              </div>

              {/* 備考 */}
              <div>
                <label className="block text-xs font-bold text-[#1A1A1A] mb-1">
                  備考・連絡事項
                </label>
                <input
                  type="text"
                  value={bookingTobaForm.notes}
                  onChange={(e) => setBookingTobaForm((prev) => ({ ...prev, notes: e.target.value }))}
                  placeholder="施主からの要望・受取方法など"
                  className="w-full px-3 py-1.5 border border-[#D1CEC7] bg-white text-xs font-serif focus:ring-1 focus:ring-[#D4AF37] focus:outline-none"
                />
              </div>

              <div className="flex justify-end items-center gap-3 pt-3 border-t border-[#D1CEC7]">
                <button
                  type="button"
                  onClick={() => setBookingTobaModal(null)}
                  className="px-4 py-2 bg-[#F9F7F2] border border-[#D1CEC7] text-[#555555] hover:bg-[#EBE7DF] text-xs font-bold transition-colors cursor-pointer"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#2D3748] hover:bg-[#1A202C] text-[#FAF089] border border-[#FAF089]/70 text-xs font-bold uppercase tracking-wider flex items-center space-x-1.5 shadow-md cursor-pointer"
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>塔婆予約を登録</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 住所録印刷モーダル (1ページ目表紙＋2ページ目以降五十音順A4名簿) */}
      <HouseholdAddressBookPrintModal
        isOpen={isAddressBookModalOpen}
        onClose={() => setIsAddressBookModalOpen(false)}
        households={households}
        pastRecords={pastRecords}
        templeName={templeName}
        templeInfo={templeInfo}
        selectedHouseholdIds={selectedIdsForPrint}
      />

      {/* 受付票印刷モーダル (五十音順2列・手書き記入欄・新盆/棚経朱文字印字・塔婆為書き選択) */}
      <HouseholdReceptionSheetPrintModal
        isOpen={isReceptionSheetModalOpen}
        onClose={() => setIsReceptionSheetModalOpen(false)}
        households={households}
        filteredHouseholds={filteredHouseholds}
        pastRecords={pastRecords}
        templeName={templeName}
        templeInfo={templeInfo}
        selectedHouseholdIds={selectedIdsForPrint}
      />

      {/* 塔婆施主印刷モーダル (五十音順2段組・詳細一覧・為書き・新盆戒名・塔婆種類切替) */}
      <SegakiPatronModal
        isOpen={isTobaPatronModalOpen}
        onClose={() => setIsTobaPatronModalOpen(false)}
        households={households}
        pastRecords={pastRecords}
        templeName={templeName}
        bonSeason={templeInfo?.bonSeason || '8月盆'}
        tobaTypes={effectiveTobaTypes}
        initialTobaType={activeTobaType}
      />

      {/* 名簿リスト表示項目 編集・並び順設定モーダル */}
      <HouseholdListColumnConfigModal
        isOpen={showColumnConfigModal}
        onClose={() => setShowColumnConfigModal(false)}
        columns={listColumns}
        onSave={saveListColumns}
        defaultColumns={DEFAULT_LIST_COLUMNS}
      />

      {/* 個別檀家 過去帳・精霊 AI取り込みウィザード (墓碑写真・Word・Excel・OCRテキスト) */}
      <SingleHouseholdKakochoImportModal
        isOpen={!!singleImportModalHousehold}
        onClose={() => setSingleImportModalHousehold(null)}
        targetHousehold={singleImportModalHousehold}
        existingPastRecords={pastRecords}
        templeInfo={templeInfo}
        temples={temples}
        onImportPastRecords={(records, description) => {
          if (onBatchAddPastRecords) {
            onBatchAddPastRecords(records, description);
          } else {
            records.forEach((r) => onAddPastRecord(r));
          }
          setSingleImportModalHousehold(null);
        }}
      />
    </div>
  );
};
