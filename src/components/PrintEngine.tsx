import React, { useState, useEffect, useMemo } from 'react';
import { flushSync } from 'react-dom';
import { QRCodeSVG } from 'qrcode.react';
import { 
  Printer, 
  Settings, 
  Users, 
  FileText, 
  ChevronLeft, 
  ChevronRight, 
  Sparkles, 
  Sliders,
  Search,
  Eye,
  RotateCcw
} from 'lucide-react';
import { Household, TempleInfo, TempleProfile } from '../types';
import {
  getPostcardBackTypography,
  getHouseholdSponsorName,
  applyNoticeTemplate,
  getAllSavedNoticeTemplates,
  DEFAULT_HIGAN_TEMPLATE,
  DEFAULT_A4_MEMORIAL_TEMPLATE,
  DEFAULT_A4_GENERAL_TEMPLATE,
  NoticeTemplateItem
} from '../utils/memorialCalculator';
import { safeStorage } from '../utils/storageUtils';
import { PostcardTemplateModal } from './PostcardTemplateModal';
import { A4TemplateModal } from './A4TemplateModal';
import { VerticalNoticeContent } from './VerticalNoticeContent';

interface PrintEngineProps {
  households: Household[];
  templeInfo: TempleInfo;
  temples?: TempleProfile[];
  activeTempleId?: string;
  initialSelectedHouseholdIds?: string[];
  initialCustomMessage?: string;
  onSaveNoticeTemplates?: (templates?: NoticeTemplateItem[]) => void;
}

const DEFAULT_STANDARD_POSTCARD_MESSAGE = `謹啓　時下、檀信徒の皆様におかれましては益々ご清祥のこととお慶び申し上げます。日頃より当寺の護持運営につきまして多大なるご理解とご協力を賜り厚く御礼申し上げます。
　さて、左記の通り法要を執り行いますのでご案内申し上げます。
　つきましては、万障お繰り合わせの上ご参列賜りますようお願い申し上げます。
　時節柄、皆様のご健勝とご多幸を心よりお祈り申し上げます。
　
合掌`;

