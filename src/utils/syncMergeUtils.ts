import {
  Household,
  PastRecord,
  MemorialService,
  Transaction,
  TempleTodo,
  FamilyMember,
  TempleProfile,
  TempleInfo,
  MasterOptions,
  Priest,
  DeletedRecordEntry
} from '../types';
import { SheetsImportResult } from '../lib/googleSheets';
import { INITIAL_TEMPLE_INFO, EMPTY_MASTER_OPTIONS } from '../data/initialData';
import { sanitizeAppDataset } from './sanitizeDataUtils';
import { mergeMasterOptionsWithData } from './masterOptionsUtils';
import { 
  buildDeletedTimestampMap, 
  isSuppressedByDeletion, 
  mergeDeletedRecordsLogs,
  loadDeletedRecordsLog 
} from './deletedRecordsLog';

export interface SyncMergeStats {
  householdsUpdated: number;
  householdsAdded: number;
  householdsLocalKept: number;
  householdsDeletedSuppressed?: number;
  pastRecordsUpdated: number;
  pastRecordsAdded: number;
  pastRecordsLocalKept: number;
  pastRecordsDeletedSuppressed?: number;
  memorialsUpdated: number;
  memorialsAdded: number;
  memorialsLocalKept: number;
  memorialsDeletedSuppressed?: number;
  todosUpdated: number;
  todosAdded: number;
  todosLocalKept: number;
  transactionsUpdated: number;
  transactionsAdded: number;
  transactionsLocalKept: number;
  familyMembersUpdated: number;
  familyMembersAdded: number;
  totalUpdatedFromRemote: number;
  totalAddedFromRemote: number;
  totalLocalKeptNewer: number;
  totalDeletedSuppressed?: number;
}

export interface MergedDatasetResult {
  households: Household[];
  familyMembers: FamilyMember[];
  pastRecords: PastRecord[];
  memorialServices: MemorialService[];
  templeTodos: TempleTodo[];
  transactions: Transaction[];
  temples?: TempleProfile[];
  templeInfo: TempleInfo;
  masterOptions?: MasterOptions;
  templeMasterOptionsMap?: Record<string, MasterOptions>;
  noticeTemplates?: { higan: string; niibon: string };
  priests?: Priest[];
  deletedRecords?: DeletedRecordEntry[];
  stats: SyncMergeStats;
  summaryMessage: string;
}

/**
 * Parses date string (YYYY/MM/DD, YYYY-MM-DD, ISO) and time string (HH:mm:ss) into local epoch timestamp in ms.
 * Accurately aligns with Date.now() / new Date().getTime() used in deletion logs.
 */
