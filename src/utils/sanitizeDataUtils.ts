import {
  Household,
  PastRecord,
  Transaction,
  MemorialService,
  TempleTodo,
  FamilyMember,
  TempleProfile,
  TempleInfo,
} from '../types';

export interface DatasetSanitizationInput {
  households: Household[];
  pastRecords: PastRecord[];
  transactions: Transaction[];
  memorialServices: MemorialService[];
  templeTodos: TempleTodo[];
  familyMembers: FamilyMember[];
  temples?: TempleProfile[];
  templeInfo?: TempleInfo;
}

export interface DatasetSanitizationResult {
  households: Household[];
  pastRecords: PastRecord[];
  transactions: Transaction[];
  memorialServices: MemorialService[];
  templeTodos: TempleTodo[];
  familyMembers: FamilyMember[];
  changed: boolean;
}

/**
 * Validates and repairs corrupted temple IDs, household IDs, and record IDs across the entire dataset.
 * 
 * Specifically repairs:
 * 1. Household templeId corrupted to match householdId (e.g. 'DK-00001') -> restores to valid templeId ('temple-main' / sub-temple).
 * 2. PastRecord id/householdId/templeId identical collision -> restores distinct PR- id, links householdId and templeId.
 * 3. Transaction templeId corrupted to match transaction id (e.g. 'TX-00001') -> restores to valid templeId.
 * 4. MemorialServices and TempleTodos templeId corruption -> restores to valid templeId.
 * 5. FamilyMember id collision with householdId -> ensures unique FM- id.
 */
