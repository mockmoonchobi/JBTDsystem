import React, { useState, useMemo } from 'react';
import { Calendar as CalendarIcon, Printer, Phone, Filter, CheckCircle2, FileSpreadsheet, Sliders } from 'lucide-react';
import { Household, PastRecord, TempleProfile } from '../types';
import { getDailyMemorialTargets, formatJapaneseEraDate, normalizeDateInput, getJapaneseEra, DailyMemorialItem, convertTextNumbersToKanji, getHouseholdSponsorName } from '../utils/memorialCalculator';
import { RecentMemorialPrintModal } from './RecentMemorialPrintModal';
import { DisasterMemorialModal } from './DisasterMemorialModal';
import { getSavedDisasterMemorialEvents, getDisasterMemorialForDate } from '../utils/disasterMemorialUtils';

interface DailyMemorialListProps {
  pastRecords: PastRecord[];
  households: Household[];
  temples?: TempleProfile[];
  activeTempleId?: string;
  allPastRecords?: PastRecord[];
  allHouseholds?: Household[];
}

/**
 * Extracts specific 忌日/回忌 milestone label (e.g. '初七日', '三回忌').
 * If it's a standard monthly anniversary (祥月命日 with no milestone year), returns empty string ''.
 */
function getKijitsuHeadLabel(item: DailyMemorialItem): string {
  if (item.category === '祥月命日') return '';
  const label = item.memorialTypeLabel || '';
  if (label.includes('初七日')) return '初七日';
  if (label.includes('二七日')) return '二七日';
  if (label.includes('三七日')) return '三七日';
  if (label.includes('四七日')) return '四七日';
  if (label.includes('五七日') || label.includes('三十五日')) return '五七日';
  if (label.includes('六七日')) return '六七日';
  if (label.includes('七七日') || label.includes('四十九日')) return '四十九日';
  if (label.includes('百ヶ日')) return '百ヶ日';
  const match = label.match(/([一二三四五六七八九十百千]+回忌)/);
  if (match) return match[1];
  return '';
}

/**
 * Extracts Japanese Era Year from death date (e.g. "令和8年", "平成31年", "昭和50年").
 */
function getEraYearText(deathDateStr: string): string {
  if (!deathDateStr) return '';
  const normalized = normalizeDateInput(deathDateStr);
  const parts = normalized.split('/');
  if (parts.length < 1) return '';
  const y = parseInt(parts[0], 10);
  const m = parts[1] ? parseInt(parts[1], 10) : undefined;
  const d = parts[2] ? parseInt(parts[2], 10) : undefined;
  if (isNaN(y)) return '';
  return getJapaneseEra(y, m, d);
}

