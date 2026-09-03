import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Header } from './components/Header';
import { HouseholdList } from './components/HouseholdList';
import { HouseholdModal } from './components/HouseholdModal';
import { KakochoList } from './components/KakochoList';
import { MemorialServiceManager } from './components/MemorialServiceManager';
import { ReservationCalendarManager } from './components/ReservationCalendarManager';
import { PrintEngine } from './components/PrintEngine';
import { AccountingManager } from './components/AccountingManager';
import { DailyMemorialList } from './components/DailyMemorialList';
import { TempleInfoModal } from './components/TempleInfoModal';
import { MasterOptionsModal } from './components/MasterOptionsModal';
import { GoogleSheetsModal } from './components/GoogleSheetsModal';
import { GoogleSheetsUndoInterruptModal } from './components/GoogleSheetsUndoInterruptModal';
import { ExternalDataImportModal } from './components/ExternalDataImportModal';
import { MobileApp } from './components/mobile/MobileApp';
import { StartupLauncher } from './components/StartupLauncher';

import { FamilyManager } from './components/FamilyManager';

import { initAuth, getAccessToken, googleSignIn, isAuthError } from './lib/googleAuth';
import { 
  findOrCreateSpreadsheet, 
  exportToSheets, 
  exportSpecificTablesToSheets, 
  importFromSheets, 
  clearAllSpreadsheetData, 
  deleteAllExistingSpreadsheetsByName,
  createNewSpreadsheet,
  SPREADSHEET_NAME,
  isNotFoundError,
  SheetsImportResult 
} from './lib/googleSheets';
import { mergeDatasetsWithAuditPriority, MergedDatasetResult } from './utils/syncMergeUtils';
import { exportToExcel, importFromExcel } from './utils/excelUtils';
import { ImportTargetType } from './utils/externalImportUtils';
import { mergeMasterOptionsWithData, getTempleMasterOptions, mergeAllTempleMasterOptions } from './utils/masterOptionsUtils';
import { 
  getSavedBatchAccountingData, 
  getSavedBatchAccountingConfig,
  saveBatchAccountingData, 
  saveBatchAccountingConfig,
  clearBatchAccountingData,
  clearBatchAccountingEntries 
} from './utils/batchAccountingUtils';

import {
  safeStorage,
  saveJsonState,
  loadJsonState,
  idbGet,
  idbSet,
  idbRemove,
  idbClear
} from './utils/storageUtils';

import {
  Household,
  PastRecord,
  MemorialService,
  Transaction,
  TempleInfo,
  TempleProfile,
  MasterOptions,
  FamilyMember,
  AppSnapshot,
  TempleTodo,
  Priest,
  DeletedRecordEntry,
  BatchAccountingData
} from './types';
import {
  getSavedNoticeTemplates,
  saveNoticeTemplates,
  calculateNiibonFromDeathDate,
  sortHouseholds,
  normalizeDateInput,
  NoticeTemplateItem,
  MemorialNoticeTarget,
  generateHiganPeriods,
  getUpcomingMailingPeriodId,
  calculateHouseholdMilestoneTargetsMap,
} from './utils/memorialCalculator';
import { stripAutoCarryoverTransactions } from './utils/fiscalYearUtils';
import { withCreationAudit, withUpdateAudit, getCurrentAuditFields } from './utils/auditUtils';
import { migrateAllDankaIds } from './utils/dankaIdUtils';
import { sanitizeAppDataset } from './utils/sanitizeDataUtils';
import { useAppHistory } from './hooks/useAppHistory';
import { syncTobaTodosList } from './utils/tobaTodoSync';
import { 
  recordDeletedRecord, 
  recordDeletedRecordsBatch, 
  loadDeletedRecordsLog, 
  saveDeletedRecordsLog,
  clearDeletedRecordsLog,
  unrecordDeletedRecord
} from './utils/deletedRecordsLog';
import {
  INITIAL_TEMPLE_INFO,
  INITIAL_TEMPLES,
  INITIAL_HOUSEHOLDS,
  INITIAL_PAST_RECORDS,
  INITIAL_MEMORIAL_SERVICES,
  INITIAL_TEMPLE_TODOS,
  INITIAL_TRANSACTIONS,
  INITIAL_MASTER_OPTIONS,
  EMPTY_MASTER_OPTIONS,
  EMPTY_TEMPLE_INFO,
  EMPTY_TEMPLES,
  INITIAL_FAMILY_MEMBERS,
  INITIAL_PRIESTS,
} from './data/initialData';

function computePayloadSignature(payload: any): string {
  if (!payload) return '';
  try {
    const str = JSON.stringify(payload);
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
    }
    return `${hash >>> 0}_${str.length}`;
  } catch {
    return String(Date.now());
  }
}

