import React, { useState, useEffect, useMemo } from 'react';
import { 
  FileText, 
  Copy, 
  Check, 
  CheckCircle2, 
  AlertCircle, 
  X, 
  Plus, 
  Trash2, 
  ArrowRight, 
  ArrowLeft, 
  Sparkles,
  ClipboardPaste,
  ChevronDown,
  ChevronUp,
  HelpCircle
} from 'lucide-react';
import { Household, PastRecord, TempleInfo, TempleProfile } from '../../types';
import { 
  normalizeDateInput, 
  formatJapaneseEraDate, 
  calculateNiibonFromDeathDate, 
  getHouseholdSponsorName 
} from '../../utils/memorialCalculator';

export interface MobileKakochoTextImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetHousehold: Household | null;
  existingPastRecords?: PastRecord[];
  templeInfo?: TempleInfo;
  temples?: TempleProfile[];
  onImportPastRecords: (records: PastRecord[], description?: string) => void;
}

export interface MobileExtractedKakochoItem {
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
  isExpanded?: boolean;
}

/**
 * Client-side parser for mobile text paste (0 tokens, 100% offline)
 */
function parseMobileTextToItems(
  text: string, 
  household: Household, 
  existingRecords: PastRecord[]
): MobileExtractedKakochoItem[] {
  if (!text || !text.trim()) return [];

  const rawLines = text
    .split(/\r\n|\r|\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#') && !l.startsWith('//') && !l.startsWith('【'));

  if (rawLines.length === 0) return [];

  const items: MobileExtractedKakochoItem[] = [];

  // Check CSV or TSV
  const isCsvOrTsv = text.includes('\t') || (text.includes(',') && rawLines.some(l => (l.match(/,/g) || []).length >= 2));

  if (isCsvOrTsv) {
    const rows = rawLines.map(line => {
      if (line.includes('\t')) return line.split('\t').map(c => c.trim().replace(/^["']|["']$/g, ''));
      return line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(c => c.trim().replace(/^["']|["']$/g, ''));
    });

    const headerMap: { [key: string]: number } = {};
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
        id: `mob-kakocho-${Date.now()}-${i}`,
        selected: true,
        dharmaName: dharma.trim(),
        secularName: secular.trim(),
        furigana: furigana.trim(),
        deathDate: (displayDeath || '').trim(),
        ageAtDeath: !isNaN(ageNum) && ageNum > 0 ? ageNum : undefined,
        relationship: rel.trim(),
        householdHeadName: head.trim(),
        burialLocation: burial.trim(),
        notes: notes.trim(),
        isExpanded: true,
      });
    }
  }

  // If no CSV items parsed, parse free-form lines
  if (items.length === 0) {
    rawLines.forEach((line, idx) => {
      let remaining = line;

      // Extract age
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

      // Extract date
      let deathStr = '';
      const dateMatch = remaining.match(/((?:令和|平成|昭和|大正|明治|R|H|S|T|M|\d{4})[年/\-.\s]?[0-9０-９一二三四五六七八九十百]+[月/\-.\s]?[0-9０-９一二三四五六七八九十百]+日?(?:寂|没)?|\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})/);
      if (dateMatch) {
        deathStr = dateMatch[0].replace(/[寂没]$/, '').trim();
        remaining = remaining.replace(dateMatch[0], ' ');
      }

      // Extract relationship
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

      // Extract secular name
      let secularStr = '';
      const secularMatch = remaining.match(/(?:俗名|氏名|本名|名)[\s:：]*([^\s,，、]+(?:\s+[^\s,，、]+)?)/);
      if (secularMatch) {
        secularStr = secularMatch[1].trim();
        remaining = remaining.replace(secularMatch[0], ' ');
      }

      // Remaining tokens
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

      const normalizedDeath = normalizeDateInput(deathStr || '', { mode: 'pastRecord' });
      const displayDeath = normalizedDeath ? formatJapaneseEraDate(normalizedDeath, false) : deathStr;

      items.push({
        id: `mob-kakocho-${Date.now()}-${idx}`,
        selected: true,
        dharmaName: dharmaStr.trim(),
        secularName: secularStr.trim(),
        furigana: '',
        deathDate: (displayDeath || '').trim(),
        ageAtDeath: ageNum,
        relationship: relStr.trim(),
        householdHeadName: household.familyHead || '',
        burialLocation: household.tombNumber || '',
        notes: notesStr.trim(),
        isExpanded: true,
      });
    });
  }

  // Duplicate detection
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
      dupReason = `既存（${existingMatch.dharmaName || existingMatch.secularName}）と同名`;
    }

    return {
      ...item,
      isDuplicate: isDup,
      duplicateReason: dupReason,
    };
  });
}

