export function importChanges<T extends { id: string }>(before: T[], after: T[]) {
  const old = new Map(before.map(row => [row.id, row]));
  const next = new Map(after.map(row => [row.id, row]));
  const added = after.filter(row => !old.has(row.id));
  const updated = after.filter(row => old.has(row.id) && JSON.stringify(old.get(row.id)) !== JSON.stringify(row));
  const deleted = before.filter(row => !next.has(row.id));
  return { added, updated, deleted };
}
