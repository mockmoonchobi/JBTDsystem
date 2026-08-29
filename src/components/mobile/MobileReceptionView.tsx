import React, { useState, useMemo, useEffect } from 'react';
import {
  Search,
  X,
  QrCode,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Building2,
  Calendar,
  DollarSign,
  User,
  MapPin,
  Sparkles,
  Receipt,
  RotateCcw,
  Check,
} from 'lucide-react';
import {
  Household,
  PastRecord,
  TempleInfo,
  TempleProfile,
  Transaction,
  TransactionCategory,
  BatchAccountingConfig,
} from '../../types';
import {
  sortHouseholdsByGojuon,
  getKanaRow,
  getKanaColumn,
  getHouseholdSponsorInfo,
  formatJapaneseEraDate,
} from '../../utils/memorialCalculator';
import {
  getSavedBatchAccountingConfig,
  getDefaultBatchAccountingConfig,
} from '../../utils/batchAccountingUtils';
import { KanaIndexFilter } from '../common/KanaIndexFilter';
import { MobileQrScannerModal } from './MobileQrScannerModal';

interface MobileReceptionViewProps {
  households: Household[];
  allHouseholds?: Household[];
  pastRecords?: PastRecord[];
  templeInfo: TempleInfo;
  temples?: TempleProfile[];
  activeTempleId?: string;
  onSelectTemple?: (templeId: string) => void;
  onAddTransaction: (transaction: Transaction) => void;
}

interface ReceptionFeeItem {
  index: number;
  label: string; // 適用（入力不可）
  category: string; // 勘定科目
  amount: number | ''; // 金額
}

