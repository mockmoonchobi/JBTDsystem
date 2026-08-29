import React, { useState, useMemo } from 'react';
import { Household, PastRecord, MemorialService, MasterOptions, TempleProfile } from '../../types';
import { 
  Search, 
  Phone, 
  MapPin, 
  Plus, 
  ChevronRight, 
  ChevronDown, 
  Users, 
  BookOpen, 
  Calendar as CalendarIcon, 
  Edit, 
  ExternalLink,
  Filter,
  X,
  ArrowUpDown
} from 'lucide-react';
import { getGoogleMapsSearchUrl } from '../../utils/calendarUtils';
import { sortHouseholdsByGojuon, getKanaRow, getKanaColumn, getHouseholdSponsorInfo, isHouseholdSponsorSegakiToba } from '../../utils/memorialCalculator';
import { MobileHouseholdModal } from './MobileHouseholdModal';
import { KanaIndexFilter } from '../common/KanaIndexFilter';

interface MobileHouseholdViewProps {
  households: Household[];
  pastRecords: PastRecord[];
  memorialServices: MemorialService[];
  masterOptions?: MasterOptions;
  temples?: TempleProfile[];
  activeTempleId?: string;
  onSelectTemple?: (templeId: string) => void;
  onSaveHousehold: (household: Household) => void;
  onDeleteHousehold: (id: string) => void;
  onOpenAddPastRecord: (householdId: string) => void;
  onOpenAddService: (householdId: string) => void;
}

