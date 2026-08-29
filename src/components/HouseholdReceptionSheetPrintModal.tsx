import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Printer, Search, ClipboardCheck, LayoutGrid, Table, Edit3, Coins } from 'lucide-react';
import { Household, PastRecord, TempleProfile } from '../types';
import { 
  getJapaneseEra, 
  getHouseholdSponsorInfo, 
  getHouseholdNiibonStatus 
} from '../utils/memorialCalculator';
import { getFeeSlots, getHouseholdFeeAmount, formatFeeAmount } from '../utils/feeUtils';

interface HouseholdReceptionSheetPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  households: Household[];
  filteredHouseholds?: Household[];
  pastRecords: PastRecord[];
  templeName?: string;
  templeInfo?: TempleProfile;
  selectedHouseholdIds?: string[];
}

const GOJUON_ROWS = ['あ行', 'か行', 'さ行', 'た行', 'な行', 'は行', 'ま行', 'や行', 'ら行', 'わ行', 'その他'];

export function getGojuonRow(kanaOrName: string): string {
  if (!kanaOrName || kanaOrName.trim() === '') return 'その他';
  const firstChar = kanaOrName.trim().charAt(0);
  const code = firstChar.charCodeAt(0);
  let char = firstChar;
  // Convert Katakana to Hiragana for uniform check
  if (code >= 0x30a1 && code <= 0x30f6) {
    char = String.fromCharCode(code - 0x60);
  }

  if (/^[あいうえおぁぃぅぇぉ]/.test(char)) return 'あ行';
  if (/^[かきくけこがぎぐげご]/.test(char)) return 'か行';
  if (/^[さしすせそざじずぜぞ]/.test(char)) return 'さ行';
  if (/^[たちつてとだぢづでどっ]/.test(char)) return 'た行';
  if (/^[なにぬねの]/.test(char)) return 'な行';
  if (/^[はひふへほばびぶべぼぱぴぷぺぽ]/.test(char)) return 'は行';
  if (/^[まみむめも]/.test(char)) return 'ま行';
  if (/^[やゆよゃゅょ]/.test(char)) return 'や行';
  if (/^[らりるれろ]/.test(char)) return 'ら行';
  if (/^[わをん]/.test(char)) return 'わ行';
  return 'その他';
}

export interface ReceptionHouseholdItem {
  key: string;
  householdId: string;
  household: Household;
  householdHead: string;
  sponsorName: string;
  furigana: string;
  relationship: string;
  isFamilyHead: boolean;
  district: string;
  address: string;
  phone: string;
  status: string;
  householdType: string;
  gojuonRow: string;
  // Badges & status
  isHatsubon: boolean;
  hatsubonDharmaNames: string[];
  isTanagyo: boolean;
  isPaid: boolean;
  isUnknown: boolean;
  // Toba & Tamegaki
  tobaApplied: boolean;
  tamegakiList: string[];
}

