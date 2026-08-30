import * as XLSX from 'xlsx';
import { Household, PastRecord, Transaction, FamilyMember, MasterOptions, TempleProfile } from '../types';
import { normalizeDateInput, normalizeFurigana } from './memorialCalculator';
import { getCurrentAuditFields, normalizeAuditDate, normalizeAuditTime } from './auditUtils';
import { cleanAndNormalizeHouseholdId, getTemplePrefix, generateNewHouseholdId } from './dankaIdUtils';
import { 
  LinkingDecision, 
  KakochoItemInput, 
  parseDeathDateToTimestampAndYear,
  buildInitialLineageMap,
  evaluateItemMatch,
  registerConfirmedSpiritToLineage,
  normalizeNameForMatching
} from './kakochoLineageMatching';

export type ImportTargetType = 'household' | 'past_record' | 'combined' | 'accounting';

export interface ColumnMappingField {
  key: string;
  label: string;
  required?: boolean;
  description?: string;
  aliases: string[];
}

export const HOUSEHOLD_MAPPING_FIELDS: ColumnMappingField[] = [
  { key: 'id', label: '檀家ID / 檀家管理番号 (任意)', description: '例: H-101 (空欄時は自動採番)', aliases: ['檀家ID', '檀家id', '檀家番号', 'ID', 'id', '世帯ID', '会員番号', '管理番号', 'コード', '檀家コード', '世帯番号', 'No', 'NO', '檀家No', 'No.'] },
  { key: 'familyHead', label: '施主名', required: true, description: '例: 山田 太郎', aliases: ['施主名', '施主', '世帯主', '世帯主名', '氏名', '名前', '檀家名', '檀家氏名', '代表者', '当家名', '戸主', '名義人', '代表'] },
  { key: 'furigana', label: 'フリガナ / ふりがな', description: '例: ヤマダ タロウ', aliases: ['フリガナ', 'ふりがな', 'カナ', 'かな', '読み', '氏名カナ', '世帯主カナ', 'ふりがな（世帯主）'] },
  { key: 'postalCode', label: '郵便番号', description: '例: 123-4567', aliases: ['郵便番号', '〒', '郵便', 'zip', 'postcode', '郵便番号（〒）', '〒番号'] },
  { key: 'address', label: '住所 / 所在地', description: '例: 東京都港区芝公園4-7-35', aliases: ['住所', '所在地', '現住所', '住所1', '住所2', '本籍地', 'address', '町名番地', '送付先住所', '連絡先住所'] },
  { key: 'phone', label: '電話番号 / TEL', description: '例: 03-1234-5678', aliases: ['電話番号', '電話', 'TEL', 'tel', '固定電話', '連絡先電話', '自宅電話', '電話1'] },
  { key: 'mobile', label: '携帯番号', description: '例: 090-1234-5678', aliases: ['携帯電話', '携帯', 'スマホ', 'mobile', '携帯番号', '連絡先携帯', 'TEL2'] },
  { key: 'district', label: '役職', description: '例: 総代、世話人、役員など（空欄可）', aliases: ['役職', '総代・世話人', '総代', '世話人', '役員', '地区', '世話人地区', '組', '班', 'エリア', '町内会', '所属地区', '地区名', '担当地区'] },
  { key: 'tombNumber', label: '墓地番号 / 区画', description: '例: A-12', aliases: ['墓地番号', '墓地', '区画', '墓番', '墓地位置', '墓地名', '納骨堂番号', '墓地区画', '墓所番号', '墓所'] },
  { key: 'householdType', label: '区分１', description: '例: 正檀家、役員、信徒など（空欄可）', aliases: ['区分1', '区分１', '檀家区分', '種別', '檀家種別', '区分', '会員種別', '檀信徒区分'] },
  { key: 'status', label: '区分２', description: '例: 健在、活発、遠方など（空欄可）', aliases: ['区分2', '区分２', '状態', '状況', 'ステータス', '状態区分', '健在区分'] },
  { key: 'toba1Applied', label: '塔婆申込１', description: '例: 申込済 / 未申込', aliases: ['塔婆申込１', '塔婆申込1', '施餓鬼塔婆申込', '施餓鬼塔婆', '施餓鬼申込', '施餓鬼', '塔婆申込', 'isSegakiToba', 'toba1Applied'] },
  { key: 'toba1Tamegaki', label: '塔婆申込１為書き', description: '例: 先祖代々供養', aliases: ['塔婆申込１為書き', '塔婆申込1為書き', '塔婆申込１為書', '施餓鬼為書き', '為書き', '施餓鬼為書', '為書', 'segakiTamegaki', 'toba1Tamegaki'] },
  { key: 'toba2Applied', label: '塔婆申込２', description: '例: 申込済 / 未申込', aliases: ['塔婆申込２', '塔婆申込2', '塔婆申込２申込', '塔婆申込2申込', 'toba2Applied'] },
  { key: 'toba2Tamegaki', label: '塔婆申込２為書き', description: '例: 先祖代々供養', aliases: ['塔婆申込２為書き', '塔婆申込2為書き', '塔婆申込２為書', 'toba2Tamegaki'] },
  { key: 'toba3Applied', label: '塔婆申込３', description: '例: 申込済 / 未申込', aliases: ['塔婆申込３', '塔婆申込3', '塔婆申込３申込', '塔婆申込3申込', 'toba3Applied'] },
  { key: 'toba3Tamegaki', label: '塔婆申込３為書き', description: '例: 先祖代々供養', aliases: ['塔婆申込３為書き', '塔婆申込3為書き', '塔婆申込３為書', 'toba3Tamegaki'] },
  { key: 'fee1Amount', label: '集金１金額', description: '例: 5000 (個別設定金額)', aliases: ['集金１金額', '集金1金額', '集金１', '集金1', '護持会費', 'fee1Amount', 'fee1'] },
  { key: 'fee2Amount', label: '集金２金額', description: '例: 3000 (個別設定金額)', aliases: ['集金２金額', '集金2金額', '集金２', '集金2', '墓地管理費', 'fee2Amount', 'fee2'] },
  { key: 'fee3Amount', label: '集金３金額', description: '例: 2000 (個別設定金額)', aliases: ['集金３金額', '集金3金額', '集金３', '集金3', '境内整備費', 'fee3Amount', 'fee3'] },
  { key: 'isSegakiToba', label: '施餓鬼塔婆申込 (旧互換)', description: '例: 申込済 / 未申込', aliases: ['施餓鬼塔婆申込', '施餓鬼塔婆', '施餓鬼申込', '施餓鬼'] },
  { key: 'segakiTamegaki', label: '施餓鬼為書き (旧互換)', description: '例: 先祖代々供養', aliases: ['施餓鬼為書き', '為書き', '施餓鬼為書'] },
  { key: 'tanagyoMonthlyVisit', label: '棚経・月参り対象', description: '例: 対象 / 未対象', aliases: ['棚経・月参り対象', '棚経・月参り', '棚経月参り', '棚経対象', '棚経', '月参り', 'tanagyoMonthlyVisit'] },
  { key: 'tanagyoAddress', label: '棚経伺い先住所', description: '別居先や訪問先住所（空欄時は現住所）', aliases: ['棚経伺い先住所', '棚経訪問先住所', '棚経住所', '伺い先住所', 'tanagyoAddress'] },
  { key: 'tanagyoNotes', label: '棚経訪問特記', description: '訪問時間帯や注意点メモ', aliases: ['棚経訪問特記', '棚経特記', '棚経備考', 'tanagyoNotes'] },
  { key: 'notes', label: '備考 / メモ', description: '自由記入メモ', aliases: ['備考', 'メモ', '特記事項', '連絡事項', '注記', '備考欄', '特記'] },
  { key: 'createdDate', label: '作成日 (任意)', description: '例: 2026/04/01 (空欄時は取込日時)', aliases: ['作成日', '作成年月日', '登録日', 'createdDate', 'createdAt'] },
  { key: 'createdTime', label: '作成時間 (任意)', description: '例: 12:00:00 (空欄時は取込日時)', aliases: ['作成時間', '作成時刻', 'createdTime'] },
  { key: 'updatedDate', label: '修正日 (任意)', description: '例: 2026/04/01 (空欄時は取込日時)', aliases: ['修正日', '更新日', '修正年月日', '更新年月日', 'updatedDate', 'updatedAt'] },
  { key: 'updatedTime', label: '修正時間 (任意)', description: '例: 12:00:00 (空欄時は取込日時)', aliases: ['修正時間', '更新時間', '修正時刻', '更新時刻', 'updatedTime'] },
];