export function sanitizeAppDataset(input: DatasetSanitizationInput): DatasetSanitizationResult {
  let changed = false;

  const temples = input.temples && input.temples.length > 0
    ? input.temples
    : [{ id: 'temple-main', isMain: true, name: input.templeInfo?.name || '本寺' } as TempleProfile];

  const mainTemple = temples.find((t) => t.isMain) || temples[0];
  const mainTempleId = mainTemple?.id || 'temple-main';

  const validTempleIds = new Set<string>();
  temples.forEach((t) => {
    if (t.id) validTempleIds.add(t.id);
  });
  validTempleIds.add('temple-main');

  // Helper to test if a string looks like an ID of a record rather than a temple ID
  const isCorruptedTempleId = (tId?: string, ownId?: string): boolean => {
    if (!tId) return true;
    const clean = tId.trim();
    if (validTempleIds.has(clean)) return false;
    if (ownId && clean === ownId.trim()) return true;
    // Corrupted to household ID (DK-00001, K0-00001, H-101, etc.)
    if (/^(DK|K\d+|H|P|PR|TX|MS|TD|FM)[-_]/i.test(clean)) return true;
    return true;
  };

  // Helper to deduce correct templeId from household ID prefix or fallback
  const deduceTempleIdFromHousehold = (householdId?: string): string => {
    if (!householdId) return mainTempleId;
    const cleanHId = householdId.trim().toUpperCase();
    if (cleanHId.startsWith('DK-') || cleanHId.startsWith('H-')) {
      return mainTempleId;
    }
    const kMatch = cleanHId.match(/^K(\d+)-/);
    if (kMatch) {
      const kNum = parseInt(kMatch[1], 10);
      const nonMainTemples = temples.filter((t) => !t.isMain);
      if (nonMainTemples[kNum]) {
        return nonMainTemples[kNum].id;
      }
    }
    return mainTempleId;
  };

  // 1. Sanitize Households
  const householdMap = new Map<string, Household>();
  const headNameToHouseholdMap = new Map<string, Household>();

  const sanitizedHouseholds = input.households.map((h, idx) => {
    let tId = h.templeId;
    let hChanged = false;

    if (isCorruptedTempleId(tId, h.id)) {
      tId = deduceTempleIdFromHousehold(h.id);
      hChanged = true;
      changed = true;
    }

    const cleanH = {
      ...h,
      templeId: tId || mainTempleId,
    };

    if (cleanH.id) {
      householdMap.set(cleanH.id, cleanH);
    }
    if (cleanH.familyHead) {
      headNameToHouseholdMap.set(cleanH.familyHead.replace(/\s+/g, ''), cleanH);
    }

    return hChanged ? cleanH : h;
  });

  // 2. Sanitize PastRecords
  const usedPastIds = new Set<string>();
  const sanitizedPastRecords = input.pastRecords.map((p, idx) => {
    let pChanged = false;
    let pId = p.id;
    let hId = p.householdId || '';
    let tId = p.templeId;

    // Check if p.id was corrupted to match householdId (or vice-versa)
    if (!pId || (hId && pId === hId)) {
      // If a household with this ID exists, pId was set to householdId -> give p a distinct ID
      if (householdMap.has(hId)) {
        const numPart = hId.replace(/^[A-Z0-9]+-/, '');
        pId = `PR-${numPart}-${idx + 1}`;
      } else {
        // If no household has this ID, maybe this ID was meant to be PR-id, or search household by head name
        const cleanHead = (p.householdHeadName || p.chiefMourner || '').replace(/\s+/g, '');
        const matchedH = cleanHead ? headNameToHouseholdMap.get(cleanHead) : undefined;
        if (matchedH) {
          hId = matchedH.id;
          pId = `PR-${matchedH.id.replace(/^[A-Z0-9]+-/, '')}-${idx + 1}`;
        } else {
          pId = `PR-${Date.now()}-${idx + 1}`;
        }
      }
      pChanged = true;
      changed = true;
    }

    // Ensure past record ID is strictly unique
    if (usedPastIds.has(pId)) {
      pId = `PR-${pId.replace(/^PR-/, '')}-${idx + 1}`;
      pChanged = true;
      changed = true;
    }
    usedPastIds.add(pId);

    // If householdId is blank, attempt linking by head name
    if (!hId) {
      const cleanHead = (p.householdHeadName || p.chiefMourner || '').replace(/\s+/g, '');
      const matchedH = cleanHead ? headNameToHouseholdMap.get(cleanHead) : undefined;
      if (matchedH) {
        hId = matchedH.id;
        pChanged = true;
        changed = true;
      }
    }

    // Sanitize templeId
    if (isCorruptedTempleId(tId, pId) || tId === hId) {
      if (hId && householdMap.has(hId)) {
        tId = householdMap.get(hId)!.templeId;
      } else {
        tId = deduceTempleIdFromHousehold(hId);
      }
      pChanged = true;
      changed = true;
    }

    if (pChanged) {
      return {
        ...p,
        id: pId,
        householdId: hId,
        templeId: tId || mainTempleId,
      };
    }
    return p;
  });

  // 3. Sanitize Transactions
  const usedTxIds = new Set<string>();
  const sanitizedTransactions = input.transactions.map((t, idx) => {
    let tChanged = false;
    let txId = t.id || `TX-${Date.now()}-${idx + 1}`;
    let tId = t.templeId;
    let hId = t.householdId || '';

    if (usedTxIds.has(txId)) {
      txId = `TX-${Date.now()}-${idx + 1}`;
      tChanged = true;
      changed = true;
    }
    usedTxIds.add(txId);

    if (isCorruptedTempleId(tId, txId)) {
      if (hId && householdMap.has(hId)) {
        tId = householdMap.get(hId)!.templeId;
      } else {
        tId = deduceTempleIdFromHousehold(hId);
      }
      tChanged = true;
      changed = true;
    } else if (hId) {
      // 世帯が兼務寺院（または世帯IDがK0等で兼務寺）なのに出納のtempleIdが本寺になっている不整合を是正
      const hh = householdMap.get(hId);
      const expectedTempleId = hh?.templeId || deduceTempleIdFromHousehold(hId);
      if (expectedTempleId && expectedTempleId !== mainTempleId && expectedTempleId !== 'temple-main') {
        if (!tId || tId === mainTempleId || tId === 'temple-main') {
          tId = expectedTempleId;
          tChanged = true;
          changed = true;
        }
      }
    }

    if (!tChanged && t.relatedServiceId) {
      const relService = input.memorialServices.find((s) => s.id === t.relatedServiceId);
      if (relService?.templeId && relService.templeId !== mainTempleId && relService.templeId !== 'temple-main') {
        if (!tId || tId === mainTempleId || tId === 'temple-main') {
          tId = relService.templeId;
          tChanged = true;
          changed = true;
        }
      }
    }

    if (tChanged) {
      return {
        ...t,
        id: txId,
        templeId: tId || mainTempleId,
      };
    }
    return t;
  });

  // 4. Sanitize Memorial Services
  const sanitizedMemorialServices = input.memorialServices.map((s) => {
    let sChanged = false;
    let tId = s.templeId;
    const hId = s.householdId || '';

    if (isCorruptedTempleId(tId, s.id)) {
      if (hId && householdMap.has(hId)) {
        tId = householdMap.get(hId)!.templeId;
      } else {
        tId = mainTempleId;
      }
      sChanged = true;
      changed = true;
    }

    if (sChanged) {
      return {
        ...s,
        templeId: tId || mainTempleId,
      };
    }
    return s;
  });

  // 5. Sanitize Temple Todos
  const sanitizedTempleTodos = input.templeTodos.map((td) => {
    let tdChanged = false;
    let tId = td.templeId;
    const hId = td.householdId || '';

    if (isCorruptedTempleId(tId, td.id)) {
      if (hId && householdMap.has(hId)) {
        tId = householdMap.get(hId)!.templeId;
      } else {
        tId = mainTempleId;
      }
      tdChanged = true;
      changed = true;
    }

    if (tdChanged) {
      return {
        ...td,
        templeId: tId || mainTempleId,
      };
    }
    return td;
  });

  // 6. Sanitize Family Members
  const usedFmIds = new Set<string>();
  const sanitizedFamilyMembers = input.familyMembers.map((fm, idx) => {
    let fmChanged = false;
    let fmId = fm.id;
    const hId = fm.householdId || '';

    if (!fmId || fmId === hId || usedFmIds.has(fmId)) {
      fmId = `FM-${hId || 'NO_HH'}-${idx + 1}`;
      fmChanged = true;
      changed = true;
    }
    usedFmIds.add(fmId);

    if (fmChanged) {
      return {
        ...fm,
        id: fmId,
      };
    }
    return fm;
  });

  return {
    households: sanitizedHouseholds,
    pastRecords: sanitizedPastRecords,
    transactions: sanitizedTransactions,
    memorialServices: sanitizedMemorialServices,
    templeTodos: sanitizedTempleTodos,
    familyMembers: sanitizedFamilyMembers,
    changed,
  };
}
