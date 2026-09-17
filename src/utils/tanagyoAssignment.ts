import type { Household } from '../types';

export function setTanagyoParticipation<T extends Partial<Household>>(household: T, enabled: boolean): T {
  if (!!household.tanagyoMonthlyVisit === enabled) return household;
  return { ...household, tanagyoMonthlyVisit: enabled, tanagyoDate: '', tanagyoPriestId: '', tanagyoPriestName: '', tanagyoTimeSlot: '', tanagyoOrder: undefined };
}

export function updateTanagyoAssignment(h: Household, updates: Partial<Household>): Household {
  const next = {...h, ...updates};
  const routeChanged = (updates.tanagyoDate !== undefined && updates.tanagyoDate !== h.tanagyoDate)
    || (updates.tanagyoPriestId !== undefined && updates.tanagyoPriestId !== h.tanagyoPriestId)
    || (updates.tanagyoPriestName !== undefined && updates.tanagyoPriestName !== h.tanagyoPriestName);
  if (routeChanged) next.tanagyoOrder = undefined;
  if (!next.tanagyoDate) { next.tanagyoOrder = undefined; next.tanagyoTimeSlot = ''; }
  else if (!next.tanagyoTimeSlot) next.tanagyoTimeSlot = '午前';
  return next;
}

export function nextTanagyoOrder(households: Household[]): number {
  return households.reduce((max, h) => Number.isSafeInteger(h.tanagyoOrder) && h.tanagyoOrder! > max ? h.tanagyoOrder! : max, 0) + 1;
}

export function numberUnassignedTanagyo(households: Household[], targetIds: Set<string>, id: string): Household[] {
  const target = households.find(h => h.id === id && targetIds.has(h.id));
  if (!target || !target.tanagyoMonthlyVisit || !target.tanagyoDate || (target.tanagyoOrder ?? 0) > 0) return households;
  const order = nextTanagyoOrder(households.filter(h => targetIds.has(h.id)));
  return households.map(h => h.id === id ? {...h, tanagyoOrder: order} : h);
}

type AccountingDraft = { householdId: string; selected: boolean; amount: number; category: string; notes: string; alreadyRecorded: boolean };
export function reconcileTanagyoAccounting<T extends AccountingDraft>(previous: T[], fresh: T[]): T[] {
  const byId = new Map(previous.map(row => [row.householdId, row]));
  return fresh.map(row => {
    const old = byId.get(row.householdId);
    return old ? {...row, selected: row.alreadyRecorded && !old.alreadyRecorded ? false : old.selected, amount: old.amount, category: old.category, notes: old.notes} : {...row, selected: false};
  });
}

export function resetTanagyoNumbers(households: Household[], targetIds: Set<string>): Household[] {
  return households.map(h => targetIds.has(h.id) ? {...h, tanagyoOrder: undefined} : h);
}
export function resetTanagyoAccountingSelection<T extends {selected: boolean}>(rows: T[]): T[] {
  return rows.map(row => ({...row, selected: false}));
}