export const MobileKakochoTextImportModal: React.FC<MobileKakochoTextImportModalProps> = ({
  isOpen,
  onClose,
  targetHousehold,
  existingPastRecords = [],
  templeInfo,
  temples = [],
  onImportPastRecords,
}) => {
  const [currentStep, setCurrentStep] = useState<'input' | 'review' | 'complete'>('input');
  const [pastedText, setPastedText] = useState<string>('');
  const [copiedPrompt, setCopiedPrompt] = useState<boolean>(false);
  const [showPromptHelp, setShowPromptHelp] = useState<boolean>(false);

  // Records state
  const [extractedRecords, setExtractedRecords] = useState<MobileExtractedKakochoItem[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [importedCount, setImportedCount] = useState<number>(0);

  // Household display info
  const householdName = targetHousehold
    ? getHouseholdSponsorName(targetHousehold) || targetHousehold.familyHead || `世帯 ID: ${targetHousehold.id}`
    : '檀家世帯';

  const householdTomb = targetHousehold?.tombNumber || '';
  const currentHouseholdExistingRecords = useMemo(() => {
    if (!targetHousehold) return [];
    return existingPastRecords.filter((p) => p.householdId === targetHousehold.id);
  }, [existingPastRecords, targetHousehold]);

  useEffect(() => {
    if (!isOpen) {
      setCurrentStep('input');
      setPastedText('');
      setCopiedPrompt(false);
      setShowPromptHelp(false);
      setExtractedRecords([]);
      setErrorMessage(null);
      setImportedCount(0);
    }
  }, [isOpen]);

  // Generate Optimal AI Prompt for External AI Camera / Image recognition
  const generateAiPromptText = () => {
    return `【寺院過去帳・墓碑OCR文字起こし依頼】
添付の写真（墓碑・墓誌・霊標・位牌・過去帳原本・メモ等）から、記載されている精霊（故人）の情報を読み取り、以下の【出力フォーマット】に従って1霊につき1行のテキストで出力してください。

【対象世帯情報】
・施主/世帯主名: ${householdName} 様
・墓地番号: ${householdTomb || '未設定'}

【出力フォーマット】
戒名（法名） [タブまたはスペース] 俗名 [タブまたはスペース] 没年月日 [タブまたはスペース] 享年 [タブまたはスペース] 続柄 [タブまたはスペース] 備考

【出力例】
〇〇院釈光徳居士　佐藤 徳蔵　令和4年8月10日　88歳　父　
清心妙法大姉　佐藤 静江　平成22年3月3日　82歳　母　

【留意点】
1. 墓碑の旧字体や異体字（釋, 壽, 榮, 萬, 廣, 靈, 圓等）も忠実に認識してください。
2. 複数名の精霊が刻まれている場合は、全ての精霊を漏れなく1行ずつ分けて出力してください。
3. 出力の最後に以下のメッセージをそのまま添えてください：
「上記のテキストをコピーして、寺院管理アプリの『メモ帳・テキスト貼り付け』欄にペーストしてください。」`;
  };

  // Copy AI Prompt
  const handleCopyAiPrompt = async () => {
    const prompt = generateAiPromptText();
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(prompt);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = prompt;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopiedPrompt(true);
      setTimeout(() => setCopiedPrompt(false), 4000);
    } catch (e) {
      console.error('Failed to copy prompt', e);
      alert('プロンプトのコピーに失敗しました。');
    }
  };

  // Paste from clipboard
  const handlePasteFromClipboard = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const clipText = await navigator.clipboard.readText();
        if (clipText) {
          setPastedText(clipText);
          setErrorMessage(null);
          return;
        }
      }
    } catch (e) {
      // Permission denied or not supported in iframe/browser
    }
    // If auto paste failed, focus textarea
    const el = document.getElementById('mobile-kakocho-textarea');
    if (el) {
      el.focus();
    }
  };

  // Insert Sample Text
  const handleInsertSample = () => {
    setPastedText(
`〇〇院釈光徳居士\t佐藤 徳蔵\t令和4年8月10日\t88\t父\t
清心妙法大姉\t佐藤 静江\t平成22年3月3日\t82\t母\t
智照童子\t佐藤 一郎\t昭和45年5月12日\t3\t長男\t`
    );
  };

  // Parse Text and Go to Step 2
  const handleParseAndReview = () => {
    if (!targetHousehold) return;
    if (!pastedText.trim()) {
      setErrorMessage('テキストデータを入力または貼り付けてください。');
      return;
    }

    setErrorMessage(null);
    const parsed = parseMobileTextToItems(
      pastedText.trim(),
      targetHousehold,
      currentHouseholdExistingRecords
    );

    if (parsed.length === 0) {
      parsed.push({
        id: `mob-kakocho-${Date.now()}-0`,
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
        isExpanded: true,
      });
    }

    setExtractedRecords(parsed);
    setCurrentStep('review');
  };

  // Manual Review Entry Mode
  const handleProceedToManual = () => {
    if (!targetHousehold) return;
    setErrorMessage(null);
    setExtractedRecords([
      {
        id: `mob-kakocho-${Date.now()}-0`,
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
        isExpanded: true,
      },
    ]);
    setCurrentStep('review');
  };

  // Row update helpers
  const handleUpdateItem = (id: string, field: keyof MobileExtractedKakochoItem, value: any) => {
    setExtractedRecords(prev =>
      prev.map(row => {
        if (row.id !== id) return row;
        return { ...row, [field]: value };
      })
    );
  };

  const handleNormalizeDate = (id: string) => {
    setExtractedRecords(prev =>
      prev.map(row => {
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

  const handleToggleExpand = (id: string) => {
    setExtractedRecords(prev =>
      prev.map(row => row.id === id ? { ...row, isExpanded: !row.isExpanded } : row)
    );
  };

  const handleDeleteItem = (id: string) => {
    setExtractedRecords(prev => prev.filter(r => r.id !== id));
  };

  const handleAddNewItem = () => {
    if (!targetHousehold) return;
    setExtractedRecords(prev => [
      ...prev,
      {
        id: `mob-kakocho-${Date.now()}-${prev.length}`,
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
        isExpanded: true,
      },
    ]);
  };

  const handleToggleSelectAll = () => {
    const allSelected = extractedRecords.every(r => r.selected);
    setExtractedRecords(prev => prev.map(r => ({ ...r, selected: !allSelected })));
  };

  // Final Import
  const handleExecuteImport = () => {
    if (!targetHousehold) return;

    const selectedItems = extractedRecords.filter(r => r.selected && (r.dharmaName || r.secularName));
    if (selectedItems.length === 0) {
      setErrorMessage('取り込む精霊が選択されていません。戒名または俗名を入力したカードをチェックしてください。');
      return;
    }

    const newPastRecords: PastRecord[] = [];

    selectedItems.forEach((item, idx) => {
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

    onImportPastRecords(
      newPastRecords,
      `【${householdName} 様】スマホ過去帳取り込み（${newPastRecords.length}霊追加）`
    );

    setImportedCount(newPastRecords.length);
    setCurrentStep('complete');
  };

  if (!isOpen || !targetHousehold) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex flex-col z-50 overflow-hidden font-sans">
      {/* Top Header */}
      <div className="bg-[#1A1A1A] text-[#F9F7F2] px-3.5 py-3 flex items-center justify-between border-b-2 border-[#D4AF37] shrink-0">
        <div className="flex items-center space-x-2 min-w-0">
          <div className="w-7 h-7 bg-[#D4AF37] text-[#1A1A1A] flex items-center justify-center font-bold shrink-0 rounded-xs">
            <FileText className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h2 className="font-serif font-black text-sm text-[#D4AF37] truncate">
              【{householdName} 様】過去帳取込
            </h2>
            <div className="text-[10px] text-gray-400 flex items-center gap-1.5 truncate">
              {householdTomb && <span>墓地: {householdTomb}</span>}
              <span>登録済: {currentHouseholdExistingRecords.length}霊</span>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-gray-400 hover:text-white p-1.5 -mr-1 cursor-pointer"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      {/* Wizard Step Progress */}
      <div className="bg-[#EBE7DF] border-b border-[#D1CEC7] px-3 py-1.5 flex items-center justify-between text-xs font-bold text-[#444444] shrink-0">
        <div className="flex items-center space-x-2 text-[11px]">
          <span className={`px-2 py-0.5 rounded-xs ${currentStep === 'input' ? 'bg-[#1A1A1A] text-[#D4AF37]' : 'bg-white text-gray-600'}`}>
            1. テキスト貼付
          </span>
          <span>&gt;</span>
          <span className={`px-2 py-0.5 rounded-xs ${currentStep === 'review' ? 'bg-[#1A1A1A] text-[#D4AF37]' : 'bg-white text-gray-600'}`}>
            2. 精霊確認・校正
          </span>
          <span>&gt;</span>
          <span className={`px-2 py-0.5 rounded-xs ${currentStep === 'complete' ? 'bg-[#1A1A1A] text-[#D4AF37]' : 'bg-white text-gray-600'}`}>
            3. 完了
          </span>
        </div>
      </div>

      {/* Error Notification */}
      {errorMessage && (
        <div className="bg-red-50 border-b border-red-200 px-3 py-2 text-xs text-red-700 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-1.5">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span className="font-bold">{errorMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="text-red-500 font-bold text-sm px-1 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Scrollable Content Body */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-[#F9F7F2]">
        {/* STEP 1: INPUT & AI PROMPT COPY */}
        {currentStep === 'input' && (
          <div className="space-y-3">
            {/* AI Prompt Assistant Banner */}
            <div className="bg-gradient-to-br from-[#FAF5EB] to-[#FFF9F0] border border-[#D4AF37] p-3 rounded-xs shadow-xs space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-1.5 font-serif font-black text-xs text-[#8C2D19]">
                  <Sparkles className="w-4 h-4 text-[#D4AF37]" />
                  <span>スマホカメラで墓碑・過去帳を撮って取り込む場合</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPromptHelp(!showPromptHelp)}
                  className="text-gray-500 hover:text-gray-800 p-0.5 cursor-pointer"
                  title="使い方の説明"
                >
                  <HelpCircle className="w-4 h-4" />
                </button>
              </div>

              <p className="text-[11px] text-[#555555] leading-relaxed">
                スマホ内のAIアプリ（ChatGPT, Gemini等）で墓碑や過去帳の写真を撮って送るだけで、このアプリに貼り付けられる形式のテキストを生成できます。
              </p>

              {/* Prompt Copy Action Button */}
              <button
                type="button"
                onClick={handleCopyAiPrompt}
                className={`w-full py-2.5 px-3 rounded-xs font-bold text-xs flex items-center justify-center space-x-2 transition-all cursor-pointer shadow-xs ${
                  copiedPrompt
                    ? 'bg-emerald-700 text-white'
                    : 'bg-[#8C2D19] hover:bg-[#732414] text-white active:scale-[0.98]'
                }`}
              >
                {copiedPrompt ? (
                  <>
                    <Check className="w-4 h-4 text-white" />
                    <span>プロンプトをコピーしました！</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 text-[#D4AF37]" />
                    <span>AI用撮影・文字起こしプロンプトをコピー</span>
                  </>
                )}
              </button>

              {/* Copy success guide message */}
              {copiedPrompt && (
                <div className="bg-emerald-50 border border-emerald-300 p-2 rounded-xs text-[11px] text-emerald-900 animate-fade-in space-y-1">
                  <div className="font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>クリップボードにコピー完了！</span>
                  </div>
                  <ol className="list-decimal pl-4 space-y-0.5 text-[10px] text-emerald-800">
                    <li>スマホのAIアプリ（ChatGPT / Gemini等）を開く</li>
                    <li>墓碑や過去帳の写真を撮影・添付し、このプロンプトを貼り付けて送信</li>
                    <li>AIが出力したテキストをコピーして、下の枠に貼り付けてください</li>
                  </ol>
                </div>
              )}

              {/* Collapsible Help Steps */}
              {showPromptHelp && (
                <div className="bg-white/80 p-2.5 border border-[#E0DACB] text-[10px] text-[#444444] space-y-1.5 rounded-xs">
                  <div className="font-bold text-[#8C2D19]">💡 かんたん4ステップ:</div>
                  <div className="space-y-1">
                    <div><strong>① 上のボタンを押す</strong>: 最適な文字起こし指示文がコピーされます。</div>
                    <div><strong>② 外部AIアプリを開く</strong>: ChatGPTやGeminiアプリ等を開きます。</div>
                    <div><strong>③ 写真と一緒に送信</strong>: 墓石や位牌の写真を撮影・選択し、プロンプトを貼り付けて送信。</div>
                    <div><strong>④ アプリに戻って貼付</strong>: AIの返信テキストをコピーし、下のテキスト枠にペーストします。</div>
                  </div>
                </div>
              )}
            </div>

            {/* Text Paste Section */}
            <div className="bg-white border border-[#D1CEC7] p-3 rounded-xs space-y-2 shadow-2xs">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-[#1A1A1A] flex items-center gap-1">
                  <FileText className="w-3.5 h-3.5 text-[#8C2D19]" />
                  <span>メモ帳・テキスト内容を貼り付け:</span>
                </label>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handlePasteFromClipboard}
                    className="px-2 py-0.5 bg-[#FAF7F0] hover:bg-[#F0ECE1] text-[#8C2D19] border border-[#D4AF37] text-[10px] font-bold rounded-xs flex items-center gap-0.5 cursor-pointer"
                  >
                    <ClipboardPaste className="w-3 h-3 text-[#8C2D19]" />
                    <span>貼付</span>
                  </button>
                  {pastedText && (
                    <button
                      type="button"
                      onClick={() => setPastedText('')}
                      className="text-[10px] text-gray-500 hover:text-red-600 underline cursor-pointer"
                    >
                      クリア
                    </button>
                  )}
                </div>
              </div>

              <textarea
                id="mobile-kakocho-textarea"
                value={pastedText}
                onChange={(e) => setPastedText(e.target.value)}
                placeholder="ここにテキストを貼り付けてください。&#10;&#10;例:&#10;〇〇院釈光徳居士　佐藤 徳蔵　令和4年8月10日　88歳　父&#10;清心妙法大姉　佐藤 静江　平成22年3月3日　82歳　母"
                rows={7}
                className="w-full bg-[#FAF9F5] border border-[#D1CEC7] p-2.5 text-xs font-serif leading-relaxed focus:border-[#1A1A1A] focus:outline-none rounded-xs"
              />

              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={handleInsertSample}
                  className="text-[10px] text-gray-500 hover:text-[#8C2D19] underline cursor-pointer"
                >
                  サンプルテキストを入力
                </button>
                <button
                  type="button"
                  onClick={handleProceedToManual}
                  className="text-[10px] text-[#1A1A1A] hover:underline font-bold cursor-pointer"
                >
                  直接手動入力で進む &gt;
                </button>
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="pt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="w-1/3 py-2.5 bg-white border border-[#D1CEC7] text-gray-700 text-xs font-bold rounded-xs cursor-pointer"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={handleParseAndReview}
                disabled={!pastedText.trim()}
                className="flex-1 py-2.5 bg-[#1A1A1A] hover:bg-[#333333] disabled:opacity-40 disabled:cursor-not-allowed text-[#D4AF37] border border-[#D4AF37] font-bold text-xs rounded-xs flex items-center justify-center space-x-1.5 shadow-md cursor-pointer"
              >
                <span>精霊データを展開・確認</span>
                <ArrowRight className="w-4 h-4 text-[#D4AF37]" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: REVIEW & EDIT (MOBILE OPTIMIZED CARDS) */}
        {currentStep === 'review' && (
          <div className="space-y-3">
            {/* Header Controls */}
            <div className="bg-white border border-[#D1CEC7] p-2.5 rounded-xs flex items-center justify-between gap-2 shadow-2xs">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleToggleSelectAll}
                  className="text-[11px] font-bold text-[#8C2D19] bg-[#FAF7F0] px-2 py-1 border border-[#D4AF37] rounded-xs cursor-pointer flex items-center gap-1"
                >
                  <Check className="w-3 h-3" />
                  <span>{extractedRecords.every(r => r.selected) ? '全解除' : '全選択'}</span>
                </button>
                <span className="text-xs text-gray-700 font-bold">
                  {extractedRecords.filter(r => r.selected).length} / {extractedRecords.length} 霊 選択中
                </span>
              </div>

              <button
                type="button"
                onClick={handleAddNewItem}
                className="px-2.5 py-1 bg-[#1A1A1A] text-[#D4AF37] font-bold text-xs rounded-xs flex items-center gap-1 cursor-pointer shadow-2xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>精霊追加</span>
              </button>
            </div>

            {/* Mobile Cards List */}
            <div className="space-y-2.5">
              {extractedRecords.map((item, idx) => {
                const isDup = item.isDuplicate;
                return (
                  <div
                    key={item.id}
                    className={`bg-white border-2 rounded-xs shadow-xs transition-all overflow-hidden ${
                      !item.selected
                        ? 'border-gray-200 opacity-60 bg-gray-50'
                        : isDup
                        ? 'border-amber-400 bg-amber-50/20'
                        : 'border-[#1A1A1A]'
                    }`}
                  >
                    {/* Card Header (Tap to select / expand) */}
                    <div className="bg-[#FAF9F5] border-b border-[#E5E0D8] p-2.5 flex items-center justify-between gap-2">
                      <div className="flex items-center space-x-2 min-w-0 flex-1">
                        <input
                          type="checkbox"
                          checked={item.selected}
                          onChange={(e) => handleUpdateItem(item.id, 'selected', e.target.checked)}
                          className="w-4 h-4 accent-[#1A1A1A] cursor-pointer shrink-0"
                        />
                        <span className="text-[10px] font-mono text-gray-400 shrink-0">#{idx + 1}</span>
                        <div className="font-serif font-black text-xs text-[#8C2D19] truncate">
                          {item.dharmaName || item.secularName || '（未入力の精霊）'}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {isDup && (
                          <span className="text-[9px] bg-amber-100 text-amber-900 border border-amber-300 px-1 py-0.5 rounded-2xs font-bold">
                            重複注意
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => handleToggleExpand(item.id)}
                          className="text-gray-500 hover:text-gray-800 p-1 cursor-pointer"
                        >
                          {item.isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteItem(item.id)}
                          className="text-red-500 hover:text-red-700 p-1 cursor-pointer"
                          title="削除"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Card Body - Fields for mobile input */}
                    {item.isExpanded && (
                      <div className="p-3 space-y-2.5 text-xs font-sans">
                        {/* Duplicate Alert */}
                        {isDup && (
                          <div className="bg-amber-50 border border-amber-200 p-1.5 rounded-2xs text-[10px] text-amber-900 flex items-center gap-1">
                            <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                            <span>{item.duplicateReason}</span>
                          </div>
                        )}

                        {/* 戒名・法名 */}
                        <div>
                          <label className="block text-[10px] font-bold text-gray-600 mb-0.5">
                            戒名・法名 <span className="text-red-600">*</span>:
                          </label>
                          <input
                            type="text"
                            value={item.dharmaName}
                            onChange={(e) => handleUpdateItem(item.id, 'dharmaName', e.target.value)}
                            placeholder="例: 〇〇院釈光徳居士"
                            className="w-full bg-[#FAF9F5] border border-[#D1CEC7] focus:border-[#1A1A1A] p-2 text-xs font-serif font-bold rounded-xs"
                          />
                        </div>

                        {/* 俗名 & ふりがな */}
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[10px] font-bold text-gray-600 mb-0.5">俗名:</label>
                            <input
                              type="text"
                              value={item.secularName}
                              onChange={(e) => handleUpdateItem(item.id, 'secularName', e.target.value)}
                              placeholder="例: 佐藤 徳蔵"
                              className="w-full bg-[#FAF9F5] border border-[#D1CEC7] focus:border-[#1A1A1A] p-1.5 text-xs rounded-xs font-serif"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-gray-600 mb-0.5">ふりがな:</label>
                            <input
                              type="text"
                              value={item.furigana}
                              onChange={(e) => handleUpdateItem(item.id, 'furigana', e.target.value)}
                              placeholder="例: さとう とくぞう"
                              className="w-full bg-[#FAF9F5] border border-[#D1CEC7] focus:border-[#1A1A1A] p-1.5 text-xs rounded-xs"
                            />
                          </div>
                        </div>

                        {/* 没年月日 & 享年 */}
                        <div className="grid grid-cols-3 gap-2">
                          <div className="col-span-2">
                            <label className="block text-[10px] font-bold text-gray-600 mb-0.5">没年月日:</label>
                            <input
                              type="text"
                              value={item.deathDate}
                              onChange={(e) => handleUpdateItem(item.id, 'deathDate', e.target.value)}
                              onBlur={() => handleNormalizeDate(item.id)}
                              placeholder="例: 令和4年8月10日"
                              className="w-full bg-[#FAF9F5] border border-[#D1CEC7] focus:border-[#1A1A1A] p-1.5 text-xs rounded-xs font-serif"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-gray-600 mb-0.5">享年:</label>
                            <input
                              type="number"
                              value={item.ageAtDeath !== undefined ? item.ageAtDeath : ''}
                              onChange={(e) => {
                                const val = e.target.value ? parseInt(e.target.value, 10) : undefined;
                                handleUpdateItem(item.id, 'ageAtDeath', isNaN(val as any) ? undefined : val);
                              }}
                              placeholder="88"
                              className="w-full bg-[#FAF9F5] border border-[#D1CEC7] focus:border-[#1A1A1A] p-1.5 text-xs rounded-xs text-center"
                            />
                          </div>
                        </div>

                        {/* 続柄 (Chips + input) */}
                        <div>
                          <div className="flex items-center justify-between mb-0.5">
                            <label className="block text-[10px] font-bold text-gray-600">続柄:</label>
                            <div className="flex items-center gap-1">
                              {['本人', '父', '母', '夫', '妻', '祖父', '祖母'].map((rel) => (
                                <button
                                  key={rel}
                                  type="button"
                                  onClick={() => handleUpdateItem(item.id, 'relationship', rel)}
                                  className="text-[9px] bg-stone-100 hover:bg-stone-200 text-stone-700 px-1 py-0.5 rounded-2xs cursor-pointer"
                                >
                                  {rel}
                                </button>
                              ))}
                            </div>
                          </div>
                          <input
                            type="text"
                            value={item.relationship}
                            onChange={(e) => handleUpdateItem(item.id, 'relationship', e.target.value)}
                            placeholder="例: 父, 祖母, 長男"
                            className="w-full bg-[#FAF9F5] border border-[#D1CEC7] focus:border-[#1A1A1A] p-1.5 text-xs rounded-xs"
                          />
                        </div>

                        {/* 備考 */}
                        <div>
                          <label className="block text-[10px] font-bold text-gray-600 mb-0.5">備考:</label>
                          <input
                            type="text"
                            value={item.notes}
                            onChange={(e) => handleUpdateItem(item.id, 'notes', e.target.value)}
                            placeholder="墓誌記載事項や特記事項"
                            className="w-full bg-[#FAF9F5] border border-[#D1CEC7] focus:border-[#1A1A1A] p-1.5 text-xs rounded-xs"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Bottom Actions */}
            <div className="pt-2 flex items-center gap-2 sticky bottom-0 bg-[#F9F7F2] py-2 border-t border-[#D1CEC7]">
              <button
                type="button"
                onClick={() => setCurrentStep('input')}
                className="w-1/3 py-2.5 bg-white border border-[#D1CEC7] text-gray-700 text-xs font-bold rounded-xs flex items-center justify-center gap-1 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>戻る</span>
              </button>
              <button
                type="button"
                onClick={handleExecuteImport}
                className="flex-1 py-2.5 bg-[#8C2D19] hover:bg-[#732414] text-white font-bold text-xs rounded-xs flex items-center justify-center space-x-1.5 shadow-md cursor-pointer"
              >
                <Check className="w-4 h-4 text-[#D4AF37]" />
                <span>
                  {extractedRecords.filter(r => r.selected && (r.dharmaName || r.secularName)).length} 霊を一括取り込み
                </span>
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: COMPLETE */}
        {currentStep === 'complete' && (
          <div className="bg-white border-2 border-[#1A1A1A] p-6 text-center space-y-4 my-auto shadow-sm rounded-xs">
            <div className="w-14 h-14 bg-emerald-100 text-emerald-800 rounded-full flex items-center justify-center mx-auto border-2 border-emerald-400">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <div className="space-y-1">
              <h3 className="font-serif font-black text-base text-[#1A1A1A]">
                過去帳データの取り込みが完了しました
              </h3>
              <p className="text-xs text-gray-600">
                【{householdName} 様】の過去帳に <strong>{importedCount}</strong> 霊の精霊が正常に追加登録されました。
              </p>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={onClose}
                className="w-full py-2.5 bg-[#1A1A1A] hover:bg-[#333333] text-[#D4AF37] font-bold text-xs rounded-xs cursor-pointer shadow-md"
              >
                閉じる
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
