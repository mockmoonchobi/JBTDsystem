import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  CheckCircle2, 
  AlertTriangle, 
  Search, 
  UserPlus, 
  SkipForward, 
  Sparkles, 
  Users, 
  BookOpen, 
  Check, 
  X,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  FastForward,
  HelpCircle,
  Link,
  Info
} from 'lucide-react';
import { Household, PastRecord, TempleProfile } from '../types';
import { 
  KakochoItemInput, 
  CandidateHouseholdMatch, 
  LinkingDecision, 
  buildInitialLineageMap,
  evaluateItemMatch,
  registerConfirmedSpiritToLineage,
  sortKakochoItemsDescending,
  LineageHouseholdState,
} from '../utils/kakochoLineageMatching';

interface KakochoLineageConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  rawItems: KakochoItemInput[];
  existingHouseholds: Household[];
  existingPastRecords: PastRecord[];
  targetTempleId: string;
  temples?: TempleProfile[];
  onConfirmDecisions: (decisions: Record<number, LinkingDecision>) => void;
}

export const KakochoLineageConfirmModal: React.FC<KakochoLineageConfirmModalProps> = ({
  isOpen,
  onClose,
  rawItems,
  existingHouseholds,
  existingPastRecords,
  targetTempleId,
  temples = [],
  onConfirmDecisions,
}) => {
  // Sorted items: descending death date (latest deaths first)
  const sortedItems = useMemo(() => {
    return sortKakochoItemsDescending(rawItems);
  }, [rawItems]);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [decisions, setDecisions] = useState<Record<number, LinkingDecision>>({});
  const [lineageMap, setLineageMap] = useState<Map<string, LineageHouseholdState>>(() => {
    return buildInitialLineageMap(existingHouseholds, existingPastRecords, targetTempleId);
  });

  // Search filter for manual household selection
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchingHousehold, setIsSearchingHousehold] = useState(false);
  const [viewMode, setViewMode] = useState<'card' | 'table'>('card');

  // Table row refs to restore / scroll to the actively inspected item
  const rowRefs = useRef<Record<number, HTMLTableRowElement | null>>({});

  // Auto-scroll to current item when switching to table mode
  useEffect(() => {
    if (viewMode === 'table') {
      const timer = setTimeout(() => {
        const targetRow = rowRefs.current[currentIndex];
        if (targetRow) {
          targetRow.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
      }, 60);
      return () => clearTimeout(timer);
    }
  }, [viewMode, currentIndex]);

  // Memoized candidate evaluation cache: avoids heavy re-calculation on every mode switch or render
  const itemCandidatesCache = useMemo(() => {
    const cache = new Map<number, CandidateHouseholdMatch[]>();
    for (const item of sortedItems) {
      cache.set(item.rowIdx, evaluateItemMatch(item, lineageMap, targetTempleId, 80));
    }
    return cache;
  }, [sortedItems, lineageMap, targetTempleId]);

  // Initialize state when modal opens
  useEffect(() => {
    if (isOpen) {
      setCurrentIndex(0);
      setIsSearchingHousehold(false);
      setSearchQuery('');
      setViewMode('card');

      const initialMap = buildInitialLineageMap(existingHouseholds, existingPastRecords, targetTempleId);
      setLineageMap(initialMap);

      // Pre-analyze items to build default suggestions (ONLY if confidence >= 80%)
      const initialDecisions: Record<number, LinkingDecision> = {};
      
      sortedItems.forEach((item) => {
        const candidates = evaluateItemMatch(item, initialMap, targetTempleId, 80);
        const top = candidates[0];

        // 80%以上のみ初期推奨として自動設定
        if (top && top.confidenceScore >= 80) {
          initialDecisions[item.rowIdx] = {
            action: 'link_existing',
            targetHouseholdId: top.household.id,
            targetHouseholdName: top.household.familyHead,
            confirmedByUser: false,
            notes: top.title,
          };
          registerConfirmedSpiritToLineage(initialMap, top.household.id, {
            dharmaName: item.dharmaName,
            secularName: item.secularName,
            deathDate: item.deathDate,
            deathYear: item.deathYear,
            householdHeadName: item.householdHeadName,
          });
        } else {
          // 80%未満は自動で新規檀家を作らず、檀家不明（未紐づけ）をデフォルトとする
          initialDecisions[item.rowIdx] = {
            action: 'skip_unlinked',
            confirmedByUser: false,
            notes: '推奨候補なし（檀家不明）',
          };
        }
      });

      setDecisions(initialDecisions);
    }
  }, [isOpen, sortedItems, existingHouseholds, existingPastRecords, targetTempleId]);

  if (!isOpen || sortedItems.length === 0) return null;

  const currentItem: KakochoItemInput | undefined = sortedItems[currentIndex];

  // Candidates for current item retrieved directly from the memoized cache
  const currentCandidates: CandidateHouseholdMatch[] = currentItem
    ? itemCandidatesCache.get(currentItem.rowIdx) || []
    : [];

  // Top recommended is strictly confidenceScore >= 80%
  const topCandidate = currentCandidates[0];
  const topRecommended = topCandidate && topCandidate.confidenceScore >= 80 ? topCandidate : undefined;
  
  // Other candidates: if top is recommended (>=80%), slice(1), otherwise all candidates
  const otherCandidates = topRecommended ? currentCandidates.slice(1, 9) : currentCandidates.slice(0, 8);

  const currentDecision = currentItem ? decisions[currentItem.rowIdx] : undefined;

  // Filter existing households for manual search
  const filteredHouseholdsForSearch = useMemo(() => {
    if (!searchQuery.trim()) {
      return existingHouseholds.filter(h => (h.templeId || 'temple-main') === targetTempleId).slice(0, 20);
    }
    const q = searchQuery.toLowerCase().replace(/[\s　]/g, '');
    return existingHouseholds.filter((h) => {
      const isTempleMatch = (h.templeId || 'temple-main') === targetTempleId;
      const head = (h.familyHead || '').toLowerCase().replace(/[\s　]/g, '');
      const id = (h.id || '').toLowerCase();
      const addr = (h.address || '').toLowerCase().replace(/[\s　]/g, '');
      const furi = (h.furigana || '').toLowerCase().replace(/[\s　]/g, '');
      return isTempleMatch && (head.includes(q) || id.includes(q) || addr.includes(q) || furi.includes(q));
    }).slice(0, 30);
  }, [existingHouseholds, searchQuery, targetTempleId]);

  // Action: Apply link decision for current item
  const applyDecision = (
    item: KakochoItemInput,
    action: 'link_existing' | 'create_new_household' | 'skip_unlinked',
    targetHousehold?: Household,
    newHeadName?: string,
    autoAdvance = true
  ) => {
    let dec: LinkingDecision;

    if (action === 'link_existing' && targetHousehold) {
      dec = {
        action: 'link_existing',
        targetHouseholdId: targetHousehold.id,
        targetHouseholdName: targetHousehold.familyHead,
        confirmedByUser: true,
      };

      // Register confirmed spirit to dynamic lineage map
      const nextMap = new Map(lineageMap);
      registerConfirmedSpiritToLineage(nextMap, targetHousehold.id, {
        dharmaName: item.dharmaName,
        secularName: item.secularName,
        deathDate: item.deathDate,
        deathYear: item.deathYear,
        householdHeadName: item.householdHeadName,
      });
      setLineageMap(nextMap);
    } else if (action === 'create_new_household') {
      const head = newHeadName || item.householdHeadName || item.currentHeadName || item.secularName || '（世帯主未設定）';
      dec = {
        action: 'create_new_household',
        newHouseholdHeadName: head,
        confirmedByUser: true,
      };
    } else {
      dec = {
        action: 'skip_unlinked',
        confirmedByUser: true,
        notes: '檀家不明（未紐づけ）',
      };
    }

    setDecisions((prev) => ({
      ...prev,
      [item.rowIdx]: dec,
    }));

    setIsSearchingHousehold(false);
    setSearchQuery('');

    if (autoAdvance && currentIndex < sortedItems.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    }
  };

  // Action: Auto-apply top recommendations (confidence >= 80% only). NEVER create new households automatically!
  const handleAcceptAllRecommendations = () => {
    const nextDecisions = { ...decisions };
    const nextMap = new Map(lineageMap);

    sortedItems.forEach((item) => {
      if (nextDecisions[item.rowIdx]?.confirmedByUser) return;

      const candidates = evaluateItemMatch(item, nextMap, targetTempleId, 80);
      const top = candidates[0];

      // 80%以上のみ既存檀家に紐づけ
      if (top && top.confidenceScore >= 80) {
        nextDecisions[item.rowIdx] = {
          action: 'link_existing',
          targetHouseholdId: top.household.id,
          targetHouseholdName: top.household.familyHead,
          confirmedByUser: true,
          notes: top.title,
        };
        registerConfirmedSpiritToLineage(nextMap, top.household.id, {
          dharmaName: item.dharmaName,
          secularName: item.secularName,
          deathDate: item.deathDate,
          deathYear: item.deathYear,
          householdHeadName: item.householdHeadName,
        });
      } else {
        // 80%未満の場合は絶対に勝手に新規檀家を作成せず、檀家不明（未紐づけ）として登録
        nextDecisions[item.rowIdx] = {
          action: 'skip_unlinked',
          confirmedByUser: true,
          notes: '檀家不明（未紐づけ）',
        };
      }
    });

    setDecisions(nextDecisions);
    setLineageMap(nextMap);
    onConfirmDecisions(nextDecisions);
  };

  // Action: Complete and submit decisions
  const handleFinish = () => {
    onConfirmDecisions(decisions);
  };

  // Color Coding Helper based on exact user specification:
  // 95%以上: 緑 (Green)
  // 90-94%: 黄緑色 (Lime)
  // 85-89%: 黄色 (Yellow / Amber)
  // 80-84%: 赤 (Red / Rose)
  const getConfidenceScoreStyle = (score: number) => {
    if (score >= 95) {
      return {
        card: 'bg-gradient-to-br from-emerald-50 via-green-50/50 to-emerald-100/40 border-2 border-emerald-500',
        badge: 'bg-emerald-600 text-white font-bold',
        pill: 'bg-emerald-100 text-emerald-950 border border-emerald-400 font-bold',
        text: 'text-emerald-950',
        subtext: 'text-emerald-900',
        border: 'border-emerald-500',
        button: 'bg-emerald-600 hover:bg-emerald-700 text-white',
        dot: 'bg-emerald-500',
        label: '95%以上（緑）',
      };
    }
    if (score >= 90) {
      return {
        card: 'bg-gradient-to-br from-lime-50 via-emerald-50/40 to-lime-100/40 border-2 border-lime-500',
        badge: 'bg-lime-600 text-white font-bold',
        pill: 'bg-lime-100 text-lime-950 border border-lime-400 font-bold',
        text: 'text-lime-950',
        subtext: 'text-lime-900',
        border: 'border-lime-500',
        button: 'bg-lime-600 hover:bg-lime-700 text-white',
        dot: 'bg-lime-500',
        label: '90-94%（黄緑）',
      };
    }
    if (score >= 85) {
      return {
        card: 'bg-gradient-to-br from-amber-50 via-yellow-50/50 to-orange-50/30 border-2 border-amber-400',
        badge: 'bg-amber-500 text-stone-950 font-bold',
        pill: 'bg-amber-100 text-amber-950 border border-amber-400 font-bold',
        text: 'text-amber-950',
        subtext: 'text-amber-900',
        border: 'border-amber-400',
        button: 'bg-[#D4AF37] hover:bg-[#c49f2c] text-stone-950',
        dot: 'bg-amber-500',
        label: '85-89%（黄）',
      };
    }
    if (score >= 80) {
      return {
        card: 'bg-gradient-to-br from-rose-50 via-red-50/40 to-orange-50/30 border-2 border-rose-400',
        badge: 'bg-rose-600 text-white font-bold',
        pill: 'bg-rose-100 text-rose-950 border border-rose-400 font-bold',
        text: 'text-rose-950',
        subtext: 'text-rose-900',
        border: 'border-rose-400',
        button: 'bg-rose-600 hover:bg-rose-700 text-white',
        dot: 'bg-rose-500',
        label: '80-84%（赤）',
      };
    }
    if (score >= 60) {
      return {
        card: 'bg-sky-50/80 border border-sky-200 hover:border-sky-400 hover:bg-sky-100/70',
        badge: 'bg-sky-100 text-sky-900 border border-sky-300 font-bold',
        pill: 'bg-sky-50 text-sky-900 border border-sky-200',
        text: 'text-sky-950',
        subtext: 'text-sky-900',
        border: 'border-sky-200',
        button: 'bg-sky-700 hover:bg-sky-800 text-white',
        dot: 'bg-sky-400',
        label: '60-79%',
      };
    }
    if (score >= 40) {
      return {
        card: 'bg-[#F9F7F3] border border-[#E0DCD3] hover:border-stone-400 hover:bg-[#F2EFE8]',
        badge: 'bg-stone-200 text-stone-700 border border-stone-300 font-medium',
        pill: 'bg-stone-100 text-stone-700 border border-stone-200',
        text: 'text-stone-800',
        subtext: 'text-stone-700',
        border: 'border-[#E0DCD3]',
        button: 'bg-stone-700 hover:bg-stone-800 text-white',
        dot: 'bg-stone-400',
        label: '40-59%',
      };
    }
    return {
      card: 'bg-white border border-stone-200 hover:border-stone-300 hover:bg-stone-50',
      badge: 'bg-stone-100 text-stone-500 border border-stone-200',
      pill: 'bg-stone-50 text-stone-600 border border-stone-200',
      text: 'text-stone-600',
      subtext: 'text-stone-500',
      border: 'border-stone-200',
      button: 'bg-stone-600 hover:bg-stone-700 text-white',
      dot: 'bg-stone-300',
      label: '40%未満',
    };
  };

  // Counts
  const confirmedCount = Object.values(decisions).filter((d) => d.confirmedByUser).length;
  const totalCount = sortedItems.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-2 sm:p-4 animate-in fade-in duration-150">
      <div className="bg-[#FAF8F5] border border-[#D1CEC7] w-full max-w-6xl h-[94vh] max-h-[760px] rounded-xl shadow-2xl flex flex-col overflow-hidden text-stone-900">
        
        {/* Header - Compact */}
        <div className="bg-[#2D2A26] text-[#FAF8F5] px-4 py-3 flex items-center justify-between border-b border-[#4A453E] shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded bg-[#D4AF37]/20 border border-[#D4AF37] flex items-center justify-center text-[#D4AF37]">
              <Sparkles className="w-4.5 h-4.5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold font-serif tracking-wide text-white">
                  精霊・檀家 照合確認ウィンドウ
                </h2>
                <span className="text-xs font-sans px-2.5 py-0.5 rounded-full bg-[#D4AF37]/25 text-[#E6C65C] border border-[#D4AF37]/40 font-bold">
                  没年月日順・世帯主/施主/備考照合・異体字対応
                </span>
              </div>
              <p className="text-xs text-[#C5BFB8] leading-tight hidden sm:block mt-0.5">
                世帯主・家族施主・先代精霊の俗名・過去帳備考（関係者）や異体字（高田/髙田等）を総合照合。80%以下の場合は勝手に檀家を作らず「檀家不明」として扱います。
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2.5">
            <div className="flex bg-[#3D3A34] rounded p-0.5 border border-[#4A453E] text-xs">
              <button
                type="button"
                onClick={() => setViewMode('card')}
                className={`px-3 py-1.5 rounded font-bold transition-colors ${
                  viewMode === 'card' ? 'bg-[#D4AF37] text-stone-950 shadow-xs' : 'text-stone-300 hover:text-white'
                }`}
              >
                対話照合モード
              </button>
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`px-3 py-1.5 rounded font-bold transition-colors ${
                  viewMode === 'table' ? 'bg-[#D4AF37] text-stone-950 shadow-xs' : 'text-stone-300 hover:text-white'
                }`}
              >
                一覧照合モード
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded text-stone-400 hover:text-white hover:bg-white/10 transition-colors"
              title="閉じる"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Progress & Quick Actions Bar - Compact */}
        <div className="bg-[#EBE7DF] px-4 py-2 border-b border-[#D1CEC7] flex flex-wrap items-center justify-between gap-2 text-xs sm:text-sm shrink-0">
          <div className="flex items-center space-x-3">
            <span className="font-bold text-stone-800 text-xs sm:text-sm">
              進捗: <span className="text-[#8C6B14] font-extrabold text-base">{confirmedCount}</span> / {totalCount} 件確認済み
            </span>
            <div className="w-24 sm:w-36 h-2 bg-stone-300 rounded-full overflow-hidden">
              <div
                className="h-full bg-[#D4AF37] transition-all duration-300"
                style={{ width: `${(confirmedCount / totalCount) * 100}%` }}
              />
            </div>
          </div>

          {/* Color Legend */}
          <div className="hidden md:flex items-center space-x-2 text-[11px] bg-white/80 px-2.5 py-1 rounded border border-stone-300 text-stone-700">
            <span className="font-bold text-stone-500">推奨適合度:</span>
            <span className="flex items-center gap-1 font-bold text-emerald-800"><span className="w-2 h-2 rounded-full bg-emerald-600"></span>95%〜(緑)</span>
            <span className="flex items-center gap-1 font-bold text-lime-800"><span className="w-2 h-2 rounded-full bg-lime-600"></span>90-94%(黄緑)</span>
            <span className="flex items-center gap-1 font-bold text-amber-800"><span className="w-2 h-2 rounded-full bg-amber-500"></span>85-89%(黄)</span>
            <span className="flex items-center gap-1 font-bold text-rose-800"><span className="w-2 h-2 rounded-full bg-rose-600"></span>80-84%(赤)</span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={handleAcceptAllRecommendations}
              className="px-3 py-1.5 rounded-md bg-amber-100 hover:bg-amber-200 border border-amber-300 text-amber-950 font-bold text-xs flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
              title="適合度80%以上の精霊のみ既存檀家に紐づけ、それ以外は新規檀家を作らず檀家不明として一括反映します"
            >
              <FastForward className="w-3.5 h-3.5 text-amber-700" />
              推奨候補（80%以上）で一括承認
            </button>
            <button
              type="button"
              onClick={handleFinish}
              className="px-3.5 py-1.5 rounded-md bg-[#2D2A26] hover:bg-black text-white font-bold text-xs flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
            >
              <Check className="w-3.5 h-3.5 text-[#D4AF37]" />
              確認完了
            </button>
          </div>
        </div>

        {/* Content Body */}
        {viewMode === 'card' && currentItem ? (
          <div className="flex-1 p-3 sm:p-4 overflow-hidden flex flex-col min-h-0">
            
            {/* 2-Column Split Layout to avoid vertical scrollbar */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 flex-1 min-h-0 overflow-hidden">
              
              {/* LEFT COLUMN: Target Spirit Info & Nav (lg:col-span-5) */}
              <div className="lg:col-span-5 flex flex-col gap-2.5 min-h-0 overflow-y-auto pr-0.5">
                
                {/* Navigation Bar */}
                <div className="flex items-center justify-between bg-white border border-stone-200 px-3.5 py-2 rounded-lg shrink-0 shadow-2xs">
                  <div className="flex items-center space-x-2">
                    <span className="px-2.5 py-0.5 rounded bg-[#2D2A26] text-amber-300 font-bold text-xs">
                      #{currentIndex + 1} / {totalCount}
                    </span>
                    <span className="text-xs text-stone-600 font-medium">
                      没年月日順
                    </span>
                  </div>

                  <div className="flex items-center space-x-1.5">
                    <button
                      type="button"
                      disabled={currentIndex === 0}
                      onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
                      className="px-2.5 py-1 rounded border border-stone-300 bg-stone-50 text-stone-800 text-xs font-bold flex items-center gap-1 disabled:opacity-40 hover:bg-stone-100 cursor-pointer"
                    >
                      <ChevronLeft className="w-4 h-4" /> 前へ
                    </button>
                    <button
                      type="button"
                      disabled={currentIndex === sortedItems.length - 1}
                      onClick={() => setCurrentIndex((prev) => Math.min(sortedItems.length - 1, prev + 1))}
                      className="px-2.5 py-1 rounded border border-stone-300 bg-stone-50 text-stone-800 text-xs font-bold flex items-center gap-1 disabled:opacity-40 hover:bg-stone-100 cursor-pointer"
                    >
                      次へ <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Target Spirit Information Card */}
                <div className="bg-white border border-stone-300 rounded-xl p-3.5 shadow-xs space-y-2.5 shrink-0">
                  <div className="text-xs font-bold uppercase tracking-wider text-stone-700 flex items-center justify-between border-b border-stone-200 pb-1.5">
                    <span className="flex items-center gap-1.5">
                      <BookOpen className="w-4 h-4 text-stone-800" />
                      取り込み精霊データ（ファイル記載情報）
                    </span>
                    {currentDecision && (
                      <span className={`text-xs px-2.5 py-0.5 rounded-full font-bold border ${
                        currentDecision.action === 'link_existing' ? 'bg-green-100 text-green-900 border-green-300' :
                        currentDecision.action === 'create_new_household' ? 'bg-blue-100 text-blue-900 border-blue-300' :
                        'bg-stone-200 text-stone-700 border-stone-300'
                      }`}>
                        {currentDecision.action === 'link_existing' ? '紐づけ設定中' :
                         currentDecision.action === 'create_new_household' ? '新規檀家作成' : '檀家不明'}
                      </span>
                    )}
                  </div>

                  <div className="space-y-2 text-xs sm:text-sm">
                    <div className="bg-stone-50 p-2.5 rounded-lg border border-stone-200">
                      <span className="text-xs text-stone-500 block mb-0.5">戒名・法名</span>
                      <span className="text-base sm:text-lg font-bold font-serif text-stone-900 break-all leading-tight">
                        {currentItem.dharmaName || '（戒名未記載）'}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-stone-50 p-2 rounded-lg border border-stone-200">
                        <span className="text-xs text-stone-500 block mb-0.5">俗名（氏名）</span>
                        <span className="text-sm font-bold text-stone-900">
                          {currentItem.secularName ? `${currentItem.secularName} 様` : '（俗名未記載）'}
                        </span>
                      </div>
                      <div className="bg-stone-50 p-2 rounded-lg border border-stone-200">
                        <span className="text-xs text-stone-500 block mb-0.5">没年月日（命日）</span>
                        <span className="text-sm font-bold text-stone-800">
                          {currentItem.deathDate || currentItem.rawDeathDate || '（未記載）'}
                        </span>
                        {currentItem.deathYear && (
                          <span className="text-xs text-stone-500 block mt-0.5">
                            （{new Date().getFullYear() - currentItem.deathYear}年前）
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Household Head / Sponsor Matching Keys */}
                    <div className="bg-amber-50/90 p-2.5 rounded-lg border border-amber-200 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-amber-900">
                          当時の施主名（ファイル記載）:
                        </span>
                        <span className="text-sm sm:text-base font-extrabold text-amber-950">
                          {currentItem.householdHeadName ? `【${currentItem.householdHeadName}】様` : '（未記載）'}
                        </span>
                      </div>
                      {currentItem.currentHeadName && (
                        <div className="flex items-center justify-between border-t border-amber-200/60 pt-1.5">
                          <span className="text-xs font-bold text-amber-900">
                            現施主・世帯主名:
                          </span>
                          <span className="text-sm font-bold text-amber-950">
                            {currentItem.currentHeadName} 様
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Remarks / Hints Display */}
                    {(currentItem.notes || currentItem.specialRemarks) && (
                      <div className="bg-stone-100 p-2 rounded-lg border border-stone-200 space-y-0.5">
                        <span className="text-[11px] font-bold text-stone-600 block">
                          過去帳の備考・関係者情報（照合ヒント）:
                        </span>
                        <div className="text-xs text-stone-800 font-medium">
                          {currentItem.notes || currentItem.specialRemarks}
                        </div>
                      </div>
                    )}

                    {/* Metadata chips */}
                    <div className="grid grid-cols-2 gap-1.5 text-xs text-stone-700 pt-0.5">
                      {currentItem.relationship && (
                        <div className="bg-stone-100 px-2.5 py-1 rounded truncate">続柄: <strong>{currentItem.relationship}</strong></div>
                      )}
                      {currentItem.ageAtDeath !== undefined && (
                        <div className="bg-stone-100 px-2.5 py-1 rounded truncate">享年: <strong>{currentItem.ageAtDeath}歳</strong></div>
                      )}
                      {currentItem.burialLocation && (
                        <div className="bg-stone-100 px-2.5 py-1 rounded truncate">墓地: <strong>{currentItem.burialLocation}</strong></div>
                      )}
                      {currentItem.rawHouseholdId && (
                        <div className="bg-stone-100 px-2.5 py-1 rounded truncate">原ID: <strong>{currentItem.rawHouseholdId}</strong></div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Status / Decision Summary Card */}
                <div className="bg-stone-100 border border-stone-200 rounded-lg p-2.5 text-xs space-y-1 text-stone-700">
                  <div className="font-bold flex items-center gap-1 text-stone-800 text-xs">
                    <Info className="w-4 h-4 text-stone-500" />
                    現在の照合ステータス:
                  </div>
                  {currentDecision ? (
                    currentDecision.action === 'link_existing' ? (
                      <div className="text-green-800 font-bold bg-green-50 p-2 rounded border border-green-200 flex items-center justify-between text-xs sm:text-sm">
                        <span>檀家「{currentDecision.targetHouseholdName} 様」に紐づけ</span>
                        <span className="font-mono text-xs text-green-700">ID: {currentDecision.targetHouseholdId}</span>
                      </div>
                    ) : currentDecision.action === 'create_new_household' ? (
                      <div className="text-blue-800 font-bold bg-blue-50 p-2 rounded border border-blue-200 text-xs sm:text-sm">
                        新規檀家「{currentDecision.newHouseholdHeadName}」として作成（手動指定）
                      </div>
                    ) : (
                      <div className="text-stone-600 bg-stone-200/70 p-2 rounded border border-stone-300 text-xs sm:text-sm">
                        檀家不明（未紐づけのまま精霊登録）
                      </div>
                    )
                  ) : (
                    <div className="text-stone-500">未決定</div>
                  )}
                </div>

              </div>

              {/* RIGHT COLUMN: Matching Recommendations & Other Candidates (lg:col-span-7) */}
              <div className="lg:col-span-7 flex flex-col gap-2.5 min-h-0 overflow-y-auto pl-0.5">
                
                {/* 1. System Recommended Candidate (>= 80% only with color coding) */}
                {topRecommended ? (
                  (() => {
                    const recStyle = getConfidenceScoreStyle(topRecommended.confidenceScore);
                    return (
                      <div className={`rounded-xl p-3.5 shadow-sm relative shrink-0 ${recStyle.card}`}>
                        <div className="flex items-center justify-between mb-2">
                          <div className={`${recStyle.badge} px-3 py-0.5 rounded-full text-xs font-extrabold flex items-center gap-1.5 shadow-xs`}>
                            <Sparkles className="w-4 h-4" />
                            システム推奨候補（適合度: {topRecommended.confidenceScore}% ・ {recStyle.label}）
                          </div>
                          {topRecommended.isVariantMatch && (
                            <span className="text-xs font-bold text-amber-900 bg-white/90 px-2.5 py-0.5 rounded border border-amber-300">
                              異体字一致（高田/髙田等）
                            </span>
                          )}
                        </div>

                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                          <div className="space-y-1.5 flex-1">
                            <div className="flex items-center space-x-2">
                              <span className="text-lg sm:text-xl font-bold font-serif text-stone-900">
                                {topRecommended.household.familyHead} 様
                              </span>
                              <span className="text-xs px-2 py-0.5 bg-white/80 text-stone-800 border border-stone-300 rounded font-mono font-bold">
                                ID: {topRecommended.household.id}
                              </span>
                              {topRecommended.household.district && (
                                <span className="text-xs px-2 py-0.5 bg-stone-100 text-stone-700 rounded">
                                  {topRecommended.household.district}
                                </span>
                              )}
                            </div>

                            <div className="text-xs sm:text-sm text-stone-600 leading-tight">
                              {topRecommended.household.address && <span>住所: {topRecommended.household.address} </span>}
                              {topRecommended.household.tombNumber && <span>/ 墓地: {topRecommended.household.tombNumber}</span>}
                            </div>

                            <div className="text-xs sm:text-sm bg-white/95 border border-stone-200 p-2 rounded-lg text-stone-900 flex items-start space-x-2 shadow-2xs">
                              <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                              <div className="leading-snug">
                                <strong className="font-bold text-stone-950">{topRecommended.title}: </strong>
                                {topRecommended.explanation}
                              </div>
                            </div>
                          </div>

                          <div className="shrink-0 flex items-center sm:flex-col gap-2">
                            <button
                              type="button"
                              onClick={() => applyDecision(currentItem, 'link_existing', topRecommended.household)}
                              className={`w-full px-5 py-2.5 rounded-lg font-bold text-xs sm:text-sm shadow-sm flex items-center justify-center gap-1.5 transition-all transform active:scale-95 cursor-pointer ${recStyle.button}`}
                            >
                              <CheckCircle2 className="w-4.5 h-4.5" />
                              <span>この檀家に紐づける</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })()
                ) : (
                  <div className="bg-stone-50 border border-stone-300 rounded-xl p-3.5 text-xs sm:text-sm text-stone-700 space-y-1 shrink-0">
                    <div className="flex items-center gap-1.5 font-bold text-amber-900 text-sm">
                      <AlertTriangle className="w-4.5 h-4.5 text-amber-600 shrink-0" />
                      <span>適合度80%以上のシステム推奨候補はありません</span>
                    </div>
                    <p className="text-xs text-stone-600 leading-relaxed">
                      判定基準（80%）を満たさないため、自動で新規檀家を作成せず「檀家不明（未紐づけ）」として扱います。下記の候補から選択するか、名簿検索から指定してください。
                    </p>
                  </div>
                )}

                {/* 2. Other Candidates (Color coded by confidence score %) */}
                <div className="space-y-1.5 flex-1 min-h-0 flex flex-col">
                  <div className="text-xs sm:text-sm font-bold text-stone-700 flex items-center justify-between shrink-0">
                    <span className="flex items-center gap-1">
                      <Users className="w-4 h-4 text-stone-500" />
                      その他の候補（適合度％別色分け・同姓・類似住所・他寺院）:
                    </span>
                    <span className="text-xs text-stone-500 font-normal">
                      クリックして紐づけ先を変更
                    </span>
                  </div>

                  {otherCandidates.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 overflow-y-auto pr-0.5 max-h-[210px]">
                      {otherCandidates.map((cand, cIdx) => {
                        const style = getConfidenceScoreStyle(cand.confidenceScore);
                        return (
                          <div
                            key={cIdx}
                            className={`border rounded-lg p-2.5 transition-all flex flex-col justify-between gap-1.5 text-xs sm:text-sm ${style.card}`}
                          >
                            <div className="flex items-start justify-between gap-1.5">
                              <div className="truncate">
                                <div className="font-bold text-stone-900 truncate flex items-center gap-1.5 text-sm">
                                  <span>{cand.household.familyHead} 様</span>
                                  <span className="font-mono text-stone-600 text-xs">({cand.household.id})</span>
                                </div>
                                <div className="text-xs text-stone-600 truncate mt-0.5">
                                  {cand.household.address || cand.explanation}
                                </div>
                              </div>

                              <span className={`text-xs px-2 py-0.5 rounded border shrink-0 font-bold ${style.badge}`}>
                                {cand.confidenceScore}%
                              </span>
                            </div>

                            <div className="flex items-center justify-between pt-1 border-t border-stone-200/60">
                              <span className="text-xs text-stone-700 truncate max-w-[170px]" title={cand.title}>
                                {cand.title}
                              </span>
                              <button
                                type="button"
                                onClick={() => applyDecision(currentItem, 'link_existing', cand.household)}
                                className="px-2.5 py-1 rounded bg-white hover:bg-stone-100 text-stone-900 font-bold border border-stone-300 text-xs shadow-2xs shrink-0 cursor-pointer"
                              >
                                この檀家に指定
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="bg-stone-50 border border-stone-200 rounded-lg p-3 text-center text-xs text-stone-500">
                      その他の候補はありません
                    </div>
                  )}
                </div>

                {/* 3. Action Bar: Skip as Unlinked / Manual Search / Explicit New Household */}
                <div className="bg-white border border-stone-200 rounded-xl p-3 space-y-2.5 shrink-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setIsSearchingHousehold(!isSearchingHousehold)}
                      className="text-xs sm:text-sm font-bold text-stone-800 hover:text-amber-800 flex items-center gap-1 cursor-pointer"
                    >
                      <Search className="w-4 h-4 text-stone-500" />
                      名簿内を自由検索して紐づけ {isSearchingHousehold ? '▲ 閉じる' : '▼ 検索窓を開く'}
                    </button>

                    <div className="flex items-center space-x-2">
                      <button
                        type="button"
                        onClick={() => applyDecision(currentItem, 'skip_unlinked')}
                        className="px-3 py-1.5 rounded-md bg-stone-100 hover:bg-stone-200 text-stone-800 border border-stone-300 font-bold text-xs sm:text-sm flex items-center gap-1.5 cursor-pointer"
                        title="檀家IDなし（檀家不明の精霊）として取り込みます。檀家数は増えません。"
                      >
                        <SkipForward className="w-3.5 h-3.5" />
                        檀家不明（未紐づけ）
                      </button>

                      <button
                        type="button"
                        onClick={() => applyDecision(currentItem, 'create_new_household')}
                        className="px-3 py-1.5 rounded-md bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-300 font-bold text-xs sm:text-sm flex items-center gap-1.5 cursor-pointer"
                        title="明示的に新規檀家を作成したい場合のみクリックしてください"
                      >
                        <UserPlus className="w-3.5 h-3.5 text-emerald-700" />
                        新規檀家として登録
                      </button>
                    </div>
                  </div>

                  {isSearchingHousehold && (
                    <div className="pt-2 space-y-2 border-t border-stone-100 animate-in fade-in duration-100">
                      <div className="relative">
                        <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-stone-400" />
                        <input
                          type="text"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder="檀家名、ID、フリガナ、住所で検索..."
                          className="w-full pl-9 pr-3 py-1.5 text-xs sm:text-sm border border-stone-300 rounded-md focus:outline-none focus:border-amber-600 bg-stone-50"
                          autoFocus
                        />
                      </div>

                      <div className="max-h-32 overflow-y-auto space-y-1 border border-stone-200 rounded-md p-1.5 bg-stone-50">
                        {filteredHouseholdsForSearch.length === 0 ? (
                          <div className="p-2 text-center text-xs text-stone-500">
                            一致する檀家が見つかりませんでした。
                          </div>
                        ) : (
                          filteredHouseholdsForSearch.map((h) => (
                            <div
                              key={h.id}
                              className="p-2 hover:bg-white rounded border border-transparent hover:border-stone-300 transition-colors flex items-center justify-between text-xs sm:text-sm"
                            >
                              <div className="truncate">
                                <span className="font-bold text-stone-900">{h.familyHead} 様</span>
                                <span className="text-stone-500 font-mono ml-2 text-xs">[{h.id}]</span>
                                {h.address && <span className="text-stone-500 ml-2 text-xs">/ {h.address}</span>}
                              </div>
                              <button
                                type="button"
                                onClick={() => applyDecision(currentItem, 'link_existing', h)}
                                className="px-2.5 py-1 bg-[#2D2A26] text-white hover:bg-black rounded font-bold text-xs shrink-0 cursor-pointer"
                              >
                                指定
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>

              </div>

            </div>

          </div>
        ) : (
          /* Table Overview Mode */
          <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs sm:text-sm text-stone-600">
              <div>
                全 {sortedItems.length} 件の精霊データと紐づけ決定状況の一覧です。クリックして詳細確認・変更できます。
              </div>
              <div className="flex items-center gap-2 text-xs text-stone-500">
                <span className="font-bold">適合度色分け:</span>
                <span className="text-emerald-800 font-bold">🟢 95%以上</span>
                <span className="text-lime-800 font-bold">🟢 90-94%</span>
                <span className="text-amber-800 font-bold">🟡 85-89%</span>
                <span className="text-rose-800 font-bold">🔴 80-84%</span>
              </div>
            </div>

            <div className="border border-stone-200 rounded-lg overflow-hidden bg-white shadow-xs">
              <table className="w-full text-xs sm:text-sm text-left border-collapse">
                <thead className="bg-stone-100 text-stone-700 font-bold border-b border-stone-200 sticky top-0 z-10">
                  <tr>
                    <th className="p-2.5 text-center w-12">#</th>
                    <th className="p-2.5">没年月日</th>
                    <th className="p-2.5">戒名・法名</th>
                    <th className="p-2.5">俗名</th>
                    <th className="p-2.5">当時の施主名</th>
                    <th className="p-2.5">照合・紐づけ先</th>
                    <th className="p-2.5 text-center w-28">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {sortedItems.map((item, idx) => {
                    const dec = decisions[item.rowIdx];
                    // Fast cache lookup: zero re-calculation
                    const candidates = itemCandidatesCache.get(item.rowIdx) || [];
                    const top = candidates[0];
                    const isTopRecommended = top && top.confidenceScore >= 80;

                    return (
                      <tr
                        key={item.rowIdx}
                        id={`kakocho-table-row-${idx}`}
                        ref={(el) => {
                          rowRefs.current[idx] = el;
                        }}
                        className={`transition-colors ${
                          idx === currentIndex
                            ? 'bg-amber-100/70 border-l-4 border-l-[#D4AF37] font-medium shadow-2xs'
                            : 'hover:bg-amber-50/50'
                        }`}
                      >
                        <td className="p-2.5 text-center text-stone-500 font-mono">{idx + 1}</td>
                        <td className="p-2.5 whitespace-nowrap">{item.deathDate || item.rawDeathDate || '-'}</td>
                        <td className="p-2.5 font-serif font-bold text-stone-900 text-sm">{item.dharmaName || '-'}</td>
                        <td className="p-2.5">{item.secularName ? `${item.secularName} 様` : '-'}</td>
                        <td className="p-2.5 font-bold text-amber-950">
                          {item.householdHeadName ? `【${item.householdHeadName}】` : '-'}
                        </td>
                        <td className="p-2.5">
                          {dec ? (
                            dec.action === 'link_existing' ? (
                              (() => {
                                const matchedCand = candidates.find((c) => c.household.id === dec.targetHouseholdId);
                                const score = matchedCand
                                  ? matchedCand.confidenceScore
                                  : top?.household.id === dec.targetHouseholdId
                                  ? top.confidenceScore
                                  : undefined;
                                const scoreStyle = score !== undefined ? getConfidenceScoreStyle(score) : null;
                                return (
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    {scoreStyle ? (
                                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-bold ${scoreStyle.pill}`}>
                                        <span className={`w-2 h-2 rounded-full ${scoreStyle.dot}`} />
                                        <span>{score}%</span>
                                        <span className="font-extrabold">{dec.targetHouseholdName} 様</span>
                                        <span className="font-mono text-[11px] opacity-75">({dec.targetHouseholdId})</span>
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1.5 text-stone-800 font-bold bg-stone-100 px-2.5 py-1 rounded border border-stone-300 text-xs">
                                        <Check className="w-3.5 h-3.5 text-stone-600" />
                                        <span>{dec.targetHouseholdName} 様</span>
                                        <span className="font-mono text-[11px] text-stone-500">({dec.targetHouseholdId})</span>
                                      </span>
                                    )}
                                  </div>
                                );
                              })()
                            ) : dec.action === 'create_new_household' ? (
                              <span className="inline-flex items-center gap-1.5 text-indigo-900 font-bold bg-indigo-50 px-2.5 py-1 rounded border border-indigo-200 text-xs">
                                <UserPlus className="w-3.5 h-3.5 text-indigo-600" />
                                新規檀家「{dec.newHouseholdHeadName}」
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-stone-500 font-medium bg-stone-100 px-2 py-0.5 rounded border border-stone-200 text-xs">
                                <SkipForward className="w-3 h-3 text-stone-400" />
                                檀家不明（未紐づけ）
                              </span>
                            )
                          ) : isTopRecommended ? (
                            (() => {
                              const scoreStyle = getConfidenceScoreStyle(top.confidenceScore);
                              return (
                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-bold ${scoreStyle.pill}`}>
                                  <span className={`w-2 h-2 rounded-full ${scoreStyle.dot} animate-pulse`} />
                                  <span>推奨: {top.household.familyHead} 様 ({top.confidenceScore}%)</span>
                                </span>
                              );
                            })()
                          ) : top ? (
                            (() => {
                              const scoreStyle = getConfidenceScoreStyle(top.confidenceScore);
                              return (
                                <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs ${scoreStyle.pill}`}>
                                  <span className={`w-1.5 h-1.5 rounded-full ${scoreStyle.dot}`} />
                                  <span>候補あり: {top.household.familyHead} 様 ({top.confidenceScore}%)</span>
                                </span>
                              );
                            })()
                          ) : (
                            <span className="text-stone-400 text-xs italic">檀家不明</span>
                          )}
                        </td>
                        <td className="p-2.5 text-center">
                          <button
                            type="button"
                            onClick={() => {
                              setCurrentIndex(idx);
                              setViewMode('card');
                            }}
                            className={`px-3 py-1 rounded font-bold text-xs border cursor-pointer ${
                              idx === currentIndex
                                ? 'bg-[#2D2A26] text-white border-[#2D2A26]'
                                : 'bg-stone-100 hover:bg-stone-200 text-stone-800 border-stone-300'
                            }`}
                          >
                            詳細確認
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Footer - Compact */}
        <div className="bg-[#EBE7DF] px-4 py-2.5 border-t border-[#D1CEC7] flex items-center justify-between shrink-0">
          <div className="text-xs text-stone-600">
            {confirmedCount === totalCount ? (
              <span className="text-green-700 font-bold flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> 全ての精霊データの照合確認が完了しました
              </span>
            ) : (
              <span>残り {totalCount - confirmedCount} 件未確認（80%以上推奨で一括承認可能）</span>
            )}
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded border border-stone-300 bg-white text-stone-700 font-bold text-xs hover:bg-stone-50 transition-colors"
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={handleFinish}
              className="px-5 py-1.5 rounded bg-[#2D2A26] hover:bg-black text-[#FAF8F5] font-bold text-xs shadow-sm flex items-center gap-1.5 transition-colors"
            >
              <Check className="w-3.5 h-3.5 text-[#D4AF37]" />
              照合結果を適用してプレビューへ
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