export const PAST_RECORD_MAPPING_FIELDS: ColumnMappingField[] = [
  { key: 'householdId', label: '檀家ID / 檀家管理番号 (任意)', description: '例: H-101 (世帯と自動紐付け)', aliases: ['檀家ID', '檀家id', '檀家番号', '世帯ID', '檀家コード', '所属世帯', '世帯番号', 'ID', 'id', '管理番号', 'No', 'NO', '檀家No'] },
  { key: 'dharmaName', label: '戒名 / 法名 / 法号', required: true, description: '例: 釋慈光信士', aliases: ['戒名', '法名', '法号', '法名・戒名', '戒名・法名', '尊霊', '霊位', '法名（戒名）', '院号法名', '戒名等'] },
  { key: 'secularName', label: '俗名 / 故人名', description: '例: 山田 花子', aliases: ['俗名', '本名', '故人名', '故人氏名', '氏名', '名前', '故人', '俗名（本名）', '亡者名'] },
  { key: 'deathDate', label: '没年月日 / 命日', required: true, description: '例: 令和5年4月1日, 2023/04/01', aliases: ['没年月日', '命日', '逝去年月日', '死亡年月日', '忌日', '祥月命日', '命日（没年月日）', '死亡日', '逝去日', '没日'] },
  { key: 'ageAtDeath', label: '享年 / 行年 (年齢)', description: '例: 88', aliases: ['享年', '行年', '没年齢', '死亡時年齢', '年齢', '行年（享年）', '享年・行年', '才', '歳'] },
  { key: 'householdHeadName', label: '当時の施主名', description: '例: 山田 太郎 (当時の記録・施主名)', aliases: ['当時の施主名', '当時の世帯主', '当時の施主', '過去施主名', '施主名', '当時の戸主', '施主', '檀家名', '当家', '親族名', '檀家氏名', '当家主'] },
  { key: 'currentHeadName', label: '現在の施主名 (任意)', description: '例: 山田 一郎 (現在の世帯照合・割付用)', aliases: ['現在の施主名', '現在の世帯主', '現施主', '現世帯主', '世帯主名', '現代表', '現名義人', '現在の施主', '世帯主'] },
  { key: 'relationship', label: '施主との続柄', description: '例: 父、母、祖父、先代（空欄可）', aliases: ['続柄', '戸主との関係', '施主との続柄', '関係', '本人との続柄', '世帯主との続柄'] },
  { key: 'burialLocation', label: '納骨・墓地位置', description: '例: A地区 3番地', aliases: ['納骨位置', '墓地位置', '埋葬場所', '墓所', '墓地番号', '納骨堂', '埋葬位置'] },
  { key: 'niibon', label: '新盆 (任意/自動算出)', description: '例: 令和8年新盆', aliases: ['新盆', '初盆', '新盆区分', '新盆該当年'] },
  { key: 'notes', label: '過去帳備考 / 引導', description: '自由記入メモ', aliases: ['備考', 'メモ', '引導法語', '院号', '注記', '過去帳備考', '特記事項'] },
  { key: 'createdDate', label: '作成日 (任意)', description: '例: 2026/04/01 (空欄時は取込日時)', aliases: ['作成日', '作成年月日', '登録日', 'createdDate', 'createdAt'] },
  { key: 'createdTime', label: '作成時間 (任意)', description: '例: 12:00:00 (空欄時は取込日時)', aliases: ['作成時間', '作成時刻', 'createdTime'] },
  { key: 'updatedDate', label: '修正日 (任意)', description: '例: 2026/04/01 (空欄時は取込日時)', aliases: ['修正日', '更新日', '修正年月日', '更新年月日', 'updatedDate', 'updatedAt'] },
  { key: 'updatedTime', label: '修正時間 (任意)', description: '例: 12:00:00 (空欄時は取込日時)', aliases: ['修正時間', '更新時間', '修正時刻', '更新時刻', 'updatedTime'] },
];

export const COMBINED_MAPPING_FIELDS: ColumnMappingField[] = [
  // Household part
  { key: 'householdId', label: '【檀家】檀家ID / 管理番号 (任意)', description: '例: H-101 (空欄時は自動採番)', aliases: ['檀家ID', '檀家id', '檀家番号', 'ID', 'id', '世帯ID', '会員番号', '管理番号', 'コード', '檀家コード', '世帯番号', 'No', 'NO', '檀家No'] },
  { key: 'familyHead', label: '【檀家】施主名', required: true, description: '例: 山田 太郎', aliases: ['施主名', '世帯主', '世帯主名', '氏名', '名前', '檀家名', '檀家氏名', '代表者', '当家名', '戸主'] },
  { key: 'furigana', label: '【檀家】フリガナ', description: '例: ヤマダ タロウ', aliases: ['フリガナ', 'ふりがな', 'カナ', 'かな', '読み', '氏名カナ'] },
  { key: 'postalCode', label: '【檀家】郵便番号', description: '例: 123-4567', aliases: ['郵便番号', '〒', '郵便', 'zip', 'postcode'] },
  { key: 'address', label: '【檀家】住所', description: '例: 東京都港区...', aliases: ['住所', '所在地', '現住所', '住所1', '住所2'] },
  { key: 'phone', label: '【檀家】電話番号', description: '例: 03-1234-5678', aliases: ['電話番号', '電話', 'TEL', 'tel', '固定電話'] },
  { key: 'district', label: '【檀家】役職', description: '例: 総代、世話人など', aliases: ['役職', '総代・世話人', '総代', '世話人', '役員', '地区', '世話人地区', '組', '班'] },
  { key: 'householdType', label: '【檀家】区分１', description: '例: 正檀家', aliases: ['区分1', '区分１', '檀家区分', '種別', '檀家種別', '区分'] },
  { key: 'status', label: '【檀家】区分２', description: '例: 健在', aliases: ['区分2', '区分２', '状態', '状況', 'ステータス', '状態区分'] },
  { key: 'tombNumber', label: '【檀家】墓地番号', description: '例: A-1', aliases: ['墓地番号', '墓地', '区画'] },
  { key: 'isSegakiToba', label: '【檀家】施餓鬼塔婆申込', description: '例: 申込済 / 未申込', aliases: ['施餓鬼塔婆申込', '施餓鬼塔婆', '施餓鬼申込', '施餓鬼', '塔婆申込', 'isSegakiToba'] },
  { key: 'segakiTamegaki', label: '【檀家】施餓鬼為書き', description: '例: 先祖代々供養', aliases: ['施餓鬼為書き', '為書き', '施餓鬼為書', '為書', 'segakiTamegaki'] },
  { key: 'tanagyoMonthlyVisit', label: '【檀家】棚経・月参り対象', description: '例: 対象 / 未対象', aliases: ['棚経・月参り対象', '棚経・月参り', '棚経月参り', '棚経対象', '棚経', '月参り', 'tanagyoMonthlyVisit'] },
  { key: 'tanagyoAddress', label: '【檀家】棚経伺い先住所', description: '別居先や訪問先住所', aliases: ['棚経伺い先住所', '棚経訪問先住所', '棚経住所', '伺い先住所', 'tanagyoAddress'] },
  { key: 'tanagyoNotes', label: '【檀家】棚経訪問特記', description: '訪問時間帯や特記', aliases: ['棚経訪問特記', '棚経特記', '棚経備考', 'tanagyoNotes'] },
  // Past record part
  { key: 'dharmaName', label: '【故人】戒名 / 法名', required: true, description: '例: 釋慈光信士', aliases: ['戒名', '法名', '法号', '法名・戒名', '戒名・法名', '尊霊', '霊位'] },
  { key: 'secularName', label: '【故人】俗名 / 故人氏名', description: '例: 山田 花子', aliases: ['俗名', '本名', '故人名', '故人氏名', '亡者名'] },
  { key: 'deathDate', label: '【故人】没年月日 / 命日', required: true, description: '例: 令和4年5月1日', aliases: ['没年月日', '命日', '逝去年月日', '死亡年月日', '忌日'] },
  { key: 'ageAtDeath', label: '【故人】享年 / 行年', description: '例: 85', aliases: ['享年', '行年', '没年齢', '死亡時年齢', '年齢'] },
  { key: 'relationship', label: '【故人】施主との続柄', description: '例: 父、母（空欄可）', aliases: ['続柄', '関係', '戸主との関係', '施主との続柄'] },
  { key: 'createdDate', label: '作成日 (任意)', description: '例: 2026/04/01 (空欄時は取込日時)', aliases: ['作成日', '作成年月日', '登録日', 'createdDate', 'createdAt'] },
  { key: 'createdTime', label: '作成時間 (任意)', description: '例: 12:00:00 (空欄時は取込日時)', aliases: ['作成時間', '作成時刻', 'createdTime'] },
  { key: 'updatedDate', label: '修正日 (任意)', description: '例: 2026/04/01 (空欄時は取込日時)', aliases: ['修正日', '更新日', '修正年月日', '更新年月日', 'updatedDate', 'updatedAt'] },
  { key: 'updatedTime', label: '修正時間 (任意)', description: '例: 12:00:00 (空欄時は取込日時)', aliases: ['修正時間', '更新時間', '修正時刻', '更新時刻', 'updatedTime'] },
];

