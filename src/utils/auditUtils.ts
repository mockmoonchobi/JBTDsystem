/**
 * レコードの作成日・作成時間・修正日・修正時間の管理ユーティリティ
 */

export interface AuditTimestamps {
  createdDate: string; // YYYY/MM/DD
  createdTime: string; // HH:mm:ss
  updatedDate: string; // YYYY/MM/DD
  updatedTime: string; // HH:mm:ss
}

/**
 * 初期起動時のダミーデータ用タイムスタンプ（全て 2000/01/01 00:00:00）
 */
export const INITIAL_DUMMY_AUDIT: AuditTimestamps = {
  createdDate: '2000/01/01',
  createdTime: '00:00:00',
  updatedDate: '2000/01/01',
  updatedTime: '00:00:00',
};

/**
 * 現在の日付・時刻を監査用フォーマットで取得
 */
export function getCurrentAuditFields(): { date: string; time: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');

  return {
    date: `${y}/${m}/${d}`,
    time: `${hh}:${mm}:${ss}`,
  };
}

/**
 * 日付・時刻文字列の正規化
 */
export function normalizeAuditDate(val?: any): string {
  if (!val) return '';
  const str = String(val).trim();
  if (!str) return '';
  if (str.includes('T')) {
    return str.split('T')[0].replace(/-/g, '/');
  }
  if (str.includes(' ')) {
    return str.split(' ')[0].replace(/-/g, '/');
  }
  return str.replace(/-/g, '/');
}

export function normalizeAuditTime(val?: any): string {
  if (!val) return '';
  const str = String(val).trim();
  if (!str) return '';
  if (str.includes('T')) {
    const timePart = str.split('T')[1];
    return timePart.slice(0, 8);
  }
  if (str.includes(' ')) {
    const timePart = str.split(' ')[1];
    return timePart.slice(0, 8);
  }
  return str;
}

/**
 * 新規作成レコードに作成日・作成時間・修正日・修正時間を付与
 */
export function withCreationAudit<T extends { createdDate?: string; createdTime?: string; updatedDate?: string; updatedTime?: string; createdAt?: string }>(
  item: T
): T {
  const now = getCurrentAuditFields();
  const createdDate = item.createdDate ? normalizeAuditDate(item.createdDate) : (item.createdAt ? normalizeAuditDate(item.createdAt) : now.date);
  const createdTime = item.createdTime ? normalizeAuditTime(item.createdTime) : (item.createdAt && item.createdAt.includes('T') ? normalizeAuditTime(item.createdAt) : (item.createdAt && item.createdAt.includes(' ') ? normalizeAuditTime(item.createdAt) : now.time));
  const updatedDate = item.updatedDate ? normalizeAuditDate(item.updatedDate) : now.date;
  const updatedTime = item.updatedTime ? normalizeAuditTime(item.updatedTime) : now.time;

  return {
    ...item,
    createdDate,
    createdTime,
    updatedDate,
    updatedTime,
    createdAt: item.createdAt || `${createdDate.replace(/\//g, '-')}T${createdTime}`,
  };
}

/**
 * 既存更新レコードの修正日・修正時間を最新化し、作成日・作成時間を維持
 */
export function withUpdateAudit<T extends { createdDate?: string; createdTime?: string; updatedDate?: string; updatedTime?: string; createdAt?: string }>(
  item: T,
  existingItem?: T
): T {
  const now = getCurrentAuditFields();
  const createdDate = existingItem?.createdDate 
    ? normalizeAuditDate(existingItem.createdDate)
    : (item.createdDate 
      ? normalizeAuditDate(item.createdDate)
      : (existingItem?.createdAt 
        ? normalizeAuditDate(existingItem.createdAt) 
        : (item.createdAt 
          ? normalizeAuditDate(item.createdAt) 
          : now.date)));

  const createdTime = existingItem?.createdTime
    ? normalizeAuditTime(existingItem.createdTime)
    : (item.createdTime
      ? normalizeAuditTime(item.createdTime)
      : (existingItem?.createdAt && (existingItem.createdAt.includes('T') || existingItem.createdAt.includes(' '))
        ? normalizeAuditTime(existingItem.createdAt)
        : (item.createdAt && (item.createdAt.includes('T') || item.createdAt.includes(' '))
          ? normalizeAuditTime(item.createdAt)
          : now.time)));

  return {
    ...item,
    createdDate,
    createdTime,
    updatedDate: now.date,
    updatedTime: now.time,
    createdAt: item.createdAt || existingItem?.createdAt || `${createdDate.replace(/\//g, '-')}T${createdTime}`,
  };
}

/**
 * 他データベース・外部取込時の監査フィールド適用
 * 取込データに作成日・作成時間・修正日・修正時間がない場合は「取込時の日時」を設定する
 */
export function withImportAudit<T extends { createdDate?: string; createdTime?: string; updatedDate?: string; updatedTime?: string; createdAt?: string }>(
  item: T,
  importTimestamp?: { date: string; time: string }
): T {
  const now = importTimestamp || getCurrentAuditFields();
  const rawCDate = item.createdDate ? normalizeAuditDate(item.createdDate) : (item.createdAt ? normalizeAuditDate(item.createdAt) : '');
  const createdDate = rawCDate || now.date;

  const rawCTime = item.createdTime ? normalizeAuditTime(item.createdTime) : (item.createdAt && (item.createdAt.includes('T') || item.createdAt.includes(' ')) ? normalizeAuditTime(item.createdAt) : '');
  const createdTime = rawCTime || now.time;

  const rawUDate = item.updatedDate ? normalizeAuditDate(item.updatedDate) : '';
  const updatedDate = rawUDate || now.date;

  const rawUTime = item.updatedTime ? normalizeAuditTime(item.updatedTime) : '';
  const updatedTime = rawUTime || now.time;

  return {
    ...item,
    createdDate,
    createdTime,
    updatedDate,
    updatedTime,
    createdAt: item.createdAt || `${createdDate.replace(/\//g, '-')}T${createdTime}`,
  };
}

/**
 * 監査フィールド用ヘッダー配列
 */
export const AUDIT_FIELD_HEADERS = ['作成日', '作成時間', '修正日', '修正時間'] as const;

/**
 * レコードオブジェクトから監査行セル配列を取得
 */
export function getAuditRowValues(item?: { createdDate?: string; createdTime?: string; updatedDate?: string; updatedTime?: string; createdAt?: string }): [string, string, string, string] {
  if (!item) {
    const now = getCurrentAuditFields();
    return [now.date, now.time, now.date, now.time];
  }
  const now = getCurrentAuditFields();
  const createdDate = item.createdDate ? normalizeAuditDate(item.createdDate) : (item.createdAt ? normalizeAuditDate(item.createdAt) : now.date);
  const createdTime = item.createdTime ? normalizeAuditTime(item.createdTime) : (item.createdAt && (item.createdAt.includes('T') || item.createdAt.includes(' ')) ? normalizeAuditTime(item.createdAt) : now.time);
  const updatedDate = item.updatedDate ? normalizeAuditDate(item.updatedDate) : createdDate;
  const updatedTime = item.updatedTime ? normalizeAuditTime(item.updatedTime) : createdTime;

  return [createdDate, createdTime, updatedDate, updatedTime];
}

