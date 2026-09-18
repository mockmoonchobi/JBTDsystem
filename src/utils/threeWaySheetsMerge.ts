import { FIELD_LABELS } from './diffUtils';

// Compare each side against its own acknowledged snapshot: Sheets normalizes
// dates/defaults during a round trip, so the two baselines need not be identical.
export type Dataset = Record<string, any>;
export type MergeChoice = 'local' | 'remote';
export interface MergeConflict {
  key: string; fingerprint: string; label: string;
  base: any; local: any; remote: any;
}
export type MergeChoices = Record<string, { fingerprint: string; side: MergeChoice }>;
export interface MergeBaseline { version: 1; sheetId: string; local: Dataset; remote: Dataset }

/** A history poll must not interrupt independent new-accounting uploads. */
export function hasOnlyNewAccounting(base: MergeBaseline | null | undefined, local: Dataset): boolean {
  if (!base?.local) return false;
  const before = base.local;
  for (const key of new Set([...Object.keys(before), ...Object.keys(local)])) {
    if (key !== 'transactions' && key !== 'deletedRecords' && stableMergeValue(before[key]) !== stableMergeValue(local[key])) return false;
  }
  const old = new Map((before.transactions || []).map((r: any) => [r.id, r]));
  const current = new Map((local.transactions || []).map((r: any) => [r.id, r]));
  if (current.size !== (local.transactions || []).length || current.has('') || current.has(undefined)) return false;
  for (const [id, row] of old) if (!current.has(id) || stableMergeValue(row) !== stableMergeValue(current.get(id))) return false;
  const ids = new Set([...current.keys()].filter(id => !old.has(id)));
  if (!ids.size) return false;
  const oldLogs = new Set((before.deletedRecords || []).map((r: any) => r.logId));
  const logs = (local.deletedRecords || []).filter((r: any) => !oldLogs.has(r.logId));
  return logs.length > 0 && logs.every((r: any) => ['create', 'add'].includes(r.actionType) && r.entityType === 'transaction' && ids.has(r.id));
}
/** Let autosave finish explicit household deletions before polling pulls remote data. */
export function hasOnlyHouseholdDeletions(base: MergeBaseline | null | undefined, local: Dataset): boolean {
  if (!base?.local) return false;
  const before = base.local;
  for (const key of new Set([...Object.keys(before), ...Object.keys(local)])) {
    if (key !== 'households' && key !== 'deletedRecords' && stableMergeValue(before[key]) !== stableMergeValue(local[key])) return false;
  }
  const oldRows = before.households || [], rows = local.households || [];
  const old = new Map<string, any>(oldRows.map((r: any) => [r.id, r]));
  const current = new Map<string, any>(rows.map((r: any) => [r.id, r]));
  if (old.size !== oldRows.length || current.size !== rows.length ||
      [...old.keys(), ...current.keys()].some(id => typeof id !== 'string' || !id.trim())) return false;
  for (const [id, row] of current) if (!old.has(id) || stableMergeValue(row) !== stableMergeValue(old.get(id))) return false;
  const removed = new Set([...old.keys()].filter(id => !current.has(id)));
  if (!removed.size) return false;
  const oldLogs = new Set((before.deletedRecords || []).map((r: any) => r.logId));
  const logs = (local.deletedRecords || []).filter((r: any) => !oldLogs.has(r.logId));
  return logs.length > 0 && logs.every((r: any) => r.logId &&
    ['delete', 'batch_delete'].includes(r.actionType) && r.entityType === 'household' && removed.has(r.id)) &&
    [...removed].every(id => logs.some((r: any) => r.id === id));
}
export function hasOnlyHouseholdEdits(base: MergeBaseline | null | undefined, local: Dataset): boolean {
  if (!base?.local) return false;
  for (const key of new Set([...Object.keys(base.local),...Object.keys(local)]))
    if (!['households','deletedRecords'].includes(key) && stableMergeValue(base.local[key])!==stableMergeValue(local[key])) return false;
  const prior=new Map((base.local.households||[]).map((r:any)=>[r.id,r]));
  const rows=local.households||[];
  if(new Set(rows.map((r:any)=>r.id)).size!==rows.length || rows.some((r:any)=>!prior.has(r.id))) return false;
  const changed=rows.filter((r:any)=>stableMergeValue(r)!==stableMergeValue(prior.get(r.id)));
  const remaining=new Set(rows.map((r:any)=>r.id));
  const removed=[...prior.keys()].filter(id=>!remaining.has(id));
  const logs=local.deletedRecords||[];
  return changed.length+removed.length>0 && changed.every((r:any)=>logs.some((e:any)=>e.id===r.id && e.entityType==='household' && e.actionType==='update')) &&
    removed.every(id=>logs.some((e:any)=>e.id===id && e.entityType==='household' && ['delete','batch_delete'].includes(e.actionType)));
}
export function hasOnlyIndependentPendingChanges(base: MergeBaseline | null | undefined, local: Dataset): boolean {
  return hasOnlyNewAccounting(base, local) || hasOnlyHouseholdDeletions(base, local) || hasOnlyHouseholdEdits(base, local);
}
export const mergeTableLabels: Record<string, string> = {
  households: '檀家', pastRecords: '過去帳', transactions: '会計', memorialServices: '法事予約',
  templeTodos: '予定・ToDo', temples: '寺院', priests: '僧侶', disasterEvents: '災害供養',
  templeInfo: '寺院情報', masterOptions: 'マスタ設定', templeMasterOptionsMap: '寺院別設定',
  noticeTemplates: '案内文', batchAccountingData: '一括会計', deletedRecords: '操作履歴',
  allNoticeTemplates: '案内テンプレート', batchAccountingConfig: '一括会計設定',
};
const fields: Record<string, string> = {
  ...Object.assign({}, ...Object.values(FIELD_LABELS)),
  yago: '屋号', familyHead: '世帯主', name: '氏名', address: '住所', phone: '電話番号', mobile: '携帯番号',
  furigana: 'ふりがな', tombNumber: '墓地番号', notes: '備考', description: '摘要',
  date: '日付', amount: '金額', type: '収支', category: '科目', paymentMethod: '支払方法',
  householdId: '檀家ID', templeId: '寺院ID', secularName: '俗名', dharmaName: '戒名',
  deathDate: '命日', familyMembers: '家族', receiptNumber: '領収書番号',
};
export const mergeFieldLabels: Record<string, string> = { ...fields, ...mergeTableLabels,
  title: '文書タイトル', content: '本文', entries: '世帯別受付', configDate: '受付日付',
  cat1: '科目1', cat2: '科目2', cat3: '科目3', notes1: '摘要1', notes2: '摘要2', notes3: '摘要3',
  defaultAmount1: '基準金額1', defaultAmount2: '基準金額2', defaultAmount3: '基準金額3',
  check1: '受付1', check2: '受付2', check3: '受付3', amount1: '金額1', amount2: '金額2', amount3: '金額3' };
