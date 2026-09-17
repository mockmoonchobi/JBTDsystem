export function showYagoInList(households: { yago?: string }[], preference?: boolean): boolean {
  return preference ?? households.some(h => !!h.yago?.trim());
}
