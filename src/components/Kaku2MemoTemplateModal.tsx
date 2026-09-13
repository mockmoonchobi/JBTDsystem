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
  Save,
} from 'lucide-react';
import { TempleInfo, Household } from '../types';
import { SaveConfirmModal } from './SaveConfirmModal';
import { DeleteConfirmModal } from './DeleteConfirmModal';
import {
  NoticeTemplateItem,
  INITIAL_NOTICE_TEMPLATES,
  DEFAULT_KAKU2_MEMO_TEMPLATE,
  getAllSavedNoticeTemplates,
  saveAllNoticeTemplates,
  applyEnvelopeMemoTemplate,
} from '../utils/memorialCalculator';
import { safeJoinWithSpace } from '../utils/unicodeUtils';
import { recordOperationLog, getCurrentOperatorInfo } from '../utils/deletedRecordsLog';

interface Kaku2MemoTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  templeInfo?: TempleInfo;
  onTemplatesUpdated?: (templates?: NoticeTemplateItem[]) => void;
}

export const KAKU2_MEMO_TAGS = [
  { tag: '{施主名}', description: '施主名（「様」無し）' },
  { tag: '{寺院名}', description: '寺院名（例: 光明寺）' },
  { tag: '{山号}', description: '寺院の山号（例: 補陀落山）' },
  { tag: '{本年}', description: '今年（例: 「令和八年」）' },
  { tag: '{次年}', description: '次の年（例: 「令和九年」）' },
];

