import { DeletedEntityType, FieldDiff } from '../types';

/**
 * 寺院管理システムの主要フィールド日本語名称辞書
 */
export const FIELD_LABELS: Record<string, Record<string, string>> = {
  household: {
    familyHead: '世帯主名',
    furigana: 'フリガナ',
    postalCode: '郵便番号',
    address: '住所',
    phone: '電話番号',
    mobile: '携帯電話',
    householdType: '檀家区分',
    status: '状態区分',
    district: '地区',
    tombNumber: '墓地番号',
    dankaId: '檀家番号',
    email: 'メールアドレス',
    notes: '備考・特記事項',
    templeId: '所属寺院',
    tanagyoMonthlyVisit: '月参り',
    tanagyoDate: '棚経日',
    tanagyoTimeSlot: '棚経時間帯',
    tanagyoPriestId: '棚経担当僧侶ID',
    tanagyoPriestName: '棚経担当僧侶',
    tanagyoOrder: '棚経巡回順',
    tanagyoAddress: '棚経訪問先住所',
    tanagyoNotes: '棚経備考',
  },
  pastRecord: {
    dharmaName: '戒名・法名',
    secularName: '俗名',
    furigana: 'フリガナ',
    deathDate: '命日・没年月日',
    age: '行年・享年',
    ageAtDeath: '行年・享年',
    relationship: '続柄',
    burialLocation: '埋葬地・墓地',
    cemeteryLocation: '埋葬地・墓地',
    niibon: '新盆',
    householdHeadName: '施主・世帯主名',
    posthumousTitle: '院号・道号',
    templeId: '所属寺院',
    notes: '備考・特記事項',
    tombNumber: '墓地番号',
    chiefMourner: '施主名',
  },
  transaction: {
    date: '日付',
    type: '収支種別',
    category: '勘定科目',
    amount: '金額',
    paymentMethod: '決済方法',
    householdHeadName: '世帯主名',
    receiptNumber: '領収書番号',
    notes: '摘要・備考',
    templeId: '所属寺院',
  },
  memorialService: {
    scheduledDate: '法要予定日',
    scheduledTime: '法要時間',
    endTime: '終了予定時間',
    venue: '会場・場所',
    status: '状況',
    memorialType: '回忌・法要種別',
    chiefMourner: '施主名',
    attendeeCount: '参列人数',
    offeringAmount: '布施金額',
    tobaCount: '塔婆本数',
    tobaFee: '塔婆料',
    tobaType: '塔婆種別',
    notes: '備考',
    address: '訪問先住所',
    templeId: '所属寺院',
    receptionCheckedIn: '受付チェック',
  },
  templeTodo: {
    title: 'タスク名',
    dueDate: '期日',
    dueTime: '時間',
    priority: '優先度',
    category: '区分',
    completed: '完了状態',
    notes: '詳細・備考',
    templeId: '所属寺院',
  },
  familyMember: {
    name: '家族氏名',
    furigana: 'フリガナ',
    relationship: '続柄',
    gender: '性別',
    birthDate: '生年月日',
    phone: '電話番号',
    notes: '備考',
  },
  priest: {
    name: '僧侶名',
    furigana: 'フリガナ',
    role: '役職・区分',
    templeName: '所属寺院名',
    phone: '電話番号',
    email: 'メールアドレス',
    notes: '備考',
  },
  disasterMemorial: {
    name: '名称',
    date: '命日・発生日',
    notes: '備考・由来',
  },
};

/**
 * 差分比較から除外する内部メタデータフィールド
 */
const IGNORED_DIFF_FIELDS = new Set<string>([
  'id',
  'createdAt',
  'updatedAt',
  'createdDate',
  'createdTime',
  'updatedDate',
  'updatedTime',
  'latitude',
  'longitude',
  'familyMembers', // 家族配列は別個に家族レコードとして監査
  'additionalDeceased',
  'tobaItems',
  'tobaSponsors',
]);

/**
 * 比較用に値を正規化（トリム、null/undefined/空文字の同一視、日付ハイフン/スラッシュの統一、数値と文字列数値の同一視）
 */
export function normalizeDiffValue(val: any): string {
  if (val === null || val === undefined) return '';
  if (typeof val === 'boolean') return val ? 'true' : 'false';
  if (typeof val === 'number') return String(val);
  
  const str = String(val).trim();
  if (!str) return '';

  // 日付のハイフンとスラッシュを統一 (例: "2026-09-11" -> "2026/09/11")
  if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(str)) {
    return str.replace(/-/g, '/');
  }

  // 改行コードを統一
  return str.replace(/\r\n/g, '\n');
}

/**
 * 2つのエンティティを比較し、実質的な差分（Before / After）を抽出
 */
export function computeEntityDiff(
  entityType: DeletedEntityType,
  beforeRecord: any,
  afterRecord: any
): FieldDiff[] {
  if (!beforeRecord || !afterRecord) return [];

  const labels = FIELD_LABELS[entityType] || {};
  const diffs: FieldDiff[] = [];

  // 全ての対象キーを結合
  const allKeys = new Set<string>([
    ...Object.keys(beforeRecord),
    ...Object.keys(afterRecord),
  ]);

  for (const key of allKeys) {
    if (IGNORED_DIFF_FIELDS.has(key)) continue;

    const valBefore = beforeRecord[key];
    const valAfter = afterRecord[key];

    // オブジェクトや複雑な配列は直接比較をスキップ
    if (typeof valBefore === 'object' && valBefore !== null && !Array.isArray(valBefore)) continue;
    if (typeof valAfter === 'object' && valAfter !== null && !Array.isArray(valAfter)) continue;

    const normBefore = normalizeDiffValue(valBefore);
    const normAfter = normalizeDiffValue(valAfter);

    // 正規化後に差分がある場合のみ記録
    if (normBefore !== normAfter) {
      const fieldLabel = labels[key] || key;
      diffs.push({
        field: key,
        label: fieldLabel,
        before: valBefore ?? '',
        after: valAfter ?? '',
      });
    }
  }

  return diffs;
}

