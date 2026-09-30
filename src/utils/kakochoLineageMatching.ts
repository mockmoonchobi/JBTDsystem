import { Household, PastRecord, TempleProfile } from '../types';
import { normalizeDateInput } from './memorialCalculator';

export interface KakochoItemInput {
  index: number;
  rowIdx: number;
  dharmaName: string;
  secularName: string;
  rawDeathDate: string;
  deathDate: string;
  deathYear?: number;
  deathTimestamp: number;
  ageAtDeath?: number;
  householdHeadName: string; // 当時の施主名
  currentHeadName?: string;  // 現在の施主名 (ファイル列にある場合)
  rawHouseholdId?: string;   // ファイルに記載の檀家ID
  relationship?: string;
  burialLocation?: string;
  niibon?: string;
  notes?: string;
  specialRemarks?: string;
  createdDate?: string;
  createdTime?: string;
  updatedDate?: string;
  updatedTime?: string;
  rawRow: (string | number | undefined)[];
}

export type MatchReasonType = 
  | 'exact_id' 
  | 'exact_current_head'
  | 'exact_sponsor_member'
  | 'remarks_hint_match'
  | 'ancestor_secular_name' 
  | 'same_surname_same_tomb'
  | 'same_surname_same_address' 
  | 'same_surname' 
  | 'partial_name'
  | 'none';

export interface CandidateHouseholdMatch {
  household: Household;
  matchType: MatchReasonType;
  confidenceScore: number; // 0 to 100
  title: string;
  explanation: string;
  matchedName: string;
  ancestorSpiritName?: string; // 照合のヒントとなった先代精霊の俗名
  yearsDifference?: number;
  isVariantMatch?: boolean; // 異字体による一致フラグ（高田/髙田など）
  hintSource?: string; // 備考欄などのヒント出処
}

export interface LinkingDecision {
  action: 'link_existing' | 'create_new_household' | 'skip_unlinked';
  targetHouseholdId?: string;
  targetHouseholdName?: string;
  newHouseholdHeadName?: string;
  confirmedByUser: boolean;
  notes?: string;
}

export interface AnalyzedKakochoItem {
  item: KakochoItemInput;
  candidates: CandidateHouseholdMatch[];
  recommendedMatch?: CandidateHouseholdMatch;
  decision: LinkingDecision;
}

/**
 * Common Japanese Kanji Variant / Old Form Mapping (異体字・旧字体正規化辞書)
 * 例: 髙<->高, 﨑<->崎, 齊/齋/斉<->斉, 邊/邉<->辺, 𠮷<->吉, 嶋<->島, 廣<->広, 澤<->沢, 櫻<->桜, 濱/濵<->浜, etc.
 */
export const KANJI_VARIANT_MAP: Record<string, string> = {
  '髙': '高',
  '﨑': '崎',
  '埼': '崎',
  '齊': '斉',
  '齋': '斉',
  '斎': '斉',
  '斉': '斉',
  '邊': '辺',
  '邉': '辺',
  '𠮷': '吉',
  '嶋': '島',
  '廣': '広',
  '澤': '沢',
  '櫻': '桜',
  '濱': '浜',
  '濵': '浜',
  '黑': '黒',
  '惠': '恵',
  '塚': '塚',
  '德': '徳',
  '栁': '柳',
  '柳': '柳',
  '國': '国',
  '鹽': '塩',
  '龜': '亀',
  '條': '条',
  '眞': '真',
  '壽': '寿',
  '龍': '竜',
  '彌': '弥',
  '藏': '蔵',
  '榮': '栄',
  '峯': '峰',
  '槇': '槙',
  '藪': '薮',
  '莊': '庄',
  '舘': '館',
  '萩': '萩',
  '瀨': '瀬',
  '禮': '礼',
  '神': '神',
  '福': '福',
  '祥': '祥',
  '靖': '靖',
  '飯': '飯',
  '館': '館',
  '僧': '僧',
  '勉': '勉',
  '勤': '勤',
  '器': '器',
  '墨': '墨',
  '梅': '梅',
  '海': '海',
  '渚': '渚',
  '漢': '漢',
  '琢': '琢',
  '碑': '碑',
  '社': '社',
  '祉': '祉',
  '祈': '祈',
  '祐': '祐',
  '祖': '祖',
  '祝': '祝',
  '禍': '禍',
  '禎': '禎',
  '節': '節',
  '練': '練',
  '繁': '繁',
  '署': '署',
  '者': '者',
  '著': '著',
  '視': '視',
  '謹': '謹',
  '賓': '賓',
  '贈': '贈',
  '逸': '逸',
  '難': '難',
  '響': '響',
  '頻': '頻',
  '恵': '類',
};

/**
 * Normalizes Kanji variants to standard form for robust matching
 */
export function normalizeKanjiVariants(val?: string): string {
  if (!val) return '';
  return String(val)
    .split('')
    .map((ch) => KANJI_VARIANT_MAP[ch] || ch)
    .join('');
}

/**
 * Normalizes name for matching (strips spaces, honorifics like '様', '殿', '家', '当家')
 */
export function normalizeNameForMatching(val?: string): string {
  if (!val) return '';
  return String(val)
    .replace(/[\s　]/g, '')
    .replace(/(様|殿|当家|家|方)$/, '')
    .trim();
}

/**
 * Compares two names taking Kanji variants into account.
 * exact: true (100% same characters)
 * variantMatch: true (Same when variants like 高田/髙田 are normalized)
 */
export function compareNamesWithVariants(
  nameA?: string,
  nameB?: string
): { matched: boolean; isExact: boolean; isVariant: boolean } {
  if (!nameA || !nameB) return { matched: false, isExact: false, isVariant: false };
  const cleanA = normalizeNameForMatching(nameA);
  const cleanB = normalizeNameForMatching(nameB);
  if (!cleanA || !cleanB) return { matched: false, isExact: false, isVariant: false };

  if (cleanA === cleanB) {
    return { matched: true, isExact: true, isVariant: false };
  }

  const varA = normalizeKanjiVariants(cleanA);
  const varB = normalizeKanjiVariants(cleanB);
  if (varA === varB) {
    return { matched: true, isExact: false, isVariant: true };
  }

  return { matched: false, isExact: false, isVariant: false };
}

/**
 * Fast comparison when both clean and variant-normalized strings are already known.
 */
