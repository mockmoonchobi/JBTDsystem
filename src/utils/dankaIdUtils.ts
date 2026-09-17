import { loadJsonState, saveJsonState } from './storageUtils';
import { Household, PastRecord, Transaction, MemorialService, FamilyMember, TempleTodo, TempleProfile } from '../types';

/**
 * Determines the Danka ID prefix for a temple.
 * - Main temple (本寺): 'DK-'
 * - Sub-temples (兼務寺): 'K0-' to 'K9-' sequentially (K0, K1, ..., K9)
 */
export function getTemplePrefix(templeId?: string, temples?: TempleProfile[]): string {
  const cleanId = templeId || 'temple-main';

  if (cleanId === 'temple-main' || cleanId === 'main') {
    return 'DK-';
  }

  if (temples && temples.length > 0) {
    const matchedTemple = temples.find(t => t.id === cleanId);
    if (matchedTemple?.isMain || matchedTemple?.id === 'temple-main' || matchedTemple?.id === 'main') {
      return 'DK-';
    }

    const nonMainTemples = temples.filter(t => !t.isMain && t.id !== 'temple-main' && t.id !== 'main');
    const subIdx = nonMainTemples.findIndex(t => t.id === cleanId);
    if (subIdx !== -1) {
      // 0番目から9番目まで順番に K0- から K9- を付与
      const kNum = Math.min(Math.max(subIdx, 0), 9);
      return `K${kNum}-`;
    }
  }

  // Check known ID naming conventions (sub-0, sub-1, ..., sub-9)
  const subMatch = cleanId.match(/sub-(\d+)/i);
  if (subMatch) {
    const rawNum = parseInt(subMatch[1], 10);
    const kNum = rawNum < 10 ? rawNum : (rawNum % 10);
    return `K${kNum}-`;
  }

  const kMatch = cleanId.match(/^k(\d+)/i);
  if (kMatch) {
    const rawNum = parseInt(kMatch[1], 10);
    const kNum = rawNum < 10 ? rawNum : (rawNum % 10);
    return `K${kNum}-`;
  }

  if (cleanId.includes('sub-2') || cleanId.endsWith('-2')) {
    return 'K2-';
  }
  if (cleanId.includes('sub-1') || cleanId.endsWith('-1')) {
    return 'K1-';
  }
  if (cleanId.includes('sub-0') || cleanId.endsWith('-0')) {
    return 'K0-';
  }

  // Default for non-main temple is K0-
  return 'K0-';
}

/**
 * 世帯未設定・檀家不明の精霊に割り当てる専用の未設定ID。
 * 新規檀徒登録時の自動採番（DK-00001〜、K0-00001〜）と重複せず、
 * どの実在世帯にも自動紐付けされない安全な予約IDです。
 * 本寺用デフォルトは 'DK-99999' です。兼務寺には 'K0-99999' 等が使用されます。
 */
export const UNLINKED_HOUSEHOLD_ID = 'DK-99999';

/**
 * 寺院（本寺・兼務寺）に応じた世帯未設定IDを取得します。
 * - 本寺: 'DK-99999'
 * - 兼務寺: 'K0-99999'（兼務寺0番目）、'K1-99999' など（getTemplePrefixに基づく）
 * 将来の新規檀徒（00001〜）で割り当てられる可能性のある数値と決して重複しない安全なIDを返します。
 */
export function getUnlinkedHouseholdId(templeId?: string, temples?: TempleProfile[]): string {
  const prefix = getTemplePrefix(templeId, temples);
  return `${prefix}99999`;
}

/**
 * 指定された世帯IDが「世帯未設定」「未割当」「不明」であるかを判定します。
 * DK-99999, K0-99999, K1-99999 など、末尾が 99999 のものはすべて未設定IDとして扱われます。
 */