export const HouseholdReceptionSheetPrintModal: React.FC<HouseholdReceptionSheetPrintModalProps> = ({
  isOpen,
  onClose,
  households,
  filteredHouseholds,
  pastRecords,
  templeName = '寺院',
  templeInfo,
  selectedHouseholdIds = [],
}) => {
  // Effective Toba Slot Names
  const toba1Name = templeInfo?.tobaType1 !== undefined && templeInfo?.tobaType1 !== '' ? templeInfo.tobaType1 : '施餓鬼塔婆';
  const toba2Name = templeInfo?.tobaType2 || '塔婆２';
  const toba3Name = templeInfo?.tobaType3 || '塔婆３';

  // Effective Fee Slots from Temple Info
  const effectiveFeeSlots = useMemo(() => {
    return getFeeSlots(templeInfo);
  }, [templeInfo]);

  // Target Selection Mode
  const isFilteredAvailable = Boolean(filteredHouseholds && filteredHouseholds.length > 0 && filteredHouseholds.length < households.length);
  const [targetFilter, setTargetFilter] = useState<'all' | 'filtered' | 'hatsubonOnly' | 'tanagyoOnly' | 'selectedOnly'>(
    isFilteredAvailable ? 'filtered' : 'all'
  );
  const [districtFilter, setDistrictFilter] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // View & Print Controls
  const [viewMode, setViewMode] = useState<'twocolumn' | 'table'>('twocolumn');
  const [printOrientation, setPrintOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const [showUnderline, setShowUnderline] = useState<boolean>(true);
  const [showFuriganaRuby, setShowFuriganaRuby] = useState<boolean>(true);

  // Selected Toba Slot for Display and Column 1 Label
  const [selectedTobaSlot, setSelectedTobaSlot] = useState<'none' | 'slot1' | 'slot2' | 'slot3' | 'all'>('slot1');
  const [showTamegaki, setShowTamegaki] = useState<boolean>(true);

  // Reference year for Hatsubon (New Obon)
  const currentYear = new Date().getFullYear();
  const currentEra = getJapaneseEra(currentYear);
  const [hatsubonYear, setHatsubonYear] = useState<number>(currentYear);

  // Editable Title & Subtitle
  const defaultTitle = `${currentEra} 施餓鬼会・盂蘭盆会 檀家受付票`;
  const [customTitle, setCustomTitle] = useState<string>(defaultTitle);
  const [customSubtitle, setCustomSubtitle] = useState<string>('五十音行順整列（世帯主・施主 / 塔婆志納・盆供・手書き受付用）');
  const [isEditingTitle, setIsEditingTitle] = useState<boolean>(false);

  // Toggle printing of Hatsubon & Tanagyo badges
  const [showHatsubonBadge, setShowHatsubonBadge] = useState<boolean>(true);
  const [showTanagyoBadge, setShowTanagyoBadge] = useState<boolean>(true);

  // Custom column labels (Default: based on fee slots or standard labels)
  const defaultCol1 = templeInfo?.feeType1 || '護持会費';
  const defaultCol2 = templeInfo?.feeType2 || '盆供';
  const defaultCol3 = templeInfo?.feeType3 || '志納金';
  const [col1Label, setCol1Label] = useState<string>(defaultCol1);
  const [col2Label, setCol2Label] = useState<string>(defaultCol2);
  const [col3Label, setCol3Label] = useState<string>(defaultCol3);

  // Common amount per column when not specified in household fee
  const [col1Amount, setCol1Amount] = useState<string>('');
  const [col2Amount, setCol2Amount] = useState<string>('');
  const [col3Amount, setCol3Amount] = useState<string>('');

  // Column popup options restricted to Fee items only (集金項目のみ)
  const columnPresets = useMemo(() => {
    const options: { label: string; value: string }[] = [];
    const f1 = templeInfo?.feeType1 || '護持会費';
    const f2 = templeInfo?.feeType2 || '墓地管理費';
    const f3 = templeInfo?.feeType3 || '特別寄付';

    options.push({ label: `【集金1】${f1}`, value: f1 });
    options.push({ label: `【集金2】${f2}`, value: f2 });
    options.push({ label: `【集金3】${f3}`, value: f3 });

    return options;
  }, [templeInfo]);

  // Formats common amount string (e.g. "3000" -> "3,000円", "３０００円" -> "3,000円")
  const formatCommonAmount = (amountStr: string): string => {
    if (!amountStr || !amountStr.trim()) return '';
    const trimmed = amountStr.trim();
    // Normalize full-width digits to half-width
    const normalized = trimmed.replace(/[０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xFEE0));
    const numOnly = parseInt(normalized.replace(/[^0-9]/g, ''), 10);
    if (!isNaN(numOnly) && numOnly > 0) {
      return `${numOnly.toLocaleString()}円`;
    }
    return trimmed;
  };

  // Helper to retrieve fee amount for a given column label if assigned to a fee slot or common amount
  const getColFeeDisplay = (h: Household, colLabel: string, colCommonAmount?: string): string => {
    if (!colLabel || !colLabel.trim()) return '';
    const trimmed = colLabel.trim();
    const amount = getHouseholdFeeAmount(h, trimmed, templeInfo);
    if (amount !== undefined && amount !== null && amount > 0) {
      return `${amount.toLocaleString()}円`;
    }
    if (colCommonAmount && colCommonAmount.trim()) {
      return formatCommonAmount(colCommonAmount);
    }
    return '';
  };

  // Sync targetFilter when modal opens or filteredHouseholds change
  useEffect(() => {
    if (isOpen) {
      if (filteredHouseholds && filteredHouseholds.length > 0 && filteredHouseholds.length < households.length) {
        setTargetFilter('filtered');
      } else {
        setTargetFilter('all');
      }
    }
  }, [isOpen, filteredHouseholds, households.length]);

  // Sync body class for print isolation
  useEffect(() => {
    if (isOpen) {
      document.body.classList.add('reception-modal-open');
    } else {
      document.body.classList.remove('reception-modal-open');
    }
    return () => {
      document.body.classList.remove('reception-modal-open');
    };
  }, [isOpen]);

  // Set of household IDs with Hatsubon in the target year using strict memorialCalculator logic
  const hatsubonHouseholdMap = useMemo(() => {
    const map = new Map<string, { count: number; dharmaNames: string[] }>();

    households.forEach((h) => {
      const status = getHouseholdNiibonStatus(
        pastRecords,
        h.id,
        templeInfo?.bonSeason || '8月盆',
        hatsubonYear
      );
      if (status.isCurrentYearNiibon && status.currentYearNiibonCount > 0) {
        map.set(h.id, {
          count: status.currentYearNiibonCount,
          dharmaNames: status.currentYearRecords
            .map((r) => r.dharmaName || r.secularName || '')
            .filter(Boolean),
        });
      }
    });

    return map;
  }, [households, pastRecords, hatsubonYear, templeInfo]);

  // Determine if household is Tanagyo
  const isTanagyoHousehold = (h: Household) => {
    return Boolean(h.tanagyoMonthlyVisit || h.tanagyoDate || h.tanagyoTimeSlot);
  };

  // Get Toba application info and Tamegaki for a household
  const getHouseholdTobaInfo = (h: Household) => {
    if (selectedTobaSlot === 'none') {
      return { isApplied: false, tamegakiList: [] };
    }

    const tamegakiItems: string[] = [];
    let isApplied = false;

    // Slot 1
    if (selectedTobaSlot === 'slot1' || selectedTobaSlot === 'all') {
      const h1Applied = h.toba1Applied !== undefined ? h.toba1Applied : h.isSegakiToba;
      const h1Tame = h.toba1Tamegaki !== undefined ? h.toba1Tamegaki : h.segakiTamegaki;
      if (h1Applied) isApplied = true;
      if (h1Tame && h1Tame.trim()) {
        tamegakiItems.push(selectedTobaSlot === 'all' ? `[${toba1Name}] ${h1Tame.trim()}` : h1Tame.trim());
      }
      // Family members
      (h.familyMembers || []).forEach((fm) => {
        const fm1Applied = fm.toba1Applied !== undefined ? fm.toba1Applied : fm.isSegakiToba;
        const fm1Tame = fm.toba1Tamegaki !== undefined ? fm.toba1Tamegaki : fm.segakiTamegaki;
        if (fm1Applied) isApplied = true;
        if (fm1Tame && fm1Tame.trim()) {
          const fmName = fm.name ? `${fm.name}: ` : '';
          tamegakiItems.push(selectedTobaSlot === 'all' ? `[${toba1Name}] ${fmName}${fm1Tame.trim()}` : `${fmName}${fm1Tame.trim()}`);
        }
      });
    }

    // Slot 2
    if (selectedTobaSlot === 'slot2' || selectedTobaSlot === 'all') {
      if (h.toba2Applied) isApplied = true;
      if (h.toba2Tamegaki && h.toba2Tamegaki.trim()) {
        tamegakiItems.push(selectedTobaSlot === 'all' ? `[${toba2Name}] ${h.toba2Tamegaki.trim()}` : h.toba2Tamegaki.trim());
      }
      (h.familyMembers || []).forEach((fm) => {
        if (fm.toba2Applied) isApplied = true;
        if (fm.toba2Tamegaki && fm.toba2Tamegaki.trim()) {
          const fmName = fm.name ? `${fm.name}: ` : '';
          tamegakiItems.push(selectedTobaSlot === 'all' ? `[${toba2Name}] ${fmName}${fm.toba2Tamegaki.trim()}` : `${fmName}${fm.toba2Tamegaki.trim()}`);
        }
      });
    }

    // Slot 3
    if (selectedTobaSlot === 'slot3' || selectedTobaSlot === 'all') {
      if (h.toba3Applied) isApplied = true;
      if (h.toba3Tamegaki && h.toba3Tamegaki.trim()) {
        tamegakiItems.push(selectedTobaSlot === 'all' ? `[${toba3Name}] ${h.toba3Tamegaki.trim()}` : h.toba3Tamegaki.trim());
      }
      (h.familyMembers || []).forEach((fm) => {
        if (fm.toba3Applied) isApplied = true;
        if (fm.toba3Tamegaki && fm.toba3Tamegaki.trim()) {
          const fmName = fm.name ? `${fm.name}: ` : '';
          tamegakiItems.push(selectedTobaSlot === 'all' ? `[${toba3Name}] ${fmName}${fm.toba3Tamegaki.trim()}` : `${fmName}${fm.toba3Tamegaki.trim()}`);
        }
      });
    }

    return { isApplied, tamegakiList: tamegakiItems };
  };

  // Distinct districts
  const districts = useMemo(() => {
    const set = new Set<string>();
    households.forEach((h) => {
      if (h.district && h.district.trim() !== '') {
        set.add(h.district.trim());
      }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ja'));
  }, [households]);

  // Process and format items
  const allItems: ReceptionHouseholdItem[] = useMemo(() => {
    return households.map((h) => {
      const sp = getHouseholdSponsorInfo(h);
      const isHatsubon = hatsubonHouseholdMap.has(h.id);
      const hatsubonData = hatsubonHouseholdMap.get(h.id);
      const isTanagyo = isTanagyoHousehold(h);
      const tobaInfo = getHouseholdTobaInfo(h);
      const row = getGojuonRow(sp.furigana || sp.sponsorName || '');

      return {
        key: `rec-hh-${h.id}`,
        householdId: h.id,
        household: h,
        householdHead: h.familyHead || '',
        sponsorName: sp.sponsorName || h.familyHead || '（氏名未登録）',
        furigana: sp.furigana || h.furigana || '',
        relationship: sp.isDistinctFromHead ? '施主' : '世帯主',
        isFamilyHead: !sp.isDistinctFromHead,
        district: h.district || '地区未定',
        address: h.address || '',
        phone: h.phone || h.mobile || '',
        status: h.status || '通常',
        householdType: h.householdType || '正檀家',
        gojuonRow: row,
        isHatsubon,
        hatsubonDharmaNames: hatsubonData?.dharmaNames || [],
        isTanagyo,
        isPaid: h.status === '領収済',
        isUnknown: h.status === '住所不明' || h.householdType === '住所不明',
        tobaApplied: tobaInfo.isApplied,
        tamegakiList: tobaInfo.tamegakiList,
      };
    });
  }, [households, hatsubonHouseholdMap, selectedTobaSlot, toba1Name, toba2Name, toba3Name, effectiveFeeSlots, templeInfo]);

  // Filtered items
  const filteredItems = useMemo(() => {
    let list: ReceptionHouseholdItem[] = [];

    if (targetFilter === 'filtered' && filteredHouseholds) {
      const filteredIdSet = new Set(filteredHouseholds.map((h) => h.id));
      list = allItems.filter((item) => filteredIdSet.has(item.householdId));
    } else if (targetFilter === 'selectedOnly' && selectedHouseholdIds.length > 0) {
      const selectedSet = new Set(selectedHouseholdIds);
      list = allItems.filter((item) => selectedSet.has(item.householdId));
    } else if (targetFilter === 'hatsubonOnly') {
      list = allItems.filter((item) => item.isHatsubon);
    } else if (targetFilter === 'tanagyoOnly') {
      list = allItems.filter((item) => item.isTanagyo);
    } else {
      list = [...allItems];
    }

    // District filter
    if (districtFilter !== 'ALL') {
      list = list.filter((item) => item.district === districtFilter);
    }

    // Search filter
    if (searchTerm.trim() !== '') {
      const query = searchTerm.trim().toLowerCase();
      list = list.filter((item) => {
        return (
          item.sponsorName.toLowerCase().includes(query) ||
          item.furigana.toLowerCase().includes(query) ||
          item.householdHead.toLowerCase().includes(query) ||
          item.address.toLowerCase().includes(query) ||
          item.district.toLowerCase().includes(query) ||
          item.tamegakiList.some((t) => t.toLowerCase().includes(query)) ||
          item.hatsubonDharmaNames.some((d) => d.toLowerCase().includes(query))
        );
      });
    }

    // Sort alphabetically by furigana / sponsorName
    list.sort((a, b) => {
      const ka = a.furigana || a.sponsorName;
      const kb = b.furigana || b.sponsorName;
      return ka.localeCompare(kb, 'ja');
    });

    return list;
  }, [allItems, targetFilter, filteredHouseholds, selectedHouseholdIds, districtFilter, searchTerm]);

  // Group by Gojuon Row ('あ行', 'か行', 'さ行'...)
  const itemsByRow = useMemo(() => {
    const map = new Map<string, ReceptionHouseholdItem[]>();
    GOJUON_ROWS.forEach((row) => map.set(row, []));

    filteredItems.forEach((item) => {
      const row = item.gojuonRow;
      const existing = map.get(row) || [];
      existing.push(item);
      map.set(row, existing);
    });

    return map;
  }, [filteredItems]);

  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  const modalContent = (
    <div className="reception-modal-portal fixed inset-0 z-50 bg-[#1A1A1A]/85 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 md:p-6 overflow-y-auto font-sans print:p-0 print:static print:bg-transparent print:overflow-visible">
      {/* Print-specific CSS */}
      <style>{`
        @media print {
          @page {
            size: A4 ${printOrientation};
            margin: 8mm 8mm 8mm 8mm;
          }
          html, body {
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            background-color: #ffffff !important;
            color: #000000 !important;
            overflow: visible !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          #root, header, nav, main {
            display: none !important;
          }
          .reception-modal-portal {
            position: static !important;
            display: block !important;
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: visible !important;
            background: transparent !important;
            box-shadow: none !important;
          }
          .reception-print-container {
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            box-sizing: border-box !important;
            overflow: visible !important;
          }
          .reception-row-group {
            page-break-inside: auto !important;
            break-inside: auto !important;
            margin-bottom: 10px !important;
          }
          .reception-row-header {
            page-break-after: avoid !important;
            break-after: avoid !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          .reception-patron-item {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          .reception-print-table {
            width: 100% !important;
            max-width: 100% !important;
            table-layout: fixed !important;
            border-collapse: collapse !important;
          }
          .reception-print-table thead {
            display: table-header-group !important;
          }
          .reception-print-table tr {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          .reception-print-table th,
          .reception-print-table td {
            word-break: break-word !important;
            overflow-wrap: break-word !important;
            box-sizing: border-box !important;
          }
        }
      `}</style>

      <div className="bg-white border border-[#D1CEC7] shadow-2xl w-full max-w-6xl flex flex-col max-h-[95vh] overflow-hidden print:max-h-none print:shadow-none print:border-none print:w-full print:m-0 print:overflow-visible reception-print-container">
        {/* Top Navigation Bar - Screen only */}
        <div className="bg-[#1A1A1A] px-4 sm:px-6 py-3.5 border-b border-[#D4AF37] flex flex-wrap items-center justify-between gap-3 text-[#F9F7F2] shrink-0 print:hidden">
          <div className="flex items-center space-x-3">
            <ClipboardCheck className="w-5 h-5 text-[#D4AF37]" />
            <div>
              <h2 className="text-base sm:text-lg font-serif font-bold tracking-wider text-white">
                檀家受付票 印刷プレビュー
              </h2>
              <div className="text-xs text-[#D4AF37] font-serif flex items-center space-x-2">
                <span>{templeName}</span>
                <span>•</span>
                <span>五十音行別（あ・か・さ・た・な…）受付帳票</span>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2 sm:space-x-3">
            {/* View Mode Toggle */}
            <div className="inline-flex rounded-none border border-[#444444] bg-[#222222] p-0.5">
              <button
                type="button"
                onClick={() => setViewMode('twocolumn')}
                className={`flex items-center space-x-1.5 px-3 py-1.5 text-xs font-bold font-serif transition-colors ${
                  viewMode === 'twocolumn'
                    ? 'bg-[#D4AF37] text-[#1A1A1A]'
                    : 'text-[#AAAAAA] hover:text-white'
                }`}
                title="2段組リスト（五十音行別・手書き受付用）"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>2段組リスト</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`flex items-center space-x-1.5 px-3 py-1.5 text-xs font-bold font-serif transition-colors ${
                  viewMode === 'table'
                    ? 'bg-[#D4AF37] text-[#1A1A1A]'
                    : 'text-[#AAAAAA] hover:text-white'
                }`}
                title="詳細一覧表（全項目テーブル）"
              >
                <Table className="w-3.5 h-3.5" />
                <span>詳細一覧表</span>
              </button>
            </div>

            <button
              type="button"
              onClick={handlePrint}
              className="px-4 py-2 bg-[#D4AF37] hover:bg-[#c29f2f] text-[#1A1A1A] text-xs font-bold font-serif flex items-center space-x-1.5 shadow transition-colors cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>印刷する</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-stone-400 hover:text-white hover:bg-stone-800 rounded transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Toolbar & Filter Bar - Screen only */}
        <div className="bg-[#FAF9F5] border-b border-[#D1CEC7] px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs shrink-0 print:hidden">
          <div className="flex flex-wrap items-center gap-3">
            {/* Target Filter */}
            <div className="flex items-center space-x-1.5">
              <span className="text-[#666666] font-bold">対象:</span>
              <select
                value={targetFilter}
                onChange={(e) => setTargetFilter(e.target.value as any)}
                className="bg-white border border-[#CCCCCC] px-2.5 py-1 text-xs text-[#1A1A1A] font-bold focus:outline-none"
              >
                {filteredHouseholds && (
                  <option value="filtered">抽出中の檀家のみ ({filteredHouseholds.length}件)</option>
                )}
                <option value="all">全檀家 ({households.length}件)</option>
                <option value="hatsubonOnly">新盆世帯のみ ({hatsubonHouseholdMap.size}件)</option>
                <option value="tanagyoOnly">棚経世帯のみ</option>
                {selectedHouseholdIds.length > 0 && (
                  <option value="selectedOnly">選択中のみ ({selectedHouseholdIds.length}件)</option>
                )}
              </select>
            </div>

            {/* District Filter */}
            <div className="flex items-center space-x-1.5">
              <span className="text-[#666666] font-bold">地区:</span>
              <select
                value={districtFilter}
                onChange={(e) => setDistrictFilter(e.target.value)}
                className="bg-white border border-[#CCCCCC] px-2.5 py-1 text-xs text-[#1A1A1A] font-bold focus:outline-none"
              >
                <option value="ALL">すべての地区</option>
                {districts.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>

            {/* Search Input */}
            <div className="relative min-w-[150px] flex-1 max-w-xs">
              <Search className="w-4 h-4 absolute left-2.5 top-2 text-[#888888]" />
              <input
                type="text"
                placeholder="氏名・ふりがな・為書き検索..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-3 py-1 bg-white border border-[#CCCCCC] text-xs text-[#1A1A1A] focus:outline-none focus:border-[#1A1A1A]"
              />
            </div>

            {/* Toba Slot Selection */}
            <div className="flex items-center space-x-1.5 bg-amber-50/80 px-2 py-1 border border-amber-300">
              <span className="text-amber-950 font-bold">塔婆選択:</span>
              <select
                value={selectedTobaSlot}
                onChange={(e) => {
                  const val = e.target.value as any;
                  setSelectedTobaSlot(val);
                  if (val === 'slot1') setCol1Label(toba1Name || '塔婆１');
                  else if (val === 'slot2') setCol1Label(toba2Name || '塔婆２');
                  else if (val === 'slot3') setCol1Label(toba3Name || '塔婆３');
                  else if (val === 'all') setCol1Label('塔婆');
                  else if (val === 'none') setCol1Label('塔婆');
                }}
                className="bg-white border border-amber-400 px-2 py-0.5 text-xs text-amber-950 font-bold focus:outline-none cursor-pointer"
              >
                <option value="slot1">塔婆１: {toba1Name}</option>
                <option value="slot2">塔婆２: {toba2Name}</option>
                <option value="slot3">塔婆３: {toba3Name}</option>
                <option value="all">全塔婆（塔婆１〜３）</option>
                <option value="none">塔婆なし（手書き空欄のみ）</option>
              </select>
            </div>

            {/* Tamegaki Toggle */}
            <div className="flex items-center space-x-1.5 bg-white px-2 py-1 border border-[#CCCCCC]">
              <span className="text-[#666666] font-bold">為書き:</span>
              <select
                value={showTamegaki ? 'show' : 'hide'}
                onChange={(e) => setShowTamegaki(e.target.value === 'show')}
                className="bg-white border border-stone-300 px-2 py-0.5 text-xs text-stone-800 font-semibold focus:outline-none cursor-pointer"
              >
                <option value="show">表示する</option>
                <option value="hide">非表示（手書き空欄）</option>
              </select>
            </div>

            {/* Print Orientation Selector */}
            <div className="flex items-center space-x-1 border-l border-[#D1CEC7] pl-3">
              <span className="text-[#666666] font-bold">印刷向き:</span>
              <div className="inline-flex rounded-none border border-[#CCCCCC] bg-white p-0.5">
                <button
                  type="button"
                  onClick={() => setPrintOrientation('portrait')}
                  className={`px-2 py-0.5 text-[11px] font-bold transition-colors ${
                    printOrientation === 'portrait'
                      ? 'bg-[#1A1A1A] text-[#D4AF37]'
                      : 'text-[#666666] hover:text-[#1A1A1A]'
                  }`}
                  title="A4 縦向き印刷"
                >
                  A4 縦
                </button>
                <button
                  type="button"
                  onClick={() => setPrintOrientation('landscape')}
                  className={`px-2 py-0.5 text-[11px] font-bold transition-colors ${
                    printOrientation === 'landscape'
                      ? 'bg-[#1A1A1A] text-[#D4AF37]'
                      : 'text-[#666666] hover:text-[#1A1A1A]'
                  }`}
                  title="A4 横向き印刷"
                >
                  A4 横
                </button>
              </div>
            </div>

            {/* Badges Toggles */}
            <div className="flex items-center space-x-2.5 border-l border-[#D1CEC7] pl-3">
              <label className="flex items-center space-x-1 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showHatsubonBadge}
                  onChange={(e) => setShowHatsubonBadge(e.target.checked)}
                  className="w-3.5 h-3.5 accent-red-700"
                />
                <span className="font-bold text-red-700">新盆マーク</span>
              </label>
              <label className="flex items-center space-x-1 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showTanagyoBadge}
                  onChange={(e) => setShowTanagyoBadge(e.target.checked)}
                  className="w-3.5 h-3.5 accent-blue-700"
                />
                <span className="font-bold text-blue-700">棚経マーク</span>
              </label>
            </div>

            {/* Furigana & Underline */}
            {viewMode === 'twocolumn' && (
              <div className="flex items-center space-x-3 text-xs text-[#444444] border-l border-[#D1CEC7] pl-3">
                <label className="flex items-center space-x-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showFuriganaRuby}
                    onChange={(e) => setShowFuriganaRuby(e.target.checked)}
                    className="w-3.5 h-3.5 accent-[#1A1A1A]"
                  />
                  <span>振仮名</span>
                </label>
                <label className="flex items-center space-x-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showUnderline}
                    onChange={(e) => setShowUnderline(e.target.checked)}
                    className="w-3.5 h-3.5 accent-[#1A1A1A]"
                  />
                  <span>記入線</span>
                </label>
              </div>
            )}

            {/* Column labels with assignment presets & common amount */}
            <div className="flex flex-wrap items-center gap-2 border-l border-[#D1CEC7] pl-3">
              {/* 欄1 */}
              <div className="flex items-center space-x-1 bg-white px-1.5 py-0.5 border border-[#CCCCCC]">
                <span className="text-[#666666] font-bold text-[11px]">欄1:</span>
                <input
                  type="text"
                  value={col1Label}
                  onChange={(e) => setCol1Label(e.target.value)}
                  placeholder="項目名"
                  className="bg-[#FAF9F5] border border-[#D1CEC7] px-1 py-0.5 text-xs text-[#1A1A1A] font-bold w-16 focus:outline-none focus:border-[#1A1A1A]"
                  title="自由入力または右の集金項目から割当"
                />
                <select
                  value={columnPresets.some((p) => p.value === col1Label) ? col1Label : ''}
                  onChange={(e) => {
                    if (e.target.value) setCol1Label(e.target.value);
                  }}
                  className="bg-stone-50 border border-stone-200 text-[10px] text-stone-700 py-0.5 px-0.5 focus:outline-none cursor-pointer"
                  title="集金項目を割当"
                >
                  <option value="">割当...</option>
                  {columnPresets.map((opt, idx) => (
                    <option key={`c1-${idx}-${opt.value}`} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={col1Amount}
                  onChange={(e) => setCol1Amount(e.target.value)}
                  placeholder="共通金額"
                  className="bg-[#FAF9F5] border border-[#D1CEC7] px-1 py-0.5 text-[11px] text-[#1A1A1A] font-mono w-14 focus:outline-none focus:border-[#1A1A1A]"
                  title="共通金額（例: 3000。個別金額未指定時に全檀家の記入線上に印字）"
                />
              </div>

              {/* 欄2 */}
              <div className="flex items-center space-x-1 bg-white px-1.5 py-0.5 border border-[#CCCCCC]">
                <span className="text-[#666666] font-bold text-[11px]">欄2:</span>
                <input
                  type="text"
                  value={col2Label}
                  onChange={(e) => setCol2Label(e.target.value)}
                  placeholder="項目名"
                  className="bg-[#FAF9F5] border border-[#D1CEC7] px-1 py-0.5 text-xs text-[#1A1A1A] font-bold w-16 focus:outline-none focus:border-[#1A1A1A]"
                  title="自由入力または右の集金項目から割当"
                />
                <select
                  value={columnPresets.some((p) => p.value === col2Label) ? col2Label : ''}
                  onChange={(e) => {
                    if (e.target.value) setCol2Label(e.target.value);
                  }}
                  className="bg-stone-50 border border-stone-200 text-[10px] text-stone-700 py-0.5 px-0.5 focus:outline-none cursor-pointer"
                  title="集金項目を割当"
                >
                  <option value="">割当...</option>
                  {columnPresets.map((opt, idx) => (
                    <option key={`c2-${idx}-${opt.value}`} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={col2Amount}
                  onChange={(e) => setCol2Amount(e.target.value)}
                  placeholder="共通金額"
                  className="bg-[#FAF9F5] border border-[#D1CEC7] px-1 py-0.5 text-[11px] text-[#1A1A1A] font-mono w-14 focus:outline-none focus:border-[#1A1A1A]"
                  title="共通金額（例: 3000。個別金額未指定時に全檀家の記入線上に印字）"
                />
              </div>

              {/* 欄3 */}
              <div className="flex items-center space-x-1 bg-white px-1.5 py-0.5 border border-[#CCCCCC]">
                <span className="text-[#666666] font-bold text-[11px]">欄3:</span>
                <input
                  type="text"
                  value={col3Label}
                  onChange={(e) => setCol3Label(e.target.value)}
                  placeholder="項目名"
                  className="bg-[#FAF9F5] border border-[#D1CEC7] px-1 py-0.5 text-xs text-[#1A1A1A] font-bold w-16 focus:outline-none focus:border-[#1A1A1A]"
                  title="自由入力または右の集金項目から割当"
                />
                <select
                  value={columnPresets.some((p) => p.value === col3Label) ? col3Label : ''}
                  onChange={(e) => {
                    if (e.target.value) setCol3Label(e.target.value);
                  }}
                  className="bg-stone-50 border border-stone-200 text-[10px] text-stone-700 py-0.5 px-0.5 focus:outline-none cursor-pointer"
                  title="集金項目を割当"
                >
                  <option value="">割当...</option>
                  {columnPresets.map((opt, idx) => (
                    <option key={`c3-${idx}-${opt.value}`} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={col3Amount}
                  onChange={(e) => setCol3Amount(e.target.value)}
                  placeholder="共通金額"
                  className="bg-[#FAF9F5] border border-[#D1CEC7] px-1 py-0.5 text-[11px] text-[#1A1A1A] font-mono w-14 focus:outline-none focus:border-[#1A1A1A]"
                  title="共通金額（例: 3000。個別金額未指定時に全檀家の記入線上に印字）"
                />
              </div>
            </div>

            {/* Hatsubon Year Input */}
            <div className="flex items-center space-x-1 border-l border-[#D1CEC7] pl-3">
              <span className="text-[#666666] font-bold">新盆年:</span>
              <input
                type="number"
                value={hatsubonYear}
                onChange={(e) => setHatsubonYear(Number(e.target.value))}
                className="bg-white border border-[#CCCCCC] px-1.5 py-0.5 text-xs text-[#1A1A1A] w-16 font-mono focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Title Editing Toolbar (Screen only banner) */}
        <div className="bg-amber-50/70 border-b border-amber-200 px-4 sm:px-6 py-2 flex flex-wrap items-center justify-between gap-2 text-xs print:hidden">
          <div className="flex items-center space-x-2 flex-1 min-w-[280px]">
            <Edit3 className="w-3.5 h-3.5 text-amber-800 shrink-0" />
            <span className="font-bold text-amber-950 shrink-0">題名編集:</span>
            <input
              type="text"
              value={customTitle}
              onChange={(e) => setCustomTitle(e.target.value)}
              placeholder="受付表の題名を入力（例：令和8年 施餓鬼会 檀家受付票）"
              className="flex-1 px-2.5 py-1 bg-white border border-amber-300 text-xs font-serif font-bold text-[#1A1A1A] focus:outline-none focus:border-[#1A1A1A]"
            />
          </div>
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={() => setCustomTitle(defaultTitle)}
              className="px-2 py-0.5 text-[11px] text-amber-900 hover:text-black hover:underline cursor-pointer"
            >
              既定の題名に戻す
            </button>
          </div>
        </div>

        {/* Printable & Scrollable Content Area */}
        <div className="p-4 sm:p-6 md:p-8 overflow-y-auto flex-1 bg-white print:p-0 print:overflow-visible print:m-0" id="reception-sheet-print-area">
          {/* Printable Header */}
          <div className="mb-3 pb-2 border-b-2 border-[#1A1A1A] flex items-end justify-between reception-row-header">
            <div>
              <div className="text-[11px] print:text-[10px] text-[#666666] font-serif mb-0.5 tracking-wider">
                {templeName} 施餓鬼会・盂蘭盆会 受付帳票
              </div>
              <h1 className="text-xl sm:text-2xl print:text-xl font-bold font-serif text-[#1A1A1A] tracking-wider leading-tight">
                {customTitle || defaultTitle}
              </h1>
              <p className="text-[11px] print:text-[9.5px] text-[#666666] font-serif mt-0.5">
                {customSubtitle}
              </p>
            </div>
            <div className="text-right text-xs print:text-[10px] text-[#444444] font-serif space-y-0.5">
              <div>出力日: {new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
              <div>対象檀家総数: <strong className="font-mono text-sm print:text-xs text-[#1A1A1A]">{filteredItems.length}</strong> 軒</div>
              {districtFilter !== 'ALL' && <div className="text-amber-900 font-bold">地区指定: {districtFilter}</div>}
            </div>
          </div>

          {filteredItems.length === 0 ? (
            <div className="p-12 text-center text-[#888888] font-serif border border-dashed border-[#D1CEC7]">
              該当する檀家データがありません。絞り込み条件をご確認ください。
            </div>
          ) : viewMode === 'twocolumn' ? (
            /* 2-Column List View (2段組・各カラム上部に欄1・欄2・受付見出し・中央揃え下寄り記入線) */
            <div className="space-y-4 print:space-y-3">
              {GOJUON_ROWS.map((row) => {
                const rowItems = itemsByRow.get(row) || [];
                if (rowItems.length === 0) return null;

                return (
                  <div key={row} className="reception-row-group">
                    {/* Row Section Header with Row Badge */}
                    <div className="flex items-center justify-between border-b-2 border-[#1A1A1A] pb-1 mb-1.5 reception-row-header">
                      <div className="flex items-center space-x-2">
                        <span className="font-serif font-bold text-xs sm:text-sm print:text-xs bg-[#1A1A1A] text-[#D4AF37] print:bg-black print:text-white px-2 py-0.5 tracking-wider inline-block">
                          {row}
                        </span>
                        <span className="text-xs print:text-[10px] text-[#666666] font-serif">
                          （{rowItems.length}軒）
                        </span>
                      </div>
                    </div>

                    {/* Column Headers for BOTH Column 1 (Left) and Column 2 (Right) */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 pb-1 mb-1 border-b border-[#D1CEC7] print:grid-cols-2 print:gap-x-4 print:pb-0.5 print:mb-0.5 reception-row-header">
                      {/* Left Column Header */}
                      <div className="flex items-center justify-between text-[11px] print:text-[9.5px] font-bold text-[#666666] font-serif pr-1">
                        <span>施主氏名 / 為書き</span>
                        <div className="flex items-center space-x-2.5 print:space-x-2 text-right">
                          <span className="w-12 print:w-11 text-center truncate">{col1Label}</span>
                          <span className="w-12 print:w-11 text-center truncate">{col2Label}</span>
                          <span className="w-12 print:w-11 text-center truncate">{col3Label}</span>
                          <span className="w-5 print:w-5 text-center">受付</span>
                        </div>
                      </div>

                      {/* Right Column Header (Hidden on small screens, visible on md and print) */}
                      <div className="hidden md:flex print:flex items-center justify-between text-[11px] print:text-[9.5px] font-bold text-[#666666] font-serif pr-1">
                        <span>施主氏名 / 為書き</span>
                        <div className="flex items-center space-x-2.5 print:space-x-2 text-right">
                          <span className="w-12 print:w-11 text-center truncate">{col1Label}</span>
                          <span className="w-12 print:w-11 text-center truncate">{col2Label}</span>
                          <span className="w-12 print:w-11 text-center truncate">{col3Label}</span>
                          <span className="w-5 print:w-5 text-center">受付</span>
                        </div>
                      </div>
                    </div>

                    {/* 2-Column Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 print:grid-cols-2 print:gap-x-4 print:gap-y-1.5">
                      {rowItems.map((item) => (
                        <div
                          key={item.key}
                          className="reception-patron-item flex items-end justify-between border-b border-dashed border-[#B0AAA0] pb-1.5 pt-0.5 hover:bg-[#FAF9F5] print:hover:bg-transparent transition-colors break-inside-avoid min-w-0"
                        >
                          {/* Left: Name with Left-Aligned Furigana, Badges & Tamegaki */}
                          <div className="flex items-baseline flex-wrap gap-x-1.5 gap-y-0.5 pr-1 flex-1 min-w-0 overflow-hidden">
                            {/* Name + Furigana Left Aligned (前揃え) */}
                            <div className="inline-flex flex-col items-start leading-tight shrink-0">
                              {showFuriganaRuby && item.furigana ? (
                                <span className="text-[9px] print:text-[8px] text-[#666666] font-sans font-normal leading-none mb-0.5 select-none text-left tracking-normal">
                                  {item.furigana}
                                </span>
                              ) : null}
                              <div className="flex items-baseline space-x-0.5">
                                <span className="font-serif font-bold text-sm sm:text-[14px] print:text-[12.5px] text-[#1A1A1A] tracking-wide">
                                  {item.sponsorName}
                                </span>
                                <span className="text-xs print:text-[10px] text-[#444444] font-serif">様</span>
                              </div>
                            </div>

                            {/* Household head notation when different */}
                            {!item.isFamilyHead && item.householdHead && (
                              <span className="text-[10px] print:text-[8.5px] text-[#777777] font-sans whitespace-nowrap">
                                （世帯主: {item.householdHead} 方）
                              </span>
                            )}

                            {/* Hatsubon Badge */}
                            {showHatsubonBadge && item.isHatsubon && (
                              <span className="inline-block text-[9px] print:text-[8px] font-bold text-red-600 border border-red-600 px-1 py-0 leading-tight rounded-[1px] tracking-tighter font-sans shrink-0">
                                新盆
                              </span>
                            )}

                            {/* Tanagyo Badge */}
                            {showTanagyoBadge && item.isTanagyo && (
                              <span className="inline-block text-[9px] print:text-[8px] font-bold text-blue-700 border border-blue-700 px-1 py-0 leading-tight rounded-[1px] tracking-tighter font-sans shrink-0">
                                棚経
                              </span>
                            )}

                            {/* 為書き (Tamegaki) */}
                            {showTamegaki && item.tamegakiList.length > 0 ? (
                              <span className="font-serif font-bold text-[11px] print:text-[9.5px] text-amber-950 print:text-black bg-amber-50 print:bg-transparent border border-amber-300 print:border-black/40 px-1 py-0.2 print:px-1 print:py-0 whitespace-nowrap shadow-2xs">
                                為 {item.tamegakiList.join(' / ')}
                              </span>
                            ) : null}

                            {/* Toba Applied Badge when no Tamegaki */}
                            {selectedTobaSlot !== 'none' && item.tobaApplied && (!showTamegaki || item.tamegakiList.length === 0) && (
                              <span className="text-[9px] print:text-[8px] font-bold text-amber-900 bg-amber-50 border border-amber-300 px-1 py-0 leading-tight rounded-[1px] shrink-0 font-sans">
                                申込済
                              </span>
                            )}

                            {/* Status Tag: 領収済 or 住所不明 */}
                            {item.isPaid && (
                              <span className="text-[9px] print:text-[8px] font-bold text-red-600 font-sans shrink-0">
                                領収済
                              </span>
                            )}
                            {item.isUnknown && (
                              <span className="text-[9px] print:text-[8px] font-bold text-red-700 font-sans shrink-0">
                                住所不明
                              </span>
                            )}
                          </div>

                          {/* Right: Columns aligned under the headers, with individual fee amount printed above the underline */}
                          {(() => {
                            const f1Display = getColFeeDisplay(item.household, col1Label, col1Amount);
                            const f2Display = getColFeeDisplay(item.household, col2Label, col2Amount);
                            const f3Display = getColFeeDisplay(item.household, col3Label, col3Amount);

                            return (
                              <div className="flex items-end space-x-2.5 print:space-x-2 shrink-0 select-none pl-1 pb-0.5">
                                {/* Column 1 Slot */}
                                <div className="w-12 print:w-11 flex flex-col items-center justify-end min-h-[20px]">
                                  {f1Display ? (
                                    <span className="text-[10px] print:text-[8.5px] font-mono font-bold text-stone-900 leading-none mb-0.5 truncate max-w-full text-center">
                                      {f1Display}
                                    </span>
                                  ) : (
                                    <span className="h-[10px] block"></span>
                                  )}
                                  {showUnderline ? (
                                    <span className="w-11 print:w-10 block border-b border-[#888888]"></span>
                                  ) : null}
                                </div>

                                {/* Column 2 Slot */}
                                <div className="w-12 print:w-11 flex flex-col items-center justify-end min-h-[20px]">
                                  {f2Display ? (
                                    <span className="text-[10px] print:text-[8.5px] font-mono font-bold text-stone-900 leading-none mb-0.5 truncate max-w-full text-center">
                                      {f2Display}
                                    </span>
                                  ) : (
                                    <span className="h-[10px] block"></span>
                                  )}
                                  {showUnderline ? (
                                    <span className="w-11 print:w-10 block border-b border-[#888888]"></span>
                                  ) : null}
                                </div>

                                {/* Column 3 Slot */}
                                <div className="w-12 print:w-11 flex flex-col items-center justify-end min-h-[20px]">
                                  {f3Display ? (
                                    <span className="text-[10px] print:text-[8.5px] font-mono font-bold text-stone-900 leading-none mb-0.5 truncate max-w-full text-center">
                                      {f3Display}
                                    </span>
                                  ) : (
                                    <span className="h-[10px] block"></span>
                                  )}
                                  {showUnderline ? (
                                    <span className="w-11 print:w-10 block border-b border-[#888888]"></span>
                                  ) : null}
                                </div>

                                {/* Check-in box Slot */}
                                <div className="w-5 print:w-5 flex items-center justify-center">
                                  <div
                                    className="w-3.5 h-3.5 border border-[#888888] text-[8px] text-[#999999] flex items-center justify-center font-serif mb-0.5"
                                    title="受付済チェック"
                                  >
                                    □
                                  </div>
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* Table View (詳細一覧表: 施主氏名・続柄・地区・為書き・新盆棚経・記入欄) */
            <div className="border border-[#D1CEC7] overflow-hidden">
              <table className="reception-print-table w-full text-left border-collapse text-xs table-fixed">
                <thead>
                  <tr className="bg-[#F9F7F2] border-b border-[#D1CEC7] text-[#1A1A1A] font-serif">
                    <th className="p-2 print:py-1 print:px-1 border-r border-[#D1CEC7] text-center w-[4%] font-bold print:text-[10px]">No</th>
                    <th className="p-2 print:py-1 print:px-1.5 border-r border-[#D1CEC7] font-bold w-[17%] print:text-[10px]">施主氏名</th>
                    <th className="p-2 print:py-1 print:px-1.5 border-r border-[#D1CEC7] text-center w-[11%] font-bold print:text-[10px]">地区 / 世帯</th>
                    <th className="p-2 print:py-1 print:px-1.5 border-r border-[#D1CEC7] font-bold w-[18%] print:text-[10px]">為書き</th>
                    <th className="p-2 print:py-1 print:px-1.5 border-r border-[#D1CEC7] text-center w-[10%] font-bold print:text-[10px]">新盆 / 棚経</th>
                    <th className="p-2 print:py-1 print:px-1.5 border-r border-[#D1CEC7] text-center w-[12%] font-bold print:text-[10px] truncate">{col1Label}</th>
                    <th className="p-2 print:py-1 print:px-1.5 border-r border-[#D1CEC7] text-center w-[12%] font-bold print:text-[10px] truncate">{col2Label}</th>
                    <th className="p-2 print:py-1 print:px-1.5 border-r border-[#D1CEC7] text-center w-[12%] font-bold print:text-[10px] truncate">{col3Label}</th>
                    <th className="p-2 print:py-1 print:px-1 border-[#D1CEC7] text-center w-[4%] font-bold print:text-[10px]">受付</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EBE7DF]">
                  {filteredItems.map((item, idx) => {
                    const f1Display = getColFeeDisplay(item.household, col1Label, col1Amount);
                    const f2Display = getColFeeDisplay(item.household, col2Label, col2Amount);
                    const f3Display = getColFeeDisplay(item.household, col3Label, col3Amount);

                    return (
                      <tr key={item.key} className="hover:bg-[#FAF9F5] print:hover:bg-transparent transition-colors">
                        {/* No */}
                        <td className="p-2 print:py-1 print:px-1 border-r border-[#EBE7DF] text-center font-mono text-[#666666] print:text-[9.5px]">
                          {idx + 1}
                        </td>

                        {/* 施主氏名 */}
                        <td className="p-2 print:py-1 print:px-1.5 border-r border-[#EBE7DF] break-words">
                          {item.furigana && (
                            <div className="text-[9px] print:text-[8px] text-[#777777] font-sans leading-tight">
                              {item.furigana}
                            </div>
                          )}
                          <div className="font-bold text-[#1A1A1A] font-serif text-xs print:text-[11px] leading-tight">
                            {item.sponsorName} <span className="text-[10px] print:text-[9px] font-normal text-[#555555]">様</span>
                          </div>
                        </td>

                        {/* 地区 / 世帯 */}
                        <td className="p-2 print:py-1 print:px-1.5 border-r border-[#EBE7DF] text-center break-words">
                          <div className="text-xs print:text-[9.5px] leading-tight font-serif">
                            <span className="font-bold text-[#2D2D2D]">{item.district}</span>
                            {!item.isFamilyHead && item.householdHead && (
                              <div className="text-[9px] print:text-[8px] text-[#777777]">({item.householdHead} 方)</div>
                            )}
                          </div>
                        </td>

                        {/* 為書き */}
                        <td className="p-2 print:py-1 print:px-1.5 border-r border-[#EBE7DF] font-serif text-xs print:text-[10px] break-words">
                          {showTamegaki && item.tamegakiList.length > 0 ? (
                            <span className="font-bold text-amber-950 print:text-black bg-amber-50 print:bg-transparent px-1 py-0.5 print:p-0 border border-amber-200 print:border-none inline-block">
                              為 {item.tamegakiList.join(' / ')}
                            </span>
                          ) : selectedTobaSlot !== 'none' && item.tobaApplied ? (
                            <span className="text-amber-800 text-[10px]">申込有</span>
                          ) : (
                            <span className="text-[#AAAAAA] text-[10px]">ー</span>
                          )}
                        </td>

                        {/* 新盆 / 棚経 */}
                        <td className="p-2 print:py-1 print:px-1.5 border-r border-[#EBE7DF] text-center break-words">
                          <div className="flex items-center justify-center gap-1 flex-wrap">
                            {showHatsubonBadge && item.isHatsubon && (
                              <span className="bg-red-700 text-white print:bg-black print:text-white px-1 py-0.2 text-[9px] print:text-[8px] font-bold tracking-wide font-sans">
                                新盆
                              </span>
                            )}
                            {showTanagyoBadge && item.isTanagyo && (
                              <span className="bg-blue-700 text-white print:bg-black print:text-white px-1 py-0.2 text-[9px] print:text-[8px] font-bold tracking-wide font-sans">
                                棚経
                              </span>
                            )}
                            {!item.isHatsubon && !item.isTanagyo && (
                              <span className="text-[#AAAAAA] text-[10px]">ー</span>
                            )}
                          </div>
                        </td>

                        {/* 記入欄1 */}
                        <td className="p-2 print:py-1 print:px-1.5 border-r border-[#EBE7DF] text-center align-bottom">
                          <div className="flex flex-col justify-end items-center min-h-[22px]">
                            {f1Display ? (
                              <span className="text-xs print:text-[9.5px] font-mono font-bold text-stone-900 mb-0.5 leading-tight">
                                {f1Display}
                              </span>
                            ) : (
                              <span className="h-[10px] block"></span>
                            )}
                            {showUnderline ? (
                              <span className="w-14 block border-b border-[#888888]"></span>
                            ) : null}
                          </div>
                        </td>

                        {/* 記入欄2 */}
                        <td className="p-2 print:py-1 print:px-1.5 border-r border-[#EBE7DF] text-center align-bottom">
                          <div className="flex flex-col justify-end items-center min-h-[22px]">
                            {f2Display ? (
                              <span className="text-xs print:text-[9.5px] font-mono font-bold text-stone-900 mb-0.5 leading-tight">
                                {f2Display}
                              </span>
                            ) : (
                              <span className="h-[10px] block"></span>
                            )}
                            {showUnderline ? (
                              <span className="w-14 block border-b border-[#888888]"></span>
                            ) : null}
                          </div>
                        </td>

                        {/* 記入欄3 */}
                        <td className="p-2 print:py-1 print:px-1.5 border-r border-[#EBE7DF] text-center align-bottom">
                          <div className="flex flex-col justify-end items-center min-h-[22px]">
                            {f3Display ? (
                              <span className="text-xs print:text-[9.5px] font-mono font-bold text-stone-900 mb-0.5 leading-tight">
                                {f3Display}
                              </span>
                            ) : (
                              <span className="h-[10px] block"></span>
                            )}
                            {showUnderline ? (
                              <span className="w-14 block border-b border-[#888888]"></span>
                            ) : null}
                          </div>
                        </td>

                        {/* 受付チェック */}
                        <td className="p-2 print:py-1 print:px-1 text-center font-serif text-[#999999] text-xs">
                          □
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Print Footer note */}
          <div className="mt-4 pt-1.5 border-t border-[#D1CEC7] flex justify-between items-center text-[9px] text-[#888888] font-serif">
            <div>※本一覧は檀家名簿より五十音行順に自動抽出されたものです。新盆・棚経・塔婆志納等の受付にご利用ください。</div>
            <div>頁印字 / 施餓鬼会・盂蘭盆会 檀家受付票</div>
          </div>
        </div>

        {/* Footer - Screen only */}
        <div className="bg-[#F9F7F2] px-4 sm:px-6 py-3 border-t border-[#D1CEC7] flex flex-wrap items-center justify-between gap-2 text-xs font-sans shrink-0 print:hidden">
          <span className="text-[#666666]">
            ※「印刷する」ボタンを押すと、A4用紙（縦または横）に最適化されて出力されます。
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-[#1A1A1A] hover:bg-[#333333] text-white font-serif font-bold transition-colors cursor-pointer"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};
