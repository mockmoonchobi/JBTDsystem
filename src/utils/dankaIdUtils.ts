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
    if (matchedTemple?.isMain) {
      return 'DK-';
    }

    const nonMainTemples = temples.filter(t => !t.isMain);
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
 */
export function cleanAndNormalizeHouseholdId(
  rawId?: string | number | null,
  templeId?: string,
  temples?: TempleProfile[]
): string {
  if (rawId === undefined || rawId === null) return '';
  let str = String(rawId).trim();
  if (!str) return '';

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
 */
export function generateNewHouseholdId(
  templeId: string,
  existingHouseholds: Household[],
  temples?: TempleProfile[]
): string {
  const prefix = getTemplePrefix(templeId, temples);
  const existingNumbers = new Set<number>();

  existingHouseholds.forEach((h) => {
    if (!h.id) return;
    const hPrefix = getTemplePrefix(h.templeId, temples);
    if (h.id.startsWith(prefix) || hPrefix === prefix) {
      const cleanId = cleanAndNormalizeHouseholdId(h.id, h.templeId || templeId, temples);
      const match = cleanId.replace(/^[A-Z0-9]+-/, '').match(/\d+/);
      if (match) {
        const num = parseInt(match[0], 10);
        if (!isNaN(num)) {
          existingNumbers.add(num);
        }
      }
    }
  });

  // If there are existing numbers, find highest + 1; otherwise start from 1 (or 1001 if main temple legacy, but 1 is cleanest)
  let candidateNum = 1;
  if (existingNumbers.size > 0) {
    const maxNum = Math.max(...Array.from(existingNumbers));
    candidateNum = maxNum + 1;
  }

  while (existingNumbers.has(candidateNum)) {
    candidateNum++;
  }

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