export function compareNormalizedNames(
  cleanA: string,
  varA: string,
  cleanB: string,
  varB: string
): { matched: boolean; isExact: boolean; isVariant: boolean } {
  if (!cleanA || !cleanB) return { matched: false, isExact: false, isVariant: false };
  if (cleanA === cleanB) {
    return { matched: true, isExact: true, isVariant: false };
  }
  if (varA === varB) {
    return { matched: true, isExact: false, isVariant: true };
  }
  return { matched: false, isExact: false, isVariant: false };
}

/**
 * Extracts surname from a full name (e.g. "山田 太郎" -> "山田", "萩原宏一" -> "萩原")
 */
export function extractSurname(fullName: string): string {
  const clean = String(fullName || '').trim();
  if (!clean) return '';
  
  // If space separated
  const spaceParts = clean.split(/[\s　]+/);
  if (spaceParts.length >= 2 && spaceParts[0].length >= 1 && spaceParts[0].length <= 4) {
    return spaceParts[0];
  }

  // Common Japanese surname length heuristic
  const normalized = normalizeNameForMatching(clean);
  if (normalized.length <= 2) return normalized;
  if (normalized.length === 3) return normalized.slice(0, 2); // e.g. "山田花" -> "山田"
  if (normalized.length >= 4) return normalized.slice(0, 2); // e.g. "萩原宏一" -> "萩原"
  return normalized.slice(0, 2);
}

/**
 * Extracts given name from a full name (e.g. "山田 太郎" -> "太郎", "萩原宏一" -> "宏一")
 */
export function extractGivenName(fullName: string): string {
  const clean = String(fullName || '').trim();
  if (!clean) return '';
  const spaceParts = clean.split(/[\s　]+/);
  if (spaceParts.length >= 2) {
    return spaceParts.slice(1).join('').trim();
  }
  const normalized = normalizeNameForMatching(clean);
  if (normalized.length <= 2) return '';
  if (normalized.length === 3) return normalized.slice(2); // e.g. "山田花" -> "花"
  if (normalized.length >= 4) return normalized.slice(2); // e.g. "萩原宏一" -> "宏一"
  return '';
}

/**
 * Extracts related person names and hints from free-form text or remarks.
 * Examples:
 *  "光紀妻" -> ["光紀", "萩原光紀" (if baseSurname is "萩原")]
 *  "施主: 萩原宏一" -> ["萩原宏一"]
 *  "先代太郎妻" -> ["太郎", "先代太郎"]
 *  "長男 健一" -> ["健一"]
 */
export function extractPersonHintsFromRemarks(text?: string, baseSurname?: string): string[] {
  if (!text) return [];
  const str = String(text).trim();
  if (!str) return [];

  const found = new Set<string>();

  // Patterns for relative suffix: e.g. "光紀妻", "太郎の妻", "一郎夫", "勝也長男", "宏一次男", "花子長女", "義雄父", "富子母", "正男親", "武志の子"
  const suffixPattern = /([^\s、,。・:：()（）\r\n]{1,6})(?:の)?(?:妻|夫|長男|次男|三男|長女|次女|三女|父|母|親|子|長男嫁|次男嫁|弟|兄|姉|妹|養子|後妻|先妻|義父|義母|夫君|令夫人)/g;
  let match: RegExpExecArray | null;
  while ((match = suffixPattern.exec(str)) !== null) {
    const rawName = match[1].replace(/^(先代|当主|施主|喪主)/, '').trim();
    if (rawName && rawName.length >= 1 && rawName.length <= 6) {
      found.add(rawName);
      if (baseSurname && rawName.length <= 3 && !rawName.startsWith(baseSurname)) {
        found.add(baseSurname + rawName);
      }
    }
  }

  // Patterns for explicit prefix: e.g. "施主: 萩原宏一", "喪主: 山田太郎", "旧姓: 佐藤", "先代: 田中一郎", "連絡先: 鈴木"
  const prefixPattern = /(?:施主|喪主|先代|旧名|旧姓|当主|連絡先|名義人|申請者)[:：\s]+([^\s、,。・()（）\r\n]{1,8})/g;
  while ((match = prefixPattern.exec(str)) !== null) {
    const rawName = match[1].trim();
    if (rawName && rawName.length >= 1 && rawName.length <= 8) {
      found.add(rawName);
      if (baseSurname && rawName.length <= 3 && !rawName.startsWith(baseSurname)) {
        found.add(baseSurname + rawName);
      }
    }
  }

  return Array.from(found);
}

/**
 * Parses any date format (Japanese era, Western YYYY/MM/DD, etc.) into timestamp and numeric year.
 */
export function parseDeathDateToTimestampAndYear(rawDate: string): {
  normalizedDate: string;
  timestamp: number;
  year?: number;
} {
  if (!rawDate) {
    return { normalizedDate: '', timestamp: 0 };
  }

  const normalized = normalizeDateInput(rawDate);
  if (!normalized) {
    return { normalizedDate: '', timestamp: 0 };
  }

  // Extract year from normalized date (which is usually YYYY-MM-DD or YYYY/MM/DD)
  const match = normalized.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (match) {
    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    const day = parseInt(match[3], 10);
    const timestamp = year * 10000 + month * 100 + day; // e.g. 20230815 for exact sorting
    return { normalizedDate: normalized, timestamp, year };
  }

  const yearOnlyMatch = normalized.match(/^(\d{4})/);
  if (yearOnlyMatch) {
    const year = parseInt(yearOnlyMatch[1], 10);
    return { normalizedDate: normalized, timestamp: year * 10000, year };
  }

  return { normalizedDate: normalized, timestamp: 0 };
}

/**
 * Sorts past record items by death date in descending order (latest deaths first, oldest last, unknown at end).
 */
export function sortKakochoItemsDescending<T extends { deathTimestamp: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    // Non-zero timestamps first, descending
    if (a.deathTimestamp > 0 && b.deathTimestamp > 0) {
      return b.deathTimestamp - a.deathTimestamp;
    }
    if (a.deathTimestamp > 0 && b.deathTimestamp <= 0) return -1;
    if (a.deathTimestamp <= 0 && b.deathTimestamp > 0) return 1;
    return 0;
  });
}

export interface LineageSponsorInfo {
  name: string;
  relationship?: string;
  isChiefMourner?: boolean;
  source: 'familyHead' | 'familyMember' | 'notes' | 'confirmed_spirit_sponsor';
  cleanName?: string;
  varName?: string;
  associatedDharmaName?: string;
}

