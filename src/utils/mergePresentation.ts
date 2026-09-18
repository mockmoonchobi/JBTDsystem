import { Dataset, MergeConflict, mergeTableLabels, stableMergeValue } from './threeWaySheetsMerge';

const hidden = /(^id$|Id$|Ids$|^qrToken$|^receiptNumber$|^(created|updated|deleted)(At|Date|Time|Timestamp)$|^fingerprint$|^deviceInfo$)/;
const accountingFields = ['date', 'type', 'category', 'amount', 'description'];
const recordTitle = (row: any, table: string) => table === 'transactions'
  ? [row?.date, row?.category, (row?.notes ?? row?.description)].filter(Boolean).join(' ／ ')
  : row?.familyHead || row?.dharmaName || row?.name || row?.title || '';
// Presentation only: IDs and complete records remain in the actual merge plan.
export function presentValue(value: any, table = ''): any {
  if (Array.isArray(value)) return value.map(v => presentValue(v, table));
  if (!value || typeof value !== 'object') return value;
  if (table === 'transactions' && ('amount' in value || 'category' in value)) {
    value = { ...value, description: value.notes ?? value.description };
  }
  const keys = table === 'transactions' && ('amount' in value || 'category' in value)
    ? accountingFields : Object.keys(value).filter(k => !hidden.test(k));
  return Object.fromEntries(keys.filter(k => k in value).map(k => [k,
    k === 'type' && ['income', 'expense'].includes(value[k]) ? (value[k] === 'income' ? '収入' : '支出') :
    k === 'amount' && typeof value[k] === 'number' ? value[k].toLocaleString('ja-JP') + '円' :
    presentValue(value[k], mergeTableLabels[k] ? k : table)]));
}
export function changedValues(before: any, after: any, table = '') {
  const a = presentValue(before, table), b = presentValue(after, table);
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) || Array.isArray(b)) return [a, b];
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(k => stableMergeValue(a[k]) !== stableMergeValue(b[k]));
  return [Object.fromEntries(keys.map(k => [k, a[k]])), Object.fromEntries(keys.map(k => [k, b[k]]))];
}
export function presentConflict(conflict: MergeConflict, local: Dataset, remote: Dataset) {
  const path: string[] = JSON.parse(conflict.key), table = path[0];
  const record = (local[table] || []).find?.((r: any) => r.id === path[1]) || (remote[table] || []).find?.((r: any) => r.id === path[1]);
  const context = recordTitle(record, table);
  const label = conflict.label.replace(/\s*\[[^\]]*\]/g, '').replace(/\b(?:TX|DK|K\d+|PR|H)-[\w-]+\b/g, '').replace(/\s*\/\s*（/g, '（');
  const [l, r] = changedValues(conflict.local, conflict.remote, table);
  let base = presentValue(conflict.base, table);
  if (l && r && typeof l === 'object' && typeof r === 'object' && !Array.isArray(l) && base && typeof base === 'object') base = Object.fromEntries(Object.keys(l).map(k => [k, base[k]]));
  const field = path.at(-1) || '';
  if (path.length > 2 && hidden.test(field)) {
    const related = field === 'templeId' ? 'temples' : field === 'householdId' ? 'households' : '';
    const resolve = (value: any) => {
      if (value === undefined || value === '') return value;
      const row = related && [...(local[related] || []), ...(remote[related] || [])].find(r => r.id === value);
      return row ? recordTitle(row, related) : '管理情報に変更があります';
    };
    return { label: `${mergeTableLabels[table] || table} ／ ${context}（関連情報）`, base: resolve(conflict.base), local: resolve(conflict.local), remote: resolve(conflict.remote) };
  }
  const detail = path.length > 2 ? label.split(' / ').at(-1) : '';
  return { label: context ? `${mergeTableLabels[table] || table} ／ ${context}${detail ? ' ／ ' + detail : ''}` : label, base, local: l, remote: r };
}
export function presentChanges(changes: Dataset): Dataset {
  return Object.fromEntries(Object.entries(changes).map(([table, rows]) => [table, Array.isArray(rows) ? rows.map(row => {
    const [before, after] = changedValues(row['変更前'], row['変更後'], table);
    return { '対象': recordTitle(row['変更後'] || row['変更前'], table), '処理': row['処理'], ...(row['変更前'] !== undefined ? { '変更前': before } : {}), ...(row['変更後'] !== undefined ? { '変更後': after } : {}) };
  }) : presentValue(rows, table)]));
}