export const PrintEngine: React.FC<PrintEngineProps> = ({
  households,
  templeInfo,
  temples = [],
  activeTempleId = 'temple-main',
  initialSelectedHouseholdIds = [],
  initialCustomMessage = '',
  onSaveNoticeTemplates,
}) => {
  const [searchFilter, setSearchFilter] = useState<string>('');

  // Primary Document Type: 長3封筒 or 官製はがき
  const [docType, setDocType] = useState<'envelope' | 'postcard'>(initialCustomMessage ? 'postcard' : 'envelope');

  // Sub-modes:
  // For envelope: 'address' (宛名) or 'a4_notice' (案内文（A4）)
  const [envelopeTab, setEnvelopeTab] = useState<'address' | 'a4_notice'>('address');
  // For postcard: 'front' (宛名面) | 'back' (案内文) | 'both' (両面)
  const [postcardTab, setPostcardTab] = useState<'front' | 'back' | 'both'>(initialCustomMessage ? 'back' : 'front');

  const [honorific, setHonorific] = useState<'様' | '殿' | '御中'>('様');
  const [printTargetMode, setPrintTargetMode] = useState<'all' | 'single'>('all');

  // Modals state
  const [isPostcardModalOpen, setIsPostcardModalOpen] = useState<boolean>(false);
  const [isA4ModalOpen, setIsA4ModalOpen] = useState<boolean>(false);

  // Template storage
  const [savedTemplates, setSavedTemplates] = useState<NoticeTemplateItem[]>(() => getAllSavedNoticeTemplates());
  const [selectedPostcardTemplateId, setSelectedPostcardTemplateId] = useState<string>('');
  const [selectedA4TemplateId, setSelectedA4TemplateId] = useState<string>('');

  // Custom text for postcard and A4
  const [customPostcardMessage, setCustomPostcardMessage] = useState<string>(
    initialCustomMessage || DEFAULT_STANDARD_POSTCARD_MESSAGE
  );
  const [customA4Message, setCustomA4Message] = useState<string>(
    DEFAULT_A4_MEMORIAL_TEMPLATE
  );
  const [customA4Title, setCustomA4Title] = useState<string>('年回忌法要のご案内');

  // 寺院HP QRコード印刷の有無設定 (封筒およびA4案内文共通・デフォルトON)
  const [showTempleQrCode, setShowTempleQrCode] = useState<boolean>(() => {
    try {
      const saved = safeStorage.getItem('temple_print_show_temple_qrcode');
      if (saved !== null) {
        return saved === 'true';
      }
      const legacy = safeStorage.getItem('temple_print_show_qrcode');
      if (legacy !== null) {
        return legacy === 'true';
      }
    } catch (e) {
      // ignore
    }
    return true;
  });

  const handleToggleTempleQrCode = (val: boolean) => {
    setShowTempleQrCode(val);
    safeStorage.setItem('temple_print_show_temple_qrcode', String(val));
    safeStorage.setItem('temple_print_show_qrcode', String(val));
  };

  // 施主QRコード印刷の有無設定 (封筒宛名右最下部・はがき宛名面様の30mm左・デフォルトON)
  const [showHouseholdQrCode, setShowHouseholdQrCode] = useState<boolean>(() => {
    try {
      const saved = safeStorage.getItem('temple_print_show_household_qrcode');
      if (saved !== null) {
        return saved === 'true';
      }
    } catch (e) {
      // ignore
    }
    return true;
  });

  const handleToggleHouseholdQrCode = (val: boolean) => {
    setShowHouseholdQrCode(val);
    safeStorage.setItem('temple_print_show_household_qrcode', String(val));
  };

  // Reload saved templates
  const reloadTemplates = () => {
    const loaded = getAllSavedNoticeTemplates();
    setSavedTemplates(loaded);

    if (selectedPostcardTemplateId) {
      const found = loaded.find((t) => t.id === selectedPostcardTemplateId);
      if (found) {
        setCustomPostcardMessage(found.content);
      }
    }
    if (selectedA4TemplateId) {
      const foundA4 = loaded.find((t) => t.id === selectedA4TemplateId);
      if (foundA4) {
        setCustomA4Message(foundA4.content);
        if (foundA4.title) {
          setCustomA4Title(foundA4.title);
        }
      }
    }
  };

  const handleSelectPostcardTemplate = (tplId: string) => {
    setSelectedPostcardTemplateId(tplId);
    if (!tplId) {
      setCustomPostcardMessage(DEFAULT_STANDARD_POSTCARD_MESSAGE);
    } else {
      const found = savedTemplates.find((t) => t.id === tplId);
      if (found) {
        setCustomPostcardMessage(found.content);
      }
    }
  };

  const handleSelectA4Template = (tplId: string) => {
    setSelectedA4TemplateId(tplId);
    if (!tplId) {
      setCustomA4Message(DEFAULT_A4_MEMORIAL_TEMPLATE);
      setCustomA4Title('年回忌法要のご案内');
    } else {
      const found = savedTemplates.find((t) => t.id === tplId);
      if (found) {
        setCustomA4Message(found.content);
        setCustomA4Title(found.title || found.name.replace(/（.*）/, ''));
      }
    }
  };

  // Font size adjustment offset for postcard back
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

  const handleFontSizeChange = (delta: number) => {
    setFontSizeOffset((prev) => {
      const nextVal = Number((prev + delta).toFixed(1));
      if (nextVal < -4) return -4;
      if (nextVal > 6) return 6;
      safeStorage.setItem('temple_notice_fontsize_offset', String(nextVal));
      return nextVal;
    });
  };

  // Font size adjustment offset for A4 vertical text
  const [a4FontSizeOffset, setA4FontSizeOffset] = useState<number>(() => {
    try {
      const saved = safeStorage.getItem('temple_a4_notice_fontsize_offset');
      if (saved !== null) {
        const parsed = parseFloat(saved);
        if (!isNaN(parsed)) return parsed;
      }
    } catch (e) {
      // ignore
    }
    return 0;
  });

  const handleA4FontSizeChange = (delta: number) => {
    setA4FontSizeOffset((prev) => {
      const nextVal = Number((prev + delta).toFixed(1));
      if (nextVal < -4) return -4;
      if (nextVal > 6) return 6;
      safeStorage.setItem('temple_a4_notice_fontsize_offset', String(nextVal));
      return nextVal;
    });
  };

  useEffect(() => {
    if (initialCustomMessage) {
      setCustomPostcardMessage(initialCustomMessage);
      setDocType('postcard');
      setPostcardTab('back');
    }
  }, [initialCustomMessage]);

  const [previewIndex, setPreviewIndex] = useState<number>(0);

  // Target Households: strictly inherit checked records from 檀家名簿 in sorted order
  const targetHouseholds = useMemo(() => {
    if (initialSelectedHouseholdIds && initialSelectedHouseholdIds.length > 0) {
      return households.filter((h) => initialSelectedHouseholdIds.includes(h.id));
    }
    return households;
  }, [households, initialSelectedHouseholdIds]);

  const safePreviewIndex = targetHouseholds.length > 0 ? Math.min(Math.max(0, previewIndex), targetHouseholds.length - 1) : 0;
  const currentPreviewHousehold = targetHouseholds[safePreviewIndex];

  // Filtered households within the target list based on search filter
  const filteredTargetHouseholds = useMemo(() => {
    if (!searchFilter.trim()) return targetHouseholds;
    const term = searchFilter.toLowerCase().trim();
    return targetHouseholds.filter((h) => {
      if (!h) return false;
      return (
        (h.id || '').toLowerCase().includes(term) ||
        (h.familyHead || '').toLowerCase().includes(term) ||
        (h.furigana || '').toLowerCase().includes(term) ||
        (h.address || '').toLowerCase().includes(term) ||
        (h.district || '').toLowerCase().includes(term) ||
        (h.householdType || '').toLowerCase().includes(term) ||
        (h.phone || '').toLowerCase().includes(term) ||
        (h.tombNumber || '').toLowerCase().includes(term) ||
        (h.notes || '').toLowerCase().includes(term) ||
        (h.tanagyoNotes || '').toLowerCase().includes(term)
      );
    });
  }, [targetHouseholds, searchFilter]);

  const executePrint = () => {
    try {
      window.focus();
      window.print();
    } catch (e) {
      console.error("Window print error:", e);
    }
  };

  const handleTriggerPrintAll = () => {
    flushSync(() => {
      setPrintTargetMode('all');
    });
    executePrint();
  };

  const handleTriggerPrintSingle = () => {
    flushSync(() => {
      setPrintTargetMode('single');
    });
    executePrint();
  };

  // Helper to determine accurate sender TempleInfo from `temples` list matching active selection or household
  const getSenderTempleInfo = React.useCallback((household?: Household): TempleInfo => {
    if (activeTempleId && activeTempleId !== 'ALL' && temples && temples.length > 0) {
      const activeMatch = temples.find((t) => t.id === activeTempleId);
      if (activeMatch) return activeMatch;
    }
    if (household?.templeId && temples && temples.length > 0) {
      const hhMatch = temples.find((t) => t.id === household.templeId);
      if (hhMatch) return hhMatch;
    }
    if (temples && temples.length > 0) {
      const mainTemple = temples.find((t) => t.isMain) || temples[0];
      if (mainTemple) return mainTemple;
    }
    return templeInfo;
  }, [activeTempleId, temples, templeInfo]);

  const previewTempleInfo = getSenderTempleInfo(currentPreviewHousehold);

  const printItems = React.useMemo(() => {
    const householdsToPrint =
      printTargetMode === 'single'
        ? currentPreviewHousehold
          ? [currentPreviewHousehold]
          : []
        : targetHouseholds;

    const items: Array<{
      household: Household;
      effectiveDocType: 'envelope' | 'postcard' | 'a4_notice';
      postcardTab: 'front' | 'back';
      key: string;
    }> = [];

    householdsToPrint.forEach((h, hIdx) => {
      if (docType === 'envelope') {
        if (envelopeTab === 'a4_notice') {
          items.push({
            household: h,
            effectiveDocType: 'a4_notice',
            postcardTab: 'front',
            key: `print-${h.id}-a4-${hIdx}`,
          });
        } else {
          items.push({
            household: h,
            effectiveDocType: 'envelope',
            postcardTab: 'front',
            key: `print-${h.id}-env-${hIdx}`,
          });
        }
      } else {
        // docType === 'postcard'
        if (postcardTab === 'both') {
          items.push({ household: h, effectiveDocType: 'postcard', postcardTab: 'front', key: `print-${h.id}-front-${hIdx}` });
          items.push({ household: h, effectiveDocType: 'postcard', postcardTab: 'back', key: `print-${h.id}-back-${hIdx}` });
        } else {
          items.push({
            household: h,
            effectiveDocType: 'postcard',
            postcardTab: postcardTab,
            key: `print-${h.id}-${postcardTab}-${hIdx}`,
          });
        }
      }
    });

    return items;
  }, [printTargetMode, currentPreviewHousehold, targetHouseholds, docType, envelopeTab, postcardTab]);

  return (
    <div className="space-y-3 font-serif">
      {/* Top Banner & Print Controls */}
      <div className="bg-[#1A1A1A] border-b border-[#D4AF37] p-3.5 sm:p-4 shadow-md flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 text-[#F9F7F2] no-print">
        <div>
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-[#D4AF37] text-[#1A1A1A] flex items-center justify-center font-bold font-sans text-xs shrink-0">
              印
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-[#F9F7F2] tracking-wider">長3封筒・はがき 印刷エンジン</h2>
              <div className="text-xs text-[#D4AF37] font-sans flex items-center gap-1.5 mt-0.5">
                <span>差出人寺院:</span>
                <span className="font-bold text-[#F9F7F2]">
                  {previewTempleInfo.mountainName} {previewTempleInfo.name}
                </span>
                {previewTempleInfo.isAffiliated && (
                  <span className="px-1.5 py-0.2 bg-[#333333] border border-[#D4AF37]/40 text-[#D4AF37] text-[10px] rounded-2xs">
                    兼務寺
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 font-sans text-xs">
          {/* Document Type Toggle */}
          <div className="bg-[#2A2A2A] p-1 border border-[#D4AF37]/50 flex space-x-1">
            <button
              onClick={() => setDocType('envelope')}
              className={`px-3 py-1.5 font-bold uppercase tracking-wider transition-colors cursor-pointer ${
                docType === 'envelope' ? 'bg-[#D4AF37] text-[#1A1A1A]' : 'text-[#CCCCCC] hover:text-white'
              }`}
            >
              長3封筒 (120×235mm)
            </button>
            <button
              onClick={() => setDocType('postcard')}
              className={`px-3 py-1.5 font-bold uppercase tracking-wider transition-colors cursor-pointer ${
                docType === 'postcard' ? 'bg-[#D4AF37] text-[#1A1A1A]' : 'text-[#CCCCCC] hover:text-white'
              }`}
            >
              官製はがき (100×148mm)
            </button>
          </div>

          {/* Envelope Sub-Mode Toggle if Envelope is active */}
          {docType === 'envelope' && (
            <div className="bg-[#2A2A2A] p-1 border border-[#D1CEC7]/30 flex space-x-1 animate-fadeIn">
              <button
                onClick={() => setEnvelopeTab('address')}
                className={`px-2.5 py-1.5 font-bold uppercase tracking-wider transition-colors cursor-pointer ${
                  envelopeTab === 'address' ? 'bg-[#1A1A1A] text-[#D4AF37] shadow-xs' : 'text-[#888888] hover:text-stone-300'
                }`}
              >
                宛名
              </button>
              <button
                onClick={() => setEnvelopeTab('a4_notice')}
                className={`px-2.5 py-1.5 font-bold uppercase tracking-wider transition-colors cursor-pointer flex items-center gap-1 ${
                  envelopeTab === 'a4_notice' ? 'bg-[#1A1A1A] text-[#D4AF37] shadow-xs' : 'text-[#888888] hover:text-stone-300'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>案内文（A4）</span>
              </button>
            </div>
          )}

          {/* Postcard Side Toggle if Postcard is active */}
          {docType === 'postcard' && (
            <div className="bg-[#2A2A2A] p-1 border border-[#D1CEC7]/30 flex space-x-1 animate-fadeIn">
              <button
                onClick={() => setPostcardTab('front')}
                className={`px-2 py-1.5 font-bold uppercase tracking-wider transition-colors cursor-pointer ${
                  postcardTab === 'front' ? 'bg-[#1A1A1A] text-[#D4AF37]' : 'text-[#888888] hover:text-stone-300'
                }`}
              >
                宛名面 (表面)
              </button>
              <button
                onClick={() => setPostcardTab('back')}
                className={`px-2 py-1.5 font-bold uppercase tracking-wider transition-colors cursor-pointer ${
                  postcardTab === 'back' ? 'bg-[#1A1A1A] text-[#D4AF37]' : 'text-[#888888] hover:text-stone-300'
                }`}
              >
                案内文 (裏面)
              </button>
              <button
                onClick={() => setPostcardTab('both')}
                className={`px-2 py-1.5 font-bold uppercase tracking-wider transition-colors cursor-pointer ${
                  postcardTab === 'both' ? 'bg-[#1A1A1A] text-[#D4AF37]' : 'text-[#888888] hover:text-stone-300'
                }`}
              >
                両面 (表・裏)
              </button>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {currentPreviewHousehold && (
              <button
                onClick={handleTriggerPrintSingle}
                className="px-3 py-2 bg-[#2A2A2A] hover:bg-[#333333] text-[#F9F7F2] border border-[#D1CEC7]/40 font-bold uppercase tracking-wider transition-colors flex items-center space-x-1 cursor-pointer"
                title="現在プレビュー表示中の1件のみを印刷します"
              >
                <Printer className="w-3.5 h-3.5 text-[#D4AF37]" />
                <span>この1件のみ印刷 ({currentPreviewHousehold.familyHead} 殿)</span>
              </button>
            )}

            <button
              onClick={handleTriggerPrintAll}
              disabled={targetHouseholds.length === 0}
              className="px-4 py-2 bg-[#D4AF37] hover:bg-[#c29f2f] text-[#1A1A1A] font-bold uppercase tracking-wider transition-colors flex items-center space-x-1.5 disabled:opacity-50 shadow-md cursor-pointer"
            >
              <Printer className="w-4 h-4 text-[#1A1A1A]" />
              <span>一括印刷実行 (全 {targetHouseholds.length} 件)</span>
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 no-print">
        {/* Left Column: Recipient Selection & Layout Settings */}
        <div className="lg:col-span-4 space-y-4">
          {/* Target Household Selection Box */}
          <div className="bg-white border border-[#D1CEC7] p-3.5 space-y-2.5 shadow-sm font-sans">
            <div className="flex items-center justify-between border-b border-[#F0EFEA] pb-2">
              <div>
                <h3 className="text-xs font-bold text-[#1A1A1A] flex items-center space-x-1.5 uppercase tracking-wider">
                  <Users className="w-4 h-4 text-[#1A1A1A]" />
                  <span>印刷対象名簿 ({targetHouseholds.length} 件)</span>
                </h3>
                <span className="text-[10px] text-[#888888] block mt-0.5">
                  ※ 檀家名簿でチェックされた対象・ソート順を表示中
                </span>
              </div>
              <span className="text-[10px] font-mono font-bold bg-[#1A1A1A] text-[#D4AF37] px-2 py-0.5 border border-[#D4AF37]/40">
                全 {targetHouseholds.length} 件
              </span>
            </div>

            {/* Quick Filter Search if more than 3 households */}
            {targetHouseholds.length > 3 && (
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[#888888]" />
                <input
                  type="text"
                  placeholder="対象名簿内を絞り込み（氏名・住所・ID）..."
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  className="w-full pl-8 pr-6 py-1 text-[11px] bg-[#F9F7F2] border border-[#D1CEC7] text-[#2D2D2D] focus:border-[#1A1A1A] focus:outline-none"
                />
                {searchFilter && (
                  <button
                    onClick={() => setSearchFilter('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[#888888] hover:text-[#1A1A1A] text-xs cursor-pointer"
                  >
                    ×
                  </button>
                )}
              </div>
            )}

            {/* Recipient Household Items in exact sorted sequence */}
            <div className="max-h-72 sm:max-h-80 overflow-y-auto space-y-1 pr-1 border border-[#D1CEC7] bg-[#F9F7F2] p-1.5">
              {filteredTargetHouseholds.length === 0 ? (
                <div className="p-6 text-center text-xs text-[#888888] space-y-1">
                  <p className="font-bold text-[#555555]">該当する印刷対象世帯がありません</p>
                  <p className="text-[11px]">檀家名簿画面で印刷したい世帯にチェックを入れてください。</p>
                </div>
              ) : (
                filteredTargetHouseholds.map((h) => {
                  const targetIdx = targetHouseholds.findIndex((item) => item.id === h.id);
                  const isCurrentPreview = currentPreviewHousehold?.id === h.id;

                  return (
                    <button
                      key={`print-hh-${h.id}`}
                      onClick={() => {
                        if (targetIdx >= 0) setPreviewIndex(targetIdx);
                      }}
                      className={`w-full flex items-center justify-between p-2 text-left text-xs transition-colors border cursor-pointer ${
                        isCurrentPreview
                          ? 'bg-[#1A1A1A] text-[#D4AF37] font-bold border-[#D4AF37] ring-1 ring-[#D4AF37]'
                          : 'hover:bg-[#EBE7DF] text-[#2D2D2D] bg-white border-[#D1CEC7]'
                      }`}
                      title="クリックしてプレビュー表示を切り替え"
                    >
                      <div className="flex items-start space-x-2 min-w-0 flex-1">
                        <span
                          className={`text-[9px] px-1.5 py-0.5 font-mono flex-shrink-0 mt-0.5 ${
                            isCurrentPreview
                              ? 'bg-[#3D3D3D] text-[#D4AF37]'
                              : 'bg-[#E5E2DA] text-[#666666]'
                          }`}
                        >
                          #{targetIdx + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center space-x-1.5">
                            <span className="font-serif font-bold text-xs truncate">
                              {h.familyHead} 殿
                            </span>
                            {h.householdType && (
                              <span
                                className={`text-[9px] px-1 rounded-none flex-shrink-0 ${
                                  isCurrentPreview
                                    ? 'bg-amber-950/60 text-[#D4AF37]'
                                    : 'bg-amber-50 text-amber-900 border border-amber-200'
                                }`}
                              >
                                {h.householdType}
                              </span>
                            )}
                          </div>
                          <span
                            className={`text-[10px] block truncate mt-0.5 ${
                              isCurrentPreview ? 'text-[#D1CEC7]/80' : 'text-[#666666]'
                            }`}
                          >
                            {h.address || '住所未登録'}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center space-x-1.5 flex-shrink-0 ml-2">
                        {isCurrentPreview && (
                          <span className="text-[9px] px-1.5 py-0.5 bg-[#D4AF37] text-[#1A1A1A] font-bold flex items-center space-x-0.5">
                            <Eye className="w-2.5 h-2.5 inline mr-0.5" />
                            表示中
                          </span>
                        )}
                        <span
                          className={`text-[9px] px-1 py-0.5 font-mono ${
                            isCurrentPreview
                              ? 'bg-[#111111] text-[#D4AF37]'
                              : 'bg-[#EBE7DF] text-[#555555]'
                          }`}
                        >
                          {h.id}
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Honorific & Basic Print Settings Box */}
          <div className="bg-white border border-[#D1CEC7] p-4 space-y-3 text-xs shadow-sm font-sans">
            <h3 className="text-xs font-bold text-[#1A1A1A] border-b border-[#F0EFEA] pb-2 flex items-center space-x-1.5 uppercase tracking-wider">
              <Settings className="w-4 h-4 text-[#1A1A1A]" />
              <span>宛名設定</span>
            </h3>

            <div>
              <label className="block text-[#444444] font-bold mb-1">敬称 (Honorific):</label>
              <div className="flex space-x-2">
                {(['様', '殿', '御中'] as const).map((h) => (
                  <button
                    key={h}
                    onClick={() => setHonorific(h)}
                    className={`px-3 py-1 text-xs font-bold font-serif transition-colors cursor-pointer ${
                      honorific === h ? 'bg-[#1A1A1A] text-[#D4AF37]' : 'bg-[#F9F7F2] border border-[#D1CEC7] text-[#666666]'
                    }`}
                  >
                    {h}
                  </button>
                ))}
              </div>
            </div>

            {/* 封筒・A4案内文用の寺院HP QRコード（※はがき宛名印刷では削除） */}
            {docType === 'envelope' && (
              <div className="pt-2 border-t border-[#F0EFEA]">
                <label className="flex items-center space-x-2 cursor-pointer select-none text-[#333333]">
                  <input
                    type="checkbox"
                    checked={showTempleQrCode}
                    onChange={(e) => handleToggleTempleQrCode(e.target.checked)}
                    className="rounded-xs text-[#1A1A1A] focus:ring-[#D4AF37] h-4 w-4 accent-[#1A1A1A] cursor-pointer"
                  />
                  <span className="font-bold text-xs">寺院HPのQRコードを印刷する</span>
                </label>
                <span className="text-[10px] text-[#888888] block ml-6 mt-0.5">
                  ※ 封筒の差出人欄およびA4案内文末尾の寺院ウェブサイトQRコード
                </span>
              </div>
            )}

            {/* 施主QRコード印刷の有無 (封筒・はがき共通) */}
            <div className={`pt-2 ${docType === 'envelope' ? '' : 'border-t border-[#F0EFEA]'}`}>
              <label className="flex items-center space-x-2 cursor-pointer select-none text-[#333333]">
                <input
                  type="checkbox"
                  checked={showHouseholdQrCode}
                  onChange={(e) => handleToggleHouseholdQrCode(e.target.checked)}
                  className="rounded-xs text-[#1A1A1A] focus:ring-[#D4AF37] h-4 w-4 accent-[#1A1A1A] cursor-pointer"
                />
                <span className="font-bold text-xs">施主QRコードを印刷する</span>
              </label>
              <span className="text-[10px] text-[#888888] block ml-6 mt-0.5">
                {docType === 'envelope'
                  ? '※ 封筒宛名面の右最下部（住所直下・差出人QRと並列）に受付用檀信徒QRを印刷'
                  : '※ はがき宛名面の氏名（様の30mm左）に受付用檀信徒QRを印刷'}
              </span>
            </div>
          </div>

          {/* Postcard Notice Options (案内文オプション - はがき裏面限定) */}
          {docType === 'postcard' && (postcardTab === 'back' || postcardTab === 'both') && (
            <div className="bg-white border border-[#D4AF37] p-4 space-y-3 text-xs shadow-md font-sans animate-fadeIn">
              <div className="flex items-center justify-between border-b border-[#F0EFEA] pb-2">
                <h3 className="text-xs font-bold text-[#1A1A1A] flex items-center space-x-1.5 uppercase tracking-wider">
                  <FileText className="w-4 h-4 text-[#D4AF37]" />
                  <span>案内文オプション</span>
                </h3>
                <button
                  type="button"
                  onClick={() => setIsPostcardModalOpen(true)}
                  className="px-2.5 py-1 bg-[#1A1A1A] hover:bg-[#333333] text-[#D4AF37] border border-[#D4AF37] text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer shadow-2xs"
                  title="はがき案内文テンプレートの追加・編集"
                >
                  <Sliders className="w-3.5 h-3.5 text-[#D4AF37]" />
                  <span>案内文テンプレート</span>
                </button>
              </div>

              {/* Template Selector for Postcard */}
              <div className="space-y-1.5">
                <label className="block text-[#444444] font-bold">はがきテンプレート選択:</label>
                <select
                  value={selectedPostcardTemplateId}
                  onChange={(e) => handleSelectPostcardTemplate(e.target.value)}
                  className="w-full bg-[#F9F7F2] border border-[#D1CEC7] p-1.5 text-xs text-[#2D2D2D] font-serif focus:border-[#1A1A1A] focus:outline-none cursor-pointer"
                >
                  <option value="">（標準の案内文を使用）</option>
                  {savedTemplates
                    .filter((t) => t.type === 'postcard')
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                </select>
              </div>

              {/* Font Size and Textarea */}
              <div className="space-y-2 pt-2 border-t border-[#D1CEC7]">
                <div className="flex items-center justify-between">
                  <label className="block text-[#444444] font-bold">案内状本文 (縦書き印字):</label>
                  <div className="flex items-center space-x-1 bg-[#F9F7F2] border border-[#D1CEC7] px-1.5 py-0.5 shadow-2xs">
                    <span className="text-[10px] text-[#666666] font-bold">文字サイズ:</span>
                    <button
                      type="button"
                      onClick={() => handleFontSizeChange(-0.5)}
                      disabled={fontSizeOffset <= -4}
                      className="w-5 h-5 bg-white hover:bg-[#1A1A1A] hover:text-[#D4AF37] border border-[#D1CEC7] text-[#1A1A1A] font-bold text-xs flex items-center justify-center transition-colors disabled:opacity-40 cursor-pointer"
                      title="文字を小さくする（－0.5pt）"
                    >
                      －
                    </button>
                    <span className="text-[11px] font-mono font-bold px-1 text-[#1A1A1A] min-w-[42px] text-center">
                      {getPostcardBackTypography(customPostcardMessage, fontSizeOffset).fontSize}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleFontSizeChange(0.5)}
                      disabled={fontSizeOffset >= 6}
                      className="w-5 h-5 bg-white hover:bg-[#1A1A1A] hover:text-[#D4AF37] border border-[#D1CEC7] text-[#1A1A1A] font-bold text-xs flex items-center justify-center transition-colors disabled:opacity-40 cursor-pointer"
                      title="文字を大きくする（＋0.5pt）"
                    >
                      ＋
                    </button>
                  </div>
                </div>

                <textarea
                  rows={6}
                  value={customPostcardMessage}
                  onChange={(e) => setCustomPostcardMessage(e.target.value)}
                  className="w-full bg-[#F9F7F2] border border-[#D1CEC7] p-2 text-[#2D2D2D] text-xs font-serif leading-relaxed focus:border-[#1A1A1A] focus:outline-none"
                  placeholder="はがき裏面の案内本文を入力..."
                ></textarea>
              </div>
            </div>
          )}

          {/* A4 Notice Options (案内文オプション - 長3封筒の案内文(A4)選択時限定) */}
          {docType === 'envelope' && envelopeTab === 'a4_notice' && (
            <div className="bg-white border border-[#D4AF37] p-4 space-y-3 text-xs shadow-md font-sans animate-fadeIn">
              <div className="flex items-center justify-between border-b border-[#F0EFEA] pb-2">
                <h3 className="text-xs font-bold text-[#1A1A1A] flex items-center space-x-1.5 uppercase tracking-wider">
                  <FileText className="w-4 h-4 text-[#D4AF37]" />
                  <span>案内文オプション</span>
                </h3>
                <button
                  type="button"
                  onClick={() => setIsA4ModalOpen(true)}
                  className="px-2.5 py-1 bg-[#1A1A1A] hover:bg-[#333333] text-[#D4AF37] border border-[#D4AF37] text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer shadow-2xs"
                  title="A4案内文テンプレートの追加・編集"
                >
                  <Sliders className="w-3.5 h-3.5 text-[#D4AF37]" />
                  <span>案内文テンプレート</span>
                </button>
              </div>

              {/* Template Selector for A4 */}
              <div className="space-y-1.5">
                <label className="block text-[#444444] font-bold">A4テンプレート選択:</label>
                <select
                  value={selectedA4TemplateId}
                  onChange={(e) => handleSelectA4Template(e.target.value)}
                  className="w-full bg-[#F9F7F2] border border-[#D1CEC7] p-1.5 text-xs text-[#2D2D2D] font-serif focus:border-[#1A1A1A] focus:outline-none cursor-pointer"
                >
                  <option value="">（年回忌法要通知書・標準）</option>
                  {savedTemplates
                    .filter((t) => t.type === 'a4')
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                </select>
              </div>

              {/* Title input for A4 document */}
              <div className="space-y-1">
                <label className="block text-[#444444] font-bold flex items-center justify-between">
                  <span>文書表題・タイトル（右端印字）:</span>
                  <span className="text-[10px] text-[#888888] font-normal">※編集可能</span>
                </label>
                <input
                  type="text"
                  value={customA4Title}
                  onChange={(e) => setCustomA4Title(e.target.value)}
                  className="w-full bg-[#F9F7F2] border border-[#D1CEC7] p-1.5 text-xs font-bold text-[#1A1A1A] focus:bg-white focus:border-[#1A1A1A] focus:outline-none"
                  placeholder="例: 年回忌法要のご案内"
                />
              </div>

              {/* Font Size and Textarea for A4 */}
              <div className="space-y-2 pt-2 border-t border-[#D1CEC7]">
                <div className="flex items-center justify-between">
                  <label className="block text-[#444444] font-bold">A4案内状本文 (縦書き印字):</label>
                  <div className="flex items-center space-x-1 bg-[#F9F7F2] border border-[#D1CEC7] px-1.5 py-0.5 shadow-2xs">
                    <span className="text-[10px] text-[#666666] font-bold">文字サイズ:</span>
                    <button
                      type="button"
                      onClick={() => handleA4FontSizeChange(-0.5)}
                      disabled={a4FontSizeOffset <= -4}
                      className="w-5 h-5 bg-white hover:bg-[#1A1A1A] hover:text-[#D4AF37] border border-[#D1CEC7] text-[#1A1A1A] font-bold text-xs flex items-center justify-center transition-colors disabled:opacity-40 cursor-pointer"
                      title="文字を小さくする（－0.5pt）"
                    >
                      －
                    </button>
                    <span className="text-[11px] font-mono font-bold px-1 text-[#1A1A1A] min-w-[42px] text-center">
                      {(13.0 + a4FontSizeOffset).toFixed(1)}pt
                    </span>
                    <button
                      type="button"
                      onClick={() => handleA4FontSizeChange(0.5)}
                      disabled={a4FontSizeOffset >= 6}
                      className="w-5 h-5 bg-white hover:bg-[#1A1A1A] hover:text-[#D4AF37] border border-[#D1CEC7] text-[#1A1A1A] font-bold text-xs flex items-center justify-center transition-colors disabled:opacity-40 cursor-pointer"
                      title="文字を大きくする（＋0.5pt）"
                    >
                      ＋
                    </button>
                  </div>
                </div>

                <textarea
                  rows={8}
                  value={customA4Message}
                  onChange={(e) => setCustomA4Message(e.target.value)}
                  className="w-full bg-[#F9F7F2] border border-[#D1CEC7] p-2 text-[#2D2D2D] text-xs font-serif leading-relaxed focus:border-[#1A1A1A] focus:outline-none"
                  placeholder="A4用紙の案内状本文を入力..."
                ></textarea>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Live Printable Preview */}
        <div className="lg:col-span-8 flex flex-col items-center justify-start space-y-4">
          {targetHouseholds.length > 0 && (
            <div className="flex items-center justify-between w-full max-w-2xl bg-white border border-[#D1CEC7] p-2.5 shadow-sm text-xs text-[#2D2D2D] font-sans">
              <button
                disabled={safePreviewIndex <= 0}
                onClick={() => setPreviewIndex((prev) => Math.max(0, prev - 1))}
                className="px-3 py-1 bg-[#F9F7F2] border border-[#D1CEC7] hover:bg-[#EBE7DF] disabled:opacity-40 flex items-center space-x-1 font-bold cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4 text-[#1A1A1A]" />
                <span>前へ</span>
              </button>

              <span className="font-serif">
                プレビュー: <strong className="text-[#1A1A1A]">{safePreviewIndex + 1}</strong> / {targetHouseholds.length} （{currentPreviewHousehold?.familyHead} 殿）
              </span>

              <button
                disabled={safePreviewIndex >= targetHouseholds.length - 1}
                onClick={() => setPreviewIndex((prev) => Math.min(targetHouseholds.length - 1, prev + 1))}
                className="px-3 py-1 bg-[#F9F7F2] border border-[#D1CEC7] hover:bg-[#EBE7DF] disabled:opacity-40 flex items-center space-x-1 font-bold cursor-pointer"
              >
                <span>次へ</span>
                <ChevronRight className="w-4 h-4 text-[#1A1A1A]" />
              </button>
            </div>
          )}

          {/* Physical Document Canvas Container */}
          <div className="bg-[#1A1A1A] p-6 sm:p-8 border border-[#D1CEC7] shadow-xl overflow-auto w-full flex justify-center">
            {currentPreviewHousehold ? (
              docType === 'envelope' && envelopeTab === 'a4_notice' ? (
                /* A4 Landscape WYSIWYG preview */
                <div className="flex flex-col items-center gap-2">
                  <span className="text-[#D4AF37] text-xs font-sans font-bold tracking-wider">
                    案内文（A4横用紙・縦書き実寸プレビュー）
                  </span>
                  <PreviewCanvas
                    household={currentPreviewHousehold}
                    templeInfo={previewTempleInfo}
                    docType="a4_notice"
                    postcardTab="front"
                    honorific={honorific}
                    customMessage={customA4Message}
                    customTitle={customA4Title}
                    fontSizeOffset={a4FontSizeOffset}
                    showTempleQrCode={showTempleQrCode}
                    showHouseholdQrCode={showHouseholdQrCode}
                  />
                </div>
              ) : docType === 'postcard' && postcardTab === 'both' ? (
                <div className="flex flex-col xl:flex-row items-center gap-6">
                  <div className="flex flex-col items-center gap-2">
                    <span className="text-[#D4AF37] text-xs font-sans font-bold tracking-wider">
                      宛名面 (表面)
                    </span>
                    <PreviewCanvas
                      household={currentPreviewHousehold}
                      templeInfo={previewTempleInfo}
                      docType="postcard"
                      postcardTab="front"
                      honorific={honorific}
                      customMessage={customPostcardMessage}
                      fontSizeOffset={fontSizeOffset}
                      showTempleQrCode={showTempleQrCode}
                      showHouseholdQrCode={showHouseholdQrCode}
                    />
                  </div>
                  <div className="flex flex-col items-center gap-2">
                    <span className="text-[#D4AF37] text-xs font-sans font-bold tracking-wider">
                      案内文 (裏面)
                    </span>
                    <PreviewCanvas
                      household={currentPreviewHousehold}
                      templeInfo={previewTempleInfo}
                      docType="postcard"
                      postcardTab="back"
                      honorific={honorific}
                      customMessage={customPostcardMessage}
                      fontSizeOffset={fontSizeOffset}
                      showTempleQrCode={showTempleQrCode}
                      showHouseholdQrCode={showHouseholdQrCode}
                    />
                  </div>
                </div>
              ) : (
                <PreviewCanvas
                  household={currentPreviewHousehold}
                  templeInfo={previewTempleInfo}
                  docType={docType === 'envelope' ? (envelopeTab === 'a4_notice' ? 'a4_notice' : 'envelope') : 'postcard'}
                  postcardTab={postcardTab}
                  honorific={honorific}
                  customMessage={docType === 'envelope' ? customA4Message : customPostcardMessage}
                  customTitle={customA4Title}
                  fontSizeOffset={docType === 'envelope' ? a4FontSizeOffset : fontSizeOffset}
                  showTempleQrCode={showTempleQrCode}
                  showHouseholdQrCode={showHouseholdQrCode}
                />
              )
            ) : (
              <div className="text-[#888888] py-20 text-center text-xs font-sans">
                印刷対象の世帯を左側のリストから選択してください。
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Hidden Print Container for @media print rendering selected items */}
      <div className="print-only">
        {printItems.map((item, index) => {
          const itemSenderInfo = getSenderTempleInfo(item.household);
          return (
            <PreviewCanvas
              key={item.key}
              household={item.household}
              templeInfo={itemSenderInfo}
              docType={item.effectiveDocType}
              postcardTab={item.postcardTab}
              honorific={honorific}
              customMessage={item.effectiveDocType === 'a4_notice' ? customA4Message : customPostcardMessage}
              customTitle={customA4Title}
              fontSizeOffset={item.effectiveDocType === 'a4_notice' ? a4FontSizeOffset : fontSizeOffset}
              showTempleQrCode={showTempleQrCode}
              showHouseholdQrCode={showHouseholdQrCode}
              isPrint
              isLast={index === printItems.length - 1}
            />
          );
        })}
      </div>

      {/* Postcard Template Settings Modal (官製はがき専用) */}
      <PostcardTemplateModal
        isOpen={isPostcardModalOpen}
        onClose={() => {
          setIsPostcardModalOpen(false);
          reloadTemplates();
        }}
        templeInfo={templeInfo}
        onTemplatesUpdated={(updated) => {
          reloadTemplates();
          if (onSaveNoticeTemplates) {
            onSaveNoticeTemplates(updated);
          }
        }}
      />

      {/* A4 Template Settings Modal (A4用紙専用・横置き縦書き) */}
      <A4TemplateModal
        isOpen={isA4ModalOpen}
        onClose={() => {
          setIsA4ModalOpen(false);
          reloadTemplates();
        }}
        templeInfo={templeInfo}
        onTemplatesUpdated={(updated) => {
          reloadTemplates();
          if (onSaveNoticeTemplates) {
            onSaveNoticeTemplates(updated);
          }
        }}
      />
    </div>
  );
};

// Canvas Component that renders actual 120x235mm (envelope), 100x148mm (postcard), or 297x210mm (A4 landscape)
interface PreviewCanvasProps {
  household: Household;
  templeInfo: TempleInfo;
  docType: 'envelope' | 'postcard' | 'a4_notice';
  postcardTab: 'front' | 'back' | 'both';
  honorific: string;
  customMessage: string;
  customTitle?: string;
  fontSizeOffset?: number;
  showTempleQrCode?: boolean;
  showHouseholdQrCode?: boolean;
  isPrint?: boolean;
  isLast?: boolean;
}

function convertNumberToKanji(nStr: string): string {
  const digits = ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
  const num = parseInt(nStr, 10);
  if (isNaN(num)) return nStr;

  if (nStr.length <= 2 && num <= 99) {
    if (num < 10) return digits[num];
    const tens = Math.floor(num / 10);
    const ones = num % 10;
    const tensStr = tens === 1 ? '十' : digits[tens] + '十';
    const onesStr = ones === 0 ? '' : digits[ones];
    return tensStr + onesStr;
  } else {
    return nStr.split('').map((d) => digits[parseInt(d, 10)] ?? d).join('');
  }
}

function formatVerticalAddress(address: string): string {
  if (!address) return '';
  let cleaned = address.replace(/^〒?\s*\d{3}[-\s]?\d{4}\s*/, '').trim();
  cleaned = cleaned.replace(/[０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xfee0));
  cleaned = cleaned.replace(/\d+/g, (match) => convertNumberToKanji(match));
  cleaned = cleaned.replace(/[-ー–—−―‐〜|｜]/g, '❘');
  return cleaned;
}

function splitVerticalAddress(address: string): [string, string?] {
  if (!address) return [''];
  const formatted = formatVerticalAddress(address);
  const parts = formatted.split(/[\s　]+/);
  if (parts.length >= 2) {
    return [parts[0], parts.slice(1).join('　')];
  }
  return [formatted];
}

function formatRecipientName(fullName: string, honorific: string = '様'): string {
  if (!fullName) return honorific;

  let trimmed = fullName.trim().replace(/[\s　]*(様|殿|御中)$/, '').trim();
  if (!trimmed) return honorific;
  let surname = '';
  let givenName = '';

  if (trimmed.includes(' ') || trimmed.includes('　')) {
    const parts = trimmed.split(/[\s　]+/);
    surname = parts[0] || '';
    givenName = parts.slice(1).join('') || '';
  } else if (trimmed.length === 4) {
    surname = trimmed.slice(0, 2);
    givenName = trimmed.slice(2);
  } else if (trimmed.length === 3) {
    surname = trimmed.slice(0, 2);
    givenName = trimmed.slice(2);
  } else {
    surname = trimmed;
    givenName = '';
  }

  const spacedSurname = surname.split('').join('　');
  const spacedGivenName = givenName.split('').join('　');

  let result = spacedSurname;
  if (spacedGivenName) {
    result += '　　' + spacedGivenName;
  }
  if (honorific) {
    result += '　　' + honorific;
  }

  return result;
}

function formatSpacedTempleName(mountainName?: string, templeName?: string): string {
  const m = (mountainName || '慈光山').trim().split('').join(' ');
  const t = (templeName || '圓福寺').trim().split('').join(' ');
  return `${m}　${t}`;
}

function formatPostalCodeFullWidthDigits(postalCode?: string): string[] {
  if (!postalCode) return [];
  const digitsOnly = postalCode.replace(/[^\d０-９]/g, '');
  const halfToFull: Record<string, string> = {
    '0': '０', '1': '１', '2': '２', '3': '３', '4': '４',
    '5': '５', '6': '６', '7': '７', '8': '８', '9': '９',
    '０': '０', '１': '１', '２': '２', '３': '３', '４': '４',
    '５': '５', '６': '６', '７': '７', '８': '８', '９': '９',
  };
  return digitsOnly.split('').map((d) => halfToFull[d] || d);
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

// 3-column layout for Long 3 Envelope sender (郵便番号+住所, 山号+寺院名, 電話+FAX, 下部にQRコード)
const TempleEnvelopeSenderBlock: React.FC<{
  templeInfo: TempleInfo;
  showQrCode?: boolean;
}> = ({ templeInfo, showQrCode = true }) => {
  const postalDigits = formatVerticalDigitsAndHyphens(templeInfo.postalCode || '367-0033');
  const addrText = formatVerticalAddress(templeInfo.address || '埼玉県本庄市栗崎155');
  const phoneDigits = formatVerticalDigitsAndHyphens(templeInfo.phone || '0495-24-2290');
  const faxDigits = formatVerticalDigitsAndHyphens(templeInfo.fax || '0495-23-1576');

  // 1列目 (右側): 郵便番号 〒 & 住所 (1行連結)
  const postalFormatted = postalDigits ? `〒${postalDigits}` : '';
  const fullAddressLine = [postalFormatted, addrText].filter(Boolean).join('　');

  // 2列目 (中央): 山号 寺院名 (全角1文字分近づけ、文字を少し大きく 19pt、文字間 letter-spacing: 0.52em)
  const mName = (templeInfo.mountainName || '西光山').trim();
  const tName = (templeInfo.name || '宥勝寺').trim();
  const templeFullLine = mName ? `${mName}　${tName}` : tName;

  // 3列目 (左側): 電話番号・FAX番号 (1行連結・文字を少し小さく 6.5pt)
  const phoneFormatted = templeInfo.phone ? `電話${phoneDigits}` : '';
  const faxFormatted = templeInfo.fax ? `FAX${faxDigits}` : '';
  const fullContactLine = [phoneFormatted, faxFormatted].filter(Boolean).join('　');

  return (
    <div
      className="text-stone-950 font-serif flex flex-col items-center select-none"
      style={{ writingMode: 'horizontal-tb' }}
    >
      {/* 3列の縦書きテキスト (隙間は最小限の 1.5mm) */}
      <div className="flex flex-row-reverse items-start justify-center gap-[1.5mm]">
        {/* 1列目 (右側): 郵便番号・住所 */}
        <div
          className="text-stone-900 whitespace-nowrap select-none"
          style={{
            writingMode: 'vertical-rl',
            textOrientation: 'upright',
            fontSize: '8.5pt',
            lineHeight: '1.0',
            letterSpacing: '0.08em',
          }}
        >
          {fullAddressLine}
        </div>

        {/* 2列目 (中央): 山号 寺院名 */}
        <div
          className="text-stone-950 font-bold whitespace-nowrap select-none"
          style={{
            writingMode: 'vertical-rl',
            textOrientation: 'upright',
            fontSize: '19pt',
            lineHeight: '1.0',
            letterSpacing: '0.52em',
          }}
        >
          {templeFullLine}
        </div>

        {/* 3列目 (左側): 電話・FAX */}
        <div
          className="text-stone-900 whitespace-nowrap select-none"
          style={{
            writingMode: 'vertical-rl',
            textOrientation: 'upright',
            fontSize: '6.5pt',
            lineHeight: '1.0',
            letterSpacing: '0.05em',
          }}
        >
          {fullContactLine}
        </div>
      </div>

      {/* QRコード (3列の中央真下に濃紅で配置) */}
      {showQrCode && (
        <div className="flex items-center justify-center shrink-0 mt-[2.5mm]">
          <QRCodeSVG
            value={templeInfo?.website || templeInfo?.websiteUrl || 'https://temple-portal.jp'}
            size={36}
            fgColor="#8B0000"
            bgColor="transparent"
            level="M"
          />
        </div>
      )}
    </div>
  );
};

const TempleSenderVerticalBlock: React.FC<{
  templeInfo: TempleInfo;
  variant: 'envelope' | 'postcard' | 'a4';
  showQrCode?: boolean;
}> = ({ templeInfo, variant, showQrCode = true }) => {
  if (variant === 'envelope') {
    return <TempleEnvelopeSenderBlock templeInfo={templeInfo} showQrCode={showQrCode} />;
  }

  const postalDigits = formatVerticalDigitsAndHyphens(templeInfo.postalCode || '105-0011');
  const addrText = formatVerticalAddress(templeInfo.address || '東京都港区芝公園4-7-35');
  const phoneDigits = formatVerticalDigitsAndHyphens(templeInfo.phone || '03-3432-1234');
  const shouldIncludePhone = Boolean(templeInfo.phone);

  const mainFontSize = variant === 'a4' ? '15pt' : '13pt';
  const subFontSize = variant === 'a4' ? '10pt' : '8.5pt';

  return (
    <div
      className="text-stone-900 font-serif flex flex-col items-end gap-2"
      style={{
        writingMode: 'vertical-rl',
        textOrientation: 'upright',
      }}
    >
      <div
        className="font-bold tracking-widest text-stone-950 whitespace-nowrap"
        style={{ fontSize: mainFontSize, lineHeight: '1.2' }}
      >
        <span>{formatSpacedTempleName(templeInfo.mountainName, templeInfo.name)}</span>
      </div>

      <div
        className="text-stone-800 tracking-wide whitespace-nowrap"
        style={{ fontSize: subFontSize, lineHeight: '1.25' }}
      >
        {postalDigits && (
          <span>
            <span>〒</span>
            <span style={{ fontSize: variant === 'postcard' ? '7.5pt' : '8.5pt' }}>{postalDigits}</span>
            <span>　</span>
          </span>
        )}
        <span>{addrText}</span>
        {shouldIncludePhone && (
          <span>
            <span>　電話</span>
            <span style={{ fontSize: variant === 'postcard' ? '7.5pt' : '8.5pt' }}>{phoneDigits}</span>
          </span>
        )}
      </div>
    </div>
  );
};

const PreviewCanvas: React.FC<PreviewCanvasProps> = ({
  household,
  templeInfo,
  docType,
  postcardTab,
  honorific,
  customMessage,
  customTitle,
  fontSizeOffset = 0,
  showTempleQrCode = true,
  showHouseholdQrCode = true,
  isPrint = false,
  isLast = false,
}) => {
  const zipDigits = formatPostalCodeFullWidthDigits(household.postalCode || '1050011');

  const isA4 = docType === 'a4_notice';
  const canvasWidth = isA4 ? '297mm' : docType === 'envelope' ? '120mm' : '100mm';
  const canvasHeight = isA4 ? '210mm' : docType === 'envelope' ? '235mm' : '148mm';

  return (
    <div
      className={`printable-page bg-[rgb(250,248,245)] text-stone-900 relative font-serif shadow-2xl transition-all ${
        isPrint ? '' : 'border border-[#D1CEC7]'
      } ${isLast ? 'printable-page-last' : ''}`}
      style={{
        width: canvasWidth,
        height: canvasHeight,
        minWidth: canvasWidth,
        minHeight: canvasHeight,
        boxSizing: 'border-box',
        padding: isA4 ? '18mm 20mm' : '8mm',
        userSelect: 'none',
        ...(isA4 && !isPrint
          ? {
              transform: 'scale(0.62)',
              transformOrigin: 'top center',
              marginBottom: '-60mm',
            }
          : {}),
      }}
    >
      {/* 1. 長3封筒 表面 (120mm x 235mm) */}
      {docType === 'envelope' && (
        <div
          className="w-full h-full relative text-stone-900"
          style={{
            transform: 'translate(2mm, 2mm)',
          }}
        >
          {/* 郵便番号枠 (7桁・右揃え) */}
          <div
            className="absolute flex items-center justify-end"
            style={{ top: '4mm', right: '4mm' }}
          >
            {zipDigits.map((digit, idx) => (
              <div
                key={idx}
                className={`w-[5.4mm] h-[7.0mm] flex items-center justify-center font-bold text-stone-950 ${
                  idx === 3 ? 'ml-[2.8mm]' : idx > 0 ? 'ml-[1.2mm]' : ''
                }`}
                style={{ fontSize: '13pt' }}
              >
                {digit}
              </div>
            ))}
          </div>

          {/* 住所 (縦書き) */}
          {(() => {
            const lines = splitVerticalAddress(household.address);
            return (
              <div
                className="absolute top-[22mm] right-[6mm] flex flex-row-reverse gap-[3.5mm] font-serif"
                style={{
                  maxHeight: '160mm',
                }}
              >
                <div
                  className="text-stone-900 tracking-wide select-none"
                  style={{
                    writingMode: 'vertical-rl',
                    textOrientation: 'upright',
                    fontSize: '14pt',
                    lineHeight: '1.4',
                    alignSelf: 'flex-start',
                  }}
                >
                  {lines[0] || ''}
                </div>

                {lines.length > 1 && (
                  <div
                    className="text-stone-900 tracking-wide select-none"
                    style={{
                      writingMode: 'vertical-rl',
                      textOrientation: 'upright',
                      fontSize: '13pt',
                      lineHeight: '1.4',
                      alignSelf: 'flex-start',
                      marginTop: '12mm',
                    }}
                  >
                    {lines[1]}
                  </div>
                )}
              </div>
            );
          })()}

          {/* 宛名 (中央・大文字・4mm左へ移動) */}
          <div
            className="absolute top-[50%] left-[50%] text-stone-950 font-serif font-bold whitespace-nowrap"
            style={{
              transform: 'translate(calc(-50% - 4mm), -50%)',
              writingMode: 'vertical-rl',
              textOrientation: 'upright',
              fontSize: '28pt',
              lineHeight: '1.4',
            }}
          >
            {formatRecipientName(household.familyHead, honorific)}
          </div>

          {/* 差出人情報 (左下・1cm上に配置) */}
          <div className="absolute bottom-[14mm] left-[4mm]">
            <TempleSenderVerticalBlock templeInfo={templeInfo} variant="envelope" showQrCode={showTempleQrCode} />
          </div>

          {/* 施主QRコード (右最下部・寺院HP QRコードと平行・住所と垂直で交わる位置) */}
          {showHouseholdQrCode && (
            <div
              className="absolute bottom-[14mm] right-[6mm] flex flex-col items-center justify-center p-0.5 bg-white select-none"
              style={{
                writingMode: 'horizontal-tb',
              }}
            >
              <QRCodeSVG
                value={(household?.id || 'H001').trim()}
                size={44}
                level="M"
                bgColor="#FFFFFF"
                fgColor="#000000"
                includeMargin={false}
              />
              <span
                className="font-serif text-stone-900 font-bold text-center block mt-0.5 tracking-wider whitespace-nowrap"
                style={{
                  fontSize: '6.5pt',
                  lineHeight: '1.2',
                  writingMode: 'horizontal-tb',
                }}
              >
                御檀家様QR
              </span>
            </div>
          )}
        </div>
      )}

      {/* 2. はがき 宛名面 (100mm x 148mm) */}
      {docType === 'postcard' && postcardTab === 'front' && (
        <div className="w-full h-full relative text-stone-900">
          {/* 郵便番号枠 (7桁・左3mm右へ/右1mm左へ調整・均等割付) */}
          <div
            className="absolute flex items-center justify-between"
            style={{
              top: '6mm',
              right: '-1mm',
              width: '48mm',
            }}
          >
            {zipDigits.map((digit, idx) => (
              <div
                key={idx}
                className="w-[5.2mm] h-[6.8mm] flex items-center justify-center font-bold text-stone-950"
                style={{ fontSize: '12pt' }}
              >
                {digit}
              </div>
            ))}
          </div>

          {/* 住所 (縦書き) */}
          {(() => {
            const lines = splitVerticalAddress(household.address);
            return (
              <div
                className="absolute top-[18mm] right-[4mm] flex flex-row-reverse gap-[2.5mm] font-serif"
                style={{
                  maxHeight: '105mm',
                }}
              >
                <div
                  className="text-stone-900 tracking-wide select-none"
                  style={{
                    writingMode: 'vertical-rl',
                    textOrientation: 'upright',
                    fontSize: '13pt',
                    lineHeight: '1.35',
                    alignSelf: 'flex-start',
                  }}
                >
                  {lines[0] || ''}
                </div>

                {lines.length > 1 && (
                  <div
                    className="text-stone-900 tracking-wide select-none"
                    style={{
                      writingMode: 'vertical-rl',
                      textOrientation: 'upright',
                      fontSize: '12pt',
                      lineHeight: '1.35',
                      alignSelf: 'flex-start',
                      marginTop: '10mm',
                    }}
                  >
                    {lines[1]}
                  </div>
                )}
              </div>
            );
          })()}

          {/* 宛名 (中央・5mm下へ移動) */}
          <div
            className="absolute top-[50%] left-[50%] text-stone-950 font-serif font-bold whitespace-nowrap"
            style={{
              transform: 'translate(-50%, calc(-50% + 5mm))',
              writingMode: 'vertical-rl',
              textOrientation: 'upright',
              fontSize: '20pt',
              lineHeight: '1.4',
            }}
          >
            {formatRecipientName(household.familyHead, honorific)}
            {showHouseholdQrCode && (
              <div
                className="absolute select-none"
                style={{
                  writingMode: 'horizontal-tb',
                  left: '-30mm',
                  bottom: '0mm',
                  transform: 'translateX(-50%)',
                }}
              >
                <div className="flex flex-col items-center justify-center p-0.5 bg-white">
                  <QRCodeSVG
                    value={(household?.id || 'H001').trim()}
                    size={44}
                    level="M"
                    bgColor="#FFFFFF"
                    fgColor="#000000"
                    includeMargin={false}
                  />
                  <span
                    className="font-serif text-stone-900 font-bold text-center block mt-0.5 tracking-wider whitespace-nowrap"
                    style={{
                      fontSize: '6.5pt',
                      lineHeight: '1.2',
                      writingMode: 'horizontal-tb',
                    }}
                  >
                    御檀家様QR
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 3. はがき 裏面 (100mm x 148mm) */}
      {docType === 'postcard' && postcardTab === 'back' && (() => {
        const headName = (household?.familyHead || '').trim();
        const sponsorName = (household ? getHouseholdSponsorName(household) : '') || headName;

        const personalizedMessage = applyNoticeTemplate(
          customMessage || '',
          [],
          '',
          headName,
          templeInfo,
          sponsorName,
          household
        );

        const typography = getPostcardBackTypography(personalizedMessage, fontSizeOffset);
        return (
          <div className="w-full h-full relative text-stone-900 font-serif">
            <div
              className="absolute top-[8mm] right-[8mm] bottom-[8mm] left-[20mm] font-serif text-stone-950 overflow-hidden flex flex-col justify-between"
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
                  text={personalizedMessage.replace(/[\s\n]*合掌\s*$/, '')}
                  household={household}
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

            <div className="absolute bottom-[8mm] left-[4mm]">
              <TempleSenderVerticalBlock templeInfo={templeInfo} variant="postcard" />
            </div>
          </div>
        );
      })()}

      {/* 4. A4用紙 案内文 (横向き 297mm x 210mm・縦書き) */}
      {docType === 'a4_notice' && (() => {
        const headName = (household?.familyHead || '').trim();
        const sponsorName = (household ? getHouseholdSponsorName(household) : '') || headName;

        const personalizedMessage = applyNoticeTemplate(
          customMessage || DEFAULT_A4_MEMORIAL_TEMPLATE,
          [],
          '',
          headName,
          templeInfo,
          sponsorName,
          household
        );

        const effectiveBasePt = Math.max(9, Math.min(18, 13.0 + fontSizeOffset));

        return (
          <div
            className="w-full h-full relative font-serif text-stone-950 flex flex-row-reverse justify-between items-stretch"
            style={{
              writingMode: 'horizontal-tb',
            }}
          >
            {/* Rightmost Section: Title (Top-aligned, separated from body text) */}
            <div
              className="h-full pr-1 pl-4 flex flex-col justify-start items-center shrink-0"
              style={{
                writingMode: 'vertical-rl',
                textOrientation: 'upright',
              }}
            >
              <div
                className="font-bold tracking-widest text-stone-950 text-left pt-0 whitespace-nowrap"
                style={{
                  fontSize: `${(effectiveBasePt * 1.35).toFixed(1)}pt`,
                  lineHeight: '1.2',
                  letterSpacing: '0.22em',
                  maxHeight: '170mm',
                }}
              >
                {customTitle || '年回忌法要のご案内'}
              </div>
            </div>

            {/* Center Main Notice Body Text (Narrow column gap / tighter line-height) */}
            <div
              className="h-full flex-1 px-4 overflow-hidden font-serif text-stone-900"
              style={{
                writingMode: 'vertical-rl',
                textOrientation: 'upright',
                letterSpacing: '0.05em',
              }}
            >
              <VerticalNoticeContent
                text={personalizedMessage}
                household={household}
                templeInfo={templeInfo}
                variant="a4"
                fontSize={`${effectiveBasePt}pt`}
                style={{
                  lineHeight: '1.7',
                  maxHeight: '170mm',
                }}
              />
            </div>

            {/* Leftmost Section: Sender Temple & Red QR Code in a single column (bottom-aligned at document end) */}
            <div
              className="h-full pr-4 pl-1 flex flex-col justify-end items-center shrink-0 font-serif"
              style={{
                writingMode: 'horizontal-tb',
              }}
            >
              <div className="flex flex-col items-center justify-end gap-3">
                {/* 山号寺院名 (縦書き・1行) */}
                <div
                  className="font-bold text-stone-950 whitespace-nowrap"
                  style={{
                    writingMode: 'vertical-rl',
                    textOrientation: 'upright',
                    fontSize: `${(effectiveBasePt * 1.35).toFixed(1)}pt`,
                    letterSpacing: '0.22em',
                    lineHeight: '1',
                  }}
                >
                  {templeInfo.mountainName ? `${templeInfo.mountainName}　${templeInfo.name}` : templeInfo.name}
                </div>

                {/* QRコード (寺院名の真下に濃紅で配置 - 選択可能) */}
                {showTempleQrCode && (
                  <div className="flex items-center justify-center shrink-0 pt-0.5">
                    <QRCodeSVG
                      value={templeInfo?.website || templeInfo?.websiteUrl || 'https://temple-portal.jp'}
                      size={46}
                      fgColor="#8B0000"
                      bgColor="transparent"
                      level="M"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
