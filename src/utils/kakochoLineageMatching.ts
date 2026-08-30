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
  source: 'familyHead' | 'familyMember' | 'notes';
}

export interface LineageHouseholdState {
  household: Household;
  knownLineageNames: Set<string>; // 施主名、歴代先代精霊の俗名、家族名
  sponsors: LineageSponsorInfo[];
  notesHints: string[]; // 名簿備考欄から抽出された人名
  linkedSpirits: {
    dharmaName: string;
    secularName: string;
    deathDate: string;
    deathYear?: number;
    householdHeadName: string;
  }[];
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
    const knownSet = new Set<string>();
    if (cleanHead) knownSet.add(cleanHead);

    const sponsors: LineageSponsorInfo[] = [];
    if (h.familyHead) {
      sponsors.push({
        name: h.familyHead,
        isChiefMourner: true,
        source: 'familyHead',
      });
    }

    // 1. Extract family members & sponsors
    if (Array.isArray(h.familyMembers)) {
      h.familyMembers.forEach((m) => {
        if (!m.name) return;
        const cleanMem = normalizeNameForMatching(m.name);
        if (cleanMem) {
          knownSet.add(cleanMem);
          sponsors.push({
            name: m.name,
            relationship: m.relationship,
            isChiefMourner: !!(m.isChiefMourner || m.isSponsor),
            source: 'familyMember',
          });
        }
      });
    }

    // 2. Extract hints from household notes
    const hSurname = extractSurname(h.familyHead);
    const notesHints = extractPersonHintsFromRemarks(h.notes, hSurname);
    notesHints.forEach((nh) => {
      const cleanNh = normalizeNameForMatching(nh);
      if (cleanNh) {
        knownSet.add(cleanNh);
        sponsors.push({
          name: nh,
          source: 'notes',
        });
      }
    });

    map.set(h.id, {
      household: h,
      knownLineageNames: knownSet,
      sponsors,
      notesHints,
      linkedSpirits: [],
    });
  });

  // Populate known secular names from already registered past records
  existingPastRecords.forEach((pr) => {
    if (!pr.householdId) return;
    const state = map.get(pr.householdId);
    if (!state) return;

    const cleanSecular = normalizeNameForMatching(pr.secularName);
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
    });
  });

  return map;
}

/**
 * Analyzes a single past record item against the current household lineage state.
 * Finds candidate households, ranks them, and identifies the best recommended match.
 */
