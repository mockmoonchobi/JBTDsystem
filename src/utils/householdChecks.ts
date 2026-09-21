import { Household, TempleProfile } from '../types';

export const CHECK_SLOTS = [1, 2, 3] as const;
export type CheckSlot = typeof CHECK_SLOTS[number];
export const CHECK_HEADERS = CHECK_SLOTS.map(n => `チェック項目${n}`);
export const CHECK_LABEL_HEADERS = CHECK_SLOTS.map(n => `チェック項目${n}名称`);
export const checkKey = (slot: CheckSlot): `check${CheckSlot}` => `check${slot}`;
export const checkLabelKey = (slot: CheckSlot): `checkLabel${CheckSlot}` => `checkLabel${slot}`;
export function parseHouseholdCheck(value: unknown): boolean {
  return /^(true|1|on|✓\s*on|✓|✔|済|有|○|〇|はい)$/i.test(String(value ?? '').trim());
}
export function getCheckSlots(temple?: Partial<TempleProfile> | null) {
  return CHECK_SLOTS.map(slot => ({slot, name: temple?.[checkLabelKey(slot)]?.trim() || ''})).filter(s => s.name);
}
export function checkedLabels(household: Partial<Household>, temple?: Partial<TempleProfile> | null) {
  return getCheckSlots(temple).filter(s => household[checkKey(s.slot)] === true).map(s => s.name);
}
export function readHouseholdChecks(headers: string[], row: unknown[]): Pick<Household, 'check1'|'check2'|'check3'> {
  return Object.fromEntries(CHECK_SLOTS.map((slot, i) => [checkKey(slot), parseHouseholdCheck(row[headers.indexOf(CHECK_HEADERS[i])]) ]));
}
export function readCheckLabels(headers: string[], row: unknown[]): Pick<TempleProfile, 'checkLabel1'|'checkLabel2'|'checkLabel3'> {
  return Object.fromEntries(CHECK_SLOTS.map((slot, i) => [checkLabelKey(slot), String(row[headers.indexOf(CHECK_LABEL_HEADERS[i])] ?? '').trim()]));
}
