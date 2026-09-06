import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, Printer, Settings2, FileText } from 'lucide-react';
import { Household, PastRecord, TempleProfile } from '../types';
import { formatJapaneseEraDate, normalizeDateInput, getHouseholdSponsorName, getHouseholdSponsorInfo } from '../utils/memorialCalculator';

interface HouseholdAddressBookPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  households: Household[];
  pastRecords: PastRecord[];
  templeName?: string;
  templeInfo?: TempleProfile;
  selectedHouseholdIds?: string[];
}

/**
 * 世帯および家族メンバーの集金項目を集約
 */
export function getHouseholdFeeSummary(
  household: Household,
  templeInfo?: TempleProfile
): { name: string; amountStr: string }[] {
  const items: { name: string; amountStr: string }[] = [];

  // 塔婆関連の項目は住所録から除外する（塔婆の表示は削除）
  const isTobaRelated = (name: string) => /塔婆|とうば|toba|施餓鬼/i.test(name);

  // 集金1 (例: 護持会費)
  const fee1Name = (templeInfo?.feeType1 || '').trim() || '護持会費';
  const fee1Raw = household.fee1Amount !== undefined && household.fee1Amount !== null
    ? household.fee1Amount
    : household.fee1;
  const fee1Num = fee1Raw !== undefined && fee1Raw !== null && fee1Raw !== '' ? Number(fee1Raw) : undefined;
  if (!isTobaRelated(fee1Name) && fee1Num !== undefined && !isNaN(fee1Num) && fee1Num > 0) {
    items.push({ name: fee1Name, amountStr: `¥${fee1Num.toLocaleString()}` });
  }

  // 集金2 (例: 墓地管理費)
  const fee2Name = (templeInfo?.feeType2 || '').trim() || '墓地管理費';
  const fee2Raw = household.fee2Amount !== undefined && household.fee2Amount !== null
    ? household.fee2Amount
    : household.fee2;
  const fee2Num = fee2Raw !== undefined && fee2Raw !== null && fee2Raw !== '' ? Number(fee2Raw) : undefined;
  if (!isTobaRelated(fee2Name) && fee2Num !== undefined && !isNaN(fee2Num) && fee2Num > 0) {
    items.push({ name: fee2Name, amountStr: `¥${fee2Num.toLocaleString()}` });
  }

  // 集金3 (例: 志納金)
  const fee3Name = (templeInfo?.feeType3 || '').trim() || '志納金';
  const fee3Raw = household.fee3Amount !== undefined && household.fee3Amount !== null
    ? household.fee3Amount
    : household.fee3;
  const fee3Num = fee3Raw !== undefined && fee3Raw !== null && fee3Raw !== '' ? Number(fee3Raw) : undefined;
  if (!isTobaRelated(fee3Name) && fee3Num !== undefined && !isNaN(fee3Num) && fee3Num > 0) {
    items.push({ name: fee3Name, amountStr: `¥${fee3Num.toLocaleString()}` });
  }

  // 家族メンバー個別集金設定
  (household.familyMembers || []).forEach((fm) => {
    if (!isTobaRelated(fee1Name) && fm.fee1Amount && !isNaN(Number(fm.fee1Amount)) && Number(fm.fee1Amount) > 0) {
      items.push({ name: `${fee1Name}(${fm.name || '家族'})`, amountStr: `¥${Number(fm.fee1Amount).toLocaleString()}` });
    }
    if (!isTobaRelated(fee2Name) && fm.fee2Amount && !isNaN(Number(fm.fee2Amount)) && Number(fm.fee2Amount) > 0) {
      items.push({ name: `${fee2Name}(${fm.name || '家族'})`, amountStr: `¥${Number(fm.fee2Amount).toLocaleString()}` });
    }
    if (!isTobaRelated(fee3Name) && fm.fee3Amount && !isNaN(Number(fm.fee3Amount)) && Number(fm.fee3Amount) > 0) {
      items.push({ name: `${fee3Name}(${fm.name || '家族'})`, amountStr: `¥${Number(fm.fee3Amount).toLocaleString()}` });
    }
  });

  return items;
}