/**
 * 差分リストを人間が読みやすい1行のサマリーテキストに変換
 */
export function formatDiffSummary(diffs?: FieldDiff[]): string {
  if (!diffs || diffs.length === 0) return '';
  return diffs
    .map((d) => {
      const bStr = d.before !== '' && d.before !== null && d.before !== undefined ? String(d.before) : '（未設定）';
      const aStr = d.after !== '' && d.after !== null && d.after !== undefined ? String(d.after) : '（未設定）';
      return `【${d.label}】${bStr} → ${aStr}`;
    })
    .join(' / ');
}

/**
 * 新規作成エンティティの全フィールドを「作成データ差分」として生成
 */
export function computeCreationDiffs(
  entityType: DeletedEntityType,
  record: any
): FieldDiff[] {
  if (!record) return [];
  const labels = FIELD_LABELS[entityType] || {};
  const diffs: FieldDiff[] = [];

  for (const key of Object.keys(record)) {
    if (IGNORED_DIFF_FIELDS.has(key)) continue;
    const val = record[key];
    if (val === null || val === undefined || val === '') continue;
    if (typeof val === 'object') continue;

    const fieldLabel = labels[key] || key;
    diffs.push({
      field: key,
      label: fieldLabel,
      before: '（新規作成）',
      after: val,
    });
  }

  return diffs;
}

/**
 * 削除エンティティの全フィールドを「削除前データ差分」として生成
 */
export function computeDeletionDiffs(
  entityType: DeletedEntityType,
  record: any
): FieldDiff[] {
  if (!record) return [];
  const labels = FIELD_LABELS[entityType] || {};
  const diffs: FieldDiff[] = [];

  for (const key of Object.keys(record)) {
    if (IGNORED_DIFF_FIELDS.has(key)) continue;
    const val = record[key];
    if (val === null || val === undefined || val === '') continue;
    if (typeof val === 'object') continue;

    const fieldLabel = labels[key] || key;
    diffs.push({
      field: key,
      label: fieldLabel,
      before: val,
      after: '（削除）',
    });
  }

  return diffs;
}

/**
 * Googleスプレッドシートの「変更差分詳細」セル用の出力文字列を生成
 * 1行目: 人間が読める日本語サマリーテキスト
 * 2行目以降: 復旧用のJSONデータ (diffs, beforeData, afterData)
 */
export function formatGoogleSheetDiffCell(entry: {
  actionType?: string;
  diffs?: FieldDiff[];
  beforeData?: any;
  afterData?: any;
}): string {
  const summaryParts: string[] = [];

  if (entry.diffs && entry.diffs.length > 0) {
    if (entry.actionType === 'create' || entry.actionType === 'batch_create') {
      const fieldSummaries = entry.diffs
        .filter((d) => d.after !== '' && d.after !== null && d.after !== undefined && d.after !== '（新規作成）')
        .slice(0, 6)
        .map((d) => `${d.label}: ${d.after}`);
      summaryParts.push(`【新規作成】${fieldSummaries.join(', ')}${entry.diffs.length > 6 ? '…' : ''}`);
    } else if (entry.actionType === 'delete' || entry.actionType === 'batch_delete') {
      const fieldSummaries = entry.diffs
        .filter((d) => d.before !== '' && d.before !== null && d.before !== undefined && d.before !== '（削除）')
        .slice(0, 6)
        .map((d) => `${d.label}: ${d.before}`);
      summaryParts.push(`【削除前データ】${fieldSummaries.join(', ')}${entry.diffs.length > 6 ? '…' : ''}`);
    } else {
      const diffText = formatDiffSummary(entry.diffs);
      summaryParts.push(`【変更 ${entry.diffs.length}件】${diffText}`);
    }
  } else if (entry.beforeData) {
    summaryParts.push('【削除前データ保存済】');
  } else if (entry.afterData) {
    summaryParts.push('【作成データ保存済】');
  }

  const payload: any = {};
  if (entry.diffs && entry.diffs.length > 0) payload.diffs = entry.diffs;
  if (entry.beforeData) payload.beforeData = entry.beforeData;
  if (entry.afterData) payload.afterData = entry.afterData;

  const jsonStr = Object.keys(payload).length > 0 ? JSON.stringify(payload) : '';

  if (summaryParts.length > 0 && jsonStr) {
    return `${summaryParts.join('\n')}\n${jsonStr}`;
  }
  return summaryParts.join('\n') || jsonStr;
}

/**
 * Googleスプレッドシートから読み込んだ「変更差分詳細」セルから、差分と復元用データを復元
 */
export function parseGoogleSheetDiffCell(rawStr?: string | null): {
  diffs?: FieldDiff[];
  beforeData?: any;
  afterData?: any;
} {
  if (!rawStr) return {};
  const trimmed = String(rawStr).trim();
  if (!trimmed) return {};

  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed && typeof parsed === 'object') {
        return {
          diffs: Array.isArray(parsed.diffs) ? parsed.diffs : undefined,
          beforeData: parsed.beforeData || undefined,
          afterData: parsed.afterData || undefined,
        };
      }
    } catch {
      // ignore JSON parse error
    }
  }

  return {};
}
