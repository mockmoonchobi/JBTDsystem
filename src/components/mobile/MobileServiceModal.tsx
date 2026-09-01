import React, { useState, useEffect, useMemo } from 'react';
import { MemorialService, Household, PastRecord, TempleProfile, ServiceDeceasedTarget, ServiceTobaItem, TempleTodo } from '../../types';
import {
  X,
  Save,
  Trash2,
  Calendar as CalendarIcon,
  Clock,
  MapPin,
  Building2,
  User,
  BookOpen,
  Search,
  Check,
  ChevronLeft,
  Sparkles,
  ArrowRight,
  Flame,
  FileText,
  Layers,
  HelpCircle,
  RotateCcw,
  Plus,
  Minus
} from 'lucide-react';
import { DateInputWithEra, TimeSelectorInput } from '../DateTimeInputs';
import { getTodayDateString, calculateEndTime } from '../../utils/calendarUtils';
import { 
  calculateUpcomingMilestonesRange, 
  UpcomingMemorialCandidate, 
  getSpiritMemorialForDate,
  sortHouseholdsByGojuon,
  getKanaRow,
  getKanaColumn,
  getHouseholdSponsorName,
  getHouseholdSponsorInfo,
  resolveSpiritMemorialType,
  normalizeMemorialType
} from '../../utils/memorialCalculator';
import { KanaIndexFilter } from '../common/KanaIndexFilter';

interface MobileServiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  service: MemorialService | null;
  households: Household[];
  pastRecords: PastRecord[];
  temples?: TempleProfile[];
  activeTempleId?: string;
  onSave: (service: MemorialService) => void;
  onSaveTodo?: (todo: TempleTodo) => void;
  onDelete?: (id: string) => void;
  initialDate?: string;
  initialHouseholdId?: string;
  initialPastRecordId?: string;
  initialMilestoneType?: string;
}

// Wizard steps for mobile service creation
type WizardStep = 'step_temple' | 'step_category' | 'step_select_mode' | 'step_household_search' | 'step_spirit_candidates' | 'step_details';

export const MEMORIAL_TYPE_OPTIONS = [
  '四十九日',
  '百ヶ日',
  '一周忌',
  '三回忌',
  '七回忌',
  '十三回忌',
  '十七回忌',
  '二十三回忌',
  '二十七回忌',
  '三十三回忌',
  '五十回忌',
  '百回忌',
  '初七日',
  '年忌法要',
  '納骨法要',
  '新盆・初盆',
  '施餓鬼法要',
  '塔婆供養',
  'その他',
];