const auditFields = new Set(['updatedAt', 'updatedDate', 'updatedTime', 'createdAt', 'createdDate', 'createdTime', 'lastSavedAt', 'isDefault']);
const derivedFields = new Set(['tobaTypes', 'accountingCategories', 'noticeTemplates']);
const object = (v: any): v is Dataset => !!v && typeof v === 'object' && !Array.isArray(v);
const redundantAccountingDescription = (value: Dataset, key: string) => key === 'description' && ['収入', '支出'].includes(value.type) && typeof value.amount === 'number' && value.description === value.notes;
export function stableMergeValue(value: any): string {
  if (typeof value === 'string') value = value.trim();
  if (value === undefined) return 'undefined';
  if (Array.isArray(value)) {
    const list = value.every(v => object(v) && typeof v.id === 'string')
      ? [...value].sort((a, b) => (a.logId || a.id).localeCompare(b.logId || b.id)) : value;
    return '[' + list.map(stableMergeValue).join(',') + ']';
  }
  if (object(value)) return '{' + Object.keys(value).sort().filter(k => !redundantAccountingDescription(value, k) && !auditFields.has(k) && !derivedFields.has(k) && value[k] !== undefined && value[k] !== '' && value[k] !== null && value[k] !== false && !(Array.isArray(value[k]) && !value[k].length))
    .map(k => JSON.stringify(k) + ':' + stableMergeValue(value[k])).join(',') + '}';
  if (typeof value === 'string' && /^\d{4}[/-]\d{1,2}[/-]\d{1,2}$/.test(value)) {
    return JSON.stringify(value.split(/[/-]/).map((part, i) => i ? part.padStart(2, '0') : part).join('/'));
  }
  return JSON.stringify(value);
}
const equal = (a: any, b: any) => stableMergeValue(a) === stableMergeValue(b);
function recordMap(list: any[], label: string) {
  const map = new Map<string, any>();
  for (const row of list) {
    if (!object(row) || typeof row.id !== 'string' || !row.id.trim() || map.has(row.id)) {
      throw new Error(`${label}: IDの欠損・重複があるため自動統合できません。元データを確認してください。`);
    }
    map.set(row.id, row);
  }
  return map;
}
const tables = ['households', 'pastRecords', 'transactions', 'memorialServices', 'templeTodos', 'temples', 'priests', 'disasterEvents', 'allNoticeTemplates'];
function labelOf(row: any) { return row?.familyHead || row?.dharmaName || row?.secularName || row?.name || row?.description || row?.id || ''; }

