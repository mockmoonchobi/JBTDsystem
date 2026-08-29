import React, { useState, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  YearlyMemorialSpirit,
  calculateYearlyMemorialSpirits,
  getJapaneseEra,
  convertTextNumbersToKanji,
  NenkiFilterSettings,
  DEFAULT_NENKI_FILTER_SETTINGS,
  isSpiritMatchingNenkiSettings,
} from '../utils/memorialCalculator';
import { PastRecord, Household, TempleProfile } from '../types';
import {
  Printer,
  X,
  FileText,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

interface YearlyMemorialPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetYear: number;
  pastRecords: PastRecord[];
  households: Household[];
  templeName?: string;
  templeInfo?: TempleProfile;
  temples?: TempleProfile[];
  activeTempleId?: string;
  allPastRecords?: PastRecord[];
  allHouseholds?: Household[];
  nenkiSettings?: NenkiFilterSettings;
}

type ColumnItem =
  | {
      id: string;
      type: 'title';
      titleText: string;
    }
  | {
      id: string;
      type: 'month';
      monthNum: number;
      monthTitle: string; // e.g. "一月"
    }
  | {
      id: string;
      type: 'spirit';
      spirit: YearlyMemorialSpirit;
      household?: Household;
      monthNum: number;
    };

export const YearlyMemorialPrintModal: React.FC<YearlyMemorialPrintModalProps> = ({
  isOpen,
  onClose,
  targetYear,
  pastRecords,
  households,
  templeName = '寺院',
  templeInfo,
  temples = [],
  activeTempleId,
  allPastRecords,
  allHouseholds,
  nenkiSettings = DEFAULT_NENKI_FILTER_SETTINGS,
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

  const householdMap = useMemo(() => {
    const map = new Map<string, Household>();
    effectiveHouseholds.forEach((h) => {
      if (h.id) map.set(h.id, h);
    });
    return map;
  }, [effectiveHouseholds]);

  // Paper Size: A4縦 (デフォルト・推奨) / A3縦 (大判)
  const [pageSize, setPageSize] = useState<'A4_portrait' | 'A3_portrait'>('A4_portrait');

  // Column Density: 'compact' (狭め), 'standard' (標準), 'spacious' (ゆったり)
  const [density, setDensity] = useState<'compact' | 'standard' | 'spacious'>('standard');

  // Custom Font Size offset in pt (-8 to +16 pt)
  const [fontSizeOffset, setFontSizeOffset] = useState<number>(0);

  // Zoom Level for on-screen preview (80% - 150%)
  const [previewZoom, setPreviewZoom] = useState<number>(100);

  // Active preview page index
  const [activePageIndex, setActivePageIndex] = useState<number>(0);

  // Print container ref
  const printContainerRef = useRef<HTMLDivElement>(null);

  // Calculate filtered yearly memorial spirits
  const rawSpirits = useMemo(() => {
    const all = calculateYearlyMemorialSpirits(effectivePastRecords, targetYear);
    return all.filter((s) => isSpiritMatchingNenkiSettings(s, nenkiSettings));
  }, [effectivePastRecords, targetYear, nenkiSettings]);

  // Calculate max memorial text length across all spirits in this year
  const maxMemorialLen = useMemo(() => {
    if (rawSpirits.length === 0) return 4;
    let max = 3;
    rawSpirits.forEach((s) => {
      const text = convertTextNumbersToKanji(s.memorialType || '');
      if (text.length > max) max = text.length;
    });
    return max;
  }, [rawSpirits]);

  // Calculate max dharma name length across all spirits in this year
  const maxDharmaLen = useMemo(() => {
    if (rawSpirits.length === 0) return 6;
    let max = 6;
    rawSpirits.forEach((s) => {
      const dn = (s.record.dharmaName || '').trim();
      if (dn.length > max) max = dn.length;
    });
    return max;
  }, [rawSpirits]);

  // Calculate max secular name length across all spirits in this year
  const maxSecularLen = useMemo(() => {
    if (rawSpirits.length === 0) return 0;
    let max = 0;
    rawSpirits.forEach((s) => {
      const raw = (s.record.secularName || s.record.deceasedName || '').trim();
      const sec = raw === 'なし' || raw === '-' ? '' : raw.replace(/ /g, '　');
      if (sec.length > max) max = sec.length;
    });
    return max;
  }, [rawSpirits]);

  // Total effective vertical height in character units:
  // Indent (1) + Memorial (maxMemorialLen) + Space (1) at 0.67em
  // + DharmaName (maxDharmaLen) at 1.0em
  // + Space (1) + SecularName (maxSecularLen) at 0.67em
  const totalEffectiveHeightUnits = useMemo(() => {
    const memorialPart = (1 + maxMemorialLen + 1) * 0.67;
    const dharmaPart = maxDharmaLen * 1.0;
    const secularPart = maxSecularLen > 0 ? 1.0 + maxSecularLen * 0.67 : 0;
    return Math.max(12, memorialPart + dharmaPart + secularPart);
  }, [maxMemorialLen, maxDharmaLen, maxSecularLen]);

  // Determine Title Text (文字間スペースなし: 例「令和八年宥勝寺精霊回忌表」)
  const titleString = useMemo(() => {
    const eraStr = getJapaneseEra(targetYear);
    const eraKanji = convertTextNumbersToKanji(eraStr);
    
    let tName = templeName || '寺院';
    if (selectedTempleIds.length === 1) {
      const found = templeList.find((t) => t.id === selectedTempleIds[0]);
      if (found) tName = found.name;
    } else if (selectedTempleIds.length > 1) {
      tName = mainTemple?.name || templeName || '寺院';
    }

    return `${eraKanji}${tName}精霊回忌表`;
  }, [targetYear, templeName, selectedTempleIds, templeList, mainTemple]);

  // Sizing styles
  const isA3Portrait = pageSize === 'A3_portrait';
  const isA4Portrait = pageSize === 'A4_portrait';

  // Dynamic Font Size in pt (computed to span down the paper cleanly)
  // A4 printable height ≈ 277mm (approx 785pt)
  // A3 printable height ≈ 396mm (approx 1120pt)
  const baseSpiritFontSizePt = useMemo(() => {
    if (isA3Portrait) {
      return Math.max(20, Math.min(48, Math.floor(960 / totalEffectiveHeightUnits)));
    } else {
      return Math.max(14, Math.min(34, Math.floor(660 / totalEffectiveHeightUnits)));
    }
  }, [isA3Portrait, totalEffectiveHeightUnits]);

  const spiritFontSizePt = Math.max(8, Math.min(64, baseSpiritFontSizePt + fontSizeOffset));
  const titleFontSizePt = isA3Portrait ? Math.max(20, Math.round(spiritFontSizePt * 1.15)) : Math.max(16, Math.round(spiritFontSizePt * 1.12));
  const monthFontSizePt = isA3Portrait ? Math.max(18, Math.round(spiritFontSizePt * 1.05)) : Math.max(14, Math.round(spiritFontSizePt * 1.02));

  // Build stream of column items grouped by month
  const columnStream = useMemo(() => {
    const stream: ColumnItem[] = [];

    // 1. Initial Title Column
    stream.push({
      id: 'col-title-main',
      type: 'title',
      titleText: titleString,
    });

    // Group spirits by month (1 to 12)
    const monthGroups = new Map<number, YearlyMemorialSpirit[]>();
    for (let m = 1; m <= 12; m++) {
      monthGroups.set(m, []);
    }

    rawSpirits.forEach((s) => {
      if (!s.scheduledDate) return;
      const parts = s.scheduledDate.split(/[-/]/);
      if (parts.length === 3) {
        const m = parseInt(parts[1], 10);
        if (m >= 1 && m <= 12) {
          monthGroups.get(m)?.push(s);
        }
      }
    });

    // Generate Month Header & Spirit Columns for months that have spirits
    for (let m = 1; m <= 12; m++) {
      const spiritsInMonth = monthGroups.get(m) || [];
      if (spiritsInMonth.length === 0) continue;

      // Month Header Column (上揃え)
      const monthKanji = convertTextNumbersToKanji(`${m}月`);
      stream.push({
        id: `col-month-${m}`,
        type: 'month',
        monthNum: m,
        monthTitle: monthKanji,
      });

      // Spirit Columns in this month
      spiritsInMonth.forEach((sp, sIdx) => {
        const hh = sp.record.householdId ? householdMap.get(sp.record.householdId) : undefined;
        stream.push({
          id: `col-spirit-${m}-${sp.id}-${sIdx}`,
          type: 'spirit',
          spirit: sp,
          household: hh,
          monthNum: m,
        });
      });
    }

    return stream;
  }, [titleString, rawSpirits, householdMap]);

  // Paginate the columnStream into pages based on actual printable width and column widths (改列処理)
  const pages = useMemo(() => {
    if (columnStream.length === 0) return [];

    // A4 printable width: 210mm - 24mm margins = 186mm (safe budget ~180mm)
    // A3 printable width: 297mm - 30mm margins = 267mm (safe budget ~260mm)
    const printableWidthMm = isA3Portrait ? 260 : 180;

    const padMm = isA3Portrait
      ? density === 'compact' ? 2.5 : density === 'standard' ? 5.0 : 8.5
      : density === 'compact' ? 1.5 : density === 'standard' ? 3.2 : 6.0;

    // Actual horizontal width consumed per column type
    const spiritColWidthMm = (spiritFontSizePt * 0.3528 * 1.15) + padMm + 0.5;
    const monthColWidthMm = (monthFontSizePt * 0.3528 * 1.15) + padMm + 0.5;
    const titleColWidthMm = (titleFontSizePt * 0.3528 * 1.22) + padMm + 4.0;

    const resultPages: {
      pageIndex: number;
      columns: ColumnItem[];
    }[] = [];

    let currentCols: ColumnItem[] = [];
    let currentWidthMm = 0;
    let pIndex = 0;

    columnStream.forEach((item) => {
      let itemWidthMm = spiritColWidthMm;
      if (item.type === 'title') itemWidthMm = titleColWidthMm;
      else if (item.type === 'month') itemWidthMm = monthColWidthMm;

      // When adding this column would exceed printable width, cleanly wrap to next page (改列)
      if (currentCols.length > 0 && currentWidthMm + itemWidthMm > printableWidthMm) {
        resultPages.push({
          pageIndex: pIndex++,
          columns: currentCols,
        });
        currentCols = [];
        currentWidthMm = 0;
      }

      currentCols.push(item);
      currentWidthMm += itemWidthMm;
    });

    if (currentCols.length > 0) {
      resultPages.push({
        pageIndex: pIndex++,
        columns: currentCols,
      });
    }

    return resultPages;
  }, [columnStream, isA3Portrait, density, spiritFontSizePt, monthFontSizePt, titleFontSizePt]);

  // Handle actual printing
  const handlePrint = () => {
    window.print();
  };

  if (!isOpen) return null;

  const modalContent = (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 flex items-center justify-center p-2 sm:p-4 print:p-0 print:static print:bg-transparent print:overflow-visible font-sans">
      {/* Print-specific & Vertical Table CSS */}
      <style>{`
        .yearly-vertical-print-area {
          writing-mode: vertical-rl;
          -webkit-writing-mode: vertical-rl;
          text-orientation: upright;
          -webkit-text-orientation: upright;
          font-family: "Shippori Mincho", "Noto Serif JP", "BIZ UDPMincho", "Yu Mincho", "Hiragino Mincho ProN", "MS PMincho", serif;
          color: #000000;
          background-color: #ffffff;
        }
        .yearly-spirit-table {
          border-collapse: collapse;
          border: none !important;
          break-inside: avoid;
          page-break-inside: avoid;
          background: #ffffff !important;
        }
        .yearly-spirit-table tr {
          border: none !important;
          break-inside: avoid;
          page-break-inside: avoid;
          background: #ffffff !important;
        }
        .yearly-spirit-table td {
          border: none !important;
          vertical-align: top !important;
          text-align: start;
          white-space: nowrap;
          padding-top: 0 !important;
          padding-bottom: 0 !important;
          background: #ffffff !important;
        }

        @media print {
          #root {
            display: none !important;
          }
          @page {
            size: ${isA3Portrait ? 'A3 portrait' : 'A4 portrait'};
            margin: ${isA3Portrait ? '12mm 15mm 12mm 15mm' : '10mm 12mm 10mm 12mm'};
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
          .yearly-memorial-modal-box {
            border: none !important;
            box-shadow: none !important;
            width: 100% !important;
            max-width: none !important;
            height: auto !important;
            overflow: visible !important;
            background: #ffffff !important;
          }
          .yearly-memorial-print-container {
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            overflow: visible !important;
          }
          .yearly-memorial-sheet-page {
            page-break-after: always !important;
            break-after: page !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            box-sizing: border-box !important;
            width: 100% !important;
            height: auto !important;
            min-height: ${isA3Portrait ? '396mm' : '277mm'} !important;
            max-height: ${isA3Portrait ? '396mm' : '277mm'} !important;
            overflow: hidden !important;
            border: none !important;
            padding: 0 !important;
            margin: 0 !important;
            display: block !important;
            background: #ffffff !important;
          }
          .yearly-memorial-sheet-page:last-child {
            page-break-after: auto !important;
            break-after: auto !important;
          }
        }
      `}</style>

      {/* Modal Container */}
      <div className="yearly-memorial-modal-box bg-white w-full max-w-7xl h-[95vh] flex flex-col rounded-sm shadow-2xl overflow-hidden font-sans border border-stone-300">
        {/* Header Toolbar (No Print) */}
        <div className="bg-[#1A1A1A] text-[#F9F7F2] px-5 py-3 flex items-center justify-between border-b border-[#D4AF37] no-print shrink-0">
          <div className="flex items-center space-x-2.5">
            <FileText className="w-5 h-5 text-[#D4AF37]" />
            <div>
              <h2 className="text-base sm:text-lg font-bold font-serif tracking-wider flex items-center gap-2">
                <span>年回忌案内（精霊年会表） 印刷プレビュー</span>
                <span className="text-xs bg-[#D4AF37]/20 text-[#D4AF37] px-2 py-0.5 rounded font-mono font-normal">
                  {targetYear}年（{getJapaneseEra(targetYear)}） / 全{pages.length}頁 / 精霊計{rawSpirits.length}柱
                </span>
              </h2>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={handlePrint}
              className="bg-[#D4AF37] hover:bg-[#c49f27] text-stone-900 font-bold px-4 py-1.5 rounded text-xs flex items-center space-x-1.5 shadow transition-colors cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>印刷する</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="text-stone-400 hover:text-white p-1 rounded hover:bg-stone-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Options Toolbar (No Print) */}
        <div className="bg-stone-100 border-b border-stone-300 p-3 text-xs flex flex-wrap items-center justify-between gap-3 no-print shrink-0">
          <div className="flex flex-wrap items-center gap-3">
            {/* Paper Size */}
            <div className="flex items-center space-x-1.5">
              <span className="font-bold text-stone-700">用紙サイズ:</span>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(e.target.value as any)}
                className="bg-white border border-stone-300 rounded px-2.5 py-1 text-xs text-stone-800 focus:outline-none font-medium"
              >
                <option value="A4_portrait">A4 縦向き（標準・推奨）</option>
                <option value="A3_portrait">A3 縦向き（大判）</option>
              </select>
            </div>

            {/* Column Density */}
            <div className="flex items-center space-x-1.5">
              <span className="font-bold text-stone-700">列幅・間隔:</span>
              <select
                value={density}
                onChange={(e) => setDensity(e.target.value as any)}
                className="bg-white border border-stone-300 rounded px-2.5 py-1 text-xs text-stone-800 focus:outline-none font-medium"
              >
                <option value="compact">狭め（多くの精霊を配置）</option>
                <option value="standard">標準</option>
                <option value="spacious">ゆったり</option>
              </select>
            </div>

            {/* Font Size Adjustment (+/-) */}
            <div className="flex items-center space-x-1 bg-white px-2 py-1 rounded border border-stone-300">
              <span className="font-bold text-stone-700 whitespace-nowrap mr-1">文字サイズ:</span>
              <button
                type="button"
                onClick={() => setFontSizeOffset((o) => Math.max(-25, o - 1))}
                className="w-5 h-5 flex items-center justify-center bg-stone-100 hover:bg-stone-200 border border-stone-300 rounded font-bold text-stone-800 cursor-pointer transition-colors"
                title="文字を小さくする"
              >
                －
              </button>
              <span className="text-xs font-mono font-bold w-10 text-center text-stone-900">
                {spiritFontSizePt}pt
              </span>
              <button
                type="button"
                onClick={() => setFontSizeOffset((o) => Math.min(35, o + 1))}
                className="w-5 h-5 flex items-center justify-center bg-stone-100 hover:bg-stone-200 border border-stone-300 rounded font-bold text-stone-800 cursor-pointer transition-colors"
                title="文字を大きくする"
              >
                ＋
              </button>
              {fontSizeOffset !== 0 && (
                <button
                  type="button"
                  onClick={() => setFontSizeOffset(0)}
                  className="text-[10px] text-amber-800 hover:underline ml-1 cursor-pointer font-medium"
                  title="自動計算の標準サイズに戻す"
                >
                  標準
                </button>
              )}
            </div>

            {/* Target Temples Selection (Multi-select Checkboxes) */}
            {templeList.length > 1 && (
              <div className="flex items-center space-x-2 bg-white px-2.5 py-1 rounded border border-stone-300">
                <span className="font-bold text-stone-700 whitespace-nowrap">対象寺院:</span>
                <div className="flex flex-wrap items-center gap-1.5">
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
                          className="rounded text-[#D4AF37] focus:ring-0 cursor-pointer w-3.5 h-3.5"
                        />
                        <span>{t.name}</span>
                        {t.isMain && (
                          <span className="text-[9px] text-amber-700 bg-amber-100 px-1 rounded">本寺</span>
                        )}
                      </label>
                    );
                  })}
                  {selectedTempleIds.length < templeList.length && (
                    <button
                      type="button"
                      onClick={handleSelectAllTemples}
                      className="text-[11px] text-amber-800 hover:underline ml-1 cursor-pointer"
                    >
                      全選択
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Zoom controls */}
          <div className="flex items-center space-x-1.5">
            <button
              type="button"
              onClick={() => setPreviewZoom((z) => Math.max(60, z - 10))}
              className="p-1 bg-white hover:bg-stone-200 border border-stone-300 rounded text-stone-700"
              title="縮小"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-xs font-mono font-bold w-9 text-center text-stone-700">{previewZoom}%</span>
            <button
              type="button"
              onClick={() => setPreviewZoom((z) => Math.min(150, z + 10))}
              className="p-1 bg-white hover:bg-stone-200 border border-stone-300 rounded text-stone-700"
              title="拡大"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Scrollable Preview Area */}
        <div className="flex-1 overflow-auto p-4 sm:p-8 bg-stone-200/80 yearly-memorial-print-container flex flex-col items-center gap-8">
          {pages.map((page, pageIndex) => {
            // Paper Dimensions for Screen Preview matching exact paper aspect ratio
            const pageWidth = isA3Portrait ? '297mm' : '210mm';
            const pageHeight = isA3Portrait ? '420mm' : '297mm';
            const pagePadding = isA3Portrait ? '12mm 15mm' : '10mm 12mm';

            return (
              <div
                key={`page-wrapper-${pageIndex}`}
                className="w-full flex flex-col items-center"
                style={{
                  transform: `scale(${previewZoom / 100})`,
                  transformOrigin: 'top center',
                  transition: 'transform 0.15s ease-out',
                }}
              >
                {/* Page Indicator (Screen Only) */}
                <div
                  className="flex items-center justify-between text-xs text-stone-600 font-serif mb-2 px-2 no-print"
                  style={{ width: pageWidth }}
                >
                  <span className="font-bold">
                    第 {pageIndex + 1} 頁 / 全 {pages.length} 頁
                  </span>
                  <span className="text-[11px] text-stone-500">
                    {page.columns.filter((c) => c.type === 'spirit').length} 柱の精霊を配置
                  </span>
                </div>

                {/* The Pure White Sheet Paper Container (No Outer Borders) */}
                <div
                  className="yearly-memorial-sheet-page bg-white shadow-2xl print:shadow-none border border-stone-300 print:border-none box-border"
                  style={{
                    width: pageWidth,
                    minHeight: pageHeight,
                    height: pageHeight,
                    padding: pagePadding,
                  }}
                >
                  {/* Vertical Writing Container (flows right-to-left, pure white, no borders) */}
                  <div className="yearly-vertical-print-area w-full h-full select-text overflow-hidden bg-white">
                    {page.columns.length === 0 ? (
                      <div className="text-xl font-bold pt-12 pl-6 whitespace-nowrap text-stone-400">
                        該当する年回忌精霊はございません
                      </div>
                    ) : (
                      <table className="yearly-spirit-table m-0 p-0 h-full bg-white">
                        <tbody>
                          {page.columns.map((col) => {
                            // 1. タイトル列 (A4/A3 縦向きで文字間スペースなし、上揃え・太字)
                            if (col.type === 'title') {
                              return (
                                <tr key={col.id} className="border-none bg-white">
                                  <td
                                    style={{
                                      fontSize: `${titleFontSizePt}pt`,
                                      letterSpacing: '0.06em',
                                      lineHeight: 1.15,
                                      paddingLeft: isA3Portrait ? '14px' : '8px',
                                      paddingRight: isA3Portrait ? '18px' : '10px',
                                    }}
                                    className="align-top text-start font-black whitespace-nowrap text-black select-text"
                                  >
                                    {col.titleText}
                                  </td>
                                </tr>
                              );
                            }

                            // 2. 月見出し列 (上揃え: align-top text-start)
                            if (col.type === 'month') {
                              return (
                                <tr key={col.id} className="border-none bg-white">
                                  <td
                                    style={{
                                      fontSize: `${monthFontSizePt}pt`,
                                      letterSpacing: '0.12em',
                                      lineHeight: 1.15,
                                      paddingLeft: isA3Portrait ? '10px' : '6px',
                                      paddingRight: isA3Portrait ? '14px' : '8px',
                                    }}
                                    className="align-top text-start font-extrabold whitespace-nowrap text-black select-text"
                                  >
                                    {col.monthTitle}
                                  </td>
                                </tr>
                              );
                            }

                            // 3. 精霊列 (1列に 上段:一文字下げ回忌(0.67em)、中段:戒名(1.0em)、下段:俗名(0.67em) が並ぶ配置)
                            const { spirit } = col;
                            const dharmaName = (spirit.record.dharmaName || '').trim().replace(/ /g, '　');
                            const rawSecularName = (spirit.record.secularName || spirit.record.deceasedName || '').trim();
                            const secularName =
                              rawSecularName === 'なし' || rawSecularName === '-' ? '' : rawSecularName.replace(/ /g, '　');
                            const memorialText = convertTextNumbersToKanji(spirit.memorialType || '');

                            // 回忌と戒名の間の空白（その年の最長回忌表記から一文字分空白を入れて戒名を開始）
                            const spacesToDharmaCount = Math.max(1, maxMemorialLen - memorialText.length + 1);

                            // 戒名と俗名の間の空白（その年の最長戒名表記から一文字分空白を入れて俗名を開始）
                            const spacesToSecularCount = Math.max(1, maxDharmaLen - dharmaName.length + 1);

                            const padX = isA3Portrait
                              ? density === 'compact'
                                ? '4px'
                                : density === 'standard'
                                ? '8px'
                                : '14px'
                              : density === 'compact'
                              ? '2px'
                              : density === 'standard'
                              ? '5px'
                              : '10px';

                            return (
                              <tr key={col.id} className="border-none bg-white">
                                <td
                                  className="align-top text-start whitespace-nowrap text-black select-text"
                                  style={{
                                    fontSize: `${spiritFontSizePt}pt`,
                                    letterSpacing: '0.04em',
                                    lineHeight: 1.1,
                                    paddingLeft: padX,
                                    paddingRight: padX,
                                  }}
                                >
                                  {/* 1. 一文字下げ (回忌文字サイズ基準での1文字分) */}
                                  <span style={{ fontSize: '0.67em' }}>　</span>

                                  {/* 2. 回忌 (太字、戒名の約2/3サイズ) */}
                                  <span
                                    className="font-bold text-black"
                                    style={{
                                      fontSize: '0.67em',
                                      letterSpacing: '0.04em',
                                    }}
                                  >
                                    {memorialText}
                                  </span>

                                  {/* 3. 回忌と戒名の間の空白 (最長回忌 + 1文字空け) */}
                                  <span style={{ fontSize: '0.67em' }}>{'　'.repeat(spacesToDharmaCount)}</span>

                                  {/* 4. 戒名・法名 (太字・基準100%サイズ / 戒名がある場合) */}
                                  {dharmaName ? (
                                    <span className="font-bold text-black">{dharmaName}</span>
                                  ) : (
                                    <span>{'　'.repeat(maxDharmaLen)}</span>
                                  )}

                                  {/* 5. 戒名と俗名の間の空白 ＋ 俗名 (年忌と同じ約2/3サイズ) */}
                                  {secularName && (
                                    <>
                                      <span style={{ fontSize: '1em' }}>{'　'.repeat(spacesToSecularCount)}</span>
                                      <span
                                        className="font-normal text-stone-900"
                                        style={{
                                          fontSize: '0.67em',
                                          letterSpacing: '0.04em',
                                        }}
                                      >
                                        {secularName}
                                      </span>
                                    </>
                                  )}
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
            );
          })}
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};