export const MobileHouseholdView: React.FC<MobileHouseholdViewProps> = ({
  households = [],
  pastRecords = [],
  memorialServices = [],
  masterOptions,
  temples = [],
  activeTempleId = 'temple-main',
  onSelectTemple,
  onSaveHousehold,
  onDeleteHousehold,
  onOpenAddPastRecord,
  onOpenAddService,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>('all');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('all');
  const [selectedDistrictFilter, setSelectedDistrictFilter] = useState<string>('all');
  const [selectedSegakiFilter, setSelectedSegakiFilter] = useState<'all' | 'checked' | 'unchecked'>('all');
  const [selectedTanagyoFilter, setSelectedTanagyoFilter] = useState<'all' | 'checked' | 'unchecked'>('all');
  const [selectedKanaRow, setSelectedKanaRow] = useState<string>('all');
  const [selectedKanaCol, setSelectedKanaCol] = useState<string>('all');
  const [expandedHouseholdId, setExpandedHouseholdId] = useState<string | null>(null);

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingHousehold, setEditingHousehold] = useState<Household | null>(null);

  // Filtered and sorted households (Default: 五十音順 / Japanese Alphabetical Order)
  const filteredHouseholds = useMemo(() => {
    const list = households.filter((h) => {
      // Kana row & column filter (あ行, か行, さ行 etc. and individual sub-characters)
      if (selectedKanaRow !== 'all' && selectedKanaRow !== 'ALL') {
        const kanaText = h.furigana || (h as any).kana || h.familyHead || '';
        const row = getKanaRow(kanaText);
        if (row !== selectedKanaRow) {
          return false;
        }
        if (selectedKanaCol !== 'all' && selectedKanaCol !== 'ALL') {
          const col = getKanaColumn(kanaText);
          if (col !== selectedKanaCol) {
            return false;
          }
        }
      }

      // Search query filter (name, furigana, phone, mobile, address, district)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = h.familyHead?.toLowerCase().includes(q);
        const matchFurigana = h.furigana?.toLowerCase().includes(q);
        const matchPhone = h.phone?.replace(/[-\s]/g, '').includes(q.replace(/[-\s]/g, ''));
        const matchMobile = h.mobile?.replace(/[-\s]/g, '').includes(q.replace(/[-\s]/g, ''));
        const matchAddress = h.address?.toLowerCase().includes(q);
        const matchDistrict = h.district?.toLowerCase().includes(q);
        const matchTomb = h.tombNumber?.toLowerCase().includes(q);
        const matchMembers = (h.familyMembers || []).some((m) => m.name.toLowerCase().includes(q));

        if (!matchName && !matchFurigana && !matchPhone && !matchMobile && !matchAddress && !matchDistrict && !matchTomb && !matchMembers) {
          return false;
        }
      }

      // Type filter (区分１)
      if (selectedTypeFilter !== 'all' && h.householdType !== selectedTypeFilter) {
        return false;
      }

      // Status filter (区分２)
      if (selectedStatusFilter !== 'all') {
        if (selectedStatusFilter === '__UNSET__') {
          if ((h.status || '').trim()) return false;
        } else if (h.status !== selectedStatusFilter) {
          return false;
        }
      }

      // District filter (役職)
      if (selectedDistrictFilter !== 'all' && h.district !== selectedDistrictFilter) {
        return false;
      }

      // Segaki Toba filter (施餓鬼塔婆)
      if (selectedSegakiFilter !== 'all') {
        const isSegaki = isHouseholdSponsorSegakiToba(h);
        if (selectedSegakiFilter === 'checked' && !isSegaki) return false;
        if (selectedSegakiFilter === 'unchecked' && isSegaki) return false;
      }

      // Tanagyo filter (棚経)
      if (selectedTanagyoFilter !== 'all') {
        const isTanagyo = Boolean(h.tanagyoMonthlyVisit);
        if (selectedTanagyoFilter === 'checked' && !isTanagyo) return false;
        if (selectedTanagyoFilter === 'unchecked' && isTanagyo) return false;
      }

      return true;
    });

    // Sort strictly in 五十音順 (A-I-U-E-O order using normalized furigana / familyHead)
    return sortHouseholdsByGojuon(list);
  }, [households, searchQuery, selectedTypeFilter, selectedStatusFilter, selectedDistrictFilter, selectedSegakiFilter, selectedTanagyoFilter, selectedKanaRow]);

  // Unique types, statuses, and districts for filter chips
  const householdTypes = useMemo(() => {
    const types = new Set(households.map((h) => h.householdType).filter(Boolean));
    return Array.from(types);
  }, [households]);

  const householdStatuses = useMemo(() => {
    const fromMaster = masterOptions?.statuses || [];
    const fromHouseholds = households.map((h) => h.status).filter(Boolean) as string[];
    const set = new Set([...fromMaster, ...fromHouseholds]);
    return Array.from(set).filter(Boolean);
  }, [masterOptions?.statuses, households]);

  const districts = useMemo(() => {
    const dists = new Set(households.map((h) => h.district).filter(Boolean));
    return Array.from(dists);
  }, [households]);

  const toggleExpand = (id: string) => {
    setExpandedHouseholdId(expandedHouseholdId === id ? null : id);
  };

  const handleEdit = (h: Household, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingHousehold(h);
    setIsModalOpen(true);
  };

  const handleAddNew = () => {
    setEditingHousehold(null);
    setIsModalOpen(true);
  };

  return (
    <div className="space-y-2.5 p-3 pb-24">
      {/* Compact Search & Filter Section (Normal Flow, No Overlap) */}
      <div className="bg-white border border-[#D1CEC7] rounded-xs p-3 space-y-2.5 shadow-2xs">
        {/* Search Bar & Add Button */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="お名前、フリガナ、電話、住所で検索..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-8 py-2 bg-[#FAF8F5] border border-[#D1CEC7] rounded-xs text-sm font-medium placeholder:text-gray-400 focus:border-[#8C2D19] focus:bg-white focus:outline-hidden"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={handleAddNew}
            className="px-3.5 py-2 bg-[#8C2D19] hover:bg-[#732414] active:bg-[#5C1D10] text-white rounded-xs text-xs font-bold flex items-center gap-1 shadow-xs shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>新規世帯</span>
          </button>
        </div>

        {/* Filter Controls for Mobile (区分１, 区分２, 役職, 施餓鬼塔婆, 棚経) */}
        <div className="space-y-1.5 pt-0.5">
          {/* Filter Chips Horizontal Scroll */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar text-xs">
            <span className="text-gray-500 font-bold shrink-0 flex items-center gap-1 text-xs mr-0.5">
              <Filter className="w-3.5 h-3.5" />
              絞込:
            </span>
            <button
              type="button"
              onClick={() => {
                setSelectedTypeFilter('all');
                setSelectedStatusFilter('all');
                setSelectedDistrictFilter('all');
                setSelectedSegakiFilter('all');
                setSelectedTanagyoFilter('all');
                setSelectedKanaRow('all');
              }}
              className={`px-2.5 py-1 rounded-xs font-bold shrink-0 cursor-pointer border text-xs ${
                selectedTypeFilter === 'all' && selectedStatusFilter === 'all' && selectedDistrictFilter === 'all' && selectedSegakiFilter === 'all' && selectedTanagyoFilter === 'all' && selectedKanaRow === 'all'
                  ? 'bg-[#1A1A1A] text-[#D4AF37] border-[#1A1A1A]'
                  : 'bg-[#FAF8F5] text-gray-600 border-[#D1CEC7]'
              }`}
            >
              すべて ({households.length})
            </button>

            {/* Segaki Toba Filter Chip Toggle */}
            <button
              type="button"
              onClick={() => {
                if (selectedSegakiFilter === 'all') setSelectedSegakiFilter('checked');
                else if (selectedSegakiFilter === 'checked') setSelectedSegakiFilter('unchecked');
                else setSelectedSegakiFilter('all');
              }}
              className={`px-2.5 py-1 rounded-xs font-bold shrink-0 cursor-pointer border text-xs transition-colors ${
                selectedSegakiFilter === 'checked'
                  ? 'bg-orange-600 text-white border-orange-600'
                  : selectedSegakiFilter === 'unchecked'
                  ? 'bg-amber-100 text-amber-900 border-amber-300'
                  : 'bg-[#FAF8F5] text-gray-700 border-[#D1CEC7]'
              }`}
            >
              塔婆: {selectedSegakiFilter === 'checked' ? '申込あり' : selectedSegakiFilter === 'unchecked' ? '未申込' : '全て'}
            </button>

            {/* Tanagyo Filter Chip Toggle */}
            <button
              type="button"
              onClick={() => {
                if (selectedTanagyoFilter === 'all') setSelectedTanagyoFilter('checked');
                else if (selectedTanagyoFilter === 'checked') setSelectedTanagyoFilter('unchecked');
                else setSelectedTanagyoFilter('all');
              }}
              className={`px-2.5 py-1 rounded-xs font-bold shrink-0 cursor-pointer border text-xs transition-colors ${
                selectedTanagyoFilter === 'checked'
                  ? 'bg-teal-600 text-white border-teal-600'
                  : selectedTanagyoFilter === 'unchecked'
                  ? 'bg-teal-50 text-teal-900 border-teal-200'
                  : 'bg-[#FAF8F5] text-gray-700 border-[#D1CEC7]'
              }`}
            >
              棚経: {selectedTanagyoFilter === 'checked' ? '対象(伺う)' : selectedTanagyoFilter === 'unchecked' ? '対象外' : '全て'}
            </button>

            {/* Status (区分２) Filter Dropdown/Chips */}
            {householdStatuses.map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setSelectedStatusFilter(selectedStatusFilter === status ? 'all' : status)}
                className={`px-2.5 py-1 rounded-xs font-bold shrink-0 cursor-pointer border text-xs ${
                  selectedStatusFilter === status
                    ? 'bg-emerald-700 text-white border-emerald-700'
                    : 'bg-[#FAF8F5] text-gray-700 border-[#D1CEC7]'
                }`}
              >
                区分２:{status}
              </button>
            ))}

            {/* Type filters (区分１) */}
            {householdTypes.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setSelectedTypeFilter(selectedTypeFilter === type ? 'all' : type)}
                className={`px-2.5 py-1 rounded-xs font-bold shrink-0 cursor-pointer border text-xs ${
                  selectedTypeFilter === type
                    ? 'bg-[#8C2D19] text-white border-[#8C2D19]'
                    : 'bg-[#FAF8F5] text-gray-700 border-[#D1CEC7]'
                }`}
              >
                {type}
              </button>
            ))}

            {/* District filters */}
            {districts.map((dist) => (
              <button
                key={dist}
                type="button"
                onClick={() => setSelectedDistrictFilter(selectedDistrictFilter === dist ? 'all' : dist)}
                className={`px-2.5 py-1 rounded-xs font-bold shrink-0 cursor-pointer border text-xs ${
                  selectedDistrictFilter === dist
                    ? 'bg-[#2D3748] text-white border-[#2D3748]'
                    : 'bg-[#FAF8F5] text-gray-700 border-[#D1CEC7]'
                }`}
              >
                {dist}
              </button>
            ))}
          </div>
        </div>

        {/* 50-Sound (五十音行) Quick Filter Bar with 2-Step Drill-down */}
        <div className="pt-2 border-t border-[#F0ECE1]">
          <KanaIndexFilter
            selectedRow={selectedKanaRow}
            selectedCol={selectedKanaCol}
            onSelectRow={(row) => {
              setSelectedKanaRow(row);
              setSelectedKanaCol('all');
            }}
            onSelectCol={(col) => setSelectedKanaCol(col)}
            onReset={() => {
              setSelectedKanaRow('all');
              setSelectedKanaCol('all');
            }}
            accentColor="wine"
          />
        </div>
      </div>

      {/* Household Count summary */}
      <div className="px-1 flex items-center justify-between text-xs text-gray-500 font-medium">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span>表示中: <strong className="text-[#1A1A1A] font-bold text-sm">{filteredHouseholds.length}</strong> 件</span>
          <span className="px-1.5 py-0.2 bg-amber-50 text-amber-900 border border-amber-200 text-[10px] font-bold rounded-2xs">
            五十音順
          </span>
          {selectedKanaRow !== 'all' && (
            <span className="px-1.5 py-0.2 bg-[#8C2D19] text-white text-[10px] font-bold rounded-2xs">
              【{selectedKanaRow}行{selectedKanaCol !== 'all' && selectedKanaCol !== 'ALL' ? `・${selectedKanaCol}` : ''}】
            </span>
          )}
          {selectedSegakiFilter !== 'all' && (
            <span className="px-1.5 py-0.2 bg-orange-600 text-white text-[10px] font-bold rounded-2xs">
              塔婆:{selectedSegakiFilter === 'checked' ? '申込済' : '未申込'}
            </span>
          )}
          {selectedTanagyoFilter !== 'all' && (
            <span className="px-1.5 py-0.2 bg-teal-700 text-white text-[10px] font-bold rounded-2xs">
              棚経:{selectedTanagyoFilter === 'checked' ? '対象' : '対象外'}
            </span>
          )}
          {selectedStatusFilter !== 'all' && (
            <span className="px-1.5 py-0.2 bg-emerald-700 text-white text-[10px] font-bold rounded-2xs">
              区分２:{selectedStatusFilter}
            </span>
          )}
        </div>
        {(searchQuery || selectedKanaRow !== 'all' || selectedTypeFilter !== 'all' || selectedStatusFilter !== 'all' || selectedDistrictFilter !== 'all' || selectedSegakiFilter !== 'all' || selectedTanagyoFilter !== 'all') && (
          <button
            type="button"
            onClick={() => {
              setSearchQuery('');
              setSelectedKanaRow('all');
              setSelectedTypeFilter('all');
              setSelectedStatusFilter('all');
              setSelectedDistrictFilter('all');
              setSelectedSegakiFilter('all');
              setSelectedTanagyoFilter('all');
            }}
            className="text-[#8C2D19] hover:underline text-xs font-bold cursor-pointer"
          >
            全条件クリア
          </button>
        )}
      </div>

      {/* Household Cards List */}
      <div className="space-y-2.5">
        {filteredHouseholds.length === 0 ? (
          <div className="p-8 text-center bg-white border border-[#D1CEC7] rounded-xs space-y-2">
            <Users className="w-8 h-8 text-gray-300 mx-auto" />
            <div className="text-xs font-bold text-gray-600">該当する世帯が見つかりません</div>
            <div className="text-[11px] text-gray-400">検索語句や絞り込み条件を変更してください</div>
          </div>
        ) : (
          filteredHouseholds.map((h) => {
            const isExpanded = expandedHouseholdId === h.id;
            const relPast = pastRecords.filter((p) => p.householdId === h.id);
            const relServices = memorialServices.filter((s) => s.householdId === h.id);
            const primaryPhone = h.phone || h.mobile;

            return (
              <div
                key={h.id}
                className="bg-white border border-[#D1CEC7] rounded-xs shadow-2xs overflow-hidden transition-all"
              >
                {/* Main Card Header (Click to expand) */}
                <div
                  onClick={() => toggleExpand(h.id)}
                  className="p-3.5 cursor-pointer hover:bg-[#FAF8F5] transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      {/* Sponsor & Furigana */}
                      {(() => {
                        const sp = getHouseholdSponsorInfo(h);
                        return (
                          <>
                            <div className="text-xs text-[#8C2D19] font-medium leading-tight">
                              {sp.furigana || '　'}
                            </div>
                            <div className="flex items-baseline gap-2">
                              <h3 className="text-lg font-black font-serif text-[#1A1A1A]">
                                {sp.sponsorName || '（施主未登録）'} <span className="text-sm font-normal text-gray-500">家</span>
                              </h3>
                              {h.tombNumber && (
                                <span className="text-xs font-bold text-gray-600 bg-stone-100 px-2 py-0.5 rounded-2xs border border-stone-200">
                                  墓: {h.tombNumber}
                                </span>
                              )}
                            </div>
                          </>
                        );
                      })()}

                      {/* Badges: Type, District, Status */}
                      <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                        <span className="px-2 py-0.5 bg-[#FAF0E6] text-[#8C2D19] text-xs font-bold rounded-2xs border border-[#8C2D19]/30">
                          {h.householdType || '一般檀家'}
                        </span>
                        {h.district && (
                          <span className="px-2 py-0.5 bg-stone-100 text-stone-700 text-xs font-bold rounded-2xs border border-stone-200">
                            {h.district}
                          </span>
                        )}
                        {h.status && (
                          <span className="px-2 py-0.5 bg-amber-100 text-amber-900 text-xs font-bold rounded-2xs">
                            {h.status}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Right Edit & Expand Icon */}
                    <div className="flex items-center gap-1.5 shrink-0 pt-1">
                      <button
                        type="button"
                        onClick={(e) => handleEdit(h, e)}
                        className="px-2.5 py-1.5 bg-[#FAF7F0] hover:bg-[#F0ECE1] text-[#8C2D19] border border-[#D4AF37]/60 rounded-xs cursor-pointer text-xs font-bold flex items-center gap-1 shadow-2xs"
                        title="世帯情報を編集"
                      >
                        <Edit className="w-4 h-4" />
                        <span>編集</span>
                      </button>
                      <div className="p-1 text-gray-400">
                        {isExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                      </div>
                    </div>
                  </div>

                  {/* Phone & Address Quick Actions */}
                  <div className="mt-2.5 pt-2.5 border-t border-[#F0ECE1] space-y-1.5 text-xs">
                    {/* Phone button */}
                    {primaryPhone ? (
                      <div className="flex items-center justify-between">
                        <a
                          href={`tel:${primaryPhone.replace(/[-\s]/g, '')}`}
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center gap-1.5 text-blue-700 hover:underline font-bold py-1.5 px-2.5 bg-blue-50 hover:bg-blue-100 rounded-xs border border-blue-200 text-xs"
                        >
                          <Phone className="w-4 h-4 text-blue-600" />
                          <span>{primaryPhone}</span>
                          <span className="text-xs text-blue-600 font-normal">（発信）</span>
                        </a>
                        {h.mobile && h.phone && (
                          <span className="text-xs text-gray-500">
                            他: {h.mobile}
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="text-xs text-gray-400 italic">電話番号未登録</div>
                    )}

                    {/* Address link with Google Maps */}
                    {h.address && (
                      <div className="flex items-start justify-between gap-1 pt-0.5">
                        <a
                          href={getGoogleMapsSearchUrl(h.address)}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-start gap-1 text-[#333333] hover:text-[#8C2D19] py-0.5 group"
                        >
                          <MapPin className="w-3.5 h-3.5 text-[#8C2D19] shrink-0 mt-0.5" />
                          <span className="group-hover:underline text-xs leading-snug">
                            {h.address}
                          </span>
                          <ExternalLink className="w-3.5 h-3.5 text-gray-400 shrink-0 mt-0.5" />
                        </a>
                      </div>
                    )}
                  </div>

                  {/* Spirits count chip */}
                  <div className="mt-2 flex items-center justify-between text-[11px] text-gray-500 bg-[#FAF8F5] p-1.5 rounded-xs border border-[#F0ECE1]">
                    <div className="flex items-center gap-1">
                      <BookOpen className="w-3.5 h-3.5 text-[#8C2D19]" />
                      <span>登録精霊: <strong className="text-[#1A1A1A]">{relPast.length}</strong> 霊</span>
                    </div>
                    {relPast.length > 0 && (
                      <span className="text-[10px] text-gray-500">
                        最新: {relPast[0]?.dharmaName || relPast[0]?.secularName}
                      </span>
                    )}
                  </div>
                </div>

                {/* Expanded Details Section */}
                {isExpanded && (
                  <div className="bg-[#FAF7F0] border-t border-[#D1CEC7] p-3 space-y-3 text-xs">
                    {/* Family Members list */}
                    {h.familyMembers && h.familyMembers.length > 0 && (
                      <div className="space-y-1">
                        <div className="font-bold text-[#1A1A1A] flex items-center gap-1 text-[11px]">
                          <Users className="w-3.5 h-3.5 text-[#8C2D19]" />
                          <span>家族構成:</span>
                        </div>
                        <div className="grid grid-cols-1 gap-1">
                          {h.familyMembers.map((m) => (
                            <div key={m.id} className="p-1.5 bg-white border border-[#E5E0D8] rounded-xs flex items-center justify-between text-[11px]">
                              <div>
                                <strong className="text-[#1A1A1A]">{m.name}</strong>
                                <span className="text-gray-500 ml-1">({m.relationship})</span>
                              </div>
                              {m.phone && (
                                <a
                                  href={`tel:${m.phone.replace(/[-\s]/g, '')}`}
                                  className="text-blue-600 hover:underline flex items-center gap-0.5 text-[10px]"
                                >
                                  <Phone className="w-3 h-3" />
                                  <span>{m.phone}</span>
                                </a>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Past Records of this Household */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <div className="font-bold text-[#8C2D19] flex items-center gap-1 text-[11px]">
                          <BookOpen className="w-3.5 h-3.5" />
                          <span>当家の過去帳・精霊 ({relPast.length}霊):</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => onOpenAddPastRecord(h.id)}
                          className="text-[10px] text-[#8C2D19] hover:underline font-bold bg-white px-2 py-0.5 border border-[#D4AF37] rounded-xs cursor-pointer flex items-center gap-0.5"
                        >
                          <Plus className="w-3 h-3" />
                          <span>精霊追加</span>
                        </button>
                      </div>

                      {relPast.length === 0 ? (
                        <div className="p-2 bg-white border border-stone-200 text-center text-gray-400 text-[11px] rounded-xs">
                          過去帳データが登録されていません
                        </div>
                      ) : (
                        <div className="space-y-1">
                          {relPast.map((p) => (
                            <div
                              key={p.id}
                              className="p-2 bg-white border border-stone-200 rounded-xs space-y-0.5"
                            >
                              <div className="flex items-start justify-between">
                                <div className="font-serif font-black text-xs text-[#8C2D19]">
                                  {p.dharmaName || '（戒名未登録）'}
                                </div>
                                {p.ageAtDeath && (
                                  <span className="text-[10px] text-gray-500 bg-stone-100 px-1 rounded-2xs">
                                    享年{p.ageAtDeath}歳
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-gray-600 flex items-center justify-between">
                                <span>俗名: <strong>{p.secularName || '未記入'}</strong> ({p.relationship || '精霊'})</span>
                                <span className="text-[10px] text-gray-500 font-bold">{p.deathDate ? `没: ${p.deathDate}` : '逆　修'}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Notes */}
                    {h.notes && (
                      <div className="p-2 bg-white border border-[#E5E0D8] rounded-xs">
                        <div className="text-[10px] font-bold text-gray-500 mb-0.5">特記事項・備考:</div>
                        <div className="text-[11px] text-[#333333] whitespace-pre-wrap">{h.notes}</div>
                      </div>
                    )}

                    {/* Action buttons footer inside expanded card */}
                    <div className="pt-2 border-t border-[#E5E0D8] flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onOpenAddService(h.id)}
                        className="flex-1 py-2 bg-[#8C2D19] hover:bg-[#732414] text-white rounded-xs font-bold text-xs flex items-center justify-center gap-1 shadow-xs cursor-pointer"
                      >
                        <CalendarIcon className="w-3.5 h-3.5" />
                        <span>法事・予定を予約</span>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleEdit(h, e)}
                        className="py-2 px-3 bg-white hover:bg-gray-50 text-[#333333] border border-[#D1CEC7] rounded-xs font-bold text-xs flex items-center gap-1 cursor-pointer"
                      >
                        <Edit className="w-3.5 h-3.5" />
                        <span>世帯編集</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Household Edit/Add Modal */}
      <MobileHouseholdModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        household={editingHousehold}
        masterOptions={masterOptions}
        temples={temples}
        activeTempleId={activeTempleId}
        existingHouseholds={households}
        onSave={onSaveHousehold}
        onDelete={onDeleteHousehold}
      />
    </div>
  );
};
