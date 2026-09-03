import React, { useState, useMemo } from 'react';
import { MemorialService, Household, PastRecord, TempleProfile, TempleTodo } from '../../types';
import { 
  Calendar as CalendarIcon, 
  Clock, 
  MapPin, 
  Phone, 
  Plus, 
  ChevronLeft, 
  ChevronRight, 
  Edit, 
  ListFilter, 
  ExternalLink,
  Users,
  BookOpen,
  CheckCircle2,
  Building2,
  Layers,
  Trash2,
  AlertTriangle,
  X
} from 'lucide-react';
import { MobileServiceModal } from './MobileServiceModal';
import { getTodayDateString, getGoogleMapsSearchUrl, getRokuyo, generateGoogleCalendarUrl } from '../../utils/calendarUtils';
import { extractServiceTobaLines } from '../ReservationCalendarManager';

interface MobileCalendarViewProps {
  memorialServices: MemorialService[];
  households: Household[];
  pastRecords: PastRecord[];
  temples?: TempleProfile[];
  activeTempleId?: string;
  onSelectTemple?: (templeId: string) => void;
  templeTodos?: TempleTodo[];
  onSaveService: (service: MemorialService) => void;
  onSaveTodo?: (todo: TempleTodo) => void;
  onDeleteService: (id: string) => void;
  initialTargetDate?: string;
}

