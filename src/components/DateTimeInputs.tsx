import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Calendar, Clock, Edit3, Check, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { formatJapaneseEraDate, normalizeDateInput, NormalizeDateOptions, getJapaneseEra } from '../utils/memorialCalculator';
import { getRokuyo, getTodayDateString } from '../utils/calendarUtils';
import { MemorialService } from '../types';

interface DateInputWithEraProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  required?: boolean;
  placeholder?: string;
  className?: string;
  id?: string;
  options?: NormalizeDateOptions;
  memorialServices?: MemorialService[];
}

/**
 * Helper to step date string by +/- deltaDays
 */
function stepDateByDays(currentDateStr: string, deltaDays: number): string {
  const norm = normalizeDateInput(currentDateStr);
  let d = new Date();
  if (norm) {
    const parts = norm.split(/[\/\-]/);
    if (parts.length >= 3) {
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      if (!isNaN(y) && !isNaN(m) && !isNaN(day)) {
        d = new Date(y, m, day);
      }
    }
  }
  d.setDate(d.getDate() + deltaDays);
  const resY = d.getFullYear();
  const resM = String(d.getMonth() + 1).padStart(2, '0');
  const resD = String(d.getDate()).padStart(2, '0');
  return `${resY}/${resM}/${resD}`;
}

/**
 * Standardized Date Input with Japanese Era preview, +/- 1 Day Spin Buttons,
 * and Interactive Calendar Popup showing existing scheduled services.
 */