export interface LineageHouseholdState {
  household: Household;
  knownLineageNames: Set<string>; // 施主名、歴代先代精霊の俗名、家族名
  sponsors: LineageSponsorInfo[];
  notesHints: string[]; // 名簿備考欄から抽出された人名
  notesHintsNormalized?: { name: string; cleanName: string; varName: string }[];
  confirmedSurnames?: Set<string>; // 確定された精霊・施主の名字（異体字正規化後）
  linkedSpirits: {
    dharmaName: string;
    secularName: string;
    deathDate: string;
    deathYear?: number;
    householdHeadName: string;
    cleanSecular?: string;
    varSecular?: string;
  }[];
  cleanHead?: string;
  varHead?: string;
  householdSurname?: string;
  normHouseholdSurname?: string;
}

/**
 * Builds initial lineage lookup state from existing households and existing past records.
 */
export function buildInitialLineageMap(
  existingHouseholds: Household[],
  existingPastRecords: PastRecord[],
  targetTempleId: string
): Map<string, LineageHouseholdState> {
  const map = new Map<string, LineageHouseholdState>();

  existingHouseholds.forEach((h) => {
    const cleanHead = normalizeNameForMatching(h.familyHead);
    const varHead = normalizeKanjiVariants(cleanHead);
    const hSurname = extractSurname(h.familyHead);
    const normHouseholdSurname = normalizeKanjiVariants(hSurname);

    const knownSet = new Set<string>();
    if (cleanHead) knownSet.add(cleanHead);

    const sponsors: LineageSponsorInfo[] = [];
    if (h.familyHead) {
      sponsors.push({
        name: h.familyHead,
        isChiefMourner: true,
        source: 'familyHead',
        cleanName: cleanHead,
        varName: varHead,
      });
    }

    // 1. Extract family members & sponsors
    if (Array.isArray(h.familyMembers)) {
      h.familyMembers.forEach((m) => {
        if (!m.name) return;
        const cleanMem = normalizeNameForMatching(m.name);
        const varMem = normalizeKanjiVariants(cleanMem);
        if (cleanMem) {
          knownSet.add(cleanMem);
          sponsors.push({
            name: m.name,
            relationship: m.relationship,
            isChiefMourner: !!(m.isChiefMourner || m.isSponsor),
            source: 'familyMember',
            cleanName: cleanMem,
            varName: varMem,
          });
        }
      });
    }

    // 2. Extract hints from household notes
    const notesHints = extractPersonHintsFromRemarks(h.notes, hSurname);
    const notesHintsNormalized: { name: string; cleanName: string; varName: string }[] = [];
    notesHints.forEach((nh) => {
      const cleanNh = normalizeNameForMatching(nh);
      const varNh = normalizeKanjiVariants(cleanNh);
      if (cleanNh) {
        knownSet.add(cleanNh);
        sponsors.push({
          name: nh,
          source: 'notes',
          cleanName: cleanNh,
          varName: varNh,
        });
        notesHintsNormalized.push({
          name: nh,
          cleanName: cleanNh,
          varName: varNh,
        });
      }
    });

    map.set(h.id, {
      household: h,
      knownLineageNames: knownSet,
      sponsors,
      notesHints,
      notesHintsNormalized,
      linkedSpirits: [],
      cleanHead,
      varHead,
      householdSurname: hSurname,
      normHouseholdSurname,
    });
  });

  // Populate known secular names from already registered past records
  existingPastRecords.forEach((pr) => {
    if (!pr.householdId) return;
    const state = map.get(pr.householdId);
    if (!state) return;

    const cleanSecular = normalizeNameForMatching(pr.secularName);
    const varSecular = normalizeKanjiVariants(cleanSecular);
    if (cleanSecular) {
      state.knownLineageNames.add(cleanSecular);
    }

    const { year } = parseDeathDateToTimestampAndYear(pr.deathDate || '');
    state.linkedSpirits.push({
      dharmaName: pr.dharmaName || '',
      secularName: pr.secularName || '',
      deathDate: pr.deathDate || '',
      deathYear: year,
      householdHeadName: pr.householdHeadName || '',
      cleanSecular,
      varSecular,
    });
  });

  return map;
}

/**
 * Pre-computes surname frequencies for the target temple to efficiently detect unique surname households.
 */
export function buildTempleSurnameCounts(
  lineageMap: Map<string, LineageHouseholdState>,
  targetTempleId: string
): Map<string, number> {
  const templeSurnameCounts = new Map<string, number>();
  for (const [, state] of lineageMap.entries()) {
    const h = state.household;
    if ((h.templeId || 'temple-main') === targetTempleId) {
      const s = normalizeKanjiVariants(extractSurname(h.familyHead));
      if (s && s.length >= 2) {
        templeSurnameCounts.set(s, (templeSurnameCounts.get(s) || 0) + 1);
      }
    }
  }
  return templeSurnameCounts;
}

/**
 * Pre-computes full name frequencies for the target temple to detect identical-name households (同姓同名の檀家).
 */
export function buildTempleFullNameCounts(
  lineageMap: Map<string, LineageHouseholdState>,
  targetTempleId: string
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const [, state] of lineageMap.entries()) {
    const h = state.household;
    if (!targetTempleId || (h.templeId || 'temple-main') === targetTempleId) {
      const cleanHead = state.cleanHead || normalizeNameForMatching(h.familyHead);
      const varHead = state.varHead || normalizeKanjiVariants(cleanHead);
      if (varHead && varHead.length >= 2) {
        counts.set(varHead, (counts.get(varHead) || 0) + 1);
      }
    }
  }
  return counts;
}

// Helper to convert katakana to hiragana and strip whitespace for Japanese alphabetical sorting (五十音順)
export function toHiraganaKey(str: string): string {
  if (!str) return '';
  return str
    .replace(/[\u30a1-\u30f6]/g, (m) => String.fromCharCode(m.charCodeAt(0) - 0x60))
    .replace(/[\s　]/g, '');
}

/**
 * Analyzes a single past record item against the current household lineage state.
 * Finds candidate households, ranks them, and identifies the best recommended match.
 */
