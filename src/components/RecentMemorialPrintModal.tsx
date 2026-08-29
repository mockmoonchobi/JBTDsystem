import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, Printer, Calendar as CalendarIcon, Sliders, ChevronLeft, ChevronRight } from 'lucide-react';
import { Household, PastRecord, TempleProfile } from '../types';
import {
  getDailyMemorialTargets,
  normalizeDateInput,
  getJapaneseEra,
  DailyMemorialItem,
  convertTextNumbersToKanji,
} from '../utils/memorialCalculator';
import { getSavedDisasterMemorialEvents, getDisasterMemorialForDate } from '../utils/disasterMemorialUtils';

interface RecentMemorialPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  pastRecords: PastRecord[];
  households: Household[];
  templeName?: string;
  templeInfo?: TempleProfile;
  temples?: TempleProfile[];
  activeTempleId?: string;
  allPastRecords?: PastRecord[];
  allHouseholds?: Household[];
  initialDate?: Date;
}

/**
 * Extracts specific 忌日/回忌 milestone label (e.g. '初七日', '二七日', '三回忌', '四十九日').
 * If standard monthly anniversary, returns empty string ''.
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
 * Extracts Japanese Era Year from death date in Kanji (e.g. "令和八年", "平成二十五年", "昭和五十八年").
 */
function getEraYearKanji(deathDateStr: string): string {
  if (!deathDateStr) return '';
  const normalized = normalizeDateInput(deathDateStr);
  const parts = normalized.split('/');
  if (parts.length < 1) return '';
  const y = parseInt(parts[0], 10);
  const m = parts[1] ? parseInt(parts[1], 10) : undefined;
  const d = parts[2] ? parseInt(parts[2], 10) : undefined;
  if (isNaN(y)) return '';
  const rawEra = getJapaneseEra(y, m, d);
  return convertTextNumbersToKanji(rawEra);
}

// Definition of a printable column in vertical-rl mode
type PrintColumn =
  | {
      type: 'date_header';
      id: string;
      date: Date;
      dateTitleKanji: string;
      isContinuation?: boolean;
    }
  | {
      type: 'spirit';
      id: string;
      item: DailyMemorialItem;
      date: Date;
    }
  | {
      type: 'empty_day';
      id: string;
      date: Date;
    };

