import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
  BookOpen, 
  Search, 
  Calendar as CalendarIcon, 
  X,
  Edit,
  Trash2,
  FileText,
  Printer,
  Sparkles,
  Save,
  Plus,
  Sliders,
  Database,
  ChevronLeft,
  ChevronRight,
  Clock,
  CheckCircle2,
  CheckSquare,
  Square,
  Mail
} from 'lucide-react';
import { PastRecord, Household, MemorialMilestone, TempleInfo, MemorialService, TempleTodo, TempleProfile } from '../types';
import { 
  calculateMemorialMilestones, 
  getJapaneseEra, 
  formatJapaneseEraDate, 
  formatMonthDayOnly,
  generateHiganPeriods,
  getUpcomingMailingPeriodId,
  generatePoliteMemorialNoticeText,
  normalizeDateInput,
  calculateNiibonFromDeathDate,
  isRelevantNiibon,
  HiganPeriodOption,
  formatCurrency,
  calculateYearlyMemorialSpirits,
  YearlyMemorialSpirit,
  getHouseholdSponsorName,
  getHouseholdFamilyHeadName,
  NormalizeDateOptions,
  NoticeTemplateItem,
  NenkiFilterSettings,
  DEFAULT_NENKI_FILTER_SETTINGS,
  isSpiritMatchingNenkiSettings,
  MemorialNoticeTarget,
} from '../utils/memorialCalculator';
import { getRokuyo, calculateEndTime, getPreviousDay } from '../utils/calendarUtils';
import { DeleteConfirmModal } from './DeleteConfirmModal';
import { SaveConfirmModal } from './SaveConfirmModal';
import { DailyMemorialList } from './DailyMemorialList';
import { PostcardTemplateModal } from './PostcardTemplateModal';
import { SegakiPatronModal } from './SegakiPatronModal';
import { NenkiFilterModal } from './NenkiFilterModal';
import { YearlyMemorialPrintModal } from './YearlyMemorialPrintModal';
import { useVirtualScroll } from '../hooks/useVirtualScroll';

interface KakochoListProps {
  pastRecords: PastRecord[];
  allPastRecords?: PastRecord[];
  households: Household[];
  allHouseholds?: Household[];
  templeInfo?: TempleInfo;
  temples?: TempleProfile[];
  activeTempleId?: string;
  memorialServices?: MemorialService[];
  initialTab?: 'all' | 'daily' | 'milestones';
  initialMilestoneSubMode?: 'shipping' | 'yearly';
  targetScrollDate?: string;
  onAddPastRecord: (record: PastRecord) => void;
  onUpdatePastRecord: (record: PastRecord) => void;
  onDeletePastRecord: (id: string) => void;
  onCreateMemorialService: (record: PastRecord, milestoneType: string, date: string, noticeText?: string) => void;
  onAddService?: (service: MemorialService) => void;
  onAddTodo?: (todo: TempleTodo) => void;
  onSaveNoticeTemplates?: (templates: NoticeTemplateItem[] | { higan: string; niibon: string }) => void;
  onOpenImportModal?: (target?: 'past_record' | 'combined') => void;
  onNavigateToPrint?: (selectedIds?: string[]) => void;
  setSelectedIdsForPrint?: React.Dispatch<React.SetStateAction<string[]>>;
  onUpdateMilestoneTargets?: (targetsMap: Record<string, MemorialNoticeTarget[]>, periodLabel: string) => void;
}