export const HouseholdAddressBookPrintModal: React.FC<HouseholdAddressBookPrintModalProps> = ({
  isOpen,
  onClose,
  households,
  pastRecords,
  templeName = '寺院',
  templeInfo,
  selectedHouseholdIds = [],
}) => {
  // Target Selection mode: 'all' (All sorted by Kana), 'filtered' (Current visible/selected), 'selectedOnly'
  const [targetMode, setTargetMode] = useState<'all' | 'selectedOnly'>(
    selectedHouseholdIds.length > 0 ? 'selectedOnly' : 'all'
  );

  // Items per page: 7 or 8 (Default: 7)
  const [itemsPerPage, setItemsPerPage] = useState<number>(7);

  // Issue date string (Default: Current Year/Month in Japanese Era e.g. "令和8年 8月発行")
  const defaultIssueDate = useMemo(() => {
    const today = new Date();
    const eraStr = formatJapaneseEraDate(
      `${today.getFullYear()}/${today.getMonth() + 1}/${today.getDate()}`,
      false
    );
    const parts = eraStr.split(/年|月/);
    if (parts.length >= 2) {
      return `${parts[0]}年 ${today.getMonth() + 1}月発行`;
    }
    return `令和${today.getFullYear() - 2018}年 ${today.getMonth() + 1}月発行`;
  }, []);

  const [issueDateText, setIssueDateText] = useState<string>(defaultIssueDate);
  const [titleText, setTitleText] = useState<string>(`${templeName} 住所録`);
  const [includeCover, setIncludeCover] = useState<boolean>(true);
  const [showFees, setShowFees] = useState<boolean>(true);

  // Map past records to household id for fast lookup
  const pastRecordsByHousehold = useMemo(() => {
    const map = new Map<string, PastRecord[]>();
    pastRecords.forEach((pr) => {
      if (!pr.householdId) return;
      const list = map.get(pr.householdId) || [];
      list.push(pr);
      map.set(pr.householdId, list);
    });

    // Sort past records ascending by deathDate: 古い精霊が上、下に行くほど新しい精霊（昇順）
    map.forEach((list) => {
      list.sort((a, b) => {
        const da = normalizeDateInput(a.deathDate || '');
        const db = normalizeDateInput(b.deathDate || '');
        if (da && db) return da.localeCompare(db); // 古い命日が上、新しい命日が下
        if (da && !db) return -1; // 命日ありの精霊を優先（上）
        if (!da && db) return 1;  // 逆修（命日未定）は最下部
        return (a.dharmaName || a.secularName || '').localeCompare(b.dharmaName || b.secularName || '');
      });
    });

    return map;
  }, [pastRecords]);

  // Sorted households by kana/familyHead
  const targetHouseholds = useMemo(() => {
    let list = [...households];
    if (targetMode === 'selectedOnly' && selectedHouseholdIds.length > 0) {
      const selectedSet = new Set(selectedHouseholdIds);
      list = list.filter((h) => selectedSet.has(h.id));
    }

    // Sort by furigana, fallback to sponsorName
    list.sort((a, b) => {
      const spA = getHouseholdSponsorInfo(a);
      const spB = getHouseholdSponsorInfo(b);
      const ka = spA.furigana || spA.sponsorName || '';
      const kb = spB.furigana || spB.sponsorName || '';
      return ka.localeCompare(kb, 'ja');
    });

    return list;
  }, [households, targetMode, selectedHouseholdIds]);

  // Paginated chunks of households (7 or 8 items per page)
  const pages = useMemo(() => {
    const result: Household[][] = [];
    for (let i = 0; i < targetHouseholds.length; i += itemsPerPage) {
      result.push(targetHouseholds.slice(i, i + itemsPerPage));
    }
    return result;
  }, [targetHouseholds, itemsPerPage]);

  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  const modalContent = (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 flex items-center justify-center p-2 sm:p-4 print:p-0 print:static print:bg-transparent print:overflow-visible">
      {/* Print-specific CSS styles */}
      <style>{`
        @media print {
          #root {
            display: none !important;
          }
          @page {
            size: A4 portrait;
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
          .address-book-modal-box {
            border: none !important;
            box-shadow: none !important;
            width: 100% !important;
            max-width: none !important;
            height: auto !important;
            overflow: visible !important;
            background: transparent !important;
          }
          .address-book-print-container {
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            background: transparent !important;
            overflow: visible !important;
          }
          .address-book-page {
            page-break-after: always;
            break-after: page;
            page-break-inside: avoid;
            break-inside: avoid;
            height: 278mm !important;
            max-height: 278mm !important;
            box-sizing: border-box !important;
            display: flex !important;
            flex-direction: column !important;
            justify-content: space-between !important;
            overflow: hidden !important;
            padding: 4mm 6mm !important;
          }
          .address-book-page:last-child {
            page-break-after: auto;
            break-after: auto;
          }
        }
      `}</style>

      {/* Main Modal Container */}
      <div className="address-book-modal-box bg-white w-full max-w-5xl h-[92vh] flex flex-col rounded-sm shadow-2xl overflow-hidden font-sans border border-stone-300">
        {/* Modal Header (No Print) */}
        <div className="bg-[#1A1A1A] text-[#F9F7F2] px-5 py-3.5 flex items-center justify-between border-b border-[#D4AF37] no-print shrink-0">
          <div className="flex items-center space-x-2.5">
            <FileText className="w-5 h-5 text-[#D4AF37]" />
            <div>
              <h2 className="text-base sm:text-lg font-bold font-serif tracking-wider">
                寺院住所録 印刷プレビュー
              </h2>
              <p className="text-[11px] text-stone-400">
                1ページ目表紙 ＋ 2ページ目以降五十音順A4名簿（過去帳・集金項目掲載）
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
              className="p-1.5 text-stone-400 hover:text-white hover:bg-stone-800 rounded transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Toolbar / Options (No Print) */}
        <div className="bg-stone-100 border-b border-stone-300 p-3 text-xs flex flex-wrap items-center justify-between gap-3 no-print shrink-0">
          <div className="flex flex-wrap items-center gap-4">
            {/* Target Mode */}
            <div className="flex items-center space-x-2">
              <span className="font-bold text-stone-700">対象:</span>
              <select
                value={targetMode}
                onChange={(e) => setTargetMode(e.target.value as any)}
                className="bg-white border border-stone-300 rounded px-2.5 py-1 text-xs text-stone-800 focus:outline-none"
              >
                <option value="all">全檀家 ({households.length}件)</option>
                {selectedHouseholdIds.length > 0 && (
                  <option value="selectedOnly">選択中の檀家のみ ({selectedHouseholdIds.length}件)</option>
                )}
              </select>
            </div>

            {/* Items Per Page */}
            <div className="flex items-center space-x-2">
              <span className="font-bold text-stone-700">1ページの件数:</span>
              <select
                value={itemsPerPage}
                onChange={(e) => setItemsPerPage(Number(e.target.value))}
                className="bg-white border border-stone-300 rounded px-2.5 py-1 text-xs text-stone-800 focus:outline-none"
              >
                <option value={7}>7件 (ゆったり)</option>
                <option value={8}>8件 (標準)</option>
                <option value={6}>6件 (大きめ)</option>
              </select>
            </div>

            {/* Include Cover */}
            <label className="flex items-center space-x-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={includeCover}
                onChange={(e) => setIncludeCover(e.target.checked)}
                className="rounded border-stone-300 text-stone-900 focus:ring-stone-400"
              />
              <span className="font-bold text-stone-700">1ページ目に表紙を含める</span>
            </label>

            {/* Include Fees */}
            <label className="flex items-center space-x-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showFees}
                onChange={(e) => setShowFees(e.target.checked)}
                className="rounded border-stone-300 text-stone-900 focus:ring-stone-400"
              />
              <span className="font-bold text-stone-700">集金項目を印字</span>
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Title Text */}
            <div className="flex items-center space-x-1.5">
              <span className="text-stone-600">表紙題名:</span>
              <input
                type="text"
                value={titleText}
                onChange={(e) => setTitleText(e.target.value)}
                className="bg-white border border-stone-300 rounded px-2 py-1 text-xs text-stone-800 w-36 focus:outline-none"
              />
            </div>

            {/* Issue Date */}
            <div className="flex items-center space-x-1.5">
              <span className="text-stone-600">発行年月:</span>
              <input
                type="text"
                value={issueDateText}
                onChange={(e) => setIssueDateText(e.target.value)}
                className="bg-white border border-stone-300 rounded px-2 py-1 text-xs text-stone-800 w-36 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Preview Scrollable Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 bg-stone-200/80 address-book-print-container">
          <div className="max-w-[210mm] mx-auto space-y-8 print:space-y-0">
            {/* 1. COVER PAGE (1ページ目 表紙) */}
            {includeCover && (
              <div className="address-book-page bg-white shadow-md print:shadow-none p-10 sm:p-14 border border-stone-300 print:border-none h-[278mm] max-h-[278mm] flex flex-col justify-between items-center text-center font-serif text-stone-900 overflow-hidden">
                {/* Decorative border frame */}
                <div className="w-full h-full border-4 border-double border-stone-800 p-8 flex flex-col justify-between items-center">
                  <div className="pt-16 space-y-4">
                    <div className="text-sm tracking-[0.5em] text-stone-600">
                      檀 信 徒 名 簿
                    </div>
                    <h1 className="text-4xl sm:text-5xl font-black tracking-[0.3em] text-stone-950 pt-8 pb-4">
                      {titleText}
                    </h1>
                    <div className="w-32 h-1 bg-stone-800 mx-auto my-6"></div>
                  </div>

                  <div className="py-12 space-y-4">
                    <div className="text-2xl font-bold tracking-[0.25em] text-stone-800">
                      {issueDateText}
                    </div>
                    <div className="text-xs text-stone-500 tracking-widest pt-2">
                      総世帯数：{targetHouseholds.length} 軒
                    </div>
                  </div>

                  <div className="pb-12 space-y-2 text-stone-700 text-sm">
                    <div className="text-lg font-bold tracking-widest">{templeName}</div>
                    {templeInfo?.address && (
                      <div className="text-xs tracking-wider">{templeInfo.address}</div>
                    )}
                    {templeInfo?.phone && (
                      <div className="text-xs tracking-wider">電話：{templeInfo.phone}</div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* 2. ROSTER PAGES (2ページ目以降 名簿カード一覧) */}
            {pages.map((pageHouseholds, pageIndex) => {
              const currentPageNum = includeCover ? pageIndex + 2 : pageIndex + 1;
              const totalPages = includeCover ? pages.length + 1 : pages.length;

              return (
                <div
                  key={`page-${pageIndex}`}
                  className="address-book-page bg-white shadow-md print:shadow-none p-5 sm:p-6 border border-stone-300 print:border-none h-[278mm] max-h-[278mm] flex flex-col justify-between font-serif text-stone-900 overflow-hidden"
                >
                  {/* Page Top Header */}
                  <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-stone-800 text-[11px] text-stone-700 shrink-0">
                    <span className="font-bold tracking-wider">{titleText}</span>
                    <span className="font-sans text-[10px] text-stone-500">
                      {pageIndex * itemsPerPage + 1} 〜 {Math.min((pageIndex + 1) * itemsPerPage, targetHouseholds.length)} 件 / 全 {targetHouseholds.length} 件
                    </span>
                  </div>

                  {/* Household Cards (7〜8件/ページ) */}
                  <div className="flex-1 flex flex-col justify-between divide-y divide-stone-400 overflow-hidden">
                    {pageHouseholds.map((household) => {
                      const records = pastRecordsByHousehold.get(household.id) || [];
                      // 直近最大4件の精霊（昇順：下に行くほど新しい精霊）
                      const displayRecords = records.length > 4 ? records.slice(-4) : records;

                      const isTobaText = (t: string) => /塔婆|とうば|toba|施餓鬼/i.test(t);
                      // Red badges for status / note
                      const statusTags: string[] = [];
                      if (household.householdType && !isTobaText(household.householdType)) statusTags.push(household.householdType);
                      if (household.district && !isTobaText(household.district)) statusTags.push(household.district);
                      if (household.status && household.status !== '通常' && !isTobaText(household.status)) statusTags.push(household.status);

                      return (
                        <div
                          key={household.id}
                          className="py-1 flex items-start justify-between gap-3 text-stone-900"
                          style={{ minHeight: `${230 / itemsPerPage}mm` }}
                        >
                          {/* LEFT COLUMN: Name, Sponsor, Badge, Notes */}
                          <div className="w-[28%] shrink-0 flex flex-col justify-between pr-2 border-r border-stone-200">
                            <div>
                              {/* Red Badges */}
                              <div className="flex flex-wrap gap-1 mb-0.5">
                                {statusTags.map((tag, idx) => (
                                  <span
                                    key={idx}
                                    className="text-[10px] font-bold text-red-700 font-sans tracking-tight"
                                  >
                                    {tag}
                                  </span>
                                ))}
                              </div>

                              {/* Sponsor Name, Tomb Number & Household Head */}
                              {(() => {
                                const sponsorInfo = getHouseholdSponsorInfo(household);
                                return (
                                  <div>
                                    <div className="flex items-baseline gap-1.5 flex-wrap">
                                      <span className="text-[17px] font-black text-stone-950 tracking-wider leading-snug">
                                        {sponsorInfo.sponsorName || '（氏名未登録）'}
                                      </span>
                                      {household.tombNumber && (
                                        <span className="text-[10px] font-bold text-stone-700 font-sans tracking-normal border border-stone-300 bg-stone-50 px-1 py-0.5 rounded-2xs whitespace-nowrap">
                                          墓: {household.tombNumber}
                                        </span>
                                      )}
                                    </div>
                                    {sponsorInfo.isDistinctFromHead && sponsorInfo.householdHead && (
                                      <div className="text-[10.5px] text-stone-500 font-normal font-sans mt-0.5">
                                        （世帯主: {sponsorInfo.householdHead}）
                                      </div>
                                    )}
                                  </div>
                                );
                              })()}
                            </div>

                            {/* Remarks / Special Notes */}
                            {household.notes && (
                              <div className="text-[9px] text-stone-600 leading-tight mt-1 line-clamp-2 font-sans">
                                {household.notes}
                              </div>
                            )}
                          </div>

                          {/* RIGHT COLUMN: Address, Tel, Temple ID + Past Records Table */}
                          <div className="flex-1 flex flex-col justify-between">
                            <div>
                              {/* 集金項目行 (住所・電話番号の上に配置。設定がない場合は行自体を表示しない) */}
                              {(() => {
                                if (!showFees) return null;
                                const feeItems = getHouseholdFeeSummary(household, templeInfo);

                                if (feeItems.length === 0) return null;

                                return (
                                  <div className="flex items-center justify-between gap-2 text-[8.5px] print:text-[8px] leading-tight pb-0.5 mb-0.5 border-b border-stone-200 text-stone-700 font-sans whitespace-nowrap overflow-hidden">
                                    <div className="flex items-center gap-1.5 truncate">
                                      <span className="font-bold text-stone-900 font-serif shrink-0">［集金］</span>
                                      <div className="flex items-center gap-2 truncate">
                                        {feeItems.map((fee, fIdx) => (
                                          <span key={fIdx} className="text-stone-800 shrink-0">
                                            <span className="text-stone-600">{fee.name}:</span>{' '}
                                            <strong className="font-mono font-bold text-stone-950">{fee.amountStr}</strong>
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })()}

                              {/* Top info line: Address, Phone, ID (1行で収まるようにフォントサイズ調整) */}
                              <div className="flex items-center justify-between text-[8px] print:text-[7.5px] leading-tight pb-0.5 gap-2 whitespace-nowrap overflow-hidden">
                                <div className="flex items-center gap-1 truncate min-w-0 flex-1">
                                  {household.postalCode && (
                                    <span className="font-mono text-stone-600 shrink-0 text-[7.5px] print:text-[7px]">
                                      〒{household.postalCode}
                                    </span>
                                  )}
                                  <span className="font-bold text-stone-900 truncate">
                                    {household.address || '（住所未登録）'}
                                  </span>
                                </div>

                                <div className="flex items-center space-x-1.5 shrink-0 text-[8px] print:text-[7.5px] text-stone-700">
                                  {household.phone && (
                                    <span className="whitespace-nowrap">
                                      TEL <strong className="font-mono text-stone-950">{household.phone}</strong>
                                    </span>
                                  )}
                                  {household.mobile && (
                                    <span className="whitespace-nowrap">
                                      携帯 <strong className="font-mono text-stone-950">{household.mobile}</strong>
                                    </span>
                                  )}
                                  <span className="text-[7px] font-mono text-stone-400">
                                    {household.id.slice(-6)}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Bottom: Past Records Table (Up to 4 latest records, subtle gray stripes, sorted chronologically: 下に行くほど新しい精霊) */}
                            <div className="bg-stone-100/80 rounded-xs border border-stone-200 overflow-hidden text-[9.5px]">
                              <table className="w-full border-collapse">
                                <tbody>
                                  {Array.from({ length: 4 }).map((_, rIdx) => {
                                    const rec = displayRecords[rIdx];
                                    if (!rec) {
                                      return (
                                        <tr
                                          key={`empty-${rIdx}`}
                                          className="border-b border-stone-200/50 last:border-b-0 h-4"
                                        >
                                          <td colSpan={6} className="py-0.5 px-1 text-transparent">
                                            -
                                          </td>
                                        </tr>
                                      );
                                    }

                                    const eraDate = rec.deathDate
                                      ? formatJapaneseEraDate(rec.deathDate, false)
                                      : '逆　修';

                                    return (
                                      <tr
                                        key={rec.id || rIdx}
                                        className="border-b border-stone-200 last:border-b-0 hover:bg-stone-200/50"
                                      >
                                        {/* 1. 年月日 */}
                                        <td className={`py-0.5 px-1.5 font-bold whitespace-nowrap w-[24%] ${!rec.deathDate ? 'text-stone-900 tracking-widest' : 'text-stone-800'}`}>
                                          {eraDate}
                                        </td>
                                        {/* 2. 戒名 */}
                                        <td className="py-0.5 px-1.5 font-black text-stone-950 whitespace-nowrap w-[32%]">
                                          {rec.dharmaName || ''}
                                        </td>
                                        {/* 3. 当時の施主 */}
                                        <td className="py-0.5 px-1 text-stone-700 whitespace-nowrap w-[14%]">
                                          {rec.chiefMourner || rec.householdHeadName || household.familyHead || ''}
                                        </td>
                                        {/* 4. 続柄 */}
                                        <td className="py-0.5 px-1 text-stone-600 whitespace-nowrap w-[10%]">
                                          {rec.relationship || ''}
                                        </td>
                                        {/* 5. 俗名 */}
                                        <td className="py-0.5 px-1 text-stone-800 whitespace-nowrap w-[12%]">
                                          {rec.secularName || ''}
                                        </td>
                                        {/* 6. 享年 */}
                                        <td className="py-0.5 px-1 text-right text-stone-700 whitespace-nowrap w-[8%] font-sans">
                                          {rec.ageAtDeath ? `${rec.ageAtDeath}歳` : ''}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Page Footer */}
                  <div className="pt-2 mt-2 border-t border-stone-800 flex items-center justify-between text-[10px] text-stone-500 font-sans">
                    <span>{templeName}</span>
                    <span className="font-bold text-stone-800">
                      - {currentPageNum} / {totalPages} -
                    </span>
                    <span>{issueDateText}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