export function evaluateItemMatch(
  item: KakochoItemInput,
  lineageMap: Map<string, LineageHouseholdState>,
  targetTempleId: string,
  maxYearsBack = 80,
  cachedTempleSurnameCounts?: Map<string, number>,
  cachedTempleFullNameCounts?: Map<string, number>
): CandidateHouseholdMatch[] {
  const bestCandidateByHousehold = new Map<string, CandidateHouseholdMatch>();

  const addCandidate = (cand: CandidateHouseholdMatch) => {
    const existing = bestCandidateByHousehold.get(cand.household.id);
    if (!existing || cand.confidenceScore > existing.confidenceScore) {
      bestCandidateByHousehold.set(cand.household.id, cand);
    }
  };

  const rawHeadName = item.householdHeadName || '';
  const currentHeadName = item.currentHeadName || '';
  const secularName = item.secularName || '';
  const rawId = item.rawHouseholdId ? String(item.rawHouseholdId).trim() : '';

  const itemDeathYear = item.deathYear;
  const currentYear = new Date().getFullYear();

  // Extract hints from past record notes/remarks
  const itemSponsorName = rawHeadName || currentHeadName;
  const sponsorSurname = extractSurname(itemSponsorName);
  const normSponsorSurname = normalizeKanjiVariants(sponsorSurname);

  const secularSurname = extractSurname(secularName);
  const normSecularSurname = normalizeKanjiVariants(secularSurname);

  // General item surname (prefer sponsor, fallback secular) for notes extraction and unique count
  const itemSurname = sponsorSurname || secularSurname;
  const normItemSurname = normalizeKanjiVariants(itemSurname);
  const combinedItemNotes = `${item.notes || ''} ${item.specialRemarks || ''}`.trim();
  const itemRemarksHints = extractPersonHintsFromRemarks(combinedItemNotes, itemSurname);

  // Sponsor name extraction for partial match in household notes
  const sponsorFullName = currentHeadName || rawHeadName;
  const sponsorGivenName = extractGivenName(sponsorFullName);
  const cleanSponsorSurname = normalizeNameForMatching(sponsorSurname);
  const varSponsorSurname = normalizeKanjiVariants(cleanSponsorSurname);
  const cleanSponsorGivenName = normalizeNameForMatching(sponsorGivenName);
  const varSponsorGivenName = normalizeKanjiVariants(cleanSponsorGivenName);

  // Pre-normalize names for item once to avoid repeating regex and variant mappings in inner loops
  const cleanCurrentHead = normalizeNameForMatching(currentHeadName);
  const varCurrentHead = normalizeKanjiVariants(cleanCurrentHead);
  const cleanRawHead = normalizeNameForMatching(rawHeadName);
  const varRawHead = normalizeKanjiVariants(cleanRawHead);
  const searchHeadName = rawHeadName || currentHeadName;
  const cleanSearchHead = normalizeNameForMatching(searchHeadName);
  const varSearchHead = normalizeKanjiVariants(cleanSearchHead);
  const cleanSecular = normalizeNameForMatching(secularName);
  const varSecular = normalizeKanjiVariants(cleanSecular);
  const normalizedItemHints = itemRemarksHints.map((hint) => {
    const cleanHint = normalizeNameForMatching(hint);
    return {
      hint,
      cleanHint,
      varHint: normalizeKanjiVariants(cleanHint),
    };
  });

  // Surname count and full name count maps for the target temple
  const templeSurnameCounts = cachedTempleSurnameCounts || buildTempleSurnameCounts(lineageMap, targetTempleId);
  const templeFullNameCounts = cachedTempleFullNameCounts || buildTempleFullNameCounts(lineageMap, targetTempleId);
  const isUniqueSurnameInTemple = normItemSurname.length >= 2 && (templeSurnameCounts.get(normItemSurname) || 0) === 1;

  // 1. Check direct ID match
  if (rawId) {
    for (const [, state] of lineageMap.entries()) {
      const h = state.household;
      const isSameTemple = (h.templeId || 'temple-main') === targetTempleId;
      if (h.id === rawId || h.id.replace(/[^0-9]/g, '') === rawId.replace(/[^0-9]/g, '')) {
        addCandidate({
          household: h,
          matchType: 'exact_id',
          confidenceScore: isSameTemple ? 100 : 95,
          title: '檀家ID一致',
          explanation: `ファイル記載の檀家ID「${rawId}」と名簿の檀家IDが一致しました。`,
          matchedName: h.familyHead,
        });
      }
    }
  }

  // 2. Iterate through all households in lineage map
  for (const [, state] of lineageMap.entries()) {
    const h = state.household;
    const isSameTemple = (h.templeId || 'temple-main') === targetTempleId;
    const templeMultiplier = isSameTemple ? 1.0 : 0.85;
    const hSurname = state.householdSurname || extractSurname(h.familyHead);
    const normHSurname = state.normHouseholdSurname || normalizeKanjiVariants(hSurname);
    const cleanHHead = state.cleanHead || normalizeNameForMatching(h.familyHead);
    const varHHead = state.varHead || normalizeKanjiVariants(cleanHHead);

    // A. Match current施主名 / 世帯主名 (currentHeadName)
    if (currentHeadName) {
      // (1) Check against household familyHead
      const matchRes = compareNormalizedNames(cleanCurrentHead, varCurrentHead, cleanHHead, varHHead);
      if (matchRes.matched) {
        const baseScore = matchRes.isExact ? 98 : 97;
        addCandidate({
          household: h,
          matchType: 'exact_current_head',
          confidenceScore: Math.round(baseScore * templeMultiplier),
          title: matchRes.isVariant ? '現施主・世帯主名一致（異体字）' : '現施主・世帯主名と完全一致',
          explanation: matchRes.isVariant
            ? `ファイル記載の現施主・世帯主名「${currentHeadName}」と名簿の世帯主名「${h.familyHead}」が異体字（${currentHeadName}／${h.familyHead}）を含めて一致しました。`
            : `ファイル記載の現施主・世帯主名「${currentHeadName}」と名簿の世帯主名「${h.familyHead}」が完全一致しました。`,
          matchedName: h.familyHead,
          isVariantMatch: matchRes.isVariant,
        });
        continue;
      }

      // (2) Check against household registered sponsors / chief mourners in family
      let matchedSponsor: LineageSponsorInfo | undefined;
      let sponsorIsVariant = false;
      for (const sp of state.sponsors) {
        const spClean = sp.cleanName || normalizeNameForMatching(sp.name);
        const spVar = sp.varName || normalizeKanjiVariants(spClean);
        const spComp = compareNormalizedNames(cleanCurrentHead, varCurrentHead, spClean, spVar);
        if (spComp.matched) {
          matchedSponsor = sp;
          sponsorIsVariant = spComp.isVariant;
          break;
        }
      }

      if (matchedSponsor) {
        const isConfirmedSpiritSponsor = matchedSponsor.source === 'confirmed_spirit_sponsor';
        const isChief = matchedSponsor.isChiefMourner;
        const baseScore = isConfirmedSpiritSponsor
          ? (sponsorIsVariant ? 95 : 96)
          : isChief
          ? (sponsorIsVariant ? 96 : 97)
          : (sponsorIsVariant ? 90 : 91);

        addCandidate({
          household: h,
          matchType: 'exact_sponsor_member',
          confidenceScore: Math.round(baseScore * templeMultiplier),
          title: isConfirmedSpiritSponsor
            ? (sponsorIsVariant ? '確定精霊の施主名と一致（異体字・家系連動）' : '確定精霊の施主名と一致（家系連動・96%）')
            : isChief
            ? (sponsorIsVariant ? '現施主名と名簿の指定施主名が一致（異体字）' : '現施主名と名簿の指定施主名が一致')
            : (sponsorIsVariant ? '現施主名と名簿の家族名が一致（異体字）' : '現施主名と名簿の家族名が一致'),
          explanation: isConfirmedSpiritSponsor
            ? `ファイル記載の現施主名「${currentHeadName}」様が、この檀家に先に確定された精霊（${matchedSponsor.associatedDharmaName || '過去帳'}）の施主名「${matchedSponsor.name}」様と${sponsorIsVariant ? '異体字を含めて' : ''}一致しました（家系連動・芋づる式照合）。`
            : `ファイル記載の現施主名「${currentHeadName}」様が、名簿の家族情報「${matchedSponsor.name}」様${matchedSponsor.relationship ? `（${matchedSponsor.relationship}）` : ''}${isChief ? '【施主】' : ''}と${sponsorIsVariant ? '異体字を含めて' : ''}一致しました。`,
          matchedName: matchedSponsor.name,
          isVariantMatch: sponsorIsVariant,
        });
        continue;
      }
    }

    // B. Match 当時の施主名・世帯主名 (householdHeadName)
    if (rawHeadName) {
      // (1) Check against household familyHead
      const matchRes = compareNormalizedNames(cleanRawHead, varRawHead, cleanHHead, varHHead);
      if (matchRes.matched) {
        const yearsAgo = itemDeathYear ? currentYear - itemDeathYear : 0;
        const isRecent = !itemDeathYear || yearsAgo <= 35;
        const baseScore = isRecent ? (matchRes.isExact ? 95 : 94) : Math.max(70, (matchRes.isExact ? 95 : 94) - Math.floor(yearsAgo / 4));

        addCandidate({
          household: h,
          matchType: 'exact_current_head',
          confidenceScore: Math.round(baseScore * templeMultiplier),
          title: matchRes.isVariant
            ? (isRecent ? '施主・世帯主名一致（異体字・直近没年）' : '施主・世帯主名一致（異体字）')
            : (isRecent ? '施主・世帯主名一致（直近没年）' : '施主・世帯主名一致'),
          explanation: matchRes.isVariant
            ? `当時の施主・世帯主名「${rawHeadName}」様と名簿の世帯主名「${h.familyHead}」様が異体字（${rawHeadName}／${h.familyHead}）を含めて一致しました。`
            : (isRecent
              ? `当時の施主・世帯主名「${rawHeadName}」様と名簿の世帯主名「${h.familyHead}」様が完全一致しました（直近の没年）。`
              : `当時の施主・世帯主名「${rawHeadName}」様と名簿の世帯主名「${h.familyHead}」様が一致しました（没後約${yearsAgo}年）。`),
          matchedName: h.familyHead,
          yearsDifference: yearsAgo,
          isVariantMatch: matchRes.isVariant,
        });
        continue;
      }

      // (2) Check against household registered sponsors / chief mourners / family members
      let matchedSponsor: LineageSponsorInfo | undefined;
      let sponsorIsVariant = false;
      for (const sp of state.sponsors) {
        const spClean = sp.cleanName || normalizeNameForMatching(sp.name);
        const spVar = sp.varName || normalizeKanjiVariants(spClean);
        const spComp = compareNormalizedNames(cleanRawHead, varRawHead, spClean, spVar);
        if (spComp.matched) {
          matchedSponsor = sp;
          sponsorIsVariant = spComp.isVariant;
          break;
        }
      }

      if (matchedSponsor) {
        const isConfirmedSpiritSponsor = matchedSponsor.source === 'confirmed_spirit_sponsor';
        const isChief = matchedSponsor.isChiefMourner;
        const baseScore = isConfirmedSpiritSponsor
          ? (sponsorIsVariant ? 94 : 95)
          : isChief
          ? (sponsorIsVariant ? 94 : 95)
          : (sponsorIsVariant ? 88 : 89);

        addCandidate({
          household: h,
          matchType: 'exact_sponsor_member',
          confidenceScore: Math.round(baseScore * templeMultiplier),
          title: isConfirmedSpiritSponsor
            ? (sponsorIsVariant ? '確定精霊の施主名と一致（異体字・家系連動）' : '確定精霊の施主名と一致（家系連動・95%）')
            : isChief
            ? (sponsorIsVariant ? '当時の施主名と名簿の指定施主名が一致（異体字）' : '当時の施主名と名簿の指定施主名が一致')
            : (sponsorIsVariant ? '当時の施主名と名簿の家族名が一致（異体字）' : '当時の施主名と名簿の家族名が一致'),
          explanation: isConfirmedSpiritSponsor
            ? `当時の施主名「${rawHeadName}」様が、この檀家に先に確定された精霊（${matchedSponsor.associatedDharmaName || '過去帳'}）の施主名「${matchedSponsor.name}」様と${sponsorIsVariant ? '異体字を含めて' : ''}一致しました（家系連動・芋づる式照合）。`
            : `当時の施主名「${rawHeadName}」様が、名簿の家族・施主情報「${matchedSponsor.name}」様${matchedSponsor.relationship ? `（${matchedSponsor.relationship}）` : ''}${isChief ? '【施主】' : ''}と${sponsorIsVariant ? '異体字を含めて' : ''}一致しました。`,
          matchedName: matchedSponsor.name,
          isVariantMatch: sponsorIsVariant,
        });
        continue;
      }
    }

    // C. Past Record Remarks Hints Matching (過去帳備考欄から抽出した関係者名ヒントの照合)
    if (normalizedItemHints.length > 0) {
      let matchedHintName: string | undefined;
      let matchedTargetName: string | undefined;
      let isHintVariant = false;
      let hintMatchType: 'head' | 'sponsor' | 'ancestor' = 'head';

      for (const hintObj of normalizedItemHints) {
        // (1) Check against household familyHead
        const headComp = compareNormalizedNames(hintObj.cleanHint, hintObj.varHint, cleanHHead, varHHead);
        if (headComp.matched) {
          matchedHintName = hintObj.hint;
          matchedTargetName = h.familyHead;
          isHintVariant = headComp.isVariant;
          hintMatchType = 'head';
          break;
        }

        // (2) Check against sponsors / family members
        for (const sp of state.sponsors) {
          const spClean = sp.cleanName || normalizeNameForMatching(sp.name);
          const spVar = sp.varName || normalizeKanjiVariants(spClean);
          const spComp = compareNormalizedNames(hintObj.cleanHint, hintObj.varHint, spClean, spVar);
          if (spComp.matched) {
            matchedHintName = hintObj.hint;
            matchedTargetName = sp.name;
            isHintVariant = spComp.isVariant;
            hintMatchType = 'sponsor';
            break;
          }
        }
        if (matchedHintName) break;

        // (3) Check against linked ancestor spirits' secular names
        for (const spirit of state.linkedSpirits) {
          const spSecularClean = spirit.cleanSecular || normalizeNameForMatching(spirit.secularName);
          const spSecularVar = spirit.varSecular || normalizeKanjiVariants(spSecularClean);
          const ancComp = compareNormalizedNames(hintObj.cleanHint, hintObj.varHint, spSecularClean, spSecularVar);
          if (ancComp.matched) {
            matchedHintName = hintObj.hint;
            matchedTargetName = `${spirit.secularName}（先代精霊: ${spirit.dharmaName || '俗名'}）`;
            isHintVariant = ancComp.isVariant;
            hintMatchType = 'ancestor';
            break;
          }
        }
        if (matchedHintName) break;
      }

      if (matchedHintName && matchedTargetName) {
        const baseScore = hintMatchType === 'head' 
          ? (isHintVariant ? 92 : 93)
          : hintMatchType === 'sponsor' 
            ? (isHintVariant ? 90 : 91)
            : (isHintVariant ? 89 : 90);

        addCandidate({
          household: h,
          matchType: 'remarks_hint_match',
          confidenceScore: Math.round(baseScore * templeMultiplier),
          title: isHintVariant
            ? '過去帳備考欄の関係者名と名簿情報が一致（異体字）'
            : '過去帳備考欄の関係者名と名簿情報が一致',
          explanation: `過去帳の備考「${combinedItemNotes}」から抽出された関係者「${matchedHintName}」様が、名簿の${hintMatchType === 'head' ? '世帯主名' : hintMatchType === 'sponsor' ? '施主・家族情報' : '先代精霊'}「${matchedTargetName}」と${isHintVariant ? '異体字を含めて' : ''}合致しました。`,
          matchedName: matchedTargetName,
          hintSource: combinedItemNotes,
          isVariantMatch: isHintVariant,
        });
        continue;
      }
    }

    // D. Lineage / Ancestor Secular Name Match (家系・先代精霊の俗名照合)
    if (searchHeadName) {
      let matchedAncestor: (typeof state.linkedSpirits)[0] | undefined;
      let matchedIsVariant = false;

      for (const spirit of state.linkedSpirits) {
        const spSecularClean = spirit.cleanSecular || normalizeNameForMatching(spirit.secularName);
        const spSecularVar = spirit.varSecular || normalizeKanjiVariants(spSecularClean);
        const comp = compareNormalizedNames(spSecularClean, spSecularVar, cleanSearchHead, varSearchHead);
        if (comp.matched) {
          if (itemDeathYear && spirit.deathYear) {
            const diff = Math.abs(spirit.deathYear - itemDeathYear);
            if (diff <= maxYearsBack) {
              matchedAncestor = spirit;
              matchedIsVariant = comp.isVariant;
              break;
            }
          } else {
            matchedAncestor = spirit;
            matchedIsVariant = comp.isVariant;
            break;
          }
        }
      }

      if (matchedAncestor) {
        const yearsDiff = itemDeathYear && matchedAncestor.deathYear
          ? Math.abs(matchedAncestor.deathYear - itemDeathYear)
          : undefined;
        const baseScore = matchedIsVariant ? 89 : 90;

        addCandidate({
          household: h,
          matchType: 'ancestor_secular_name',
          confidenceScore: Math.round(baseScore * templeMultiplier),
          title: matchedIsVariant
            ? '先代精霊の俗名と施主名が一致（異体字・家系遡り照合）'
            : '先代精霊の俗名と施主名が一致（家系遡り照合）',
          explanation: `記載の施主・世帯主名「${searchHeadName}」様が、この檀家の先代精霊「${matchedAncestor.dharmaName || matchedAncestor.secularName}」様（俗名: ${matchedAncestor.secularName}）と${matchedIsVariant ? '異体字を含めて' : ''}一致しました（没後${yearsDiff !== undefined ? `${yearsDiff}年` : '80年以内'}の家系照合）。`,
          matchedName: matchedAncestor.secularName,
          ancestorSpiritName: matchedAncestor.secularName,
          yearsDifference: yearsDiff,
          isVariantMatch: matchedIsVariant,
        });
        continue;
      }
    }

    // E. Tomb location & Surname match (異体字名字も考慮)
    const surnameComp = compareNormalizedNames(itemSurname, normItemSurname, hSurname, normHSurname);
    if (item.burialLocation && h.tombNumber && item.burialLocation === h.tombNumber && surnameComp.matched) {
      addCandidate({
        household: h,
        matchType: 'same_surname_same_tomb',
        confidenceScore: Math.round((surnameComp.isExact ? 75 : 74) * templeMultiplier),
        title: surnameComp.isVariant ? '同姓（異体字）・墓地位置一致' : '同姓・墓地位置一致',
        explanation: `同姓「${hSurname}」${surnameComp.isVariant ? '（異体字含む）' : ''}かつ墓地番号「${h.tombNumber}」が一致しました。`,
        matchedName: h.familyHead,
        isVariantMatch: surnameComp.isVariant,
      });
      continue;
    }

    // F. Same Surname match (同姓候補 - 施主の姓、俗名の姓、確定精霊の名字を考慮)
    const isConfirmedSurnameMatch = Boolean(state.confirmedSurnames && normItemSurname && state.confirmedSurnames.has(normItemSurname));

    // 1) 過去帳の施主の姓と名簿の世帯主姓の照合
    const sponsorSurnameComp = sponsorSurname && sponsorSurname.length >= 2
      ? compareNormalizedNames(sponsorSurname, normSponsorSurname, hSurname, normHSurname)
      : { matched: false, isExact: false, isVariant: false };

    // 2) 過去帳の俗名の姓と名簿の世帯主姓の照合（ユーザー要望: 45%重視）
    const secularSurnameComp = secularSurname && secularSurname.length >= 2
      ? compareNormalizedNames(secularSurname, normSecularSurname, hSurname, normHSurname)
      : { matched: false, isExact: false, isVariant: false };

    const isSameSurnameMatched = sponsorSurnameComp.matched || secularSurnameComp.matched || isConfirmedSurnameMatch;

    if (isSameSurnameMatched) {
      // Check if address partially matches
      const hAddrClean = (h.address || '').replace(/[\s　]/g, '');
      const notesClean = (item.notes || '').replace(/[\s　]/g, '');
      const addrMatch = notesClean && hAddrClean && (notesClean.includes(hAddrClean) || hAddrClean.includes(notesClean));

      let baseScore: number;
      let matchTitle: string;
      let matchExplanation: string;

      if (isConfirmedSurnameMatch && !sponsorSurnameComp.matched && !secularSurnameComp.matched) {
        // 先にこの檀家に確定された精霊・施主の名字と一致（家系連動・同姓と同じ45%）
        baseScore = 45;
        matchTitle = '確定精霊・施主と同姓（家系連動・45%）';
        matchExplanation = `この檀家に先に確定された精霊・施主の名字「${itemSurname}」と同姓です（家系連動）。`;
      } else if (isUniqueSurnameInTemple && isSameTemple) {
        baseScore = (sponsorSurnameComp.isExact || secularSurnameComp.isExact) ? 75 : 74;
        matchTitle = (sponsorSurnameComp.isVariant || secularSurnameComp.isVariant)
          ? '同姓檀家候補（名簿内唯一の同姓・75%・異体字）'
          : '同姓檀家候補（名簿内唯一の同姓・75%）';
        matchExplanation = `同姓「${hSurname}」様${(sponsorSurnameComp.isVariant || secularSurnameComp.isVariant) ? '（異体字）' : ''}の檀家が寺院名簿内に1件のみ存在するため、適合度75%として判定しました。`;
      } else if (addrMatch) {
        baseScore = (sponsorSurnameComp.isExact || secularSurnameComp.isExact) ? 65 : 64;
        matchTitle = (sponsorSurnameComp.isVariant || secularSurnameComp.isVariant) ? '同姓（異体字）・住所類似候補' : '同姓・住所類似候補';
        matchExplanation = `同姓「${hSurname}」様${(sponsorSurnameComp.isVariant || secularSurnameComp.isVariant) ? '（異体字）' : ''}かつ住所情報に関連が見られます。`;
      } else {
        baseScore = (sponsorSurnameComp.isExact || secularSurnameComp.isExact) ? 45 : 44;
        const isVariant = sponsorSurnameComp.isVariant || secularSurnameComp.isVariant;
        if (sponsorSurnameComp.matched && secularSurnameComp.matched) {
          matchTitle = isVariant ? '同姓檀家候補（施主・俗名ともに同姓・異体字・45%）' : '同姓檀家候補（施主・俗名ともに同姓・45%）';
          matchExplanation = `施主姓「${sponsorSurname}」および俗名姓「${secularSurname}」様${isVariant ? '（異体字）' : ''}が名簿の世帯主姓「${hSurname}」と一致しました（適合度45%）。`;
        } else if (secularSurnameComp.matched) {
          matchTitle = isVariant ? '俗名同姓檀家候補（俗名の姓一致・異体字・45%）' : '俗名同姓檀家候補（俗名の姓一致・45%）';
          matchExplanation = `故人の俗名「${secularName}」の姓「${secularSurname}」様${isVariant ? '（異体字）' : ''}と、名簿の世帯主姓「${hSurname}」が一致しました（適合度45%）。`;
        } else {
          matchTitle = isVariant ? '同姓檀家候補（異体字・45%）' : '同姓檀家候補（45%）';
          matchExplanation = `施主の姓「${sponsorSurname}」様${isVariant ? '（異体字）' : ''}の檀家様です（適合度45%）。`;
        }
      }

      addCandidate({
        household: h,
        matchType: addrMatch ? 'same_surname_same_address' : 'same_surname',
        confidenceScore: Math.round(baseScore * templeMultiplier),
        title: matchTitle,
        explanation: matchExplanation,
        matchedName: isConfirmedSurnameMatch && !sponsorSurnameComp.matched && !secularSurnameComp.matched ? itemSurname : h.familyHead,
        isVariantMatch: sponsorSurnameComp.isVariant || secularSurnameComp.isVariant,
      });
    }

    // G. Household notes partial match with sponsor surname or given name (+10%)
    // 名簿の備考欄の姓あるいは名が、施主の姓あるいは名の片方が一致する場合は10%程度確率を上げる
    if (h.notes && sponsorFullName) {
      const cleanHNotes = normalizeNameForMatching(h.notes);
      const varHNotes = normalizeKanjiVariants(cleanHNotes);

      let matchedPart: 'surname' | 'givenName' | undefined;
      let matchedVal = '';

      if (cleanSponsorSurname.length >= 2 && (cleanHNotes.includes(cleanSponsorSurname) || varHNotes.includes(varSponsorSurname))) {
        matchedPart = 'surname';
        matchedVal = sponsorSurname;
      } else if (cleanSponsorGivenName.length >= 2 && (cleanHNotes.includes(cleanSponsorGivenName) || varHNotes.includes(varSponsorGivenName))) {
        matchedPart = 'givenName';
        matchedVal = sponsorGivenName;
      }

      if (matchedPart && matchedVal) {
        const existingCand = bestCandidateByHousehold.get(h.id);
        if (existingCand) {
          // If already matched a rule, boost score by +10% (up to 95%)
          if (existingCand.confidenceScore < 90) {
            existingCand.confidenceScore = Math.min(95, existingCand.confidenceScore + 10);
            existingCand.title += '（名簿備考欄一致+10%）';
            existingCand.explanation += ` 名簿備考欄「${h.notes}」と施主の${matchedPart === 'surname' ? '姓' : '名'}「${matchedVal}」が一致（+10%）。`;
          }
        } else {
          // If no previous match (would be 0%), give 12% match
          addCandidate({
            household: h,
            matchType: 'remarks_hint_match',
            confidenceScore: Math.round(12 * templeMultiplier),
            title: `名簿備考欄と施主の${matchedPart === 'surname' ? '姓' : '名'}が一致（+10%）`,
            explanation: `名簿備考欄「${h.notes}」に、施主名「${sponsorFullName}」様の${matchedPart === 'surname' ? '姓' : '名'}「${matchedVal}」が含まれています。`,
            matchedName: matchedVal,
          });
        }
      }
    }
  }

  // 2.5 Handle identical full names in temple or across candidates (同姓同名の檀家は両家とも50%にする)
  const candidateList = Array.from(bestCandidateByHousehold.values());
  const matchedNameCounts = new Map<string, number>();

  for (const cand of candidateList) {
    if (cand.confidenceScore > 50 && cand.matchType !== 'exact_id') {
      const cleanMatched = normalizeNameForMatching(cand.matchedName || cand.household.familyHead);
      const varMatched = normalizeKanjiVariants(cleanMatched);
      if (varMatched && varMatched.length >= 2) {
        matchedNameCounts.set(varMatched, (matchedNameCounts.get(varMatched) || 0) + 1);
      }
    }
  }

  for (const cand of candidateList) {
    if (cand.confidenceScore > 50 && cand.matchType !== 'exact_id') {
      const cleanHead = normalizeNameForMatching(cand.household.familyHead);
      const varHead = normalizeKanjiVariants(cleanHead);
      const cleanMatched = normalizeNameForMatching(cand.matchedName || cand.household.familyHead);
      const varMatched = normalizeKanjiVariants(cleanMatched);

      const isTempleDuplicate = (templeFullNameCounts.get(varHead) || 0) > 1;
      const isCandidateDuplicate = (matchedNameCounts.get(varMatched) || 0) > 1;

      if (isTempleDuplicate || isCandidateDuplicate) {
        cand.confidenceScore = 50;
        const nameToDisplay = cand.matchedName || cand.household.familyHead;
        cand.title = '同姓同名檀家（両家50%）';
        cand.explanation = `寺院名簿内に同姓同名「${nameToDisplay}」様の檀家が複数世帯存在するため、両家とも適合度50%として判定しました。`;
      }
    }
  }

  // 3. Ensure candidate count is NEVER 0 by including all households from lineageMap.
  // Unmatched households are included with 0% confidence, sorted in 五十音順 (Japanese alphabetical order).
  for (const [, state] of lineageMap.entries()) {
    const h = state.household;
    if (!bestCandidateByHousehold.has(h.id)) {
      const isSameTemple = !targetTempleId || (h.templeId || 'temple-main') === targetTempleId;
      if (isSameTemple) {
        bestCandidateByHousehold.set(h.id, {
          household: h,
          matchType: 'none',
          confidenceScore: 0,
          title: '照合一致なし（全檀家・五十音順）',
          explanation: '自動照合の条件には一致しませんでしたが、五十音順候補として全檀家を表示しています。',
          matchedName: h.familyHead,
        });
      }
    }
  }

  // Fallback: If no same-temple households existed at all in lineageMap, include all households from lineageMap
  if (bestCandidateByHousehold.size === 0) {
    for (const [, state] of lineageMap.entries()) {
      const h = state.household;
      if (!bestCandidateByHousehold.has(h.id)) {
        bestCandidateByHousehold.set(h.id, {
          household: h,
          matchType: 'none',
          confidenceScore: 0,
          title: '照合一致なし（全檀家・五十音順）',
          explanation: '自動照合の条件には一致しませんでしたが、五十音順候補として全檀家を表示しています。',
          matchedName: h.familyHead,
        });
      }
    }
  }

  const candidates = Array.from(bestCandidateByHousehold.values());

  // Sort candidates by confidence score descending, and for identical scores sort in 五十音順 (Japanese alphabetical order)
  return candidates.sort((a, b) => {
    if (b.confidenceScore !== a.confidenceScore) {
      return b.confidenceScore - a.confidenceScore;
    }
    const keyA = toHiraganaKey(a.household.furigana || '') || a.household.familyHead || '';
    const keyB = toHiraganaKey(b.household.furigana || '') || b.household.familyHead || '';
    const comp = keyA.localeCompare(keyB, 'ja', { numeric: true });
    if (comp !== 0) return comp;
    return (a.household.id || '').localeCompare(b.household.id || '', 'ja', { numeric: true });
  });
}