export const ACCOUNTING_MAPPING_FIELDS: ColumnMappingField[] = [
  { key: 'householdId', label: '檀家ID / 檀家管理番号 (任意)', description: '例: H-101 (檀家と自動紐付け)', aliases: ['檀家ID', '檀家id', '檀家番号', '世帯ID', '会員番号', '管理番号', 'コード', '檀家コード', '世帯番号', 'ID', 'id', '檀家No', 'No'] },
  { key: 'date', label: '取引日付', required: true, description: '例: 2026/04/01', aliases: ['日付', '取引日', '年月日', '入金日', '出金日', '記帳日', 'date', '出納日', '発生日'] },
  { key: 'category', label: '勘定科目 / 名目', required: true, description: '例: 法要布施, 護持会費', aliases: ['科目', '勘定科目', '名目', '区分', '内訳', '項目', '勘定', '科目名'] },
  { key: 'type', label: '収支区分 (収入/支出)', description: '例: 収入, 支出 (省略時は金額符号で判定)', aliases: ['収支', '収支区分', '入出金', '種別', '出納区分', '入出区分', '収入/支出'] },
  { key: 'amount', label: '金額 (円)', required: true, description: '例: 30000', aliases: ['金額', '金額（円）', '入金額', '出金額', '入金', '出金', 'amount', '合計', '税込金額', '取引金額'] },
  { key: 'householdHeadName', label: '施主名 / 檀家名 / 相手先', description: '例: 山田 太郎', aliases: ['施主名', '相手先', '檀家名', '支払先', '氏名', '納入者', '当家', '宛名', '取引先'] },
  { key: 'paymentMethod', label: '支払・受取方法 / 通帳名', description: '例: 現金受付, ○○銀行, 郵便振替, 通帳名など', aliases: ['支払方法', '受取方法', '入金方法', '決済方法', '支払区分', '支払・受取方法', '支払/受取方法', '受取・支払方法', '支払受取方法', '決済手段', '支払手段', '出納方法', '金種', '決済', '取扱', '口座', '口座名', '通帳', '通帳名', '預金', '方法', '決済種別', '取引区分', 'paymentMethod', 'method'] },
  { key: 'notes', label: '備考 / 摘要', description: '自由記入メモ', aliases: ['備考', '摘要', 'メモ', '領収証番号', '特記', '内容', '行状'] },
  { key: 'createdDate', label: '作成日 (任意)', description: '例: 2026/04/01 (空欄時は取込日時)', aliases: ['作成日', '作成年月日', '登録日', 'createdDate', 'createdAt'] },
  { key: 'createdTime', label: '作成時間 (任意)', description: '例: 12:00:00 (空欄時は取込日時)', aliases: ['作成時間', '作成時刻', 'createdTime'] },
  { key: 'updatedDate', label: '修正日 (任意)', description: '例: 2026/04/01 (空欄時は取込日時)', aliases: ['修正日', '更新日', '修正年月日', '更新年月日', 'updatedDate', 'updatedAt'] },
  { key: 'updatedTime', label: '修正時間 (任意)', description: '例: 12:00:00 (空欄時は取込日時)', aliases: ['修正時間', '更新時間', '修正時刻', '更新時刻', 'updatedTime'] },
];

export interface ParsedRawTable {
  sheetNames: string[];
  activeSheetName: string;
  headers: string[];
  rawRows: (string | number | undefined)[][];
  totalRows: number;
}

/**
 * Parses raw file (Excel .xlsx/.xls or CSV/TSV) into 2D table data.
 * Auto-detects UTF-8 and Shift-JIS (CP932) encoding for CSV.
 */
export async function parseFileToTable(file: File, sheetIndex = 0): Promise<ParsedRawTable> {
  const fileName = file.name.toLowerCase();

  if (fileName.endsWith('.csv') || fileName.endsWith('.tsv') || fileName.endsWith('.txt')) {
    const arrayBuffer = await file.arrayBuffer();
    
    // Try decoding UTF-8 first, detect replacement characters; fallback to Shift-JIS
    let text = '';
    try {
      const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
      text = utf8Decoder.decode(arrayBuffer);
    } catch {
      // If UTF-8 fails with fatal error, decode with Shift-JIS / Windows-31J
      const sjisDecoder = new TextDecoder('shift-jis');
      text = sjisDecoder.decode(arrayBuffer);
    }

    const delimiter = fileName.endsWith('.tsv') ? '\t' : ',';
    const wb = XLSX.read(text, { type: 'string', raw: true });
    const firstSheetName = wb.SheetNames[0] || 'CSV';
    const ws = wb.Sheets[firstSheetName];
    const data: (string | number | undefined)[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

    // Filter empty lines
    const cleanData = data.filter(row => row && row.some(cell => String(cell).trim() !== ''));
    const headers = cleanData[0] ? cleanData[0].map(h => String(h || '').trim()) : [];
    const rawRows = cleanData.slice(1);

    return {
      sheetNames: [firstSheetName],
      activeSheetName: firstSheetName,
      headers,
      rawRows,
      totalRows: rawRows.length,
    };
  } else {
    // Excel file (.xlsx, .xls)
    const arrayBuffer = await file.arrayBuffer();
    const wb = XLSX.read(arrayBuffer, { 
      type: 'array',
      dense: true,
      cellDates: true,
      dateNF: 'yyyy/mm/dd',
    });
    const sheetNames = wb.SheetNames;
    const activeSheetName = sheetNames[sheetIndex] || sheetNames[0];
    const ws = wb.Sheets[activeSheetName];
    const data: (string | number | Date | undefined)[][] = XLSX.utils.sheet_to_json(ws, { 
      header: 1, 
      defval: '',
      raw: false,
      dateNF: 'yyyy/mm/dd',
    });

    const cleanData = data
      .filter(row => row && row.some(cell => cell !== undefined && cell !== null && String(cell).trim() !== ''))
      .map(row => row.map(cell => {
        if (cell instanceof Date) {
          return normalizeDateInput(cell);
        }
        return cell !== undefined && cell !== null ? String(cell).trim() : '';
      }));

    const headers = cleanData[0] ? cleanData[0].map(h => String(h || '').trim()) : [];
    const rawRows = cleanData.slice(1);

    return {
      sheetNames,
      activeSheetName,
      headers,
      rawRows,
      totalRows: rawRows.length,
    };
  }
}

/**
 * Intelligent Column Auto-Mapper:
 * Matches detected headers with mapping fields based on alias keywords and fuzzy score.
 */
export function autoMapColumns(headers: string[], fields: ColumnMappingField[]): Record<string, string> {
  const mapping: Record<string, string> = {};

  const clean = (s: string) => s.trim().toLowerCase().replace(/[\s\r\n_（）()【】\[\]/・\-]/g, '');

  fields.forEach(field => {
    // 1. Exact match by label or key
    const cleanLabel = clean(field.label);
    const cleanKey = clean(field.key);
    const exactIndex = headers.findIndex(h => {
      const ch = clean(h);
      return ch === cleanLabel || ch === cleanKey;
    });
    if (exactIndex !== -1) {
      mapping[field.key] = headers[exactIndex];
      return;
    }

    // 2. Alias exact match
    for (const alias of field.aliases) {
      const cleanAlias = clean(alias);
      if (!cleanAlias) continue;
      const aliasIndex = headers.findIndex(h => clean(h) === cleanAlias);
      if (aliasIndex !== -1) {
        mapping[field.key] = headers[aliasIndex];
        return;
      }
    }

    // 3. Header contains alias match (only for non-generic aliases with min length 2)
    for (const alias of field.aliases) {
      const cleanAlias = clean(alias);
      if (!cleanAlias || cleanAlias.length < 2) continue;
      if (['id', 'no', '名', '区分', '金額'].includes(cleanAlias)) continue;
      const containsIndex = headers.findIndex(h => clean(h).includes(cleanAlias));
      if (containsIndex !== -1) {
        mapping[field.key] = headers[containsIndex];
        return;
      }
    }
  });

  return mapping;
}

/**
 * Clean & Format Helpers
 */
export function cleanPostalCode(val: string | number | undefined): string {
  if (val === undefined || val === null) return '';
  let str = String(val).trim().replace(/[〒\s]/g, '');
  str = str.replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xfee0));
  str = str.replace(/[^0-9-]/g, '');
  if (/^\d{7}$/.test(str)) {
    return `${str.slice(0, 3)}-${str.slice(3)}`;
  }
  return str;
}

