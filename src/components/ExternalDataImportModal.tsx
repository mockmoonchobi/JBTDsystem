import React, { useState, useRef, useMemo, useEffect } from 'react';
import { 
  Upload, 
  FileSpreadsheet, 
  Database, 
  CheckCircle2, 
  AlertTriangle, 
  ArrowRight, 
  ArrowLeft, 
  Download, 
  RefreshCw, 
  X, 
  Layers, 
  Sliders, 
  FileText, 
  HelpCircle,
  Users,
  BookOpen,
  CreditCard,
  Building2,
  FolderOpen,
  Trash2,
  Settings,
  Search,
  Sparkles,
  GitBranch
} from 'lucide-react';
import { Household, PastRecord, Transaction, MasterOptions, MemorialService, TempleProfile } from '../types';
import { 
  ImportTargetType, 
  ParsedRawTable, 
  parseFileToTable, 
  autoMapColumns, 
  convertTableToData, 
  downloadSampleTemplate,
  extractKakochoItems,
  HOUSEHOLD_MAPPING_FIELDS,
  PAST_RECORD_MAPPING_FIELDS,
  COMBINED_MAPPING_FIELDS,
  ACCOUNTING_MAPPING_FIELDS,
  ColumnMappingField
} from '../utils/externalImportUtils';
import { normalizeDateInput, normalizeFurigana } from '../utils/memorialCalculator';
import { mergeMasterOptionsWithData, detectNewMasterOptions, mergeSelectedMasterOptions } from '../utils/masterOptionsUtils';
import { LinkingDecision, KakochoItemInput } from '../utils/kakochoLineageMatching';
import { KakochoLineageConfirmModal } from './KakochoLineageConfirmModal';

interface ExternalDataImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingHouseholds: Household[];
  existingPastRecords: PastRecord[];
  existingTransactions?: Transaction[];
  masterOptions?: MasterOptions;
  temples?: TempleProfile[];
  activeTempleId?: string;
  onImportSuccess: (data: {
    households?: Household[];
    pastRecords?: PastRecord[];
    transactions?: Transaction[];
    memorialServices?: MemorialService[];
    mode: 'append' | 'merge' | 'replace';
    clearAll?: boolean;
    masterOptions?: MasterOptions;
    targetTempleId?: string;
  }) => void;
  initialTargetType?: ImportTargetType;
}

