import React, { useState, useMemo } from 'react';
import { PastRecord, Household, TempleProfile } from '../../types';
import { 
  Search, 
  Plus, 
  BookOpen, 
  Calendar as CalendarIcon, 
  Edit, 
  X,
  Sparkles,
  Layers
} from 'lucide-react';
import { MobileKakochoModal } from './MobileKakochoModal';
import { getTodayDateString } from '../../utils/calendarUtils';
import { 
  calculateYearlyMemorialSpirits, 
  getJapaneseEra, 
  formatJapaneseEraDate,
  getNextUpcomingMemorialForSpirit,
  getHouseholdSponsorName
} from '../../utils/memorialCalculator';

interface MobileKakochoViewProps {
  pastRecords: PastRecord[];
  households: Household[];
  temples?: TempleProfile[];
  activeTempleId?: string;
  onSelectTemple?: (templeId: string) => void;
  onSavePastRecord: (record: PastRecord) => void;
  onDeletePastRecord: (id: string) => void;
  onOpenAddServiceFromSpirit: (record: PastRecord) => void;
  isStaffMode?: boolean;
}

export const MobileKakochoView: React.FC<MobileKakochoViewProps> = ({
  pastRecords = [],
  households = [],
  temples = [],
  activeTempleId = 'temple-main',
  onSelectTemple,
  onSavePastRecord,
  onDeletePastRecord,
  onOpenAddServiceFromSpirit,
  isStaffMode = false,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [quickFilter, setQuickFilter] = useState<'all' | 'this_month' | 'today' | 'milestone'>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<PastRecord | null>(null);
  const [initialHhIdForNew, setInitialHhIdForNew] = useState<string | undefined>(undefined);

  const todayStr = getTodayDateString();
  const currentMonthStr = todayStr.slice(5, 7); // "08"
  const currentDayStr = todayStr.slice(8, 10);   // "18"
  const currentYear = parseInt(todayStr.slice(0, 4), 10);
  const currentEra = getJapaneseEra(currentYear);

  // Calculate accurate yearly memorial spirits (四十九日・百ヶ日・一周忌・三回忌...) for current year
  const yearlySpiritsForCurrentYear = useMemo(() => {
    return calculateYearlyMemorialSpirits(pastRecords, currentYear);
  }, [pastRecords, currentYear]);

  // Map of record.id -> YearlyMemorialSpirit[] for current year
  const yearlySpiritsMap = useMemo(() => {
    const map = new Map<string, typeof yearlySpiritsForCurrentYear>();
    yearlySpiritsForCurrentYear.forEach((item) => {
      const list = map.get(item.record.id) || [];
      list.push(item);
      map.set(item.record.id, list);
    });
    return map;
  }, [yearlySpiritsForCurrentYear]);

  // Filtered past records
  const filteredRecords = useMemo(() => {
    return pastRecords.filter((p) => {
      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchDharma = p.dharmaName?.toLowerCase().includes(q);
        const matchSecular = p.secularName?.toLowerCase().includes(q);
        const matchHead = p.householdHeadName?.toLowerCase().includes(q);
        const matchNotes = p.notes?.toLowerCase().includes(q);
        const matchDeath = p.deathDate?.includes(q);
        const matchBurial = p.burialLocation?.toLowerCase().includes(q);

        if (!matchDharma && !matchSecular && !matchHead && !matchNotes && !matchDeath && !matchBurial) {
          return false;
        }
      }

      // Quick filter
      if (quickFilter === 'this_month') {
        if (!p.deathDate) return false;
        const deathMonth = p.deathDate.split(/[\/\-]/)[1]?.padStart(2, '0');
        if (deathMonth !== currentMonthStr) return false;
      } else if (quickFilter === 'today') {
        if (!p.deathDate) return false;
        const parts = p.deathDate.split(/[\/\-]/);
        const deathMonth = parts[1]?.padStart(2, '0');
        const deathDay = parts[2]?.padStart(2, '0');
        if (deathMonth !== currentMonthStr || deathDay !== currentDayStr) return false;
      } else if (quickFilter === 'milestone') {
        const spiritMilestones = yearlySpiritsMap.get(p.id);
        if (!spiritMilestones || spiritMilestones.length === 0) return false;
      }

      return true;
    }).sort((a, b) => {
      // Sort by death date descending
      return (b.deathDate || '').localeCompare(a.deathDate || '');
    });
  }, [pastRecords, searchQuery, quickFilter, currentMonthStr, currentDayStr, yearlySpiritsMap]);

  const handleEdit = (r: PastRecord) => {
    setEditingRecord(r);
    setInitialHhIdForNew(undefined);
    setIsModalOpen(true);
  };

  const handleAddNew = () => {
    setEditingRecord(null);
    setInitialHhIdForNew(undefined);
    setIsModalOpen(true);
  };

  return (
    <div className="space-y-2 p-2.5 sm:p-3 pb-24">
      {/* Compact Search & Quick Filter */}
      <div className="bg-white border border-[#D1CEC7] rounded-xs p-2.5 space-y-2 shadow-2xs">
        {/* Search Bar & Add Button */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4.5 h-4.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="戒名、俗名、施主名、命日で検索..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-8 py-2.5 bg-[#FAF8F5] border border-[#D1CEC7] rounded-xs text-sm sm:text-base font-medium placeholder:text-gray-400 focus:border-[#8C2D19] focus:bg-white focus:outline-hidden"
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
          {!isStaffMode && (
            <button
              type="button"
              onClick={handleAddNew}
              className="px-3.5 py-2 bg-[#8C2D19] hover:bg-[#732414] active:bg-[#5C1D10] text-white rounded-xs text-xs sm:text-sm font-bold flex items-center gap-1.5 shadow-xs shrink-0 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>精霊登録</span>
            </button>
          )}
        </div>

        {/* Quick Filter Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar text-xs sm:text-sm">
          <button
            type="button"
            onClick={() => setQuickFilter('all')}
            className={`px-3 py-1.5 rounded-xs font-bold shrink-0 cursor-pointer border text-xs sm:text-sm ${
              quickFilter === 'all'
                ? 'bg-[#1A1A1A] text-[#D4AF37] border-[#1A1A1A]'
                : 'bg-[#FAF8F5] text-gray-700 border-[#D1CEC7]'
            }`}
          >
            全精霊 ({pastRecords.length})
          </button>
          <button
            type="button"
            onClick={() => setQuickFilter('this_month')}
            className={`px-3 py-1.5 rounded-xs font-bold shrink-0 cursor-pointer border text-xs sm:text-sm ${
              quickFilter === 'this_month'
                ? 'bg-[#8C2D19] text-white border-[#8C2D19]'
                : 'bg-[#FAF8F5] text-gray-700 border-[#D1CEC7]'
            }`}
          >
            今月の祥月命日 ({parseInt(currentMonthStr, 10)}月)
          </button>
          <button
            type="button"
            onClick={() => setQuickFilter('today')}
            className={`px-3 py-1.5 rounded-xs font-bold shrink-0 cursor-pointer border text-xs sm:text-sm ${
              quickFilter === 'today'
                ? 'bg-[#8C2D19] text-white border-[#8C2D19]'
                : 'bg-[#FAF8F5] text-gray-700 border-[#D1CEC7]'
            }`}
          >
            本日の命日 ({parseInt(currentDayStr, 10)}日)
          </button>
          <button
            type="button"
            onClick={() => setQuickFilter('milestone')}
            className={`px-3 py-1.5 rounded-xs font-bold shrink-0 cursor-pointer border flex items-center gap-1 text-xs sm:text-sm ${
              quickFilter === 'milestone'
                ? 'bg-[#2D3748] text-white border-[#2D3748]'
                : 'bg-[#FAF8F5] text-gray-700 border-[#D1CEC7]'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>今年年回忌 ({currentYear}年)</span>
          </button>
        </div>
      </div>

      {/* Count Summary */}
      <div className="px-1 flex items-center justify-between text-xs sm:text-sm text-gray-500 font-medium">
        <span>表示中: <strong className="text-[#1A1A1A] font-bold text-sm sm:text-base">{filteredRecords.length}</strong> 霊</span>
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="text-[#8C2D19] hover:underline text-xs sm:text-sm font-bold cursor-pointer"
          >
            検索をクリア
          </button>
        )}
      </div>

      {/* Cards List: High density, clear hierarchy, 1-line secular info */}
      <div className="space-y-2">
        {filteredRecords.length === 0 ? (
          <div className="p-8 text-center bg-white border border-[#D1CEC7] rounded-xs space-y-2">
            <BookOpen className="w-8 h-8 text-gray-300 mx-auto" />
            <div className="text-xs font-bold text-gray-600">過去帳データが見つかりません</div>
            <div className="text-[11px] text-gray-400">検索条件や絞り込みを変更してください</div>
          </div>
        ) : (
          filteredRecords.map((p) => {
            const hh = households.find((h) => h.id === p.householdId);
            // 施主名は必ず「当時の施主名」を表示
            const originalHeadName = p.householdHeadName?.trim() || (hh ? (getHouseholdSponsorName(hh) || hh.familyHead) : '') || '';
            const cleanHeadName = originalHeadName.replace(/(家|様)+$/, '').trim() || '当時の施主未定';

            // 1. 命日 (和暦) & 忌日 (現在の日付から一番先にくる直近未来の忌日・年忌を1つだけ表記)
            const eraDeathDate = p.deathDate ? formatJapaneseEraDate(p.deathDate, false) : '逆　修';
            const nextMemorial = p.deathDate ? getNextUpcomingMemorialForSpirit(p.deathDate, todayStr) : null;
            let milestoneSnippet = '';
            if (nextMemorial) {
              const isSameYear = nextMemorial.scheduledDate.startsWith(String(currentYear));
              const dateBadge = isSameYear 
                ? ` ${nextMemorial.month}/${nextMemorial.day}`
                : ` (${nextMemorial.scheduledDate})`;
              milestoneSnippet = `${nextMemorial.memorialType}${dateBadge}`;
            }

            // 2. 当時の施主名 続柄 俗名 年齢 (1行でスペース区切り)
            const secularLine = [
              cleanHeadName,
              p.relationship || '精霊',
              p.secularName || '俗名未入力',
              p.ageAtDeath ? `${p.ageAtDeath}歳` : '',
            ].filter(Boolean).join('　');

            return (
              <div
                key={p.id}
                className="bg-white border border-[#D1CEC7] rounded-xs p-3 sm:p-3.5 shadow-2xs space-y-2"
              >
                {/* 1行目: 戒名（大きめ太字毛筆）と 右側編集/予定追加アクション */}
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-xl font-black font-serif text-[#1A1A1A] leading-tight break-all">
                    {p.dharmaName || '（戒名未登録）'}
                  </h3>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => onOpenAddServiceFromSpirit(p)}
                      className="px-2.5 py-1.5 bg-[#FAF7F0] hover:bg-[#F0EAE0] text-[#8C2D19] border border-[#D4AF37]/60 rounded-xs text-xs sm:text-sm font-bold flex items-center gap-1.5 cursor-pointer shadow-2xs"
                      title="法要・予定を入力"
                    >
                      <CalendarIcon className="w-4 h-4" />
                      <span>予定入力</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleEdit(p)}
                      className="px-2.5 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-300 rounded-xs text-xs sm:text-sm font-bold flex items-center gap-1.5 cursor-pointer shadow-2xs"
                      title="過去帳を編集"
                    >
                      <Edit className="w-4 h-4" />
                      <span>編集</span>
                    </button>
                  </div>
                </div>

                {/* 2行目: 命日（和暦）　忌日（1つだけ） */}
                <div className="text-sm sm:text-base font-medium text-gray-800 flex items-center gap-2 flex-wrap leading-tight">
                  <span>{eraDeathDate}</span>
                  {milestoneSnippet && (
                    <span className="text-xs font-bold text-[#8C2D19] bg-[#FAF5F0] border border-[#E8D8C8] px-2 py-0.5 rounded-2xs">
                      {milestoneSnippet}
                    </span>
                  )}
                </div>

                {/* 3行目: 施主名 続柄 俗名 年齢 (1行) */}
                <div className="text-sm sm:text-base font-bold text-gray-700 leading-tight break-all">
                  {secularLine}
                </div>

                {/* 墓地・備考 (ある場合のみ超コンパクトに1行) */}
                {(p.burialLocation || p.notes) && (
                  <div className="pt-1.5 text-xs sm:text-sm text-gray-600 flex items-center gap-2 flex-wrap border-t border-gray-100">
                    {p.burialLocation && <span>📍 {p.burialLocation}</span>}
                    {p.notes && <span>💬 {p.notes}</span>}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Kakocho Modal */}
      <MobileKakochoModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        record={editingRecord}
        households={households}
        temples={temples}
        activeTempleId={activeTempleId}
        onSave={onSavePastRecord}
        onDelete={isStaffMode ? undefined : onDeletePastRecord}
        initialHouseholdId={initialHhIdForNew}
      />
    </div>
  );
};