export const KakochoList: React.FC<KakochoListProps> = ({
  pastRecords,
  allPastRecords,
  households,
  allHouseholds,
  templeInfo,
  temples = [],
  activeTempleId = 'temple-main',
  memorialServices = [],
  initialTab = 'all',
  initialMilestoneSubMode = 'shipping',
  targetScrollDate,
  onAddPastRecord,
  onUpdatePastRecord,
  onDeletePastRecord,
  onCreateMemorialService,
  onAddService,
  onAddTodo,
  onSaveNoticeTemplates,
  onOpenImportModal,
  onNavigateToPrint,
  setSelectedIdsForPrint,
  onUpdateMilestoneTargets,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'daily' | 'milestones'>(initialTab);
  const [selectedMilestoneHouseholdIds, setSelectedMilestoneHouseholdIds] = useState<string[]>([]);

  // Sync activeTab when initialTab prop changes
  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  // Delete Confirm Modal state
  const [deleteTargetRecord, setDeleteTargetRecord] = useState<PastRecord | null>(null);

  // Higan & Obon mailing period selection state
  const higanPeriods = useMemo(
    () => generateHiganPeriods(new Date().getFullYear(), templeInfo?.bonSeason || '8月盆'),
    [templeInfo?.bonSeason]
  );
  
  // Target upcoming period (Switches to Autumn Higan from Aug 12 for 8月盆 / July 12 for 7月盆)
  const targetUpcomingPeriodId = useMemo(
    () => getUpcomingMailingPeriodId(new Date().getFullYear(), templeInfo?.bonSeason || '8月盆', new Date()),
    [templeInfo?.bonSeason]
  );

  const [selectedPeriodId, setSelectedPeriodId] = useState<string>(() => targetUpcomingPeriodId);

  const currentPeriod = higanPeriods.find((p) => p.id === selectedPeriodId) || higanPeriods[0];

  // Milestone sub-mode: 'shipping' (対象法要期・年2回発送区分) vs 'yearly' (年法要予定・前年/本年/来年精霊ベース)
  const [milestoneSubMode, setMilestoneSubMode] = useState<'shipping' | 'yearly'>(initialMilestoneSubMode || 'shipping');
  const [yearlyTargetYear, setYearlyTargetYear] = useState<number>(() => {
    if (targetScrollDate) {
      const norm = normalizeDateInput(targetScrollDate) || targetScrollDate;
      const parsedYear = parseInt(norm.split(/[-/]/)[0], 10);
      if (!isNaN(parsedYear)) return parsedYear;
    }
    return new Date().getFullYear();
  });

  // Highlight state for targeted scroll
  const [highlightedSpiritId, setHighlightedSpiritId] = useState<string | null>(null);

  // Nenki Filter Settings State (Stored in localStorage)
  const [nenkiSettings, setNenkiSettings] = useState<NenkiFilterSettings>(() => {
    try {
      const saved = localStorage.getItem('kakocho_nenki_filter_settings');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error(e);
    }
    return DEFAULT_NENKI_FILTER_SETTINGS;
  });

  const handleSaveNenkiSettings = (newSettings: NenkiFilterSettings) => {
    setNenkiSettings(newSettings);
    try {
      localStorage.setItem('kakocho_nenki_filter_settings', JSON.stringify(newSettings));
    } catch (e) {
      console.error(e);
    }
  };

  const [isNenkiFilterModalOpen, setIsNenkiFilterModalOpen] = useState<boolean>(false);
  const [isYearlyPrintModalOpen, setIsYearlyPrintModalOpen] = useState<boolean>(false);

  // Sync milestoneSubMode when initialMilestoneSubMode changes
  useEffect(() => {
    if (initialMilestoneSubMode) {
      setMilestoneSubMode(initialMilestoneSubMode);
    }
  }, [initialMilestoneSubMode]);

  // Scroll Container Refs for Sticky Headers & Auto-scrolling
  const allRecordsScrollRef = useRef<HTMLDivElement>(null);
  const milestonesScrollRef = useRef<HTMLDivElement>(null);
  const yearlySpiritsScrollRef = useRef<HTMLDivElement>(null);
  
  // Track whether we need to perform initial scroll for a target date
  const shouldAutoScrollRef = useRef<boolean>(!!targetScrollDate);
  const lastTargetScrollDateRef = useRef<string | undefined>(targetScrollDate);
  const scrollTimersRef = useRef<number[]>([]);

  // Cleanup scroll timers on unmount
  useEffect(() => {
    return () => {
      scrollTimersRef.current.forEach((t) => clearTimeout(t));
      scrollTimersRef.current = [];
    };
  }, []);

  // When targetScrollDate prop changes or is provided, enable auto-scroll once
  useEffect(() => {
    if (targetScrollDate && targetScrollDate !== lastTargetScrollDateRef.current) {
      lastTargetScrollDateRef.current = targetScrollDate;
      shouldAutoScrollRef.current = true;
      const norm = normalizeDateInput(targetScrollDate) || targetScrollDate;
      const parsedYear = parseInt(norm.split(/[-/]/)[0], 10);
      if (!isNaN(parsedYear) && parsedYear !== yearlyTargetYear) {
        setYearlyTargetYear(parsedYear);
      }
    }
  }, [targetScrollDate, yearlyTargetYear]);

  // Auto-scroll to bottom by default on All Past Records tab (全過去帳名簿)
  useEffect(() => {
    if (activeTab === 'all') {
      const timer = setTimeout(() => {
        if (allRecordsScrollRef.current) {
          allRecordsScrollRef.current.scrollTop = allRecordsScrollRef.current.scrollHeight;
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [activeTab, pastRecords.length]);

  // Notice creation preview modal state
  const [noticeModal, setNoticeModal] = useState<{
    record: PastRecord;
    milestoneType: string;
    scheduledDate: string;
    noticeText: string;
    targets: { dharmaName: string; secularName: string; memorialType: string; scheduledDateStr: string }[];
    headName: string;
    sponsorName?: string;
  } | null>(null);

  // Template settings modal state
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);

  // Segaki Toba Patron Output Modal state
  const [showSegakiPatronModal, setShowSegakiPatronModal] = useState(false);

  // Edit modal state (for creating / editing past records)
  const [showModal, setShowModal] = useState(false);
  const [editingRecord, setEditingRecord] = useState<PastRecord | null>(null);
  const [formData, setFormData] = useState<Partial<PastRecord>>({
    id: '',
    householdId: '',
    householdHeadName: '',
    dharmaName: '',
    secularName: '',
    deathDate: '',
    ageAtDeath: undefined,
    relationship: '',
    burialLocation: '',
    notes: '',
    niibon: '',
  });

  // Inline Row Editing State for All Past Records Table
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  const [inlineRecordForm, setInlineRecordForm] = useState<Partial<PastRecord> | null>(null);
  const [showPastRecordSaveConfirm, setShowPastRecordSaveConfirm] = useState<boolean>(false);

  const handleOpenAddModal = () => {
    setEditingRecord(null);
    setFormData({
      id: '',
      householdId: households[0]?.id || '',
      householdHeadName: households[0]?.familyHead || '',
      dharmaName: '',
      secularName: '',
      deathDate: '',
      ageAtDeath: undefined,
      relationship: '',
      burialLocation: households[0]?.tombNumber || '',
      notes: '',
      niibon: '',
    });
    setShowModal(true);
  };

  const handleStartInlineEdit = (record: PastRecord) => {
    setEditingRecordId(record.id);
    const autoNiibon = calculateNiibonFromDeathDate(record.deathDate, templeInfo?.bonSeason || '8月盆');
    setInlineRecordForm({
      ...record,
      deathDate: formatJapaneseEraDate(record.deathDate, false),
      niibon: record.niibon !== undefined && record.niibon !== '' ? record.niibon : autoNiibon,
    });
  };

  const handleSaveInlineRecord = () => {
    if (!inlineRecordForm || !inlineRecordForm.id) return;
    const selectedHousehold = households.find((h) => h.id === inlineRecordForm.householdId);
    const normalizedDate = inlineRecordForm.deathDate && inlineRecordForm.deathDate.trim()
      ? (normalizeDateInput(inlineRecordForm.deathDate, { mode: 'pastRecord' }) || '')
      : '';
    const parsedAge = inlineRecordForm.ageAtDeath !== undefined && inlineRecordForm.ageAtDeath !== null && String(inlineRecordForm.ageAtDeath).trim() !== ''
      ? Number(inlineRecordForm.ageAtDeath)
      : undefined;

    const completeRecord: PastRecord = {
      id: inlineRecordForm.id,
      householdId: inlineRecordForm.householdId || households[0]?.id || '',
      householdHeadName: inlineRecordForm.householdHeadName || (selectedHousehold ? selectedHousehold.familyHead : ''),
      dharmaName: inlineRecordForm.dharmaName || '',
      secularName: inlineRecordForm.secularName || '',
      deathDate: normalizedDate,
      ageAtDeath: parsedAge !== undefined && !isNaN(parsedAge) && parsedAge > 0 ? parsedAge : undefined,
      relationship: inlineRecordForm.relationship || '',
      burialLocation: inlineRecordForm.burialLocation || '',
      notes: inlineRecordForm.notes || '',
      niibon: inlineRecordForm.niibon !== undefined && inlineRecordForm.niibon.trim() !== ''
        ? inlineRecordForm.niibon.trim()
        : (normalizedDate ? calculateNiibonFromDeathDate(normalizedDate, templeInfo?.bonSeason || '8月盆') : undefined),
    };

    onUpdatePastRecord(completeRecord);
    setEditingRecordId(null);
    setInlineRecordForm(null);
  };

  const handleCancelInlineEdit = () => {
    setEditingRecordId(null);
    setInlineRecordForm(null);
  };

  const handleOpenEditModal = (record: PastRecord) => {
    setEditingRecord(record);
    const autoNiibon = record.deathDate ? calculateNiibonFromDeathDate(record.deathDate, templeInfo?.bonSeason || '8月盆') : '';
    setFormData({
      ...record,
      deathDate: record.deathDate ? formatJapaneseEraDate(record.deathDate, false) : '',
      relationship: record.relationship || '',
      niibon: record.niibon !== undefined && record.niibon !== '' ? record.niibon : autoNiibon,
    });
    setShowModal(true);
  };

  const executeSaveAndClose = () => {
    if (!formData.dharmaName && !formData.secularName) {
      alert('戒名（法名）または俗名を入力してください。');
      return;
    }
    const selectedHousehold = households.find((h) => h.id === formData.householdId);
    const normalizedDate = formData.deathDate && formData.deathDate.trim()
      ? (normalizeDateInput(formData.deathDate, { mode: 'pastRecord' }) || '')
      : '';
    const parsedAge = formData.ageAtDeath !== undefined && formData.ageAtDeath !== null && String(formData.ageAtDeath).trim() !== ''
      ? Number(formData.ageAtDeath)
      : undefined;

    const completeRecord: PastRecord = {
      id: editingRecord ? editingRecord.id : `KC-${Date.now()}`,
      householdId: formData.householdId || households[0]?.id || '',
      householdHeadName: formData.householdHeadName || (selectedHousehold ? selectedHousehold.familyHead : ''),
      dharmaName: formData.dharmaName || '',
      secularName: formData.secularName || '',
      deathDate: normalizedDate,
      ageAtDeath: parsedAge !== undefined && !isNaN(parsedAge) && parsedAge > 0 ? parsedAge : undefined,
      relationship: formData.relationship || '',
      burialLocation: formData.burialLocation || (selectedHousehold?.tombNumber || ''),
      notes: formData.notes || '',
      niibon: formData.niibon !== undefined && formData.niibon.trim() !== ''
        ? formData.niibon.trim()
        : (normalizedDate ? calculateNiibonFromDeathDate(normalizedDate, templeInfo?.bonSeason || '8月盆') : undefined),
    };

    if (editingRecord) {
      onUpdatePastRecord(completeRecord);
    } else {
      onAddPastRecord(completeRecord);
    }
    setShowPastRecordSaveConfirm(false);
    setShowModal(false);
  };

  const handleSaveModal = (e: React.FormEvent) => {
    e.preventDefault();
    executeSaveAndClose();
  };

  const handleRequestClose = () => {
    setShowPastRecordSaveConfirm(true);
  };

  // Filter records for "全過去帳名簿" tab
  const filteredRecords = useMemo(() => {
    const term = (searchTerm || '').trim().toLowerCase();
    return pastRecords.filter((r) => {
      if (!r) return false;
      // 逆修戒名（命日なし）は全体の過去帳名簿では非表示（檀家個別の過去帳でのみ最新に掲載）
      if (!r.deathDate || r.deathDate.trim() === '') return false;
      if (!term) return true;
      const dharma = (r.dharmaName || '').toLowerCase();
      const secular = (r.secularName || '').toLowerCase();
      const head = (r.householdHeadName || '').toLowerCase();
      const rel = (r.relationship || '').toLowerCase();
      const burial = (r.burialLocation || '').toLowerCase();
      const nii = (r.niibon || '').toLowerCase();
      const notes = (r.notes || '').toLowerCase();
      const dDate = (r.deathDate || '').toLowerCase();

      return (
        dharma.includes(term) ||
        secular.includes(term) ||
        head.includes(term) ||
        rel.includes(term) ||
        burial.includes(term) ||
        nii.includes(term) ||
        notes.includes(term) ||
        dDate.includes(term)
      );
    });
  }, [pastRecords, searchTerm]);

  // Sort All Past Records by deathDate in ascending order (日付の昇順: 古い順 -> 新しい順)
  const sortedAllRecords = useMemo(() => {
    return [...filteredRecords].sort((a, b) => {
      const da = normalizeDateInput(a.deathDate || '');
      const db = normalizeDateInput(b.deathDate || '');
      if (da && db) return da.localeCompare(db);
      if (da && !db) return -1; // da (has date) comes first
      if (!da && db) return 1;  // db (has date) comes first
      return (a.dharmaName || a.secularName || '').localeCompare(b.dharmaName || b.secularName || '');
    });
  }, [filteredRecords]);

  // 仮想スクロール (Virtual Scroll) による高速描画
  const {
    topSpacerHeight: kakochoTopSpacerHeight,
    bottomSpacerHeight: kakochoBottomSpacerHeight,
    virtualIndices: kakochoVirtualIndices,
  } = useVirtualScroll({
    count: sortedAllRecords.length,
    estimateItemHeight: 52,
    overscan: 60,
    containerRef: allRecordsScrollRef,
    defaultContainerHeight: 600,
    disableThreshold: 800,
  });

  // Calculate milestone candidates for the selected shipping period
  const milestoneCandidates = useMemo(() => {
    return pastRecords.flatMap((record) => {
      if (!currentPeriod) return [];

      if (currentPeriod.type === 'bon' || currentPeriod.id.endsWith('-bon')) {
        const normalizedDeathDate = normalizeDateInput(record.deathDate);
        if (!normalizedDeathDate) return [];

        const targetNiibonTag = `${getJapaneseEra(currentPeriod.year)}新盆`;
        const recordNiibon = record.niibon && record.niibon.trim() !== ''
          ? record.niibon.trim()
          : calculateNiibonFromDeathDate(record.deathDate, templeInfo?.bonSeason || '8月盆');

        const isMatch = recordNiibon === targetNiibonTag || recordNiibon.includes(targetNiibonTag) || (
          normalizedDeathDate >= currentPeriod.startDate && normalizedDeathDate <= currentPeriod.endDate
        );

        if (isMatch) {
          const isJulyBon = (templeInfo?.bonSeason || '8月盆') === '7月盆';
          const bonScheduledDate = `${currentPeriod.year}/${isJulyBon ? '07/15' : '08/15'}`;

          return [{
            record,
            milestone: {
              type: '新盆' as any,
              yearNumber: 1,
              targetYear: currentPeriod.year,
              scheduledDate: bonScheduledDate,
              japaneseEra: recordNiibon || `${getJapaneseEra(currentPeriod.year)} 新盆`,
              isPast: false,
              isCurrentYear: true,
              isNextYear: false,
            },
          }];
        }
        return [];
      } else {
        const milestones = calculateMemorialMilestones(record.deathDate);
        // Filter milestones whose scheduledDate falls within the Higan period range [startDate, endDate]
        const matched = milestones.filter((m) => {
          const inPeriod = m.scheduledDate >= currentPeriod.startDate && m.scheduledDate <= currentPeriod.endDate;
          if (!inPeriod) return false;
          return isSpiritMatchingNenkiSettings({ memorialType: m.type } as any, nenkiSettings);
        });
        return matched.map((m) => ({
          record,
          milestone: m,
        }));
      }
    });
  }, [pastRecords, currentPeriod, templeInfo?.bonSeason, nenkiSettings]);

  // Group milestone candidates by Household to prevent double postcard printing per household
  type HouseholdMilestoneGroup = {
    householdKey: string;
    headName: string;
    sponsorName: string;
    primaryRecord: PastRecord;
    primaryMilestone: MemorialMilestone;
    items: { record: PastRecord; milestone: MemorialMilestone }[];
  };

  const householdMilestoneGroups: HouseholdMilestoneGroup[] = React.useMemo(() => {
    const map = new Map<string, { record: PastRecord; milestone: MemorialMilestone }[]>();

    milestoneCandidates.forEach((item) => {
      const key = item.record.householdId || item.record.householdHeadName || item.record.id;
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key)!.push(item);
    });

    const groups: HouseholdMilestoneGroup[] = [];

    map.forEach((items, key) => {
      // Sort items within household by scheduledDate ascending (prioritize nearest memorial date)
      items.sort((a, b) => a.milestone.scheduledDate.localeCompare(b.milestone.scheduledDate));
      const primaryItem = items[0];
      const currentHousehold = households.find((h) => h.id === primaryItem.record.householdId);
      const headName = currentHousehold
        ? currentHousehold.familyHead
        : (primaryItem.record.householdHeadName || '未設定');
      const sponsorName = getHouseholdSponsorName(currentHousehold) || headName;

      groups.push({
        householdKey: key,
        headName,
        sponsorName,
        primaryRecord: primaryItem.record,
        primaryMilestone: primaryItem.milestone,
        items,
      });
    });

    // Sort groups by earliest scheduled date ascending
    groups.sort((a, b) => a.primaryMilestone.scheduledDate.localeCompare(b.primaryMilestone.scheduledDate));

    return groups;
  }, [milestoneCandidates, households]);

  const onUpdateMilestoneTargetsRef = useRef(onUpdateMilestoneTargets);
  useEffect(() => {
    onUpdateMilestoneTargetsRef.current = onUpdateMilestoneTargets;
  }, [onUpdateMilestoneTargets]);

  const lastDispatchedPayloadRef = useRef<string>('');

  // Maintain and dispatch temporary milestone targets for the current shipping period
  useEffect(() => {
    if (!onUpdateMilestoneTargetsRef.current) return;
    const targetsMap: Record<string, MemorialNoticeTarget[]> = {};
    householdMilestoneGroups.forEach((g) => {
      const targets: MemorialNoticeTarget[] = g.items.map((item) => ({
        dharmaName: item.record.dharmaName || '',
        secularName: item.record.secularName || '',
        memorialType: item.milestone.type,
        scheduledDateStr: item.milestone.scheduledDate,
      }));
      // Map under householdId, householdKey, and household head name
      const keys = [g.primaryRecord.householdId, g.householdKey, g.headName].filter(Boolean) as string[];
      keys.forEach((k) => {
        targetsMap[k] = targets;
      });
    });

    const periodLabel = currentPeriod?.label || '';
    const payloadSignature = JSON.stringify({ periodLabel, targetsMap });
    if (lastDispatchedPayloadRef.current === payloadSignature) {
      return;
    }
    lastDispatchedPayloadRef.current = payloadSignature;

    onUpdateMilestoneTargetsRef.current(targetsMap, periodLabel);
  }, [householdMilestoneGroups, currentPeriod?.id, currentPeriod?.label]);

  // Clear milestone selections when selectedPeriodId changes
  useEffect(() => {
    setSelectedMilestoneHouseholdIds([]);
  }, [selectedPeriodId]);

  // Household IDs for the current shipping period
  const currentPeriodHouseholdIds = useMemo(() => {
    const ids: string[] = [];
    householdMilestoneGroups.forEach((g) => {
      const hid = g.primaryRecord.householdId || g.householdKey;
      if (hid && !ids.includes(hid)) {
        ids.push(hid);
      }
    });
    return ids;
  }, [householdMilestoneGroups]);

  const isAllMilestonesSelected =
    currentPeriodHouseholdIds.length > 0 &&
    currentPeriodHouseholdIds.every((id) => selectedMilestoneHouseholdIds.includes(id));

  const handleToggleSelectAllMilestones = () => {
    if (isAllMilestonesSelected) {
      setSelectedMilestoneHouseholdIds([]);
    } else {
      setSelectedMilestoneHouseholdIds([...currentPeriodHouseholdIds]);
    }
  };

  const handleToggleSelectMilestone = (householdId: string) => {
    if (!householdId) return;
    setSelectedMilestoneHouseholdIds((prev) =>
      prev.includes(householdId) ? prev.filter((id) => id !== householdId) : [...prev, householdId]
    );
  };

  const handleNavigateToPrintWithSelected = () => {
    if (selectedMilestoneHouseholdIds.length === 0) return;
    if (setSelectedIdsForPrint) {
      setSelectedIdsForPrint(selectedMilestoneHouseholdIds);
    }
    if (onNavigateToPrint) {
      onNavigateToPrint(selectedMilestoneHouseholdIds);
    }
  };

  // Yearly Spirits Calculation (前年・本年・来年の精霊ベース年法要予定: 四十九日・百ヶ日・年回忌、年忌設定で絞り込み)
  const yearlySpirits = useMemo(() => {
    const all = calculateYearlyMemorialSpirits(pastRecords, yearlyTargetYear);
    return all.filter((s) => isSpiritMatchingNenkiSettings(s, nenkiSettings));
  }, [pastRecords, yearlyTargetYear, nenkiSettings]);

  // Auto-scroll and highlight when targetScrollDate is provided (Runs on initial navigation from calendar)
  useEffect(() => {
    if (
      activeTab === 'milestones' &&
      milestoneSubMode === 'yearly' &&
      targetScrollDate &&
      shouldAutoScrollRef.current &&
      yearlySpirits.length > 0
    ) {
      const normTarget = normalizeDateInput(targetScrollDate) || targetScrollDate;
      const targetParts = normTarget.split(/[-/]/);
      const tYear = targetParts.length === 3 ? parseInt(targetParts[0], 10) : yearlyTargetYear;
      const tMonth = targetParts.length === 3 ? parseInt(targetParts[1], 10) : 1;
      const tDay = targetParts.length === 3 ? parseInt(targetParts[2], 10) : 1;
      const targetTime = new Date(tYear, tMonth - 1, tDay).getTime();

      // If target year doesn't match current yearlyTargetYear, switch year first and keep shouldAutoScrollRef true
      if (!isNaN(tYear) && tYear !== yearlyTargetYear) {
        setYearlyTargetYear(tYear);
        return;
      }

      // Find the closest spirit item (exact match or closest date in milliseconds)
      let bestSpirit: YearlyMemorialSpirit | null = null;
      let minDiff = Infinity;

      yearlySpirits.forEach((s) => {
        if (!s.scheduledDate) return;
        const sNorm = normalizeDateInput(s.scheduledDate) || s.scheduledDate;
        const sParts = sNorm.split(/[-/]/);
        if (sParts.length === 3) {
          const sYear = parseInt(sParts[0], 10);
          const sMonth = parseInt(sParts[1], 10);
          const sDay = parseInt(sParts[2], 10);
          const sTime = new Date(sYear, sMonth - 1, sDay).getTime();
          const diff = Math.abs(sTime - targetTime);
          if (diff < minDiff) {
            minDiff = diff;
            bestSpirit = s;
          }
        }
      });

      if (bestSpirit) {
        const spiritId = (bestSpirit as YearlyMemorialSpirit).id;
        // Mark as scrolled so user can switch years freely without being forced back
        shouldAutoScrollRef.current = false;
        setHighlightedSpiritId(spiritId);

        // Clear any previous active timers
        scrollTimersRef.current.forEach((t) => clearTimeout(t));
        scrollTimersRef.current = [];

        const executeScroll = (attempt: number = 0) => {
          const container = yearlySpiritsScrollRef.current;
          const el = document.getElementById(`yearly-spirit-row-${spiritId}`) ||
            (container?.querySelector(`[data-spirit-id="${spiritId}"]`) as HTMLElement | null);

          if (el) {
            // 1. Position within the internal scroll container directly
            if (container) {
              const containerRect = container.getBoundingClientRect();
              const elRect = el.getBoundingClientRect();
              const relativeTop = elRect.top - containerRect.top + container.scrollTop;
              const targetContainerScrollTop = Math.max(0, relativeTop - (container.clientHeight / 2) + (elRect.height / 2));
              container.scrollTop = targetContainerScrollTop;
            }

            // 2. Also scroll browser window to center the highlighted row
            const elRect = el.getBoundingClientRect();
            const currentScrollY = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;
            const absoluteRowTop = currentScrollY + elRect.top;
            const targetWindowY = Math.max(0, absoluteRowTop - (window.innerHeight / 2) + (elRect.height / 2));

            window.scrollTo({
              top: targetWindowY,
              behavior: attempt === 0 ? 'auto' : 'smooth',
            });

            // 3. Directly invoke scrollIntoView on first cell
            try {
              const cell = el.querySelector('td') || el;
              cell.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
            } catch {
              try {
                el.scrollIntoView(true);
              } catch {
                // ignore
              }
            }
          } else if (attempt < 12) {
            // Retry if DOM elements are being mounted
            const retryTimer = window.setTimeout(() => executeScroll(attempt + 1), 60);
            scrollTimersRef.current.push(retryTimer);
          }
        };

        // Fire multiple attempts across rendering frames to guarantee position is set
        const t0 = window.setTimeout(() => executeScroll(0), 20);
        const t1 = window.setTimeout(() => executeScroll(1), 100);
        const t2 = window.setTimeout(() => executeScroll(2), 250);
        const t3 = window.setTimeout(() => executeScroll(3), 500);
        const t4 = window.setTimeout(() => executeScroll(4), 800);
        scrollTimersRef.current.push(t0, t1, t2, t3, t4);

        const clearTimer = window.setTimeout(() => {
          setHighlightedSpiritId(null);
        }, 6000);
        scrollTimersRef.current.push(clearTimer);
      }
    }
  }, [activeTab, milestoneSubMode, targetScrollDate, yearlySpirits, yearlyTargetYear]);

  // Household lookup map by householdId
  const householdMap = useMemo(() => {
    const map = new Map<string, Household>();
    households.forEach((h) => {
      if (h.id) map.set(h.id, h);
    });
    return map;
  }, [households]);

  // Handle opening notice creation modal for a household group
  const handleOpenNoticeModalForGroup = (group: HouseholdMilestoneGroup) => {
    const targets = group.items.map((item) => ({
      dharmaName: item.record.dharmaName,
      secularName: item.record.secularName,
      memorialType: item.milestone.type,
      scheduledDateStr: item.milestone.scheduledDate,
    }));

    const generatedNotice = generatePoliteMemorialNoticeText(
      targets,
      currentPeriod?.label || '',
      group.headName,
      undefined,
      undefined,
      group.sponsorName
    );

    setNoticeModal({
      record: group.primaryRecord,
      milestoneType: group.primaryMilestone.type,
      scheduledDate: group.primaryMilestone.scheduledDate,
      noticeText: generatedNotice,
      targets,
      headName: group.headName,
      sponsorName: group.sponsorName,
    });
  };

  const handleConfirmCreateNotice = () => {
    if (!noticeModal) return;
    onCreateMemorialService(
      noticeModal.record,
      noticeModal.milestoneType,
      noticeModal.scheduledDate,
      noticeModal.noticeText
    );
    setNoticeModal(null);
  };

  return (
    <div className="space-y-3">
      {/* Top Banner & Mode Toggle */}
      <div className="bg-[#1A1A1A] border-b border-[#D4AF37] p-3.5 sm:p-4 shadow-md flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 font-serif text-[#F9F7F2] no-print">
        <div>
          <div className="flex items-center flex-wrap gap-3">
            <div className="w-8 h-8 bg-[#D4AF37] text-[#1A1A1A] flex items-center justify-center font-bold font-sans text-xs shrink-0">
              過去
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-[#F9F7F2] tracking-wider">過去帳・年回忌（年忌法要）管理</h2>
            <div className="px-2.5 py-1 bg-emerald-950/80 text-emerald-300 border border-emerald-500/60 text-xs font-sans font-bold flex items-center gap-1.5 shadow-xs whitespace-nowrap">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>総レコード数：{pastRecords.length.toLocaleString('ja-JP')}件</span>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-2 font-sans text-xs">
          <button
            onClick={() => setActiveTab('all')}
            className={`px-4 py-2 font-bold tracking-wider uppercase transition-colors flex items-center space-x-1.5 ${
              activeTab === 'all'
                ? 'bg-[#D4AF37] text-[#1A1A1A]'
                : 'bg-[#2A2A2A] text-[#F9F7F2] hover:bg-[#333333] border border-[#444444]'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span>全過去帳名簿</span>
          </button>

          <button
            onClick={() => setActiveTab('daily')}
            className={`px-4 py-2 font-bold tracking-wider uppercase transition-colors flex items-center space-x-1.5 ${
              activeTab === 'daily'
                ? 'bg-[#D4AF37] text-[#1A1A1A]'
                : 'bg-[#2A2A2A] text-[#F9F7F2] hover:bg-[#333333] border border-[#444444]'
            }`}
          >
            <CalendarIcon className="w-4 h-4" />
            <span>日別・供養精霊案内</span>
          </button>

          <button
            onClick={() => setActiveTab('milestones')}
            className={`px-4 py-2 font-bold tracking-wider uppercase transition-colors flex items-center space-x-1.5 ${
              activeTab === 'milestones'
                ? 'bg-[#D4AF37] text-[#1A1A1A]'
                : 'bg-[#2A2A2A] text-[#F9F7F2] hover:bg-[#333333] border border-[#444444]'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>当年・年忌該当一覧</span>
          </button>
        </div>
      </div>

      {/* Tab 1: 年回忌 該当一覧 (対象法要期（年2回発送区分） / 年法要予定) */}
      {activeTab === 'milestones' && (
        <div className="space-y-4">
          {/* Sub-Mode Toggle Bar */}
          <div className="bg-[#FAF9F5] border border-[#D1CEC7] p-2.5 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 shadow-2xs font-sans">
            <div className="flex items-center space-x-1.5">
              <span className="text-xs text-[#555555] font-bold mr-1">表示モード:</span>
              <button
                type="button"
                onClick={() => setMilestoneSubMode('shipping')}
                className={`px-3.5 py-1.5 text-xs font-bold transition-colors flex items-center space-x-1.5 cursor-pointer ${
                  milestoneSubMode === 'shipping'
                    ? 'bg-[#1A1A1A] text-[#D4AF37] shadow-xs'
                    : 'bg-white text-[#444444] hover:bg-[#EAE6DF] border border-[#D1CEC7]'
                }`}
              >
                <Mail className="w-3.5 h-3.5" />
                <span>対象法要期（正月・彼岸・新盆）</span>
              </button>

              <button
                type="button"
                onClick={() => setMilestoneSubMode('yearly')}
                className={`px-3.5 py-1.5 text-xs font-bold transition-colors flex items-center space-x-1.5 cursor-pointer ${
                  milestoneSubMode === 'yearly'
                    ? 'bg-[#1A1A1A] text-[#D4AF37] shadow-xs'
                    : 'bg-white text-[#444444] hover:bg-[#EAE6DF] border border-[#D1CEC7]'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>年法要予定 (精霊ベース)</span>
              </button>
            </div>

            <div className="text-xs text-[#666666] sm:text-right font-serif">
              {milestoneSubMode === 'shipping' ? (
                <span>※ 檀信徒（世帯主）ごとにまとめた発送案内管理モード</span>
              ) : (
                <span>※ 精霊ごとの四十九日・百ヶ日・年回忌予定と予約管理モード</span>
              )}
            </div>
          </div>

          {/* Sub-Mode 1: 対象法要期 (年2回発送区分) - 檀家ベース */}
          {milestoneSubMode === 'shipping' && (
            <div className="space-y-3">
              {/* Higan Period Filter Bar */}
              <div className="bg-white border border-[#D1CEC7] p-4 shadow-sm font-serif space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center space-x-2">
                    <span className="text-xs text-[#1A1A1A] font-bold uppercase tracking-wider font-sans">対象法要期（正月・彼岸・新盆）:</span>
                  </div>
                  <div className="text-xs text-[#444444] font-sans sm:text-right whitespace-nowrap">
                    {currentPeriod.label} 該当当家: <strong className="text-[#1A1A1A] text-sm font-mono font-bold">{householdMilestoneGroups.length}</strong> 檀家
                  </div>
                </div>

                <div className="flex flex-col md:flex-row md:items-end justify-between gap-3 font-sans">
                  <div className="flex flex-wrap gap-2">
                    {higanPeriods.map((period) => {
                      const isUpcomingTarget = period.id === targetUpcomingPeriodId;
                      return (
                        <button
                          key={period.id}
                          onClick={() => setSelectedPeriodId(period.id)}
                          className={`px-3.5 py-1.5 text-xs font-bold transition-colors border flex items-center space-x-1 ${
                            selectedPeriodId === period.id
                              ? 'bg-[#1A1A1A] text-[#D4AF37] border-[#1A1A1A]'
                              : 'bg-[#F9F7F2] text-[#2D2D2D] hover:bg-[#EBE7DF] border-[#D1CEC7]'
                          }`}
                        >
                          <span>{period.label}</span>
                          <span className="text-[10px] opacity-80">({period.periodText})</span>
                          {isUpcomingTarget && (
                            <span className="ml-1 px-1.5 py-0.5 bg-[#D4AF37] text-[#1A1A1A] text-[10px] font-bold rounded-xs">
                              次回発送対象
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* 対象法要期メニューの右側アクションボタン群 */}
                  <div className="flex flex-wrap items-center sm:items-end justify-end gap-1.5 pt-1 md:pt-0">
                    {/* 一括印刷ボタン (チェックが付いた場合に表示) */}
                    {selectedMilestoneHouseholdIds.length > 0 && (
                      <button
                        type="button"
                        onClick={handleNavigateToPrintWithSelected}
                        className="px-3.5 py-1.5 bg-[#1A1A1A] hover:bg-[#333333] text-[#D4AF37] border border-[#D4AF37] text-xs font-bold flex items-center justify-center space-x-1.5 transition-colors shadow-2xs whitespace-nowrap cursor-pointer"
                        title="選択中の世帯を長3封筒・はがき印刷へ"
                      >
                        <Printer className="w-3.5 h-3.5 text-[#D4AF37]" />
                        <span>選択中の {selectedMilestoneHouseholdIds.length} 件を長３封筒・はがき印刷へ</span>
                      </button>
                    )}

                    {/* 表示年忌設定ボタン */}
                    <button
                      type="button"
                      onClick={() => setIsNenkiFilterModalOpen(true)}
                      className="px-3.5 py-1.5 bg-[#FAF9F5] hover:bg-[#1A1A1A] text-[#1A1A1A] hover:text-[#D4AF37] border border-[#D1CEC7] hover:border-[#1A1A1A] text-xs font-bold flex items-center justify-center space-x-1.5 transition-colors shadow-2xs whitespace-nowrap cursor-pointer"
                      title="表示する年回忌（一周忌・三回忌〜各回忌）を絞り込み設定"
                    >
                      <Sliders className="w-3.5 h-3.5 text-[#D4AF37]" />
                      <span>表示年忌設定</span>
                    </button>
                  </div>
                </div>
              </div>

              {householdMilestoneGroups.length === 0 ? (
                <div className="bg-white border border-[#D1CEC7] p-12 text-center text-[#888888] text-xs font-sans">
                  「{currentPeriod.label}」に該当する年回忌データは登録されていません。
                </div>
              ) : (
                <div ref={milestonesScrollRef} className="max-h-[calc(100vh-340px)] min-h-[360px] overflow-y-auto overflow-x-auto relative border border-[#D1CEC7] bg-white shadow-xs font-serif">
                  <table className="w-full text-left text-xs text-[#2D2D2D] border-collapse">
                    <thead className="sticky top-0 z-10 bg-[#1A1A1A] text-[#D4AF37] font-sans uppercase tracking-wider font-bold border-b border-[#D4AF37] shadow-sm select-none">
                      <tr>
                        {/* 全選択チェックボックス */}
                        <th className="sticky top-0 bg-[#1A1A1A] px-2 py-3 w-8 text-center">
                          <button
                            type="button"
                            onClick={handleToggleSelectAllMilestones}
                            className="focus:outline-none cursor-pointer"
                            title="全選択/解除"
                          >
                            {isAllMilestonesSelected ? (
                              <CheckSquare className="w-3.5 h-3.5 text-[#D4AF37] mx-auto" />
                            ) : (
                              <Square className="w-3.5 h-3.5 text-[#888888] mx-auto" />
                            )}
                          </button>
                        </th>
                        <th className="sticky top-0 bg-[#1A1A1A] p-3.5 whitespace-nowrap">檀信徒名</th>
                        <th className="sticky top-0 bg-[#1A1A1A] p-3.5 whitespace-nowrap">予定日</th>
                        <th className="sticky top-0 bg-[#1A1A1A] p-3.5 whitespace-nowrap">回忌</th>
                        <th className="sticky top-0 bg-[#1A1A1A] p-3.5 whitespace-nowrap">戒名</th>
                        <th className="sticky top-0 bg-[#1A1A1A] p-3.5 whitespace-nowrap">他法要予定</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F0EFEA]">
                      {householdMilestoneGroups.map((group, gIdx) => {
                        const { headName, sponsorName, primaryRecord, primaryMilestone, items } = group;
                        const displaySponsor = sponsorName || headName;
                        const householdId = primaryRecord.householdId || group.householdKey;
                        const isSelected = selectedMilestoneHouseholdIds.includes(householdId);

                        return (
                          <tr
                            key={`milestone-group-${group.householdKey}-${gIdx}`}
                            onClick={() => handleToggleSelectMilestone(householdId)}
                            className={`transition-colors cursor-pointer ${
                              isSelected ? 'bg-amber-50/80 hover:bg-amber-100/80' : 'hover:bg-[#F9F7F2]'
                            }`}
                          >
                            {/* 個別チェックボックス */}
                            <td
                              className="px-2 py-3 text-center w-8"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleSelectMilestone(householdId);
                              }}
                            >
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleToggleSelectMilestone(householdId);
                                }}
                                className="focus:outline-none cursor-pointer"
                              >
                                {isSelected ? (
                                  <CheckSquare className="w-3.5 h-3.5 text-[#1A1A1A] mx-auto" />
                                ) : (
                                  <Square className="w-3.5 h-3.5 text-[#888888] mx-auto" />
                                )}
                              </button>
                            </td>
                            {/* 檀信徒名（施主） */}
                            <td className="p-3.5 font-bold text-[#1A1A1A] text-sm whitespace-nowrap">
                              {displaySponsor} 様
                            </td>
                            {/* 予定日 (回忌が近いほうを優先) */}
                            <td className="p-3.5 font-mono font-bold text-[#1A1A1A] text-sm whitespace-nowrap">
                              {formatMonthDayOnly(primaryMilestone.scheduledDate)}
                            </td>
                            {/* 回忌 */}
                            <td className="p-3.5 whitespace-nowrap">
                              <span className="px-2.5 py-1 bg-[#1A1A1A] text-[#D4AF37] font-sans font-bold text-xs uppercase tracking-wider border border-[#D4AF37]/40">
                                {primaryMilestone.type}
                              </span>
                            </td>
                            {/* 戒名 */}
                            <td className="p-3.5 font-bold text-[#1A1A1A] text-sm">
                              {primaryRecord.dharmaName}
                            </td>
                            {/* 他法要予定 (2件以上ある場合は「他法要予定あり（⚫️件）」) */}
                            <td className="p-3.5 whitespace-nowrap font-sans text-xs">
                              {items.length >= 2 ? (
                                <span className="px-2.5 py-1 bg-[#FFF3CD] text-[#856404] border border-[#FFEBAA] font-bold rounded-xs">
                                  他法要予定あり（{items.length}件）
                                </span>
                              ) : (
                                <span className="text-[#888888]">なし</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Sub-Mode 2: 年法要予定 (前年・本年・来年の精霊ベース一覧) */}
          {milestoneSubMode === 'yearly' && (
            <div className="space-y-3">
              {/* Year Selection Bar */}
              <div className="bg-white border border-[#D1CEC7] p-4 shadow-sm font-serif space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center space-x-2">
                    <span className="text-xs text-[#1A1A1A] font-bold uppercase tracking-wider font-sans">対象年（前年・本年・来年）:</span>
                  </div>
                  <div className="text-xs text-[#444444] font-sans sm:text-right whitespace-nowrap">
                    {yearlyTargetYear}年（{getJapaneseEra(yearlyTargetYear)}） 該当精霊: <strong className="text-[#1A1A1A] text-sm font-mono font-bold">{yearlySpirits.length}</strong> 霊位
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 font-sans">
                  <div className="flex flex-wrap gap-2">
                    {[-1, 0, 1].map((offset) => {
                      const baseYear = new Date().getFullYear();
                      const y = baseYear + offset;
                      const era = getJapaneseEra(y);
                      const isSelected = yearlyTargetYear === y;
                      const tagLabel = offset === -1 ? '前年' : offset === 0 ? '本年 (現在)' : '来年';

                      return (
                        <button
                          key={y}
                          type="button"
                          onClick={() => {
                            shouldAutoScrollRef.current = false;
                            setYearlyTargetYear(y);
                          }}
                          className={`px-4 py-2 text-xs font-bold transition-all border flex items-center space-x-2 cursor-pointer ${
                            isSelected
                              ? 'bg-[#1A1A1A] text-[#D4AF37] border-[#1A1A1A] shadow-xs'
                              : 'bg-[#F9F7F2] text-[#2D2D2D] hover:bg-[#EBE7DF] border-[#D1CEC7]'
                          }`}
                        >
                          <span className={`px-1.5 py-0.5 text-[10px] rounded-xs ${
                            isSelected ? 'bg-[#D4AF37] text-[#1A1A1A]' : 'bg-[#E5E2DC] text-[#444444]'
                          }`}>
                            {tagLabel}
                          </span>
                          <span className="font-serif text-sm">{era}</span>
                          <span className="font-mono text-xs opacity-80">({y}年)</span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsNenkiFilterModalOpen(true)}
                      className="px-3.5 py-2 text-xs font-bold text-stone-700 bg-white hover:bg-stone-50 rounded border border-stone-300 shadow-xs flex items-center space-x-1.5 transition-colors cursor-pointer"
                      title="表示する年回忌（一周忌・三回忌〜各回忌）を絞り込み設定"
                    >
                      <Sliders className="w-3.5 h-3.5 text-[#D4AF37]" />
                      <span>表示年忌設定</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsYearlyPrintModalOpen(true)}
                      className="px-4 py-2 text-xs font-bold text-white bg-stone-900 hover:bg-stone-800 rounded shadow-xs flex items-center space-x-1.5 transition-colors cursor-pointer"
                      title="年回忌案内（精霊年会表）をA4/A3縦書きで印刷プレビュー"
                    >
                      <Printer className="w-3.5 h-3.5 text-[#D4AF37]" />
                      <span>年回忌印刷</span>
                    </button>
                  </div>
                </div>
              </div>

              {yearlySpirits.length === 0 ? (
                <div className="bg-white border border-[#D1CEC7] p-12 text-center text-[#888888] text-xs font-sans">
                  {yearlyTargetYear}年（{getJapaneseEra(yearlyTargetYear)}）に該当する法要精霊（四十九日・百ヶ日・年回忌）は登録されていません。
                </div>
              ) : (
                <div ref={yearlySpiritsScrollRef} className="max-h-[calc(100vh-340px)] min-h-[360px] overflow-y-auto overflow-x-auto relative border border-[#D1CEC7] bg-white shadow-xs font-serif">
                  <table className="w-full text-left text-xs text-[#2D2D2D] border-collapse">
                    <thead className="sticky top-0 z-10 bg-[#1A1A1A] text-[#D4AF37] font-sans uppercase tracking-wider font-bold border-b border-[#D4AF37] shadow-sm">
                      <tr>
                        <th className="sticky top-0 bg-[#1A1A1A] p-3.5 whitespace-nowrap">予定日</th>
                        <th className="sticky top-0 bg-[#1A1A1A] p-3.5 whitespace-nowrap">回忌・忌日区分</th>
                        <th className="sticky top-0 bg-[#1A1A1A] p-3.5 whitespace-nowrap">戒名（法名）</th>
                        <th className="sticky top-0 bg-[#1A1A1A] p-3.5 whitespace-nowrap">俗名</th>
                        <th className="sticky top-0 bg-[#1A1A1A] p-3.5 whitespace-nowrap">命日 (没年月日)</th>
                        <th className="sticky top-0 bg-[#1A1A1A] p-3.5 whitespace-nowrap">施主・檀信徒名</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F0EFEA]">
                      {yearlySpirits.map((spirit) => {
                        const household = householdMap.get(spirit.record.householdId);
                        const headName = household?.familyHead || spirit.record.householdHeadName || '未設定';
                        const sponsorName = getHouseholdSponsorName(household) || headName;
                        const district = household?.district || '';

                        const isChuinOr100Days = spirit.memorialType === '四十九日忌' || spirit.memorialType === '百ヶ日忌';

                        const isHighlighted = highlightedSpiritId === spirit.id;

                        return (
                          <tr
                            key={spirit.id}
                            id={`yearly-spirit-row-${spirit.id}`}
                            data-spirit-id={spirit.id}
                            className={`transition-all ${
                              isHighlighted
                                ? 'bg-[#FFFBEB] ring-2 ring-[#D4AF37] shadow-md'
                                : 'hover:bg-[#F9F7F2]'
                            }`}
                          >
                            {/* 予定日 */}
                            <td className="p-3.5 font-mono font-bold text-[#1A1A1A] text-sm whitespace-nowrap">
                              {spirit.scheduledDate}
                            </td>
                            {/* 回忌・忌日区分 */}
                            <td className="p-3.5 whitespace-nowrap">
                              <span className={`px-2.5 py-1 font-sans font-bold text-xs uppercase tracking-wider border ${
                                spirit.memorialType === '四十九日忌'
                                  ? 'bg-[#1E3A8A] text-white border-[#1E3A8A]'
                                  : spirit.memorialType === '百ヶ日忌'
                                  ? 'bg-[#065F46] text-white border-[#065F46]'
                                  : 'bg-[#1A1A1A] text-[#D4AF37] border-[#D4AF37]/40'
                              }`}>
                                {spirit.memorialType}
                              </span>
                            </td>
                            {/* 戒名 */}
                            <td className="p-3.5 font-bold text-[#1A1A1A] text-sm">
                              {spirit.record.dharmaName || '（未登録）'}
                            </td>
                            {/* 俗名 */}
                            <td className="p-3.5 text-[#444444] text-xs">
                              {spirit.record.secularName || 'ー'}
                            </td>
                            {/* 命日 */}
                            <td className="p-3.5 font-mono text-xs text-[#555555] whitespace-nowrap">
                              {spirit.deathDateNormalized}
                              <span className="block text-[10px] text-[#888888] font-serif">
                                {formatJapaneseEraDate(spirit.deathDateNormalized, true)}
                              </span>
                            </td>
                            {/* 施主・檀信徒名 */}
                            <td className="p-3.5 font-bold text-[#1A1A1A] text-sm whitespace-nowrap">
                              {sponsorName} 様
                              {district && (
                                <span className="ml-1.5 px-1.5 py-0.5 bg-[#EAE6DF] text-[#444444] font-normal text-[10px] font-sans">
                                  {district}
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: 全過去帳名簿 (テーブル表示) */}
      {activeTab === 'all' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 font-sans">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-3 text-[#888888]" />
              <input
                type="text"
                placeholder="戒名・当時の施主名・続柄・俗名で過去帳検索..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-white border border-[#D1CEC7] pl-9 pr-4 py-2 text-[#2D2D2D] text-xs sm:text-sm focus:border-[#1A1A1A] focus:outline-none"
              />
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={handleOpenAddModal}
                className="px-4 py-2 bg-[#D4AF37] hover:bg-[#c29f2f] text-[#1A1A1A] font-bold text-xs uppercase tracking-wider transition-colors flex items-center justify-center space-x-1.5 shadow-sm whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                <span>+ 新規過去帳登録</span>
              </button>
            </div>
          </div>

          <div ref={allRecordsScrollRef} className="max-h-[calc(100vh-320px)] min-h-[400px] overflow-y-auto overflow-x-auto relative border border-[#D1CEC7] bg-white shadow-xs font-serif">
            <table className="w-full text-left text-xs text-[#2D2D2D] border-collapse table-auto">
              <thead className="sticky top-0 z-10 bg-[#1A1A1A] text-[#F9F7F2] font-sans uppercase tracking-wider font-bold border-b border-[#D4AF37] shadow-sm">
                <tr>
                  <th className="sticky top-0 bg-[#1A1A1A] px-2.5 py-3 whitespace-nowrap w-[110px]">命日</th>
                  <th className="sticky top-0 bg-[#1A1A1A] px-4 py-3 whitespace-nowrap min-w-[240px] text-left">戒名</th>
                  <th className="sticky top-0 bg-[#1A1A1A] px-2 py-3 whitespace-nowrap w-[100px]">現在の施主名</th>
                  <th className="sticky top-0 bg-[#1A1A1A] px-2 py-3 whitespace-nowrap w-[100px]">当時の施主名</th>
                  <th className="sticky top-0 bg-[#1A1A1A] px-1 py-3 whitespace-nowrap w-[60px] text-center">続柄</th>
                  <th className="sticky top-0 bg-[#1A1A1A] px-1 py-3 whitespace-nowrap w-[85px]">俗名</th>
                  <th className="sticky top-0 bg-[#1A1A1A] px-1 py-3 whitespace-nowrap w-[50px] text-center">享年</th>
                  <th className="sticky top-0 bg-[#1A1A1A] px-2 py-3 whitespace-nowrap w-[85px] text-center">新盆</th>
                  <th className="sticky top-0 bg-[#1A1A1A] px-2.5 py-3 text-right font-sans whitespace-nowrap w-[70px]">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0EFEA]">
                {sortedAllRecords.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-8 text-center text-[#888888] font-sans">
                      登録されている過去帳データがありません。
                    </td>
                  </tr>
                ) : (
                  <>
                    {kakochoTopSpacerHeight > 0 && (
                      <tr style={{ height: `${kakochoTopSpacerHeight}px` }} aria-hidden="true">
                        <td colSpan={9} style={{ height: `${kakochoTopSpacerHeight}px`, padding: 0, border: 0 }} />
                      </tr>
                    )}
                    {kakochoVirtualIndices.map((rIdx) => {
                      const record = sortedAllRecords[rIdx];
                      if (!record) return null;
                      const isEditingThisRecord = editingRecordId === record.id && inlineRecordForm;

                      if (isEditingThisRecord && inlineRecordForm) {
                      return (
                        <React.Fragment key={`kakocho-rec-${record.id || rIdx}-${rIdx}`}>
                          <tr className="bg-[#FFFDF0] font-sans">
                            {/* 1. 命日 (編集時) */}
                            <td className="px-2 py-1.5">
                              <input
                                type="text"
                                value={inlineRecordForm.deathDate || ''}
                                onChange={(e) => setInlineRecordForm({ ...inlineRecordForm, deathDate: e.target.value })}
                                onFocus={(e) => e.target.select()}
                                onBlur={(e) => {
                                  const normalized = normalizeDateInput(e.target.value, { mode: 'pastRecord' });
                                  if (normalized) {
                                    setInlineRecordForm({ ...inlineRecordForm, deathDate: formatJapaneseEraDate(normalized, false) });
                                  }
                                }}
                                onKeyDown={(e) => { if (e.key === 'Enter') handleSaveInlineRecord(); }}
                                placeholder="例: 20260607, 2026.6.7, 令和8年6月7日"
                                className="w-full bg-white border border-[#1A1A1A] p-1 text-xs font-mono font-bold"
                              />
                            </td>
                            {/* 2. 戒名 (編集時) */}
                            <td className="px-3 py-1.5">
                              <input
                                type="text"
                                value={inlineRecordForm.dharmaName || ''}
                                onChange={(e) => setInlineRecordForm({ ...inlineRecordForm, dharmaName: e.target.value })}
                                onKeyDown={(e) => { if (e.key === 'Enter') handleSaveInlineRecord(); }}
                                placeholder="戒名"
                                className="w-full bg-white border border-[#1A1A1A] p-1 text-xs font-serif font-bold text-sm"
                              />
                            </td>
                            {/* 3. 現在の施主名 (檀家ID入力 & 現在の施主連動表示) */}
                            <td className="px-2 py-1.5">
                              <div className="space-y-1">
                                <input
                                  type="text"
                                  value={inlineRecordForm.householdId || ''}
                                  onChange={(e) => setInlineRecordForm({ ...inlineRecordForm, householdId: e.target.value })}
                                  onKeyDown={(e) => { if (e.key === 'Enter') handleSaveInlineRecord(); }}
                                  placeholder="檀家ID (例: 1001)"
                                  className="w-full bg-white border border-[#1A1A1A] p-1 text-xs font-mono font-bold"
                                />
                                <div className="text-[11px] font-bold text-[#555555] bg-[#EBE7DF] p-1 border border-[#D1CEC7]">
                                  {getHouseholdSponsorName(households.find((h) => h.id === inlineRecordForm.householdId))
                                    ? getHouseholdSponsorName(households.find((h) => h.id === inlineRecordForm.householdId))
                                    : '（世帯未設定/該当なし）'}
                                </div>
                              </div>
                            </td>
                            {/* 4. 当時の施主名 (編集時) */}
                            <td className="px-2 py-1.5">
                              <input
                                type="text"
                                value={inlineRecordForm.householdHeadName || ''}
                                onChange={(e) => setInlineRecordForm({ ...inlineRecordForm, householdHeadName: e.target.value })}
                                onKeyDown={(e) => { if (e.key === 'Enter') handleSaveInlineRecord(); }}
                                placeholder="当時の施主名"
                                className="w-full bg-white border border-[#1A1A1A] p-1 text-xs font-bold"
                              />
                            </td>
                            {/* 続柄 (編集時) */}
                            <td className="px-1 py-1.5">
                              <input
                                type="text"
                                value={inlineRecordForm.relationship || ''}
                                onChange={(e) => setInlineRecordForm({ ...inlineRecordForm, relationship: e.target.value })}
                                onKeyDown={(e) => { if (e.key === 'Enter') handleSaveInlineRecord(); }}
                                placeholder="続柄"
                                className="w-full bg-white border border-[#1A1A1A] p-1 text-xs text-center"
                              />
                            </td>
                            {/* 俗名 (編集時) */}
                            <td className="px-1 py-1.5">
                              <input
                                type="text"
                                value={inlineRecordForm.secularName || ''}
                                onChange={(e) => setInlineRecordForm({ ...inlineRecordForm, secularName: e.target.value })}
                                onKeyDown={(e) => { if (e.key === 'Enter') handleSaveInlineRecord(); }}
                                placeholder="俗名"
                                className="w-full bg-white border border-[#1A1A1A] p-1 text-xs"
                              />
                            </td>
                             {/* 享年 (編集時) */}
                            <td className="px-1 py-1.5">
                              <input
                                type="number"
                                value={inlineRecordForm.ageAtDeath !== undefined && inlineRecordForm.ageAtDeath !== null ? inlineRecordForm.ageAtDeath : ''}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setInlineRecordForm({ ...inlineRecordForm, ageAtDeath: val === '' ? undefined : Number(val) });
                                }}
                                onKeyDown={(e) => { if (e.key === 'Enter') handleSaveInlineRecord(); }}
                                className="w-full bg-white border border-[#1A1A1A] p-1 text-xs font-mono text-center"
                              />
                            </td>
                            {/* 新盆 (編集時) */}
                            <td className="px-2 py-1.5">
                              <input
                                type="text"
                                value={inlineRecordForm.niibon || ''}
                                onChange={(e) => setInlineRecordForm({ ...inlineRecordForm, niibon: e.target.value })}
                                onKeyDown={(e) => { if (e.key === 'Enter') handleSaveInlineRecord(); }}
                                placeholder="例: 令和8年新盆"
                                className="w-full bg-white border border-[#1A1A1A] p-1 text-xs font-bold text-amber-900"
                              />
                            </td>
                            {/* 操作 (編集時) */}
                            <td className="px-2.5 py-1.5 text-right whitespace-nowrap space-x-1">
                              <button
                                onClick={handleSaveInlineRecord}
                                className="px-2.5 py-1 bg-[#D4AF37] hover:bg-[#c29f2f] text-[#1A1A1A] font-bold text-xs inline-flex items-center space-x-1 shadow-sm"
                              >
                                <Save className="w-3 h-3" />
                                <span>保存</span>
                              </button>
                              <button
                                onClick={handleCancelInlineEdit}
                                className="px-2 py-1 bg-white border border-[#D1CEC7] text-[#1A1A1A] font-bold text-xs hover:bg-[#EBE7DF]"
                              >
                                <span>取消</span>
                              </button>
                            </td>
                          </tr>
                          <tr className="bg-[#FFFDF0] font-sans">
                            <td colSpan={9} className="p-2 border-t border-dashed border-[#D1CEC7]">
                              <div className="flex flex-col sm:flex-row items-center gap-3">
                                <div className="flex-1 w-full flex items-center space-x-1.5">
                                  <span className="font-bold text-xs text-[#1A1A1A] whitespace-nowrap">備考:</span>
                                  <input
                                    type="text"
                                    value={inlineRecordForm.notes || ''}
                                    onChange={(e) => setInlineRecordForm({ ...inlineRecordForm, notes: e.target.value })}
                                    onKeyDown={(e) => { if (e.key === 'Enter') handleSaveInlineRecord(); }}
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

                    const currentSponsor = getHouseholdSponsorName(households.find((h) => h.id === record.householdId));

                    return (
                      <React.Fragment key={`kakocho-rec-${record.id || rIdx}-${rIdx}`}>
                        <tr
                          onDoubleClick={() => handleStartInlineEdit(record)}
                          className="hover:bg-[#F9F7F2] transition-colors cursor-pointer"
                          title="ダブルクリックで行のまま直接編集"
                        >
                          {/* 1. 命日 */}
                          <td className="px-2.5 py-3 font-bold text-[#1A1A1A] whitespace-nowrap">
                            {record.deathDate ? formatJapaneseEraDate(record.deathDate, false) : (
                              <span className="text-[#8C2D19] font-serif font-bold tracking-widest">逆　修</span>
                            )}
                          </td>
                          {/* 2. 戒名 */}
                          <td className="px-4 py-3 font-bold text-[#1A1A1A] text-sm tracking-wide">
                            {record.dharmaName}
                          </td>
                          {/* 3. 現在の施主名 */}
                          <td className="px-2 py-3 font-bold text-[#1A1A1A] whitespace-nowrap">
                            {currentSponsor ? currentSponsor : '—'}
                          </td>
                          {/* 4. 当時の施主名 */}
                          <td className="px-2 py-3 font-bold text-[#1A1A1A] whitespace-nowrap">
                            {record.householdHeadName || '—'}
                          </td>
                          {/* 続柄 (前後の余白を狭めて配置) */}
                          <td className="px-1 py-3 font-sans text-[#555555] whitespace-nowrap text-center">
                            {record.relationship || '—'}
                          </td>
                          {/* 俗名 */}
                          <td className="px-1 py-3 text-[#444444] font-sans whitespace-nowrap">
                            {record.secularName || '—'}
                          </td>
                          {/* 享年 (俗名との間を狭めて配置) */}
                          <td className="px-1 py-3 font-mono text-[#555555] whitespace-nowrap text-center">
                            {record.ageAtDeath ? `${record.ageAtDeath}歳` : '—'}
                          </td>
                          {/* 新盆 (当該年度と次年度のみ表示) */}
                          <td className="px-2 py-3 whitespace-nowrap text-center">
                            {isRelevantNiibon(record.niibon, record.deathDate, templeInfo?.bonSeason || '8月盆') ? (
                              <span className="inline-flex items-center px-1.5 py-0.5 text-[11px] font-bold bg-amber-50 text-amber-900 border border-amber-300">
                                {record.niibon && record.niibon.trim() !== ''
                                  ? record.niibon
                                  : calculateNiibonFromDeathDate(record.deathDate, templeInfo?.bonSeason || '8月盆')}
                              </span>
                            ) : (
                              <span className="text-[#AAAAAA] font-sans text-xs">—</span>
                            )}
                          </td>
                          {/* 操作 */}
                          <td className="px-2.5 py-3 text-right space-x-1 font-sans whitespace-nowrap">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenEditModal(record);
                              }}
                              className="p-1.5 text-[#1A1A1A] hover:bg-[#EBE7DF] transition-colors"
                              title="編集"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteTargetRecord(record);
                              }}
                              className="p-1.5 text-rose-700 hover:bg-rose-50 transition-colors"
                              title="削除"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                        {record.notes && record.notes.trim() !== '' && (
                          <tr className="bg-[#FAF9F5] border-t-0">
                            <td colSpan={9} className="px-3.5 py-1.5 text-[#555555] font-sans pl-8 text-xs border-b border-[#EBE7DF]">
                              <span className="font-bold text-[#1A1A1A] mr-2">【備考】</span>{record.notes}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                  {kakochoBottomSpacerHeight > 0 && (
                    <tr style={{ height: `${kakochoBottomSpacerHeight}px` }} aria-hidden="true">
                      <td colSpan={9} style={{ height: `${kakochoBottomSpacerHeight}px`, padding: 0, border: 0 }} />
                    </tr>
                  )}
                </>
              )}
            </tbody>
              </table>
            </div>
        </div>
      )}

      {/* Tab 2: 日別・供養精霊案内 */}
      {activeTab === 'daily' && (
        <DailyMemorialList
          pastRecords={pastRecords}
          allPastRecords={allPastRecords}
          households={households}
          allHouseholds={allHouseholds}
          temples={temples}
          activeTempleId={activeTempleId}
        />
      )}

      {/* Polite Notice Preview Modal */}
      {noticeModal && (
        <div className="fixed inset-0 z-50 bg-[#1A1A1A]/80 backdrop-blur-xs flex items-center justify-center p-4 font-serif">
          <div className="bg-white border border-[#D1CEC7] p-6 max-w-2xl w-full text-[#2D2D2D] space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-[#D1CEC7] pb-3">
              <div className="flex items-center space-x-2">
                <FileText className="w-5 h-5 text-[#D4AF37]" />
                <h3 className="text-base font-bold text-[#1A1A1A]">
                  法要案内文の確認・作成
                </h3>
              </div>
              <button onClick={() => setNoticeModal(null)} className="text-[#888888] hover:text-[#1A1A1A]">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-[#F9F7F2] p-3 border border-[#EBE7DF] text-xs font-sans space-y-1.5">
              <div className="flex flex-wrap justify-between items-center gap-2 text-[#444444]">
                <div className="flex items-center space-x-2">
                  <span>宛先（世帯主）: <strong className="text-[#1A1A1A] font-bold">{noticeModal.headName}様</strong></span>
                  {noticeModal.sponsorName && noticeModal.sponsorName !== noticeModal.headName && (
                    <span className="text-[#8C2D19] font-bold">（施主: {noticeModal.sponsorName}様）</span>
                  )}
                </div>
                <div>当期発送区分: <strong className="text-[#1A1A1A]">{currentPeriod.label}</strong></div>
              </div>
              <div className="border-t border-[#EBE7DF] pt-1.5">
                <div className="text-[11px] font-bold text-[#555555] mb-1">当期該当の精霊（故人 {noticeModal.targets.length}柱）:</div>
                <div className="space-y-1">
                  {noticeModal.targets.map((t, idx) => (
                    <div key={idx} className="flex items-center justify-between text-[#1A1A1A] bg-white p-1.5 border border-[#E0DDD5]">
                      <div>
                        <span className="font-serif font-bold text-sm">{t.dharmaName}</span>
                        {t.secularName && <span className="text-[#666666] ml-1">({t.secularName})</span>}
                      </div>
                      <div className="font-mono text-[11px] text-[#444444]">
                        <span className="px-1.5 py-0.5 bg-[#1A1A1A] text-[#D4AF37] font-bold mr-1.5">{t.memorialType}</span>
                        {formatMonthDayOnly(t.scheduledDateStr)} ({formatJapaneseEraDate(t.scheduledDateStr, false)})
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="font-sans space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="block text-xs font-bold text-[#1A1A1A]">生成された丁寧な案内本文 (編集可能):</label>
                <button
                  type="button"
                  onClick={() => setIsTemplateModalOpen(true)}
                  className="text-xs text-[#555555] hover:text-[#1A1A1A] flex items-center space-x-1 underline"
                >
                  <Sliders className="w-3 h-3 text-[#D4AF37]" />
                  <span>テンプレート設定</span>
                </button>
              </div>
              <textarea
                rows={10}
                value={noticeModal.noticeText}
                onChange={(e) => setNoticeModal({ ...noticeModal, noticeText: e.target.value })}
                className="w-full bg-[#F9F7F2] border border-[#D1CEC7] p-3 text-xs text-[#2D2D2D] font-serif leading-relaxed focus:border-[#1A1A1A] focus:outline-none"
              ></textarea>
            </div>

            <div className="flex justify-end space-x-2 pt-3 border-t border-[#D1CEC7] font-sans">
              <button
                onClick={() => setNoticeModal(null)}
                className="px-4 py-2 bg-[#F9F7F2] border border-[#D1CEC7] text-[#444444] font-bold text-xs hover:bg-[#EBE7DF]"
              >
                キャンセル
              </button>

              <button
                onClick={handleConfirmCreateNotice}
                className="px-5 py-2 bg-[#1A1A1A] hover:bg-[#333333] text-[#D4AF37] border border-[#D4AF37] font-bold text-xs uppercase tracking-wider flex items-center space-x-1.5"
              >
                <Printer className="w-4 h-4 text-[#D4AF37]" />
                <span>はがき印刷へ進む</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit / New Past Record Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-[#1A1A1A]/80 backdrop-blur-xs flex items-center justify-center p-4 font-serif">
          <div className="bg-white border border-[#D1CEC7] p-6 max-w-xl w-full text-[#2D2D2D] space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-[#D1CEC7] pb-3">
              <h3 className="text-base font-bold text-[#1A1A1A]">
                {editingRecord ? '過去帳データの編集' : '新規過去帳データの登録'}
              </h3>
              <button
                type="button"
                onClick={handleRequestClose}
                className="text-[#888888] hover:text-[#1A1A1A] p-1 transition-colors cursor-pointer"
                title="閉じる"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveModal} className="space-y-4 font-sans text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* 1. 檀家ID (入力可能) */}
                <div>
                  <label className="block font-bold text-[#1A1A1A] mb-1">檀家ID (世帯ID):</label>
                  <input
                    type="text"
                    value={formData.householdId || ''}
                    onChange={(e) => setFormData({ ...formData, householdId: e.target.value })}
                    placeholder="例: 1001"
                    className="w-full bg-[#F9F7F2] border border-[#D1CEC7] p-2 text-xs font-bold font-mono"
                  />
                </div>

                {/* 1. 現在の施主名 (自動連動表示・入力不可) */}
                <div>
                  <label className="block font-bold text-[#1A1A1A] mb-1">現在の施主名 (自動表示・入力不可):</label>
                  <input
                    type="text"
                    value={
                      households.find((h) => h.id === formData.householdId)?.familyHead
                        ? `${households.find((h) => h.id === formData.householdId)?.familyHead} 様`
                        : '（該当する世帯なし）'
                    }
                    disabled
                    readOnly
                    className="w-full bg-[#EBE7DF] border border-[#D1CEC7] p-2 text-xs font-bold text-[#555555] cursor-not-allowed"
                  />
                </div>

                {/* 2. 命日 */}
                <div>
                  <label className="block font-bold text-[#1A1A1A] mb-1">命日 (年月日):</label>
                  <input
                    type="text"
                    value={formData.deathDate || ''}
                    onChange={(e) => setFormData({ ...formData, deathDate: e.target.value })}
                    onFocus={(e) => e.target.select()}
                    onBlur={(e) => {
                      const normalized = normalizeDateInput(e.target.value, { mode: 'pastRecord' });
                      if (normalized) {
                        setFormData({ ...formData, deathDate: formatJapaneseEraDate(normalized, false) });
                      }
                    }}
                    placeholder="例: 20260607, 2026.6.7, 令和8年6月7日"
                    className="w-full bg-[#F9F7F2] border border-[#D1CEC7] p-2 text-xs font-mono font-bold"
                  />
                </div>

                {/* 2. 戒名 */}
                <div>
                  <label className="block font-bold text-[#1A1A1A] mb-1">戒名・法名:</label>
                  <input
                    type="text"
                    value={formData.dharmaName || ''}
                    onChange={(e) => setFormData({ ...formData, dharmaName: e.target.value })}
                    placeholder="例: 慈光院釈道修居士"
                    className="w-full bg-[#F9F7F2] border border-[#D1CEC7] p-2 text-xs font-serif font-bold text-sm"
                  />
                </div>

                {/* 3. 当時の施主名 */}
                <div>
                  <label className="block font-bold text-[#1A1A1A] mb-1">当時の施主名 (故人逝去時):</label>
                  <input
                    type="text"
                    value={formData.householdHeadName || ''}
                    onChange={(e) => setFormData({ ...formData, householdHeadName: e.target.value })}
                    placeholder="例: 山田勝三"
                    className="w-full bg-[#F9F7F2] border border-[#D1CEC7] p-2 text-xs font-bold"
                  />
                </div>

                {/* 3. 続柄 */}
                <div>
                  <label className="block font-bold text-[#1A1A1A] mb-1">続柄:</label>
                  <input
                    type="text"
                    value={formData.relationship || ''}
                    onChange={(e) => setFormData({ ...formData, relationship: e.target.value })}
                    placeholder="例: 父, 母, 祖父"
                    className="w-full bg-[#F9F7F2] border border-[#D1CEC7] p-2 text-xs"
                  />
                </div>

                {/* 4. 俗名 */}
                <div>
                  <label className="block font-bold text-[#1A1A1A] mb-1">俗名:</label>
                  <input
                    type="text"
                    value={formData.secularName || ''}
                    onChange={(e) => setFormData({ ...formData, secularName: e.target.value })}
                    placeholder="例: 山田太郎"
                    className="w-full bg-[#F9F7F2] border border-[#D1CEC7] p-2 text-xs"
                  />
                </div>

                {/* 4. 享年 */}
                <div>
                  <label className="block font-bold text-[#1A1A1A] mb-1">享年/行年:</label>
                  <input
                    type="number"
                    value={formData.ageAtDeath !== undefined && formData.ageAtDeath !== null ? formData.ageAtDeath : ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      setFormData({ ...formData, ageAtDeath: val === '' ? undefined : Number(val) });
                    }}
                    placeholder="未記入可（空欄）"
                    className="w-full bg-[#F9F7F2] border border-[#D1CEC7] p-2 text-xs font-mono"
                  />
                </div>

                {/* 5. 納骨・墓地位置 */}
                <div className="sm:col-span-2">
                  <label className="block font-bold text-[#1A1A1A] mb-1">納骨・墓地位置:</label>
                  <input
                    type="text"
                    value={formData.burialLocation || ''}
                    onChange={(e) => setFormData({ ...formData, burialLocation: e.target.value })}
                    placeholder="例: A区-12"
                    className="w-full bg-[#F9F7F2] border border-[#D1CEC7] p-2 text-xs"
                  />
                </div>
              </div>

              {/* 6. 備考・特記事項 */}
              <div>
                <label className="block font-bold text-[#1A1A1A] mb-1">備考・特記事項:</label>
                <textarea
                  rows={2}
                  value={formData.notes || ''}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="特記事項等"
                  className="w-full bg-[#F9F7F2] border border-[#D1CEC7] p-2 text-xs"
                ></textarea>
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-[#D1CEC7]">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 bg-[#F9F7F2] border border-[#D1CEC7] text-[#444444] font-bold text-xs hover:bg-[#EBE7DF] cursor-pointer"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#1A1A1A] hover:bg-[#333333] text-[#D4AF37] border border-[#D4AF37] font-bold text-xs uppercase tracking-wider cursor-pointer"
                >
                  保存する
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Past Record Save Confirmation Modal */}
      <SaveConfirmModal
        isOpen={showPastRecordSaveConfirm}
        title="過去帳データの保存確認"
        message="編集中の過去帳データを保存しますか？"
        description="「保存して閉じる」を押すと、入力した故人情報・法名・没年月日・新盆年次などを反映して保存します。「保存せずに閉じる」を押すと今回の編集は破棄されます。"
        onSaveAndClose={executeSaveAndClose}
        onDiscardAndClose={() => {
          setShowPastRecordSaveConfirm(false);
          setShowModal(false);
        }}
        onCancel={() => setShowPastRecordSaveConfirm(false)}
      />

      {/* Postcard Notice Template Settings Modal (官製はがき用) */}
      <PostcardTemplateModal
        isOpen={isTemplateModalOpen}
        onClose={() => setIsTemplateModalOpen(false)}
        templeInfo={templeInfo}
        onTemplatesUpdated={(updatedTemplates) => {
          if (updatedTemplates && onSaveNoticeTemplates) {
            onSaveNoticeTemplates(updatedTemplates);
          }
          if (noticeModal) {
            const reGenerated = generatePoliteMemorialNoticeText(
              noticeModal.targets,
              currentPeriod?.label || '',
              noticeModal.headName,
              templeInfo
            );
            setNoticeModal({ ...noticeModal, noticeText: reGenerated });
          }
        }}
      />

      {/* Segaki Toba Patron Output Modal */}
      {showSegakiPatronModal && (
        <SegakiPatronModal
          isOpen={showSegakiPatronModal}
          onClose={() => setShowSegakiPatronModal(false)}
          households={households}
          pastRecords={pastRecords}
          templeName={templeInfo?.name}
          bonSeason={templeInfo?.bonSeason || '8月盆'}
        />
      )}

      {/* Nenki Display Settings Modal (表示年忌設定) */}
      <NenkiFilterModal
        isOpen={isNenkiFilterModalOpen}
        onClose={() => setIsNenkiFilterModalOpen(false)}
        settings={nenkiSettings}
        onSaveSettings={handleSaveNenkiSettings}
      />

      {/* Yearly Memorial Service Spirits Print Modal (年回忌案内・精霊年会表) */}
      {isYearlyPrintModalOpen && (
        <YearlyMemorialPrintModal
          isOpen={isYearlyPrintModalOpen}
          onClose={() => setIsYearlyPrintModalOpen(false)}
          targetYear={yearlyTargetYear}
          pastRecords={pastRecords}
          allPastRecords={allPastRecords}
          households={households}
          allHouseholds={allHouseholds}
          templeName={templeInfo?.name}
          templeInfo={templeInfo}
          temples={temples}
          activeTempleId={activeTempleId}
          nenkiSettings={nenkiSettings}
        />
      )}

      {/* Delete Confirmation Modal */}
      <DeleteConfirmModal
        isOpen={!!deleteTargetRecord}
        title="過去帳データの削除"
        message="削除しますか？"
        itemName={deleteTargetRecord ? `${deleteTargetRecord.dharmaName} 様` : undefined}
        onConfirm={() => {
          if (deleteTargetRecord) {
            onDeletePastRecord(deleteTargetRecord.id);
            setDeleteTargetRecord(null);
          }
        }}
        onCancel={() => setDeleteTargetRecord(null)}
      />
    </div>
  );
};
