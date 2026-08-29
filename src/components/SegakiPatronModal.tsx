import React, { useState, useMemo, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { X, Printer, Search, Download, LayoutGrid, Table, FileText, Info, Layers } from 'lucide-react';
import { Household, PastRecord } from '../types';
import { 
  formatJapaneseEraDate, 
  normalizeDateInput, 
  getJapaneseEra, 
  getHouseholdNiibonAndPastInfo 
} from '../utils/memorialCalculator';
import { 
  getHouseholdTobaApplication, 
  getFamilyMemberTobaApplication, 
  DEFAULT_TOBA_TYPES 
} from '../utils/tobaUtils';

export interface SegakiPatronItem {
  key: string;
  householdId: string;
  householdHead: string;
  personName: string;
  furigana: string;
  relationship: string;
  isFamilyHead: boolean;
  segakiTamegaki?: string;
  tobaType: string;
  postalCode: string;
  address: string;
  phone: string;
  district: string;
  tombNumber: string;
  householdType: string;
  notes: string;
  gojuonRow: string;
  // Past records info
  latestDharmaName?: string;
  latestSecularName?: string;
  latestDeathDate?: string;
  latestAge?: number;
  niibonLabel?: string;
  isNiibon?: boolean;
}

interface SegakiPatronModalProps {
  isOpen: boolean;
  onClose: () => void;
  households: Household[];
  pastRecords?: PastRecord[];
  templeName?: string;
  bonSeason?: '7月盆' | '8月盆';
  tobaTypes?: string[];
  initialTobaType?: string;
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

export const SegakiPatronModal: React.FC<SegakiPatronModalProps> = ({
  isOpen,
  onClose,
  households,
  pastRecords = [],
  templeName = '寺院名',
  bonSeason = '8月盆',
  tobaTypes = DEFAULT_TOBA_TYPES,
  initialTobaType,
}) => {
  const availableTobaTypes = tobaTypes && tobaTypes.length > 0 ? tobaTypes : DEFAULT_TOBA_TYPES;
  const [selectedTobaType, setSelectedTobaType] = useState<string>(initialTobaType || availableTobaTypes[0] || '施餓鬼塔婆');
  const [searchTerm, setSearchTerm] = useState('');
  const [districtFilter, setDistrictFilter] = useState('ALL');
  const [viewMode, setViewMode] = useState<'twocolumn' | 'table'>('twocolumn');
  const [printOrientation, setPrintOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const [showUnderline, setShowUnderline] = useState(true);
  const [showFuriganaRuby, setShowFuriganaRuby] = useState(true);

  // Sync initial toba type if prop changes
  useEffect(() => {
    if (initialTobaType && availableTobaTypes.includes(initialTobaType)) {
      setSelectedTobaType(initialTobaType);
    } else if (!availableTobaTypes.includes(selectedTobaType)) {
      setSelectedTobaType(availableTobaTypes[0] || '施餓鬼塔婆');
    }
  }, [initialTobaType, availableTobaTypes]);

  const currentYear = new Date().getFullYear();
  const currentEra = getJapaneseEra(currentYear);
  const titleWithEra = `${currentEra}${selectedTobaType}施主一覧`;

  // Prevent background scroll and tag body class for print isolation
  useEffect(() => {
    if (isOpen) {
      document.body.classList.add('segaki-modal-open');
    } else {
      document.body.classList.remove('segaki-modal-open');
    }
    return () => {
      document.body.classList.remove('segaki-modal-open');
    };
  }, [isOpen]);

  // Generate merged patrons list from households where selected tobaType is applied
  const allPatrons: SegakiPatronItem[] = useMemo(() => {
    const list: SegakiPatronItem[] = [];
    const now = new Date();

    households.forEach((h) => {
      // 過去帳・年回忌表の新盆・過去帳判定と同一の計算ロジックを使用
      const pastInfo = getHouseholdNiibonAndPastInfo(pastRecords, h.id, bonSeason, now);
      const latest = pastInfo.latestRecord;

      // 1. Check family head / household
      const headApp = getHouseholdTobaApplication(h, selectedTobaType);
      if (headApp.applied) {
        const row = getGojuonRow(h.furigana || h.familyHead);
        list.push({
          key: `toba-head-${selectedTobaType}-${h.id}`,
          householdId: h.id,
          householdHead: h.familyHead,
          personName: h.familyHead,
          furigana: h.furigana || '',
          relationship: '世帯主',
          isFamilyHead: true,
          segakiTamegaki: headApp.tamegaki || '',
          tobaType: selectedTobaType,
          postalCode: h.postalCode || '',
          address: h.address || '',
          phone: h.phone || h.mobile || '',
          district: h.district || '地区未定',
          tombNumber: h.tombNumber || '',
          householdType: h.householdType || '正檀家',
          notes: h.notes || '',
          gojuonRow: row,
          latestDharmaName: latest?.dharmaName || '',
          latestSecularName: latest?.secularName || '',
          latestDeathDate: latest?.deathDate || '',
          latestAge: latest?.ageAtDeath,
          niibonLabel: pastInfo.niibonLabel,
          isNiibon: pastInfo.isNiibon,
        });
      }

      // 2. Check family members (merge with head)
      if (h.familyMembers && h.familyMembers.length > 0) {
        h.familyMembers.forEach((fm, fmIdx) => {
          const fmApp = getFamilyMemberTobaApplication(fm, selectedTobaType);
          if (fmApp.applied) {
            const row = getGojuonRow(fm.furigana || fm.name);
            list.push({
              key: `toba-fm-${selectedTobaType}-${h.id}-${fm.id || fm.name || fmIdx}-${fmIdx}`,
              householdId: h.id,
              householdHead: h.familyHead,
              personName: fm.name,
              furigana: fm.furigana || '',
              relationship: fm.relationship || '家族',
              isFamilyHead: false,
              segakiTamegaki: fmApp.tamegaki || '',
              tobaType: selectedTobaType,
              postalCode: h.postalCode || '',
              address: fm.address && fm.address.trim() !== '' ? fm.address : (h.address || ''),
              phone: fm.phone && fm.phone.trim() !== '' ? fm.phone : (h.phone || h.mobile || ''),
              district: h.district || '地区未定',
              tombNumber: h.tombNumber || '',
              householdType: h.householdType || '正檀家',
              notes: fm.notes || '',
              gojuonRow: row,
              latestDharmaName: latest?.dharmaName || '',
              latestSecularName: latest?.secularName || '',
              latestDeathDate: latest?.deathDate || '',
              latestAge: latest?.ageAtDeath,
              niibonLabel: pastInfo.niibonLabel,
              isNiibon: pastInfo.isNiibon,
            });
          }
        });
      }
    });

    // Sort in Japanese alphabetical order (五十音順)
    return list.sort((a, b) => {
      const kanaA = (a.furigana || a.personName).replace(/[\u30a1-\u30f6]/g, (match) => {
        const chr = match.charCodeAt(0) - 0x60;
        return String.fromCharCode(chr);
      });
      const kanaB = (b.furigana || b.personName).replace(/[\u30a1-\u30f6]/g, (match) => {
        const chr = match.charCodeAt(0) - 0x60;
        return String.fromCharCode(chr);
      });
      return kanaA.localeCompare(kanaB, 'ja');
    });
  }, [households, pastRecords, bonSeason, selectedTobaType]);

  // Unique districts for filter
  const districts = useMemo(() => {
    return Array.from(new Set(allPatrons.map((p) => p.district).filter(Boolean)));
  }, [allPatrons]);

  // Filtered list
  const filteredPatrons = useMemo(() => {
    return allPatrons.filter((p) => {
      const matchesSearch =
        p.personName.includes(searchTerm) ||
        p.furigana.includes(searchTerm) ||
        p.householdHead.includes(searchTerm) ||
        (p.segakiTamegaki && p.segakiTamegaki.includes(searchTerm)) ||
        (p.latestDharmaName && p.latestDharmaName.includes(searchTerm)) ||
        (p.latestSecularName && p.latestSecularName.includes(searchTerm)) ||
        (p.niibonLabel && p.niibonLabel.includes(searchTerm)) ||
        p.address.includes(searchTerm) ||
        p.householdId.includes(searchTerm) ||
        p.district.includes(searchTerm) ||
        p.tombNumber.includes(searchTerm);

      const matchesDistrict = districtFilter === 'ALL' || p.district === districtFilter;

      return matchesSearch && matchesDistrict;
    });
  }, [allPatrons, searchTerm, districtFilter]);

  // Group filtered patrons by Gojuon row for 2-column view
  const patronsByRow = useMemo(() => {
    const map = new Map<string, SegakiPatronItem[]>();
    GOJUON_ROWS.forEach((row) => map.set(row, []));

    filteredPatrons.forEach((p) => {
      const row = p.gojuonRow || 'その他';
      if (!map.has(row)) {
        map.set(row, []);
      }
      map.get(row)!.push(p);
    });

    return map;
  }, [filteredPatrons]);

  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  const handleExportCsv = () => {
    const headers = [
      'No',
      '塔婆申込種類',
      '五十音行',
      '施主氏名',
      'ふりがな',
      '為書き',
      '続柄',
      '世帯主名',
      '檀家ID',
      '新盆区分',
      '最新お戒名',
      '没年月日(命日)',
      '俗名',
    ];
    const rows = filteredPatrons.map((p, idx) => [
      idx + 1,
      `"${p.tobaType}"`,
      `"${p.gojuonRow}"`,
      `"${p.personName}"`,
      `"${p.furigana}"`,
      `"${(p.segakiTamegaki || '').replace(/"/g, '""')}"`,
      `"${p.relationship}"`,
      `"${p.householdHead}"`,
      `"${p.householdId}"`,
      `"${p.niibonLabel || ''}"`,
      `"${(p.latestDharmaName || '').replace(/"/g, '""')}"`,
      `"${p.latestDeathDate ? formatJapaneseEraDate(p.latestDeathDate, false) : ''}"`,
      `"${(p.latestSecularName || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${titleWithEra}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const modalContent = (
    <div className="segaki-modal-portal fixed inset-0 z-50 bg-[#1A1A1A]/85 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 md:p-6 overflow-y-auto font-sans print:p-0 print:static print:bg-transparent print:overflow-visible">
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
          .segaki-modal-portal {
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
          .segaki-print-container {
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            box-sizing: border-box !important;
            overflow: visible !important;
          }
          .segaki-row-group {
            page-break-inside: auto !important;
            break-inside: auto !important;
            margin-bottom: 10px !important;
          }
          .segaki-row-header {
            page-break-after: avoid !important;
            break-after: avoid !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          .segaki-patron-item {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          .segaki-print-table {
            width: 100% !important;
            max-width: 100% !important;
            table-layout: fixed !important;
            border-collapse: collapse !important;
          }
          .segaki-print-table thead {
            display: table-header-group !important;
          }
          .segaki-print-table tr {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          .segaki-print-table th,
          .segaki-print-table td {
            word-break: break-word !important;
            overflow-wrap: break-word !important;
            box-sizing: border-box !important;
          }
        }
      `}</style>

      <div className="bg-white border border-[#D1CEC7] shadow-2xl w-full max-w-6xl flex flex-col max-h-[95vh] overflow-hidden print:max-h-none print:shadow-none print:border-none print:w-full print:m-0 print:overflow-visible segaki-print-container">
        {/* Top Navigation Bar - Screen only */}
        <div className="bg-[#1A1A1A] px-4 sm:px-6 py-3.5 border-b border-[#D4AF37] flex flex-wrap items-center justify-between gap-3 text-[#F9F7F2] shrink-0 print:hidden">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-[#D4AF37] text-[#1A1A1A] flex items-center justify-center font-bold font-sans text-xs shrink-0">
              塔婆
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-[#F9F7F2] tracking-wider font-serif flex items-center space-x-2">
                <span>{titleWithEra}</span>
                <span className="text-xs font-sans text-[#D4AF37] border border-[#D4AF37]/60 px-2 py-0.5 font-normal">
                  {filteredPatrons.length} 名
                </span>
              </h2>
              <p className="text-[11px] text-[#CCCCCC] hidden sm:block">
                世帯主・家族構成マージ五十音順整列（為書き・前揃えふりがな・新盆戒名対応）
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {/* View Mode Toggle */}
            <div className="flex items-center bg-[#2A2A2A] p-0.5 border border-[#444444] rounded-none mr-2">
              <button
                onClick={() => setViewMode('twocolumn')}
                className={`px-2.5 py-1 text-xs font-bold transition-colors flex items-center space-x-1 ${
                  viewMode === 'twocolumn'
                    ? 'bg-[#D4AF37] text-[#1A1A1A]'
                    : 'text-[#CCCCCC] hover:text-white'
                }`}
                title="受付・塔婆書き用 2段組リスト（行別五十音順・前揃えふりがな）"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>2段組リスト</span>
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`px-2.5 py-1 text-xs font-bold transition-colors flex items-center space-x-1 ${
                  viewMode === 'table'
                    ? 'bg-[#D4AF37] text-[#1A1A1A]'
                    : 'text-[#CCCCCC] hover:text-white'
                }`}
                title="詳細一覧表（最新戒名・命日・新盆表示）"
              >
                <Table className="w-3.5 h-3.5" />
                <span>詳細一覧表</span>
              </button>
            </div>

            <button
              onClick={handleExportCsv}
              className="px-3 py-1.5 bg-[#2A2A2A] hover:bg-[#333333] text-[#D4AF37] border border-[#D4AF37]/50 text-xs font-bold transition-colors flex items-center space-x-1.5 cursor-pointer"
              title="CSV形式でダウンロード"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">CSV出力</span>
            </button>

            <button
              onClick={handlePrint}
              className="px-3.5 py-1.5 bg-[#D4AF37] hover:bg-[#c29f2f] text-[#1A1A1A] text-xs font-bold tracking-wider transition-colors flex items-center space-x-1.5 shadow-sm cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>印刷する</span>
            </button>

            <button
              onClick={onClose}
              className="text-[#CCCCCC] hover:text-white p-1.5 transition ml-1 cursor-pointer"
              aria-label="閉じる"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Filter & Options bar - Screen only */}
        <div className="bg-[#F9F7F2] p-3 border-b border-[#D1CEC7] flex flex-wrap items-center justify-between gap-3 text-xs shrink-0 print:hidden">
          <div className="flex flex-wrap items-center gap-3 flex-1">
            {/* Toba Type Selector */}
            <div className="flex items-center space-x-1.5 bg-white border border-[#1A1A1A] px-2 py-1">
              <Layers className="w-3.5 h-3.5 text-[#D4AF37]" />
              <span className="text-[#1A1A1A] font-bold">塔婆種類:</span>
              <select
                value={selectedTobaType}
                onChange={(e) => setSelectedTobaType(e.target.value)}
                className="bg-transparent text-xs font-bold text-[#1A1A1A] focus:outline-none cursor-pointer"
              >
                {availableTobaTypes.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            <div className="relative min-w-[180px] flex-1 max-w-sm">
              <Search className="w-4 h-4 absolute left-2.5 top-2 text-[#888888]" />
              <input
                type="text"
                placeholder="施主名・ふりがな・為書き・戒名等で検索..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-white border border-[#D1CEC7] pl-8 pr-3 py-1.5 text-xs text-[#2D2D2D] focus:border-[#1A1A1A] focus:outline-none"
              />
            </div>

            <div className="flex items-center space-x-1.5">
              <span className="text-[#666666] font-bold">地区:</span>
              <select
                value={districtFilter}
                onChange={(e) => setDistrictFilter(e.target.value)}
                className="bg-white border border-[#D1CEC7] px-2 py-1.5 text-xs text-[#2D2D2D] focus:border-[#1A1A1A] focus:outline-none"
              >
                <option value="ALL">全ての地区</option>
                {districts.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
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
                  <span>記入線 (＿＿)</span>
                </label>
              </div>
            )}
          </div>

          <div className="flex items-center space-x-3 text-xs">
            <div className="flex items-center space-x-1">
              <span className="text-[#666666]">施主総数:</span>
              <strong className="text-[#1A1A1A] font-mono text-sm">{filteredPatrons.length}</strong>
              <span className="text-[#888888]">名</span>
            </div>
          </div>
        </div>

        {/* Printable & Scrollable Content Area */}
        <div className="p-4 sm:p-6 md:p-8 overflow-y-auto flex-1 bg-white print:p-0 print:overflow-visible print:m-0" id="segaki-patron-print-area">
          {/* Printable Header */}
          <div className="mb-3 pb-2 border-b-2 border-[#1A1A1A] flex items-end justify-between segaki-row-header">
            <div>
              <div className="text-[11px] print:text-[10px] text-[#666666] font-serif mb-0.5 tracking-wider">
                {templeName} 施餓鬼会・盂蘭盆会 回向帳票
              </div>
              <h1 className="text-xl sm:text-2xl print:text-xl font-bold font-serif text-[#1A1A1A] tracking-wider leading-tight">
                {titleWithEra}
              </h1>
              <p className="text-[11px] print:text-[9.5px] text-[#666666] font-serif mt-0.5">
                五十音順整列（世帯主・家族構成マージ / 塔婆筆耕・受付確認用）
              </p>
            </div>
            <div className="text-right text-xs print:text-[10px] text-[#444444] font-serif space-y-0.5">
              <div>出力日: {new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
              <div>施主申込総数: <strong className="font-mono text-sm print:text-xs text-[#1A1A1A]">{filteredPatrons.length}</strong> 名</div>
              {districtFilter !== 'ALL' && <div className="text-amber-900 font-bold">地区指定: {districtFilter}</div>}
            </div>
          </div>

          {filteredPatrons.length === 0 ? (
            <div className="text-center py-16 text-[#888888] font-serif border border-dashed border-[#D1CEC7] p-8">
              施餓鬼塔婆にチェックの入っている施主（世帯主・家族）が見つかりませんでした。
              <p className="text-xs mt-1.5 text-[#999999]">
                ※檀家名簿の世帯主または家族構成の「施餓鬼塔婆」にチェックを入れて為書きを設定してください。
              </p>
            </div>
          ) : viewMode === 'twocolumn' ? (
            /* 2-Column List View (2段組・五十音順・前揃え振仮名・為書き対応) */
            <div className="space-y-4 print:space-y-3">
              {GOJUON_ROWS.map((row) => {
                const rowItems = patronsByRow.get(row) || [];
                if (rowItems.length === 0) return null;

                return (
                  <div key={row} className="segaki-row-group">
                    {/* Row Section Header */}
                    <div className="flex items-center space-x-2 border-b-2 border-[#1A1A1A] pb-1 mb-2 segaki-row-header">
                      <span className="font-serif font-bold text-xs sm:text-sm print:text-xs bg-[#1A1A1A] text-[#D4AF37] print:bg-black print:text-white px-2 py-0.5 tracking-wider inline-block">
                        {row}
                      </span>
                      <span className="text-xs print:text-[10px] text-[#666666] font-serif">
                        （{rowItems.length}名）
                      </span>
                    </div>

                    {/* 2-Column Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 print:grid-cols-2 print:gap-x-4 print:gap-y-1.5">
                      {rowItems.map((patron) => (
                        <div
                          key={patron.key}
                          className="segaki-patron-item flex items-center justify-between border-b border-dashed border-[#B0AAA0] pb-1 pt-0.5 hover:bg-[#FAF9F5] print:hover:bg-transparent transition-colors break-inside-avoid min-w-0"
                        >
                          {/* Left: Name with Left-Aligned Furigana & Tamegaki */}
                          <div className="flex items-baseline flex-wrap gap-x-1.5 gap-y-0.5 pr-1 flex-1 min-w-0 overflow-hidden">
                            {/* Name + Furigana Left Aligned (前揃え) */}
                            <div className="inline-flex flex-col items-start leading-tight shrink-0">
                              {showFuriganaRuby && patron.furigana ? (
                                <span className="text-[9px] print:text-[8px] text-[#666666] font-sans font-normal leading-none mb-0.5 select-none text-left tracking-normal">
                                  {patron.furigana}
                                </span>
                              ) : null}
                              <div className="flex items-baseline space-x-0.5">
                                <span className="font-serif font-bold text-sm sm:text-[14px] print:text-[12.5px] text-[#1A1A1A] tracking-wide">
                                  {patron.personName}
                                </span>
                                <span className="text-xs print:text-[10px] text-[#444444] font-serif">様</span>
                              </div>
                            </div>

                            {/* Relationship if Family member */}
                            {!patron.isFamilyHead && (
                              <span className="text-[10px] print:text-[8.5px] text-[#777777] font-sans whitespace-nowrap">
                                （{patron.relationship} / {patron.householdHead} 方）
                              </span>
                            )}

                            {/* 為書き (Tamegaki) - 空の時は出力しない */}
                            {patron.segakiTamegaki && patron.segakiTamegaki.trim() !== '' ? (
                              <span className="font-serif font-bold text-[11px] print:text-[9.5px] text-amber-950 print:text-black bg-amber-50 print:bg-transparent border border-amber-300 print:border-black/40 px-1 py-0.2 print:px-1 print:py-0 whitespace-nowrap shadow-2xs">
                                為 {patron.segakiTamegaki}
                              </span>
                            ) : null}
                          </div>

                          {/* Right: Underline / Check-in area */}
                          <div className="flex items-center space-x-1 shrink-0 select-none pl-1">
                            {showUnderline && (
                              <span className="text-[#888888] font-mono text-xs print:text-[9.5px] tracking-tighter opacity-80">
                                ＿＿＿＿
                              </span>
                            )}
                            <div
                              className="w-3.5 h-3.5 border border-[#888888] text-[8px] text-[#999999] flex items-center justify-center font-serif"
                              title="受付済/塔婆書済チェック"
                            >
                              □
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* Table View (詳細一覧表: 最新戒名・没年月日・俗名・新盆表示) */
            <div className="border border-[#D1CEC7] overflow-hidden">
              <table className="segaki-print-table w-full text-left border-collapse text-xs table-fixed">
                <thead>
                  <tr className="bg-[#F9F7F2] border-b border-[#D1CEC7] text-[#1A1A1A] font-serif">
                    <th className="p-2 print:py-1 print:px-1 border-r border-[#D1CEC7] text-center w-[5%] font-bold print:text-[10px]">No</th>
                    <th className="p-2 print:py-1 print:px-1.5 border-r border-[#D1CEC7] font-bold w-[17%] print:text-[10px]">施主氏名</th>
                    <th className="p-2 print:py-1 print:px-1.5 border-r border-[#D1CEC7] font-bold w-[15%] print:text-[10px]">為書き</th>
                    <th className="p-2 print:py-1 print:px-1.5 border-r border-[#D1CEC7] text-center w-[13%] font-bold print:text-[10px]">続柄 / 所属世帯</th>
                    <th className="p-2 print:py-1 print:px-1.5 border-r border-[#D1CEC7] font-bold w-[26%] print:text-[10px]">最新のお戒名</th>
                    <th className="p-2 print:py-1 print:px-1.5 border-r border-[#D1CEC7] font-bold w-[13%] print:text-[10px]">没年月日</th>
                    <th className="p-2 print:py-1 print:px-1.5 font-bold w-[11%] print:text-[10px]">俗名</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EBE7DF]">
                  {filteredPatrons.map((patron, idx) => (
                    <tr key={patron.key} className="hover:bg-[#FAF9F5] print:hover:bg-transparent transition-colors">
                      {/* No */}
                      <td className="p-2 print:py-1 print:px-1 border-r border-[#EBE7DF] text-center font-mono text-[#666666] print:text-[9.5px]">
                        {idx + 1}
                      </td>

                      {/* 施主氏名 (前揃えふりがな・様) */}
                      <td className="p-2 print:py-1 print:px-1.5 border-r border-[#EBE7DF] break-words">
                        {patron.furigana && (
                          <div className="text-[9px] print:text-[8px] text-[#777777] font-sans leading-tight">
                            {patron.furigana}
                          </div>
                        )}
                        <div className="font-bold text-[#1A1A1A] font-serif text-xs print:text-[11px] leading-tight">
                          {patron.personName} <span className="text-[10px] print:text-[9px] font-normal text-[#555555]">様</span>
                        </div>
                      </td>

                      {/* 為書き (空なら空欄) */}
                      <td className="p-2 print:py-1 print:px-1.5 border-r border-[#EBE7DF] font-serif text-xs print:text-[10px] break-words">
                        {patron.segakiTamegaki && patron.segakiTamegaki.trim() !== '' ? (
                          <span className="font-bold text-amber-950 print:text-black bg-amber-50 print:bg-transparent px-1 py-0.5 print:p-0 border border-amber-200 print:border-none inline-block">
                            為 {patron.segakiTamegaki}
                          </span>
                        ) : (
                          <span className="text-[#AAAAAA]">—</span>
                        )}
                      </td>

                      {/* 続柄 / 所属世帯 */}
                      <td className="p-2 print:py-1 print:px-1.5 border-r border-[#EBE7DF] text-center break-words">
                        {patron.isFamilyHead ? (
                          <span className="bg-[#1A1A1A] text-[#D4AF37] print:bg-transparent print:text-black px-1.5 py-0.5 print:p-0 text-[10px] print:text-[9.5px] font-bold inline-block border print:border-black/30">
                            世帯主
                          </span>
                        ) : (
                          <div className="text-xs print:text-[9.5px] leading-tight">
                            <span className="font-bold text-[#2D2D2D]">{patron.relationship}</span>
                            <div className="text-[9px] print:text-[8px] text-[#777777]">({patron.householdHead} 方)</div>
                          </div>
                        )}
                      </td>

                      {/* 最新のお戒名 (新盆の場合は「令和〇年新盆」表示付き) */}
                      <td className="p-2 print:py-1 print:px-1.5 border-r border-[#EBE7DF] break-words">
                        {patron.latestDharmaName ? (
                          <div className="flex items-center flex-wrap gap-1 leading-tight">
                            {patron.isNiibon && patron.niibonLabel && (
                              <span className="bg-red-700 text-white print:bg-black print:text-white px-1 py-0.2 text-[9px] print:text-[8px] font-bold tracking-wide font-sans shrink-0">
                                {patron.niibonLabel}
                              </span>
                            )}
                            <span className="font-serif font-bold text-[#1A1A1A] text-xs print:text-[11px] tracking-wide">
                              {patron.latestDharmaName}
                            </span>
                          </div>
                        ) : (
                          <span className="text-[#AAAAAA] text-[10px] font-serif">（過去帳未登録）</span>
                        )}
                      </td>

                      {/* 没年月日（俗名の前に配置） */}
                      <td className="p-2 print:py-1 print:px-1.5 border-r border-[#EBE7DF] font-serif text-xs print:text-[9.5px] text-[#2D2D2D] leading-tight break-words">
                        {patron.latestDeathDate ? (
                          <div>
                            <div className="font-bold text-[#1A1A1A]">
                              {formatJapaneseEraDate(patron.latestDeathDate, false)}
                            </div>
                            <div className="text-[9px] text-[#888888] font-mono">
                              ({normalizeDateInput(patron.latestDeathDate)})
                            </div>
                          </div>
                        ) : (
                          <span className="text-[#AAAAAA]">—</span>
                        )}
                      </td>

                      {/* 俗名（没年月日の後ろに配置、享年は削除） */}
                      <td className="p-2 print:py-1 print:px-1.5 font-serif text-xs print:text-[10px] text-[#2D2D2D] break-words">
                        {patron.latestSecularName ? (
                          <span className="font-bold text-[#1A1A1A]">{patron.latestSecularName}</span>
                        ) : (
                          <span className="text-[#AAAAAA]">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Print Footer note */}
          <div className="mt-4 pt-1.5 border-t border-[#D1CEC7] flex justify-between items-center text-[9px] text-[#888888] font-serif">
            <div>※本一覧は檀家名簿の施餓鬼塔婆チェック（世帯主・家族構成）より五十音順に自動抽出・マージされたものです。</div>
            <div>頁印字 / 施餓鬼会・盂蘭盆会 塔婆筆耕・受付照合用</div>
          </div>
        </div>

        {/* Footer - Screen only */}
        <div className="bg-[#F9F7F2] px-4 sm:px-6 py-3 border-t border-[#D1CEC7] flex flex-wrap items-center justify-between gap-2 text-xs font-sans shrink-0 print:hidden">
          <span className="text-[#666666]">
            ※「印刷する」ボタンを押すと、A4用紙（縦または横）に最適化されて出力されます。
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-[#1A1A1A] hover:bg-[#333333] text-white font-bold transition-colors cursor-pointer"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );

  return ReactDOM.createPortal(modalContent, document.body);
};
