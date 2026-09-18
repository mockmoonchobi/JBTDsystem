/** A successful HTTP response is not enough: every requested range must exist. */
export function readRangeValues(value: any): any[][] {
  if (!value || typeof value.range !== 'string' ||
      (value.values !== undefined && (!Array.isArray(value.values) || value.values.some((row: any) => !Array.isArray(row))))) {
    throw new Error('Googleシートの読込応答が不完全です。書き込みを停止しました。');
  }
  return value.values || [];
}

/** Read the allocated grid to its end. Empty intermediate ranges are not EOF. */
export async function readAllSheetData(
  sheets: any[], read: (ranges: string[]) => Promise<any[]>
): Promise<Map<string, { headers: string[]; rows: string[][] }>> {
  const result = new Map<string, { headers: string[]; rows: string[][] }>();
  const small = sheets.filter(sheet => sheet.properties.gridProperties.rowCount <= 2000);
  const quote = (title: string) => `'${title.replace(/'/g, "''")}'`;
  const checkedValues = (value: any, title: string) => {
    const values = readRangeValues(value);
    if (!value.range.startsWith(quote(title) + '!') && !value.range.startsWith(title + '!') && value.range !== quote(title)) {
      throw new Error('Googleシートの読込範囲が一致しません。読み込みを中止しました。');
    }
    return values;
  };
  const put = (title: string, values: any[][]) => result.set(title, {
    headers: (values[0] || []).map(value => String(value ?? '').trim()), rows: values.slice(1),
  });
  // Bound request size without masking failures with empty tables.
  for (let offset = 0; offset < small.length; offset += 20) {
    const batch = small.slice(offset, offset + 20);
    const values = await read(batch.map(sheet => quote(sheet.properties.title)));
    if (values.length !== batch.length) throw new Error('Googleシートの一部を完全に読み取れませんでした。');
    values.forEach((value, index) => put(batch[index].properties.title, checkedValues(value, batch[index].properties.title)));
  }
  const pages: { title: string; start: number; end: number; range: string }[] = [];
  const collected = new Map<string, any[][]>();
  for (const sheet of sheets) {
    const { title, gridProperties: { rowCount } } = sheet.properties;
    if (result.has(title)) continue;
    collected.set(title, []);
    for (let start = 1; start <= rowCount; start += 2000) {
      const end = Math.min(start + 1999, rowCount);
      pages.push({ title, start, end, range: quote(title) + '!A' + start + ':ZZ' + end });
    }
  }
  // Batch large-table pages too; do not spend one API request on every 2,000 rows.
  for (let offset = 0; offset < pages.length; offset += 20) {
    const batch = pages.slice(offset, offset + 20), values = await read(batch.map(p => p.range));
    if (values.length !== batch.length) throw new Error('Googleシートの一部を完全に読み取れませんでした。');
    values.forEach((value, index) => {
      const page = batch[index], chunk = checkedValues(value, page.title);
      const bounds = value.range.match(/!A(\d+):[A-Z]+(\d+)$/);
      if (!bounds || Number(bounds[1]) !== page.start || Number(bounds[2]) !== page.end || chunk.length > page.end - page.start + 1) throw new Error('Googleシートの読込範囲が一致しません。');
      const rows = collected.get(page.title)!;
      if (page.start === 1) rows.push(chunk[0] || [], ...chunk.slice(1));
      else rows.push(...chunk);
    });
  }
  for (const [title, rows] of collected) put(title, rows);
  return result;
}

/** Memory-only permission: every new app session starts unable to write. */
export class SheetsWriteSafety {
  private sheetId: string | null = null;
  private blocked = true;
  baseline: string | null = null;
  block() { this.blocked = true; }
  canWrite(sheetId: string) { return !this.blocked && this.sheetId === sheetId; }
  accept(sheetId: string, baseline: string) {
    this.sheetId = sheetId; this.baseline = baseline; this.blocked = false;
  }
  hasPending(signature: string) { return this.baseline !== null && this.baseline !== signature; }
  assertCanWrite(sheetId: string) {
    if (!this.canWrite(sheetId)) throw new Error('完全なGoogleシートの読み込みが確認できていないため、書き込みを停止しています。再読み込みしてください。');
  }
}