export function cleanPhone(val: string | number | undefined): string {
  if (val === undefined || val === null) return '';
  let str = String(val).trim();
  str = str.replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xfee0));
  return str;
}

export function cleanAge(val: string | number | undefined): number | undefined {
  if (val === undefined || val === null) return undefined;
  let str = String(val).trim();
  if (!str) return undefined;
  str = str.replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xfee0));
  str = str.replace(/[^0-9]/g, '');
  if (!str) return undefined;
  const num = parseInt(str, 10);
  return isNaN(num) || num <= 0 ? undefined : num;
}

export function cleanFurigana(val: string | number | undefined): string {
  return normalizeFurigana(val);
}

export function cleanAmount(val: string | number | undefined): number {
  if (val === undefined || val === null) return 0;
  let str = String(val).trim().replace(/[,，¥円\s]/g, '');
  str = str.replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xfee0));
  const num = parseFloat(str);
  return isNaN(num) ? 0 : num;
}

/**
 * Preserves payment method text (including bank account / passbook names) as-is from the imported data.
 * If empty or undefined, defaults to '現金受付'.
 */
export function normalizePaymentMethod(val: string | number | undefined): string {
  if (val === undefined || val === null) return '現金受付';
  const str = String(val).trim();
  if (!str) return '現金受付';
  // 通帳名や個別口座名などの生データを勝手に丸め込まず、そのまま取り込む
  return str;
}

/**
 * Extracts past record items from raw table rows based on mapping for lineage matching and verification.
 */
export function extractKakochoItems(
  headers: string[],
  rawRows: (string | number | undefined)[][],
  mapping: Record<string, string>
): KakochoItemInput[] {
  const headerIndexMap: Record<string, number> = {};
  headers.forEach((h, idx) => {
    headerIndexMap[h] = idx;
  });

  const getCell = (row: (string | number | undefined)[], fieldKey: string): string => {
    const colName = mapping[fieldKey];
    if (!colName) return '';
    const colIdx = headerIndexMap[colName];
    if (colIdx === undefined || colIdx === -1) return '';
    const cellVal = row[colIdx];
    return cellVal !== undefined && cellVal !== null ? String(cellVal).trim() : '';
  };

  const items: KakochoItemInput[] = [];

  rawRows.forEach((row, rowIdx) => {
    const dharmaName = getCell(row, 'dharmaName');
    const secularName = getCell(row, 'secularName');
    const rawDeathDate = getCell(row, 'deathDate');

    if (!dharmaName && !secularName) return;

    const { normalizedDate, timestamp, year } = parseDeathDateToTimestampAndYear(rawDeathDate);
    const ageAtDeath = cleanAge(getCell(row, 'ageAtDeath'));
    const householdHeadName = getCell(row, 'householdHeadName');
    const currentHeadName = getCell(row, 'currentHeadName');
    const rawHouseholdId = getCell(row, 'householdId') || getCell(row, 'id');
    const relationship = getCell(row, 'relationship') || '';
    const burialLocation = getCell(row, 'burialLocation') || getCell(row, 'tombNumber');
    const niibon = getCell(row, 'niibon');
    const notes = getCell(row, 'notes');
    const createdDate = getCell(row, 'createdDate');
    const createdTime = getCell(row, 'createdTime');
    const updatedDate = getCell(row, 'updatedDate');
    const updatedTime = getCell(row, 'updatedTime');

    items.push({
      index: items.length,
      rowIdx,
      dharmaName,
      secularName,
      rawDeathDate,
      deathDate: normalizedDate,
      deathYear: year,
      deathTimestamp: timestamp,
      ageAtDeath,
      householdHeadName,
      currentHeadName,
      rawHouseholdId,
      relationship,
      burialLocation,
      niibon,
      notes,
      createdDate,
      createdTime,
      updatedDate,
      updatedTime,
      rawRow: row,
    });
  });

  return items;
}

/**
 * Parses and converts raw table into typed data based on chosen mapping.
 */
