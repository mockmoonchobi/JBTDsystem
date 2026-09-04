import { DeletedRecordEntry, DeletedEntityType } from '../types';
import { safeStorage, saveJsonState, loadJsonState } from './storageUtils';

export const MAX_DELETED_LOG_LENGTH = 1000;
const STORAGE_KEY = 'temple_deleted_records_log';

/**
 * Normalizes operator name. Defaults empty or legacy "寺院関係者" to "管理者".
 */
export function normalizeLogOperator(operator?: string): string {
  if (!operator) return '管理者';
  const clean = operator.trim();
  if (!clean || clean === '寺院関係者') {
    return '管理者';
  }
  return clean;
}

/**
 * Loads deleted records log from localStorage
 */
export function loadDeletedRecordsLog(): DeletedRecordEntry[] {
  const loaded = loadJsonState<DeletedRecordEntry[]>(STORAGE_KEY, []);
  if (!Array.isArray(loaded)) return [];
  return loaded
    .filter((entry) => entry && entry.id && (entry.deletedTimestamp > 0 || !!entry.deletedAt))
    .map((entry) => ({
      ...entry,
      operator: normalizeLogOperator(entry.operator),
    }));
}

/**
 * Saves deleted records log to localStorage (capped at MAX_DELETED_LOG_LENGTH)
 */
export function saveDeletedRecordsLog(entries: DeletedRecordEntry[]): void {
  const clean = entries
    .filter((entry) => entry && entry.id && (entry.deletedTimestamp > 0 || !!entry.deletedAt))
    .map((entry) => ({
      ...entry,
      id: entry.id.trim(),
      operator: normalizeLogOperator(entry.operator),
      deletedTimestamp: entry.deletedTimestamp > 0
        ? entry.deletedTimestamp
        : (entry.deletedAt ? new Date(entry.deletedAt).getTime() : Date.now()) || Date.now(),
    }))
    .sort((a, b) => b.deletedTimestamp - a.deletedTimestamp)
    .slice(0, MAX_DELETED_LOG_LENGTH);
  saveJsonState(STORAGE_KEY, clean);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('temple_deleted_records_changed', { detail: clean }));
  }
}

/**
 * Clears the deleted records log
 */
export function clearDeletedRecordsLog(): void {
  saveJsonState(STORAGE_KEY, []);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('temple_deleted_records_changed', { detail: [] }));
  }
}

/**
 * Records an operation (create, update, delete, batch) in the unified audit log
 */
export function recordOperationLog(
  id: string,
  entityType: DeletedEntityType,
  actionType: 'create' | 'update' | 'delete' | 'undo' | 'batch_delete' | 'batch_create' | 'wipe',
  label?: string,
  templeId?: string,
  operator?: string,
  deviceInfo?: string
): DeletedRecordEntry[] {
  if (!id || !id.trim()) return loadDeletedRecordsLog();
  const cleanId = id.trim();
  const currentLogs = loadDeletedRecordsLog();
  const now = new Date();
  const nowMs = now.getTime();
  const logId = `LOG-${nowMs}-${Math.floor(Math.random() * 1000)}`;

  const newEntry: DeletedRecordEntry = {
    logId,
    id: cleanId,
    entityType,
    deletedAt: now.toISOString(),
    deletedTimestamp: nowMs,
    label: label || `${entityType}:${cleanId}`,
    templeId,
    actionType,
    operator: normalizeLogOperator(operator),
    deviceInfo,
  };

  // Debounce duplicate identical logs fired within 3 seconds for the same record and action
  const filteredLogs = currentLogs.filter((e) => {
    const isSameTargetAndAction = e.id === cleanId && e.actionType === actionType;
    const isWithinDebounce = Math.abs(nowMs - (e.deletedTimestamp || 0)) < 3000;
    return !(isSameTargetAndAction && isWithinDebounce);
  });

  const updated = [newEntry, ...filteredLogs].slice(0, MAX_DELETED_LOG_LENGTH);
  saveDeletedRecordsLog(updated);
  return updated;
}

/**
 * Records a deleted record entry and returns the updated log
 */
export function recordDeletedRecord(
  id: string,
  entityType: DeletedEntityType,
  label?: string,
  templeId?: string,
  actionType: 'delete' | 'undo' | 'batch_delete' | 'wipe' = 'delete',
  operator?: string,
  deviceInfo?: string
): DeletedRecordEntry[] {
  return recordOperationLog(id, entityType, actionType, label, templeId, operator, deviceInfo);
}

/**
 * Records multiple deleted records in batch
 */