export function isUnlinkedHouseholdId(id?: string | null): boolean {
  if (!id) return true;
  const clean = String(id).trim().toUpperCase();
  return (
    clean === '' ||
    clean === 'DK-99999' ||
    clean === 'K0-99999' ||
    clean.endsWith('99999') ||
    clean.includes('99999') ||
    clean === 'DK-00000' ||
    clean.endsWith('00000') ||
    clean === 'DK-UNKNOWN' ||
    clean === 'UNKNOWN' ||
    clean === 'UNLINKED' ||
    clean === 'DK-UNLINKED' ||
    clean.includes('UNLINKED') ||
    clean === '未設定' ||
    clean === '（世帯主未設定）' ||
    clean === '世帯主未設定'
  );
}

/**
 * Removes duplicate suffixes like '-2', '-3', '-4' and zero-pads number to 5 digits
 * with the appropriate temple prefix (DK- / K0- / K1- ... K9-).
 * 
 * Examples:
 * - 'DK-00001-2' -> 'DK-00001'
 * - 'DK-1001' -> 'DK-01001'
 * - '1001' (main temple) -> 'DK-01001'
 * - '2001' (sub-temple 0) -> 'K0-02001'
 * - 'K1-00001-3' -> 'K1-00001'
 * - 'K2-45' -> 'K2-00045'
 * - 'DK-99999' -> 'DK-99999' (世帯未設定は保持)
 * - 'K0-99999' -> 'K0-99999' (兼務寺の世帯未設定も保持)
 */
export function cleanAndNormalizeHouseholdId(
  rawId?: string | number | null,
  templeId?: string,
  temples?: TempleProfile[]
): string {
  if (rawId === undefined || rawId === null) return '';
  let str = String(rawId).trim();
  if (!str) return '';

  // 世帯未設定の判定: 本寺はDK-99999、兼務寺はK0-99999等に正規化
  if (isUnlinkedHouseholdId(str)) {
    return getUnlinkedHouseholdId(templeId, temples);
  }

  // 1. Identify existing prefix if already present (e.g. DK-, K0- ~ K9-, or legacy long prefix K178718817164-)
  let prefix = '';
  const prefixMatch = str.match(/^(DK|K\d+|TEMPLE|H|D)[-_]/i);
  if (prefixMatch) {
    const rawPrefix = prefixMatch[1].toUpperCase();
    if (rawPrefix === 'DK') {
      prefix = 'DK-';
    } else if (/^K\d+$/.test(rawPrefix)) {
      if (templeId || temples) {
        prefix = getTemplePrefix(templeId, temples);
      } else {
        const kDigits = rawPrefix.replace(/^K/, '');
        const kNum = parseInt(kDigits, 10);
        prefix = `K${isNaN(kNum) ? 0 : (kNum < 10 ? kNum : kNum % 10)}-`;
      }
    }
    // Strip prefix for number parsing
    str = str.slice(prefixMatch[0].length);
  }

  // 2. If no valid prefix was resolved, determine by templeId & temples
  if (!prefix) {
    prefix = getTemplePrefix(templeId, temples);
  } else if (templeId) {
    prefix = getTemplePrefix(templeId, temples);
  }

  // 3. Remove trailing duplicate suffixes like '-2', '-3', '-12' (5桁以降の「-2」「-3」を削除)
  // Example: '00001-2' -> '00001', '1001-3' -> '1001'
  str = str.replace(/-[0-9]+$/, '');

  // 4. Extract the core number
  const numMatch = str.match(/\d+/);
  if (numMatch) {
    const num = parseInt(numMatch[0], 10);
    if (!isNaN(num) && num >= 0) {
      const paddedNum = String(num).padStart(5, '0');
      return `${prefix}${paddedNum}`;
    }
  }

  // Fallback if purely text without digits
  return str ? `${prefix}${str}` : '';
}

/**
 * Generates the next available 5-digit Household ID for a temple (e.g. DK-01009, K1-02003, DK-00001).
 * 
 * 厳格な採番保護ルール:
 * - DK-99999 や 90000 以上の番号は「世帯未設定」等の予約番号のため、新規檀徒への自動採番では絶対に使用しません。
 * - 過去帳に存在する精霊の世帯IDもチェックし、既存の世帯・精霊と衝突しない安全な番号を採番します。
 */