export function parseDateAndTimeToMs(dateStr?: string, timeStr?: string): number {
  if (!dateStr) return 0;
  const cleanDate = String(dateStr).trim();
  if (!cleanDate) return 0;

  // 1. Direct standard ISO parsing if ISO formatted with Z or timezone offset
  if (cleanDate.includes('T')) {
    const ms = new Date(cleanDate).getTime();
    if (!isNaN(ms) && ms > 0) return ms;
  }

  let dPart = cleanDate;
  let tPart = String(timeStr || '').trim();

  if (cleanDate.includes(' ')) {
    const parts = cleanDate.split(' ');
    dPart = parts[0];
    if (!tPart && parts.length > 1) {
      tPart = parts.slice(1).join(' ');
    }
  }

  const dateParts = dPart.replace(/\//g, '-').split('-');
  if (dateParts.length < 3) return 0;

  const year = parseInt(dateParts[0], 10);
  const month = parseInt(dateParts[1], 10);
  const day = parseInt(dateParts[2], 10);
  if (isNaN(year) || isNaN(month) || isNaN(day)) return 0;

  let hour = 0;
  let minute = 0;
  let second = 0;
  if (tPart) {
    let rawTime = tPart;
    let isPM = false;
    let isAM = false;

    if (/午後|PM|pm/i.test(rawTime)) {
      isPM = true;
      rawTime = rawTime.replace(/午後|PM|pm/gi, '').trim();
    } else if (/午前|AM|am/i.test(rawTime)) {
      isAM = true;
      rawTime = rawTime.replace(/午前|AM|am/gi, '').trim();
    }

    const cleanTPart = rawTime.split('.')[0].replace(/[Zz+-].*$/, '').replace(/[時分秒]/g, ':').trim();
    const timeParts = cleanTPart.split(':').filter(Boolean);
    hour = parseInt(timeParts[0], 10) || 0;
    minute = parseInt(timeParts[1], 10) || 0;
    second = parseInt(timeParts[2], 10) || 0;

    if (isPM && hour < 12) hour += 12;
    if (isAM && hour === 12) hour = 0;
  }

  // Construct local date time (matches local now.getFullYear()/now.getHours() stored by auditUtils)
  const localDate = new Date(year, month - 1, day, hour, minute, second);
  const ms = localDate.getTime();
  return isNaN(ms) ? 0 : ms;
}

/**
 * Extracts the most recent audit timestamp (modification or creation) as a numeric timestamp (ms).
 */
export function getRecordAuditTimestamp(item?: {
  id?: string;
  createdDate?: string;
  createdTime?: string;
  updatedDate?: string;
  updatedTime?: string;
  createdAt?: string;
  updatedAt?: string;
}): number {
  if (!item) return 0;

  // 1. Updated Date & Time (Highest Priority)
  if (item.updatedAt) {
    const ms = parseDateAndTimeToMs(item.updatedAt);
    if (ms > 0) return ms;
  }
  if (item.updatedDate) {
    const ms = parseDateAndTimeToMs(item.updatedDate, item.updatedTime);
    if (ms > 0) return ms;
  }

  // 2. Created Date & Time (Fallback)
  if (item.createdAt) {
    const ms = parseDateAndTimeToMs(item.createdAt);
    if (ms > 0) return ms;
  }
  if (item.createdDate) {
    const ms = parseDateAndTimeToMs(item.createdDate, item.createdTime);
    if (ms > 0) return ms;
  }

  // 3. Fallback: Check if ID contains a timestamp (e.g. HH-1700000000000, MS-1700000000000)
  if (item.id) {
    const match = item.id.match(/\d{12,14}/);
    if (match) {
      const ms = parseInt(match[0], 10);
      if (!isNaN(ms) && ms > 1500000000000 && ms < 2500000000000) {
        return ms;
      }
    }
  }

  return 0;
}

/**
 * Merges FamilyMembers list by comparing ID and modification/creation timestamps.
 */
export function mergeFamilyMembers(
  localMembers: FamilyMember[] = [],
  remoteMembers: FamilyMember[] = [],
  deletedLogMap?: Map<string, number>
): {
  merged: FamilyMember[];
  updatedCount: number;
  addedCount: number;
  suppressedCount: number;
} {
  let updatedCount = 0;
  let addedCount = 0;
  let suppressedCount = 0;

  const localMap = new Map<string, FamilyMember>();
  localMembers.forEach((m) => {
    if (m.id) localMap.set(m.id.trim(), m);
  });

  const remoteMap = new Map<string, FamilyMember>();
  remoteMembers.forEach((m) => {
    if (m.id) remoteMap.set(m.id.trim(), m);
  });

  const merged: FamilyMember[] = [];
  const processedIds = new Set<string>();

  // Process all remote members first
  remoteMembers.forEach((remoteFm) => {
    const rId = remoteFm.id?.trim();
    if (!rId) return;
    processedIds.add(rId);

    const remoteTime = getRecordAuditTimestamp(remoteFm);
    const localFm = localMap.get(rId);

    // Check if remote item was deleted after its last modification
    if (!localFm) {
      if (isSuppressedByDeletion(rId, remoteTime, deletedLogMap)) {
        suppressedCount++;
        return; // Suppress resurrection of deleted family member
      }
      // Exists only in remote and not deleted -> Added from remote
      merged.push(remoteFm);
      addedCount++;
    } else {
      // Exists in both -> Compare timestamps
      const localTime = getRecordAuditTimestamp(localFm);
      const maxTime = Math.max(localTime, remoteTime);

      if (isSuppressedByDeletion(rId, maxTime, deletedLogMap)) {
        suppressedCount++;
        return; // Both had it, but deletion is newer
      }

      if (remoteTime > localTime) {
        // Remote is newer -> Update to remote
        merged.push(remoteFm);
        updatedCount++;
      } else {
        // Local is newer or equal -> Keep local
        merged.push(localFm);
      }
    }
  });

  // Add all local members that did not exist in remote
  localMembers.forEach((localFm) => {
    const lId = localFm.id?.trim();
    if (!lId || processedIds.has(lId)) return;
    const localTime = getRecordAuditTimestamp(localFm);
    if (isSuppressedByDeletion(lId, localTime, deletedLogMap)) {
      suppressedCount++;
      return;
    }
    merged.push(localFm);
  });

  return { merged, updatedCount, addedCount, suppressedCount };
}

/**
 * Merges Households by comparing ID, record timestamps, and recursively merging family members.
 */
export function mergeHouseholds(
  localList: Household[] = [],
  remoteList: Household[] = [],
  deletedLogMap?: Map<string, number>
): {
  merged: Household[];
  updatedCount: number;
  addedCount: number;
  localKeptCount: number;
  suppressedCount: number;
} {
  let updatedCount = 0;
  let addedCount = 0;
  let localKeptCount = 0;
  let suppressedCount = 0;

  const localMap = new Map<string, Household>();
  localList.forEach((h) => {
    if (h.id) localMap.set(h.id.trim(), h);
  });

  const remoteMap = new Map<string, Household>();
  remoteList.forEach((h) => {
    if (h.id) remoteMap.set(h.id.trim(), h);
  });

  const merged: Household[] = [];
  const processedIds = new Set<string>();

  // Process all remote records
  remoteList.forEach((remoteHh) => {
    const rId = remoteHh.id?.trim();
    if (!rId) return;
    processedIds.add(rId);

    const remoteTime = getRecordAuditTimestamp(remoteHh);
    const localHh = localMap.get(rId);

    if (!localHh) {
      // Check if remote item was deleted locally or remotely
      if (isSuppressedByDeletion(rId, remoteTime, deletedLogMap)) {
        suppressedCount++;
        return; // Suppress resurrection
      }
      // New record from Google Sheets
      merged.push(remoteHh);
      addedCount++;
    } else {
      // Both exist: compare timestamps
      const localTime = getRecordAuditTimestamp(localHh);
      const maxTime = Math.max(localTime, remoteTime);

      if (isSuppressedByDeletion(rId, maxTime, deletedLogMap)) {
        suppressedCount++;
        return; // Suppress deleted
      }

      // Recursively merge family members within this household
      const mergedFamily = mergeFamilyMembers(localHh.familyMembers || [], remoteHh.familyMembers || [], deletedLogMap).merged;

      if (remoteTime > localTime) {
        // Remote is newer
        merged.push({
          ...remoteHh,
          familyMembers: mergedFamily,
        });
        updatedCount++;
      } else {
        // Local is newer or equal
        merged.push({
          ...localHh,
          familyMembers: mergedFamily,
        });
        localKeptCount++;
      }
    }
  });

  // Add all local records that were not in remote
  localList.forEach((localHh) => {
    const lId = localHh.id?.trim();
    if (!lId || processedIds.has(lId)) return;
    const localTime = getRecordAuditTimestamp(localHh);
    if (isSuppressedByDeletion(lId, localTime, deletedLogMap)) {
      suppressedCount++;
      return;
    }
    merged.push(localHh);
    localKeptCount++;
  });

  return { merged, updatedCount, addedCount, localKeptCount, suppressedCount };
}

/**
 * Generic merge function for flat entity lists (PastRecords, MemorialServices, Todos, Transactions).
 */
export function mergeGenericEntityList<T extends {
  id: string;
  createdDate?: string;
  createdTime?: string;
  updatedDate?: string;
  updatedTime?: string;
  createdAt?: string;
  updatedAt?: string;
}>(
  localList: T[] = [],
  remoteList: T[] = [],
  deletedLogMap?: Map<string, number>
): {
  merged: T[];
  updatedCount: number;
  addedCount: number;
  localKeptCount: number;
  suppressedCount: number;
} {
  let updatedCount = 0;
  let addedCount = 0;
  let localKeptCount = 0;
  let suppressedCount = 0;

  const localMap = new Map<string, T>();
  localList.forEach((item) => {
    if (item.id) localMap.set(item.id.trim(), item);
  });

  const remoteMap = new Map<string, T>();
  remoteList.forEach((item) => {
    if (item.id) remoteMap.set(item.id.trim(), item);
  });

  const merged: T[] = [];
  const processedIds = new Set<string>();

  remoteList.forEach((remoteItem) => {
    const rId = remoteItem.id?.trim();
    if (!rId) return;
    processedIds.add(rId);

    const remoteTime = getRecordAuditTimestamp(remoteItem);
    const localItem = localMap.get(rId);

    if (!localItem) {
      // Check if remote item was deleted locally or remotely
      if (isSuppressedByDeletion(rId, remoteTime, deletedLogMap)) {
        suppressedCount++;
        return; // Suppress resurrection
      }
      // New record from Google Sheets
      merged.push(remoteItem);
      addedCount++;
    } else {
      const localTime = getRecordAuditTimestamp(localItem);
      const maxTime = Math.max(localTime, remoteTime);

      if (isSuppressedByDeletion(rId, maxTime, deletedLogMap)) {
        suppressedCount++;
        return; // Suppress deleted
      }

      if (remoteTime > localTime) {
        // Remote is newer
        merged.push(remoteItem);
        updatedCount++;
      } else {
        // Local is newer or equal
        merged.push(localItem);
        localKeptCount++;
      }
    }
  });

  localList.forEach((localItem) => {
    const lId = localItem.id?.trim();
    if (!lId || processedIds.has(lId)) return;
    const localTime = getRecordAuditTimestamp(localItem);
    if (isSuppressedByDeletion(lId, localTime, deletedLogMap)) {
      suppressedCount++;
      return;
    }
    merged.push(localItem);
    localKeptCount++;
  });

  return { merged, updatedCount, addedCount, localKeptCount, suppressedCount };
}

/**
 * Merges MasterOptions by combining all unique values from both local and remote options.
 */
export function mergeMasterOptions(
  localOptions?: MasterOptions,
  remoteOptions?: MasterOptions
): MasterOptions | undefined {
  if (!localOptions && !remoteOptions) return undefined;
  // If local options exist, prioritize local configuration to allow deleting categories, statuses, etc.
  if (localOptions) {
    return {
      householdTypes: localOptions.householdTypes ?? remoteOptions?.householdTypes ?? [],
      statuses: localOptions.statuses ?? remoteOptions?.statuses ?? [],
      districts: localOptions.districts ?? remoteOptions?.districts ?? [],
      tobaTypes: localOptions.tobaTypes ?? remoteOptions?.tobaTypes ?? [],
      incomeCategories: localOptions.incomeCategories ?? remoteOptions?.incomeCategories ?? [],
      expenseCategories: localOptions.expenseCategories ?? remoteOptions?.expenseCategories ?? [],
      accountingCategories: localOptions.accountingCategories ?? [
        ...(localOptions.incomeCategories || []),
        ...(localOptions.expenseCategories || []),
      ],
      paymentMethods: localOptions.paymentMethods ?? remoteOptions?.paymentMethods ?? [],
    };
  }
  return remoteOptions;
}

/**
 * Merges per-temple master options dictionaries.
 */
export function mergeTempleMasterOptionsMaps(
  localMap: Record<string, MasterOptions> = {},
  remoteMap: Record<string, MasterOptions> = {}
): Record<string, MasterOptions> {
  const merged: Record<string, MasterOptions> = {};
  const allKeys = new Set([...Object.keys(localMap || {}), ...Object.keys(remoteMap || {})]);

  allKeys.forEach((key) => {
    const localVal = localMap[key];
    const remoteVal = remoteMap[key];
    const combined = mergeMasterOptions(localVal, remoteVal);
    if (combined) {
      merged[key] = combined;
    }
  });

  return merged;
}

/**
 * Merges temple profiles by ID.
 */
export function mergeTemples(
  localTemples: TempleProfile[] = [],
  remoteTemples: TempleProfile[] = []
): TempleProfile[] {
  if (remoteTemples.length === 0) return localTemples;
  if (localTemples.length === 0) return remoteTemples;

  const map = new Map<string, TempleProfile>();
  localTemples.forEach((t) => {
    const key = t.id?.trim() || t.name?.trim();
    if (key) map.set(key, t);
  });

  remoteTemples.forEach((remoteT) => {
    const key = remoteT.id?.trim() || remoteT.name?.trim();
    if (!key) return;
    const localT = map.get(key);
    if (!localT) {
      map.set(key, remoteT);
    } else {
      const localTs = getRecordAuditTimestamp(localT);
      const remoteTs = getRecordAuditTimestamp(remoteT);
      // If localTs >= remoteTs (including when neither has a timestamp), LOCAL edits take precedence!
      if (localTs >= remoteTs) {
        map.set(key, {
          ...remoteT,
          ...localT,
          name: localT.name || remoteT.name,
          mountainName: localT.mountainName !== undefined && localT.mountainName !== '' ? localT.mountainName : (remoteT.mountainName ?? localT.mountainName),
          sect: localT.sect !== undefined && localT.sect !== '' ? localT.sect : (remoteT.sect ?? localT.sect),
          chiefPriest: localT.chiefPriest !== undefined && localT.chiefPriest !== '' ? localT.chiefPriest : (remoteT.chiefPriest ?? localT.chiefPriest),
          postalCode: localT.postalCode !== undefined && localT.postalCode !== '' ? localT.postalCode : (remoteT.postalCode ?? localT.postalCode),
          address: localT.address !== undefined && localT.address !== '' ? localT.address : (remoteT.address ?? localT.address),
          phone: localT.phone !== undefined && localT.phone !== '' ? localT.phone : (remoteT.phone ?? localT.phone),
          fax: localT.fax !== undefined && localT.fax !== '' ? localT.fax : (remoteT.fax ?? localT.fax),
          website: localT.website !== undefined && localT.website !== '' ? localT.website : (remoteT.website ?? localT.website),
          bankInfo: localT.bankInfo !== undefined && localT.bankInfo !== '' ? localT.bankInfo : (remoteT.bankInfo ?? localT.bankInfo),
          bonSeason: localT.bonSeason || remoteT.bonSeason,
          tobaType1: localT.tobaType1 !== undefined ? localT.tobaType1 : remoteT.tobaType1,
          tobaType2: localT.tobaType2 !== undefined ? localT.tobaType2 : remoteT.tobaType2,
          tobaType3: localT.tobaType3 !== undefined ? localT.tobaType3 : remoteT.tobaType3,
          masterOptions: localT.masterOptions || remoteT.masterOptions,
          annualEvents: (localT.annualEvents && localT.annualEvents.length > 0) ? localT.annualEvents : remoteT.annualEvents,
        });
      } else {
        // Remote is newer
        map.set(key, {
          ...localT,
          ...remoteT,
          name: remoteT.name || localT.name,
          mountainName: remoteT.mountainName !== undefined && remoteT.mountainName !== '' ? remoteT.mountainName : (localT.mountainName ?? remoteT.mountainName),
          sect: remoteT.sect !== undefined && remoteT.sect !== '' ? remoteT.sect : (localT.sect ?? remoteT.sect),
          chiefPriest: remoteT.chiefPriest !== undefined && remoteT.chiefPriest !== '' ? remoteT.chiefPriest : (localT.chiefPriest ?? remoteT.chiefPriest),
          postalCode: remoteT.postalCode !== undefined && remoteT.postalCode !== '' ? remoteT.postalCode : (localT.postalCode ?? remoteT.postalCode),
          address: remoteT.address !== undefined && remoteT.address !== '' ? remoteT.address : (localT.address ?? remoteT.address),
          phone: remoteT.phone !== undefined && remoteT.phone !== '' ? remoteT.phone : (localT.phone ?? remoteT.phone),
          fax: remoteT.fax !== undefined && remoteT.fax !== '' ? remoteT.fax : (localT.fax ?? remoteT.fax),
          website: remoteT.website !== undefined && remoteT.website !== '' ? remoteT.website : (localT.website ?? remoteT.website),
          bankInfo: remoteT.bankInfo !== undefined && remoteT.bankInfo !== '' ? remoteT.bankInfo : (localT.bankInfo ?? remoteT.bankInfo),
          bonSeason: remoteT.bonSeason || localT.bonSeason,
          tobaType1: remoteT.tobaType1 !== undefined ? remoteT.tobaType1 : localT.tobaType1,
          tobaType2: remoteT.tobaType2 !== undefined ? remoteT.tobaType2 : localT.tobaType2,
          tobaType3: remoteT.tobaType3 !== undefined ? remoteT.tobaType3 : localT.tobaType3,
          masterOptions: remoteT.masterOptions || localT.masterOptions,
          annualEvents: (remoteT.annualEvents && remoteT.annualEvents.length > 0) ? remoteT.annualEvents : localT.annualEvents,
        });
      }
    }
  });

  return Array.from(map.values());
}

/**
 * Merges complete application state with Google Sheets import data by comparing audit timestamps per record.
 */
export function mergeDatasetsWithAuditPriority(
  localState: {
    templeInfo: TempleInfo;
    temples?: TempleProfile[];
    households: Household[];
    pastRecords: PastRecord[];
    memorialServices: MemorialService[];
    templeTodos: TempleTodo[];
    transactions: Transaction[];
    familyMembers?: FamilyMember[];
    masterOptions?: MasterOptions;
    templeMasterOptionsMap?: Record<string, MasterOptions>;
    noticeTemplates?: { higan: string; niibon: string };
    priests?: Priest[];
    deletedRecords?: DeletedRecordEntry[];
  },
  remoteData: SheetsImportResult
): MergedDatasetResult {
  // 0. Merge local and remote deleted records logs (Tombstones) to build an authoritative deletion map
  const localDeleted = localState.deletedRecords || loadDeletedRecordsLog();
  const remoteDeleted = remoteData.deletedRecords || [];
  const mergedDeletedRecords = mergeDeletedRecordsLogs(localDeleted, remoteDeleted);
  const deletedMap = buildDeletedTimestampMap(mergedDeletedRecords);

  // 1. Merge Households and nested FamilyMembers
  const hhMerge = mergeHouseholds(localState.households || [], remoteData.households || [], deletedMap);

  // Extract merged family members from households and standalone lists
  const localFamilies = localState.familyMembers || (localState.households ? localState.households.flatMap((h) => h.familyMembers || []) : []);
  const remoteFamilies = remoteData.familyMembers || (remoteData.households ? remoteData.households.flatMap((h) => h.familyMembers || []) : []);
  const fmMerge = mergeFamilyMembers(localFamilies, remoteFamilies, deletedMap);

  // 2. Merge PastRecords
  const prMerge = mergeGenericEntityList<PastRecord>(localState.pastRecords || [], remoteData.pastRecords || [], deletedMap);

  // 3. Merge MemorialServices
  const msMerge = mergeGenericEntityList<MemorialService>(localState.memorialServices || [], remoteData.memorialServices || [], deletedMap);

  // 4. Merge TempleTodos
  const tdMerge = mergeGenericEntityList<TempleTodo>(localState.templeTodos || [], remoteData.templeTodos || [], deletedMap);

  // 5. Merge Transactions
  const txMerge = mergeGenericEntityList<Transaction>(localState.transactions || [], remoteData.transactions || [], deletedMap);

  // 6. Merge Temples & TempleInfo
  const mergedTemples = mergeTemples(localState.temples || [], remoteData.temples || []);
  const localMainTemple = (localState.temples && localState.temples.find((t) => t.isMain)) || localState.templeInfo;
  const remoteMainTemple = (remoteData.temples && remoteData.temples.find((t) => t.isMain)) || remoteData.templeInfo;
  const mergedMainTemple = mergedTemples.find((t) => t.isMain) || mergedTemples[0];

  const localInfoTs = getRecordAuditTimestamp(localMainTemple);
  const remoteInfoTs = getRecordAuditTimestamp(remoteMainTemple);
  let mergedTempleInfo: TempleInfo;
  if (!remoteMainTemple || !remoteMainTemple.name) {
    mergedTempleInfo = localMainTemple || localState.templeInfo;
  } else if (localInfoTs >= remoteInfoTs) {
    mergedTempleInfo = {
      ...remoteMainTemple,
      ...localMainTemple,
      name: localMainTemple?.name || remoteMainTemple?.name || INITIAL_TEMPLE_INFO.name,
      address: localMainTemple?.address !== undefined && localMainTemple?.address !== '' ? localMainTemple.address : (remoteMainTemple?.address || ''),
      phone: localMainTemple?.phone !== undefined && localMainTemple?.phone !== '' ? localMainTemple.phone : (remoteMainTemple?.phone || ''),
      postalCode: localMainTemple?.postalCode !== undefined && localMainTemple?.postalCode !== '' ? localMainTemple.postalCode : (remoteMainTemple?.postalCode || ''),
      fax: localMainTemple?.fax !== undefined && localMainTemple?.fax !== '' ? localMainTemple.fax : (remoteMainTemple?.fax || ''),
      website: localMainTemple?.website !== undefined && localMainTemple?.website !== '' ? localMainTemple.website : (remoteMainTemple?.website || ''),
      chiefPriest: localMainTemple?.chiefPriest !== undefined && localMainTemple?.chiefPriest !== '' ? localMainTemple.chiefPriest : (remoteMainTemple?.chiefPriest || ''),
      sect: localMainTemple?.sect !== undefined && localMainTemple?.sect !== '' ? localMainTemple.sect : (remoteMainTemple?.sect || ''),
      mountainName: localMainTemple?.mountainName !== undefined && localMainTemple?.mountainName !== '' ? localMainTemple.mountainName : (remoteMainTemple?.mountainName || ''),
      bankInfo: localMainTemple?.bankInfo !== undefined && localMainTemple?.bankInfo !== '' ? localMainTemple.bankInfo : (remoteMainTemple?.bankInfo || ''),
      bonSeason: localMainTemple?.bonSeason || remoteMainTemple?.bonSeason,
      tobaType1: localMainTemple?.tobaType1 !== undefined ? localMainTemple.tobaType1 : remoteMainTemple?.tobaType1,
      tobaType2: localMainTemple?.tobaType2 !== undefined ? localMainTemple.tobaType2 : remoteMainTemple?.tobaType2,
      tobaType3: localMainTemple?.tobaType3 !== undefined ? localMainTemple.tobaType3 : remoteMainTemple?.tobaType3,
      updatedAt: localMainTemple?.updatedAt || remoteMainTemple?.updatedAt,
      updatedDate: localMainTemple?.updatedDate || remoteMainTemple?.updatedDate,
      updatedTime: localMainTemple?.updatedTime || remoteMainTemple?.updatedTime,
    };
  } else {
    mergedTempleInfo = {
      ...localMainTemple,
      ...remoteMainTemple,
      name: remoteMainTemple?.name || localMainTemple?.name || INITIAL_TEMPLE_INFO.name,
      address: remoteMainTemple?.address !== undefined && remoteMainTemple?.address !== '' ? remoteMainTemple.address : (localMainTemple?.address || ''),
      phone: remoteMainTemple?.phone !== undefined && remoteMainTemple?.phone !== '' ? remoteMainTemple.phone : (localMainTemple?.phone || ''),
      postalCode: remoteMainTemple?.postalCode !== undefined && remoteMainTemple?.postalCode !== '' ? remoteMainTemple.postalCode : (localMainTemple?.postalCode || ''),
      fax: remoteMainTemple?.fax !== undefined && remoteMainTemple?.fax !== '' ? remoteMainTemple.fax : (localMainTemple?.fax || ''),
      website: remoteMainTemple?.website !== undefined && remoteMainTemple?.website !== '' ? remoteMainTemple.website : (localMainTemple?.website || ''),
      chiefPriest: remoteMainTemple?.chiefPriest !== undefined && remoteMainTemple?.chiefPriest !== '' ? remoteMainTemple.chiefPriest : (localMainTemple?.chiefPriest || ''),
      sect: remoteMainTemple?.sect !== undefined && remoteMainTemple?.sect !== '' ? remoteMainTemple.sect : (localMainTemple?.sect || ''),
      mountainName: remoteMainTemple?.mountainName !== undefined && remoteMainTemple?.mountainName !== '' ? remoteMainTemple.mountainName : (localMainTemple?.mountainName || ''),
      bankInfo: remoteMainTemple?.bankInfo !== undefined && remoteMainTemple?.bankInfo !== '' ? remoteMainTemple.bankInfo : (localMainTemple?.bankInfo || ''),
      bonSeason: remoteMainTemple?.bonSeason || localMainTemple?.bonSeason,
      tobaType1: remoteMainTemple?.tobaType1 !== undefined ? remoteMainTemple.tobaType1 : localMainTemple?.tobaType1,
      tobaType2: remoteMainTemple?.tobaType2 !== undefined ? remoteMainTemple.tobaType2 : localMainTemple?.tobaType2,
      tobaType3: remoteMainTemple?.tobaType3 !== undefined ? remoteMainTemple.tobaType3 : localMainTemple?.tobaType3,
      updatedAt: remoteMainTemple?.updatedAt || localMainTemple?.updatedAt,
      updatedDate: remoteMainTemple?.updatedDate || localMainTemple?.updatedDate,
      updatedTime: remoteMainTemple?.updatedTime || localMainTemple?.updatedTime,
    };
  }

  if (mergedMainTemple) {
    mergedTempleInfo = {
      ...mergedTempleInfo,
      ...mergedMainTemple,
    };
  }

  // 7. Merge MasterOptions
  const mergedMasterOptions = mergeMasterOptions(localState.masterOptions, remoteData.masterOptions);
  const mergedTempleMasterOptionsMap = mergeTempleMasterOptionsMaps(
    localState.templeMasterOptionsMap || {},
    remoteData.templeMasterOptionsMap || {}
  );

  // 8. Merge NoticeTemplates (Prioritize local user changes so deleted or updated notices persist)
  const mergedNoticeTemplates = localState.noticeTemplates || remoteData.noticeTemplates;

  // 9. Merge Priests
  const mergePriestsList = (localP: Priest[] = [], remoteP: Priest[] = []): Priest[] => {
    const map = new Map<string, Priest>();
    localP.forEach((p) => {
      if (p.id) map.set(p.id, p);
    });
    remoteP.forEach((p) => {
      if (p.id) {
        const existing = map.get(p.id);
        map.set(p.id, existing ? { ...existing, ...p } : p);
      }
    });
    return Array.from(map.values());
  };
  const mergedPriests = mergePriestsList(localState.priests || [], remoteData.priests || []);

  // 10. Sanitize merged datasets to guarantee relational and ID integrity
  const sanitized = sanitizeAppDataset({
    households: hhMerge.merged,
    pastRecords: prMerge.merged,
    transactions: txMerge.merged,
    memorialServices: msMerge.merged,
    templeTodos: tdMerge.merged,
    familyMembers: fmMerge.merged,
    temples: mergedTemples,
    templeInfo: mergedTempleInfo,
  });

  const finalMasterOptions = mergedMasterOptions || mergeMasterOptionsWithData(
    EMPTY_MASTER_OPTIONS,
    sanitized.households,
    sanitized.transactions
  );

  const totalUpdatedFromRemote =
    hhMerge.updatedCount +
    prMerge.updatedCount +
    msMerge.updatedCount +
    tdMerge.updatedCount +
    txMerge.updatedCount +
    fmMerge.updatedCount;

  const totalAddedFromRemote =
    hhMerge.addedCount +
    prMerge.addedCount +
    msMerge.addedCount +
    tdMerge.addedCount +
    txMerge.addedCount +
    fmMerge.addedCount;

  const totalLocalKeptNewer =
    hhMerge.localKeptCount +
    prMerge.localKeptCount +
    msMerge.localKeptCount +
    tdMerge.localKeptCount +
    txMerge.localKeptCount;

  const totalDeletedSuppressed =
    hhMerge.suppressedCount +
    prMerge.suppressedCount +
    msMerge.suppressedCount +
    tdMerge.suppressedCount +
    txMerge.suppressedCount +
    fmMerge.suppressedCount;

  const stats: SyncMergeStats = {
    householdsUpdated: hhMerge.updatedCount,
    householdsAdded: hhMerge.addedCount,
    householdsLocalKept: hhMerge.localKeptCount,
    householdsDeletedSuppressed: hhMerge.suppressedCount,
    pastRecordsUpdated: prMerge.updatedCount,
    pastRecordsAdded: prMerge.addedCount,
    pastRecordsLocalKept: prMerge.localKeptCount,
    pastRecordsDeletedSuppressed: prMerge.suppressedCount,
    memorialsUpdated: msMerge.updatedCount,
    memorialsAdded: msMerge.addedCount,
    memorialsLocalKept: msMerge.localKeptCount,
    memorialsDeletedSuppressed: msMerge.suppressedCount,
    todosUpdated: tdMerge.updatedCount,
    todosAdded: tdMerge.addedCount,
    todosLocalKept: tdMerge.localKeptCount,
    transactionsUpdated: txMerge.updatedCount,
    transactionsAdded: txMerge.addedCount,
    transactionsLocalKept: txMerge.localKeptCount,
    familyMembersUpdated: fmMerge.updatedCount,
    familyMembersAdded: fmMerge.addedCount,
    totalUpdatedFromRemote,
    totalAddedFromRemote,
    totalLocalKeptNewer,
    totalDeletedSuppressed,
  };

  let summaryMessage = 'Googleシートと照会し、日時が新しいデータで同期を完了しました。';
  if (totalUpdatedFromRemote > 0 || totalAddedFromRemote > 0 || totalDeletedSuppressed > 0) {
    const parts: string[] = [];
    if (totalUpdatedFromRemote > 0) parts.push(`シートから最新更新 ${totalUpdatedFromRemote}件 取込`);
    if (totalAddedFromRemote > 0) parts.push(`シートの新規 ${totalAddedFromRemote}件 追加`);
    if (totalDeletedSuppressed > 0) parts.push(`削除同期反映 ${totalDeletedSuppressed}件 適用`);
    if (totalLocalKeptNewer > 0) parts.push(`端末側の最新データ ${totalLocalKeptNewer}件 を保持・反映`);
    summaryMessage = parts.join('、');
  }

  return {
    households: sanitized.households,
    familyMembers: sanitized.familyMembers,
    pastRecords: sanitized.pastRecords,
    memorialServices: sanitized.memorialServices,
    templeTodos: sanitized.templeTodos,
    transactions: sanitized.transactions,
    temples: mergedTemples,
    templeInfo: mergedTempleInfo,
    masterOptions: finalMasterOptions,
    templeMasterOptionsMap: mergedTempleMasterOptionsMap,
    noticeTemplates: mergedNoticeTemplates,
    priests: mergedPriests,
    deletedRecords: mergedDeletedRecords,
    stats,
    summaryMessage,
  };
}
