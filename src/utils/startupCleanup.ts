import { safeStorage, idbClear, idbRemove, clearMemoryStateCache } from './storageUtils';
import { clearDeletedRecordsLog } from './deletedRecordsLog';
import { clearPendingAudit } from './pendingAudit';
import { clearBatchAccountingData, clearBatchAccountingEntries } from './batchAccountingUtils';

/**
 * 各立ち上げ時（チュートリアル、データ無し新規、ファイル読込、Googleシート連携前）に
 * 端末側のキャッシュ、前回の操作履歴ログ、バックアップスナップショット、未送信監査キュー等を
 * 完全に消去し、前回のセッションや別連携先（Googleシート等）のデータが混入・残存しないようにする。
 */
export async function clearAllStartupCaches(): Promise<void> {
  // 1. 操作履歴（削除・変更・作成ログ）の完全消去
  try {
    clearDeletedRecordsLog();
  } catch (e) {
    console.warn('[clearAllStartupCaches] clearDeletedRecordsLog error:', e);
  }

  // 2. 未送信監査ログ（pending audit）の完全消去
  try {
    await clearPendingAudit();
  } catch (e) {
    console.warn('[clearAllStartupCaches] clearPendingAudit error:', e);
  }

  // 3. 一括会計キャッシュの消去
  try {
    clearBatchAccountingData();
    clearBatchAccountingEntries();
  } catch (e) {
    console.warn('[clearAllStartupCaches] clearBatchAccountingData error:', e);
  }

  // 4. セーフティスナップショット・復元用バックアップの完全削除
  try {
    await idbRemove('temple_safety_snapshot');
    await idbRemove('temple_backup_before_sync');
  } catch (_) {}
  safeStorage.removeItem('temple_safety_snapshot');
  safeStorage.removeItem('temple_backup_before_sync');

  // 5. UI設定・抽出・並び替えキャッシュの消去
  safeStorage.removeItem('household_sort_key');
  safeStorage.removeItem('household_sort_order');
  safeStorage.removeItem('temple_selected_print_ids');
  safeStorage.removeItem('temple_excluded_households');
  safeStorage.removeItem('jbtd-sync-review-reason');
  safeStorage.removeItem('renge_shared_invite_sheet_id');

  try {
    sessionStorage.removeItem('renge_is_shared_mode');
    sessionStorage.removeItem('renge_shared_sheet_id');
  } catch (_) {}

  // 6. IndexedDB を完全初期化（テーブル・履歴・差分ジャーナル・行同期キューの完全クリア）
  try {
    await idbClear();
  } catch (e) {
    console.warn('[clearAllStartupCaches] idbClear error:', e);
  }

  // 7. インメモリ状態キャッシュの完全クリア
  try {
    clearMemoryStateCache();
  } catch (e) {
    console.warn('[clearAllStartupCaches] clearMemoryStateCache error:', e);
  }
}