// Helper to get local YYYY-MM-DD string
function getLocalDateString(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export const DailyMemorialList: React.FC<DailyMemorialListProps> = ({
  pastRecords,
  households,
  temples = [],
  activeTempleId,
  allPastRecords,
  allHouseholds,
}) => {
  // Base date setup (Default: Today in local timezone)
  const [selectedOffset, setSelectedOffset] = useState<number>(0); // 0: Today, 1: Tomorrow, 2: Day after tomorrow, -1: Custom
  const [customDateStr, setCustomDateStr] = useState<string>(() => getLocalDateString(new Date()));
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [isRecentPrintModalOpen, setIsRecentPrintModalOpen] = useState<boolean>(false);
  const [isDisasterModalOpen, setIsDisasterModalOpen] = useState<boolean>(false);

  // Quick select handlers that also keep the date picker input in sync
  const handleSelectToday = () => {
    setSelectedOffset(0);
    setCustomDateStr(getLocalDateString(new Date()));
  };

  const handleSelectTomorrow = () => {
    setSelectedOffset(1);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setCustomDateStr(getLocalDateString(tomorrow));
  };

  const handleSelectDayAfter = () => {
    setSelectedOffset(2);
    const dayAfter = new Date();
    dayAfter.setDate(dayAfter.getDate() + 2);
    setCustomDateStr(getLocalDateString(dayAfter));
  };

  const handleCustomDateChange = (val: string) => {
    setCustomDateStr(val);
    setSelectedOffset(-1);
  };

  // Helper mapping for temple
  const templeMap = useMemo(() => {
    const map = new Map<string, TempleProfile>();
    temples.forEach((t) => {
      if (t.id) map.set(t.id, t);
    });
    return map;
  }, [temples]);

  const activeTemple = useMemo(() => {
    if (activeTempleId) return templeMap.get(activeTempleId);
    return temples[0];
  }, [activeTempleId, templeMap, temples]);

  // Compute actual target Date object
  const targetDate = useMemo(() => {
    const now = new Date();
    if (selectedOffset === 0) {
      return now;
    } else if (selectedOffset === 1) {
      const tomorrow = new Date(now);
      tomorrow.setDate(now.getDate() + 1);
      return tomorrow;
    } else if (selectedOffset === 2) {
      const dayAfter = new Date(now);
      dayAfter.setDate(now.getDate() + 2);
      return dayAfter;
    } else {
      if (!customDateStr) return now;
      const parts = customDateStr.split('-');
      if (parts.length === 3) {
        return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
      }
      return now;
    }
  }, [selectedOffset, customDateStr]);

  // Compute list of spirits requiring memorial services on targetDate
  // Note: pastRecords & households are already filtered by activeTempleId at the top level
  const allTargets = useMemo(() => {
    return getDailyMemorialTargets(pastRecords, households, targetDate);
  }, [pastRecords, households, targetDate]);

  // Filtered list
  const filteredTargets = useMemo(() => {
    if (categoryFilter === 'all') return allTargets;
    return allTargets.filter((t) => t.category === categoryFilter);
  }, [allTargets, categoryFilter]);

  // Helper date strings
  const formatDateTitle = (d: Date) => {
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const date = d.getDate();
    const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
    const dayName = dayNames[d.getDay()];
    const eraStr = formatJapaneseEraDate(`${y}/${m}/${date}`, false);
    return `${y}年${m}月${date}日 (${dayName}) 【${eraStr}】`;
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6 font-sans">
      {/* Top Banner & Quick Date Selector */}
      <div className="bg-[#1A1A1A] text-[#F9F7F2] p-5 border border-[#D4AF37] shadow-lg no-print">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#333333] pb-4">
          <div>
            <div className="flex items-center space-x-2 text-[#D4AF37] text-xs font-serif font-bold uppercase tracking-widest">
              <CalendarIcon className="w-4 h-4" />
              <span>日別 供養精霊案内・命日中陰管理</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-serif font-bold text-white mt-1">
              {formatDateTitle(targetDate)}
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setIsDisasterModalOpen(true)}
              className="px-3.5 py-2 bg-[#2A2A2A] hover:bg-[#333333] text-[#F9F7F2] hover:text-[#D4AF37] border border-[#555555] hover:border-[#D4AF37] font-serif font-bold text-xs flex items-center space-x-1.5 shadow transition-colors cursor-pointer"
              title="戦没者・大震災等の物故者命日を設定"
            >
              <Sliders className="w-4 h-4 text-[#D4AF37]" />
              <span>戦没、災害物故者命日設定</span>
            </button>

            <button
              onClick={() => setIsRecentPrintModalOpen(true)}
              className="px-3.5 py-2 bg-[#2A2A2A] hover:bg-[#333333] text-[#D4AF37] border border-[#D4AF37] font-serif font-bold text-xs flex items-center space-x-1.5 shadow transition-colors cursor-pointer"
              title="向こう数日間の供養精霊一覧をA3横向き和風縦書きで印刷"
            >
              <Printer className="w-4 h-4 text-[#D4AF37]" />
              <span>直近の供養精霊を印刷 (A3横)</span>
            </button>
          </div>
        </div>

        {/* Date Tabs & Temple Filter */}
        <div className="pt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center space-x-2">
            <button
              onClick={handleSelectToday}
              className={`px-4 py-2 text-xs font-bold transition-all border cursor-pointer ${
                selectedOffset === 0
                  ? 'bg-[#D4AF37] text-[#1A1A1A] border-[#D4AF37]'
                  : 'bg-[#2A2A2A] text-[#CCCCCC] hover:text-white border-[#444444]'
              }`}
            >
              本日 (今日)
            </button>

            <button
              onClick={handleSelectTomorrow}
              className={`px-4 py-2 text-xs font-bold transition-all border cursor-pointer ${
                selectedOffset === 1
                  ? 'bg-[#D4AF37] text-[#1A1A1A] border-[#D4AF37]'
                  : 'bg-[#2A2A2A] text-[#CCCCCC] hover:text-white border-[#444444]'
              }`}
            >
              翌日 (明日)
            </button>

            <button
              onClick={handleSelectDayAfter}
              className={`px-4 py-2 text-xs font-bold transition-all border cursor-pointer ${
                selectedOffset === 2
                  ? 'bg-[#D4AF37] text-[#1A1A1A] border-[#D4AF37]'
                  : 'bg-[#2A2A2A] text-[#CCCCCC] hover:text-white border-[#444444]'
              }`}
            >
              明後日
            </button>
          </div>

          <div className="flex items-center gap-3">
            {/* Custom Date Input */}
            <div className="flex items-center space-x-2 bg-[#2A2A2A] p-1.5 border border-[#444444]">
              <span className="text-[11px] text-[#999999] font-bold px-1">日付指定:</span>
              <input
                type="date"
                value={customDateStr}
                onChange={(e) => handleCustomDateChange(e.target.value)}
                className="bg-[#1A1A1A] text-[#F9F7F2] text-xs p-1 border border-[#555555] focus:outline-none focus:border-[#D4AF37]"
              />
            </div>
          </div>
        </div>
      </div>

      {/* On-Screen Content (Screen View - List Format) */}
      <div className="space-y-4 no-print">
        {/* Header Summary Bar */}
        <div className="bg-[#FAF8F5] border border-[#D1CEC7] p-4 flex flex-wrap items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center space-x-3">
            <div className="w-3 h-8 bg-[#1A1A1A]" />
            <div>
              <h3 className="font-serif font-bold text-base text-[#1A1A1A]">
                {formatDateTitle(targetDate)} 供養対象精霊一覧（リスト形式）
              </h3>
              <p className="text-xs text-[#666666]">
                忌日（初七日・三回忌等）、没年元号、戒名、現在の施主名、俗名、享年の順で表示
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3 text-xs">
            <span className="px-3 py-1 bg-[#1A1A1A] text-[#D4AF37] font-bold font-serif">
              対象数: {filteredTargets.length} 柱
            </span>

            {/* Category Filter */}
            <div className="flex items-center space-x-1">
              <Filter className="w-3.5 h-3.5 text-[#666666]" />
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="bg-white border border-[#D1CEC7] text-xs p-1 focus:outline-none"
              >
                <option value="all">すべての供養区分</option>
                <option value="中陰">中陰 (初七日〜七七日)</option>
                <option value="百ヶ日">百ヶ日忌</option>
                <option value="祥月命日">祥月命日</option>
                <option value="年回忌">年回忌</option>
              </select>
            </div>
          </div>
        </div>

        {/* List Table View */}
        {filteredTargets.length === 0 ? (
          <div className="bg-white border border-[#D1CEC7] p-12 text-center text-[#777777] font-serif space-y-2">
            <CheckCircle2 className="w-8 h-8 text-[#999999] mx-auto" />
            <p className="font-bold text-base text-[#444444]">
              {formatDateTitle(targetDate)} に該当する供養精霊はありません。
            </p>
            <p className="text-xs">
              （初七日〜四十九日中陰、百ヶ日忌、祥月命日に該当する過去帳データはありません）
            </p>
          </div>
        ) : (
          <div className="bg-white border border-[#D1CEC7] shadow-xs overflow-x-auto">
            <table className="w-full text-left border-collapse font-serif text-sm">
              <thead>
                <tr className="bg-[#1A1A1A] text-[#D4AF37] border-b border-[#D4AF37]">
                  {temples.length > 1 && (
                    <th className="p-3.5 whitespace-nowrap text-xs font-bold w-24">所属寺院</th>
                  )}
                  <th className="p-3.5 whitespace-nowrap text-xs font-bold w-24">忌日</th>
                  <th className="p-3.5 whitespace-nowrap text-xs font-bold w-28">元号 (没年)</th>
                  <th className="p-3.5 whitespace-nowrap text-xs font-bold">戒名 / 法名</th>
                  <th className="p-3.5 whitespace-nowrap text-xs font-bold">現在の施主名</th>
                  <th className="p-3.5 whitespace-nowrap text-xs font-bold">俗名</th>
                  <th className="p-3.5 whitespace-nowrap text-xs font-bold w-20">享年</th>
                  <th className="p-3.5 whitespace-nowrap text-xs font-bold font-sans">連絡先・備考</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EBE7DF]">
                {filteredTargets.map((item, index) => {
                  const rec = item.pastRecord;
                  const hh = item.household;
                  const kijitsu = getKijitsuHeadLabel(item);
                  const eraYear = getEraYearText(rec.deathDate);
                  const householdHead = (hh ? getHouseholdSponsorName(hh) : '') || rec.householdHeadName || '';
                  const recTemple = templeMap.get(rec.templeId || 'temple-main');

                  return (
                    <tr key={`${rec.id}-${index}`} className="hover:bg-[#F9F7F2] transition-colors">
                      {/* 所属寺院 (兼務・本寺) */}
                      {temples.length > 1 && (
                        <td className="p-3.5 whitespace-nowrap text-xs font-bold">
                          <span
                            className="inline-flex items-center px-2 py-0.5 text-[11px] font-bold border"
                            style={{
                              borderColor: recTemple?.color || '#D4AF37',
                              color: recTemple?.isMain ? '#8C6D1F' : '#1F4E79',
                              backgroundColor: recTemple?.isMain ? '#FDF8EC' : '#EFF6FF',
                            }}
                          >
                            <span
                              className="w-1.5 h-1.5 rounded-full mr-1"
                              style={{ backgroundColor: recTemple?.color || '#D4AF37' }}
                            />
                            {recTemple?.shortName || recTemple?.name || '本寺'}
                          </span>
                        </td>
                      )}

                      {/* 1. 忌日 (初七日, 三回忌等 / 祥月命日は空欄) */}
                      <td className="p-3.5 whitespace-nowrap font-bold">
                        {kijitsu ? (
                          <span className="px-2.5 py-1 bg-[#1A1A1A] text-[#D4AF37] border border-[#D4AF37] text-xs font-bold">
                            {kijitsu}
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>

                      {/* 2. 元号⚫️年 */}
                      <td className="p-3.5 whitespace-nowrap font-bold text-[#333333] text-xs">
                        {eraYear || '—'}
                      </td>

                      {/* 3. 戒名 */}
                      <td className="p-3.5 whitespace-nowrap text-base font-bold text-[#1A1A1A] tracking-wider">
                        {rec.dharmaName || '—'}
                      </td>

                      {/* 4. 現在の施主名 */}
                      <td className="p-3.5 whitespace-nowrap font-bold text-[#1A1A1A]">
                        {householdHead ? `${householdHead} 様` : '—'}
                      </td>

                      {/* 5. 俗名 */}
                      <td className="p-3.5 whitespace-nowrap text-[#444444]">
                        {rec.secularName || '—'}
                      </td>

                      {/* 6. 享年 */}
                      <td className="p-3.5 whitespace-nowrap font-bold text-[#222222]">
                        {rec.ageAtDeath ? `${rec.ageAtDeath} 歳` : '—'}
                      </td>

                      {/* 7. 連絡先・備考 */}
                      <td className="p-3.5 text-xs font-sans text-[#555555]">
                        <div className="flex flex-col space-y-1">
                          {hh && hh.phone && (
                            <div className="flex items-center space-x-1 font-bold text-emerald-800">
                              <Phone className="w-3 h-3 shrink-0" />
                              <span>{hh.phone}</span>
                            </div>
                          )}
                          {rec.burialLocation && (
                            <div className="text-[11px] text-[#666666]">
                              墓地: {rec.burialLocation}
                            </div>
                          )}
                          {rec.notes && (
                            <div className="text-[11px] text-[#777777] italic truncate max-w-xs">
                              {rec.notes}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Dedicated Print View (供養一覧の印刷 - A4縦・縦書き 複数ページ対応) */}
      <div className="print-only">
        <style>{`
          @media print {
            @page {
              size: A4 portrait;
              margin: 15mm 12mm;
            }
            .print-page {
              page-break-after: always;
              break-after: page;
              width: 100%;
              min-height: 260mm;
              box-sizing: border-box;
            }
            .print-page:last-child {
              page-break-after: auto;
              break-after: auto;
            }
            .vertical-print-area {
              writing-mode: vertical-rl;
              -webkit-writing-mode: vertical-rl;
              text-orientation: upright;
              -webkit-text-orientation: upright;
              width: 100%;
              height: 100%;
              min-height: 260mm;
              font-family: "Shippori Mincho", "Noto Serif JP", "BIZ UDPMincho", "Yu Mincho", "Hiragino Mincho ProN", "MS PMincho", "MS Mincho", "MingLiU-ExtB", "SimSun-ExtB", "IPAmjMincho", serif;
              color: #000000;
            }
            .spirit-table {
              border-collapse: collapse;
              border: none;
              break-inside: avoid;
              page-break-inside: avoid;
            }
            .spirit-table tr {
              border: none;
              break-inside: avoid;
              page-break-inside: avoid;
            }
            .spirit-table td {
              border: none;
              vertical-align: middle;
              text-align: start;
              white-space: nowrap;
              padding-left: 6px;
              padding-right: 6px;
              padding-top: 0;
              padding-bottom: 1.4em;
            }
            .spirit-table td.section-last {
              padding-bottom: 0;
            }
          }
        `}</style>

        {(() => {
          // 1ページ目: 最大12霊 (タイトル付き)
          // 2ページ目以降: 最大14霊ずつ (タイトルなし)
          const printPages: typeof filteredTargets[] = [];
          if (filteredTargets.length === 0) {
            printPages.push([]);
          } else {
            printPages.push(filteredTargets.slice(0, 12));
            for (let i = 12; i < filteredTargets.length; i += 14) {
              printPages.push(filteredTargets.slice(i, i + 14));
            }
          }

          return printPages.map((pageItems, pageIndex) => (
            <div key={`print-page-${pageIndex}`} className="print-page">
              <div className="vertical-print-area p-2">
                {/* 1ページ目のみ: 本日の日付 (漢数字) タイトル */}
                {pageIndex === 0 && (
                  <div className="text-2xl sm:text-3xl font-extrabold tracking-[0.25em] pl-6 pr-2 leading-normal shrink-0 whitespace-nowrap">
                    {convertTextNumbersToKanji(`${targetDate.getMonth() + 1}月${targetDate.getDate()}日`)} 供養精霊
                  </div>
                )}

                {/* 各精霊の表 (罫線なし・各セクションは最長+2文字分の余裕・上下は先頭揃え・左右は中央配置) */}
                {pageItems.length === 0 ? (
                  <div className="text-xl font-bold pt-8 pl-4 whitespace-nowrap">
                    本日 該当する供養精霊はございません
                  </div>
                ) : (
                  <table className="spirit-table m-0 p-0">
                    <tbody>
                      {pageItems.map((item, index) => {
                        const rec = item.pastRecord;
                        const kijitsu = getKijitsuHeadLabel(item);
                        const rawEra = getEraYearText(rec.deathDate);
                        const eraYear = convertTextNumbersToKanji(rawEra);
                        const secularName = rec.secularName || '';

                        return (
                          <tr key={`print-${rec.id}-${pageIndex}-${index}`} className="border-none">
                            {/* 1. 忌日 (上下: 先頭揃え / 左右: 中央 / 最長+2文字分の間隔) */}
                            <td className="align-middle text-start font-bold text-[21px] text-black tracking-[0.2em]">
                              {kijitsu || '　　'}
                            </td>

                            {/* 2. 没年元号 (上下: 先頭揃え / 左右: 中央 / 最長+2文字分の間隔) */}
                            <td className="align-middle text-start font-semibold text-[19px] text-gray-900 tracking-[0.18em]">
                              {eraYear || '　　'}
                            </td>

                            {/* 3. 戒名 (上下: 先頭揃え / 左右: 中央 / 大きな文字・最長+2文字分の間隔) */}
                            <td className="align-middle text-start font-black text-[30px] sm:text-[32px] text-black tracking-[0.24em]">
                              {rec.dharmaName || '　'}
                            </td>

                            {/* 4. 俗名 (上下: 先頭揃え / 左右: 中央 / 最終セクション) */}
                            <td className="section-last align-middle text-start font-normal text-[19px] text-gray-900 tracking-[0.18em]">
                              {secularName || '　'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          ));
        })()}
      </div>

      {/* 直近の供養精霊 印刷モーダル (A3横向き / 和風縦書き / 漢数字元号) */}
      <RecentMemorialPrintModal
        isOpen={isRecentPrintModalOpen}
        onClose={() => setIsRecentPrintModalOpen(false)}
        pastRecords={pastRecords}
        households={households}
        templeName={activeTemple?.name || '寺院'}
        templeInfo={activeTemple}
        temples={temples}
        activeTempleId={activeTempleId}
        allPastRecords={allPastRecords}
        allHouseholds={allHouseholds}
        initialDate={targetDate}
      />

      {/* 戦没・災害物故者命日設定モーダル */}
      <DisasterMemorialModal
        isOpen={isDisasterModalOpen}
        onClose={() => setIsDisasterModalOpen(false)}
      />
    </div>
  );
};