export const RecentMemorialPrintModal: React.FC<RecentMemorialPrintModalProps> = ({
  isOpen,
  onClose,
  pastRecords,
  households,
  templeName = '寺院',
  templeInfo,
  temples = [],
  activeTempleId,
  allPastRecords,
  allHouseholds,
  initialDate,
}) => {
  // Available temples list
  const templeList = useMemo(() => {
    if (temples && temples.length > 0) return temples;
    return [
      {
        id: 'temple-main',
        name: templeName || '本寺',
        isMain: true,
      } as TempleProfile,
    ];
  }, [temples, templeName]);

  const mainTemple = useMemo(() => {
    return templeList.find((t) => t.isMain) || templeList[0];
  }, [templeList]);

  // Selected temple IDs for printing (Multi-select by checkbox)
  const [selectedTempleIds, setSelectedTempleIds] = useState<string[]>(() => {
    if (templeList.length <= 1) {
      return templeList.map((t) => t.id);
    }
    if (activeTempleId && activeTempleId !== 'ALL') {
      return [activeTempleId];
    }
    return templeList.map((t) => t.id);
  });

  // Keep selectedTempleIds updated when modal opens or activeTempleId changes
  React.useEffect(() => {
    if (isOpen) {
      if (activeTempleId && activeTempleId !== 'ALL') {
        setSelectedTempleIds([activeTempleId]);
      } else {
        setSelectedTempleIds(templeList.map((t) => t.id));
      }
    }
  }, [isOpen, activeTempleId, templeList]);

  const handleToggleTemple = (tId: string) => {
    setSelectedTempleIds((prev) => {
      if (prev.includes(tId)) {
        if (prev.length === 1) return prev; // At least one temple remains selected
        return prev.filter((id) => id !== tId);
      } else {
        return [...prev, tId];
      }
    });
  };

  const handleSelectAllTemples = () => {
    setSelectedTempleIds(templeList.map((t) => t.id));
  };

  // Filtered source records and households based on selectedTempleIds
  const effectivePastRecords = useMemo(() => {
    const sourcePast = allPastRecords || pastRecords;
    const sourceHouseholds = allHouseholds || households;
    const mainId = mainTemple?.id || 'temple-main';

    if (templeList.length <= 1) {
      return sourcePast;
    }

    const selectedSet = new Set(selectedTempleIds);
    return sourcePast.filter((rec) => {
      let tId = rec.templeId;
      if (!tId && rec.householdId) {
        const hh = sourceHouseholds.find((h) => h.id === rec.householdId);
        if (hh && hh.templeId) {
          tId = hh.templeId;
        }
      }
      if (!tId) {
        tId = mainId;
      }
      if (selectedSet.has(tId)) return true;
      if (
        (tId === 'temple-main' || tId === mainId) &&
        (selectedSet.has('temple-main') || selectedSet.has(mainId))
      ) {
        return true;
      }
      return false;
    });
  }, [allPastRecords, pastRecords, allHouseholds, households, templeList, selectedTempleIds, mainTemple]);

  const effectiveHouseholds = useMemo(() => {
    const sourceHouseholds = allHouseholds || households;
    const mainId = mainTemple?.id || 'temple-main';

    if (templeList.length <= 1) {
      return sourceHouseholds;
    }

    const selectedSet = new Set(selectedTempleIds);
    return sourceHouseholds.filter((hh) => {
      const tId = hh.templeId || mainId;
      if (selectedSet.has(tId)) return true;
      if (
        (tId === 'temple-main' || tId === mainId) &&
        (selectedSet.has('temple-main') || selectedSet.has(mainId))
      ) {
        return true;
      }
      return false;
    });
  }, [allHouseholds, households, templeList, selectedTempleIds, mainTemple]);

  // Start date (Default: initialDate or Today)
  const [startDateStr, setStartDateStr] = useState<string>(() => {
    const d = initialDate || new Date();
    return d.toISOString().split('T')[0];
  });

  // Number of days (e.g. 2, 3, 4, 5, 7, 10, 14)
  const [daysCount, setDaysCount] = useState<number>(3);

  // Paper Size & Orientation
  const [pageSize, setPageSize] = useState<'A3_landscape' | 'A4_landscape' | 'A4_portrait'>('A3_landscape');

  // Column Density: 'compact' (狭め・最大件数), 'standard' (標準), 'spacious' (ゆったり)
  const [density, setDensity] = useState<'compact' | 'standard' | 'spacious'>('compact');

  // Columns per page limit calculation based on page size and density
  const maxColsPerPage = useMemo(() => {
    if (pageSize === 'A3_landscape') {
      if (density === 'compact') return 25;
      if (density === 'standard') return 20;
      return 16;
    } else if (pageSize === 'A4_landscape') {
      if (density === 'compact') return 16;
      if (density === 'standard') return 13;
      return 11;
    } else {
      // A4 portrait
      if (density === 'compact') return 12;
      if (density === 'standard') return 10;
      return 8;
    }
  }, [pageSize, density]);

  // Compute all days data
  const rawDaysData = useMemo(() => {
    const result: {
      date: Date;
      dateTitleKanji: string;
      items: DailyMemorialItem[];
    }[] = [];

    const baseParts = startDateStr.split('-');
    const baseDate =
      baseParts.length === 3
        ? new Date(parseInt(baseParts[0], 10), parseInt(baseParts[1], 10) - 1, parseInt(baseParts[2], 10))
        : new Date();

    for (let i = 0; i < daysCount; i++) {
      const d = new Date(baseDate);
      d.setDate(baseDate.getDate() + i);
      const m = d.getMonth() + 1;
      const dateNum = d.getDate();
      const dateTitleKanji = convertTextNumbersToKanji(`${m}月${dateNum}日`);
      const targets = getDailyMemorialTargets(effectivePastRecords, effectiveHouseholds, d);

      result.push({
        date: d,
        dateTitleKanji,
        items: targets,
      });
    }
    return result;
  }, [startDateStr, daysCount, effectivePastRecords, effectiveHouseholds]);

  // Total count of spirits across all days
  const totalSpiritsCount = useMemo(() => {
    return rawDaysData.reduce((sum, d) => sum + d.items.length, 0);
  }, [rawDaysData]);

  // Disaster / War memorial date settings
  const [disasterEvents, setDisasterEvents] = useState(() => getSavedDisasterMemorialEvents());

  // Listen to disaster memorial events update
  React.useEffect(() => {
    const handleUpdate = () => {
      setDisasterEvents(getSavedDisasterMemorialEvents());
    };
    window.addEventListener('disasterMemorialEventsUpdated', handleUpdate);
    return () => window.removeEventListener('disasterMemorialEventsUpdated', handleUpdate);
  }, []);

  // Generate paginated columns
  const paginatedPages = useMemo(() => {
    const pages: PrintColumn[][] = [];
    let currentCols: PrintColumn[] = [];

    rawDaysData.forEach((day, dayIdx) => {
      const disasterMatch = getDisasterMemorialForDate(disasterEvents, day.date);
      const dayDateTitle = disasterMatch
        ? `${day.dateTitleKanji}　${disasterMatch.titleReplacement}`
        : `${day.dateTitleKanji} 供養精霊`;
      
      // If we are starting a day and there's less than 2 columns remaining on current page (need at least date + 1 spirit/empty), start new page
      if (currentCols.length > 0 && currentCols.length + 2 > maxColsPerPage) {
        pages.push(currentCols);
        currentCols = [];
      }

      // Add Date Header Column for this day
      currentCols.push({
        type: 'date_header',
        id: `date-${dayIdx}`,
        date: day.date,
        dateTitleKanji: dayDateTitle,
        isContinuation: false,
      });

      if (day.items.length === 0) {
        // Empty day notice column
        if (currentCols.length >= maxColsPerPage) {
          pages.push(currentCols);
          currentCols = [];
        }
        currentCols.push({
          type: 'empty_day',
          id: `empty-${dayIdx}`,
          date: day.date,
        });
      } else {
        // Add spirit columns
        day.items.forEach((item, itemIdx) => {
          if (currentCols.length >= maxColsPerPage) {
            pages.push(currentCols);
            currentCols = [];
          }

          currentCols.push({
            type: 'spirit',
            id: `spirit-${dayIdx}-${item.pastRecord.id || itemIdx}`,
            item,
            date: day.date,
          });
        });
      }
    });

    if (currentCols.length > 0) {
      pages.push(currentCols);
    }

    if (pages.length === 0) {
      pages.push([]);
    }

    return pages;
  }, [rawDaysData, maxColsPerPage]);

  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  // Determine sizing styles
  const isA3 = pageSize === 'A3_landscape';
  const isA4Landscape = pageSize === 'A4_landscape';
  const isA4Portrait = pageSize === 'A4_portrait';

  // Cell padding based on density (narrower columns)
  const colPaddingX =
    density === 'compact'
      ? isA3
        ? 'px-0.5'
        : 'px-0 sm:px-0.5'
      : density === 'standard'
      ? isA3
        ? 'px-1'
        : 'px-0.5 sm:px-1'
      : isA3
      ? 'px-1.5'
      : 'px-1';

  const modalContent = (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/75 flex items-center justify-center p-2 sm:p-4 print:p-0 print:static print:bg-transparent print:overflow-visible">
      {/* Print-specific CSS */}
      <style>{`
        .vertical-print-area {
          writing-mode: vertical-rl;
          -webkit-writing-mode: vertical-rl;
          text-orientation: upright;
          -webkit-text-orientation: upright;
          font-family: "Shippori Mincho", "Noto Serif JP", "BIZ UDPMincho", "Yu Mincho", "Hiragino Mincho ProN", "MS PMincho", serif;
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
          padding-top: 0;
          padding-bottom: ${
            density === 'compact'
              ? isA3
                ? '0.9em'
                : '0.7em'
              : density === 'standard'
              ? isA3
                ? '1.3em'
                : '1.0em'
              : isA3
              ? '1.7em'
              : '1.3em'
          };
        }
        .spirit-table td.section-last {
          padding-bottom: 0 !important;
        }

        @media print {
          #root {
            display: none !important;
          }
          @page {
            size: ${
              isA3
                ? 'A3 landscape'
                : isA4Landscape
                ? 'A4 landscape'
                : 'A4 portrait'
            };
            margin: 8mm 10mm 8mm 10mm;
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
          .recent-memorial-modal-box {
            border: none !important;
            box-shadow: none !important;
            width: 100% !important;
            max-width: none !important;
            height: auto !important;
            overflow: visible !important;
            background: transparent !important;
          }
          .recent-memorial-print-container {
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            background: transparent !important;
            overflow: visible !important;
          }
          .memorial-sheet-page {
            page-break-after: always !important;
            break-after: page !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            box-sizing: border-box !important;
            width: 100% !important;
            height: ${
              isA3
                ? '275mm'
                : isA4Landscape
                ? '190mm'
                : '275mm'
            } !important;
            max-height: ${
              isA3
                ? '275mm'
                : isA4Landscape
                ? '190mm'
                : '275mm'
            } !important;
            overflow: hidden !important;
            border: none !important;
            padding: 4mm 6mm !important;
            margin: 0 !important;
            display: block !important;
          }
          .memorial-sheet-page:last-child {
            page-break-after: auto !important;
            break-after: auto !important;
          }
        }
      `}</style>

      {/* Modal Container */}
      <div className="recent-memorial-modal-box bg-white w-full max-w-7xl h-[95vh] flex flex-col rounded-sm shadow-2xl overflow-hidden font-sans border border-stone-300">
        {/* Header (No Print) */}
        <div className="bg-[#1A1A1A] text-[#F9F7F2] px-5 py-3.5 flex items-center justify-between border-b border-[#D4AF37] no-print shrink-0">
          <div className="flex items-center space-x-2.5">
            <CalendarIcon className="w-5 h-5 text-[#D4AF37]" />
            <div>
              <h2 className="text-base sm:text-lg font-bold font-serif tracking-wider flex items-center gap-2">
                <span>直近の供養精霊案内 印刷プレビュー</span>
                <span className="text-xs bg-[#D4AF37]/20 text-[#D4AF37] px-2 py-0.5 rounded font-mono font-normal">
                  全{paginatedPages.length}ページ / 精霊計{totalSpiritsCount}柱
                </span>
              </h2>
              <p className="text-[11px] text-stone-400">
                本日の供養精霊印刷準拠（日付列を独立・忌日・没年元号・戒名・俗名・複数日・複数ページ対応）
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={handlePrint}
              className="px-4 py-2 bg-[#D4AF37] hover:bg-[#c29f2f] text-[#1A1A1A] text-xs font-bold font-serif flex items-center space-x-1.5 shadow transition-colors cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>この内容で印刷（全{paginatedPages.length}頁）</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-stone-400 hover:text-white hover:bg-stone-800 rounded transition-colors"
              title="閉じる"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Toolbar (No Print) */}
        <div className="bg-stone-100 border-b border-stone-300 p-3 text-xs flex flex-wrap items-center justify-between gap-3 no-print shrink-0">
          <div className="flex flex-wrap items-center gap-4">
            {/* Start Date */}
            <div className="flex items-center space-x-2">
              <span className="font-bold text-stone-700">開始日:</span>
              <input
                type="date"
                value={startDateStr}
                onChange={(e) => setStartDateStr(e.target.value)}
                className="bg-white border border-stone-300 rounded px-2 py-1 text-xs text-stone-800 focus:outline-none"
              />
            </div>

            {/* Days Count */}
            <div className="flex items-center space-x-2">
              <span className="font-bold text-stone-700">印刷日数:</span>
              <select
                value={daysCount}
                onChange={(e) => setDaysCount(Number(e.target.value))}
                className="bg-white border border-stone-300 rounded px-2.5 py-1 text-xs text-stone-800 focus:outline-none font-bold"
              >
                <option value={1}>1日分</option>
                <option value={2}>2日間</option>
                <option value={3}>3日間（推奨）</option>
                <option value={4}>4日間</option>
                <option value={5}>5日間</option>
                <option value={7}>7日間（1週間）</option>
                <option value={10}>10日間</option>
                <option value={14}>14日間（2週間）</option>
              </select>
            </div>

            {/* Paper Size */}
            <div className="flex items-center space-x-2">
              <span className="font-bold text-stone-700">用紙サイズ:</span>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(e.target.value as any)}
                className="bg-white border border-stone-300 rounded px-2.5 py-1 text-xs text-stone-800 focus:outline-none"
              >
                <option value="A3_landscape">A3 横向き（大判・推奨）</option>
                <option value="A4_landscape">A4 横向き</option>
                <option value="A4_portrait">A4 縦向き</option>
              </select>
            </div>

            {/* Column Density */}
            <div className="flex items-center space-x-2">
              <span className="font-bold text-stone-700">列の幅・間隔:</span>
              <select
                value={density}
                onChange={(e) => setDensity(e.target.value as any)}
                className="bg-white border border-stone-300 rounded px-2.5 py-1 text-xs text-stone-800 focus:outline-none"
              >
                <option value="compact">狭め（多くの精霊を印刷・推奨）</option>
                <option value="standard">標準</option>
                <option value="spacious">ゆったり</option>
              </select>
            </div>

            {/* Target Temples Selection (Multi-select Checkboxes) */}
            {templeList.length > 1 && (
              <div className="flex items-center space-x-2 bg-white px-2.5 py-1 rounded border border-stone-300">
                <span className="font-bold text-stone-700 whitespace-nowrap">対象寺院:</span>
                <div className="flex flex-wrap items-center gap-2">
                  {templeList.map((t) => {
                    const isChecked = selectedTempleIds.includes(t.id);
                    return (
                      <label
                        key={t.id}
                        className={`flex items-center space-x-1 cursor-pointer px-1.5 py-0.5 rounded text-xs transition-colors ${
                          isChecked
                            ? 'bg-amber-50 text-stone-900 font-bold border border-amber-300'
                            : 'text-stone-500 hover:bg-stone-50 border border-transparent'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleTemple(t.id)}
                          className="rounded text-[#D4AF37] focus:ring-0 cursor-pointer"
                        />
                        <span>{t.name}</span>
                        {t.isMain && (
                          <span className="text-[10px] text-amber-700 bg-amber-100/80 px-1 rounded">本寺</span>
                        )}
                      </label>
                    );
                  })}
                  {selectedTempleIds.length < templeList.length && (
                    <button
                      type="button"
                      onClick={handleSelectAllTemples}
                      className="text-[11px] text-stone-600 hover:text-stone-900 underline ml-1 cursor-pointer"
                    >
                      全選択
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="text-[11px] text-stone-600 font-serif">
            ※ ブラウザの印刷画面で「余白: 最小 または なし」「ヘッダーとフッター: オフ」に設定してください。
          </div>
        </div>

        {/* Scrollable Preview Area */}
        <div className="flex-1 overflow-auto p-4 sm:p-8 bg-stone-200/80 recent-memorial-print-container flex flex-col items-center gap-8">
          {paginatedPages.map((pageColumns, pageIndex) => (
            <div
              key={`page-wrapper-${pageIndex}`}
              className="w-full max-w-[420mm] print:max-w-none flex flex-col items-center"
            >
              {/* Page Number Indicator (No Print) */}
              <div className="w-full flex items-center justify-between text-xs text-stone-600 font-serif mb-2 px-2 no-print">
                <span className="font-bold">
                  第 {pageIndex + 1} ページ / 全 {paginatedPages.length} ページ
                </span>
                <span className="text-[11px] text-stone-500">
                  {pageColumns.filter((c) => c.type === 'spirit').length} 柱の精霊を配置
                </span>
              </div>

              {/* The Sheet Paper Container */}
              <div
                className="memorial-sheet-page bg-white shadow-xl print:shadow-none p-6 sm:p-8 border border-stone-300 print:border-none w-full"
                style={{
                  minHeight: isA3 ? '275mm' : isA4Landscape ? '190mm' : '275mm',
                  height: isA3 ? '275mm' : isA4Landscape ? '190mm' : '275mm',
                }}
              >
                {/* Vertical Writing Container (flows right-to-left) */}
                <div className="vertical-print-area w-full h-full select-text overflow-hidden">
                  {pageColumns.length === 0 ? (
                    <div className="text-xl font-bold pt-12 pl-6 whitespace-nowrap text-stone-400">
                      該当する供養精霊はございません
                    </div>
                  ) : (
                    <table className="spirit-table m-0 p-0 h-full">
                      <tbody>
                        {pageColumns.map((col) => {
                          if (col.type === 'date_header') {
                            return (
                              <tr key={col.id} className="border-none">
                                <td
                                  colSpan={4}
                                  className={`align-top text-start font-extrabold tracking-[0.25em] leading-normal whitespace-nowrap text-stone-950 ${
                                    isA3
                                      ? 'text-[24px] sm:text-[26px] pl-3 pr-2'
                                      : isA4Landscape
                                      ? 'text-[18px] sm:text-[20px] pl-2 pr-1.5'
                                      : 'text-[20px] sm:text-[22px] pl-2.5 pr-2'
                                  }`}
                                >
                                  {col.dateTitleKanji}
                                </td>
                              </tr>
                            );
                          }

                          if (col.type === 'empty_day') {
                            return (
                              <tr key={col.id} className="border-none">
                                <td
                                  colSpan={4}
                                  className={`align-middle text-start font-bold whitespace-nowrap text-stone-400 ${
                                    isA3
                                      ? 'text-[17px] pl-2 pr-2'
                                      : isA4Landscape
                                      ? 'text-[13px] pl-1.5 pr-1.5'
                                      : 'text-[15px] pl-2 pr-2'
                                  }`}
                                >
                                  該当精霊なし
                                </td>
                              </tr>
                            );
                          }

                          // col.type === 'spirit'
                          const rec = col.item.pastRecord;
                          const kijitsu = getKijitsuHeadLabel(col.item);
                          const eraYearKanji = getEraYearKanji(rec.deathDate || '');
                          const secularName = rec.secularName || '';

                          return (
                            <tr key={col.id} className="border-none">
                              {/* 1. 忌日 (上段: 先頭揃え) */}
                              <td
                                className={`align-middle text-start font-bold text-black tracking-[0.2em] ${colPaddingX} ${
                                  isA3
                                    ? 'text-[20px]'
                                    : isA4Landscape
                                    ? 'text-[14px]'
                                    : 'text-[16px]'
                                }`}
                              >
                                {kijitsu || '　　'}
                              </td>

                              {/* 2. 没年元号 (中上段: 先頭揃え) */}
                              <td
                                className={`align-middle text-start font-semibold text-stone-900 tracking-[0.18em] ${colPaddingX} ${
                                  isA3
                                    ? 'text-[18px]'
                                    : isA4Landscape
                                    ? 'text-[12.5px]'
                                    : 'text-[14.5px]'
                                }`}
                              >
                                {eraYearKanji || '　　'}
                              </td>

                              {/* 3. 戒名 (中央 / 大文字: 先頭揃え・余ったスペース分大きめに印刷) */}
                              <td
                                className={`align-middle text-start font-black text-black tracking-[0.24em] ${colPaddingX} ${
                                  isA3
                                    ? 'text-[29px] sm:text-[31px]'
                                    : isA4Landscape
                                    ? 'text-[20px] sm:text-[21px]'
                                    : 'text-[23px] sm:text-[24px]'
                                }`}
                              >
                                {rec.dharmaName || ''}
                              </td>

                              {/* 4. 俗名 (下段: 先頭揃え・「俗名」項目名は削除し氏名のみ表示) */}
                              <td
                                className={`section-last align-middle text-start font-normal text-stone-900 tracking-[0.18em] ${colPaddingX} ${
                                  isA3
                                    ? 'text-[18px]'
                                    : isA4Landscape
                                    ? 'text-[12.5px]'
                                    : 'text-[14.5px]'
                                }`}
                              >
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
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};
