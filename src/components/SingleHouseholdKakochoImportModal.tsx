import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  Camera, 
  Upload, 
  FileSpreadsheet, 
  FileText, 
  Sparkles, 
  CheckCircle2, 
  AlertCircle, 
  X, 
  Plus, 
  Trash2, 
  RefreshCw, 
  ZoomIn, 
  ZoomOut, 
  ArrowRight, 
  ArrowLeft, 
  Check, 
  Info,
  Layers,
  HelpCircle,
  FlipHorizontal,
  ChevronRight,
  Database,
  Calendar,
  User,
  Eye,
  Edit2
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { Household, PastRecord, TempleInfo, TempleProfile } from '../types';
import { 
  normalizeDateInput, 
  formatJapaneseEraDate, 
  calculateNiibonFromDeathDate, 
  getHouseholdSponsorName 
} from '../utils/memorialCalculator';
import { withCreationAudit } from '../utils/auditUtils';

export interface SingleHouseholdKakochoImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetHousehold: Household | null;
  existingPastRecords?: PastRecord[];
  templeInfo?: TempleInfo;
  temples?: TempleProfile[];
  onImportPastRecords: (records: PastRecord[], description?: string) => void;
}

export type InputSourceType = 'camera_image' | 'excel' | 'word_text' | 'paste_text';

export interface ExtractedKakochoItem {
  id: string;
  selected: boolean;
  dharmaName: string;
  secularName: string;
  furigana: string;
  deathDate: string;
  ageAtDeath: number | undefined;
  relationship: string;
  householdHeadName: string;
  burialLocation: string;
  notes: string;
  isDuplicate?: boolean;
  duplicateReason?: string;
}

