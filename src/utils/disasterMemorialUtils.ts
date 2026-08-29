import { DisasterMemorialEvent } from '../types';
import { 
  normalizeDateInput, 
  getJapaneseEra, 
  getSpiritMemorialForDate, 
  isLeapYear 
} from './memorialCalculator';
import { getCurrentAuditFields, normalizeAuditDate, normalizeAuditTime } from './auditUtils';

export const DISASTER_MEMORIAL_STORAGE_KEY = 'temple_disaster_memorial_events_v1';

/**
 * 初期登録されている戦没・災害物故者命日データ
 */
export const DEFAULT_DISASTER_MEMORIAL_EVENTS: DisasterMemorialEvent[] = [
  {
    id: 'disaster-1',
    date: '1923/09/01',
    name: '関東大震災物故者精霊',
    notes: '大正12年 関東大震災',
    createdDate: '2024/01/01',
    createdTime: '00:00:00',
    updatedDate: '2024/01/01',
    updatedTime: '00:00:00',
  },
  {
    id: 'disaster-2',
    date: '1945/03/10',
    name: '東京大空襲横死者精霊',
    notes: '昭和20年 東京大空襲',
    createdDate: '2024/01/01',
    createdTime: '00:00:00',
    updatedDate: '2024/01/01',
    updatedTime: '00:00:00',
  },
  {
    id: 'disaster-3',
    date: '1945/08/06',
    name: '広島原爆横死者精霊',
    notes: '昭和20年 広島原爆投下',
    createdDate: '2024/01/01',
    createdTime: '00:00:00',
    updatedDate: '2024/01/01',
    updatedTime: '00:00:00',
  },
  {
    id: 'disaster-4',
    date: '1945/08/09',
    name: '長崎原爆横死者精霊',
    notes: '昭和20年 長崎原爆投下',
    createdDate: '2024/01/01',
    createdTime: '00:00:00',
    updatedDate: '2024/01/01',
    updatedTime: '00:00:00',
  },
  {
    id: 'disaster-5',
    date: '1945/08/15',
    name: '第二次世界大戦戦災物故者精霊',
    notes: '昭和20年 終戦の日',
    createdDate: '2024/01/01',
    createdTime: '00:00:00',
    updatedDate: '2024/01/01',
    updatedTime: '00:00:00',
  },
  {
    id: 'disaster-6',
    date: '2011/03/11',
    name: '東日本大震災物故者精霊',
    notes: '平成23年 東日本大震災',
    createdDate: '2024/01/01',
    createdTime: '00:00:00',
    updatedDate: '2024/01/01',
    updatedTime: '00:00:00',
  },
];

/**
 * 保存された戦没・災害物故者命日一覧を取得
 */
export function getSavedDisasterMemorialEvents(): DisasterMemorialEvent[] {
  if (typeof window === 'undefined') return DEFAULT_DISASTER_MEMORIAL_EVENTS;
  try {
    const raw = localStorage.getItem(DISASTER_MEMORIAL_STORAGE_KEY);
    if (!raw) return DEFAULT_DISASTER_MEMORIAL_EVENTS;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed.map((item, idx) => ({
        id: item.id || `disaster-${idx + 1}`,
        date: normalizeDateInput(item.date) || item.date || '',
        name: item.name || '',
        notes: item.notes || '',
        createdDate: item.createdDate || '2024/01/01',
        createdTime: item.createdTime || '00:00:00',
        updatedDate: item.updatedDate || item.createdDate || '2024/01/01',
        updatedTime: item.updatedTime || item.createdTime || '00:00:00',
      }));
    }
  } catch (e) {
    console.warn('Failed to load disaster memorial events from localStorage:', e);
  }
  return DEFAULT_DISASTER_MEMORIAL_EVENTS;
}

/**
 * 戦没・災害物故者命日一覧を保存
 */
export function saveDisasterMemorialEvents(events: DisasterMemorialEvent[]): void {
  if (typeof window === 'undefined') return;
  try {
    const audit = getCurrentAuditFields();
    const sanitized = events.map((ev, idx) => ({
      ...ev,
      id: ev.id || `disaster-${Date.now()}-${idx}`,
      date: normalizeDateInput(ev.date) || ev.date,
      name: ev.name.trim(),
      notes: ev.notes?.trim() || '',
      createdDate: ev.createdDate || audit.date,
      createdTime: ev.createdTime || audit.time,
      updatedDate: audit.date,
      updatedTime: audit.time,
    }));
    localStorage.setItem(DISASTER_MEMORIAL_STORAGE_KEY, JSON.stringify(sanitized));
    window.dispatchEvent(new CustomEvent('disasterMemorialEventsUpdated', { detail: sanitized }));
  } catch (e) {
    console.error('Failed to save disaster memorial events to localStorage:', e);
  }
}

export interface DisasterMemorialMatchResult {
  event: DisasterMemorialEvent;
  milestone: string; // 例: "十七回忌", "一周忌", "五十回忌", etc.
  titleReplacement: string; // 例: "東日本大震災物故者精霊　十七回忌" または "東日本大震災物故者精霊"
}

/**
 * 指定された日付（印刷対象日など）に合致する戦没・災害物故者命日設定を検索
 */