export const MobileServiceModal: React.FC<MobileServiceModalProps> = ({
  isOpen,
  onClose,
  service,
  households = [],
  pastRecords = [],
  temples = [],
  activeTempleId = 'temple-main',
  onSave,
  onSaveTodo,
  onDelete,
  initialDate,
  initialHouseholdId,
  initialPastRecordId,
  initialMilestoneType,
}) => {
  const isEditing = !!service;
  const todayStr = getTodayDateString();

  // Wizard current step
  const [currentStep, setCurrentStep] = useState<WizardStep>('step_temple');

  // Major category selection ('通夜・葬儀' | '法事' | '塔婆' | 'その他')
  const [majorCategory, setMajorCategory] = useState<'通夜・葬儀' | '法事' | '塔婆' | 'その他'>('法事');

  // Form data state
  const [formData, setFormData] = useState<Partial<MemorialService>>({
    scheduledDate: initialDate || todayStr,
    scheduledTime: '11:00',
    endTime: '12:00',
    memorialType: (initialMilestoneType as any) || '年忌法要',
    chiefMourner: '',
    householdId: initialHouseholdId || '',
    deceasedId: initialPastRecordId || '',
    dharmaName: '',
    deceasedName: '',
    venue: '寺院',
    address: '',
    attendeeCount: 10,
    tobaCount: 0,
    tobaType: '大塔婆',
    notes: '',
    templeId: activeTempleId !== 'ALL' ? activeTempleId : (temples.find(t => t.isMain)?.id || 'temple-main'),
    additionalDeceased: [],
    tobaItems: [],
    tobaSponsors: [],
  });

  // Search queries
  const [householdSearchQuery, setHouseholdSearchQuery] = useState('');
  const [householdDistrictFilter, setHouseholdDistrictFilter] = useState('ALL');
  const [householdKanaFilter, setHouseholdKanaFilter] = useState('ALL');
  const [householdKanaColFilter, setHouseholdKanaColFilter] = useState('ALL');

  // Initialize or reset form when modal opens or props change
  useEffect(() => {
    if (!isOpen) return;

    if (service) {
      // Editing existing service -> Go directly to details
      setFormData({
        ...service,
        additionalDeceased: service.additionalDeceased || [],
        tobaItems: service.tobaItems || [],
        tobaSponsors: service.tobaSponsors || [],
      });
      if (service.memorialType?.includes('塔婆')) {
        setMajorCategory('塔婆');
      } else if (['葬儀・枕経', '通夜', '葬儀', '枕経', '通夜・葬儀'].includes(service.memorialType)) {
        setMajorCategory('通夜・葬儀');
      } else if (['その他', '寺院行事', '会合', '来客', '法務その他'].includes(service.memorialType)) {
        setMajorCategory('その他');
      } else {
        setMajorCategory('法事');
      }
      setCurrentStep('step_details');
    } else {
      // New service creation
      let defChief = '';
      let defAddr = '';
      let defDharma = '';
      let defSecular = '';
      let defTempleId = activeTempleId !== 'ALL' ? activeTempleId : (temples.find(t => t.isMain)?.id || 'temple-main');

      const targetTemple = temples.find(t => t.id === defTempleId) || temples.find(t => t.isMain) || temples[0];
      const defaultTempleName = targetTemple?.name || '寺院';
      const defaultTempleAddr = targetTemple?.address || '';

      if (initialHouseholdId) {
        const hh = households.find((h) => h.id === initialHouseholdId);
        if (hh) {
          defChief = getHouseholdSponsorName(hh) || hh.familyHead || '';
          defAddr = hh.tanagyoAddress || hh.address || '';
          if (hh.templeId) defTempleId = hh.templeId;
        }
      }

      if (initialPastRecordId) {
        const pr = pastRecords.find((p) => p.id === initialPastRecordId);
        if (pr) {
          defDharma = pr.dharmaName;
          defSecular = pr.secularName;
          if (pr.householdHeadName && !defChief) defChief = pr.householdHeadName;
          if (pr.templeId) defTempleId = pr.templeId;
        }
      }

      setHouseholdSearchQuery('');
      setHouseholdDistrictFilter('ALL');
      setHouseholdKanaFilter('ALL');

      setFormData({
        scheduledDate: initialDate || todayStr,
        scheduledTime: '11:00',
        endTime: '12:00',
        memorialType: (initialMilestoneType as any) || '年忌法要',
        chiefMourner: defChief,
        householdId: initialHouseholdId || '',
        deceasedId: initialPastRecordId || '',
        dharmaName: defDharma,
        deceasedName: defSecular,
        venue: defaultTempleName,
        address: defAddr || defaultTempleAddr,
        attendeeCount: 10,
        tobaCount: (initialMilestoneType as any)?.includes('塔婆') ? 1 : 0,
        tobaType: '大塔婆',
        notes: '',
        templeId: defTempleId,
        additionalDeceased: [],
        tobaItems: [],
        tobaSponsors: [],
      });

      // If initial household or past record was provided, go to details directly
      if (initialHouseholdId || initialPastRecordId) {
        setCurrentStep('step_details');
      } else if (temples.length <= 1) {
        // If only 1 temple exists, skip temple step and start with category selection
        setCurrentStep('step_category');
      } else {
        // Multiple temples exist: start at step 1 (choose temple)
        setCurrentStep('step_temple');
      }
    }
  }, [isOpen, service, initialDate, initialHouseholdId, initialPastRecordId, initialMilestoneType, activeTempleId, temples]);

  // Selected temple profile
  const selectedTemple = useMemo(() => {
    const tId = formData.templeId || 'temple-main';
    return temples.find((t) => t.id === tId) || temples.find((t) => t.isMain) || temples[0];
  }, [temples, formData.templeId]);

  // STRICT Temple filtering: Only households belonging to the selected temple! (Sorted in 五十音順)
  const templeHouseholds = useMemo(() => {
    const tId = formData.templeId || 'temple-main';
    const list = households.filter((h) => {
      const hTempleId = h.templeId || 'temple-main';
      return hTempleId === tId;
    });
    return sortHouseholdsByGojuon(list);
  }, [households, formData.templeId]);

  // STRICT Temple filtering: Only past records belonging to the selected temple!
  const templePastRecords = useMemo(() => {
    const tId = formData.templeId || 'temple-main';
    return pastRecords.filter((p) => {
      const pTempleId = p.templeId || (p.householdId ? households.find(h => h.id === p.householdId)?.templeId : undefined) || 'temple-main';
      return pTempleId === tId;
    });
  }, [pastRecords, households, formData.templeId]);

  // Available districts for the selected temple's households
  const availableDistricts = useMemo(() => {
    const set = new Set<string>();
    templeHouseholds.forEach((h) => {
      if (h.district && h.district.trim()) set.add(h.district.trim());
    });
    return Array.from(set).sort();
  }, [templeHouseholds]);

  // Filtered households by search query within the selected temple (Preserves 五十音順)
  const searchedHouseholds = useMemo(() => {
    const q = householdSearchQuery.trim().toLowerCase();
    const cleanQ = q.replace(/[\-\s]/g, '');

    return templeHouseholds.filter((h) => {
      if (householdDistrictFilter !== 'ALL' && h.district !== householdDistrictFilter) {
        return false;
      }
      const sponsorInfo = getHouseholdSponsorInfo(h);
      if (householdKanaFilter !== 'ALL') {
        const kanaText = sponsorInfo.furigana || (h as any).furigana || (h as any).kana || sponsorInfo.sponsorName || h.familyHead || '';
        const row = getKanaRow(kanaText);
        if (row !== householdKanaFilter) {
          return false;
        }
        if (householdKanaColFilter !== 'ALL') {
          const col = getKanaColumn(kanaText);
          if (col !== householdKanaColFilter) {
            return false;
          }
        }
      }
      if (!q) return true;

      const sponsor = (sponsorInfo.sponsorName || '').toLowerCase();
      const head = (h.familyHead || '').toLowerCase();
      const kana = (sponsorInfo.furigana || (h as any).furigana || (h as any).kana || '').toLowerCase();
      const id = (h.id || '').toLowerCase();
      const district = (h.district || '').toLowerCase();
      const addr = (h.address || '').toLowerCase();
      const phone = (h.phone || '').replace(/[\-\s]/g, '');
      const mobile = (h.mobile || '').replace(/[\-\s]/g, '');

      if (
        sponsor.includes(q) ||
        head.includes(q) ||
        kana.includes(q) ||
        id.includes(q) ||
        district.includes(q) ||
        addr.includes(q) ||
        (cleanQ && (phone.includes(cleanQ) || mobile.includes(cleanQ)))
      ) {
        return true;
      }

      // Match family members
      const fam = h.familyMembers || (h as any).members || [];
      const matchFam = fam.some((m: any) =>
        (m.name && m.name.toLowerCase().includes(q)) ||
        (m.furigana && m.furigana.toLowerCase().includes(q))
      );
      if (matchFam) return true;

      // Match past records
      const matchPast = templePastRecords.some(
        (p) => p.householdId === h.id && (
          (p.dharmaName && p.dharmaName.toLowerCase().includes(q)) ||
          (p.secularName && p.secularName.toLowerCase().includes(q))
        )
      );
      if (matchPast) return true;

      return false;
    });
  }, [templeHouseholds, householdSearchQuery, householdDistrictFilter, householdKanaFilter, householdKanaColFilter, templePastRecords]);

  // Upcoming 2 months (approx 65 days) memorial candidates for the selected temple
  const upcomingSpiritCandidates = useMemo(() => {
    const baseDate = formData.scheduledDate || todayStr;
    return calculateUpcomingMilestonesRange(templePastRecords, templeHouseholds, baseDate, 65);
  }, [templePastRecords, templeHouseholds, formData.scheduledDate, todayStr]);

  // Selected household object
  const selectedHousehold = useMemo(() => {
    return templeHouseholds.find((h) => h.id === formData.householdId) || households.find((h) => h.id === formData.householdId) || null;
  }, [templeHouseholds, households, formData.householdId]);

  // Selected household's spirits (逆修・命日なしの精霊は法要予約対象から除外)
  const selectedHouseholdSpirits = useMemo(() => {
    if (!formData.householdId) return [];
    return templePastRecords.filter((p) => p.householdId === formData.householdId && !!p.deathDate && p.deathDate.trim() !== '');
  }, [templePastRecords, formData.householdId]);

  if (!isOpen) return null;

  // Step 1: Select Temple
  const handleSelectTemple = (templeId: string) => {
    setFormData((prev) => ({
      ...prev,
      templeId,
      householdId: '',
      deceasedId: '',
      dharmaName: '',
      deceasedName: '',
      chiefMourner: '',
    }));
    setCurrentStep('step_category');
  };

  // Step 2: Select Major Category
  const handleSelectCategory = (cat: '通夜・葬儀' | '法事' | '塔婆' | 'その他') => {
    setMajorCategory(cat);
    const targetTempleId = formData.templeId || activeTempleId;
    const targetTemple = temples.find((t) => t.id === targetTempleId) || temples.find((t) => t.isMain) || temples[0];
    const templeName = targetTemple?.name || '寺院';
    const templeAddr = targetTemple?.address || '';

    if (cat === '通夜・葬儀') {
      setFormData((prev) => ({
        ...prev,
        memorialType: '通夜',
        venue: prev.venue || templeName,
        address: prev.address || templeAddr,
        deceasedId: '',
        dharmaName: '',
        deceasedName: '',
        additionalDeceased: [],
        tobaCount: 0,
        tobaItems: [],
      }));
      setCurrentStep('step_household_search');
    } else if (cat === 'その他') {
      setFormData((prev) => ({
        ...prev,
        memorialType: 'その他',
        chiefMourner: prev.chiefMourner || '',
        venue: prev.venue || templeName,
        address: prev.address || templeAddr,
        deceasedId: '',
        dharmaName: '',
        deceasedName: '',
        additionalDeceased: [],
        tobaCount: 0,
        tobaItems: [],
      }));
      setCurrentStep('step_details');
    } else if (cat === '塔婆') {
      setFormData((prev) => ({
        ...prev,
        memorialType: '塔婆供養',
        venue: '',
        address: '',
        attendeeCount: 0,
        tobaCount: prev.tobaCount && prev.tobaCount > 0 ? prev.tobaCount : 1,
        tobaType: prev.tobaType || '大塔婆',
      }));
      setCurrentStep('step_select_mode');
    } else {
      setFormData((prev) => ({
        ...prev,
        memorialType: prev.memorialType && prev.memorialType !== 'その他' && prev.memorialType !== '通夜' && prev.memorialType !== '塔婆供養'
          ? normalizeMemorialType(prev.memorialType)
          : '年忌法要',
        venue: prev.venue || templeName,
        address: prev.address || templeAddr,
      }));
      setCurrentStep('step_select_mode');
    }
  };

  // Step 3: Choose Selection Mode ('household' vs 'spirit')
  const handleSelectMode = (mode: 'household' | 'spirit') => {
    if (mode === 'household') {
      setCurrentStep('step_household_search');
    } else {
      setCurrentStep('step_spirit_candidates');
    }
  };

  // When a household is chosen from candidate search
  const handlePickHousehold = (h: Household) => {
    const headName = getHouseholdSponsorName(h) || h.familyHead || '';
    const targetTempleId = h.templeId || formData.templeId || activeTempleId;
    const targetTemple = temples.find((t) => t.id === targetTempleId) || temples.find((t) => t.isMain) || temples[0];
    const templeName = targetTemple?.name || '寺院';
    const templeAddr = targetTemple?.address || '';
    const homeAddr = h.tanagyoAddress || h.address || '';

    let curVenue = (formData.venue || templeName).trim();
    let autoAddress = formData.address;
    if (curVenue === templeName || curVenue === '本堂' || curVenue === '客殿' || curVenue === '寺院') {
      curVenue = templeName;
      autoAddress = templeAddr;
    } else if (curVenue === '自宅') {
      autoAddress = homeAddr;
    } else if (curVenue === 'その他' || curVenue === '斎場') {
      autoAddress = '';
    }

    setFormData((prev) => ({
      ...prev,
      householdId: h.id,
      chiefMourner: headName,
      venue: curVenue,
      address: autoAddress,
      templeId: h.templeId || prev.templeId || 'temple-main',
    }));

    // If this household has only 1 spirit, automatically pre-fill it and calculate its Kaiki for scheduled date (except for funerals and others)
    const spirits = templePastRecords.filter((p) => p.householdId === h.id && !!p.deathDate && p.deathDate.trim() !== '');
    if (spirits.length === 1 && majorCategory !== '通夜・葬儀' && majorCategory !== 'その他') {
      const s0 = spirits[0];
      const targetDate = formData.scheduledDate || todayStr;
      const kaiki = s0.deathDate ? getSpiritMemorialForDate(s0.deathDate, targetDate) : '';
      const normKaiki = kaiki && kaiki !== '当年没' ? normalizeMemorialType(kaiki) : (formData.memorialType || '年忌法要');
      setFormData((prev) => {
        const curToba = [...(prev.tobaItems || [])];
        if (curToba.length > 0 && normKaiki) {
          curToba[0] = {
            ...curToba[0],
            memorialType: normKaiki,
            dharmaName: s0.dharmaName || curToba[0].dharmaName || '',
          };
        }
        return {
          ...prev,
          deceasedId: s0.id,
          dharmaName: s0.dharmaName || '',
          deceasedName: s0.secularName || '',
          memorialType: (majorCategory === '塔婆' ? '塔婆供養' : (normKaiki || prev.memorialType)) as any,
          tobaItems: curToba,
        };
      });
    }

    setCurrentStep('step_details');
  };

  // When a spirit milestone candidate is chosen
  const handlePickSpiritCandidate = (cand: UpcomingMemorialCandidate) => {
    const p = cand.record;
    const hh = cand.household;
    const headName = hh ? (getHouseholdSponsorName(hh) || hh.familyHead || '') : (p.householdHeadName || '');
    const targetTempleId = p.templeId || hh?.templeId || formData.templeId || activeTempleId;
    const targetTemple = temples.find((t) => t.id === targetTempleId) || temples.find((t) => t.isMain) || temples[0];
    const templeAddr = targetTemple?.address || '';
    const curVenue = (formData.venue || '本堂').trim();
    const isAtTemple = curVenue === '本堂' || curVenue === '客殿' || curVenue.includes('本堂');
    const autoAddress = isAtTemple ? templeAddr : (hh?.address || '');
    const candMemType = normalizeMemorialType(cand.memorialType || formData.memorialType || '年忌法要');

    setFormData((prev) => {
      const curToba = [...(prev.tobaItems || [])];
      if (curToba.length > 0) {
        curToba[0] = {
          ...curToba[0],
          memorialType: candMemType,
          dharmaName: p.dharmaName || curToba[0].dharmaName || '',
        };
      }
      return {
        ...prev,
        scheduledDate: prev.scheduledDate || initialDate || todayStr,
        memorialType: (majorCategory === '塔婆' ? '塔婆供養' : candMemType) as any,
        householdId: p.householdId || prev.householdId || '',
        deceasedId: p.id,
        dharmaName: p.dharmaName || '',
        deceasedName: p.secularName || '',
        chiefMourner: headName || prev.chiefMourner || '施主様',
        address: autoAddress,
        templeId: p.templeId || hh?.templeId || prev.templeId || 'temple-main',
        tobaItems: curToba,
      };
    });

    setCurrentStep('step_details');
  };

  // Go back one step in wizard
  const handleGoBack = () => {
    if (currentStep === 'step_category') {
      if (temples.length > 1) {
        setCurrentStep('step_temple');
      } else {
        onClose();
      }
    } else if (currentStep === 'step_select_mode') {
      setCurrentStep('step_category');
    } else if (currentStep === 'step_household_search' || currentStep === 'step_spirit_candidates') {
      if (majorCategory === '通夜・葬儀') {
        setCurrentStep('step_category');
      } else {
        setCurrentStep('step_select_mode');
      }
    } else if (currentStep === 'step_details') {
      if (isEditing) {
        onClose();
      } else if (majorCategory === 'その他') {
        setCurrentStep('step_category');
      } else if (majorCategory === '通夜・葬儀') {
        setCurrentStep('step_household_search');
      } else {
        setCurrentStep('step_select_mode');
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.chiefMourner?.trim() && !formData.dharmaName?.trim() && !formData.notes?.trim() && !formData.memorialType) {
      alert('件名、施主名、戒名、または予定内容を入力してください。');
      return;
    }

    const targetTempleId = formData.templeId || 'temple-main';
    const targetTemple = temples.find((t) => t.id === targetTempleId) || temples.find((t) => t.isMain) || temples[0];
    const curVenue = (formData.venue || '').trim();
    const isAtTemple = Boolean(
      curVenue && (
        curVenue === targetTemple?.name ||
        curVenue === '本堂' ||
        curVenue === '客殿' ||
        curVenue === '寺院'
      )
    );
    const hh = households.find((h) => h.id === formData.householdId);
    let finalAddress = (formData.address || '').trim();
    if (isAtTemple && !finalAddress) {
      finalAddress = targetTemple?.address || '';
    }

    const finalTobaCount = Number(formData.tobaCount) || (majorCategory === '塔婆' ? 1 : 0);
    const finalTobaType = formData.tobaType || '大塔婆';
    const finalTobaItems = [...(formData.tobaItems || [])];

    // Ensure tobaItems array length matches tobaCount if tobaCount > 0
    if (finalTobaCount > 0) {
      while (finalTobaItems.length < finalTobaCount) {
        const idx = finalTobaItems.length;
        const subTarget = (formData.additionalDeceased || [])[idx - 1];
        const targetDharma = subTarget ? (subTarget.dharmaName || '') : (idx === 0 ? (formData.dharmaName || '') : '');
        const targetDeceasedId = subTarget ? subTarget.id : (idx === 0 ? formData.deceasedId : undefined);
        const defaultItemMem = resolveSpiritMemorialType(
          subTarget ? (subTarget.memorialType || formData.memorialType) : formData.memorialType,
          targetDharma,
          targetDeceasedId,
          pastRecords,
          formData.scheduledDate || todayStr
        );
        finalTobaItems.push({
          id: `TOBA-${Date.now()}-${idx}`,
          sponsorName: idx === 0 ? (formData.chiefMourner || '') : '',
          memorialType: defaultItemMem,
          dharmaName: targetDharma,
          tobaType: finalTobaType as any,
        });
      }
    }

    const isAllDaySelected = formData.scheduledTime === '終日' || formData.isAllDay;
    const finalScheduledTime = isAllDaySelected ? '終日' : (formData.scheduledTime || (majorCategory === '塔婆' ? '09:00' : '11:00'));
    const finalEndTime = isAllDaySelected ? '終日' : (formData.endTime || calculateEndTime(finalScheduledTime, 60));

    // 精霊名の要約（主精霊 + 併修精霊）
    const spiritsList: string[] = [];
    if (formData.dharmaName?.trim() || formData.deceasedName?.trim()) {
      spiritsList.push(formData.dharmaName?.trim() || formData.deceasedName?.trim() || '');
    }
    (formData.additionalDeceased || []).forEach((sub) => {
      if (sub.dharmaName?.trim() || sub.deceasedName?.trim()) {
        spiritsList.push(sub.dharmaName?.trim() || sub.deceasedName?.trim() || '');
      }
    });
    const dharmaSummary = spiritsList.filter(Boolean).join('・');

    // 志主名の要約
    const validSponsors = finalTobaItems.map((item) => item.sponsorName?.trim()).filter(Boolean);
    const sponsorsSummary = validSponsors.length > 0
      ? validSponsors.join('・')
      : (formData.chiefMourner ? `${formData.chiefMourner.replace(/(家|様)+$/g, '').trim()}様` : '施主');

    const calculatedTobaFee = Number(formData.tobaFee) || (finalTobaCount > 0 ? finalTobaCount * 3000 : 0);

    const savedService: MemorialService = {
      id: service?.id || `MS-${Date.now()}`,
      templeId: formData.templeId || 'temple-main',
      householdId: formData.householdId || '',
      deceasedId: formData.deceasedId || '',
      dharmaName: formData.dharmaName?.trim() || '',
      deceasedName: formData.deceasedName?.trim() || '',
      memorialType: majorCategory === '塔婆' ? '塔婆供養' : (formData.memorialType || (majorCategory === 'その他' ? 'その他' : '年忌法要')),
      scheduledDate: formData.scheduledDate || todayStr,
      scheduledTime: finalScheduledTime,
      endTime: finalEndTime,
      isAllDay: isAllDaySelected,
      venue: curVenue,
      address: finalAddress,
      status: ((service?.status as any) === '案内未送' ? '未入金' : service?.status) || '未入金',
      chiefMourner: formData.chiefMourner?.trim() || sponsorsSummary || (majorCategory === 'その他' ? '' : '施主様'),
      attendeeCount: Number(formData.attendeeCount) || (majorCategory === 'その他' || majorCategory === '塔婆' ? 0 : 10),
      offeringAmount: Number(formData.offeringAmount) || (majorCategory === '塔婆' ? 0 : 0),
      tobaCount: finalTobaCount,
      tobaType: finalTobaType,
      tobaFee: calculatedTobaFee,
      tobaSponsors: finalTobaItems.map((i) => i.sponsorName),
      tobaItems: finalTobaItems,
      additionalDeceased: formData.additionalDeceased || [],
      notes: formData.notes?.trim() || '',
      receptionCheckedIn: service?.receptionCheckedIn || false,
    };

    onSave(savedService);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-0 sm:p-4 overflow-hidden">
      <div className="bg-[#FAF8F5] flex-1 flex flex-col max-w-xl w-full mx-auto shadow-2xl h-full sm:h-[90vh] sm:max-h-[850px] sm:rounded-sm sm:border-2 sm:border-[#1A1A1A] overflow-hidden">
        {/* Header with high-contrast text and comfortable touch target */}
        <div className="bg-[#1A1A1A] text-white px-4 py-3.5 flex items-center justify-between border-b border-[#D4AF37]/50 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            {currentStep !== 'step_temple' && !isEditing && (
              <button
                type="button"
                onClick={handleGoBack}
                className="p-1 -ml-1 text-[#D4AF37] hover:text-white rounded active:bg-white/10 cursor-pointer"
                title="前の画面に戻る"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
            )}
            <CalendarIcon className="w-5 h-5 text-[#D4AF37] shrink-0" />
            <div className="min-w-0">
              <h2 className="text-base font-bold font-serif text-[#D4AF37] truncate">
                {isEditing ? '予定・法事の編集' : '新しい予定の登録'}
              </h2>
              <div className="text-xs text-gray-300 truncate">
                {selectedTemple.name} {selectedTemple.isAffiliated || (!selectedTemple.isMain && selectedTemple.id !== 'temple-main') ? '【兼務寺】' : '【本寺】'}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-gray-300 hover:text-white rounded active:bg-white/10 cursor-pointer shrink-0"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* STEP 1: どの寺の案件か？ (寺院選択) */}
        {currentStep === 'step_temple' && (
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div className="text-center py-2">
              <div className="w-12 h-12 rounded-full bg-[#8C2D19]/10 text-[#8C2D19] flex items-center justify-center mx-auto mb-2">
                <Building2 className="w-7 h-7" />
              </div>
              <h3 className="text-lg font-bold font-serif text-[#1A1A1A]">
                ① どの寺院の案件ですか？
              </h3>
              <p className="text-xs text-gray-600 mt-1">
                案件を登録する対象の寺院を選択してください
              </p>
            </div>

            <div className="space-y-3 pt-1">
              {temples.map((t) => {
                const isAff = t.isAffiliated || (!t.isMain && t.id !== 'temple-main');
                const isSelected = formData.templeId === t.id;
                const hhCount = households.filter((h) => (h.templeId || 'temple-main') === t.id).length;

                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => handleSelectTemple(t.id || 'temple-main')}
                    className={`w-full p-4 rounded-xs border-2 text-left transition-all active:scale-[0.99] flex items-center justify-between gap-3 shadow-xs cursor-pointer ${
                      isSelected
                        ? 'bg-amber-50/80 border-[#8C2D19] ring-2 ring-[#8C2D19]/20'
                        : 'bg-white border-[#D1CEC7] hover:border-[#8C2D19]'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 text-xs font-bold rounded-2xs ${
                          isAff ? 'bg-purple-900 text-purple-100' : 'bg-amber-900 text-amber-100'
                        }`}>
                          {isAff ? '兼務寺院' : '本寺'}
                        </span>
                        <h4 className="text-base font-bold font-serif text-[#1A1A1A] truncate">
                          {t.name}
                        </h4>
                      </div>
                      <p className="text-xs text-gray-600 mt-1 truncate">
                        {t.mountainName ? `${t.mountainName} / ` : ''}{t.sect || '曹洞宗'}
                        <span className="ml-2 font-sans text-gray-500 font-bold">（檀家: {hhCount}世帯）</span>
                      </p>
                    </div>
                    <ArrowRight className="w-5 h-5 text-[#8C2D19] shrink-0" />
                  </button>
                );
              })}
            </div>

            {/* Direct jump to details if needed */}
            <div className="pt-4 text-center">
              <button
                type="button"
                onClick={() => setCurrentStep('step_details')}
                className="text-xs text-gray-500 hover:text-gray-800 underline py-2 cursor-pointer"
              >
                手順をスキップして直接入力する
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: 塔婆か法要かその他か？ */}
        {currentStep === 'step_category' && (
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div className="text-center py-2">
              <div className="w-12 h-12 rounded-full bg-[#8C2D19]/10 text-[#8C2D19] flex items-center justify-center mx-auto mb-2">
                <Layers className="w-7 h-7" />
              </div>
              <h3 className="text-lg font-bold font-serif text-[#1A1A1A]">
                ② どのような法務・予定ですか？
              </h3>
              <p className="text-xs text-gray-600 mt-1">
                【{selectedTemple.name}】の案件区分を選択してください
              </p>
            </div>

            <div className="space-y-3 pt-1">
              {/* Option 0: 通夜・葬儀 (一番上・直接檀家検索へ) */}
              <button
                type="button"
                onClick={() => handleSelectCategory('通夜・葬儀')}
                className="w-full p-4 bg-white border-2 border-[#1A1A1A] hover:border-[#8C2D19] active:bg-amber-50 rounded-xs text-left transition-all flex items-center justify-between gap-3 shadow-xs cursor-pointer"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-12 h-12 rounded-xs bg-[#1A1A1A] text-white flex items-center justify-center shrink-0 font-serif font-black text-xl shadow-xs border border-gray-700">
                    葬
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h4 className="text-base font-bold text-[#1A1A1A]">
                        通夜・葬儀
                      </h4>
                      <span className="px-1.5 py-0.2 bg-[#1A1A1A] text-[#D4AF37] text-[10px] font-bold rounded-2xs">
                        檀家検索へ直行
                      </span>
                    </div>
                    <p className="text-xs text-gray-600 mt-0.5">
                      枕経・通夜・葬儀告別式・初七日繰上げなどのお申込み
                    </p>
                  </div>
                </div>
                <ArrowRight className="w-5 h-5 text-[#8C2D19] shrink-0" />
              </button>

              {/* Option 1: 法事・法要 */}
              <button
                type="button"
                onClick={() => handleSelectCategory('法事')}
                className="w-full p-4 bg-white border-2 border-[#D1CEC7] hover:border-[#8C2D19] active:bg-amber-50 rounded-xs text-left transition-all flex items-center justify-between gap-3 shadow-xs cursor-pointer"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-12 h-12 rounded-xs bg-[#8C2D19] text-white flex items-center justify-center shrink-0 font-serif font-black text-xl shadow-xs">
                    法
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-base font-bold text-[#1A1A1A]">
                      法事・法要
                    </h4>
                    <p className="text-xs text-gray-600 mt-0.5">
                      年忌法要（一周忌・三回忌等）、四十九日、百ヶ日、納骨法要など
                    </p>
                  </div>
                </div>
                <ArrowRight className="w-5 h-5 text-[#8C2D19] shrink-0" />
              </button>

              {/* Option 2: 塔婆供養 */}
              <button
                type="button"
                onClick={() => handleSelectCategory('塔婆')}
                className="w-full p-4 bg-white border-2 border-[#D1CEC7] hover:border-[#8C2D19] active:bg-amber-50 rounded-xs text-left transition-all flex items-center justify-between gap-3 shadow-xs cursor-pointer"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-12 h-12 rounded-xs bg-[#D4AF37] text-black flex items-center justify-center shrink-0 font-serif font-black text-xl shadow-xs">
                    塔
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-base font-bold text-[#1A1A1A]">
                      お塔婆供養
                    </h4>
                    <p className="text-xs text-gray-600 mt-0.5">
                      お塔婆のみのお申込み・建立・回向
                    </p>
                  </div>
                </div>
                <ArrowRight className="w-5 h-5 text-[#8C2D19] shrink-0" />
              </button>

              {/* Option 3: その他 */}
              <button
                type="button"
                onClick={() => handleSelectCategory('その他')}
                className="w-full p-4 bg-white border-2 border-[#D1CEC7] hover:border-[#8C2D19] active:bg-amber-50 rounded-xs text-left transition-all flex items-center justify-between gap-3 shadow-xs cursor-pointer"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-12 h-12 rounded-xs bg-[#2A2A2A] text-white flex items-center justify-center shrink-0 font-serif font-black text-xl shadow-xs">
                    他
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-base font-bold text-[#1A1A1A]">
                      その他
                    </h4>
                    <p className="text-xs text-gray-600 mt-0.5">
                      寺院行事・諸用・その他のご予定
                    </p>
                  </div>
                </div>
                <ArrowRight className="w-5 h-5 text-[#8C2D19] shrink-0" />
              </button>
            </div>

            <div className="pt-3 text-center">
              <button
                type="button"
                onClick={() => setCurrentStep('step_details')}
                className="text-xs text-gray-500 hover:text-gray-800 underline py-2 cursor-pointer"
              >
                手順をスキップして直接入力する
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: 檀家から選ぶか？ 精霊から選ぶか？ */}
        {currentStep === 'step_select_mode' && (
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div className="text-center py-2">
              <div className="w-12 h-12 rounded-full bg-[#8C2D19]/10 text-[#8C2D19] flex items-center justify-center mx-auto mb-2">
                <User className="w-7 h-7" />
              </div>
              <h3 className="text-lg font-bold font-serif text-[#1A1A1A]">
                ③ どのように指定しますか？
              </h3>
              <p className="text-xs text-gray-600 mt-1">
                【{selectedTemple.name}】の{majorCategory}案件
              </p>
            </div>

            <div className="space-y-3 pt-1">
              {/* Branch A: 檀家（世帯）から選ぶ */}
              <button
                type="button"
                onClick={() => handleSelectMode('household')}
                className="w-full p-4 bg-white border-2 border-[#8C2D19] bg-amber-50/40 active:bg-amber-100/60 rounded-xs text-left transition-all flex items-center justify-between gap-3 shadow-xs cursor-pointer"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-12 h-12 rounded-xs bg-[#8C2D19] text-white flex items-center justify-center shrink-0 shadow-xs">
                    <User className="w-6 h-6" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h4 className="text-base font-bold text-[#1A1A1A]">
                        檀家（世帯）から探す
                      </h4>
                      <span className="px-1.5 py-0.2 bg-[#8C2D19] text-white text-[10px] font-bold rounded-2xs">
                        検索
                      </span>
                    </div>
                    <p className="text-xs text-gray-600 mt-0.5">
                      施主名・フリガナ・地区名で{selectedTemple.name}の檀家を検索
                    </p>
                  </div>
                </div>
                <ArrowRight className="w-5 h-5 text-[#8C2D19] shrink-0" />
              </button>

              {/* Branch B: 精霊（忌日・年回忌）から選ぶ */}
              <button
                type="button"
                onClick={() => handleSelectMode('spirit')}
                className="w-full p-4 bg-white border-2 border-[#D4AF37] bg-amber-50/20 active:bg-amber-100/60 rounded-xs text-left transition-all flex items-center justify-between gap-3 shadow-xs cursor-pointer"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-12 h-12 rounded-xs bg-[#2A2A2A] border border-[#D4AF37] text-[#D4AF37] flex items-center justify-center shrink-0 shadow-xs">
                    <BookOpen className="w-6 h-6" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h4 className="text-base font-bold text-[#1A1A1A]">
                        精霊（忌日・年回忌）から選ぶ
                      </h4>
                      <span className="px-1.5 py-0.2 bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-bold rounded-2xs">
                        向こう2ヶ月
                      </span>
                    </div>
                    <p className="text-xs text-gray-600 mt-0.5">
                      49日・百ヶ日・一周忌・三回忌など近い忌日・年忌を迎える精霊一覧
                    </p>
                  </div>
                </div>
                <ArrowRight className="w-5 h-5 text-[#8C2D19] shrink-0" />
              </button>
            </div>

            <div className="pt-3 text-center">
              <button
                type="button"
                onClick={() => setCurrentStep('step_details')}
                className="text-xs text-gray-500 hover:text-gray-800 underline py-2 cursor-pointer"
              >
                手順をスキップして直接入力する
              </button>
            </div>
          </div>
        )}

        {/* STEP 3-A: 檀家（世帯）検索画面 */}
        {currentStep === 'step_household_search' && (
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            <div className="bg-[#1A1A1A] text-white p-3 rounded-xs border-l-4 border-[#8C2D19] flex items-center justify-between">
              <div>
                <span className="text-xs text-[#D4AF37] font-bold">検索対象寺院:</span>
                <div className="text-sm font-bold">{selectedTemple.name} （{templeHouseholds.length}世帯）</div>
              </div>
              <span className="text-xs text-gray-400">※兼務寺院の檀家は除外</span>
            </div>

            {/* Big Search Input */}
            <div className="relative">
              <input
                type="text"
                autoFocus
                placeholder="施主氏名・フリガナ・地区名・電話番号・精霊名..."
                value={householdSearchQuery}
                onChange={(e) => setHouseholdSearchQuery(e.target.value)}
                className="w-full pl-10 pr-9 py-3 border-2 border-[#8C2D19] bg-white text-sm font-bold rounded-xs shadow-xs focus:ring-2 focus:ring-[#8C2D19]/30 outline-hidden"
              />
              <Search className="w-5 h-5 text-[#8C2D19] absolute left-3 top-1/2 -translate-y-1/2" />
              {householdSearchQuery && (
                <button
                  type="button"
                  onClick={() => setHouseholdSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* District Filter Chips */}
            {availableDistricts.length > 0 && (
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
                <button
                  type="button"
                  onClick={() => setHouseholdDistrictFilter('ALL')}
                  className={`px-3 py-1 rounded-full font-bold shrink-0 border cursor-pointer ${
                    householdDistrictFilter === 'ALL'
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
                      onClick={() => setHouseholdDistrictFilter(d)}
                      className={`px-3 py-1 rounded-full font-bold shrink-0 border cursor-pointer ${
                        householdDistrictFilter === d
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

            {/* Kana Row (五十音順) Quick Index Selector with 2-Step Drill-down */}
            <div className="bg-white p-2 rounded-xs border border-[#D1CEC7]">
              <KanaIndexFilter
                selectedRow={householdKanaFilter}
                selectedCol={householdKanaColFilter}
                onSelectRow={(row) => {
                  setHouseholdKanaFilter(row);
                  setHouseholdKanaColFilter('ALL');
                }}
                onSelectCol={(col) => setHouseholdKanaColFilter(col)}
                onReset={() => {
                  setHouseholdKanaFilter('ALL');
                  setHouseholdKanaColFilter('ALL');
                }}
                accentColor="wine"
              />
            </div>

            <div className="flex items-center justify-between text-xs text-gray-600 px-1 pt-0.5">
              <div className="flex items-center gap-1.5">
                <span>該当候補: <strong className="text-[#8C2D19] text-sm">{searchedHouseholds.length}</strong> 件</span>
                <span className="px-1.5 py-0.2 bg-amber-50 text-amber-900 border border-amber-200 text-[10px] font-bold rounded-2xs">
                  五十音順
                </span>
                {householdKanaFilter !== 'ALL' && (
                  <span className="px-1.5 py-0.2 bg-[#8C2D19] text-white text-[10px] font-bold rounded-2xs">
                    【{householdKanaFilter}行{householdKanaColFilter !== 'ALL' ? `・${householdKanaColFilter}` : ''}】
                  </span>
                )}
              </div>
              <span>タップして選択</span>
            </div>

            {/* Results List */}
            <div className="space-y-2 pb-6">
              {searchedHouseholds.length === 0 ? (
                <div className="p-6 bg-white border border-[#D1CEC7] rounded-xs text-center space-y-2">
                  <p className="text-sm font-bold text-gray-700">
                    該当する世帯が見つかりませんでした
                  </p>
                  <p className="text-xs text-gray-500">
                    検索条件を変えるか、直接手入力してください。
                  </p>
                  <button
                    type="button"
                    onClick={() => setCurrentStep('step_details')}
                    className="mt-2 px-4 py-2 bg-[#8C2D19] text-white text-xs font-bold rounded-xs"
                  >
                    直接手入力へ進む
                  </button>
                </div>
              ) : (
                searchedHouseholds.slice(0, 50).map((h) => {
                  const pastCount = templePastRecords.filter((p) => p.householdId === h.id).length;
                  const sponsorInfo = getHouseholdSponsorInfo(h);

                  return (
                    <button
                      key={h.id}
                      type="button"
                      onClick={() => handlePickHousehold(h)}
                      className="w-full p-3.5 bg-white border border-[#D1CEC7] hover:border-[#8C2D19] active:bg-amber-50 rounded-xs text-left transition-all flex items-start justify-between gap-2 shadow-2xs cursor-pointer"
                    >
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-base font-bold text-[#1A1A1A] font-serif">
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
                          <span className="text-xs text-gray-400 font-mono">
                            #{h.id}
                          </span>
                        </div>

                        {h.address && (
                          <div className="text-xs text-gray-600 truncate flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                            <span className="truncate">{h.address}</span>
                          </div>
                        )}

                        {pastCount > 0 && (
                          <div className="text-xs text-[#8C2D19] font-bold pt-0.5 flex items-center gap-1">
                            <BookOpen className="w-3.5 h-3.5 shrink-0" />
                            <span>過去帳精霊: {pastCount}柱 登録あり</span>
                          </div>
                        )}
                      </div>

                      <span className="px-3 py-1.5 bg-[#8C2D19] text-white text-xs font-bold rounded-xs shrink-0 mt-0.5 shadow-2xs">
                        選択
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* STEP 3-B: 年忌・忌日精霊候補（向こう2ヶ月） */}
        {currentStep === 'step_spirit_candidates' && (
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            <div className="bg-[#1A1A1A] text-white p-3 rounded-xs border-l-4 border-[#D4AF37] space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#D4AF37] font-bold">寺院: {selectedTemple.name}</span>
                <span className="text-xs text-amber-300 font-bold bg-amber-950 px-2 py-0.5 rounded border border-amber-500/40">
                  向こう2ヶ月の忌日・回忌
                </span>
              </div>
              <p className="text-xs text-gray-300">
                選択日 ({formData.scheduledDate || todayStr}) より約65日間に迎える忌日・年回忌精霊です
              </p>
            </div>

            <div className="flex items-center justify-between text-xs text-gray-600 px-1 pt-1">
              <span>該当精霊候補: <strong className="text-[#8C2D19] text-sm">{upcomingSpiritCandidates.length}</strong> 柱</span>
              <span>日付順で表示</span>
            </div>

            {/* Candidates List */}
            <div className="space-y-2.5 pb-6">
              {upcomingSpiritCandidates.length === 0 ? (
                <div className="p-6 bg-white border border-[#D1CEC7] rounded-xs text-center space-y-2">
                  <p className="text-sm font-bold text-gray-700">
                    向こう2ヶ月に該当する忌日・年忌精霊は見つかりませんでした
                  </p>
                  <p className="text-xs text-gray-500">
                    檀家名簿から検索するか、直接手入力で予定を登録してください。
                  </p>
                  <div className="flex gap-2 justify-center pt-2">
                    <button
                      type="button"
                      onClick={() => setCurrentStep('step_household_search')}
                      className="px-3 py-2 bg-white border border-[#8C2D19] text-[#8C2D19] text-xs font-bold rounded-xs"
                    >
                      檀家検索へ
                    </button>
                    <button
                      type="button"
                      onClick={() => setCurrentStep('step_details')}
                      className="px-3 py-2 bg-[#8C2D19] text-white text-xs font-bold rounded-xs"
                    >
                      直接入力へ進む
                    </button>
                  </div>
                </div>
              ) : (
                upcomingSpiritCandidates.map((cand) => {
                  const p = cand.record;
                  const hh = cand.household;
                  const sponsorInfo = hh ? getHouseholdSponsorInfo(hh) : null;
                  const headName = sponsorInfo?.sponsorName || (hh ? hh.familyHead : (p.householdHeadName || '施主'));

                  return (
                    <button
                      key={cand.id}
                      type="button"
                      onClick={() => handlePickSpiritCandidate(cand)}
                      className="w-full p-3.5 bg-white border-2 border-[#D1CEC7] hover:border-[#8C2D19] active:bg-amber-50 rounded-xs text-left transition-all space-y-2 shadow-2xs cursor-pointer"
                    >
                      {/* Top Bar: Target Date & Milestone Badge */}
                      <div className="flex items-center justify-between border-b border-gray-100 pb-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold font-serif text-[#8C2D19] bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-2xs">
                            祥月/忌日: {cand.scheduledDate}
                          </span>
                          <span className="text-xs font-bold px-2 py-0.5 bg-amber-100 text-amber-900 border border-amber-300 rounded-2xs">
                            {cand.memorialType}
                          </span>
                        </div>
                        <span className="text-xs font-bold text-gray-500">
                          {cand.daysUntil === 0 ? '本日' : `${cand.daysUntil}日後`}
                        </span>
                      </div>

                      {/* Dharma Name (Large & Bold) */}
                      <div className="space-y-0.5">
                        <h4 className="text-base font-black font-serif text-[#1A1A1A] leading-tight">
                          {p.dharmaName || '（戒名未登録）'}
                        </h4>
                        <div className="text-xs text-gray-600 flex items-center gap-2 flex-wrap">
                          {p.secularName && <span>俗名: <strong>{p.secularName}</strong></span>}
                          <span>施主: <strong>{headName} 様</strong></span>
                          {sponsorInfo?.isDistinctFromHead && sponsorInfo.householdHead && (
                            <span className="text-[10px] text-stone-500 bg-stone-100 px-1 py-0.2 rounded-2xs border border-stone-200">
                              (世帯主: {sponsorInfo.householdHead})
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Bottom Info: Death date & Select button */}
                      <div className="flex items-center justify-between pt-1 text-xs text-gray-500">
                        <span>命日: {cand.deathDateNormalized}</span>
                        <span className="px-3 py-1 bg-[#8C2D19] text-white text-xs font-bold rounded-xs shadow-2xs">
                          この精霊で登録
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* STEP 4: 詳細確認・調整・保存 (Final Form) */}
        {currentStep === 'step_details' && (
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Quick reset / re-select banner */}
            {!isEditing && (
              <div className="p-2.5 bg-[#FFF8EE] border border-[#D4AF37] rounded-xs flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5 text-[#8C2D19] font-bold truncate">
                  <Sparkles className="w-4 h-4 shrink-0" />
                  <span className="truncate">
                    {majorCategory === '通夜・葬儀' ? (
                      `${formData.memorialType || '通夜'}　施主　${formData.chiefMourner ? formData.chiefMourner.replace(/(家|様)+$/g, '').trim() : '施主未定'}`
                    ) : majorCategory === 'その他' ? (
                      formData.chiefMourner ? formData.chiefMourner : 'その他予定'
                    ) : (
                      `${formData.chiefMourner ? `${formData.chiefMourner} 様` : '施主指定なし'}${formData.dharmaName ? ` / ${formData.dharmaName}` : ''}`
                    )}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setCurrentStep('step_category')}
                  className="text-xs text-gray-600 hover:text-red-700 font-bold underline shrink-0 cursor-pointer ml-2"
                >
                  条件を再選択
                </button>
              </div>
            )}

            {/* Target Temple Selector */}
            {temples.length > 1 && (
              <div className="p-3 bg-white border border-[#D1CEC7] rounded-xs shadow-2xs space-y-1.5">
                <label className="block font-bold text-sm text-[#1A1A1A] flex items-center gap-1.5">
                  <Building2 className="w-4 h-4 text-[#8C2D19]" />
                  対象寺院 (本寺 / 兼務寺)
                </label>
                <select
                  value={formData.templeId || 'temple-main'}
                  onChange={(e) => {
                    const newTempleId = e.target.value;
                    const newTemple = temples.find((t) => t.id === newTempleId);
                    const oldTemple = temples.find((t) => t.id === (formData.templeId || activeTempleId));
                    let newVenue = formData.venue;
                    let newAddress = formData.address;
                    if (formData.venue === oldTemple?.name || formData.venue === '本堂' || formData.venue === '寺院') {
                      newVenue = newTemple?.name || '寺院';
                      newAddress = newTemple?.address || '';
                    }
                    setFormData({ ...formData, templeId: newTempleId, venue: newVenue, address: newAddress });
                  }}
                  className="w-full p-2.5 bg-white border-2 border-[#D1CEC7] text-sm font-bold rounded-xs"
                >
                  {temples.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} {t.isAffiliated || (!t.isMain && t.id !== 'temple-main') ? '【兼務寺】' : '【本寺】'}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Date & Time */}
            <div className="p-3.5 bg-white border border-[#D1CEC7] rounded-xs shadow-2xs space-y-3">
              <div>
                <label className="block font-bold text-sm text-[#1A1A1A] mb-1.5 flex items-center gap-1.5">
                  <CalendarIcon className="w-4 h-4 text-[#8C2D19]" />
                  予定日 (和暦/西暦)
                </label>
                <DateInputWithEra
                  value={formData.scheduledDate || todayStr}
                  onChange={(val) => setFormData({ ...formData, scheduledDate: val })}
                  className="w-full text-base"
                />
              </div>

              <div>
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block font-bold text-sm text-[#1A1A1A] mb-1 flex items-center justify-between">
                      <span className="flex items-center gap-1">
                        <Clock className="w-4 h-4 text-[#8C2D19]" />
                        時間帯 / 開始時刻
                      </span>
                    </label>
                    <TimeSelectorInput
                      value={formData.scheduledTime || (majorCategory === '塔婆' ? '終日' : '11:00')}
                      allowAllDay={true}
                      onChange={(val) => {
                        const isAll = val === '終日';
                        const newEnd = isAll ? '終日' : calculateEndTime(val, 60);
                        setFormData({ ...formData, scheduledTime: val, endTime: newEnd, isAllDay: isAll });
                      }}
                      className="w-full"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-sm text-[#555555] mb-1">終了予定</label>
                    <TimeSelectorInput
                      value={formData.endTime || (formData.scheduledTime === '終日' ? '終日' : '12:00')}
                      allowAllDay={true}
                      onChange={(val) => setFormData({ ...formData, endTime: val })}
                      className="w-full"
                    />
                  </div>
                </div>

                {/* Quick time chips including 終日 */}
                <div className="flex flex-wrap gap-1.5 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setFormData({ ...formData, scheduledTime: '終日', endTime: '終日', isAllDay: true });
                    }}
                    className={`px-3 py-1.5 rounded-xs text-xs font-bold cursor-pointer border transition-colors ${
                      formData.scheduledTime === '終日' || formData.isAllDay
                        ? 'bg-[#8C2D19] text-white border-[#8C2D19] shadow-2xs'
                        : 'bg-amber-50 text-[#8C2D19] border-amber-300 hover:bg-amber-100'
                    }`}
                  >
                    終日
                  </button>
                  {['09:00', '10:00', '11:00', '13:00', '14:00', '15:00'].map((time) => (
                    <button
                      key={time}
                      type="button"
                      onClick={() => {
                        const end = calculateEndTime(time, 60);
                        setFormData({ ...formData, scheduledTime: time, endTime: end, isAllDay: false });
                      }}
                      className={`px-3 py-1.5 rounded-xs text-xs font-bold cursor-pointer border ${
                        formData.scheduledTime === time && !formData.isAllDay
                          ? 'bg-[#8C2D19] text-white border-[#8C2D19]'
                          : 'bg-[#FAF8F5] text-[#555555] border-[#D1CEC7] hover:bg-[#F3EDE2]'
                      }`}
                    >
                      {time}〜
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Service Type Selection */}
            {majorCategory === '通夜・葬儀' ? (
              <div className="p-3.5 bg-white border border-[#D1CEC7] rounded-xs shadow-2xs space-y-2">
                <label className="block font-bold text-sm text-[#1A1A1A]">
                  葬儀種別・区分
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {['通夜', '葬儀', '枕経'].map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setFormData({ ...formData, memorialType: type as any })}
                      className={`py-3 px-2 rounded-xs text-sm font-bold border transition-colors cursor-pointer text-center ${
                        formData.memorialType === type
                          ? 'bg-[#8C2D19] text-white border-[#8C2D19] shadow-2xs'
                          : 'bg-[#FAF8F5] text-[#333333] border-[#D1CEC7] hover:bg-[#F0ECE1]'
                      }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>
            ) : majorCategory === 'その他' || majorCategory === '塔婆' ? (
              /* その他 and 塔婆 have no separate service type selection buttons */
              null
            ) : (
              <div className="p-3.5 bg-white border border-[#D1CEC7] rounded-xs shadow-2xs space-y-2">
                <label className="block font-bold text-sm text-[#1A1A1A]">
                  法要種別・区分
                </label>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
                  {[
                    '四十九日', '百ヶ日', '一周忌', '三回忌',
                    '七回忌', '十三回忌', '十七回忌', '二十三回忌',
                    '二十七回忌', '三十三回忌', '五十回忌', '納骨法要',
                    '塔婆供養', '年忌法要', '新盆・初盆', '施餓鬼法要'
                  ].map((type) => {
                    const normCur = normalizeMemorialType(formData.memorialType || '');
                    const isSelected = normCur === type || formData.memorialType === type;
                    return (
                      <button
                        key={type}
                        type="button"
                        onClick={() => {
                          const oldType = formData.memorialType;
                          const curTobaItems = [...(formData.tobaItems || [])];
                          if (curTobaItems.length > 0 && (!curTobaItems[0].memorialType || curTobaItems[0].memorialType === oldType || curTobaItems[0].memorialType === '一周忌' || curTobaItems[0].memorialType === '年忌法要')) {
                            curTobaItems[0] = { ...curTobaItems[0], memorialType: type };
                          }
                          setFormData({
                            ...formData,
                            memorialType: type as any,
                            tobaItems: curTobaItems,
                          });
                        }}
                        className={`py-2 px-1 rounded-xs text-xs font-bold border transition-colors cursor-pointer text-center ${
                          isSelected
                            ? 'bg-[#8C2D19] text-white border-[#8C2D19] shadow-2xs'
                            : 'bg-[#FAF8F5] text-[#333333] border-[#D1CEC7] hover:bg-[#F0ECE1]'
                        }`}
                      >
                        {type}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Chief Mourner & Household */}
            {majorCategory === 'その他' ? (
              <div className="p-3.5 bg-white border border-[#D1CEC7] rounded-xs shadow-2xs space-y-2">
                <label className="font-bold text-sm text-[#1A1A1A] flex items-center gap-1.5">
                  <User className="w-4 h-4 text-[#8C2D19]" />
                  件名
                </label>
                <input
                  type="text"
                  placeholder="例：寺院行事名・会議など"
                  value={formData.chiefMourner || ''}
                  onChange={(e) => setFormData({ ...formData, chiefMourner: e.target.value })}
                  className="w-full p-2.5 border-2 border-[#D1CEC7] bg-white text-base font-bold rounded-xs"
                />
              </div>
            ) : majorCategory === '通夜・葬儀' ? (
              <div className="p-3.5 bg-white border border-[#D1CEC7] rounded-xs shadow-2xs space-y-2">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-sm text-[#1A1A1A] flex items-center gap-1.5">
                    <User className="w-4 h-4 text-[#8C2D19]" />
                    施主氏名・世帯
                  </label>
                  <button
                    type="button"
                    onClick={() => setCurrentStep('step_household_search')}
                    className="text-xs text-[#8C2D19] font-bold underline cursor-pointer"
                  >
                    檀家から選び直す
                  </button>
                </div>
                <input
                  type="text"
                  placeholder="例: 佐藤 太郎 様"
                  value={formData.chiefMourner || ''}
                  onChange={(e) => setFormData({ ...formData, chiefMourner: e.target.value })}
                  className="w-full p-2.5 border-2 border-[#D1CEC7] bg-white text-base font-bold rounded-xs"
                />
              </div>
            ) : (
              <div className="p-3.5 bg-white border border-[#D1CEC7] rounded-xs shadow-2xs space-y-3">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-sm text-[#1A1A1A] flex items-center gap-1.5">
                    <User className="w-4 h-4 text-[#8C2D19]" />
                    施主氏名・世帯
                  </label>
                  <button
                    type="button"
                    onClick={() => setCurrentStep('step_household_search')}
                    className="text-xs text-[#8C2D19] font-bold underline cursor-pointer"
                  >
                    檀家から選び直す
                  </button>
                </div>

                <input
                  type="text"
                  placeholder="例: 佐藤 太郎 様"
                  value={formData.chiefMourner || ''}
                  onChange={(e) => {
                    const newChief = e.target.value;
                    const curTobaItems = [...(formData.tobaItems || [])];
                    if (curTobaItems.length > 0 && (!curTobaItems[0].sponsorName || curTobaItems[0].sponsorName === formData.chiefMourner)) {
                      curTobaItems[0] = { ...curTobaItems[0], sponsorName: newChief };
                    }
                    setFormData({
                      ...formData,
                      chiefMourner: newChief,
                      tobaItems: curTobaItems,
                      tobaSponsors: curTobaItems.map((i) => i.sponsorName),
                    });
                  }}
                  className="w-full p-2.5 border-2 border-[#D1CEC7] bg-white text-base font-bold rounded-xs"
                />

                {/* Family member quick selection chips */}
                {selectedHousehold && (
                  <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                    <span className="text-[11px] text-gray-500 font-bold">世帯員から選択:</span>
                    {(() => {
                      const spInfo = getHouseholdSponsorInfo(selectedHousehold);
                      const isSponsorSelected = (formData.chiefMourner || '').trim() === (spInfo.sponsorName || '').trim();
                      return spInfo.sponsorName ? (
                        <button
                          type="button"
                          onClick={() => {
                            const newChief = spInfo.sponsorName;
                            const curTobaItems = [...(formData.tobaItems || [])];
                            if (curTobaItems.length > 0 && (!curTobaItems[0].sponsorName || curTobaItems[0].sponsorName === formData.chiefMourner)) {
                              curTobaItems[0] = { ...curTobaItems[0], sponsorName: newChief };
                            }
                            setFormData((prev) => ({
                              ...prev,
                              chiefMourner: newChief,
                              tobaItems: curTobaItems,
                              tobaSponsors: curTobaItems.map((i) => i.sponsorName),
                            }));
                          }}
                          className={`px-2 py-0.5 text-xs font-bold rounded-2xs border cursor-pointer transition-colors ${
                            isSponsorSelected
                              ? 'bg-[#8C2D19] text-white border-[#8C2D19]'
                              : 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100'
                          }`}
                        >
                          ★ 施主: {spInfo.sponsorName}
                        </button>
                      ) : null;
                    })()}
                    {(() => {
                      const spInfo = getHouseholdSponsorInfo(selectedHousehold);
                      if (spInfo.isDistinctFromHead && selectedHousehold.familyHead) {
                        const isHeadSelected = (formData.chiefMourner || '').trim() === (selectedHousehold.familyHead || '').trim();
                        return (
                          <button
                            type="button"
                            onClick={() => {
                              const newChief = selectedHousehold.familyHead;
                              const curTobaItems = [...(formData.tobaItems || [])];
                              if (curTobaItems.length > 0 && (!curTobaItems[0].sponsorName || curTobaItems[0].sponsorName === formData.chiefMourner)) {
                                curTobaItems[0] = { ...curTobaItems[0], sponsorName: newChief };
                              }
                              setFormData((prev) => ({
                                ...prev,
                                chiefMourner: newChief,
                                tobaItems: curTobaItems,
                                tobaSponsors: curTobaItems.map((i) => i.sponsorName),
                              }));
                            }}
                            className={`px-2 py-0.5 text-xs font-bold rounded-2xs border cursor-pointer transition-colors ${
                              isHeadSelected
                                ? 'bg-[#1A1A1A] text-[#D4AF37] border-[#1A1A1A]'
                                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                            }`}
                          >
                            世帯主: {selectedHousehold.familyHead}
                          </button>
                        );
                      }
                      return null;
                    })()}
                    {(selectedHousehold.familyMembers || []).map((m) => {
                      if (m.name === getHouseholdSponsorName(selectedHousehold) || m.name === selectedHousehold.familyHead) return null;
                      const isMemberSelected = (formData.chiefMourner || '').trim() === (m.name || '').trim();
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => {
                            const newChief = m.name;
                            const curTobaItems = [...(formData.tobaItems || [])];
                            if (curTobaItems.length > 0 && (!curTobaItems[0].sponsorName || curTobaItems[0].sponsorName === formData.chiefMourner)) {
                              curTobaItems[0] = { ...curTobaItems[0], sponsorName: newChief };
                            }
                            setFormData((prev) => ({
                              ...prev,
                              chiefMourner: newChief,
                              tobaItems: curTobaItems,
                              tobaSponsors: curTobaItems.map((i) => i.sponsorName),
                            }));
                          }}
                          className={`px-2 py-0.5 text-xs font-bold rounded-2xs border cursor-pointer transition-colors ${
                            isMemberSelected
                              ? 'bg-[#1A1A1A] text-[#D4AF37] border-[#1A1A1A]'
                              : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          {m.name} {m.relationship ? `(${m.relationship})` : ''}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Multi-Spirits Selection Chips from Household Past Records */}
                {selectedHouseholdSpirits.length > 0 && (
                  <div className="p-2.5 bg-[#FFF8EE] border border-[#D4AF37] rounded-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-bold text-[#8C2D19] flex items-center gap-1">
                        <BookOpen className="w-3.5 h-3.5" />
                        過去帳から精霊を選択（タップで主・副精霊を切替）:
                      </label>
                      <span className="text-[10px] text-gray-500 font-medium">
                        {selectedHouseholdSpirits.length}霊
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-600 leading-tight">
                      ※ 最初に選んだ精霊が【主】、続けてタップした精霊が【副（併修）】になります。
                    </p>
                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                      {selectedHouseholdSpirits.map((p) => {
                        const isMain = formData.deceasedId === p.id;
                        const subIdx = (formData.additionalDeceased || []).findIndex((s) => s.id === p.id);
                        const isSelected = isMain || subIdx >= 0;
                        const targetDate = formData.scheduledDate || todayStr;
                        const kaikiRaw = p.deathDate ? getSpiritMemorialForDate(p.deathDate, targetDate) : '';
                        const kaiki = kaikiRaw && kaikiRaw !== '当年没' ? normalizeMemorialType(kaikiRaw) : '';

                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => {
                              const curSubs = [...(formData.additionalDeceased || [])];
                              const autoMemType = kaiki || normalizeMemorialType(formData.memorialType) || '年忌法要';

                              if (isMain) {
                                // Unset main. Promote first sub-spirit if exists
                                if (curSubs.length > 0) {
                                  const [firstSub, ...restSubs] = curSubs;
                                  const nextMem = normalizeMemorialType(firstSub.memorialType || formData.memorialType || '年忌法要');
                                  const curToba = [...(formData.tobaItems || [])];
                                  if (curToba.length > 0) {
                                    curToba[0] = {
                                      ...curToba[0],
                                      memorialType: nextMem,
                                      dharmaName: firstSub.dharmaName || curToba[0].dharmaName || '',
                                    };
                                  }
                                  setFormData({
                                    ...formData,
                                    deceasedId: firstSub.id || '',
                                    dharmaName: firstSub.dharmaName || '',
                                    deceasedName: firstSub.deceasedName || '',
                                    memorialType: nextMem as any,
                                    additionalDeceased: restSubs,
                                    tobaItems: curToba,
                                  });
                                } else {
                                  setFormData({
                                    ...formData,
                                    deceasedId: '',
                                    dharmaName: '',
                                    deceasedName: '',
                                  });
                                }
                              } else if (subIdx >= 0) {
                                // Remove from sub-spirits
                                const updatedSubs = curSubs.filter((_, idx) => idx !== subIdx);
                                setFormData({
                                  ...formData,
                                  additionalDeceased: updatedSubs,
                                });
                              } else {
                                // Not selected
                                if (!formData.deceasedId && !formData.dharmaName) {
                                  // Set as Main
                                  const curToba = [...(formData.tobaItems || [])];
                                  if (curToba.length > 0) {
                                    curToba[0] = {
                                      ...curToba[0],
                                      memorialType: autoMemType,
                                      dharmaName: p.dharmaName || curToba[0].dharmaName || '',
                                    };
                                  }
                                  setFormData({
                                    ...formData,
                                    deceasedId: p.id,
                                    dharmaName: p.dharmaName || '',
                                    deceasedName: p.secularName || '',
                                    memorialType: (majorCategory === '塔婆' ? '塔婆供養' : autoMemType) as any,
                                    tobaItems: curToba,
                                  });
                                } else {
                                  // Add as Sub-spirit (併修)
                                  const newSub: ServiceDeceasedTarget = {
                                    id: p.id,
                                    dharmaName: p.dharmaName || '',
                                    deceasedName: p.secularName || '',
                                    memorialType: autoMemType,
                                    deathDate: p.deathDate,
                                    isMain: false,
                                  };
                                  setFormData({
                                    ...formData,
                                    additionalDeceased: [...curSubs, newSub],
                                  });
                                }
                              }
                            }}
                            className={`px-2.5 py-1.5 rounded-xs text-xs font-bold border transition-all flex items-center gap-1.5 cursor-pointer ${
                              isMain
                                ? 'bg-[#8C2D19] text-white border-[#8C2D19] shadow-xs'
                                : subIdx >= 0
                                ? 'bg-[#2D3748] text-white border-[#2D3748] shadow-xs'
                                : 'bg-white text-[#1A1A1A] border-[#D4AF37] hover:bg-[#FFF9E6]'
                            }`}
                          >
                            <span className="text-[10px] font-sans font-bold px-1 py-0.2 rounded-2xs bg-black/20 text-white">
                              {isMain ? '★主' : subIdx >= 0 ? `＋副${subIdx + 1}` : '未選択'}
                            </span>
                            <span className="font-serif font-bold">{p.dharmaName || p.secularName || '（戒名未登録）'}</span>
                            {kaiki && (
                              <span
                                className={`px-1.5 py-0.5 rounded-2xs text-[10px] font-bold font-sans ${
                                  isSelected
                                    ? 'bg-amber-200 text-amber-950'
                                    : 'bg-amber-100 text-amber-900 border border-amber-300'
                                }`}
                              >
                                {kaiki}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Detailed Spirits Editors (Main + Additional Deceased) */}
                <div className="space-y-2.5 pt-1 border-t border-gray-200">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#1A1A1A]">
                      供養対象精霊（1行目: 主精霊 / 2行目以降: 併修・合修）
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const curSubs = [...(formData.additionalDeceased || [])];
                        const newSub: ServiceDeceasedTarget = {
                          id: `MANUAL-${Date.now()}`,
                          dharmaName: '',
                          deceasedName: '',
                          memorialType: '七回忌',
                          isMain: false,
                        };
                        setFormData({
                          ...formData,
                          additionalDeceased: [...curSubs, newSub],
                        });
                      }}
                      className="text-[11px] text-[#8C2D19] hover:underline font-bold flex items-center gap-1 bg-amber-50 hover:bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-xs cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                      <span>併修精霊を手動追加</span>
                    </button>
                  </div>

                  {/* 1. Main Spirit (★主) */}
                  <div className="p-2.5 bg-[#FAF8F5] border-2 border-[#8C2D19] rounded-xs space-y-2 shadow-2xs">
                    <div className="flex items-center justify-between">
                      <span className="px-1.5 py-0.5 bg-[#8C2D19] text-white text-[10px] font-bold rounded-xs">
                        ★ メイン供養精霊 (主)
                      </span>
                      <span className="text-[10px] text-gray-500">※カレンダーやToDoの主対象</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 text-xs">
                      <div className="sm:col-span-4">
                        <label className="block text-[10px] font-bold text-gray-600 mb-0.5">回忌・法要種別</label>
                        <select
                          value={normalizeMemorialType(formData.memorialType || '年忌法要')}
                          onChange={(e) => {
                            const newType = e.target.value;
                            const oldType = formData.memorialType;
                            const curTobaItems = [...(formData.tobaItems || [])];
                            if (curTobaItems.length > 0 && (!curTobaItems[0].memorialType || curTobaItems[0].memorialType === oldType || curTobaItems[0].memorialType === '一周忌' || curTobaItems[0].memorialType === '年忌法要')) {
                              curTobaItems[0] = { ...curTobaItems[0], memorialType: newType };
                            }
                            setFormData({
                              ...formData,
                              memorialType: newType as any,
                              tobaItems: curTobaItems,
                            });
                          }}
                          className="w-full p-2 border border-[#D1CEC7] bg-white font-bold text-xs rounded-xs"
                        >
                          {MEMORIAL_TYPE_OPTIONS.map((type) => (
                            <option key={type} value={type}>{type}</option>
                          ))}
                        </select>
                      </div>
                      <div className="sm:col-span-5">
                        <label className="block text-[10px] font-bold text-[#8C2D19] mb-0.5">戒名・法名 (必須)</label>
                        <input
                          type="text"
                          placeholder="例: 徳祥院清心義道居士"
                          value={formData.dharmaName || ''}
                          onChange={(e) => setFormData({ ...formData, dharmaName: e.target.value })}
                          className="w-full p-2 border border-[#D1CEC7] bg-white font-bold font-serif text-sm text-[#8C2D19] rounded-xs"
                        />
                      </div>
                      <div className="sm:col-span-3">
                        <label className="block text-[10px] font-bold text-gray-600 mb-0.5">俗名 (任意)</label>
                        <input
                          type="text"
                          placeholder="例: 佐藤 義雄"
                          value={formData.deceasedName || ''}
                          onChange={(e) => setFormData({ ...formData, deceasedName: e.target.value })}
                          className="w-full p-2 border border-[#D1CEC7] bg-white text-xs rounded-xs"
                        />
                      </div>
                    </div>
                  </div>

                  {/* 2. Additional Sub Spirits (＋副1, ＋副2...) */}
                  {(formData.additionalDeceased || []).map((sub, idx) => (
                    <div key={sub.id || idx} className="p-2.5 bg-stone-50 border border-stone-300 rounded-xs space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="px-1.5 py-0.5 bg-[#2D3748] text-white text-[10px] font-bold rounded-xs">
                          ＋ 併修精霊 {idx + 1} (副)
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            const curSubs = [...(formData.additionalDeceased || [])];
                            const updated = curSubs.filter((_, i) => i !== idx);
                            setFormData({ ...formData, additionalDeceased: updated });
                          }}
                          className="text-[10px] text-red-600 hover:underline cursor-pointer flex items-center gap-0.5 font-bold"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>削除</span>
                        </button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 text-xs">
                        <div className="sm:col-span-4">
                          <label className="block text-[10px] font-bold text-gray-600 mb-0.5">回忌</label>
                          <select
                            value={normalizeMemorialType(sub.memorialType || '七回忌')}
                            onChange={(e) => {
                              const curSubs = [...(formData.additionalDeceased || [])];
                              curSubs[idx] = { ...curSubs[idx], memorialType: e.target.value };
                              setFormData({ ...formData, additionalDeceased: curSubs });
                            }}
                            className="w-full p-2 border border-[#D1CEC7] bg-white font-bold text-xs rounded-xs"
                          >
                            {MEMORIAL_TYPE_OPTIONS.map((type) => (
                              <option key={type} value={type}>{type}</option>
                            ))}
                          </select>
                        </div>
                        <div className="sm:col-span-5">
                          <label className="block text-[10px] font-bold text-gray-700 mb-0.5">戒名・法名</label>
                          <input
                            type="text"
                            placeholder="例: 慈光院妙華信女"
                            value={sub.dharmaName || ''}
                            onChange={(e) => {
                              const curSubs = [...(formData.additionalDeceased || [])];
                              curSubs[idx] = { ...curSubs[idx], dharmaName: e.target.value };
                              setFormData({ ...formData, additionalDeceased: curSubs });
                            }}
                            className="w-full p-2 border border-[#D1CEC7] bg-white font-bold font-serif text-sm text-[#8C2D19] rounded-xs"
                          />
                        </div>
                        <div className="sm:col-span-3">
                          <label className="block text-[10px] font-bold text-gray-600 mb-0.5">俗名 (任意)</label>
                          <input
                            type="text"
                            placeholder="例: 佐藤 花子"
                            value={sub.deceasedName || ''}
                            onChange={(e) => {
                              const curSubs = [...(formData.additionalDeceased || [])];
                              curSubs[idx] = { ...curSubs[idx], deceasedName: e.target.value };
                              setFormData({ ...formData, additionalDeceased: curSubs });
                            }}
                            className="w-full p-2 border border-[#D1CEC7] bg-white text-xs rounded-xs"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Venue & Address (Hidden for 塔婆) */}
            {majorCategory !== '塔婆' && (() => {
              const targetTempleId = formData.templeId || activeTempleId;
              const targetTemple = temples.find((t) => t.id === targetTempleId) || temples.find((t) => t.isMain) || temples[0];
              const currentTempleName = targetTemple?.name || '寺院';
              const currentTempleAddr = targetTemple?.address || '';
              const curHousehold = households.find((h) => h.id === formData.householdId);
              const homeAddr = curHousehold?.tanagyoAddress || curHousehold?.address || '';

              return (
                <div className="p-3.5 bg-white border border-[#D1CEC7] rounded-xs shadow-2xs space-y-3">
                  <div>
                    <label className="block font-bold text-sm text-[#1A1A1A] mb-1.5 flex items-center gap-1.5">
                      <MapPin className="w-4 h-4 text-[#8C2D19]" />
                      会場・場所
                    </label>
                    <input
                      type="text"
                      placeholder={`例: ${currentTempleName}, 自宅, その他（空欄可）`}
                      value={formData.venue ?? ''}
                      onChange={(e) => setFormData({ ...formData, venue: e.target.value })}
                      className="w-full p-2.5 border border-[#D1CEC7] bg-white text-sm font-bold rounded-xs"
                    />
                    <div className="flex gap-2 mt-2 flex-wrap">
                      {[currentTempleName, '自宅', 'その他'].map((v) => {
                        const isSelected =
                          formData.venue === v ||
                          (v === currentTempleName &&
                            (formData.venue === '本堂' ||
                             formData.venue === '客殿' ||
                             formData.venue === '寺院' ||
                             formData.venue === currentTempleName));
                        return (
                          <button
                            key={v}
                            type="button"
                            onClick={() => {
                              let newAddr = formData.address;
                              if (v === currentTempleName) {
                                newAddr = currentTempleAddr;
                              } else if (v === '自宅') {
                                newAddr = homeAddr;
                              } else if (v === 'その他') {
                                newAddr = '';
                              }
                              setFormData({ ...formData, venue: v, address: newAddr });
                            }}
                            className={`px-3.5 py-2 rounded-xs text-xs font-bold border transition-colors cursor-pointer flex items-center gap-1.5 ${
                              isSelected
                                ? 'bg-[#8C2D19] text-white border-[#8C2D19] shadow-xs'
                                : 'bg-[#FAF8F5] text-[#333333] border-[#D1CEC7] hover:bg-[#F0ECE1]'
                            }`}
                          >
                            <MapPin className="w-3.5 h-3.5" />
                            <span>{v}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <label className="block font-bold text-xs text-[#1A1A1A] mb-1">
                      訪問先住所・場所 (Googleマップ連携)
                    </label>
                    <input
                      type="text"
                      placeholder="例: 東京都世田谷区経堂1-2-3"
                      value={formData.address || ''}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                      className="w-full p-2.5 border border-[#D1CEC7] bg-white text-sm rounded-xs"
                    />
                  </div>
                </div>
              );
            })()}

            {/* Attendees & Toba Settings (Only for 法事 and 塔婆) */}
            {majorCategory !== '通夜・葬儀' && majorCategory !== 'その他' && (
              <div className="p-3.5 bg-white border border-[#D1CEC7] rounded-xs shadow-2xs space-y-3.5">
                {majorCategory === '塔婆' ? (
                  /* 塔婆専用: 参列予定人数は非表示、塔婆本数のみ表示 */
                  <div>
                    <label className="block font-bold text-xs text-[#8C2D19] mb-1">塔婆本数</label>
                    <div className="flex items-center gap-1 max-w-[200px]">
                      <button
                        type="button"
                        onClick={() => {
                          const newCount = Math.max(1, (formData.tobaCount || 1) - 1);
                          const curItems = (formData.tobaItems || []).slice(0, newCount);
                          setFormData({
                            ...formData,
                            tobaCount: newCount,
                            tobaItems: curItems,
                            tobaSponsors: curItems.map((i) => i.sponsorName),
                          });
                        }}
                        className="w-8 h-9 bg-gray-100 hover:bg-gray-200 border border-gray-300 rounded-xs flex items-center justify-center text-gray-700 active:bg-gray-300 cursor-pointer"
                        title="1本減らす"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <input
                        type="number"
                        min={1}
                        value={formData.tobaCount || 1}
                        onChange={(e) => {
                          const newCount = Math.max(1, Number(e.target.value) || 1);
                          const curItems = [...(formData.tobaItems || [])];
                          while (curItems.length < newCount) {
                            const idx = curItems.length;
                            const subTarget = (formData.additionalDeceased || [])[idx - 1];
                            const targetDharma = subTarget ? (subTarget.dharmaName || '') : (idx === 0 ? (formData.dharmaName || '') : '');
                            const targetDeceasedId = subTarget ? subTarget.id : (idx === 0 ? formData.deceasedId : undefined);
                            const defaultItemMem = resolveSpiritMemorialType(
                              subTarget ? (subTarget.memorialType || formData.memorialType) : formData.memorialType,
                              targetDharma,
                              targetDeceasedId,
                              pastRecords,
                              formData.scheduledDate || todayStr
                            );
                            curItems.push({
                              id: `TOBA-${Date.now()}-${idx}`,
                              sponsorName: idx === 0 ? (formData.chiefMourner || '') : '',
                              memorialType: defaultItemMem,
                              dharmaName: targetDharma,
                              tobaType: (formData.tobaType as any) || '大塔婆',
                            });
                          }
                          const finalItems = curItems.slice(0, newCount);
                          setFormData({
                            ...formData,
                            tobaCount: newCount,
                            tobaItems: finalItems,
                            tobaSponsors: finalItems.map((i) => i.sponsorName),
                          });
                        }}
                        className="w-full p-2 border border-[#D1CEC7] bg-white text-center font-bold text-base text-[#8C2D19] rounded-xs"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const newCount = (formData.tobaCount || 0) + 1;
                          const curItems = [...(formData.tobaItems || [])];
                          const idx = curItems.length;
                          const subTarget = (formData.additionalDeceased || [])[idx - 1];
                          const targetDharma = subTarget ? (subTarget.dharmaName || '') : (idx === 0 ? (formData.dharmaName || '') : '');
                          const targetDeceasedId = subTarget ? subTarget.id : (idx === 0 ? formData.deceasedId : undefined);
                          const defaultItemMem = resolveSpiritMemorialType(
                            subTarget ? (subTarget.memorialType || formData.memorialType) : formData.memorialType,
                            targetDharma,
                            targetDeceasedId,
                            pastRecords,
                            formData.scheduledDate || todayStr
                          );
                          curItems.push({
                            id: `TOBA-${Date.now()}-${idx}`,
                            sponsorName: idx === 0 ? (formData.chiefMourner || '') : '',
                            memorialType: defaultItemMem,
                            dharmaName: targetDharma,
                            tobaType: (formData.tobaType as any) || '大塔婆',
                          });
                          setFormData({
                            ...formData,
                            tobaCount: newCount,
                            tobaItems: curItems,
                            tobaSponsors: curItems.map((i) => i.sponsorName),
                          });
                        }}
                        className="w-8 h-9 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded-xs flex items-center justify-center text-[#8C2D19] active:bg-amber-200 cursor-pointer"
                        title="1本増やす"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ) : (
                  /* 法事用: 参列予定人数と塔婆本数 */
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-xs text-[#1A1A1A] mb-1">参列予定人数</label>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          min={1}
                          value={formData.attendeeCount || 10}
                          onChange={(e) => setFormData({ ...formData, attendeeCount: Number(e.target.value) })}
                          className="w-full p-2 border border-[#D1CEC7] bg-white text-center font-bold text-base rounded-xs"
                        />
                        <span className="text-xs text-gray-600">名</span>
                      </div>
                    </div>
                    <div>
                      <label className="block font-bold text-xs text-[#8C2D19] mb-1">塔婆本数</label>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            const newCount = Math.max(0, (formData.tobaCount || 0) - 1);
                            const curItems = (formData.tobaItems || []).slice(0, newCount);
                            setFormData({
                              ...formData,
                              tobaCount: newCount,
                              tobaItems: curItems,
                              tobaSponsors: curItems.map((i) => i.sponsorName),
                            });
                          }}
                          className="w-8 h-9 bg-gray-100 hover:bg-gray-200 border border-gray-300 rounded-xs flex items-center justify-center text-gray-700 active:bg-gray-300 cursor-pointer"
                          title="1本減らす"
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                        <input
                          type="number"
                          min={0}
                          value={formData.tobaCount || 0}
                          onChange={(e) => {
                            const newCount = Math.max(0, Number(e.target.value) || 0);
                            const curItems = [...(formData.tobaItems || [])];
                            while (curItems.length < newCount) {
                              const idx = curItems.length;
                              const subTarget = (formData.additionalDeceased || [])[idx - 1];
                              const targetDharma = subTarget ? (subTarget.dharmaName || '') : (idx === 0 ? (formData.dharmaName || '') : '');
                              const targetDeceasedId = subTarget ? subTarget.id : (idx === 0 ? formData.deceasedId : undefined);
                              const defaultItemMem = resolveSpiritMemorialType(
                                subTarget ? (subTarget.memorialType || formData.memorialType) : formData.memorialType,
                                targetDharma,
                                targetDeceasedId,
                                pastRecords,
                                formData.scheduledDate || todayStr
                              );
                              curItems.push({
                                id: `TOBA-${Date.now()}-${idx}`,
                                sponsorName: idx === 0 ? (formData.chiefMourner || '') : '',
                                memorialType: defaultItemMem,
                                dharmaName: targetDharma,
                                tobaType: (formData.tobaType as any) || '大塔婆',
                              });
                            }
                            const finalItems = curItems.slice(0, newCount);
                            setFormData({
                              ...formData,
                              tobaCount: newCount,
                              tobaItems: finalItems,
                              tobaSponsors: finalItems.map((i) => i.sponsorName),
                            });
                          }}
                          className="w-full p-2 border border-[#D1CEC7] bg-white text-center font-bold text-base text-[#8C2D19] rounded-xs"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const newCount = (formData.tobaCount || 0) + 1;
                            const curItems = [...(formData.tobaItems || [])];
                            const idx = curItems.length;
                            const subTarget = (formData.additionalDeceased || [])[idx - 1];
                            const targetDharma = subTarget ? (subTarget.dharmaName || '') : (idx === 0 ? (formData.dharmaName || '') : '');
                            const targetDeceasedId = subTarget ? subTarget.id : (idx === 0 ? formData.deceasedId : undefined);
                            const defaultItemMem = resolveSpiritMemorialType(
                              subTarget ? (subTarget.memorialType || formData.memorialType) : formData.memorialType,
                              targetDharma,
                              targetDeceasedId,
                              pastRecords,
                              formData.scheduledDate || todayStr
                            );
                            curItems.push({
                              id: `TOBA-${Date.now()}-${idx}`,
                              sponsorName: idx === 0 ? (formData.chiefMourner || '') : '',
                              memorialType: defaultItemMem,
                              dharmaName: targetDharma,
                              tobaType: (formData.tobaType as any) || '大塔婆',
                            });
                            setFormData({
                              ...formData,
                              tobaCount: newCount,
                              tobaItems: curItems,
                              tobaSponsors: curItems.map((i) => i.sponsorName),
                            });
                          }}
                          className="w-8 h-9 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded-xs flex items-center justify-center text-[#8C2D19] active:bg-amber-200 cursor-pointer"
                          title="1本増やす"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Toba Type Selector */}
                {(formData.tobaCount || 0) > 0 && (
                  <div>
                    <label className="block text-[11px] font-bold text-gray-700 mb-1">
                      塔婆種別 (全体デフォルト)
                    </label>
                    <div className="flex gap-1.5 flex-wrap">
                      {['大塔婆', '中塔婆', '小塔婆', '年忌塔婆', '施餓鬼塔婆'].map((type) => (
                        <button
                          key={type}
                          type="button"
                          onClick={() => setFormData({ ...formData, tobaType: type })}
                          className={`px-2.5 py-1 rounded-xs text-xs font-bold border transition-colors cursor-pointer ${
                            formData.tobaType === type
                              ? 'bg-[#8C2D19] text-white border-[#8C2D19]'
                              : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          {type}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Toba Items Detailed Configuration */}
                {(formData.tobaCount || 0) > 0 && (
                  <div className="p-3 bg-[#FAF8F5] border border-[#D4AF37] rounded-xs space-y-2.5 shadow-2xs">
                    <div className="flex items-center justify-between">
                      <label className="block font-bold text-[#8C2D19] text-xs flex items-center gap-1">
                        <span>🎋 塔婆明細（志主名・供養精霊／為書き・回忌の設定）:</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          const newCount = (formData.tobaCount || 0) + 1;
                          const curItems = [...(formData.tobaItems || [])];
                          const idx = curItems.length;
                          const subTarget = (formData.additionalDeceased || [])[idx - 1];
                          const targetDharma = subTarget ? (subTarget.dharmaName || '') : (idx === 0 ? (formData.dharmaName || '') : '');
                          const targetDeceasedId = subTarget ? subTarget.id : (idx === 0 ? formData.deceasedId : undefined);
                          const defaultItemMem = resolveSpiritMemorialType(
                            subTarget ? (subTarget.memorialType || formData.memorialType) : formData.memorialType,
                            targetDharma,
                            targetDeceasedId,
                            pastRecords,
                            formData.scheduledDate || todayStr
                          );
                          curItems.push({
                            id: `TOBA-${Date.now()}-${idx}`,
                            sponsorName: '',
                            memorialType: defaultItemMem,
                            dharmaName: targetDharma,
                            tobaType: (formData.tobaType as any) || '大塔婆',
                          });
                          setFormData({
                            ...formData,
                            tobaCount: newCount,
                            tobaItems: curItems,
                            tobaSponsors: curItems.map((i) => i.sponsorName),
                          });
                        }}
                        className="text-[11px] text-[#8C2D19] font-bold hover:underline bg-white border border-[#D4AF37] px-2 py-0.5 rounded-xs flex items-center gap-0.5 cursor-pointer shadow-2xs"
                      >
                        <Plus className="w-3 h-3" />
                        <span>塔婆を1本追加</span>
                      </button>
                    </div>

                    <div className="space-y-2.5 max-h-80 overflow-y-auto pr-0.5">
                      {Array.from({ length: formData.tobaCount || 0 }).map((_, idx) => {
                        const defaultMem = normalizeMemorialType(formData.memorialType || '一周忌');
                        const item = (formData.tobaItems && formData.tobaItems[idx]) || {
                          id: `TOBA-${idx}`,
                          sponsorName: formData.tobaSponsors?.[idx] || (idx === 0 ? formData.chiefMourner || '' : ''),
                          memorialType: defaultMem,
                          dharmaName: idx === 0 ? formData.dharmaName || '' : '',
                          tobaType: formData.tobaType || '大塔婆',
                        };

                        const updateTobaItem = (fields: Partial<ServiceTobaItem>) => {
                          const cur = [...(formData.tobaItems || [])];
                          while (cur.length <= idx) {
                            cur.push({
                              id: `TOBA-${Date.now()}-${cur.length}`,
                              sponsorName: '',
                              memorialType: defaultMem,
                              dharmaName: '',
                              tobaType: (formData.tobaType as any) || '大塔婆',
                            });
                          }
                          cur[idx] = { ...cur[idx], ...fields };
                          setFormData({
                            ...formData,
                            tobaItems: cur,
                            tobaSponsors: cur.map((i) => i.sponsorName),
                          });
                        };

                        const presets: { label: string; value: string; memType?: string }[] = [];
                        if (formData.dharmaName) {
                          const mainMem = normalizeMemorialType(formData.memorialType || '');
                          presets.push({
                            label: `[主] ${formData.dharmaName}${mainMem ? ` (${mainMem})` : ''}`,
                            value: formData.dharmaName,
                            memType: mainMem,
                          });
                        }
                        (formData.additionalDeceased || []).forEach((sub, subI) => {
                          if (sub.dharmaName) {
                            const subMem = normalizeMemorialType(sub.memorialType || formData.memorialType || '');
                            presets.push({
                              label: `[副${subI + 1}] ${sub.dharmaName}${subMem ? ` (${subMem})` : ''}`,
                              value: sub.dharmaName,
                              memType: subMem,
                            });
                          }
                        });
                        const cleanHead = (formData.chiefMourner || '施主').replace(/(家|様)+$/g, '').trim();
                        presets.push({ label: `${cleanHead}家先祖代々`, value: `${cleanHead}家先祖代々` });

                        return (
                          <div key={item.id || idx} className="p-2.5 bg-white border border-[#E5E0D8] rounded-xs space-y-2 text-xs shadow-2xs">
                            <div className="flex items-center justify-between text-[11px] font-bold text-[#1A1A1A]">
                              <span className="flex items-center gap-1.5">
                                <span className="w-5 h-5 rounded-full bg-[#8C2D19] text-white flex items-center justify-center text-[10px]">
                                  {idx + 1}
                                </span>
                                <span>{idx === 0 ? '施主塔婆 (1本目)' : `志主塔婆 (${idx + 1}本目)`}</span>
                              </span>
                              {(formData.tobaCount || 0) > 1 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const cur = (formData.tobaItems || []).filter((_, i) => i !== idx);
                                    const newCount = Math.max(0, (formData.tobaCount || 0) - 1);
                                    setFormData({
                                      ...formData,
                                      tobaCount: newCount,
                                      tobaItems: cur,
                                      tobaSponsors: cur.map((i) => i.sponsorName),
                                    });
                                  }}
                                  className="text-red-500 hover:text-red-700 cursor-pointer text-[10px] flex items-center gap-0.5 font-bold"
                                  title="この塔婆を削除"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  <span>削除</span>
                                </button>
                              )}
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                              <div className="sm:col-span-4">
                                <label className="block text-[10px] font-bold text-gray-600 mb-0.5">志主名（施主・親族等）</label>
                                <input
                                  type="text"
                                  placeholder={idx === 0 ? `施主: ${formData.chiefMourner || ''}` : '志主氏名'}
                                  value={item.sponsorName || ''}
                                  onChange={(e) => updateTobaItem({ sponsorName: e.target.value })}
                                  className="w-full p-1.5 border border-[#D1CEC7] bg-white font-bold text-xs rounded-xs"
                                />
                              </div>
                              <div className="sm:col-span-3">
                                <label className="block text-[10px] font-bold text-gray-600 mb-0.5">回忌・法要</label>
                                <select
                                  value={normalizeMemorialType(item.memorialType || formData.memorialType || '一周忌')}
                                  onChange={(e) => updateTobaItem({ memorialType: e.target.value })}
                                  className="w-full p-1.5 border border-[#D1CEC7] bg-white font-bold text-xs rounded-xs"
                                >
                                  {MEMORIAL_TYPE_OPTIONS.map((type) => (
                                    <option key={type} value={type}>{type}</option>
                                  ))}
                                </select>
                              </div>
                              <div className="sm:col-span-5">
                                <label className="block text-[10px] font-bold text-[#8C2D19] mb-0.5">供養精霊／為書き</label>
                                <input
                                  type="text"
                                  placeholder="例: 徳祥院清心義道居士 または 先祖代々"
                                  value={item.dharmaName || ''}
                                  onChange={(e) => updateTobaItem({ dharmaName: e.target.value })}
                                  className="w-full p-1.5 border border-[#D1CEC7] bg-white font-serif font-bold text-xs text-[#8C2D19] rounded-xs"
                                />
                              </div>
                            </div>

                            {/* Quick preset selector buttons for Dharma name */}
                            {presets.length > 0 && (
                              <div className="flex items-center gap-1 flex-wrap pt-0.5">
                                <span className="text-[10px] text-gray-500 font-medium">候補を反映:</span>
                                {presets.map((p, pI) => (
                                  <button
                                    key={pI}
                                    type="button"
                                    onClick={() => {
                                      updateTobaItem({
                                        dharmaName: p.value,
                                        memorialType: p.memType || item.memorialType || formData.memorialType,
                                      });
                                    }}
                                    className="px-2 py-0.5 bg-amber-50 hover:bg-amber-100 border border-amber-300 text-[10px] text-[#8C2D19] font-bold rounded-2xs cursor-pointer truncate max-w-full"
                                  >
                                    {p.label}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Notes */}
            <div className="p-3.5 bg-white border border-[#D1CEC7] rounded-xs shadow-2xs space-y-1.5">
              <label className="block font-bold text-sm text-[#1A1A1A]">特記事項・予定メモ</label>
              <textarea
                rows={2}
                placeholder="例: お供物事前に到着済み、食事の手配、連絡事項など"
                value={formData.notes || ''}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="w-full p-2.5 border border-[#D1CEC7] bg-white text-sm rounded-xs"
              />
            </div>

            {/* Delete button when editing */}
            {isEditing && onDelete && (
              <div className="pt-2 text-center">
                <button
                  type="button"
                  onClick={() => {
                    if (confirm('本当にこの予定・法事データを削除しますか？')) {
                      onDelete(service.id);
                      onClose();
                    }
                  }}
                  className="text-red-600 hover:text-red-800 text-sm font-bold py-2.5 px-4 border border-red-300 bg-red-50 rounded-xs flex items-center gap-1.5 mx-auto cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>この予定を削除する</span>
                </button>
              </div>
            )}
          </form>
        )}

        {/* Modal Footer / Save */}
        {currentStep === 'step_details' && (
          <div className="p-3 bg-[#EBE7DF] border-t border-[#D1CEC7] flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 bg-white hover:bg-gray-100 border border-[#D1CEC7] rounded-xs font-bold text-sm text-[#333333] cursor-pointer"
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              className="flex-1 py-3 bg-[#8C2D19] hover:bg-[#722413] text-white rounded-xs font-bold text-sm flex items-center justify-center gap-1.5 shadow-md cursor-pointer"
            >
              <Save className="w-5 h-5" />
              <span>{isEditing ? '予定を更新' : '予定を登録'}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