export const SingleHouseholdKakochoImportModal: React.FC<SingleHouseholdKakochoImportModalProps> = ({
  isOpen,
  onClose,
  targetHousehold,
  existingPastRecords = [],
  templeInfo,
  temples = [],
  onImportPastRecords,
}) => {
  // Wizard steps: 'input' -> 'analyzing' -> 'review' -> 'complete'
  const [currentStep, setCurrentStep] = useState<'input' | 'analyzing' | 'review' | 'complete'>('input');
  const [activeSourceType, setActiveSourceType] = useState<InputSourceType>('camera_image');

  // Input Data States
  const [selectedImageBase64, setSelectedImageBase64] = useState<string | null>(null);
  const [selectedImageMime, setSelectedImageMime] = useState<string>('image/jpeg');
  const [selectedFileName, setSelectedFileName] = useState<string>('');
  const [pastedText, setPastedText] = useState<string>('');

  // Live Camera Streaming State
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [cameraFacingMode, setCameraFacingMode] = useState<'environment' | 'user'>('environment');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);

  // File input refs
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const nativeCameraInputRef = useRef<HTMLInputElement | null>(null);
  const excelInputRef = useRef<HTMLInputElement | null>(null);
  const docInputRef = useRef<HTMLInputElement | null>(null);

  // Drag-and-drop state
  const [isDragging, setIsDragging] = useState(false);

  // Analysis Result States
  const [aiSummary, setAiSummary] = useState<string>('');
  const [extractedRecords, setExtractedRecords] = useState<ExtractedKakochoItem[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [importedCount, setImportedCount] = useState<number>(0);

  // Duplicate handling option
  const [duplicateMode, setDuplicateMode] = useState<'allow' | 'update' | 'skip'>('allow');

  // Image viewer zoom/pan state for review step
  const [imageZoom, setImageZoom] = useState<number>(1);
  const [showImagePreview, setShowImagePreview] = useState<boolean>(true);

  // Resolved household information
  const householdName = targetHousehold
    ? getHouseholdSponsorName(targetHousehold) || targetHousehold.familyHead || `世帯 ID: ${targetHousehold.id}`
    : '檀家世帯';

  const householdTomb = targetHousehold?.tombNumber || '';
  const householdTempleName = useMemo(() => {
    if (!targetHousehold) return templeInfo?.name || '';
    const t = temples.find((item) => item.id === targetHousehold.templeId);
    return t?.name || templeInfo?.name || '';
  }, [targetHousehold, temples, templeInfo]);

  // Current household's existing records for reference & duplicate checking
  const currentHouseholdExistingRecords = useMemo(() => {
    if (!targetHousehold) return [];
    return existingPastRecords.filter((p) => p.householdId === targetHousehold.id);
  }, [existingPastRecords, targetHousehold]);

  // Clean up camera stream on unmount or step change
  const stopCamera = () => {
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = null;
    }
    setIsCameraActive(false);
  };

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      // Reset state when closed
      setCurrentStep('input');
      setSelectedImageBase64(null);
      setSelectedFileName('');
      setPastedText('');
      setAiSummary('');
      setExtractedRecords([]);
      setErrorMessage(null);
      setImportedCount(0);
      setImageZoom(1);
    }
  }, [isOpen]);

  // Start Camera
  const startCamera = async (mode: 'environment' | 'user' = cameraFacingMode) => {
    stopCamera();
    setCameraError(null);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('お使いのブラウザはカメラ直接起動に対応していません。ファイル選択より写真を選択してください。');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: mode },
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: false
      });

      cameraStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setIsCameraActive(true);
      setCameraFacingMode(mode);
    } catch (err: any) {
      console.warn('Camera stream error:', err);
      setCameraError(err.message || 'カメラの起動に失敗しました。カメラの利用権限を許可してください。');
      setIsCameraActive(false);
    }
  };

  // Toggle Camera Facing (Front / Back)
  const toggleCameraFacing = () => {
    const nextMode = cameraFacingMode === 'environment' ? 'user' : 'environment';
    startCamera(nextMode);
  };

  // Capture Snapshot from Live Video
  const captureSnapshot = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;

    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
      setSelectedImageBase64(dataUrl);
      setSelectedImageMime('image/jpeg');
      setSelectedFileName(`墓碑撮影_${new Date().toISOString().slice(0, 10)}.jpg`);
      stopCamera();
    }
  };

  // Handle Image File Selection (Native Camera or File Picker)
  const handleImageFileSelect = (file: File) => {
    if (!file) return;
    setSelectedFileName(file.name);
    setSelectedImageMime(file.type || 'image/jpeg');

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      setSelectedImageBase64(result);
      stopCamera();
    };
    reader.readAsDataURL(file);
  };

  // Handle Excel/CSV File
  const handleExcelFileSelect = async (file: File) => {
    if (!file) return;
    setSelectedFileName(file.name);
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const csvData = XLSX.utils.sheet_to_csv(sheet);
      setPastedText(csvData);
    } catch (err: any) {
      console.error('Excel read error:', err);
      setErrorMessage('Excel/CSVファイルの読み込みに失敗しました。');
    }
  };

  // Handle Word/Docx/Text File
  const handleDocFileSelect = async (file: File) => {
    if (!file) return;
    setSelectedFileName(file.name);

    if (file.name.endsWith('.txt') || file.type === 'text/plain') {
      const text = await file.text();
      setPastedText(text);
    } else if (file.name.endsWith('.docx') || file.type.includes('wordprocessingml')) {
      // Send base64 or extract xml content
      try {
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        // In case it's readable via text
        const text = new TextDecoder('utf-8').decode(arrayBuffer);
        // Extract basic text from docx xml tags
        const stripped = text.replace(/<[^>]+>/g, ' ').replace(/[^\x20-\x7E\u3000-\u30FF\u4E00-\u9FFF\n\r\t]/g, '');
        setPastedText(stripped || `【Word文書: ${file.name}】`);
      } catch {
        setPastedText(`【Wordファイル: ${file.name}】`);
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        setSelectedImageBase64(result);
        setSelectedImageMime(file.type || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      };
      reader.readAsDataURL(file);
    } else {
      // Other text or PDF
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        setSelectedImageBase64(result);
        setSelectedImageMime(file.type || 'application/pdf');
      };
      reader.readAsDataURL(file);
    }
  };

  // Drag & Drop handler
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (file.type.startsWith('image/')) {
        setActiveSourceType('camera_image');
        handleImageFileSelect(file);
      } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls') || file.name.endsWith('.csv')) {
        setActiveSourceType('excel');
        handleExcelFileSelect(file);
      } else {
        setActiveSourceType('word_text');
        handleDocFileSelect(file);
      }
    }
  };

  // Run AI Extraction via Backend API
  const handleRunAiAnalysis = async () => {
    if (!targetHousehold) return;

    setErrorMessage(null);
    setCurrentStep('analyzing');

    try {
      const existingNames = currentHouseholdExistingRecords.map(
        (r) => `${r.dharmaName || ''} (${r.secularName || ''})`
      );

      const requestBody: any = {
        householdContext: {
          householdId: targetHousehold.id,
          familyHead: targetHousehold.familyHead,
          sponsorName: getHouseholdSponsorName(targetHousehold),
          tombNumber: targetHousehold.tombNumber,
          templeName: householdTempleName,
          existingRecords: existingNames,
        },
      };

      if (activeSourceType === 'camera_image' && selectedImageBase64) {
        requestBody.fileBase64 = selectedImageBase64;
        requestBody.mimeType = selectedImageMime;
      } else if (selectedImageBase64) {
        requestBody.fileBase64 = selectedImageBase64;
        requestBody.mimeType = selectedImageMime;
        if (pastedText) {
          requestBody.textData = pastedText;
        }
      } else if (pastedText) {
        requestBody.textData = pastedText;
      } else {
        throw new Error('解析対象の画像、ファイル、またはテキストを入力してください。');
      }

      const res = await fetch('/api/ai/parse-kakocho-records', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `AI解析サーバーエラー (${res.status})`);
      }

      const data = await res.json();
      const rawRecords: any[] = Array.isArray(data.records) ? data.records : [];

      setAiSummary(data.summary || `${rawRecords.length} 霊の精霊データを読み取りました。`);

      // Transform into ExtractedKakochoItem with duplicate check
      const processed: ExtractedKakochoItem[] = rawRecords.map((item, idx) => {
        const dharma = (item.dharmaName || '').trim();
        const secular = (item.secularName || '').trim();
        const rawDeath = (item.deathDate || '').trim();
        const normalizedDeath = normalizeDateInput(rawDeath, { mode: 'pastRecord' });
        const displayDeath = normalizedDeath ? formatJapaneseEraDate(normalizedDeath, false) : rawDeath;

        // Check for duplicates in existing records of this household
        let isDup = false;
        let dupReason = '';
        const existingMatch = currentHouseholdExistingRecords.find((ex) => {
          if (dharma && ex.dharmaName && ex.dharmaName === dharma) return true;
          if (secular && ex.secularName && ex.secularName === secular) return true;
          return false;
        });

        if (existingMatch) {
          isDup = true;
          dupReason = `既存登録済（${existingMatch.dharmaName || existingMatch.secularName}）と同名`;
        }

        return {
          id: `extracted-${Date.now()}-${idx}`,
          selected: true,
          dharmaName: dharma,
          secularName: secular,
          furigana: (item.furigana || '').trim(),
          deathDate: displayDeath,
          ageAtDeath: typeof item.ageAtDeath === 'number' && item.ageAtDeath > 0 ? item.ageAtDeath : undefined,
          relationship: (item.relationship || '').trim(),
          householdHeadName: (item.householdHeadName || targetHousehold.familyHead || '').trim(),
          burialLocation: (item.burialLocation || targetHousehold.tombNumber || '').trim(),
          notes: (item.notes || '').trim(),
          isDuplicate: isDup,
          duplicateReason: dupReason,
        };
      });

      // If no records found, provide at least one empty editable row
      if (processed.length === 0) {
        processed.push({
          id: `extracted-${Date.now()}-0`,
          selected: true,
          dharmaName: '',
          secularName: '',
          furigana: '',
          deathDate: '',
          ageAtDeath: undefined,
          relationship: '',
          householdHeadName: targetHousehold.familyHead || '',
          burialLocation: targetHousehold.tombNumber || '',
          notes: '',
        });
      }

      setExtractedRecords(processed);
      setCurrentStep('review');
    } catch (err: any) {
      console.error('AI extraction error:', err);
      let msg = err.message || 'AI解析中にエラーが発生しました。';
      if (typeof msg === 'string' && (msg.includes('503') || msg.includes('UNAVAILABLE') || msg.includes('high demand') || msg.includes('spikes in demand') || msg.includes('ApiError'))) {
        msg = '現在AIモデルが一時的に高負荷（503）となっております。少し時間を置いて再試行するか、手動入力をお試しください。';
      }
      setErrorMessage(msg);
      setCurrentStep('input');
    }
  };

  // Skip AI and proceed directly to manual review table
  const handleProceedToManualReview = () => {
    if (!targetHousehold) return;
    setErrorMessage(null);
    setAiSummary('手動入力モード（行を追加して精霊情報を直接ご入力ください）');
    setExtractedRecords([
      {
        id: `extracted-${Date.now()}-0`,
        selected: true,
        dharmaName: '',
        secularName: '',
        furigana: '',
        deathDate: '',
        ageAtDeath: undefined,
        relationship: '',
        householdHeadName: targetHousehold.familyHead || '',
        burialLocation: targetHousehold.tombNumber || '',
        notes: '',
      },
    ]);
    setCurrentStep('review');
  };

  // Add a new row in review step
  const handleAddRow = () => {
    if (!targetHousehold) return;
    const newRow: ExtractedKakochoItem = {
      id: `extracted-${Date.now()}-${extractedRecords.length}`,
      selected: true,
      dharmaName: '',
      secularName: '',
      furigana: '',
      deathDate: '',
      ageAtDeath: undefined,
      relationship: '',
      householdHeadName: targetHousehold.familyHead || '',
      burialLocation: targetHousehold.tombNumber || '',
      notes: '',
    };
    setExtractedRecords([...extractedRecords, newRow]);
  };

  // Update specific row property
  const handleUpdateRow = (id: string, field: keyof ExtractedKakochoItem, value: any) => {
    setExtractedRecords((prev) =>
      prev.map((row) => {
        if (row.id !== id) return row;

        if (field === 'deathDate') {
          const normalized = normalizeDateInput(value, { mode: 'pastRecord' });
          return {
            ...row,
            deathDate: value,
          };
        }

        return { ...row, [field]: value };
      })
    );
  };

  // Normalize date on blur
  const handleNormalizeRowDate = (id: string) => {
    setExtractedRecords((prev) =>
      prev.map((row) => {
        if (row.id !== id) return row;
        const normalized = normalizeDateInput(row.deathDate, { mode: 'pastRecord' });
        if (normalized) {
          return {
            ...row,
            deathDate: formatJapaneseEraDate(normalized, false),
          };
        }
        return row;
      })
    );
  };

  // Delete row
  const handleDeleteRow = (id: string) => {
    setExtractedRecords((prev) => prev.filter((r) => r.id !== id));
  };

  // Toggle select all
  const handleToggleSelectAll = () => {
    const allSelected = extractedRecords.every((r) => r.selected);
    setExtractedRecords((prev) => prev.map((r) => ({ ...r, selected: !allSelected })));
  };

  // Final Import Execution
  const handleExecuteImport = () => {
    if (!targetHousehold) return;

    const selectedItems = extractedRecords.filter((r) => r.selected && (r.dharmaName || r.secularName));
    if (selectedItems.length === 0) {
      setErrorMessage('取り込む精霊が選択されていません。戒名または俗名を入力した行をチェックしてください。');
      return;
    }

    const newPastRecords: PastRecord[] = [];

    selectedItems.forEach((item, idx) => {
      // Handle duplicates according to duplicateMode
      if (item.isDuplicate && duplicateMode === 'skip') {
        return;
      }

      const normalizedDeath = normalizeDateInput(item.deathDate, { mode: 'pastRecord' });
      const autoNiibon = normalizedDeath
        ? calculateNiibonFromDeathDate(normalizedDeath, templeInfo?.bonSeason || '8月盆')
        : undefined;

      const record: PastRecord = {
        id: `past-${Date.now()}-${Math.random().toString(36).substring(2, 7)}-${idx}`,
        templeId: targetHousehold.templeId || 'temple-main',
        householdId: targetHousehold.id,
        householdHeadName: item.householdHeadName || targetHousehold.familyHead,
        dharmaName: item.dharmaName || '',
        secularName: item.secularName || '',
        furigana: item.furigana || undefined,
        deathDate: item.deathDate || '',
        ageAtDeath: item.ageAtDeath,
        relationship: item.relationship || '',
        burialLocation: item.burialLocation || targetHousehold.tombNumber || '',
        niibon: autoNiibon,
        notes: item.notes || '',
      };

      newPastRecords.push(record);
    });

    if (newPastRecords.length === 0) {
      setErrorMessage('取り込み対象の精霊がありません（重複スキップ設定等を確認してください）。');
      return;
    }

    onImportPastRecords(
      newPastRecords,
      `【${householdName} 様】AI過去帳取り込み（${newPastRecords.length}霊追加）`
    );

    setImportedCount(newPastRecords.length);
    setCurrentStep('complete');
  };

  if (!isOpen || !targetHousehold) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 z-50 overflow-y-auto animate-fade-in font-sans">
      <div className="bg-[#F9F7F2] border-2 border-[#1A1A1A] w-full max-w-5xl shadow-2xl flex flex-col max-h-[92vh] text-[#1A1A1A] rounded-none overflow-hidden my-auto">
        {/* Modal Header */}
        <div className="bg-[#1A1A1A] text-[#F9F7F2] px-4 py-3 flex items-center justify-between border-b-2 border-[#D4AF37] shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 bg-[#D4AF37] text-[#1A1A1A] flex items-center justify-center font-bold">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-serif font-black text-base sm:text-lg tracking-wide text-[#D4AF37] flex items-center gap-2">
                <span>【{householdName} 様】過去帳・精霊 AI取り込みウィザード</span>
              </h2>
              <div className="flex flex-wrap items-center gap-2 text-xs text-[#CCCCCC] mt-0.5">
                <span className="bg-[#2D2D2D] px-2 py-0.5 border border-[#444444] font-mono">
                  世帯ID: {targetHousehold.id}
                </span>
                {householdTomb && (
                  <span className="bg-[#2D2D2D] px-2 py-0.5 border border-[#444444]">
                    墓地番号: {householdTomb}
                  </span>
                )}
                {householdTempleName && (
                  <span className="bg-[#2D2D2D] px-2 py-0.5 border border-[#444444]">
                    所属: {householdTempleName}
                  </span>
                )}
                <span className="text-[#AAAAAA]">
                  現在の登録精霊: <strong className="text-white">{currentHouseholdExistingRecords.length}</strong> 霊
                </span>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-white hover:bg-[#333333] p-1.5 transition-colors cursor-pointer"
            title="閉じる"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Wizard Step Progress Indicator */}
        <div className="bg-[#EBE7DF] border-b border-[#D1CEC7] px-4 py-2 flex items-center justify-between text-xs font-bold text-[#444444] shrink-0 overflow-x-auto">
          <div className="flex items-center space-x-2 sm:space-x-4 min-w-max">
            <div
              className={`flex items-center space-x-1.5 px-3 py-1 ${
                currentStep === 'input'
                  ? 'bg-[#1A1A1A] text-[#D4AF37] shadow-xs'
                  : 'bg-white text-[#666666] border border-[#D1CEC7]'
              }`}
            >
              <span className="w-4 h-4 rounded-full bg-[#D4AF37] text-[#1A1A1A] text-[10px] flex items-center justify-center font-bold">
                1
              </span>
              <span>入力ソース選択・撮影/読込</span>
            </div>
            <ChevronRight className="w-4 h-4 text-[#888888]" />

            <div
              className={`flex items-center space-x-1.5 px-3 py-1 ${
                currentStep === 'analyzing'
                  ? 'bg-[#1A1A1A] text-[#D4AF37] animate-pulse'
                  : currentStep === 'review' || currentStep === 'complete'
                  ? 'bg-white text-[#1A1A1A] border border-[#D1CEC7]'
                  : 'text-[#888888]'
              }`}
            >
              <span className="w-4 h-4 rounded-full bg-stone-300 text-[#1A1A1A] text-[10px] flex items-center justify-center font-bold">
                2
              </span>
              <span>AI読取＆確認・直接編集</span>
            </div>
            <ChevronRight className="w-4 h-4 text-[#888888]" />

            <div
              className={`flex items-center space-x-1.5 px-3 py-1 ${
                currentStep === 'complete'
                  ? 'bg-[#1A1A1A] text-[#D4AF37]'
                  : 'text-[#888888]'
              }`}
            >
              <span className="w-4 h-4 rounded-full bg-stone-300 text-[#1A1A1A] text-[10px] flex items-center justify-center font-bold">
                3
              </span>
              <span>取り込み完了</span>
            </div>
          </div>

          <div className="text-[11px] text-[#666666] hidden md:block">
            ※ 墓石写真・位牌・Word・ExcelからAIが戒名・俗名・没年月日・行年を自動構造化
          </div>
        </div>

        {/* Error Banner */}
        {errorMessage && (
          <div className="bg-red-50 border-b border-red-200 px-4 py-3 text-xs text-red-700 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 shrink-0">
            <div className="flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span className="font-medium">{errorMessage}</span>
            </div>
            <div className="flex items-center gap-2 self-end sm:self-auto">
              <button
                type="button"
                onClick={handleRunAiAnalysis}
                className="px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white font-bold text-[11px] rounded-xs transition-colors cursor-pointer flex items-center gap-1 shadow-xs"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>再試行する</span>
              </button>
              <button
                type="button"
                onClick={handleProceedToManualReview}
                className="px-2.5 py-1 bg-white hover:bg-stone-100 text-[#1A1A1A] border border-stone-300 font-bold text-[11px] rounded-xs transition-colors cursor-pointer"
              >
                手動入力で進む
              </button>
              <button
                type="button"
                onClick={() => setErrorMessage(null)}
                className="text-red-500 hover:text-red-800 font-bold px-1.5 py-1 cursor-pointer"
                title="閉じる"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* Main Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-[360px]">
          {/* STEP 1: INPUT SOURCE SELECTION & UPLOAD / CAMERA */}
          {currentStep === 'input' && (
            <div className="space-y-4">
              {/* Source Tab Selector */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setActiveSourceType('camera_image');
                    stopCamera();
                  }}
                  className={`p-3 text-left border-2 transition-all flex flex-col items-start gap-1 cursor-pointer ${
                    activeSourceType === 'camera_image'
                      ? 'border-[#1A1A1A] bg-white shadow-md'
                      : 'border-[#D1CEC7] bg-[#EFECE6] hover:bg-white text-[#666666]'
                  }`}
                >
                  <div className="flex items-center space-x-2">
                    <Camera className={`w-5 h-5 ${activeSourceType === 'camera_image' ? 'text-[#D4AF37]' : 'text-gray-500'}`} />
                    <span className="font-bold text-xs">📷 墓碑・位牌写真</span>
                  </div>
                  <span className="text-[10px] text-[#888888]">
                    カメラ撮影 / 画像ファイル
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setActiveSourceType('excel');
                    stopCamera();
                  }}
                  className={`p-3 text-left border-2 transition-all flex flex-col items-start gap-1 cursor-pointer ${
                    activeSourceType === 'excel'
                      ? 'border-[#1A1A1A] bg-white shadow-md'
                      : 'border-[#D1CEC7] bg-[#EFECE6] hover:bg-white text-[#666666]'
                  }`}
                >
                  <div className="flex items-center space-x-2">
                    <FileSpreadsheet className={`w-5 h-5 ${activeSourceType === 'excel' ? 'text-emerald-600' : 'text-gray-500'}`} />
                    <span className="font-bold text-xs">📊 Excel / CSV</span>
                  </div>
                  <span className="text-[10px] text-[#888888]">
                    表形式ファイル (.xlsx, .csv)
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setActiveSourceType('word_text');
                    stopCamera();
                  }}
                  className={`p-3 text-left border-2 transition-all flex flex-col items-start gap-1 cursor-pointer ${
                    activeSourceType === 'word_text'
                      ? 'border-[#1A1A1A] bg-white shadow-md'
                      : 'border-[#D1CEC7] bg-[#EFECE6] hover:bg-white text-[#666666]'
                  }`}
                >
                  <div className="flex items-center space-x-2">
                    <FileText className={`w-5 h-5 ${activeSourceType === 'word_text' ? 'text-blue-600' : 'text-gray-500'}`} />
                    <span className="font-bold text-xs">📄 Word / 文書</span>
                  </div>
                  <span className="text-[10px] text-[#888888]">
                    .docx, .doc, .pdf, .txt
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setActiveSourceType('paste_text');
                    stopCamera();
                  }}
                  className={`p-3 text-left border-2 transition-all flex flex-col items-start gap-1 cursor-pointer ${
                    activeSourceType === 'paste_text'
                      ? 'border-[#1A1A1A] bg-white shadow-md'
                      : 'border-[#D1CEC7] bg-[#EFECE6] hover:bg-white text-[#666666]'
                  }`}
                >
                  <div className="flex items-center space-x-2">
                    <Edit2 className={`w-5 h-5 ${activeSourceType === 'paste_text' ? 'text-amber-600' : 'text-gray-500'}`} />
                    <span className="font-bold text-xs">✍️ テキスト貼付</span>
                  </div>
                  <span className="text-[10px] text-[#888888]">
                    OCRメモ・原稿テキスト
                  </span>
                </button>
              </div>

              {/* MODE 1: CAMERA & IMAGE UPLOAD */}
              {activeSourceType === 'camera_image' && (
                <div className="space-y-4">
                  {/* Live Camera View if Active */}
                  {isCameraActive ? (
                    <div className="bg-[#1A1A1A] p-4 text-white space-y-3 border border-[#333333]">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2 text-xs font-bold text-[#D4AF37]">
                          <Camera className="w-4 h-4" />
                          <span>墓碑・位牌・過去帳をカメラ枠内に合わせて撮影してください</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <button
                            type="button"
                            onClick={toggleCameraFacing}
                            className="px-2.5 py-1 bg-[#333333] hover:bg-[#444444] text-xs font-bold flex items-center space-x-1 border border-stone-600 cursor-pointer"
                          >
                            <FlipHorizontal className="w-3.5 h-3.5" />
                            <span>カメラ切替</span>
                          </button>
                          <button
                            type="button"
                            onClick={stopCamera}
                            className="px-2 py-1 bg-red-900 hover:bg-red-800 text-xs font-bold cursor-pointer"
                          >
                            停止
                          </button>
                        </div>
                      </div>

                      <div className="relative w-full max-h-[380px] bg-black overflow-hidden flex items-center justify-center border border-stone-700">
                        <video
                          ref={videoRef}
                          autoPlay
                          playsInline
                          muted
                          className="w-full max-h-[380px] object-contain"
                        />
                        <canvas ref={canvasRef} className="hidden" />
                      </div>

                      <div className="flex justify-center pt-2">
                        <button
                          type="button"
                          onClick={captureSnapshot}
                          className="px-6 py-3 bg-[#D4AF37] hover:bg-[#C29D26] text-[#1A1A1A] font-black text-sm uppercase tracking-wider flex items-center space-x-2 shadow-lg cursor-pointer transform active:scale-95 transition-all"
                        >
                          <Camera className="w-5 h-5" />
                          <span>写真を撮影して決定</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Image File Upload / Drag & Drop or Launch Camera */
                    <div
                      onDragOver={(e) => {
                        e.preventDefault();
                        setIsDragging(true);
                      }}
                      onDragLeave={() => setIsDragging(false)}
                      onDrop={handleDrop}
                      className={`border-2 border-dashed p-6 text-center transition-all bg-white ${
                        isDragging ? 'border-[#D4AF37] bg-amber-50/40' : 'border-[#D1CEC7]'
                      }`}
                    >
                      {selectedImageBase64 ? (
                        <div className="space-y-3">
                          <div className="flex items-center justify-center">
                            <img
                              src={selectedImageBase64}
                              alt="Selected Gravestone"
                              className="max-h-56 max-w-full object-contain border border-[#D1CEC7] shadow-sm bg-[#FAF8F5]"
                            />
                          </div>
                          <div className="flex flex-wrap items-center justify-center gap-2 text-xs">
                            <span className="font-bold text-[#1A1A1A]">選択中: {selectedFileName || '画像データ'}</span>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedImageBase64(null);
                                setSelectedFileName('');
                              }}
                              className="px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-red-700 border border-gray-300 font-bold cursor-pointer"
                            >
                              クリア
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <div className="w-12 h-12 rounded-full bg-[#FAF0E6] text-[#8C2D19] flex items-center justify-center mx-auto border border-[#D4AF37]/40">
                            <Camera className="w-6 h-6" />
                          </div>
                          <div className="space-y-1">
                            <p className="font-bold text-sm text-[#1A1A1A]">
                              墓碑・墓誌・霊標・位牌・過去帳原本の写真を読み込み
                            </p>
                            <p className="text-xs text-[#666666]">
                              スマホで撮影した写真や、スキャンした画像ファイル（JPG, PNG, WEBP, HEIC, PDF）
                            </p>
                          </div>

                          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                            {/* Live Camera Button */}
                            <button
                              type="button"
                              onClick={() => startCamera('environment')}
                              className="px-4 py-2.5 bg-[#1A1A1A] hover:bg-[#333333] text-[#D4AF37] text-xs font-bold flex items-center space-x-1.5 shadow-sm cursor-pointer border border-[#D4AF37]"
                            >
                              <Camera className="w-4 h-4 text-[#D4AF37]" />
                              <span>カメラを起動してその場で撮影</span>
                            </button>

                            {/* Mobile Native Camera Capture Direct Input */}
                            <input
                              type="file"
                              accept="image/*"
                              capture="environment"
                              ref={nativeCameraInputRef}
                              onChange={(e) => {
                                if (e.target.files && e.target.files[0]) {
                                  handleImageFileSelect(e.target.files[0]);
                                }
                              }}
                              className="hidden"
                            />
                            <button
                              type="button"
                              onClick={() => nativeCameraInputRef.current?.click()}
                              className="px-4 py-2.5 bg-[#FAF7F0] hover:bg-[#F0ECE1] text-[#8C2D19] text-xs font-bold flex items-center space-x-1.5 shadow-sm cursor-pointer border border-[#D4AF37]"
                            >
                              <Camera className="w-4 h-4" />
                              <span>スマホカメラ撮影（端末標準）</span>
                            </button>

                            {/* File Selection Button */}
                            <input
                              type="file"
                              accept="image/*,application/pdf"
                              ref={imageInputRef}
                              onChange={(e) => {
                                if (e.target.files && e.target.files[0]) {
                                  handleImageFileSelect(e.target.files[0]);
                                }
                              }}
                              className="hidden"
                            />
                            <button
                              type="button"
                              onClick={() => imageInputRef.current?.click()}
                              className="px-4 py-2.5 bg-white hover:bg-gray-50 text-[#1A1A1A] text-xs font-bold flex items-center space-x-1.5 shadow-xs cursor-pointer border border-[#D1CEC7]"
                            >
                              <Upload className="w-4 h-4 text-gray-600" />
                              <span>画像ファイルを選択（ドラッグ＆ドロップ可）</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {cameraError && (
                    <div className="p-3 bg-amber-50 border border-amber-200 text-xs text-amber-800 space-y-1">
                      <p className="font-bold flex items-center gap-1">
                        <Info className="w-4 h-4 text-amber-600" />
                        <span>カメラ起動のお知らせ</span>
                      </p>
                      <p>{cameraError}</p>
                      <p className="text-[11px] text-amber-700">
                        ※ 代わりに「画像ファイルを選択」または「スマホカメラ撮影（端末標準）」をご利用ください。
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* MODE 2: EXCEL / CSV */}
              {activeSourceType === 'excel' && (
                <div className="space-y-4">
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDragging(true);
                    }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDrop}
                    className="border-2 border-dashed border-[#D1CEC7] bg-white p-6 text-center space-y-4"
                  >
                    <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center mx-auto border border-emerald-200">
                      <FileSpreadsheet className="w-6 h-6" />
                    </div>
                    <div className="space-y-1">
                      <p className="font-bold text-sm text-[#1A1A1A]">
                        Excel / CSVファイルから精霊データを読み込み
                      </p>
                      <p className="text-xs text-[#666666]">
                        .xlsx, .xls, .csv 形式に対応。列の並び順が異なっていてもAIが自動で各項目を照合・抽出します。
                      </p>
                    </div>

                    <input
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      ref={excelInputRef}
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          handleExcelFileSelect(e.target.files[0]);
                        }
                      }}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => excelInputRef.current?.click()}
                      className="px-4 py-2.5 bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-bold inline-flex items-center space-x-1.5 shadow-sm cursor-pointer"
                    >
                      <Upload className="w-4 h-4" />
                      <span>Excel / CSV ファイルを選択</span>
                    </button>

                    {selectedFileName && (
                      <div className="text-xs font-bold text-emerald-800 bg-emerald-50 p-2 border border-emerald-200 inline-block">
                        読み込み完了: {selectedFileName}
                      </div>
                    )}
                  </div>

                  {pastedText && (
                    <div className="space-y-1">
                      <label className="block text-xs font-bold text-[#444444]">
                        読み込んだシート内容プレビュー:
                      </label>
                      <textarea
                        value={pastedText}
                        onChange={(e) => setPastedText(e.target.value)}
                        rows={6}
                        className="w-full bg-white border border-[#D1CEC7] p-2 text-xs font-mono focus:border-[#1A1A1A] focus:outline-none"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* MODE 3: WORD / DOC / PDF */}
              {activeSourceType === 'word_text' && (
                <div className="space-y-4">
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDragging(true);
                    }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDrop}
                    className="border-2 border-dashed border-[#D1CEC7] bg-white p-6 text-center space-y-4"
                  >
                    <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-700 flex items-center justify-center mx-auto border border-blue-200">
                      <FileText className="w-6 h-6" />
                    </div>
                    <div className="space-y-1">
                      <p className="font-bold text-sm text-[#1A1A1A]">
                        Word文書 / PDF / テキスト資料から精霊データを読み込み
                      </p>
                      <p className="text-xs text-[#666666]">
                        .docx, .doc, .pdf, .txt 形式に対応。文章中に書かれた法要案内文や過去帳メモからAIが自動抽出します。
                      </p>
                    </div>

                    <input
                      type="file"
                      accept=".docx,.doc,.pdf,.txt,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf"
                      ref={docInputRef}
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          handleDocFileSelect(e.target.files[0]);
                        }
                      }}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => docInputRef.current?.click()}
                      className="px-4 py-2.5 bg-blue-800 hover:bg-blue-900 text-white text-xs font-bold inline-flex items-center space-x-1.5 shadow-sm cursor-pointer"
                    >
                      <Upload className="w-4 h-4" />
                      <span>Word / PDF / テキストファイルを選択</span>
                    </button>

                    {selectedFileName && (
                      <div className="text-xs font-bold text-blue-800 bg-blue-50 p-2 border border-blue-200 inline-block">
                        選択中: {selectedFileName}
                      </div>
                    )}
                  </div>

                  {pastedText && (
                    <div className="space-y-1">
                      <label className="block text-xs font-bold text-[#444444]">
                        抽出されたテキスト内容プレビュー:
                      </label>
                      <textarea
                        value={pastedText}
                        onChange={(e) => setPastedText(e.target.value)}
                        rows={6}
                        className="w-full bg-white border border-[#D1CEC7] p-2 text-xs font-serif focus:border-[#1A1A1A] focus:outline-none"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* MODE 4: PASTE TEXT */}
              {activeSourceType === 'paste_text' && (
                <div className="space-y-2 bg-white p-4 border border-[#D1CEC7]">
                  <label className="block text-xs font-bold text-[#1A1A1A]">
                    過去帳メモ・OCRテキスト・原稿内容を貼り付けてください:
                  </label>
                  <textarea
                    value={pastedText}
                    onChange={(e) => setPastedText(e.target.value)}
                    placeholder="例:&#10;〇〇院釈光徳居士　俗名 佐藤 徳蔵　令和四年八月十日寂　享年八十八歳（父）&#10;清心妙法大姉　俗名 佐藤 静江　平成二十二年三月三日寂　享年八十二歳（母）"
                    rows={8}
                    className="w-full bg-[#FAF9F5] border border-[#D1CEC7] p-3 text-xs font-serif leading-relaxed focus:border-[#1A1A1A] focus:outline-none"
                  />
                  <p className="text-[11px] text-[#666666]">
                    ※ 形式は問いません。戒名、俗名、没年月日、行年、続柄などの情報をAIが読み取って表形式に変換します。
                  </p>
                </div>
              )}

              {/* Action Bottom Bar */}
              <div className="flex items-center justify-between pt-4 border-t border-[#D1CEC7]">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 bg-[#EBE7DF] hover:bg-[#DDD7CD] text-[#444444] text-xs font-bold cursor-pointer"
                >
                  キャンセル
                </button>

                <button
                  type="button"
                  onClick={handleRunAiAnalysis}
                  disabled={!selectedImageBase64 && !pastedText.trim()}
                  className="px-6 py-2.5 bg-[#1A1A1A] hover:bg-[#333333] disabled:opacity-40 disabled:cursor-not-allowed text-[#D4AF37] border border-[#D4AF37] font-bold text-xs flex items-center space-x-2 shadow-md cursor-pointer transition-all"
                >
                  <Sparkles className="w-4 h-4 text-[#D4AF37]" />
                  <span>AIで精霊データを読み取る（解析開始）</span>
                  <ArrowRight className="w-4 h-4 text-[#D4AF37]" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: ANALYZING SPINNER */}
          {currentStep === 'analyzing' && (
            <div className="py-16 text-center space-y-4">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[#1A1A1A] text-[#D4AF37] border-2 border-[#D4AF37] shadow-xl animate-spin">
                <Sparkles className="w-8 h-8" />
              </div>
              <div className="space-y-1.5">
                <h3 className="font-serif font-black text-base sm:text-lg text-[#1A1A1A]">
                  AIが過去帳・墓碑データを解析中...
                </h3>
                <p className="text-xs text-[#666666] max-w-md mx-auto">
                  写真の刻字、旧字体、戒名・法名、和暦の没年月日、享年・行年、続柄を専門的に識別し構造化しています。少々お待ちください。
                </p>
              </div>
            </div>
          )}

          {/* STEP 3: REVIEW & DIRECT EDITING TABLE */}
          {currentStep === 'review' && (
            <div className="space-y-4">
              {/* Summary Banner */}
              <div className="bg-[#FAF0E6] border-2 border-[#8C2D19]/40 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-start sm:items-center space-x-2.5">
                  <Sparkles className="w-5 h-5 text-[#8C2D19] shrink-0 mt-0.5 sm:mt-0" />
                  <div>
                    <div className="font-bold text-xs text-[#8C2D19]">
                      AI認識結果の確認・校正:
                    </div>
                    <div className="text-xs text-[#444444]">{aiSummary}</div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                  {selectedImageBase64 && (
                    <button
                      type="button"
                      onClick={() => setShowImagePreview(!showImagePreview)}
                      className="px-2.5 py-1 bg-white hover:bg-stone-100 text-[#1A1A1A] border border-[#D1CEC7] text-xs font-bold flex items-center space-x-1 cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5 text-gray-600" />
                      <span>{showImagePreview ? '元画像を隠す' : '元画像を表示'}</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleAddRow}
                    className="px-2.5 py-1 bg-[#1A1A1A] hover:bg-[#333333] text-[#D4AF37] text-xs font-bold flex items-center space-x-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>精霊を1行追加</span>
                  </button>
                </div>
              </div>

              {/* Side-by-side Image Preview (if image exists and toggled) */}
              {selectedImageBase64 && showImagePreview && (
                <div className="bg-[#2D2D2D] p-2 border border-stone-600 flex flex-col sm:flex-row items-center gap-3">
                  <div className="flex items-center gap-2 text-xs text-white font-bold shrink-0">
                    <span>元写真プレビュー</span>
                    <div className="flex items-center space-x-1">
                      <button
                        type="button"
                        onClick={() => setImageZoom((prev) => Math.max(0.6, prev - 0.2))}
                        className="p-1 bg-stone-700 hover:bg-stone-600 rounded text-white cursor-pointer"
                        title="縮小"
                      >
                        <ZoomOut className="w-3.5 h-3.5" />
                      </button>
                      <span className="text-[10px] font-mono w-10 text-center">{Math.round(imageZoom * 100)}%</span>
                      <button
                        type="button"
                        onClick={() => setImageZoom((prev) => Math.min(2.5, prev + 0.2))}
                        className="p-1 bg-stone-700 hover:bg-stone-600 rounded text-white cursor-pointer"
                        title="拡大"
                      >
                        <ZoomIn className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="flex-1 max-h-48 overflow-auto flex items-center justify-center bg-black/40 border border-stone-700 w-full">
                    <img
                      src={selectedImageBase64}
                      alt="Source Gravestone / Record"
                      style={{ transform: `scale(${imageZoom})`, transformOrigin: 'top center' }}
                      className="max-h-44 object-contain transition-transform"
                    />
                  </div>
                </div>
              )}

              {/* Editable Records Table */}
              <div className="bg-white border-2 border-[#1A1A1A] shadow-sm overflow-hidden font-serif">
                <div className="overflow-x-auto max-h-[360px]">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-[#1A1A1A] text-[#D4AF37] font-sans font-bold uppercase tracking-wider sticky top-0 z-10">
                      <tr>
                        <th className="px-2 py-2 text-center w-8">
                          <input
                            type="checkbox"
                            checked={extractedRecords.length > 0 && extractedRecords.every((r) => r.selected)}
                            onChange={handleToggleSelectAll}
                            className="w-3.5 h-3.5 accent-[#D4AF37] cursor-pointer"
                          />
                        </th>
                        <th className="px-3 py-2 min-w-[200px]">戒名・法名 *</th>
                        <th className="px-2 py-2 w-[110px]">俗名</th>
                        <th className="px-2 py-2 w-[90px]">ふりがな</th>
                        <th className="px-2 py-2 w-[130px]">没年月日</th>
                        <th className="px-1 py-2 w-[55px] text-center">享年</th>
                        <th className="px-2 py-2 w-[80px]">続柄</th>
                        <th className="px-2 py-2 w-[100px]">当時の施主</th>
                        <th className="px-2 py-2 w-[90px]">墓地/納骨</th>
                        <th className="px-2 py-2 min-w-[130px]">備考</th>
                        <th className="px-2 py-2 text-center w-10 font-sans">削除</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#EBE7DF]">
                      {extractedRecords.map((item, idx) => {
                        const isDup = item.isDuplicate;
                        return (
                          <tr
                            key={item.id}
                            className={`transition-colors ${
                              !item.selected
                                ? 'bg-gray-100/60 opacity-60'
                                : isDup
                                ? 'bg-amber-50/70 hover:bg-amber-100/60'
                                : 'hover:bg-[#FAF9F5]'
                            }`}
                          >
                            {/* Checkbox */}
                            <td className="px-2 py-2 text-center">
                              <input
                                type="checkbox"
                                checked={item.selected}
                                onChange={(e) => handleUpdateRow(item.id, 'selected', e.target.checked)}
                                className="w-3.5 h-3.5 accent-[#1A1A1A] cursor-pointer"
                              />
                            </td>

                            {/* 戒名 */}
                            <td className="px-2 py-1.5">
                              <input
                                type="text"
                                value={item.dharmaName}
                                onChange={(e) => handleUpdateRow(item.id, 'dharmaName', e.target.value)}
                                placeholder="戒名・法名"
                                className="w-full bg-white border border-[#D1CEC7] focus:border-[#1A1A1A] p-1 font-serif font-bold text-xs"
                              />
                              {isDup && (
                                <div className="text-[10px] text-amber-800 flex items-center gap-0.5 mt-0.5">
                                  <AlertCircle className="w-3 h-3 text-amber-600" />
                                  <span>{item.duplicateReason}</span>
                                </div>
                              )}
                            </td>

                            {/* 俗名 */}
                            <td className="px-2 py-1.5">
                              <input
                                type="text"
                                value={item.secularName}
                                onChange={(e) => handleUpdateRow(item.id, 'secularName', e.target.value)}
                                placeholder="俗名"
                                className="w-full bg-white border border-[#D1CEC7] focus:border-[#1A1A1A] p-1 text-xs"
                              />
                            </td>

                            {/* ふりがな */}
                            <td className="px-2 py-1.5">
                              <input
                                type="text"
                                value={item.furigana}
                                onChange={(e) => handleUpdateRow(item.id, 'furigana', e.target.value)}
                                placeholder="ふりがな"
                                className="w-full bg-white border border-[#D1CEC7] focus:border-[#1A1A1A] p-1 text-xs"
                              />
                            </td>

                            {/* 没年月日 */}
                            <td className="px-2 py-1.5">
                              <input
                                type="text"
                                value={item.deathDate}
                                onChange={(e) => handleUpdateRow(item.id, 'deathDate', e.target.value)}
                                onBlur={() => handleNormalizeRowDate(item.id)}
                                placeholder="例: 令和5年3月15日"
                                className="w-full bg-white border border-[#D1CEC7] focus:border-[#1A1A1A] p-1 font-mono text-xs"
                              />
                            </td>

                            {/* 享年 */}
                            <td className="px-1 py-1.5 text-center">
                              <input
                                type="number"
                                value={item.ageAtDeath || ''}
                                onChange={(e) =>
                                  handleUpdateRow(
                                    item.id,
                                    'ageAtDeath',
                                    e.target.value ? Number(e.target.value) : undefined
                                  )
                                }
                                placeholder="歳"
                                className="w-full bg-white border border-[#D1CEC7] focus:border-[#1A1A1A] p-1 font-mono text-xs text-center"
                              />
                            </td>

                            {/* 続柄 */}
                            <td className="px-2 py-1.5">
                              <input
                                type="text"
                                value={item.relationship}
                                onChange={(e) => handleUpdateRow(item.id, 'relationship', e.target.value)}
                                placeholder="父/母等"
                                className="w-full bg-white border border-[#D1CEC7] focus:border-[#1A1A1A] p-1 text-xs"
                              />
                            </td>

                            {/* 当時の施主名 */}
                            <td className="px-2 py-1.5">
                              <input
                                type="text"
                                value={item.householdHeadName}
                                onChange={(e) => handleUpdateRow(item.id, 'householdHeadName', e.target.value)}
                                placeholder="施主名"
                                className="w-full bg-white border border-[#D1CEC7] focus:border-[#1A1A1A] p-1 text-xs"
                              />
                            </td>

                            {/* 墓地/納骨場所 */}
                            <td className="px-2 py-1.5">
                              <input
                                type="text"
                                value={item.burialLocation}
                                onChange={(e) => handleUpdateRow(item.id, 'burialLocation', e.target.value)}
                                placeholder="墓地番号"
                                className="w-full bg-white border border-[#D1CEC7] focus:border-[#1A1A1A] p-1 text-xs"
                              />
                            </td>

                            {/* 備考 */}
                            <td className="px-2 py-1.5">
                              <input
                                type="text"
                                value={item.notes}
                                onChange={(e) => handleUpdateRow(item.id, 'notes', e.target.value)}
                                placeholder="特記・経歴等"
                                className="w-full bg-white border border-[#D1CEC7] focus:border-[#1A1A1A] p-1 text-xs"
                              />
                            </td>

                            {/* 削除 */}
                            <td className="px-2 py-1.5 text-center">
                              <button
                                type="button"
                                onClick={() => handleDeleteRow(item.id)}
                                className="text-gray-400 hover:text-red-600 p-1 cursor-pointer transition-colors"
                                title="この行を削除"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Duplicate Handling Options */}
              {extractedRecords.some((r) => r.isDuplicate) && (
                <div className="bg-amber-50 border border-amber-300 p-3 text-xs space-y-2">
                  <div className="font-bold text-amber-900 flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4 text-amber-600" />
                    <span>既存の過去帳と重複の可能性がある精霊が検出されました</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-4 text-[#444444]">
                    <label className="flex items-center space-x-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="dupMode"
                        value="allow"
                        checked={duplicateMode === 'allow'}
                        onChange={() => setDuplicateMode('allow')}
                        className="accent-[#1A1A1A]"
                      />
                      <span className="font-bold">新規精霊としてそのまま登録（推奨）</span>
                    </label>
                    <label className="flex items-center space-x-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="dupMode"
                        value="skip"
                        checked={duplicateMode === 'skip'}
                        onChange={() => setDuplicateMode('skip')}
                        className="accent-[#1A1A1A]"
                      />
                      <span>重複した精霊はスキップ（取り込まない）</span>
                    </label>
                  </div>
                </div>
              )}

              {/* Review Bottom Action Bar */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-[#D1CEC7]">
                <button
                  type="button"
                  onClick={() => setCurrentStep('input')}
                  className="px-4 py-2 bg-[#EBE7DF] hover:bg-[#DDD7CD] text-[#444444] text-xs font-bold flex items-center space-x-1 cursor-pointer self-start sm:self-auto"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>入力に戻る</span>
                </button>

                <div className="flex items-center gap-3 self-end sm:self-auto">
                  <div className="text-xs font-bold text-[#1A1A1A]">
                    選択中: <strong className="text-[#8C2D19]">{extractedRecords.filter((r) => r.selected).length}</strong> / {extractedRecords.length} 霊
                  </div>

                  <button
                    type="button"
                    onClick={handleExecuteImport}
                    disabled={extractedRecords.filter((r) => r.selected).length === 0}
                    className="px-6 py-2.5 bg-[#1A1A1A] hover:bg-[#333333] disabled:opacity-40 disabled:cursor-not-allowed text-[#D4AF37] border border-[#D4AF37] font-bold text-xs flex items-center space-x-2 shadow-md cursor-pointer transition-all"
                  >
                    <CheckCircle2 className="w-4 h-4 text-[#D4AF37]" />
                    <span>【{householdName} 様】に登録実行</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: COMPLETE */}
          {currentStep === 'complete' && (
            <div className="py-12 text-center space-y-5 bg-white border border-[#D1CEC7] p-6 shadow-sm">
              <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto border-2 border-emerald-500 shadow-md">
                <Check className="w-8 h-8" />
              </div>
              <div className="space-y-2">
                <h3 className="font-serif font-black text-lg sm:text-xl text-[#1A1A1A]">
                  過去帳・精霊データの取り込みが完了しました
                </h3>
                <p className="text-xs text-[#666666] max-w-md mx-auto">
                  【{householdName} 様】に <strong className="text-[#1A1A1A] text-sm">{importedCount} 霊</strong> の精霊（過去帳データ）を正常に登録しました。
                  年忌回忌や新盆の自動計算、法要・塔婆予約受付にも即時連動します。
                </p>
              </div>

              <div className="pt-4 flex justify-center">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-8 py-3 bg-[#1A1A1A] hover:bg-[#333333] text-[#D4AF37] border border-[#D4AF37] font-bold text-sm shadow-md cursor-pointer"
                >
                  完了して閉じる
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
