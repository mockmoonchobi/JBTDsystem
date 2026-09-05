import React, { useState, useMemo, useEffect } from 'react';
import { 
  Household, 
  TempleProfile, 
  TempleInfo, 
  Priest, 
  PastRecord 
} from '../../types';
import { 
  MapPin, 
  Navigation, 
  ExternalLink, 
  Phone, 
  Calendar as CalendarIcon, 
  User, 
  Clock, 
  Info,
  Check,
  ChevronDown,
  X
} from 'lucide-react';
import { getTanagyoRouteUrl } from '../../utils/calendarUtils';
import { getHouseholdNiibonStatus } from '../../utils/memorialCalculator';

interface MobileTanagyoViewProps {
  households: Household[];
  temples?: TempleProfile[];
  templeInfo: TempleInfo;
  priests?: Priest[];
  pastRecords?: PastRecord[];
  isStaffMode?: boolean;
}

interface DateSlotGroup {
  date: string;
  totalInDate: number;
  slots: {
    timeSlot: string;
    households: Household[];
  }[];
}

interface PriestGroup {
  priestName: string;
  priestRole?: string;
  totalCount: number;
  dateGroups: DateSlotGroup[];
}

export const MobileTanagyoView: React.FC<MobileTanagyoViewProps> = ({
  households = [],
  temples = [],
  templeInfo,
  priests = [],
  pastRecords = [],
  isStaffMode = false,
}) => {
  // 1. 棚経対象の檀信徒を抽出
  const tanagyoHouseholds = useMemo(() => {
    return households.filter((h) => !!h.tanagyoMonthlyVisit);
  }, [households]);

  // 全体の割当件数（訪問日程が設定されている世帯数）
  const totalAssignedCount = useMemo(() => {
    return tanagyoHouseholds.filter((h) => !!h.tanagyoDate).length;
  }, [tanagyoHouseholds]);

  // 2. 実際に棚経の巡回配分がある（件数 > 0）担当僧侶のみを抽出
  const assignedPriests = useMemo(() => {
    const map = new Map<string, { id: string; name: string; role?: string; count: number }>();

    tanagyoHouseholds.forEach((h) => {
      if (!h.tanagyoDate) return;
      const pName = h.tanagyoPriestName?.trim();
      if (!pName) return;

      const masterPriest = priests.find((p) => p.name === pName || p.id === h.tanagyoPriestId);

      if (!map.has(pName)) {
        map.set(pName, {
          id: h.tanagyoPriestId || masterPriest?.id || pName,
          name: pName,
          role: masterPriest?.role,
          count: 0,
        });
      }
      map.get(pName)!.count += 1;
    });

    // 担当未定で日程のみ配分されている世帯がある場合
    const unassignedCount = tanagyoHouseholds.filter(
      (h) => !!h.tanagyoDate && !h.tanagyoPriestName?.trim()
    ).length;
    if (unassignedCount > 0) {
      map.set('担当未定', {
        id: 'unassigned',
        name: '担当未定',
        role: '',
        count: unassignedCount,
      });
    }

    // 配分件数が1件以上ある人物のみを返す
    return Array.from(map.values()).filter((p) => p.count > 0);
  }, [tanagyoHouseholds, priests]);

  // 担当僧侶フィルター（初期値: 配分がある最初の僧侶、誰も配分がなければ 'ALL'）
  const [selectedPriestFilter, setSelectedPriestFilter] = useState<string>(() => {
    if (assignedPriests.length > 0) {
      return assignedPriests[0].name;
    }
    return 'ALL';
  });

  // 配分状況が変わった場合、または配分がない人物が選択されている場合の自動補正
  useEffect(() => {
    if (assignedPriests.length === 0) {
      if (selectedPriestFilter !== 'ALL') {
        setSelectedPriestFilter('ALL');
      }
    } else {
      const isValid = assignedPriests.some((p) => p.name === selectedPriestFilter);
      if (!isValid && selectedPriestFilter !== 'ALL') {
        setSelectedPriestFilter(assignedPriests[0].name);
      }
    }
  }, [assignedPriests, selectedPriestFilter]);

  // ポップアップ開閉ステート
  const [isPriestSelectorOpen, setIsPriestSelectorOpen] = useState(false);

  // 寺院名解決ヘルパー（本寺・兼務のプレフィックスなし、寺院名単体）
  const getCleanTempleName = (templeId?: string): string => {
    const mainTemple = temples.find((t) => t.isMain) || temples[0];
    const mainTempleId = mainTemple?.id || templeInfo.id || 'temple-main';
    const targetId = templeId || mainTempleId;
    const found = temples.find((t) => t.id === targetId);
    return found?.name || templeInfo.name || '自寺';
  };

  const currentPriestCount = useMemo(() => {
    if (selectedPriestFilter === 'ALL') return totalAssignedCount;
    return assignedPriests.find((p) => p.name === selectedPriestFilter)?.count ?? 0;
  }, [selectedPriestFilter, totalAssignedCount, assignedPriests]);

  // 現在選択中の僧侶ラベル表示
  const currentPriestLabel = useMemo(() => {
    if (totalAssignedCount === 0) return '巡回予定なし';
    if (selectedPriestFilter === 'ALL') return '全担当僧侶の巡回計画';
    const found = assignedPriests.find((p) => p.name === selectedPriestFilter);
    return found ? `${found.name} 師` : `${selectedPriestFilter} 師`;
  }, [selectedPriestFilter, assignedPriests, totalAssignedCount]);

  // 3. 巡回計画データのグループ構築（僧侶別・日程別・時間帯別）
  const priestGroups: PriestGroup[] = useMemo(() => {
    if (totalAssignedCount === 0) return [];

    // 対象とする僧侶リスト（配分のある僧侶のみ）
    let targetPriests: { name: string; role?: string }[] = [];

    if (selectedPriestFilter === 'ALL') {
      targetPriests = assignedPriests.map((p) => ({ name: p.name, role: p.role }));
    } else {
      const found = assignedPriests.find((p) => p.name === selectedPriestFilter);
      if (found) {
        targetPriests = [{ 
          name: found.name, 
          role: found.role 
        }];
      } else if (assignedPriests.length > 0) {
        targetPriests = [{
          name: assignedPriests[0].name,
          role: assignedPriests[0].role
        }];
      }
    }

    return targetPriests
      .map((priest): PriestGroup | null => {
        // この僧侶に割り当てられた世帯
        const assignedList = tanagyoHouseholds.filter((h) => {
          if (!h.tanagyoDate) return false;
          const pName = h.tanagyoPriestName || '担当未定';
          return pName === priest.name || h.tanagyoPriestId === priest.name;
        });

        if (assignedList.length === 0) return null;

        // 日程ごとにグループ化
        const dateMap = new Map<string, Household[]>();
        assignedList.forEach((h) => {
          const d = h.tanagyoDate?.trim() || '日程未定';
          if (!dateMap.has(d)) {
            dateMap.set(d, []);
          }
          dateMap.get(d)!.push(h);
        });

        const sortedDates = Array.from(dateMap.keys()).sort((a, b) =>
          a.localeCompare(b, 'ja', { numeric: true })
        );

        const dateGroups: DateSlotGroup[] = sortedDates.map((dateStr) => {
          const list = dateMap.get(dateStr)!;

          const amList = list
            .filter((h) => h.tanagyoTimeSlot === '午前')
            .sort((a, b) => (a.tanagyoOrder ?? 9999) - (b.tanagyoOrder ?? 9999));

          const pmList = list
            .filter((h) => h.tanagyoTimeSlot === '午後')
            .sort((a, b) => (a.tanagyoOrder ?? 9999) - (b.tanagyoOrder ?? 9999));

          const otherList = list
            .filter((h) => h.tanagyoTimeSlot !== '午前' && h.tanagyoTimeSlot !== '午後')
            .sort((a, b) => (a.tanagyoOrder ?? 9999) - (b.tanagyoOrder ?? 9999));

          const slots: { timeSlot: string; households: Household[] }[] = [];
          if (amList.length > 0) slots.push({ timeSlot: '午前', households: amList });
          if (pmList.length > 0) slots.push({ timeSlot: '午後', households: pmList });
          if (otherList.length > 0) slots.push({ timeSlot: '時間未定', households: otherList });

          return {
            date: dateStr,
            totalInDate: list.length,
            slots,
          };
        });

        return {
          priestName: priest.name,
          priestRole: priest.role,
          totalCount: assignedList.length,
          dateGroups,
        };
      })
      .filter((g): g is PriestGroup => g !== null);
  }, [tanagyoHouseholds, assignedPriests, selectedPriestFilter, totalAssignedCount]);

  return (
    <div className="flex-1 bg-[#F9F8F6] text-[#1A1A1A] pb-24 font-sans">
      {/* 1. 最上部: 担当僧侶選択バー（タップでポップアップ開閉） */}
      <div className="sticky top-14 z-30 bg-[#1F1F1F] text-white px-3.5 py-2.5 shadow-md border-b border-[#3A3A3A]">
        <button
          type="button"
          onClick={() => setIsPriestSelectorOpen(true)}
          className="w-full flex items-center justify-between gap-2 text-left cursor-pointer active:opacity-80 transition-opacity"
        >
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div className="w-6 h-6 rounded-full bg-[#D4AF37]/20 border border-[#D4AF37]/50 flex items-center justify-center shrink-0">
              <User className="w-3.5 h-3.5 text-[#D4AF37]" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] text-gray-400 font-bold leading-tight">
                担当僧侶の巡回計画
              </div>
              <div className="text-xs sm:text-sm font-bold text-[#F5F2EB] truncate flex items-center gap-1.5">
                <span className="text-[#D4AF37]">{currentPriestLabel}</span>
                <ChevronDown className="w-3.5 h-3.5 text-gray-400 shrink-0" />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {isStaffMode && (
              <span className="px-1.5 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-bold rounded-xs">
                スタッフ
              </span>
            )}
            <div className="text-[11px] font-bold text-gray-300 bg-[#2A2A2A] px-2 py-1 rounded-xs border border-gray-700">
              合計 <strong className="text-[#D4AF37] font-black text-xs">{currentPriestCount}</strong> 軒
            </div>
          </div>
        </button>
      </div>

      {/* 担当僧侶選択ポップアップ (モーダル) */}
      {isPriestSelectorOpen && (
        <div 
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in"
          onClick={() => setIsPriestSelectorOpen(false)}
        >
          <div 
            className="bg-[#242220] border-t sm:border border-[#4A453E] w-full sm:max-w-md rounded-t-xl sm:rounded-md shadow-2xl p-4 text-white overflow-hidden max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* ポップアップ ヘッダー */}
            <div className="flex items-center justify-between pb-3 border-b border-[#3A3834] mb-3 shrink-0">
              <div className="flex items-center gap-2">
                <User className="w-5 h-5 text-[#D4AF37]" />
                <h3 className="font-serif font-bold text-base text-[#F5F2EB]">
                  担当僧侶の選択
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsPriestSelectorOpen(false)}
                className="p-1 rounded-xs hover:bg-[#33312E] text-gray-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* 選択肢リスト */}
            <div className="overflow-y-auto space-y-2 flex-1 pr-1">
              {/* 配分のある僧侶が2名以上いる場合のみ「全員表示」を表示 */}
              {assignedPriests.length > 1 && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedPriestFilter('ALL');
                    setIsPriestSelectorOpen(false);
                  }}
                  className={`w-full p-3 rounded-xs border text-left flex items-center justify-between transition-all cursor-pointer ${
                    selectedPriestFilter === 'ALL'
                      ? 'bg-[#3A3324] border-[#D4AF37] text-white'
                      : 'bg-[#2E2B27] border-[#443F38] text-gray-300 hover:bg-[#38332E]'
                  }`}
                >
                  <div>
                    <div className="font-bold text-sm text-[#F5F2EB] flex items-center gap-2">
                      <span>全担当僧侶の巡回計画を表示</span>
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      すべての担当僧侶の巡回予定をまとめて閲覧
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-[#D4AF37] bg-black/40 px-2 py-0.5 rounded-full">
                      計 {totalAssignedCount} 軒
                    </span>
                    {selectedPriestFilter === 'ALL' && (
                      <Check className="w-4 h-4 text-[#D4AF37]" />
                    )}
                  </div>
                </button>
              )}

              {/* 配分がある僧侶のみを表示（配分がない人物は除外） */}
              {assignedPriests.map((p) => {
                const isSelected = selectedPriestFilter === p.name || selectedPriestFilter === p.id;

                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setSelectedPriestFilter(p.name);
                      setIsPriestSelectorOpen(false);
                    }}
                    className={`w-full p-3 rounded-xs border text-left flex items-center justify-between transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-[#3A3324] border-[#D4AF37] text-white'
                        : 'bg-[#2E2B27] border-[#443F38] text-gray-300 hover:bg-[#38332E]'
                    }`}
                  >
                    <div>
                      <div className="font-bold text-sm text-[#F5F2EB] flex items-center gap-2">
                        <span>{p.name} 師</span>
                        {p.role && (
                          <span className="text-[10px] font-normal px-1.5 py-0.5 bg-[#443F38] text-gray-300 rounded-xs">
                            {p.role}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        巡回計画を個別に閲覧
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-[#D4AF37] bg-black/40 px-2 py-0.5 rounded-full">
                        {p.count} 軒
                      </span>
                      {isSelected && (
                        <Check className="w-4 h-4 text-[#D4AF37]" />
                      )}
                    </div>
                  </button>
                );
              })}

              {assignedPriests.length === 0 && (
                <div className="p-6 text-center text-xs text-gray-400 space-y-1">
                  <p className="font-bold text-gray-300">巡回予定が配分されている担当僧侶はいません</p>
                  <p>PC版「お盆棚経・訪問マップ巡回計画」にて日程と担当を割り当ててください。</p>
                </div>
              )}
            </div>

            {/* 閉じるボタン */}
            <div className="pt-3 border-t border-[#3A3834] mt-3 shrink-0">
              <button
                type="button"
                onClick={() => setIsPriestSelectorOpen(false)}
                className="w-full py-2.5 bg-[#33312E] hover:bg-[#44403B] text-gray-200 font-bold text-xs rounded-xs transition-colors cursor-pointer"
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. メインコンテンツ: 日程・時間帯ごとの巡回計画（閲覧専用） */}
      <div className="p-3 sm:p-4 space-y-6">
        {totalAssignedCount === 0 || priestGroups.length === 0 ? (
          <div className="bg-white border border-[#D1CEC7] p-8 text-center rounded-xs shadow-xs space-y-3">
            <Info className="w-8 h-8 text-gray-400 mx-auto" />
            <p className="font-bold text-sm text-gray-700">
              該当する棚経の巡回予定はありません
            </p>
            <p className="text-xs text-gray-500 leading-relaxed">
              PC画面の「お盆棚経・訪問マップ巡回計画」にて日程・担当僧侶が割り当てられると、ここに巡回計画が表示されます。
            </p>
          </div>
        ) : (
          priestGroups.map((pGroup) => (
            <div key={pGroup.priestName} className="space-y-4">
              {/* 全員表示時のみ、僧侶ごとのセクション見出しを表示 */}
              {selectedPriestFilter === 'ALL' && (
                <div className="bg-[#1F1F1F] text-white px-3.5 py-2 rounded-xs flex items-center justify-between border-l-4 border-amber-500 shadow-xs">
                  <div className="flex items-center gap-2 font-bold text-sm">
                    <User className="w-4 h-4 text-amber-400" />
                    <span className="text-[#F5F2EB]">{pGroup.priestName} 師 の巡回計画</span>
                    {pGroup.priestRole && (
                      <span className="text-[10px] text-gray-400 font-normal">
                        ({pGroup.priestRole})
                      </span>
                    )}
                  </div>
                  <span className="text-xs font-bold text-amber-400">
                    計 {pGroup.totalCount} 軒
                  </span>
                </div>
              )}

              {/* 日程グループ */}
              {pGroup.dateGroups.map((dGroup) => (
                <div key={dGroup.date} className="space-y-3.5">
                  {/* 日程見出し（例: ⚫️8月13日） */}
                  <div className="flex items-center justify-between bg-[#2B2724] text-white px-3 py-2 rounded-xs shadow-xs border-l-4 border-[#D4AF37]">
                    <div className="flex items-center gap-2">
                      <CalendarIcon className="w-4 h-4 text-[#D4AF37]" />
                      <span className="font-serif font-black text-sm tracking-wide">
                        {dGroup.date}
                      </span>
                    </div>
                    <span className="text-xs font-bold text-[#D4AF37] bg-black/40 px-2 py-0.5 rounded-full">
                      {dGroup.totalInDate} 軒
                    </span>
                  </div>

                  {/* 時間帯スロット（午前・午後など） */}
                  {dGroup.slots.map((slot) => {
                    const slotTitle = `${dGroup.date} ${slot.timeSlot}`;
                    const totalCount = slot.households.length;

                    // 10件区切りのセグメントを生成
                    const segments: {
                      startIdx: number;
                      endIdx: number;
                      items: Household[];
                    }[] = [];

                    for (let i = 0; i < totalCount; i += 10) {
                      const end = Math.min(i + 10, totalCount);
                      segments.push({
                        startIdx: i,
                        endIdx: end,
                        items: slot.households.slice(i, end),
                      });
                    }

                    return (
                      <div
                        key={`${dGroup.date}__${slot.timeSlot}`}
                        className="bg-white border border-[#D1CEC7] rounded-xs shadow-xs overflow-hidden"
                      >
                        {/* 時間帯バー */}
                        <div className="bg-[#FAF7F0] border-b border-[#E5E0D8] px-3 py-2 flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <Clock className="w-4 h-4 text-[#8C2D19]" />
                            <span className="font-bold text-sm text-[#8C2D19]">
                              {slotTitle}
                            </span>
                          </div>
                          <span className="text-xs font-bold text-gray-600">
                            {totalCount} 軒
                          </span>
                        </div>

                        {/* リスト（10件ごとに「GoogleMapで経路出力」ボタンが挟まれるレイアウト） */}
                        <div className="divide-y divide-gray-200">
                          {segments.map((seg, segIdx) => {
                            // この10件セグメント用の経路URL
                            const segAddrs = seg.items
                              .map((h) => h.tanagyoAddress || h.address || '')
                              .filter(Boolean);
                            const segRouteUrl = getTanagyoRouteUrl(segAddrs);
                            const startNum = seg.startIdx + 1;
                            const endNum = seg.endIdx;

                            return (
                              <React.Fragment key={segIdx}>
                                {/* 各世帯の行 */}
                                {seg.items.map((h, itemIdx) => {
                                  const overallOrder = seg.startIdx + itemIdx + 1;
                                  const displayOrder = h.tanagyoOrder ?? overallOrder;
                                  const address = h.tanagyoAddress || h.address || '住所未登録';
                                  const templeName = getCleanTempleName(h.templeId);
                                  const niibonStatus = getHouseholdNiibonStatus(
                                    pastRecords,
                                    h.id,
                                    templeInfo?.bonSeason || '8月盆'
                                  );
                                  const singleMapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                                    address
                                  )}`;

                                  return (
                                    <div
                                      key={h.id}
                                      className="p-3 hover:bg-amber-50/40 transition-colors flex items-start gap-2.5"
                                    >
                                      {/* 順序番号 */}
                                      <div className="shrink-0 w-7 h-7 bg-[#FAF7F0] border border-[#D4AF37]/60 text-[#8C2D19] font-black text-xs rounded-full flex items-center justify-center shadow-2xs mt-0.5">
                                        {displayOrder}
                                      </div>

                                      {/* メイン情報: 世帯主名、寺院名、住所 */}
                                      <div className="flex-1 min-w-0 space-y-1">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                          <span className="font-black text-sm text-[#1A1A1A]">
                                            {h.familyHead} 様
                                          </span>

                                          {/* 寺院名（本寺・兼務表記なし） */}
                                          <span className="text-[10px] font-bold text-gray-700 bg-gray-100 border border-gray-300 px-1.5 py-0.2 rounded-xs">
                                            {templeName}
                                          </span>

                                          {/* 新盆バッジ */}
                                          {niibonStatus.isCurrentYearNiibon && (
                                            <span className="text-[10px] font-bold text-amber-900 bg-amber-100 border border-amber-300 px-1 py-0.2 rounded-xs">
                                              {niibonStatus.currentYearLabel}
                                            </span>
                                          )}
                                          {niibonStatus.isNextYearNiibon && (
                                            <span className="text-[10px] font-bold text-sky-900 bg-sky-100 border border-sky-300 px-1 py-0.2 rounded-xs">
                                              {niibonStatus.nextYearLabel}
                                            </span>
                                          )}
                                        </div>

                                        {/* 住所 */}
                                        <div className="text-xs text-gray-600 flex items-start gap-1 leading-snug">
                                          <MapPin className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
                                          <span className="break-all">{address}</span>
                                        </div>

                                        {/* 電話番号（ワンタップ発信可能） */}
                                        {(h.phone || h.mobile) && (
                                          <div className="text-[11px] text-gray-500 flex items-center gap-1">
                                            <Phone className="w-3 h-3 text-gray-400 shrink-0" />
                                            <a
                                              href={`tel:${(h.phone || h.mobile || '').replace(/[^0-9]/g, '')}`}
                                              className="text-blue-700 underline font-mono"
                                            >
                                              {h.phone || h.mobile}
                                            </a>
                                          </div>
                                        )}
                                      </div>

                                      {/* 右側: GoogleMapへの個別ピンリンク */}
                                      <div className="shrink-0 self-center">
                                        <a
                                          href={singleMapUrl}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white hover:bg-blue-50 text-[#2563EB] border border-[#2563EB]/40 font-bold text-xs rounded-xs shadow-2xs transition-colors cursor-pointer"
                                          title="Google Mapsでこの住所を開く"
                                        >
                                          <Navigation className="w-3.5 h-3.5" />
                                          <span className="text-[11px] whitespace-nowrap">地図</span>
                                          <ExternalLink className="w-2.5 h-2.5 opacity-70" />
                                        </a>
                                      </div>
                                    </div>
                                  );
                                })}

                                {/* 10件ごとの「GoogleMapで経路出力」ボタン */}
                                {segAddrs.length > 0 && (
                                  <div className="p-2.5 bg-blue-50/70 border-t border-b border-blue-200">
                                    <a
                                      href={segRouteUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="w-full py-2 px-3 bg-[#2563EB] hover:bg-[#1D4ED8] active:bg-[#1E40AF] text-white font-bold text-xs rounded-xs shadow-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
                                    >
                                      <Navigation className="w-4 h-4 text-blue-200" />
                                      <span>
                                        GoogleMapで経路出力
                                        {totalCount > 10 ? ` (${startNum}〜${endNum}軒目)` : ''}
                                      </span>
                                      <ExternalLink className="w-3.5 h-3.5 text-blue-200" />
                                    </a>
                                  </div>
                                )}
                              </React.Fragment>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
};
