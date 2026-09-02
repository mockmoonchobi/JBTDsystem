import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  FileText,
  Sparkles,
  RotateCcw,
  Check,
  Plus,
  Trash2,
  Eye,
  Sliders,
  AlertCircle,
  Save,
  Clock
} from 'lucide-react';
import { TempleInfo, Household } from '../types';
import { safeStorage } from '../utils/storageUtils';
import { SaveConfirmModal } from './SaveConfirmModal';
import { DeleteConfirmModal } from './DeleteConfirmModal';
import { VerticalNoticeContent } from './VerticalNoticeContent';
import {
  NoticeTemplateItem,
  INITIAL_NOTICE_TEMPLATES,
  DEFAULT_HIGAN_TEMPLATE,
  DEFAULT_NIIBON_TEMPLATE,
  DEFAULT_MEMORIAL_POSTCARD_TEMPLATE,
  getAllSavedNoticeTemplates,
  saveAllNoticeTemplates,
  applyNoticeTemplate,
  getPostcardBackTypography
} from '../utils/memorialCalculator';

interface PostcardTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  templeInfo?: TempleInfo;
  onTemplatesUpdated?: (templates?: NoticeTemplateItem[]) => void;
}

export const POSTCARD_NOTICE_TAGS = [
  { tag: '{施主名}', description: '施主名（「様」無し）' },
  { tag: '{彼岸}', description: '直近の彼岸（「秋彼岸」または「春彼岸」・年無し）' },
  { tag: '{次彼岸}', description: '直近の彼岸の次（「来年の春彼岸」または「秋彼岸」）' },
  { tag: '{本年}', description: '今年（例: 「令和八年」）' },
  { tag: '{次年}', description: '次の年（例: 「令和九年」）' },
  { tag: '{故人名}', description: '対象故人の俗名（「様」無し）' },
  { tag: '{精霊一覧}', description: '該当精霊一覧（九月二十三日　戒名　霊位　五十回忌）' },
  { tag: '{寺院名}', description: '寺院名（例: 光明寺）' },
  { tag: '{山号}', description: '寺院の山号（例: 補陀落山）' },
  { tag: '{集金項目１}', description: '集金項目1（未設定時: 護持会費　一金、五，〇〇〇円也）' },
  { tag: '{集金項目２}', description: '集金項目2（未設定時: 墓地管理費　一金、三，〇〇〇円也）' },
  { tag: '{集金項目３}', description: '集金項目3（未設定時: 境内整備費　一金、二，〇〇〇円也）' },
  { tag: '{檀信徒QRコード}', description: '檀信徒個別の受付QRコード（「御檀家様QR」表示・小さめ印刷）' },
  { tag: '{寺院サイトQRコード}', description: '寺院公式ホームページ・案内のQRコード' },
];

function formatSpacedTempleName(mountainName?: string, templeName?: string): string {
  const m = (mountainName || '慈光山').trim().split('').join(' ');
  const t = (templeName || '圓福寺').trim().split('').join(' ');
  return `${m}　${t}`;
}

function formatVerticalDigitsAndHyphens(text?: string): string {
  if (!text) return '';
  const digitsMap: Record<string, string> = {
    '0': '〇', '1': '一', '2': '二', '3': '三', '4': '四',
    '5': '五', '6': '六', '7': '七', '8': '八', '9': '九',
    '０': '〇', '１': '一', '２': '二', '３': '三', '４': '四',
    '５': '五', '６': '六', '７': '七', '８': '八', '９': '九',
  };
  let result = text.replace(/[0-9０-９]/g, (d) => digitsMap[d] ?? d);
  result = result.replace(/[-ー–—−―‐〜|｜]/g, '❘');
  return result;
}

function formatVerticalAddress(addr?: string): string {
  if (!addr) return '';
  return formatVerticalDigitsAndHyphens(addr);
}

