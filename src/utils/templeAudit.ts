import type { TempleInfo } from '../types';

const auditKeys = new Set(['createdAt', 'createdDate', 'createdTime', 'updatedAt', 'updatedDate', 'updatedTime']);
export function templeValueKey(value: unknown): string {
  if (value == null || value === '') return 'null';
  if (Array.isArray(value)) return JSON.stringify(value.map(templeValueKey));
  if (typeof value === 'object') return JSON.stringify(Object.entries(value).filter(([, v]) => v != null && v !== '')
    .sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, templeValueKey(v)]));
  return JSON.stringify(value);
}
export function templeContentChanged(next: TempleInfo, previous?: TempleInfo): boolean {
  if (!previous) return true;
  const content = (value: TempleInfo) => Object.fromEntries(Object.entries(value).filter(([key]) => !auditKeys.has(key)));
  return templeValueKey(content(next)) !== templeValueKey(content(previous));
}
/** Called on an actual local edit only. Unknown creation dates remain unknown. */
export function stampTempleUpdate(next: TempleInfo, previous?: TempleInfo, now = new Date()): TempleInfo {
  if (previous && !templeContentChanged(next, previous)) return previous;
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(now);
  return { ...next,
    ...(previous ? { createdAt: previous.createdAt, createdDate: previous.createdDate, createdTime: previous.createdTime } : {}),
    updatedAt: now.toISOString(), updatedDate: date.replace(/-/g, '/'), updatedTime: time };
}