/**
 * Registers a confirmed spirit into the household lineage state so subsequent older records can benefit immediately.
 */
export function registerConfirmedSpiritToLineage(
  lineageMap: Map<string, LineageHouseholdState>,
  householdId: string,
  spirit: {
    dharmaName: string;
    secularName: string;
    deathDate: string;
    deathYear?: number;
    householdHeadName: string;
  }
): void {
  const state = lineageMap.get(householdId);
  if (!state) return;

  const cleanSecular = normalizeNameForMatching(spirit.secularName);
  const varSecular = normalizeKanjiVariants(cleanSecular);
  if (cleanSecular) {
    state.knownLineageNames.add(cleanSecular);
  }

  const cleanHead = normalizeNameForMatching(spirit.householdHeadName);
  const varHead = normalizeKanjiVariants(cleanHead);
  if (cleanHead) {
    state.knownLineageNames.add(cleanHead);

    // Register this spirit's sponsor as a confirmed lineage sponsor
    state.sponsors.push({
      name: spirit.householdHeadName,
      relationship: '確定精霊の施主',
      isChiefMourner: true,
      source: 'confirmed_spirit_sponsor',
      cleanName: cleanHead,
      varName: varHead,
      associatedDharmaName: spirit.dharmaName,
    });
  }

  if (!state.confirmedSurnames) {
    state.confirmedSurnames = new Set<string>();
  }
  const headSurname = extractSurname(spirit.householdHeadName);
  if (headSurname) {
    state.confirmedSurnames.add(normalizeKanjiVariants(normalizeNameForMatching(headSurname)));
  }
  const secularSurname = extractSurname(spirit.secularName);
  if (secularSurname) {
    state.confirmedSurnames.add(normalizeKanjiVariants(normalizeNameForMatching(secularSurname)));
  }

  state.linkedSpirits.push({
    ...spirit,
    cleanSecular,
    varSecular,
  });
}