export function planSheetsMerge(base: MergeBaseline | null, local: Dataset, remote: Dataset, choices: MergeChoices = {}, fieldwise = false) {
  for (const side of [local, remote, base?.local, base?.remote].filter(Boolean)) {
    for (const table of tables) recordMap(side![table] || [], mergeTableLabels[table]);
    for (const household of side!.households || []) recordMap(household.familyMembers || [], '家族');
  }
  const conflicts: MergeConflict[] = [];
  const deletedEdits: { table: string; entityType: string; id: string; row: any }[] = [];
  const deletionResolutions: { table: string; id: string; label: string; discardedLocalEdit: boolean }[] = [];
  const kinds: Record<string, string> = { households: 'household', pastRecords: 'pastRecord', transactions: 'transaction', memorialServices: 'memorialService', templeTodos: 'templeTodo', temples: 'temple', priests: 'priest', disasterEvents: 'disasterMemorial', allNoticeTemplates: 'noticeTemplate' };
  const confirmedDeletion = (table: string, id: string, side: Dataset, acknowledged: Dataset | undefined) => {
    if (!acknowledged) return false;
    const oldIds = new Set((acknowledged.deletedRecords || []).map((e: any) => e.logId));
    const logs = (side.deletedRecords || []).filter((e: any) => e.id === id && e.entityType === kinds[table])
      .slice().sort((a: any, b: any) => Number(b.deletedTimestamp || 0) - Number(a.deletedTimestamp || 0));
    const latest = logs[0];
    return latest?.logId && (!oldIds.has(latest.logId) || !(acknowledged[table] || []).some((row:any)=>row.id===id)) && ['delete', 'batch_delete'].includes(latest.actionType);
  };
  const choose = (path: string[], label: string, b: any, l: any, r: any) => {
    const key = JSON.stringify(path), fingerprint = stableMergeValue([b, l, r]);
    const conflict = { key, fingerprint, label, base: b, local: l, remote: r };
    conflicts.push(conflict);
    const selected = choices[key];
    return selected?.fingerprint === fingerprint && selected.side === 'local' ? l : r;
  };
  const walk = (bl: any, br: any, l: any, r: any, path: string[], label: string, known: boolean): any => {
    if (equal(l, r)) return r;
    if (path.length === 2 && tables.includes(path[0]) && (l === undefined || r === undefined) && (bl || br)) {
      if ((bl || br) && confirmedDeletion(path[0], path[1], l === undefined ? local : remote, l === undefined ? base?.local : base?.remote)) {
        const row = l || r || bl;
        const description = path[0] === 'transactions' ? [row.date, row.category, row.amount != null ? Number(row.amount).toLocaleString('ja-JP') + '円' : '', row.notes].filter(Boolean).join('・') : labelOf(row);
        if (r === undefined && l !== undefined && !equal(bl,l)) deletedEdits.push({table:path[0],entityType:kinds[path[0]],id:path[1],row:l});
        deletionResolutions.push({ table: path[0], id: path[1], label: description || labelOf(row), discardedLocalEdit: r === undefined && !equal(bl, l) });
        return undefined;
      }
      // Household deletion only hides the directory entry. Related records merge
      // independently; restoring the entry requires the separate two-choice review.
      if (path[0] === 'households') return undefined;
      return choose(path, label + '（削除の確認）', bl, l, r);
    }
    const keyedList = Array.isArray(l) && Array.isArray(r) && (tables.includes(path[0]) && path.length === 1 || path.at(-1) === 'familyMembers');
    if (!keyedList && known && equal(bl, l)) return r;
    if (!keyedList && known && equal(br, r)) return l;
    // Absence is never inferred to mean deletion without an acknowledged baseline.
    if (l === undefined || r === undefined) return choose(path, label + '（追加・削除）', bl, l, r);
    if (Array.isArray(l) && Array.isArray(r)) {
      const keyed = tables.includes(path[0]) && path.length === 1 || path.at(-1) === 'familyMembers';
      if (!keyed) return choose(path, label, bl, l, r);
      const lm = recordMap(l, label), rm = recordMap(r, label);
      const bm = recordMap(bl || [], label), bmr = recordMap(br || [], label);
      return [...new Set([...lm.keys(), ...rm.keys(), ...bm.keys(), ...bmr.keys()])].sort().flatMap(id => {
        const lv = lm.get(id), rv = rm.get(id);
        const result = walk(bm.get(id), bmr.get(id), lv, rv, [...path, id], `${label} / ${labelOf(lv || rv || bm.get(id))} [${id}]`, known);
        return result === undefined ? [] : [result];
      });
    }
    // Financial fields form one unit; do not combine a changed amount with a
    // separately changed income/expense classification without explicit review.
    if (!fieldwise && path[0] === 'transactions' && path.length === 2) return choose(path, label + '（取引全体）', bl, l, r);
    if (path[0] === 'batchAccountingConfig' || path[0] === 'batchAccountingData' && path[1] === 'entries' && path.length === 3) return choose(path, label + '（設定・受付全体）', bl, l, r);
    // Different new records with the same ID are not a single person's record.
    if (path.length === 2 && tables.includes(path[0]) && !bl && !br) return choose(path, label, bl, l, r);
    if (object(l) && object(r)) {
      const out: Dataset = {};
      for (const key of new Set([...Object.keys(bl || {}), ...Object.keys(br || {}), ...Object.keys(l), ...Object.keys(r)])) {
        const value = auditFields.has(key) || derivedFields.has(key) ? (r[key] ?? l[key]) : walk(bl?.[key], br?.[key], l[key], r[key], [...path, key], `${label} / ${mergeFieldLabels[key] || key}`, known);
        if (value !== undefined) out[key] = value;
      }
      return out;
    }
    return choose(path, label, bl, l, r);
  };
  const merged: Dataset = {};
  for (const key of new Set([...Object.keys(local), ...Object.keys(remote)])) {
    if (key === 'deletedRecords') continue;
    if (key === 'noticeTemplates' && ('allNoticeTemplates' in local || 'allNoticeTemplates' in remote)) { merged[key] = remote[key]; continue; }
    merged[key] = walk(base?.local[key], base?.remote[key], local[key], remote[key], [key], mergeTableLabels[key] || key, !!base);
  }
  // Histories are evidence, not executable deletion instructions. Keep both.
  const logs = new Map<string, any>();
  for (const entry of [...(remote.deletedRecords || []), ...(local.deletedRecords || [])]) {
    const key = entry.logId || stableMergeValue([entry.id, entry.actionType, entry.deletedTimestamp]);
    if (!logs.has(key)) logs.set(key, entry);
    else if (!equal(logs.get(key), entry)) logs.set(key, choose(['deletedRecords', key], `操作履歴 / ${entry.label || entry.id}`, undefined, entry, logs.get(key)));
  }
  merged.deletedRecords = [...logs.values()].sort((a, b) => (b.deletedTimestamp || 0) - (a.deletedTimestamp || 0));
  if (merged.batchAccountingData && merged.batchAccountingConfig) merged.batchAccountingData = { ...merged.batchAccountingData, ...merged.batchAccountingConfig };

  // Parent deletion versus descendant edits is resolved as a related group,
  // rather than silently producing dangling records or deleting the new child.
  for (const [parentTable, foreignKey, children] of [
    ['temples', 'templeId', ['households', 'pastRecords', 'transactions', 'memorialServices', 'templeTodos', 'priests', 'disasterEvents']],
  ] as const) {
    const memberships = new Map<string, Map<string, Set<string>>>();
    for (const table of children) {
      const map = new Map<string, Set<string>>();
      for (const data of [local, remote, base?.local, base?.remote].filter(Boolean)) for (const row of data![table] || []) {
        if (!row[foreignKey]) continue;
        if (!map.has(row.id)) map.set(row.id, new Set());
        map.get(row.id)!.add(row[foreignKey]);
      }
      memberships.set(table, map);
    }
    const indexes = new Map<Dataset, Map<string, Map<string, any[]>>>();
    const group = (data: Dataset, id: string) => {
      if (!indexes.has(data)) {
        const index = new Map<string, Map<string, any[]>>();
        for (const table of [parentTable, ...children]) {
          const byId = new Map<string, any[]>();
          for (const row of data[table] || []) {
            const keys = table === parentTable ? [row.id] : [...(memberships.get(table)!.get(row.id) || [])];
            for (const key of keys) {
              if (!byId.has(key)) byId.set(key, []);
              byId.get(key)!.push(row);
            }
          }
          index.set(table, byId);
        }
        indexes.set(data, index);
      }
      return Object.fromEntries([parentTable, ...children].map(table => [table, indexes.get(data)!.get(table)!.get(id) || []]));
    };
    const parents = new Set([...(base?.local[parentTable] || []), ...(base?.remote[parentTable] || []), ...(local[parentTable] || []), ...(remote[parentTable] || [])].map((v: any) => v.id));
    for (const id of parents) {
      const lg = group(local, id), rg = group(remote, id);
      const parentMismatch = !!lg[parentTable].length !== !!rg[parentTable].length;
      if (!parentMismatch) continue;
      const kept = lg[parentTable].length ? lg : rg;
      const acknowledged = base ? group(lg[parentTable].length ? base.local : base.remote, id) : null;
      const childrenChanged = children.some(t => kept[t].length > 0) && (!acknowledged || !equal(kept, acknowledged));
      if (!childrenChanged) continue;
      const selected = choose(['related', parentTable, id], `${mergeTableLabels[parentTable]} [${id}] の削除と関連データ（まとめて選択）`, base ? group(base.local, id) : undefined, lg, rg);
      for (const table of [parentTable, ...children]) {
        const groupIds = new Set([...lg[table], ...rg[table]].map((v: any) => v.id));
        merged[table] = (merged[table] || []).filter((v: any) => !groupIds.has(v.id)).concat(selected[table]);
      }
    }
  }
  const unresolved = conflicts.filter(c => !choices[c.key] || choices[c.key].fingerprint !== c.fingerprint);
  const errors: string[] = [];
  for (const [parent, foreignKey, children] of [
    ['temples', 'templeId', ['households', 'pastRecords', 'transactions', 'memorialServices', 'templeTodos']],
  ] as const) {
    const available = new Set((merged[parent] || []).map((v: any) => v.id));
    const previouslyKnown = new Set([...(local[parent] || []), ...(remote[parent] || []), ...(base?.local[parent] || []), ...(base?.remote[parent] || [])].map((v: any) => v.id));
    for (const table of children) for (const row of merged[table] || []) {
      if (row[foreignKey] && previouslyKnown.has(row[foreignKey]) && !available.has(row[foreignKey])) {
        errors.push(`${mergeTableLabels[table]} [${row.id}] の関連先 [${row[foreignKey]}] が削除されています。「戻る」で関連する削除・保持の選択を合わせてください。`);
      }
    }
  }
  const changes: Dataset = {};
  const summary = tables.map(table => {
    const before = recordMap(remote[table] || [], table), after = recordMap(merged[table] || [], table);
    const rows = [...new Set([...before.keys(), ...after.keys()])].filter(id => !equal(before.get(id), after.get(id))).map(id => ({
      '処理': !before.has(id) ? '追加' : !after.has(id) ? '削除' : '変更',
      ...(before.has(id) ? { '変更前': before.get(id) } : {}),
      ...(after.has(id) ? { '変更後': after.get(id) } : {}),
    }));
    if (rows.length) changes[table] = rows;
    return { table, label: mergeTableLabels[table], added: [...after.keys()].filter(id => !before.has(id)).length,
      deleted: [...before.keys()].filter(id => !after.has(id)).length,
      updated: [...after.keys()].filter(id => before.has(id) && !equal(before.get(id), after.get(id))).length };
  });
  const oldTempleIds = new Set([...(local.temples || []), ...(remote.temples || [])].map((t: any) => t.id));
  const newTempleIds = new Set((merged.temples || []).map((t: any) => t.id));
  const settingTempleIds = [...Object.keys(merged.templeMasterOptionsMap || {}), merged.batchAccountingConfig?.templeId, merged.batchAccountingData?.templeId];
  if (settingTempleIds.some(id => id && oldTempleIds.has(id) && !newTempleIds.has(id))) errors.push('削除する寺院の設定が残っています。寺院と関連設定の削除・保持の選択を合わせてください。');
  if ([...(local.temples || []), ...(remote.temples || [])].some((t: any) => t.isMain) && !(merged.temples || []).some((t: any) => t.isMain)) errors.push('本寺がなくなる組み合わせは保存できません。寺院の選択を確認してください。');
  for (const key of Object.keys(merged)) {
    if (!tables.includes(key) && !equal(remote[key] ?? (Array.isArray(merged[key]) ? [] : remote[key]), merged[key])) changes[key] = { '変更前': remote[key], '変更後': merged[key] };
  }
  return { merged, conflicts, unresolved, summary, errors, changes, deletionResolutions, deletedEdits };
}

