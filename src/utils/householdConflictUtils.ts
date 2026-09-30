import { Household, FamilyMember, TempleProfile } from '../types';
import { cleanAndNormalizeHouseholdId } from './dankaIdUtils';

export interface HouseholdCandidateInfo {
  id: string; // unique candidate ID within the conflict, e.g. "existing-DK-00100" or "file-row-5"
  source: 'existing' | 'file';
  rowIdx?: number; // 0-based index in rawRows
  displayRowNumber?: number; // rowIdx + 2 for 1-based header offset
  originalId: string;
  normalizedId: string;
  familyHead: string;
  furigana?: string;
  postalCode?: string;
  address?: string;
  phone?: string;
  mobile?: string;
  templeId?: string;
  templeName?: string;
  householdType?: string;
  district?: string;
  tombNumber?: string;
  notes?: string;
  existingHousehold?: Household;
  rawRow?: (string | number | undefined)[];
}

export interface HouseholdIdConflict {
  conflictId: string; // The normalized ID, e.g. "DK-00100"
  candidates: HouseholdCandidateInfo[];
}

export type HouseholdConflictResolutionAction = 'new_id' | 'add_as_family' | 'skip';

export interface HouseholdSecondaryDecision {
  action: HouseholdConflictResolutionAction;
  relationship?: string; // 続柄 (e.g. "弟", "長男", "親族")
  customNewId?: string;
}

export interface HouseholdConflictResolution {
  conflictId: string;
  primaryCandidateId: string;
  secondaryDecisions: Record<string, HouseholdSecondaryDecision>;
}

/**
 * Detects any household ID conflicts between file rows or with existing households.
 */
export function detectHouseholdIdConflicts(
  headers: string[],
  rawRows: (string | number | undefined)[][],
  mapping: Record<string, string>,
  options: {
    existingHouseholds: Household[];
    targetTempleId: string;
    temples?: TempleProfile[];
    conflictMode?: 'append' | 'merge' | 'replace';
  }
): HouseholdIdConflict[] {
  const targetTempleId = options.targetTempleId || 'temple-main';
  const idColName = mapping.id || mapping.householdId;
  if (!idColName) return [];

  const idColIdx = headers.indexOf(idColName);
  if (idColIdx === -1) return [];

  const headerIndexMap: Record<string, number> = {};
  headers.forEach((h, i) => { headerIndexMap[h] = i; });

  const getCell = (row: (string | number | undefined)[], fieldKey: string): string => {
    const colName = mapping[fieldKey];
    if (!colName) return '';
    const idx = headerIndexMap[colName];
    if (idx === undefined || idx === -1) return '';
    const val = row[idx];
    return val !== undefined && val !== null ? String(val).trim() : '';
  };

  // Group candidate items by normalizedId
  const candidateMap = new Map<string, HouseholdCandidateInfo[]>();

  // 1. Gather all file rows that have an ID
  rawRows.forEach((row, rowIdx) => {
    const headName = getCell(row, 'familyHead');
    const rawId = getCell(row, 'id') || getCell(row, 'householdId');
    if (!rawId) return;

    const normalizedId = cleanAndNormalizeHouseholdId(rawId, targetTempleId, options.temples);
    if (!normalizedId) return;

    const candidate: HouseholdCandidateInfo = {
      id: `file-row-${rowIdx}`,
      source: 'file',
      rowIdx,
      displayRowNumber: rowIdx + 2,
      originalId: rawId,
      normalizedId,
      familyHead: headName || `(行 ${rowIdx + 2} 氏名未設定)`,
      furigana: getCell(row, 'furigana'),
      postalCode: getCell(row, 'postalCode'),
      address: getCell(row, 'address'),
      phone: getCell(row, 'phone'),
      mobile: getCell(row, 'mobile'),
      householdType: getCell(row, 'householdType'),
      district: getCell(row, 'district'),
      tombNumber: getCell(row, 'tombNumber'),
      notes: getCell(row, 'notes'),
      rawRow: row,
    };

    if (!candidateMap.has(normalizedId)) {
      candidateMap.set(normalizedId, []);
    }
    candidateMap.get(normalizedId)!.push(candidate);
  });

  // 2. Check existing households
  const relevantExisting = (options.conflictMode === 'replace')
    ? options.existingHouseholds.filter(h => (h.templeId || 'temple-main') !== targetTempleId)
    : options.existingHouseholds;

  for (const [normId, fileCandidates] of candidateMap.entries()) {
    const existing = relevantExisting.find(h => h.id === normId);
    if (existing) {
      // In merge mode, if familyHead matches, it's an intended update, not a conflict
      if (options.conflictMode === 'merge') {
        const cleanExistingName = (existing.familyHead || '').replace(/[\s　]/g, '');
        const hasSamePerson = fileCandidates.some(fc => (fc.familyHead || '').replace(/[\s　]/g, '') === cleanExistingName);
        if (hasSamePerson && fileCandidates.length === 1) {
          continue;
        }
      }

      const ownerTemple = options.temples?.find(t => t.id === existing.templeId);
      const templeName = ownerTemple?.name || (existing.templeId === 'temple-main' ? '本寺' : (existing.templeId || '寺院未設定'));

      const existingCandidate: HouseholdCandidateInfo = {
        id: `existing-${existing.id}`,
        source: 'existing',
        originalId: existing.id,
        normalizedId: existing.id,
        familyHead: existing.familyHead,
        furigana: existing.furigana,
        postalCode: existing.postalCode,
        address: existing.address,
        phone: existing.phone,
        mobile: existing.mobile,
        templeId: existing.templeId,
        templeName,
        householdType: existing.householdType,
        district: existing.district,
        tombNumber: existing.tombNumber,
        notes: existing.notes,
        existingHousehold: existing,
      };

      // Place existing candidate at the beginning
      fileCandidates.unshift(existingCandidate);
    }
  }

  // 3. Filter conflicts: only entries with 2 or more candidates
  const conflicts: HouseholdIdConflict[] = [];
  for (const [normId, candidates] of candidateMap.entries()) {
    if (candidates.length >= 2) {
      conflicts.push({
        conflictId: normId,
        candidates,
      });
    }
  }

  return conflicts;
}

/**
 * Creates sensible default resolution decisions for detected conflicts.
 */
export function createDefaultResolutions(conflicts: HouseholdIdConflict[]): Record<string, HouseholdConflictResolution> {
  const resolutions: Record<string, HouseholdConflictResolution> = {};
  for (const conflict of conflicts) {
    const primaryId = conflict.candidates[0].id;
    const secondaryDecisions: Record<string, HouseholdSecondaryDecision> = {};
    for (let i = 1; i < conflict.candidates.length; i++) {
      secondaryDecisions[conflict.candidates[i].id] = {
        action: 'add_as_family',
        relationship: '親族',
      };
    }
    resolutions[conflict.conflictId] = {
      conflictId: conflict.conflictId,
      primaryCandidateId: primaryId,
      secondaryDecisions,
    };
  }
  return resolutions;
}