export const MobileCalendarView: React.FC<MobileCalendarViewProps> = ({
  memorialServices = [],
  households = [],
  pastRecords = [],
  temples = [],
  activeTempleId = 'temple-main',
  onSelectTemple,
  templeTodos = [],
  onSaveService,
  onSaveTodo,
  onDeleteService,
  initialTargetDate,
}) => {
  const todayStr = getTodayDateString('-'); // "YYYY-MM-DD"
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    return initialTargetDate ? initialTargetDate.replace(/\//g, '-') : todayStr;
  });
  const [currentYearMonth, setCurrentYearMonth] = useState<string>(() => {
    const base = initialTargetDate ? initialTargetDate.replace(/\//g, '-') : todayStr;
    return base.slice(0, 7); // "YYYY-MM"
  });
  const [viewMode, setViewMode] = useState<'calendar' | 'timeline'>('calendar');

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingService, setEditingService] = useState<MemorialService | null>(null);
  const [modalInitialDate, setModalInitialDate] = useState<string>(todayStr);
  const [deleteConfirmService, setDeleteConfirmService] = useState<MemorialService | null>(null);

  // Helper to normalize any date string to YYYY-MM-DD
  const normalizeDateKey = (d?: string): string => {
    if (!d) return '';
    return d.replace(/\//g, '-').trim();
  };

  // Parse Year and Month safely supporting both '-' and '/'
  const [year, month] = useMemo(() => {
    const parts = (currentYearMonth || '').split(/[-/]/);
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    const now = new Date();
    return [!isNaN(y) && y > 1900 ? y : now.getFullYear(), !isNaN(m) && m >= 1 && m <= 12 ? m : now.getMonth() + 1];
  }, [currentYearMonth]);

  // Calendar grid calculations
  const calendarDays = useMemo(() => {
    const firstDayIndex = new Date(year, month - 1, 1).getDay(); // 0 is Sunday
    const totalDaysInMonth = new Date(year, month, 0).getDate();
    const days = [];

    // Empty slots before 1st of month
    for (let i = 0; i < firstDayIndex; i++) {
      days.push(null);
    }

    const normToday = normalizeDateKey(todayStr);
    const normSelected = normalizeDateKey(selectedDate);

    // Days of the month
    for (let d = 1; d <= totalDaysInMonth; d++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const count = memorialServices.filter((s) => normalizeDateKey(s.scheduledDate) === dateStr).length;

      days.push({
        dayNum: d,
        dateStr,
        isToday: dateStr === normToday,
        isSelected: dateStr === normSelected,
        rokuyo: getRokuyo(dateStr),
        serviceCount: count,
      });
    }

    return days;
  }, [year, month, todayStr, selectedDate, memorialServices]);

  // Next / Prev Month
  const handlePrevMonth = () => {
    if (month === 1) {
      setCurrentYearMonth(`${year - 1}-12`);
    } else {
      setCurrentYearMonth(`${year}-${String(month - 1).padStart(2, '0')}`);
    }
  };

  const handleNextMonth = () => {
    if (month === 12) {
      setCurrentYearMonth(`${year + 1}-01`);
    } else {
      setCurrentYearMonth(`${year}-${String(month + 1).padStart(2, '0')}`);
    }
  };

  const handleTodayClick = () => {
    const curToday = getTodayDateString('-');
    setCurrentYearMonth(curToday.slice(0, 7));
    setSelectedDate(curToday);
  };

  // Selected date services
  const selectedDateServices = useMemo(() => {
    const targetNorm = normalizeDateKey(selectedDate);
    return memorialServices
      .filter((s) => normalizeDateKey(s.scheduledDate) === targetNorm)
      .sort((a, b) => (a.scheduledTime || '00:00').localeCompare(b.scheduledTime || '00:00'));
  }, [memorialServices, selectedDate]);

  // Upcoming Timeline services
  const upcomingServices = useMemo(() => {
    const todayNorm = normalizeDateKey(todayStr);
    return [...memorialServices]
      .filter((s) => normalizeDateKey(s.scheduledDate) >= todayNorm)
      .sort((a, b) => {
        const dateCompare = normalizeDateKey(a.scheduledDate).localeCompare(normalizeDateKey(b.scheduledDate));
        if (dateCompare !== 0) return dateCompare;
        return (a.scheduledTime || '00:00').localeCompare(b.scheduledTime || '00:00');
      });
  }, [memorialServices, todayStr]);

  const handleAddNew = (date?: string) => {
    setEditingService(null);
    setModalInitialDate(date || selectedDate || todayStr);
    setIsModalOpen(true);
  };

  const handleEdit = (s: MemorialService) => {
    setEditingService(s);
    setModalInitialDate(s.scheduledDate || todayStr);
    setIsModalOpen(true);
  };

  return (
    <div className="space-y-3 p-3 pb-24">
      {/* Top Controls: View Switch & Add Button (Clean, Non-overlapping) */}
      <div className="bg-white border border-[#D1CEC7] rounded-xs p-2.5 flex items-center justify-between gap-2 shadow-2xs">
        {/* Toggle Calendar / Timeline */}
        <div className="flex bg-[#EBE7DF] p-1 rounded-xs border border-[#D1CEC7] text-xs font-bold">
          <button
            type="button"
            onClick={() => setViewMode('calendar')}
            className={`px-3 py-1.5 rounded-2xs cursor-pointer flex items-center gap-1.5 transition-colors text-xs ${
              viewMode === 'calendar'
                ? 'bg-white text-[#8C2D19] shadow-2xs font-black'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <CalendarIcon className="w-4 h-4" />
            <span>月別カレンダー</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('timeline')}
            className={`px-3 py-1.5 rounded-2xs cursor-pointer flex items-center gap-1.5 transition-colors text-xs ${
              viewMode === 'timeline'
                ? 'bg-white text-[#8C2D19] shadow-2xs font-black'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <ListFilter className="w-4 h-4" />
            <span>予定一覧</span>
          </button>
        </div>

        {/* Add Service Button */}
        <button
          type="button"
          onClick={() => handleAddNew()}
          className="px-3.5 py-2 bg-[#8C2D19] hover:bg-[#732414] active:bg-[#5C1D10] text-white rounded-xs text-xs font-bold flex items-center gap-1.5 shadow-xs shrink-0 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>予定入力</span>
        </button>
      </div>

      {/* Calendar View Mode */}
      {viewMode === 'calendar' && (
        <div className="space-y-3">
          {/* Month Navigation Card */}
          <div className="bg-white border border-[#D1CEC7] rounded-xs shadow-2xs p-3.5">
            <div className="flex items-center justify-between mb-3">
              <button
                type="button"
                onClick={handlePrevMonth}
                className="p-2 bg-[#FAF8F5] hover:bg-[#EBE7DF] border border-[#D1CEC7] rounded-xs text-gray-700 cursor-pointer"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>

              <div className="text-center">
                <h3 className="text-base font-black font-serif text-[#1A1A1A]">
                  {year}年 {month}月
                </h3>
                <button
                  type="button"
                  onClick={handleTodayClick}
                  className="text-xs text-[#8C2D19] hover:underline font-bold mt-0.5 cursor-pointer"
                >
                  今日に戻る ({todayStr})
                </button>
              </div>

              <button
                type="button"
                onClick={handleNextMonth}
                className="p-2 bg-[#FAF8F5] hover:bg-[#EBE7DF] border border-[#D1CEC7] rounded-xs text-gray-700 cursor-pointer"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>

            {/* Weekday headers */}
            <div className="grid grid-cols-7 text-center font-bold text-xs mb-1.5">
              <span className="text-[#B91C1C]">日</span>
              <span className="text-gray-700">月</span>
              <span className="text-gray-700">火</span>
              <span className="text-gray-700">水</span>
              <span className="text-gray-700">木</span>
              <span className="text-gray-700">金</span>
              <span className="text-blue-600">土</span>
            </div>

            {/* Calendar Grid */}
            <div className="grid grid-cols-7 gap-1">
              {calendarDays.map((d, index) => {
                if (!d) {
                  return <div key={`empty-${index}`} className="h-13 bg-gray-50/50 rounded-2xs" />;
                }

                const dayOfWeek = (index) % 7;
                const isSunday = dayOfWeek === 0;
                const isSaturday = dayOfWeek === 6;

                return (
                  <button
                    key={d.dateStr}
                    type="button"
                    onClick={() => setSelectedDate(d.dateStr)}
                    className={`h-13 p-1 rounded-xs flex flex-col items-center justify-between cursor-pointer border transition-all relative ${
                      d.isSelected
                        ? 'bg-[#8C2D19] text-white border-[#8C2D19] shadow-xs'
                        : d.isToday
                        ? 'bg-[#FFF8EE] border-[#D4AF37] font-black'
                        : 'bg-white border-[#E5E0D8] hover:bg-stone-50'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full px-0.5">
                      <span
                        className={`text-xs font-bold ${
                          d.isSelected
                            ? 'text-white'
                            : isSunday
                            ? 'text-[#B91C1C]'
                            : isSaturday
                            ? 'text-blue-600'
                            : 'text-gray-800'
                        }`}
                      >
                        {d.dayNum}
                      </span>
                      <span
                        className={`text-[9px] font-normal leading-none ${
                          d.isSelected ? 'text-amber-200' : 'text-gray-400'
                        }`}
                      >
                        {d.rokuyo?.slice(0, 1) || ''}
                      </span>
                    </div>

                    {/* Dots / Badge for services on this day */}
                    {d.serviceCount > 0 && (
                      <div className="w-full pb-0.5 flex items-center justify-center">
                        <span
                          className={`px-1.5 py-0.2 text-[9px] font-black rounded-full leading-tight ${
                            d.isSelected
                              ? 'bg-white text-[#8C2D19]'
                              : 'bg-[#8C2D19] text-white'
                          }`}
                        >
                          {d.serviceCount}件
                        </span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Selected Date Details Header & Service List */}
          <div className="space-y-2">
            <div className="flex items-center justify-between bg-[#1A1A1A] text-white px-3.5 py-2.5 rounded-xs border-b border-[#D4AF37]">
              <div className="flex items-center gap-2 text-sm font-bold">
                <CalendarIcon className="w-4 h-4 text-[#D4AF37]" />
                <span>{selectedDate} の予定 ({getRokuyo(selectedDate)})</span>
              </div>
              <button
                type="button"
                onClick={() => handleAddNew(selectedDate)}
                className="text-xs font-bold text-[#D4AF37] hover:underline flex items-center gap-0.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>この日に入力</span>
              </button>
            </div>

            {selectedDateServices.length === 0 ? (
              <div className="p-6 bg-white border border-[#D1CEC7] rounded-xs text-center text-gray-500 text-sm space-y-1.5">
                <div>この日の法要・予定はありません</div>
                <button
                  type="button"
                  onClick={() => handleAddNew(selectedDate)}
                  className="text-sm text-[#8C2D19] font-bold underline mt-1 cursor-pointer"
                >
                  ＋ 予定・法事を入力する
                </button>
              </div>
            ) : (
              <div className="space-y-2.5">
                {selectedDateServices.map((service) => (
                  <ServiceCard
                    key={service.id}
                    service={service}
                    households={households}
                    pastRecords={pastRecords}
                    temples={temples}
                    templeTodos={templeTodos}
                    memorialServices={memorialServices}
                    onEdit={() => handleEdit(service)}
                    onDelete={() => setDeleteConfirmService(service)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Timeline View Mode (Upcoming Services) */}
      {viewMode === 'timeline' && (
        <div className="px-3 space-y-2.5">
          <div className="text-xs font-bold text-gray-500">
            本日以降の法要・予定一覧 ({upcomingServices.length}件):
          </div>

          {upcomingServices.length === 0 ? (
            <div className="p-8 text-center bg-white border border-[#D1CEC7] rounded-xs space-y-2">
              <CalendarIcon className="w-8 h-8 text-gray-300 mx-auto" />
              <div className="text-xs font-bold text-gray-600">今後の予定はありません</div>
            </div>
          ) : (
            upcomingServices.map((service) => (
              <ServiceCard
                key={service.id}
                service={service}
                households={households}
                pastRecords={pastRecords}
                temples={temples}
                templeTodos={templeTodos}
                memorialServices={memorialServices}
                onEdit={() => handleEdit(service)}
                onDelete={() => setDeleteConfirmService(service)}
                showDate
              />
            ))
          )}
        </div>
      )}

      {/* Service Modal */}
      <MobileServiceModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        service={editingService}
        households={households}
        pastRecords={pastRecords}
        temples={temples}
        activeTempleId={activeTempleId}
        onSave={onSaveService}
        onSaveTodo={onSaveTodo}
        onDelete={onDeleteService}
        initialDate={modalInitialDate}
      />

      {/* Delete Confirmation Modal */}
      {deleteConfirmService && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-[#D1CEC7] rounded-xs shadow-xl max-w-sm w-full p-4 space-y-3.5">
            <div className="flex items-center gap-2 text-red-600 font-bold text-sm">
              <AlertTriangle className="w-5 h-5" />
              <span>予定の削除確認</span>
            </div>
            <p className="text-xs text-gray-600 leading-relaxed">
              「<strong>{deleteConfirmService.memorialType}</strong>（{deleteConfirmService.chiefMourner?.replace(/(家|様)+$/g, '') || ''}）」の予定を削除してもよろしいですか？
            </p>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#EBE5DA]">
              <button
                type="button"
                onClick={() => setDeleteConfirmService(null)}
                className="px-3 py-1.5 bg-gray-100 text-gray-700 text-xs font-bold rounded-xs hover:bg-gray-200 cursor-pointer"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={() => {
                  if (deleteConfirmService) {
                    onDeleteService(deleteConfirmService.id);
                    setDeleteConfirmService(null);
                  }
                }}
                className="px-4 py-1.5 bg-red-600 text-white text-xs font-bold rounded-xs hover:bg-red-700 cursor-pointer"
              >
                削除する
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Subcomponent: Service Card with Simple, Bold Serif Deceased/Mourner Info and Vertical Toba Lines
interface ServiceCardProps {
  service: MemorialService;
  households: Household[];
  pastRecords?: PastRecord[];
  temples: TempleProfile[];
  templeTodos?: TempleTodo[];
  memorialServices?: MemorialService[];
  onEdit: () => void;
  onDelete: () => void;
  showDate?: boolean;
}

const ServiceCard: React.FC<ServiceCardProps> = ({
  service,
  households,
  pastRecords = [],
  temples,
  templeTodos = [],
  memorialServices = [],
  onEdit,
  onDelete,
  showDate = false,
}) => {
  const hh = households.find((h) => h.id === service.householdId);
  const targetTempleId = service.templeId || hh?.templeId;
  const matchedTemple = temples.find((t) => t.id === targetTempleId) || temples.find((t) => t.isMain) || temples[0];
  const isAffiliated = matchedTemple?.isAffiliated || (targetTempleId && targetTempleId !== 'temple-main' && !matchedTemple?.isMain);

  const isFuneral = ['通夜', '葬儀', '枕経', '葬儀・枕経', '通夜・葬儀'].includes(service.memorialType || '');
  const isOther = service.memorialType === 'その他' || ['その他', '寺院行事', '会合', '来客', '法務その他'].includes(service.memorialType || '');

  // 塔婆明細抽出 (ToDoと同じ明細から抽出)
  const serviceTobaLines = isOther || isFuneral ? [] : extractServiceTobaLines(service, pastRecords, templeTodos, memorialServices);

  const isToba = Boolean(
    service.memorialType === '塔婆供養' ||
    service.memorialType === '塔婆' ||
    service.memorialType === '塔婆依頼' ||
    (service.memorialType && service.memorialType.includes('塔婆')) ||
    ((service.tobaCount || 0) > 0 && (!service.attendeeCount || service.attendeeCount === 0) && (!service.venue || service.venue === '本堂' || service.venue === '') && !isFuneral && !isOther) ||
    (serviceTobaLines.length > 0 && (!service.attendeeCount || service.attendeeCount === 0) && (!service.venue || service.venue === '本堂' || service.venue === '') && !isFuneral && !isOther)
  );

  const displayVenue = (service.venue || '').trim();
  const searchAddress = (service.address || '').trim() || displayVenue;
  const mapUrl = searchAddress ? getGoogleMapsSearchUrl(searchAddress) : null;

  // 施主名から「様」「家」を削除
  const cleanChiefMourner = (service.chiefMourner || hh?.familyHead || '')
    .replace(/(家|様)+$/g, '')
    .trim();

  // 俗名の取得 (service.deceasedName または pastRecordsから照合)
  const matchedPast = pastRecords.find((p) => 
    (service.deceasedId && p.id === service.deceasedId) || 
    (service.dharmaName && p.dharmaName && p.dharmaName.trim() === service.dharmaName.trim() && (!service.householdId || p.householdId === service.householdId)) ||
    (service.dharmaName && p.dharmaName && p.dharmaName.trim() === service.dharmaName.trim())
  );
  let rawSecularName = (service.deceasedName || matchedPast?.secularName || matchedPast?.deceasedName || '').trim();
  rawSecularName = rawSecularName.replace(/^(俗名[:：\s]*|故[\s　]*)/, '').trim();
  const hasDharmaName = Boolean(service.dharmaName && service.dharmaName.trim());
  const displaySecular = hasDharmaName && rawSecularName && rawSecularName !== service.dharmaName.trim() ? rawSecularName : '';

  // メイン精霊と回忌
  const mainDharma = service.dharmaName || (service.deceasedName ? `俗名: ${service.deceasedName}` : (service.notes || ''));
  const mainMemType = service.memorialType || '';

  return (
    <div
      className="border p-3.5 space-y-2 hover:border-[#D4AF37] transition-all rounded-xs bg-[#FAFAF8] border-[#D1CEC7]"
    >
      {/* 1行目: 時間（シンプル黒文字）、寺院表記、編集、削除 */}
      <div className="flex items-center justify-between gap-2 flex-wrap pb-1 border-b border-[#EBE5DA]">
        <div className="flex items-center gap-2 flex-wrap">
          {showDate && (
            <span className="font-black text-[#8C2D19] text-xs font-sans">
              {service.scheduledDate} ({getRokuyo(service.scheduledDate)})
            </span>
          )}
          <span className="font-bold text-gray-900 text-sm sm:text-base font-sans">
            {service.scheduledTime === '終日' || service.isAllDay
              ? '【終日】'
              : `${service.scheduledTime || '時間未定'}〜${service.endTime || ''}`}
          </span>
          {isAffiliated && (
            <span className="text-xs font-bold px-2 py-0.5 font-sans bg-gray-100 text-gray-800 border border-gray-300 rounded-2xs">
              【兼務寺: {matchedTemple?.name || '兼務寺'}】
            </span>
          )}
          {!isAffiliated && temples.length > 1 && (
            <span className="text-xs font-bold px-2 py-0.5 font-sans bg-amber-100 text-amber-900 border border-amber-300 rounded-2xs">
              【本寺: {matchedTemple?.name || '本寺'}】
            </span>
          )}
        </div>

        <div className="flex items-center space-x-1.5 font-sans text-xs ml-auto">
          <button
            type="button"
            onClick={onEdit}
            className="p-1 text-gray-600 hover:text-[#8C2D19] cursor-pointer"
            title="編集"
          >
            <Edit className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="p-1 text-gray-400 hover:text-red-600 cursor-pointer"
            title="削除"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 2行目: 赤色文字のイベント題名 (塔婆のみの場合は非表示) */}
      {!isToba && (
        <div className="space-y-1 py-0.5">
          {isFuneral ? (
            <div className="font-serif font-black text-lg sm:text-xl text-[#8C2D19] leading-snug tracking-wide">
              {service.memorialType || '葬儀'}　施主　{cleanChiefMourner || '施主未定'}
            </div>
          ) : isOther ? (
            <div className="font-serif font-black text-lg sm:text-xl text-[#8C2D19] leading-snug tracking-wide">
              {cleanChiefMourner || service.notes || service.memorialType || 'その他予定'}
            </div>
          ) : (
            <div className="font-serif font-black text-lg sm:text-xl text-[#8C2D19] leading-snug tracking-wide">
              <div className="flex items-baseline flex-wrap gap-x-1.5">
                <span>{mainDharma}</span>
                {displaySecular && (
                  <span className="text-sm sm:text-base font-normal font-serif text-[#8C2D19]/90">
                    （故　{displaySecular}）
                  </span>
                )}
              </div>
              {(mainMemType || cleanChiefMourner) && (
                <div className="text-base sm:text-lg font-bold text-[#8C2D19] mt-0.5 flex items-baseline flex-wrap gap-x-2.5">
                  {mainMemType && <span>{mainMemType}</span>}
                  {cleanChiefMourner && <span>施主　{cleanChiefMourner}</span>}
                </div>
              )}
            </div>
          )}

          {!isFuneral && !isOther && service.additionalDeceased && service.additionalDeceased.length > 0 && (
            <div className="space-y-0.5 pt-0.5">
              {service.additionalDeceased.map((sub, idx) => {
                const subPast = pastRecords.find((p) =>
                  (sub.id && p.id === sub.id) ||
                  (sub.dharmaName && p.dharmaName && p.dharmaName.trim() === sub.dharmaName.trim() && (!service.householdId || p.householdId === service.householdId)) ||
                  (sub.dharmaName && p.dharmaName && p.dharmaName.trim() === sub.dharmaName.trim())
                );
                let subSecular = (sub.deceasedName || subPast?.secularName || subPast?.deceasedName || '').trim();
                subSecular = subSecular.replace(/^(俗名[:：\s]*|故[\s　]*)/, '').trim();
                const hasSubDharma = Boolean(sub.dharmaName && sub.dharmaName.trim());
                const displaySubSecular = hasSubDharma && subSecular && subSecular !== sub.dharmaName?.trim() ? subSecular : '';

                return (
                  <div key={sub.id || idx} className="font-serif font-bold text-base sm:text-lg text-[#8C2D19]/90 leading-snug tracking-wide">
                    <div className="flex items-baseline flex-wrap gap-x-1.5">
                      <span>{sub.dharmaName || sub.deceasedName}</span>
                      {displaySubSecular && (
                        <span className="text-xs sm:text-sm font-normal text-[#8C2D19]/80 font-serif">
                          （故　{displaySubSecular}）
                        </span>
                      )}
                    </div>
                    {sub.memorialType && (
                      <div className="text-sm sm:text-base font-bold text-[#8C2D19]/90 mt-0.5">
                        {sub.memorialType} (併修)
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 3行目: 小文字で参列　⚫️名　会場　⚫️⚫️　GoogleMap (塔婆のみの場合は参列非表示) */}
      {!isToba && (
        <div className="text-xs sm:text-sm text-gray-600 flex items-center gap-3 flex-wrap">
          {!isOther && service.attendeeCount && service.attendeeCount > 0 ? (
            <span>参列 {service.attendeeCount}名</span>
          ) : null}
          {displayVenue ? <span>会場 {displayVenue}</span> : null}
          {mapUrl ? (
            <a
              href={mapUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1 font-bold bg-blue-50 px-2 py-0.5 rounded-2xs border border-blue-200 transition-colors cursor-pointer"
              title="Googleマップで開く"
            >
              <MapPin className="w-3.5 h-3.5 text-blue-600" />
              <span>GoogleMap</span>
            </a>
          ) : null}
        </div>
      )}

      {/* 4行目: 塔婆明細 */}
      {serviceTobaLines.length > 0 && (
        <div className="space-y-1.5 bg-[#FAF8F5] p-2.5 rounded-xs border border-[#E5DFD5] w-full">
          <div className="text-xs font-bold text-[#8C2D19] flex items-center gap-1">
            <span>🎋 塔婆 ({serviceTobaLines.length}本)</span>
          </div>
          <div className="space-y-1">
            {serviceTobaLines.map((line, idx) => (
              <div
                key={idx}
                className="text-sm sm:text-base font-bold font-serif text-[#1A1A1A] leading-relaxed tracking-wide break-words border-b border-[#EBE5DA] pb-1 last:border-b-0 last:pb-0"
              >
                {line.formattedLine}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 5行目: Googleカレンダー追加 */}
      <div className="flex items-center justify-between pt-2 border-t border-[#E5E0D8] font-sans text-xs gap-2 flex-wrap">
        <a
          href={generateGoogleCalendarUrl({
            title: isToba
              ? `塔婆供養 - ${cleanChiefMourner || '志主'}${serviceTobaLines.length > 0 ? ` (${serviceTobaLines.map((t) => t.formattedLine).join(', ')})` : ''}`
              : isFuneral
              ? `${service.memorialType || '葬儀'} 施主 ${cleanChiefMourner || '施主未定'}`
              : isOther
              ? (cleanChiefMourner || service.notes || 'その他予定')
              : `${service.memorialType || '法要'} - ${cleanChiefMourner} (${service.dharmaName || service.deceasedName || ''})`,
            startDate: service.scheduledDate,
            startTime: service.scheduledTime,
            endTime: service.endTime,
            details: isToba
              ? `【種別】塔婆供養\n【施主/志主】${cleanChiefMourner}\n【塔婆明細】\n${serviceTobaLines.map((t) => t.formattedLine).join('\n')}\n【備考】${service.notes || ''}`
              : isOther
              ? `【件名】${cleanChiefMourner || 'その他予定'}\n【会場】${displayVenue || '未定'}\n【備考】${service.notes || ''}`
              : isFuneral
              ? `【種別】${service.memorialType || '葬儀'}\n【施主】${cleanChiefMourner}\n【会場】${displayVenue || '未定'}\n【住所】${service.address || ''}\n【備考】${service.notes || ''}`
              : `【施主】${cleanChiefMourner}\n【戒名】${service.dharmaName || service.deceasedName || ''}\n【参列】${service.attendeeCount || 0}名\n【塔婆】${serviceTobaLines.length > 0 ? serviceTobaLines.map(t => t.formattedLine).join('\n') : 'なし'}\n【備考】${service.notes || ''}`,
            location: service.address || displayVenue || '',
          })}
          target="_blank"
          rel="noopener noreferrer"
          className="px-2.5 py-1.5 bg-[#EFF6FF] text-[#1E40AF] border border-[#BFDBFE] hover:bg-[#DBEAFE] rounded-xs font-bold flex items-center gap-1 transition-colors"
        >
          <CalendarIcon className="w-3.5 h-3.5" />
          <span>Googleカレンダー追加</span>
        </a>
      </div>
    </div>
  );
};