export function getDisasterMemorialForDate(
  events: DisasterMemorialEvent[],
  targetDate: Date | string
): DisasterMemorialMatchResult | null {
  if (!events || events.length === 0) return null;

  let targetY: number;
  let targetM: number;
  let targetD: number;

  if (targetDate instanceof Date) {
    targetY = targetDate.getFullYear();
    targetM = targetDate.getMonth() + 1;
    targetD = targetDate.getDate();
  } else {
    const norm = normalizeDateInput(targetDate);
    if (!norm) return null;
    const parts = norm.split('/');
    if (parts.length !== 3) return null;
    targetY = parseInt(parts[0], 10);
    targetM = parseInt(parts[1], 10);
    targetD = parseInt(parts[2], 10);
  }

  if (isNaN(targetY) || isNaN(targetM) || isNaN(targetD)) return null;

  const targetDateStr = `${targetY}/${String(targetM).padStart(2, '0')}/${String(targetD).padStart(2, '0')}`;

  for (const ev of events) {
    if (!ev || !ev.date || !ev.name) continue;
    const normEv = normalizeDateInput(ev.date);
    if (!normEv) continue;
    const evParts = normEv.split('/');
    if (evParts.length !== 3) continue;

    const evY = parseInt(evParts[0], 10);
    const evM = parseInt(evParts[1], 10);
    const evD = parseInt(evParts[2], 10);
    if (isNaN(evY) || isNaN(evM) || isNaN(evD)) continue;

    // 月・日のマッチング（うるう年2月29日対応）
    let isDateMatch = evM === targetM && evD === targetD;
    if (!isDateMatch && evM === 2 && evD === 29 && targetM === 2 && targetD === 28 && !isLeapYear(targetY)) {
      isDateMatch = true;
    }

    if (isDateMatch) {
      // 忌日・年忌計算
      const milestone = getSpiritMemorialForDate(normEv, targetDateStr);
      const titleReplacement = milestone ? `${ev.name}　${milestone}` : ev.name;

      return {
        event: ev,
        milestone,
        titleReplacement,
      };
    }
  }

  return null;
}

/**
 * Google Sheets / Excel 用のヘッダーと行データ生成
 */
export function convertDisasterEventsToRows(events: DisasterMemorialEvent[]): {
  headers: string[];
  rows: (string | number)[][];
} {
  const headers = [
    '設定ID',
    '命日・発生年月日',
    '命日和暦',
    '対象名称',
    '備考・由来',
    '作成日',
    '作成時間',
    '修正日',
    '修正時間',
  ];

  const rows = events.map((ev) => {
    const norm = normalizeDateInput(ev.date);
    let eraStr = '';
    if (norm) {
      const p = norm.split('/');
      if (p.length === 3) {
        eraStr = getJapaneseEra(parseInt(p[0], 10), parseInt(p[1], 10), parseInt(p[2], 10));
      }
    }
    return [
      ev.id,
      norm || ev.date,
      eraStr,
      ev.name,
      ev.notes || '',
      ev.createdDate || '',
      ev.createdTime || '',
      ev.updatedDate || '',
      ev.updatedTime || '',
    ];
  });

  return { headers, rows };
}

/**
 * Google Sheets / Excel から読み込んだ行データをパース
 */
export function parseDisasterEventsFromRows(rows: (string | number)[][]): DisasterMemorialEvent[] {
  if (!rows || rows.length <= 1) return DEFAULT_DISASTER_MEMORIAL_EVENTS;

  const headers = (rows[0] || []).map((h) => String(h || '').trim());
  const idIdx = headers.findIndex((h) => h.includes('ID') || h.includes('id'));
  const dateIdx = headers.findIndex((h) => h.includes('年月日') || h.includes('命日') || h.includes('日付'));
  const nameIdx = headers.findIndex((h) => h.includes('対象名称') || h.includes('名称') || h.includes('精霊名'));
  const notesIdx = headers.findIndex((h) => h.includes('備考') || h.includes('由来') || h.includes('メモ'));
  const cDateIdx = headers.findIndex((h) => h.includes('作成日'));
  const cTimeIdx = headers.findIndex((h) => h.includes('作成時間'));
  const uDateIdx = headers.findIndex((h) => h.includes('修正日') || h.includes('更新日'));
  const uTimeIdx = headers.findIndex((h) => h.includes('修正時間') || h.includes('更新時間'));

  const parsed: DisasterMemorialEvent[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    const rawDate = dateIdx !== -1 ? row[dateIdx] : row[1];
    const rawName = nameIdx !== -1 ? row[nameIdx] : row[3];
    if (!rawDate && !rawName) continue;

    const normDate = normalizeDateInput(String(rawDate || '')) || String(rawDate || '').trim();
    const name = String(rawName || '').trim();
    if (!name) continue;

    const id = String((idIdx !== -1 ? row[idIdx] : row[0]) || `disaster-${i}`).trim();
    const notes = String((notesIdx !== -1 ? row[notesIdx] : row[4]) || '').trim();

    const createdDate = normalizeAuditDate(cDateIdx !== -1 ? row[cDateIdx] : '') || '2024/01/01';
    const createdTime = normalizeAuditTime(cTimeIdx !== -1 ? row[cTimeIdx] : '') || '00:00:00';
    const updatedDate = normalizeAuditDate(uDateIdx !== -1 ? row[uDateIdx] : '') || createdDate;
    const updatedTime = normalizeAuditTime(uTimeIdx !== -1 ? row[uTimeIdx] : '') || createdTime;

    parsed.push({
      id,
      date: normDate,
      name,
      notes,
      createdDate,
      createdTime,
      updatedDate,
      updatedTime,
    });
  }

  return parsed.length > 0 ? parsed : DEFAULT_DISASTER_MEMORIAL_EVENTS;
}