export const ExternalDataImportModal: React.FC<ExternalDataImportModalProps> = ({
  isOpen,
  onClose,
  existingHouseholds,
  existingPastRecords,
  existingTransactions = [],
  masterOptions,
  temples = [],
  activeTempleId = 'temple-main',
  onImportSuccess,
  initialTargetType = 'household',
}) => {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [targetType, setTargetType] = useState<ImportTargetType>(initialTargetType);
  const [targetTempleId, setTargetTempleId] = useState<string>(activeTempleId || 'temple-main');
  const [file, setFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Active selected temple profile
  const selectedTemple = useMemo(() => {
    return temples.find((t) => t.id === targetTempleId) || temples[0] || {
      id: 'temple-main',
      name: '本寺',
      isMain: true,
      color: '#D4AF37',
    };
  }, [temples, targetTempleId]);

  // Parsed Table Info
  const [rawTable, setRawTable] = useState<ParsedRawTable | null>(null);
  const [selectedSheetIndex, setSelectedSheetIndex] = useState(0);
  const [sampleRowIndex, setSampleRowIndex] = useState(0); // Navigation index for source file rows in Step 2

  // Column Mapping: fieldKey -> sourceColumnName
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [activePreset, setActivePreset] = useState<string>('auto');

  // Preview Search & Filter State
  const [previewSearch, setPreviewSearch] = useState('');
  const [previewDisplayLimit, setPreviewDisplayLimit] = useState<'all' | 50 | 100 | 500 | 1000>(50);

  // Import Execution Options (自動統合を廃止し、追加と全置換のみに)
  const [conflictMode, setConflictMode] = useState<'append' | 'replace'>('append');
  const [clearAllRelatedData, setClearAllRelatedData] = useState(false);
  const [showReplaceConfirmModal, setShowReplaceConfirmModal] = useState(false);
  const [autoCreateHouseholdForKakocho, setAutoCreateHouseholdForKakocho] = useState(true);
  const [defaultHouseholdType, setDefaultHouseholdType] = useState('');
  const [autoSyncMasterOptions, setAutoSyncMasterOptions] = useState(true); // Toggle to auto-sync master options
  const [selectedMasterItems, setSelectedMasterItems] = useState<Record<string, boolean>>({}); // Selective master items

  // Kakocho Lineage Matching Decisions and Confirmation Modal State
  const [linkingDecisions, setLinkingDecisions] = useState<Record<number, LinkingDecision>>({});
  const [showLineageModal, setShowLineageModal] = useState(false);
  const [kakochoItems, setKakochoItems] = useState<KakochoItemInput[]>([]);

  // Preview / Conversion Result
  const [conversionResult, setConversionResult] = useState<ReturnType<typeof convertTableToData> | null>(null);

  // Detect newly introduced master options from conversionResult (ONLY from newly imported data)
  const newMasterDiff = useMemo(() => {
    if (!conversionResult) return null;
    const targetHouseholds = conversionResult.importedHouseholds && conversionResult.importedHouseholds.length > 0
      ? conversionResult.importedHouseholds
      : [];
    const targetTransactions = conversionResult.importedTransactions && conversionResult.importedTransactions.length > 0
      ? conversionResult.importedTransactions
      : [];

    return detectNewMasterOptions(
      masterOptions,
      targetHouseholds,
      targetTransactions
    );
  }, [conversionResult, masterOptions]);

  // When new master diff is detected, initialize all items to selected (true)
  useEffect(() => {
    if (newMasterDiff) {
      const initial: Record<string, boolean> = {};
      newMasterDiff.newHouseholdTypes.forEach(t => { initial[`ht:${t}`] = true; });
      newMasterDiff.newStatuses.forEach(s => { initial[`st:${s}`] = true; });
      newMasterDiff.newDistricts.forEach(d => { initial[`dst:${d}`] = true; });
      newMasterDiff.newTobaTypes.forEach(tb => { initial[`tb:${tb}`] = true; });
      newMasterDiff.newIncomeCategories.forEach(inc => { initial[`inc:${inc}`] = true; });
      newMasterDiff.newExpenseCategories.forEach(exp => { initial[`exp:${exp}`] = true; });
      newMasterDiff.newPaymentMethods.forEach(pm => { initial[`pm:${pm}`] = true; });
      setSelectedMasterItems(initial);
    }
  }, [newMasterDiff]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handler to start another import consecutively without closing the wizard
  const handleStartAnotherImport = (newTargetType?: 'household' | 'past_record' | 'combined' | 'accounting') => {
    setStep(1);
    if (newTargetType) {
      setTargetType(newTargetType);
    }
    setFile(null);
    setRawTable(null);
    setSelectedSheetIndex(0);
    setSampleRowIndex(0);
    setColumnMapping({});
    setActivePreset('auto');
    setConflictMode('append');
    setClearAllRelatedData(false);
    setShowReplaceConfirmModal(false);
    setAutoSyncMasterOptions(true);
    setLinkingDecisions({});
    setShowLineageModal(false);
    setKakochoItems([]);
    setConversionResult(null);
    setErrorMessage(null);
    setPreviewSearch('');
    setPreviewDisplayLimit(50);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Auto reset state whenever the modal opens or initialTargetType changes
  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setTargetType(initialTargetType);
      setTargetTempleId(activeTempleId || 'temple-main');
      setFile(null);
      setRawTable(null);
      setSelectedSheetIndex(0);
      setSampleRowIndex(0);
      setColumnMapping({});
      setActivePreset('auto');
      setConflictMode('append');
      setClearAllRelatedData(false);
      setShowReplaceConfirmModal(false);
      setAutoSyncMasterOptions(true);
      setLinkingDecisions({});
      setShowLineageModal(false);
      setKakochoItems([]);
      setConversionResult(null);
      setErrorMessage(null);
      setPreviewSearch('');
      setPreviewDisplayLimit(50);
    }
  }, [isOpen, initialTargetType, activeTempleId]);

  // Get active fields definition based on targetType
  const activeFields: ColumnMappingField[] = useMemo(() => {
    switch (targetType) {
      case 'household': return HOUSEHOLD_MAPPING_FIELDS;
      case 'past_record': return PAST_RECORD_MAPPING_FIELDS;
      case 'combined': return COMBINED_MAPPING_FIELDS;
      case 'accounting': return ACCOUNTING_MAPPING_FIELDS;
    }
  }, [targetType]);

  if (!isOpen) return null;

  // Handle File Selection
  const handleFile = async (selectedFile: File) => {
    try {
      setIsLoading(true);
      setErrorMessage(null);
      setFile(selectedFile);

      const parsed = await parseFileToTable(selectedFile, 0);
      setRawTable(parsed);
      setSelectedSheetIndex(0);

      // Auto-detect best matching target type if possible while respecting user explicit intent
      let detectedType = targetType;
      const joinedHeaders = parsed.headers.join(' ');
      
      const hasKakochoKeywords = joinedHeaders.includes('戒名') || joinedHeaders.includes('法名') || joinedHeaders.includes('没年') || joinedHeaders.includes('命日') || joinedHeaders.includes('俗名');
      const hasAccountingKeywords = joinedHeaders.includes('科目') || joinedHeaders.includes('収支') || joinedHeaders.includes('金額') || joinedHeaders.includes('入金') || joinedHeaders.includes('出金');
      const hasAddressKeywords = joinedHeaders.includes('住所') || joinedHeaders.includes('郵便') || joinedHeaders.includes('電話') || joinedHeaders.includes('地区');

      if (hasKakochoKeywords && hasAddressKeywords) {
        detectedType = 'combined';
      } else if (hasKakochoKeywords) {
        detectedType = 'past_record';
      } else if (hasAccountingKeywords) {
        detectedType = 'accounting';
      } else if (hasAddressKeywords || joinedHeaders.includes('世帯主') || joinedHeaders.includes('檀家')) {
        detectedType = 'household';
      }
      
      // If user selected past_record or accounting in Step 1, keep their explicit selection unless obviously wrong
      if (targetType === 'past_record' && (hasKakochoKeywords || !hasAccountingKeywords)) {
        detectedType = 'past_record';
      } else if (targetType === 'accounting' && (hasAccountingKeywords || !hasKakochoKeywords)) {
        detectedType = 'accounting';
      }

      setTargetType(detectedType);

      // Choose fields and perform auto-mapping
      const fields = detectedType === 'household' ? HOUSEHOLD_MAPPING_FIELDS :
                     detectedType === 'past_record' ? PAST_RECORD_MAPPING_FIELDS :
                     detectedType === 'combined' ? COMBINED_MAPPING_FIELDS : ACCOUNTING_MAPPING_FIELDS;
      
      const autoMap = autoMapColumns(parsed.headers, fields);
      setColumnMapping(autoMap);
      setActivePreset('auto');

      setStep(2);
    } catch (err: any) {
      console.error('File parsing error:', err);
      setErrorMessage(`ファイルの解析に失敗しました: ${err.message || err}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSheetChange = async (sheetIdx: number) => {
    if (!file) return;
    try {
      setIsLoading(true);
      setSelectedSheetIndex(sheetIdx);
      const parsed = await parseFileToTable(file, sheetIdx);
      setRawTable(parsed);

      const autoMap = autoMapColumns(parsed.headers, activeFields);
      setColumnMapping(autoMap);
    } catch (err: any) {
      setErrorMessage(`シートの切り替えに失敗しました: ${err.message || err}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Change Target Type in Step 2
  const handleTargetTypeChange = (newType: ImportTargetType) => {
    setTargetType(newType);
    if (rawTable) {
      const fields = newType === 'household' ? HOUSEHOLD_MAPPING_FIELDS :
                     newType === 'past_record' ? PAST_RECORD_MAPPING_FIELDS :
                     newType === 'combined' ? COMBINED_MAPPING_FIELDS : ACCOUNTING_MAPPING_FIELDS;
      const autoMap = autoMapColumns(rawTable.headers, fields);
      setColumnMapping(autoMap);
    }
  };

  // Preset Mapping Profile selection
  const handlePresetSelect = (presetId: string) => {
    setActivePreset(presetId);
    if (!rawTable) return;

    if (presetId === 'auto' || presetId === 'standard') {
      const autoMap = autoMapColumns(rawTable.headers, activeFields);
      setColumnMapping(autoMap);
    } else if (presetId === 'sara') {
      // Sara temple software typical column mappings
      const saraMap = autoMapColumns(rawTable.headers, activeFields);
      setColumnMapping(saraMap);
    } else if (presetId === 'jimu') {
      // Jimu PRO typical mappings
      const jimuMap = autoMapColumns(rawTable.headers, activeFields);
      setColumnMapping(jimuMap);
    }
  };

  // Open Kakocho Lineage Confirmation Window
  const handleOpenLineageConfirmModal = () => {
    if (!rawTable) return;
    const items = extractKakochoItems(rawTable.headers, rawTable.rawRows, columnMapping);
    setKakochoItems(items);
    setShowLineageModal(true);
  };

  // Callback when Kakocho Lineage decisions are confirmed by the user
  const handleLineageDecisionsConfirmed = (confirmedDecisions: Record<number, LinkingDecision>) => {
    setLinkingDecisions(confirmedDecisions);
    setShowLineageModal(false);

    if (!rawTable) return;

    try {
      const res = convertTableToData(
        targetType,
        rawTable.headers,
        rawTable.rawRows,
        columnMapping,
        {
          existingHouseholds,
          conflictMode,
          autoCreateHouseholdForKakocho,
          defaultHouseholdType,
          targetTempleId,
          temples,
          linkingDecisions: confirmedDecisions,
        }
      );
      setConversionResult(res);
      setStep(3);
    } catch (err: any) {
      alert(`データ変換中にエラーが発生しました: ${err.message || err}`);
    }
  };

  // Generate Preview & Move to Step 3
  const handleProceedToPreview = () => {
    if (!rawTable) return;

    // Check required fields
    const missingRequired = activeFields.filter(f => f.required && !columnMapping[f.key]);
    if (missingRequired.length > 0) {
      const names = missingRequired.map(f => `「${f.label}」`).join(', ');
      alert(`必須項目 ${names} の取り込み元列が割り当てられていません。\n該当する列を選択してください。`);
      return;
    }

    // For past_record imports, if user has not yet reviewed decisions, open Lineage Confirmation Modal first
    if (targetType === 'past_record') {
      const items = extractKakochoItems(rawTable.headers, rawTable.rawRows, columnMapping);
      setKakochoItems(items);

      if (Object.keys(linkingDecisions).length === 0 && items.length > 0) {
        setShowLineageModal(true);
        return;
      }
    }

    try {
      const res = convertTableToData(
        targetType,
        rawTable.headers,
        rawTable.rawRows,
        columnMapping,
        {
          existingHouseholds,
          conflictMode,
          autoCreateHouseholdForKakocho,
          defaultHouseholdType,
          targetTempleId,
          temples,
          linkingDecisions,
        }
      );
      setConversionResult(res);
      setStep(3);
    } catch (err: any) {
      alert(`データ変換中にエラーが発生しました: ${err.message || err}`);
    }
  };

  // Re-calculate when conflict mode changes dynamically in Step 3
  const handleConflictModeChange = (newMode: 'append' | 'replace') => {
    setConflictMode(newMode);
    if (rawTable) {
      try {
        const res = convertTableToData(
          targetType,
          rawTable.headers,
          rawTable.rawRows,
          columnMapping,
          {
            existingHouseholds,
            conflictMode: newMode,
            autoCreateHouseholdForKakocho,
            defaultHouseholdType,
            targetTempleId,
            temples,
            linkingDecisions,
          }
        );
        setConversionResult(res);
      } catch (err) {
        console.error('Recalculation error on mode switch:', err);
      }
    }
  };

  // Trigger Import (opens confirmation if replace mode)
  const handleExecuteImport = () => {
    if (!conversionResult) return;

    if (conflictMode === 'replace') {
      setShowReplaceConfirmModal(true);
    } else {
      doCommitImport();
    }
  };

  // Execute Final Commit
  const doCommitImport = () => {
    if (!conversionResult) return;

    let outHouseholds: Household[] | undefined = undefined;
    let outPastRecords: PastRecord[] | undefined = undefined;
    let outTransactions: Transaction[] | undefined = undefined;

    if (targetType === 'household') {
      outHouseholds = conversionResult.households;
    } else if (targetType === 'past_record') {
      // If new households were auto-created during kakocho import, update households too
      if (autoCreateHouseholdForKakocho && conversionResult.stats.householdsCreated > 0) {
        outHouseholds = conversionResult.households;
      }
      outPastRecords = conflictMode === 'replace' 
        ? [...existingPastRecords.filter(r => (r.templeId || 'temple-main') !== targetTempleId), ...conversionResult.pastRecords]
        : [...existingPastRecords, ...conversionResult.pastRecords];
    } else if (targetType === 'combined') {
      outHouseholds = conversionResult.households;
      outPastRecords = conflictMode === 'replace'
        ? [...existingPastRecords.filter(r => (r.templeId || 'temple-main') !== targetTempleId), ...conversionResult.pastRecords]
        : [...existingPastRecords, ...conversionResult.pastRecords];
    } else if (targetType === 'accounting') {
      outTransactions = conflictMode === 'replace'
        ? [...existingTransactions.filter(t => (t.templeId || 'temple-main') !== targetTempleId), ...conversionResult.transactions]
        : [...existingTransactions, ...conversionResult.transactions];
    }

    const updatedMaster = autoSyncMasterOptions && newMasterDiff
      ? mergeSelectedMasterOptions(
          masterOptions,
          newMasterDiff,
          selectedMasterItems
        )
      : (autoSyncMasterOptions
          ? mergeMasterOptionsWithData(
              masterOptions,
              conversionResult.importedHouseholds && conversionResult.importedHouseholds.length > 0 ? conversionResult.importedHouseholds : (outHouseholds || []),
              conversionResult.importedTransactions && conversionResult.importedTransactions.length > 0 ? conversionResult.importedTransactions : (outTransactions || [])
            )
          : masterOptions);

    onImportSuccess({
      households: outHouseholds,
      pastRecords: outPastRecords,
      transactions: outTransactions,
      mode: conflictMode,
      clearAll: conflictMode === 'replace' && clearAllRelatedData,
      masterOptions: updatedMaster,
      targetTempleId,
    });

    setShowReplaceConfirmModal(false);
    setStep(4);
  };

  const handleReset = () => {
    setStep(1);
    setFile(null);
    setRawTable(null);
    setConversionResult(null);
    setErrorMessage(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-3 sm:p-6 overflow-y-auto no-print">
      <div className="bg-[#FAF9F5] border border-[#D4AF37] shadow-2xl w-full max-w-5xl my-auto rounded-none flex flex-col max-h-[92vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="bg-[#1A1A1A] border-b border-[#D4AF37] px-6 py-4 flex items-center justify-between text-[#F9F7F2]">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-[#D4AF37] text-[#1A1A1A] flex items-center justify-center font-bold font-serif shadow">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold font-serif tracking-wider text-[#F9F7F2] flex items-center gap-2">
                他データベース・CSV/Excel 取り込みウィザード
              </h2>
              <p className="text-xs text-[#D4AF37]/80 font-sans">
                沙羅・寺務PRO・Access・FileMaker・独自Excel/CSVからのデータ移行と自動統合
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[#999999] hover:text-[#FFFFFF] p-1 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Step Indicator Bar */}
        <div className="bg-[#F0EEE9] border-b border-[#D1CEC7] px-6 py-2.5 flex items-center justify-between text-xs font-sans">
          <div className="flex items-center space-x-2 sm:space-x-4">
            <div className={`flex items-center space-x-1.5 font-bold ${step === 1 ? 'text-[#1A1A1A]' : step > 1 ? 'text-emerald-700' : 'text-[#888888]'}`}>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${step === 1 ? 'bg-[#1A1A1A] text-white' : step > 1 ? 'bg-emerald-600 text-white' : 'bg-[#CCCCCC] text-[#555]'}`}>
                {step > 1 ? '✓' : '1'}
              </span>
              <span>ファイル選択</span>
            </div>

            <span className="text-[#BBBBBB]">›</span>

            <div className={`flex items-center space-x-1.5 font-bold ${step === 2 ? 'text-[#1A1A1A]' : step > 2 ? 'text-emerald-700' : 'text-[#888888]'}`}>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${step === 2 ? 'bg-[#1A1A1A] text-white' : step > 2 ? 'bg-emerald-600 text-white' : 'bg-[#CCCCCC] text-[#555]'}`}>
                {step > 2 ? '✓' : '2'}
              </span>
              <span>項目マッピング</span>
            </div>

            <span className="text-[#BBBBBB]">›</span>

            <div className={`flex items-center space-x-1.5 font-bold ${step === 3 ? 'text-[#1A1A1A]' : step > 3 ? 'text-emerald-700' : 'text-[#888888]'}`}>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${step === 3 ? 'bg-[#1A1A1A] text-white' : step > 3 ? 'bg-emerald-600 text-white' : 'bg-[#CCCCCC] text-[#555]'}`}>
                {step > 3 ? '✓' : '3'}
              </span>
              <span>プレビュー & 設定</span>
            </div>

            <span className="text-[#BBBBBB]">›</span>

            <div className={`flex items-center space-x-1.5 font-bold ${step === 4 ? 'text-emerald-700' : 'text-[#888888]'}`}>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${step === 4 ? 'bg-emerald-600 text-white' : 'bg-[#CCCCCC] text-[#555]'}`}>
                4
              </span>
              <span>完了</span>
            </div>
          </div>

          <div className="hidden md:flex items-center space-x-3 text-[#666666]">
            <span>対応: .xlsx / .xls / .csv (Shift-JIS/UTF-8自動判別)</span>
          </div>
        </div>

        {/* Modal Body Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">

          {/* ================= STEP 1: File Upload & Target Selection ================= */}
          {step === 1 && (
            <div className="space-y-6">
              {/* Target Temple Selector (本寺 / 兼務寺院) */}
              <div className="bg-white border border-[#D4AF37]/60 p-4 shadow-xs space-y-2.5 font-sans">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-[#1A1A1A] flex items-center gap-1.5">
                    <Building2 className="w-4 h-4 text-[#D4AF37]" />
                    <span>取り込み先寺院の指定（本寺・兼務寺院）:</span>
                  </label>
                  <span className="text-[11px] text-[#666666]">
                    ※選択した寺院の檀家名簿・過去帳・会計として登録されます
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                  {temples.map((t) => {
                    const isSelected = targetTempleId === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setTargetTempleId(t.id || 'temple-main')}
                        className={`p-3 border text-left flex items-center justify-between transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-[#FAF8F5] border-[#1A1A1A] ring-2 ring-[#D4AF37] shadow-xs'
                            : 'bg-white border-[#E0DCD3] hover:border-[#999999]'
                        }`}
                      >
                        <div className="flex items-center space-x-2.5">
                          <span
                            className="w-3.5 h-3.5 rounded-full shrink-0 border border-black/10"
                            style={{ backgroundColor: t.color || '#D4AF37' }}
                          />
                          <div>
                            <div className="font-bold text-xs text-[#1A1A1A]">
                              {t.name}
                            </div>
                            <div className="text-[10px] text-[#777777] flex items-center gap-1">
                              <span>{t.isMain ? '【本寺】' : '【兼務寺院】'}</span>
                              {t.mountainName && <span>{t.mountainName}</span>}
                            </div>
                          </div>
                        </div>
                        {isSelected && (
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Target Type Selector */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-[#1A1A1A] font-sans">
                  ① 取り込みたいデータの種類を選択してください:
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 font-sans">
                  <button
                    type="button"
                    onClick={() => setTargetType('household')}
                    className={`p-4 border text-left flex flex-col justify-between transition-all ${
                      targetType === 'household'
                        ? 'bg-white border-[#1A1A1A] shadow-md ring-2 ring-[#D4AF37]/50'
                        : 'bg-[#F2EFE9] border-[#D1CEC7] hover:bg-white text-[#555555]'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold text-sm text-[#1A1A1A] flex items-center gap-1.5">
                        <Users className="w-4 h-4 text-[#D4AF37]" />
                        檀家名簿・世帯
                      </span>
                      {targetType === 'household' && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                    </div>
                    <p className="text-[11px] text-[#666666]">
                      世帯主名、住所、電話番号、地区、墓地番号、檀家区分などの基本台帳
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setTargetType('past_record')}
                    className={`p-4 border text-left flex flex-col justify-between transition-all ${
                      targetType === 'past_record'
                        ? 'bg-white border-[#1A1A1A] shadow-md ring-2 ring-[#D4AF37]/50'
                        : 'bg-[#F2EFE9] border-[#D1CEC7] hover:bg-white text-[#555555]'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold text-sm text-[#1A1A1A] flex items-center gap-1.5">
                        <BookOpen className="w-4 h-4 text-[#D4AF37]" />
                        過去帳・霊位
                      </span>
                      {targetType === 'past_record' && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                    </div>
                    <p className="text-[11px] text-[#666666]">
                      戒名・法名、俗名、没年月日（命日）、享年、施主名、続柄などの過去帳
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setTargetType('combined')}
                    className={`p-4 border text-left flex flex-col justify-between transition-all ${
                      targetType === 'combined'
                        ? 'bg-white border-[#1A1A1A] shadow-md ring-2 ring-[#D4AF37]/50'
                        : 'bg-[#F2EFE9] border-[#D1CEC7] hover:bg-white text-[#555555]'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold text-sm text-[#1A1A1A] flex items-center gap-1.5">
                        <Layers className="w-4 h-4 text-[#D4AF37]" />
                        檀家＋過去帳 統合
                      </span>
                      {targetType === 'combined' && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                    </div>
                    <p className="text-[11px] text-[#666666]">
                      1行に「世帯主・住所」と「戒名・命日」の両方が含まれる外部ソフト形式
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setTargetType('accounting')}
                    className={`p-4 border text-left flex flex-col justify-between transition-all ${
                      targetType === 'accounting'
                        ? 'bg-white border-[#1A1A1A] shadow-md ring-2 ring-[#D4AF37]/50'
                        : 'bg-[#F2EFE9] border-[#D1CEC7] hover:bg-white text-[#555555]'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold text-sm text-[#1A1A1A] flex items-center gap-1.5">
                        <CreditCard className="w-4 h-4 text-[#D4AF37]" />
                        出納・会計データ
                      </span>
                      {targetType === 'accounting' && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                    </div>
                    <p className="text-[11px] text-[#666666]">
                      日付、勘定科目、金額、施主名、収支区分などの出納帳データ
                    </p>
                  </button>
                </div>
              </div>

              {/* Drag & Drop File Upload Area */}
              <div className="space-y-2 font-sans">
                <label className="block text-xs font-bold text-[#1A1A1A]">
                  ② 他ソフトやExcelからエクスポートしたファイルを選択してください:
                </label>

                <div 
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                      handleFile(e.dataTransfer.files[0]);
                    }
                  }}
                  className="border-2 border-dashed border-[#D4AF37]/70 bg-white hover:bg-[#FAF7EE] p-10 text-center cursor-pointer transition-all flex flex-col items-center justify-center space-y-3 group"
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        handleFile(e.target.files[0]);
                      }
                    }}
                    accept=".xlsx, .xls, .csv, .tsv, .txt"
                    className="hidden"
                  />
                  
                  <div className="w-14 h-14 bg-[#1A1A1A] text-[#D4AF37] rounded-full flex items-center justify-center shadow-md group-hover:scale-105 transition-transform">
                    {isLoading ? (
                      <RefreshCw className="w-6 h-6 animate-spin text-[#D4AF37]" />
                    ) : (
                      <Upload className="w-6 h-6" />
                    )}
                  </div>

                  <div>
                    <p className="text-sm font-bold text-[#1A1A1A]">
                      ここをクリックしてファイルを選択、またはドラッグ＆ドロップ
                    </p>
                    <p className="text-xs text-[#666666] mt-1">
                      Excelファイル (.xlsx, .xls) または CSVファイル (.csv, .tsv, .txt)
                    </p>
                  </div>

                  <div className="inline-flex items-center space-x-2 px-3 py-1 bg-[#F5F2EB] border border-[#D1CEC7] text-[11px] text-[#444444] rounded-full mt-2">
                    <span>Windows (Shift-JIS/CP932) 及び Mac/Linux (UTF-8) 文字化け防止自動判定対応</span>
                  </div>
                </div>

                {errorMessage && (
                  <div className="p-3 bg-rose-50 border border-rose-300 text-rose-800 text-xs flex items-center space-x-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
                    <span>{errorMessage}</span>
                  </div>
                )}
              </div>

              {/* Sample Templates Download Box */}
              <div className="bg-[#F2EFE9] border border-[#D1CEC7] p-4 space-y-3 font-sans">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div>
                    <h4 className="text-xs font-bold text-[#1A1A1A] flex items-center gap-1.5">
                      <FileSpreadsheet className="w-4 h-4 text-[#D4AF37]" />
                      入力用ひな形（サンプルファイル）をダウンロード
                    </h4>
                    <p className="text-[11px] text-[#666666] mt-0.5">
                      手元の名簿を整理して取り込みたい場合は、こちらのひな形Excel・CSVに転記して取り込むと最もスムーズです。
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => downloadSampleTemplate(targetType, 'xlsx')}
                      className="px-3 py-1.5 bg-white hover:bg-[#1A1A1A] text-[#1A1A1A] hover:text-[#D4AF37] border border-[#D1CEC7] text-xs font-bold flex items-center space-x-1 transition-colors shadow-2xs"
                    >
                      <Download className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Excelひな形 (.xlsx)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => downloadSampleTemplate(targetType, 'csv')}
                      className="px-3 py-1.5 bg-white hover:bg-[#1A1A1A] text-[#1A1A1A] hover:text-[#D4AF37] border border-[#D1CEC7] text-xs font-bold flex items-center space-x-1 transition-colors shadow-2xs"
                    >
                      <Download className="w-3.5 h-3.5 text-[#555]" />
                      <span>CSVひな形 (.csv)</span>
                    </button>
                  </div>
                </div>

                <div className="p-2.5 bg-white border border-[#D4AF37]/50 rounded-xs text-[11px] text-[#444444] flex items-start gap-2">
                  <span className="px-1.5 py-0.5 bg-[#1A1A1A] text-[#D4AF37] font-bold text-[10px] rounded-xs shrink-0 mt-0.5">
                    共通ID連携
                  </span>
                  <div>
                    <strong className="text-[#1A1A1A]">檀家ID（例: H-101）による横断連携:</strong>
                    <span className="text-[#666666] ml-1">
                      檀家名簿・過去帳・出納会計で同じ「檀家ID」を指定して取り込むことで、世帯台帳・過去帳（故人）・出納明細がシステム内で自動的に紐付けられます。（※ID空欄時は自動採番または世帯主名から自動照合されます）
                    </span>
                  </div>
                </div>
              </div>

              {/* Guidance for popular software */}
              <div className="border border-[#D1CEC7] bg-white p-4 font-sans text-xs space-y-2">
                <span className="font-bold text-[#1A1A1A] flex items-center gap-1">
                  <HelpCircle className="w-3.5 h-3.5 text-[#D4AF37]" />
                  他社寺院管理ソフトからの移行ガイド:
                </span>
                <ul className="text-[11px] text-[#555555] space-y-1 list-disc list-inside">
                  <li><strong>沙羅（Sara）</strong>: 沙羅の「名簿印刷/エクスポート」「過去帳エクスポート」からCSVまたはExcelで出力したファイルをそのまま選択してください。</li>
                  <li><strong>寺務PRO / 寺院コム</strong>: 会員データ・過去帳データをExcelまたはCSV形式で保存し、本画面に読み込ませてください。</li>
                  <li><strong>Access / FileMaker / 自作DB</strong>: テーブルまたはクエリをCSVまたはExcel (.xlsx) としてエクスポートしてご指定ください。</li>
                  <li><strong>和暦の日付</strong>（例: 令和3年5月1日、H15.4.10）や西暦（2021-05-01）はシステムが自動解析して統一変換します。</li>
                </ul>
              </div>
            </div>
          )}

          {/* ================= STEP 2: Column Mapping ================= */}
          {step === 2 && rawTable && (
            <div className="space-y-5 font-sans">
              {/* File & Sheet Overview */}
              <div className="bg-white border border-[#D1CEC7] p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-[#FAF7EE] border border-[#D4AF37]/50 text-[#D4AF37]">
                    <FileSpreadsheet className="w-5 h-5 text-[#1A1A1A]" />
                  </div>
                  <div>
                    <div className="font-bold text-sm text-[#1A1A1A]">{file?.name}</div>
                    <div className="text-[11px] text-[#666666]">
                      検出行数: <strong className="text-[#1A1A1A] font-mono">{rawTable.totalRows}</strong> 行 / 列数: <strong className="text-[#1A1A1A] font-mono">{rawTable.headers.length}</strong> 列
                    </div>
                  </div>
                </div>

                {/* Sheet Selector (if multiple sheets) */}
                {rawTable.sheetNames.length > 1 && (
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-bold text-[#444]">シート選択:</span>
                    <select
                      value={selectedSheetIndex}
                      onChange={(e) => handleSheetChange(Number(e.target.value))}
                      className="px-2.5 py-1 bg-[#FAF9F5] border border-[#D1CEC7] text-xs font-bold"
                    >
                      {rawTable.sheetNames.map((sName, idx) => (
                        <option key={idx} value={idx}>{sName}</option>
                      ))}
                    </select>
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleReset}
                  className="text-xs text-[#666666] hover:text-[#1A1A1A] underline"
                >
                  別のファイルを選択
                </button>
              </div>

              {/* Data Type & Preset Profiles */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-[#F0EEE9] p-3 border border-[#D1CEC7]">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-bold text-[#1A1A1A]">取り込み種別:</span>
                    <select
                      value={targetType}
                      onChange={(e) => handleTargetTypeChange(e.target.value as ImportTargetType)}
                      className="px-3 py-1 bg-white border border-[#D1CEC7] text-xs font-bold shadow-2xs"
                    >
                      <option value="household">檀家名簿・世帯</option>
                      <option value="past_record">過去帳・霊位</option>
                      <option value="combined">檀家＋過去帳 統合データ</option>
                      <option value="accounting">出納・会計</option>
                    </select>
                  </div>

                  <div className="flex items-center space-x-1.5 px-2.5 py-1 bg-white border border-[#D1CEC7] text-xs font-bold shadow-2xs">
                    <Building2 className="w-3.5 h-3.5 text-[#D4AF37]" />
                    <span className="text-[11px] text-[#666]">取込先:</span>
                    <span
                      className="inline-block w-2 h-2 rounded-full mr-0.5"
                      style={{ backgroundColor: selectedTemple.color || '#D4AF37' }}
                    />
                    <span className="text-[#1A1A1A]">{selectedTemple.name}</span>
                    <span className="text-[10px] text-[#888]">({selectedTemple.isMain ? '本寺' : '兼務'})</span>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <Sliders className="w-3.5 h-3.5 text-[#D4AF37]" />
                  <span className="text-xs font-bold text-[#444]">列照合プリセット:</span>
                  <select
                    value={activePreset}
                    onChange={(e) => handlePresetSelect(e.target.value)}
                    className="px-3 py-1 bg-white border border-[#D1CEC7] text-xs font-bold"
                  >
                    <option value="auto">✨ 自動スマート照合（推奨）</option>
                    <option value="sara">沙羅 (Sara) 形式</option>
                    <option value="jimu">寺務PRO / 寺院コム形式</option>
                    <option value="standard">本システム標準</option>
                  </select>
                </div>
              </div>

              {/* Interactive Column Mapping Table */}
              <div className="border border-[#D1CEC7] bg-white shadow-xs overflow-hidden">
                <div className="bg-[#1A1A1A] text-[#F9F7F2] px-4 py-2.5 text-xs font-bold flex flex-wrap justify-between items-center gap-2">
                  <div className="flex items-center space-x-2">
                    <span>システムの項目 ⇄ ファイルの列の割り当て（列マッピング）</span>
                    <span className="text-[11px] text-[#D4AF37]">※ 赤色「必須」項目は必ず指定してください</span>
                  </div>

                  {/* Row Navigator for Sample Data */}
                  {rawTable.rawRows.length > 0 && (
                    <div className="flex items-center space-x-1.5 bg-[#2A2A2A] px-2.5 py-1 border border-[#555555]">
                      <span className="text-[11px] text-[#DDDDDD]">サンプル確認行:</span>
                      <button
                        type="button"
                        onClick={() => setSampleRowIndex(prev => Math.max(0, prev - 1))}
                        disabled={sampleRowIndex <= 0}
                        className="px-2 py-0.5 bg-[#444444] hover:bg-[#666666] disabled:opacity-30 text-white text-[11px] flex items-center space-x-1 transition-colors cursor-pointer rounded-xs"
                        title="前のデータ行へ"
                      >
                        <ArrowLeft className="w-3 h-3" />
                        <span>前へ</span>
                      </button>
                      <span className="font-mono text-xs text-[#D4AF37] font-bold px-1.5">
                        {sampleRowIndex + 1} / {rawTable.rawRows.length} 行目
                      </span>
                      <button
                        type="button"
                        onClick={() => setSampleRowIndex(prev => Math.min(rawTable.rawRows.length - 1, prev + 1))}
                        disabled={sampleRowIndex >= rawTable.rawRows.length - 1}
                        className="px-2 py-0.5 bg-[#444444] hover:bg-[#666666] disabled:opacity-30 text-white text-[11px] flex items-center space-x-1 transition-colors cursor-pointer rounded-xs"
                        title="次のデータ行へ"
                      >
                        <span>次へ</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>

                <div className="overflow-x-auto max-h-[380px] overflow-y-auto">
                  <table className="w-full text-left text-xs border-collapse font-sans">
                    <thead className="bg-[#FAF9F5] border-b border-[#D1CEC7] sticky top-0 z-10">
                      <tr>
                        <th className="p-3 font-bold text-[#1A1A1A] w-1/3">システム項目名</th>
                        <th className="p-3 font-bold text-[#1A1A1A] w-1/3">ファイルの取り込み元列</th>
                        <th className="p-3 font-bold text-[#1A1A1A] w-1/3">ファイル内のサンプル値</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#EAE7E0]">
                      {activeFields.map((field) => {
                        const selectedCol = columnMapping[field.key] || '';
                        const colIdx = rawTable.headers.indexOf(selectedCol);
                        const sampleRow = rawTable.rawRows[sampleRowIndex] || rawTable.rawRows[0];
                        const sampleVal = colIdx !== -1 && sampleRow ? String(sampleRow[colIdx] || '') : '';

                        const isDateField = ['deathDate', 'date', 'createdAt', 'scheduledDate'].includes(field.key);
                        const isFuriganaField = field.key === 'furigana';
                        let displayVal = sampleVal;
                        if (isDateField && sampleVal) {
                          const normalized = normalizeDateInput(sampleVal);
                          if (normalized) {
                            displayVal = normalized;
                          }
                        } else if (isFuriganaField && sampleVal) {
                          const normalized = normalizeFurigana(sampleVal);
                          if (normalized) {
                            displayVal = normalized;
                          }
                        }

                        return (
                          <tr key={field.key} className={field.required && !selectedCol ? 'bg-rose-50/70' : 'hover:bg-[#FAF7EE]'}>
                            <td className="p-3">
                              <div className="flex items-center space-x-2">
                                <span className="font-bold text-[#1A1A1A]">{field.label}</span>
                                {field.required && (
                                  <span className="px-1.5 py-0.5 bg-rose-600 text-white font-bold text-[9px] rounded-xs">
                                    必須
                                  </span>
                                )}
                              </div>
                              {field.description && (
                                <div className="text-[10px] text-[#777777] mt-0.5">{field.description}</div>
                              )}
                            </td>

                            <td className="p-3">
                              <select
                                value={selectedCol}
                                onChange={(e) => {
                                  setColumnMapping({
                                    ...columnMapping,
                                    [field.key]: e.target.value,
                                  });
                                }}
                                className={`w-full p-1.5 border text-xs font-sans ${
                                  field.required && !selectedCol
                                    ? 'border-rose-400 bg-rose-50 text-rose-900 font-bold'
                                    : selectedCol
                                    ? 'border-[#D4AF37] bg-white text-[#1A1A1A] font-bold'
                                    : 'border-[#D1CEC7] bg-[#FAF9F5] text-[#888888]'
                                }`}
                              >
                                <option value="">（取り込まない / 空欄）</option>
                                {rawTable.headers.map((colName, idx) => (
                                  <option key={idx} value={colName}>
                                    {colName || `列 ${idx + 1}`}
                                  </option>
                                ))}
                              </select>
                            </td>

                            <td className="p-3 font-mono text-[11px] text-[#444444] truncate max-w-xs">
                              {displayVal ? (
                                <span className="px-2 py-0.5 bg-[#F0EEE9] border border-[#D1CEC7] text-[#1A1A1A]">
                                  {displayVal}
                                </span>
                              ) : (
                                <span className="text-[#AAAAAA] italic">-</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {targetType === 'past_record' && (
                  <div className="p-3 bg-amber-50/70 border-t border-amber-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
                    <div className="flex items-center space-x-2 text-amber-950">
                      <Sparkles className="w-4 h-4 text-amber-700 shrink-0" />
                      <span>
                        <strong>過去帳・精霊 檀家照合システム:</strong> 没年月日の新しい精霊から順に施主名・先代精霊の俗名を照合し、対話的確認ウィンドウで高精度に紐づけます。
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={handleOpenLineageConfirmModal}
                      className="px-3.5 py-1.5 rounded bg-[#D4AF37] hover:bg-[#c49f2c] text-stone-950 font-bold text-xs shrink-0 shadow-xs flex items-center gap-1.5"
                    >
                      <GitBranch className="w-3.5 h-3.5 text-stone-900" />
                      精霊・檀家照合ウィンドウを開く
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ================= STEP 3: Preview & Import Options ================= */}
          {step === 3 && conversionResult && (
            <div className="space-y-5 font-sans">
              {/* Summary Stats Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-white border border-[#D1CEC7] p-3 text-center shadow-2xs">
                  <span className="text-[11px] text-[#666666] block">ファイル総データ件数</span>
                  <span className="text-xl font-bold font-mono text-[#1A1A1A]">{conversionResult.stats.totalParsed}</span>
                  <span className="text-[10px] text-[#888888] block">行</span>
                </div>

                {(targetType === 'household' || targetType === 'combined' || autoCreateHouseholdForKakocho) && (
                  <div className="bg-emerald-50 border border-emerald-300 p-3 text-center shadow-2xs">
                    <span className="text-[11px] text-emerald-800 font-bold block">登録/更新される檀家数</span>
                    <span className="text-xl font-bold font-mono text-emerald-900">
                      {conversionResult.stats.householdsCreated + conversionResult.stats.householdsUpdated}
                    </span>
                    <span className="text-[10px] text-emerald-700 block">
                      (新規: {conversionResult.stats.householdsCreated}件 / 更新: {conversionResult.stats.householdsUpdated}件)
                    </span>
                  </div>
                )}

                {(targetType === 'past_record' || targetType === 'combined') && (
                  <div className="bg-amber-50 border border-amber-300 p-3 text-center shadow-2xs">
                    <span className="text-[11px] text-amber-800 font-bold block">作成される過去帳・霊位数</span>
                    <span className="text-xl font-bold font-mono text-amber-900">{conversionResult.stats.pastRecordsCreated}</span>
                    <span className="text-[10px] text-amber-700 block">柱</span>
                  </div>
                )}

                {targetType === 'accounting' && (
                  <div className="bg-blue-50 border border-blue-300 p-3 text-center shadow-2xs">
                    <span className="text-[11px] text-blue-800 font-bold block">登録される出納明細数</span>
                    <span className="text-xl font-bold font-mono text-blue-900">{conversionResult.stats.transactionsCreated}</span>
                    <span className="text-[10px] text-blue-700 block">件</span>
                  </div>
                )}

                <div className="bg-white border border-[#D1CEC7] p-3 text-center shadow-2xs">
                  <span className="text-[11px] text-[#666666] block">スキップ・警告</span>
                  <span className={`text-xl font-bold font-mono ${conversionResult.stats.warnings.length > 0 ? 'text-amber-600' : 'text-emerald-700'}`}>
                    {conversionResult.stats.warnings.length}
                  </span>
                  <span className="text-[10px] text-[#888888] block">件</span>
                </div>
              </div>

              {/* Lineage Matching Status Card for Past Record Imports */}
              {targetType === 'past_record' && (
                <div className="bg-amber-50/80 border border-[#D4AF37] p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs shadow-2xs">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 rounded bg-[#D4AF37]/20 border border-[#D4AF37] flex items-center justify-center text-amber-900">
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-bold text-amber-950 flex items-center gap-2">
                        <span>過去帳・精霊 檀家照合確認ステータス</span>
                        <span className="px-2 py-0.5 rounded-full bg-amber-200/80 text-amber-900 text-[10px] font-bold">
                          {Object.keys(linkingDecisions).length > 0
                            ? `${Object.keys(linkingDecisions).length}件の照合決定を適用中`
                            : '自動照合判定中'}
                        </span>
                      </div>
                      <p className="text-[11px] text-stone-600 mt-0.5">
                        没年月日の新しい順に施主名・先代精霊の俗名を照合済みです。再確認や紐づけ先の変更を行う場合は右のボタンを押してください。
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleOpenLineageConfirmModal}
                    className="px-3.5 py-1.5 rounded bg-[#2D2A26] hover:bg-black text-[#D4AF37] font-bold text-xs flex items-center gap-1.5 shadow-sm transition-colors"
                  >
                    <GitBranch className="w-3.5 h-3.5" />
                    精霊・檀家の照合確認ウィンドウを再表示
                  </button>
                </div>
              )}

              {/* Master Options Auto-Sync Notification & Toggle in Step 3 */}
              {newMasterDiff && newMasterDiff.totalNewCount > 0 && (
                <div className={`border p-4 text-xs space-y-3 shadow-2xs transition-colors rounded-xs ${
                  autoSyncMasterOptions ? 'bg-amber-50/80 border-[#D4AF37] text-[#1A1A1A]' : 'bg-[#F5F4F0] border-[#D1CEC7] text-[#666666]'
                }`}>
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-200/80 pb-2">
                    <div className="font-bold flex items-center gap-1.5 text-amber-900">
                      <Settings className="w-4 h-4 text-[#D4AF37]" />
                      <span>区分・勘定科目マスタへの自動反映 ({newMasterDiff.totalNewCount}件の新規項目を検出)</span>
                    </div>

                    <div className="flex items-center space-x-2">
                      {autoSyncMasterOptions && (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              const allOn: Record<string, boolean> = {};
                              newMasterDiff.newHouseholdTypes.forEach(t => { allOn[`ht:${t}`] = true; });
                              newMasterDiff.newStatuses.forEach(s => { allOn[`st:${s}`] = true; });
                              newMasterDiff.newDistricts.forEach(d => { allOn[`dst:${d}`] = true; });
                              newMasterDiff.newTobaTypes.forEach(tb => { allOn[`tb:${tb}`] = true; });
                              newMasterDiff.newIncomeCategories.forEach(inc => { allOn[`inc:${inc}`] = true; });
                              newMasterDiff.newExpenseCategories.forEach(exp => { allOn[`exp:${exp}`] = true; });
                              newMasterDiff.newPaymentMethods.forEach(pm => { allOn[`pm:${pm}`] = true; });
                              setSelectedMasterItems(allOn);
                            }}
                            className="px-2 py-0.5 bg-white border border-amber-300 text-[10px] font-bold text-amber-900 rounded hover:bg-amber-100"
                          >
                            すべて選択
                          </button>
                          <button
                            type="button"
                            onClick={() => setSelectedMasterItems({})}
                            className="px-2 py-0.5 bg-white border border-stone-300 text-[10px] font-bold text-stone-600 rounded hover:bg-stone-100"
                          >
                            すべて解除
                          </button>
                        </>
                      )}

                      <label className="flex items-center space-x-2 bg-white px-2.5 py-1 border border-[#D1CEC7] cursor-pointer shadow-2xs rounded-xs">
                        <input
                          type="checkbox"
                          checked={autoSyncMasterOptions}
                          onChange={(e) => setAutoSyncMasterOptions(e.target.checked)}
                          className="w-4 h-4 text-[#1A1A1A] cursor-pointer"
                        />
                        <span className="font-bold text-xs text-[#1A1A1A]">
                          {autoSyncMasterOptions ? 'マスタに反映する（有効）' : 'マスタには取り込まない（無効）'}
                        </span>
                      </label>
                    </div>
                  </div>

                  <p className="text-[11px] leading-relaxed">
                    {autoSyncMasterOptions ? (
                      <span className="text-[#555555]">
                        ファイル内に含まれる未登録値のうち、<strong>チェックが入っている項目（クリックでON/OFF切替）</strong>のみを「区分・勘定科目マスタ」に追加します。
                      </span>
                    ) : (
                      <span className="text-stone-600 font-bold">
                        ※ マスタへの自動反映をスキップします。現在のマスタ定義がそのまま維持され、新規項目は追加されません。
                      </span>
                    )}
                  </p>

                  {autoSyncMasterOptions && (
                    <div className="space-y-2 pt-1">
                      {/* Household Types */}
                      {newMasterDiff.newHouseholdTypes.length > 0 && (
                        <div className="flex items-start gap-2">
                          <span className="text-[11px] font-bold text-stone-700 w-24 shrink-0 mt-0.5">区分１ (世帯種別):</span>
                          <div className="flex flex-wrap gap-1.5">
                            {newMasterDiff.newHouseholdTypes.map((t) => {
                              const isChecked = selectedMasterItems[`ht:${t}`] !== false;
                              return (
                                <button
                                  type="button"
                                  key={`ht-${t}`}
                                  onClick={() => setSelectedMasterItems(prev => ({ ...prev, [`ht:${t}`]: !isChecked }))}
                                  className={`px-2.5 py-0.5 border text-[11px] font-bold rounded cursor-pointer transition-colors flex items-center gap-1 ${
                                    isChecked ? 'bg-white border-[#D4AF37] text-stone-900 shadow-2xs' : 'bg-stone-100 border-stone-200 text-stone-400 line-through'
                                  }`}
                                >
                                  <input type="checkbox" checked={isChecked} readOnly className="w-3 h-3 pointer-events-none" />
                                  {t}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Statuses */}
                      {newMasterDiff.newStatuses.length > 0 && (
                        <div className="flex items-start gap-2">
                          <span className="text-[11px] font-bold text-stone-700 w-24 shrink-0 mt-0.5">区分２ (ステータス):</span>
                          <div className="flex flex-wrap gap-1.5">
                            {newMasterDiff.newStatuses.map((s) => {
                              const isChecked = selectedMasterItems[`st:${s}`] !== false;
                              return (
                                <button
                                  type="button"
                                  key={`st-${s}`}
                                  onClick={() => setSelectedMasterItems(prev => ({ ...prev, [`st:${s}`]: !isChecked }))}
                                  className={`px-2.5 py-0.5 border text-[11px] font-bold rounded cursor-pointer transition-colors flex items-center gap-1 ${
                                    isChecked ? 'bg-white border-[#D4AF37] text-stone-900 shadow-2xs' : 'bg-stone-100 border-stone-200 text-stone-400 line-through'
                                  }`}
                                >
                                  <input type="checkbox" checked={isChecked} readOnly className="w-3 h-3 pointer-events-none" />
                                  {s}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Districts */}
                      {newMasterDiff.newDistricts.length > 0 && (
                        <div className="flex items-start gap-2">
                          <span className="text-[11px] font-bold text-stone-700 w-24 shrink-0 mt-0.5">総代・世話人・地区:</span>
                          <div className="flex flex-wrap gap-1.5">
                            {newMasterDiff.newDistricts.map((d) => {
                              const isChecked = selectedMasterItems[`dst:${d}`] !== false;
                              return (
                                <button
                                  type="button"
                                  key={`dst-${d}`}
                                  onClick={() => setSelectedMasterItems(prev => ({ ...prev, [`dst:${d}`]: !isChecked }))}
                                  className={`px-2.5 py-0.5 border text-[11px] font-bold rounded cursor-pointer transition-colors flex items-center gap-1 ${
                                    isChecked ? 'bg-white border-[#D4AF37] text-stone-900 shadow-2xs' : 'bg-stone-100 border-stone-200 text-stone-400 line-through'
                                  }`}
                                >
                                  <input type="checkbox" checked={isChecked} readOnly className="w-3 h-3 pointer-events-none" />
                                  {d}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Toba Types */}
                      {newMasterDiff.newTobaTypes.length > 0 && (
                        <div className="flex items-start gap-2">
                          <span className="text-[11px] font-bold text-stone-700 w-24 shrink-0 mt-0.5">塔婆種別:</span>
                          <div className="flex flex-wrap gap-1.5">
                            {newMasterDiff.newTobaTypes.map((tb) => {
                              const isChecked = selectedMasterItems[`tb:${tb}`] !== false;
                              return (
                                <button
                                  type="button"
                                  key={`tb-${tb}`}
                                  onClick={() => setSelectedMasterItems(prev => ({ ...prev, [`tb:${tb}`]: !isChecked }))}
                                  className={`px-2.5 py-0.5 border text-[11px] font-bold rounded cursor-pointer transition-colors flex items-center gap-1 ${
                                    isChecked ? 'bg-white border-[#D4AF37] text-stone-900 shadow-2xs' : 'bg-stone-100 border-stone-200 text-stone-400 line-through'
                                  }`}
                                >
                                  <input type="checkbox" checked={isChecked} readOnly className="w-3 h-3 pointer-events-none" />
                                  {tb}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Income Categories */}
                      {newMasterDiff.newIncomeCategories.length > 0 && (
                        <div className="flex items-start gap-2">
                          <span className="text-[11px] font-bold text-emerald-900 w-24 shrink-0 mt-0.5">収入科目:</span>
                          <div className="flex flex-wrap gap-1.5">
                            {newMasterDiff.newIncomeCategories.map((c) => {
                              const isChecked = selectedMasterItems[`inc:${c}`] !== false;
                              return (
                                <button
                                  type="button"
                                  key={`inc-${c}`}
                                  onClick={() => setSelectedMasterItems(prev => ({ ...prev, [`inc:${c}`]: !isChecked }))}
                                  className={`px-2.5 py-0.5 border text-[11px] font-bold rounded cursor-pointer transition-colors flex items-center gap-1 ${
                                    isChecked ? 'bg-emerald-50 border-emerald-400 text-emerald-950 shadow-2xs' : 'bg-stone-100 border-stone-200 text-stone-400 line-through'
                                  }`}
                                >
                                  <input type="checkbox" checked={isChecked} readOnly className="w-3 h-3 pointer-events-none" />
                                  {c}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Expense Categories */}
                      {newMasterDiff.newExpenseCategories.length > 0 && (
                        <div className="flex items-start gap-2">
                          <span className="text-[11px] font-bold text-rose-900 w-24 shrink-0 mt-0.5">支出科目:</span>
                          <div className="flex flex-wrap gap-1.5">
                            {newMasterDiff.newExpenseCategories.map((c) => {
                              const isChecked = selectedMasterItems[`exp:${c}`] !== false;
                              return (
                                <button
                                  type="button"
                                  key={`exp-${c}`}
                                  onClick={() => setSelectedMasterItems(prev => ({ ...prev, [`exp:${c}`]: !isChecked }))}
                                  className={`px-2.5 py-0.5 border text-[11px] font-bold rounded cursor-pointer transition-colors flex items-center gap-1 ${
                                    isChecked ? 'bg-rose-50 border-rose-400 text-rose-950 shadow-2xs' : 'bg-stone-100 border-stone-200 text-stone-400 line-through'
                                  }`}
                                >
                                  <input type="checkbox" checked={isChecked} readOnly className="w-3 h-3 pointer-events-none" />
                                  {c}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Payment Methods */}
                      {newMasterDiff.newPaymentMethods.length > 0 && (
                        <div className="flex items-start gap-2">
                          <span className="text-[11px] font-bold text-blue-900 w-24 shrink-0 mt-0.5">決済方法:</span>
                          <div className="flex flex-wrap gap-1.5">
                            {newMasterDiff.newPaymentMethods.map((p) => {
                              const isChecked = selectedMasterItems[`pm:${p}`] !== false;
                              return (
                                <button
                                  type="button"
                                  key={`pm-${p}`}
                                  onClick={() => setSelectedMasterItems(prev => ({ ...prev, [`pm:${p}`]: !isChecked }))}
                                  className={`px-2.5 py-0.5 border text-[11px] font-bold rounded cursor-pointer transition-colors flex items-center gap-1 ${
                                    isChecked ? 'bg-blue-50 border-blue-400 text-blue-950 shadow-2xs' : 'bg-stone-100 border-stone-200 text-stone-400 line-through'
                                  }`}
                                >
                                  <input type="checkbox" checked={isChecked} readOnly className="w-3 h-3 pointer-events-none" />
                                  {p}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Import Options / Conflict Resolution */}
              <div className="bg-white border border-[#D1CEC7] p-4 space-y-4 shadow-xs">
                <h4 className="text-xs font-bold text-[#1A1A1A] flex items-center gap-1.5 border-b border-[#EAE7E0] pb-2">
                  <Sliders className="w-4 h-4 text-[#D4AF37]" />
                  取り込みオプション & 既存データとの統合ルール
                </h4>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-[#1A1A1A] mb-1">
                      既存データとの重複・結合方法:
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <label className={`p-3 border text-xs cursor-pointer flex items-start space-x-2 transition-all ${
                        conflictMode === 'append' ? 'bg-[#FAF7EE] border-[#1A1A1A] ring-1 ring-[#D4AF37]' : 'bg-[#FAF9F5] border-[#D1CEC7]'
                      }`}>
                        <input
                          type="radio"
                          name="conflictMode"
                          checked={conflictMode === 'append'}
                          onChange={() => handleConflictModeChange('append')}
                          className="mt-0.5 text-[#1A1A1A]"
                        />
                        <div>
                          <strong className="block text-[#1A1A1A]">追加（安全・重複なし）</strong>
                          <span className="text-[10px] text-[#666666]">既存データを維持し、新規データとして追加登録します。</span>
                        </div>
                      </label>

                      <label className={`p-3 border text-xs cursor-pointer flex items-start space-x-2 transition-all ${
                        conflictMode === 'replace' ? 'bg-rose-50 border-rose-600 ring-1 ring-rose-500' : 'bg-[#FAF9F5] border-[#D1CEC7]'
                      }`}>
                        <input
                          type="radio"
                          name="conflictMode"
                          checked={conflictMode === 'replace'}
                          onChange={() => handleConflictModeChange('replace')}
                          className="mt-0.5 text-rose-600"
                        />
                        <div>
                          <strong className="block text-rose-900">全置換（既存データを全削除して取り込み）</strong>
                          <span className="text-[10px] text-rose-700 font-medium">既存の登録データを全削除し、本ファイルの内容で初期化します。</span>
                        </div>
                      </label>
                    </div>
                  </div>

                  {/* High-visibility Warning & Options for Replace Mode */}
                  {conflictMode === 'replace' && (
                    <div className="bg-rose-50 border border-rose-300 p-3.5 text-xs text-rose-900 space-y-2 rounded-xs animate-in fade-in duration-150">
                      <div className="flex items-center gap-1.5 font-bold text-rose-800 text-[13px]">
                        <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                        <span>既存データ全削除（初期化）モードが有効です</span>
                      </div>
                      <p className="text-[11px] leading-relaxed text-rose-800">
                        {targetType === 'household' && (
                          <>現在の登録檀家データ（<strong>{existingHouseholds.length}件</strong>）を【すべて削除】し、本ファイルの内容（<strong>{conversionResult.stats.householdsCreated}件</strong>）で新しく置き換えます。</>
                        )}
                        {targetType === 'past_record' && (
                          <>現在の登録過去帳データ（<strong>{existingPastRecords.length}柱</strong>）を【すべて削除】し、本ファイルの内容（<strong>{conversionResult.stats.pastRecordsCreated}柱</strong>）で新しく置き換えます。</>
                        )}
                        {targetType === 'combined' && (
                          <>現在の登録檀家データ（<strong>{existingHouseholds.length}件</strong>）および過去帳データ（<strong>{existingPastRecords.length}柱</strong>）を【すべて削除】し、本ファイルの内容で新しく置き換えます。</>
                        )}
                        {targetType === 'accounting' && (
                          <>現在の出納履歴データ（<strong>{existingTransactions.length}件</strong>）を【すべて削除】し、本ファイルの内容（<strong>{conversionResult.stats.transactionsCreated}件</strong>）で新しく置き換えます。</>
                        )}
                      </p>
                      
                      <div className="pt-2 border-t border-rose-200">
                        <label className="flex items-center space-x-2 cursor-pointer font-bold text-rose-950">
                          <input
                            type="checkbox"
                            checked={clearAllRelatedData}
                            onChange={(e) => setClearAllRelatedData(e.target.checked)}
                            className="w-4 h-4 text-rose-600 rounded border-rose-300 focus:ring-rose-500"
                          />
                          <span className="text-[11px]">
                            寺院のすべての登録データ（過去帳・法要スケジュール・出納明細等）も併せて完全初期化（全消去）する
                          </span>
                        </label>
                        <p className="text-[10px] text-rose-700 pl-6 mt-0.5">
                          ※ 他のデータベース（沙羅や寺務PRO）から完全に乗り換えて新規スタートする場合に推奨されます。
                        </p>
                      </div>
                    </div>
                  )}

                  {targetType === 'past_record' && (
                    <div className="pt-2 border-t border-[#EAE7E0] flex items-center justify-between">
                      <div>
                        <label className="text-xs font-bold text-[#1A1A1A]">
                          施主・世帯主が見つからない過去帳データの扱い:
                        </label>
                        <p className="text-[11px] text-[#666666]">
                          該当する檀家が未登録の場合、自動的に施主名の新規檀家を作成して紐付けます。
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={autoCreateHouseholdForKakocho}
                        onChange={(e) => setAutoCreateHouseholdForKakocho(e.target.checked)}
                        className="w-4 h-4 text-[#1A1A1A]"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Data Table Preview (Full Data Display with Search & Filters) */}
              {(() => {
                const targetHouseholds = conversionResult.importedHouseholds && conversionResult.importedHouseholds.length > 0
                  ? conversionResult.importedHouseholds
                  : conversionResult.households;
                const targetPastRecords = conversionResult.importedPastRecords && conversionResult.importedPastRecords.length > 0
                  ? conversionResult.importedPastRecords
                  : conversionResult.pastRecords;
                const targetTransactions = conversionResult.importedTransactions && conversionResult.importedTransactions.length > 0
                  ? conversionResult.importedTransactions
                  : conversionResult.transactions;

                // Filter logic
                const searchLower = previewSearch.toLowerCase().trim();

                const filteredHouseholds = targetHouseholds.filter(h => {
                  if (!searchLower) return true;
                  return (
                    (h.id && h.id.toLowerCase().includes(searchLower)) ||
                    (h.familyHead && h.familyHead.toLowerCase().includes(searchLower)) ||
                    (h.furigana && h.furigana.toLowerCase().includes(searchLower)) ||
                    (h.address && h.address.toLowerCase().includes(searchLower)) ||
                    (h.phone && h.phone.toLowerCase().includes(searchLower)) ||
                    (h.district && h.district.toLowerCase().includes(searchLower))
                  );
                });

                const filteredPastRecords = targetPastRecords.filter(p => {
                  if (!searchLower) return true;
                  return (
                    (p.dharmaName && p.dharmaName.toLowerCase().includes(searchLower)) ||
                    (p.secularName && p.secularName.toLowerCase().includes(searchLower)) ||
                    (p.householdHeadName && p.householdHeadName.toLowerCase().includes(searchLower)) ||
                    (p.householdId && p.householdId.toLowerCase().includes(searchLower)) ||
                    (p.deathDate && p.deathDate.toLowerCase().includes(searchLower)) ||
                    (p.burialLocation && p.burialLocation.toLowerCase().includes(searchLower))
                  );
                });

                const filteredTransactions = targetTransactions.filter(t => {
                  if (!searchLower) return true;
                  return (
                    (t.category && t.category.toLowerCase().includes(searchLower)) ||
                    (t.householdHeadName && t.householdHeadName.toLowerCase().includes(searchLower)) ||
                    (t.householdId && t.householdId.toLowerCase().includes(searchLower)) ||
                    (t.date && t.date.toLowerCase().includes(searchLower)) ||
                    (t.type && t.type.toLowerCase().includes(searchLower)) ||
                    (t.paymentMethod && t.paymentMethod.toLowerCase().includes(searchLower)) ||
                    String(t.amount).includes(searchLower)
                  );
                });

                const totalItemsCount = 
                  targetType === 'household' ? targetHouseholds.length :
                  (targetType === 'past_record' || targetType === 'combined') ? targetPastRecords.length :
                  targetTransactions.length;

                const currentFilteredCount = 
                  targetType === 'household' ? filteredHouseholds.length :
                  (targetType === 'past_record' || targetType === 'combined') ? filteredPastRecords.length :
                  filteredTransactions.length;

                const displayedHouseholds = previewDisplayLimit === 'all' ? filteredHouseholds : filteredHouseholds.slice(0, previewDisplayLimit);
                const displayedPastRecords = previewDisplayLimit === 'all' ? filteredPastRecords : filteredPastRecords.slice(0, previewDisplayLimit);
                const displayedTransactions = previewDisplayLimit === 'all' ? filteredTransactions : filteredTransactions.slice(0, previewDisplayLimit);

                return (
                  <div className="border border-[#D1CEC7] bg-white shadow-xs overflow-hidden">
                    {/* Header Controls: Temple confirmation, Search bar, and Row Count selector */}
                    <div className="bg-[#FAF9F5] p-3 border-b border-[#D1CEC7] space-y-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center space-x-2">
                          <span className="font-bold text-sm text-[#1A1A1A]">
                            取り込みデータ変換プレビュー
                          </span>
                          <span className="px-2 py-0.5 bg-[#1A1A1A] text-[#F9F7F2] text-[11px] font-bold rounded-xs flex items-center gap-1">
                            <Building2 className="w-3 h-3 text-[#D4AF37]" />
                            取込先: {selectedTemple.name} {selectedTemple.isMain ? '（本寺）' : '（兼務寺院）'}
                          </span>
                          <span className="px-2 py-0.5 bg-emerald-100 border border-emerald-300 text-emerald-900 text-[11px] font-mono font-bold rounded-xs">
                            全 {totalItemsCount} 件
                          </span>
                        </div>

                        {/* Display Limit Selector */}
                        <div className="flex items-center space-x-1 text-xs">
                          <span className="text-[11px] text-[#666666]">表示件数:</span>
                          {(['all', 50, 100, 500, 1000] as const).map(limit => (
                            <button
                              key={limit}
                              type="button"
                              onClick={() => {
                                if (limit === 'all' && totalItemsCount > 2000) {
                                  if (window.confirm(`全 ${totalItemsCount.toLocaleString()} 件を一度にプレビュー表示するとブラウザの描画に数秒かかる場合があります。表示しますか？`)) {
                                    setPreviewDisplayLimit(limit);
                                  }
                                } else {
                                  setPreviewDisplayLimit(limit);
                                }
                              }}
                              className={`px-2 py-0.5 text-[11px] border font-mono transition-colors cursor-pointer rounded-xs ${
                                previewDisplayLimit === limit
                                  ? 'bg-[#1A1A1A] text-white border-[#1A1A1A] font-bold'
                                  : 'bg-white text-[#555555] border-[#D1CEC7] hover:bg-[#F2EFE9]'
                              }`}
                            >
                              {limit === 'all' ? '全件' : `${limit}件`}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Search Bar */}
                      <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[#888888]" />
                          <input
                            type="text"
                            value={previewSearch}
                            onChange={(e) => setPreviewSearch(e.target.value)}
                            placeholder="プレビュー内の絞り込み検索（世帯主名、戒名、俗名、ID、住所など）..."
                            className="w-full pl-8 pr-7 py-1.5 bg-white border border-[#D1CEC7] text-xs placeholder:text-[#AAAAAA] focus:border-[#D4AF37] focus:outline-hidden"
                          />
                          {previewSearch && (
                            <button
                              type="button"
                              onClick={() => setPreviewSearch('')}
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-[#888888] hover:text-[#1A1A1A] text-xs font-bold"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                        <div className="text-[11px] text-[#666666] shrink-0">
                          表示: <span className="font-bold text-[#1A1A1A] font-mono">{currentFilteredCount}</span> / {totalItemsCount} 件
                        </div>
                      </div>
                    </div>

                    {/* Table Render Container */}
                    <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                      {targetType === 'household' && (
                        <table className="w-full text-left text-xs border-collapse font-sans">
                          <thead className="bg-[#F0EEE9] border-b border-[#D1CEC7] sticky top-0 z-10">
                            <tr>
                              <th className="p-2.5 font-bold text-[#1A1A1A]">No.</th>
                              <th className="p-2.5 font-bold text-[#1A1A1A]">檀家ID</th>
                              <th className="p-2.5 font-bold text-[#1A1A1A]">世帯主名</th>
                              <th className="p-2.5 font-bold text-[#1A1A1A]">フリガナ</th>
                              <th className="p-2.5 font-bold text-[#1A1A1A]">郵便番号</th>
                              <th className="p-2.5 font-bold text-[#1A1A1A]">住所</th>
                              <th className="p-2.5 font-bold text-[#1A1A1A]">電話番号</th>
                              <th className="p-2.5 font-bold text-[#1A1A1A]">地区・総代</th>
                              <th className="p-2.5 font-bold text-[#1A1A1A]">区分１</th>
                              <th className="p-2.5 font-bold text-[#1A1A1A]">区分２</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#EAE7E0]">
                            {displayedHouseholds.length === 0 ? (
                              <tr>
                                <td colSpan={10} className="p-8 text-center text-[#888888]">
                                  該当するデータが見つかりませんでした。
                                </td>
                              </tr>
                            ) : (
                              displayedHouseholds.map((h, i) => (
                                <tr key={i} className="hover:bg-[#FAF7EE] transition-colors">
                                  <td className="p-2.5 font-mono text-[#888888] text-[11px]">{i + 1}</td>
                                  <td className="p-2.5 font-mono font-bold text-[#1A1A1A] whitespace-nowrap">{h.id}</td>
                                  <td className="p-2.5 font-bold text-[#1A1A1A] whitespace-nowrap">{h.familyHead}</td>
                                  <td className="p-2.5 text-[#666] whitespace-nowrap">{h.furigana || '-'}</td>
                                  <td className="p-2.5 font-mono whitespace-nowrap">{h.postalCode || '-'}</td>
                                  <td className="p-2.5 truncate max-w-xs">{h.address || '-'}</td>
                                  <td className="p-2.5 font-mono whitespace-nowrap">{h.phone || h.mobile || '-'}</td>
                                  <td className="p-2.5 text-[#555] whitespace-nowrap">{h.district || '-'}</td>
                                  <td className="p-2.5 text-[#555] whitespace-nowrap">{h.householdType || '-'}</td>
                                  <td className="p-2.5 text-[#555] whitespace-nowrap">{h.status || '-'}</td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      )}

                      {(targetType === 'past_record' || targetType === 'combined') && (
                        <table className="w-full text-left text-xs border-collapse font-sans">
                          <thead className="bg-[#F0EEE9] border-b border-[#D1CEC7] sticky top-0 z-10">
                            <tr>
                              <th className="p-2.5 font-bold text-[#1A1A1A]">No.</th>
                              <th className="p-2.5 font-bold text-[#1A1A1A]">紐付檀家ID</th>
                              <th className="p-2.5 font-bold text-[#1A1A1A]">施主名 / 当家</th>
                              <th className="p-2.5 font-bold text-[#1A1A1A]">戒名 / 法名</th>
                              <th className="p-2.5 font-bold text-[#1A1A1A]">俗名</th>
                              <th className="p-2.5 font-bold text-[#1A1A1A]">没年月日 (命日)</th>
                              <th className="p-2.5 font-bold text-[#1A1A1A]">享年</th>
                              <th className="p-2.5 font-bold text-[#1A1A1A]">続柄</th>
                              <th className="p-2.5 font-bold text-[#1A1A1A]">墓地位置</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#EAE7E0]">
                            {displayedPastRecords.length === 0 ? (
                              <tr>
                                <td colSpan={9} className="p-8 text-center text-[#888888]">
                                  該当するデータが見つかりませんでした。
                                </td>
                              </tr>
                            ) : (
                              displayedPastRecords.map((p, i) => (
                                <tr key={i} className="hover:bg-[#FAF7EE] transition-colors">
                                  <td className="p-2.5 font-mono text-[#888888] text-[11px]">{i + 1}</td>
                                  <td className="p-2.5 font-mono text-[#D4AF37] font-bold whitespace-nowrap">{p.householdId || '-'}</td>
                                  <td className="p-2.5 font-bold text-[#1A1A1A] whitespace-nowrap">{p.householdHeadName || '-'}</td>
                                  <td className="p-2.5 font-serif font-bold text-[#1A1A1A] whitespace-nowrap">{p.dharmaName || '-'}</td>
                                  <td className="p-2.5 text-[#333333] whitespace-nowrap">{p.secularName || '-'}</td>
                                  <td className="p-2.5 font-mono text-emerald-800 font-bold whitespace-nowrap">{p.deathDate}</td>
                                  <td className="p-2.5 font-mono whitespace-nowrap">{p.ageAtDeath !== undefined && p.ageAtDeath !== null ? `${p.ageAtDeath} 歳` : '-'}</td>
                                  <td className="p-2.5 whitespace-nowrap">{p.relationship || '-'}</td>
                                  <td className="p-2.5 truncate max-w-xs">{p.burialLocation || '-'}</td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      )}

                      {targetType === 'accounting' && (
                        <table className="w-full text-left text-xs border-collapse font-sans">
                          <thead className="bg-[#F0EEE9] border-b border-[#D1CEC7] sticky top-0 z-10">
                            <tr>
                              <th className="p-2.5 font-bold text-[#1A1A1A]">No.</th>
                              <th className="p-2.5 font-bold text-[#1A1A1A]">取引日</th>
                              <th className="p-2.5 font-bold text-[#1A1A1A]">収支</th>
                              <th className="p-2.5 font-bold text-[#1A1A1A]">勘定科目</th>
                              <th className="p-2.5 font-bold text-[#1A1A1A]">金額</th>
                              <th className="p-2.5 font-bold text-[#1A1A1A]">檀家ID</th>
                              <th className="p-2.5 font-bold text-[#1A1A1A]">施主 / 相手先</th>
                              <th className="p-2.5 font-bold text-[#1A1A1A]">支払方法</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#EAE7E0]">
                            {displayedTransactions.length === 0 ? (
                              <tr>
                                <td colSpan={8} className="p-8 text-center text-[#888888]">
                                  該当するデータが見つかりませんでした。
                                </td>
                              </tr>
                            ) : (
                              displayedTransactions.map((t, i) => (
                                <tr key={i} className="hover:bg-[#FAF7EE] transition-colors">
                                  <td className="p-2.5 font-mono text-[#888888] text-[11px]">{i + 1}</td>
                                  <td className="p-2.5 font-mono whitespace-nowrap">{t.date}</td>
                                  <td className="p-2.5 whitespace-nowrap">
                                    <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded-xs ${t.type === '収入' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                                      {t.type}
                                    </span>
                                  </td>
                                  <td className="p-2.5 font-bold text-[#1A1A1A] whitespace-nowrap">{t.category}</td>
                                  <td className="p-2.5 font-mono font-bold whitespace-nowrap">¥{t.amount.toLocaleString()}</td>
                                  <td className="p-2.5 font-mono text-[#D4AF37] font-bold whitespace-nowrap">{t.householdId || '-'}</td>
                                  <td className="p-2.5 whitespace-nowrap">{t.householdHeadName || '-'}</td>
                                  <td className="p-2.5 whitespace-nowrap">{t.paymentMethod}</td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* Warnings display if any */}
              {conversionResult.stats.warnings.length > 0 && (
                <div className="bg-amber-50 border border-amber-300 p-3 text-xs text-amber-900 space-y-1 max-h-28 overflow-y-auto">
                  <div className="font-bold flex items-center gap-1 text-amber-800">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                    注意・スキップされた行 ({conversionResult.stats.warnings.length}件):
                  </div>
                  {conversionResult.stats.warnings.slice(0, 5).map((w, idx) => (
                    <div key={idx} className="text-[11px] text-amber-800">{w}</div>
                  ))}
                  {conversionResult.stats.warnings.length > 5 && (
                    <div className="text-[10px] text-amber-700 font-bold">...他 {conversionResult.stats.warnings.length - 5} 件</div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ================= STEP 4: Completed ================= */}
          {step === 4 && (
            <div className="py-8 text-center space-y-5 font-sans">
              <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-md">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <div>
                <h3 className="text-xl font-bold font-serif text-[#1A1A1A]">
                  データの取り込みが完了いたしました
                </h3>
                <p className="text-xs text-[#555555] max-w-md mx-auto mt-1">
                  取り込まれたデータは即時に反映され、Googleスプレッドシートへの自動同期および各種印刷・年回忌計算にもご利用いただけます。
                </p>
              </div>

              {autoSyncMasterOptions && newMasterDiff && newMasterDiff.totalNewCount > 0 && (
                <div className="bg-amber-50/80 border border-[#D4AF37] p-3 text-xs text-[#1A1A1A] max-w-lg mx-auto text-left space-y-1.5 shadow-2xs">
                  <div className="font-bold text-amber-900 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>区分・勘定科目マスタへ {newMasterDiff.totalNewCount} 件の新規項目を登録しました</span>
                  </div>
                  <div className="text-[11px] text-[#555555] leading-relaxed">
                    今回取り込んだファイル内に含まれていた新規の地区・区分・勘定科目がマスタに登録されました。「設定 ＞ 区分・勘定科目マスタ」から確認・並べ替え・編集が可能です。
                  </div>
                </div>
              )}

              {/* Consecutive Import Actions */}
              <div className="bg-stone-50 border border-stone-300 rounded-xl p-4 max-w-xl mx-auto text-left space-y-3 shadow-xs">
                <div className="flex items-center justify-between border-b border-stone-200 pb-2">
                  <span className="text-xs font-bold text-stone-800 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-[#D4AF37]" />
                    続けて他のデータを取り込む
                  </span>
                  <span className="text-[11px] text-stone-500">
                    ウィザードを開いたまま次のデータを取り込めます
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {targetType !== 'past_record' && (
                    <button
                      type="button"
                      onClick={() => handleStartAnotherImport('past_record')}
                      className="p-3 bg-white hover:bg-amber-50/70 border border-stone-300 hover:border-amber-400 text-stone-800 rounded-lg text-left transition-all group cursor-pointer shadow-2xs"
                    >
                      <div className="flex items-center space-x-2 mb-1">
                        <div className="w-6 h-6 rounded bg-amber-100 flex items-center justify-center text-amber-900 font-serif font-bold text-xs">
                          過去
                        </div>
                        <span className="font-bold text-xs text-stone-900 group-hover:text-amber-900">過去帳を取り込む</span>
                      </div>
                      <p className="text-[10px] text-stone-500 leading-tight">戒名・俗名・命日・施主・精霊データ</p>
                    </button>
                  )}

                  {targetType !== 'accounting' && (
                    <button
                      type="button"
                      onClick={() => handleStartAnotherImport('accounting')}
                      className="p-3 bg-white hover:bg-amber-50/70 border border-stone-300 hover:border-amber-400 text-stone-800 rounded-lg text-left transition-all group cursor-pointer shadow-2xs"
                    >
                      <div className="flex items-center space-x-2 mb-1">
                        <div className="w-6 h-6 rounded bg-emerald-100 flex items-center justify-center text-emerald-900 font-serif font-bold text-xs">
                          出納
                        </div>
                        <span className="font-bold text-xs text-stone-900 group-hover:text-amber-900">会計収支を取り込む</span>
                      </div>
                      <p className="text-[10px] text-stone-500 leading-tight">出納帳・護持会費・寄付・収入支出</p>
                    </button>
                  )}

                  {targetType !== 'household' && (
                    <button
                      type="button"
                      onClick={() => handleStartAnotherImport('household')}
                      className="p-3 bg-white hover:bg-amber-50/70 border border-stone-300 hover:border-amber-400 text-stone-800 rounded-lg text-left transition-all group cursor-pointer shadow-2xs"
                    >
                      <div className="flex items-center space-x-2 mb-1">
                        <div className="w-6 h-6 rounded bg-blue-100 flex items-center justify-center text-blue-900 font-serif font-bold text-xs">
                          檀家
                        </div>
                        <span className="font-bold text-xs text-stone-900 group-hover:text-amber-900">檀家名簿を取り込む</span>
                      </div>
                      <p className="text-[10px] text-stone-500 leading-tight">世帯主・住所・電話・墓地・家族情報</p>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => handleStartAnotherImport()}
                    className="p-3 bg-white hover:bg-stone-100 border border-stone-300 text-stone-700 rounded-lg text-left transition-all group cursor-pointer shadow-2xs"
                  >
                    <div className="flex items-center space-x-2 mb-1">
                      <div className="w-6 h-6 rounded bg-stone-200 flex items-center justify-center text-stone-700 font-bold text-xs">
                        ＋
                      </div>
                      <span className="font-bold text-xs text-stone-800 group-hover:text-stone-900">別のファイルを選択</span>
                    </div>
                    <p className="text-[10px] text-stone-500 leading-tight">取り込み種別を最初から選択</p>
                  </button>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-8 py-2.5 bg-[#1A1A1A] hover:bg-[#333333] text-[#D4AF37] text-xs font-bold transition-colors shadow-md rounded-md cursor-pointer"
                >
                  完了して画面を閉じる
                </button>
              </div>
            </div>
          )}

        </div>

        {/* Footer Actions */}
        <div className="bg-[#F0EEE9] border-t border-[#D1CEC7] p-4 flex justify-between items-center font-sans">
          {step === 1 && (
            <div className="text-xs text-[#666666]">
              ファイルを選択すると自動的に列の照合ステップに進みます。
            </div>
          )}

          {step === 2 && (
            <>
              <button
                type="button"
                onClick={() => setStep(1)}
                className="px-4 py-2 bg-white hover:bg-[#EAE7E0] text-[#1A1A1A] border border-[#D1CEC7] text-xs font-bold flex items-center space-x-1.5 shadow-2xs"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>戻る</span>
              </button>

              <button
                type="button"
                onClick={handleProceedToPreview}
                className="px-5 py-2 bg-[#1A1A1A] hover:bg-[#333333] text-[#D4AF37] text-xs font-bold flex items-center space-x-1.5 shadow-md"
              >
                <span>プレビューと確認へ進む</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </>
          )}

          {step === 3 && (
            <>
              <button
                type="button"
                onClick={() => setStep(2)}
                className="px-4 py-2 bg-white hover:bg-[#EAE7E0] text-[#1A1A1A] border border-[#D1CEC7] text-xs font-bold flex items-center space-x-1.5 shadow-2xs"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>列マッピングに戻る</span>
              </button>

              <button
                type="button"
                onClick={handleExecuteImport}
                className={`px-6 py-2 text-white text-xs font-bold flex items-center space-x-2 shadow-md ${
                  conflictMode === 'replace' 
                    ? 'bg-rose-700 hover:bg-rose-800 ring-1 ring-rose-900' 
                    : 'bg-emerald-700 hover:bg-emerald-800'
                }`}
              >
                {conflictMode === 'replace' ? <Trash2 className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                <span>{conflictMode === 'replace' ? '既存データを削除して取り込みへ進む' : '取り込みを実行する'}</span>
              </button>
            </>
          )}

          {step === 4 && (
            <div className="w-full flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2 bg-[#1A1A1A] text-[#D4AF37] text-xs font-bold"
              >
                閉じる
              </button>
            </div>
          )}
        </div>

      </div>

      {/* Safety Confirmation Modal for Replace / Delete-All Mode */}
      {showReplaceConfirmModal && conversionResult && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-[#FAF9F5] border-2 border-rose-600 shadow-2xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-start space-x-3">
              <div className="w-10 h-10 bg-rose-100 text-rose-700 flex items-center justify-center shrink-0 rounded-full">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold font-serif text-rose-950">
                  【重要】既存データの全削除と新規取り込みの確認
                </h3>
                <p className="text-xs text-rose-800 mt-1">
                  この操作を実行すると、現在の登録データが削除され、取り込みファイルの内容で初期化されます。
                </p>
              </div>
            </div>

            <div className="bg-white border border-rose-200 p-3 space-y-2 text-xs">
              <div className="font-bold text-[#1A1A1A] border-b border-[#EAE7E0] pb-1">
                実行内容の概要:
              </div>
              <ul className="space-y-1 text-[#333333] list-disc list-inside">
                {targetType === 'household' && (
                  <li>
                    既存の檀家名簿（<strong>{existingHouseholds.length}件</strong>）を全削除 → 新規 <strong>{conversionResult.stats.householdsCreated}件</strong> を登録
                  </li>
                )}
                {targetType === 'past_record' && (
                  <li>
                    既存の過去帳・霊位（<strong>{existingPastRecords.length}柱</strong>）を全削除 → 新規 <strong>{conversionResult.stats.pastRecordsCreated}柱</strong> を登録
                  </li>
                )}
                {targetType === 'combined' && (
                  <>
                    <li>既存の檀家名簿（<strong>{existingHouseholds.length}件</strong>）を全削除</li>
                    <li>既存の過去帳（<strong>{existingPastRecords.length}柱</strong>）を全削除</li>
                  </>
                )}
                {targetType === 'accounting' && (
                  <li>
                    既存の出納履歴（<strong>{existingTransactions.length}件</strong>）を全削除 → 新規 <strong>{conversionResult.stats.transactionsCreated}件</strong> を登録
                  </li>
                )}
                {clearAllRelatedData && (
                  <li className="text-rose-700 font-bold">
                    【全初期化】過去帳・法要スケジュール・出納明細等の関連全データもすべて消去されます
                  </li>
                )}
              </ul>
            </div>

            <div className="bg-rose-50 border border-rose-300 p-2.5 text-[11px] text-rose-900">
              ⚠️ 削除されたデータは元に戻せません。必要に応じて事前に「Excel出力・保存」でバックアップを保存してください。
            </div>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setShowReplaceConfirmModal(false)}
                className="px-4 py-2 bg-white hover:bg-[#EAE7E0] text-[#1A1A1A] border border-[#D1CEC7] text-xs font-bold"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={doCommitImport}
                className="px-5 py-2 bg-rose-700 hover:bg-rose-800 text-white text-xs font-bold flex items-center space-x-1.5 shadow-md"
              >
                <Trash2 className="w-4 h-4" />
                <span>全削除して取り込みを実行</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Kakocho Lineage Matching Confirmation Modal */}
      {showLineageModal && (
        <KakochoLineageConfirmModal
          isOpen={showLineageModal}
          onClose={() => setShowLineageModal(false)}
          rawItems={kakochoItems}
          existingHouseholds={existingHouseholds}
          existingPastRecords={existingPastRecords}
          targetTempleId={targetTempleId}
          temples={temples}
          onConfirmDecisions={handleLineageDecisionsConfirmed}
        />
      )}
    </div>
  );
};