export function evaluateItemMatch(
  item: KakochoItemInput,
  lineageMap: Map<string, LineageHouseholdState>,
  targetTempleId: string,
  maxYearsBack = 80
): CandidateHouseholdMatch[] {
  const candidates: CandidateHouseholdMatch[] = [];

  const rawHeadName = item.householdHeadName || '';
  const currentHeadName = item.currentHeadName || '';
  const secularName = item.secularName || '';
  const rawId = item.rawHouseholdId ? String(item.rawHouseholdId).trim() : '';

  const itemDeathYear = item.deathYear;
  const currentYear = new Date().getFullYear();

  // Extract hints from past record notes/remarks
  const itemSurname = extractSurname(rawHeadName || currentHeadName || secularName);
  const combinedItemNotes = `${item.notes || ''} ${item.specialRemarks || ''}`.trim();
  const itemRemarksHints = extractPersonHintsFromRemarks(combinedItemNotes, itemSurname);

  // Build a surname count map for the target temple to detect unique surname households
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
  const normItemSurname = normalizeKanjiVariants(itemSurname);
  const isUniqueSurnameInTemple = normItemSurname.length >= 2 && (templeSurnameCounts.get(normItemSurname) || 0) === 1;

  // 1. Check direct ID match
  if (rawId) {
    for (const [, state] of lineageMap.entries()) {
      const h = state.household;
      const isSameTemple = (h.templeId || 'temple-main') === targetTempleId;
      if (h.id === rawId || h.id.replace(/[^0-9]/g, '') === rawId.replace(/[^0-9]/g, '')) {
        candidates.push({
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
    const hSurname = extractSurname(h.familyHead);

    // A. Match current施主名 / 世帯主名 (currentHeadName)
    if (currentHeadName) {
      // (1) Check against household familyHead
      const matchRes = compareNamesWithVariants(currentHeadName, h.familyHead);
      if (matchRes.matched) {
        const baseScore = matchRes.isExact ? 98 : 97;
        candidates.push({
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
        const spComp = compareNamesWithVariants(currentHeadName, sp.name);
        if (spComp.matched) {
          matchedSponsor = sp;
          sponsorIsVariant = spComp.isVariant;
          break;
        }
      }

      if (matchedSponsor) {
        const isChief = matchedSponsor.isChiefMourner;
        const baseScore = isChief ? (sponsorIsVariant ? 96 : 97) : (sponsorIsVariant ? 90 : 91);
        candidates.push({
          household: h,
          matchType: 'exact_sponsor_member',
          confidenceScore: Math.round(baseScore * templeMultiplier),
          title: isChief
            ? (sponsorIsVariant ? '現施主名と名簿の指定施主名が一致（異体字）' : '現施主名と名簿の指定施主名が一致')
            : (sponsorIsVariant ? '現施主名と名簿の家族名が一致（異体字）' : '現施主名と名簿の家族名が一致'),
          explanation: `ファイル記載の現施主名「${currentHeadName}」様が、名簿の家族情報「${matchedSponsor.name}」様${matchedSponsor.relationship ? `（${matchedSponsor.relationship}）` : ''}${isChief ? '【施主】' : ''}と${sponsorIsVariant ? '異体字を含めて' : ''}一致しました。`,
          matchedName: matchedSponsor.name,
          isVariantMatch: sponsorIsVariant,
        });
        continue;
      }
    }

    // B. Match 当時の施主名・世帯主名 (householdHeadName)
    if (rawHeadName) {
      // (1) Check against household familyHead
      const matchRes = compareNamesWithVariants(rawHeadName, h.familyHead);
      if (matchRes.matched) {
        const yearsAgo = itemDeathYear ? currentYear - itemDeathYear : 0;
        const isRecent = !itemDeathYear || yearsAgo <= 35;
        const baseScore = isRecent ? (matchRes.isExact ? 95 : 94) : Math.max(70, (matchRes.isExact ? 95 : 94) - Math.floor(yearsAgo / 4));

        candidates.push({
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
        const spComp = compareNamesWithVariants(rawHeadName, sp.name);
        if (spComp.matched) {
          matchedSponsor = sp;
          sponsorIsVariant = spComp.isVariant;
          break;
        }
      }

      if (matchedSponsor) {
        const isChief = matchedSponsor.isChiefMourner;
        const baseScore = isChief ? (sponsorIsVariant ? 94 : 95) : (sponsorIsVariant ? 88 : 89);
        candidates.push({
          household: h,
          matchType: 'exact_sponsor_member',
          confidenceScore: Math.round(baseScore * templeMultiplier),
          title: isChief
            ? (sponsorIsVariant ? '当時の施主名と名簿の指定施主名が一致（異体字）' : '当時の施主名と名簿の指定施主名が一致')
            : (sponsorIsVariant ? '当時の施主名と名簿の家族名が一致（異体字）' : '当時の施主名と名簿の家族名が一致'),
          explanation: `当時の施主名「${rawHeadName}」様が、名簿の家族・施主情報「${matchedSponsor.name}」様${matchedSponsor.relationship ? `（${matchedSponsor.relationship}）` : ''}${isChief ? '【施主】' : ''}と${sponsorIsVariant ? '異体字を含めて' : ''}一致しました。`,
          matchedName: matchedSponsor.name,
          isVariantMatch: sponsorIsVariant,
        });
        continue;
      }
    }

    // C. Past Record Remarks Hints Matching (過去帳備考欄から抽出した関係者名ヒントの照合)
    // 例: 施主名「萩原宏一」続柄「母」備考欄「光紀妻」 -> ヒント「光紀」「萩原光紀」
    if (itemRemarksHints.length > 0) {
      let matchedHintName: string | undefined;
      let matchedTargetName: string | undefined;
      let isHintVariant = false;
      let hintMatchType: 'head' | 'sponsor' | 'ancestor' = 'head';

      for (const hint of itemRemarksHints) {
        // (1) Check against household familyHead
        const headComp = compareNamesWithVariants(hint, h.familyHead);
        if (headComp.matched) {
          matchedHintName = hint;
          matchedTargetName = h.familyHead;
          isHintVariant = headComp.isVariant;
          hintMatchType = 'head';
          break;
        }

        // (2) Check against sponsors / family members
        for (const sp of state.sponsors) {
          const spComp = compareNamesWithVariants(hint, sp.name);
          if (spComp.matched) {
            matchedHintName = hint;
            matchedTargetName = sp.name;
            isHintVariant = spComp.isVariant;
            hintMatchType = 'sponsor';
            break;
          }
        }
        if (matchedHintName) break;

        // (3) Check against linked ancestor spirits' secular names
        for (const spirit of state.linkedSpirits) {
          const ancComp = compareNamesWithVariants(hint, spirit.secularName);
          if (ancComp.matched) {
            matchedHintName = hint;
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

        candidates.push({
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
    // If the past record's householdHeadName or currentHeadName matches a secularName of a previously linked spirit of this household
    const searchHeadName = rawHeadName || currentHeadName;
    if (searchHeadName) {
      let matchedAncestor: (typeof state.linkedSpirits)[0] | undefined;
      let matchedIsVariant = false;

      for (const spirit of state.linkedSpirits) {
        const comp = compareNamesWithVariants(spirit.secularName, searchHeadName);
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

        candidates.push({
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
    const surnameComp = compareNamesWithVariants(itemSurname, hSurname);
    if (item.burialLocation && h.tombNumber && item.burialLocation === h.tombNumber && surnameComp.matched) {
      candidates.push({
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

    // F. Same Surname match (同姓候補 - 異体字名字も考慮)
    if (surnameComp.matched && itemSurname.length >= 2) {
      // Check if address partially matches
      const hAddrClean = (h.address || '').replace(/[\s　]/g, '');
      const notesClean = (item.notes || '').replace(/[\s　]/g, '');
      const addrMatch = notesClean && hAddrClean && (notesClean.includes(hAddrClean) || hAddrClean.includes(notesClean));

      // 同姓の候補が寺院名簿内に1件しかない場合は適合度80%（推奨基準）とする
      let baseScore: number;
      let matchTitle: string;
      let matchExplanation: string;

      if (isUniqueSurnameInTemple && isSameTemple) {
        baseScore = surnameComp.isExact ? 80 : 79;
        matchTitle = surnameComp.isVariant
          ? '同姓檀家候補（名簿内唯一の同姓・80%推奨・異体字）'
          : '同姓檀家候補（名簿内唯一の同姓・80%推奨）';
        matchExplanation = `同姓「${hSurname}」様${surnameComp.isVariant ? '（異体字）' : ''}の檀家が寺院名簿内に1件のみ存在するため、適合度80%（推奨判定基準）として設定しました。`;
      } else if (addrMatch) {
        baseScore = surnameComp.isExact ? 65 : 64;
        matchTitle = surnameComp.isVariant ? '同姓（異体字）・住所類似候補' : '同姓・住所類似候補';
        matchExplanation = `同姓「${hSurname}」様${surnameComp.isVariant ? '（異体字）' : ''}かつ住所情報に関連が見られます。`;
      } else {
        baseScore = surnameComp.isExact ? 45 : 44;
        matchTitle = surnameComp.isVariant ? '同姓檀家候補（異体字）' : '同姓檀家候補';
        matchExplanation = `同姓「${hSurname}」様${surnameComp.isVariant ? '（異体字）' : ''}の檀家様です。`;
      }

      candidates.push({
        household: h,
        matchType: addrMatch ? 'same_surname_same_address' : 'same_surname',
        confidenceScore: Math.round(baseScore * templeMultiplier),
        title: matchTitle,
        explanation: matchExplanation,
        matchedName: h.familyHead,
        isVariantMatch: surnameComp.isVariant,
      });
    }
  }

  // Sort candidates by confidence score descending
  return candidates.sort((a, b) => b.confidenceScore - a.confidenceScore);
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
  if (cleanSecular) {
    state.knownLineageNames.add(cleanSecular);
  }

  const cleanHead = normalizeNameForMatching(spirit.householdHeadName);
  if (cleanHead) {
    state.knownLineageNames.add(cleanHead);
  }

  state.linkedSpirits.push(spirit);
}