export default function App() {
  const [activeTab, setActiveTab] = useState<string>('households');
  const [calendarTargetDate, setCalendarTargetDate] = useState<string | undefined>(undefined);

  // View mode: 'desktop' | 'mobile' (supports auto-detect on phone access & manual toggle)
  const [viewMode, setViewMode] = useState<'desktop' | 'mobile'>(() => {
    const saved = safeStorage.getItem('renge_view_mode');
    if (saved === 'mobile' || saved === 'desktop') return saved;
    if (typeof window !== 'undefined') {
      const isMobileWidth = window.innerWidth < 768;
      const isTouchOrPhoneAgent = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      if (isMobileWidth || isTouchOrPhoneAgent) {
        return 'mobile';
      }
    }
    return 'desktop';
  });

  const handleSetViewMode = (mode: 'desktop' | 'mobile') => {
    setViewMode(mode);
    safeStorage.setItem('renge_view_mode', mode);
  };

  // Navigate to Calendar with optional target date
  const handleNavigateToCalendar = (targetDate?: string) => {
    if (targetDate) {
      setCalendarTargetDate(targetDate);
    }
    setActiveTab('reservations');
  };

  // Startup Launcher Screen: 起動時・ブラウザ更新時は完全に空の状態で立ち上がり、4つの選択肢を表示
  const [isStartupLauncherOpen, setIsStartupLauncherOpen] = useState<boolean>(true);
  const [isStartupLoading, setIsStartupLoading] = useState<boolean>(false);
  const [startupLoadingMsg, setStartupLoadingMsg] = useState<string>('データを読み込み中...');

  const isStartupLauncherOpenRef = useRef<boolean>(isStartupLauncherOpen);
  useEffect(() => {
    isStartupLauncherOpenRef.current = isStartupLauncherOpen;
  }, [isStartupLauncherOpen]);

  const isCleanWritingRef = useRef<boolean>(false);

  // Multi-temple profiles & Active temple ID (Default: Empty)
  const [temples, setTemples] = useState<TempleProfile[]>(EMPTY_TEMPLES);
  const [activeTempleId, setActiveTempleId] = useState<string>('temple-main');

  // Application state (Default: Empty on fresh start / reload)
  const [templeInfo, setTempleInfo] = useState<TempleInfo>(EMPTY_TEMPLE_INFO);
  const [masterOptions, setMasterOptions] = useState<MasterOptions>(EMPTY_MASTER_OPTIONS);
  const [templeMasterOptionsMap, setTempleMasterOptionsMap] = useState<Record<string, MasterOptions>>({});
  const [noticeTemplates, setNoticeTemplates] = useState<{ higan: string; niibon: string }>({ higan: '', niibon: '' });
  const [households, setHouseholds] = useState<Household[]>([]);
  const [pastRecords, setPastRecords] = useState<PastRecord[]>([]);
  const [memorialServices, setMemorialServices] = useState<MemorialService[]>([]);
  const [templeTodos, setTempleTodos] = useState<TempleTodo[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
  const [priests, setPriests] = useState<Priest[]>([]);
  const [batchAccountingData, setBatchAccountingData] = useState<BatchAccountingData | null>(() => getSavedBatchAccountingData());

  const handleSaveBatchAccountingData = (data: BatchAccountingData | null) => {
    setBatchAccountingData(data);
    syncStateRef.current.batchAccountingData = data;
    if (data) {
      saveBatchAccountingData(data);
      saveBatchAccountingConfig({
        id: `config-${data.templeId || 'temple-main'}`,
        configDate: data.configDate,
        cat1: data.cat1,
        notes1: data.notes1,
        defaultAmount1: data.defaultAmount1,
        cat2: data.cat2,
        notes2: data.notes2,
        defaultAmount2: data.defaultAmount2,
        cat3: data.cat3,
        notes3: data.notes3,
        defaultAmount3: data.defaultAmount3,
        appliedPreset: data.appliedPreset,
        templeId: data.templeId,
        lastSavedAt: data.lastSavedAt,
      });
    } else {
      clearBatchAccountingEntries();
    }
    // Googleシートの該当テーブル（一括会計受付・一括会計設定）のみを初期化して端末側レコードに置き換え
    cleanWriteSpecificTablesToGoogleSheets(['一括会計受付', '一括会計設定']);
  };

  const handleSavePriests = (newPriests: Priest[]) => {
    recordHistory('登録僧侶一覧を変更');
    setPriests(newPriests);
    saveJsonState('temple_priests', newPriests);
    syncStateRef.current.priests = newPriests;
    // Googleシートの該当テーブル（登録僧侶一覧）のみを初期化して端末側レコードに置き換え
    cleanWriteSpecificTablesToGoogleSheets(['登録僧侶一覧']);
  };

  // Cross-tab states for Print Engine & List Sorting / Excluding
  const [selectedIdsForPrint, setSelectedIdsForPrint] = useState<string[]>([]);
  const [customPrintMessage, setCustomPrintMessage] = useState<string>('');
  const [milestoneTargetsMap, setMilestoneTargetsMap] = useState<Record<string, MemorialNoticeTarget[]>>({});
  const [milestonePeriodLabel, setMilestonePeriodLabel] = useState<string>('');

  // Default initialize milestone targets for upcoming mailing period if not set
  useEffect(() => {
    if (pastRecords.length === 0) return;
    if (!milestonePeriodLabel) {
      const currentYear = new Date().getFullYear();
      const bonSeason = templeInfo?.bonSeason || '8月盆';
      const periods = generateHiganPeriods(currentYear, bonSeason);
      const upcomingId = getUpcomingMailingPeriodId(currentYear, bonSeason);
      const defaultPeriod = periods.find((p) => p.id === upcomingId) || periods[0];
      if (defaultPeriod) {
        const initialMap = calculateHouseholdMilestoneTargetsMap(pastRecords, defaultPeriod, undefined, templeInfo);
        setMilestoneTargetsMap(initialMap);
        setMilestonePeriodLabel(defaultPeriod.label);
      }
    }
  }, [pastRecords.length, templeInfo?.bonSeason, milestonePeriodLabel]);

  const handleUpdateMilestoneTargets = useCallback(
    (targetsMap: Record<string, MemorialNoticeTarget[]>, periodLabel: string) => {
      setMilestoneTargetsMap(targetsMap);
      setMilestonePeriodLabel(periodLabel);
    },
    []
  );

  const [householdSortKey, setHouseholdSortKey] = useState<string>(() => {
    return safeStorage.getItem('household_sort_key') || 'id';
  });
  const [householdSortOrder, setHouseholdSortOrder] = useState<'asc' | 'desc'>(() => {
    return (safeStorage.getItem('household_sort_order') as 'asc' | 'desc') || 'asc';
  });
  const [excludedHouseholdIds, setExcludedHouseholdIds] = useState<string[]>([]);

  // Google Sheets Auto-Sync States
  const [syncStatus, setSyncStatus] = useState<'synced' | 'syncing' | 'error' | 'disconnected'>('disconnected');
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(() => {
    return safeStorage.getItem('temple_google_sheet_last_sync');
  });
  const [syncErrorMessage, setSyncErrorMessage] = useState<string | null>(null);
  const [isInitialLoaded, setIsInitialLoaded] = useState<boolean>(false);

  // Snapshot generator for Undo / Redo
  const getCurrentSnapshot = useCallback((): AppSnapshot => {
    return {
      description: '',
      timestamp: Date.now(),
      households,
      pastRecords,
      transactions,
      memorialServices,
      templeTodos,
      templeInfo,
      masterOptions,
      templeMasterOptionsMap,
      selectedIdsForPrint,
      householdSortKey,
      householdSortOrder,
      excludedHouseholdIds,
      priests,
      deletedRecords: loadDeletedRecordsLog(),
    };
  }, [
    households,
    pastRecords,
    transactions,
    memorialServices,
    templeTodos,
    templeInfo,
    masterOptions,
    templeMasterOptionsMap,
    selectedIdsForPrint,
    householdSortKey,
    householdSortOrder,
    excludedHouseholdIds,
    priests,
  ]);

  // Snapshot Restorer for Undo / Redo
  const restoreSnapshot = useCallback((snapshot: AppSnapshot) => {
    if (snapshot.households) setHouseholds(snapshot.households);
    if (snapshot.pastRecords) setPastRecords(snapshot.pastRecords);
    if (snapshot.transactions) setTransactions(snapshot.transactions);
    if (snapshot.memorialServices) setMemorialServices(snapshot.memorialServices);
    if (snapshot.templeTodos) setTempleTodos(snapshot.templeTodos);
    if (snapshot.templeInfo) setTempleInfo(snapshot.templeInfo);
    if (snapshot.masterOptions) setMasterOptions(snapshot.masterOptions);
    if (snapshot.templeMasterOptionsMap) setTempleMasterOptionsMap(snapshot.templeMasterOptionsMap);
    if (snapshot.selectedIdsForPrint) setSelectedIdsForPrint(snapshot.selectedIdsForPrint);
    if (snapshot.householdSortKey) {
      setHouseholdSortKey(snapshot.householdSortKey);
      safeStorage.setItem('household_sort_key', snapshot.householdSortKey);
    }
    if (snapshot.householdSortOrder) {
      setHouseholdSortOrder(snapshot.householdSortOrder);
      safeStorage.setItem('household_sort_order', snapshot.householdSortOrder);
    }
    if (snapshot.excludedHouseholdIds) setExcludedHouseholdIds(snapshot.excludedHouseholdIds);
    if (snapshot.priests) {
      setPriests(snapshot.priests);
      saveJsonState('temple_priests', snapshot.priests);
    }
    if (snapshot.deletedRecords) {
      saveDeletedRecordsLog(snapshot.deletedRecords);
    }
  }, []);

  // Google Sheets Undo / Redo Interrupt Confirmation Modal states
  const [isGoogleSheetsUndoInterruptOpen, setIsGoogleSheetsUndoInterruptOpen] = useState<boolean>(false);
  const [undoInterruptAction, setUndoInterruptAction] = useState<'undo' | 'redo'>('undo');

  const handleRequestUndoRef = useRef<() => void>(() => {});
  const handleRequestRedoRef = useRef<() => void>(() => {});

  const { canUndo, canRedo, undoDescription, redoDescription, undo, redo, recordHistory } = useAppHistory({
    getCurrentSnapshot,
    restoreSnapshot,
    onUndoRequest: () => handleRequestUndoRef.current(),
    onRedoRequest: () => handleRequestRedoRef.current(),
  });

  // Active Google Sheets connection check for Undo / Redo interruption
  const isGoogleConnected = useMemo(() => {
    if (syncStatus === 'disconnected') return false;
    const rawSheetInfo = safeStorage.getItem('temple_google_sheet_info');
    if (!rawSheetInfo) return false;
    try {
      const parsed = JSON.parse(rawSheetInfo);
      return Boolean(parsed && parsed.id);
    } catch {
      return false;
    }
  }, [syncStatus]);

  // Undo / Redo request handlers with Google Sheets connection check
  const handleRequestUndo = useCallback(() => {
    if (!canUndo) return;
    if (isGoogleConnected) {
      setUndoInterruptAction('undo');
      setIsGoogleSheetsUndoInterruptOpen(true);
    } else {
      // 連携していない時はダイアログ表示やバックアップ等を行わず、直接「元に戻す」を実行
      undo();
    }
  }, [canUndo, undo, isGoogleConnected]);

  const handleRequestRedo = useCallback(() => {
    if (!canRedo) return;
    if (isGoogleConnected) {
      setUndoInterruptAction('redo');
      setIsGoogleSheetsUndoInterruptOpen(true);
    } else {
      // 連携していない時はダイアログ表示やバックアップ等を行わず、直接「やり直す」を実行
      redo();
    }
  }, [canRedo, redo, isGoogleConnected]);

  useEffect(() => {
    handleRequestUndoRef.current = handleRequestUndo;
  }, [handleRequestUndo]);

  useEffect(() => {
    handleRequestRedoRef.current = handleRequestRedo;
  }, [handleRequestRedo]);

  // Active master options based on active temple
  const activeMasterOptions = useMemo(() => {
    if (activeTempleId === 'ALL') {
      return mergeAllTempleMasterOptions(templeMasterOptionsMap, masterOptions);
    }
    return getTempleMasterOptions(activeTempleId, templeMasterOptionsMap, temples, masterOptions);
  }, [activeTempleId, templeMasterOptionsMap, temples, masterOptions]);

  // Active filtered datasets based on activeTempleId ('ALL' or specific temple ID)
  // 檀家名簿: 合算表示は禁止（混乱防止のため個別寺院のみ）。ALLの場合は本寺にフォールバック
  const activeHouseholds = useMemo(() => {
    const mainTemple = temples.find((t) => t.isMain);
    const mainTempleId = mainTemple?.id || 'temple-main';
    const targetId = activeTempleId === 'ALL' ? mainTempleId : activeTempleId;

    return households.filter((h) => {
      const hTempleId = h.templeId || mainTempleId;
      if (targetId === mainTempleId || targetId === 'temple-main') {
        return hTempleId === mainTempleId || hTempleId === 'temple-main';
      }
      return hTempleId === targetId;
    });
  }, [households, activeTempleId, temples]);

  // 左上で選択中の寺院（兼務寺院・本寺）のプロファイル情報を寺院一覧（temples）から動的解決
  const activeTempleInfo: TempleInfo = useMemo(() => {
    if (activeTempleId && activeTempleId !== 'ALL') {
      const matched = temples.find((t) => t.id === activeTempleId);
      if (matched) return matched;
    }
    const mainTemple = temples.find((t) => t.isMain) || temples[0];
    return mainTemple || templeInfo;
  }, [activeTempleId, temples, templeInfo]);

  // 会計処理方法（各寺院個別 / 全寺院合算）の判定
  const mainTempleProfile: TempleInfo = useMemo(() => {
    return temples.find((t) => t.isMain) || temples[0] || templeInfo;
  }, [temples, templeInfo]);

  const isAccountingCombined = useMemo(() => {
    return (mainTempleProfile?.accountingMode || templeInfo?.accountingMode) === 'combined';
  }, [mainTempleProfile, templeInfo]);

  // 会計管理: 各寺院個別モード（選択中寺院）または全寺院合算モード（全取引を本寺集約）
  const activeTransactions = useMemo(() => {
    if (isAccountingCombined) {
      return transactions;
    }
    const mainTempleId = mainTempleProfile?.id || 'temple-main';
    const targetId = activeTempleId === 'ALL' ? mainTempleId : activeTempleId;

    return transactions.filter((t) => {
      const tTempleId = t.templeId || mainTempleId;
      if (targetId === mainTempleId || targetId === 'temple-main') {
        return tTempleId === mainTempleId || tTempleId === 'temple-main';
      }
      return tTempleId === targetId;
    });
  }, [isAccountingCombined, transactions, activeTempleId, mainTempleProfile]);

  // 会計管理用の寺院情報・マスタ・世帯（全寺院合算時は本寺プロファイルを使用）
  const accountingTempleInfo: TempleInfo = useMemo(() => {
    if (isAccountingCombined) {
      return mainTempleProfile;
    }
    return activeTempleInfo;
  }, [isAccountingCombined, mainTempleProfile, activeTempleInfo]);

  const accountingMasterOptions = useMemo(() => {
    if (isAccountingCombined) {
      const mainTempleId = mainTempleProfile?.id || 'temple-main';
      return templeMasterOptionsMap[mainTempleId] || masterOptions;
    }
    return activeMasterOptions;
  }, [isAccountingCombined, mainTempleProfile, templeMasterOptionsMap, masterOptions, activeMasterOptions]);

  const accountingHouseholds = useMemo(() => {
    if (isAccountingCombined) {
      return households;
    }
    return activeHouseholds;
  }, [isAccountingCombined, households, activeHouseholds]);

  // 過去帳: 全寺院合算可能
  const activePastRecords = useMemo(() => {
    if (activeTempleId === 'ALL') return pastRecords;
    const mainTemple = temples.find((t) => t.isMain);
    const mainTempleId = mainTemple?.id || 'temple-main';

    return pastRecords.filter((r) => {
      let targetId = r.templeId;
      if (!targetId && r.householdId) {
        const hh = households.find((h) => h.id === r.householdId);
        if (hh && hh.templeId) {
          targetId = hh.templeId;
        }
      }
      if (!targetId) {
        targetId = mainTempleId;
      }
      if (activeTempleId === mainTempleId || activeTempleId === 'temple-main') {
        return targetId === mainTempleId || targetId === 'temple-main';
      }
      return targetId === activeTempleId;
    });
  }, [pastRecords, households, activeTempleId, temples]);

  // 法事予約カレンダー: 本寺・兼務寺院の情報がマージされたものがデフォルト（左上プルダウン固定）
  const activeMemorialServices = useMemo(() => {
    return memorialServices;
  }, [memorialServices]);

  // 寺院ToDo: 法事予約と連動（全寺院マージ表示・一意のIDによる重複排除）
  const activeTempleTodos = useMemo(() => {
    const seen = new Set<string>();
    return templeTodos.filter((t) => {
      if (!t.id || seen.has(t.id)) return false;
      seen.add(t.id);
      return true;
    });
  }, [templeTodos]);

  const activeFamilyMembers = useMemo(() => {
    const activeHhIds = new Set(activeHouseholds.map((h) => h.id));
    return familyMembers.filter((m) => activeHhIds.has(m.householdId));
  }, [familyMembers, activeHouseholds]);

  const sortedHouseholdsForPrint = useMemo(() => {
    return sortHouseholds(activeHouseholds, householdSortKey, householdSortOrder, activeMasterOptions, pastRecords, activeTempleInfo?.bonSeason || '8月盆');
  }, [activeHouseholds, householdSortKey, householdSortOrder, activeMasterOptions, pastRecords, activeTempleInfo?.bonSeason]);

  // Modal open states
  const [isHouseholdModalOpen, setIsHouseholdModalOpen] = useState(false);
  const [editingHousehold, setEditingHousehold] = useState<Household | null>(null);
  const [isTempleModalOpen, setIsTempleModalOpen] = useState(false);
  const [templeModalInitialTab, setTempleModalInitialTab] = useState<'basic' | 'master' | 'priests'>('basic');
  const [isMasterModalOpen, setIsMasterModalOpen] = useState(false);
  const [isGoogleSheetsModalOpen, setIsGoogleSheetsModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importModalTargetType, setImportModalTargetType] = useState<ImportTargetType>('household');

  const handleOpenTempleModal = (tab: 'basic' | 'master' | 'priests' = 'basic') => {
    setTempleModalInitialTab(tab);
    setIsTempleModalOpen(true);
  };

  // Kakocho tab deep-link navigation states
  const [kakochoInitialTab, setKakochoInitialTab] = useState<'all' | 'daily' | 'milestones'>('all');
  const [kakochoMilestoneSubMode, setKakochoMilestoneSubMode] = useState<'shipping' | 'yearly'>('shipping');
  const [kakochoTargetDate, setKakochoTargetDate] = useState<string | undefined>(undefined);
  const [kakochoNavKey, setKakochoNavKey] = useState<number>(0);

  const handleNavigateToYearlyMilestones = (targetDate?: string) => {
    const validDate = targetDate || new Date().toISOString().slice(0, 10).replace(/-/g, '/');
    setKakochoInitialTab('milestones');
    setKakochoMilestoneSubMode('yearly');
    setKakochoTargetDate(validDate);
    setKakochoNavKey((prev) => prev + 1);
    setActiveTab('kakocho');
  };

  // Google Sheets Disconnect Handler
  const handleDisconnectGoogle = () => {
    setSyncStatus('disconnected');
    setLastSyncTime(null);
    setSyncErrorMessage(null);
    safeStorage.removeItem('temple_google_sheet_info');
    safeStorage.removeItem('temple_google_sheet_last_sync');
    recordHistory('Googleシート連携を解除');
  };

  // ----------------------------------------------------
  // 起動画面（Startup Launcher） 4つの選択肢ハンドラー
  // ----------------------------------------------------
  // ① データ無しで立ち上げ（新規スタート）
  const handleStartWithEmpty = () => {
    setTemples(EMPTY_TEMPLES);
    setTempleInfo(EMPTY_TEMPLE_INFO);
    setMasterOptions(EMPTY_MASTER_OPTIONS);
    setTempleMasterOptionsMap({});
    setNoticeTemplates({ higan: '', niibon: '' });
    setHouseholds([]);
    setPastRecords([]);
    setMemorialServices([]);
    setTempleTodos([]);
    setTransactions([]);
    setFamilyMembers([]);
    setPriests([]);
    setActiveTempleId('temple-main');

    // ストレージも初期化
    syncStateRef.current = {
      templeInfo: EMPTY_TEMPLE_INFO,
      temples: EMPTY_TEMPLES,
      households: [],
      pastRecords: [],
      memorialServices: [],
      transactions: [],
      familyMembers: [],
      masterOptions: EMPTY_MASTER_OPTIONS,
      noticeTemplates: { higan: '', niibon: '' },
      templeTodos: [],
      templeMasterOptionsMap: {},
      priests: [],
      batchAccountingData: null,
    };

    idbClear().catch((e) => console.warn('IDB clear error:', e));
    saveJsonState('temple_profiles', EMPTY_TEMPLES);
    saveJsonState('temple_info', EMPTY_TEMPLE_INFO);
    saveJsonState('temple_master_options', EMPTY_MASTER_OPTIONS);
    saveJsonState('temple_master_options_map', {});
    saveJsonState('temple_households', []);
    saveJsonState('temple_past_records', []);
    saveJsonState('temple_memorial_services', []);
    saveJsonState('temple_todos', []);
    saveJsonState('temple_transactions', []);
    saveJsonState('temple_family_members', []);
    saveJsonState('temple_priests', []);
    saveNoticeTemplates({ higan: '', niibon: '' });
    saveDeletedRecordsLog([]);
    safeStorage.removeItem('temple_safety_snapshot');
    safeStorage.removeItem('temple_backup_before_sync');

    setIsStartupLauncherOpen(false);
    isStartupLauncherOpenRef.current = false;
    recordHistory('データ無し（新規）で立ち上げ');
  };

  // ② チュートリアルデータ（ダミーデータ）ありで立ち上げ
  const handleStartWithTutorial = () => {
    const formattedPast = INITIAL_PAST_RECORDS.map((r) => ({
      ...r,
      niibon: r.niibon && r.niibon.trim() !== '' ? r.niibon : calculateNiibonFromDeathDate(r.deathDate, INITIAL_TEMPLE_INFO.bonSeason || '8月盆'),
    }));
    const cleanTx = stripAutoCarryoverTransactions(INITIAL_TRANSACTIONS);

    setTemples(INITIAL_TEMPLES);
    setTempleInfo(INITIAL_TEMPLE_INFO);
    setMasterOptions(INITIAL_MASTER_OPTIONS);
    setTempleMasterOptionsMap({ 'temple-main': INITIAL_MASTER_OPTIONS });
    setNoticeTemplates(getSavedNoticeTemplates());
    setHouseholds(INITIAL_HOUSEHOLDS);
    setPastRecords(formattedPast);
    setMemorialServices(INITIAL_MEMORIAL_SERVICES);
    setTempleTodos(INITIAL_TEMPLE_TODOS);
    setTransactions(cleanTx);
    setFamilyMembers(INITIAL_FAMILY_MEMBERS);
    setPriests(INITIAL_PRIESTS);
    setActiveTempleId('temple-main');

    saveJsonState('temple_profiles', INITIAL_TEMPLES);
    saveJsonState('temple_info', INITIAL_TEMPLE_INFO);
    saveJsonState('temple_master_options', INITIAL_MASTER_OPTIONS);
    saveJsonState('temple_master_options_map', { 'temple-main': INITIAL_MASTER_OPTIONS });
    saveJsonState('temple_households', INITIAL_HOUSEHOLDS);
    saveJsonState('temple_past_records', formattedPast);
    saveJsonState('temple_memorial_services', INITIAL_MEMORIAL_SERVICES);
    saveJsonState('temple_todos', INITIAL_TEMPLE_TODOS);
    saveJsonState('temple_transactions', cleanTx);
    saveJsonState('temple_family_members', INITIAL_FAMILY_MEMBERS);
    saveJsonState('temple_priests', INITIAL_PRIESTS);

    setIsStartupLauncherOpen(false);
    recordHistory('チュートリアルデータ（ダミーデータ）で立ち上げ');
  };

  // ③ PCからデータ読み込み（JSONバックアップ または Excel）
  const handleStartWithFile = async (file: File) => {
    setIsStartupLoading(true);
    setStartupLoadingMsg(`${file.name} を解析・読み込み中...`);
    try {
      const fileName = file.name.toLowerCase();
      if (fileName.endsWith('.json')) {
        const text = await file.text();
        const parsed = JSON.parse(text);

        // AppSnapshot または 直接オブジェクト形式の解析
        const importedHouseholds = Array.isArray(parsed.households) ? parsed.households : [];
        const importedPast = Array.isArray(parsed.pastRecords) ? parsed.pastRecords : [];
        const importedMemorial = Array.isArray(parsed.memorialServices) ? parsed.memorialServices : [];
        const importedTodos = Array.isArray(parsed.templeTodos) ? parsed.templeTodos : [];
        const importedTx = Array.isArray(parsed.transactions) ? parsed.transactions : [];
        const importedFam = Array.isArray(parsed.familyMembers) ? parsed.familyMembers : [];
        const importedTemples = Array.isArray(parsed.temples) && parsed.temples.length > 0 
          ? parsed.temples 
          : (parsed.templeInfo ? [parsed.templeInfo] : EMPTY_TEMPLES);
        const importedInfo = parsed.templeInfo || (importedTemples[0] ? importedTemples[0] : EMPTY_TEMPLE_INFO);
        const importedMaster = parsed.masterOptions || EMPTY_MASTER_OPTIONS;
        const importedMasterMap = parsed.templeMasterOptionsMap || {};
        const importedPriests = Array.isArray(parsed.priests) ? parsed.priests : [];
        const importedNotices = parsed.noticeTemplates || { higan: '', niibon: '' };

        const bonSeason = importedInfo.bonSeason || '8月盆';
        const formattedPast = importedPast.map((r: any) => ({
          ...r,
          niibon: r.niibon && r.niibon.trim() !== '' ? r.niibon : calculateNiibonFromDeathDate(r.deathDate, bonSeason),
        }));
        const cleanTx = stripAutoCarryoverTransactions(importedTx);

        setHouseholds(importedHouseholds);
        setPastRecords(formattedPast);
        setMemorialServices(importedMemorial);
        setTempleTodos(importedTodos);
        setTransactions(cleanTx);
        setFamilyMembers(importedFam);
        setTemples(importedTemples);
        setTempleInfo(importedInfo);
        setMasterOptions(importedMaster);
        setTempleMasterOptionsMap(importedMasterMap);
        setPriests(importedPriests);
        setNoticeTemplates(importedNotices);

        const defaultTempleId = importedTemples.find((t: any) => t.isMain)?.id || importedTemples[0]?.id || 'temple-main';
        setActiveTempleId(defaultTempleId);

        saveJsonState('temple_profiles', importedTemples);
        saveJsonState('temple_info', importedInfo);
        saveJsonState('temple_master_options', importedMaster);
        saveJsonState('temple_master_options_map', importedMasterMap);
        saveJsonState('temple_households', importedHouseholds);
        saveJsonState('temple_past_records', formattedPast);
        saveJsonState('temple_memorial_services', importedMemorial);
        saveJsonState('temple_todos', importedTodos);
        saveJsonState('temple_transactions', cleanTx);
        saveJsonState('temple_family_members', importedFam);
        saveJsonState('temple_priests', importedPriests);
        saveNoticeTemplates(importedNotices);

        setIsStartupLauncherOpen(false);
        recordHistory(`PCバックアップファイル（${file.name}）から立ち上げ`);
      } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
        const defaultTemple = 'temple-main';
        const data = await importFromExcel(file, {
          targetTempleId: 'ALL',
          defaultTempleId: defaultTemple,
        });

        if (data.temples && data.temples.length > 0) {
          setTemples(data.temples);
          setTempleInfo(data.temples[0]);
        }
        if (data.households) setHouseholds(data.households);
        if (data.pastRecords) setPastRecords(data.pastRecords);
        if (data.memorialServices) setMemorialServices(data.memorialServices);
        if (data.transactions) setTransactions(stripAutoCarryoverTransactions(data.transactions));
        if (data.masterOptions) setMasterOptions(data.masterOptions);
        if (data.templeTodos) setTempleTodos(data.templeTodos);
        if (data.priests) setPriests(data.priests);
        if (data.templeMasterOptionsMap) setTempleMasterOptionsMap(data.templeMasterOptionsMap);

        setIsStartupLauncherOpen(false);
        recordHistory(`Excelファイル（${file.name}）から立ち上げ`);
      } else {
        throw new Error('サポートされていないファイル形式です（.json または .xlsx / .xls を選択してください）。');
      }
    } catch (err: any) {
      console.error('File load error:', err);
      throw new Error(`ファイルの読み込みに失敗しました: ${err.message || err}`);
    } finally {
      setIsStartupLoading(false);
    }
  };

  // ④ Googleシートとデータ連携（Googleシートと連携）
  const handleStartWithGoogleSheets = async () => {
    setIsStartupLoading(true);
    setStartupLoadingMsg('Googleアカウントでログイン中...');
    try {
      const res = await googleSignIn();
      if (!res) {
        return;
      }

      setStartupLoadingMsg('Googleスプレッドシートを確認・連携中...');
      const savedInfo = safeStorage.getItem('temple_google_sheet_info');
      let preferredSheetId: string | undefined;
      if (savedInfo) {
        try {
          preferredSheetId = JSON.parse(savedInfo)?.id;
        } catch {}
      }

      const sheet = await findOrCreateSpreadsheet(res.accessToken, false, {
        preferredSheetId,
        onProgress: (msg) => setStartupLoadingMsg(msg),
      });
      saveJsonState('temple_google_sheet_info', sheet);

      setStartupLoadingMsg('Googleシートとデータを同期中...');
      await syncWithGoogleDrive(res.accessToken, sheet.id);

      setIsStartupLauncherOpen(false);
      setIsInitialLoaded(true);
      recordHistory(`Googleシート連携（${res.user.email}）で起動`);
    } catch (err: any) {
      console.error('Google sign in / sync error from startup launcher:', err);
      if (err?.code === 'auth/popup-closed-by-user' || err?.message?.includes('closed-by-user')) {
        throw new Error('Googleログインがキャンセルされました。');
      }
      throw new Error(`Googleシートとの連携に失敗しました: ${err?.message || err}`);
    } finally {
      setIsStartupLoading(false);
    }
  };

  // Sync to safe storage & IndexedDB
  useEffect(() => {
    saveJsonState('temple_info', templeInfo);
  }, [templeInfo]);

  useEffect(() => {
    saveJsonState('temple_profiles', temples);
  }, [temples]);

  useEffect(() => {
    safeStorage.setItem('active_temple_id', activeTempleId);
  }, [activeTempleId]);

  useEffect(() => {
    saveJsonState('temple_master_options', masterOptions);
  }, [masterOptions]);

  useEffect(() => {
    saveJsonState('temple_master_options_map', templeMasterOptionsMap);
  }, [templeMasterOptionsMap]);

  useEffect(() => {
    saveJsonState('temple_households', households);
  }, [households]);

  useEffect(() => {
    saveJsonState('temple_past_records', pastRecords);
  }, [pastRecords]);

  useEffect(() => {
    saveJsonState('temple_memorial_services', memorialServices);
  }, [memorialServices]);

  useEffect(() => {
    saveJsonState('temple_todos', templeTodos);
  }, [templeTodos]);

  useEffect(() => {
    saveJsonState('temple_transactions', transactions);
  }, [transactions]);

  useEffect(() => {
    saveJsonState('temple_family_members', familyMembers);
  }, [familyMembers]);

  useEffect(() => {
    saveNoticeTemplates(noticeTemplates);
  }, [noticeTemplates]);

  const pendingCleanImportRef = useRef(false);
  const isSyncInProgressRef = useRef(false);
  const activeSyncPromiseRef = useRef<Promise<any> | null>(null);
  const lastSyncedSignatureRef = useRef<string>('');

  // Continuously maintain an automatic safety backup snapshot whenever valid records exist
  useEffect(() => {
    if (pendingCleanImportRef.current) return;
    const totalLocalCount = households.length + pastRecords.length + memorialServices.length + templeTodos.length + transactions.length;
    if (totalLocalCount > 0) {
      const snapshot = {
        households,
        pastRecords,
        memorialServices,
        templeTodos,
        transactions,
        familyMembers,
        temples,
        templeInfo,
        masterOptions,
        templeMasterOptionsMap,
        savedAt: new Date().toISOString(),
        recordCount: totalLocalCount,
      };
      saveJsonState('temple_safety_snapshot', snapshot);
      idbSet('temple_safety_snapshot', snapshot).catch((e) => console.warn('IDB safety snapshot save error:', e));
    }
  }, [households, pastRecords, memorialServices, templeTodos, transactions, familyMembers, temples, templeInfo, masterOptions, templeMasterOptionsMap]);

  // Helper to safely merge local state with Google Drive spreadsheet data based on newest creation / modification timestamps
  const applyRemoteSheetsData = useCallback((remoteData: SheetsImportResult, forceCleanImport?: boolean): MergedDatasetResult => {
    const isClean = forceCleanImport || pendingCleanImportRef.current;
    if (isClean) {
      pendingCleanImportRef.current = false;
    }
    const remoteTotal = remoteData.totalRecordsCount;
    
    // 現在のローカルデータを State, ref, storage から最も完全な形で収集
    const currentHouseholds = (households && households.length > 0) ? households : (syncStateRef.current.households || []);
    const currentPastRecords = (pastRecords && pastRecords.length > 0) ? pastRecords : (syncStateRef.current.pastRecords || []);
    const currentMemorials = (memorialServices && memorialServices.length > 0) ? memorialServices : (syncStateRef.current.memorialServices || []);
    const currentTodos = (templeTodos && templeTodos.length > 0) ? templeTodos : (syncStateRef.current.templeTodos || []);
    const currentTransactions = (transactions && transactions.length > 0) ? transactions : (syncStateRef.current.transactions || []);
    const currentFamily = (familyMembers && familyMembers.length > 0) ? familyMembers : (syncStateRef.current.familyMembers || []);

    const currentLocalCount = currentHouseholds.length + currentPastRecords.length + currentMemorials.length + currentTodos.length + currentTransactions.length;

    // ★ データ損失防止ガード: リモートが0件でローカルに既存データがある場合（初期化モードでない時のみ）、空配列での一括上書き消去を絶対に行わない
    if (!isClean && remoteTotal === 0 && currentLocalCount > 0) {
      console.warn('Google Sheets import returned 0 records while local dataset has records. Wiping prevented to protect user data.');
      return {
        households: currentHouseholds,
        familyMembers: currentFamily,
        pastRecords: currentPastRecords,
        memorialServices: currentMemorials,
        templeTodos: currentTodos,
        transactions: currentTransactions,
        temples,
        templeInfo,
        masterOptions,
        templeMasterOptionsMap,
        noticeTemplates,
        stats: {
          householdsUpdated: 0,
          householdsAdded: 0,
          householdsLocalKept: currentHouseholds.length,
          pastRecordsUpdated: 0,
          pastRecordsAdded: 0,
          pastRecordsLocalKept: currentPastRecords.length,
          memorialsUpdated: 0,
          memorialsAdded: 0,
          memorialsLocalKept: currentMemorials.length,
          todosUpdated: 0,
          todosAdded: 0,
          todosLocalKept: currentTodos.length,
          transactionsUpdated: 0,
          transactionsAdded: 0,
          transactionsLocalKept: currentTransactions.length,
          familyMembersUpdated: 0,
          familyMembersAdded: 0,
          totalUpdatedFromRemote: 0,
          totalAddedFromRemote: 0,
          totalLocalKeptNewer: currentLocalCount,
        },
        summaryMessage: 'ローカルデータを保持しました。',
      };
    }

    isImportingRef.current = true;

    // 保存前バックアップスナップショット作成（完全初期化モード時はスキップ）
    if (!isClean && currentLocalCount > 0) {
      const backupSnapshot = {
        households: currentHouseholds,
        pastRecords: currentPastRecords,
        memorialServices: currentMemorials,
        templeTodos: currentTodos,
        transactions: currentTransactions,
        familyMembers: currentFamily,
        temples,
        templeInfo,
        masterOptions,
        templeMasterOptionsMap,
        savedAt: new Date().toISOString(),
        recordCount: currentLocalCount,
      };
      saveJsonState('temple_backup_before_sync', backupSnapshot);
      idbSet('temple_backup_before_sync', backupSnapshot).catch((e) => console.warn('Backup save error:', e));
    }

    // 照会・競合解消: 完全初期化モードなら空のローカル状態を基準にし、スプレッドシートデータを100%取り込む
    if (isClean) {
      clearDeletedRecordsLog();
    }

    const currentLocalState = isClean
      ? {
          templeInfo: EMPTY_TEMPLE_INFO,
          temples: [],
          households: [],
          pastRecords: [],
          memorialServices: [],
          templeTodos: [],
          transactions: [],
          familyMembers: [],
          masterOptions: EMPTY_MASTER_OPTIONS,
          templeMasterOptionsMap: {},
          noticeTemplates: { higan: '', niibon: '' },
          priests: [],
        }
      : {
          templeInfo: syncStateRef.current.templeInfo || templeInfo,
          temples: (syncStateRef.current.temples && syncStateRef.current.temples.length > 0) ? syncStateRef.current.temples : temples,
          households: currentHouseholds,
          pastRecords: currentPastRecords,
          memorialServices: currentMemorials,
          templeTodos: currentTodos,
          transactions: currentTransactions,
          familyMembers: currentFamily,
          masterOptions: syncStateRef.current.masterOptions || masterOptions,
          templeMasterOptionsMap: syncStateRef.current.templeMasterOptionsMap || templeMasterOptionsMap,
          noticeTemplates: syncStateRef.current.noticeTemplates || noticeTemplates,
          priests: syncStateRef.current.priests || priests,
        };

    const mergeResult = mergeDatasetsWithAuditPriority(currentLocalState, remoteData);

    // Synchronously update syncStateRef to prevent race conditions during immediate export
    syncStateRef.current.households = mergeResult.households;
    syncStateRef.current.pastRecords = mergeResult.pastRecords;
    syncStateRef.current.memorialServices = mergeResult.memorialServices;
    syncStateRef.current.templeTodos = mergeResult.templeTodos;
    syncStateRef.current.transactions = mergeResult.transactions;
    syncStateRef.current.familyMembers = mergeResult.familyMembers;
    if (mergeResult.temples && mergeResult.temples.length > 0) syncStateRef.current.temples = mergeResult.temples;
    if (mergeResult.templeInfo) syncStateRef.current.templeInfo = mergeResult.templeInfo;
    if (mergeResult.masterOptions) syncStateRef.current.masterOptions = mergeResult.masterOptions;
    if (mergeResult.templeMasterOptionsMap) syncStateRef.current.templeMasterOptionsMap = mergeResult.templeMasterOptionsMap;
    if (mergeResult.priests) syncStateRef.current.priests = mergeResult.priests;

    // 1. Households
    setHouseholds(mergeResult.households);
    saveJsonState('temple_households', mergeResult.households);
    
    // 2. Family Members
    setFamilyMembers(mergeResult.familyMembers);
    saveJsonState('temple_family_members', mergeResult.familyMembers);

    // 3. Past Records
    setPastRecords(mergeResult.pastRecords);
    saveJsonState('temple_past_records', mergeResult.pastRecords);

    // 4. Memorial Services
    setMemorialServices(mergeResult.memorialServices);
    saveJsonState('temple_memorial_services', mergeResult.memorialServices);

    // 5. Todos
    setTempleTodos(mergeResult.templeTodos);
    saveJsonState('temple_todos', mergeResult.templeTodos);

    // 6. Transactions
    setTransactions(mergeResult.transactions);
    saveJsonState('temple_transactions', mergeResult.transactions);

    // 7. Temples & Temple Info
    if (mergeResult.temples && mergeResult.temples.length > 0) {
      setTemples(mergeResult.temples);
      saveJsonState('temple_profiles_list', mergeResult.temples);
      saveJsonState('temple_profiles', mergeResult.temples);
      setTempleInfo(mergeResult.templeInfo);
      saveJsonState('temple_info', mergeResult.templeInfo);
    } else if (mergeResult.templeInfo) {
      setTempleInfo(mergeResult.templeInfo);
      saveJsonState('temple_info', mergeResult.templeInfo);
    }

    // 8. Master Options
    if (mergeResult.masterOptions) {
      setMasterOptions(mergeResult.masterOptions);
      saveJsonState('temple_master_options', mergeResult.masterOptions);
    }

    // 9. Temple Master Options Map
    if (mergeResult.templeMasterOptionsMap) {
      setTempleMasterOptionsMap(mergeResult.templeMasterOptionsMap);
      saveJsonState('temple_master_options_map', mergeResult.templeMasterOptionsMap);
    } else {
      setTempleMasterOptionsMap({});
      saveJsonState('temple_master_options_map', {});
    }

    // 10. Notice Templates
    if (mergeResult.noticeTemplates) {
      setNoticeTemplates(mergeResult.noticeTemplates);
      saveNoticeTemplates(mergeResult.noticeTemplates);
    }

    // 11. Priests
    if (mergeResult.priests && mergeResult.priests.length > 0) {
      setPriests(mergeResult.priests);
      saveJsonState('temple_priests', mergeResult.priests);
    }

    // 12. Batch Accounting Data (Respect local cleared state / recent terminal operations)
    if (isClean) {
      if (remoteData.batchAccountingData) {
        saveBatchAccountingData(remoteData.batchAccountingData);
        setBatchAccountingData(remoteData.batchAccountingData);
      } else {
        clearBatchAccountingData();
        setBatchAccountingData(null);
      }
    } else if (remoteData.batchAccountingData) {
      const localBatch = syncStateRef.current.batchAccountingData || getSavedBatchAccountingData();
      const localSavedAt = localBatch?.lastSavedAt || '';
      const remoteSavedAt = remoteData.batchAccountingData.lastSavedAt || '';
      // Only overwrite if remote is newer and has entries
      if (remoteSavedAt > localSavedAt && remoteData.batchAccountingData.entries && Object.keys(remoteData.batchAccountingData.entries).length > 0) {
        saveBatchAccountingData(remoteData.batchAccountingData);
        setBatchAccountingData(remoteData.batchAccountingData);
      }
    }

    // Set a safety timeout to release importing flag so subsequent user edits sync properly
    setTimeout(() => {
      isImportingRef.current = false;
    }, 2000);

    return mergeResult;
  }, [households, pastRecords, memorialServices, templeTodos, transactions, familyMembers, temples, templeInfo, masterOptions, templeMasterOptionsMap, noticeTemplates, priests]);

  const isImportingRef = useRef(false);
  const syncStateRef = useRef({
    templeInfo,
    temples,
    households,
    pastRecords,
    memorialServices,
    transactions,
    familyMembers,
    masterOptions,
    noticeTemplates,
    templeTodos,
    templeMasterOptionsMap,
    priests,
    batchAccountingData,
  });

  useEffect(() => {
    syncStateRef.current = {
      templeInfo,
      temples,
      households,
      pastRecords,
      memorialServices,
      transactions,
      familyMembers,
      masterOptions,
      noticeTemplates,
      templeTodos,
      templeMasterOptionsMap,
      priests,
      batchAccountingData,
    };
  }, [templeInfo, temples, households, pastRecords, memorialServices, transactions, familyMembers, masterOptions, noticeTemplates, templeTodos, templeMasterOptionsMap, priests, batchAccountingData]);

  const applyRemoteSheetsDataRef = useRef(applyRemoteSheetsData);
  useEffect(() => {
    applyRemoteSheetsDataRef.current = applyRemoteSheetsData;
  }, [applyRemoteSheetsData]);

  // Helper to safely export to sheets with automatic 404 recovery
  const safeExportWithAutoRecovery = async (
    token: string,
    currentSheetId: string,
    exportFn: (activeSheetId: string) => Promise<void>
  ): Promise<{ id: string; url: string }> => {
    try {
      await exportFn(currentSheetId);
      return { id: currentSheetId, url: `https://docs.google.com/spreadsheets/d/${currentSheetId}` };
    } catch (err: any) {
      if (isNotFoundError(err)) {
        console.warn('Target spreadsheet returned 404, finding or creating master sheet and retrying export...');
        const newSheet = await findOrCreateSpreadsheet(token, false);
        saveJsonState('temple_google_sheet_info', newSheet);
        await exportFn(newSheet.id);
        return newSheet;
      }
      throw err;
    }
  };

  // Helper to safely import from sheets with automatic 404 recovery
  const safeImportWithAutoRecovery = async (
    token: string,
    currentSheetId: string,
    options?: { targetTempleId?: string | 'ALL'; defaultTempleId?: string }
  ): Promise<{ data: SheetsImportResult; sheet: { id: string; url: string } }> => {
    try {
      const data = await importFromSheets(token, currentSheetId, options);
      return { data, sheet: { id: currentSheetId, url: `https://docs.google.com/spreadsheets/d/${currentSheetId}` } };
    } catch (err: any) {
      if (isNotFoundError(err)) {
        console.warn('Target spreadsheet returned 404, finding or creating master sheet and retrying import...');
        const newSheet = await findOrCreateSpreadsheet(token, false);
        saveJsonState('temple_google_sheet_info', newSheet);
        const data = await importFromSheets(token, newSheet.id, options);
        return { data, sheet: newSheet };
      }
      throw err;
    }
  };

  // Helper to connect and sync with Google Drive spreadsheet safely
  const syncWithGoogleDrive = useCallback(async (token: string, explicitSheetId?: string, isCleanImport?: boolean) => {
    // Mutex: If a sync is already running, wait for it instead of running parallel syncs
    if (isSyncInProgressRef.current && activeSyncPromiseRef.current) {
      return activeSyncPromiseRef.current;
    }

    const runSyncTask = async () => {
      isSyncInProgressRef.current = true;
      setSyncStatus('syncing');
      try {
        let sheet: { id: string; url: string; isExisting?: boolean };
        if (explicitSheetId) {
          sheet = { id: explicitSheetId, url: `https://docs.google.com/spreadsheets/d/${explicitSheetId}`, isExisting: true };
        } else {
          const savedSheetInfo = safeStorage.getItem('temple_google_sheet_info');
          if (savedSheetInfo) {
            try {
              sheet = JSON.parse(savedSheetInfo);
            } catch {
              sheet = await findOrCreateSpreadsheet(token);
            }
          } else {
            sheet = await findOrCreateSpreadsheet(token);
          }
        }
        saveJsonState('temple_google_sheet_info', sheet);

        const state = syncStateRef.current;
        const localCount = state.households.length + state.pastRecords.length + state.memorialServices.length + state.templeTodos.length + state.transactions.length;

        // Fetch remote spreadsheet data safely with 404 auto-recovery
        const { data: remoteData, sheet: activeSheet } = await safeImportWithAutoRecovery(token, sheet.id);
        sheet = activeSheet;
        saveJsonState('temple_google_sheet_info', sheet);

        const remoteCount = remoteData.totalRecordsCount;

        // ★ 明示的な初期化読込指定（共有スプレッドシートへの強制リセット切替など）の場合のみ:
        // 端末上のデータを初期化してからデータを読込
        if (isCleanImport) {
          isImportingRef.current = true;
          applyRemoteSheetsDataRef.current(remoteData, true /* isClean */);
          const nowTime = new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
          setLastSyncTime(nowTime);
          safeStorage.setItem('temple_google_sheet_last_sync', nowTime);
          setSyncStatus('synced');
          setSyncErrorMessage(null);
          return { success: true, count: remoteCount };
        }

        // ★ データ保護と照会同期ロジック:
        // 1. リモートスプレッドシートにデータが1件以上存在する場合 -> 日時照会マージして即時反映＆Googleシート更新
        if (remoteCount > 0) {
          isImportingRef.current = true;
          const mergeResult = applyRemoteSheetsDataRef.current(remoteData);

          // マージ結果をGoogleシートにも即時反映（双方向の最新化）
          await safeExportWithAutoRecovery(token, sheet.id, async (targetId) => {
            await exportToSheets(
              token,
              targetId,
              mergeResult.templeInfo,
              mergeResult.households,
              mergeResult.pastRecords,
              mergeResult.memorialServices,
              mergeResult.transactions,
              mergeResult.masterOptions || state.masterOptions,
              mergeResult.noticeTemplates || state.noticeTemplates,
              mergeResult.templeTodos,
              mergeResult.temples,
              {
                targetTempleId: 'ALL',
                templeMasterOptionsMap: mergeResult.templeMasterOptionsMap || state.templeMasterOptionsMap,
                priests: mergeResult.priests || state.priests,
                deletedRecords: loadDeletedRecordsLog(),
                batchAccountingData: state.batchAccountingData || getSavedBatchAccountingData() || undefined,
              }
            );
          });
        } else if (localCount > 0) {
          // 2. リモートが0件でローカルにデータが存在する場合 -> ローカルデータをスプレッドシートへ安全に書き出し（初期同期・データ保護）
          await safeExportWithAutoRecovery(token, sheet.id, async (targetId) => {
            await exportToSheets(
              token, 
              targetId, 
              state.templeInfo, 
              state.households, 
              state.pastRecords, 
              state.memorialServices, 
              state.transactions, 
              state.masterOptions, 
              state.noticeTemplates, 
              state.templeTodos, 
              state.temples, 
              {
                targetTempleId: 'ALL',
                templeMasterOptionsMap: state.templeMasterOptionsMap,
                priests: state.priests,
                deletedRecords: loadDeletedRecordsLog(),
                batchAccountingData: state.batchAccountingData || getSavedBatchAccountingData() || undefined,
              }
            );
          });
        } else {
          // 3. 両方とも0件の場合: セーフティバックアップが存在するか確認して復元を試みる
          const backup = (await idbGet<any>('temple_safety_snapshot')) 
            || loadJsonState<any>('temple_safety_snapshot', null) 
            || (await idbGet<any>('temple_backup_before_sync')) 
            || loadJsonState<any>('temple_backup_before_sync', null);

          if (backup && (backup.recordCount > 0 || (backup.households?.length > 0) || (backup.pastRecords?.length > 0))) {
            isImportingRef.current = true;
            if (backup.households) setHouseholds(backup.households);
            if (backup.pastRecords) setPastRecords(backup.pastRecords);
            if (backup.memorialServices) setMemorialServices(backup.memorialServices);
            if (backup.templeTodos) setTempleTodos(backup.templeTodos);
            if (backup.transactions) setTransactions(backup.transactions);
            if (backup.familyMembers) setFamilyMembers(backup.familyMembers);
            if (backup.temples) setTemples(backup.temples);
            if (backup.templeInfo) setTempleInfo(backup.templeInfo);
            if (backup.masterOptions) setMasterOptions(backup.masterOptions);
            if (backup.templeMasterOptionsMap) setTempleMasterOptionsMap(backup.templeMasterOptionsMap);

            await safeExportWithAutoRecovery(token, sheet.id, async (targetId) => {
              await exportToSheets(
                token,
                targetId,
                backup.templeInfo || state.templeInfo,
                backup.households || [],
                backup.pastRecords || [],
                backup.memorialServices || [],
                backup.transactions || [],
                backup.masterOptions || state.masterOptions,
                state.noticeTemplates,
                backup.templeTodos || [],
                backup.temples || state.temples,
                {
                  targetTempleId: 'ALL',
                  templeMasterOptionsMap: backup.templeMasterOptionsMap || state.templeMasterOptionsMap,
                  priests: backup.priests || state.priests,
                  deletedRecords: loadDeletedRecordsLog(),
                  batchAccountingData: state.batchAccountingData || getSavedBatchAccountingData() || undefined,
                }
              );
            });
          } else {
            // 完全新規の初期書き出し
            await safeExportWithAutoRecovery(token, sheet.id, async (targetId) => {
              await exportToSheets(
                token, 
                targetId, 
                state.templeInfo, 
                state.households, 
                state.pastRecords, 
                state.memorialServices, 
                state.transactions, 
                state.masterOptions, 
                state.noticeTemplates, 
                state.templeTodos, 
                state.temples, 
                {
                  targetTempleId: 'ALL',
                  templeMasterOptionsMap: state.templeMasterOptionsMap,
                  priests: state.priests,
                  deletedRecords: loadDeletedRecordsLog(),
                  batchAccountingData: state.batchAccountingData || getSavedBatchAccountingData() || undefined,
                }
              );
            });
          }
        }

        const nowTime = new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
        setLastSyncTime(nowTime);
        safeStorage.setItem('temple_google_sheet_last_sync', nowTime);
        lastSyncedSignatureRef.current = computePayloadSignature({
          templeInfo: syncStateRef.current.templeInfo,
          households: syncStateRef.current.households,
          pastRecords: syncStateRef.current.pastRecords,
          memorialServices: syncStateRef.current.memorialServices,
          transactions: syncStateRef.current.transactions,
          masterOptions: syncStateRef.current.masterOptions,
          noticeTemplates: syncStateRef.current.noticeTemplates,
          templeTodos: syncStateRef.current.templeTodos,
          temples: syncStateRef.current.temples,
          templeMasterOptionsMap: syncStateRef.current.templeMasterOptionsMap,
          priests: syncStateRef.current.priests,
          batchAccountingData: syncStateRef.current.batchAccountingData,
        });
        setSyncStatus('synced');
        setSyncErrorMessage(null);
        return { success: true, count: remoteCount > 0 ? remoteCount : localCount };
      } catch (err: any) {
        console.error('Google Sheets sync/load failed:', err);
        setSyncStatus('error');
        if (isAuthError(err)) {
          setSyncErrorMessage('Google認証の有効期限が切れました。データ連携画面より再度ログインしてください。');
        } else if (err?.isNetworkError || err?.message?.includes('fetch') || err?.message?.includes('NetworkError')) {
          setSyncErrorMessage('Googleサーバーとの通信に失敗しました。ネットワーク環境をご確認ください。');
        } else {
          setSyncErrorMessage(err.message || '同期に失敗しました。');
        }
        throw err;
      } finally {
        isSyncInProgressRef.current = false;
        activeSyncPromiseRef.current = null;
      }
    };

    activeSyncPromiseRef.current = runSyncTask();
    return activeSyncPromiseRef.current;
  }, []);

  // Clean write local terminal data into Google Sheets (deleting existing file, creating brand new spreadsheet, and writing local data)
  const cleanWriteToGoogleSheets = useCallback(async (token: string, explicitSheetId?: string) => {
    isCleanWritingRef.current = true;
    isImportingRef.current = true; // prevent auto-sync debounce trigger
    setSyncStatus('syncing');
    try {
      // 1. Delete existing spreadsheet file(s) named 「寺院管理・檀家過去帳データ」 in Google Drive
      const savedSheet = loadJsonState<{ id: string; url: string }>('temple_google_sheet_info', null);
      const targetFileIdToDelete = explicitSheetId || savedSheet?.id;
      await deleteAllExistingSpreadsheetsByName(token, SPREADSHEET_NAME, targetFileIdToDelete);

      // 2. Create a brand new Google Spreadsheet file
      const newSheet = await createNewSpreadsheet(token, SPREADSHEET_NAME);
      saveJsonState('temple_google_sheet_info', newSheet);

      // Snapshot the exact current local state
      const state = { ...syncStateRef.current };
      const localCount = state.households.length + state.pastRecords.length + state.memorialServices.length + state.templeTodos.length + state.transactions.length;

      // 3. Clear any delete logs / tombstones so clean slate is preserved
      saveDeletedRecordsLog([]);

      // 4. Clear cached safety snapshots that might resurrect old data
      safeStorage.removeItem('temple_safety_snapshot');
      safeStorage.removeItem('temple_backup_before_sync');

      // 5. Write current terminal data from scratch into the newly created spreadsheet
      await exportToSheets(
        token,
        newSheet.id,
        state.templeInfo,
        state.households,
        state.pastRecords,
        state.memorialServices,
        state.transactions,
        state.masterOptions,
        state.noticeTemplates,
        state.templeTodos,
        state.temples,
        {
          targetTempleId: 'ALL',
          templeMasterOptionsMap: state.templeMasterOptionsMap,
          priests: state.priests,
          deletedRecords: [],
          batchAccountingData: state.batchAccountingData || getSavedBatchAccountingData() || undefined,
        }
      );

      const nowTime = new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
      setLastSyncTime(nowTime);
      safeStorage.setItem('temple_google_sheet_last_sync', nowTime);
      lastSyncedSignatureRef.current = computePayloadSignature({
        templeInfo: state.templeInfo,
        households: state.households,
        pastRecords: state.pastRecords,
        memorialServices: state.memorialServices,
        transactions: state.transactions,
        masterOptions: state.masterOptions,
        noticeTemplates: state.noticeTemplates,
        templeTodos: state.templeTodos,
        temples: state.temples,
        templeMasterOptionsMap: state.templeMasterOptionsMap,
        priests: state.priests,
        batchAccountingData: state.batchAccountingData,
      });
      setSyncStatus('synced');
      setSyncErrorMessage(null);
      return { success: true, count: localCount, sheetInfo: newSheet };
    } catch (err: any) {
      console.error('Google Sheets clean write failed:', err);
      setSyncStatus('error');
      if (isAuthError(err)) {
        setSyncErrorMessage('Google認証の有効期限が切れました。データ連携画面より再度ログインしてください。');
      } else if (err?.isNetworkError || err?.message?.includes('fetch') || err?.message?.includes('NetworkError')) {
        setSyncErrorMessage('Googleサーバーとの通信に失敗しました。ネットワーク環境をご確認ください。');
      } else {
        setSyncErrorMessage(err.message || 'Googleシートへの初期化書き込みに失敗しました。');
      }
      throw err;
    } finally {
      setTimeout(() => {
        isCleanWritingRef.current = false;
        isImportingRef.current = false;
      }, 1000);
    }
  }, []);

  // Clean write specific tables to Google Sheets (clears target sheet rows and overwrites with current local terminal records)
  const cleanWriteSpecificTablesToGoogleSheets = useCallback(async (targetTables: string[]) => {
    try {
      const token = await getAccessToken();
      const savedSheetInfo = safeStorage.getItem('temple_google_sheet_info');
      if (!token || !savedSheetInfo) return;

      let sheet: { id: string; url: string };
      try {
        sheet = JSON.parse(savedSheetInfo);
      } catch {
        sheet = await findOrCreateSpreadsheet(token);
      }
      const state = syncStateRef.current;

      await safeExportWithAutoRecovery(token, sheet.id, async (targetId) => {
        await exportSpecificTablesToSheets(
          token,
          targetId,
          targetTables,
          state.templeInfo,
          state.households,
          state.pastRecords,
          state.memorialServices,
          state.transactions,
          state.masterOptions,
          state.noticeTemplates,
          state.templeTodos,
          state.temples,
          {
            targetTempleId: 'ALL',
            templeMasterOptionsMap: state.templeMasterOptionsMap,
            priests: state.priests,
            deletedRecords: loadDeletedRecordsLog(),
            batchAccountingData: state.batchAccountingData !== undefined ? state.batchAccountingData : (getSavedBatchAccountingData() || undefined),
          }
        );
      });

      const nowTime = new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
      setLastSyncTime(nowTime);
      safeStorage.setItem('temple_google_sheet_last_sync', nowTime);
      setSyncStatus('synced');
      setSyncErrorMessage(null);
    } catch (err: any) {
      console.warn('Specific tables Google Sheets clean-write warning:', err);
    }
  }, []);

  const syncWithGoogleDriveRef = useRef(syncWithGoogleDrive);
  useEffect(() => {
    syncWithGoogleDriveRef.current = syncWithGoogleDrive;
  }, [syncWithGoogleDrive]);

  // Initial Auto-Import on Auth/App Load (runs only on mount)
  useEffect(() => {
    const unsubscribe = initAuth(async (user, token) => {
      if (user && token) {
        // Do not auto-import from Google Sheets if launcher is still open or clean write is underway
        if (isStartupLauncherOpenRef.current || isCleanWritingRef.current) {
          setSyncStatus('synced');
          lastSyncedSignatureRef.current = computePayloadSignature(syncStateRef.current);
          setIsInitialLoaded(true);
          return;
        }
        try {
          await syncWithGoogleDriveRef.current(token);
        } catch (e) {
          // Handled inside syncWithGoogleDrive
        }
      } else {
        setSyncStatus('disconnected');
        setIsInitialLoaded(true);
      }
    }, () => {
      setSyncStatus('disconnected');
      setIsInitialLoaded(true);
    });

    return () => unsubscribe();
  }, []);

  // Continuous Auto-Sync on User Data Changes (Debounced 2.5s)
  useEffect(() => {
    if (!isInitialLoaded) return;

    if (isImportingRef.current || isCleanWritingRef.current || isSyncInProgressRef.current) {
      return;
    }

    let timer: NodeJS.Timeout;

    const performAutoSync = async () => {
      if (isCleanWritingRef.current || isSyncInProgressRef.current || isImportingRef.current) return;
      const token = await getAccessToken();
      const savedSheetInfo = safeStorage.getItem('temple_google_sheet_info');
      if (!token || !savedSheetInfo) return;

      const curState = syncStateRef.current;
      const currentHouseholds = (households && households.length > 0) ? households : (curState.households || []);
      const currentPastRecords = (pastRecords && pastRecords.length > 0) ? pastRecords : (curState.pastRecords || []);
      const currentMemorials = (memorialServices && memorialServices.length > 0) ? memorialServices : (curState.memorialServices || []);
      const currentTodos = (templeTodos && templeTodos.length > 0) ? templeTodos : (curState.templeTodos || []);
      const currentTransactions = (transactions && transactions.length > 0) ? transactions : (curState.transactions || []);

      const exportPayload = {
        templeInfo: curState.templeInfo || templeInfo,
        households: currentHouseholds,
        pastRecords: currentPastRecords,
        memorialServices: currentMemorials,
        transactions: currentTransactions,
        masterOptions: curState.masterOptions || masterOptions,
        noticeTemplates: curState.noticeTemplates || noticeTemplates,
        templeTodos: currentTodos,
        temples: (curState.temples && curState.temples.length > 0) ? curState.temples : temples,
        templeMasterOptionsMap: curState.templeMasterOptionsMap || templeMasterOptionsMap,
        priests: curState.priests || priests,
        batchAccountingData: curState.batchAccountingData !== undefined ? curState.batchAccountingData : (getSavedBatchAccountingData() || undefined),
      };

      const payloadSig = computePayloadSignature(exportPayload);
      if (lastSyncedSignatureRef.current && payloadSig === lastSyncedSignatureRef.current) {
        // No local changes detected since last successful sync, avoid redundant export
        return;
      }

      isSyncInProgressRef.current = true;
      try {
        let sheet: { id: string; url: string };
        try {
          sheet = JSON.parse(savedSheetInfo);
        } catch {
          sheet = await findOrCreateSpreadsheet(token);
        }
        setSyncStatus('syncing');

        await safeExportWithAutoRecovery(token, sheet.id, async (targetId) => {
          await exportToSheets(
            token,
            targetId,
            exportPayload.templeInfo,
            exportPayload.households,
            exportPayload.pastRecords,
            exportPayload.memorialServices,
            exportPayload.transactions,
            exportPayload.masterOptions,
            exportPayload.noticeTemplates,
            exportPayload.templeTodos,
            exportPayload.temples,
            {
              targetTempleId: 'ALL',
              templeMasterOptionsMap: exportPayload.templeMasterOptionsMap,
              priests: exportPayload.priests,
              deletedRecords: loadDeletedRecordsLog(),
              batchAccountingData: exportPayload.batchAccountingData !== undefined ? exportPayload.batchAccountingData : (getSavedBatchAccountingData() || undefined),
            }
          );
        });

        lastSyncedSignatureRef.current = payloadSig;
        const nowTime = new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
        setLastSyncTime(nowTime);
        safeStorage.setItem('temple_google_sheet_last_sync', nowTime);
        setSyncStatus('synced');
        setSyncErrorMessage(null);
      } catch (err: any) {
        console.error('Auto sync to Google Sheets failed:', err);
        setSyncStatus('error');
        if (isAuthError(err)) {
          setSyncErrorMessage('Google認証の有効期限が切れました。データ連携画面より再度ログインしてください。');
        } else if (err?.isTimeout || err?.message?.includes('タイムアウト')) {
          setSyncErrorMessage('Googleサーバーとの通信がタイムアウトしました。通信環境をご確認の上、再度お試しください。');
        } else if (err?.isNetworkError || err?.message?.includes('fetch') || err?.message?.includes('NetworkError')) {
          setSyncErrorMessage('Googleサーバーとの通信に一時的に失敗しました。ネットワーク接続をご確認ください。');
        } else {
          setSyncErrorMessage(err.message || '自動同期に失敗しました。');
        }
      } finally {
        isSyncInProgressRef.current = false;
      }
    };

    timer = setTimeout(() => {
      performAutoSync();
    }, 2500);

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [templeInfo, temples, masterOptions, templeMasterOptionsMap, households, pastRecords, memorialServices, templeTodos, transactions, familyMembers, noticeTemplates, priests, batchAccountingData, isInitialLoaded]);

  // Manual Instant Sync Trigger (Bidirectional merge with audit priority & Push to Sheets)
  const handleManualSync = async () => {
    const token = await getAccessToken();
    const savedSheetInfo = safeStorage.getItem('temple_google_sheet_info');
    if (!token || !savedSheetInfo) {
      setIsGoogleSheetsModalOpen(true);
      return;
    }

    try {
      let sheet: { id: string; url: string };
      try {
        sheet = JSON.parse(savedSheetInfo);
      } catch {
        sheet = await findOrCreateSpreadsheet(token);
      }
      setSyncStatus('syncing');

      // 1. Googleシートから最新データを取得して日時照会
      let remoteData: SheetsImportResult | null = null;
      try {
        const res = await safeImportWithAutoRecovery(token, sheet.id);
        remoteData = res.data;
        sheet = res.sheet;
      } catch (e) {
        console.warn('Manual sync import preview error (will write local state):', e);
      }

      let exportPayload = {
        templeInfo,
        households,
        pastRecords,
        memorialServices,
        transactions,
        masterOptions,
        noticeTemplates,
        templeTodos,
        temples,
        templeMasterOptionsMap,
        priests,
        batchAccountingData,
      };

      if (remoteData && remoteData.totalRecordsCount > 0) {
        const merged = applyRemoteSheetsData(remoteData);
        exportPayload = {
          templeInfo: merged.templeInfo,
          households: merged.households,
          pastRecords: merged.pastRecords,
          memorialServices: merged.memorialServices,
          transactions: merged.transactions,
          masterOptions: merged.masterOptions || masterOptions,
          noticeTemplates: merged.noticeTemplates || noticeTemplates,
          templeTodos: merged.templeTodos,
          temples: merged.temples || temples,
          templeMasterOptionsMap: merged.templeMasterOptionsMap || templeMasterOptionsMap,
          priests: merged.priests || priests,
          batchAccountingData: remoteData.batchAccountingData || batchAccountingData,
        };
        recordHistory(`Googleシートと日時照会同期完了: ${merged.summaryMessage}`);
      }

      // 2. 最新マージ結果をGoogleシートへ書き出し
      await safeExportWithAutoRecovery(token, sheet.id, async (targetId) => {
        await exportToSheets(
          token,
          targetId,
          exportPayload.templeInfo,
          exportPayload.households,
          exportPayload.pastRecords,
          exportPayload.memorialServices,
          exportPayload.transactions,
          exportPayload.masterOptions,
          exportPayload.noticeTemplates,
          exportPayload.templeTodos,
          exportPayload.temples,
          {
            targetTempleId: 'ALL',
            templeMasterOptionsMap: exportPayload.templeMasterOptionsMap,
            priests: exportPayload.priests,
            deletedRecords: loadDeletedRecordsLog(),
            batchAccountingData: exportPayload.batchAccountingData || getSavedBatchAccountingData() || undefined,
          }
        );
      });

      const nowTime = new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
      setLastSyncTime(nowTime);
      safeStorage.setItem('temple_google_sheet_last_sync', nowTime);
      setSyncStatus('synced');
      setSyncErrorMessage(null);
    } catch (err: any) {
      console.error('Manual sync failed:', err);
      setSyncStatus('error');
      if (isAuthError(err)) {
        setSyncErrorMessage('Google認証の有効期限が切れました。データ連携画面より再度ログインしてください。');
      } else if (err?.isNetworkError || err?.message?.includes('fetch') || err?.message?.includes('NetworkError')) {
        setSyncErrorMessage('Googleサーバーとの通信に一時的に失敗しました。ネットワーク環境をご確認ください。');
      } else {
        setSyncErrorMessage(err.message || '同期に失敗しました。');
      }
    }
  };

  // Manual Pull from Sheets (Merge local data with Google Drive data based on audit timestamps)
  const handlePullFromSheets = async () => {
    const token = await getAccessToken();
    const savedSheetInfo = safeStorage.getItem('temple_google_sheet_info');
    if (!token || !savedSheetInfo) {
      setIsGoogleSheetsModalOpen(true);
      return;
    }

    try {
      let sheet: { id: string; url: string };
      try {
        sheet = JSON.parse(savedSheetInfo);
      } catch {
        sheet = await findOrCreateSpreadsheet(token);
      }
      setSyncStatus('syncing');
      const { data: remoteData, sheet: activeSheet } = await safeImportWithAutoRecovery(token, sheet.id);
      sheet = activeSheet;

      const localCount = households.length + pastRecords.length + memorialServices.length + templeTodos.length + transactions.length;
      if (remoteData.totalRecordsCount === 0 && localCount > 0) {
        throw new Error('Googleスプレッドシート側に登録データがありません（0件）。端末データを誤って消去することを防止するため、読み込みを中止しました。');
      }

      const merged = applyRemoteSheetsData(remoteData);

      // マージ結果をGoogleシート側にも保存して相互の最新状態を一致させる
      await safeExportWithAutoRecovery(token, sheet.id, async (targetId) => {
        await exportToSheets(
          token,
          targetId,
          merged.templeInfo,
          merged.households,
          merged.pastRecords,
          merged.memorialServices,
          merged.transactions,
          merged.masterOptions || masterOptions,
          merged.noticeTemplates || noticeTemplates,
          merged.templeTodos,
          merged.temples || temples,
          {
            targetTempleId: 'ALL',
            templeMasterOptionsMap: merged.templeMasterOptionsMap || templeMasterOptionsMap,
            priests: merged.priests || priests,
            deletedRecords: loadDeletedRecordsLog(),
          }
        );
      });

      const nowTime = new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
      setLastSyncTime(nowTime);
      safeStorage.setItem('temple_google_sheet_last_sync', nowTime);
      setSyncStatus('synced');
      setSyncErrorMessage(null);
      recordHistory(`Googleシートから最新データを照会・同期完了（${merged.summaryMessage}）`);
    } catch (err: any) {
      console.error('Pull from Google Sheets failed:', err);
      setSyncStatus('error');
      if (isAuthError(err)) {
        setSyncErrorMessage('Google認証の有効期限が切れました。データ連携画面より再度ログインしてください。');
      } else if (err?.isNetworkError || err?.message?.includes('fetch') || err?.message?.includes('NetworkError')) {
        setSyncErrorMessage('Googleサーバーとの通信に一時的に失敗しました。ネットワーク環境をご確認ください。');
      } else {
        setSyncErrorMessage(err.message || 'クラウドからのデータ取得に失敗しました。');
      }
      throw err;
    }
  };

  // Manual Restore from Safety Backup Snapshot
  const handleRestoreFromBackup = async (): Promise<{ success: boolean; message: string }> => {
    try {
      const backup = (await idbGet<any>('temple_safety_snapshot')) 
        || loadJsonState<any>('temple_safety_snapshot', null) 
        || (await idbGet<any>('temple_backup_before_sync')) 
        || loadJsonState<any>('temple_backup_before_sync', null);

      if (!backup || (!backup.recordCount && !backup.households?.length && !backup.pastRecords?.length)) {
        return { success: false, message: '復元可能なバックアップデータが見つかりませんでした。' };
      }

      if (backup.households && Array.isArray(backup.households)) setHouseholds(backup.households);
      if (backup.pastRecords && Array.isArray(backup.pastRecords)) setPastRecords(backup.pastRecords);
      if (backup.memorialServices && Array.isArray(backup.memorialServices)) setMemorialServices(backup.memorialServices);
      if (backup.templeTodos && Array.isArray(backup.templeTodos)) setTempleTodos(backup.templeTodos);
      if (backup.transactions && Array.isArray(backup.transactions)) setTransactions(backup.transactions);
      if (backup.familyMembers && Array.isArray(backup.familyMembers)) setFamilyMembers(backup.familyMembers);
      if (backup.temples && Array.isArray(backup.temples)) setTemples(backup.temples);
      if (backup.templeInfo) setTempleInfo(backup.templeInfo);
      if (backup.masterOptions) setMasterOptions(backup.masterOptions);
      if (backup.templeMasterOptionsMap) setTempleMasterOptionsMap(backup.templeMasterOptionsMap);

      const totalRestored = (backup.households?.length || 0) + (backup.pastRecords?.length || 0) + (backup.memorialServices?.length || 0) + (backup.transactions?.length || 0);
      recordHistory(`バックアップスナップショットからデータを復元（総レコード数: ${totalRestored}件）`);
      return { success: true, message: `セーフティバックアップから正常に復元しました（檀家名簿 ${backup.households?.length || 0}件、過去帳 ${backup.pastRecords?.length || 0}件、予定 ${backup.memorialServices?.length || 0}件、会計 ${backup.transactions?.length || 0}件）。` };
    } catch (err: any) {
      return { success: false, message: `復元エラー: ${err.message || '復元に失敗しました。'}` };
    }
  };

  // Local Excel Export & Import Handlers
  const handleExportExcel = (targetTempleId?: string | 'ALL') => {
    try {
      const activeBatch = getSavedBatchAccountingData(targetTempleId !== 'ALL' ? targetTempleId : undefined);
      exportToExcel(
        templeInfo,
        households,
        pastRecords,
        memorialServices,
        transactions,
        activeMasterOptions,
        noticeTemplates,
        templeTodos,
        temples,
        {
          targetTempleId: targetTempleId || 'ALL',
          templeMasterOptionsMap,
          priests,
          batchAccountingData: activeBatch || undefined,
        }
      );
    } catch (err: any) {
      console.error('Excel Export error:', err);
      alert(`Excelファイルの書き出しに失敗しました: ${err.message || err}`);
    }
  };

  // Googleシート連携中断ダイアログでの「元に戻すを実行」確認ハンドラー
  const handleConfirmUndoInterrupt = () => {
    // 1. Googleシートとの連携を解除
    handleDisconnectGoogle();

    // 2. Excel入出力の「全寺院データを一括書き出し」をダイアログなしに実行
    handleExportExcel('ALL');

    // 3. Undo / Redo を実行
    if (undoInterruptAction === 'redo') {
      redo();
    } else {
      undo();
    }

    // 4. ダイアログを閉じる
    setIsGoogleSheetsUndoInterruptOpen(false);
  };

  const handleImportExcel = async (file: File, targetTempleId?: string | 'ALL') => {
    const modeLabel = targetTempleId && targetTempleId !== 'ALL'
      ? `指定寺院（${temples.find((t) => t.id === targetTempleId)?.name || '指定寺院'}）へのデータ取り込み`
      : '全寺院データの一括取り込み';

    recordHistory(`Excelデータ取り込み（${modeLabel}）`);

    const defaultTemple = activeTempleId !== 'ALL' ? activeTempleId : (temples[0]?.id || 'temple-main');
    const data = await importFromExcel(file, {
      targetTempleId: targetTempleId || 'ALL',
      defaultTempleId: defaultTemple,
    });

    // If batch accounting data is present in imported file, restore it
    if (data.batchAccountingData) {
      saveBatchAccountingData(data.batchAccountingData);
    }

    const importedHouseholds = data.households || [];
    const importedPast = data.pastRecords || [];
    const importedMem = data.memorialServices || [];
    const importedTodos = data.templeTodos || [];
    const importedTx = data.transactions || [];

    const totalParsed = importedHouseholds.length + importedPast.length + importedMem.length + importedTodos.length + importedTx.length;
    if (totalParsed === 0 && !data.temples?.length && !data.templeInfo) {
      throw new Error('Excelファイルから有効なデータ（檀家名簿・過去帳・法事予約・ToDo・出納）を検出できませんでした。シート名や見出し列名をご確認ください。');
    }

    if (!targetTempleId || targetTempleId === 'ALL') {
      // 全寺院一括取り込み：既存の全データベース（寺院情報、兼務寺、区分、勘定科目、全レコード）を完全消去・初期化してから反映
      setHouseholds(importedHouseholds);
      setPastRecords(importedPast);
      setMemorialServices(importedMem);
      setTempleTodos(importedTodos);
      setTransactions(importedTx);

      const extractedFamily = importedHouseholds.flatMap((h) => h.familyMembers || []);
      setFamilyMembers(extractedFamily);

      setSelectedIdsForPrint([]);
      setExcludedHouseholdIds([]);
      setEditingHousehold(null);

      if (data.priests && data.priests.length > 0) {
        setPriests(data.priests);
        saveJsonState('temple_priests', data.priests);
      } else {
        setPriests([]);
        saveJsonState('temple_priests', []);
      }

      // 寺院情報・兼務寺院の完全置き換え
      let finalTemples: TempleProfile[] = [];
      let finalTempleInfo: TempleInfo;

      if (data.temples && data.temples.length > 0) {
        finalTemples = data.temples;
        finalTempleInfo = data.templeInfo || data.temples[0];
      } else if (data.templeInfo) {
        finalTemples = [{ ...data.templeInfo, id: data.templeInfo.id || 'temple-main', isMain: true }];
        finalTempleInfo = data.templeInfo;
      } else {
        finalTemples = EMPTY_TEMPLES;
        finalTempleInfo = EMPTY_TEMPLE_INFO;
      }

      setTemples(finalTemples);
      setTempleInfo(finalTempleInfo);
      setActiveTempleId(finalTemples[0]?.id || 'temple-main');

      // マスタ設定（区分・勘定科目すべて）の完全置き換え
      const newMaster = data.masterOptions || INITIAL_MASTER_OPTIONS;
      const finalMaster = data.masterOptions
        ? data.masterOptions
        : mergeMasterOptionsWithData(newMaster, importedHouseholds, importedTx);
      setMasterOptions(finalMaster);
      const newMasterMap = data.templeMasterOptionsMap || {};
      setTempleMasterOptionsMap(newMasterMap);

      // 永続化ストレージへの完全上書き保存（旧データの完全消去）
      saveJsonState('temple_households', importedHouseholds);
      saveJsonState('temple_family_members', extractedFamily);
      saveJsonState('temple_past_records', importedPast);
      saveJsonState('temple_memorial_services', importedMem);
      saveJsonState('temple_todos', importedTodos);
      saveJsonState('temple_transactions', importedTx);
      saveJsonState('temple_profiles_list', finalTemples);
      saveJsonState('temple_info', finalTempleInfo);
      saveJsonState('temple_master_options', finalMaster);
      saveJsonState('temple_master_options_map', newMasterMap);
      saveJsonState('temple_excluded_households', []);
      saveJsonState('temple_selected_print_ids', []);
    } else {
      // 指定寺院のみの置き換え・統合
      const targetId = targetTempleId;
      if (importedHouseholds.length > 0) {
        setHouseholds((prev) => [
          ...prev.filter((h) => (h.templeId || 'temple-main') !== targetId),
          ...importedHouseholds,
        ]);
      }
      if (importedPast.length > 0) {
        setPastRecords((prev) => [
          ...prev.filter((r) => (r.templeId || 'temple-main') !== targetId),
          ...importedPast,
        ]);
      }
      if (importedTx.length > 0) {
        setTransactions((prev) => [
          ...prev.filter((t) => (t.templeId || 'temple-main') !== targetId),
          ...importedTx,
        ]);
      }
      if (importedMem.length > 0) {
        setMemorialServices((prev) => [
          ...prev.filter((m) => (m.templeId || 'temple-main') !== targetId),
          ...importedMem,
        ]);
      }
      if (importedTodos.length > 0) {
        setTempleTodos((prev) => [
          ...prev.filter((td) => (td.templeId || 'temple-main') !== targetId),
          ...importedTodos,
        ]);
      }

      if (data.masterOptions) {
        setTempleMasterOptionsMap((prev) => {
          const next = { ...prev, [targetId]: data.masterOptions! };
          saveJsonState('temple_master_options_map', next);
          return next;
        });
        if (targetId === 'temple-main' || targetId === temples[0]?.id) {
          setMasterOptions(data.masterOptions);
          saveJsonState('temple_master_options', data.masterOptions);
        }
      }

      if (data.templeInfo || (data.temples && data.temples.length > 0)) {
        const importedT = data.templeInfo || data.temples?.find((t) => t.id === targetId) || data.temples?.[0];
        if (importedT) {
          setTemples((prev) => prev.map((t) => {
            if (t.id === targetId || (targetId === 'temple-main' && t.isMain)) {
              return {
                ...t,
                ...importedT,
                id: t.id,
                isMain: t.isMain,
                annualEvents: importedT.annualEvents && importedT.annualEvents.length > 0 ? importedT.annualEvents : t.annualEvents,
              };
            }
            return t;
          }));
          if (targetId === 'temple-main' || targetId === temples[0]?.id) {
            setTempleInfo((prev) => ({
              ...prev,
              ...importedT,
              id: prev.id || 'temple-main',
              isMain: true,
              annualEvents: importedT.annualEvents && importedT.annualEvents.length > 0 ? importedT.annualEvents : prev.annualEvents,
            }));
          }
        }
      }
    }

    if (data.noticeTemplates) {
      setNoticeTemplates(data.noticeTemplates);
      saveNoticeTemplates(data.noticeTemplates);
    }

    const summaryParts: string[] = [];
    if (importedHouseholds.length > 0) summaryParts.push(`檀家名簿 ${importedHouseholds.length}件`);
    if (importedPast.length > 0) summaryParts.push(`過去帳 ${importedPast.length}件`);
    if (importedMem.length > 0) summaryParts.push(`法事予約 ${importedMem.length}件`);
    if (importedTodos.length > 0) summaryParts.push(`ToDo ${importedTodos.length}件`);
    if (importedTx.length > 0) summaryParts.push(`出納 ${importedTx.length}件`);

    const summaryText = summaryParts.length > 0 ? summaryParts.join('、') : '設定情報';
    return {
      success: true,
      message: `取り込み完了: ${summaryText} を反映しました。`,
    };
  };

  // External Database Wizard Import Handlers
  const handleOpenImportModal = (target: ImportTargetType = 'household') => {
    setImportModalTargetType(target);
    setIsImportModalOpen(true);
  };

  const handleImportExternalSuccess = (data: {
    households?: Household[];
    pastRecords?: PastRecord[];
    transactions?: Transaction[];
    memorialServices?: MemorialService[];
    mode?: 'append' | 'merge' | 'replace';
    clearAll?: boolean;
    masterOptions?: MasterOptions;
    targetTempleId?: string;
  }) => {
    recordHistory('外部データベース取込');

    let nextHouseholds = households;
    let nextTransactions = transactions;

    if (data.mode === 'replace') {
      if (data.clearAll) {
        // Full database wipe and replace
        nextHouseholds = data.households || [];
        nextTransactions = data.transactions || [];
        setHouseholds(nextHouseholds);
        setPastRecords(data.pastRecords || []);
        setTransactions(nextTransactions);
        setMemorialServices(data.memorialServices || []);
      } else {
        // Wipe and replace only the imported collections
        if (data.households !== undefined) {
          nextHouseholds = data.households;
          setHouseholds(nextHouseholds);
        }
        if (data.pastRecords !== undefined) {
          setPastRecords(data.pastRecords);
        }
        if (data.transactions !== undefined) {
          nextTransactions = data.transactions;
          setTransactions(nextTransactions);
        }
        if (data.memorialServices !== undefined) {
          setMemorialServices(data.memorialServices);
        }
      }
    } else {
      if (data.households) {
        nextHouseholds = data.households;
        setHouseholds(nextHouseholds);
      }
      if (data.pastRecords) {
        setPastRecords(data.pastRecords);
      }
      if (data.transactions) {
        nextTransactions = data.transactions;
        setTransactions(nextTransactions);
      }
    }

    // Always merge imported unique householdTypes, statuses, districts, categories, and paymentMethods into masterOptions and persist to storage
    const targetTemple = data.targetTempleId || (activeTempleId === 'ALL' ? (temples[0]?.id || 'temple-main') : activeTempleId);
    const updatedMaster = data.masterOptions || mergeMasterOptionsWithData(
      activeMasterOptions,
      data.households || nextHouseholds,
      data.transactions || nextTransactions
    );
    handleSaveMasterOptions(updatedMaster, targetTemple);
  };

  // Handlers: Household CRUD
  const handleSaveHousehold = (household: Household) => {
    const existing = households.find((h) => h.id === household.id);
    const exists = !!existing;
    const auditedHousehold = exists
      ? withUpdateAudit(household, existing)
      : withCreationAudit(household);

    recordHistory(exists ? `世帯「${household.familyHead || household.id}」を更新` : `世帯「${household.familyHead || household.id}」を追加`);

    setHouseholds((prev) => {
      if (exists) {
        return prev.map((h) => (h.id === household.id ? auditedHousehold : h));
      } else {
        return [auditedHousehold, ...prev];
      }
    });
  };

  const handleBatchUpdateHouseholds = (updatedList: Household[], description?: string) => {
    recordHistory(description || `${updatedList.length}件の世帯情報を一括更新`);
    const existingMap = new Map(households.map((h) => [h.id, h]));
    const updateMap = new Map(
      updatedList.map((h) => {
        const exist = existingMap.get(h.id);
        const audited = withUpdateAudit(h, exist);
        return [h.id, audited];
      })
    );
    setHouseholds((prev) => prev.map((h) => updateMap.get(h.id) || h));
  };

  const handleDeleteHousehold = (id: string) => {
    const target = households.find((h) => h.id === id);
    recordHistory(`世帯「${target?.familyHead || id}」を削除`);
    recordDeletedRecord(
      id,
      'household',
      target?.familyHead ? `世帯「${target.familyHead}」` : `世帯(${id})`,
      target?.templeId
    );

    setHouseholds((prev) => prev.filter((h) => h.id !== id));
    // 過去帳データはそのまま残し、過去帳と紐づく世帯IDのみ空文字にクリア
    setPastRecords((prev) =>
      prev.map((r) => (r.householdId === id ? { ...r, householdId: '' } : r))
    );
  };

  // Handlers: Past Record CRUD
  const handleAddPastRecord = (record: PastRecord) => {
    recordHistory(`過去帳「${record.dharmaName || record.secularName || record.id}」を追加`);
    setPastRecords((prev) => [withCreationAudit(record), ...prev]);
  };

  const handleBatchAddPastRecords = (records: PastRecord[], description?: string) => {
    recordHistory(description || `${records.length}件の過去帳（精霊）を一括追加`);
    const audited = records.map((r) => withCreationAudit(r));
    setPastRecords((prev) => [...audited, ...prev]);
  };

  const handleUpdatePastRecord = (record: PastRecord) => {
    recordHistory(`過去帳「${record.dharmaName || record.secularName || record.id}」を更新`);
    const existing = pastRecords.find((r) => r.id === record.id);
    setPastRecords((prev) => prev.map((r) => (r.id === record.id ? withUpdateAudit(record, existing) : r)));
  };

  const handleDeletePastRecord = (id: string) => {
    const target = pastRecords.find((r) => r.id === id);
    recordHistory(`過去帳「${target?.dharmaName || target?.secularName || id}」を削除`);
    recordDeletedRecord(
      id,
      'pastRecord',
      target?.dharmaName || target?.secularName || id,
      target?.templeId
    );
    setPastRecords((prev) => prev.filter((r) => r.id !== id));
  };

  // Create Memorial Service from Past Record Milestone
  const handleCreateMemorialFromPastRecord = (
    pastRecord: PastRecord,
    milestoneType: string,
    scheduledDate: string,
    noticeText?: string
  ) => {
    recordHistory(`年回忌法要「${pastRecord.dharmaName} ${milestoneType}」を作成`);

    const household = households.find((h) => h.id === pastRecord.householdId);
    const mainTempleId = temples.find((t) => t.isMain)?.id || 'temple-main';
    const targetTempleId = pastRecord.templeId || household?.templeId || (activeTempleId !== 'ALL' ? activeTempleId : mainTempleId);

    const rawService: MemorialService = {
      id: `MS-${Date.now()}`,
      templeId: targetTempleId,
      householdId: pastRecord.householdId,
      deceasedId: pastRecord.id,
      deceasedName: pastRecord.secularName,
      dharmaName: pastRecord.dharmaName,
      memorialType: milestoneType as any,
      scheduledDate,
      scheduledTime: '11:00',
      venue: '本堂',
      address: household?.address || '',
      status: noticeText ? '案内送付済' : '未入金',
      chiefMourner: household ? household.familyHead : pastRecord.householdHeadName,
      attendeeCount: 10,
      offeringAmount: 100000,
      noticeText: noticeText || '',
      notes: `${pastRecord.dharmaName} (${pastRecord.secularName}) ${milestoneType}法要`,
      receptionCheckedIn: false,
    };

    const newService = withCreationAudit(rawService);

    setMemorialServices((prev) => [newService, ...prev]);
    if (pastRecord.householdId) {
      setSelectedIdsForPrint([pastRecord.householdId]);
    } else if (pastRecord.householdHeadName) {
      const found = households.find(
        (h) => h.familyHead.includes(pastRecord.householdHeadName) || pastRecord.householdHeadName.includes(h.familyHead)
      );
      if (found) {
        setSelectedIdsForPrint([found.id]);
      }
    }
    if (noticeText) {
      setCustomPrintMessage(noticeText);
    }
    setActiveTab('print');
  };

  // Handlers: Memorial Services CRUD
  const handleAddService = (service: MemorialService) => {
    recordHistory(`法要「${service.notes || service.id}」を追加`);
    const auditedService = withCreationAudit(service);
    setMemorialServices((prev) => [auditedService, ...prev]);
    
    // 塔婆ToDoの自動作成/同期
    setTempleTodos((prevTodos) =>
      syncTobaTodosList(auditedService, prevTodos, {
        pastRecords,
        temples,
        activeTempleId,
      })
    );

    if (service.scheduledDate) {
      setCalendarTargetDate(service.scheduledDate);
    }
    // 兼務寺の法要を予約した場合、カレンダー側でもその寺院の予定が表示されるようアクティブ寺院を連動
    if (service.templeId && activeTempleId !== 'ALL' && activeTempleId !== service.templeId) {
      setActiveTempleId(service.templeId);
    }
    setActiveTab('reservations');
  };

  const handleUpdateService = (service: MemorialService) => {
    recordHistory(`法要「${service.notes || service.id}」を更新`);
    const existing = memorialServices.find((s) => s.id === service.id);
    const auditedService = withUpdateAudit(service, existing);
    setMemorialServices((prev) => prev.map((s) => (s.id === service.id ? auditedService : s)));

    // 塔婆ToDoの自動更新/同期
    setTempleTodos((prevTodos) =>
      syncTobaTodosList(auditedService, prevTodos, {
        pastRecords,
        temples,
        activeTempleId,
        oldService: existing,
      })
    );
  };

  const handleDeleteService = (id: string) => {
    const existing = memorialServices.find((s) => s.id === id);
    recordHistory(`法要を削除`);
    recordDeletedRecord(
      id,
      'memorialService',
      existing?.notes || existing?.deceasedName || id,
      existing?.templeId
    );
    setMemorialServices((prev) => prev.filter((s) => s.id !== id));

    // 関連する塔婆タスクも削除
    if (existing) {
      setTempleTodos((prevTodos) =>
        prevTodos.filter((t) => t.relatedServiceId !== id)
      );
    }
  };

  // Handlers: Temple Todos CRUD
  const handleAddTodo = (todo: TempleTodo) => {
    recordHistory(`タスク「${todo.title}」を追加`);
    setTempleTodos((prev) => {
      const existing = prev.find((t) => t.id === todo.id);
      if (existing) {
        return prev.map((t) => (t.id === todo.id ? withUpdateAudit(todo, existing) : t));
      }
      return [withCreationAudit(todo), ...prev];
    });
  };

  const handleUpdateTodo = (todo: TempleTodo) => {
    recordHistory(`タスク「${todo.title}」を更新`);
    const existing = templeTodos.find((t) => t.id === todo.id);
    setTempleTodos((prev) => prev.map((t) => (t.id === todo.id ? withUpdateAudit(todo, existing) : t)));
  };

  const handleDeleteTodo = (id: string) => {
    const target = templeTodos.find((t) => t.id === id);
    recordHistory(`タスクを削除`);
    recordDeletedRecord(
      id,
      'templeTodo',
      target?.title || id,
      target?.templeId
    );
    setTempleTodos((prev) => prev.filter((t) => t.id !== id));
  };

  // Handlers: Family Members CRUD
  const handleAddFamilyMember = (member: FamilyMember) => {
    recordHistory(`家族「${member.name}」を追加`);
    setFamilyMembers((prev) => [withCreationAudit(member), ...prev]);
  };

  const handleUpdateFamilyMember = (member: FamilyMember) => {
    recordHistory(`家族「${member.name}」を更新`);
    const existing = familyMembers.find((m) => m.id === member.id);
    setFamilyMembers((prev) => prev.map((m) => (m.id === member.id ? withUpdateAudit(member, existing) : m)));
  };

  const handleDeleteFamilyMember = (id: string) => {
    const target = familyMembers.find((m) => m.id === id);
    const relatedHousehold = target ? households.find((h) => h.id === target.householdId) : undefined;
    recordHistory(`家族を削除`);
    recordDeletedRecord(
      id,
      'familyMember',
      target?.name || id,
      relatedHousehold?.templeId
    );
    setFamilyMembers((prev) => prev.filter((m) => m.id !== id));
  };

  // Handlers: Transactions CRUD
  const handleAddTransaction = (transaction: Transaction) => {
    recordHistory(`出納「${transaction.notes || transaction.category}」を追加`);
    const defaultTempleId = isAccountingCombined
      ? (mainTempleProfile?.id || 'temple-main')
      : (activeTempleId === 'ALL' ? (mainTempleProfile?.id || 'temple-main') : activeTempleId);
    const txWithTemple: Transaction = {
      ...transaction,
      templeId: transaction.templeId || defaultTempleId,
    };
    setTransactions((prev) => [withCreationAudit(txWithTemple), ...prev]);
  };

  const handleAddBatchTransactions = (newTransactions: Transaction[]) => {
    if (newTransactions.length === 0) return;
    recordHistory(`出納「一括会計受付」${newTransactions.length}件を追加`);
    const auditedList = newTransactions.map((t) => withCreationAudit(t));
    setTransactions((prev) => {
      const nextTx = [...auditedList, ...prev];
      syncStateRef.current.transactions = nextTx;
      return nextTx;
    });
    // 一括受付を帳簿追加後、Googleシート側の一括会計受付・設定をクリアし出納帳を反映
    cleanWriteSpecificTablesToGoogleSheets(['一括会計受付', '一括会計設定', '出納・会計']);
  };

  const handleUpdateTransaction = (transaction: Transaction) => {
    recordHistory(`出納「${transaction.notes || transaction.category}」を更新`);
    const existing = transactions.find((t) => t.id === transaction.id);
    setTransactions((prev) => prev.map((t) => (t.id === transaction.id ? withUpdateAudit(transaction, existing) : t)));
  };

  const handleDeleteTransaction = (id: string) => {
    const targetTx = transactions.find((t) => t.id === id);
    recordHistory(`出納レコードを削除`);
    recordDeletedRecord(
      id,
      'transaction',
      targetTx?.notes || targetTx?.category || id,
      targetTx?.templeId
    );
    const relatedSrvId = targetTx?.relatedServiceId;

    const nextTransactions = transactions.filter((t) => t.id !== id);
    setTransactions(nextTransactions);

    // If this transaction was linked to a memorial service, check if all transactions are deleted
    if (relatedSrvId) {
      const remainingForService = nextTransactions.filter(
        (t) => t.relatedServiceId === relatedSrvId
      );
      if (remainingForService.length === 0) {
        setMemorialServices((prev) =>
          prev.map((s) => {
            if (s.id === relatedSrvId) {
              const normDate = normalizeDateInput(s.scheduledDate) || s.scheduledDate;
              const todayIso = new Date().toISOString().slice(0, 10).replace(/-/g, '/');
              const newStatus = normDate > todayIso ? '法要前' : '未入金';
              return {
                ...s,
                status: newStatus,
                accountingRecorded: false,
                transactionId: undefined,
              };
            }
            return s;
          })
        );
      }
    }
  };

  // Handlers: Sort & Exclude
  const handleSortChange = (key: any, order: 'asc' | 'desc') => {
    recordHistory(`世帯の並び順を変更 (${order === 'asc' ? '昇順' : '降順'})`);
    setHouseholdSortKey(key);
    setHouseholdSortOrder(order);
    safeStorage.setItem('household_sort_key', key);
    safeStorage.setItem('household_sort_order', order);
  };

  const handleToggleExcludeHousehold = (id: string) => {
    const willExclude = !excludedHouseholdIds.includes(id);
    recordHistory(willExclude ? '世帯を抽出外に設定' : '世帯を抽出外から解除');
    setExcludedHouseholdIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSaveTempleInfo = (info: TempleInfo) => {
    const nowIso = new Date().toISOString();
    const todayStr = nowIso.split('T')[0];
    const timeStr = new Date().toLocaleTimeString('ja-JP');
    const stampedInfo: TempleInfo = {
      ...info,
      updatedAt: nowIso,
      updatedDate: todayStr,
      updatedTime: timeStr,
    };
    recordHistory('寺院情報を変更');
    setTempleInfo(stampedInfo);
    saveJsonState('temple_info', stampedInfo);
    syncStateRef.current.templeInfo = stampedInfo;
    setTemples((prev) => {
      const idx = prev.findIndex((t) => t.id === (info.id || 'temple-main'));
      let next: TempleProfile[];
      if (idx >= 0) {
        next = [...prev];
        next[idx] = { ...next[idx], ...stampedInfo };
      } else {
        next = [...prev, stampedInfo];
      }
      saveJsonState('temple_profiles_list', next);
      saveJsonState('temple_profiles', next);
      syncStateRef.current.temples = next;
      return next;
    });
    // Googleシートの寺院情報・寺院一覧テーブルを初期化・端末側レコードで置き換え
    cleanWriteSpecificTablesToGoogleSheets(['寺院情報', '寺院一覧（本寺・兼務）']);
  };

  const handleSaveTemples = (updatedTemples: TempleProfile[], activeId?: string) => {
    const nowIso = new Date().toISOString();
    const todayStr = nowIso.split('T')[0];
    const timeStr = new Date().toLocaleTimeString('ja-JP');
    const stampedTemples = updatedTemples.map((t) => ({
      ...t,
      updatedAt: nowIso,
      updatedDate: todayStr,
      updatedTime: timeStr,
    }));
    recordHistory('寺院情報・兼務寺院設定を変更');
    setTemples(stampedTemples);
    saveJsonState('temple_profiles_list', stampedTemples);
    saveJsonState('temple_profiles', stampedTemples);
    syncStateRef.current.temples = stampedTemples;
    const targetId = activeId || activeTempleId;
    setActiveTempleId(targetId);
    safeStorage.setItem('active_temple_id', targetId);
    const main = stampedTemples.find((t) => t.isMain) || stampedTemples[0];
    if (main) {
      setTempleInfo(main);
      saveJsonState('temple_info', main);
      syncStateRef.current.templeInfo = main;
    }
    // Googleシートの寺院一覧・寺院情報テーブルを初期化・端末側レコードで置き換え
    cleanWriteSpecificTablesToGoogleSheets(['寺院一覧（本寺・兼務）', '寺院情報']);
  };

  const handleDeleteSubTemple = (deletedTempleId: string) => {
    const deletedTemple = temples.find((t) => t.id === deletedTempleId);
    const templeName = deletedTemple
      ? `${deletedTemple.mountainName ? deletedTemple.mountainName + ' ' : ''}${deletedTemple.name}`
      : deletedTempleId;

    // 1. 削除対象寺院に属する世帯ID一覧
    const deletedHouseholds = households.filter((h) => (h.templeId || 'temple-main') === deletedTempleId);
    const deletedHhIdSet = new Set(deletedHouseholds.map((h) => h.id));

    // 2. 世帯データの完全削除
    const nextHouseholds = households.filter((h) => (h.templeId || 'temple-main') !== deletedTempleId);
    setHouseholds(nextHouseholds);
    saveJsonState('temple_households', nextHouseholds);

    // 3. 過去帳データの完全削除（寺院ID一致または削除世帯紐づき）
    const deletedPast = pastRecords.filter((r) => (r.templeId || 'temple-main') === deletedTempleId || (r.householdId && deletedHhIdSet.has(r.householdId)));
    const nextPastRecords = pastRecords.filter((r) => {
      if ((r.templeId || 'temple-main') === deletedTempleId) return false;
      if (r.householdId && deletedHhIdSet.has(r.householdId)) return false;
      return true;
    });
    setPastRecords(nextPastRecords);
    saveJsonState('temple_past_records', nextPastRecords);

    // 4. 会計出納データの完全削除
    const deletedTx = transactions.filter((t) => (t.templeId || 'temple-main') === deletedTempleId || (t.householdId && deletedHhIdSet.has(t.householdId)));
    const nextTransactions = transactions.filter((t) => {
      if ((t.templeId || 'temple-main') === deletedTempleId) return false;
      if (t.householdId && deletedHhIdSet.has(t.householdId)) return false;
      return true;
    });
    setTransactions(nextTransactions);
    saveJsonState('temple_transactions', nextTransactions);

    // 5. 法要予約データの完全削除
    const deletedMem = memorialServices.filter((s) => s.templeId === deletedTempleId || (s.householdId && deletedHhIdSet.has(s.householdId)));
    const nextMemorialServices = memorialServices.filter((s) => {
      if (s.templeId === deletedTempleId) return false;
      if (s.householdId && deletedHhIdSet.has(s.householdId)) return false;
      return true;
    });
    setMemorialServices(nextMemorialServices);
    saveJsonState('temple_memorial_services', nextMemorialServices);

    // 6. 寺院ToDoデータの完全削除
    const deletedTodos = templeTodos.filter((td) => td.templeId === deletedTempleId || (td.householdId && deletedHhIdSet.has(td.householdId)));
    const nextTodos = templeTodos.filter((td) => {
      if (td.templeId === deletedTempleId) return false;
      if (td.householdId && deletedHhIdSet.has(td.householdId)) return false;
      return true;
    });
    setTempleTodos(nextTodos);
    saveJsonState('temple_todos', nextTodos);

    // 7. 家族構成員データの完全削除
    const deletedFam = familyMembers.filter((m) => deletedHhIdSet.has(m.householdId));
    const nextFamilyMembers = familyMembers.filter((m) => !deletedHhIdSet.has(m.householdId));
    setFamilyMembers(nextFamilyMembers);
    saveJsonState('temple_family_members', nextFamilyMembers);

    // 削除履歴にバッチ記録（Googleシート同期時の復活防止）
    const batchItems = [
      ...deletedHouseholds.map((h) => ({ id: h.id, entityType: 'household' as const, label: `世帯「${h.familyHead}」`, templeId: deletedTempleId })),
      ...deletedPast.map((p) => ({ id: p.id, entityType: 'pastRecord' as const, label: `過去帳「${p.dharmaName || p.secularName}」`, templeId: deletedTempleId })),
      ...deletedTx.map((t) => ({ id: t.id, entityType: 'transaction' as const, label: `出納「${t.notes || t.category}」`, templeId: deletedTempleId })),
      ...deletedMem.map((m) => ({ id: m.id, entityType: 'memorialService' as const, label: `法要「${m.notes || m.deceasedName}」`, templeId: deletedTempleId })),
      ...deletedTodos.map((td) => ({ id: td.id, entityType: 'templeTodo' as const, label: `ToDo「${td.title}」`, templeId: deletedTempleId })),
      ...deletedFam.map((f) => ({ id: f.id, entityType: 'familyMember' as const, label: `家族「${f.name}」`, templeId: deletedTempleId })),
    ];
    if (batchItems.length > 0) {
      recordDeletedRecordsBatch(batchItems);
    }

    // 8. 兼務寺院固有マスタマップの削除
    let nextMap: Record<string, MasterOptions> = {};
    setTempleMasterOptionsMap((prev) => {
      nextMap = { ...prev };
      delete nextMap[deletedTempleId];
      saveJsonState('temple_master_options_map', nextMap);
      return nextMap;
    });

    // 9. 印刷・除外世帯選択のクリーンアップ
    setSelectedIdsForPrint((prev) => prev.filter((id) => !deletedHhIdSet.has(id)));
    setExcludedHouseholdIds((prev) => prev.filter((id) => !deletedHhIdSet.has(id)));

    // 10. 寺院リストから削除 & アクティブ寺院を本寺にリセット
    const nextTemples = temples.filter((t) => t.id !== deletedTempleId);
    setTemples(nextTemples);
    saveJsonState('temple_profiles_list', nextTemples);

    const nextActiveId = nextTemples[0]?.id || 'temple-main';
    setActiveTempleId(nextActiveId);
    if (nextTemples[0]) {
      setTempleInfo(nextTemples[0]);
      saveJsonState('temple_info', nextTemples[0]);
    }

    syncStateRef.current = {
      ...syncStateRef.current,
      temples: nextTemples,
      templeInfo: nextTemples[0] || syncStateRef.current.templeInfo,
      households: nextHouseholds,
      pastRecords: nextPastRecords,
      transactions: nextTransactions,
      memorialServices: nextMemorialServices,
      templeTodos: nextTodos,
      templeMasterOptionsMap: nextMap,
    };

    recordHistory(`兼務寺院「${templeName}」および所属データベース（檀家${deletedHhIdSet.size}件・過去帳・会計等）を完全一括削除`);

    // Googleシート側の関連テーブルを初期化して端末側の残存レコードで置き換え
    cleanWriteSpecificTablesToGoogleSheets([
      '寺院一覧（本寺・兼務）',
      '寺院情報',
      '檀家名簿',
      '過去帳',
      '出納・会計',
      '年回法要予約',
      '寺院ToDo',
      'マスタ'
    ]);
  };

  const handleResetDatabase = async () => {
    try {
      // 1. Clear IndexedDB
      await idbClear();

      // 2. Clear localStorage
      safeStorage.clear();

      // 3. Reset states to empty/default
      const defaultTemple: TempleProfile = {
        ...EMPTY_TEMPLE_INFO,
        id: 'temple-main',
        isMain: true,
        masterOptions: EMPTY_MASTER_OPTIONS,
      };
      const defaultTemples = [defaultTemple];

      pendingCleanImportRef.current = true;

      // 即時 syncStateRef.current もクリアして古い残余データのマージを防止
      syncStateRef.current = {
        templeInfo: defaultTemple,
        temples: defaultTemples,
        households: [],
        pastRecords: [],
        memorialServices: [],
        transactions: [],
        familyMembers: [],
        masterOptions: EMPTY_MASTER_OPTIONS,
        noticeTemplates: { higan: '', niibon: '' },
        templeTodos: [],
        templeMasterOptionsMap: { 'temple-main': EMPTY_MASTER_OPTIONS },
        priests: [],
        batchAccountingData: null,
      };

      setTemples(defaultTemples);
      setTempleInfo(defaultTemple);
      setActiveTempleId('temple-main');

      setHouseholds([]);
      setPastRecords([]);
      setTransactions([]);
      setMemorialServices([]);
      setTempleTodos([]);
      setFamilyMembers([]);

      setMasterOptions(EMPTY_MASTER_OPTIONS);
      setTempleMasterOptionsMap({ 'temple-main': EMPTY_MASTER_OPTIONS });
      setExcludedHouseholdIds([]);
      setSelectedIdsForPrint([]);
      setEditingHousehold(null);
      setPriests([]);

      // 4. Save clean initial state to persistence
      saveJsonState('temple_info', defaultTemple);
      saveJsonState('temple_profiles_list', defaultTemples);
      saveJsonState('temple_households', []);
      saveJsonState('temple_past_records', []);
      saveJsonState('temple_transactions', []);
      saveJsonState('temple_memorial_services', []);
      saveJsonState('temple_todos', []);
      saveJsonState('temple_family_members', []);
      saveJsonState('temple_master_options', EMPTY_MASTER_OPTIONS);
      saveJsonState('temple_master_options_map', { 'temple-main': EMPTY_MASTER_OPTIONS });
      saveJsonState('temple_excluded_households', []);
      saveJsonState('temple_selected_print_ids', []);
      saveJsonState('temple_priests', []);
      await idbRemove('temple_safety_snapshot');
      await idbRemove('temple_backup_before_sync');
      safeStorage.removeItem('temple_safety_snapshot');
      safeStorage.removeItem('temple_backup_before_sync');

      recordHistory('データベース完全初期化（全データ消去・マスタ完全クリア）');
      setIsTempleModalOpen(false);
    } catch (err) {
      console.error('Failed to reset database:', err);
      alert('データベース初期化中にエラーが発生しました。');
    }
  };

  const handleSelectTemple = (templeId: string) => {
    setActiveTempleId(templeId);
    safeStorage.setItem('active_temple_id', templeId);
    // 寺院切り替えはUI上の表示フィルタ切替のみ。
    // データ連携（Google同期等）やデータベース更新（setTempleInfo）は一切実行しない。
  };

  const handleTabChange = (newTab: string) => {
    setActiveTab(newTab);
    // 合算表示は「過去帳」「法事予約カレンダー」のみ許可。檀家名簿・会計管理・印刷では合算不可のため本寺に切り替える
    const isAllowedMerged = 
      newTab === 'kakocho' || 
      newTab === 'daily_memorial' || 
      newTab === 'reservations' || 
      newTab === 'memorial';

    if (!isAllowedMerged && activeTempleId === 'ALL') {
      const defaultTempleId = temples[0]?.id || 'temple-main';
      setActiveTempleId(defaultTempleId);
      safeStorage.setItem('active_temple_id', defaultTempleId);
    }
  };

  const handleSaveMasterOptions = (
    options: MasterOptions,
    targetTempleId?: string,
    allMap?: Record<string, MasterOptions>
  ) => {
    recordHistory('マスタ設定（区分・勘定科目）を変更');

    if (allMap && Object.keys(allMap).length > 0) {
      setTempleMasterOptionsMap(allMap);
      saveJsonState('temple_master_options_map', allMap);
      syncStateRef.current.templeMasterOptionsMap = allMap;
      const currentActive = targetTempleId || activeTempleId;
      const targetOpt = allMap[currentActive] || allMap['temple-main'] || allMap[temples[0]?.id || 'temple-main'] || options;
      setMasterOptions(targetOpt);
      saveJsonState('temple_master_options', targetOpt);
      syncStateRef.current.masterOptions = targetOpt;
    } else if (targetTempleId) {
      setTempleMasterOptionsMap((prev) => {
        const next = { ...prev, [targetTempleId]: options };
        saveJsonState('temple_master_options_map', next);
        syncStateRef.current.templeMasterOptionsMap = next;
        return next;
      });
      if (targetTempleId === activeTempleId || targetTempleId === 'temple-main' || targetTempleId === temples[0]?.id) {
        setMasterOptions(options);
        saveJsonState('temple_master_options', options);
        syncStateRef.current.masterOptions = options;
      }
    } else {
      setMasterOptions(options);
      saveJsonState('temple_master_options', options);
      syncStateRef.current.masterOptions = options;
    }

    // Googleシートのマスタテーブルを初期化して端末側のレコードで置き換え
    cleanWriteSpecificTablesToGoogleSheets(['マスタ']);
  };

  const handleSaveNoticeTemplates = (t?: NoticeTemplateItem[] | { higan: string; niibon: string }) => {
    recordHistory('案内文テンプレートを変更');
    if (Array.isArray(t)) {
      saveNoticeTemplates(t);
      const updated = getSavedNoticeTemplates();
      setNoticeTemplates(updated);
      syncStateRef.current.noticeTemplates = updated;
    } else if (t) {
      setNoticeTemplates(t);
      saveNoticeTemplates(t);
      syncStateRef.current.noticeTemplates = t;
    } else {
      const updated = getSavedNoticeTemplates();
      setNoticeTemplates(updated);
      syncStateRef.current.noticeTemplates = updated;
    }
    // Googleシートの案内文テンプレートテーブルを初期化して端末側のテンプレートで置き換え
    cleanWriteSpecificTablesToGoogleSheets(['案内文テンプレート']);
  };

  if (viewMode === 'mobile') {
    return (
      <>
        {/* Startup Launcher Modal (Available on mobile launch / manual trigger) */}
        <StartupLauncher
          isOpen={isStartupLauncherOpen}
          onStartWithEmpty={handleStartWithEmpty}
          onStartWithTutorial={handleStartWithTutorial}
          onStartWithFile={handleStartWithFile}
          onStartWithGoogleSheets={handleStartWithGoogleSheets}
          onCancelLoading={() => setIsStartupLoading(false)}
          isLoading={isStartupLoading}
          loadingMessage={startupLoadingMsg}
        />

        <MobileApp
          templeInfo={activeTempleInfo}
          temples={temples}
          activeTempleId={activeTempleId}
          onSelectTemple={handleSelectTemple}
          households={activeHouseholds}
          allHouseholds={households}
          pastRecords={activePastRecords}
          allPastRecords={pastRecords}
          memorialServices={activeMemorialServices}
          allMemorialServices={memorialServices}
          templeTodos={activeTempleTodos}
          masterOptions={activeMasterOptions}
          onSaveHousehold={handleSaveHousehold}
          onDeleteHousehold={handleDeleteHousehold}
          onSavePastRecord={(record) => {
            const exists = pastRecords.some((p) => p.id === record.id);
            if (exists) {
              handleUpdatePastRecord(record);
            } else {
              handleAddPastRecord(record);
            }
          }}
          onDeletePastRecord={handleDeletePastRecord}
          onBatchAddPastRecords={handleBatchAddPastRecords}
          onSaveService={(service) => {
            const exists = memorialServices.some((s) => s.id === service.id);
            if (exists) {
              handleUpdateService(service);
            } else {
              handleAddService(service);
            }
          }}
          onDeleteService={handleDeleteService}
          onSaveTodo={(todo) => {
            const exists = templeTodos.some((t) => t.id === todo.id);
            if (exists) {
              handleUpdateTodo(todo);
            } else {
              handleAddTodo(todo);
            }
          }}
          onDeleteTodo={handleDeleteTodo}
          onSwitchToDesktop={() => handleSetViewMode('desktop')}
          onOpenGoogleSheetsModal={() => setIsGoogleSheetsModalOpen(true)}
          onAddTransaction={handleAddTransaction}
          syncStatus={syncStatus}
          lastSyncTime={lastSyncTime}
          onTriggerManualSync={handleManualSync}
        />

        {/* Google Sheets Sync Modal available in mobile mode */}
        <GoogleSheetsModal
          isOpen={isGoogleSheetsModalOpen}
          onClose={() => setIsGoogleSheetsModalOpen(false)}
          syncStatus={syncStatus}
          lastSyncTime={lastSyncTime}
          syncErrorMessage={syncErrorMessage}
          onTriggerManualSync={handleManualSync}
          onPullFromSheets={handlePullFromSheets}
          onSyncWithGoogleDrive={syncWithGoogleDrive}
          onCleanWriteToSheets={cleanWriteToGoogleSheets}
          onExportExcel={handleExportExcel}
          onImportExcel={handleImportExcel}
          onOpenImportModal={() => handleOpenImportModal('household')}
          onRestoreBackup={handleRestoreFromBackup}
          temples={temples}
          activeTempleId={activeTempleId}
        />

        {/* Google Sheets Undo Interrupt Modal */}
        <GoogleSheetsUndoInterruptModal
          isOpen={isGoogleSheetsUndoInterruptOpen}
          onClose={() => setIsGoogleSheetsUndoInterruptOpen(false)}
          onConfirm={handleConfirmUndoInterrupt}
          actionType={undoInterruptAction}
        />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-[#F9F7F2] text-[#2D2D2D] font-serif flex flex-col selection:bg-[#D4AF37] selection:text-[#1A1A1A]">
      {/* Startup Launcher Modal (Available on desktop launch / manual trigger) */}
      <StartupLauncher
        isOpen={isStartupLauncherOpen}
        onStartWithEmpty={handleStartWithEmpty}
        onStartWithTutorial={handleStartWithTutorial}
        onStartWithFile={handleStartWithFile}
        onStartWithGoogleSheets={handleStartWithGoogleSheets}
        onCancelLoading={() => setIsStartupLoading(false)}
        isLoading={isStartupLoading}
        loadingMessage={startupLoadingMsg}
      />

      {/* Header */}
      <Header
        activeTab={activeTab}
        setActiveTab={handleTabChange}
        templeInfo={activeTempleInfo}
        temples={temples}
        activeTempleId={activeTempleId}
        onSelectTemple={handleSelectTemple}
        onOpenTempleModal={() => handleOpenTempleModal('basic')}
        onOpenMasterModal={() => handleOpenTempleModal('master')}
        onOpenAddHouseholdModal={() => {
          setEditingHousehold(null);
          setIsHouseholdModalOpen(true);
        }}
        onOpenGoogleSheetsModal={() => setIsGoogleSheetsModalOpen(true)}
        onOpenImportModal={handleOpenImportModal}
        syncStatus={syncStatus}
        lastSyncTime={lastSyncTime}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={handleRequestUndo}
        onRedo={handleRequestRedo}
        undoDescription={undoDescription}
        redoDescription={redoDescription}
        onSwitchToMobile={() => handleSetViewMode('mobile')}
      />

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 sm:py-4 flex-1 w-full">
        {activeTab === 'households' && (
          <HouseholdList
            households={activeHouseholds}
            pastRecords={activePastRecords}
            transactions={activeTransactions}
            masterOptions={activeMasterOptions}
            templeName={activeTempleInfo.name}
            templeInfo={activeTempleInfo}
            temples={temples}
            activeTempleId={activeTempleId}
            priests={priests}
            onAddTransaction={handleAddTransaction}
            onUpdateTransaction={handleUpdateTransaction}
            onDeleteTransaction={handleDeleteTransaction}
            onOpenAddModal={() => {
              setEditingHousehold(null);
              setIsHouseholdModalOpen(true);
            }}
            onEditHousehold={handleSaveHousehold}
            onBatchUpdateHouseholds={handleBatchUpdateHouseholds}
            onDeleteHousehold={handleDeleteHousehold}
            onAddPastRecord={handleAddPastRecord}
            onBatchAddPastRecords={handleBatchAddPastRecords}
            onUpdatePastRecord={handleUpdatePastRecord}
            onDeletePastRecord={handleDeletePastRecord}
            onCreateMemorialService={handleCreateMemorialFromPastRecord}
            memorialServices={activeMemorialServices}
            familyMembers={activeFamilyMembers}
            onAddService={handleAddService}
            onAddTodo={handleAddTodo}
            selectedIdsForPrint={selectedIdsForPrint}
            setSelectedIdsForPrint={setSelectedIdsForPrint}
            onNavigateToPrint={() => setActiveTab('print')}
            onOpenImportModal={() => handleOpenImportModal('household')}
            externalSortKey={householdSortKey as any}
            externalSortOrder={householdSortOrder}
            onSortChange={handleSortChange}
            externalExcludedIds={excludedHouseholdIds}
            onToggleExcludeHousehold={handleToggleExcludeHousehold}
            onRecordHistory={recordHistory}
          />
        )}

        {activeTab === 'kakocho' && (
          <KakochoList
            key={kakochoNavKey}
            pastRecords={activePastRecords}
            allPastRecords={pastRecords}
            households={activeHouseholds}
            allHouseholds={households}
            templeInfo={activeTempleInfo}
            temples={temples}
            activeTempleId={activeTempleId}
            memorialServices={activeMemorialServices}
            initialTab={kakochoInitialTab}
            initialMilestoneSubMode={kakochoMilestoneSubMode}
            targetScrollDate={kakochoTargetDate}
            onAddPastRecord={handleAddPastRecord}
            onUpdatePastRecord={handleUpdatePastRecord}
            onDeletePastRecord={handleDeletePastRecord}
            onCreateMemorialService={handleCreateMemorialFromPastRecord}
            onAddService={handleAddService}
            onAddTodo={handleAddTodo}
            onSaveNoticeTemplates={handleSaveNoticeTemplates}
            onOpenImportModal={(target) => handleOpenImportModal(target || 'past_record')}
            setSelectedIdsForPrint={setSelectedIdsForPrint}
            onUpdateMilestoneTargets={handleUpdateMilestoneTargets}
            onNavigateToPrint={(selectedIds) => {
              if (selectedIds && selectedIds.length > 0) {
                setSelectedIdsForPrint(selectedIds);
              }
              setActiveTab('print');
            }}
          />
        )}

        {(activeTab === 'reservations' || activeTab === 'memorial') && (
          <ReservationCalendarManager
            memorialServices={memorialServices}
            households={households}
            pastRecords={pastRecords}
            templeInfo={activeTempleInfo}
            temples={temples}
            activeTempleId="ALL"
            transactions={transactions}
            templeTodos={templeTodos}
            priests={priests}
            masterOptions={activeMasterOptions}
            targetDate={calendarTargetDate}
            onAddService={handleAddService}
            onUpdateService={handleUpdateService}
            onDeleteService={handleDeleteService}
            onAddTransaction={handleAddTransaction}
            onDeleteTransaction={handleDeleteTransaction}
            onAddTodo={handleAddTodo}
            onUpdateTodo={handleUpdateTodo}
            onDeleteTodo={handleDeleteTodo}
            onUpdateHousehold={handleSaveHousehold}
            onBatchUpdateHouseholds={handleBatchUpdateHouseholds}
            onNavigateToYearlyMilestones={handleNavigateToYearlyMilestones}
            onNavigateToPrintWithNotice={(householdId, noticeText) => {
              setSelectedIdsForPrint([householdId]);
              setCustomPrintMessage(noticeText);
              setActiveTab('print');
            }}
          />
        )}

        {activeTab === 'print' && (
          <PrintEngine
            households={sortedHouseholdsForPrint.length > 0 ? sortedHouseholdsForPrint : activeHouseholds}
            templeInfo={activeTempleInfo}
            temples={temples}
            activeTempleId={activeTempleId}
            initialSelectedHouseholdIds={selectedIdsForPrint}
            initialCustomMessage={customPrintMessage}
            onSaveNoticeTemplates={handleSaveNoticeTemplates}
            milestoneTargetsMap={milestoneTargetsMap}
            milestonePeriodLabel={milestonePeriodLabel}
          />
        )}

        {activeTab === 'accounting' && (
          <AccountingManager
            transactions={activeTransactions}
            households={accountingHouseholds}
            templeInfo={accountingTempleInfo}
            masterOptions={accountingMasterOptions}
            batchAccountingData={batchAccountingData}
            onSaveBatchAccountingData={handleSaveBatchAccountingData}
            onAddTransaction={handleAddTransaction}
            onAddBatchTransactions={handleAddBatchTransactions}
            onUpdateTransaction={handleUpdateTransaction}
            onDeleteTransaction={handleDeleteTransaction}
            onOpenImportModal={(target) => handleOpenImportModal(target || 'accounting')}
            onSyncTransactions={setTransactions}
          />
        )}

        {activeTab === 'daily_memorial' && (
          <KakochoList
            pastRecords={activePastRecords}
            allPastRecords={pastRecords}
            households={activeHouseholds}
            allHouseholds={households}
            templeInfo={activeTempleInfo}
            temples={temples}
            activeTempleId={activeTempleId}
            onAddPastRecord={handleAddPastRecord}
            onUpdatePastRecord={handleUpdatePastRecord}
            onDeletePastRecord={handleDeletePastRecord}
            onCreateMemorialService={handleCreateMemorialFromPastRecord}
            onSaveNoticeTemplates={handleSaveNoticeTemplates}
            onOpenImportModal={(target) => handleOpenImportModal(target || 'past_record')}
            initialTab="daily"
          />
        )}
      </main>

      {/* Footer */}
      <footer className="no-print h-10 bg-[#EBE7DF] border-t border-[#D1CEC7] px-6 sm:px-8 flex items-center justify-between text-[10px] uppercase tracking-widest font-sans font-bold text-[#777777] mt-auto">
        <div>TLS 1.3 暗号化連動中</div>
        <div>{activeTempleInfo.mountainName} {activeTempleInfo.name} 檀家管理システム Renge v4.0.2</div>
        <div>システム状態: 正常稼働</div>
      </footer>

      {/* Household Modal */}
      <HouseholdModal
        isOpen={isHouseholdModalOpen}
        onClose={() => setIsHouseholdModalOpen(false)}
        onSave={handleSaveHousehold}
        onDeleteHousehold={handleDeleteHousehold}
        editingHousehold={editingHousehold}
        masterOptions={activeMasterOptions}
        templeMasterOptionsMap={templeMasterOptionsMap}
        temples={temples}
        activeTempleId={activeTempleId}
        existingHouseholds={households}
        priests={priests}
      />

      {/* Temple Info & Multi-Temple Master Options Modal */}
      <TempleInfoModal
        isOpen={isTempleModalOpen}
        onClose={() => setIsTempleModalOpen(false)}
        templeInfo={templeInfo}
        temples={temples}
        activeTempleId={activeTempleId}
        masterOptions={activeMasterOptions}
        templeMasterOptionsMap={templeMasterOptionsMap}
        onSaveMasterOptions={handleSaveMasterOptions}
        initialTab={templeModalInitialTab}
        onSaveTemples={handleSaveTemples}
        onDeleteTemple={handleDeleteSubTemple}
        onResetDatabase={handleResetDatabase}
        households={households}
        pastRecords={pastRecords}
        transactions={transactions}
        memorialServices={memorialServices}
        templeTodos={templeTodos}
        priests={priests}
        onSavePriests={handleSavePriests}
        onSave={handleSaveTempleInfo}
      />

      {/* Google Sheets Sync & Excel Modal */}
      <GoogleSheetsModal
        isOpen={isGoogleSheetsModalOpen}
        onClose={() => setIsGoogleSheetsModalOpen(false)}
        syncStatus={syncStatus}
        lastSyncTime={lastSyncTime}
        syncErrorMessage={syncErrorMessage}
        onTriggerManualSync={handleManualSync}
        onPullFromSheets={handlePullFromSheets}
        onSyncWithGoogleDrive={syncWithGoogleDrive}
        onCleanWriteToSheets={cleanWriteToGoogleSheets}
        onDisconnect={handleDisconnectGoogle}
        onExportExcel={handleExportExcel}
        onImportExcel={handleImportExcel}
        onOpenImportModal={() => handleOpenImportModal('household')}
        onRestoreBackup={handleRestoreFromBackup}
        onResetDatabase={handleResetDatabase}
        temples={temples}
        activeTempleId={activeTempleId}
      />

      {/* External Database Import Wizard Modal */}
      <ExternalDataImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        initialTargetType={importModalTargetType}
        existingHouseholds={households}
        existingPastRecords={pastRecords}
        existingTransactions={transactions}
        masterOptions={activeMasterOptions}
        temples={temples}
        activeTempleId={activeTempleId}
        onImportSuccess={handleImportExternalSuccess}
      />

      {/* Google Sheets Undo Interrupt Modal */}
      <GoogleSheetsUndoInterruptModal
        isOpen={isGoogleSheetsUndoInterruptOpen}
        onClose={() => setIsGoogleSheetsUndoInterruptOpen(false)}
        onConfirm={handleConfirmUndoInterrupt}
        actionType={undoInterruptAction}
      />
    </div>
  );
}

