import type { Grid } from './rowSyncPlan';

const collator = new Intl.Collator('ja', { numeric: true, sensitivity: 'base' });
const text = (v: unknown) => String(v ?? '').trim();
const kana = (v: unknown) => text(v).normalize('NFKC').replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));
const dateKey = (v: unknown) => {
  const s = text(v), match = s.match(/^(\d{4})[\/年.-](\d{1,2})[\/月.-](\d{1,2})/);
  return match ? `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}` : '\uffff' + s;
};
export const SORTED_TABLES = ['檀家名簿', '過去帳', '出納・会計', '出納アーカイブ', '寺院ToDo', '法事予約'];

/** Return a permutation; row contents and all relationship IDs remain intact. */
export function tableOrder(name: string, grid: Grid): number[] {
  const indices = grid.slice(1).map((_, i) => i + 1);
  if (!SORTED_TABLES.includes(name) || !grid.length) return indices;
  const header = grid[0].map(text);
  const column = (...names: string[]) => names.map(n => header.indexOf(n)).find(i => i >= 0) ?? -1;
  const temple = column('所属寺院ID', '所属寺院');
  const grouped = ['檀家名簿', '過去帳', '出納・会計', '出納アーカイブ'].includes(name);
  const reading = column('フリガナ', 'ふりがな');
  const person = column('世帯主名', '施主名');
  const date = name === '過去帳' ? column('命日 (没年月日)', '命日', '没年月日') : column('日付', '予定日', '期日');
  const time = column('開始時刻', '予定時刻');
  if (name === '檀家名簿' ? reading < 0 && person < 0 : date < 0) return indices;
  return indices.sort((a, b) => {
    const x = grid[a], y = grid[b];
    const emptyX = !x.some(v => text(v)), emptyY = !y.some(v => text(v));
    if (emptyX !== emptyY) return emptyX ? 1 : -1;
    if (grouped) {
      const t = collator.compare(text(x[temple]), text(y[temple]));
      if (t) return t;
    }
    const kx = name === '檀家名簿' ? kana(x[reading]) || kana(x[person]) || '\uffff' : dateKey(x[date]);
    const ky = name === '檀家名簿' ? kana(y[reading]) || kana(y[person]) || '\uffff' : dateKey(y[date]);
    return collator.compare(kx, ky) || (time >= 0 ? collator.compare(text(x[time]), text(y[time])) : 0) || a - b;
  });
}
export function sortTableGrid(name: string, grid: Grid): Grid {
  return grid.length ? [grid[0], ...tableOrder(name, grid).map(i => grid[i])] : [];
}

/** Temporary numeric ranks make Sheets use precisely the same order as Excel. */
export function tableSortRequests(sheetId: number, columnCount: number, order: number[]) {
  const rank = new Array(order.length);
  order.forEach((oldIndex, i) => { rank[oldIndex - 1] = i; });
  return [
    { appendDimension: { sheetId, dimension: 'COLUMNS', length: 1 } },
    { updateCells: { start: { sheetId, rowIndex: 1, columnIndex: columnCount }, rows: rank.map(n => ({ values: [{ userEnteredValue: { numberValue: n } }] })), fields: 'userEnteredValue' } },
    { sortRange: { range: { sheetId, startRowIndex: 1, endRowIndex: order.length + 1, startColumnIndex: 0, endColumnIndex: columnCount + 1 }, sortSpecs: [{ dimensionIndex: columnCount, sortOrder: 'ASCENDING' }] } },
    { deleteDimension: { range: { sheetId, dimension: 'COLUMNS', startIndex: columnCount, endIndex: columnCount + 1 } } },
  ];
}
