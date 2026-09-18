import type { MemorialService } from '../types';
export const RESERVATION_DETAILS_HEADER = '追加予約情報';
const fields = ['additionalDeceased', 'isAllDay', 'tobaItems', 'noticeText', 'receptionTime', 'isCompleted'] as const;
export function serializeReservationDetails(service: MemorialService): string {
  const value = Object.fromEntries(fields.filter(k => service[k] !== undefined).map(k => [k, service[k]]));
  return Object.keys(value).length ? JSON.stringify(value) : '';
}
export function parseReservationDetails(value: unknown): Partial<MemorialService> {
  if (value === '' || value == null) return {};
  try {
    const parsed = JSON.parse(String(value));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    for (const key of fields) {
      const v = parsed[key]; if (v === undefined) continue;
      if (key === 'additionalDeceased' || key === 'tobaItems') {
        if (!Array.isArray(v) || v.some(x => !x || typeof x !== 'object' || Array.isArray(x))) throw new Error();
      } else if (typeof v !== (key === 'isAllDay' || key === 'isCompleted' ? 'boolean' : 'string')) throw new Error();
    }
    return Object.fromEntries(fields.filter(k => parsed[k] !== undefined).map(k => [k, parsed[k]]));
  } catch { throw new Error('法事予約の追加情報を読み取れません。データを変更せず読込を停止しました。'); }
}