export const DateInputWithEra: React.FC<DateInputWithEraProps> = ({
  value,
  onChange,
  label,
  required = false,
  placeholder = '例: 2026/08/25, R8.8.25',
  className = '',
  id,
  options,
  memorialServices = [],
}) => {
  const [internalText, setInternalText] = useState(value || '');
  const [showCalendarPopup, setShowCalendarPopup] = useState(false);
  const [hoveredDayServices, setHoveredDayServices] = useState<{ date: string; services: MemorialService[] } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Derive initial year and month for the popup calendar
  const initialDateObj = useMemo(() => {
    const norm = normalizeDateInput(value);
    if (norm) {
      const parts = norm.split(/[\/\-]/);
      if (parts.length >= 3) {
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10) - 1;
        const d = parseInt(parts[2], 10);
        if (!isNaN(y) && !isNaN(m)) {
          return { year: y, month: m, day: d };
        }
      }
    }
    const today = new Date();
    return { year: today.getFullYear(), month: today.getMonth(), day: today.getDate() };
  }, [value]);

  const [viewYear, setViewYear] = useState(initialDateObj.year);
  const [viewMonth, setViewMonth] = useState(initialDateObj.month); // 0-indexed

  // Sync internal text when prop value changes
  useEffect(() => {
    setInternalText(value || '');
    const norm = normalizeDateInput(value);
    if (norm) {
      const parts = norm.split(/[\/\-]/);
      if (parts.length >= 2) {
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10) - 1;
        if (!isNaN(y) && !isNaN(m)) {
          setViewYear(y);
          setViewMonth(m);
        }
      }
    }
  }, [value]);

  // Handle outside click to close calendar popup
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowCalendarPopup(false);
        setHoveredDayServices(null);
      }
    };
    if (showCalendarPopup) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showCalendarPopup]);

  const handleBlur = () => {
    const norm = normalizeDateInput(internalText, options);
    if (norm) {
      setInternalText(norm);
      onChange(norm);
    } else if (!internalText.trim()) {
      setInternalText('');
      onChange('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleBlur();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      handleStepDays(1);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      handleStepDays(-1);
    }
  };

  const handleStepDays = (delta: number) => {
    const current = internalText || value || getTodayDateString('/');
    const nextDate = stepDateByDays(current, delta);
    setInternalText(nextDate);
    onChange(nextDate);
  };

  const handleSelectCalendarDate = (dateStr: string) => {
    setInternalText(dateStr);
    onChange(dateStr);
    setShowCalendarPopup(false);
    setHoveredDayServices(null);
  };

  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewYear(viewYear - 1);
      setViewMonth(11);
    } else {
      setViewMonth(viewMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewYear(viewYear + 1);
      setViewMonth(0);
    } else {
      setViewMonth(viewMonth + 1);
    }
  };

  const handleGoToday = () => {
    const today = new Date();
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth());
    const todayStr = getTodayDateString('/');
    handleSelectCalendarDate(todayStr);
  };

  const normalized = normalizeDateInput(internalText || value, options);
  const eraPreview = normalized ? formatJapaneseEraDate(normalized, false) : '';

  // Get Day of Week in Japanese
  let dayOfWeekStr = '';
  let rokuyoStr = '';
  if (normalized) {
    try {
      const d = new Date(normalized.replace(/\//g, '-'));
      if (!isNaN(d.getTime())) {
        const days = ['日', '月', '火', '水', '木', '金', '土'];
        dayOfWeekStr = ` (${days[d.getDay()]})`;
        rokuyoStr = getRokuyo(normalized);
      }
    } catch {
      // ignore
    }
  }

  // Generate calendar days for the current viewMonth
  const calendarDays = useMemo(() => {
    const firstDayOfMonth = new Date(viewYear, viewMonth, 1);
    const startingDayOfWeek = firstDayOfMonth.getDay(); // 0 = Sunday
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();

    const days: Array<{
      dateStr: string;
      dayNumber: number;
      isCurrentMonth: boolean;
      isToday: boolean;
      isSelected: boolean;
      rokuyo: string;
      services: MemorialService[];
    }> = [];

    const todayFormatted = getTodayDateString('/');
    const selectedNorm = normalizeDateInput(value || internalText);

    // Previous month padding
    for (let i = startingDayOfWeek - 1; i >= 0; i--) {
      const dayNum = daysInPrevMonth - i;
      const prevM = viewMonth === 0 ? 12 : viewMonth;
      const prevY = viewMonth === 0 ? viewYear - 1 : viewYear;
      const dStr = `${prevY}/${String(prevM).padStart(2, '0')}/${String(dayNum).padStart(2, '0')}`;
      const dNorm = normalizeDateInput(dStr) || dStr;
      const servs = memorialServices.filter((s) => (normalizeDateInput(s.scheduledDate) || s.scheduledDate) === dNorm);
      days.push({
        dateStr: dStr,
        dayNumber: dayNum,
        isCurrentMonth: false,
        isToday: dNorm === todayFormatted,
        isSelected: dNorm === selectedNorm,
        rokuyo: getRokuyo(dStr),
        services: servs,
      });
    }

    // Current month days
    for (let i = 1; i <= daysInMonth; i++) {
      const curM = viewMonth + 1;
      const dStr = `${viewYear}/${String(curM).padStart(2, '0')}/${String(i).padStart(2, '0')}`;
      const dNorm = normalizeDateInput(dStr) || dStr;
      const servs = memorialServices.filter((s) => (normalizeDateInput(s.scheduledDate) || s.scheduledDate) === dNorm);
      days.push({
        dateStr: dStr,
        dayNumber: i,
        isCurrentMonth: true,
        isToday: dNorm === todayFormatted,
        isSelected: dNorm === selectedNorm,
        rokuyo: getRokuyo(dStr),
        services: servs,
      });
    }

    // Next month padding to fill grid (total rows 5 or 6, 35 or 42 cells)
    const remainingCells = (7 - (days.length % 7)) % 7;
    const totalCellsNeeded = days.length + remainingCells < 35 ? 35 : days.length + remainingCells;
    const nextPaddingCount = totalCellsNeeded - days.length;

    for (let i = 1; i <= nextPaddingCount; i++) {
      const nextM = viewMonth === 11 ? 1 : viewMonth + 2;
      const nextY = viewMonth === 11 ? viewYear + 1 : viewYear;
      const dStr = `${nextY}/${String(nextM).padStart(2, '0')}/${String(i).padStart(2, '0')}`;
      const dNorm = normalizeDateInput(dStr) || dStr;
      const servs = memorialServices.filter((s) => (normalizeDateInput(s.scheduledDate) || s.scheduledDate) === dNorm);
      days.push({
        dateStr: dStr,
        dayNumber: i,
        isCurrentMonth: false,
        isToday: dNorm === todayFormatted,
        isSelected: dNorm === selectedNorm,
        rokuyo: getRokuyo(dStr),
        services: servs,
      });
    }

    return days;
  }, [viewYear, viewMonth, memorialServices, value, internalText]);

  const viewEraName = getJapaneseEra(viewYear, viewMonth + 1, 1);

  return (
    <div ref={containerRef} className={`relative space-y-1 ${className}`}>
      {label && (
        <div className="flex items-center justify-between">
          <label htmlFor={id} className="block font-bold text-[#333333] text-xs">
            {label} {required && <span className="text-red-600">*</span>}
          </label>
          {eraPreview && (
            <span className="text-[11px] font-sans font-bold text-[#8C2D19] bg-[#FAF7F0] px-1.5 py-0.2 border border-[#D4AF37]/40 flex items-center gap-1">
              <span>{eraPreview}{dayOfWeekStr}</span>
              {rokuyoStr && <span className="text-gray-500 font-normal text-[10px]">({rokuyoStr})</span>}
            </span>
          )}
        </div>
      )}

      {/* Input container with ▲▼ Stepper and Calendar Icon Button */}
      <div className="relative flex items-stretch border border-[#D1CEC7] bg-white focus-within:border-[#1A1A1A] transition-colors shadow-2xs">
        <input
          id={id}
          ref={inputRef}
          type="text"
          value={internalText}
          onChange={(e) => setInternalText(e.target.value)}
          onFocus={(e) => e.target.select()}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          required={required}
          className="w-full p-2 bg-transparent font-mono text-xs font-bold text-[#1A1A1A] focus:outline-none"
        />

        {/* Stepper Buttons: ▲ (Next day) / ▼ (Prev day) */}
        <div className="flex flex-col border-l border-[#E5E0D8] bg-[#FAF8F5] divide-y divide-[#E5E0D8] shrink-0">
          <button
            type="button"
            tabIndex={-1}
            onClick={() => handleStepDays(1)}
            title="翌日へ (+1日) [↑キー]"
            className="px-1.5 py-0.5 hover:bg-[#D4AF37] hover:text-[#1A1A1A] text-gray-600 transition-colors flex items-center justify-center cursor-pointer select-none h-1/2"
          >
            <ChevronUp className="w-3 h-3" />
          </button>
          <button
            type="button"
            tabIndex={-1}
            onClick={() => handleStepDays(-1)}
            title="前日へ (-1日) [↓キー]"
            className="px-1.5 py-0.5 hover:bg-[#D4AF37] hover:text-[#1A1A1A] text-gray-600 transition-colors flex items-center justify-center cursor-pointer select-none h-1/2"
          >
            <ChevronDown className="w-3 h-3" />
          </button>
        </div>

        {/* Calendar Picker Toggle Button */}
        <button
          type="button"
          tabIndex={-1}
          onClick={() => {
            setShowCalendarPopup(!showCalendarPopup);
            if (!showCalendarPopup && normalized) {
              const parts = normalized.split(/[\/\-]/);
              if (parts.length >= 2) {
                const y = parseInt(parts[0], 10);
                const m = parseInt(parts[1], 10) - 1;
                if (!isNaN(y) && !isNaN(m)) {
                  setViewYear(y);
                  setViewMonth(m);
                }
              }
            }
          }}
          title="カレンダーを開いて既存予定を確認しながら日付を選択"
          className={`px-2.5 flex items-center justify-center border-l border-[#E5E0D8] transition-all cursor-pointer shrink-0 ${
            showCalendarPopup
              ? 'bg-[#1A1A1A] text-[#D4AF37]'
              : 'bg-[#F9F7F2] text-[#8C2D19] hover:bg-[#EBE7DF]'
          }`}
        >
          <Calendar className="w-4 h-4" />
        </button>
      </div>

      {!label && eraPreview && (
        <div className="text-[11px] font-sans font-bold text-[#8C2D19] flex items-center gap-1">
          <span>{eraPreview}{dayOfWeekStr}</span>
          {rokuyoStr && <span className="text-gray-500 font-normal">({rokuyoStr})</span>}
        </div>
      )}

      {/* Interactive Popup Calendar showing Existing Scheduled Services */}
      {showCalendarPopup && (
        <div className="absolute left-0 top-full mt-1.5 z-60 w-80 sm:w-96 bg-white border-2 border-[#1A1A1A] shadow-2xl p-3 space-y-2.5 text-xs font-sans rounded-xs animate-in fade-in zoom-in-95 duration-100">
          {/* Header with Month Navigation and Era Info */}
          <div className="flex items-center justify-between border-b border-[#E5E0D8] pb-2">
            <div className="flex items-center space-x-1">
              <button
                type="button"
                onClick={handlePrevMonth}
                className="p-1 text-gray-700 hover:text-black hover:bg-gray-100 rounded cursor-pointer transition-colors"
                title="前月"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="font-bold text-[#1A1A1A] text-sm flex items-center gap-1.5 px-1">
                <span>{viewYear}年 {viewMonth + 1}月</span>
                {viewEraName && (
                  <span className="text-xs text-[#8C2D19] font-serif bg-[#FAF7F0] px-1.5 py-0.5 border border-[#D4AF37]/40">
                    {viewEraName}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={handleNextMonth}
                className="p-1 text-gray-700 hover:text-black hover:bg-gray-100 rounded cursor-pointer transition-colors"
                title="次月"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center space-x-1.5">
              <button
                type="button"
                onClick={handleGoToday}
                className="px-2 py-0.5 bg-[#FAF7F0] hover:bg-[#D4AF37] hover:text-[#1A1A1A] text-[#8C2D19] border border-[#D4AF37] text-[11px] font-bold transition-colors cursor-pointer"
                title="今日を選択"
              >
                今日
              </button>
              <button
                type="button"
                onClick={() => setShowCalendarPopup(false)}
                className="p-1 text-gray-400 hover:text-gray-700 cursor-pointer"
                title="閉じる"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Weekday Header */}
          <div className="grid grid-cols-7 gap-1 text-center font-bold text-[11px] py-1 bg-gray-50 border-y border-gray-200">
            <span className="text-red-600">日</span>
            <span className="text-gray-700">月</span>
            <span className="text-gray-700">火</span>
            <span className="text-gray-700">水</span>
            <span className="text-gray-700">木</span>
            <span className="text-gray-700">金</span>
            <span className="text-blue-600">土</span>
          </div>

          {/* Calendar Day Grid */}
          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map((cd, idx) => {
              const hasServices = cd.services.length > 0;
              const isTaian = cd.rokuyo === '大安';
              const isTomobiki = cd.rokuyo === '友引';
              const isButsumetsu = cd.rokuyo === '仏滅';

              return (
                <div
                  key={`cal-day-${cd.dateStr}-${idx}`}
                  onClick={() => handleSelectCalendarDate(cd.dateStr)}
                  onMouseEnter={() => {
                    if (hasServices) {
                      setHoveredDayServices({ date: cd.dateStr, services: cd.services });
                    }
                  }}
                  onMouseLeave={() => setHoveredDayServices(null)}
                  className={`min-h-[44px] p-1 border flex flex-col justify-between transition-all cursor-pointer rounded-xs relative select-none ${
                    cd.isSelected
                      ? 'border-[#8C2D19] bg-[#FFF8EE] ring-2 ring-[#8C2D19]/40 z-10'
                      : cd.isToday
                      ? 'border-blue-500 bg-blue-50/40'
                      : cd.isCurrentMonth
                      ? 'border-gray-200 bg-white hover:border-[#D4AF37] hover:bg-amber-50/60'
                      : 'border-gray-100 bg-gray-50/60 text-gray-400 hover:bg-gray-100'
                  }`}
                >
                  {/* Day Number and Rokuyo */}
                  <div className="flex items-center justify-between leading-none">
                    <span
                      className={`text-xs font-bold font-mono ${
                        cd.isSelected
                          ? 'text-[#8C2D19] font-black'
                          : cd.isToday
                          ? 'text-blue-700 font-black underline'
                          : !cd.isCurrentMonth
                          ? 'text-gray-400'
                          : 'text-[#1A1A1A]'
                      }`}
                    >
                      {cd.dayNumber}
                    </span>
                    <span
                      className={`text-[9px] font-serif ${
                        isTaian
                          ? 'text-red-600 font-bold'
                          : isTomobiki
                          ? 'text-amber-700 font-medium'
                          : isButsumetsu
                          ? 'text-gray-400'
                          : 'text-gray-500'
                      }`}
                    >
                      {cd.rokuyo}
                    </span>
                  </div>

                  {/* Scheduled Services Indicator / Mini Badge */}
                  <div className="mt-0.5 space-y-0.5">
                    {hasServices ? (
                      <div className="flex flex-col gap-0.5">
                        <div
                          className={`text-[9px] px-1 py-0.2 rounded-xs font-bold leading-tight flex items-center justify-between ${
                            cd.isSelected
                              ? 'bg-[#8C2D19] text-white'
                              : 'bg-[#FAF089] text-[#8C2D19] border border-amber-300'
                          }`}
                        >
                          <span className="truncate">
                            {cd.services.length === 1
                              ? (cd.services[0].scheduledTime || cd.services[0].memorialType)
                              : `予定 ${cd.services.length}件`}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="h-2.5" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Hovered Date Scheduled Services Preview Box */}
          {hoveredDayServices && hoveredDayServices.services.length > 0 && (
            <div className="p-2 bg-[#FFFDF9] border border-[#D4AF37] shadow-md space-y-1 rounded-xs animate-in fade-in-50 duration-75">
              <div className="text-[11px] font-bold text-[#8C2D19] border-b border-[#E5E0D8] pb-1 flex items-center justify-between">
                <span>📅 {hoveredDayServices.date} の既存予定 ({hoveredDayServices.services.length}件):</span>
                <span className="text-[10px] text-gray-500">{getRokuyo(hoveredDayServices.date)}</span>
              </div>
              <div className="max-h-24 overflow-y-auto space-y-1 pr-1">
                {hoveredDayServices.services.map((s, sIdx) => (
                  <div
                    key={`hover-service-${s.id || sIdx}`}
                    className="text-[10px] bg-white p-1 border border-gray-200 flex items-center justify-between"
                  >
                    <div className="font-bold text-[#1A1A1A] truncate max-w-[200px]">
                      <span className="text-[#8C2D19] font-mono mr-1">{s.scheduledTime || '--:--'}</span>
                      <span>{s.memorialType}</span>
                      <span className="text-gray-600 font-normal ml-1">
                        ({s.chiefMourner}{s.dharmaName ? ` / ${s.dharmaName}` : ''})
                      </span>
                    </div>
                    {s.venue && <span className="text-gray-500 text-[9px] shrink-0 ml-1">📍{s.venue}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Footer Guide */}
          <div className="pt-1.5 border-t border-[#E5E0D8] flex items-center justify-between text-[10px] text-gray-500">
            <div className="flex items-center space-x-2">
              <span className="flex items-center gap-0.5">
                <span className="w-2 h-2 rounded-full bg-[#FAF089] border border-amber-400 inline-block" />
                <span>既存予定あり</span>
              </span>
              <span className="flex items-center gap-0.5">
                <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
                <span>今日</span>
              </span>
            </div>
            <span>クリックで選択確定</span>
          </div>
        </div>
      )}
    </div>
  );
};

interface TimeSelectorInputProps {
  value: string;
  onChange: (time: string) => void;
  label?: string;
  required?: boolean;
  placeholder?: string;
  className?: string;
  id?: string;
  allowAllDay?: boolean;
}

/**
 * Step time string by +/- deltaMinutes (15 min intervals)
 */
function stepTime15Min(currentTimeStr: string, deltaMinutes: number): string {
  let [h, m] = (currentTimeStr || '11:00').split(':').map((v) => parseInt(v, 10));
  if (isNaN(h)) h = 11;
  if (isNaN(m)) m = 0;

  let totalMinutes = h * 60 + m + deltaMinutes;
  // Wrap around 24 hours (1440 mins)
  totalMinutes = (totalMinutes % 1440 + 1440) % 1440;
  const newH = Math.floor(totalMinutes / 60);
  const newM = totalMinutes % 60;
  return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
}

/**
 * 15-Minute Interval Time Selector with Stepper (▲/▼) Buttons,
 * Quick 15-min Popup Matrix, and Double-Click Direct Typing.
 */
export const TimeSelectorInput: React.FC<TimeSelectorInputProps> = ({
  value,
  onChange,
  label,
  required = false,
  placeholder = '11:00',
  className = '',
  id,
  allowAllDay = true,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isDirectInput, setIsDirectInput] = useState(false);
  const [directText, setDirectText] = useState(value || '11:00');
  const [selectedHour, setSelectedHour] = useState<string>(() => {
    if (value === '終日') return '終日';
    return (value || '11:00').split(':')[0] || '11';
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const directInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (value) {
      setDirectText(value);
      if (value === '終日') {
        setSelectedHour('終日');
      } else {
        const h = value.split(':')[0];
        if (h) setSelectedHour(h);
      }
    }
  }, [value]);

  // Handle outside click to close dropdown
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [isOpen]);

  // Focus direct input when switching to direct input mode
  useEffect(() => {
    if (isDirectInput && directInputRef.current) {
      directInputRef.current.focus();
      directInputRef.current.select();
    }
  }, [isDirectInput]);

  const normalizeTimeString = (raw: string): string => {
    const trimmed = raw.trim();
    if (trimmed === '終日' || trimmed.toLowerCase() === 'all' || trimmed.toLowerCase() === 'allday' || trimmed === '日中') {
      return '終日';
    }
    const cleaned = raw.replace(/[^\d:]/g, '').trim();
    if (!cleaned) return '11:00';
    if (cleaned.includes(':')) {
      const [hStr, mStr] = cleaned.split(':');
      const h = Math.min(23, Math.max(0, parseInt(hStr, 10) || 0));
      const m = Math.min(59, Math.max(0, parseInt(mStr, 10) || 0));
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }
    if (cleaned.length === 3) {
      const h = parseInt(cleaned[0], 10);
      const m = parseInt(cleaned.slice(1), 10);
      return `0${h}:${String(m).padStart(2, '0')}`;
    }
    if (cleaned.length === 4) {
      const h = Math.min(23, parseInt(cleaned.slice(0, 2), 10));
      const m = Math.min(59, parseInt(cleaned.slice(2), 10));
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }
    const h = Math.min(23, parseInt(cleaned, 10) || 0);
    return `${String(h).padStart(2, '0')}:00`;
  };

  const handleDirectBlur = () => {
    const normalized = normalizeTimeString(directText);
    setDirectText(normalized);
    setIsDirectInput(false);
    onChange(normalized);
  };

  const handleDirectKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleDirectBlur();
    } else if (e.key === 'Escape') {
      setDirectText(value || '11:00');
      setIsDirectInput(false);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (directText !== '終日') handleStepMinutes(15);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (directText !== '終日') handleStepMinutes(-15);
    }
  };

  const handleStepMinutes = (deltaMinutes: number) => {
    const current = directText === '終日' ? '11:00' : (directText || value || '11:00');
    const nextTime = stepTime15Min(current, deltaMinutes);
    setDirectText(nextTime);
    onChange(nextTime);
  };

  const handleSelectTime = (t: string) => {
    onChange(t);
    setDirectText(t);
    setIsOpen(false);
  };

  const handleSelectHour = (h: string) => {
    setSelectedHour(h);
    const curMinute = (value && value !== '終日') ? (value.split(':')[1] || '00') : '00';
    const newTime = `${h}:${curMinute}`;
    onChange(newTime);
    setDirectText(newTime);
  };

  const handleSelectMinute = (m: string) => {
    const curHour = (value && value !== '終日') ? (value.split(':')[0] || '11') : '11';
    const newTime = `${curHour}:${m}`;
    onChange(newTime);
    setDirectText(newTime);
    setIsOpen(false);
  };

  const isAllDayValue = value === '終日';
  const currentHour = (!isAllDayValue && value) ? (value.split(':')[0] || '11') : '11';
  const currentMinute = (!isAllDayValue && value) ? (value.split(':')[1] || '00') : '00';

  return (
    <div ref={containerRef} className={`relative space-y-1 ${className}`}>
      {label && (
        <div className="flex items-center justify-between">
          <label htmlFor={id} className="block font-bold text-[#333333] text-xs">
            {label} {required && <span className="text-red-600">*</span>}
          </label>
          <span className="text-[10px] text-gray-500">15分刻み / ▲▼で移動</span>
        </div>
      )}

      {isDirectInput ? (
        <div className="relative flex items-stretch border-2 border-[#8C2D19] bg-[#FFF8EE]">
          <input
            id={id}
            ref={directInputRef}
            type="text"
            value={directText}
            onChange={(e) => setDirectText(e.target.value)}
            onBlur={handleDirectBlur}
            onKeyDown={handleDirectKeyDown}
            placeholder="例: 11:00"
            className="w-full p-2 bg-transparent font-mono text-xs font-black text-[#8C2D19] focus:outline-none"
          />

          {/* Stepper Buttons in direct input mode */}
          <div className="flex flex-col border-l border-[#8C2D19]/30 bg-[#FAF8F5] divide-y divide-[#8C2D19]/30 shrink-0">
            <button
              type="button"
              tabIndex={-1}
              onMouseDown={(e) => {
                e.preventDefault();
                handleStepMinutes(15);
              }}
              title="+15分 [↑キー]"
              className="px-1.5 py-0.5 hover:bg-[#8C2D19] hover:text-white text-[#8C2D19] transition-colors flex items-center justify-center cursor-pointer select-none h-1/2"
            >
              <ChevronUp className="w-3 h-3" />
            </button>
            <button
              type="button"
              tabIndex={-1}
              onMouseDown={(e) => {
                e.preventDefault();
                handleStepMinutes(-15);
              }}
              title="-15分 [↓キー]"
              className="px-1.5 py-0.5 hover:bg-[#8C2D19] hover:text-white text-[#8C2D19] transition-colors flex items-center justify-center cursor-pointer select-none h-1/2"
            >
              <ChevronDown className="w-3 h-3" />
            </button>
          </div>

          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              handleDirectBlur();
            }}
            className="px-2.5 py-1 bg-[#8C2D19] text-white text-[10px] font-bold cursor-pointer hover:bg-[#6D2313] transition-colors shrink-0"
          >
            確定
          </button>
        </div>
      ) : (
        <div className="relative flex items-stretch border border-[#D1CEC7] bg-white focus-within:border-[#1A1A1A] transition-colors shadow-2xs">
          {/* Main Clickable Area */}
          <div
            id={id}
            onClick={() => setIsOpen(!isOpen)}
            onDoubleClick={() => {
              setIsOpen(false);
              setIsDirectInput(true);
            }}
            title="クリックで15分刻み選択 / ダブルクリックで直接手入力"
            className={`w-full p-2 bg-transparent font-mono text-xs font-bold flex items-center justify-between cursor-pointer select-none transition-colors ${
              isAllDayValue ? 'bg-[#FFFDF5] hover:bg-[#FFF8E6] text-[#B8860B]' : 'text-[#1A1A1A] hover:bg-[#FAF7F0]'
            }`}
          >
            <div className="flex items-center space-x-1.5">
              <Clock className={`w-3.5 h-3.5 ${isAllDayValue ? 'text-[#D4AF37]' : 'text-[#8C2D19]'}`} />
              <span className={`text-xs font-black tracking-wider ${isAllDayValue ? 'text-[#8C2D19] bg-[#FAF089]/60 px-1.5 py-0.5 rounded font-sans' : ''}`}>
                {value || placeholder}
              </span>
            </div>
            <div className="flex items-center space-x-1 text-gray-400">
              {allowAllDay && !isAllDayValue && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelectTime('終日');
                  }}
                  className="px-1.5 py-0.5 bg-[#FAF7F0] hover:bg-[#D4AF37] hover:text-[#1A1A1A] text-[#8C2D19] border border-[#D4AF37]/60 text-[10px] font-bold rounded cursor-pointer transition-colors"
                  title="終日に設定"
                >
                  終日
                </button>
              )}
              <button
                type="button"
                className="hover:text-[#8C2D19] cursor-pointer p-0.5"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsOpen(false);
                  setIsDirectInput(true);
                }}
                title="直接手入力モード"
              >
                <Edit3 className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* Stepper Buttons: ▲ (+15 min) / ▼ (-15 min) */}
          <div className="flex flex-col border-l border-[#E5E0D8] bg-[#FAF8F5] divide-y divide-[#E5E0D8] shrink-0">
            <button
              type="button"
              tabIndex={-1}
              onClick={(e) => {
                e.stopPropagation();
                handleStepMinutes(15);
              }}
              title="+15分進める [↑キー]"
              className="px-1.5 py-0.5 hover:bg-[#D4AF37] hover:text-[#1A1A1A] text-gray-600 transition-colors flex items-center justify-center cursor-pointer select-none h-1/2"
            >
              <ChevronUp className="w-3 h-3" />
            </button>
            <button
              type="button"
              tabIndex={-1}
              onClick={(e) => {
                e.stopPropagation();
                handleStepMinutes(-15);
              }}
              title="-15分戻す [↓キー]"
              className="px-1.5 py-0.5 hover:bg-[#D4AF37] hover:text-[#1A1A1A] text-gray-600 transition-colors flex items-center justify-center cursor-pointer select-none h-1/2"
            >
              <ChevronDown className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}

      {/* 15-Minute Interval Popup Menu */}
      {isOpen && (
        <div className="absolute left-0 top-full mt-1 z-60 w-72 bg-white border-2 border-[#1A1A1A] shadow-2xl p-2.5 space-y-2.5 text-xs font-sans rounded-xs animate-in fade-in zoom-in-95 duration-100">
          <div className="flex items-center justify-between border-b border-[#E5E0D8] pb-1.5">
            <div className="font-bold text-[#1A1A1A] flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-[#8C2D19]" />
              <span>時刻を15分刻みで選択</span>
            </div>
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                setIsDirectInput(true);
              }}
              className="text-[11px] text-[#8C2D19] hover:underline font-bold flex items-center gap-0.5 cursor-pointer"
            >
              <Edit3 className="w-3 h-3" />
              <span>直接手入力</span>
            </button>
          </div>

          {/* Quick Hour Matrix */}
          <div>
            <div className="text-[11px] font-bold text-gray-500 mb-1">① 時（時間）を選択:</div>
            <div className="grid grid-cols-6 gap-1 max-h-28 overflow-y-auto p-1 bg-gray-50 border border-gray-200">
              {['06', '07', '08', '09', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21'].map((h) => {
                const isSelected = currentHour === h;
                return (
                  <button
                    key={h}
                    type="button"
                    onClick={() => handleSelectHour(h)}
                    className={`py-1 text-center font-mono font-bold text-xs rounded transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-[#8C2D19] text-white'
                        : 'bg-white text-[#1A1A1A] hover:bg-amber-100 border border-gray-200'
                    }`}
                  >
                    {h}時
                  </button>
                );
              })}
            </div>
          </div>

          {/* 15-Min Step Matrix */}
          <div>
            <div className="text-[11px] font-bold text-gray-500 mb-1">② 分（15分刻み）を選択して決定:</div>
            <div className="grid grid-cols-4 gap-1.5">
              {['00', '15', '30', '45'].map((m) => {
                const isSelected = currentMinute === m;
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => handleSelectMinute(m)}
                    className={`py-1.5 text-center font-mono font-bold text-xs rounded border transition-colors cursor-pointer flex items-center justify-center gap-1 ${
                      isSelected
                        ? 'bg-[#D4AF37] text-[#1A1A1A] border-[#1A1A1A] shadow-xs'
                        : 'bg-[#FAF7F0] text-[#1A1A1A] border-[#D1CEC7] hover:bg-[#F3EDE2]'
                    }`}
                  >
                    <span>{m}分</span>
                    {isSelected && <Check className="w-3 h-3" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Quick Presets */}
          <div className="pt-1.5 border-t border-[#E5E0D8] flex items-center justify-between text-[11px]">
            <span className="text-gray-500 font-bold">定番:</span>
            <div className="flex items-center space-x-1">
              {allowAllDay && (
                <button
                  type="button"
                  onClick={() => handleSelectTime('終日')}
                  className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors cursor-pointer border ${
                    isAllDayValue
                      ? 'bg-[#8C2D19] text-white border-[#8C2D19]'
                      : 'bg-amber-50 hover:bg-amber-100 text-[#8C2D19] border-amber-300'
                  }`}
                >
                  終日
                </button>
              )}
              {['09:00', '10:00', '11:00', '13:00', '14:00', '15:00'].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => handleSelectTime(preset)}
                  className="px-1.5 py-0.5 bg-gray-100 hover:bg-[#8C2D19] hover:text-white rounded text-[10px] font-mono font-bold transition-colors cursor-pointer"
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
