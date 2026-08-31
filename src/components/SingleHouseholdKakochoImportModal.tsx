import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  Upload, 
  FileSpreadsheet, 
  FileText, 
  CheckCircle2, 
  AlertCircle, 
  X, 
  Plus, 
  Trash2, 
  ArrowRight, 
  ArrowLeft, 
  Check, 
  Info,
  ChevronRight,
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

export interface SingleHouseholdKakochoImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetHousehold: Household | null;
  existingPastRecords?: PastRecord[];
  templeInfo?: TempleInfo;
  temples?: TempleProfile[];
  onImportPastRecords: (records: PastRecord[], description?: string) => void;
}

export type InputSourceType = 'word_text' | 'excel' | 'paste_text';

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

/**
 * Local fast client-side text/table parser (0 API tokens, 100% offline-capable)
 */
function parseTextToKakochoItems(
  text: string, 
  household: Household, 
  existingRecords: PastRecord[]
): ExtractedKakochoItem[] {
  if (!text || !text.trim()) return [];

  const rawLines = text
    .split(/\r\n|\r|\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (rawLines.length === 0) return [];

  const items: ExtractedKakochoItem[] = [];

  // Check if first row is a header in CSV/TSV
  const isCsvOrTsv = text.includes('\t') || (text.includes(',') && rawLines.some(l => (l.match(/,/g) || []).length >= 2));

  if (isCsvOrTsv) {
    // Parse using simple CSV/TSV parser
    const rows = rawLines.map(line => {
      if (line.includes('\t')) return line.split('\t').map(c => c.trim().replace(/^["']|["']$/g, ''));
      // Basic CSV split
      return line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(c => c.trim().replace(/^["']|["']$/g, ''));
    });

    let headerMap: { [key: string]: number } = {};
    let startIdx = 0;
    const firstRow = rows[0].map(c => c.toLowerCase());

    const hasHeader = firstRow.some(c => 
      c.includes('戒名') || c.includes('法名') || c.includes('法号') || 
      c.includes('俗名') || c.includes('氏名') || c.includes('名前') || 
      c.includes('命日') || c.includes('没') || c.includes('死亡') || 
      c.includes('享年') || c.includes('行年') || c.includes('歳') || 
      c.includes('続柄') || c.includes('関係')
    );

    if (hasHeader) {
      firstRow.forEach((col, idx) => {
        if (col.includes('戒名') || col.includes('法名') || col.includes('法号')) headerMap.dharma = idx;
        else if (col.includes('俗名') || col.includes('氏名') || col.includes('名前')) headerMap.secular = idx;
        else if (col.includes('ふりがな') || col.includes('フリガナ') || col.includes('よみ')) headerMap.furigana = idx;
        else if (col.includes('命日') || col.includes('没') || col.includes('死亡')) headerMap.death = idx;
        else if (col.includes('享年') || col.includes('行年') || col.includes('年齢') || col.includes('歳')) headerMap.age = idx;
        else if (col.includes('続柄') || col.includes('関係')) headerMap.rel = idx;
        else if (col.includes('施主') || col.includes('世帯主')) headerMap.head = idx;
        else if (col.includes('墓地') || col.includes('納骨') || col.includes('区画')) headerMap.burial = idx;
        else if (col.includes('備考') || col.includes('特記') || col.includes('メモ')) headerMap.notes = idx;
      });
      startIdx = 1;
    }

    for (let i = startIdx; i < rows.length; i++) {
      const row = rows[i];
      if (row.length === 0 || row.every(c => !c)) continue;

      let dharma = '';
      let secular = '';
      let furigana = '';
      let deathDate = '';
      let ageStr = '';
      let rel = '';
      let head = household.familyHead || '';
      let burial = household.tombNumber || '';
      let notes = '';

      if (hasHeader) {
        if (headerMap.dharma !== undefined) dharma = row[headerMap.dharma] || '';
        if (headerMap.secular !== undefined) secular = row[headerMap.secular] || '';
        if (headerMap.furigana !== undefined) furigana = row[headerMap.furigana] || '';
        if (headerMap.death !== undefined) deathDate = row[headerMap.death] || '';
        if (headerMap.age !== undefined) ageStr = row[headerMap.age] || '';
        if (headerMap.rel !== undefined) rel = row[headerMap.rel] || '';
        if (headerMap.head !== undefined) head = row[headerMap.head] || head;
        if (headerMap.burial !== undefined) burial = row[headerMap.burial] || burial;
        if (headerMap.notes !== undefined) notes = row[headerMap.notes] || '';
      } else {
        // Positional fallback: 0=戒名, 1=俗名, 2=命日, 3=享年, 4=続柄, 5=備考
        dharma = row[0] || '';
        secular = row[1] || '';
        deathDate = row[2] || '';
        ageStr = row[3] || '';
        rel = row[4] || '';
        notes = row[5] || '';
      }

      if (!dharma && !secular) continue;

      const ageNum = parseInt(ageStr.replace(/[^0-9]/g, ''), 10);
      const normalizedDeath = normalizeDateInput(deathDate, { mode: 'pastRecord' });
      const displayDeath = normalizedDeath ? formatJapaneseEraDate(normalizedDeath, false) : deathDate;

      items.push({
        id: `extracted-${Date.now()}-${i}`,
        selected: true,
        dharmaName: dharma.trim(),
        secularName: secular.trim(),
        furigana: furigana.trim(),
        deathDate: displayDeath.trim(),
        ageAtDeath: !isNaN(ageNum) && ageNum > 0 ? ageNum : undefined,
        relationship: rel.trim(),
        householdHeadName: head.trim(),
        burialLocation: burial.trim(),
        notes: notes.trim(),
      });
    }
  }

  // If not parsed as CSV or very few items, parse free-form lines
  if (items.length === 0) {
    rawLines.forEach((line, idx) => {
      // Ignore comments or titles
      if (line.startsWith('#') || line.startsWith('//') || line.startsWith('【')) return;

      let remaining = line;

      // Extract age (e.g. 享年88歳, 行年82, 享年八十八歳)
      let ageNum: number | undefined = undefined;
      const ageMatch = remaining.match(/(?:享年|行年|満)?\s*([0-9０-９一二三四五六七八九十百]+)\s*歳?/);
      if (ageMatch) {
        const rawAge = ageMatch[1]
          .replace(/[０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xfee0))
          .replace(/一/g, '1').replace(/二/g, '2').replace(/三/g, '3').replace(/四/g, '4')
          .replace(/五/g, '5').replace(/六/g, '6').replace(/七/g, '7').replace(/八/g, '8').replace(/九/g, '9');
        const parsed = parseInt(rawAge, 10);
        if (!isNaN(parsed) && parsed > 0 && parsed < 130) {
          ageNum = parsed;
        }
        remaining = remaining.replace(ageMatch[0], ' ');
      }

      // Extract date (e.g. 令和5年3月15日, 2023-03-15, H22.3.3)
      let deathStr = '';
      const dateMatch = remaining.match(/((?:令和|平成|昭和|大正|明治|R|H|S|T|M|\d{4})[年/\-.\s]?[0-9０-９一二三四五六七八九十百]+[月/\-.\s]?[0-9０-９一二三四五六七八九十百]+日?(?:寂|没)?|\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})/);
      if (dateMatch) {
        deathStr = dateMatch[0].replace(/[寂没]$/, '').trim();
        remaining = remaining.replace(dateMatch[0], ' ');
      }

      // Extract relationship in parentheses or keywords
      let relStr = '';
      const relMatch = remaining.match(/[（(]([^）)]+)[）)]/);
      if (relMatch) {
        relStr = relMatch[1].trim();
        remaining = remaining.replace(relMatch[0], ' ');
      } else {
        const relWordMatch = remaining.match(/(父|母|祖父|祖母|夫|妻|長男|長女|二男|次男|二女|次女|三男|三女|子供|兄|弟|姉|妹|本人|伯父|叔父|伯母|叔母)/);
        if (relWordMatch) {
          relStr = relWordMatch[0];
          remaining = remaining.replace(relWordMatch[0], ' ');
        }
      }

      // Extract secular name (俗名 〇〇 or 氏名 〇〇)
      let secularStr = '';
      const secularMatch = remaining.match(/(?:俗名|氏名|本名|名)[\s:：]*([^\s,，、]+(?:\s+[^\s,，、]+)?)/);
      if (secularMatch) {
        secularStr = secularMatch[1].trim();
        remaining = remaining.replace(secularMatch[0], ' ');
      }

      // Extract tokens
      const tokens = remaining
        .split(/[\s,，、|\t]+/)
        .map(t => t.trim())
        .filter(t => t.length > 0);

      let dharmaStr = '';
      let notesStr = '';

      if (tokens.length > 0) {
        dharmaStr = tokens[0];
        if (tokens.length > 1 && !secularStr) {
          secularStr = tokens[1];
          notesStr = tokens.slice(2).join(' ');
        } else if (tokens.length > 1) {
          notesStr = tokens.slice(1).join(' ');
        }
      }

      if (!dharmaStr && !secularStr) return;

      const normalizedDeath = normalizeDateInput(deathStr, { mode: 'pastRecord' });
      const displayDeath = normalizedDeath ? formatJapaneseEraDate(normalizedDeath, false) : deathStr;

      items.push({
        id: `extracted-${Date.now()}-${idx}`,
        selected: true,
        dharmaName: dharmaStr.trim(),
        secularName: secularStr.trim(),
        furigana: '',
        deathDate: displayDeath.trim(),
        ageAtDeath: ageNum,
        relationship: relStr.trim(),
        householdHeadName: household.familyHead || '',
        burialLocation: household.tombNumber || '',
        notes: notesStr.trim(),
      });
    });
  }

  // Duplicate detection against existing records of this household
  return items.map((item) => {
    let isDup = false;
    let dupReason = '';
    const existingMatch = existingRecords.find((ex) => {
      if (item.dharmaName && ex.dharmaName && ex.dharmaName === item.dharmaName) return true;
      if (item.secularName && ex.secularName && ex.secularName === item.secularName) return true;
      return false;
    });

    if (existingMatch) {
      isDup = true;
      dupReason = `既存登録（${existingMatch.dharmaName || existingMatch.secularName}）と同名`;
    }

    return {
      ...item,
      isDuplicate: isDup,
      duplicateReason: dupReason,
    };
  });
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
  // Wizard steps: 'input' -> 'review' -> 'complete'
  const [currentStep, setCurrentStep] = useState<'input' | 'review' | 'complete'>('input');
  const [activeSourceType, setActiveSourceType] = useState<InputSourceType>('word_text');

  // Input Data States
  const [selectedFileName, setSelectedFileName] = useState<string>('');
  const [pastedText, setPastedText] = useState<string>('');

  // File input refs
  const excelInputRef = useRef<HTMLInputElement | null>(null);
  const docInputRef = useRef<HTMLInputElement | null>(null);

  // Drag-and-drop state
  const [isDragging, setIsDragging] = useState(false);

  // Analysis Result States
  const [parseSummary, setParseSummary] = useState<string>('');
  const [extractedRecords, setExtractedRecords] = useState<ExtractedKakochoItem[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [importedCount, setImportedCount] = useState<number>(0);

  // Duplicate handling option
  const [duplicateMode, setDuplicateMode] = useState<'allow' | 'update' | 'skip'>('allow');

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

  useEffect(() => {
    if (!isOpen) {
      // Reset state when closed
      setCurrentStep('input');
      setSelectedFileName('');
      setPastedText('');
      setParseSummary('');
      setExtractedRecords([]);
      setErrorMessage(null);
      setImportedCount(0);
    }
  }, [isOpen]);

  // Handle Excel/CSV File
  const handleExcelFileSelect = async (file: File) => {
    if (!file) return;
    setSelectedFileName(file.name);
    setErrorMessage(null);
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const csvData = XLSX.utils.sheet_to_csv(sheet);
      setPastedText(csvData);
    } catch (err: any) {
      console.error('Excel read error:', err);
      setErrorMessage('Excel/CSVファイルの読み込みに失敗しました。ファイル形式をご確認ください。');
    }
  };

  // Extract plain text from docx xml strings
  const extractTextFromDocxBuffer = (arrayBuffer: ArrayBuffer): string => {
    try {
      const bytes = new Uint8Array(arrayBuffer);
      const decoder = new TextDecoder('utf-8', { fatal: false });
      const rawText = decoder.decode(bytes);
      
      const matches = rawText.match(/<w:t[^>]*>([^<]+)<\/w:t>/g);
      if (matches && matches.length > 0) {
        return matches
          .map((m) => m.replace(/<[^>]+>/g, ''))
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();
      }
      const cleaned = rawText
        .replace(/<[^>]+>/g, ' ')
        .replace(/[^\x20-\x7E\u3000-\u30FF\u4E00-\u9FFF\n\r\t]/g, ' ')
        .replace(/\s{2,}/g, '\n')
        .trim();
      return cleaned;
    } catch {
      return '';
    }
  };

  // Handle Word/Docx/Text File
  const handleDocFileSelect = async (file: File) => {
    if (!file) return;
    setSelectedFileName(file.name);
    setErrorMessage(null);

    try {
      if (file.name.endsWith('.txt') || file.type === 'text/plain') {
        const text = await file.text();
        setPastedText(text);
      } else if (file.name.endsWith('.docx') || file.type.includes('wordprocessingml')) {
        const arrayBuffer = await file.arrayBuffer();
        const extracted = extractTextFromDocxBuffer(arrayBuffer);
        if (extracted && extracted.length > 10) {
          setPastedText(extracted);
        } else {
          setPastedText(`【Wordファイル: ${file.name}】\n※ 内容をコピーして下のテキスト欄に貼り付けていただくことも可能です。`);
        }
      } else {
        const text = await file.text().catch(() => '');
        setPastedText(text || `【読み込みファイル: ${file.name}】`);
      }
    } catch (err: any) {
      console.error('Doc file read error:', err);
      setErrorMessage('文書ファイルの読み込みに失敗しました。テキストを直接貼り付けてお試しください。');
    }
  };

  // Drag & Drop handler
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls') || file.name.endsWith('.csv')) {
        setActiveSourceType('excel');
        handleExcelFileSelect(file);
      } else {
        setActiveSourceType('word_text');
        handleDocFileSelect(file);
      }
    }
  };

  // Run 100% Local Fast Parsing (Zero API tokens, pure client-side)
  const handleParseAndReview = () => {
    if (!targetHousehold) return;

    if (!pastedText.trim()) {
      setErrorMessage('取り込むテキストデータ（Word・Excel・CSV・メモ帳内容）を入力または選択してください。');
      return;
    }

    setErrorMessage(null);

    const parsed = parseTextToKakochoItems(
      pastedText.trim(),
      targetHousehold,
      currentHouseholdExistingRecords
    );

    if (parsed.length === 0) {
      // If parsing couldn't find items, provide one blank row for manual entry
      parsed.push({
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
      setParseSummary('テキストから該当する精霊が見つかりませんでした。手動で行を追加・入力してください。');
    } else {
      setParseSummary(`${parsed.length} 霊の精霊データを読み取り・展開しました。内容を確認・調整してください。`);
    }

    setExtractedRecords(parsed);
    setCurrentStep('review');
  };

  // Manual Review Entry Mode
  const handleProceedToManualReview = () => {
    if (!targetHousehold) return;
    setErrorMessage(null);
    setParseSummary('手動入力モード（行を追加して精霊情報を直接ご入力ください）');
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
      setErrorMessage('取り込み対象の精霊がありません（重複スキップ設定等をご確認ください）。');
      return;
    }

    onImportPastRecords(
      newPastRecords,
      `【${householdName} 様】過去帳取り込み（${newPastRecords.length}霊追加）`
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
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-serif font-black text-base sm:text-lg tracking-wide text-[#D4AF37] flex items-center gap-2">
                <span>【{householdName} 様】過去帳・精霊（戒名）データ取り込み</span>
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
              <span>入力ソース選択・ファイル読込</span>
            </div>
            <ChevronRight className="w-4 h-4 text-[#888888]" />

            <div
              className={`flex items-center space-x-1.5 px-3 py-1 ${
                currentStep === 'review' || currentStep === 'complete'
                  ? 'bg-[#1A1A1A] text-[#D4AF37]'
                  : 'text-[#888888]'
              }`}
            >
              <span className="w-4 h-4 rounded-full bg-stone-300 text-[#1A1A1A] text-[10px] flex items-center justify-center font-bold">
                2
              </span>
              <span>データ確認・校正・直接編集</span>
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
            ※ Word・Excel・CSV・メモ帳等のテキストから戒名・俗名・没年月日・行年を一括展開
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
          {/* STEP 1: INPUT SOURCE SELECTION & UPLOAD */}
          {currentStep === 'input' && (
            <div className="space-y-4">
              {/* Source Tab Selector */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setActiveSourceType('word_text')}
                  className={`p-3 text-left border-2 transition-all flex flex-col items-start gap-1 cursor-pointer ${
                    activeSourceType === 'word_text'
                      ? 'border-[#1A1A1A] bg-white shadow-md'
                      : 'border-[#D1CEC7] bg-[#EFECE6] hover:bg-white text-[#666666]'
                  }`}
                >
                  <div className="flex items-center space-x-2">
                    <FileText className={`w-5 h-5 ${activeSourceType === 'word_text' ? 'text-blue-600' : 'text-gray-500'}`} />
                    <span className="font-bold text-xs">📄 Word / テキスト文書</span>
                  </div>
                  <span className="text-[10px] text-[#888888]">
                    .docx, .doc, .txt
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveSourceType('excel')}
                  className={`p-3 text-left border-2 transition-all flex flex-col items-start gap-1 cursor-pointer ${
                    activeSourceType === 'excel'
                      ? 'border-[#1A1A1A] bg-white shadow-md'
                      : 'border-[#D1CEC7] bg-[#EFECE6] hover:bg-white text-[#666666]'
                  }`}
                >
                  <div className="flex items-center space-x-2">
                    <FileSpreadsheet className={`w-5 h-5 ${activeSourceType === 'excel' ? 'text-emerald-600' : 'text-gray-500'}`} />
                    <span className="font-bold text-xs">📊 Excel / CSV ファイル</span>
                  </div>
                  <span className="text-[10px] text-[#888888]">
                    .xlsx, .xls, .csv
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveSourceType('paste_text')}
                  className={`p-3 text-left border-2 transition-all flex flex-col items-start gap-1 cursor-pointer ${
                    activeSourceType === 'paste_text'
                      ? 'border-[#1A1A1A] bg-white shadow-md'
                      : 'border-[#D1CEC7] bg-[#EFECE6] hover:bg-white text-[#666666]'
                  }`}
                >
                  <div className="flex items-center space-x-2">
                    <Edit2 className={`w-5 h-5 ${activeSourceType === 'paste_text' ? 'text-amber-600' : 'text-gray-500'}`} />
                    <span className="font-bold text-xs">✍️ メモ帳・テキスト貼付</span>
                  </div>
                  <span className="text-[10px] text-[#888888]">
                    メモ・メール・原稿直接貼り付け
                  </span>
                </button>
              </div>

              {/* MODE 1: WORD / TEXT FILE */}
              {activeSourceType === 'word_text' && (
                <div className="space-y-4">
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDragging(true);
                    }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDrop}
                    className={`border-2 border-dashed bg-white p-6 text-center space-y-4 transition-all ${
                      isDragging ? 'border-blue-500 bg-blue-50/30' : 'border-[#D1CEC7]'
                    }`}
                  >
                    <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-700 flex items-center justify-center mx-auto border border-blue-200">
                      <FileText className="w-6 h-6" />
                    </div>
                    <div className="space-y-1">
                      <p className="font-bold text-sm text-[#1A1A1A]">
                        Word文書 (.docx / .doc) または テキストファイル (.txt) を選択
                      </p>
                      <p className="text-xs text-[#666666]">
                        過去帳メモや物故者リストの文書ファイルを選択またはドラッグ＆ドロップしてください。
                      </p>
                    </div>

                    <input
                      type="file"
                      accept=".docx,.doc,.txt,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword"
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
                      className="px-5 py-2.5 bg-blue-800 hover:bg-blue-900 text-white text-xs font-bold inline-flex items-center space-x-1.5 shadow-sm cursor-pointer"
                    >
                      <Upload className="w-4 h-4" />
                      <span>Word / テキスト文書ファイルを選択</span>
                    </button>

                    {selectedFileName && (
                      <div className="flex items-center justify-center gap-2 text-xs font-bold text-blue-800 bg-blue-50 p-2 border border-blue-200">
                        <span>読み込みファイル: {selectedFileName}</span>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedFileName('');
                            setPastedText('');
                          }}
                          className="text-red-600 hover:text-red-800 font-bold ml-2 underline cursor-pointer"
                        >
                          クリア
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs font-bold text-[#444444]">
                      <label>取り込みテキスト内容（直接編集・追記可能）:</label>
                      {pastedText && (
                        <button
                          type="button"
                          onClick={() => setPastedText('')}
                          className="text-gray-500 hover:text-red-600 font-normal underline cursor-pointer"
                        >
                          テキストをクリア
                        </button>
                      )}
                    </div>
                    <textarea
                      value={pastedText}
                      onChange={(e) => setPastedText(e.target.value)}
                      placeholder="ここにWordやテキストファイルの内容が表示されます。手動での直接入力やコピー＆ペーストも可能です。"
                      rows={7}
                      className="w-full bg-white border border-[#D1CEC7] p-3 text-xs font-serif leading-relaxed focus:border-[#1A1A1A] focus:outline-none"
                    />
                  </div>
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
                    className={`border-2 border-dashed bg-white p-6 text-center space-y-4 transition-all ${
                      isDragging ? 'border-emerald-500 bg-emerald-50/30' : 'border-[#D1CEC7]'
                    }`}
                  >
                    <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center mx-auto border border-emerald-200">
                      <FileSpreadsheet className="w-6 h-6" />
                    </div>
                    <div className="space-y-1">
                      <p className="font-bold text-sm text-[#1A1A1A]">
                        Excel / CSVファイル（.xlsx, .xls, .csv）を選択
                      </p>
                      <p className="text-xs text-[#666666]">
                        戒名・俗名・命日・享年などが含まれるエクセル表を選択またはドラッグ＆ドロップしてください。
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
                      className="px-5 py-2.5 bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-bold inline-flex items-center space-x-1.5 shadow-sm cursor-pointer"
                    >
                      <Upload className="w-4 h-4" />
                      <span>Excel / CSV ファイルを選択</span>
                    </button>

                    {selectedFileName && (
                      <div className="flex items-center justify-center gap-2 text-xs font-bold text-emerald-800 bg-emerald-50 p-2 border border-emerald-200">
                        <span>読み込みファイル: {selectedFileName}</span>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedFileName('');
                            setPastedText('');
                          }}
                          className="text-red-600 hover:text-red-800 font-bold ml-2 underline cursor-pointer"
                        >
                          クリア
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs font-bold text-[#444444]">
                      <label>読み込んだシート内容プレビュー（CSV形式）:</label>
                      {pastedText && (
                        <button
                          type="button"
                          onClick={() => setPastedText('')}
                          className="text-gray-500 hover:text-red-600 font-normal underline cursor-pointer"
                        >
                          テキストをクリア
                        </button>
                      )}
                    </div>
                    <textarea
                      value={pastedText}
                      onChange={(e) => setPastedText(e.target.value)}
                      placeholder="Excel/CSVを選択すると、ここに表データが展開されます。"
                      rows={7}
                      className="w-full bg-white border border-[#D1CEC7] p-2 text-xs font-mono focus:border-[#1A1A1A] focus:outline-none"
                    />
                  </div>
                </div>
              )}

              {/* MODE 3: PASTE TEXT */}
              {activeSourceType === 'paste_text' && (
                <div className="space-y-3 bg-white p-4 border border-[#D1CEC7]">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-bold text-[#1A1A1A]">
                      メモ帳・テキスト内容を貼り付けてください:
                    </label>
                    {pastedText && (
                      <button
                        type="button"
                        onClick={() => setPastedText('')}
                        className="text-xs text-gray-500 hover:text-red-600 underline cursor-pointer"
                      >
                        クリア
                      </button>
                    )}
                  </div>
                  <textarea
                    value={pastedText}
                    onChange={(e) => setPastedText(e.target.value)}
                    placeholder="例:&#10;〇〇院釈光徳居士　俗名 佐藤 徳蔵　令和四年八月十日寂　享年八十八歳（父）&#10;清心妙法大姉　俗名 佐藤 静江　平成二十二年三月三日寂　享年八十二歳（母）&#10;&#10;※ カンマ区切り、タブ区切り、スペース区切り、改行のみの箇条書き等、自由な形式で貼り付け可能です。"
                    rows={9}
                    className="w-full bg-[#FAF9F5] border border-[#D1CEC7] p-3 text-xs font-serif leading-relaxed focus:border-[#1A1A1A] focus:outline-none"
                  />
                  <div className="bg-amber-50 p-2 border border-amber-200 text-[11px] text-amber-800 flex items-start gap-1.5">
                    <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <span>
                      戒名、俗名、没年月日（和暦・西暦）、享年、続柄などの記載を即座に表形式に整理して展開します。
                    </span>
                  </div>
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

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleProceedToManualReview}
                    className="px-3.5 py-2 bg-white hover:bg-stone-100 text-[#1A1A1A] border border-stone-300 font-bold text-xs cursor-pointer"
                  >
                    手動で表に入力する
                  </button>
                  <button
                    type="button"
                    onClick={handleParseAndReview}
                    disabled={!pastedText.trim()}
                    className="px-6 py-2.5 bg-[#1A1A1A] hover:bg-[#333333] disabled:opacity-40 disabled:cursor-not-allowed text-[#D4AF37] border border-[#D4AF37] font-bold text-xs flex items-center space-x-2 shadow-md cursor-pointer transition-all"
                  >
                    <FileText className="w-4 h-4 text-[#D4AF37]" />
                    <span>テキストから精霊データを展開・確認</span>
                    <ArrowRight className="w-4 h-4 text-[#D4AF37]" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: REVIEW & DIRECT EDITING TABLE */}
          {currentStep === 'review' && (
            <div className="space-y-4">
              {/* Summary Banner */}
              <div className="bg-[#FAF0E6] border-2 border-[#8C2D19]/40 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-start sm:items-center space-x-2.5">
                  <FileText className="w-5 h-5 text-[#8C2D19] shrink-0 mt-0.5 sm:mt-0" />
                  <div>
                    <div className="font-bold text-xs text-[#8C2D19]">
                      読み込みデータの確認・校正:
                    </div>
                    <div className="text-xs text-[#444444]">{parseSummary}</div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleAddRow}
                  className="px-3 py-1.5 bg-[#1A1A1A] hover:bg-[#333333] text-[#D4AF37] text-xs font-bold flex items-center space-x-1 cursor-pointer shrink-0 self-end sm:self-auto shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>精霊を1行追加</span>
                </button>
              </div>

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
                      {extractedRecords.map((item) => {
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

          {/* STEP 3: COMPLETE */}
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