// Verify all intended fields and the complete record ID sets after a write.
// Additional importer-generated default fields are permitted; missing or changed
// intended content is not. Dates and empty cells are normalized by the adapter.
export function verifyMergedReadback(expected: any, actual: any, path = ''): boolean {
  if (expected === undefined || expected === null || expected === '') return actual === undefined || actual === null || actual === '' || actual === false;
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) return false;
    if (path === 'deletedRecords') {
      return expected.every(v => actual.some((a: any) => (v.logId ? a.logId === v.logId : a.id === v.id && a.deletedTimestamp === v.deletedTimestamp) && verifyMergedReadback(v, a, path)));
    }
    if (actual.length !== expected.length) return false;
    if (expected.every(v => object(v) && typeof v.id === 'string')) {
      const map = recordMap(actual, path);
      return expected.every(v => map.has(v.id) && verifyMergedReadback(v, map.get(v.id), path));
    }
    return expected.every((v, i) => verifyMergedReadback(v, actual[i], path));
  }
  if (object(expected)) return object(actual) && Object.keys(expected).filter(k => expected[k] !== undefined && !redundantAccountingDescription(expected, k) && !auditFields.has(k) && !derivedFields.has(k)).every(k => verifyMergedReadback(expected[k], actual[k], k));
  if (typeof expected === 'boolean') return expected === actual || (!expected && (actual === '' || actual === undefined));
  return stableMergeValue(String(expected)) === stableMergeValue(String(actual));
}

export function describeAccountingMismatch(expected: any[], actual: any[]): string {
  const e = new Map(expected.map(r => [r.id, r])), a = new Map(actual.map(r => [r.id, r]));
  const missing = expected.filter(r => !a.has(r.id)).length, extra = actual.filter(r => !e.has(r.id)).length;
  const details: string[] = [];
  if (missing) details.push(`統合案にある会計が${missing}件読み取れません`);
  if (extra) details.push(`統合案にない会計が${extra}件あります`);
  for (const row of expected) {
    const other = a.get(row.id);
    if (!other || verifyMergedReadback(row, other)) continue;
    const changed = Object.keys(row).filter(k => !redundantAccountingDescription(row, k) && !auditFields.has(k) && !derivedFields.has(k) && !verifyMergedReadback(row[k], other[k], k));
    const labels = changed.map(k => k === 'templeId' ? '所属寺院' : k === 'householdId' ? '関連する檀家' : mergeFieldLabels[k] || k);
    details.push(`${row.date || '日付未設定'}・${row.category || '科目未設定'}：${labels.join('、')}が異なります`);
    if (details.length >= 5) break;
  }
  return details.join('／');
}