export const PostcardTemplateModal: React.FC<PostcardTemplateModalProps> = ({
  isOpen,
  onClose,
  templeInfo,
  onTemplatesUpdated,
}) => {
  const [allTemplates, setAllTemplates] = useState<NoticeTemplateItem[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('tpl-higan');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [copiedTag, setCopiedTag] = useState<string | null>(null);
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);
  const [templateToDelete, setTemplateToDelete] = useState<NoticeTemplateItem | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Font size adjustment offset in pt for postcard preview
  const [fontSizeOffset, setFontSizeOffset] = useState<number>(() => {
    try {
      const saved = safeStorage.getItem('temple_notice_fontsize_offset');
      if (saved !== null) {
        const parsed = parseFloat(saved);
        if (!isNaN(parsed)) return parsed;
      }
    } catch (e) {
      // ignore
    }
    return 0;
  });

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isOpen) {
      const loaded = getAllSavedNoticeTemplates();
      setAllTemplates(loaded);
      const postcardList = loaded.filter((t) => t.type === 'postcard');
      if (postcardList.length > 0) {
        setSelectedTemplateId(postcardList[0].id);
      }
      setSaveSuccess(false);
      setHasChanges(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const postcardTemplates = allTemplates.filter((t) => t.type === 'postcard');
  const currentTemplate = postcardTemplates.find((t) => t.id === selectedTemplateId) || postcardTemplates[0] || {
    id: 'tpl-higan',
    name: '彼岸法要のご案内',
    type: 'postcard',
    category: 'higan',
    content: DEFAULT_HIGAN_TEMPLATE,
    isDefault: true,
  };

  const handleUpdateCurrentTemplate = (partial: Partial<NoticeTemplateItem>) => {
    setAllTemplates((prev) =>
      prev.map((t) => (t.id === currentTemplate.id ? { ...t, ...partial } : t))
    );
    setHasChanges(true);
    setSaveSuccess(false);
  };

  const handleAddNewPostcardTemplate = () => {
    const newId = `tpl-postcard-${Date.now()}`;
    const newTpl: NoticeTemplateItem = {
      id: newId,
      name: `新規はがき案内文 ${postcardTemplates.length + 1}`,
      type: 'postcard',
      category: 'custom',
      content: `謹啓　時下、{施主名}様におかれましては益々ご清祥のこととお慶び申し上げます。日頃より当寺の護持運営につきまして多大なるご理解とご協力を賜り厚く御礼申し上げます。\n　さて、{本年}は、下記精霊の年回忌法要の正当年に当たっております。\n{精霊一覧}\n　つきましては、万障お繰り合わせの上、ご参列賜りますよう謹んでご案内申し上げます。\n　\n合掌`,
      isDefault: false,
    };
    const updated = [...allTemplates, newTpl];
    setAllTemplates(updated);
    setSelectedTemplateId(newId);
    setHasChanges(true);
    saveAllNoticeTemplates(updated);
    if (onTemplatesUpdated) {
      onTemplatesUpdated(updated);
    }
    showToast(`テンプレート「${newTpl.name}」を作成しました`);
  };

  const handleDeleteTemplate = (id: string) => {
    const tpl = allTemplates.find((t) => t.id === id);
    if (tpl) {
      setTemplateToDelete(tpl);
    }
  };

  const executeDeleteTemplate = () => {
    if (!templateToDelete) return;
    const id = templateToDelete.id;
    let remaining = allTemplates.filter((t) => t.id !== id);
    
    // もしハガキ用テンプレートが0件になった場合は、初期標準テンプレートを再生成
    const remainingPostcards = remaining.filter((t) => t.type === 'postcard');
    if (remainingPostcards.length === 0) {
      const fallback: NoticeTemplateItem = {
        id: 'tpl-higan',
        name: '彼岸法要のご案内',
        type: 'postcard',
        category: 'higan',
        content: DEFAULT_HIGAN_TEMPLATE,
        isDefault: true,
      };
      remaining = [...remaining, fallback];
      setSelectedTemplateId('tpl-higan');
    } else {
      setSelectedTemplateId(remainingPostcards[0].id);
    }

    setAllTemplates(remaining);
    saveAllNoticeTemplates(remaining);
    if (onTemplatesUpdated) {
      onTemplatesUpdated(remaining);
    }
    setHasChanges(false);
    showToast(`テンプレート「${templateToDelete.name}」を削除しました`);
    setTemplateToDelete(null);
  };

  const executeResetToDefault = () => {
    const nonPostcards = allTemplates.filter((t) => t.type !== 'postcard');
    const defaultPostcards = INITIAL_NOTICE_TEMPLATES.filter((t) => t.type === 'postcard');
    const restored = [...nonPostcards, ...defaultPostcards];
    setAllTemplates(restored);
    setSelectedTemplateId(defaultPostcards[0]?.id || 'tpl-higan');
    saveAllNoticeTemplates(restored);
    setHasChanges(false);
    setSaveSuccess(true);
    if (onTemplatesUpdated) {
      onTemplatesUpdated(restored);
    }
    showToast('はがき用テンプレートの初期値を復元しました');
    setShowResetConfirm(false);
    setTimeout(() => setSaveSuccess(false), 2500);
  };

  const handleInsertTag = (tag: string) => {
    if (textareaRef.current) {
      const textarea = textareaRef.current;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const text = currentTemplate.content;
      const newText = text.substring(0, start) + tag + text.substring(end);
      handleUpdateCurrentTemplate({ content: newText });

      setCopiedTag(tag);
      setTimeout(() => setCopiedTag(null), 1500);

      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + tag.length, start + tag.length);
      }, 0);
    } else {
      handleUpdateCurrentTemplate({ content: currentTemplate.content + tag });
    }
  };

  const handleFontSizeChange = (delta: number) => {
    const nextVal = Number((fontSizeOffset + delta).toFixed(1));
    if (nextVal < -4 || nextVal > 6) return;
    setFontSizeOffset(nextVal);
    safeStorage.setItem('temple_notice_fontsize_offset', String(nextVal));
  };

  const handleSaveAndClose = () => {
    saveAllNoticeTemplates(allTemplates);
    setHasChanges(false);
    setSaveSuccess(true);
    if (onTemplatesUpdated) {
      onTemplatesUpdated(allTemplates);
    }
    onClose();
  };

  const handleCloseModal = () => {
    // 一括会計処理と同様に、閉じる操作時に端末保存およびデータ連携を実行
    handleSaveAndClose();
  };

  const handleDiscardAndClose = () => {
    setShowSaveConfirm(false);
    onClose();
  };

  const executeSaveAndClose = () => {
    saveAllNoticeTemplates(allTemplates);
    setShowSaveConfirm(false);
    setHasChanges(false);
    if (onTemplatesUpdated) {
      onTemplatesUpdated(allTemplates);
    }
    onClose();
  };

  // Sample household for preview with dummy fee amounts
  const sampleHousehold: Household = {
    id: 'H001',
    familyHead: '山田太郎',
    furigana: 'ヤマダ タロウ',
    postalCode: '105-0011',
    address: '東京都港区芝公園4-7-35',
    phone: '03-1234-5678',
    householdType: '檀家',
    district: '中央地区',
    status: '生存',
    tombNumber: 'A-12',
    familyMembers: [],
    createdAt: '2026-01-01',
    notes: '',
    fee1: String(templeInfo?.feeType1DefaultAmount || 5000),
    fee1Amount: templeInfo?.feeType1DefaultAmount || 5000,
    fee2: String(templeInfo?.feeType2DefaultAmount || 3000),
    fee2Amount: templeInfo?.feeType2DefaultAmount || 3000,
    fee3: String(templeInfo?.feeType3DefaultAmount || 2000),
    fee3Amount: templeInfo?.feeType3DefaultAmount || 2000,
  };

  // Preview temple info: use configured fee types if present, otherwise fallback to standard dummy names
  const previewTempleInfo: TempleInfo = {
    ...(templeInfo || ({} as TempleInfo)),
    id: templeInfo?.id || 'temple-preview',
    name: templeInfo?.name || '光明寺',
    mountainName: templeInfo?.mountainName || '補陀落山',
    address: templeInfo?.address || '東京都港区芝公園4-7-35',
    phone: templeInfo?.phone || '03-3432-1234',
    postalCode: templeInfo?.postalCode || '105-0011',
    chiefPriest: templeInfo?.chiefPriest || '住職 山田光徳',
    sect: templeInfo?.sect || '浄土宗',
    feeType1: templeInfo?.feeType1?.trim() ? templeInfo.feeType1.trim() : '護持会費',
    feeType2: templeInfo?.feeType2?.trim() ? templeInfo.feeType2.trim() : '墓地管理費',
    feeType3: templeInfo?.feeType3?.trim() ? templeInfo.feeType3.trim() : '境内整備費',
  };

  // Preview generated output with sample values
  const previewText = applyNoticeTemplate(
    currentTemplate.content || '',
    [
      {
        dharmaName: '釋清純信士',
        scheduledDateStr: '2026-09-23',
        memorialType: '五十回忌',
      },
    ],
    '令和八年 秋彼岸',
    '山田太郎',
    previewTempleInfo,
    '山田太郎',
    sampleHousehold
  );

  const typography = getPostcardBackTypography(previewText, fontSizeOffset);
  const effectivePt = parseFloat(typography.fontSize) || 12;

  const postalDigits = formatVerticalDigitsAndHyphens(templeInfo?.postalCode || '105-0011');
  const addrText = formatVerticalAddress(templeInfo?.address || '東京都港区芝公園4-7-35');
  const phoneDigits = formatVerticalDigitsAndHyphens(templeInfo?.phone || '03-3432-1234');
  const shouldIncludePhone = Boolean(templeInfo?.phone);

  return (
    <div className="fixed inset-0 z-50 bg-[#1A1A1A]/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 font-serif select-none">
      <div className="bg-white border border-[#D4AF37] max-w-6xl w-full h-[92vh] max-h-[860px] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-[#1A1A1A] border-b border-[#D4AF37] px-4 py-3 text-[#F9F7F2] flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-[#D4AF37] text-[#1A1A1A] flex items-center justify-center font-bold font-sans text-sm">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold tracking-wider text-[#F9F7F2]">
                  はがき案内文テンプレート設定
                </h2>
                <span className="px-2 py-0.5 bg-[#D4AF37]/20 border border-[#D4AF37]/40 text-[#D4AF37] text-xs font-sans font-bold">
                  官製はがき用
                </span>
              </div>
              <p className="text-xs text-[#CCCCCC] font-sans mt-0.5">
                官製はがき（100×148mm）の裏面に印刷する案内文テンプレートを編集・管理します。「保存して閉じる」または「☓」で端末に保存され、Googleシートへ自動連携されます。
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2 font-sans">
            <button
              type="button"
              onClick={handleCloseModal}
              className="p-1.5 text-[#CCCCCC] hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              title="保存して閉じる"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Toast notification */}
        {toastMessage && (
          <div className="bg-emerald-800 text-white text-xs px-4 py-1.5 font-bold flex items-center justify-between animate-fadeIn shrink-0">
            <span>{toastMessage}</span>
            <button type="button" onClick={() => setToastMessage(null)} className="text-stone-300 hover:text-white ml-2">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Top Horizontal Menu Bar: Template List (一行メニュー) */}
        <div className="bg-[#FAF8F5] border-b border-[#D1CEC7] px-3.5 py-2 flex items-center justify-between gap-2 overflow-x-auto shrink-0 font-sans">
          <div className="flex items-center space-x-1.5 min-w-max">
            <span className="text-xs font-bold text-[#1A1A1A] flex items-center gap-1 mr-1">
              <FileText className="w-3.5 h-3.5 text-[#D4AF37]" />
              <span>テンプレート:</span>
            </span>

            {postcardTemplates.map((t) => {
              const isSelected = t.id === currentTemplate.id;
              return (
                <div
                  key={t.id}
                  onClick={() => setSelectedTemplateId(t.id)}
                  className={`px-3 py-1.5 text-xs transition-all border cursor-pointer flex items-center gap-2 ${
                    isSelected
                      ? 'bg-[#1A1A1A] text-[#D4AF37] font-bold border-[#D4AF37] shadow-xs'
                      : 'bg-white text-stone-800 hover:bg-[#F0ECE1] border-stone-300'
                  }`}
                >
                  <span className="max-w-[140px] sm:max-w-[200px] truncate">{t.name}</span>
                  {t.isDefault && (
                    <span
                      className={`text-[9px] px-1 py-0.2 shrink-0 ${
                        isSelected
                          ? 'bg-stone-800 text-stone-300 border border-stone-700'
                          : 'bg-stone-100 text-stone-600 border border-stone-300'
                      }`}
                    >
                      標準
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteTemplate(t.id);
                    }}
                    className={`p-0.5 opacity-70 hover:opacity-100 transition-opacity cursor-pointer ${
                      isSelected ? 'text-rose-400 hover:text-rose-300' : 'text-stone-400 hover:text-rose-600'
                    }`}
                    title="テンプレートを削除"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>

          <button
            type="button"
            onClick={handleAddNewPostcardTemplate}
            className="px-2.5 py-1.5 bg-[#1A1A1A] hover:bg-[#333333] text-[#D4AF37] text-xs font-bold border border-[#D4AF37] flex items-center gap-1 cursor-pointer shadow-2xs shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>新規作成</span>
          </button>
        </div>

        {/* Modal Body: 2-column Layout (Left 5 : Right 5) */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 overflow-hidden">
          {/* Left Column: Editor & Tags (50%) */}
          <div className="border-r border-[#D1CEC7] p-4 flex flex-col space-y-3 bg-white overflow-y-auto">
            <div className="flex items-center justify-between pb-1 border-b border-stone-200">
              <span className="font-bold text-xs text-stone-900 font-sans">
                テンプレート編集
              </span>
              <span className="text-[11px] text-stone-500 font-sans">
                用紙: <strong>官製はがき (100×148mm)</strong>
              </span>
            </div>

            {/* Template Name (法要区分は削除) */}
            <div className="text-xs font-sans">
              <label className="block font-bold text-stone-700 mb-1">
                テンプレート名称:
              </label>
              <input
                type="text"
                value={currentTemplate.name}
                onChange={(e) => handleUpdateCurrentTemplate({ name: e.target.value })}
                className="w-full bg-stone-50 border border-stone-300 p-2 text-xs font-bold text-stone-900 focus:bg-white focus:border-[#1A1A1A] focus:outline-none"
                placeholder="例: 秋彼岸法要のご案内（はがき）"
              />
            </div>

            {/* Tag Palette */}
            <div className="bg-stone-50 border border-stone-200 p-2.5 rounded-xs space-y-1.5 font-sans">
              <div className="flex items-center justify-between text-[11px] font-bold text-stone-700">
                <span className="flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-[#D4AF37]" />
                  <span>差し込みタグパレット（クリックで本文に挿入）:</span>
                </span>
                {copiedTag && (
                  <span className="text-emerald-700 font-bold flex items-center gap-0.5">
                    <Check className="w-3 h-3" />
                    <span>挿入済</span>
                  </span>
                )}
              </div>

              <div className="flex flex-wrap gap-1 max-h-28 overflow-y-auto p-1 bg-white border border-stone-200">
                {POSTCARD_NOTICE_TAGS.map((t) => (
                  <button
                    key={t.tag}
                    type="button"
                    onClick={() => handleInsertTag(t.tag)}
                    className="px-2 py-0.5 bg-stone-100 hover:bg-[#1A1A1A] hover:text-[#D4AF37] text-stone-800 text-[11px] font-mono border border-stone-300 transition-colors flex items-center gap-1 cursor-pointer"
                    title={`${t.tag}: ${t.description}`}
                  >
                    <span>{t.tag}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Textarea */}
            <div className="flex-1 flex flex-col min-h-[220px]">
              <label className="block font-bold text-stone-700 text-xs mb-1 font-sans">
                案内文本文（タグは実データに自動置換されます）:
              </label>
              <textarea
                ref={textareaRef}
                value={currentTemplate.content}
                onChange={(e) => handleUpdateCurrentTemplate({ content: e.target.value })}
                rows={12}
                className="w-full flex-1 bg-stone-50 border border-stone-300 p-3 text-xs text-stone-900 font-serif leading-relaxed focus:bg-white focus:border-[#1A1A1A] focus:outline-none resize-none"
                placeholder="本文を入力..."
              />
            </div>
          </div>

          {/* Right Column: Live Postcard Preview (50%) */}
          <div className="flex flex-col p-4 space-y-3 bg-stone-100/90 overflow-y-auto">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-stone-300 shrink-0">
              <span className="font-bold text-xs text-stone-900 flex items-center gap-1.5 font-sans">
                <Eye className="w-3.5 h-3.5 text-[#D4AF37]" />
                <span>はがき裏面プレビュー (実寸・縦書き)</span>
              </span>

              {/* Font Size controls */}
              <div className="flex items-center space-x-1 bg-white border border-stone-300 px-2 py-0.5 shadow-2xs font-sans text-xs">
                <span className="text-[10px] text-stone-500 font-bold">文字:</span>
                <button
                  type="button"
                  onClick={() => handleFontSizeChange(-0.5)}
                  disabled={fontSizeOffset <= -4}
                  className="w-5 h-5 bg-stone-100 hover:bg-[#1A1A1A] hover:text-[#D4AF37] border border-stone-300 text-xs font-bold flex items-center justify-center transition-colors disabled:opacity-40 cursor-pointer"
                  title="文字を小さくする"
                >
                  －
                </button>
                <span className="text-[11px] font-mono font-bold px-1 text-stone-900 min-w-[36px] text-center">
                  {effectivePt.toFixed(1)}pt
                </span>
                <button
                  type="button"
                  onClick={() => handleFontSizeChange(0.5)}
                  disabled={fontSizeOffset >= 6}
                  className="w-5 h-5 bg-stone-100 hover:bg-[#1A1A1A] hover:text-[#D4AF37] border border-stone-300 text-xs font-bold flex items-center justify-center transition-colors disabled:opacity-40 cursor-pointer"
                  title="文字を大きくする"
                >
                  ＋
                </button>
              </div>
            </div>

            {/* Preview Box Container */}
            <div className="flex-1 flex items-center justify-center p-2 min-h-[360px] overflow-y-auto">
              <div
                className="bg-[rgb(250,248,245)] text-stone-900 relative font-serif shadow-xl transition-all select-text overflow-hidden border border-stone-300"
                style={{
                  width: '100mm',
                  height: '148mm',
                  minWidth: '100mm',
                  minHeight: '148mm',
                  boxSizing: 'border-box',
                  padding: '0',
                }}
              >
                {/* Main Body (Vertical Writing) */}
                <div
                  className="absolute top-[8mm] right-[8mm] bottom-[8mm] left-[22mm] font-serif text-stone-950 overflow-hidden flex flex-col justify-between"
                  style={{
                    writingMode: 'vertical-rl',
                    textOrientation: 'upright',
                    fontSize: typography.fontSize,
                    lineHeight: typography.lineHeight,
                    letterSpacing: typography.letterSpacing,
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  <div className="overflow-hidden">
                    <VerticalNoticeContent
                      text={previewText ? previewText.replace(/[\s\n]*合掌\s*$/, '') : '案内文テンプレートが空です。'}
                      household={sampleHousehold}
                      templeInfo={templeInfo}
                      variant="postcard"
                      fontSize={typography.fontSize}
                    />
                  </div>
                  <div
                    className="text-right font-serif text-stone-950 font-bold tracking-widest pt-2"
                    style={{ fontSize: typography.fontSize }}
                  >
                    合掌
                  </div>
                </div>

                {/* Sender Temple Block */}
                <div className="absolute bottom-[8mm] left-[5mm]">
                  <div
                    className="text-stone-900 font-serif flex flex-col items-end gap-2"
                    style={{
                      writingMode: 'vertical-rl',
                      textOrientation: 'upright',
                    }}
                  >
                    <div
                      className="font-bold tracking-widest text-stone-950 whitespace-nowrap"
                      style={{ fontSize: '13pt', lineHeight: '1.2' }}
                    >
                      <span>{formatSpacedTempleName(templeInfo?.mountainName, templeInfo?.name)}</span>
                    </div>

                    <div
                      className="text-stone-800 tracking-wide whitespace-nowrap"
                      style={{ fontSize: '8.5pt', lineHeight: '1.25' }}
                    >
                      {postalDigits && (
                        <span>
                          <span>〒</span>
                          <span style={{ fontSize: '70%' }}>{postalDigits}</span>
                          <span>　</span>
                        </span>
                      )}
                      <span>{addrText}</span>
                      {shouldIncludePhone && (
                        <span>
                          <span>　電話</span>
                          <span style={{ fontSize: '70%' }}>{phoneDigits}</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="bg-[#1A1A1A] text-[#F9F7F2] px-4 py-3 border-t border-[#D4AF37] flex flex-col sm:flex-row items-center justify-between gap-3 font-sans shrink-0">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#CCCCCC]">
            <div className="flex items-center space-x-2">
              <span className="text-[#999]">テンプレート数:</span>
              <strong className="text-white font-mono text-sm">{postcardTemplates.length} 件</strong>
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-[#999]">編集中のテンプレート:</span>
              <strong className="text-[#D4AF37] font-bold">{currentTemplate.name}</strong>
            </div>
            <span className="text-[#888] text-[11px]">
              ※ 印刷時に選択したテンプレートの文章が自動的に反映されます。
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {hasChanges && (
              <button
                type="button"
                onClick={handleDiscardAndClose}
                className="px-3 py-2 bg-[#2A2A2A] hover:bg-stone-700 text-stone-300 text-xs font-bold transition-colors cursor-pointer border border-stone-600 rounded-xs"
                title="編集内容を破棄して閉じます"
              >
                <span>破棄して閉じる</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleSaveAndClose}
              className="px-5 py-2 bg-[#D4AF37] hover:bg-[#c29f2f] text-[#1A1A1A] font-bold text-xs tracking-wider flex items-center space-x-1.5 shadow-md transition-all cursor-pointer rounded-xs"
            >
              <Save className="w-4 h-4" />
              <span>保存して閉じる</span>
            </button>
          </div>
        </div>
      </div>

      {/* Save Confirmation Modal */}
      <SaveConfirmModal
        isOpen={showSaveConfirm}
        title="はがきテンプレートの保存確認"
        message="編集中の案内文テンプレートを保存しますか？"
        description="「保存して閉じる」を押すと、変更した案内文テンプレートを反映して閉じます。「保存せずに閉じる」を押すと今回の編集は破棄されます。"
        onSaveAndClose={executeSaveAndClose}
        onDiscardAndClose={() => {
          setShowSaveConfirm(false);
          onClose();
        }}
        onCancel={() => setShowSaveConfirm(false)}
      />

      {/* Delete Confirmation Modal */}
      <DeleteConfirmModal
        isOpen={!!templateToDelete}
        title="はがき案内文テンプレートの削除"
        message="このテンプレートを削除しますか？"
        description="削除すると端末ストレージおよび連動データから削除されます。"
        itemName={templateToDelete?.name}
        onConfirm={executeDeleteTemplate}
        onCancel={() => setTemplateToDelete(null)}
      />

      {/* Reset Confirmation Modal */}
      <DeleteConfirmModal
        isOpen={showResetConfirm}
        title="はがきテンプレートの初期値復元"
        message="はがき用テンプレートの初期値を復元しますか？"
        description="復元すると、現在のはがき用テンプレートの編集内容は標準初期テンプレートに上書きされます。"
        confirmButtonText="初期値に戻す"
        onConfirm={executeResetToDefault}
        onCancel={() => setShowResetConfirm(false)}
      />
    </div>
  );
};
