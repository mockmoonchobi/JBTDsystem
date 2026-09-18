import { safeStorage } from './storageUtils';
let currentReason = '';
/** Keep this tab's diagnostic available even if browser storage is unavailable. */
export function recordSyncReason(reason: string) {
  currentReason = reason;
  safeStorage.setItem('jbtd-sync-review-reason', reason);
}
export function readSyncReason() { return currentReason; }