export function convertTableToData(
  targetType: ImportTargetType,
  headers: string[],
  rawRows: (string | number | undefined)[][],
  mapping: Record<string, string>,
  options: {
    existingHouseholds: Household[];
    conflictMode: 'append' | 'merge' | 'replace';
    autoCreateHouseholdForKakocho?: boolean;
    defaultHouseholdType?: string;
    targetTempleId?: string;
    temples?: TempleProfile[];
    linkingDecisions?: Record<number, LinkingDecision>;
  }
): {
  households: Household[];
  pastRecords: PastRecord[];
  transactions: Transaction[];
  importedHouseholds: Household[];
  importedPastRecords: PastRecord[];
  importedTransactions: Transaction[];
  stats: {
    totalParsed: number;
    householdsCreated: number;
    householdsUpdated: number;
    pastRecordsCreated: number;
    transactionsCreated: number;
    warnings: string[];
  };
} {
  const targetTempleId = options.targetTempleId || 'temple-main';
  const headerIndexMap: Record<string, number> = {};
  headers.forEach((h, idx) => {
    headerIndexMap[h] = idx;
  });

  const getCell = (row: (string | number | undefined)[], fieldKey: string): string => {
    const colName = mapping[fieldKey];
    if (!colName) return '';
    const colIdx = headerIndexMap[colName];
    if (colIdx === undefined || colIdx === -1) return '';
    const cellVal = row[colIdx];
    return cellVal !== undefined && cellVal !== null ? String(cellVal).trim() : '';
  };

  const warnings: string[] = [];
  let householdsCreated = 0;
  let householdsUpdated = 0;
  let pastRecordsCreated = 0;
  let transactionsCreated = 0;

  // Working lists
  // 'replace' mode for household or combined initializes outHouseholds to retain other temples' data
  let outHouseholds: Household[] = ((targetType === 'household' || targetType === 'combined') && options.conflictMode === 'replace') 
    ? options.existingHouseholds.filter(h => (h.templeId || 'temple-main') !== targetTempleId) 
    : [...options.existingHouseholds];
  let outPastRecords: PastRecord[] = [];
  let outTransactions: Transaction[] = [];

  // Dedicated lists for imported data (only items derived from the current file rows)
  const importedHouseholds: Household[] = [];
  const importedPastRecords: PastRecord[] = [];
  const importedTransactions: Transaction[] = [];

  // ===================== Danka ID Calculation & Normalization =====================
  const templePrefix = getTemplePrefix(targetTempleId, options.temples);

  /**
   * Normalizes incoming raw ID to temple prefix (DK- / K0- / K1- ... K9-) with 5 digits and no suffix.
   */
  const normalizeToTempleId = (rawId?: string | number): string => {
    if (rawId === undefined || rawId === null || String(rawId).trim() === '') return '';
    return cleanAndNormalizeHouseholdId(rawId, targetTempleId, options.temples);
  };

  // Helper to generate next available Household ID for this temple
  const getNextAvailableId = (): string => {
    return generateNewHouseholdId(targetTempleId, outHouseholds, options.temples);
  };

  // Helper to normalize IDs for flexible cross-database matching (e.g. 'DK-01001' <-> '1001' <-> 'H-1001')
  const normalizeId = (val?: string): string => {
    if (!val) return '';
    const match = String(val).match(/\d+/);
    if (match) {
      return String(parseInt(match[0], 10));
    }
    return String(val).trim().toUpperCase();
  };

  // Helper to normalize names (remove whitespaces, titles like '様', '殿', '家', '当家')
  const normalizeName = (val?: string): string => {
    if (!val) return '';
    return String(val)
      .replace(/[\s　]/g, '')
      .replace(/(様|殿|当家|家|方)$/, '')
      .trim();
  };

  // Helper to find existing household by ID or Name (preferring targetTempleId)
  const findHousehold = (headName: string, address?: string, id?: string): Household | undefined => {
    if (id) {
      const cleanRawId = String(id).trim();
      const normalizedCandidate = normalizeToTempleId(cleanRawId);

      // Prefer target temple first
      const byExactIdSameTemple = outHouseholds.find(h => (h.templeId || 'temple-main') === targetTempleId && (h.id === cleanRawId || (normalizedCandidate && h.id === normalizedCandidate)));
      if (byExactIdSameTemple) return byExactIdSameTemple;

      const byExactId = outHouseholds.find(h => h.id === cleanRawId || (normalizedCandidate && h.id === normalizedCandidate));
      if (byExactId) return byExactId;

      const normSearchId = normalizeId(cleanRawId);
      if (normSearchId) {
        const byNormIdSameTemple = outHouseholds.find(h => (h.templeId || 'temple-main') === targetTempleId && normalizeId(h.id) === normSearchId);
        if (byNormIdSameTemple) return byNormIdSameTemple;

        const byNormId = outHouseholds.find(h => normalizeId(h.id) === normSearchId);
        if (byNormId) return byNormId;
      }
    }

    if (!headName) return undefined;
    const cleanName = normalizeName(headName);
    if (!cleanName) return undefined;

    const cleanAddr = (address || '').replace(/[\s　]/g, '');

    // 1. Exact or normalized name match within same temple
    const byNameSameTemple = outHouseholds.find(h => {
      if ((h.templeId || 'temple-main') !== targetTempleId) return false;
      const hClean = normalizeName(h.familyHead);
      if (hClean === cleanName) return true;
      if (cleanAddr && h.address) {
        const aClean = h.address.replace(/[\s　]/g, '');
        if ((hClean.includes(cleanName) || cleanName.includes(hClean)) && (aClean.includes(cleanAddr) || cleanAddr.includes(aClean))) {
          return true;
        }
      }
      return false;
    });

    if (byNameSameTemple) return byNameSameTemple;

    // 2. Exact or normalized name match across all temples
    const byName = outHouseholds.find(h => {
      const hClean = normalizeName(h.familyHead);
      if (hClean === cleanName) return true;
      if (cleanAddr && h.address) {
        const aClean = h.address.replace(/[\s　]/g, '');
        if ((hClean.includes(cleanName) || cleanName.includes(hClean)) && (aClean.includes(cleanAddr) || cleanAddr.includes(aClean))) {
          return true;
        }
      }
      return false;
    });

    if (byName) return byName;

    // 3. Partial name match if long enough (>= 2 chars)
    if (cleanName.length >= 2) {
      const partialSameTemple = outHouseholds.find(h => {
        if ((h.templeId || 'temple-main') !== targetTempleId) return false;
        const hClean = normalizeName(h.familyHead);
        return hClean === cleanName || hClean.includes(cleanName) || cleanName.includes(hClean);
      });
      if (partialSameTemple) return partialSameTemple;

      return outHouseholds.find(h => {
        const hClean = normalizeName(h.familyHead);
        return hClean === cleanName || hClean.includes(cleanName) || cleanName.includes(hClean);
      });
    }

    return undefined;
  };

  const importAudit = getCurrentAuditFields();

  if (targetType === 'household') {
    rawRows.forEach((row, rowIdx) => {
      const headName = getCell(row, 'familyHead');
      if (!headName) {
        warnings.push(`行 ${rowIdx + 2}: 世帯主名が空のためスキップしました。`);
        return;
      }

      const rawId = getCell(row, 'id') || getCell(row, 'householdId');
      const address = getCell(row, 'address');
      const postalCode = cleanPostalCode(getCell(row, 'postalCode'));
      const phone = cleanPhone(getCell(row, 'phone'));
      const mobile = cleanPhone(getCell(row, 'mobile'));
      const furigana = cleanFurigana(getCell(row, 'furigana'));
      const district = getCell(row, 'district');
      const tombNumber = getCell(row, 'tombNumber');
      const householdType = getCell(row, 'householdType');
      const status = getCell(row, 'status');

      // Toba 1, 2, 3
      const toba1Val = getCell(row, 'toba1Applied') || getCell(row, 'isSegakiToba');
      const toba1Applied = toba1Val ? (toba1Val === '申込' || toba1Val === '申込済' || toba1Val === '対象' || toba1Val === '有' || toba1Val === '1' || toba1Val.toLowerCase() === 'true' || (toba1Val.includes('申込') && !toba1Val.includes('未')) || (toba1Val.includes('対象') && !toba1Val.includes('未'))) : false;
      const toba1Tamegaki = getCell(row, 'toba1Tamegaki') || getCell(row, 'segakiTamegaki');

      const toba2Val = getCell(row, 'toba2Applied');
      const toba2Applied = toba2Val ? (toba2Val === '申込' || toba2Val === '申込済' || toba2Val === '対象' || toba2Val === '有' || toba2Val === '1' || toba2Val.toLowerCase() === 'true' || (toba2Val.includes('申込') && !toba2Val.includes('未')) || (toba2Val.includes('対象') && !toba2Val.includes('未'))) : false;
      const toba2Tamegaki = getCell(row, 'toba2Tamegaki');

      const toba3Val = getCell(row, 'toba3Applied');
      const toba3Applied = toba3Val ? (toba3Val === '申込' || toba3Val === '申込済' || toba3Val === '対象' || toba3Val === '有' || toba3Val === '1' || toba3Val.toLowerCase() === 'true' || (toba3Val.includes('申込') && !toba3Val.includes('未')) || (toba3Val.includes('対象') && !toba3Val.includes('未'))) : false;
      const toba3Tamegaki = getCell(row, 'toba3Tamegaki');

      const rawFee1 = getCell(row, 'fee1Amount');
      const rawFee2 = getCell(row, 'fee2Amount');
      const rawFee3 = getCell(row, 'fee3Amount');
      const parseFee = (v: string): number | undefined => {
        if (!v) return undefined;
        const cleaned = v.replace(/[^0-9.-]/g, '');
        if (!cleaned) return undefined;
        const n = Number(cleaned);
        return isNaN(n) ? undefined : n;
      };
      const fee1Amount = parseFee(rawFee1);
      const fee2Amount = parseFee(rawFee2);
      const fee3Amount = parseFee(rawFee3);

      const tanagyoVal = getCell(row, 'tanagyoMonthlyVisit');
      const tanagyoMonthlyVisit = tanagyoVal === '対象' || tanagyoVal === '棚経' || tanagyoVal === '月参り' || tanagyoVal === '有' || tanagyoVal === '1' || tanagyoVal.toLowerCase() === 'true' || (tanagyoVal.includes('対象') && !tanagyoVal.includes('未'));
      const tanagyoAddress = getCell(row, 'tanagyoAddress');
      const tanagyoNotes = getCell(row, 'tanagyoNotes');
      const notes = getCell(row, 'notes');

      const rawCDate = normalizeAuditDate(getCell(row, 'createdDate'));
      const rawCTime = normalizeAuditTime(getCell(row, 'createdTime'));
      const rawUDate = normalizeAuditDate(getCell(row, 'updatedDate'));
      const rawUTime = normalizeAuditTime(getCell(row, 'updatedTime'));

      const createdDate = rawCDate || importAudit.date;
      const createdTime = rawCTime || importAudit.time;
      const updatedDate = rawUDate || importAudit.date;
      const updatedTime = rawUTime || importAudit.time;

      const existing = options.conflictMode === 'merge' ? findHousehold(headName, address, rawId) : undefined;

      if (existing) {
        // Update existing
        existing.furigana = furigana || existing.furigana;
        existing.postalCode = postalCode || existing.postalCode;
        existing.address = address || existing.address;
        existing.phone = phone || existing.phone;
        existing.mobile = mobile || existing.mobile;
        existing.district = district || existing.district;
        existing.tombNumber = tombNumber || existing.tombNumber;
        existing.householdType = householdType || existing.householdType;
        existing.status = status || existing.status;
        if (toba1Val) {
          existing.isSegakiToba = toba1Applied;
          existing.toba1Applied = toba1Applied;
        }
        if (toba1Tamegaki !== undefined && toba1Tamegaki !== '') {
          existing.segakiTamegaki = toba1Tamegaki;
          existing.toba1Tamegaki = toba1Tamegaki;
        }
        if (toba2Val) existing.toba2Applied = toba2Applied;
        if (toba2Tamegaki !== undefined && toba2Tamegaki !== '') existing.toba2Tamegaki = toba2Tamegaki;
        if (toba3Val) existing.toba3Applied = toba3Applied;
        if (toba3Tamegaki !== undefined && toba3Tamegaki !== '') existing.toba3Tamegaki = toba3Tamegaki;
        if (fee1Amount !== undefined) existing.fee1Amount = fee1Amount;
        if (fee2Amount !== undefined) existing.fee2Amount = fee2Amount;
        if (fee3Amount !== undefined) existing.fee3Amount = fee3Amount;
        if (tanagyoVal) existing.tanagyoMonthlyVisit = tanagyoMonthlyVisit;
        if (tanagyoAddress) existing.tanagyoAddress = tanagyoAddress;
        if (tanagyoNotes) existing.tanagyoNotes = tanagyoNotes;
        if (notes) existing.notes = existing.notes ? `${existing.notes} / ${notes}` : notes;
        existing.createdDate = existing.createdDate || createdDate;
        existing.createdTime = existing.createdTime || createdTime;
        existing.updatedDate = rawUDate || importAudit.date;
        existing.updatedTime = rawUTime || importAudit.time;
        householdsUpdated++;
        importedHouseholds.push({ ...existing });
      } else {
        // Create new with standardized temple-specific 5-digit ID (no -2/-3 suffix)
        let id = rawId ? normalizeToTempleId(rawId) : '';
        if (id && outHouseholds.some(h => h.id === id)) {
          // If ID already exists, allocate the next free 5-digit ID for this temple instead of appending '-2'
          id = getNextAvailableId();
        } else if (!id) {
          id = getNextAvailableId();
        }

        const newH: Household = {
          id,
          templeId: targetTempleId,
          familyHead: headName,
          furigana,
          postalCode,
          address,
          phone,
          mobile,
          district,
          tombNumber,
          householdType,
          status,
          isSegakiToba: toba1Applied,
          segakiTamegaki: toba1Tamegaki || undefined,
          toba1Applied,
          toba1Tamegaki: toba1Tamegaki || undefined,
          toba2Applied: toba2Applied || undefined,
          toba2Tamegaki: toba2Tamegaki || undefined,
          toba3Applied: toba3Applied || undefined,
          toba3Tamegaki: toba3Tamegaki || undefined,
          fee1Amount,
          fee2Amount,
          fee3Amount,
          tanagyoMonthlyVisit,
          tanagyoAddress: tanagyoAddress || undefined,
          tanagyoNotes: tanagyoNotes || undefined,
          notes,
          qrToken: `QR-${id}-${Date.now().toString(36).toUpperCase()}`,
          familyMembers: [],
          createdAt: `${createdDate.replace(/\//g, '-')}T${createdTime}`,
          createdDate,
          createdTime,
          updatedDate,
          updatedTime,
        };
        outHouseholds.push(newH);
        importedHouseholds.push(newH);
        householdsCreated++;
      }
    });
  } else if (targetType === 'past_record') {
    rawRows.forEach((row, rowIdx) => {
      const dharmaName = getCell(row, 'dharmaName');
      const secularName = getCell(row, 'secularName');
      const rawDeathDate = getCell(row, 'deathDate');

      if (!dharmaName && !secularName) {
        warnings.push(`行 ${rowIdx + 2}: 戒名または俗名が未入力のためスキップしました。`);
        return;
      }

      const deathDate = normalizeDateInput(rawDeathDate);
      const ageAtDeath = cleanAge(getCell(row, 'ageAtDeath'));
      const originalHeadName = getCell(row, 'householdHeadName'); // 当時の施主名
      const currentHeadName = getCell(row, 'currentHeadName');     // 現在の施主名
      const rawHouseholdId = getCell(row, 'householdId') || getCell(row, 'id');
      const relationship = getCell(row, 'relationship') || ''; // 空欄のときは空のまま
      const burialLocation = getCell(row, 'burialLocation');
      const notes = getCell(row, 'notes');

      const rawCDate = normalizeAuditDate(getCell(row, 'createdDate'));
      const rawCTime = normalizeAuditTime(getCell(row, 'createdTime'));
      const rawUDate = normalizeAuditDate(getCell(row, 'updatedDate'));
      const rawUTime = normalizeAuditTime(getCell(row, 'updatedTime'));

      const createdDate = rawCDate || importAudit.date;
      const createdTime = rawCTime || importAudit.time;
      const updatedDate = rawUDate || importAudit.date;
      const updatedTime = rawUTime || importAudit.time;

      // Link or create Household by ID, User Decision, or Lineage Match
      let targetHousehold: Household | undefined = undefined;
      const userDecision = options.linkingDecisions?.[rowIdx];

      if (userDecision) {
        if (userDecision.action === 'link_existing' && userDecision.targetHouseholdId) {
          targetHousehold = outHouseholds.find(h => h.id === userDecision.targetHouseholdId);
          if (!targetHousehold) {
            targetHousehold = options.existingHouseholds.find(h => h.id === userDecision.targetHouseholdId);
            if (targetHousehold && !outHouseholds.some(h => h.id === targetHousehold!.id)) {
              outHouseholds.push(targetHousehold);
            }
          }
        } else if (userDecision.action === 'create_new_household') {
          let newHId = getNextAvailableId();
          const headName = userDecision.newHouseholdHeadName || originalHeadName || currentHeadName || '（世帯主未設定）';

          targetHousehold = {
            id: newHId,
            templeId: targetTempleId,
            familyHead: headName,
            furigana: '',
            postalCode: '',
            address: '',
            phone: '',
            district: '',
            tombNumber: burialLocation || '',
            householdType: options.defaultHouseholdType || '',
            status: '',
            qrToken: `QR-${newHId}-${Date.now().toString(36).toUpperCase()}`,
            familyMembers: [],
            createdAt: `${createdDate.replace(/\//g, '-')}T${createdTime}`,
            createdDate,
            createdTime,
            updatedDate,
            updatedTime,
          };
          outHouseholds.push(targetHousehold);
          importedHouseholds.push(targetHousehold);
          householdsCreated++;
        }
        // If userDecision.action === 'skip_unlinked', targetHousehold remains undefined
      } else {
        // Automatic / Fallback Matching (High Precision)
        if (rawHouseholdId) {
          // 檀家IDがある場合: IDから現在の世帯を検索
          targetHousehold = findHousehold('', undefined, rawHouseholdId);
          if (!targetHousehold && (currentHeadName || originalHeadName)) {
            targetHousehold = findHousehold(currentHeadName || originalHeadName);
          }
        } else if (currentHeadName || originalHeadName) {
          // 檀家IDがない場合: 現在の施主名または当時の施主名から検索
          targetHousehold = findHousehold(currentHeadName || originalHeadName);
        }

        // 自動世帯作成オプションが有効で、世帯が見つからない場合
        if (!targetHousehold && (rawHouseholdId || currentHeadName || originalHeadName) && options.autoCreateHouseholdForKakocho) {
          let newHId = rawHouseholdId ? normalizeToTempleId(rawHouseholdId) : '';
          if (newHId && outHouseholds.some(h => h.id === newHId)) {
            newHId = getNextAvailableId();
          } else if (!newHId) {
            newHId = getNextAvailableId();
          }

          const householdHead = currentHeadName || originalHeadName || '（世帯主未設定）';

          targetHousehold = {
            id: newHId,
            templeId: targetTempleId,
            familyHead: householdHead,
            furigana: '',
            postalCode: '',
            address: '',
            phone: '',
            district: '',
            tombNumber: burialLocation || '',
            householdType: options.defaultHouseholdType || '',
            status: '',
            qrToken: `QR-${newHId}-${Date.now().toString(36).toUpperCase()}`,
            familyMembers: [],
            createdAt: `${createdDate.replace(/\//g, '-')}T${createdTime}`,
            createdDate,
            createdTime,
            updatedDate,
            updatedTime,
          };
          outHouseholds.push(targetHousehold);
          importedHouseholds.push(targetHousehold);
          householdsCreated++;
        }
      }

      const householdId = targetHousehold ? targetHousehold.id : (rawHouseholdId ? normalizeToTempleId(rawHouseholdId) : `${templePrefix}00000`);
      // 当時の施主名: 空欄であれば空欄のまま保持する
      const recordedOriginalHeadName = originalHeadName || '';
      const rawNiibon = getCell(row, 'niibon');

      const pastRec: PastRecord = {
        id: `P-${Date.now().toString(36)}-${rowIdx}-${Math.floor(Math.random() * 9000 + 1000)}`,
        templeId: targetTempleId,
        householdId,
        householdHeadName: recordedOriginalHeadName,
        dharmaName: dharmaName || '',
        secularName: secularName || '',
        deathDate: deathDate || '',
        ageAtDeath: ageAtDeath,
        relationship,
        burialLocation: burialLocation || (targetHousehold ? targetHousehold.tombNumber : ''),
        niibon: rawNiibon || undefined,
        notes,
        createdDate,
        createdTime,
        updatedDate,
        updatedTime,
      };

      outPastRecords.push(pastRec);
      importedPastRecords.push(pastRec);
      pastRecordsCreated++;
    });
  } else if (targetType === 'combined') {
    // 1 row contains both Household and PastRecord
    rawRows.forEach((row, rowIdx) => {
      const headName = getCell(row, 'familyHead');
      const dharmaName = getCell(row, 'dharmaName');
      const secularName = getCell(row, 'secularName');
      const rawHouseholdId = getCell(row, 'householdId') || getCell(row, 'id');

      if (!headName && !dharmaName && !secularName && !rawHouseholdId) {
        warnings.push(`行 ${rowIdx + 2}: 檀家名・戒名ともに空のためスキップしました。`);
        return;
      }

      const address = getCell(row, 'address');
      const postalCode = cleanPostalCode(getCell(row, 'postalCode'));
      const phone = cleanPhone(getCell(row, 'phone'));
      const furigana = cleanFurigana(getCell(row, 'furigana'));
      const district = getCell(row, 'district');
      const tombNumber = getCell(row, 'tombNumber');
      const segakiVal = getCell(row, 'isSegakiToba');
      const isSegakiToba = segakiVal === '申込' || segakiVal === '申込済' || segakiVal === '対象' || segakiVal === '有' || segakiVal === '1' || segakiVal.toLowerCase() === 'true' || (segakiVal.includes('申込') && !segakiVal.includes('未')) || (segakiVal.includes('対象') && !segakiVal.includes('未'));
      const segakiTamegaki = getCell(row, 'segakiTamegaki');
      const tanagyoVal = getCell(row, 'tanagyoMonthlyVisit');
      const tanagyoMonthlyVisit = tanagyoVal === '対象' || tanagyoVal === '棚経' || tanagyoVal === '月参り' || tanagyoVal === '有' || tanagyoVal === '1' || tanagyoVal.toLowerCase() === 'true' || (tanagyoVal.includes('対象') && !tanagyoVal.includes('未'));
      const tanagyoAddress = getCell(row, 'tanagyoAddress');
      const tanagyoNotes = getCell(row, 'tanagyoNotes');
      const deathDate = normalizeDateInput(getCell(row, 'deathDate'));
      const ageAtDeath = cleanAge(getCell(row, 'ageAtDeath'));
      const relationship = getCell(row, 'relationship') || ''; // 空欄時は空のまま

      const rawCDate = normalizeAuditDate(getCell(row, 'createdDate'));
      const rawCTime = normalizeAuditTime(getCell(row, 'createdTime'));
      const rawUDate = normalizeAuditDate(getCell(row, 'updatedDate'));
      const rawUTime = normalizeAuditTime(getCell(row, 'updatedTime'));

      const createdDate = rawCDate || importAudit.date;
      const createdTime = rawCTime || importAudit.time;
      const updatedDate = rawUDate || importAudit.date;
      const updatedTime = rawUTime || importAudit.time;

      // Find or create Household
      let h = findHousehold(headName || '未指定檀家', address, rawHouseholdId);
      if (!h) {
        let id = rawHouseholdId ? normalizeToTempleId(rawHouseholdId) : '';
        if (id && outHouseholds.some(hh => hh.id === id)) {
          id = getNextAvailableId();
        } else if (!id) {
          id = getNextAvailableId();
        }

        h = {
          id,
          templeId: targetTempleId,
          familyHead: headName || '未指定檀家',
          furigana,
          postalCode,
          address,
          phone,
          district,
          tombNumber,
          householdType: getCell(row, 'householdType'),
          status: getCell(row, 'status'),
          isSegakiToba,
          segakiTamegaki: segakiTamegaki || undefined,
          tanagyoMonthlyVisit,
          tanagyoAddress: tanagyoAddress || undefined,
          tanagyoNotes: tanagyoNotes || undefined,
          qrToken: `QR-${id}-${Date.now().toString(36).toUpperCase()}`,
          familyMembers: [],
          createdAt: `${createdDate.replace(/\//g, '-')}T${createdTime}`,
          createdDate,
          createdTime,
          updatedDate,
          updatedTime,
        };
        outHouseholds.push(h);
        importedHouseholds.push(h);
        householdsCreated++;
      } else {
        if (options.conflictMode === 'merge') {
          if (address && !h.address) h.address = address;
          if (postalCode && !h.postalCode) h.postalCode = postalCode;
          if (phone && !h.phone) h.phone = phone;
          if (tombNumber && !h.tombNumber) h.tombNumber = tombNumber;
          if (segakiVal) h.isSegakiToba = isSegakiToba;
          if (segakiTamegaki) h.segakiTamegaki = segakiTamegaki;
          if (tanagyoVal) h.tanagyoMonthlyVisit = tanagyoMonthlyVisit;
          if (tanagyoAddress) h.tanagyoAddress = tanagyoAddress;
          if (tanagyoNotes) h.tanagyoNotes = tanagyoNotes;
          h.createdDate = h.createdDate || createdDate;
          h.createdTime = h.createdTime || createdTime;
          h.updatedDate = rawUDate || importAudit.date;
          h.updatedTime = rawUTime || importAudit.time;
          householdsUpdated++;
        }
        importedHouseholds.push({ ...h });
      }

      // If deceased info exists, create PastRecord
      if (dharmaName || secularName) {
        const pastRec: PastRecord = {
          id: `P-${Date.now().toString(36)}-${rowIdx}-${Math.floor(Math.random() * 9000 + 1000)}`,
          templeId: targetTempleId,
          householdId: h.id,
          householdHeadName: h.familyHead,
          dharmaName: dharmaName || '',
          secularName: secularName || '',
          deathDate: deathDate || '',
          ageAtDeath: ageAtDeath,
          relationship,
          burialLocation: tombNumber || h.tombNumber || '',
          createdDate,
          createdTime,
          updatedDate,
          updatedTime,
        };
        outPastRecords.push(pastRec);
        importedPastRecords.push(pastRec);
        pastRecordsCreated++;
      }
    });
  } else if (targetType === 'accounting') {
    rawRows.forEach((row, rowIdx) => {
      const date = normalizeDateInput(getCell(row, 'date'));
      const category = getCell(row, 'category');
      const rawAmount = cleanAmount(getCell(row, 'amount'));
      let typeStr = getCell(row, 'type');

      if (!category && rawAmount === 0) {
        warnings.push(`行 ${rowIdx + 2}: 科目または金額が不正のためスキップしました。`);
        return;
      }

      let type: '収入' | '支出' = '収入';
      if (typeStr.includes('出') || rawAmount < 0) {
        type = '支出';
      }

      const amount = Math.abs(rawAmount);
      const headName = getCell(row, 'householdHeadName');
      const rawHouseholdId = getCell(row, 'householdId') || getCell(row, 'id');
      const rawPaymentMethod = getCell(row, 'paymentMethod');
      const paymentMethod = normalizePaymentMethod(rawPaymentMethod);
      const notes = getCell(row, 'notes');

      const rawCDate = normalizeAuditDate(getCell(row, 'createdDate'));
      const rawCTime = normalizeAuditTime(getCell(row, 'createdTime'));
      const rawUDate = normalizeAuditDate(getCell(row, 'updatedDate'));
      const rawUTime = normalizeAuditTime(getCell(row, 'updatedTime'));

      const createdDate = rawCDate || importAudit.date;
      const createdTime = rawCTime || importAudit.time;
      const updatedDate = rawUDate || importAudit.date;
      const updatedTime = rawUTime || importAudit.time;

      // Match Household by ID or name
      const matchedH = findHousehold(headName, undefined, rawHouseholdId);

      const trans: Transaction = {
        id: `TR-${Date.now().toString(36)}-${Math.floor(Math.random() * 9000 + 1000)}`,
        templeId: targetTempleId,
        date: date || new Date().toISOString().split('T')[0],
        category: (category || 'その他') as any,
        type,
        amount,
        householdId: matchedH ? matchedH.id : (rawHouseholdId ? normalizeToTempleId(rawHouseholdId) : undefined),
        householdHeadName: matchedH ? matchedH.familyHead : (headName || undefined),
        paymentMethod,
        receiptNumber: `R-${Math.floor(1000 + Math.random() * 9000)}`,
        notes,
        createdDate,
        createdTime,
        updatedDate,
        updatedTime,
      };

      outTransactions.push(trans);
      importedTransactions.push(trans);
      transactionsCreated++;
    });
  }

  return {
    households: outHouseholds,
    pastRecords: outPastRecords,
    transactions: outTransactions,
    importedHouseholds,
    importedPastRecords,
    importedTransactions,
    stats: {
      totalParsed: rawRows.length,
      householdsCreated,
      householdsUpdated,
      pastRecordsCreated,
      transactionsCreated,
      warnings,
    },
  };
}

