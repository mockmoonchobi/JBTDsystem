// A stateful Google Sheets simulator. No network or real browser storage.
const storage = require('../src/utils/storageUtils.ts');
const originalIdbSet = storage.idbSet;
const memory = new Map();
storage.idbGet = async key => structuredClone(memory.get(key));
storage.idbGetStrict = storage.idbGet;
storage.idbUpdate = async (key, update) => { memory.set(key, structuredClone(update(structuredClone(memory.get(key) || null)))); };
storage.idbSet = async (key, value) => { memory.set(key, structuredClone(value)); };
function workbook(id = 'test-sheet') {
  memory.clear();
  // Fixture starts with a verified empty workbook, not an unverified local payload.
  memory.set('row-sync-baseline-v1:' + id, {});
  const sheets = new Map(), calls = []; let nextId = 1, failure = 0, lost = false;
  const add = (title, rows = []) => {
    const s = { properties: { title, sheetId: nextId++, gridProperties: { rowCount: Math.max(1000, rows.length), columnCount: 100 } }, rows: structuredClone(rows) };
    sheets.set(title, s); return s;
  };
  const fetch = async (url, options = {}) => {
    const body = options.body ? JSON.parse(options.body) : {};
    calls.push({ url, body });
    const response = (data, status = 200) => new Response(JSON.stringify(data), { status });
    if (url.includes('?fields=')) return response({ sheets: [...sheets.values()].map(({ properties }) => ({ properties })) });
    const read = range => {
      const title = range.match(/^'((?:[^']|'')+)'/)[1].replace(/''/g, "'");
      const bounds = range.match(/!A(\d+):[A-Z]+(\d*)/);
      return (sheets.get(title)?.rows || []).slice(bounds ? +bounds[1] - 1 : 0, bounds?.[2] ? +bounds[2] : undefined).map(r => (r || []).map(v => typeof v === 'boolean' ? String(v).toUpperCase() : String(v ?? '')));
    };
    if (url.includes('/values:batchGet')) return response({ valueRanges: new URL(url).searchParams.getAll('ranges').map(range => ({ range, values: read(range) })) });
    if (url.includes('/values/')) return response({ values: read(decodeURIComponent(url.split('/values/')[1].split('?')[0])) });
    const dataWrite = body.requests?.some(r => r.updateCells || r.appendCells);
    if (dataWrite && failure) return response({ error: { message: 'simulated rejected write' } }, failure);
    const replies = (body.requests || []).map(r => {
      if (r.repeatCell?.fields?.includes('userEnteredValue') || r.deleteDimension || r.deleteSheet) throw Error('destructive request forbidden');
      if (r.addSheet) return { addSheet: { properties: add(r.addSheet.properties.title).properties } };
      if (r.updateSheetProperties) {
        const p = r.updateSheetProperties.properties, s = [...sheets.values()].find(s => s.properties.sheetId === p.sheetId);
        if (p.gridProperties) Object.assign(s.properties.gridProperties, p.gridProperties);
      }
      if (r.updateCells) {
        const w = r.updateCells, s = [...sheets.values()].find(s => s.properties.sheetId === w.start.sheetId);
        w.rows.forEach((row, i) => { const target = s.rows[w.start.rowIndex + i] ||= []; row.values.forEach((c,j) => { const v = c.userEnteredValue || {}; target[(w.start.columnIndex || 0)+j] = v.stringValue ?? v.numberValue ?? v.boolValue ?? ''; }); });
      }
      if (r.appendCells) {
        const w = r.appendCells, s = [...sheets.values()].find(s => s.properties.sheetId === w.sheetId);
        s.rows.push(...w.rows.map(row => row.values.map(c => { const v = c.userEnteredValue || {}; return v.stringValue ?? v.numberValue ?? v.boolValue ?? ''; })));
        s.properties.gridProperties.rowCount = Math.max(s.properties.gridProperties.rowCount, s.rows.length);
      }
      return {};
    });
    if (dataWrite && lost) { lost = false; throw Error('response lost after commit'); }
    return response({ replies });
  };
  return { sheets, calls, fetch, add, memory, fail: v => { failure = v ? 400 : 0; }, loseResponse: () => { lost = true; }, writtenNames: () => calls.flatMap(c => c.body.requests || []).filter(r => r.updateCells || r.appendCells).map(r => [...sheets.values()].find(s => s.properties.sheetId === (r.updateCells?.start.sheetId ?? r.appendCells.sheetId)).properties.title) };
}
module.exports = { workbook, memory, originalIdbSet };
