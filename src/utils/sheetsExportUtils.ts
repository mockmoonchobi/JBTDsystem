export interface ExportSheet {
  sheetId: number;
  title: string;
  rowCount: number;
  columnCount: number;
}

const aliases: Record<string, string[]> = {
  '法事予約': ['法事・予約一覧'],
  '寺院ToDo': ['寺院タスク・ToDo'],
  '出納・会計': ['出納帳', '出納', '会計管理', '取引履歴', '会計'],
  '出納アーカイブ': ['出納・会計（過年度）', '出納過年度', '出納アーカイブ（過去）'],
  '操作・削除履歴': ['削除履歴', '操作履歴', '削除ログ'],
  'マスタ設定（総合）': ['マスタ設定'],
  '戦没・災害物故者命日設定': ['戦没災害物故者命日設定', '災害物故者命日設定', '戦没物故者命日設定', '戦没・災害物故者', '災害物故者', '戦没者設定', '災害物故者設定'],
};

export function normalizeSheetTitle(title: string): string {
  return (title || '')
    .trim()
    .replace(/^['"]|['"]$/g, '')
    .normalize('NFKC');
}

export function resolveExportSheetName(name: string, titles: string[]): string {
  const normName = normalizeSheetTitle(name);
  const exactMatch = titles.find((t) => t === name || normalizeSheetTitle(t) === normName);
  if (exactMatch) return exactMatch;

  const aliasList = aliases[name] || [];
  for (const alias of aliasList) {
    const normAlias = normalizeSheetTitle(alias);
    const matched = titles.find((t) => t === alias || normalizeSheetTitle(t) === normAlias);
    if (matched) return matched;
  }

  // Also check reverse: if name is an alias of a key, check if key is in titles
  for (const [canonical, aliasArr] of Object.entries(aliases)) {
    if (canonical === name || aliasArr.includes(name) || aliasArr.some((a) => normalizeSheetTitle(a) === normName)) {
      const matchedCanonical = titles.find((t) => t === canonical || normalizeSheetTitle(t) === normalizeSheetTitle(canonical));
      if (matchedCanonical) return matchedCanonical;
      for (const a of aliasArr) {
        const normA = normalizeSheetTitle(a);
        const matchedA = titles.find((t) => t === a || normalizeSheetTitle(t) === normA);
        if (matchedA) return matchedA;
      }
    }
  }

  return name;
}

/** Submit the returned requests together in ONE spreadsheets.batchUpdate call.
 * Clearing and replacing are atomic; formatting and unrelated tabs are retained.
 * Text is written literally, preserving phone numbers and avoiding formula evaluation.
 */
export function buildSheetReplacementRequests(
  updates: { range: string; values: unknown[][] }[],
  sheets: ExportSheet[],
): object[] {
  const titles = sheets.map((sheet) => sheet.title);
  const targetIds = new Set<number>();
  const writes = updates.map((update) => {
    const match = update.range.match(/^'((?:[^']|'')+)'!A([1-9]\d*)$/);
    if (!match) throw new Error(`出力範囲が不正です: ${update.range}`);
    const title = resolveExportSheetName(match[1].replace(/''/g, "'"), titles);
    const sheet = sheets.find((candidate) => candidate.title === title);
    if (!sheet || !Number.isInteger(sheet.sheetId)) throw new Error(`出力先シートを確認できません: ${title}`);
    targetIds.add(sheet.sheetId);
    return {
      updateCells: {
        start: { sheetId: sheet.sheetId, rowIndex: Number(match[2]) - 1, columnIndex: 0 },
        rows: update.values.map((row) => ({ values: row.map((value) => {
          if (value === null || value === undefined || value === '') return {};
          if (typeof value === 'number') {
            if (!Number.isFinite(value)) throw new Error('出力データに無効な数値が含まれています。');
            return { userEnteredValue: { numberValue: value } };
          }
          if (typeof value === 'boolean') return { userEnteredValue: { boolValue: value } };
          return { userEnteredValue: { stringValue: String(value) } };
        }) })),
        fields: 'userEnteredValue',
      },
    };
  });
  return [
    ...[...targetIds].map((sheetId) => ({ repeatCell: { range: { sheetId }, cell: {}, fields: 'userEnteredValue' } })),
    ...writes,
  ];
}
