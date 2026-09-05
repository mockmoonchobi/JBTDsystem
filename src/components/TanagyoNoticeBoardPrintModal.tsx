import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, Printer, Settings2, Users, Filter, Calendar, UserCheck } from 'lucide-react';
import { Household, TempleProfile, Priest } from '../types';
import { getHouseholdSponsorName } from '../utils/memorialCalculator';
import { getHouseholdTempleMeta } from '../utils/templeUtils';

interface TanagyoNoticeBoardPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  households: Household[];
  priests?: { id: string; name: string; role?: string; isMain?: boolean }[];
  templeName?: string;
  templeInfo?: TempleProfile;
  temples?: TempleProfile[];
}

interface NoticeSlot {
  date: string;
  displayDate: string;
  timeSlot: string; // '午前' | '午後' | '時間未定'
  priestName: string;
  households: {
    orderNumber: number;
    household: Household;
  }[];
}

export const TanagyoNoticeBoardPrintModal: React.FC<TanagyoNoticeBoardPrintModalProps> = ({
  isOpen,
  onClose,
  households,
  priests = [],
  templeName = '寺院',
  templeInfo,
  temples = [],
}) => {
  // Title for the notice board & editable header fields
  const [title, setTitle] = useState<string>('お盆棚経 巡回予定一覧');
  const [subtitle, setSubtitle] = useState<string>(
    '※ 当日の交通事情や読経進行により、訪問時刻が前後する場合がございます。何卒ご了承のほどお願い申し上げます。'
  );
  const [customTempleName, setCustomTempleName] = useState<string>(templeName);
  const [customContact, setCustomContact] = useState<string>(
    templeInfo?.phone ? `TEL: ${templeInfo.phone}` : ''
  );
  const [footerNote, setFooterNote] = useState<string>(
    '※ 順番・予定に関するお問い合わせは寺務所までご連絡ください。'
  );
  const [pageSize, setPageSize] = useState<'A4' | 'A3'>('A4');
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('landscape');
  const [columnsCount, setColumnsCount] = useState<number>(4); // Columns per row: 3, 4, 5, 6
  const [showSettings, setShowSettings] = useState<boolean>(false);

  // Filters within Modal
  const [selectedTempleFilter, setSelectedTempleFilter] = useState<string>('ALL');
  const [selectedDateFilter, setSelectedDateFilter] = useState<string>('ALL');
  const [selectedPriestFilter, setSelectedPriestFilter] = useState<string>('ALL');
  const [showUnscheduled, setShowUnscheduled] = useState<boolean>(true);
  const [showAddress, setShowAddress] = useState<boolean>(false);
  const [showTempleBadge, setShowTempleBadge] = useState<boolean>(true);

  // List of distinct dates available in households
  const availableDates = useMemo(() => {
    const set = new Set<string>();
    households.forEach((h) => {
      if (h.tanagyoDate && h.tanagyoDate.trim()) {
        set.add(h.tanagyoDate.trim());
      }
    });
    return Array.from(set).sort();
  }, [households]);

  // Extract all scheduled Tanagyo households
  const tanagyoSlots = useMemo(() => {
    // Filter households that have tanagyoDate or tanagyoMonthlyVisit or tanagyoTimeSlot
    let list = households.filter((h) => {
      const isTarget = Boolean(h.tanagyoDate || h.tanagyoTimeSlot || h.tanagyoMonthlyVisit);
      if (!isTarget) return false;

      // Temple filter
      if (selectedTempleFilter !== 'ALL') {
        const mainTemple = temples.find((t) => t.isMain) || temples[0];
        const mainTempleId = mainTemple?.id || templeInfo?.id || 'temple-main';
        const hTempleId = h.templeId || mainTempleId;
        if (hTempleId !== selectedTempleFilter) return false;
      }

      // Priest filter
      if (selectedPriestFilter !== 'ALL') {
        const priestObj = priests.find((p) => p.id === h.tanagyoPriestId);
        const pName = h.tanagyoPriestName || priestObj?.name || '';
        const matchPriest =
          h.tanagyoPriestId === selectedPriestFilter ||
          pName === selectedPriestFilter;
        if (!matchPriest) return false;
      }

      // Date filter
      if (selectedDateFilter !== 'ALL') {
        const d = h.tanagyoDate || '日付未定';
        if (d !== selectedDateFilter) return false;
      }

      return true;
    });

    if (!showUnscheduled) {
      list = list.filter((h) => Boolean(h.tanagyoDate && h.tanagyoDate.trim()));
    }

    // Group by Date -> TimeSlot -> Priest
    const grouped = new Map<string, Household[]>();

    list.forEach((h) => {
      const d = h.tanagyoDate || '日付未定';
      const slot = h.tanagyoTimeSlot || '時間未定';
      const priestObj = priests.find((p) => p.id === h.tanagyoPriestId);
      const priest = h.tanagyoPriestName || priestObj?.name || (h.tanagyoPriestId ? '担当僧侶' : '担当未定');
      const key = `${d}___${slot}___${priest}`;

      const arr = grouped.get(key) || [];
      arr.push(h);
      grouped.set(key, arr);
    });

    // Convert map to sorted NoticeSlot array
    const slots: NoticeSlot[] = [];

    grouped.forEach((hList, key) => {
      const [d, slot, priest] = key.split('___');

      // Sort households in slot by tanagyoOrder
      hList.sort((a, b) => (a.tanagyoOrder ?? 9999) - (b.tanagyoOrder ?? 9999));

      // Format display date (e.g. "8/13" -> "8月13日", "2026-08-13" -> "8月13日")
      let displayDate = d;
      if (d && d !== '日付未定') {
        if (d.includes('-') || d.includes('/')) {
          const parts = d.split(/[-/]/).map((p) => parseInt(p, 10)).filter((n) => !isNaN(n));
          if (parts.length === 3) {
            displayDate = `${parts[1]}月${parts[2]}日`;
          } else if (parts.length === 2) {
            displayDate = `${parts[0]}月${parts[1]}日`;
          }
        } else if (!d.includes('月') && !d.includes('日')) {
          displayDate = `${d}日`;
        }
      }

      slots.push({
        date: d,
        displayDate,
        timeSlot: slot,
        priestName: priest,
        households: hList.map((h, idx) => ({
          orderNumber: h.tanagyoOrder ?? idx + 1,
          household: h,
        })),
      });
    });

    // Sort slots by date -> timeSlot (午前 -> 午後 -> 時間未定) -> priestName
    const timeOrder: Record<string, number> = { 午前: 1, 午後: 2, 時間未定: 3 };
    slots.sort((a, b) => {
      if (a.date === '日付未定' && b.date !== '日付未定') return 1;
      if (b.date === '日付未定' && a.date !== '日付未定') return -1;
      const dComp = a.date.localeCompare(b.date);
      if (dComp !== 0) return dComp;
      const tComp = (timeOrder[a.timeSlot] || 9) - (timeOrder[b.timeSlot] || 9);
      if (tComp !== 0) return tComp;
      return a.priestName.localeCompare(b.priestName);
    });

    return slots;
  }, [households, priests, selectedDateFilter, selectedPriestFilter, showUnscheduled]);

  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  const modalContent = (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 flex items-center justify-center p-2 sm:p-4 print:p-0 print:static print:bg-transparent print:overflow-visible">
      {/* Print-specific CSS */}
      <style>{`
        @media print {
          #root {
            display: none !important;
          }
          @page {
            size: ${pageSize.toLowerCase()} ${orientation};
            margin: 10mm 12mm 10mm 12mm;
          }
          html, body {
            background: #ffffff !important;
            background-color: #ffffff !important;
            color: #000000 !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: visible !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .no-print {
            display: none !important;
          }
          .tanagyo-modal-box {
            border: none !important;
            box-shadow: none !important;
            width: 100% !important;
            max-width: none !important;
            height: auto !important;
            overflow: visible !important;
            background: transparent !important;
          }
          .tanagyo-notice-print-container {
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            background: transparent !important;
            overflow: visible !important;
          }
          .notice-slot-box {
            page-break-inside: avoid;
            break-inside: avoid;
            margin-bottom: 18px !important;
          }
        }
      `}</style>

      {/* Modal Container */}
      <div className="tanagyo-modal-box bg-white w-full max-w-6xl h-[92vh] flex flex-col rounded-sm shadow-2xl overflow-hidden font-sans border border-stone-300">
        {/* Header (No Print) */}
        <div className="bg-[#1A1A1A] text-[#F9F7F2] px-5 py-3.5 flex items-center justify-between border-b border-[#D4AF37] no-print shrink-0">
          <div className="flex items-center space-x-2.5">
            <Users className="w-5 h-5 text-[#D4AF37]" />
            <div>
              <h2 className="text-base sm:text-lg font-bold font-serif tracking-wider">
                巡回予定表 印刷プレビュー
              </h2>
              <p className="text-[11px] text-stone-400">
                参拝される檀信徒様が「何日の何番目」か一目で確認できる張り出し用一覧表（省インク設計）
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={handlePrint}
              className="px-4 py-2 bg-[#D4AF37] hover:bg-[#c29f2f] text-[#1A1A1A] text-xs font-bold font-serif flex items-center space-x-1.5 shadow transition-colors cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>この内容で印刷</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-stone-400 hover:text-white hover:bg-stone-800 rounded transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Toolbar (No Print) */}
        <div className="bg-stone-100 border-b border-stone-300 p-3 text-xs space-y-2.5 no-print shrink-0">
          {/* Row 1: Primary Controls */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              {/* Title Input */}
              <div className="flex items-center space-x-1.5">
                <span className="font-bold text-stone-700 whitespace-nowrap">表題:</span>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="bg-white border border-stone-300 rounded px-2 py-1 text-xs text-stone-800 w-40 focus:outline-none focus:border-stone-600"
                  placeholder="巡回予定表 表題"
                />
              </div>

              {/* Temple Filter */}
              {temples && temples.length > 1 && (
                <div className="flex items-center space-x-1.5">
                  <span className="font-bold text-stone-700 whitespace-nowrap">寺院:</span>
                  <select
                    value={selectedTempleFilter}
                    onChange={(e) => setSelectedTempleFilter(e.target.value)}
                    className="bg-white border border-stone-300 rounded px-2 py-1 text-xs text-stone-800 focus:outline-none"
                  >
                    <option value="ALL">全寺院（本寺・兼務寺 合算）</option>
                    {temples.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.isMain ? `【本寺】${t.name}` : `【兼務】${t.name}`}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Date Filter */}
              <div className="flex items-center space-x-1.5">
                <Calendar className="w-3.5 h-3.5 text-stone-600" />
                <span className="font-bold text-stone-700 whitespace-nowrap">日程:</span>
                <select
                  value={selectedDateFilter}
                  onChange={(e) => setSelectedDateFilter(e.target.value)}
                  className="bg-white border border-stone-300 rounded px-2 py-1 text-xs text-stone-800 focus:outline-none"
                >
                  <option value="ALL">全日程</option>
                  {availableDates.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                  <option value="日付未定">日付未定のみ</option>
                </select>
              </div>

              {/* Priest Filter */}
              <div className="flex items-center space-x-1.5">
                <UserCheck className="w-3.5 h-3.5 text-stone-600" />
                <span className="font-bold text-stone-700 whitespace-nowrap">僧侶:</span>
                <select
                  value={selectedPriestFilter}
                  onChange={(e) => setSelectedPriestFilter(e.target.value)}
                  className="bg-white border border-stone-300 rounded px-2 py-1 text-xs text-stone-800 focus:outline-none"
                >
                  <option value="ALL">全員表示</option>
                  {priests.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                  <option value="担当未定">担当未定のみ</option>
                </select>
              </div>

              {/* Page Size */}
              <div className="flex items-center space-x-1.5">
                <span className="font-bold text-stone-700 whitespace-nowrap">用紙:</span>
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(e.target.value as any)}
                  className="bg-white border border-stone-300 rounded px-2.5 py-1 text-xs text-stone-800 focus:outline-none"
                >
                  <option value="A4">A4</option>
                  <option value="A3">A3 (大判推奨)</option>
                </select>
              </div>

              {/* Orientation */}
              <div className="flex items-center space-x-1.5">
                <span className="font-bold text-stone-700 whitespace-nowrap">向き:</span>
                <select
                  value={orientation}
                  onChange={(e) => setOrientation(e.target.value as any)}
                  className="bg-white border border-stone-300 rounded px-2.5 py-1 text-xs text-stone-800 focus:outline-none"
                >
                  <option value="landscape">横向き</option>
                  <option value="portrait">縦向き</option>
                </select>
              </div>

              {/* Columns Count */}
              <div className="flex items-center space-x-1.5">
                <span className="font-bold text-stone-700 whitespace-nowrap">列数:</span>
                <select
                  value={columnsCount}
                  onChange={(e) => setColumnsCount(Number(e.target.value))}
                  className="bg-white border border-stone-300 rounded px-2 py-1 text-xs text-stone-800 focus:outline-none"
                >
                  <option value={3}>3列 (大文字)</option>
                  <option value={4}>4列 (標準)</option>
                  <option value={5}>5列 (多め)</option>
                  <option value={6}>6列 (高密度)</option>
                </select>
              </div>

              {/* Toggle Address */}
              <label className="flex items-center space-x-1 text-stone-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showAddress}
                  onChange={(e) => setShowAddress(e.target.checked)}
                  className="rounded text-stone-800"
                />
                <span className="text-xs">住所表示</span>
              </label>

              {/* Toggle Temple Badge */}
              {temples && temples.length > 1 && (
                <label className="flex items-center space-x-1 text-stone-700 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={showTempleBadge}
                    onChange={(e) => setShowTempleBadge(e.target.checked)}
                    className="rounded text-stone-800"
                  />
                  <span className="text-xs font-bold">寺院名表示</span>
                </label>
              )}

              {/* Toggle Advanced Header Edit */}
              <button
                type="button"
                onClick={() => setShowSettings(!showSettings)}
                className={`px-2.5 py-1 border rounded text-xs font-bold flex items-center space-x-1 transition-colors cursor-pointer ${
                  showSettings
                    ? 'bg-stone-800 text-white border-stone-800'
                    : 'bg-white text-stone-700 border-stone-300 hover:bg-stone-200'
                }`}
              >
                <Settings2 className="w-3.5 h-3.5" />
                <span>文面・寺院情報編集 {showSettings ? '▲' : '▼'}</span>
              </button>
            </div>

            <div className="text-[11px] text-stone-600 font-serif whitespace-nowrap">
              該当巡回枠：<strong>{tanagyoSlots.length}</strong> 枠 / 掲載檀家数：<strong>{tanagyoSlots.reduce((acc, s) => acc + s.households.length, 0)}</strong> 軒
            </div>
          </div>

          {/* Row 2 (Expandable): Editable Header Text & Notes */}
          {showSettings && (
            <div className="bg-white p-2.5 border border-stone-300 rounded grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              <div>
                <label className="block text-stone-600 font-bold mb-1">注意書き・案内文 (ヘッダー下):</label>
                <input
                  type="text"
                  value={subtitle}
                  onChange={(e) => setSubtitle(e.target.value)}
                  className="w-full bg-stone-50 border border-stone-300 rounded px-2 py-1 text-xs text-stone-800 focus:bg-white focus:outline-none"
                  placeholder="※ 当日の交通事情や読経進行により..."
                />
              </div>

              <div>
                <label className="block text-stone-600 font-bold mb-1">寺院名称 (ヘッダー右):</label>
                <input
                  type="text"
                  value={customTempleName}
                  onChange={(e) => setCustomTempleName(e.target.value)}
                  className="w-full bg-stone-50 border border-stone-300 rounded px-2 py-1 text-xs text-stone-800 focus:bg-white focus:outline-none"
                  placeholder="寺院名"
                />
              </div>

              <div>
                <label className="block text-stone-600 font-bold mb-1">連絡先・電話番号:</label>
                <input
                  type="text"
                  value={customContact}
                  onChange={(e) => setCustomContact(e.target.value)}
                  className="w-full bg-stone-50 border border-stone-300 rounded px-2 py-1 text-xs text-stone-800 focus:bg-white focus:outline-none"
                  placeholder="TEL: 00-0000-0000"
                />
              </div>

              <div>
                <label className="block text-stone-600 font-bold mb-1">フッター注記文:</label>
                <input
                  type="text"
                  value={footerNote}
                  onChange={(e) => setFooterNote(e.target.value)}
                  className="w-full bg-stone-50 border border-stone-300 rounded px-2 py-1 text-xs text-stone-800 focus:bg-white focus:outline-none"
                  placeholder="※ 順番・予定に関するお問い合わせは..."
                />
              </div>
            </div>
          )}
        </div>

        {/* Scrollable Preview Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 bg-stone-200/80 tanagyo-notice-print-container">
          <div
            className="mx-auto bg-white shadow-md print:shadow-none p-6 sm:p-10 border border-stone-300 print:border-none font-serif text-stone-950 flex flex-col justify-between"
            style={{
              maxWidth: orientation === 'landscape' ? (pageSize === 'A3' ? '410mm' : '287mm') : (pageSize === 'A3' ? '287mm' : '200mm'),
              minHeight: orientation === 'landscape' ? (pageSize === 'A3' ? '280mm' : '190mm') : (pageSize === 'A3' ? '400mm' : '270mm'),
            }}
          >
            <div>
              {/* Document Header (Editable) */}
              <div className="border-b-2 border-stone-800 pb-3 mb-5 flex items-center justify-between">
                <div>
                  <h1 className="text-2xl sm:text-3xl font-black tracking-widest text-stone-950">
                    {title}
                  </h1>
                  {subtitle && (
                    <p className="text-xs text-stone-600 tracking-wider mt-1 font-sans">
                      {subtitle}
                    </p>
                  )}
                </div>
                <div className="text-right shrink-0 pl-4">
                  <div className="text-lg font-bold tracking-widest">{customTempleName}</div>
                  {customContact && (
                    <div className="text-[11px] text-stone-600 font-sans">{customContact}</div>
                  )}
                </div>
              </div>

              {/* Scheduled Slots Container */}
              {tanagyoSlots.length === 0 ? (
                <div className="text-center py-16 text-stone-500 font-bold text-base font-sans">
                  条件に一致する棚経・巡回訪問予定の檀家はございません。
                </div>
              ) : (
                <div className="space-y-5">
                  {tanagyoSlots.map((slot, sIdx) => (
                    <div
                      key={`slot-${sIdx}`}
                      className="notice-slot-box border-2 border-stone-800 rounded-xs overflow-hidden bg-white"
                    >
                      {/* Slot Header Bar (Date, TimeSlot, Priest) - Ink-saving outline design */}
                      <div className="bg-stone-100/90 text-stone-900 px-4 py-2 flex flex-wrap items-center justify-between gap-2 border-b-2 border-stone-800">
                        <div className="flex items-center space-x-3">
                          <span className="text-lg sm:text-xl font-black tracking-widest text-stone-950">
                            【 {slot.displayDate} 】
                          </span>
                          <span className="text-sm sm:text-base font-black tracking-wider bg-white border border-stone-800 text-stone-900 px-2.5 py-0.5 rounded-xs">
                            {slot.timeSlot}
                          </span>
                        </div>

                        <div className="flex items-center space-x-3 text-xs sm:text-sm font-bold text-stone-800">
                          {slot.priestName && slot.priestName !== '担当未定' && (
                            <span className="border border-stone-400 bg-white px-2.5 py-0.5 text-stone-900">
                              担当僧侶：<strong>{slot.priestName}</strong>
                            </span>
                          )}
                          <span className="text-stone-600 font-sans text-xs">
                            （全 {slot.households.length} 軒）
                          </span>
                        </div>
                      </div>

                      {/* Households Grid */}
                      <div
                        className="p-3 bg-white grid gap-2.5"
                        style={{
                          gridTemplateColumns: `repeat(${columnsCount}, minmax(0, 1fr))`,
                        }}
                      >
                        {slot.households.map((item, hIdx) => {
                          const h = item.household;
                          const sponsor = getHouseholdSponsorName(h);
                          const templeMeta = getHouseholdTempleMeta(h, temples, templeInfo);
                          return (
                            <div
                              key={h.id || hIdx}
                              className="border border-stone-400 p-2 rounded-xs bg-white hover:bg-stone-50 flex items-center justify-between gap-1.5 shadow-2xs"
                            >
                              {/* Order Number Box (Ink-saving outline) */}
                              <div className="w-7 h-7 bg-white border-2 border-stone-800 text-stone-950 text-xs font-black flex items-center justify-center rounded-xs shrink-0 font-sans">
                                {item.orderNumber}
                              </div>

                              {/* Patron Name & Sponsor & optional Address */}
                              <div className="flex-1 min-w-0 px-1 text-center">
                                <div className="text-[14px] sm:text-[15px] font-black text-stone-950 tracking-wider truncate flex items-center justify-center gap-1">
                                  <span>{h.familyHead || '（氏名未登録）'}</span>
                                  <span className="text-xs font-normal text-stone-600">様</span>
                                  {showTempleBadge && temples && temples.length > 1 && (
                                    <span className="text-[9px] px-1 py-0.2 rounded-2xs border border-stone-400 bg-stone-100 text-stone-800 font-bold whitespace-nowrap">
                                      {templeMeta.shortBadgeLabel}
                                    </span>
                                  )}
                                </div>
                                {sponsor && sponsor !== h.familyHead && (
                                  <div className="text-[10px] text-stone-600 truncate mt-0.5">
                                    施主 {sponsor} 様
                                  </div>
                                )}
                                {showAddress && (h.address || h.district) && (
                                  <div className="text-[9.5px] text-stone-500 truncate mt-0.5 font-sans">
                                    {h.district ? `[${h.district}] ` : ''}{h.address || ''}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Notice Footer */}
            <div className="pt-4 mt-6 border-t border-stone-800 flex items-center justify-between text-xs text-stone-600 font-sans">
              <span>{footerNote}</span>
              <span className="font-bold text-stone-800">{customTempleName}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};
