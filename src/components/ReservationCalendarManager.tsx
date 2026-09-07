import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Calendar as CalendarIcon,
  Clock,
  MapPin,
  Users,
  CheckCircle2,
  Circle,
  AlertCircle,
  Plus,
  Edit,
  Trash2,
  DollarSign,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Printer,
  CheckSquare,
  Square,
  Search,
  Filter,
  Navigation,
  FileText,
  Download,
  ArrowRight,
  Building2,
  Home,
  Layers,
  ListTodo,
  ArrowUp,
  ArrowDown,
  UserCheck,
  RotateCcw,
  QrCode,
  Compass,
  Check,
  X,
  GripVertical,
  ChevronUp,
  ChevronDown,
  CalendarDays,
  Settings2
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import {
  MemorialService,
  Household,
  PastRecord,
  TempleInfo,
  TempleProfile,
  Transaction,
  TempleTodo,
  TodoCategory,
  TodoPriority,
  ReservationCategory,
  MasterOptions,
  ServiceDeceasedTarget,
  ServiceTobaItem,
  Priest
} from '../types';
import { safeStorage } from '../utils/storageUtils';
import { TanagyoNoticeBoardPrintModal } from './TanagyoNoticeBoardPrintModal';
import { TanagyoPatronMapModal } from './TanagyoPatronMapModal';
import { TanagyoBatchAccountingModal } from './TanagyoBatchAccountingModal';
import { HouseholdTempleBadge } from './HouseholdTempleBadge';
import {
  formatCurrency,
  formatJapaneseEraDate,
  getJapaneseEra,
  normalizeDateInput,
  getHouseholdSponsorName,
  calculateYearlyMemorialSpirits,
  YearlyMemorialSpirit,
  getSpiritMemorialForDate,
  getHouseholdNiibonStatus,
  resolveSpiritMemorialType
} from '../utils/memorialCalculator';
import { DateInputWithEra, TimeSelectorInput } from './DateTimeInputs';
import { SaveConfirmModal } from './SaveConfirmModal';
import { MobileServiceModal } from './mobile/MobileServiceModal';
import {
  generateGoogleCalendarUrl,
  getGoogleMapsSearchUrl,
  getGoogleMapsMultiRouteUrl,
  getTanagyoRouteUrl,
  getTanagyoRouteSegments,
  type TanagyoRouteSegment,
  generateICalendarContent,
  downloadFile,
  getRokuyo,
  calculateEndTime,
  getPreviousDay
} from '../utils/calendarUtils';

interface ReservationCalendarManagerProps {
  memorialServices: MemorialService[];
  households: Household[];
  pastRecords: PastRecord[];
  templeInfo: TempleInfo;
  temples?: TempleProfile[];
  activeTempleId?: string;
  transactions: Transaction[];
  templeTodos: TempleTodo[];
  priests?: Priest[];
  segakiTobaOrders?: any[];
  masterOptions?: MasterOptions;
  templeMasterOptionsMap?: Record<string, MasterOptions>;
  targetDate?: string;
  onAddService: (service: MemorialService) => void;
  onUpdateService: (service: MemorialService) => void;
  onDeleteService: (id: string) => void;
  onAddTransaction: (transaction: Transaction) => void;
  onAddBatchTransactions?: (transactions: Transaction[]) => void;
  onDeleteTransaction?: (id: string) => void;
  onAddTodo: (todo: TempleTodo) => void;
  onUpdateTodo: (todo: TempleTodo) => void;
  onDeleteTodo: (id: string) => void;
  onUpdateHousehold?: (household: Household) => void;
  onBatchUpdateHouseholds?: (households: Household[], desc?: string) => void;
  onAddSegakiOrder?: (order: any) => void;
  onUpdateSegakiOrder?: (order: any) => void;
  onDeleteSegakiOrder?: (id: string) => void;
  onNavigateToYearlyMilestones?: (targetDate?: string) => void;
  onNavigateToPrintWithNotice?: (householdId: string, noticeText: string) => void;
}

export interface AccountingItemRow {
  id: string;
  category: string;
  amount: number;
  notes: string;
}

// Helper component for Unassigned Tanagyo Row with inline inputs
interface UnassignedTanagyoRowProps {
  household: Household;
  index: number;
  priests: Priest[];
  dateCandidates: string[];
  pastRecords?: PastRecord[];
  bonSeason?: string;
  temples?: TempleProfile[];
  templeInfo?: TempleInfo;
  onAssign: (household: Household, date: string, timeSlot: string, priestId: string) => void;
  onDragStart?: (household: Household) => void;
  onDragEnd?: () => void;
  isDragging?: boolean;
}