export const Kaku2MemoTemplateModal: React.FC<Kaku2MemoTemplateModalProps> = ({
  isOpen,
  onClose,
  templeInfo,
  onTemplatesUpdated,
}) => {
  const [allTemplates, setAllTemplates] = useState<NoticeTemplateItem[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('tpl-kaku2-memo-default');
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

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Sample household for preview
  const sampleHousehold: Household = {
    id: 'H001',
    familyHead: '佐藤　謙一',
    furigana: 'さとう けんいち',
    postalCode: '105-0011',
    address: '東京都港区芝公園四―七―三十五',
    phone: '03-3432-1111',
    templeId: templeInfo?.id || 'temple-main',
    householdType: '檀家',
    district: '',
    tombNumber: '',
    status: 'active',
    familyMembers: [],
    notes: '',
    createdAt: '2026-01-01',
  };

  useEffect(() => {
    if (isOpen) {
      const loaded = getAllSavedNoticeTemplates();
      setAllTemplates(loaded);
      const kaku2Templates = loaded.filter((t) => t.type === 'kaku2_memo');
      if (kaku2Templates.length > 0 && !kaku2Templates.some((t) => t.id === selectedTemplateId)) {
        setSelectedTemplateId(kaku2Templates[0].id);
      }
      setHasChanges(false);
      setSaveSuccess(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const kaku2Templates = allTemplates.filter((t) => t.type === 'kaku2_memo');
  const currentTemplate =
    kaku2Templates.find((t) => t.id === selectedTemplateId) ||
    kaku2Templates[0] || {
      id: 'tpl-kaku2-memo-default',
      name: '重要書類在中・年忌法要案内状同封',
      type: 'kaku2_memo',
      category: 'custom',
      content: DEFAULT_KAKU2_MEMO_TEMPLATE,
      isDefault: true,
    };

  const handleUpdateCurrentTemplate = (partial: Partial<NoticeTemplateItem>) => {
    setAllTemplates((prev) =>
      prev.map((t) => (t.id === currentTemplate.id ? { ...t, ...partial } : t))
    );
    setHasChanges(true);
    setSaveSuccess(false);
  };

  const handleAddNewTemplate = () => {
    const newId = `tpl-kaku2-memo-${Date.now()}`;
    const newTpl: NoticeTemplateItem = {
      id: newId,
      name: `新規角２宛名面メモ ${kaku2Templates.length + 1}`,
      type: 'kaku2_memo',
      category: 'custom',
      content: `※ 重要書類在中\n　{施主名}様、年回忌法要のご案内状を同封申し上げております。\n　ご確認のほど、よろしくお願い申し上げます。`,
      isDefault: false,
    };
    const updated = [...allTemplates, newTpl];
    setAllTemplates(updated);
    setSelectedTemplateId(newId);
    setHasChanges(true);
    saveAllNoticeTemplates(updated);
    const { operator, deviceInfo } = getCurrentOperatorInfo();
    recordOperationLog(
      newId,
      'noticeTemplate',
      'create',
      `角２宛名面メモテンプレート「${newTpl.name}」を新規作成`,
      templeInfo?.id || 'temple-main',
      operator,
      deviceInfo
    );
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

    const remainingKaku2 = remaining.filter((t) => t.type === 'kaku2_memo');
    if (remainingKaku2.length === 0) {
      const fallback: NoticeTemplateItem = {
        id: 'tpl-kaku2-memo-default',
        name: '重要書類在中・年忌法要案内状同封',
        type: 'kaku2_memo',
        category: 'custom',
        content: DEFAULT_KAKU2_MEMO_TEMPLATE,
        isDefault: true,
      };
      remaining = [...remaining, fallback];
    }

    setAllTemplates(remaining);
    const newKaku2List = remaining.filter((t) => t.type === 'kaku2_memo');
    setSelectedTemplateId(newKaku2List[0]?.id || '');
    setHasChanges(false);
    saveAllNoticeTemplates(remaining);

    const { operator, deviceInfo } = getCurrentOperatorInfo();
    recordOperationLog(
      id,
      'noticeTemplate',
      'delete',
      `角２宛名面メモテンプレート「${templateToDelete.name}」を削除`,
      templeInfo?.id || 'temple-main',
      operator,
      deviceInfo
    );

    if (onTemplatesUpdated) {
      onTemplatesUpdated(remaining);
    }
    showToast(`「${templateToDelete.name}」を削除しました`);
    setTemplateToDelete(null);
  };

  const handleResetToDefaults = () => {
    setShowResetConfirm(true);
  };

  const executeResetToDefaults = () => {
    // Keep non-kaku2 templates, replace kaku2 templates with initial ones
    const nonKaku2 = allTemplates.filter((t) => t.type !== 'kaku2_memo');
    const defaultKaku2 = INITIAL_NOTICE_TEMPLATES.filter((t) => t.type === 'kaku2_memo');
    const restored = [...nonKaku2, ...defaultKaku2];

    setAllTemplates(restored);
    setSelectedTemplateId(defaultKaku2[0]?.id || 'tpl-kaku2-memo-default');
    setHasChanges(false);
    saveAllNoticeTemplates(restored);

    const { operator, deviceInfo } = getCurrentOperatorInfo();
    recordOperationLog(
      'reset-kaku2-memo-templates',
      'noticeTemplate',
      'update',
      '角２宛名面メモテンプレートを初期標準状態にリセット',
      templeInfo?.id || 'temple-main',
      operator,
      deviceInfo
    );

    if (onTemplatesUpdated) {
      onTemplatesUpdated(restored);
    }
    setShowResetConfirm(false);
    showToast('角２宛名面メモテンプレートを初期標準状態に戻しました');
  };

  const handleInsertTag = (tag: string) => {
    if (!textareaRef.current) return;
    const el = textareaRef.current;
    const start = el.selectionStart || 0;
    const end = el.selectionEnd || 0;
    const text = currentTemplate.content;
    const before = text.substring(0, start);
    const after = text.substring(end);
    const newContent = before + tag + after;

    handleUpdateCurrentTemplate({ content: newContent });

    setCopiedTag(tag);
    setTimeout(() => setCopiedTag(null), 1500);

    setTimeout(() => {
      el.focus();
      const nextPos = start + tag.length;
      el.setSelectionRange(nextPos, nextPos);
    }, 50);
  };

  const handleSave = () => {
    saveAllNoticeTemplates(allTemplates);
    setSaveSuccess(true);
    setHasChanges(false);

    const { operator, deviceInfo } = getCurrentOperatorInfo();
    recordOperationLog(
      currentTemplate.id,
      'noticeTemplate',
      'update',
      `角２宛名面メモテンプレート「${currentTemplate.name}」を保存更新`,
      templeInfo?.id || 'temple-main',
      operator,
      deviceInfo
    );

    if (onTemplatesUpdated) {
      onTemplatesUpdated(allTemplates);
    }

    showToast('テンプレートの変更を保存しました');
    setTimeout(() => setSaveSuccess(false), 2000);
  };

  const handleClose = () => {
    if (hasChanges) {
      setShowSaveConfirm(true);
    } else {
      onClose();
    }
  };

  const previewText = applyEnvelopeMemoTemplate(
    currentTemplate.content,
    sampleHousehold,
    templeInfo
  );

  return (
    <div
      id="kaku2-memo-template-modal-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 backdrop-blur-xs p-4 overflow-y-auto animate-fadeIn"
    >
      <div
        id="kaku2-memo-template-modal-card"
        className="bg-white rounded-none border border-stone-400 shadow-2xl w-full max-w-6xl max-h-[92vh] flex flex-col font-sans overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-200 bg-stone-900 text-stone-100 select-none">
          <div className="flex items-center space-x-3">
            <Sliders className="w-5 h-5 text-[#D4AF37]" />
            <div>
              <h2 className="text-base font-bold tracking-wider text-white">
                角２封筒 宛名面メモ テンプレート管理
              </h2>
              <p className="text-xs text-stone-300">
                封筒宛名面の下部に縦書きで印字するメッセージや注意書きのテンプレートを編集・記録できます
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-1 text-stone-400 hover:text-white hover:bg-stone-800 transition-colors cursor-pointer"
            title="閉じる"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Toast alert */}
        {toastMessage && (
          <div className="bg-[#1A1A1A] text-[#D4AF37] border-b border-[#D4AF37] px-6 py-2 text-xs font-bold flex items-center justify-between">
            <span>{toastMessage}</span>
            <span className="text-[10px] text-stone-300">自動的に保存反映されました</span>
          </div>
        )}

        {/* Main Body */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
          {/* Left: Template List */}
          <div className="lg:col-span-3 border-r border-stone-200 bg-stone-50 p-4 flex flex-col justify-between overflow-y-auto">
            <div className="space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-stone-200">
                <span className="text-xs font-bold text-stone-700 tracking-wider">
                  登録テンプレート一覧
                </span>
                <button
                  type="button"
                  onClick={handleAddNewTemplate}
                  className="px-2 py-1 bg-stone-900 hover:bg-stone-800 text-white text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer shadow-2xs"
                  title="新しい角２宛名面メモを追加"
                >
                  <Plus className="w-3.5 h-3.5 text-[#D4AF37]" />
                  <span>新規追加</span>
                </button>
              </div>

              <div className="space-y-1.5">
                {kaku2Templates.map((t) => {
                  const isSelected = t.id === currentTemplate.id;
                  return (
                    <div
                      key={t.id}
                      onClick={() => {
                        setSelectedTemplateId(t.id);
                        setSaveSuccess(false);
                      }}
                      className={`group p-2.5 border text-xs cursor-pointer transition-all flex items-center justify-between ${
                        isSelected
                          ? 'bg-white border-stone-900 shadow-xs ring-1 ring-stone-900 font-bold text-stone-950'
                          : 'bg-white/70 border-stone-200 hover:bg-white hover:border-stone-400 text-stone-700'
                      }`}
                    >
                      <div className="flex items-center space-x-2 truncate">
                        <FileText
                          className={`w-4 h-4 flex-shrink-0 ${
                            isSelected ? 'text-[#D4AF37]' : 'text-stone-400'
                          }`}
                        />
                        <span className="truncate">{t.name}</span>
                      </div>
                      {t.isDefault && (
                        <span className="text-[10px] text-stone-500 bg-stone-100 border border-stone-200 px-1 py-0.2 rounded-xs flex-shrink-0">
                          初期
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Reset to defaults */}
            <div className="pt-4 border-t border-stone-200 mt-4">
              <button
                type="button"
                onClick={handleResetToDefaults}
                className="w-full px-2 py-1.5 text-xs text-stone-600 hover:text-stone-900 hover:bg-stone-200/70 border border-stone-300 flex items-center justify-center space-x-1 transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5 text-stone-500" />
                <span>初期テンプレートに戻す</span>
              </button>
            </div>
          </div>

          {/* Center: Editor */}
          <div className="lg:col-span-5 p-5 flex flex-col justify-between overflow-y-auto border-r border-stone-200 bg-white space-y-4">
            <div className="space-y-4">
              {/* Template Name */}
              <div className="space-y-1">
                <label className="block text-xs font-bold text-stone-700">
                  テンプレート名称:
                </label>
                <input
                  type="text"
                  value={currentTemplate.name}
                  onChange={(e) => handleUpdateCurrentTemplate({ name: e.target.value })}
                  className="w-full px-3 py-1.5 border border-stone-300 text-xs font-bold text-stone-900 focus:outline-none focus:border-stone-900 focus:ring-1 focus:ring-stone-900"
                  placeholder="テンプレート名称を入力"
                />
              </div>

              {/* Tag Insertion Buttons */}
              <div className="space-y-1.5 bg-stone-50 p-3 border border-stone-200">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-stone-700 flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-[#D4AF37]" />
                    <span>タグ挿入（クリックで本文へ挿入）:</span>
                  </span>
                  {copiedTag && (
                    <span className="text-[10px] text-emerald-700 font-bold animate-fadeIn">
                      「{copiedTag}」を挿入しました
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {KAKU2_MEMO_TAGS.map((tagItem) => (
                    <button
                      key={tagItem.tag}
                      type="button"
                      onClick={() => handleInsertTag(tagItem.tag)}
                      className="px-2 py-1 bg-white hover:bg-stone-900 hover:text-white border border-stone-300 text-[11px] font-mono text-stone-800 transition-colors cursor-pointer shadow-2xs"
                      title={tagItem.description}
                    >
                      {tagItem.tag}
                    </button>
                  ))}
                </div>
              </div>

              {/* Content Editor */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-stone-700">
                    メモ本文（封筒宛名面の下部・赤線位置に縦書き印刷）:
                  </label>
                  <span className="text-[11px] text-stone-500 font-mono">
                    {currentTemplate.content.length} 文字
                  </span>
                </div>
                <textarea
                  ref={textareaRef}
                  rows={8}
                  value={currentTemplate.content}
                  onChange={(e) => handleUpdateCurrentTemplate({ content: e.target.value })}
                  className="w-full p-3 border border-stone-300 text-xs font-serif leading-relaxed text-stone-900 focus:outline-none focus:border-stone-900 focus:ring-1 focus:ring-stone-900"
                  placeholder="角２封筒宛名面の下部枠内に縦書きで印字する文章を入力してください..."
                />
              </div>
            </div>

            {/* Bottom Controls */}
            <div className="pt-3 border-t border-stone-200 flex items-center justify-between">
              <div>
                {!currentTemplate.isDefault && (
                  <button
                    type="button"
                    onClick={() => handleDeleteTemplate(currentTemplate.id)}
                    className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>このテンプレートを削除</span>
                  </button>
                )}
              </div>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={handleSave}
                  className="px-5 py-2 bg-stone-900 hover:bg-stone-800 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
                >
                  {saveSuccess ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-400" />
                      <span>保存完了</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4 text-[#D4AF37]" />
                      <span>テンプレートを保存</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Right: Live Vertical Preview */}
          <div className="lg:col-span-4 bg-stone-100 p-5 flex flex-col items-center justify-center overflow-y-auto">
            <div className="w-full flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-stone-700 flex items-center gap-1">
                <Eye className="w-3.5 h-3.5 text-stone-600" />
                <span>宛名面仕上がりプレビュー（縮小表示）</span>
              </span>
              <span className="text-[10px] text-stone-500 font-mono">角２封筒 (240×332mm)</span>
            </div>

            {/* Simulated Envelope Preview */}
            <div
              className="bg-[#FAFAF9] border border-stone-400 shadow-md relative overflow-hidden"
              style={{
                width: '260px',
                height: '360px',
              }}
            >
              {/* 郵便番号 */}
              <div
                className="absolute flex items-center justify-end"
                style={{ top: '8px', right: '8px' }}
              >
                {['1', '0', '5', '0', '0', '1', '1'].map((d, i) => (
                  <div
                    key={i}
                    className={`w-[8px] h-[11px] flex items-center justify-center text-[7px] font-bold text-stone-900 ${
                      i === 3 ? 'ml-[3px]' : i > 0 ? 'ml-[1px]' : ''
                    }`}
                    style={{ border: '1px solid #dc2626' }}
                  >
                    {d}
                  </div>
                ))}
              </div>

              {/* 料金別納 */}
              <div
                className="absolute top-[8px] left-[4px] border border-stone-800 p-0.5 text-center flex flex-col items-center justify-center"
                style={{ width: '26px', height: '32px' }}
              >
                <span className="text-[5px] border-b border-stone-800 w-full pb-0.5 font-serif">
                  料金別納
                </span>
                <span className="text-[5px] font-serif pt-0.5">郵便</span>
              </div>

              {/* 住所 (縦書き) */}
              <div
                className="absolute top-[38px] right-[14px] text-stone-800 font-serif"
                style={{
                  writingMode: 'vertical-rl',
                  textOrientation: 'upright',
                  fontSize: '8.5px',
                  lineHeight: '1.4',
                }}
              >
                東京都港区芝公園四❘七❘三十五
              </div>

              {/* 氏名 (上へシフト) */}
              <div
                className="absolute left-[50%] text-stone-950 font-serif font-bold whitespace-nowrap"
                style={{
                  top: '74px',
                  transform: 'translateX(-50%)',
                  writingMode: 'vertical-rl',
                  textOrientation: 'upright',
                  fontSize: '18px',
                  lineHeight: '1.4',
                  letterSpacing: '3px',
                }}
              >
                佐　藤　　謙　一　　様
              </div>

              {/* 差出人 */}
              <div
                className="absolute bottom-[20px] left-[8px] font-serif text-stone-800 text-[6px] leading-tight"
                style={{
                  writingMode: 'vertical-rl',
                  textOrientation: 'upright',
                }}
              >
                <div className="font-bold text-[7px]">慈光山　圓福寺</div>
                <div>東京都港区芝公園四❘七❘三十五</div>
              </div>

              {/* 区切り線 (横線) */}
              <div
                className="absolute"
                style={{
                  bottom: '100px',
                  left: '70px',
                  right: '14px',
                  height: '1px',
                  backgroundColor: '#1c1917',
                }}
              />

              {/* メモ枠 (縦書き文章エリア) */}
              <div
                className="absolute flex flex-col justify-start"
                style={{
                  bottom: '20px',
                  left: '70px',
                  right: '14px',
                  height: '75px',
                  border: '1px solid #1c1917',
                  boxSizing: 'border-box',
                  padding: '4px 6px',
                  overflow: 'hidden',
                }}
              >
                <div
                  className="font-serif text-stone-950 h-full tracking-wide"
                  style={{
                    writingMode: 'vertical-rl',
                    textOrientation: 'upright',
                    fontSize: '7px',
                    lineHeight: '1.5',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {previewText}
                </div>
              </div>
            </div>

            <p className="text-[11px] text-stone-500 mt-2 text-center">
              ※ 印刷時は実寸（240×332mm）に合わせて高精細にレイアウトされます
            </p>
          </div>
        </div>
      </div>

      {/* Save Confirm Modal */}
      <SaveConfirmModal
        isOpen={showSaveConfirm}
        onSaveAndClose={() => {
          handleSave();
          setShowSaveConfirm(false);
          onClose();
        }}
        onDiscardAndClose={() => {
          setShowSaveConfirm(false);
          onClose();
        }}
        onCancel={() => {
          setShowSaveConfirm(false);
        }}
        title="角２宛名面メモテンプレートの変更"
        message="保存されていない変更があります。保存してから閉じますか？"
      />

      {/* Delete Confirm Modal */}
      {templateToDelete && (
        <DeleteConfirmModal
          isOpen={!!templateToDelete}
          onConfirm={executeDeleteTemplate}
          onCancel={() => setTemplateToDelete(null)}
          title="テンプレートの削除"
          message={`角２宛名面メモテンプレート「${templateToDelete.name}」を削除してもよろしいですか？`}
        />
      )}

      {/* Reset to Default Confirm Modal */}
      <DeleteConfirmModal
        isOpen={showResetConfirm}
        onConfirm={executeResetToDefaults}
        onCancel={() => setShowResetConfirm(false)}
        title="初期テンプレートへのリセット"
        message="すべての角２宛名面メモテンプレートを初期標準状態に戻しますか？（追加したカスタムメモテンプレートは削除されます）"
      />
    </div>
  );
};
