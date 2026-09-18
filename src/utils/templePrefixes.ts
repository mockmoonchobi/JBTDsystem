import { PURGE_LEDGER, readPurgeLedger } from './purgeLedger';
import type { TempleProfile } from '../types';
import { loadJsonState, saveJsonState } from './storageUtils';
import type { Snapshot } from './rowSyncPlan';
const key = 'temple-prefix-reservations-v1';
type Registry = { temples: Record<string, string>; used: string[] };
const read = (): Registry => loadJsonState(key, { temples: {}, used: [] });
export const encodedTemplePrefix = (id: string): string | undefined => {
  const match = id.match(/^temple-sub-K(\d+)-/i) || id.match(/^temple-sub-(\d+)$/i);
  return match ? 'K' + Number(match[1]) + '-' : undefined;
};
export function savedTemplePrefix(id: string) { return read().temples[id]; }
export function rememberTemplePrefixes(snapshot: Snapshot) {
  const registry = read();
  const used = new Set(registry.used);
  for (const row of readPurgeLedger(snapshot[PURGE_LEDGER])) {
    if (row[3]) used.add(row[3]);
    if (row[0] === 'temple' && row[3]) registry.temples[row[1]] = row[3];
  }
  const evidence = new Map<string, Set<string>>();
  for (const [name, grid] of Object.entries(snapshot)) {
    if (!grid.length || name.startsWith('__JBTD')) continue;
    const h = grid[0].map(String), templeCol = h.indexOf('所属寺院ID');
    const idCol = h.findIndex(v => /^(檀家ID|世帯ID)$/.test(v));
    if (idCol < 0) continue;
    for (const row of grid.slice(1)) {
      const prefix = String(row[idCol] || '').match(/^(K\d+)-/i)?.[0].toUpperCase();
      if (!prefix) continue;
      used.add(prefix);
      const temple = String(row[templeCol] || '');
      if (temple) { if (!evidence.has(temple)) evidence.set(temple, new Set()); evidence.get(temple)!.add(prefix); }
    }
  }
  for (const grid of Object.values(snapshot)) {
    if (grid[0]?.[0] !== '寺院ID') continue;
    let subIndex = 0;
    for (const row of grid.slice(1)) {
      const id = String(row[0] || ''); if (!id) continue;
      if (String(row[1]).includes('本寺') || id === 'temple-main') continue;
      const observed = evidence.get(id);
      const prefix = (/^temple-sub-K/i.test(id) ? encodedTemplePrefix(id) : undefined) || (observed?.size === 1 ? [...observed][0] : undefined) || registry.temples[id] || encodedTemplePrefix(id) || 'K' + subIndex + '-';
      registry.temples[id] = prefix; used.add(prefix); subIndex++;
    }
  }
  registry.used = [...used]; saveJsonState(key, registry);
}
export function allocateTempleId(temples: TempleProfile[], extraIds: string[] = []): string {
  const registry = read(); const used = new Set(registry.used);
  temples.filter(t => !t.isMain && t.id !== 'temple-main').forEach((t, i) => { const p = registry.temples[t.id || ''] || encodedTemplePrefix(t.id || '') || 'K' + i + '-'; used.add(p); });
  extraIds.forEach(id => { const p = id.match(/^(K\d+)-/i)?.[0].toUpperCase(); if (p) used.add(p); });
  let number = 0; for (const p of used) { const n = Number(p.slice(1,-1)); if (Number.isSafeInteger(n)) number = Math.max(number, n + 1); }
  const prefix = 'K' + number + '-'; const id = 'temple-sub-' + prefix + crypto.randomUUID();
  registry.temples[id] = prefix; registry.used = [...used, prefix]; saveJsonState(key, registry); return id;
}