const UnassignedTanagyoRow: React.FC<UnassignedTanagyoRowProps> = ({
  household,
  index,
  priests,
  dateCandidates,
  pastRecords = [],
  bonSeason = '8月盆',
  temples,
  templeInfo,
  onAssign,
  onDragStart,
  onDragEnd,
  isDragging,
}) => {
  const defaultDate = household.tanagyoDate || (dateCandidates.length > 0 ? dateCandidates[0] : '8/13');
  const [date, setDate] = useState(defaultDate);
  const [timeSlot, setTimeSlot] = useState(household.tanagyoTimeSlot || '午前');
  
  // 僧侶の初期解決
  const initialPriestId = useMemo(() => {
    if (household.tanagyoPriestId) {
      const p = priests.find((pr) => pr.id === household.tanagyoPriestId || pr.name === household.tanagyoPriestId);
      if (p) return p.id;
      return household.tanagyoPriestId;
    }
    if (household.tanagyoPriestName) {
      const p = priests.find((pr) => pr.name === household.tanagyoPriestName || pr.id === household.tanagyoPriestName);
      if (p) return p.id;
    }
    return priests.length > 0 ? priests[0].id : '';
  }, [household.tanagyoPriestId, household.tanagyoPriestName, priests]);

  const [priestId, setPriestId] = useState(initialPriestId);

  const niibonStatus = getHouseholdNiibonStatus(pastRecords, household.id, bonSeason);

  // If household's saved date changes or candidate defaults shift
  useEffect(() => {
    if (household.tanagyoDate) {
      setDate(household.tanagyoDate);
    } else if (dateCandidates.length > 0 && (!date || !dateCandidates.includes(date))) {
      setDate(dateCandidates[0]);
    }
  }, [household.tanagyoDate, dateCandidates]);

  // If household's saved priest changes, sync correctly
  useEffect(() => {
    if (household.tanagyoPriestId) {
      const p = priests.find((pr) => pr.id === household.tanagyoPriestId || pr.name === household.tanagyoPriestId);
      setPriestId(p ? p.id : household.tanagyoPriestId);
    } else if (household.tanagyoPriestName) {
      const p = priests.find((pr) => pr.name === household.tanagyoPriestName || pr.id === household.tanagyoPriestName);
      if (p) setPriestId(p.id);
    }
  }, [household.tanagyoPriestId, household.tanagyoPriestName, priests]);

  useEffect(() => {
    if (household.tanagyoTimeSlot) {
      setTimeSlot(household.tanagyoTimeSlot);
    }
  }, [household.tanagyoTimeSlot]);

  const handleSave = () => {
    if (!date.trim()) {
      alert('訪問日（例: 8/13）を入力してください。');
      return;
    }
    if (!timeSlot) {
      alert('午前または午後を選択してください。');
      return;
    }
    onAssign(household, date.trim(), timeSlot, priestId);
  };

  const address = household.tanagyoAddress || household.address || '住所未登録';

  return (
    <tr
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', household.id);
        e.dataTransfer.setData(
          'application/json',
          JSON.stringify({
            householdId: household.id,
            isUnassigned: true,
          })
        );
        if (onDragStart) onDragStart(household);
      }}
      onDragEnd={() => {
        if (onDragEnd) onDragEnd();
      }}
      className={`hover:bg-amber-50/60 transition-all border-b border-[#E5E0D8] text-xs cursor-grab active:cursor-grabbing select-none ${
        isDragging ? 'opacity-40 bg-amber-100' : ''
      }`}
    >
      <td className="p-2.5 text-center font-bold text-gray-500 w-14">
        <div className="flex items-center justify-center gap-1">
          <GripVertical className="w-3.5 h-3.5 text-gray-400 cursor-grab active:cursor-grabbing" />
          <span>{index + 1}</span>
        </div>
      </td>
      <td className="p-2.5 font-bold text-[#1A1A1A] whitespace-nowrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span>{household.familyHead} 様</span>
          <HouseholdTempleBadge
            household={household}
            temples={temples}
            mainTempleInfo={templeInfo}
            size="2xs"
          />
          {household.district && (
            <span className="text-[10px] px-1.5 py-0.2 bg-gray-100 text-gray-600 rounded-xs">
              {household.district}
            </span>
          )}
          {niibonStatus.isCurrentYearNiibon && (
            <span
              className="inline-flex items-center px-1.5 py-0.5 bg-amber-50 text-amber-900 border border-amber-300 font-bold text-[11px] rounded-xs whitespace-nowrap"
              title={`本年度新盆対象: ${niibonStatus.currentYearRecords.map(r => `${r.dharmaName || r.secularName || '精霊'} (没:${r.deathDate || '-'})`).join('、')}`}
            >
              {niibonStatus.currentYearLabel}
            </span>
          )}
          {niibonStatus.isNextYearNiibon && (
            <span
              className="inline-flex items-center px-1.5 py-0.5 bg-sky-50 text-sky-900 border border-sky-300 font-bold text-[11px] rounded-xs whitespace-nowrap"
              title={`来年度新盆対象: ${niibonStatus.nextYearRecords.map(r => `${r.dharmaName || r.secularName || '精霊'} (没:${r.deathDate || '-'})`).join('、')}`}
            >
              {niibonStatus.nextYearLabel}
            </span>
          )}
        </div>
        {household.phone && (
          <div className="text-[11px] text-gray-500 font-normal">TEL: {household.phone}</div>
        )}
      </td>
      <td className="p-2.5 whitespace-nowrap">
        <HouseholdTempleBadge
          household={household}
          temples={temples}
          mainTempleInfo={templeInfo}
          size="xs"
        />
      </td>
      <td className="p-2.5 text-gray-700 min-w-[200px]">
        <div className="flex items-start gap-1">
          <MapPin className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
          <span className="font-medium">{address}</span>
        </div>
        {household.tanagyoAddress && (
          <span className="inline-block mt-0.5 text-[10px] text-blue-600 font-bold bg-blue-50 px-1 rounded-xs">
            ※棚経伺い先住所
          </span>
        )}
      </td>
      <td className="p-2.5 whitespace-nowrap">
        <div
          className="flex items-center gap-1"
          draggable={false}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <input
            type="text"
            draggable={false}
            onMouseDown={(e) => e.stopPropagation()}
            onDragStart={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            placeholder={`例: ${dateCandidates[0] || '8/13'}`}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-20 p-1.5 border border-gray-300 rounded-xs bg-white text-xs font-bold text-center cursor-text"
          />
          <div className="flex gap-0.5">
            {dateCandidates.map((quickD, qIdx) => (
              <button
                key={`${quickD}_${qIdx}`}
                type="button"
                draggable={false}
                onMouseDown={(e) => e.stopPropagation()}
                onDragStart={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onClick={() => setDate(quickD)}
                className={`px-1.5 py-1 text-[10px] border rounded-xs font-bold transition-colors cursor-pointer ${
                  date === quickD
                    ? 'bg-amber-600 text-white border-amber-600'
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-700 border-gray-300'
                }`}
                title={`訪問日を「${quickD}」に設定`}
              >
                {quickD}
              </button>
            ))}
          </div>
        </div>
      </td>
      <td className="p-2.5 whitespace-nowrap">
        <div
          className="inline-flex rounded-xs border border-gray-300 overflow-hidden"
          draggable={false}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            draggable={false}
            onMouseDown={(e) => e.stopPropagation()}
            onDragStart={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onClick={() => setTimeSlot('午前')}
            className={`px-2.5 py-1 font-bold text-xs transition-colors ${
              timeSlot === '午前'
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            午前
          </button>
          <button
            type="button"
            draggable={false}
            onMouseDown={(e) => e.stopPropagation()}
            onDragStart={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onClick={() => setTimeSlot('午後')}
            className={`px-2.5 py-1 font-bold text-xs transition-colors ${
              timeSlot === '午後'
                ? 'bg-orange-600 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            午後
          </button>
        </div>
      </td>
      <td className="p-2.5 whitespace-nowrap">
        <select
          draggable={false}
          onMouseDown={(e) => e.stopPropagation()}
          onDragStart={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          value={priestId}
          onChange={(e) => setPriestId(e.target.value)}
          className="p-1.5 border border-gray-300 rounded-xs bg-white text-xs font-bold max-w-[180px] cursor-pointer"
        >
          {priests.length === 0 ? (
            <option value="">寺院情報で僧侶を登録</option>
          ) : (
            priests.map((p) => (
              <option key={p.id} value={p.id}>
                {p.role ? `[${p.role}] ` : ''}{p.name}
              </option>
            ))
          )}
        </select>
      </td>
      <td className="p-2.5 text-center whitespace-nowrap">
        <button
          type="button"
          draggable={false}
          onMouseDown={(e) => e.stopPropagation()}
          onDragStart={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onClick={handleSave}
          className="px-3 py-1.5 bg-[#8C2D19] hover:bg-[#702414] text-white font-bold rounded-xs shadow-xs transition-colors flex items-center gap-1 mx-auto cursor-pointer"
        >
          <Check className="w-3.5 h-3.5" />
          <span>割当完了</span>
        </button>
      </td>
    </tr>
  );
};

// Helper to normalize kanji variants for robust matching
const normalizeKanjiVariant = (str?: string): string => {
  if (!str) return '';
  return str
    .replace(/澤/g, '沢')
    .replace(/[邊邉]/g, '辺')
    .replace(/[齊斉]/g, '斎')
    .replace(/髙/g, '高')
    .replace(/澁/g, '渋')
    .replace(/塚/g, '塚')
    .replace(/\s+/g, '')
    .trim();
};

// Helper to extract individual toba line items for calligraphy writing
export interface TobaLineItem {
  formattedLine: string;
  dharmaName: string;
  memorialType: string;
  sponsorName: string;
  countInfo?: string;
}

// Cleans up a raw toba line string to produce "<戒名> <忌日/回忌> 志主 <名字 名前>"
export const formatSingleTobaLine = (rawLine: string, fallbackMemorial?: string): string => {
  let line = (rawLine || '').trim();
  if (!line) return '';

  // 1. Strip leading numbering e.g. "1.", "1．", "1)", "1）", "1本目:", "[1本目]", "・", "- ", "* ", "🎋", "📝"
  line = line.replace(/^\s*\[?\d+[本目.．)）\]:]*\s*/, '');
  line = line.replace(/^[・\-\*🎋📝]\s*/, '');

  // 2. Strip standard field headers like "法名:", "戒名:", "回忌:", "法要種別:", "本数:"
  line = line.replace(/(法名|戒名)\s*[:：]\s*/g, ' ');
  line = line.replace(/(回忌|法要種別)\s*[:：]\s*/g, ' ');
  line = line.replace(/本数\s*[:：]\s*\d+本?/g, ' ');

  // 3. Strip "塔婆供養", "卒塔婆", "塔婆作成", "塔婆依頼", "塔婆" words that could pollute the line or replace the 忌日
  line = line.replace(/(塔婆供養|卒塔婆揮毫|塔婆揮毫|塔婆作成|塔婆依頼|卒塔婆|塔婆)/g, ' ');

  // 4. Replace punctuation, slashes, brackets, commas, quotes with spaces
  line = line.replace(/[:：/／\[\]［］()（）【】,，"']/g, ' ');
  line = line.replace(/[\s\u3000]+/g, ' ').trim();
  if (!line) return '';

  // 5. Extract memorialType (回忌・忌日) if present
  let memorialType = '';
  const memMatch = line.match(/(一周忌|三回忌|七回忌|十三回忌|十七回忌|二十三回忌|二十七回忌|三十三回忌|五十回忌|百回忌|百箇日|百ヶ日|四十九日|初七日|納骨法要|追善供養|年忌供養|先祖代々供養|年忌法要|新盆|初盆|盆供養|棚経|当年没|\d+回忌)/);
  if (memMatch) {
    memorialType = memMatch[1];
    line = line.replace(memorialType, ' ').trim();
  } else if (fallbackMemorial && fallbackMemorial !== '塔婆供養' && fallbackMemorial !== '塔婆' && fallbackMemorial !== 'その他') {
    memorialType = fallbackMemorial;
  }

  // 6. Extract sponsorName (志主・施主) if present
  let sponsorName = '';
  const spMatch = line.match(/(志主|施主)\s*[:：]?\s*(.*)$/);
  if (spMatch) {
    const restAfter = spMatch[2].trim();
    const beforeSp = line.slice(0, spMatch.index).trim();

    if (beforeSp.length > 0) {
      // 志主 was in the middle or end: e.g. "〇〇居士 一周忌 志主 山田 太郎"
      sponsorName = restAfter.replace(/(家|様)+$/g, '').trim();
      line = beforeSp;
    } else {
      // 志主 was at the beginning: e.g. "志主 山田 太郎 〇〇居士"
      const tokens = restAfter.split(/\s+/).filter(Boolean);
      const dharmaSuffixRegex = /(大居士|居士|大姉|信士|信女|童子|童女|幼児|禅定門|禅定尼|清信士|清信女|法尼|法師|上座|霊位|之霊|尊霊|覚霊|大和尚|和尚|先祖代々|為書き|為|院|位)/;
      const dharmaIdx = tokens.findIndex((t) => dharmaSuffixRegex.test(t));
      if (dharmaIdx > 0) {
        sponsorName = tokens.slice(0, dharmaIdx).join(' ');
        line = tokens.slice(dharmaIdx).join(' ');
      } else if (tokens.length >= 3) {
        sponsorName = `${tokens[0]} ${tokens[1]}`;
        line = tokens.slice(2).join(' ');
      } else if (tokens.length === 2) {
        sponsorName = `${tokens[0]} ${tokens[1]}`;
        line = '';
      } else {
        sponsorName = restAfter;
        line = '';
      }
    }
  }

  // 7. Clean remaining line as dharmaName
  let dharmaName = line.replace(/[\s\u3000]+/g, ' ').trim();

  // If sponsorName is known, remove any duplicate sponsorName from dharmaName (preventing name duplication at front)
  if (sponsorName) {
    sponsorName = sponsorName.replace(/(家|様)+$/g, '').trim();
    const spRaw = sponsorName.replace(/\s+/g, '');
    dharmaName = dharmaName
      .replace(new RegExp(`^${sponsorName}\\s*`, 'g'), '')
      .replace(new RegExp(`\\s*${sponsorName}$`, 'g'), '')
      .replace(new RegExp(`^${spRaw}\\s*`, 'g'), '')
      .replace(new RegExp(`\\s*${spRaw}$`, 'g'), '')
      .replace(/[\s\u3000]+/g, ' ')
      .trim();

    const spTokens = sponsorName.split(/\s+/).filter(Boolean);
    if (spTokens.length === 2) {
      dharmaName = dharmaName
        .replace(new RegExp(`^${spTokens[0]}\\s+${spTokens[1]}\\s*`, 'g'), '')
        .replace(new RegExp(`^${spTokens[0]}${spTokens[1]}\\s*`, 'g'), '')
        .replace(new RegExp(`\\s*${spTokens[0]}\\s+${spTokens[1]}$`, 'g'), '')
        .replace(new RegExp(`\\s*${spTokens[0]}${spTokens[1]}$`, 'g'), '')
        .replace(/[\s\u3000]+/g, ' ')
        .trim();
    }
  }

  // If still no sponsorName but dharmaName has multiple tokens before a recognized Buddhist title
  if (!sponsorName && dharmaName) {
    const tokens = dharmaName.split(/\s+/).filter(Boolean);
    const dharmaSuffixRegex = /(大居士|居士|大姉|信士|信女|童子|童女|幼児|禅定門|禅定尼|清信士|清信女|法尼|法師|上座|霊位|之霊|尊霊|覚霊|大和尚|和尚|先祖代々|為書き|為|院|位)/;
    const dharmaIdx = tokens.findIndex((t) => dharmaSuffixRegex.test(t));
    if (dharmaIdx > 0) {
      sponsorName = tokens.slice(0, dharmaIdx).join(' ');
      dharmaName = tokens.slice(dharmaIdx).join(' ');
    }
  }

  if (!dharmaName && !sponsorName) {
    return rawLine.trim();
  }
  if (!dharmaName) {
    dharmaName = '先祖代々';
  }

  // Always ensure a real memorial milestone (忌日) is present
  if (!memorialType || memorialType === '塔婆供養' || memorialType === '塔婆') {
    if (dharmaName.includes('先祖') || dharmaName.includes('代々')) {
      memorialType = '追善供養';
    } else {
      memorialType = '追善供養';
    }
  }

  // Reassemble in exact requested order: 戒名　忌日　志主　名字　名前
  const parts: string[] = [dharmaName, memorialType];
  if (sponsorName) {
    parts.push(`志主 ${sponsorName}`);
  }

  return parts.join(' ').replace(/[\s\u3000]+/g, ' ').trim();
};

export const extractTobaLines = (
  todo: TempleTodo,
  services?: MemorialService[],
  pastRecords?: PastRecord[]
): TobaLineItem[] => {
  // If relatedServiceId exists, retrieve true data from service
  let service: MemorialService | undefined;
  if (services && todo.relatedServiceId) {
    service = services.find((s) => s.id === todo.relatedServiceId);
  }

  if (!service && services) {
    if (todo.householdId) {
      service = services.find((s) => {
        if (s.householdId !== todo.householdId) return false;
        if (s.scheduledDate === todo.dueDate) return true;
        const sPrev = getPreviousDay(normalizeDateInput(s.scheduledDate) || s.scheduledDate);
        return sPrev === todo.dueDate;
      }) || services.find((s) => s.householdId === todo.householdId);
    } else if (todo.householdHeadName) {
      const normHead = normalizeKanjiVariant(todo.householdHeadName);
      service = services.find((s) => normalizeKanjiVariant(s.chiefMourner) === normHead);
    }
  }

  // 1. Check notes first for explicit 【塔婆明細】 section
  const rawNotes = todo.notes || '';
  const tobaDetailIndex = rawNotes.indexOf('【塔婆明細】');
  if (tobaDetailIndex !== -1) {
    const afterHeader = rawNotes.slice(tobaDetailIndex + '【塔婆明細】'.length);
    const nextHeaderMatch = afterHeader.search(/\n\s*【/);
    const detailSection = nextHeaderMatch !== -1 ? afterHeader.slice(0, nextHeaderMatch) : afterHeader;
    const detailLines = detailSection.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
    
    if (detailLines.length > 0) {
      return detailLines.map((rawL) => {
        const fallbackMem = resolveSpiritMemorialType(service?.memorialType, service?.dharmaName, service?.deceasedId, pastRecords, service?.scheduledDate || todo.dueDate);
        const formatted = formatSingleTobaLine(rawL, fallbackMem);
        return {
          formattedLine: formatted,
          dharmaName: '',
          memorialType: fallbackMem,
          sponsorName: '',
        };
      });
    }
  }

  // 2. If service has explicit tobaItems (detailed list)
  if (service?.tobaItems && service.tobaItems.length > 0) {
    return service.tobaItems.map((item) => {
      const dName = item.dharmaName || item.tamegaki || service?.dharmaName || '先祖代々';
      const mType = resolveSpiritMemorialType(item.memorialType || service?.memorialType, dName, service?.deceasedId, pastRecords, service?.scheduledDate || todo.dueDate);
      const sName = (item.sponsorName || service?.chiefMourner || todo.householdHeadName || '施主').replace(/(家|様)+$/g, '').trim();
      const formatted = formatSingleTobaLine(`${dName} ${mType} 志主 ${sName}`, mType);
      return {
        formattedLine: formatted,
        dharmaName: dName,
        memorialType: mType,
        sponsorName: sName,
      };
    });
  }

  // 3. If service has tobaSponsors array (multiple sponsors)
  if (service?.tobaSponsors && service.tobaSponsors.length > 0) {
    const mainDharma = service.dharmaName || (service.deceasedId && pastRecords?.find((p) => p.id === service.deceasedId)?.dharmaName) || (todo.householdHeadName ? `${todo.householdHeadName}家先祖代々` : '先祖代々');
    const mainMemorial = resolveSpiritMemorialType(service.memorialType, mainDharma, service.deceasedId, pastRecords, service.scheduledDate || todo.dueDate);
    const addDeceased = service.additionalDeceased || [];

    return service.tobaSponsors.map((sp, idx) => {
      const targetDeceased = idx === 0 ? null : addDeceased[idx - 1];
      const dName = targetDeceased?.dharmaName || mainDharma;
      const mType = targetDeceased ? resolveSpiritMemorialType(targetDeceased.memorialType, dName, targetDeceased.id, pastRecords, service?.scheduledDate || todo.dueDate) : mainMemorial;
      const sName = sp.replace(/(家|様)+$/g, '').trim() || service?.chiefMourner?.replace(/(家|様)+$/g, '').trim() || '施主';
      const formatted = formatSingleTobaLine(`${dName} ${mType} 志主 ${sName}`, mType);

      return {
        formattedLine: formatted,
        dharmaName: dName,
        memorialType: mType,
        sponsorName: sName,
      };
    });
  }

  // 4. Check notes for multi-line toba entries (e.g. 1.志主..., 2.志主...)
  const candidateLines = rawNotes.split('\n').map((l) => l.trim()).filter((l) => 
    l.length > 0 && (l.includes('志主') || l.includes('施主') || (l.includes('回忌') && (l.includes('大姉') || l.includes('居士') || l.includes('信士') || l.includes('信女'))))
  );

  if (candidateLines.length > 0 && candidateLines.some((l) => l.includes('志主') || l.includes('施主'))) {
    const fallbackMem = resolveSpiritMemorialType(service?.memorialType, service?.dharmaName, service?.deceasedId, pastRecords, service?.scheduledDate || todo.dueDate);
    return candidateLines.map((rawL) => ({
      formattedLine: formatSingleTobaLine(rawL, fallbackMem),
      dharmaName: '',
      memorialType: fallbackMem,
      sponsorName: '',
    }));
  }

  // 5. Fallback to single core info
  const core = extractTobaTaskCoreInfo(todo, services, pastRecords);
  const sName = (core.sponsorName || todo.householdHeadName || '施主').replace(/(家|様)+$/g, '').trim();
  const mType = resolveSpiritMemorialType(core.memorialType, core.dharmaName, service?.deceasedId, pastRecords, service?.scheduledDate || todo.dueDate);
  const dName = core.dharmaName || '先祖代々';
  const formatted = formatSingleTobaLine(`${dName} ${mType} 志主 ${sName}`, mType);
  return [{
    formattedLine: formatted,
    dharmaName: dName,
    memorialType: mType,
    sponsorName: sName,
    countInfo: core.countInfo,
  }];
};

// Helper to extract formatted toba lines directly from a MemorialService
export const extractServiceTobaLines = (
  service: MemorialService,
  pastRecords?: PastRecord[],
  templeTodos?: TempleTodo[],
  memorialServices?: MemorialService[]
): TobaLineItem[] => {
  // 1. If templeTodos are provided, check if a corresponding ToDo exists and extract directly from it
  if (templeTodos && templeTodos.length > 0) {
    const matchedTodo = templeTodos.find((t) => {
      const isToba = t.category === '塔婆' || t.category === '塔婆揮毫' || (t.title && t.title.includes('塔婆')) || (t.notes && t.notes.includes('塔婆'));
      if (!isToba) return false;
      if (t.relatedServiceId && t.relatedServiceId === service.id) return true;
      if (t.householdId && service.householdId && t.householdId === service.householdId) {
        const sDate = normalizeDateInput(service.scheduledDate) || service.scheduledDate;
        const tDate = normalizeDateInput(t.dueDate) || t.dueDate;
        if (sDate === tDate || getPreviousDay(sDate) === tDate) return true;
      }
      return false;
    });

    if (matchedTodo) {
      const lines = extractTobaLines(matchedTodo, memorialServices || [service], pastRecords);
      if (lines && lines.length > 0) {
        return lines;
      }
    }
  }

  // 2. If no matching ToDo in templeTodos, only check service properties if toba was explicitly configured on the service
  const hasExplicitToba = (service.tobaCount && service.tobaCount > 0) ||
    service.memorialType === '塔婆供養' ||
    service.memorialType === '塔婆' ||
    (service.tobaItems && service.tobaItems.length > 0) ||
    (service.tobaSponsors && service.tobaSponsors.length > 0) ||
    (service.notes && service.notes.includes('【塔婆明細】'));

  if (!hasExplicitToba) {
    return [];
  }

  // 3. Check notes for explicit 【塔婆明細】 section
  const rawNotes = service.notes || '';
  const tobaDetailIndex = rawNotes.indexOf('【塔婆明細】');
  if (tobaDetailIndex !== -1) {
    const afterHeader = rawNotes.slice(tobaDetailIndex + '【塔婆明細】'.length);
    const nextHeaderMatch = afterHeader.search(/\n\s*【/);
    const detailSection = nextHeaderMatch !== -1 ? afterHeader.slice(0, nextHeaderMatch) : afterHeader;
    const detailLines = detailSection.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
    
    if (detailLines.length > 0) {
      const fallbackMem = resolveSpiritMemorialType(service.memorialType, service.dharmaName, service.deceasedId, pastRecords, service.scheduledDate);
      return detailLines.map((rawL) => ({
        formattedLine: formatSingleTobaLine(rawL, fallbackMem),
        dharmaName: '',
        memorialType: fallbackMem,
        sponsorName: '',
      }));
    }
  }

  // 4. If service has explicit tobaItems
  if (service.tobaItems && service.tobaItems.length > 0) {
    return service.tobaItems.map((item) => {
      const dName = item.dharmaName || item.tamegaki || service.dharmaName || '先祖代々';
      const mType = resolveSpiritMemorialType(item.memorialType || service.memorialType, dName, service.deceasedId, pastRecords, service.scheduledDate);
      const sName = (item.sponsorName || service.chiefMourner || '施主').replace(/(家|様)+$/g, '').trim();
      const formatted = formatSingleTobaLine(`${dName} ${mType} 志主 ${sName}`, mType);
      return {
        formattedLine: formatted,
        dharmaName: dName,
        memorialType: mType,
        sponsorName: sName,
      };
    });
  }

  // 5. If service has tobaSponsors array
  if (service.tobaSponsors && service.tobaSponsors.length > 0) {
    const mainDharma = service.dharmaName || (service.deceasedId && pastRecords?.find((p) => p.id === service.deceasedId)?.dharmaName) || (service.chiefMourner ? `${service.chiefMourner.replace(/(家|様)+$/g, '')}家先祖代々` : '先祖代々');
    const mainMemorial = resolveSpiritMemorialType(service.memorialType, mainDharma, service.deceasedId, pastRecords, service.scheduledDate);
    const addDeceased = service.additionalDeceased || [];

    return service.tobaSponsors.map((sp, idx) => {
      const targetDeceased = idx === 0 ? null : addDeceased[idx - 1];
      const dName = targetDeceased?.dharmaName || mainDharma;
      const mType = targetDeceased ? resolveSpiritMemorialType(targetDeceased.memorialType, dName, targetDeceased.id, pastRecords, service.scheduledDate) : mainMemorial;
      const sName = sp.replace(/(家|様)+$/g, '').trim() || service.chiefMourner?.replace(/(家|様)+$/g, '').trim() || '施主';
      const formatted = formatSingleTobaLine(`${dName} ${mType} 志主 ${sName}`, mType);
      return {
        formattedLine: formatted,
        dharmaName: dName,
        memorialType: mType,
        sponsorName: sName,
      };
    });
  }

  // 6. Check notes for multi-line toba entries (e.g. 1.志主..., 2.志主...)
  const candidateLines = rawNotes.split('\n').map((l) => l.trim()).filter((l) => 
    l.length > 0 && (l.includes('志主') || l.includes('施主') || (l.includes('回忌') && (l.includes('大姉') || l.includes('居士') || l.includes('信士') || l.includes('信女'))))
  );

  if (candidateLines.length > 0 && candidateLines.some((l) => l.includes('志主') || l.includes('施主'))) {
    const fallbackMem = resolveSpiritMemorialType(service.memorialType, service.dharmaName, service.deceasedId, pastRecords, service.scheduledDate);
    return candidateLines.map((rawL) => ({
      formattedLine: formatSingleTobaLine(rawL, fallbackMem),
      dharmaName: '',
      memorialType: fallbackMem,
      sponsorName: '',
    }));
  }

  // 7. If tobaCount > 0 or 塔婆供養, generate lines
  const count = service.tobaCount || (service.memorialType === '塔婆供養' || service.memorialType === '塔婆' ? 1 : 0);
  if (count > 0) {
    const sName = (service.chiefMourner || '施主').replace(/(家|様)+$/g, '').trim();
    const dName = service.dharmaName || (service.deceasedId && pastRecords?.find((p) => p.id === service.deceasedId)?.dharmaName) || '先祖代々';
    const mType = resolveSpiritMemorialType(service.memorialType, dName, service.deceasedId, pastRecords, service.scheduledDate);
    const formatted = formatSingleTobaLine(`${dName} ${mType} 志主 ${sName}`, mType);
    return Array.from({ length: count }, () => ({
      formattedLine: formatted,
      dharmaName: dName,
      memorialType: mType,
      sponsorName: sName,
    }));
  }

  return [];
};

// Helper to extract and highlight only Dharma Name, Memorial Type, and Sponsor Name for Toba tasks
export const extractTobaTaskCoreInfo = (
  todo: TempleTodo,
  services?: MemorialService[],
  pastRecords?: PastRecord[]
) => {
  // If relatedServiceId exists, retrieve true data from service
  let service: MemorialService | undefined;
  if (services && todo.relatedServiceId) {
    service = services.find((s) => s.id === todo.relatedServiceId);
  }

  // Also check if we can match service by householdId and date / dueDate
  if (!service && services) {
    if (todo.householdId) {
      service = services.find((s) => {
        if (s.householdId !== todo.householdId) return false;
        if (s.scheduledDate === todo.dueDate) return true;
        // Check if dueDate is previous day
        const sPrev = getPreviousDay(normalizeDateInput(s.scheduledDate) || s.scheduledDate);
        return sPrev === todo.dueDate;
      }) || services.find((s) => s.householdId === todo.householdId);
    } else if (todo.householdHeadName) {
      const normHead = normalizeKanjiVariant(todo.householdHeadName);
      service = services.find((s) => normalizeKanjiVariant(s.chiefMourner) === normHead);
    }
  }

  const lines = (todo.notes || '').split('\n').map((l) => l.trim()).filter(Boolean);
  
  // 1. Primary Source: Exact dharmaName from the Memorial Service (予定・法要内容の「戒名・法名」欄)
  let dharmaName = service?.dharmaName?.trim() || '';
  let memorialType = service?.memorialType || '';
  let sponsorName = (service?.tobaSponsors || []).filter(Boolean).join('・') || service?.chiefMourner || '';
  let countInfo = service?.tobaCount ? `${service.tobaCount}本` : '';

  // 2. Parse lines in notes for explicit data if service dharmaName is not set
  lines.forEach((line) => {
    if (line.startsWith('法名:')) {
      const val = line.replace('法名:', '').trim();
      if (val && !dharmaName) {
        dharmaName = val;
      }
    } else if (line.startsWith('戒名:')) {
      const val = line.replace('戒名:', '').trim();
      if (val && !dharmaName) dharmaName = val;
    } else if (line.startsWith('回忌:')) {
      memorialType = memorialType || line.replace('回忌:', '').trim();
    } else if (line.startsWith('法要種別:')) {
      memorialType = memorialType || line.replace('法要種別:', '').trim();
    } else if (line.startsWith('志主名:') || line.startsWith('志主:')) {
      sponsorName = sponsorName || line.replace(/^志主(名)?:/, '').trim();
    } else if (line.startsWith('施主名:') || line.startsWith('施主:')) {
      sponsorName = sponsorName || line.replace(/^施主(名)?:/, '').trim();
    } else if (line.startsWith('本数:')) {
      countInfo = countInfo || line.replace('本数:', '').trim();
    } else if (line.startsWith('為書き:')) {
      const val = line.replace('為書き:', '').trim();
      if (val && !dharmaName) dharmaName = val;
    }
  });

  // 3. If service has deceasedId and dharmaName is still completely empty, check matching pastRecord
  if (!dharmaName && service?.deceasedId && pastRecords) {
    const p = pastRecords.find((r) => r.id === service?.deceasedId);
    if (p?.dharmaName) dharmaName = p.dharmaName;
  }

  // 4. Extract memorialType from title if missing
  if (!memorialType) {
    const memMatch = todo.title.match(/(一周忌|三回忌|七回忌|十三回忌|十七回忌|二十三回忌|二十七回忌|三十三回忌|五十回忌|百回忌|百箇日|四十九日|初七日|納骨法要|年忌法要|新盆|盆供養|棚経)/);
    if (memMatch) memorialType = memMatch[1];
  }

  // 5. Fallback parse from title if dharmaName still completely empty
  if (!dharmaName) {
    const cleanTitle = todo.title
      .replace(/^【塔婆(?:作成|揮毫)?】/, '')
      .replace(/【(.+?)】(?:塔婆作成|卒塔婆揮毫)?/, '$1')
      .replace(/(?:の卒塔婆揮毫|の塔婆作成|塔婆作成|卒塔婆揮毫).*/, '')
      .replace(/（.*）|\(.*\)/, '')
      .replace(/様$/, '')
      .trim();

    if (cleanTitle && cleanTitle !== todo.householdHeadName && cleanTitle !== sponsorName) {
      dharmaName = cleanTitle;
    }
  }

  if (!countInfo) {
    const countMatch = todo.title.match(/(\d+本)/);
    if (countMatch) countInfo = countMatch[1];
  }

  if (!sponsorName && todo.householdHeadName) {
    sponsorName = todo.householdHeadName;
  }

  // Clean sponsorName from trailing '様'
  if (sponsorName) {
    sponsorName = sponsorName.replace(/(家|様)+$/, '').trim();
  }

  if (!dharmaName) {
    dharmaName = service?.deceasedName || (todo.householdHeadName ? `${todo.householdHeadName}家先祖代々` : '先祖代々');
  }

  // Clean dharmaName from duplicated sponsor name prefix/suffix if present
  if (dharmaName && sponsorName) {
    const spRaw = sponsorName.replace(/\s+/g, '');
    dharmaName = dharmaName
      .replace(new RegExp(`^${sponsorName}\\s*`, 'g'), '')
      .replace(new RegExp(`\\s*${sponsorName}$`, 'g'), '')
      .replace(new RegExp(`^${spRaw}\\s*`, 'g'), '')
      .replace(new RegExp(`\\s*${spRaw}$`, 'g'), '')
      .trim();
  }

  const resolvedMemorial = resolveSpiritMemorialType(
    memorialType,
    dharmaName,
    service?.deceasedId,
    pastRecords,
    service?.scheduledDate || todo.dueDate
  );

  return {
    dharmaName,
    memorialType: resolvedMemorial,
    sponsorName: sponsorName || '施主',
    countInfo: countInfo || '',
  };
};

/**
 * 予定帳の会計入力等で、通夜・葬儀・枕経などのように予定自体に戒名がない場合に、
 * その家の過去帳から最新の戒名を取得して返却するヘルパー関数
 */
export const getServiceEffectiveDharmaInfo = (
  service: MemorialService | null | undefined,
  pastRecords: PastRecord[] = [],
  households: Household[] = []
): {
  dharmaName: string;
  secularName?: string;
  isLatestFallback: boolean;
} | null => {
  if (!service) return null;

  // 1. service に直接 dharmaName が入力されている場合
  if (service.dharmaName && service.dharmaName.trim()) {
    let secular = service.deceasedName?.trim();
    if (!secular && pastRecords) {
      const matchedPast = pastRecords.find(
        (p) =>
          (service.deceasedId && p.id === service.deceasedId) ||
          (p.dharmaName &&
            p.dharmaName.trim() === service.dharmaName?.trim() &&
            (!service.householdId || p.householdId === service.householdId)) ||
          (p.dharmaName && p.dharmaName.trim() === service.dharmaName?.trim())
      );
      secular = matchedPast?.secularName || matchedPast?.deceasedName;
    }
    return {
      dharmaName: service.dharmaName.trim(),
      secularName: secular,
      isLatestFallback: false,
    };
  }

  // 2. service に deceasedId があり、過去帳に合致するものがある場合
  if (service.deceasedId && pastRecords) {
    const p = pastRecords.find((r) => r.id === service.deceasedId);
    if (p && p.dharmaName && p.dharmaName.trim()) {
      return {
        dharmaName: p.dharmaName.trim(),
        secularName: p.secularName || p.deceasedName,
        isLatestFallback: false,
      };
    }
  }

  // 3. 通夜・葬儀・枕経、または予定自体に戒名がない場合：その家の最新の戒名を取得
  const cleanMourner = (service.chiefMourner || '').replace(/(家|様)+$/g, '').trim();

  let targetHouseholdId = service.householdId;
  if (!targetHouseholdId && cleanMourner) {
    const matchedHh = households.find((h) => {
      const sponsor = getHouseholdSponsorName(h) || h.familyHead || '';
      const hHead = sponsor.replace(/(家|様)+$/g, '').trim();
      const fHead = (h.familyHead || '').replace(/(家|様)+$/g, '').trim();
      return (
        (hHead && (hHead === cleanMourner || hHead.includes(cleanMourner) || cleanMourner.includes(hHead))) ||
        (fHead && (fHead === cleanMourner || fHead.includes(cleanMourner) || cleanMourner.includes(fHead)))
      );
    });
    if (matchedHh) {
      targetHouseholdId = matchedHh.id;
    }
  }

  let candidateRecords: PastRecord[] = [];
  if (targetHouseholdId) {
    candidateRecords = pastRecords.filter((p) => p.householdId === targetHouseholdId);
  }
  if (candidateRecords.length === 0 && cleanMourner) {
    candidateRecords = pastRecords.filter((p) => {
      const pHead = (p.householdHeadName || '').replace(/(家|様)+$/g, '').trim();
      return (
        pHead &&
        (pHead === cleanMourner ||
          pHead.includes(cleanMourner) ||
          cleanMourner.includes(pHead))
      );
    });
  }

  const withDharma = candidateRecords.filter((p) => p.dharmaName && p.dharmaName.trim());
  if (withDharma.length > 0) {
    const sorted = [...withDharma].sort((a, b) => {
      const normA = normalizeDateInput(a.deathDate || '') || '';
      const normB = normalizeDateInput(b.deathDate || '') || '';
      if (normA && normB) return normB.localeCompare(normA); // 新しい命日順（降順）
      if (normA && !normB) return -1;
      if (!normA && normB) return 1;
      const dateA = a.createdDate || a.createdAt || a.id || '';
      const dateB = b.createdDate || b.createdAt || b.id || '';
      return dateB.localeCompare(dateA);
    });

    const latest = sorted[0];
    return {
      dharmaName: latest.dharmaName.trim(),
      secularName: latest.secularName || latest.deceasedName,
      isLatestFallback: true,
    };
  }

  // 4. 戒名が過去帳にもないが、俗名が service.deceasedName にある場合
  if (service.deceasedName && service.deceasedName.trim()) {
    return {
      dharmaName: `(俗名) ${service.deceasedName.trim()}`,
      isLatestFallback: false,
    };
  }

  return null;
};

export const ReservationCalendarManager: React.FC<ReservationCalendarManagerProps> = ({
  memorialServices,
  households,
  pastRecords,
  templeInfo,
  temples = [],
  activeTempleId,
  transactions,
  templeTodos,
  priests = [],
  masterOptions,
  templeMasterOptionsMap,
  targetDate,
  onAddService,
  onUpdateService,
  onDeleteService,
  onAddTransaction,
  onAddBatchTransactions,
  onDeleteTransaction,
  onAddTodo,
  onUpdateTodo,
  onDeleteTodo,
  onUpdateHousehold,
  onBatchUpdateHouseholds,
  onNavigateToYearlyMilestones,
}) => {
  // Available income categories from Master or Defaults
  const availableIncomeCategories = useMemo(() => {
    const customCats = masterOptions?.incomeCategories || masterOptions?.accountingCategories || [];
    const defaults = [
      '法要布施',
      '塔婆料',
      '御車代・御膳料',
      '開眼・納骨布施',
      '読経料',
      '志納金',
      '護持会費',
      '特別寄付',
      '墓地管理費',
      'その他'
    ];
    return Array.from(new Set([...customCats, ...defaults])).filter(Boolean);
  }, [masterOptions]);

  // Sub-tabs
  const [subTab, setSubTab] = useState<'calendar' | 'list' | 'todos' | 'tanagyo'>('calendar');

  // Today reference
  const today = useMemo(() => new Date(), []);
  const todayStr = useMemo(() => {
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    return `${y}/${m}/${d}`;
  }, [today]);

  // Calendar view states
  const [currentYear, setCurrentYear] = useState<number>(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState<number>(today.getMonth() + 1); // 1-12
  const [selectedDateStr, setSelectedDateStr] = useState<string>(todayStr);

  // Sync calendar view when targetDate changes
  useEffect(() => {
    if (targetDate) {
      const norm = normalizeDateInput(targetDate) || targetDate;
      const parts = norm.split('/');
      if (parts.length >= 3) {
        const y = Number(parts[0]);
        const m = Number(parts[1]);
        if (!isNaN(y) && !isNaN(m) && y > 0 && m >= 1 && m <= 12) {
          setCurrentYear(y);
          setCurrentMonth(m);
          setSelectedDateStr(norm);
          setSubTab('calendar');
        }
      }
    }
  }, [targetDate]);

  // Filters for Reservation List
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');

  // --- お盆棚経・巡回計画ステート ---
  const [tanagyoSearchTerm, setTanagyoSearchTerm] = useState('');
  const [tanagyoPriestFilter, setTanagyoPriestFilter] = useState<string>('ALL');
  const [tanagyoActiveSection, setTanagyoActiveSection] = useState<'all' | 'unassigned' | 'assigned'>('all');

  // 印刷プレビューモーダル用ステート
  const [printModalPriestData, setPrintModalPriestData] = useState<{
    priestName: string;
    priestRole?: string;
    priestTemple?: string;
    dates: {
      date: string;
      slots: {
        timeSlot: string;
        households: Household[];
        routeUrl: string;
        routeSegments: TanagyoRouteSegment[];
      }[];
    }[];
  } | null>(null);

  // 枠間振替モーダル用ステート
  const [transferModalHousehold, setTransferModalHousehold] = useState<Household | null>(null);
  const [transferPriestId, setTransferPriestId] = useState('');
  const [transferDate, setTransferDate] = useState('');
  const [transferTimeSlot, setTransferTimeSlot] = useState('');

  // 訪問日程クイック候補（3枠）ステート（7月盆、8月盆、月参り等にカスタマイズ可能）
  const [tanagyoDateCandidates, setTanagyoDateCandidates] = useState<string[]>(() => {
    try {
      const saved = safeStorage.getItem('temple_tanagyo_date_candidates');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length >= 3) {
          return [parsed[0] || '8/13', parsed[1] || '8/14', parsed[2] || '8/15'];
        }
      }
    } catch (e) {
      console.warn('Failed to parse saved tanagyo date candidates:', e);
    }
    return ['8/13', '8/14', '8/15'];
  });

  const handleUpdateCandidateDate = (index: number, val: string) => {
    const updated = [...tanagyoDateCandidates];
    updated[index] = val;
    setTanagyoDateCandidates(updated);
    safeStorage.setItem('temple_tanagyo_date_candidates', JSON.stringify(updated));
  };

  const handleApplyDatePreset = (presetDates: [string, string, string]) => {
    setTanagyoDateCandidates(presetDates);
    safeStorage.setItem('temple_tanagyo_date_candidates', JSON.stringify(presetDates));
  };

  // ドラッグ＆ドロップ管理用ステート
  const [draggedTanagyo, setDraggedTanagyo] = useState<{
    householdId: string;
    sourcePriestId?: string;
    sourcePriestName?: string;
    sourceDate?: string;
    sourceTimeSlot?: string;
    sourceIndex?: number;
    isUnassigned?: boolean;
  } | null>(null);
  const [dropTargetSlotKey, setDropTargetSlotKey] = useState<string | null>(null);
  const [dropTargetHouseholdId, setDropTargetHouseholdId] = useState<string | null>(null);
  const [dropTargetPosition, setDropTargetPosition] = useState<'before' | 'after' | null>(null);
  const [isDropTargetUnassignedArea, setIsDropTargetUnassignedArea] = useState<boolean>(false);
  const [isTanagyoNoticeModalOpen, setIsTanagyoNoticeModalOpen] = useState<boolean>(false);
  const [isTanagyoMapModalOpen, setIsTanagyoMapModalOpen] = useState<boolean>(false);
  const [isTanagyoAccountingModalOpen, setIsTanagyoAccountingModalOpen] = useState<boolean>(false);
  const [tanagyoTempleFilter, setTanagyoTempleFilter] = useState<string>('ALL');

  // 全割当リセットの確認モーダル状態と通知メッセージ
  const [showTanagyoResetConfirmModal, setShowTanagyoResetConfirmModal] = useState<boolean>(false);
  const [tanagyoResetSuccessMessage, setTanagyoResetSuccessMessage] = useState<string | null>(null);

  // 日程候補を追加・保持するハンドラ
  const handleAddCandidateDate = (newDate: string) => {
    const clean = newDate.trim();
    if (!clean) return;
    if (!tanagyoDateCandidates.includes(clean)) {
      const updated = [...tanagyoDateCandidates, clean];
      setTanagyoDateCandidates(updated);
      safeStorage.setItem('temple_tanagyo_date_candidates', JSON.stringify(updated));
    }
  };

  // 1. 棚経対象の全檀信徒
  const tanagyoPatronHouseholds = useMemo(() => {
    return households.filter((h) => !!h.tanagyoMonthlyVisit);
  }, [households]);

  // 判定ヘルパー: 日程および担当僧侶が割り当て済みか（時間帯未指定でも割当済みとして巡回計画表に表示）
  const isTanagyoFullyAssigned = (h: Household) => {
    return Boolean(
      h.tanagyoDate &&
      h.tanagyoDate.trim().length > 0 &&
      (h.tanagyoPriestName || h.tanagyoPriestId)
    );
  };

  // 2. 未割当リスト（住所順でソート）
  const unassignedTanagyoList = useMemo(() => {
    return tanagyoPatronHouseholds
      .filter((h) => !isTanagyoFullyAssigned(h))
      .filter((h) => {
        if (tanagyoTempleFilter !== 'ALL') {
          const mainTemple = temples?.find((t) => t.isMain) || temples?.[0];
          const mainTempleId = mainTemple?.id || templeInfo?.id || 'temple-main';
          const hTempleId = h.templeId || mainTempleId;
          if (hTempleId !== tanagyoTempleFilter) return false;
        }
        return true;
      })
      .filter((h) => {
        if (!tanagyoSearchTerm) return true;
        const q = tanagyoSearchTerm.toLowerCase();
        const addr = (h.tanagyoAddress || h.address || '').toLowerCase();
        const name = (h.familyHead || '').toLowerCase();
        const dist = (h.district || '').toLowerCase();
        const phone = (h.phone || h.mobile || '').toLowerCase();
        return addr.includes(q) || name.includes(q) || dist.includes(q) || phone.includes(q);
      })
      .sort((a, b) => {
        const addrA = a.tanagyoAddress || a.address || '';
        const addrB = b.tanagyoAddress || b.address || '';
        return addrA.localeCompare(addrB, 'ja');
      });
  }, [tanagyoPatronHouseholds, tanagyoSearchTerm, tanagyoTempleFilter, temples, templeInfo]);

  // 3. 割当済みリスト（担当別 → 日程順 → 午前/午後順 → 順序tanagyoOrder順）
  const assignedTanagyoGroups = useMemo(() => {
    const assigned = tanagyoPatronHouseholds.filter((h) => isTanagyoFullyAssigned(h));
    
    // 検索フィルタ
    const filteredAssigned = assigned.filter((h) => {
      if (tanagyoTempleFilter !== 'ALL') {
        const mainTemple = temples?.find((t) => t.isMain) || temples?.[0];
        const mainTempleId = mainTemple?.id || templeInfo?.id || 'temple-main';
        const hTempleId = h.templeId || mainTempleId;
        if (hTempleId !== tanagyoTempleFilter) return false;
      }
      if (tanagyoPriestFilter !== 'ALL') {
        if (h.tanagyoPriestId !== tanagyoPriestFilter && h.tanagyoPriestName !== tanagyoPriestFilter) {
          return false;
        }
      }
      if (!tanagyoSearchTerm) return true;
      const q = tanagyoSearchTerm.toLowerCase();
      const addr = (h.tanagyoAddress || h.address || '').toLowerCase();
      const name = (h.familyHead || '').toLowerCase();
      const dist = (h.district || '').toLowerCase();
      const phone = (h.phone || h.mobile || '').toLowerCase();
      return addr.includes(q) || name.includes(q) || dist.includes(q) || phone.includes(q);
    });

    // 担当僧侶ごとにグルーピング
    const priestMap = new Map<string, Household[]>();
    filteredAssigned.forEach((h) => {
      const pName = h.tanagyoPriestName || '担当未定';
      if (!priestMap.has(pName)) {
        priestMap.set(pName, []);
      }
      priestMap.get(pName)!.push(h);
    });

    const groups: {
      priestName: string;
      priestId?: string;
      priestRole?: string;
      priestTemple?: string;
      totalCount: number;
      dates: {
        date: string;
        slots: {
          timeSlot: string;
          households: Household[];
          routeUrl: string;
          routeSegments: TanagyoRouteSegment[];
        }[];
      }[];
    }[] = [];

    priestMap.forEach((pList, pName) => {
      const matchedPriest = priests.find((p) => p.name === pName || p.id === pList[0]?.tanagyoPriestId);

      // 日程ごとにグルーピング
      const dateMap = new Map<string, Household[]>();
      pList.forEach((h) => {
        const d = h.tanagyoDate || '日程未定';
        if (!dateMap.has(d)) {
          dateMap.set(d, []);
        }
        dateMap.get(d)!.push(h);
      });

      // 日程順ソート（例: "8/13", "8/14" など）
      const sortedDates = Array.from(dateMap.keys()).sort((a, b) => a.localeCompare(b, 'ja', { numeric: true }));

      const datesData = sortedDates.map((d) => {
        const dList = dateMap.get(d)!;
        
        // 午前・午後に分類
        const amList = dList.filter((h) => h.tanagyoTimeSlot === '午前').sort((a, b) => (a.tanagyoOrder ?? 9999) - (b.tanagyoOrder ?? 9999));
        const pmList = dList.filter((h) => h.tanagyoTimeSlot === '午後').sort((a, b) => (a.tanagyoOrder ?? 9999) - (b.tanagyoOrder ?? 9999));
        const otherList = dList.filter((h) => h.tanagyoTimeSlot !== '午前' && h.tanagyoTimeSlot !== '午後').sort((a, b) => (a.tanagyoOrder ?? 9999) - (b.tanagyoOrder ?? 9999));

        const slots: { timeSlot: string; households: Household[]; routeUrl: string; routeSegments: TanagyoRouteSegment[] }[] = [];

        if (amList.length > 0) {
          const addrs = amList.map((h) => h.tanagyoAddress || h.address || '').filter(Boolean);
          const routeSegments = getTanagyoRouteSegments(amList);
          slots.push({
            timeSlot: '午前',
            households: amList,
            routeUrl: routeSegments[0]?.routeUrl || getTanagyoRouteUrl(addrs),
            routeSegments,
          });
        }
        if (pmList.length > 0) {
          const addrs = pmList.map((h) => h.tanagyoAddress || h.address || '').filter(Boolean);
          const routeSegments = getTanagyoRouteSegments(pmList);
          slots.push({
            timeSlot: '午後',
            households: pmList,
            routeUrl: routeSegments[0]?.routeUrl || getTanagyoRouteUrl(addrs),
            routeSegments,
          });
        }
        if (otherList.length > 0) {
          const addrs = otherList.map((h) => h.tanagyoAddress || h.address || '').filter(Boolean);
          const routeSegments = getTanagyoRouteSegments(otherList);
          slots.push({
            timeSlot: '時間未定',
            households: otherList,
            routeUrl: routeSegments[0]?.routeUrl || getTanagyoRouteUrl(addrs),
            routeSegments,
          });
        }

        return {
          date: d,
          slots,
        };
      });

      groups.push({
        priestName: pName,
        priestId: matchedPriest?.id,
        priestRole: matchedPriest?.role,
        priestTemple: matchedPriest?.templeName,
        totalCount: pList.length,
        dates: datesData,
      });
    });

    // 担当名順でソート
    return groups.sort((a, b) => a.priestName.localeCompare(b.priestName, 'ja'));
  }, [tanagyoPatronHouseholds, tanagyoSearchTerm, tanagyoPriestFilter, priests]);

  // 未割当リストからの即時割当ハンドラー
  const handleAssignTanagyo = (household: Household, date: string, timeSlot: string, priestId: string) => {
    const foundPriest = priests.find((p) => p.id === priestId);
    const priestName = foundPriest ? foundPriest.name : (priestId || '');

    // 既存の同一枠内の世帯一覧
    const existingInSlot = tanagyoPatronHouseholds
      .filter(
        (h) =>
          h.id !== household.id &&
          (h.tanagyoPriestId === priestId || h.tanagyoPriestName === priestName) &&
          h.tanagyoDate === date &&
          h.tanagyoTimeSlot === timeSlot
      )
      .sort((a, b) => (a.tanagyoOrder ?? 9999) - (b.tanagyoOrder ?? 9999));

    const newAssigned: Household = {
      ...household,
      tanagyoMonthlyVisit: true,
      tanagyoDate: date,
      tanagyoTimeSlot: timeSlot,
      tanagyoPriestId: priestId,
      tanagyoPriestName: priestName,
      tanagyoOrder: existingInSlot.length + 1,
    };

    // 同一スロット内の全世帯を1..Nに確実に正規化
    const allSlotHouseholds = [...existingInSlot, newAssigned].map((h, idx) => ({
      ...h,
      tanagyoMonthlyVisit: true,
      tanagyoDate: date,
      tanagyoTimeSlot: timeSlot,
      tanagyoPriestId: priestId,
      tanagyoPriestName: priestName,
      tanagyoOrder: idx + 1,
    }));

    if (onBatchUpdateHouseholds) {
      onBatchUpdateHouseholds(allSlotHouseholds, `棚経「${household.familyHead}」を ${priestName} ${date} ${timeSlot} (順序:${allSlotHouseholds.length}) に割当`);
    } else if (onUpdateHousehold) {
      allSlotHouseholds.forEach((h) => onUpdateHousehold(h));
    }
  };

  // ドラッグ＆ドロップ移動ハンドラー（担当、日程、時間帯、順番を横断して移動）
  const handleTanagyoDrop = (
    targetPriestId: string,
    targetPriestName: string,
    targetDate: string,
    targetTimeSlot: string,
    targetHouseholdId?: string | null,
    targetPosition?: 'before' | 'after' | null,
    fallbackHouseholdId?: string
  ) => {
    const activeHouseholdId = draggedTanagyo?.householdId || fallbackHouseholdId;
    if (!activeHouseholdId) return;

    const draggedHh = households.find((h) => h.id === activeHouseholdId);
    if (!draggedHh) {
      setDraggedTanagyo(null);
      setDropTargetSlotKey(null);
      setDropTargetHouseholdId(null);
      setDropTargetPosition(null);
      return;
    }

    // ドロップ先の既存世帯一覧（draggedHh を除外したもの）
    const existingInTarget = tanagyoPatronHouseholds
      .filter(
        (h) =>
          h.id !== draggedHh.id &&
          (h.tanagyoPriestId === targetPriestId || h.tanagyoPriestName === targetPriestName) &&
          h.tanagyoDate === targetDate &&
          h.tanagyoTimeSlot === targetTimeSlot
      )
      .sort((a, b) => (a.tanagyoOrder ?? 9999) - (b.tanagyoOrder ?? 9999));

    // 挿入位置の決定
    let insertIdx = existingInTarget.length;
    if (targetHouseholdId) {
      const matchIdx = existingInTarget.findIndex((h) => h.id === targetHouseholdId);
      if (matchIdx !== -1) {
        insertIdx = targetPosition === 'after' ? matchIdx + 1 : matchIdx;
      }
    }

    // 移動後のドラッグ世帯オブジェクト
    const updatedDraggedHh: Household = {
      ...draggedHh,
      tanagyoMonthlyVisit: true,
      tanagyoPriestId: targetPriestId,
      tanagyoPriestName: targetPriestName,
      tanagyoDate: targetDate,
      tanagyoTimeSlot: targetTimeSlot,
    };

    // 新しいドロップ先スロット配列を作成して挿入
    const newTargetSlotList = [...existingInTarget];
    newTargetSlotList.splice(insertIdx, 0, updatedDraggedHh);

    // ドロップ先スロットの全世帯の担当・日程・時間帯・tanagyoOrder を 1, 2, 3... に再採番
    const updatedTargetList = newTargetSlotList.map((h, idx) => ({
      ...h,
      tanagyoMonthlyVisit: true,
      tanagyoPriestId: targetPriestId,
      tanagyoPriestName: targetPriestName,
      tanagyoDate: targetDate,
      tanagyoTimeSlot: targetTimeSlot,
      tanagyoOrder: idx + 1,
    }));

    // 移動元が別の割当スロットだった場合、移動元スロットの tanagyoOrder も再採番
    const isDifferentSlot =
      draggedTanagyo &&
      !draggedTanagyo.isUnassigned &&
      (draggedTanagyo.sourcePriestId !== targetPriestId ||
        draggedTanagyo.sourcePriestName !== targetPriestName ||
        draggedTanagyo.sourceDate !== targetDate ||
        draggedTanagyo.sourceTimeSlot !== targetTimeSlot);

    let updatedSourceList: Household[] = [];
    if (isDifferentSlot && draggedTanagyo.sourceDate && draggedTanagyo.sourceTimeSlot) {
      const remainingInSource = tanagyoPatronHouseholds
        .filter(
          (h) =>
            h.id !== draggedHh.id &&
            (h.tanagyoPriestId === draggedTanagyo.sourcePriestId || h.tanagyoPriestName === draggedTanagyo.sourcePriestName) &&
            h.tanagyoDate === draggedTanagyo.sourceDate &&
            h.tanagyoTimeSlot === draggedTanagyo.sourceTimeSlot
        )
        .sort((a, b) => (a.tanagyoOrder ?? 9999) - (b.tanagyoOrder ?? 9999));

      updatedSourceList = remainingInSource.map((h, idx) => ({
        ...h,
        tanagyoOrder: idx + 1,
      }));
    }

    const allToUpdate = [...updatedTargetList, ...updatedSourceList];

    if (onBatchUpdateHouseholds) {
      onBatchUpdateHouseholds(
        allToUpdate,
        `棚経「${draggedHh.familyHead}」を ${targetPriestName} ${targetDate} ${targetTimeSlot} (順序:${insertIdx + 1}) へ移動`
      );
    } else if (onUpdateHousehold) {
      allToUpdate.forEach((h) => onUpdateHousehold(h));
    }

    setDraggedTanagyo(null);
    setDropTargetSlotKey(null);
    setDropTargetHouseholdId(null);
    setDropTargetPosition(null);
    setIsDropTargetUnassignedArea(false);
  };

  // 未割当エリアへのドロップ（割当解除）
  const handleDropToUnassigned = (fallbackHouseholdId?: string) => {
    const activeHouseholdId = draggedTanagyo?.householdId || fallbackHouseholdId;
    if (!activeHouseholdId) return;

    const draggedHh = households.find((h) => h.id === activeHouseholdId);
    if (!draggedHh) {
      setDraggedTanagyo(null);
      setDropTargetSlotKey(null);
      setDropTargetHouseholdId(null);
      setDropTargetPosition(null);
      setIsDropTargetUnassignedArea(false);
      return;
    }

    const cleared: Household = {
      ...draggedHh,
      tanagyoDate: '',
      tanagyoTimeSlot: '',
      tanagyoPriestId: '',
      tanagyoPriestName: '',
      tanagyoOrder: undefined,
    };

    let updatedSourceList: Household[] = [];
    if (draggedTanagyo && !draggedTanagyo.isUnassigned && draggedTanagyo.sourceDate && draggedTanagyo.sourceTimeSlot) {
      const remainingInSource = tanagyoPatronHouseholds
        .filter(
          (h) =>
            h.id !== draggedHh.id &&
            (h.tanagyoPriestId === draggedTanagyo.sourcePriestId || h.tanagyoPriestName === draggedTanagyo.sourcePriestName) &&
            h.tanagyoDate === draggedTanagyo.sourceDate &&
            h.tanagyoTimeSlot === draggedTanagyo.sourceTimeSlot
        )
        .sort((a, b) => (a.tanagyoOrder ?? 9999) - (b.tanagyoOrder ?? 9999));

      updatedSourceList = remainingInSource.map((h, idx) => ({
        ...h,
        tanagyoOrder: idx + 1,
      }));
    }

    const allToUpdate = [cleared, ...updatedSourceList];

    if (onBatchUpdateHouseholds) {
      onBatchUpdateHouseholds(allToUpdate, `棚経「${draggedHh.familyHead}」の割当を解除して未割当へ移動`);
    } else if (onUpdateHousehold) {
      allToUpdate.forEach((h) => onUpdateHousehold(h));
    }

    setDraggedTanagyo(null);
    setDropTargetSlotKey(null);
    setDropTargetHouseholdId(null);
    setDropTargetPosition(null);
    setIsDropTargetUnassignedArea(false);
  };

  // 同一スロット内での上下並び替え
  const handleMoveTanagyoSlotOrder = (slotHouseholds: Household[], index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index <= 0) return;
    if (direction === 'down' && index >= slotHouseholds.length - 1) return;

    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    const reordered = [...slotHouseholds];
    const temp = reordered[index];
    reordered[index] = reordered[targetIdx];
    reordered[targetIdx] = temp;

    // tanagyoOrder を 1, 2, 3... に再採番
    const updatedList = reordered.map((h, i) => ({
      ...h,
      tanagyoOrder: i + 1,
    }));

    if (onBatchUpdateHouseholds) {
      onBatchUpdateHouseholds(updatedList, '棚経巡回順序の変更');
    } else if (onUpdateHousehold) {
      updatedList.forEach((h) => onUpdateHousehold(h));
    }
  };

  // 枠間移動モーダルからの実行
  const handleExecuteTransfer = (
    household: Household,
    targetPriestId: string,
    targetDate: string,
    targetTimeSlot: string
  ) => {
    if (!targetDate || !targetTimeSlot || !targetPriestId) {
      alert('担当僧侶、訪問日、時間帯をすべて指定してください。');
      return;
    }

    const foundPriest = priests.find((p) => p.id === targetPriestId);
    const targetPriestName = foundPriest ? foundPriest.name : targetPriestId;

    // 移動先の枠の現在の世帯一覧を探す
    const existingInTarget = tanagyoPatronHouseholds.filter(
      (h) =>
        h.id !== household.id &&
        (h.tanagyoPriestId === targetPriestId || h.tanagyoPriestName === targetPriestName) &&
        h.tanagyoDate === targetDate &&
        h.tanagyoTimeSlot === targetTimeSlot
    ).sort((a, b) => (a.tanagyoOrder ?? 9999) - (b.tanagyoOrder ?? 9999));

    const movedHousehold: Household = {
      ...household,
      tanagyoMonthlyVisit: true,
      tanagyoPriestId: targetPriestId,
      tanagyoPriestName: targetPriestName,
      tanagyoDate: targetDate,
      tanagyoTimeSlot: targetTimeSlot,
      tanagyoOrder: existingInTarget.length + 1,
    };

    const targetListToUpdate = [...existingInTarget, movedHousehold].map((h, i) => ({
      ...h,
      tanagyoMonthlyVisit: true,
      tanagyoPriestId: targetPriestId,
      tanagyoPriestName: targetPriestName,
      tanagyoDate: targetDate,
      tanagyoTimeSlot: targetTimeSlot,
      tanagyoOrder: i + 1,
    }));

    // 移動元の枠の残り世帯一覧を探して再採番
    const remainingInSource = tanagyoPatronHouseholds.filter(
      (h) =>
        h.id !== household.id &&
        (
          (household.tanagyoPriestId && h.tanagyoPriestId === household.tanagyoPriestId) ||
          (household.tanagyoPriestName && h.tanagyoPriestName === household.tanagyoPriestName) ||
          (!household.tanagyoPriestId && !household.tanagyoPriestName)
        ) &&
        h.tanagyoDate === household.tanagyoDate &&
        h.tanagyoTimeSlot === household.tanagyoTimeSlot
    ).sort((a, b) => (a.tanagyoOrder ?? 9999) - (b.tanagyoOrder ?? 9999));

    const sourceListToUpdate = remainingInSource.map((h, i) => ({
      ...h,
      tanagyoOrder: i + 1,
    }));

    const allToUpdate = [...targetListToUpdate, ...sourceListToUpdate];

    if (onBatchUpdateHouseholds) {
      onBatchUpdateHouseholds(allToUpdate, `棚経「${household.familyHead}」を ${targetPriestName} ${targetDate} ${targetTimeSlot} へ移動`);
    } else if (onUpdateHousehold) {
      allToUpdate.forEach((h) => onUpdateHousehold(h));
    }

    setTransferModalHousehold(null);
  };

  // 割当クリア実行（未割当リストへ直接戻す）
  const handleClearTanagyoAssignment = (household: Household) => {
    const cleared: Household = {
      ...household,
      tanagyoDate: '',
      tanagyoTimeSlot: '',
      tanagyoPriestId: '',
      tanagyoPriestName: '',
      tanagyoOrder: undefined,
    };

    // 元スロットの再採番
    const remainingInSource = tanagyoPatronHouseholds
      .filter(
        (h) =>
          h.id !== household.id &&
          (
            (household.tanagyoPriestId && h.tanagyoPriestId === household.tanagyoPriestId) ||
            (household.tanagyoPriestName && h.tanagyoPriestName === household.tanagyoPriestName) ||
            (!household.tanagyoPriestId && !household.tanagyoPriestName)
          ) &&
          h.tanagyoDate === household.tanagyoDate &&
          h.tanagyoTimeSlot === household.tanagyoTimeSlot
      )
      .sort((a, b) => (a.tanagyoOrder ?? 9999) - (b.tanagyoOrder ?? 9999));

    const updatedSource = remainingInSource.map((h, idx) => ({
      ...h,
      tanagyoOrder: idx + 1,
    }));

    const allToUpdate = [cleared, ...updatedSource];

    if (onBatchUpdateHouseholds) {
      onBatchUpdateHouseholds(allToUpdate, `棚経「${household.familyHead}」の割当を解除`);
    } else if (onUpdateHousehold) {
      allToUpdate.forEach((h) => onUpdateHousehold(h));
    }
  };

  // スロット単体の巡回順序を 1..N に再採番・確定
  const handleNormalizeSlotOrder = (slotHouseholds: Household[]) => {
    const updates = slotHouseholds.map((h, idx) => ({
      ...h,
      tanagyoOrder: idx + 1,
    }));
    if (onBatchUpdateHouseholds) {
      onBatchUpdateHouseholds(updates, '棚経スロットの巡回順序を再採番・保存');
    } else if (onUpdateHousehold) {
      updates.forEach((h) => onUpdateHousehold(h));
    }
  };

  // 全割当スロットの巡回順序（tanagyoOrder）を現在の表示順そのままに 1..N に確定・一括保存
  const handleNormalizeAllTanagyoOrders = () => {
    const assigned = tanagyoPatronHouseholds.filter((h) => isTanagyoFullyAssigned(h));
    if (assigned.length === 0) {
      alert('割当済みの棚経世帯がありません。');
      return;
    }

    const updates: Household[] = [];
    assignedTanagyoGroups.forEach((pGroup) => {
      pGroup.dates.forEach((dObj) => {
        dObj.slots.forEach((slot) => {
          slot.households.forEach((h, idx) => {
            updates.push({
              ...h,
              tanagyoOrder: idx + 1,
            });
          });
        });
      });
    });

    if (updates.length > 0) {
      if (onBatchUpdateHouseholds) {
        onBatchUpdateHouseholds(updates, `全棚経スロットの巡回順序を一括正規化・保存 (${updates.length}件)`);
      } else if (onUpdateHousehold) {
        updates.forEach((h) => onUpdateHousehold(h));
      }
      alert(`全 ${updates.length} 件の棚経世帯の巡回順序（No.1〜）を確定・保存しました。\nGoogleスプレッドシートやExcel書き出しにも正常に反映されます。`);
    }
  };

  // 全割当リセット確認ダイアログを開く
  const handleResetAllTanagyoAssignments = () => {
    setShowTanagyoResetConfirmModal(true);
  };

  // 全棚経対象者の割当を未割当に戻すリセット実行（地図上のリセット機能と完全に同じ確認UI・安全仕様）
  const handleExecuteResetAllTanagyo = () => {
    const isFiltered = tanagyoTempleFilter !== 'ALL';
    const targetTemple = isFiltered ? temples?.find((t) => t.id === tanagyoTempleFilter) : null;
    const targetName = targetTemple ? `【${targetTemple.name}】` : '全寺院';

    const mainTemple = temples?.find((t) => t.isMain) || temples?.[0];
    const mainTempleId = mainTemple?.id || templeInfo?.id || 'temple-main';

    // 何らかの棚経割当情報（訪問日程・時間帯・担当僧侶ID/名・巡回順序）が設定されている世帯を抽出
    const assignedPatrons = tanagyoPatronHouseholds.filter((h) => {
      if (tanagyoTempleFilter !== 'ALL') {
        const hTempleId = h.templeId || mainTempleId;
        if (hTempleId !== tanagyoTempleFilter) return false;
      }
      return Boolean(
        (h.tanagyoDate && h.tanagyoDate.trim().length > 0) ||
        (h.tanagyoTimeSlot && h.tanagyoTimeSlot.trim().length > 0) ||
        (h.tanagyoPriestId && h.tanagyoPriestId.trim().length > 0) ||
        (h.tanagyoPriestName && h.tanagyoPriestName.trim().length > 0) ||
        (typeof h.tanagyoOrder === 'number')
      );
    });

    if (assignedPatrons.length === 0) {
      setShowTanagyoResetConfirmModal(false);
      setTanagyoResetSuccessMessage(`${targetName}の棚経対象世帯は、すでにすべて未割当の状態です。`);
      setTimeout(() => setTanagyoResetSuccessMessage(null), 4000);
      return;
    }

    const clearedHouseholds = assignedPatrons.map((h) => ({
      ...h,
      tanagyoDate: '',
      tanagyoTimeSlot: '',
      tanagyoPriestId: '',
      tanagyoPriestName: '',
      tanagyoOrder: undefined,
    }));

    if (onBatchUpdateHouseholds) {
      onBatchUpdateHouseholds(clearedHouseholds, `棚経割当を一括解除・未割当へリセット（${targetName}・${assignedPatrons.length}軒）`);
    } else if (onUpdateHousehold) {
      clearedHouseholds.forEach((h) => onUpdateHousehold(h));
    }

    setShowTanagyoResetConfirmModal(false);
    setTanagyoResetSuccessMessage(`${targetName}の棚経割当（${clearedHouseholds.length}軒）をすべて解除し、未割当にリセットしました。`);
    setTimeout(() => setTanagyoResetSuccessMessage(null), 4000);
  };

  const defaultTempleVenue = `${templeInfo?.name || '自寺'} 本堂`;

  // Helper to check if a service is a household memorial service (accounting & memorial list applicable)
  const isHouseholdMemorialService = (s: { memorialType?: string; householdId?: string; chiefMourner?: string }) => {
    const nonHouseholdTypes = [
      '寺院行事',
      '他寺院助法・出向',
      '会議・教区・公務',
      '住職個人用務・私用',
      '地域行事',
    ];
    if (s.memorialType && nonHouseholdTypes.includes(s.memorialType)) {
      return false;
    }
    return true;
  };

  // Helper to format chief mourner name cleanly without double "様"
  const formatChiefMournerDisplay = (name?: string) => {
    if (!name || !name.trim()) return '';
    const trimmed = name.trim();
    if (trimmed.endsWith('様')) {
      return trimmed;
    }
    return `${trimmed} 様`;
  };

  // Helper to determine if a service belongs to an affiliated (sub) temple
  const isAffiliatedTempleService = (s: MemorialService): boolean => {
    const mainTemple = temples.find((t) => t.isMain);
    const mainTempleId = mainTemple?.id || 'temple-main';
    
    let targetTempleId = s.templeId;
    if (!targetTempleId && s.householdId) {
      const hh = households.find((h) => h.id === s.householdId);
      targetTempleId = hh?.templeId;
    }
    if (!targetTempleId && s.deceasedId) {
      const pr = pastRecords.find((r) => r.id === s.deceasedId);
      targetTempleId = pr?.templeId;
    }
    
    return Boolean(targetTempleId && targetTempleId !== mainTempleId && targetTempleId !== 'temple-main');
  };

  // Helper to get temple info for a service
  const getServiceTempleInfo = (s: MemorialService): { id?: string; name: string; isAffiliated: boolean } => {
    const mainTemple = temples.find((t) => t.isMain);
    const mainTempleId = mainTemple?.id || 'temple-main';
    
    let targetTempleId = s.templeId;
    if (!targetTempleId && s.householdId) {
      const hh = households.find((h) => h.id === s.householdId);
      targetTempleId = hh?.templeId;
    }
    if (!targetTempleId && s.deceasedId) {
      const pr = pastRecords.find((r) => r.id === s.deceasedId);
      targetTempleId = pr?.templeId;
    }

    if (targetTempleId && targetTempleId !== mainTempleId && targetTempleId !== 'temple-main') {
      const t = temples.find((item) => item.id === targetTempleId);
      return { id: targetTempleId, name: t?.name || '兼務寺', isAffiliated: true };
    }
    return { id: mainTempleId, name: templeInfo?.name || '本寺', isAffiliated: false };
  };

  // Helper to get temple info for a todo
  const getTodoTempleInfo = (t: TempleTodo): { id?: string; name: string; isAffiliated: boolean } => {
    const mainTemple = temples.find((item) => item.isMain);
    const mainTempleId = mainTemple?.id || 'temple-main';

    let targetTempleId = t.templeId;
    if (!targetTempleId && t.relatedServiceId) {
      const s = memorialServices.find((item) => item.id === t.relatedServiceId);
      if (s?.templeId) targetTempleId = s.templeId;
    }
    if (!targetTempleId && t.householdId) {
      const hh = households.find((h) => h.id === t.householdId);
      if (hh?.templeId) targetTempleId = hh.templeId;
    }

    if (targetTempleId && targetTempleId !== mainTempleId && targetTempleId !== 'temple-main') {
      const foundTemple = temples.find((item) => item.id === targetTempleId);
      return { id: targetTempleId, name: foundTemple?.name || '兼務寺', isAffiliated: true };
    }
    return { id: mainTempleId, name: mainTemple?.name || templeInfo?.name || '本寺', isAffiliated: false };
  };

  // Helper for Google Maps query:
  // 「会場・場所」と「訪問先住所・場所」住所に関して、
  // 後者(address)が空欄の場合はGoogleMapは前者(venue)を検索し、住所(address)が記載されているならばその住所を検索する
  const getServiceMapSearchQuery = (s: MemorialService): string => {
    const address = (s.address || '').trim();
    const venue = (s.venue || '').trim();
    const templeMeta = getServiceTempleInfo(s);
    const targetTemple = templeMeta.id ? temples.find((t) => t.id === templeMeta.id) : null;

    // 1. 訪問先住所・場所住所が記載されているならば、その住所の記述通りに検索
    if (address) {
      return address;
    }

    // 2. 後者(address)が空欄の場合はGoogleMapは前者(venue)を検索
    if (venue) {
      // 会場が「本堂」や「自寺 本堂」等の場合で、該当寺院情報がある場合は寺院名＋住所を付加
      if (venue === '本堂' || venue === defaultTempleVenue || (venue.includes('本堂') && !venue.includes('寺'))) {
        if (targetTemple && targetTemple.address) {
          return `${targetTemple.name} ${targetTemple.address}`.trim();
        }
        if (templeInfo?.address) {
          return `${templeInfo.name || ''} ${templeInfo.address}`.trim();
        }
      }
      return venue;
    }

    // 3. 両方空欄の場合
    if (targetTemple && targetTemple.address) {
      return `${targetTemple.name} ${targetTemple.address}`.trim();
    }
    return templeInfo?.address || templeInfo?.name || '本堂';
  };

  // Helper to determine styling for service chips and cards (兼務寺も本寺と同様の落ち着いた色調で統一)
  const getServiceChipStyle = (s: MemorialService) => {
    const isAffiliated = isAffiliatedTempleService(s);
    const templeMeta = getServiceTempleInfo(s);

    if (s.memorialType === '寺院行事') {
      return { chipClass: 'bg-indigo-100 text-indigo-900 border-l-2 border-indigo-600 font-bold', badgeClass: 'bg-indigo-200 text-indigo-900', badgeText: '寺院行事', isAffiliated, templeName: templeMeta.name };
    } else if (s.memorialType === '他寺院助法・出向') {
      return { chipClass: 'bg-teal-100 text-teal-900 border-l-2 border-teal-600 font-bold', badgeClass: 'bg-teal-200 text-teal-900', badgeText: '他寺助法', isAffiliated, templeName: templeMeta.name };
    } else if (s.memorialType === '会議・教区・公務') {
      return { chipClass: 'bg-blue-100 text-blue-900 border-l-2 border-blue-600 font-bold', badgeClass: 'bg-blue-200 text-blue-900', badgeText: '会議', isAffiliated, templeName: templeMeta.name };
    } else if (s.memorialType === '住職個人用務・私用') {
      return { chipClass: 'bg-stone-200 text-stone-900 border-l-2 border-stone-600 font-bold', badgeClass: 'bg-stone-300 text-stone-900', badgeText: '私用', isAffiliated, templeName: templeMeta.name };
    } else if (s.memorialType === '地域行事') {
      return { chipClass: 'bg-cyan-100 text-cyan-900 border-l-2 border-cyan-600 font-bold', badgeClass: 'bg-cyan-200 text-cyan-900', badgeText: '地域', isAffiliated, templeName: templeMeta.name };
    } else if (s.memorialType === '棚経') {
      return { chipClass: 'bg-emerald-100 text-emerald-900 border-l-2 border-emerald-600 font-bold', badgeClass: 'bg-emerald-200 text-emerald-900', badgeText: '棚経', isAffiliated, templeName: templeMeta.name };
    } else if (s.memorialType === '塔婆供養') {
      return { chipClass: 'bg-amber-100 text-amber-900 border-l-2 border-amber-600 font-bold', badgeClass: 'bg-amber-200 text-amber-900', badgeText: '塔婆', isAffiliated, templeName: templeMeta.name };
    } else if (s.memorialType === '枕経' || s.memorialType === '通夜' || s.memorialType === '葬儀' || s.memorialType === '枕経・通夜・葬儀') {
      return { chipClass: 'bg-red-950 text-amber-200 border-l-2 border-red-500 font-bold', badgeClass: 'bg-red-900 text-amber-100', badgeText: '葬儀', isAffiliated, templeName: templeMeta.name };
    }

    // 通常の檀家法事（漆黒・金）
    return {
      chipClass: 'bg-[#1A1A1A] text-[#D4AF37] border-l-2 border-[#D4AF37] font-bold',
      badgeClass: 'bg-[#2A2A2A] text-[#D4AF37]',
      badgeText: isAffiliated ? templeMeta.name : '本寺法要',
      isAffiliated,
      templeName: templeMeta.name,
    };
  };

  // Helper to format multiple memorial milestone types (e.g. 一周忌・七回忌)
  const formatServiceMemorialTypesDisplay = (s: MemorialService): string => {
    const types: string[] = [];
    if (s.memorialType && s.memorialType !== 'その他') {
      types.push(s.memorialType);
    }
    
    if (s.additionalDeceased && s.additionalDeceased.length > 0) {
      s.additionalDeceased.forEach((item) => {
        if (item.memorialType && !types.includes(item.memorialType)) {
          types.push(item.memorialType);
        }
      });
    }

    if (s.tobaItems && s.tobaItems.length > 0) {
      s.tobaItems.forEach((toba) => {
        if (toba.memorialType && !types.includes(toba.memorialType)) {
          types.push(toba.memorialType);
        }
      });
    }

    if (types.length === 0) return s.memorialType || '法要';
    return types.join('・');
  };

  // Helper to get comprehensive list of deceased (main spirit 1st line, additional spirits 2nd line onward)
  const getAllServiceDeceasedList = (s: MemorialService): ServiceDeceasedTarget[] => {
    const list: ServiceDeceasedTarget[] = [];
    
    // 1. Main Spirit (メイン精霊)
    if (s.dharmaName || s.deceasedName || s.deceasedId) {
      list.push({
        id: s.deceasedId,
        dharmaName: s.dharmaName,
        deceasedName: s.deceasedName,
        memorialType: s.memorialType,
        isMain: true,
      });
    }

    // 2. Sub Spirits (併修・合修精霊)
    if (s.additionalDeceased && s.additionalDeceased.length > 0) {
      s.additionalDeceased.forEach((item) => {
        const isDuplicate = list.some(
          (x) => (x.id && item.id && x.id === item.id) ||
                 (x.dharmaName && item.dharmaName && x.dharmaName.trim() === item.dharmaName.trim() && x.memorialType === item.memorialType)
        );
        if (!isDuplicate) {
          list.push({
            ...item,
            isMain: false,
          });
        }
      });
    }

    // 3. Spirits configured in Toba items (塔婆で別回忌・別精霊が設定された場合も収集)
    if (s.tobaItems && s.tobaItems.length > 0) {
      s.tobaItems.forEach((toba) => {
        if (toba.dharmaName && toba.dharmaName.trim() && !toba.dharmaName.includes('先祖代々')) {
          const isDuplicate = list.some(
            (x) => (x.dharmaName && x.dharmaName.trim() === toba.dharmaName?.trim()) ||
                   (x.deceasedName && toba.secularName && x.deceasedName.trim() === toba.secularName.trim())
          );
          if (!isDuplicate) {
            list.push({
              dharmaName: toba.dharmaName,
              deceasedName: toba.secularName || '',
              memorialType: toba.memorialType || s.memorialType,
              isMain: false,
            });
          }
        }
      });
    }

    return list;
  };

  // Reservation / Event Modal State (Unified with MobileServiceModal)
  const [showServiceModal, setShowServiceModal] = useState(false);
  const [editingService, setEditingService] = useState<MemorialService | null>(null);
  const [deleteConfirmService, setDeleteConfirmService] = useState<MemorialService | null>(null);
  const [serviceModalInitialDate, setServiceModalInitialDate] = useState<string | undefined>(undefined);
  const [serviceModalInitialHhId, setServiceModalInitialHhId] = useState<string | undefined>(undefined);
  const [serviceModalInitialPastId, setServiceModalInitialPastId] = useState<string | undefined>(undefined);
  const [serviceModalInitialMilestone, setServiceModalInitialMilestone] = useState<string | undefined>(undefined);

  // Todo Modal State
  const [showTodoModal, setShowTodoModal] = useState(false);
  const [showTodoSaveConfirm, setShowTodoSaveConfirm] = useState(false);
  const [editingTodo, setEditingTodo] = useState<TempleTodo | null>(null);
  const [todoFormData, setTodoFormData] = useState<Partial<TempleTodo>>({
    id: '',
    title: '',
    dueDate: todayStr,
    dueTime: '17:00',
    priority: 'medium',
    category: '法要準備',
    completed: false,
    householdId: '',
    householdHeadName: '',
    notes: '',
  });

  // Todo quick filter
  const [todoFilter, setTodoFilter] = useState<'all' | 'pending' | 'completed'>('pending');

  // Households map for fast lookup
  const householdMap = useMemo(() => {
    const map = new Map<string, Household>();
    households.forEach((h) => map.set(h.id, h));
    return map;
  }, [households]);

  // Dynamic Accounting Modal State (法要予定一覧の会計入力ポップアップ・行の自由追加削除)
  const [accountingModalService, setAccountingModalService] = useState<MemorialService | null>(null);
  const [accountingItemRows, setAccountingItemRows] = useState<AccountingItemRow[]>([]);
  const [accountingPaymentMethod, setAccountingPaymentMethod] = useState<'現金受付' | 'QR受付時' | '銀行振込' | '郵便振替' | 'その他'>('現金受付');
  const [accountingReceivedDate, setAccountingReceivedDate] = useState<string>(todayStr);
  const [accountingCustomNote, setAccountingCustomNote] = useState<string>('');
  const [accountingHistoricalSourceInfo, setAccountingHistoricalSourceInfo] = useState<string | null>(null);

  // Calculate accounting status for a service based on transactions
  const getServiceAccountingStatus = (service: MemorialService): {
    status: '法要前' | '未入金' | '入金済' | '記載済';
    relatedTxs: Transaction[];
    totalPaid: number;
    isRecorded: boolean;
  } => {
    const relatedTxs = transactions.filter(
      (t) => t.relatedServiceId === service.id || (service.transactionId && t.id === service.transactionId)
    );
    const totalPaid = relatedTxs.reduce((sum, t) => sum + (t.type === '収入' ? t.amount : -t.amount), 0);
    const isRecorded = Boolean(service.accountingRecorded || relatedTxs.length > 0 || service.status === '入金済' || (service.status as any) === '記載済');

    if (isRecorded || relatedTxs.length > 0) {
      return { status: '記載済', relatedTxs, totalPaid, isRecorded: true };
    }

    const normDate = normalizeDateInput(service.scheduledDate) || service.scheduledDate;
    if (normDate > todayStr) {
      return { status: '法要前', relatedTxs: [], totalPaid: 0, isRecorded: false };
    } else {
      return { status: '未入金', relatedTxs: [], totalPaid: 0, isRecorded: false };
    }
  };

  // Legacy fallback for recordAccountingModal
  const [recordAccountingModal, setRecordAccountingModal] = useState<{
    service: MemorialService;
    category: string;
    amount: number;
    paymentMethod: string;
    notes: string;
  } | null>(null);


  // Month navigation
  const handlePrevMonth = () => {
    if (currentMonth === 1) {
      setCurrentMonth(12);
      setCurrentYear((prev) => prev - 1);
    } else {
      setCurrentMonth((prev) => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 12) {
      setCurrentMonth(1);
      setCurrentYear((prev) => prev + 1);
    } else {
      setCurrentMonth((prev) => prev + 1);
    }
  };

  const handleGoToday = () => {
    setCurrentYear(today.getFullYear());
    setCurrentMonth(today.getMonth() + 1);
    setSelectedDateStr(todayStr);
  };

  // Days in current Month
  const calendarDays = useMemo(() => {
    const firstDayOfWeek = new Date(currentYear, currentMonth - 1, 1).getDay(); // 0 = Sun
    const totalDays = new Date(currentYear, currentMonth, 0).getDate();

    const days = [];
    // Padding for previous month
    for (let i = 0; i < firstDayOfWeek; i++) {
      days.push(null);
    }
    // Days of month
    for (let d = 1; d <= totalDays; d++) {
      const mStr = String(currentMonth).padStart(2, '0');
      const dStr = String(d).padStart(2, '0');
      const dateStr = `${currentYear}/${mStr}/${dStr}`;
      days.push({
        dayNumber: d,
        dateStr,
        rokuyo: getRokuyo(currentYear, currentMonth, d),
      });
    }
    return days;
  }, [currentYear, currentMonth]);

  // Time comparison helper for sorting in ascending chronological order
  const normalizeTimeForSort = (time?: string): string => {
    if (!time) return '99:99';
    const clean = time.trim();
    if (clean === '終日' || clean.toLowerCase() === 'all') return '00:00';
    if (clean.includes(':')) {
      const [h, m] = clean.split(':');
      return `${h.padStart(2, '0')}:${(m || '00').padStart(2, '0')}`;
    }
    return clean.padStart(5, '0');
  };

  const compareScheduledTime = (a?: string, b?: string): number => {
    return normalizeTimeForSort(a).localeCompare(normalizeTimeForSort(b));
  };

  // Map of dateStr -> items (sorted by scheduledTime in ascending order within each day)
  const servicesByDate = useMemo(() => {
    const map = new Map<string, MemorialService[]>();
    memorialServices.forEach((s) => {
      const norm = normalizeDateInput(s.scheduledDate);
      if (!map.has(norm)) map.set(norm, []);
      map.get(norm)!.push(s);
    });
    // Sort each day's services strictly by scheduledTime ascending (09:00 -> 10:00 -> 11:00 -> 14:00)
    map.forEach((list) => {
      list.sort((a, b) => compareScheduledTime(a.scheduledTime, b.scheduledTime));
    });
    return map;
  }, [memorialServices]);

  const todosByDate = useMemo(() => {
    const map = new Map<string, TempleTodo[]>();
    templeTodos.forEach((t) => {
      const norm = normalizeDateInput(t.dueDate);
      if (!map.has(norm)) map.set(norm, []);
      map.get(norm)!.push(t);
    });
    return map;
  }, [templeTodos]);

  // Today's summary items
  const todayServices = useMemo(() => {
    return servicesByDate.get(todayStr) || [];
  }, [servicesByDate, todayStr]);

  const todayTodos = useMemo(() => {
    return templeTodos.filter((t) => {
      const norm = normalizeDateInput(t.dueDate);
      return (norm <= todayStr && !t.completed) || norm === todayStr;
    });
  }, [templeTodos, todayStr]);

  // Selected date services
  const selectedDateServices = useMemo(() => {
    return servicesByDate.get(selectedDateStr) || [];
  }, [servicesByDate, selectedDateStr]);

  const selectedDateTodos = useMemo(() => {
    return todosByDate.get(selectedDateStr) || [];
  }, [todosByDate, selectedDateStr]);

  // All household memorial services (excluding general temple events/meetings/personal tasks)
  const householdServices = useMemo(() => {
    return memorialServices.filter(isHouseholdMemorialService);
  }, [memorialServices]);

  // Filtered reservations for list view (Excludes general temple events, meetings, and personal tasks)
  const filteredServices = useMemo(() => {
    return memorialServices.filter((s) => {
      // Only include household memorial services (excludes general temple events, other temple assistance, meetings, personal tasks)
      if (!isHouseholdMemorialService(s)) return false;

      const matchesSearch =
        (s.chiefMourner && s.chiefMourner.includes(searchTerm)) ||
        (s.dharmaName && s.dharmaName.includes(searchTerm)) ||
        (s.deceasedName && s.deceasedName.includes(searchTerm)) ||
        (s.memorialType && s.memorialType.includes(searchTerm)) ||
        (s.venue && s.venue.includes(searchTerm)) ||
        (s.notes && s.notes.includes(searchTerm));

      const matchesType = typeFilter === 'ALL' || s.memorialType === typeFilter;

      return matchesSearch && matchesType;
    }).sort((a, b) => {
      const dateComp = (b.scheduledDate || '').localeCompare(a.scheduledDate || '');
      if (dateComp !== 0) return dateComp;
      return compareScheduledTime(a.scheduledTime, b.scheduledTime);
    });
  }, [memorialServices, searchTerm, typeFilter]);

  // Filtered Todos (with unique ID deduplication)
  const filteredTodos = useMemo(() => {
    const seen = new Set<string>();
    return templeTodos.filter((t) => {
      if (!t.id || seen.has(t.id)) return false;
      seen.add(t.id);
      if (todoFilter === 'pending') return !t.completed;
      if (todoFilter === 'completed') return t.completed;
      return true;
    }).sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      return (a.dueDate || '').localeCompare(b.dueDate || '');
    });
  }, [templeTodos, todoFilter]);

  // Tanagyo (棚経) list
  const tanagyoServices = useMemo(() => {
    return memorialServices.filter((s) => s.memorialType === '棚経').sort((a, b) => {
      const d = (a.scheduledDate || '').localeCompare(b.scheduledDate || '');
      if (d !== 0) return d;
      return compareScheduledTime(a.scheduledTime, b.scheduledTime);
    });
  }, [memorialServices]);

  // Open Add Service/Event Modal (Uses unified MobileServiceModal)
  const handleOpenAddServiceModal = (
    presetDate?: string,
    householdId?: string,
    deceasedId?: string,
    milestone?: string
  ) => {
    setEditingService(null);
    setServiceModalInitialDate(presetDate || selectedDateStr || todayStr);
    setServiceModalInitialHhId(householdId);
    setServiceModalInitialPastId(deceasedId);
    setServiceModalInitialMilestone(milestone);
    setShowServiceModal(true);
  };

  // Open Edit Service/Event Modal
  const handleOpenEditServiceModal = (service: MemorialService) => {
    setEditingService(service);
    setServiceModalInitialDate(undefined);
    setServiceModalInitialHhId(undefined);
    setServiceModalInitialPastId(undefined);
    setServiceModalInitialMilestone(undefined);
    setShowServiceModal(true);
  };

  // Save Service from MobileServiceModal with Toba ToDo synchronization handled by onAddService/onUpdateService in App
  const handleSaveServiceFromModal = (completeService: MemorialService) => {
    if (editingService || memorialServices.some((s) => s.id === completeService.id)) {
      onUpdateService(completeService);
    } else {
      onAddService(completeService);
    }
    setShowServiceModal(false);
    setEditingService(null);
  };

  // Delete Service from Modal (削除確認ダイアログを開く)
  const handleDeleteServiceFromModal = (serviceOrId: string | MemorialService) => {
    const s = typeof serviceOrId === 'string'
      ? memorialServices.find((x) => x.id === serviceOrId)
      : serviceOrId;
    if (s) {
      setDeleteConfirmService(s);
    } else {
      const id = typeof serviceOrId === 'string' ? serviceOrId : serviceOrId.id;
      if (onDeleteService) {
        onDeleteService(id);
      }
      setShowServiceModal(false);
      setEditingService(null);
    }
  };

  // 予定・法要の削除確定実行（確認ダイアログ内の「削除する」ボタン1回押下で即時実行）
  const handleExecuteDeleteService = () => {
    if (!deleteConfirmService) return;
    if (onDeleteService) {
      onDeleteService(deleteConfirmService.id);
    }
    setDeleteConfirmService(null);
    setShowServiceModal(false);
    setEditingService(null);
  };

  // Open Multi-Item Accounting Recording Modal (過去の同一檀家会計履歴を参考にして仮データ作成)
  const handleOpenAccountingModal = (service: MemorialService) => {
    // 既に記帳済みの場合は二重入力を防止するためモーダルを開かない
    const currentStatus = getServiceAccountingStatus(service);
    if (currentStatus.isRecorded) {
      alert('この法要はすでに出納帳（会計管理）へ記帳済みです。\n二重登録を防止するため、会計入力画面は開きません。\n\n内容の確認や修正が必要な場合は、上部メニューの「会計管理」画面から該当の取引をご確認ください。');
      return;
    }

    const normDate = normalizeDateInput(service.scheduledDate) || todayStr;
    
    // 過去の同一檀家（householdId）の収入取引履歴を検索
    const sameHouseholdTxs = transactions.filter(
      (t) => t.householdId && t.householdId === service.householdId && t.type === '収入'
    );

    let initialRows: AccountingItemRow[] = [];
    let sourceNotice: string | null = null;

    if (sameHouseholdTxs.length > 0) {
      // 過去の日付順（新しい順）で並び替え
      const sortedPastTxs = [...sameHouseholdTxs].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      
      // 今回の法要IDと異なる過去取引を探索
      const pastHistoricalTxs = sortedPastTxs.filter((t) => t.relatedServiceId !== service.id);

      if (pastHistoricalTxs.length > 0) {
        const targetMemorialType = (service.memorialType || '').trim();

        // 過去取引を日付ごとにグループ化
        const txsByDate = new Map<string, Transaction[]>();
        pastHistoricalTxs.forEach((t) => {
          const d = t.date || 'unknown';
          if (!txsByDate.has(d)) txsByDate.set(d, []);
          txsByDate.get(d)!.push(t);
        });

        // 判定キーワード群（備考・科目に記載される主要な法要名・回忌）
        const specificMemorialKeywords = [
          '四十九日', '満中陰', '初七日', '二七日', '三七日', '四七日', '五七日', '六七日', '百ヶ日',
          '一周忌', '三回忌', '七回忌', '十三回忌', '十七回忌', '二十三回忌', '二十七回忌', '三十三回忌', '五十回忌', '百回忌'
        ];
        const generalMemorialKeywords = ['年忌', '法事', '法要', '追悼', '供養', '引導', '葬儀', '枕経', '納骨', '布施'];

        let bestBatch: Transaction[] | null = null;
        let bestBatchDate: string | null = null;
        let matchedReason: string | null = null;

        // 1. 完全一致判定: 今回の法要種別（例: 「一周忌」「四十九日」）が備考(notes)や科目(category)に明記されている過去取引グループ
        if (targetMemorialType && targetMemorialType !== '年忌法要' && targetMemorialType !== '法要') {
          for (const [d, batch] of txsByDate.entries()) {
            const hasExact = batch.some((t) => {
              const combinedText = `${t.notes || ''} ${t.category || ''}`;
              return combinedText.includes(targetMemorialType);
            });
            if (hasExact) {
              bestBatch = batch;
              bestBatchDate = d;
              matchedReason = `同一施主の過去の「${targetMemorialType}」記載履歴（${d}）`;
              break;
            }
          }
        }

        // 2. 類似年忌・忌日判定: 今回の指定と完全一致がない場合、他の年忌・忌日名（例: 一周忌、三回忌、四十九日等）が備考に含まれる過去取引グループ
        if (!bestBatch) {
          for (const [d, batch] of txsByDate.entries()) {
            for (const kw of specificMemorialKeywords) {
              const hasKw = batch.some((t) => {
                const combinedText = `${t.notes || ''} ${t.category || ''}`;
                return combinedText.includes(kw);
              });
              if (hasKw) {
                bestBatch = batch;
                bestBatchDate = d;
                matchedReason = `同一施主の過去の「${kw}」記載履歴（${d}）`;
                break;
              }
            }
            if (bestBatch) break;
          }
        }

        // 3. 一般法要・布施判定: 備考または科目に法要・法事・供養・布施などの記載がある過去取引グループ
        if (!bestBatch) {
          for (const [d, batch] of txsByDate.entries()) {
            for (const kw of generalMemorialKeywords) {
              const hasKw = batch.some((t) => {
                const combinedText = `${t.notes || ''} ${t.category || ''}`;
                return combinedText.includes(kw);
              });
              if (hasKw) {
                bestBatch = batch;
                bestBatchDate = d;
                matchedReason = `同一施主の過去の「${kw}」関連履歴（${d}）`;
                break;
              }
            }
            if (bestBatch) break;
          }
        }

        // 4. マッチした取引グループから会計行を展開
        if (bestBatch && bestBatch.length > 0) {
          const seenCategories = new Set<string>();
          bestBatch.forEach((pt, idx) => {
            if (!seenCategories.has(pt.category)) {
              seenCategories.add(pt.category);
              initialRows.push({
                id: `ROW-${Date.now()}-${idx}`,
                category: pt.category,
                amount: pt.amount || 0,
                notes: pt.notes || `${service.memorialType}布施`,
              });
            }
          });

          if (initialRows.length > 0) {
            sourceNotice = `${matchedReason}から同一施主実績（${initialRows.length}件）を参考に仮データを作成しました`;
          }
        }
      }
    }

    // 過去実績がなかった場合、または今回の予約固有の項目が不足している場合の補正
    if (initialRows.length === 0) {
      const defaultOffering = service.memorialType === '塔婆供養' ? 0 : (service.offeringAmount || 30000);
      const defaultTobaFee = service.tobaFee || (service.tobaCount ? service.tobaCount * 3000 : 0);

      // 予約時の備考があればそれを明細備考の初期値に、なければ法要名布施
      const defaultOfferingNote = service.notes?.trim() || `${service.memorialType}布施`;

      if (defaultOffering > 0 || service.memorialType !== '塔婆供養') {
        initialRows.push({
          id: `ROW-${Date.now()}-1`,
          category: '法要布施',
          amount: defaultOffering || 30000,
          notes: defaultOfferingNote,
        });
      }

      if (service.tobaCount && service.tobaCount > 0) {
        initialRows.push({
          id: `ROW-${Date.now()}-2`,
          category: '塔婆料',
          amount: defaultTobaFee || (service.tobaCount * 3000),
          notes: `塔婆${service.tobaCount}本供養料`,
        });
      }

      // 御車代・御膳料
      if (service.venue && service.venue !== '本堂') {
        initialRows.push({
          id: `ROW-${Date.now()}-3`,
          category: '御車代・御膳料',
          amount: 10000,
          notes: '御車代・御膳料',
        });
      }
    } else {
      // 過去データがあり、今回塔婆指定があるのに塔婆料がなければ追加
      if (service.tobaCount && service.tobaCount > 0 && !initialRows.some((r) => r.category.includes('塔婆'))) {
        const tobaFee = service.tobaFee || (service.tobaCount * 3000);
        initialRows.push({
          id: `ROW-${Date.now()}-toba`,
          category: '塔婆料',
          amount: tobaFee,
          notes: `塔婆${service.tobaCount}本供養料`,
        });
      }
    }

    // もしそれでも0件なら基本の1行を用意
    if (initialRows.length === 0) {
      initialRows.push({
        id: `ROW-${Date.now()}-0`,
        category: availableIncomeCategories[0] || '法要布施',
        amount: 30000,
        notes: service.notes?.trim() || `${service.memorialType}布施`,
      });
    }

    setAccountingItemRows(initialRows);
    setAccountingHistoricalSourceInfo(sourceNotice);
    setAccountingPaymentMethod('現金受付');
    setAccountingReceivedDate(normDate);
    setAccountingCustomNote('');
    setAccountingModalService(service);
  };

  // Handlers for Accounting Row CRUD (自由な追加・削除・編集)
  const handleAddAccountingRow = () => {
    setAccountingItemRows((prev) => [
      ...prev,
      {
        id: `ROW-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        category: availableIncomeCategories[0] || '法要布施',
        amount: 10000,
        notes: '',
      },
    ]);
  };

  const handleRemoveAccountingRow = (id: string) => {
    setAccountingItemRows((prev) => prev.filter((r) => r.id !== id));
  };

  const handleUpdateAccountingRow = (id: string, field: keyof AccountingItemRow, val: any) => {
    setAccountingItemRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: val } : r))
    );
  };

  // Save Multi-Item Accounting Entries
  const handleSaveMultiAccounting = (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountingModalService) return;

    const validRows = accountingItemRows.filter((r) => Number(r.amount) > 0);
    if (validRows.length === 0) {
      alert('少なくとも1件の明細に1円以上の金額を入力してください。');
      return;
    }

    const createdTxIds: string[] = [];
    const dateStr = normalizeDateInput(accountingReceivedDate) || todayStr;
    const s = accountingModalService;

    // 所属寺院IDの確実な解決（兼務寺の檀家の場合は確実に兼務寺院IDを設定）
    let resolvedTempleId = s.templeId;
    if (s.householdId) {
      const hh = households.find((h) => h.id === s.householdId);
      if (hh?.templeId) {
        resolvedTempleId = hh.templeId;
      }
    }
    if (!resolvedTempleId && s.deceasedId) {
      const pr = pastRecords.find((r) => r.id === s.deceasedId);
      if (pr?.templeId) {
        resolvedTempleId = pr.templeId;
      }
    }
    if (!resolvedTempleId) {
      const serviceTempleMeta = getServiceTempleInfo(s);
      resolvedTempleId = serviceTempleMeta.id;
    }

    validRows.forEach((row, idx) => {
      const txId = `TX-SRV-${Date.now()}-${idx + 1}`;
      
      // ユーザーが明細行の備考(row.notes)に入力した内容を最優先で出納帳の備考としてそのまま反映
      let finalNote = row.notes?.trim() || '';
      if (!finalNote) {
        // 行の備考が空の場合は、予約時の備考(s.notes)または法要布施名を設定
        if (s.notes && s.notes.trim()) {
          finalNote = s.notes.trim();
        } else {
          finalNote = `${s.memorialType}布施`;
        }
      }

      // 全体備考(accountingCustomNote)が入力されている場合は付記
      if (accountingCustomNote && accountingCustomNote.trim()) {
        finalNote = finalNote ? `${finalNote} (${accountingCustomNote.trim()})` : accountingCustomNote.trim();
      }

      const tx: Transaction = {
        id: txId,
        templeId: resolvedTempleId,
        date: dateStr,
        householdId: s.householdId,
        householdHeadName: s.chiefMourner,
        category: row.category as any,
        type: '収入',
        amount: Number(row.amount),
        paymentMethod: accountingPaymentMethod,
        receiptNumber: `R${dateStr.replace(/\//g, '')}-${Date.now().toString().slice(-4)}-${idx + 1}`,
        relatedServiceId: s.id,
        notes: finalNote,
      };
      onAddTransaction(tx);
      createdTxIds.push(txId);
    });

    // Update service record state
    onUpdateService({
      ...s,
      status: '入金済',
      accountingRecorded: true,
      transactionId: createdTxIds[0] || s.transactionId,
    });

    const totalAmt = validRows.reduce((sum, r) => sum + Number(r.amount), 0);
    alert(
      `【出納帳への記帳が完了しました】\n施主: ${s.chiefMourner} 様\n記帳件数: ${validRows.length}件\n合計金額: ${formatCurrency(totalAmt)}\n\n出納帳（会計管理）に連携登録し、会計記帳状況を「記載済」に更新しました。`
    );
    setAccountingModalService(null);
  };

  // Open Accounting Recording Modal (法事後に科目と金額を入力して連動)
  const handleOpenRecordAccountingModal = (service: MemorialService) => {
    handleOpenAccountingModal(service);
  };

  // Confirm and Save Accounting Record (出納帳に記載する)
  const handleConfirmRecordAccounting = (e: React.FormEvent) => {
    e.preventDefault();
    if (!recordAccountingModal) return;
    const { service, category, amount, paymentMethod, notes } = recordAccountingModal;

    if (amount <= 0) {
      alert('金額を入力してください。');
      return;
    }

    const normDate = normalizeDateInput(service.scheduledDate) || todayStr;
    const txId = `TX-${Date.now()}`;

    // 所属寺院IDの確実な解決（兼務寺の檀家の場合は確実に兼務寺院IDを設定）
    let resolvedTempleId = service.templeId;
    if (service.householdId) {
      const hh = households.find((h) => h.id === service.householdId);
      if (hh?.templeId) {
        resolvedTempleId = hh.templeId;
      }
    }
    if (!resolvedTempleId && service.deceasedId) {
      const pr = pastRecords.find((r) => r.id === service.deceasedId);
      if (pr?.templeId) {
        resolvedTempleId = pr.templeId;
      }
    }
    if (!resolvedTempleId) {
      const serviceTempleMeta = getServiceTempleInfo(service);
      resolvedTempleId = serviceTempleMeta.id;
    }

    const newTx: Transaction = {
      id: txId,
      templeId: resolvedTempleId,
      date: normDate,
      householdId: service.householdId,
      householdHeadName: service.chiefMourner,
      category: category as any,
      type: '収入',
      amount: amount,
      paymentMethod: paymentMethod as any,
      receiptNumber: `R${normDate.replace(/\//g, '')}-${Date.now().toString().slice(-4)}`,
      notes: notes?.trim() || service.notes?.trim() || `${service.memorialType}布施 (${service.chiefMourner}様)`,
    };

    onAddTransaction(newTx);
    onUpdateService({
      ...service,
      offeringAmount: amount,
      accountingRecorded: true,
      transactionId: txId,
    });

    alert(`【出納帳に記載しました】\n施主: ${service.chiefMourner} 様\n科目: ${category}\n金額: ${formatCurrency(amount)}\n\n会計管理に自動連携されました。`);
    setRecordAccountingModal(null);
  };

  // Direct Accounting Record Action (Fallback)
  const handleQuickRecordAccounting = (service: MemorialService) => {
    handleOpenRecordAccountingModal(service);
  };

  // Open Add Todo Modal
  const handleOpenAddTodoModal = (presetDate?: string) => {
    setEditingTodo(null);
    const defaultTempleId = activeTempleId !== 'ALL' ? activeTempleId : (temples.find((t) => t.isMain)?.id || 'temple-main');
    setTodoFormData({
      id: `TD-${Date.now()}`,
      templeId: defaultTempleId,
      title: '',
      dueDate: presetDate || selectedDateStr || todayStr,
      dueTime: '17:00',
      priority: 'medium',
      category: '法要準備',
      completed: false,
      householdId: '',
      householdHeadName: '',
      notes: '',
    });
    setShowTodoModal(true);
  };

  // Open Edit Todo Modal
  const handleOpenEditTodoModal = (todo: TempleTodo) => {
    setEditingTodo(todo);
    setTodoFormData({
      ...todo,
      templeId: todo.templeId || (activeTempleId !== 'ALL' ? activeTempleId : 'temple-main'),
    });
    setShowTodoModal(true);
  };

  // Save Todo
  const executeSaveTodoAndClose = () => {
    const completeTodo: TempleTodo = {
      id: todoFormData.id || `TD-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      templeId: todoFormData.templeId || (activeTempleId !== 'ALL' ? activeTempleId : (temples.find((t) => t.isMain)?.id || 'temple-main')),
      title: todoFormData.title || '無題のタスク',
      dueDate: normalizeDateInput(todoFormData.dueDate || '') || todayStr,
      dueTime: todoFormData.dueTime || '17:00',
      priority: todoFormData.priority || 'medium',
      category: todoFormData.category || '法要準備',
      completed: todoFormData.completed || false,
      householdId: todoFormData.householdId || '',
      householdHeadName: todoFormData.householdHeadName || '',
      relatedServiceId: todoFormData.relatedServiceId || '',
      notes: todoFormData.notes || '',
      createdAt: todoFormData.createdAt || todayStr,
    };

    if (editingTodo) {
      onUpdateTodo(completeTodo);
    } else {
      onAddTodo(completeTodo);
    }
    setShowTodoSaveConfirm(false);
    setShowTodoModal(false);
  };

  const handleSaveTodo = (e: React.FormEvent) => {
    e.preventDefault();
    executeSaveTodoAndClose();
  };

  const handleRequestCloseTodoModal = () => {
    setShowTodoSaveConfirm(true);
  };

  // Toggle Todo Complete
  const handleToggleTodo = (todo: TempleTodo) => {
    onUpdateTodo({
      ...todo,
      completed: !todo.completed,
      completedAt: !todo.completed ? new Date().toISOString() : undefined,
    });
  };

  // Export iCalendar .ics file
  const handleExportIcs = () => {
    const icsData = generateICalendarContent(memorialServices, templeInfo.name || '圓福寺');
    downloadFile(`temple-memorial-schedule-${currentYear}.ics`, icsData);
  };

  return (
    <div className="space-y-4 font-serif text-[#2D2D2D]">
      {/* Top Header & Subtabs */}
      <div className="bg-[#1A1A1A] border-2 border-[#D4AF37] shadow-xl p-4 sm:p-5 text-[#F9F7F2]">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#D4AF37]/30 pb-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 border-2 border-[#D4AF37] rotate-45 flex items-center justify-center bg-[#242424] shadow-md">
              <CalendarIcon className="-rotate-45 w-5 h-5 text-[#D4AF37]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] px-2 py-0.5 bg-[#D4AF37] text-[#1A1A1A] font-bold tracking-wider font-sans uppercase">
                  法務スケジュール管理
                </span>
                <span className="text-xs text-[#D4AF37]/80 tracking-widest font-sans">
                  {getJapaneseEra(today.getFullYear(), today.getMonth() + 1, today.getDate())} ({todayStr})
                </span>
              </div>
              <div className="flex items-center flex-wrap gap-3 mt-0.5">
                <h2 className="text-xl sm:text-2xl font-bold text-[#F9F7F2] tracking-wider">
                  法事・予約・カレンダー
                </h2>
                <div className="px-2.5 py-1 bg-emerald-950/80 text-emerald-300 border border-emerald-500/60 text-xs font-sans font-bold flex items-center gap-2 shadow-xs whitespace-nowrap">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  <span>総レコード数：予定 {memorialServices.length.toLocaleString('ja-JP')}件 / Todo {templeTodos.length.toLocaleString('ja-JP')}件</span>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex flex-wrap items-center gap-2 font-sans text-xs">
            <button
              type="button"
              onClick={() => handleOpenAddServiceModal()}
              className="flex items-center space-x-1.5 px-3 py-2 bg-[#D4AF37] text-[#1A1A1A] font-bold hover:bg-[#C59B27] transition-colors shadow-sm cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>+予定追加</span>
            </button>

            <button
              type="button"
              onClick={handleExportIcs}
              className="flex items-center space-x-1.5 px-2.5 py-2 bg-[#2A2A2A] text-[#F9F7F2] border border-[#555555] hover:bg-[#333333] transition-colors cursor-pointer"
              title="GoogleカレンダーやOutlook、iPhoneカレンダーに一括インポートできる.icsファイルを書き出します"
            >
              <Download className="w-3.5 h-3.5 text-[#D4AF37]" />
              <span className="hidden sm:inline">カレンダー書き出し (.ics)</span>
            </button>
          </div>
        </div>

        {/* Sub Navigation Bar */}
        <div className="flex flex-wrap gap-1 mt-3 font-sans text-xs font-bold">
          <button
            type="button"
            onClick={() => setSubTab('calendar')}
            className={`flex items-center space-x-1.5 px-3 py-2 transition-all cursor-pointer ${
              subTab === 'calendar'
                ? 'bg-[#D4AF37] text-[#1A1A1A] font-extrabold shadow-sm'
                : 'bg-[#2A2A2A] text-[#CCCCCC] hover:text-white hover:bg-[#333333]'
            }`}
          >
            <CalendarIcon className="w-4 h-4" />
            <span>カレンダー＆本日の予定</span>
            {todayServices.length > 0 && (
              <span className="ml-1 px-1.5 py-0.2 text-[10px] bg-[#8C2D19] text-white rounded-full">
                本日{todayServices.length}件
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setSubTab('list')}
            className={`flex items-center space-x-1.5 px-3 py-2 transition-all cursor-pointer ${
              subTab === 'list'
                ? 'bg-[#D4AF37] text-[#1A1A1A] font-extrabold shadow-sm'
                : 'bg-[#2A2A2A] text-[#CCCCCC] hover:text-white hover:bg-[#333333]'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>予約・法事一覧 ({householdServices.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('todos')}
            className={`flex items-center space-x-1.5 px-3 py-2 transition-all cursor-pointer ${
              subTab === 'todos'
                ? 'bg-[#D4AF37] text-[#1A1A1A] font-extrabold shadow-sm'
                : 'bg-[#2A2A2A] text-[#CCCCCC] hover:text-white hover:bg-[#333333]'
            }`}
          >
            <ListTodo className="w-4 h-4" />
            <span>寺院ToDo・法務準備</span>
            {todayTodos.length > 0 && (
              <span className="ml-1 px-1.5 py-0.2 text-[10px] bg-amber-500 text-[#1A1A1A] font-bold rounded-full">
                {todayTodos.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setSubTab('tanagyo')}
            className={`flex items-center space-x-1.5 px-3 py-2 transition-all cursor-pointer ${
              subTab === 'tanagyo'
                ? 'bg-[#D4AF37] text-[#1A1A1A] font-extrabold shadow-sm'
                : 'bg-[#2A2A2A] text-[#CCCCCC] hover:text-white hover:bg-[#333333]'
            }`}
          >
            <Navigation className="w-4 h-4" />
            <span>お盆棚経・訪問マップ ({tanagyoPatronHouseholds.length})</span>
            {unassignedTanagyoList.length > 0 && (
              <span className="ml-1 px-1.5 py-0.2 text-[10px] bg-red-600 text-white font-bold rounded-full" title={`未割当 ${unassignedTanagyoList.length}件`}>
                未割当{unassignedTanagyoList.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* SUBTAB 1: Calendar & Today */}
      {subTab === 'calendar' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left Column: Monthly Calendar (7 Cols) */}
          <div className="lg:col-span-7 space-y-4">
            <div className="bg-white border-2 border-[#D1CEC7] p-4 sm:p-5 shadow-md">
              {/* Month Header Nav */}
              <div className="flex items-center justify-between border-b border-[#E5E0D8] pb-3 mb-4">
                <div className="flex items-center space-x-3">
                  <h3 className="text-xl font-black text-[#1A1A1A] tracking-wider">
                    {currentYear}年 {currentMonth}月
                  </h3>
                  <span className="text-xs font-sans text-[#777777] font-bold bg-[#EFECE6] px-2 py-0.5">
                    {getJapaneseEra(currentYear, currentMonth, 1)}
                  </span>
                </div>
                <div className="flex items-center space-x-1.5 font-sans text-xs">
                  <button
                    type="button"
                    onClick={handleGoToday}
                    className="px-2.5 py-1 bg-[#EBE7DF] hover:bg-[#D4AF37] hover:text-[#1A1A1A] font-bold border border-[#C5BFB5] transition-colors cursor-pointer"
                  >
                    今日
                  </button>
                  <button
                    type="button"
                    onClick={handlePrevMonth}
                    className="p-1.5 bg-[#EBE7DF] hover:bg-[#D4AF37] hover:text-[#1A1A1A] border border-[#C5BFB5] transition-colors cursor-pointer"
                    title="前月"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={handleNextMonth}
                    className="p-1.5 bg-[#EBE7DF] hover:bg-[#D4AF37] hover:text-[#1A1A1A] border border-[#C5BFB5] transition-colors cursor-pointer"
                    title="翌月"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Color Legend Bar */}
              <div className="flex flex-wrap items-center gap-2 text-[10px] font-sans pb-2.5 mb-2 border-b border-[#F0ECE1] text-[#555555]">
                <span className="font-bold text-[#1A1A1A]">色分け凡例:</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-[#1A1A1A] border-l-2 border-[#D4AF37] inline-block"></span>法事・年忌</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-red-950 border-l-2 border-red-500 inline-block"></span>葬儀・枕経</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-indigo-100 border-l-2 border-indigo-600 inline-block"></span>寺院行事</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-teal-100 border-l-2 border-teal-600 inline-block"></span>他寺助法</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-emerald-100 border-l-2 border-emerald-600 inline-block"></span>棚経</span>
              </div>

              {/* Day of Week Headers */}
              <div className="grid grid-cols-7 gap-1 text-center font-sans text-xs font-bold mb-1">
                <div className="py-1 bg-[#FDF2F2] text-[#DC2626]">日</div>
                <div className="py-1 bg-[#F5F3EF] text-[#444444]">月</div>
                <div className="py-1 bg-[#F5F3EF] text-[#444444]">火</div>
                <div className="py-1 bg-[#F5F3EF] text-[#444444]">水</div>
                <div className="py-1 bg-[#F5F3EF] text-[#444444]">木</div>
                <div className="py-1 bg-[#F5F3EF] text-[#444444]">金</div>
                <div className="py-1 bg-[#EFF6FF] text-[#2563EB]">土</div>
              </div>

              {/* Calendar Grid */}
              <div className="grid grid-cols-7 gap-1">
                {calendarDays.map((day, idx) => {
                  if (!day) {
                    return <div key={`empty-${idx}`} className="h-20 sm:h-24 bg-[#FAFAF8] opacity-30 border border-dashed border-[#E5E0D8]" />;
                  }

                  const isToday = day.dateStr === todayStr;
                  const isSelected = day.dateStr === selectedDateStr;
                  const dayServices = servicesByDate.get(day.dateStr) || [];
                  const dayTodos = todosByDate.get(day.dateStr) || [];
                  const isSun = idx % 7 === 0;
                  const isSat = idx % 7 === 6;

                  return (
                    <div
                      key={day.dateStr}
                      onClick={() => setSelectedDateStr(day.dateStr)}
                      className={`h-20 sm:h-24 p-1 flex flex-col justify-between border transition-all cursor-pointer ${
                        isSelected
                          ? 'border-2 border-[#8C2D19] bg-[#FFF8F6] shadow-sm ring-1 ring-[#8C2D19]'
                          : isToday
                          ? 'border-[#D4AF37] bg-[#FFFDF5]'
                          : 'border-[#E5E0D8] bg-white hover:bg-[#F9F7F2]'
                      }`}
                    >
                      <div className="flex items-center justify-between text-[11px] font-sans">
                        <span
                          className={`font-black w-5 h-5 flex items-center justify-center rounded-full ${
                            isToday
                              ? 'bg-[#8C2D19] text-white'
                              : isSun
                              ? 'text-[#DC2626]'
                              : isSat
                              ? 'text-[#2563EB]'
                              : 'text-[#1A1A1A]'
                          }`}
                        >
                          {day.dayNumber}
                        </span>
                        <span className="text-[9px] text-[#888888] scale-90">
                          {day.rokuyo}
                        </span>
                      </div>

                      {/* Event Chips */}
                      <div className="space-y-0.5 overflow-hidden">
                        {dayServices.slice(0, 2).map((s) => {
                          const chipStyle = getServiceChipStyle(s);

                          return (
                            <div
                              key={s.id}
                              className={`text-[10px] px-1 py-0.2 truncate font-sans font-bold flex items-center gap-0.5 ${chipStyle.chipClass}`}
                              title={`${s.scheduledTime} ${chipStyle.isAffiliated ? `[${chipStyle.templeName}] ` : ''}${s.memorialType} - ${s.chiefMourner || s.dharmaName || ''}`}
                            >
                              <span className="text-[8px] opacity-75">{s.scheduledTime === '終日' || s.isAllDay ? '終日' : s.scheduledTime?.slice(0, 5)}</span>
                              <span className="truncate">{chipStyle.isAffiliated ? `[${chipStyle.templeName}] ` : ''}{s.chiefMourner || s.dharmaName || s.memorialType}</span>
                            </div>
                          );
                        })}
                        {dayServices.length > 2 && (
                          <div className="text-[9px] text-[#8C2D19] font-bold font-sans text-center">
                            他 +{dayServices.length - 2}件
                          </div>
                        )}
                        {dayTodos.length > 0 && dayServices.length <= 1 && (() => {
                          const firstTodo = dayTodos[0];
                          const isToba = firstTodo.category === '塔婆揮毫' || firstTodo.title.includes('塔婆') || (firstTodo.notes && firstTodo.notes.includes('塔婆'));
                          if (isToba) {
                            const info = extractTobaTaskCoreInfo(firstTodo, memorialServices, pastRecords);
                            return (
                              <div
                                className="text-[9px] px-1 bg-[#FFF0EB] text-[#8C2D19] border border-[#EACBBF] font-sans truncate font-bold"
                                title={`【塔婆作成】法名:${info.dharmaName} 回忌:${info.memorialType} ${info.countInfo} 志主:${info.sponsorName}`}
                              >
                                🎋 {info.dharmaName} 塔婆作成
                              </div>
                            );
                          }
                          return (
                            <div className="text-[9px] px-1 bg-gray-100 text-gray-700 font-sans truncate" title={firstTodo.title}>
                              📝 {firstTodo.title}
                            </div>
                          );
                        })()}
                      </div>

                      <div className="h-1" />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right Column: Selected Date / Today Schedule & Details (5 Cols) */}
          <div className="lg:col-span-5 space-y-4">
            <div className="bg-white border-2 border-[#1A1A1A] p-4 sm:p-5 shadow-md">
              <div className="flex items-center justify-between border-b border-[#D4AF37] pb-3 mb-4">
                <div>
                  <div className="text-xs text-[#8C2D19] font-bold font-sans flex items-center gap-1.5">
                    <span>{selectedDateStr === todayStr ? '📌 本日の予定詳細' : '📅 選択日の予定詳細'}</span>
                    {selectedDateStr !== todayStr && (
                      <button
                        type="button"
                        onClick={() => setSelectedDateStr(todayStr)}
                        className="text-[11px] text-blue-700 bg-blue-50 hover:bg-blue-100 px-2 py-0.5 rounded-xs border border-blue-200 cursor-pointer font-bold transition-colors"
                      >
                        今日に戻る
                      </button>
                    )}
                  </div>
                  <h3 className="text-lg sm:text-xl font-bold text-[#1A1A1A] tracking-wider mt-0.5 flex items-center gap-2">
                    <span>{selectedDateStr}</span>
                    {selectedDateStr === todayStr && (
                      <span className="text-xs bg-[#8C2D19] text-white px-2 py-0.5 font-bold font-sans rounded-xs">
                        本日
                      </span>
                    )}
                  </h3>
                </div>
                <div className="flex items-center gap-1.5 font-sans">
                  <button
                    type="button"
                    onClick={() => handleOpenAddServiceModal(selectedDateStr)}
                    className="px-2.5 py-1.5 bg-[#1A1A1A] text-[#D4AF37] font-bold text-xs hover:bg-[#2A2A2A] transition-colors flex items-center gap-1 cursor-pointer shadow-xs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+予定追加</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOpenAddTodoModal(selectedDateStr)}
                    className="px-2 py-1.5 bg-[#EFECE6] text-[#444444] font-bold text-xs hover:bg-[#D4AF37] hover:text-[#1A1A1A] transition-colors flex items-center gap-1 cursor-pointer"
                    title="タスク追加"
                  >
                    <CheckSquare className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Day Services List */}
              <div className="space-y-3">
                <div className="text-xs font-bold text-[#444444] font-sans flex items-center justify-between">
                  <span>法要・予約予定 ({selectedDateServices.length}件)</span>
                </div>

                {selectedDateServices.length === 0 ? (
                  <div className="p-4 bg-[#F9F7F2] border border-dashed border-[#D1CEC7] text-center text-xs text-[#777777] font-sans">
                    {selectedDateStr === todayStr ? '本日の法要・予約予定はありません。' : 'この日の法要・予定はありません。'}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {selectedDateServices.map((s) => {
                      const { status: serviceStatus, totalPaid, isRecorded } = getServiceAccountingStatus(s);
                      const isHousehold = isHouseholdMemorialService(s);
                      const isAffiliated = isAffiliatedTempleService(s);
                      const templeMeta = getServiceTempleInfo(s);
                      const isFuneral = ['通夜', '葬儀', '枕経', '葬儀・枕経', '通夜・葬儀'].includes(s.memorialType || '');
                      const isOther = s.memorialType === 'その他' || ['その他', '寺院行事', '会合', '来客', '法務その他'].includes(s.memorialType || '');
                      
                      // 塔婆明細抽出 (ToDoと同じ明細から抽出)
                      const serviceTobaLines = isOther || isFuneral ? [] : extractServiceTobaLines(s, pastRecords, templeTodos, memorialServices);

                      const isToba = Boolean(
                        s.memorialType === '塔婆供養' ||
                        s.memorialType === '塔婆' ||
                        s.memorialType === '塔婆依頼' ||
                        (s.memorialType && s.memorialType.includes('塔婆')) ||
                        ((s.tobaCount || 0) > 0 && (!s.attendeeCount || s.attendeeCount === 0) && (!s.venue || s.venue === '本堂' || s.venue === '') && !isFuneral && !isOther) ||
                        (serviceTobaLines.length > 0 && (!s.attendeeCount || s.attendeeCount === 0) && (!s.venue || s.venue === '本堂' || s.venue === '') && !isFuneral && !isOther)
                      );
                      const displayVenue = (s.venue || '').trim();
                      const mapSearchQuery = getServiceMapSearchQuery(s);
                      
                      // 施主名から「様」「家」を削除
                      const matchedHh = households.find((h) => h.id === s.householdId);
                      const sponsorName = matchedHh ? (getHouseholdSponsorName(matchedHh) || matchedHh.familyHead) : '';
                      const cleanChiefMourner = (s.chiefMourner || sponsorName || '')
                        .replace(/(家|様)+$/g, '')
                        .trim();
                      
                      // 俗名の取得 (s.deceasedName または pastRecordsから照合)
                      const matchedPast = pastRecords.find((p) => 
                        (s.deceasedId && p.id === s.deceasedId) || 
                        (s.dharmaName && p.dharmaName && p.dharmaName.trim() === s.dharmaName.trim() && (!s.householdId || p.householdId === s.householdId)) ||
                        (s.dharmaName && p.dharmaName && p.dharmaName.trim() === s.dharmaName.trim())
                      );
                      let rawSecularName = (s.deceasedName || matchedPast?.secularName || matchedPast?.deceasedName || '').trim();
                      rawSecularName = rawSecularName.replace(/^(俗名[:：\s]*|故[\s　]*)/, '').trim();
                      const hasDharmaName = Boolean(s.dharmaName && s.dharmaName.trim());
                      const displaySecular = hasDharmaName && rawSecularName && rawSecularName !== s.dharmaName.trim() ? rawSecularName : '';

                      // メイン精霊と回忌
                      const mainDharma = s.dharmaName || (s.deceasedName ? `俗名: ${s.deceasedName}` : (s.notes || ''));
                      const mainMemType = s.memorialType || '';

                      return (
                        <div
                          key={s.id}
                          className="border p-3.5 space-y-2 hover:border-[#D4AF37] transition-all rounded-xs bg-[#FAFAF8] border-[#D1CEC7]"
                        >
                          {/* 1行目: 時間（シンプル黒文字）、寺院表記、編集、削除 */}
                          <div className="flex items-center justify-between gap-2 flex-wrap pb-1 border-b border-[#EBE5DA]">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-gray-900 text-sm sm:text-base font-sans">
                                {s.scheduledTime === '終日' || s.isAllDay
                                  ? '【終日】'
                                  : `${s.scheduledTime || '時間未定'}〜${s.endTime || calculateEndTime(s.scheduledTime, 60)}`}
                              </span>
                              {isAffiliated && (
                                <span className="text-xs font-bold px-2 py-0.5 font-sans bg-gray-100 text-gray-800 border border-gray-300 rounded-2xs">
                                  兼務寺: {templeMeta.name}
                                </span>
                              )}
                              {!isAffiliated && temples.length > 1 && (
                                <span className="text-xs font-bold px-2 py-0.5 font-sans bg-amber-100 text-amber-900 border border-amber-300 rounded-2xs">
                                  本寺: {templeMeta.name}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center space-x-1.5 font-sans text-xs ml-auto">
                              <button
                                type="button"
                                onClick={() => handleOpenEditServiceModal(s)}
                                className="p-1 text-gray-600 hover:text-[#8C2D19] cursor-pointer"
                                title="編集"
                              >
                                <Edit className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleteConfirmService(s)}
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
                                  {s.memorialType || '葬儀'}　施主　{cleanChiefMourner || '施主未定'}
                                </div>
                              ) : isOther ? (
                                <div className="font-serif font-black text-lg sm:text-xl text-[#8C2D19] leading-snug tracking-wide">
                                  {cleanChiefMourner || s.notes || s.memorialType || 'その他予定'}
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
                              {!isFuneral && !isOther && s.additionalDeceased && s.additionalDeceased.length > 0 && (
                                <div className="space-y-0.5 pt-0.5">
                                  {s.additionalDeceased.map((sub, idx) => {
                                    const subPast = pastRecords.find((p) =>
                                      (sub.id && p.id === sub.id) ||
                                      (sub.dharmaName && p.dharmaName && p.dharmaName.trim() === sub.dharmaName.trim() && (!s.householdId || p.householdId === s.householdId)) ||
                                      (sub.dharmaName && p.dharmaName && p.dharmaName.trim() === sub.dharmaName.trim())
                                    );
                                    let subSecular = (sub.deceasedName || subPast?.secularName || subPast?.deceasedName || '').trim();
                                    subSecular = subSecular.replace(/^(俗名[:：\s]*|故[\s　]*)/, '').trim();
                                    const hasSubDharma = Boolean(sub.dharmaName && sub.dharmaName.trim());
                                    const displaySubSecular = hasSubDharma && subSecular && subSecular !== sub.dharmaName?.trim() ? subSecular : '';

                                    return (
                                      <div key={sub.id || idx} className="font-serif font-bold text-base sm:text-lg text-purple-950 leading-snug tracking-wide">
                                        <div className="flex items-baseline flex-wrap gap-x-1.5">
                                          <span>{sub.dharmaName || sub.deceasedName}</span>
                                          {displaySubSecular && (
                                            <span className="text-xs sm:text-sm font-normal text-purple-900 font-serif">
                                              （故　{displaySubSecular}）
                                            </span>
                                          )}
                                        </div>
                                        {sub.memorialType && (
                                          <div className="text-sm sm:text-base font-bold text-purple-900 mt-0.5">
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
                              {!isOther && s.attendeeCount && s.attendeeCount > 0 ? (
                                <span>参列 {s.attendeeCount}名</span>
                              ) : null}
                              {displayVenue ? <span>会場 {displayVenue}</span> : null}
                              {displayVenue && mapSearchQuery ? (
                                <a
                                  href={getGoogleMapsSearchUrl(mapSearchQuery)}
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

                          {/* 4行目: 塔婆明細枠 */}
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

                          {/* 5行目: 最後に「Googleカレンダー追加」「会計入力」 */}
                          <div className="flex items-center justify-between pt-2 border-t border-[#E5E0D8] font-sans text-xs gap-2 flex-wrap">
                            <a
                              href={generateGoogleCalendarUrl({
                                title: isToba
                                  ? `塔婆供養 - ${cleanChiefMourner || '志主'}${serviceTobaLines.length > 0 ? ` (${serviceTobaLines.map((t) => t.formattedLine).join(', ')})` : ''}`
                                  : isHousehold
                                  ? `${s.memorialType} - ${cleanChiefMourner} (${s.dharmaName || s.deceasedName || ''})`
                                  : `${s.memorialType} - ${cleanChiefMourner}`,
                                startDate: s.scheduledDate,
                                startTime: s.scheduledTime,
                                endTime: s.endTime,
                                details: isToba
                                  ? `【種別】塔婆供養\n【施主/志主】${cleanChiefMourner}\n【塔婆明細】\n${serviceTobaLines.map((t) => t.formattedLine).join('\n')}\n【備考】${s.notes || ''}`
                                  : isHousehold
                                  ? `【施主】${cleanChiefMourner}\n【戒名】${s.dharmaName || s.deceasedName || ''}\n【参列】${s.attendeeCount || 0}名\n【塔婆】${serviceTobaLines.length > 0 ? serviceTobaLines.map((t) => t.formattedLine).join('\n') : 'なし'}\n【備考】${s.notes || ''}`
                                  : `【用務・行事】${cleanChiefMourner}\n【場所】${displayVenue}\n【備考】${s.notes || ''}`,
                                location: s.venue === '自宅' ? (s.address || '施主宅') : (s.venue || '本堂'),
                              })}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-2.5 py-1.5 bg-[#EFF6FF] text-[#1E40AF] border border-[#BFDBFE] hover:bg-[#DBEAFE] rounded-xs font-bold flex items-center gap-1 transition-colors"
                            >
                              <CalendarIcon className="w-3.5 h-3.5" />
                              <span>Googleカレンダー追加</span>
                            </a>

                            {isHousehold && (
                              isRecorded ? (
                                <span
                                  className="px-2.5 py-1.5 font-bold rounded-xs flex items-center gap-1 text-xs bg-emerald-50 text-emerald-800 border border-emerald-300 select-none cursor-default"
                                  title="出納帳に記帳済み（二重入力防止のため会計入力完了済）"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                  <span>記載済</span>
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleOpenAccountingModal(s)}
                                  className="px-2.5 py-1.5 font-bold rounded-xs flex items-center gap-1 transition-colors cursor-pointer text-xs bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A] hover:bg-[#FDE047]"
                                  title="出納帳（会計管理）へ記帳"
                                >
                                  <DollarSign className="w-3.5 h-3.5" />
                                  <span>会計入力</span>
                                </button>
                              )
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Day Tasks List (with Toba highlight) */}
                <div className="pt-3 border-t border-[#E5E0D8]">
                  <div className="text-xs font-bold text-[#444444] font-sans mb-2 flex items-center justify-between">
                    <span>この日のタスク・塔婆作成 ({selectedDateTodos.length}件)</span>
                  </div>

                  {selectedDateTodos.length === 0 ? (
                    <div className="text-xs text-[#888888] font-sans text-center py-2">
                      タスクはありません
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {selectedDateTodos.map((t) => {
                        const isToba = t.category === '塔婆揮毫' || t.title.includes('塔婆') || (t.notes && t.notes.includes('塔婆'));
                        const tobaInfo = isToba ? extractTobaTaskCoreInfo(t, memorialServices, pastRecords) : null;

                        return (
                          <div
                            key={t.id}
                            className={`p-2.5 border text-xs font-sans transition-all ${
                              isToba
                                ? 'bg-[#FFF9F6] border-[#8C2D19]/40 hover:border-[#8C2D19]'
                                : 'bg-[#FAFAF8] border-[#D1CEC7]'
                            } ${t.completed ? 'opacity-50 line-through' : ''}`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-start space-x-2 flex-1">
                                <button
                                  type="button"
                                  onClick={() => handleToggleTodo(t)}
                                  className="mt-0.5 text-gray-400 hover:text-emerald-600 cursor-pointer"
                                >
                                  {t.completed ? (
                                    <CheckSquare className="w-4 h-4 text-emerald-600" />
                                  ) : (
                                    <Square className="w-4 h-4 text-gray-400" />
                                  )}
                                </button>
                                <div className="space-y-1 flex-1">
                                  {/* Affiliated Temple Badge */}
                                  {(() => {
                                    const todoTemple = getTodoTempleInfo(t);
                                    if (todoTemple.isAffiliated) {
                                      return (
                                        <div className="mb-1">
                                          <span className="inline-block px-1.5 py-0.2 bg-purple-900 text-purple-100 text-[10px] font-black border border-purple-400 rounded-xs shadow-2xs">
                                            兼務: {todoTemple.name}
                                          </span>
                                        </div>
                                      );
                                    } else if (temples.length > 1) {
                                      return (
                                        <div className="mb-1">
                                          <span className="inline-block px-1.5 py-0.2 bg-[#1A1A1A] text-[#D4AF37] text-[10px] font-bold rounded-xs">
                                            本寺: {todoTemple.name}
                                          </span>
                                        </div>
                                      );
                                    }
                                    return null;
                                  })()}

                                  {isToba ? (() => {
                                    const tobaLines = extractTobaLines(t, memorialServices, pastRecords);
                                    return (
                                      <div className="space-y-1.5">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                          <span className="inline-block px-2 py-0.5 bg-[#8C2D19] text-white text-xs font-bold rounded-2xs">
                                            🎋 塔婆作成 ({tobaLines.length}本)
                                          </span>
                                        </div>

                                        {/* Toba Lines: 1 line per toba, enlarged font size */}
                                        <div className={`space-y-1.5 bg-[#FAF8F5] p-2.5 rounded-xs border border-[#E5DFD5] ${t.completed ? 'opacity-50 line-through' : ''}`}>
                                          {tobaLines.map((line, idx) => (
                                            <div
                                              key={idx}
                                              className="text-base sm:text-lg font-black font-serif text-[#1A1A1A] leading-relaxed tracking-wide break-words border-b border-[#EBE5DA] pb-1 last:border-b-0 last:pb-0"
                                            >
                                              {line.formattedLine}
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    );
                                  })() : (
                                    /* Non-toba standard task */
                                    <div>
                                      <div className="font-bold text-[#1A1A1A]">
                                        {t.title}
                                      </div>
                                      <div className="text-[11px] text-gray-500 flex flex-wrap gap-2 mt-0.5">
                                        {t.householdHeadName && <span>👤 {t.householdHeadName} 様</span>}
                                        {t.notes && <span>💬 {t.notes}</span>}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center space-x-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => handleOpenEditTodoModal(t)}
                                  className="p-1 text-gray-500 hover:text-black cursor-pointer"
                                >
                                  <Edit className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUBTAB 2: Reservation List View */}
      {subTab === 'list' && (
        <div className="bg-white border-2 border-[#D1CEC7] p-4 sm:p-5 shadow-md space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-[#E5E0D8] pb-3">
            <div className="flex items-center space-x-2">
              <Layers className="w-5 h-5 text-[#8C2D19]" />
              <h3 className="text-lg font-bold text-[#1A1A1A] tracking-wider">
                法事・法要・塔婆予約一覧
              </h3>
              <span className="text-xs font-sans bg-[#EFECE6] px-2 py-0.5 font-bold text-[#555555]">
                {filteredServices.length === householdServices.length
                  ? `全 ${householdServices.length} 件`
                  : `${filteredServices.length} 件 / 全 ${householdServices.length} 件`}
              </span>
            </div>

            {/* Filter Bar */}
            <div className="flex flex-wrap items-center gap-2 font-sans text-xs">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="施主名・戒名・俗名・備考検索..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8 pr-3 py-1.5 border border-[#D1CEC7] bg-[#FAFAF8] focus:bg-white text-xs w-48 sm:w-60"
                />
              </div>

              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="px-2 py-1.5 border border-[#D1CEC7] bg-[#FAFAF8] text-xs font-bold"
              >
                <option value="ALL">全法要種別</option>
                <option value="年忌法要">年忌法要</option>
                <option value="納骨法要">納骨法要</option>
                <option value="塔婆供養">塔婆供養</option>
                <option value="棚経">棚経</option>
                <option value="枕経">枕経</option>
                <option value="通夜">通夜</option>
                <option value="葬儀">葬儀</option>
                <option value="月参り">月参り</option>
                <option value="祈祷・厄除">祈祷・厄除</option>
                <option value="その他">その他</option>
              </select>

              <button
                type="button"
                onClick={() => handleOpenAddServiceModal()}
                className="px-3 py-1.5 bg-[#D4AF37] text-[#1A1A1A] font-bold hover:bg-[#C59B27] transition-colors flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+予定追加</span>
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse font-sans text-xs">
              <thead>
                <tr className="bg-[#1A1A1A] text-[#D4AF37] border-b border-[#D4AF37]">
                  <th className="p-2.5 whitespace-nowrap">予定日時</th>
                  <th className="p-2.5 whitespace-nowrap">法要種別</th>
                  <th className="p-2.5 whitespace-nowrap">施主（世帯主）</th>
                  <th className="p-2.5 whitespace-nowrap">故人・戒名</th>
                  <th className="p-2.5 whitespace-nowrap text-center">塔婆本数</th>
                  <th className="p-2.5 whitespace-nowrap text-center">会計管理連動</th>
                  <th className="p-2.5 whitespace-nowrap text-center">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E0D8]">
                {filteredServices.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-gray-500 text-sm">
                      該当する予約・法要は見つかりませんでした。
                    </td>
                  </tr>
                ) : (
                  filteredServices.map((s) => {
                    const { status: currentStatus, relatedTxs, totalPaid, isRecorded } = getServiceAccountingStatus(s);

                    return (
                      <tr key={s.id} className="hover:bg-[#FFFDF5] transition-colors">
                        <td className="p-2.5 whitespace-nowrap font-bold text-[#1A1A1A]">
                          <div>{s.scheduledDate}</div>
                          <div className="text-[11px] text-[#777777] font-normal">
                            {s.scheduledTime === '終日' || s.isAllDay
                              ? '終日'
                              : `${s.scheduledTime}〜${s.endTime || calculateEndTime(s.scheduledTime, 60)}`}
                          </div>
                        </td>
                        <td className="p-2.5 whitespace-nowrap">
                          <span
                            className={`px-2 py-0.5 font-bold rounded-xs text-[11px] ${
                              s.memorialType === '寺院行事'
                                ? 'bg-indigo-100 text-indigo-900 border border-indigo-300'
                                : s.memorialType === '他寺院助法・出向'
                                ? 'bg-teal-100 text-teal-900 border border-teal-300'
                                : s.memorialType === '会議・教区・公務'
                                ? 'bg-blue-100 text-blue-900 border border-blue-300'
                                : s.memorialType === '住職個人用務・私用'
                                ? 'bg-stone-200 text-stone-900 border border-stone-300'
                                : s.memorialType === '地域行事'
                                ? 'bg-cyan-100 text-cyan-900 border border-cyan-300'
                                : s.memorialType === '棚経'
                                ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                                : s.memorialType === '塔婆供養'
                                ? 'bg-amber-100 text-amber-900 border border-amber-300'
                                : s.memorialType === '枕経' || s.memorialType === '通夜' || s.memorialType === '葬儀' || s.memorialType === '枕経・通夜・葬儀'
                                ? 'bg-red-900 text-white'
                                : 'bg-[#EFECE6] text-[#1A1A1A] border border-[#D1CEC7]'
                            }`}
                          >
                            {formatServiceMemorialTypesDisplay(s)}
                          </span>
                        </td>
                        <td className="p-2.5 whitespace-nowrap font-bold text-[#1A1A1A]">
                          {formatChiefMournerDisplay(s.chiefMourner)}
                        </td>
                        <td className="p-2.5 whitespace-nowrap">
                          {(() => {
                            const deceasedList = getAllServiceDeceasedList(s);
                            if (deceasedList.length === 0) {
                              return (
                                <>
                                  <div className="font-bold text-[#8C2D19]">{s.dharmaName || '—'}</div>
                                  {s.deceasedName && <div className="text-[11px] text-[#666666]">{s.deceasedName}</div>}
                                </>
                              );
                            }
                            const mainDec = deceasedList[0];
                            const subDecs = deceasedList.slice(1);
                            return (
                              <div>
                                <div className="font-bold text-[#8C2D19] flex items-center gap-1">
                                  <span>{mainDec.dharmaName || (mainDec.deceasedName ? `${mainDec.deceasedName} 様` : '—')}</span>
                                  {subDecs.length > 0 && (
                                    <span className="px-1 py-0.2 bg-stone-100 text-stone-700 border border-stone-300 text-[10px] rounded-xs font-normal">
                                      他{subDecs.length}霊
                                    </span>
                                  )}
                                </div>
                                {mainDec.deceasedName && <div className="text-[11px] text-[#666666]">俗名: {mainDec.deceasedName}</div>}
                              </div>
                            );
                          })()}
                        </td>
                        <td className="p-2.5 whitespace-nowrap text-center">
                          {s.tobaCount && s.tobaCount > 0 ? (
                            <span className="px-2 py-0.5 bg-[#FAF2EB] text-[#8C2D19] border border-[#EACBBF] font-bold rounded-xs">
                              {s.tobaCount}本 ({s.tobaType || '大塔婆'})
                            </span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="p-2.5 whitespace-nowrap text-center">
                          {isRecorded ? (
                            <span
                              className="px-2.5 py-1 font-bold rounded-xs text-[11px] select-none cursor-default flex items-center justify-center gap-1 mx-auto bg-emerald-50 text-emerald-800 border border-emerald-300"
                              title="出納帳に記帳済み（二重入力防止のため会計入力完了済）"
                            >
                              <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                              <span>記載済</span>
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleOpenAccountingModal(s)}
                              className="px-3 py-1 font-bold rounded-xs text-[11px] cursor-pointer shadow-xs transition-colors flex items-center justify-center gap-1 mx-auto bg-[#FEF3C7] hover:bg-[#FDE047] text-[#92400E] border border-[#FDE68A]"
                              title="塔婆・布施・法事の科目を個別入力・出納帳へ連携"
                            >
                              <DollarSign className="w-3.5 h-3.5" />
                              <span>会計入力</span>
                            </button>
                          )}
                        </td>
                        <td className="p-2.5 whitespace-nowrap text-center">
                          <div className="flex items-center justify-center space-x-1.5">
                            <button
                              type="button"
                              onClick={() => handleOpenEditServiceModal(s)}
                              className="px-2 py-1 text-gray-700 hover:bg-gray-100 border border-gray-300 rounded-xs cursor-pointer flex items-center gap-0.5"
                              title="編集"
                            >
                              <Edit className="w-3.5 h-3.5" />
                              <span>編集</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteConfirmService(s)}
                              className="px-2 py-1 text-red-600 hover:bg-red-50 border border-red-200 rounded-xs cursor-pointer flex items-center gap-0.5"
                              title="削除"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>削除</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUBTAB 4: Todos & Tasks Management */}
      {subTab === 'todos' && (
        <div className="bg-white border-2 border-[#D1CEC7] p-4 sm:p-5 shadow-md space-y-4 font-sans">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-[#E5E0D8] pb-3">
            <div className="flex items-center space-x-2">
              <ListTodo className="w-5 h-5 text-[#8C2D19]" />
              <h3 className="text-lg font-bold text-[#1A1A1A] tracking-wider">
                寺院ToDo・法務準備タスク管理
              </h3>
            </div>

            <div className="flex items-center space-x-2 text-xs">
              <div className="flex border border-[#D1CEC7] bg-[#FAFAF8] p-0.5">
                <button
                  type="button"
                  onClick={() => setTodoFilter('pending')}
                  className={`px-3 py-1 font-bold cursor-pointer ${todoFilter === 'pending' ? 'bg-[#1A1A1A] text-white' : 'text-gray-600'}`}
                >
                  未完了のみ
                </button>
                <button
                  type="button"
                  onClick={() => setTodoFilter('all')}
                  className={`px-3 py-1 font-bold cursor-pointer ${todoFilter === 'all' ? 'bg-[#1A1A1A] text-white' : 'text-gray-600'}`}
                >
                  すべて ({templeTodos.length})
                </button>
                <button
                  type="button"
                  onClick={() => setTodoFilter('completed')}
                  className={`px-3 py-1 font-bold cursor-pointer ${todoFilter === 'completed' ? 'bg-[#1A1A1A] text-white' : 'text-gray-600'}`}
                >
                  完了済
                </button>
              </div>

              <button
                type="button"
                onClick={() => handleOpenAddTodoModal()}
                className="px-3 py-1.5 bg-[#D4AF37] text-[#1A1A1A] font-bold hover:bg-[#C59B27] transition-colors flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>タスク追加</span>
              </button>
            </div>
          </div>

          {/* Todo List */}
          <div className="space-y-2">
            {filteredTodos.length === 0 ? (
              <div className="text-center py-10 text-gray-500 text-sm">
                該当するタスクはありません。
              </div>
            ) : (
              filteredTodos.map((t) => {
                const isToba = t.category === '塔婆揮毫' || t.title.includes('塔婆') || (t.notes && t.notes.includes('塔婆'));
                const tobaInfo = isToba ? extractTobaTaskCoreInfo(t, memorialServices, pastRecords) : null;

                return (
                  <div
                    key={t.id}
                    className={`p-3.5 border flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all ${
                      t.completed
                        ? 'bg-gray-50 border-gray-200 opacity-60'
                        : isToba
                        ? 'bg-[#FFF9F6] border-[#8C2D19]/40 hover:border-[#8C2D19] shadow-xs'
                        : 'bg-white border-[#D1CEC7] hover:border-[#D4AF37]'
                    }`}
                  >
                    <div className="flex items-start sm:items-center space-x-3 flex-1">
                      <button
                        type="button"
                        onClick={() => handleToggleTodo(t)}
                        className="mt-0.5 sm:mt-0 text-gray-400 hover:text-emerald-600 cursor-pointer"
                      >
                        {t.completed ? (
                          <CheckSquare className="w-5 h-5 text-emerald-600" />
                        ) : (
                          <Square className="w-5 h-5 text-gray-400" />
                        )}
                      </button>
                      <div className="space-y-1 flex-1">
                        {/* Affiliated Temple Badge */}
                        {(() => {
                          const todoTemple = getTodoTempleInfo(t);
                          if (todoTemple.isAffiliated) {
                            return (
                              <div className="mb-1">
                                <span className="inline-block px-2 py-0.5 bg-purple-900 text-purple-100 text-xs font-black border border-purple-400 rounded-xs shadow-2xs">
                                  兼務: {todoTemple.name}
                                </span>
                              </div>
                            );
                          } else if (temples.length > 1) {
                            return (
                              <div className="mb-1">
                                <span className="inline-block px-2 py-0.5 bg-[#1A1A1A] text-[#D4AF37] text-xs font-bold rounded-xs">
                                  本寺: {todoTemple.name}
                                </span>
                              </div>
                            );
                          }
                          return null;
                        })()}

                        {isToba ? (() => {
                          const tobaLines = extractTobaLines(t, memorialServices, pastRecords);
                          return (
                            <div className="space-y-1.5">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="px-2 py-0.5 bg-[#8C2D19] text-white text-xs font-bold rounded-2xs">
                                  🎋 塔婆作成 ({tobaLines.length}本)
                                </span>
                                <span className="text-xs text-gray-500 font-sans ml-auto sm:ml-2">
                                  📅 期日: <strong className={t.dueDate <= todayStr && !t.completed ? 'text-red-600 font-bold' : 'text-gray-700'}>{t.dueDate} {t.dueTime || ''}</strong>
                                </span>
                              </div>

                              {/* Toba Lines: 1 line per toba, enlarged font size */}
                              <div className={`space-y-1.5 bg-[#FAF8F5] p-2.5 rounded-xs border border-[#E5DFD5] ${t.completed ? 'opacity-50 line-through' : ''}`}>
                                {tobaLines.map((line, idx) => (
                                  <div
                                    key={idx}
                                    className="text-base sm:text-lg font-black font-serif text-[#1A1A1A] leading-relaxed tracking-wide break-words border-b border-[#EBE5DA] pb-1 last:border-b-0 last:pb-0"
                                  >
                                    {line.formattedLine}
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })() : (
                          /* Standard Non-Toba Task */
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span
                                className={`text-sm ${
                                  t.completed
                                    ? 'line-through text-gray-500 font-normal'
                                    : 'font-bold text-[#1A1A1A]'
                                }`}
                              >
                                {t.title}
                              </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500 mt-1">
                              <span>📅 期日: <strong className={t.dueDate <= todayStr && !t.completed ? 'text-red-600 font-bold' : 'text-gray-700'}>{t.dueDate} {t.dueTime || ''}</strong></span>
                              {t.householdHeadName && <span>👤 施主: {t.householdHeadName} 様</span>}
                              {t.notes && <span>💬 {t.notes}</span>}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center space-x-2 text-xs font-bold shrink-0">
                      <span className={`px-2 py-0.5 ${isToba ? 'bg-[#8C2D19]/10 text-[#8C2D19]' : 'bg-[#EFECE6] text-[#555555]'}`}>
                        {t.category}
                      </span>
                      <span
                        className={`px-2 py-0.5 ${
                          t.priority === 'high'
                            ? 'bg-red-100 text-red-800'
                            : t.priority === 'medium'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        優先度: {t.priority === 'high' ? '高' : t.priority === 'medium' ? '中' : '低'}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleOpenEditTodoModal(t)}
                        className="p-1 text-gray-600 hover:text-black cursor-pointer"
                        title="編集"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteTodo(t.id)}
                        className="p-1 text-gray-400 hover:text-red-600 cursor-pointer"
                        title="削除"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* SUBTAB 5: Tanagyo & Map Route */}
      {subTab === 'tanagyo' && (
        <div className="space-y-6 font-sans">
          {/* Header & Control Panel */}
          <div className="bg-white border-2 border-[#D1CEC7] p-4 sm:p-5 shadow-md space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-[#E5E0D8] pb-4">
              <div className="space-y-1">
                <div className="flex items-center space-x-2">
                  <Navigation className="w-5 h-5 text-[#8C2D19]" />
                  <h3 className="text-lg font-black text-[#1A1A1A] tracking-wider">
                    お盆棚経・訪問マップ巡回計画
                  </h3>
                  <span className="text-xs font-bold px-2 py-0.5 bg-[#1A1A1A] text-[#D4AF37]">
                    棚経対象: 全{tanagyoPatronHouseholds.length}件
                  </span>
                </div>
                <p className="text-xs text-gray-500">
                  名簿で棚経対象にチェックされた檀家を、住所順にリストアップし日程・時間帯（午前/午後）・担当僧侶を割り当てます。
                </p>
              </div>

              {/* Filtering Controls */}
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {/* Search Input */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-2.5" />
                  <input
                    type="text"
                    placeholder="氏名・住所・地区・電話検索..."
                    value={tanagyoSearchTerm}
                    onChange={(e) => setTanagyoSearchTerm(e.target.value)}
                    className="pl-8 pr-3 py-1.5 border border-gray-300 rounded-xs bg-white text-xs font-bold w-48 sm:w-56"
                  />
                  {tanagyoSearchTerm && (
                    <button
                      type="button"
                      onClick={() => setTanagyoSearchTerm('')}
                      className="absolute right-2 top-2 text-gray-400 hover:text-black"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Priest Filter */}
                <div className="flex items-center gap-1 bg-gray-50 p-1 border border-gray-300 rounded-xs">
                  <UserCheck className="w-3.5 h-3.5 text-gray-600 ml-1" />
                  <select
                    value={tanagyoPriestFilter}
                    onChange={(e) => setTanagyoPriestFilter(e.target.value)}
                    className="bg-transparent text-xs font-bold pr-2 py-0.5 focus:outline-none"
                  >
                    <option value="ALL">担当僧侶: 全員表示</option>
                    {priests.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Notice Board Print Button */}
                <button
                  type="button"
                  onClick={() => setIsTanagyoNoticeModalOpen(true)}
                  className="px-3 py-1.5 bg-[#1A1A1A] hover:bg-[#333333] text-[#D4AF37] border border-[#D4AF37] font-bold text-xs flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                  title="棚経等の巡回予定一覧表を印刷"
                >
                  <Printer className="w-3.5 h-3.5 text-[#D4AF37]" />
                  <span>巡回予定表印刷</span>
                </button>

                {/* Tanagyo Accounting Batch Modal Button */}
                <button
                  type="button"
                  onClick={() => setIsTanagyoAccountingModalOpen(true)}
                  className="px-3 py-1.5 bg-[#8C2D19] hover:bg-[#702414] text-white font-bold text-xs flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer border border-[#D4AF37]/50"
                  title="巡回担当・日付・順序順に棚経の会計（お布施・供養料）を出納帳へ一括入力・計上します"
                >
                  <DollarSign className="w-3.5 h-3.5 text-[#D4AF37]" />
                  <span>💰 棚経 会計一括入力</span>
                </button>

                {/* View Section Filter */}
                <div className="inline-flex rounded-xs border border-gray-300 overflow-hidden font-bold">
                  <button
                    type="button"
                    onClick={() => setTanagyoActiveSection('all')}
                    className={`px-3 py-1.5 transition-colors ${
                      tanagyoActiveSection === 'all'
                        ? 'bg-[#1A1A1A] text-[#D4AF37]'
                        : 'bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    すべて
                  </button>
                  <button
                    type="button"
                    onClick={() => setTanagyoActiveSection('unassigned')}
                    className={`px-3 py-1.5 transition-colors flex items-center gap-1 ${
                      tanagyoActiveSection === 'unassigned'
                        ? 'bg-[#8C2D19] text-white'
                        : 'bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <span>未割当</span>
                    <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${tanagyoActiveSection === 'unassigned' ? 'bg-white text-[#8C2D19]' : 'bg-red-100 text-red-700'}`}>
                      {unassignedTanagyoList.length}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setTanagyoActiveSection('assigned')}
                    className={`px-3 py-1.5 transition-colors flex items-center gap-1 ${
                      tanagyoActiveSection === 'assigned'
                        ? 'bg-blue-700 text-white'
                        : 'bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <span>割当済巡回表</span>
                    <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${tanagyoActiveSection === 'assigned' ? 'bg-white text-blue-700' : 'bg-blue-100 text-blue-700'}`}>
                      {tanagyoPatronHouseholds.length - unassignedTanagyoList.length}
                    </span>
                  </button>
                </div>
              </div>
            </div>

            {/* Quick Summary Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-2.5 bg-gray-50 border border-gray-200">
                <div className="text-gray-500 font-medium">棚経対象世帯</div>
                <div className="text-lg font-black text-[#1A1A1A] mt-0.5">{tanagyoPatronHouseholds.length} <span className="text-xs font-normal">軒</span></div>
              </div>
              <div className="p-2.5 bg-red-50 border border-red-200">
                <div className="text-red-700 font-medium">未割当（日程・担当未定）</div>
                <div className="text-lg font-black text-red-700 mt-0.5">{unassignedTanagyoList.length} <span className="text-xs font-normal">軒</span></div>
              </div>
              <div className="p-2.5 bg-blue-50 border border-blue-200">
                <div className="text-blue-700 font-medium">割当完了（巡回計画済）</div>
                <div className="text-lg font-black text-blue-700 mt-0.5">
                  {tanagyoPatronHouseholds.length - unassignedTanagyoList.length} <span className="text-xs font-normal">軒</span>
                </div>
              </div>
              <div className="p-2.5 bg-amber-50 border border-amber-200">
                <div className="text-amber-800 font-medium">登録担当僧侶数</div>
                <div className="text-lg font-black text-amber-800 mt-0.5">{priests.length} <span className="text-xs font-normal">名</span></div>
              </div>
            </div>
          </div>

          {/* SECTION 1: 未割当リスト（住所順） */}
          {(tanagyoActiveSection === 'all' || tanagyoActiveSection === 'unassigned') && (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                setIsDropTargetUnassignedArea(true);
              }}
              onDragLeave={(e) => {
                // Prevent flicker when hovering child elements
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                  setIsDropTargetUnassignedArea(false);
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                let fallbackId = '';
                try {
                  const json = e.dataTransfer.getData('application/json');
                  if (json) {
                    const parsed = JSON.parse(json);
                    fallbackId = parsed.householdId;
                  }
                } catch {
                  // ignore
                }
                if (!fallbackId) {
                  fallbackId = e.dataTransfer.getData('text/plain');
                }
                handleDropToUnassigned(fallbackId);
              }}
              className={`bg-white border-2 transition-all p-4 sm:p-5 shadow-md space-y-3 ${
                isDropTargetUnassignedArea
                  ? 'border-red-500 bg-red-50/50 ring-2 ring-red-400'
                  : 'border-[#D1CEC7]'
              }`}
            >
              <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 border-b border-[#E5E0D8] pb-3">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center space-x-2">
                    <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
                    <h4 className="text-base font-black text-[#1A1A1A]">
                      ① 未割当の檀信徒一覧（住所順）
                    </h4>
                    <span className="px-2 py-0.5 bg-red-100 text-red-800 font-bold text-xs rounded-full">
                      {unassignedTanagyoList.length}件
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsTanagyoMapModalOpen(true)}
                    className="px-2.5 py-1 bg-[#8C2D19] hover:bg-[#702414] text-white font-bold text-xs rounded-xs cursor-pointer shadow-xs flex items-center gap-1.5 transition-colors border border-[#D4AF37]/50"
                    title="国土地理院地図上で未割当檀家のピンを確認し、日程・担当・巡回順序を視覚的に計画・割当します"
                  >
                    <MapPin className="w-3.5 h-3.5 text-[#D4AF37]" />
                    <span>🗺️ 地図上で計画・割当</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleResetAllTanagyoAssignments}
                    className="px-2 py-1 bg-white hover:bg-red-50 text-red-700 font-bold text-xs rounded-xs cursor-pointer shadow-2xs border border-red-300 flex items-center gap-1 transition-colors"
                    title="棚経の日程・担当・順序などの割当をすべて解除し、未割当の状態に戻します"
                  >
                    <RotateCcw className="w-3 h-3 text-red-600" />
                    <span>全割当を未割当にリセット</span>
                  </button>

                  {/* 所属寺院絞り込みセレクター */}
                  {temples && temples.length > 1 && (
                    <div className="flex items-center space-x-1 text-xs bg-amber-50/80 border border-[#D4AF37] px-2 py-1 rounded-xs shadow-2xs">
                      <span className="text-gray-600 font-bold whitespace-nowrap">所属寺院:</span>
                      <select
                        value={tanagyoTempleFilter}
                        onChange={(e) => setTanagyoTempleFilter(e.target.value)}
                        className="bg-transparent font-bold text-gray-800 outline-hidden cursor-pointer text-xs"
                      >
                        <option value="ALL">全寺院（合算）</option>
                        {temples.map((t) => {
                          const mainId = temples.find((x) => x.isMain)?.id || 'temple-main';
                          const count = tanagyoPatronHouseholds.filter(
                            (h) => (h.templeId || mainId) === t.id
                          ).length;
                          return (
                            <option key={t.id} value={t.id}>
                              {t.name} ({count}軒)
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  )}
                </div>

                {/* 訪問日程クイック候補（3枠）設定バー */}
                <div className="flex flex-wrap items-center gap-2 bg-[#FAF7F0] border border-[#D4AF37]/60 px-3 py-1.5 rounded-xs shadow-2xs">
                  <div className="flex items-center gap-1.5 font-black text-xs text-[#8C2D19]">
                    <CalendarDays className="w-4 h-4 text-[#8C2D19] shrink-0" />
                    <span>日程候補 (3枠):</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {tanagyoDateCandidates.map((cDate, cIdx) => (
                      <input
                        key={cIdx}
                        type="text"
                        value={cDate}
                        onChange={(e) => handleUpdateCandidateDate(cIdx, e.target.value)}
                        className="w-16 p-1 border-2 border-[#D4AF37] bg-white font-black text-center text-xs rounded-xs shadow-xs focus:ring-1 focus:ring-[#8C2D19] text-[#1A1A1A]"
                        placeholder={`枠${cIdx + 1}`}
                        title={`訪問日程候補 ${cIdx + 1}（7月盆・8月盆・月参り等、自由に直接入力できます）`}
                      />
                    ))}
                  </div>
                  <div className="h-4 w-px bg-amber-300 hidden md:block" />
                  <div className="flex items-center gap-1 flex-wrap text-[11px]">
                    <span className="text-gray-500 font-bold">切替:</span>
                    <button
                      type="button"
                      onClick={() => handleApplyDatePreset(['8/13', '8/14', '8/15'])}
                      className="px-2 py-0.5 bg-white hover:bg-amber-100 text-gray-800 font-bold border border-amber-300 rounded-xs transition-colors cursor-pointer text-[11px]"
                      title="8月旧盆（8/13, 8/14, 8/15）にセット"
                    >
                      8月盆
                    </button>
                    <button
                      type="button"
                      onClick={() => handleApplyDatePreset(['7/13', '7/14', '7/15'])}
                      className="px-2 py-0.5 bg-white hover:bg-amber-100 text-gray-800 font-bold border border-amber-300 rounded-xs transition-colors cursor-pointer text-[11px]"
                      title="7月新盆（7/13, 7/14, 7/15）にセット"
                    >
                      7月盆
                    </button>
                    <button
                      type="button"
                      onClick={() => handleApplyDatePreset(['1日', '15日', '24日'])}
                      className="px-2 py-0.5 bg-white hover:bg-amber-100 text-gray-800 font-bold border border-amber-300 rounded-xs transition-colors cursor-pointer text-[11px]"
                      title="月参り（1日, 15日, 24日）にセット"
                    >
                      月参り
                    </button>
                  </div>
                </div>
              </div>

              {/* Drop Target Helper Banner when dragging from assigned */}
              {draggedTanagyo && !draggedTanagyo.isUnassigned && (
                <div className="p-2.5 bg-red-100/80 border-2 border-dashed border-red-400 text-red-800 text-xs font-black text-center rounded-xs animate-pulse">
                  ここにドロップすると「{households.find(h => h.id === draggedTanagyo.householdId)?.familyHead} 様」の割当を解除して未割当リストへ戻します
                </div>
              )}

              {unassignedTanagyoList.length === 0 ? (
                <div className="py-8 text-center bg-green-50 border border-green-200 text-green-800 text-xs font-bold flex items-center justify-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                  <span>すべての棚経対象檀家の巡回日程および担当僧侶の割当が完了しています。</span>
                </div>
              ) : (
                <div className="overflow-x-auto border border-[#D1CEC7]">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-[#1A1A1A] text-white text-xs">
                        <th className="p-2.5 text-center w-14 font-bold text-[#D4AF37]">移動 / 番号</th>
                        <th className="p-2.5 font-bold">氏名</th>
                        <th className="p-2.5 font-bold">所属寺院</th>
                        <th className="p-2.5 font-bold">住所（棚経住所優先）</th>
                        <th className="p-2.5 font-bold text-center">訪問日程</th>
                        <th className="p-2.5 font-bold text-center">午前/午後</th>
                        <th className="p-2.5 font-bold">担当僧侶</th>
                        <th className="p-2.5 font-bold text-center w-28">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E5E0D8]">
                      {unassignedTanagyoList.map((h, idx) => (
                        <UnassignedTanagyoRow
                          key={h.id}
                          household={h}
                          index={idx}
                          priests={priests}
                          dateCandidates={tanagyoDateCandidates}
                          pastRecords={pastRecords}
                          bonSeason={templeInfo?.bonSeason}
                          temples={temples}
                          templeInfo={templeInfo}
                          onAssign={handleAssignTanagyo}
                          isDragging={draggedTanagyo?.householdId === h.id}
                          onDragStart={(draggedH) => {
                            setTimeout(() => {
                              setDraggedTanagyo({
                                householdId: draggedH.id,
                                isUnassigned: true,
                              });
                            }, 0);
                          }}
                          onDragEnd={() => {
                            setDraggedTanagyo(null);
                            setDropTargetSlotKey(null);
                            setDropTargetHouseholdId(null);
                            setDropTargetPosition(null);
                            setIsDropTargetUnassignedArea(false);
                          }}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* SECTION 2: 割当済み巡回表（担当別 → 日程順 → 午前/午後順） */}
          {(tanagyoActiveSection === 'all' || tanagyoActiveSection === 'assigned') && (
            <div className="space-y-5">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b-2 border-[#1A1A1A] pb-2">
                <div className="flex items-center space-x-2">
                  <Compass className="w-5 h-5 text-[#8C2D19]" />
                  <h4 className="text-base font-black text-[#1A1A1A]">
                    ② 担当僧侶別 巡回計画表（日程・時間帯順）
                  </h4>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="text-xs text-gray-600 font-medium bg-amber-50 px-2.5 py-1 border border-amber-200 rounded-xs flex items-center gap-1.5">
                    <GripVertical className="w-4 h-4 text-amber-700 shrink-0" />
                    <span>ドラッグ＆ドロップまたは上下ボタンで巡回順序を入れ替え</span>
                  </div>
                  {assignedTanagyoGroups.length > 0 && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleResetAllTanagyoAssignments}
                        className="px-2.5 py-1 bg-white hover:bg-red-50 text-red-700 font-bold text-xs flex items-center gap-1 rounded-xs shadow-2xs border border-red-300 cursor-pointer transition-colors"
                        title="現在の割当（日程・時間帯・担当僧侶・巡回順序）をすべて解除し、未割当リストに戻します"
                      >
                        <RotateCcw className="w-3.5 h-3.5 text-red-600" />
                        <span>全割当を未割当にリセット</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleNormalizeAllTanagyoOrders}
                        className="px-3 py-1 bg-[#8C2D19] hover:bg-[#702414] text-white font-bold text-xs flex items-center gap-1.5 rounded-xs shadow-xs cursor-pointer transition-colors"
                        title="現在の表示順に基づき、全世帯の巡回順序番号（No.1〜）を確定してGoogleシート・Excel出力へ反映します"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>全巡回順序を確定・一括保存</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsTanagyoAccountingModalOpen(true)}
                        className="px-3 py-1 bg-[#1A1A1A] hover:bg-[#333333] text-[#D4AF37] font-bold text-xs flex items-center gap-1.5 rounded-xs shadow-xs cursor-pointer transition-colors border border-[#D4AF37]"
                        title="巡回計画の担当・日付・順序順に棚経の会計（お布施・供養料）を出納帳へ一括入力・計上します"
                      >
                        <DollarSign className="w-3.5 h-3.5 text-[#D4AF37]" />
                        <span>💰 会計一括入力</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {assignedTanagyoGroups.length === 0 ? (
                <div className="bg-white border border-[#D1CEC7] p-8 text-center text-gray-500 text-xs">
                  まだ割当済みの棚経計画はありません。上記の未割当一覧から日程・時間帯・担当を選択して「割当完了」を行うか、カードをドラッグして割り当ててください。
                </div>
              ) : (
                assignedTanagyoGroups.map((pGroup) => (
                  <div
                    key={pGroup.priestName}
                    className="bg-white border-2 border-[#D1CEC7] shadow-md overflow-hidden"
                  >
                    {/* Priest Header */}
                    <div className="bg-[#1A1A1A] text-white p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b-2 border-[#D4AF37]">
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 rounded-full bg-[#D4AF37] text-[#1A1A1A] font-black flex items-center justify-center text-sm">
                          僧
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-base font-black text-[#D4AF37]">
                              担当: {pGroup.priestName} 師
                            </span>
                            {pGroup.priestRole && (
                              <span className="text-[10px] px-1.5 py-0.2 bg-gray-800 text-gray-300 rounded-xs border border-gray-700">
                                {pGroup.priestRole}
                              </span>
                            )}
                            {pGroup.priestTemple && (
                              <span className="text-[10px] text-gray-400">
                                ({pGroup.priestTemple})
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-gray-300">
                            巡回予定合計: <strong className="text-white font-bold">{pGroup.totalCount}</strong> 件 / 日程数: {pGroup.dates.length} 日間
                          </div>
                        </div>
                      </div>

                      {/* Print Route Button for this priest */}
                      <button
                        type="button"
                        onClick={() => setPrintModalPriestData(pGroup)}
                        className="px-3.5 py-2 bg-[#D4AF37] hover:bg-[#C29F2B] text-[#1A1A1A] font-black text-xs transition-colors flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
                      >
                        <Printer className="w-4 h-4" />
                        <span>担当 {pGroup.priestName} の経路情報印刷</span>
                      </button>
                    </div>

                    {/* Dates & Slots */}
                    <div className="p-4 sm:p-5 space-y-6">
                      {pGroup.dates.map((dObj) => (
                        <div key={dObj.date} className="space-y-4">
                          <div className="flex items-center space-x-2 border-b border-gray-300 pb-1.5">
                            <CalendarIcon className="w-4 h-4 text-[#8C2D19]" />
                            <h5 className="font-black text-sm text-[#1A1A1A]">
                              訪問日: {dObj.date}
                            </h5>
                          </div>

                          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                            {dObj.slots.map((slot) => {
                              const slotKey = `${pGroup.priestName}__${dObj.date}__${slot.timeSlot}`;
                              const isSlotDropTarget = dropTargetSlotKey === slotKey;
                              const priestIdentifier = pGroup.priestId || pGroup.priestName;

                              return (
                                <div
                                  key={slot.timeSlot}
                                  onDragOver={(e) => {
                                    e.preventDefault();
                                    e.dataTransfer.dropEffect = 'move';
                                    if (dropTargetSlotKey !== slotKey) {
                                      setDropTargetSlotKey(slotKey);
                                    }
                                  }}
                                  onDragLeave={(e) => {
                                    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                                      if (dropTargetSlotKey === slotKey) {
                                        setDropTargetSlotKey(null);
                                        setDropTargetHouseholdId(null);
                                        setDropTargetPosition(null);
                                      }
                                    }
                                  }}
                                  onDrop={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    let fallbackId = '';
                                    try {
                                      const json = e.dataTransfer.getData('application/json');
                                      if (json) {
                                        const parsed = JSON.parse(json);
                                        fallbackId = parsed.householdId;
                                      }
                                    } catch {
                                      // ignore
                                    }
                                    if (!fallbackId) {
                                      fallbackId = e.dataTransfer.getData('text/plain');
                                    }
                                    handleTanagyoDrop(
                                      priestIdentifier,
                                      pGroup.priestName,
                                      dObj.date,
                                      slot.timeSlot,
                                      dropTargetHouseholdId,
                                      dropTargetPosition,
                                      fallbackId
                                    );
                                  }}
                                  className={`border transition-all p-3.5 flex flex-col justify-between space-y-3 rounded-xs ${
                                    isSlotDropTarget
                                      ? 'bg-amber-50/80 border-amber-500 ring-2 ring-amber-400 shadow-md'
                                      : 'bg-[#FAFAF8] border-[#D1CEC7]'
                                  }`}
                                >
                                  <div className="space-y-2.5">
                                    {/* Slot Header */}
                                    <div className="flex items-center justify-between border-b border-[#E5E0D8] pb-2">
                                      <div className="flex items-center space-x-2">
                                        <span
                                          className={`px-2 py-0.5 font-bold text-xs text-white rounded-xs ${
                                            slot.timeSlot === '午前'
                                              ? 'bg-blue-600'
                                              : slot.timeSlot === '午後'
                                              ? 'bg-orange-600'
                                              : 'bg-gray-600'
                                          }`}
                                        >
                                          {slot.timeSlot}
                                        </span>
                                        <span className="text-xs font-bold text-gray-700">
                                          {slot.households.length} 軒
                                        </span>
                                        {isSlotDropTarget && (
                                          <span className="text-[10px] font-bold text-amber-700 animate-pulse bg-amber-100 px-1.5 py-0.2 rounded-xs">
                                            ここにドロップ
                                          </span>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-2">
                                        {slot.households.length > 1 && (
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleNormalizeSlotOrder(slot.households);
                                            }}
                                            className="text-[10px] text-[#8C2D19] hover:bg-amber-100 px-1.5 py-0.5 rounded-xs border border-[#8C2D19]/30 transition-colors font-bold cursor-pointer"
                                            title="この枠内の巡回順序を上から 1, 2, 3... に確定・保存"
                                          >
                                            No.1〜整列
                                          </button>
                                        )}
                                        <span className="text-[11px] text-gray-500 font-medium">
                                          担当: {pGroup.priestName}
                                        </span>
                                      </div>
                                    </div>

                                    {/* Households List with Drag-and-Drop */}
                                    <div className="space-y-1.5 min-h-[48px]">
                                      {slot.households.length === 0 ? (
                                        <div className="py-4 text-center border border-dashed border-gray-300 text-gray-400 text-xs rounded-xs">
                                          ここに檀家をドラッグ＆ドロップして追加
                                        </div>
                                      ) : (
                                        slot.households.map((h, hIdx) => {
                                          const address = h.tanagyoAddress || h.address || '住所未登録';
                                          const isItemDragging = draggedTanagyo?.householdId === h.id;
                                          const isTargetThisItem = isSlotDropTarget && dropTargetHouseholdId === h.id;
                                          const isDropInsertBefore = isTargetThisItem && dropTargetPosition === 'before';
                                          const isDropInsertAfter = isTargetThisItem && dropTargetPosition === 'after';

                                          return (
                                            <React.Fragment key={h.id}>
                                              {/* Insertion indicator before */}
                                              {isDropInsertBefore && (
                                                <div className="h-1.5 bg-amber-500 rounded-full my-0.5 shadow-xs animate-pulse" />
                                              )}

                                              <div
                                                draggable
                                                onDragStart={(e) => {
                                                  e.stopPropagation();
                                                  e.dataTransfer.effectAllowed = 'move';
                                                  e.dataTransfer.setData('text/plain', h.id);
                                                  e.dataTransfer.setData(
                                                    'application/json',
                                                    JSON.stringify({
                                                      householdId: h.id,
                                                      sourcePriestId: priestIdentifier,
                                                      sourcePriestName: pGroup.priestName,
                                                      sourceDate: dObj.date,
                                                      sourceTimeSlot: slot.timeSlot,
                                                      sourceIndex: hIdx,
                                                      isUnassigned: false,
                                                    })
                                                  );
                                                  setTimeout(() => {
                                                    setDraggedTanagyo({
                                                      householdId: h.id,
                                                      sourcePriestId: priestIdentifier,
                                                      sourcePriestName: pGroup.priestName,
                                                      sourceDate: dObj.date,
                                                      sourceTimeSlot: slot.timeSlot,
                                                      sourceIndex: hIdx,
                                                      isUnassigned: false,
                                                    });
                                                  }, 0);
                                                }}
                                                onDragEnd={() => {
                                                  setDraggedTanagyo(null);
                                                  setDropTargetSlotKey(null);
                                                  setDropTargetHouseholdId(null);
                                                  setDropTargetPosition(null);
                                                  setIsDropTargetUnassignedArea(false);
                                                }}
                                                onDragOver={(e) => {
                                                  e.preventDefault();
                                                  e.stopPropagation();
                                                  e.dataTransfer.dropEffect = 'move';
                                                  if (dropTargetSlotKey !== slotKey) {
                                                    setDropTargetSlotKey(slotKey);
                                                  }
                                                  const rect = e.currentTarget.getBoundingClientRect();
                                                  const relY = e.clientY - rect.top;
                                                  const isAfter = relY > rect.height / 2;
                                                  setDropTargetHouseholdId(h.id);
                                                  setDropTargetPosition(isAfter ? 'after' : 'before');
                                                }}
                                                onDrop={(e) => {
                                                  e.preventDefault();
                                                  e.stopPropagation();
                                                  let fallbackId = '';
                                                  try {
                                                    const json = e.dataTransfer.getData('application/json');
                                                    if (json) {
                                                      const parsed = JSON.parse(json);
                                                      fallbackId = parsed.householdId;
                                                    }
                                                  } catch {
                                                    // ignore
                                                  }
                                                  if (!fallbackId) {
                                                    fallbackId = e.dataTransfer.getData('text/plain');
                                                  }
                                                  const rect = e.currentTarget.getBoundingClientRect();
                                                  const relY = e.clientY - rect.top;
                                                  const isAfter = relY > rect.height / 2;
                                                  handleTanagyoDrop(
                                                    priestIdentifier,
                                                    pGroup.priestName,
                                                    dObj.date,
                                                    slot.timeSlot,
                                                    h.id,
                                                    isAfter ? 'after' : 'before',
                                                    fallbackId
                                                  );
                                                }}
                                                className={`p-2 bg-white border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs rounded-xs select-none cursor-grab active:cursor-grabbing ${
                                                  isItemDragging
                                                    ? 'opacity-30 scale-95 border-amber-400 bg-amber-50'
                                                    : 'border-gray-200 hover:border-gray-400 hover:shadow-xs'
                                                }`}
                                              >
                                                <div className="flex items-start space-x-2 min-w-0">
                                                  <div className="flex items-center gap-1 shrink-0 mt-0.5">
                                                    <GripVertical className="w-3.5 h-3.5 text-gray-400 cursor-grab active:cursor-grabbing shrink-0" />
                                                    <span className="w-5 h-5 rounded-full bg-gray-100 text-gray-700 font-black text-[11px] flex items-center justify-center">
                                                      {hIdx + 1}
                                                    </span>
                                                    {/* Quick Up / Down Reorder Buttons */}
                                                    <div
                                                      className="flex flex-col gap-0.5 ml-0.5"
                                                      draggable={false}
                                                      onMouseDown={(e) => e.stopPropagation()}
                                                    >
                                                      <button
                                                        type="button"
                                                        disabled={hIdx === 0}
                                                        draggable={false}
                                                        onMouseDown={(e) => e.stopPropagation()}
                                                        onDragStart={(e) => {
                                                          e.preventDefault();
                                                          e.stopPropagation();
                                                        }}
                                                        onClick={(e) => {
                                                          e.stopPropagation();
                                                          handleMoveTanagyoSlotOrder(slot.households, hIdx, 'up');
                                                        }}
                                                        className={`p-0.5 rounded-xs border transition-colors ${
                                                          hIdx === 0
                                                            ? 'opacity-20 text-gray-400 border-transparent cursor-not-allowed'
                                                            : 'text-gray-700 bg-gray-50 hover:bg-amber-100 hover:text-[#8C2D19] border-gray-300 cursor-pointer shadow-2xs'
                                                        }`}
                                                        title="順番を1つ上へ移動"
                                                      >
                                                        <ChevronUp className="w-3 h-3" />
                                                      </button>
                                                      <button
                                                        type="button"
                                                        disabled={hIdx === slot.households.length - 1}
                                                        draggable={false}
                                                        onMouseDown={(e) => e.stopPropagation()}
                                                        onDragStart={(e) => {
                                                          e.preventDefault();
                                                          e.stopPropagation();
                                                        }}
                                                        onClick={(e) => {
                                                          e.stopPropagation();
                                                          handleMoveTanagyoSlotOrder(slot.households, hIdx, 'down');
                                                        }}
                                                        className={`p-0.5 rounded-xs border transition-colors ${
                                                          hIdx === slot.households.length - 1
                                                            ? 'opacity-20 text-gray-400 border-transparent cursor-not-allowed'
                                                            : 'text-gray-700 bg-gray-50 hover:bg-amber-100 hover:text-[#8C2D19] border-gray-300 cursor-pointer shadow-2xs'
                                                        }`}
                                                        title="順番を1つ下へ移動"
                                                      >
                                                        <ChevronDown className="w-3 h-3" />
                                                      </button>
                                                    </div>
                                                  </div>
                                                  <div className="min-w-0">
                                                    {(() => {
                                                      const niibonStatus = getHouseholdNiibonStatus(pastRecords, h.id, templeInfo?.bonSeason || '8月盆');
                                                      return (
                                                        <div className="flex items-center gap-1.5 flex-wrap">
                                                          <span className="font-bold text-[#1A1A1A]">
                                                            {h.familyHead} 様
                                                          </span>
                                                          <HouseholdTempleBadge
                                                            household={h}
                                                            temples={temples}
                                                            mainTempleInfo={templeInfo}
                                                            size="2xs"
                                                          />
                                                          {h.phone && (
                                                            <span className="text-[10px] text-gray-500">
                                                              (TEL: {h.phone})
                                                            </span>
                                                          )}
                                                          {h.district && (
                                                            <span className="text-[10px] px-1 bg-gray-100 text-gray-600 rounded-xs">
                                                              {h.district}
                                                            </span>
                                                          )}
                                                          {niibonStatus.isCurrentYearNiibon && (
                                                            <span
                                                              className="inline-flex items-center px-1.5 py-0.5 bg-amber-50 text-amber-900 border border-amber-300 font-bold text-[11px] rounded-xs whitespace-nowrap"
                                                              title={`本年度新盆対象: ${niibonStatus.currentYearRecords.map(r => `${r.dharmaName || r.secularName || '精霊'} (没:${r.deathDate || '-'})`).join('、')}`}
                                                            >
                                                              {niibonStatus.currentYearLabel}
                                                            </span>
                                                          )}
                                                          {niibonStatus.isNextYearNiibon && (
                                                            <span
                                                              className="inline-flex items-center px-1.5 py-0.5 bg-sky-50 text-sky-900 border border-sky-300 font-bold text-[11px] rounded-xs whitespace-nowrap"
                                                              title={`来年度新盆対象: ${niibonStatus.nextYearRecords.map(r => `${r.dharmaName || r.secularName || '精霊'} (没:${r.deathDate || '-'})`).join('、')}`}
                                                            >
                                                              {niibonStatus.nextYearLabel}
                                                            </span>
                                                          )}
                                                        </div>
                                                      );
                                                    })()}
                                                    <div className="text-[11px] text-gray-600 flex items-center gap-1 mt-0.5 truncate">
                                                      <MapPin className="w-3 h-3 text-red-500 shrink-0" />
                                                      <span className="truncate">{address}</span>
                                                    </div>
                                                  </div>
                                                </div>

                                                {/* Actions: Transfer modal, Reset */}
                                                <div
                                                  className="flex items-center gap-1.5 shrink-0 self-end sm:self-center"
                                                  draggable={false}
                                                  onMouseDown={(e) => e.stopPropagation()}
                                                >
                                                  <button
                                                    type="button"
                                                    draggable={false}
                                                    onMouseDown={(e) => e.stopPropagation()}
                                                    onDragStart={(e) => {
                                                      e.preventDefault();
                                                      e.stopPropagation();
                                                    }}
                                                    onClick={(e) => {
                                                      e.stopPropagation();
                                                      e.preventDefault();
                                                      setTransferModalHousehold(h);
                                                      setTransferPriestId(h.tanagyoPriestId || (priests.find(p => p.name === h.tanagyoPriestName)?.id || ''));
                                                      setTransferDate(h.tanagyoDate || '8/13');
                                                      setTransferTimeSlot(h.tanagyoTimeSlot || '午前');
                                                    }}
                                                    className="px-2 py-1 text-[11px] text-blue-700 hover:bg-blue-50 border border-blue-200 rounded-xs font-bold bg-white cursor-pointer transition-colors shadow-2xs"
                                                    title="担当・日程・時間帯を変更"
                                                  >
                                                    枠移動
                                                  </button>
                                                  <button
                                                    type="button"
                                                    draggable={false}
                                                    onMouseDown={(e) => e.stopPropagation()}
                                                    onDragStart={(e) => {
                                                      e.preventDefault();
                                                      e.stopPropagation();
                                                    }}
                                                    onClick={(e) => {
                                                      e.stopPropagation();
                                                      e.preventDefault();
                                                      handleClearTanagyoAssignment(h);
                                                    }}
                                                    className="px-2 py-1 text-[11px] text-red-700 hover:bg-red-50 border border-red-200 rounded-xs font-bold bg-white cursor-pointer transition-colors flex items-center gap-1 shadow-2xs"
                                                    title="割当を解除して未割当リストに戻す"
                                                  >
                                                    <RotateCcw className="w-3 h-3 text-red-600" />
                                                    <span>解除</span>
                                                  </button>
                                                </div>
                                              </div>

                                              {/* Insertion indicator after */}
                                              {isDropInsertAfter && (
                                                <div className="h-1.5 bg-amber-500 rounded-full my-0.5 shadow-xs animate-pulse" />
                                              )}
                                            </React.Fragment>
                                          );
                                        })
                                      )}
                                    </div>
                                  </div>

                                  {/* Slot Footer: Google Map Route Button */}
                                  <div className="pt-2 border-t border-[#E5E0D8]">
                                    {slot.households.length > 0 && (
                                      <>
                                        {slot.routeSegments && slot.routeSegments.length > 1 ? (
                                          <div className="space-y-1.5">
                                            <div className="flex items-center justify-between text-[11px] font-bold text-gray-700">
                                              <span className="flex items-center gap-1 text-blue-800">
                                                <Navigation className="w-3.5 h-3.5" />
                                                <span>GoogleMap 経路出力 (10件ごとに分割)</span>
                                              </span>
                                              <span className="text-[10px] text-gray-500 font-normal">
                                                全{slot.households.length}件 / {slot.routeSegments.length}区間
                                              </span>
                                            </div>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                                              {slot.routeSegments.map((seg) => (
                                                <a
                                                  key={seg.segmentIndex}
                                                  href={seg.routeUrl}
                                                  target="_blank"
                                                  rel="noopener noreferrer"
                                                  className="py-1.5 px-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-xs transition-colors flex items-center justify-between rounded-xs shadow-xs"
                                                >
                                                  <span className="flex items-center gap-1 truncate">
                                                    <span className="bg-blue-900/70 px-1 py-0.5 rounded text-[10px] shrink-0">
                                                      区間{seg.segmentIndex + 1}
                                                    </span>
                                                    <span className="truncate">
                                                      {seg.label} ({seg.startFamilyHead}様〜{seg.endFamilyHead}様)
                                                    </span>
                                                  </span>
                                                  <ExternalLink className="w-3 h-3 text-blue-200 shrink-0 ml-1" />
                                                </a>
                                              ))}
                                            </div>
                                          </div>
                                        ) : (
                                          <a
                                            href={slot.routeSegments?.[0]?.routeUrl || slot.routeUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="w-full py-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-xs transition-colors flex items-center justify-center gap-1.5 shadow-xs"
                                          >
                                            <Navigation className="w-3.5 h-3.5" />
                                            <span>
                                              GoogleMapで経路出力
                                              {slot.routeSegments?.[0]?.label ? ` (${slot.routeSegments[0].label})` : ' (1番目〜最後)'}
                                            </span>
                                            <ExternalLink className="w-3 h-3 text-blue-200" />
                                          </a>
                                        )}
                                      </>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {/* MODAL: 担当別 経路情報印刷プレビューモーダル（Portal化＆背景アプリ完全非表示で印刷） */}
      {printModalPriestData && createPortal(
        <div className="tanagyo-route-print-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 font-sans print:p-0 print:static print:bg-transparent print:overflow-visible">
          {/* 印刷専用スタイル：#root等のアプリ本体UIを完全に非表示化し、この台帳のみをA4縦で印刷 */}
          <style>{`
            @media print {
              #root,
              header,
              nav,
              aside,
              footer,
              .no-print,
              .no-print * {
                display: none !important;
              }
              @page {
                size: A4 portrait;
                margin: 10mm 12mm 10mm 12mm;
              }
              html, body {
                background: #ffffff !important;
                background-color: #ffffff !important;
                color: #000000 !important;
                margin: 0 !important;
                padding: 0 !important;
                width: 100% !important;
                height: auto !important;
                min-height: 0 !important;
                overflow: visible !important;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
              }
              .tanagyo-route-print-overlay {
                position: static !important;
                display: block !important;
                background: transparent !important;
                padding: 0 !important;
                margin: 0 !important;
                overflow: visible !important;
                width: 100% !important;
                height: auto !important;
                min-height: 0 !important;
                max-height: none !important;
              }
              .tanagyo-route-print-card {
                position: static !important;
                display: block !important;
                border: none !important;
                box-shadow: none !important;
                width: 100% !important;
                max-width: none !important;
                max-height: none !important;
                height: auto !important;
                overflow: visible !important;
                padding: 0 !important;
                margin: 0 !important;
                background: #ffffff !important;
              }
              .tanagyo-route-print-body {
                padding: 0 !important;
                margin: 0 !important;
                overflow: visible !important;
                max-height: none !important;
                height: auto !important;
              }
              .tanagyo-route-date-section {
                page-break-inside: auto !important;
                break-inside: auto !important;
              }
              .tanagyo-route-slot-block {
                page-break-inside: avoid !important;
                break-inside: avoid !important;
                margin-bottom: 16px !important;
                border: 1px solid #777 !important;
                background: #ffffff !important;
              }
              table {
                border-collapse: collapse !important;
              }
              th, td {
                border-color: #777 !important;
              }
            }
          `}</style>

          <div className="tanagyo-route-print-card bg-white border-2 border-[#1A1A1A] w-full max-w-4xl max-h-[92vh] shadow-2xl flex flex-col overflow-hidden print:border-none print:shadow-none print:max-h-none print:w-full print:max-w-none">
            {/* Header (No print) */}
            <div className="bg-[#1A1A1A] text-[#D4AF37] p-3.5 flex items-center justify-between no-print shrink-0">
              <div className="flex items-center space-x-2 font-bold text-sm tracking-wider">
                <Printer className="w-4 h-4 text-[#D4AF37]" />
                <span>棚経巡回ルート帳票印刷（担当: {printModalPriestData.priestName} 師）</span>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-3 py-1 bg-[#D4AF37] text-[#1A1A1A] font-black text-xs hover:bg-[#C29F2B] transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>この帳票を印刷する (A4)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPrintModalPriestData(null)}
                  className="text-gray-400 hover:text-white p-1 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Printable Content Area */}
            <div className="tanagyo-route-print-body p-6 overflow-y-auto space-y-6 text-[#1A1A1A] print:p-0 print:overflow-visible">
              {/* Document Header */}
              <div className="border-b-2 border-black pb-3 flex flex-col sm:flex-row sm:items-end justify-between gap-2">
                <div>
                  <h2 className="text-xl font-black tracking-widest text-[#1A1A1A]">
                    【棚経巡回 経路・訪問先台帳】
                  </h2>
                  <div className="text-sm font-bold mt-1 text-gray-700">
                    担当僧侶: <span className="text-base text-black font-black">{printModalPriestData.priestName} 師</span>
                    {printModalPriestData.priestRole && ` （${printModalPriestData.priestRole}）`}
                    {printModalPriestData.priestTemple && ` （${printModalPriestData.priestTemple}）`}
                  </div>
                </div>
                <div className="text-xs text-gray-600 text-right">
                  <div>{templeInfo.mountainName} {templeInfo.name}</div>
                  <div>出力日: {new Date().toLocaleDateString('ja-JP')}</div>
                </div>
              </div>

              {/* Dates and Slots Table */}
              <div className="space-y-6 print:space-y-4">
                {printModalPriestData.dates.map((dObj) => (
                  <div key={dObj.date} className="tanagyo-route-date-section space-y-4 print:space-y-3">
                    <div className="bg-gray-100 border-l-4 border-[#1A1A1A] px-3 py-1.5 font-black text-sm text-[#1A1A1A]">
                      訪問日程: {dObj.date}
                    </div>

                    {dObj.slots.map((slot) => (
                      <div
                        key={slot.timeSlot}
                        className="tanagyo-route-slot-block border border-gray-300 p-3 rounded-xs space-y-3 bg-white"
                      >
                        <div className="flex items-center justify-between border-b border-gray-200 pb-1.5">
                          <span className="font-black text-xs px-2 py-0.5 bg-black text-white">
                            {slot.timeSlot} （{slot.households.length} 軒）
                          </span>
                          <span className="text-[11px] text-gray-500 font-medium">
                            ※1番目の施主宅から最後の施主宅まで順に巡回
                          </span>
                        </div>

                        <div className="flex flex-col sm:flex-row print:flex-row gap-3 items-start">
                          {/* Households Table */}
                          <div className="flex-1 overflow-x-auto w-full">
                            <table className="w-full text-left text-xs print:text-[11px] border-collapse border border-gray-400">
                              <thead>
                                <tr className="bg-gray-100 text-gray-800 border-b border-gray-400">
                                  <th className="p-1.5 print:p-1 text-center w-10 border-r border-gray-400">順</th>
                                  <th className="p-1.5 print:p-1 font-bold border-r border-gray-400">施主名</th>
                                  <th className="p-1.5 print:p-1 font-bold border-r border-gray-400">電話番号</th>
                                  <th className="p-1.5 print:p-1 font-bold border-r border-gray-400">訪問先住所</th>
                                  <th className="p-1.5 print:p-1 font-bold text-center w-14">完了</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-300">
                                {slot.households.map((h, hIdx) => {
                                  const address = h.tanagyoAddress || h.address || '住所未登録';
                                  const niibonStatus = getHouseholdNiibonStatus(pastRecords, h.id, templeInfo?.bonSeason || '8月盆');
                                  return (
                                    <tr key={h.id} className="hover:bg-gray-50">
                                      <td className="p-1.5 print:p-1 text-center font-bold border-r border-gray-300">
                                        {hIdx + 1}
                                      </td>
                                      <td className="p-1.5 print:p-1 font-bold border-r border-gray-300 whitespace-nowrap">
                                        <div className="flex items-center gap-1">
                                          <span>{h.familyHead} 様</span>
                                          {niibonStatus.isCurrentYearNiibon && (
                                            <span className="inline-flex items-center px-1.5 py-0.2 text-[10px] font-bold bg-amber-50 text-amber-900 border border-amber-300 rounded-xs print:border-gray-500">
                                              {niibonStatus.currentYearLabel}
                                            </span>
                                          )}
                                          {niibonStatus.isNextYearNiibon && (
                                            <span className="inline-flex items-center px-1.5 py-0.2 text-[10px] font-bold bg-sky-50 text-sky-900 border border-sky-300 rounded-xs print:border-gray-500">
                                              {niibonStatus.nextYearLabel}
                                            </span>
                                          )}
                                        </div>
                                      </td>
                                      <td className="p-1.5 print:p-1 text-gray-700 border-r border-gray-300 whitespace-nowrap">
                                        {h.phone || h.mobile || '-'}
                                      </td>
                                      <td className="p-1.5 print:p-1 text-gray-800 border-r border-gray-300">
                                        {address}
                                      </td>
                                      <td className="p-1.5 print:p-1 text-center">
                                        <div className="w-4 h-4 border border-gray-500 mx-auto rounded-xs"></div>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>

                          {/* QR Code(s) for Google Map route */}
                          {slot.households.length > 0 && slot.routeSegments && slot.routeSegments.length > 0 && (
                            <div className="shrink-0 flex flex-wrap sm:flex-col print:flex-col gap-2 items-center justify-start">
                              {slot.routeSegments.map((seg) => (
                                <div
                                  key={seg.segmentIndex}
                                  className="w-32 print:w-28 flex flex-col items-center justify-center p-2 print:p-1.5 bg-gray-50 border border-gray-300 rounded-xs text-center space-y-1"
                                >
                                  <QRCodeSVG
                                    value={seg.routeUrl}
                                    size={80}
                                    level="M"
                                    includeMargin={false}
                                  />
                                  <div className="text-[10px] font-black text-gray-800 leading-tight">
                                    {slot.routeSegments.length > 1 ? `区間${seg.segmentIndex + 1}: ${seg.label}` : `経路QR (${seg.label})`}
                                  </div>
                                  <div className="text-[9px] text-gray-500 truncate max-w-[105px]">
                                    {seg.startFamilyHead}様〜{seg.endFamilyHead}様
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* MODAL: 枠間移動（振替）モーダル */}
      {transferModalHousehold && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 font-sans no-print">
          <div className="bg-white border-2 border-[#1A1A1A] w-full max-w-md shadow-2xl flex flex-col">
            <div className="bg-[#1A1A1A] text-[#D4AF37] p-3.5 flex items-center justify-between">
              <h3 className="font-bold text-sm tracking-wider flex items-center gap-2">
                <Compass className="w-4 h-4 text-[#D4AF37]" />
                <span>棚経枠の変更（担当・日程・時間帯）</span>
              </h3>
              <button
                type="button"
                onClick={() => setTransferModalHousehold(null)}
                className="text-gray-400 hover:text-white cursor-pointer p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-4 text-xs">
              <div className="p-3 bg-gray-50 border border-gray-200">
                <div className="text-gray-500 font-medium">移動対象檀家</div>
                <div className="text-base font-black text-[#1A1A1A] mt-0.5">
                  {transferModalHousehold.familyHead} 様
                </div>
                <div className="text-xs text-gray-600 mt-1">
                  住所: {transferModalHousehold.tanagyoAddress || transferModalHousehold.address || '未設定'}
                </div>
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">
                  移動先 担当僧侶 <span className="text-red-600">*</span>
                </label>
                <select
                  value={transferPriestId}
                  onChange={(e) => setTransferPriestId(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-xs bg-white font-bold"
                >
                  {priests.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.role ? `[${p.role}] ` : ''}{p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">
                  移動先 訪問日 <span className="text-red-600">*</span>
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="例: 8/13"
                    value={transferDate}
                    onChange={(e) => setTransferDate(e.target.value)}
                    className="flex-1 p-2 border border-gray-300 rounded-xs bg-white font-bold"
                  />
                  <div className="flex gap-1">
                    {tanagyoDateCandidates.map((d, dIdx) => (
                      <button
                        key={`${d}_${dIdx}`}
                        type="button"
                        onClick={() => setTransferDate(d)}
                        className={`px-2 py-1.5 text-xs font-bold border rounded-xs transition-colors cursor-pointer ${
                          transferDate === d
                            ? 'bg-amber-600 text-white border-amber-600'
                            : 'bg-gray-100 hover:bg-gray-200 text-gray-700 border-gray-300'
                        }`}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">
                  移動先 時間帯 <span className="text-red-600">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setTransferTimeSlot('午前')}
                    className={`py-2 text-xs font-bold border rounded-xs transition-colors ${
                      transferTimeSlot === '午前'
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    午前
                  </button>
                  <button
                    type="button"
                    onClick={() => setTransferTimeSlot('午後')}
                    className={`py-2 text-xs font-bold border rounded-xs transition-colors ${
                      transferTimeSlot === '午後'
                        ? 'bg-orange-600 text-white border-orange-600'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    午後
                  </button>
                </div>
              </div>

              <div className="pt-3 border-t border-gray-200 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const targetH = transferModalHousehold;
                    setTransferModalHousehold(null);
                    if (targetH) {
                      handleClearTanagyoAssignment(targetH);
                    }
                  }}
                  className="px-3 py-2 text-xs font-bold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-xs flex items-center gap-1.5 cursor-pointer transition-colors"
                  title="この檀家の割当を解除して未割当リストに戻す"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>割当を解除</span>
                </button>
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => setTransferModalHousehold(null)}
                    className="px-4 py-2 border border-gray-300 text-gray-700 font-bold hover:bg-gray-50 rounded-xs cursor-pointer"
                  >
                    キャンセル
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      handleExecuteTransfer(
                        transferModalHousehold,
                        transferPriestId,
                        transferDate,
                        transferTimeSlot
                      )
                    }
                    className="px-4 py-2 bg-[#8C2D19] text-white font-bold hover:bg-[#702414] transition-colors rounded-xs cursor-pointer"
                  >
                    枠を移動する
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Add/Edit Memorial Service & Event Schedule (Unified MobileServiceModal) */}
      <MobileServiceModal
        isOpen={showServiceModal}
        onClose={() => {
          setShowServiceModal(false);
          setEditingService(null);
        }}
        service={editingService}
        initialDate={serviceModalInitialDate}
        initialHouseholdId={serviceModalInitialHhId}
        initialPastRecordId={serviceModalInitialPastId}
        initialMilestoneType={serviceModalInitialMilestone}
        households={households}
        pastRecords={pastRecords}
        temples={temples}
        activeTempleId={activeTempleId}
        onSave={handleSaveServiceFromModal}
        onSaveTodo={onAddTodo}
        onDelete={handleDeleteServiceFromModal}
      />

      {/* Modal: Add/Edit Todo */}
      {showTodoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 font-sans no-print">
          <div className="bg-white border-2 border-[#1A1A1A] w-full max-w-md shadow-2xl flex flex-col">
            <div className="bg-[#1A1A1A] text-[#D4AF37] p-3.5 flex items-center justify-between">
              <h3 className="font-bold text-sm tracking-wider flex items-center gap-2">
                <CheckSquare className="w-4 h-4 text-[#D4AF37]" />
                <span>{editingTodo ? 'タスクの編集' : '新規ToDo・タスク登録'}</span>
              </h3>
              <button
                type="button"
                onClick={handleRequestCloseTodoModal}
                className="text-gray-400 hover:text-white cursor-pointer p-1 transition-colors"
                title="閉じる"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveTodo} className="p-4 space-y-3 text-xs">
              <div>
                <label className="block font-bold text-[#333333] mb-1">
                  タスク名・内容 <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  placeholder="例: 田中家（孝雄儀）七回忌の卒塔婆揮毫"
                  value={todoFormData.title || ''}
                  onChange={(e) => setTodoFormData({ ...todoFormData, title: e.target.value })}
                  required
                  className="w-full p-2 border border-[#D1CEC7] bg-white font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <DateInputWithEra
                    label="締切期日"
                    value={todoFormData.dueDate || ''}
                    onChange={(d) => setTodoFormData({ ...todoFormData, dueDate: d })}
                    memorialServices={memorialServices}
                    placeholder="例: 2026/08/25, 令和8年8月25日"
                  />
                </div>
                <div>
                  <label className="block font-bold text-[#333333] mb-1">カテゴリ</label>
                  <select
                    value={todoFormData.category || '法要準備'}
                    onChange={(e) => setTodoFormData({ ...todoFormData, category: e.target.value as any })}
                    className="w-full p-2 border border-[#D1CEC7] bg-white font-bold"
                  >
                    <option value="法要準備">法要準備</option>
                    <option value="塔婆揮毫">塔婆揮毫</option>
                    <option value="案内発送">案内発送</option>
                    <option value="境内整備">境内整備</option>
                    <option value="会計処理">会計処理</option>
                    <option value="棚経準備">棚経準備</option>
                    <option value="その他">その他</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-[#333333] mb-1">優先度</label>
                <select
                  value={todoFormData.priority || 'medium'}
                  onChange={(e) => setTodoFormData({ ...todoFormData, priority: e.target.value as any })}
                  className="w-full p-2 border border-[#D1CEC7] bg-white font-bold"
                >
                  <option value="high">優先度: 高 (至急)</option>
                  <option value="medium">優先度: 中 (通常)</option>
                  <option value="low">優先度: 低 (後日)</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-[#333333] mb-1">備考・詳細メモ</label>
                <textarea
                  rows={2}
                  value={todoFormData.notes || ''}
                  onChange={(e) => setTodoFormData({ ...todoFormData, notes: e.target.value })}
                  className="w-full p-2 border border-[#D1CEC7] bg-white"
                />
              </div>

              <div className="pt-3 border-t border-[#E5E0D8] flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowTodoModal(false)}
                  className="px-3 py-1.5 border border-[#D1CEC7] text-gray-600 hover:bg-gray-100 font-bold cursor-pointer"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-[#D4AF37] text-[#1A1A1A] font-black hover:bg-[#C59B27] transition-colors cursor-pointer"
                >
                  保存
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Save Confirmation Modal for ToDo */}
      <SaveConfirmModal
        isOpen={showTodoSaveConfirm}
        title="ToDo・タスクの保存確認"
        message="編集中のタスクを保存しますか？"
        description="「保存して閉じる」を押すと、入力内容を反映してタスクを保存します。「保存せずに閉じる」を押すと今回の編集内容は破棄されます。"
        onSaveAndClose={executeSaveTodoAndClose}
        onDiscardAndClose={() => {
          setShowTodoSaveConfirm(false);
          setShowTodoModal(false);
        }}
        onCancel={() => setShowTodoSaveConfirm(false)}
      />

      {/* Modal: Accounting Recording Modal (法事後に科目と金額を入力して出納帳に記載) */}
      {recordAccountingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 font-sans no-print">
          <div className="bg-white border-2 border-[#1A1A1A] w-full max-w-md shadow-2xl flex flex-col">
            <div className="bg-[#1A1A1A] text-[#D4AF37] p-3.5 flex items-center justify-between">
              <h3 className="font-bold text-sm tracking-wider flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-[#D4AF37]" />
                <span>法事・法要の会計記帳（出納帳連動）</span>
              </h3>
              <button
                type="button"
                onClick={() => setRecordAccountingModal(null)}
                className="text-gray-400 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleConfirmRecordAccounting} className="p-4 space-y-3.5 text-xs">
              {(() => {
                const dharmaInfo = getServiceEffectiveDharmaInfo(recordAccountingModal.service, pastRecords, households);
                return (
                  <div className="p-3 bg-[#FAF7F0] border border-[#D1CEC7] space-y-1">
                    <div className="text-gray-600">施主（世帯主）: <strong className="text-black font-bold">{recordAccountingModal.service.chiefMourner} 様</strong></div>
                    <div className="text-gray-600">法要種別: <span className="font-bold text-[#8C2D19]">{recordAccountingModal.service.memorialType}</span></div>
                    {dharmaInfo && (
                      <div className="text-gray-600 flex items-center gap-1.5 flex-wrap">
                        <span>戒名:</span>
                        <span className="font-bold text-black">{dharmaInfo.dharmaName}</span>
                        {dharmaInfo.secularName && <span>({dharmaInfo.secularName})</span>}
                        {dharmaInfo.isLatestFallback && (
                          <span
                            className="text-[10px] bg-amber-100 text-amber-800 border border-amber-300 px-1 py-0.2 rounded-xs"
                            title="法要予定に直接の戒名指定がないため、過去帳からこの世帯の最新の戒名を表示しています"
                          >
                            最新戒名
                          </span>
                        )}
                      </div>
                    )}
                    <div className="text-gray-600">予定日: <span>{recordAccountingModal.service.scheduledDate}</span></div>
                  </div>
                );
              })()}

              <div>
                <label className="block font-bold text-[#333333] mb-1">
                  勘定科目（収入） <span className="text-red-600">*</span>
                </label>
                <select
                  value={recordAccountingModal.category}
                  onChange={(e) => setRecordAccountingModal({ ...recordAccountingModal, category: e.target.value })}
                  required
                  className="w-full p-2 border border-[#D1CEC7] bg-white font-bold text-sm"
                >
                  {availableIncomeCategories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                  {!availableIncomeCategories.includes(recordAccountingModal.category) && (
                    <option value={recordAccountingModal.category}>{recordAccountingModal.category}</option>
                  )}
                </select>
              </div>

              <div>
                <label className="block font-bold text-[#333333] mb-1">
                  受領金額 (円) <span className="text-red-600">*</span>
                </label>
                <input
                  type="number"
                  min="1"
                  step="1000"
                  value={recordAccountingModal.amount || ''}
                  onChange={(e) => setRecordAccountingModal({ ...recordAccountingModal, amount: Number(e.target.value) })}
                  required
                  className="w-full p-2 border-2 border-[#D4AF37] bg-white font-black text-base text-[#1A1A1A]"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-[#333333] mb-1">受取方法</label>
                  <select
                    value={recordAccountingModal.paymentMethod}
                    onChange={(e) => setRecordAccountingModal({ ...recordAccountingModal, paymentMethod: e.target.value })}
                    className="w-full p-1.5 border border-[#D1CEC7] bg-white"
                  >
                    <option value="現金受付">現金受付</option>
                    <option value="銀行振込">銀行振込</option>
                    <option value="郵便振替">郵便振替</option>
                    <option value="その他">その他</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-[#333333] mb-1">備考</label>
                  <input
                    type="text"
                    value={recordAccountingModal.notes}
                    onChange={(e) => setRecordAccountingModal({ ...recordAccountingModal, notes: e.target.value })}
                    className="w-full p-1.5 border border-[#D1CEC7] bg-white"
                  />
                </div>
              </div>

              <div className="pt-2 text-[11px] text-gray-500">
                ※「記載する」をクリックすると、会計管理（出納帳）に自動で入金が記録され、本法要は「記載済」となります。
              </div>

              <div className="pt-3 border-t border-[#E5E0D8] flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setRecordAccountingModal(null)}
                  className="px-3 py-1.5 border border-[#D1CEC7] text-gray-600 hover:bg-gray-100 font-bold cursor-pointer"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#D4AF37] text-[#1A1A1A] font-black hover:bg-[#C59B27] transition-colors cursor-pointer shadow-sm text-sm"
                >
                  出納帳に記載する
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Multi-Category Accounting Modal (塔婆・布施・法事の科目別入力＆出納帳連動) */}
      {accountingModalService && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 font-sans no-print">
          <div className="bg-white border-2 border-[#1A1A1A] w-full max-w-xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
            <div className="bg-[#1A1A1A] text-[#D4AF37] p-4 flex items-center justify-between">
              <h3 className="font-bold text-sm tracking-wider flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-[#D4AF37]" />
                <span>法要会計入力（塔婆・布施・法事 科目別出納帳連動）</span>
              </h3>
              <button
                type="button"
                onClick={() => setAccountingModalService(null)}
                className="text-gray-400 hover:text-white cursor-pointer font-bold text-base"
              >
                ✕
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 text-xs">
              {/* Target Service Info */}
              {(() => {
                const dharmaInfo = getServiceEffectiveDharmaInfo(accountingModalService, pastRecords, households);
                return (
                  <div className="p-3 bg-[#FAF7F0] border border-[#D4AF37]/40 rounded-xs space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        施主: <strong className="text-black font-bold text-sm">{accountingModalService.chiefMourner} 様</strong>
                      </div>
                      <div className="text-[#8C2D19] font-bold">
                        {accountingModalService.memorialType}（{accountingModalService.scheduledDate} {accountingModalService.scheduledTime}）
                      </div>
                    </div>
                    {dharmaInfo && (
                      <div className="text-gray-700 flex flex-wrap items-center gap-1.5">
                        <span>戒名・故人:</span>
                        <strong className="text-black">{dharmaInfo.dharmaName}</strong>
                        {dharmaInfo.secularName ? (
                          <span className="text-gray-600">({dharmaInfo.secularName})</span>
                        ) : null}
                        {dharmaInfo.isLatestFallback && (
                          <span
                            className="inline-flex items-center px-1.5 py-0.5 rounded-xs text-[10px] bg-amber-100 text-amber-900 border border-amber-300 font-sans"
                            title="法要予定に直接の戒名指定がないため、過去帳からこの世帯の最新の戒名を表示しています"
                          >
                            最新の戒名
                          </span>
                        )}
                      </div>
                    )}
                    {accountingModalService.tobaCount && accountingModalService.tobaCount > 0 ? (
                      <div className="text-[#8C2D19] font-bold text-[11px]">
                        🎋 塔婆予約: {accountingModalService.tobaCount}本
                        {accountingModalService.tobaSponsors && accountingModalService.tobaSponsors.length > 0 ? ` (志主: ${accountingModalService.tobaSponsors.filter(Boolean).join('、')})` : ''}
                      </div>
                    ) : null}
                    {accountingModalService.notes && accountingModalService.notes.trim() !== '' && (
                      <div className="pt-1 border-t border-[#D4AF37]/20 flex items-center justify-between gap-2 bg-amber-50/70 p-1.5 rounded-xs text-[11px]">
                        <div className="text-[#78350F] flex items-center gap-1 truncate">
                          <span className="font-bold shrink-0">📝 予約時の備考:</span>
                          <span className="truncate">{accountingModalService.notes}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            if (accountingItemRows.length > 0) {
                              handleUpdateAccountingRow(accountingItemRows[0].id, 'notes', accountingModalService.notes);
                            }
                          }}
                          className="shrink-0 px-2 py-0.5 bg-amber-200 hover:bg-amber-300 text-amber-950 font-bold rounded-xs cursor-pointer text-[10px]"
                          title="この備考を1行目の明細摘要にコピーします"
                        >
                          明細1行目に反映
                        </button>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Already Registered Transactions */}
              {(() => {
                const s = accountingModalService;
                const existing = transactions.filter(
                  (t) => t.relatedServiceId === s.id || (s.transactionId && t.id === s.transactionId)
                );
                if (existing.length === 0) return null;

                const currentTotal = existing.reduce((sum, t) => sum + (t.amount || 0), 0);

                return (
                  <div className="p-3 bg-[#F0FDF4] border border-emerald-300 rounded-xs space-y-2">
                    <div className="flex items-center justify-between font-bold text-emerald-900 border-b border-emerald-200 pb-1.5">
                      <span className="flex items-center gap-1">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        出納帳に記帳済みの明細 (合計: {formatCurrency(currentTotal)})
                      </span>
                      <span className="px-2 py-0.5 bg-emerald-200 text-emerald-900 rounded-xs text-[10px]">
                        記載済
                      </span>
                    </div>
                    <div className="space-y-1.5">
                      {existing.map((tx) => (
                        <div
                          key={tx.id}
                          className="flex items-center justify-between bg-white p-2 border border-emerald-200 text-[11px]"
                        >
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                              <span className="font-black text-[#1A1A1A]">{formatCurrency(tx.amount)}</span>
                              <span className="px-1.5 py-0.2 bg-[#EFECE6] text-[#555555] font-bold rounded-xs">
                                {tx.category}
                              </span>
                              <span className="text-gray-500">{tx.paymentMethod}</span>
                            </div>
                            <div className="text-gray-500 text-[10px]">
                              日付: {tx.date} / {tx.description} {tx.notes ? `(${tx.notes})` : ''}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              onDeleteTransaction(tx.id);
                              if (existing.length <= 1) {
                                onUpdateService({
                                  ...s,
                                  accountingRecorded: false,
                                  status: '未入金',
                                  transactionId: undefined,
                                });
                              }
                            }}
                            className="px-2 py-1 text-red-600 hover:bg-red-50 border border-red-200 rounded-xs font-bold text-[10px] cursor-pointer flex items-center gap-0.5"
                            title="この明細を出納帳から削除"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>削除</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* Multi-Item Dynamic Accounting Entry Form */}
              <form onSubmit={handleSaveMultiAccounting} className="space-y-3.5 border-t border-[#E5E0D8] pt-3">
                <div className="flex items-center justify-between">
                  <div className="font-bold text-[#1A1A1A] text-xs">
                    出納帳へ記帳する明細一覧（登録科目から選択・追加削除自由）:
                  </div>
                  <button
                    type="button"
                    onClick={handleAddAccountingRow}
                    className="px-2.5 py-1 bg-[#1A1A1A] text-[#D4AF37] hover:bg-[#333333] font-bold text-xs flex items-center gap-1 cursor-pointer transition-colors shadow-xs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ 明細行を追加</span>
                  </button>
                </div>

                {/* Historical auto-suggestion notification */}
                {accountingHistoricalSourceInfo && (
                  <div className="p-2 bg-blue-50 border border-blue-200 rounded-xs text-[11px] text-blue-900 flex items-center gap-1.5 font-bold">
                    <Sparkles className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                    <span>{accountingHistoricalSourceInfo}</span>
                  </div>
                )}

                {/* Dynamic Item Rows */}
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {accountingItemRows.map((row, idx) => (
                    <div
                      key={row.id}
                      className="p-2.5 bg-[#FAFAF8] border border-[#D1CEC7] rounded-xs space-y-1.5 transition-all hover:border-[#B0AAA0]"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 flex-1">
                          <span className="w-5 h-5 bg-[#8C2D19] text-white rounded-full flex items-center justify-center font-bold text-[10px] shrink-0">
                            {idx + 1}
                          </span>
                          <div className="flex-1">
                            <select
                              value={row.category}
                              onChange={(e) => handleUpdateAccountingRow(row.id, 'category', e.target.value)}
                              className="w-full p-1.5 border border-[#D1CEC7] bg-white text-xs font-bold focus:border-[#8C2D19]"
                            >
                              {availableIncomeCategories.map((cat) => (
                                <option key={cat} value={cat}>
                                  {cat}
                                </option>
                              ))}
                              {!availableIncomeCategories.includes(row.category) && (
                                <option value={row.category}>{row.category}</option>
                              )}
                            </select>
                          </div>
                        </div>

                        {/* Remove Row Button */}
                        <button
                          type="button"
                          onClick={() => handleRemoveAccountingRow(row.id)}
                          disabled={accountingItemRows.length <= 1}
                          className="p-1.5 text-gray-400 hover:text-red-600 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer shrink-0"
                          title="この明細行を削除"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div className="relative">
                          <input
                            type="number"
                            min="0"
                            step="1000"
                            placeholder="金額"
                            value={row.amount === 0 ? '' : row.amount}
                            onChange={(e) => handleUpdateAccountingRow(row.id, 'amount', Number(e.target.value) || 0)}
                            className="w-full p-1.5 border border-[#D1CEC7] bg-white font-black text-right pr-7 text-xs focus:border-[#8C2D19]"
                          />
                          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 font-bold text-xs">円</span>
                        </div>
                        <input
                          type="text"
                          placeholder="摘要・備考（出納帳にそのまま登録されます）"
                          value={row.notes}
                          onChange={(e) => handleUpdateAccountingRow(row.id, 'notes', e.target.value)}
                          className="w-full p-1.5 border border-[#D1CEC7] bg-white text-xs focus:border-[#8C2D19]"
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Common Settings: Date & Payment Method */}
                <div className="space-y-2 bg-[#F9F7F2] p-2.5 border border-[#E5E0D8]">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-[#333333] mb-1 text-[11px]">受取・記帳日</label>
                      <input
                        type="text"
                        value={accountingReceivedDate}
                        onChange={(e) => setAccountingReceivedDate(e.target.value)}
                        className="w-full p-1.5 border border-[#D1CEC7] bg-white font-bold text-xs"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-[#333333] mb-1 text-[11px]">受取方法</label>
                      <select
                        value={accountingPaymentMethod}
                        onChange={(e) => setAccountingPaymentMethod(e.target.value as any)}
                        className="w-full p-1.5 border border-[#D1CEC7] bg-white font-bold text-xs"
                      >
                        <option value="現金受付">現金受付</option>
                        <option value="QR受付時">QR受付時</option>
                        <option value="銀行振込">銀行振込</option>
                        <option value="郵便振替">郵便振替</option>
                        <option value="その他">その他</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block font-bold text-[#333333] mb-1 text-[11px]">全体備考・追記事項 (任意)</label>
                    <input
                      type="text"
                      placeholder="例: 施主様ご持参、領収証発行済 など"
                      value={accountingCustomNote}
                      onChange={(e) => setAccountingCustomNote(e.target.value)}
                      className="w-full p-1.5 border border-[#D1CEC7] bg-white text-xs"
                    />
                  </div>
                </div>

                <div className="pt-3 border-t border-[#E5E0D8] flex items-center justify-between">
                  <div className="text-xs">
                    今回の記帳合計 ({accountingItemRows.filter(r => Number(r.amount) > 0).length}件): <strong className="text-base text-[#8C2D19] font-black">
                      {formatCurrency(accountingItemRows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0))}
                    </strong>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={() => setAccountingModalService(null)}
                      className="px-3 py-1.5 border border-[#D1CEC7] text-gray-600 hover:bg-gray-100 font-bold cursor-pointer"
                    >
                      閉じる
                    </button>
                    <button
                      type="submit"
                      disabled={accountingItemRows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0) <= 0}
                      className="px-5 py-2 bg-[#D4AF37] text-[#1A1A1A] font-black hover:bg-[#C59B27] disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed transition-colors cursor-pointer shadow-sm text-sm"
                    >
                      出納帳に記帳する
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}


      {/* 本堂掲示用 お盆棚経巡回予定表 印刷モーダル */}
      <TanagyoNoticeBoardPrintModal
        isOpen={isTanagyoNoticeModalOpen}
        onClose={() => setIsTanagyoNoticeModalOpen(false)}
        households={households}
        priests={priests}
        templeName={templeInfo?.name || '寺院'}
        templeInfo={templeInfo}
        temples={temples}
      />

      {/* お盆棚経・訪問マップ巡回計画モーダル（国土地理院地図連携） */}
      <TanagyoPatronMapModal
        isOpen={isTanagyoMapModalOpen}
        onClose={() => setIsTanagyoMapModalOpen(false)}
        households={households}
        priests={priests}
        templeInfo={templeInfo}
        temples={temples}
        pastRecords={pastRecords}
        onBatchUpdateHouseholds={(updated, desc) => {
          if (onBatchUpdateHouseholds) {
            onBatchUpdateHouseholds(updated, desc);
          }
        }}
        candidateDates={tanagyoDateCandidates.filter((d) => Boolean(d && d.trim()))}
        onAddCandidateDate={handleAddCandidateDate}
      />

      {/* お盆棚経 会計一括入力モーダル（出納帳一括計上） */}
      <TanagyoBatchAccountingModal
        isOpen={isTanagyoAccountingModalOpen}
        onClose={() => setIsTanagyoAccountingModalOpen(false)}
        households={households}
        temples={temples}
        templeInfo={templeInfo}
        priests={priests}
        transactions={transactions}
        activeTempleId={activeTempleId}
        masterOptions={masterOptions}
        templeMasterOptionsMap={templeMasterOptionsMap}
        onAddBatchTransactions={(newTxs) => {
          if (onAddBatchTransactions) {
            onAddBatchTransactions(newTxs);
          } else {
            // フォールバック: 個別に追加
            newTxs.forEach((t) => onAddTransaction(t));
          }
        }}
      />

      {/* 全割当リセットの確認モーダル（地図モーダルと同一の安心確認UI・iframe内でも100%確実に動作） */}
      {showTanagyoResetConfirmModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xs shadow-2xl border-2 border-red-500 max-w-md w-full p-5 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3 text-red-600 mb-3">
              <div className="p-2 bg-red-100 rounded-full">
                <RotateCcw className="w-6 h-6 stroke-[2.5]" />
              </div>
              <h4 className="font-bold text-base text-gray-900">全割当を未割当にリセット</h4>
            </div>
            <p className="text-xs text-gray-600 leading-relaxed mb-4">
              {tanagyoTempleFilter !== 'ALL'
                ? `【${temples?.find((t) => t.id === tanagyoTempleFilter)?.name || '選択中の寺院'}】`
                : '【すべての寺院】'}
              の棚経割当情報（訪問日程・時間帯・担当僧侶・巡回順序）を解除し、未割当リストに戻します。
              <br />
              <span className="text-gray-500 mt-1 block">
                ※檀家名簿自体の棚経対象設定は解除されません。
                <br />
                ※解除した割当は元に戻せません。
              </span>
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowTanagyoResetConfirmModal(false)}
                className="px-3.5 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-100 border border-gray-300 rounded-xs cursor-pointer"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={handleExecuteResetAllTanagyo}
                className="px-4 py-1.5 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-xs shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>未割当にリセットする</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* リセット完了トースト通知 */}
      {tanagyoResetSuccessMessage && (
        <div className="fixed bottom-6 right-6 z-60 bg-gray-900 text-white px-4 py-3 rounded-xs shadow-xl border border-gray-700 flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="text-xs font-bold">{tanagyoResetSuccessMessage}</span>
        </div>
      )}

      {/* 予定・法要 削除確認ダイアログ */}
      {deleteConfirmService && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-[#FAF7F0] border-2 border-red-700 rounded-xs shadow-2xl max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-150">
            <div className="bg-red-700 text-white px-4 py-3 flex items-center justify-between shadow-xs">
              <div className="flex items-center space-x-2">
                <AlertCircle className="w-5 h-5 text-amber-300 stroke-[2.5]" />
                <h3 className="font-serif font-black text-base tracking-wide">予定・法要の削除確認</h3>
              </div>
              <button
                type="button"
                onClick={() => setDeleteConfirmService(null)}
                className="text-white/80 hover:text-white p-1 cursor-pointer"
                title="閉じる"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <p className="text-sm font-bold text-gray-800">
                以下の予定・法要データを削除します。よろしいですか？
              </p>

              <div className="bg-white border border-[#D1CEC7] p-3.5 rounded-xs space-y-2 text-xs">
                <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                  <span className="text-gray-500 font-bold">日時:</span>
                  <span className="font-black text-gray-800">
                    {deleteConfirmService.scheduledDate} {deleteConfirmService.scheduledTime || ''}
                  </span>
                </div>
                {deleteConfirmService.chiefMourner && (
                  <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                    <span className="text-gray-500 font-bold">施主・家名:</span>
                    <span className="font-bold text-gray-800">{deleteConfirmService.chiefMourner} 様</span>
                  </div>
                )}
                {(deleteConfirmService.dharmaName || deleteConfirmService.deceasedName) && (
                  <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                    <span className="text-gray-500 font-bold">故人・法名:</span>
                    <span className="font-bold text-gray-800">
                      {deleteConfirmService.dharmaName || deleteConfirmService.deceasedName}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-gray-500 font-bold">法要・予定種別:</span>
                  <span className="font-bold text-[#8C2D19] bg-amber-50 px-2 py-0.5 rounded-xs border border-amber-200">
                    {deleteConfirmService.memorialType || deleteConfirmService.notes || '法要'}
                  </span>
                </div>
              </div>

              <div className="p-2.5 bg-amber-50 border border-amber-300 rounded-xs text-[11px] text-amber-900 leading-relaxed">
                ※この予定を削除すると、関連する塔婆作成タスク・ToDoも連動して自動削除されます。
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-[#D1CEC7]">
                <button
                  type="button"
                  onClick={() => setDeleteConfirmService(null)}
                  className="px-4 py-2 bg-white border border-[#D1CEC7] text-gray-700 hover:bg-gray-100 font-bold text-xs rounded-xs cursor-pointer shadow-xs"
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  onClick={handleExecuteDeleteService}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-black text-xs rounded-xs cursor-pointer flex items-center gap-1.5 shadow-sm transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>削除する</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
