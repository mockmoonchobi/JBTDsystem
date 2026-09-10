import { useState, useSyncExternalStore } from 'react';
import { hasStorageFailures, retryFailedStorageWrites, subscribeStorageFailures } from '../utils/storageUtils';

export function StorageFailureNotice() {
  const failed = useSyncExternalStore(subscribeStorageFailures, hasStorageFailures, () => false);
  const [retrying, setRetrying] = useState(false);
  if (!failed) return null;
  return (
    <div role="alert" className="fixed bottom-20 left-3 right-3 z-[10000] rounded-lg border border-red-700 bg-red-50 p-4 text-sm text-red-950 shadow-lg print:hidden">
      <p>端末への保存に失敗しました。画面を閉じる前にExcelへ書き出すか、Googleシートへの同期完了を確認してください。</p>
      <button type="button" disabled={retrying} className="mt-2 rounded border border-red-800 px-3 py-1 disabled:opacity-50" onClick={async () => {
        setRetrying(true);
        try { await retryFailedStorageWrites(); } finally { setRetrying(false); }
      }}>{retrying ? '保存中…' : '端末への保存を再試行'}</button>
    </div>
  );
}