export const MobileReceptionView: React.FC<MobileReceptionViewProps> = ({
  households,
  allHouseholds,
  pastRecords = [],
  templeInfo,
  temples = [],
  activeTempleId = 'temple-main',
  onSelectTemple,
  onAddTransaction,
}) => {
  // Current active temple info
  const selectedTemple = useMemo(() => {
    return temples.find((t) => t.id === activeTempleId) || temples[0] || {
      id: 'temple-main',
      name: templeInfo.name || '自寺院',
      isMain: true,
    };
  }, [temples, activeTempleId, templeInfo]);

  // Households strictly belonging to current temple (兼務寺院除外)
  const templeHouseholds = useMemo(() => {
    const list = households.filter((h) => {
      const hTempleId = h.templeId || 'temple-main';
      return hTempleId === activeTempleId || (selectedTemple.isMain && !h.templeId);
    });
    return sortHouseholdsByGojuon(list);
  }, [households, activeTempleId, selectedTemple]);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [districtFilter, setDistrictFilter] = useState('ALL');
  const [selectedKanaRow, setSelectedKanaRow] = useState<string>('ALL');
  const [selectedKanaCol, setSelectedKanaCol] = useState<string>('ALL');

  // Selected Household for Reception Form (null = in search view)
  const [selectedHousehold, setSelectedHousehold] = useState<Household | null>(null);

  // QR Scanner Modal State
  const [isQrScannerOpen, setIsQrScannerOpen] = useState(false);

  // Success / Feedback Toast
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => {
        setToastMessage(null);
      }, 3500);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  // Disticts list
  const availableDistricts = useMemo(() => {
    const set = new Set<string>();
    templeHouseholds.forEach((h) => {
      if (h.district && h.district.trim()) set.add(h.district.trim());
    });
    return Array.from(set).sort();
  }, [templeHouseholds]);

  // Filtered Households list
  const searchedHouseholds = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();

    return templeHouseholds.filter((h) => {
      const sponsorInfo = getHouseholdSponsorInfo(h);

      // 1. Kana Row & Column filter (2-Step Gojuon)
      if (selectedKanaRow !== 'ALL') {
        const kanaText = sponsorInfo.furigana || (h as any).furigana || (h as any).kana || sponsorInfo.sponsorName || h.familyHead || '';
        const row = getKanaRow(kanaText);
        if (row !== selectedKanaRow) return false;

        if (selectedKanaCol !== 'ALL') {
          const col = getKanaColumn(kanaText);
          if (col !== selectedKanaCol) return false;
        }
      }

      // 2. District filter
      if (districtFilter !== 'ALL') {
        if (h.district !== districtFilter) return false;
      }

      // 3. Text search
      if (q) {
        const matchName = (h.familyHead || '').toLowerCase().includes(q);
        const matchFurigana = (h.furigana || '').toLowerCase().includes(q);
        const matchSponsor = sponsorInfo.sponsorName.toLowerCase().includes(q);
        const matchSponsorFuri = sponsorInfo.furigana.toLowerCase().includes(q);
        const matchDistrict = (h.district || '').toLowerCase().includes(q);
        const matchPhone = (h.phone || '').replace(/[-\s]/g, '').includes(q.replace(/[-\s]/g, ''));
        const matchMobile = (h.mobile || '').replace(/[-\s]/g, '').includes(q.replace(/[-\s]/g, ''));
        const matchAddress = (h.address || '').toLowerCase().includes(q);
        const matchId = (h.id || '').toLowerCase().includes(q);
        const matchMembers = (h.familyMembers || []).some((m) =>
          m.name.toLowerCase().includes(q) || (m.furigana || '').toLowerCase().includes(q)
        );

        if (
          !matchName &&
          !matchFurigana &&
          !matchSponsor &&
          !matchSponsorFuri &&
          !matchDistrict &&
          !matchPhone &&
          !matchMobile &&
          !matchAddress &&
          !matchId &&
          !matchMembers
        ) {
          return false;
        }
      }

      return true;
    });
  }, [templeHouseholds, searchQuery, selectedKanaRow, selectedKanaCol, districtFilter]);

  // Form State for Individual Reception
  const [receptionDate, setReceptionDate] = useState<string>(() => {
    return new Date().toISOString().slice(0, 10);
  });
  const [feeItems, setFeeItems] = useState<ReceptionFeeItem[]>([]);

  // Load config from 一括会計設定 when entering reception form
  const handleSelectHouseholdForReception = (household: Household) => {
    setSelectedHousehold(household);
    // Set date to the time when switching to reception screen
    const today = new Date().toISOString().slice(0, 10);
    setReceptionDate(today);

    // Retrieve saved Batch Accounting Config
    const config: BatchAccountingConfig =
      getSavedBatchAccountingConfig(activeTempleId) || getDefaultBatchAccountingConfig(templeInfo);

    const items: ReceptionFeeItem[] = [];

    // Helper to determine specific household amount or default
    const getAmountForNote = (note: string, defaultAmt: number | '') => {
      if (!note) return defaultAmt !== '' ? Number(defaultAmt) : '';
      if (household.fee1Amount !== undefined && household.fee1Amount !== null && Number(household.fee1Amount) > 0 && templeInfo?.feeType1 && note.includes(templeInfo.feeType1.trim())) {
        return Number(household.fee1Amount);
      }
      if (household.fee2Amount !== undefined && household.fee2Amount !== null && Number(household.fee2Amount) > 0 && templeInfo?.feeType2 && note.includes(templeInfo.feeType2.trim())) {
        return Number(household.fee2Amount);
      }
      if (household.fee3Amount !== undefined && household.fee3Amount !== null && Number(household.fee3Amount) > 0 && templeInfo?.feeType3 && note.includes(templeInfo.feeType3.trim())) {
        return Number(household.fee3Amount);
      }
      return defaultAmt !== '' ? Number(defaultAmt) : '';
    };

    // Item 1 (Only displayed if notes1 is defined and not empty)
    if (config?.notes1 && config.notes1.trim()) {
      const label = config.notes1.trim();
      items.push({
        index: 1,
        label,
        category: config.cat1 || '法要布施',
        amount: getAmountForNote(label, config.defaultAmount1),
      });
    }

    // Item 2 (Only displayed if notes2 is defined and not empty)
    if (config?.notes2 && config.notes2.trim()) {
      const label = config.notes2.trim();
      items.push({
        index: 2,
        label,
        category: config.cat2 || '護持会費',
        amount: getAmountForNote(label, config.defaultAmount2),
      });
    }

    // Item 3 (Only displayed if notes3 is defined and not empty)
    if (config?.notes3 && config.notes3.trim()) {
      const label = config.notes3.trim();
      items.push({
        index: 3,
        label,
        category: config.cat3 || '特別寄付',
        amount: getAmountForNote(label, config.defaultAmount3),
      });
    }

    setFeeItems(items);
  };

  // Handle QR Scan
  const handleQrScanned = (decoded: string) => {
    setIsQrScannerOpen(false);
    const cleaned = decoded.trim();

    // Match by household ID, or extract ID if string is formatted
    let matched = templeHouseholds.find((h) => h.id.toLowerCase() === cleaned.toLowerCase());

    if (!matched) {
      // Try finding anywhere in households list (even if across temples, then check if accessible)
      const allList = allHouseholds && allHouseholds.length > 0 ? allHouseholds : households;
      matched = allList.find((h) => h.id.toLowerCase() === cleaned.toLowerCase());
    }

    if (!matched) {
      // Match by exact familyHead or sponsor name
      matched = templeHouseholds.find(
        (h) => h.familyHead === cleaned || (h.furigana && h.furigana === cleaned)
      );
    }

    if (matched) {
      setToastMessage({
        text: `QRコード読込成功: ${matched.familyHead} 様を認識しました`,
        type: 'success',
      });
      handleSelectHouseholdForReception(matched);
    } else {
      setToastMessage({
        text: `該当する檀家（ID: ${cleaned}）が見つかりませんでした`,
        type: 'error',
      });
    }
  };

  // Handle Amount change for specific item
  const handleAmountChange = (index: number, valStr: string) => {
    setFeeItems((prev) =>
      prev.map((item) => {
        if (item.index !== index) return item;
        if (valStr === '') return { ...item, amount: '' };
        const num = Number(valStr.replace(/[^0-9]/g, ''));
        return { ...item, amount: isNaN(num) ? '' : num };
      })
    );
  };

  // Calculate Total
  const totalAmount = useMemo(() => {
    return feeItems.reduce((sum, item) => {
      return sum + (typeof item.amount === 'number' ? item.amount : 0);
    }, 0);
  }, [feeItems]);

  // Handle Save to Accounting (「会計に記載」)
  const handleSaveAccounting = () => {
    if (!selectedHousehold) return;

    const itemsToRecord = feeItems.filter(
      (item) => typeof item.amount === 'number' && item.amount > 0
    );

    if (itemsToRecord.length === 0) {
      alert('金額が入力されていません。1項目以上の金額を入力してください。');
      return;
    }

    const sponsorInfo = getHouseholdSponsorInfo(selectedHousehold);
    const now = new Date();
    const currentTimeStr = now.toTimeString().slice(0, 5);
    const createdDateStr = now.toISOString().slice(0, 10);

    itemsToRecord.forEach((item, idx) => {
      const newTx: Transaction = {
        id: `tx-rec-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
        templeId: selectedHousehold.templeId || activeTempleId || 'temple-main',
        date: receptionDate,
        householdId: selectedHousehold.id,
        householdHeadName: sponsorInfo.sponsorName || selectedHousehold.familyHead,
        category: item.category as TransactionCategory,
        type: '収入',
        amount: Number(item.amount),
        paymentMethod: 'QR受付時',
        receiptNumber: '',
        notes: item.label,
        description: item.label,
        createdDate: createdDateStr,
        createdTime: currentTimeStr,
        createdAt: now.toISOString(),
      };

      onAddTransaction(newTx);
    });

    const recordedName = sponsorInfo.sponsorName || selectedHousehold.familyHead;
    setToastMessage({
      text: `${recordedName} 様の受付・会計記帳（計 ${totalAmount.toLocaleString()}円）を完了しました`,
      type: 'success',
    });

    // Reset and return to search screen
    setSelectedHousehold(null);
  };

  // Handle Cancel (「キャンセル」)
  const handleCancelReception = () => {
    setSelectedHousehold(null);
  };

  return (
    <div className="flex flex-col min-h-[calc(100vh-8rem)] pb-20 font-sans">
      {/* Toast Feedback */}
      {toastMessage && (
        <div
          className={`fixed top-14 left-4 right-4 z-50 p-3 rounded-lg shadow-xl text-xs font-bold flex items-center space-x-2 animate-bounce transition-all ${
            toastMessage.type === 'success'
              ? 'bg-[#1A1A1A] text-[#D4AF37] border-2 border-[#D4AF37]'
              : 'bg-red-900 text-white border-2 border-red-400'
          }`}
        >
          {toastMessage.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 shrink-0 text-[#D4AF37]" />
          ) : (
            <AlertCircle className="w-5 h-5 shrink-0 text-red-300" />
          )}
          <span className="flex-1">{toastMessage.text}</span>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            className="p-1 hover:opacity-75"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* VIEW A: 檀家名の検索画面 (Search & QR Scan) */}
      {!selectedHousehold ? (
        <div className="p-3.5 space-y-3">
          {/* Temple Scope Bar & QR Scan Button */}
          <div className="bg-[#1A1A1A] text-white p-3 rounded-xs border-l-4 border-[#8C2D19] flex items-center justify-between gap-2 shadow-xs">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] text-[#D4AF37] font-bold">検索対象寺院:</span>
                <span className="text-xs font-bold text-white truncate">
                  {selectedTemple.name} （{templeHouseholds.length}世帯）
                </span>
              </div>
              <p className="text-[11px] text-gray-400 mt-0.5">※兼務寺院の檀家は除外</p>
            </div>

            {/* QR Scanner Trigger Button */}
            <button
              type="button"
              onClick={() => setIsQrScannerOpen(true)}
              className="px-3.5 py-2 bg-linear-to-r from-[#D4AF37] to-[#B38F26] hover:brightness-110 active:scale-95 text-[#1A1A1A] font-bold text-xs rounded-xs flex items-center space-x-1.5 shadow-md shrink-0 cursor-pointer transition-transform"
              title="カメラを起動して案内状・ハガキの檀家QRコードを読み取ります"
            >
              <QrCode className="w-4 h-4" />
              <span>QR読込</span>
            </button>
          </div>

          {/* Search Input Box */}
          <div className="relative">
            <input
              type="text"
              placeholder="施主氏名・フリガナ・地区名・電話番号・精霊名..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-9 py-2.5 bg-white border-2 border-[#8C2D19] text-sm font-bold text-[#1A1A1A] rounded-xs shadow-xs focus:ring-2 focus:ring-[#8C2D19]/30 outline-hidden"
            />
            <Search className="w-5 h-5 text-[#8C2D19] absolute left-3 top-1/2 -translate-y-1/2" />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* District Filter Chips */}
          {availableDistricts.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs no-scrollbar">
              <button
                type="button"
                onClick={() => setDistrictFilter('ALL')}
                className={`px-3 py-1 rounded-full font-bold shrink-0 border cursor-pointer transition-colors ${
                  districtFilter === 'ALL'
                    ? 'bg-[#8C2D19] text-white border-[#8C2D19]'
                    : 'bg-white text-gray-700 border-gray-300'
                }`}
              >
                全地区 ({templeHouseholds.length})
              </button>
              {availableDistricts.map((d) => {
                const dCount = templeHouseholds.filter((h) => h.district === d).length;
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDistrictFilter(d)}
                    className={`px-3 py-1 rounded-full font-bold shrink-0 border cursor-pointer transition-colors ${
                      districtFilter === d
                        ? 'bg-[#8C2D19] text-white border-[#8C2D19]'
                        : 'bg-white text-gray-700 border-gray-300'
                    }`}
                  >
                    {d} ({dCount})
                  </button>
                );
              })}
            </div>
          )}

          {/* 2-Step Kana Index Filter (五十音順インデックス) */}
          <div className="bg-white p-2.5 rounded-xs border border-[#D1CEC7] shadow-xs">
            <KanaIndexFilter
              selectedRow={selectedKanaRow}
              selectedCol={selectedKanaCol}
              onSelectRow={(row) => {
                setSelectedKanaRow(row);
                setSelectedKanaCol('ALL');
              }}
              onSelectCol={(col) => setSelectedKanaCol(col)}
              onReset={() => {
                setSelectedKanaRow('ALL');
                setSelectedKanaCol('ALL');
              }}
              accentColor="wine"
            />
          </div>

          {/* Results Summary Header */}
          <div className="flex items-center justify-between text-xs text-gray-600 px-1 pt-0.5 font-medium">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span>
                該当候補: <strong className="text-[#8C2D19] text-sm font-bold">{searchedHouseholds.length}</strong> 件
              </span>
              <span className="px-1.5 py-0.2 bg-amber-50 text-amber-900 border border-amber-200 text-[10px] font-bold rounded-2xs">
                五十音順
              </span>
              {selectedKanaRow !== 'ALL' && (
                <span className="px-1.5 py-0.2 bg-[#8C2D19] text-white text-[10px] font-bold rounded-2xs">
                  【{selectedKanaRow}行{selectedKanaCol !== 'ALL' ? `・${selectedKanaCol}` : ''}】
                </span>
              )}
            </div>
            <span className="text-gray-500 font-bold">タップして個別受付へ</span>
          </div>

          {/* Households List */}
          <div className="space-y-2 pb-6">
            {searchedHouseholds.length === 0 ? (
              <div className="p-8 bg-white border border-[#D1CEC7] rounded-xs text-center space-y-2">
                <p className="text-sm font-bold text-gray-700">該当する檀家が見つかりませんでした</p>
                <p className="text-xs text-gray-500">
                  検索条件を変更するか、上の「QR読込」をお試しください。
                </p>
              </div>
            ) : (
              searchedHouseholds.slice(0, 60).map((h) => {
                const sponsorInfo = getHouseholdSponsorInfo(h);

                return (
                  <button
                    key={h.id}
                    type="button"
                    onClick={() => handleSelectHouseholdForReception(h)}
                    className="w-full p-3.5 bg-white border border-[#D1CEC7] hover:border-[#8C2D19] active:bg-amber-50 rounded-xs text-left transition-all flex items-center justify-between gap-2 shadow-2xs cursor-pointer group"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-base font-bold text-[#1A1A1A] font-serif group-hover:text-[#8C2D19]">
                          {sponsorInfo.sponsorName || '（施主未登録）'} 様
                        </span>
                        {sponsorInfo.furigana && (
                          <span className="text-xs text-gray-500 font-sans">
                            （{sponsorInfo.furigana}）
                          </span>
                        )}
                        {sponsorInfo.isDistinctFromHead && sponsorInfo.householdHead && (
                          <span className="text-[11px] text-stone-600 bg-stone-100 px-1.5 py-0.5 rounded-2xs border border-stone-200">
                            世帯主: {sponsorInfo.householdHead}
                          </span>
                        )}
                        {h.district && (
                          <span className="px-2 py-0.5 bg-gray-100 border border-gray-300 text-gray-700 text-xs font-bold rounded-2xs">
                            {h.district}
                          </span>
                        )}
                        <span className="text-xs text-gray-400 font-mono">#{h.id}</span>
                      </div>

                      {h.address && (
                        <p className="text-xs text-gray-600 truncate flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-gray-400 shrink-0" />
                          <span>{h.address}</span>
                        </p>
                      )}
                    </div>

                    <div className="flex items-center text-xs font-bold text-[#8C2D19] shrink-0 space-x-0.5">
                      <span>受付</span>
                      <ArrowRight className="w-4 h-4" />
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      ) : (
        /* VIEW B: 個別入力画面 (Individual Reception Entry Screen) */
        <div className="p-4 space-y-4 animate-fadeIn">
          {/* Header Card with Sponsor Info */}
          <div className="bg-[#1A1A1A] text-white p-4 rounded-xs border-t-4 border-[#D4AF37] shadow-lg space-y-2 font-serif">
            <div className="flex items-center justify-between">
              <span className="px-2 py-0.5 bg-[#D4AF37] text-[#1A1A1A] text-[10px] font-bold rounded-2xs font-sans">
                個別受付
              </span>
              <span className="text-xs text-gray-400 font-mono">ID: {selectedHousehold.id}</span>
            </div>

            <div className="pt-1">
              <h2 className="text-xl font-bold text-white tracking-wide">
                {getHouseholdSponsorInfo(selectedHousehold).sponsorName || selectedHousehold.familyHead} 殿
              </h2>
              {selectedHousehold.furigana && (
                <p className="text-xs text-[#D4AF37] font-sans">
                  {selectedHousehold.furigana}
                </p>
              )}
            </div>

            <div className="flex items-center gap-2 text-xs text-gray-300 font-sans flex-wrap pt-1 border-t border-[#333]">
              {selectedHousehold.district && (
                <span className="px-2 py-0.5 bg-[#2A2A2A] text-gray-200 border border-gray-600 rounded-2xs">
                  地区: {selectedHousehold.district}
                </span>
              )}
              {selectedHousehold.householdType && (
                <span className="px-2 py-0.5 bg-[#2A2A2A] text-gray-200 border border-gray-600 rounded-2xs">
                  区分: {selectedHousehold.householdType}
                </span>
              )}
              {selectedHousehold.tombNumber && (
                <span className="px-2 py-0.5 bg-[#2A2A2A] text-gray-200 border border-gray-600 rounded-2xs">
                  墓番: {selectedHousehold.tombNumber}
                </span>
              )}
            </div>
          </div>

          {/* Reception Form Details */}
          <div className="bg-white border-2 border-[#D1CEC7] p-4 rounded-xs shadow-md space-y-4 font-sans">
            {/* 受付日 (Reception Date) */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-gray-700 flex items-center space-x-1">
                <Calendar className="w-4 h-4 text-[#8C2D19]" />
                <span>受付日</span>
              </label>
              <div className="flex items-center space-x-2">
                <input
                  type="date"
                  value={receptionDate}
                  onChange={(e) => setReceptionDate(e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded text-sm font-bold text-[#1A1A1A] bg-gray-50 focus:bg-white focus:border-[#8C2D19] outline-hidden shadow-2xs"
                />
                <span className="text-xs font-serif text-gray-600 whitespace-nowrap">
                  {formatJapaneseEraDate(receptionDate, false)}
                </span>
              </div>
            </div>

            {/* 一括会計設定に基づく項目・金額入力 (Fee Items & Amounts) */}
            <div className="space-y-3 pt-2 border-t border-gray-200">
              <div className="flex items-center justify-between text-xs text-gray-600 font-bold">
                <span className="flex items-center space-x-1 text-[#8C2D19]">
                  <Receipt className="w-4 h-4" />
                  <span>受付金額の入力 (一括会計設定連動)</span>
                </span>
                <span className="text-[10px] text-gray-500">※適用は設定より自動固定</span>
              </div>

              {feeItems.length === 0 ? (
                <div className="p-4 bg-amber-50 border border-amber-300 rounded-xs text-center space-y-1">
                  <p className="text-xs font-bold text-amber-900">受付項目が設定されていません</p>
                  <p className="text-[11px] text-amber-700">
                    パソコン管理画面の「一括会計処理」上部設定バーにて摘要名を入力・保存してください。
                  </p>
                </div>
              ) : (
                feeItems.map((item) => (
                  <div
                    key={item.index}
                    className="p-3 bg-[#FAF8F5] border border-[#E0DCD3] rounded-xs space-y-1.5"
                  >
                    <div className="flex items-center justify-between text-xs">
                      {/* 項目（適用名・入力不可） */}
                      <div className="flex items-center space-x-1.5">
                        <span className="w-5 h-5 rounded-full bg-[#8C2D19] text-white flex items-center justify-center text-[10px] font-bold">
                          {item.index}
                        </span>
                        <span className="font-bold text-sm text-[#1A1A1A] font-serif">
                          {item.label}
                        </span>
                        <span className="text-[10px] text-gray-500 bg-white px-1.5 py-0.2 border border-gray-200 rounded-2xs">
                          {item.category}
                        </span>
                      </div>
                    </div>

                    {/* 金額入力欄 */}
                    <div className="relative flex items-center">
                      <span className="absolute left-3 text-sm font-bold text-gray-500">¥</span>
                      <input
                        type="number"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        step="1000"
                        placeholder="0"
                        value={item.amount}
                        onChange={(e) => handleAmountChange(item.index, e.target.value)}
                        className="w-full pl-8 pr-12 py-2 bg-white border border-gray-300 rounded text-base font-bold font-mono text-right text-[#1A1A1A] focus:border-[#8C2D19] focus:ring-1 focus:ring-[#8C2D19] outline-hidden shadow-2xs"
                      />
                      <span className="absolute right-3 text-xs font-bold text-gray-500">円</span>
                    </div>
                  </div>
                ))
              )}

              {/* Total Amount Summary */}
              <div className="p-3 bg-amber-50 border border-amber-300 rounded-xs flex items-center justify-between text-amber-950 font-bold">
                <span className="text-xs">合計納入額:</span>
                <span className="text-lg font-mono font-black text-[#8C2D19]">
                  ¥ {totalAmount.toLocaleString()} <span className="text-xs font-serif">円也</span>
                </span>
              </div>
            </div>

            {/* Action Buttons: 会計に記載 & キャンセル */}
            <div className="pt-3 border-t border-gray-200 flex items-center gap-2">
              <button
                type="button"
                onClick={handleCancelReception}
                className="flex-1 py-3 px-3 bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-gray-700 font-bold text-xs rounded-xs border border-gray-300 transition-colors flex items-center justify-center space-x-1 cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                <span>キャンセル</span>
              </button>

              <button
                type="button"
                onClick={handleSaveAccounting}
                disabled={totalAmount <= 0}
                className={`flex-2 py-3 px-4 rounded-xs font-bold text-sm transition-all flex items-center justify-center space-x-1.5 shadow-md cursor-pointer ${
                  totalAmount > 0
                    ? 'bg-linear-to-r from-[#8C2D19] to-[#a83820] hover:brightness-110 active:scale-98 text-white'
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                }`}
              >
                <Check className="w-5 h-5" />
                <span>会計に記載</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QR Code Camera Scanner Modal */}
      <MobileQrScannerModal
        isOpen={isQrScannerOpen}
        onClose={() => setIsQrScannerOpen(false)}
        onScan={handleQrScanned}
      />
    </div>
  );
};