/**
 * Downloads a sample template (CSV or Excel) for easy data filling.
 * All templates include the common 檀家ID (e.g. DK-00101) to demonstrate cross-sectional linking.
 */
export function downloadSampleTemplate(type: ImportTargetType, format: 'xlsx' | 'csv' = 'xlsx'): void {
  const wb = XLSX.utils.book_new();

  let headers: string[] = [];
  let sampleRows: any[][] = [];
  let sheetName = 'テンプレート';

  if (type === 'household') {
    sheetName = '檀家名簿ひな形';
    headers = ['檀家ID', '世帯主名', 'フリガナ', '郵便番号', '住所', '電話番号', '携帯番号', '総代・世話人', '墓地番号', '区分１', '区分２', '備考'];
    sampleRows = [
      ['DK-00101', '山田 太郎', 'ヤマダ タロウ', '105-0011', '東京都港区芝公園4-7-35', '03-1234-5678', '090-1111-2222', '東地区 (世話人)', 'A-12', '正檀家', '健在', '世話人幹事'],
      ['DK-00102', '佐藤 一郎', 'サトウ イチロウ', '105-0012', '東京都港区芝大門1-2-3', '03-9876-5432', '', '西地区 (総代)', 'B-05', '信徒', '', ''],
      ['DK-00103', '高橋 和子', 'タカハシ カズコ', '108-0073', '東京都港区三田2-5-8', '03-5555-4444', '080-3333-5555', '', 'C-21', '', '遠方', '長男同居'],
    ];
  } else if (type === 'past_record') {
    sheetName = '過去帳ひな形';
    headers = ['檀家ID', '施主名', '戒名・法名', '俗名', '没年月日（命日）', '享年', '続柄', '納骨・墓地位置', '備考'];
    sampleRows = [
      ['DK-00101', '山田 太郎', '釋慈光信士', '山田 清吉', '平成15年4月10日', 84, '父', 'A-12', '慈光寺本堂にて三十三回忌法要済'],
      ['DK-00101', '山田 太郎', '法敬院妙蓮大姉', '山田 鶴', '平成28年11月23日', 89, '母', 'A-12', ''],
      ['DK-00102', '佐藤 一郎', '徳翁道純居士', '佐藤 栄作', '令和3年8月15日', 92, '祖父', 'B-05', '初盆施主'],
    ];
  } else if (type === 'combined') {
    sheetName = '檀家・過去帳統合ひな形';
    headers = ['檀家ID', '世帯主名', 'フリガナ', '郵便番号', '住所', '電話番号', '総代・世話人', '墓地番号', '区分１', '区分２', '戒名・法名', '俗名', '没年月日', '享年', '続柄'];
    sampleRows = [
      ['DK-00101', '山田 太郎', 'ヤマダ タロウ', '105-0011', '東京都港区芝公園4-7-35', '03-1234-5678', '東地区', 'A-12', '正檀家', '健在', '釋慈光信士', '山田 清吉', '平成15年4月10日', 84, '父'],
      ['DK-00101', '山田 太郎', 'ヤマダ タロウ', '105-0011', '東京都港区芝公園4-7-35', '03-1234-5678', '東地区', 'A-12', '正檀家', '', '法敬院妙蓮大姉', '山田 鶴', '平成28年11月23日', 89, '母'],
      ['DK-00102', '佐藤 一郎', 'サトウ イチロウ', '105-0012', '東京都港区芝大門1-2-3', '03-9876-5432', '西地区', 'B-05', '信徒', '', '徳翁道純居士', '佐藤 栄作', '令和3年8月15日', 92, '祖父'],
    ];
  } else if (type === 'accounting') {
    sheetName = '出納ひな形';
    headers = ['日付', '科目', '収支区分', '金額', '檀家ID', '施主名・相手先', '支払方法', '備考'];
    sampleRows = [
      ['2026/04/01', '護持会費', '収入', 12000, 'DK-00101', '山田 太郎', '現金受付', '令和8年度 年会費'],
      ['2026/04/05', '法要布施', '収入', 50000, 'DK-00102', '佐藤 一郎', '現金受付', '三回忌法要布施'],
      ['2026/04/10', '境内整備費', '支出', 35000, '', '緑化造園', '銀行振込', '参道除草・樹木剪定'],
    ];
  }

  const ws = XLSX.utils.aoa_to_sheet([headers, ...sampleRows]);
  ws['!cols'] = headers.map(() => ({ wch: 20 }));
  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  if (format === 'csv') {
    XLSX.writeFile(wb, `${sheetName}.csv`, { bookType: 'csv' });
  } else {
    XLSX.writeFile(wb, `${sheetName}.xlsx`, { bookType: 'xlsx' });
  }
}