export function generateNewHouseholdId(
  templeId: string,
  existingHouseholds: Household[],
  temples?: TempleProfile[],
  existingPastRecords?: { householdId?: string }[]
): string {
  const prefix = getTemplePrefix(templeId, temples);
  const existingNumbers = new Set<number>();

  const collectNumber = (idStr?: string) => {
    if (!idStr) return;
    if (isUnlinkedHouseholdId(idStr)) return; // DK-99999, DK-00000 などの未設定IDは除外
    const cleanId = cleanAndNormalizeHouseholdId(idStr, templeId, temples);
    const match = cleanId.replace(/^[A-Z0-9]+-/, '').match(/\d+/);
    if (match) {
      const num = parseInt(match[0], 10);
      // 0 および 90000以上（99999など）は通常連番から除外
      if (!isNaN(num) && num > 0 && (num < 90000 || num >= 100000)) {
        existingNumbers.add(num);
      }
    }
  };

  existingHouseholds.forEach((h) => {
    if (!h.id) return;
    const hPrefix = getTemplePrefix(h.templeId, temples);
    if (h.id.startsWith(prefix) || hPrefix === prefix) {
      collectNumber(h.id);
    }
  });

  // 過去帳にすでに振られているID（ただし未設定の99999や00000等を除く）も考慮して重複防止
  if (existingPastRecords && existingPastRecords.length > 0) {
    existingPastRecords.forEach((p) => {
      if (p.householdId && !isUnlinkedHouseholdId(p.householdId)) {
        collectNumber(p.householdId);
      }
    });
  }

  // If there are existing numbers, find highest + 1; otherwise start from 1
  let candidateNum = 1;
  if (existingNumbers.size > 0) {
    let maxNum = 0;
    for (const n of existingNumbers) maxNum = Math.max(maxNum, n);
    candidateNum = maxNum + 1;
  }

  while (existingNumbers.has(candidateNum) || candidateNum === 99999 || (candidateNum >= 90000 && candidateNum <= 99999)) {
    if (candidateNum >= 90000 && candidateNum <= 99999) {
      candidateNum = 100000;
    } else {
      candidateNum++;
    }
  }

  const highWater = loadJsonState<Record<string, number>>('household-number-high-water-v1', {});
  candidateNum = Math.max(candidateNum, (highWater[prefix] || 0) + 1);
  if (candidateNum >= 90000 && candidateNum <= 99999) candidateNum = 100000;
  saveJsonState('household-number-high-water-v1', { ...highWater, [prefix]: candidateNum });
  const paddedNum = String(candidateNum).padStart(5, '0');
  return `${prefix}${paddedNum}`;
}

/**
 * Complete Migration function to update all legacy IDs in the system:
 * - Normalizes Household IDs (DK- / K1- / K2- with 5-digit padding, removing -2/-3)
 * - Resolves any accidental duplicates by assigning the next free 5-digit number
 * - Cascades updated IDs to PastRecords, Transactions, MemorialServices, FamilyMembers, TempleTodos
 */