export function recordDeletedRecordsBatch(
  items: { id: string; entityType: DeletedEntityType; label?: string; templeId?: string }[],
  operator?: string,
  deviceInfo?: string
): DeletedRecordEntry[] {
  if (!items || items.length === 0) return loadDeletedRecordsLog();
  const currentLogs = loadDeletedRecordsLog();
  const now = new Date();
  const nowMs = now.getTime();
  const nowIso = now.toISOString();

  const newIds = new Set(items.map((i) => i.id.trim()));
  const newEntries: DeletedRecordEntry[] = items.map((i, idx) => ({
    logId: `LOG-${nowMs}-${idx}-${Math.floor(Math.random() * 1000)}`,
    id: i.id.trim(),
    entityType: i.entityType,
    deletedAt: nowIso,
    deletedTimestamp: nowMs,
    label: i.label || `${i.entityType}:${i.id}`,
    templeId: i.templeId,
    actionType: 'batch_delete',
    operator: normalizeLogOperator(operator),
    deviceInfo,
  }));

  const filtered = currentLogs.filter((entry) => !newIds.has(entry.id.trim()));
  const updated = [...newEntries, ...filtered].slice(0, MAX_DELETED_LOG_LENGTH);
  saveDeletedRecordsLog(updated);
  return updated;
}

/**
 * Unrecords a deleted record (used during Undo to restore)
 */
export function unrecordDeletedRecord(id: string): DeletedRecordEntry[] {
  if (!id) return loadDeletedRecordsLog();
  const cleanId = id.trim();
  const currentLogs = loadDeletedRecordsLog();
  const updated = currentLogs.filter((entry) => entry.id.trim() !== cleanId);
  saveDeletedRecordsLog(updated);
  return updated;
}

/**
 * Merges local and remote deleted & operation records logs, preserving all distinct operation entries
 */
export function mergeDeletedRecordsLogs(
  local: DeletedRecordEntry[] = [],
  remote: DeletedRecordEntry[] = []
): DeletedRecordEntry[] {
  const map = new Map<string, DeletedRecordEntry>();

  const processEntry = (entry: DeletedRecordEntry) => {
    if (!entry || !entry.id) return;
    const cleanId = entry.id.trim();
    const entryTs = entry.deletedTimestamp > 0
      ? entry.deletedTimestamp
      : (entry.deletedAt ? new Date(entry.deletedAt).getTime() : 0);
    const validTs = entryTs > 0 ? entryTs : Date.now();

    // Unique key for each operation log event: logId if available, otherwise recordId + actionType + rounded timestamp
    // (Round within 2000ms to eliminate exact duplicates across bidirectional sync rounds)
    const roundedTs = Math.floor(validTs / 2000) * 2000;
    const normalizedOp = normalizeLogOperator(entry.operator);
    const key = entry.logId && entry.logId.trim()
      ? entry.logId.trim()
      : `${cleanId}_${entry.actionType || 'delete'}_${roundedTs}_${normalizedOp}`;

    if (!map.has(key)) {
      map.set(key, {
        ...entry,
        id: cleanId,
        operator: normalizedOp,
        deletedTimestamp: validTs,
      });
    }
  };

  local.forEach(processEntry);
  remote.forEach(processEntry);

  const merged = Array.from(map.values())
    .sort((a, b) => b.deletedTimestamp - a.deletedTimestamp)
    .slice(0, MAX_DELETED_LOG_LENGTH);

  saveDeletedRecordsLog(merged);
  return merged;
}

/**
 * Builds a lookup map of { [recordId]: deletedTimestampMs }
 * Only treats deletion actions as suppression, and unsuppresses if re-created/updated
 */
export function buildDeletedTimestampMap(entries: DeletedRecordEntry[]): Map<string, number> {
  const map = new Map<string, number>();
  // Sort chronologically ascending to apply operations in sequence
  const sorted = [...entries].sort((a, b) => {
    const tsA = a.deletedTimestamp > 0 ? a.deletedTimestamp : (a.deletedAt ? new Date(a.deletedAt).getTime() : 0);
    const tsB = b.deletedTimestamp > 0 ? b.deletedTimestamp : (b.deletedAt ? new Date(b.deletedAt).getTime() : 0);
    return tsA - tsB;
  });

  sorted.forEach((e) => {
    if (!e || !e.id) return;
    const cleanId = e.id.trim();
    const ts = e.deletedTimestamp > 0
      ? e.deletedTimestamp
      : (e.deletedAt ? new Date(e.deletedAt).getTime() : 0);
    if (ts <= 0) return;

    if (e.actionType === 'create' || e.actionType === 'update' || e.actionType === 'undo' || e.actionType === 'batch_create') {
      map.delete(cleanId);
    } else {
      map.set(cleanId, ts);
    }
  });

  return map;
}

/**
 * Checks if a remote record should be skipped/suppressed because it was deleted locally or remotely
 */
export function isSuppressedByDeletion(
  recordId: string,
  recordAuditTimestampMs: number,
  deletedMap?: Map<string, number>
): boolean {
  if (!deletedMap || !recordId) return false;
  const cleanId = recordId.trim();
  const deletedTime = deletedMap.get(cleanId);
  if (deletedTime === undefined || deletedTime <= 0) return false;

  // If the record has no valid timestamp or was deleted at/after its modification, suppress it.
  // 2-second margin (2000ms) handles slight clock drift between creation and deletion calls.
  if (recordAuditTimestampMs <= 0) return true;
  return deletedTime >= (recordAuditTimestampMs - 2000);
}
