/** Minimal permanent reservations: no names, amounts or record payloads. */
export const PURGE_LEDGER = '__JBTD使用済ID';
export const LEDGER_HEADER = ['種別', '使用済ID', '寺院ID', '接頭辞', '整理ID'];
export const RECORD_KINDS: Record<string, string> = {
  '檀家名簿':'household', '家族構成':'familyMember', '過去帳':'pastRecord',
  '法事予約':'memorialService', '寺院ToDo':'templeTodo', '出納・会計':'transaction',
  '出納アーカイブ':'transaction', '寺院一覧（本寺・兼務）':'temple', '寺院情報':'temple',
  '登録僧侶一覧':'priest', '案内文テンプレート':'noticeTemplate', '戦没・災害物故者命日設定':'disasterMemorial',
};
export function readPurgeLedger(grid?: unknown[][]): string[][] {
  if (grid === undefined) return [];
  if (JSON.stringify(grid[0]) !== JSON.stringify(LEDGER_HEADER)) throw new Error('使用済みIDの管理情報が不完全です。データ連携を停止しました。');
  const seen = new Set<string>();
  return grid.slice(1).map(r => {
    const row = LEDGER_HEADER.map((_, i) => String(r[i] ?? ''));
    const key = row[0] + ':' + row[1];
    if (!Object.values(RECORD_KINDS).includes(row[0]) || !row[1] || !row[4] || seen.has(key) || row[3] && !/^(DK|K\d+)-$/.test(row[3])) throw new Error('使用済みIDの管理情報が不正です。');
    seen.add(key); return row;
  });
}