export function migrateAllDankaIds(
  households: Household[],
  pastRecords: PastRecord[],
  transactions: Transaction[],
  memorialServices: MemorialService[],
  familyMembers: FamilyMember[],
  templeTodos: TempleTodo[],
  temples?: TempleProfile[]
): {
  households: Household[];
  pastRecords: PastRecord[];
  transactions: Transaction[];
  memorialServices: MemorialService[];
  familyMembers: FamilyMember[];
  templeTodos: TempleTodo[];
  changed: boolean;
} {
  let changed = false;
  const idMap = new Map<string, string>();
  const usedIds = new Set<string>();

  // 1. Migrate Households
  const updatedHouseholds = households.map((h) => {
    const tId = h.templeId || 'temple-main';
    const oldId = h.id;
    let newId = cleanAndNormalizeHouseholdId(oldId, tId, temples);

    // If blank fallback
    if (!newId) {
      newId = generateNewHouseholdId(tId, households, temples);
    }

    // Ensure uniqueness if two records had e.g. DK-00001 and DK-00001-2
    if (usedIds.has(newId)) {
      const prefix = getTemplePrefix(tId, temples);
      let num = parseInt(newId.replace(/^[A-Z0-9]+-/, ''), 10) || 1;
      let candidate = `${prefix}${String(num).padStart(5, '0')}`;
      while (usedIds.has(candidate)) {
        num++;
        candidate = `${prefix}${String(num).padStart(5, '0')}`;
      }
      newId = candidate;
    }

    usedIds.add(newId);

    if (oldId !== newId) {
      changed = true;
      idMap.set(oldId, newId);
      // Also map pure number variant and prefix variants
      const numMatch = oldId.match(/\d+/);
      if (numMatch) {
        idMap.set(numMatch[0], newId);
        idMap.set(`DK-${numMatch[0]}`, newId);
        for (let i = 0; i <= 9; i++) {
          idMap.set(`K${i}-${numMatch[0]}`, newId);
        }
      }
    }

    // Update family members inside household
    const updatedFm = (h.familyMembers || []).map((fm) => {
      if (fm.householdId !== newId) {
        changed = true;
        return { ...fm, householdId: newId };
      }
      return fm;
    });

    const updatedQrToken = h.qrToken && h.qrToken.includes(oldId)
      ? h.qrToken.replace(oldId, newId)
      : (h.qrToken || `TEMPLE-${newId}`);

    return {
      ...h,
      id: newId,
      qrToken: updatedQrToken,
      familyMembers: updatedFm,
    };
  });

  // 2. Migrate PastRecords
  const updatedPastRecords = pastRecords.map((p) => {
    const rawHId = p.householdId || '';
    let newHId = idMap.get(rawHId);
    if (!newHId && rawHId) {
      newHId = cleanAndNormalizeHouseholdId(rawHId, p.templeId, temples);
    }
    if (newHId && newHId !== rawHId) {
      changed = true;
      return { ...p, householdId: newHId };
    }
    return p;
  });

  // 3. Migrate Transactions
  const updatedTransactions = transactions.map((t) => {
    if (!t.householdId) return t;
    const rawHId = t.householdId;
    let newHId = idMap.get(rawHId);
    if (!newHId && rawHId) {
      newHId = cleanAndNormalizeHouseholdId(rawHId, t.templeId, temples);
    }
    if (newHId && newHId !== rawHId) {
      changed = true;
      return { ...t, householdId: newHId };
    }
    return t;
  });

  // 4. Migrate MemorialServices
  const updatedMemorialServices = memorialServices.map((ms) => {
    if (!ms.householdId) return ms;
    const rawHId = ms.householdId;
    let newHId = idMap.get(rawHId);
    if (!newHId && rawHId) {
      newHId = cleanAndNormalizeHouseholdId(rawHId, ms.templeId, temples);
    }
    if (newHId && newHId !== rawHId) {
      changed = true;
      return { ...ms, householdId: newHId };
    }
    return ms;
  });

  // 5. Migrate standalone FamilyMembers
  const updatedFamilyMembers = familyMembers.map((fm) => {
    const rawHId = fm.householdId;
    let newHId = idMap.get(rawHId);
    if (!newHId && rawHId) {
      newHId = cleanAndNormalizeHouseholdId(rawHId, undefined, temples);
    }
    if (newHId && newHId !== rawHId) {
      changed = true;
      return { ...fm, householdId: newHId };
    }
    return fm;
  });

  // 6. Migrate TempleTodos
  const updatedTempleTodos = templeTodos.map((td) => {
    if (!td.householdId) return td;
    const rawHId = td.householdId;
    let newHId = idMap.get(rawHId);
    if (!newHId && rawHId) {
      newHId = cleanAndNormalizeHouseholdId(rawHId, td.templeId, temples);
    }
    if (newHId && newHId !== rawHId) {
      changed = true;
      return { ...td, householdId: newHId };
    }
    return td;
  });

  return {
    households: updatedHouseholds,
    pastRecords: updatedPastRecords,
    transactions: updatedTransactions,
    memorialServices: updatedMemorialServices,
    familyMembers: updatedFamilyMembers,
    templeTodos: updatedTempleTodos,
    changed,
  };
}
