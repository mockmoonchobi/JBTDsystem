import * as XLSX from 'xlsx';
import { Household, PastRecord, MemorialService, Transaction, TempleInfo, TempleProfile, MasterOptions, FamilyMember, TempleTodo, TodoCategory, TempleAnnualEvent, Priest, BatchAccountingData } from '../types';
import { INITIAL_MASTER_OPTIONS, EMPTY_MASTER_OPTIONS, INITIAL_TEMPLE_INFO } from '../data/initialData';
import { 
  getSavedNoticeTemplates, 
  saveNoticeTemplates, 
  getAllSavedNoticeTemplates,
  saveAllNoticeTemplates,
  NoticeTemplateItem,
  DEFAULT_HIGAN_TEMPLATE, 
  DEFAULT_NIIBON_TEMPLATE, 
  normalizeDateInput, 
  normalizeFurigana 
} from './memorialCalculator';
import { mergeMasterOptionsWithData, getTempleMasterOptions, mergeAllTempleMasterOptions } from './masterOptionsUtils';
import { getAuditRowValues, normalizeAuditDate, normalizeAuditTime, getCurrentAuditFields } from './auditUtils';
import { sanitizeAppDataset } from './sanitizeDataUtils';
import { 
  getSavedBatchAccountingData, 
  getSavedBatchAccountingConfig,
  saveBatchAccountingConfig,
  saveBatchAccountingData,
  convertBatchAccountingToRows, 
  convertBatchAccountingConfigToRows,
  parseBatchAccountingFromRows,
  parseBatchAccountingConfigFromRows,
  reconstructBatchAccountingData
} from './batchAccountingUtils';

export interface ExportToExcelOptions {
  targetTempleId?: string | 'ALL';
  templeMasterOptionsMap?: Record<string, MasterOptions>;
  priests?: Priest[];
  batchAccountingData?: BatchAccountingData;
}

export function exportToExcel(
  templeInfo: TempleInfo,
  households: Household[],
  pastRecords: PastRecord[],
  memorialServices: MemorialService[],
  transactions: Transaction[],
  masterOptions: MasterOptions,
  noticeTemplates?: { higan: string; niibon: string },
  templeTodos?: TempleTodo[],
  temples?: TempleProfile[],
  exportOptions?: ExportToExcelOptions
): void {
  const wb = XLSX.utils.book_new();

  const allTemples: TempleProfile[] = temples && temples.length > 0
    ? temples
    : [{ ...templeInfo, id: templeInfo.id || 'temple-main', isMain: true }];

  const templeMap = new Map<string, TempleProfile>();
  allTemples.forEach((t) => {
    if (t.id) templeMap.set(t.id, t);
  });

  const targetTempleId = exportOptions?.targetTempleId || 'ALL';
  const isIndividualExport = targetTempleId !== 'ALL' && targetTempleId !== '';
  const selectedTemple = isIndividualExport ? (templeMap.get(targetTempleId) || allTemples[0]) : null;

  // Filter dataset if individual export is requested
  const filteredHouseholds = isIndividualExport
    ? households.filter((h) => (h.templeId || 'temple-main') === targetTempleId)
    : households;

  const filteredPastRecords = isIndividualExport
    ? pastRecords.filter((r) => (r.templeId || 'temple-main') === targetTempleId)
    : pastRecords;

  const filteredMemorialServices = isIndividualExport
    ? memorialServices.filter((s) => {
        if (s.templeId) return s.templeId === targetTempleId;
        const hh = households.find((h) => h.id === s.householdId);
        return (hh?.templeId || 'temple-main') === targetTempleId;
      })
    : memorialServices;

  const filteredTransactions = isIndividualExport
    ? transactions.filter((t) => (t.templeId || 'temple-main') === targetTempleId)
    : transactions;

  const filteredTodos = isIndividualExport
    ? (templeTodos || []).filter((td) => {
        if (td.templeId) return td.templeId === targetTempleId;
        const hh = households.find((h) => h.id === td.householdId);
        return (hh?.templeId || 'temple-main') === targetTempleId;
      })
    : (templeTodos || []);

  const getTempleLabel = (tId?: string): string => {
    const id = tId || allTemples[0]?.id || 'temple-main';
    const found = templeMap.get(id);
    if (!found) {
      const foundByName = allTemples.find((t) => 
        t.id === id || 
        t.name === id || 
        (t.mountainName && `${t.mountainName} ${t.name}` === id) ||
        (t.name && id.includes(t.name))
      );
      if (foundByName) {
        return `${foundByName.mountainName ? foundByName.mountainName + ' ' : ''}${foundByName.name}（${foundByName.isMain ? '本寺' : '兼務'}）`;
      }
      return allTemples[0]?.name || templeInfo.name || '本寺';
    }
    return `${found.mountainName ? found.mountainName + ' ' : ''}${found.name}（${found.isMain ? '本寺' : '兼務'}）`;
  };

  const getTempleId = (tId?: string): string => {
    if (!tId) {
      const mainT = allTemples.find((t) => t.isMain);
      return mainT?.id || allTemples[0]?.id || 'temple-main';
    }
    const cleanId = String(tId).trim();
    if (templeMap.has(cleanId)) return cleanId;
    
    const found = allTemples.find((t) => 
      t.id === cleanId ||
      t.name === cleanId ||
      (t.mountainName && `${t.mountainName} ${t.name}` === cleanId) ||
      (t.name && cleanId.includes(t.name)) ||
      (t.mountainName && cleanId.includes(t.mountainName))
    );
    if (found && found.id) return found.id;
    return cleanId;
  };

  // 1. 寺院基本情報・一覧（統合シート）
  const templeHeaders = [
    '寺院ID',
    '寺院区分',
    '寺院名',
    '山号',
    '宗派',
    '住職名',
    '郵便番号',
    '住所',
    '電話番号',
    'FAX番号',
    'ホームページ',
    '銀行振込口座',
    'お盆時期',
    '会計年度開始月',
    '会計年度開始日',
    '会計年度終了月',
    '会計年度終了日',
    '塔婆申込１',
    '塔婆申込２',
    '塔婆申込３',
    '集金項目１',
    '集金項目１勘定科目',
    '集金項目１基準金額',
    '集金項目２',
    '集金項目２勘定科目',
    '集金項目２基準金額',
    '集金項目３',
    '集金項目３勘定科目',
    '集金項目３基準金額',
    '年間行事特記',
    'テーマカラー',
    '更新日時'
  ];

  const exportTemplesList = isIndividualExport && selectedTemple
    ? [selectedTemple]
    : allTemples;

  const templeRows = exportTemplesList.map((t) => [
    t.id || 'temple-main',
    t.isMain ? '本寺（自寺）' : '兼務寺院（末寺）',
    t.name || '',
    t.mountainName || '',
    t.sect || '',
    t.chiefPriest || '',
    t.postalCode || '',
    t.address || '',
    t.phone || '',
    t.fax || '',
    t.website || '',
    t.bankInfo || '',
    t.bonSeason || '8月盆',
    t.fiscalYearStartMonth ?? 4,
    t.fiscalYearStartDay ?? 1,
    t.fiscalYearEndMonth ?? 3,
    t.fiscalYearEndDay ?? 31,
    t.tobaType1 !== undefined ? t.tobaType1 : '施餓鬼塔婆',
    t.tobaType2 || '',
    t.tobaType3 || '',
    t.feeType1 || '',
    t.feeType1Category || '',
    t.feeType1DefaultAmount !== undefined ? t.feeType1DefaultAmount : '',
    t.feeType2 || '',
    t.feeType2Category || '',
    t.feeType2DefaultAmount !== undefined ? t.feeType2DefaultAmount : '',
    t.feeType3 || '',
    t.feeType3Category || '',
    t.feeType3DefaultAmount !== undefined ? t.feeType3DefaultAmount : '',
    t.annualEventsNotes || '',
    t.color || '#D4AF37',
    t.updatedAt || t.updatedDate || ''
  ]);
  const wsTemples = XLSX.utils.aoa_to_sheet([templeHeaders, ...templeRows]);
  XLSX.utils.book_append_sheet(wb, wsTemples, isIndividualExport ? '寺院情報' : '寺院一覧（本寺・兼務）');

  // 2. 檀家名簿
  const householdHeaders = [
    'ID',
    '所属寺院',
    '世帯主名',
    'フリガナ',
    '郵便番号',
    '住所',
    '電話番号',
    '携帯番号',
    'メール',
    '区分１',
    '区分２',
    '総代・世話人',
    '墓地番号',
    '塔婆申込１',
    '塔婆申込１為書き',
    '塔婆申込２',
    '塔婆申込２為書き',
    '塔婆申込３',
    '塔婆申込３為書き',
    '集金１金額',
    '集金２金額',
    '集金３金額',
    '棚経・月参り対象',
    '棚経訪問日',
    '棚経時間帯',
    '棚経担当僧侶',
    '棚経巡回順序',
    '棚経伺い先住所',
    '棚経訪問特記',
    'メモ',
    '作成日',
    '作成時間',
    '修正日',
    '修正時間',
    '所属寺院ID',
    '登録日時',
  ];
  const householdRows = filteredHouseholds.map((h) => {
    const [cDate, cTime, uDate, uTime] = getAuditRowValues(h);
    const toba1Applied = h.toba1Applied !== undefined ? h.toba1Applied : h.isSegakiToba;
    const toba1Tamegaki = h.toba1Tamegaki !== undefined ? h.toba1Tamegaki : (h.segakiTamegaki || '');
    return [
      h.id,
      getTempleLabel(h.templeId),
      h.familyHead || '',
      h.furigana || '',
      h.postalCode || '',
      h.address || '',
      h.phone || '',
      h.mobile || '',
      h.email || '',
      h.householdType || '',
      h.status || '',
      h.district || '',
      h.tombNumber || '',
      toba1Applied ? '申込済' : '未申込',
      toba1Tamegaki,
      h.toba2Applied ? '申込済' : '未申込',
      h.toba2Tamegaki || '',
      h.toba3Applied ? '申込済' : '未申込',
      h.toba3Tamegaki || '',
      h.fee1Amount !== undefined && h.fee1Amount !== null ? h.fee1Amount : (h.fee1 !== undefined && h.fee1 !== null ? h.fee1 : ''),
      h.fee2Amount !== undefined && h.fee2Amount !== null ? h.fee2Amount : (h.fee2 !== undefined && h.fee2 !== null ? h.fee2 : ''),
      h.fee3Amount !== undefined && h.fee3Amount !== null ? h.fee3Amount : (h.fee3 !== undefined && h.fee3 !== null ? h.fee3 : ''),
      h.tanagyoMonthlyVisit ? '対象' : '未対象',
      h.tanagyoDate || '',
      h.tanagyoTimeSlot || '',
      h.tanagyoPriestName || '',
      h.tanagyoOrder ?? '',
      h.tanagyoAddress || '',
      h.tanagyoNotes || '',
      h.notes || '',
      cDate,
      cTime,
      uDate,
      uTime,
      getTempleId(h.templeId),
      h.createdAt || cDate,
    ];
  });
  const wsHouseholds = XLSX.utils.aoa_to_sheet([householdHeaders, ...householdRows]);
  XLSX.utils.book_append_sheet(wb, wsHouseholds, '檀家名簿');

  // 3. 家族構成
  const familyHeaders = [
    '家族ID',
    '所属寺院',
    '世帯ID (檀家ID)',
    '氏名',
    'フリガナ',
    '続柄',
    '電話番号',
    '個別住所',
    '施主指定',
    '塔婆申込１',
    '塔婆申込１為書き',
    '塔婆申込２',
    '塔婆申込２為書き',
    '塔婆申込３',
    '塔婆申込３為書き',
    '備考',
    '作成日',
    '作成時間',
    '修正日',
    '修正時間',
    '所属寺院ID'
  ];
  const familyRows: (string | number)[][] = [];
  filteredHouseholds.forEach((h) => {
    (h.familyMembers || []).forEach((fm, idx) => {
      const [cDate, cTime, uDate, uTime] = getAuditRowValues(fm);
      const toba1Applied = fm.toba1Applied !== undefined ? fm.toba1Applied : fm.isSegakiToba;
      const toba1Tamegaki = fm.toba1Tamegaki !== undefined ? fm.toba1Tamegaki : (fm.segakiTamegaki || '');
      familyRows.push([
        fm.id || `FM-${h.id}-${idx + 1}`,
        getTempleLabel(h.templeId),
        fm.householdId || h.id,
        fm.name || '',
        fm.furigana || '',
        fm.relationship || '',
        fm.phone || '',
        fm.address || '',
        (fm.isChiefMourner || fm.isSponsor) ? '施主' : '',
        toba1Applied ? '申込済' : '未申込',
        toba1Tamegaki,
        fm.toba2Applied ? '申込済' : '未申込',
        fm.toba2Tamegaki || '',
        fm.toba3Applied ? '申込済' : '未申込',
        fm.toba3Tamegaki || '',
        fm.notes || '',
        cDate,
        cTime,
        uDate,
        uTime,
        getTempleId(h.templeId)
      ]);
    });
  });
  const wsFamily = XLSX.utils.aoa_to_sheet([familyHeaders, ...familyRows]);
  XLSX.utils.book_append_sheet(wb, wsFamily, '家族構成');

  // 4. 過去帳
  const pastRecordHeaders = [
    'ID',
    '所属寺院',
    '檀家ID (世帯ID)',
    '戒名・法名',
    '俗名 (故人名)',
    'フリガナ',
    '命日 (没年月日)',
    '享年 (行年)',
    '続柄',
    '施主名 (現世帯主等)',
    '墓地番号',
    '新盆区分',
    '備考・行状',
    '作成日',
    '作成時間',
    '修正日',
    '修正時間',
    '所属寺院ID'
  ];
  const pastRows = filteredPastRecords.map((r) => {
    const hh = households.find((h) => h.id === r.householdId);
    const effectiveTempleId = r.templeId || hh?.templeId;
    const [cDate, cTime, uDate, uTime] = getAuditRowValues(r);
    return [
      r.id,
      getTempleLabel(effectiveTempleId),
      r.householdId || '',
      r.dharmaName || '',
      r.secularName || r.deceasedName || '',
      r.furigana || '',
      r.deathDate || '',
      r.ageAtDeath ?? r.age ?? '',
      r.relationship || '',
      r.householdHeadName || r.chiefMourner || '',
      r.burialLocation || r.tombNumber || '',
      r.niibon || '',
      r.notes || '',
      cDate,
      cTime,
      uDate,
      uTime,
      getTempleId(effectiveTempleId)
    ];
  });
  const wsPast = XLSX.utils.aoa_to_sheet([pastRecordHeaders, ...pastRows]);
  XLSX.utils.book_append_sheet(wb, wsPast, '過去帳');

  // 5. 法事・予約一覧
  const memorialServiceHeaders = [
    '予約ID',
    '所属寺院',
    '予定日',
    '開始時刻',
    '終了時刻',
    '種別・回忌',
    '施主名',
    '戒名・法名',
    '俗名 (故人名)',
    '会場',
    '訪問先住所',
    '参列予定人数',
    '布施金額',
    '塔婆本数',
    '塔婆種別',
    '塔婆料',
    '塔婆志主',
    '進捗状況',
    '受付状況',
    '会計記帳状況',
    '世帯ID',
    '過去帳ID',
    '出納伝票ID',
    '備考・特記',
    '作成日',
    '作成時間',
    '修正日',
    '修正時間',
    '所属寺院ID'
  ];
  const memorialRows = (filteredMemorialServices || []).map((s) => {
    const [cDate, cTime, uDate, uTime] = getAuditRowValues(s);
    return [
      s.id,
      getTempleLabel(s.templeId),
      s.scheduledDate || '',
      s.scheduledTime || '',
      s.endTime || '',
      s.memorialType || '',
      s.chiefMourner || '',
      s.dharmaName || '',
      s.deceasedName || '',
      s.venue || '',
      s.address || '',
      s.attendeeCount || 0,
      s.offeringAmount || 0,
      s.tobaCount || 0,
      s.tobaType || '',
      s.tobaFee || 0,
      (s.tobaSponsors || []).filter(Boolean).join('、'),
      s.status || '未入金',
      s.receptionCheckedIn ? 'チェックイン済' : '未受付',
      s.accountingRecorded ? '記帳済' : '未記帳',
      s.householdId || '',
      s.deceasedId || '',
      s.transactionId || '',
      s.notes || '',
      cDate,
      cTime,
      uDate,
      uTime,
      getTempleId(s.templeId)
    ];
  });
  const wsMemorial = XLSX.utils.aoa_to_sheet([memorialServiceHeaders, ...memorialRows]);
  XLSX.utils.book_append_sheet(wb, wsMemorial, '法事予約');

  // 6. 寺院行事・ToDo
  const todoHeaders = [
    'ToDo-ID',
    '所属寺院',
    '期日',
    '予定時刻',
    'タスク・行事名',
    '区分カテゴリ',
    '重要度',
    '完了状況',
    '関連施主名',
    '世帯ID',
    '法事予約ID',
    '備考メモ',
    '作成日',
    '作成時間',
    '修正日',
    '修正時間',
    '所属寺院ID'
  ];
  const todoRows = (filteredTodos || []).map((td) => {
    const [cDate, cTime, uDate, uTime] = getAuditRowValues(td);
    return [
      td.id,
      getTempleLabel(td.templeId),
      td.dueDate || '',
      td.dueTime || '',
      td.title || '',
      td.category || '法事',
      td.priority === 'urgent' ? '至急' : td.priority === 'high' ? '高' : td.priority === 'medium' ? '中' : '低',
      td.completed ? '完了' : '未完了',
      td.contactName || '',
      td.householdId || '',
      td.serviceId || '',
      td.notes || '',
      cDate,
      cTime,
      uDate,
      uTime,
      getTempleId(td.templeId)
    ];
  });
  const wsTodos = XLSX.utils.aoa_to_sheet([todoHeaders, ...todoRows]);
  XLSX.utils.book_append_sheet(wb, wsTodos, '寺院ToDo');

  // 7. 出納・会計
  const transactionHeaders = [
    '伝票ID',
    '所属寺院',
    '日付',
    '収支区分',
    '勘定科目',
    '金額',
    '施主・支払者名',
    '支払方法',
    '領収書番号',
    '世帯ID',
    '備考',
    '作成日',
    '作成時間',
    '修正日',
    '修正時間',
    '所属寺院ID'
  ];
  const transactionRows = filteredTransactions.map((t) => {
    const [cDate, cTime, uDate, uTime] = getAuditRowValues(t);
    return [
      t.id,
      getTempleLabel(t.templeId),
      t.date || '',
      t.type || '収入',
      t.category || '',
      t.amount || 0,
      t.householdHeadName || '',
      t.paymentMethod || '現金受付',
      t.receiptNumber || '',
      t.householdId || '',
      t.notes || '',
      cDate,
      cTime,
      uDate,
      uTime,
      getTempleId(t.templeId)
    ];
  });
  const wsTransactions = XLSX.utils.aoa_to_sheet([transactionHeaders, ...transactionRows]);
  XLSX.utils.book_append_sheet(wb, wsTransactions, '出納・会計');

  // 8. マスタ設定（区分・勘定科目）
  const masterHeaders = [
    '区分１',
    '区分２',
    '総代・世話人',
    '収入の部 (勘定科目)',
    '支出の部 (勘定科目)',
    '決済方法',
  ];

  const map = exportOptions?.templeMasterOptionsMap || {};

  const makeMasterRows = (m: MasterOptions): string[][] => {
    const householdTypes = m.householdTypes ?? [];
    const statuses = m.statuses ?? [];
    const districts = m.districts ?? [];
    const incCats = m.incomeCategories ?? [];
    const expCats = m.expenseCategories ?? [];
    const payMethods = m.paymentMethods ?? [];

    const maxRows = Math.max(
      householdTypes.length,
      statuses.length,
      districts.length,
      incCats.length,
      expCats.length,
      payMethods.length
    );
    const rows: string[][] = [];
    for (let i = 0; i < maxRows; i++) {
      rows.push([
        householdTypes[i] || '',
        statuses[i] || '',
        districts[i] || '',
        incCats[i] || '',
        expCats[i] || '',
        payMethods[i] || '',
      ]);
    }
    return rows;
  };

  if (isIndividualExport && selectedTemple) {
    const templeMaster = getTempleMasterOptions(targetTempleId, map, temples, masterOptions);
    const sheetName = `マスタ_${selectedTemple.shortName || selectedTemple.name}`.slice(0, 31);
    const wsMaster = XLSX.utils.aoa_to_sheet([masterHeaders, ...makeMasterRows(templeMaster)]);
    XLSX.utils.book_append_sheet(wb, wsMaster, sheetName);
  } else {
    // All temples export: output dedicated master sheet for each temple
    allTemples.forEach((t) => {
      const tId = t.id || 'temple-main';
      const tMaster = getTempleMasterOptions(tId, map, temples, masterOptions);
      const sheetName = `マスタ_${t.shortName || t.name}`.slice(0, 31);
      const wsSubMaster = XLSX.utils.aoa_to_sheet([masterHeaders, ...makeMasterRows(tMaster)]);
      XLSX.utils.book_append_sheet(wb, wsSubMaster, sheetName);
    });
  }

  // 9. 案内文テンプレート
  const allTemplatesList = getAllSavedNoticeTemplates();
  const noticeTemplateHeaders = ['テンプレートID', 'テンプレート名称', '用紙種別', '法要区分', '案内文本文', '最終更新日時'];
  const noticeTemplateRows = allTemplatesList.map((t) => [
    t.id,
    t.name,
    t.type === 'a4' ? 'A4用紙' : '官製はがき',
    t.category === 'higan' ? '彼岸法要' : t.category === 'niibon' ? '新盆法要' : t.category === 'memorial' ? '年回忌法要' : t.category === 'general' ? '年中行事' : '自由文書',
    t.content || '',
    new Date().toLocaleString('ja-JP'),
  ]);
  const wsTemplates = XLSX.utils.aoa_to_sheet([noticeTemplateHeaders, ...noticeTemplateRows]);
  XLSX.utils.book_append_sheet(wb, wsTemplates, '案内文テンプレート');

  // 10. 登録僧侶一覧
  const priestHeaders = [
    '僧侶ID',
    '所属寺院',
    '僧侶名',
    'フリガナ',
    '役職・区分',
    '所属寺院名',
    '電話番号',
    'メールアドレス',
    '備考・特記',
    '自動連携区分',
    '所属寺院ID'
  ];

  const priestsToExport: Priest[] = exportOptions?.priests && exportOptions.priests.length > 0
    ? exportOptions.priests
    : allTemples.map((t) => ({
        id: `priest-chief-${t.id || 'temple-main'}`,
        name: t.chiefPriest || '',
        furigana: '',
        role: t.isMain ? '本寺住職' : '兼務寺住職',
        templeId: t.id || 'temple-main',
        templeName: `${t.mountainName ? t.mountainName + ' ' : ''}${t.name}`,
        phone: t.phone || '',
        notes: t.isMain ? '本寺代表役員住職' : '兼務寺住職',
        isAutoChief: true,
        isMainChief: t.isMain || false,
      })).filter((p) => p.name.trim() !== '');

  const priestRows = priestsToExport.map((p) => [
    p.id,
    getTempleLabel(p.templeId),
    p.name || '',
    p.furigana || '',
    p.role || '僧侶',
    p.templeName || getTempleLabel(p.templeId),
    p.phone || '',
    p.email || '',
    p.notes || '',
    p.isAutoChief ? '住職自動連携' : '手動登録',
    getTempleId(p.templeId),
  ]);
  const wsPriests = XLSX.utils.aoa_to_sheet([priestHeaders, ...priestRows]);
  XLSX.utils.book_append_sheet(wb, wsPriests, '登録僧侶一覧');

  // 11. 一括会計設定（設定情報専用テーブル）
  const activeBatchData = exportOptions?.batchAccountingData || getSavedBatchAccountingData(targetTempleId);
  const activeBatchConfig = getSavedBatchAccountingConfig(targetTempleId) || (activeBatchData ? {
    id: `config-${targetTempleId}`,
    configDate: activeBatchData.configDate,
    cat1: activeBatchData.cat1,
    notes1: activeBatchData.notes1,
    defaultAmount1: activeBatchData.defaultAmount1,
    cat2: activeBatchData.cat2,
    notes2: activeBatchData.notes2,
    defaultAmount2: activeBatchData.defaultAmount2,
    cat3: activeBatchData.cat3,
    notes3: activeBatchData.notes3,
    defaultAmount3: activeBatchData.defaultAmount3,
    appliedPreset: activeBatchData.appliedPreset,
    templeId: activeBatchData.templeId,
    lastSavedAt: activeBatchData.lastSavedAt,
  } : undefined);
  const { headers: batchConfigHeaders, rows: batchConfigRows } = convertBatchAccountingConfigToRows(
    activeBatchConfig,
    allTemples
  );
  const wsBatchConfig = XLSX.utils.aoa_to_sheet([batchConfigHeaders, ...batchConfigRows]);
  XLSX.utils.book_append_sheet(wb, wsBatchConfig, '一括会計設定');

  // 12. 一括会計受付（世帯入力明細テーブル）
  const { headers: batchHeaders, rows: batchRows } = convertBatchAccountingToRows(
    activeBatchData || undefined,
    filteredHouseholds,
    allTemples
  );
  const wsBatch = XLSX.utils.aoa_to_sheet([batchHeaders, ...batchRows]);
  XLSX.utils.book_append_sheet(wb, wsBatch, '一括会計受付');

  // Auto column widths
  const allSheets = [wsTemples, wsHouseholds, wsFamily, wsPast, wsMemorial, wsTodos, wsTransactions, wsPriests, wsBatchConfig, wsBatch];
  allSheets.forEach((ws) => {
    ws['!cols'] = [{ wch: 15 }, { wch: 20 }, { wch: 20 }, { wch: 25 }, { wch: 30 }, { wch: 20 }];
  });
  wsBatch['!cols'] = [
    { wch: 14 }, { wch: 18 }, { wch: 16 }, { wch: 14 },
    { wch: 12 }, { wch: 14 }, { wch: 18 }, { wch: 12 },
    { wch: 12 }, { wch: 14 }, { wch: 18 }, { wch: 12 },
    { wch: 12 }, { wch: 14 }, { wch: 18 }, { wch: 12 },
    { wch: 14 }, { wch: 16 }, { wch: 20 }, { wch: 16 }
  ];
  wsPriests['!cols'] = [
    { wch: 16 }, { wch: 18 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 22 }, { wch: 16 }, { wch: 22 }, { wch: 30 }, { wch: 14 }, { wch: 16 }
  ];
  wsMemorial['!cols'] = [
    { wch: 16 }, { wch: 18 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 14 },
    { wch: 16 }, { wch: 22 }, { wch: 14 }, { wch: 12 }, { wch: 25 },
    { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 10 },
    { wch: 20 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 12 },
    { wch: 12 }, { wch: 16 }, { wch: 30 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 16 }
  ];
  wsTodos['!cols'] = [
    { wch: 16 }, { wch: 18 }, { wch: 12 }, { wch: 10 }, { wch: 28 }, { wch: 14 },
    { wch: 10 }, { wch: 10 }, { wch: 16 }, { wch: 12 }, { wch: 16 },
    { wch: 30 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 16 }
  ];
  wsTemplates['!cols'] = [{ wch: 16 }, { wch: 80 }, { wch: 22 }];

  const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
  let fileName = `寺院檀家過去帳・法事予約データ_${dateStr}.xlsx`;
  if (isIndividualExport && selectedTemple) {
    const cleanName = `${selectedTemple.mountainName ? selectedTemple.mountainName + '_' : ''}${selectedTemple.name}`;
    fileName = `${cleanName}_寺院データ_${dateStr}.xlsx`;
  } else {
    fileName = `全寺院一括_寺院管理データ_${dateStr}.xlsx`;
  }
  XLSX.writeFile(wb, fileName);
}

function findColIdx(headers: string[], aliases: string[]): number {
  if (!headers || headers.length === 0) return -1;
  const cleanHeaders = headers.map((h) => String(h || '').trim().toLowerCase().replace(/[\s\r\n_（）()【】\[\]/・\-]/g, ''));
  
  // 1. Exact match
  for (const alias of aliases) {
    const cleanAlias = String(alias || '').trim().toLowerCase().replace(/[\s\r\n_（）()【】\[\]/・\-]/g, '');
    if (!cleanAlias) continue;
    const idx = cleanHeaders.findIndex((h) => h === cleanAlias);
    if (idx !== -1) return idx;
  }

  // 2. Specific contains match (only when alias is specific and header contains alias; NEVER alias contains header)
  for (const alias of aliases) {
    const cleanAlias = String(alias || '').trim().toLowerCase().replace(/[\s\r\n_（）()【】\[\]/・\-]/g, '');
    if (!cleanAlias || cleanAlias.length < 2) continue;
    if (['id', 'no', '名', '区分', '金額', '種別', '状態', '役職', '備考', 'メモ'].includes(cleanAlias)) continue;

    const idx = cleanHeaders.findIndex((h) => h.includes(cleanAlias));
    if (idx !== -1) return idx;
  }

  return -1;
}

export interface ImportFromExcelOptions {
  targetTempleId?: string | 'ALL';
  defaultTempleId?: string;
}

export async function importFromExcel(
  file: File,
  options?: ImportFromExcelOptions
): Promise<{
  templeInfo?: TempleInfo;
  temples?: TempleProfile[];
  households: Household[];
  pastRecords: PastRecord[];
  memorialServices: MemorialService[];
  transactions: Transaction[];
  masterOptions?: MasterOptions;
  templeMasterOptionsMap?: Record<string, MasterOptions>;
  noticeTemplates?: { higan: string; niibon: string };
  templeTodos?: TempleTodo[];
  priests?: Priest[];
  batchAccountingData?: BatchAccountingData;
}> {
  const dataBuffer = await file.arrayBuffer();
  const wb = XLSX.read(dataBuffer, { 
    type: 'array',
    dense: true,
    cellDates: true,
    dateNF: 'yyyy/mm/dd',
  });

  const allSheetNames = wb.SheetNames || [];
  if (allSheetNames.length === 0) {
    throw new Error('Excelファイル内にシートが見つかりませんでした。');
  }

  // Helper to extract sheet data as clean headers and rows
  const getSheetDataByName = (sheetName: string | null): { headers: string[]; rows: (string | number | Date | undefined)[][] } => {
    if (!sheetName || !wb.Sheets[sheetName]) return { headers: [], rows: [] };
    const ws = wb.Sheets[sheetName];
    const rawData = XLSX.utils.sheet_to_json(ws, { 
      header: 1, 
      defval: '',
      raw: false,
      dateNF: 'yyyy/mm/dd',
    }) as (string | number | Date | undefined)[][];

    const cleanData = (rawData || [])
      .filter((row) => row && row.some((cell) => cell !== undefined && cell !== null && String(cell).trim() !== ''))
      .map((row) =>
        row.map((cell) => {
          if (cell instanceof Date) {
            return normalizeDateInput(cell);
          }
          return cell !== undefined && cell !== null ? String(cell).trim() : '';
        })
      );

    if (cleanData.length === 0) return { headers: [], rows: [] };
    const headers = cleanData[0].map((h) => String(h || '').trim());
    const rows = cleanData.slice(1);
    return { headers, rows };
  };

  // Find sheet by keyword or inspect headers
  const findSheet = (
    keywords: string[],
    discriminatingHeaders: string[] = []
  ): string | null => {
    // 1. By sheet name keyword
    for (const name of allSheetNames) {
      const lower = name.toLowerCase();
      if (keywords.some((kw) => lower.includes(kw.toLowerCase()))) {
        return name;
      }
    }

    // 2. By column headers inspection
    if (discriminatingHeaders.length > 0) {
      for (const name of allSheetNames) {
        const { headers } = getSheetDataByName(name);
        if (headers.length > 0) {
          const matchCount = discriminatingHeaders.filter((dh) =>
            findColIdx(headers, [dh]) !== -1
          ).length;
          if (matchCount >= Math.min(2, discriminatingHeaders.length)) {
            return name;
          }
        }
      }
    }

    // 3. If workbook has only 1 sheet, check if it matches at least 1 header
    if (allSheetNames.length === 1 && discriminatingHeaders.length > 0) {
      const { headers } = getSheetDataByName(allSheetNames[0]);
      if (headers.length > 0) {
        const hasAny = discriminatingHeaders.some((dh) => findColIdx(headers, [dh]) !== -1);
        if (hasAny) return allSheetNames[0];
      }
    }

    return null;
  };

  const forcedTempleId = options?.targetTempleId && options.targetTempleId !== 'ALL'
    ? options.targetTempleId
    : undefined;

  // 1. Parse Temple Profiles List (寺院一覧 / 寺院プロファイル)
  const templeSheetName = findSheet(['寺院一覧', '兼務寺院', '寺院プロファイル', '寺院リスト'], ['寺院名', '山号', '宗派']);
  const { headers: templeHeaders, rows: templeRows } = getSheetDataByName(templeSheetName);
  const parsedTemples: TempleProfile[] = [];
  const templeNameToIdMap = new Map<string, string>();

  if (templeRows.length > 0) {
    const idIdx = findColIdx(templeHeaders, ['寺院ID', 'ID', 'id', 'コード']);
    const isMainIdx = findColIdx(templeHeaders, ['寺院区分', '区分', '本末区分', '本寺']);
    const nameIdx = findColIdx(templeHeaders, ['寺院名', '名称', '寺名', '寺']);
    const mountainNameIdx = findColIdx(templeHeaders, ['山号', '山名']);
    const sectIdx = findColIdx(templeHeaders, ['宗派', '宗派名']);
    const chiefPriestIdx = findColIdx(templeHeaders, ['住職名', '住職', '代表役員']);
    const postalCodeIdx = findColIdx(templeHeaders, ['郵便番号', '〒', '郵便']);
    const addressIdx = findColIdx(templeHeaders, ['住所', '所在地']);
    const phoneIdx = findColIdx(templeHeaders, ['電話番号', '電話', 'TEL']);
    const faxIdx = findColIdx(templeHeaders, ['FAX番号', 'FAX', 'fax']);
    const websiteIdx = findColIdx(templeHeaders, ['ホームページ', 'HP', 'ウェブサイト', 'website']);
    const bankInfoIdx = findColIdx(templeHeaders, ['銀行振込口座', '口座情報', '振込先', '銀行口座']);
    const bonSeasonIdx = findColIdx(templeHeaders, ['お盆時期', 'お盆', '盆時期', 'bonSeason']);
    const fyStartMIdx = findColIdx(templeHeaders, ['会計年度開始月', '年度開始月', 'fiscalYearStartMonth']);
    const fyStartDIdx = findColIdx(templeHeaders, ['会計年度開始日', '年度開始日', 'fiscalYearStartDay']);
    const fyEndMIdx = findColIdx(templeHeaders, ['会計年度終了月', '年度終了月', 'fiscalYearEndMonth']);
    const fyEndDIdx = findColIdx(templeHeaders, ['会計年度終了日', '年度終了日', 'fiscalYearEndDay']);
    const toba1Idx = findColIdx(templeHeaders, ['塔婆申込１', '塔婆申込1', '塔婆申込１名称', '塔婆申込1名称', '塔婆1', '塔婆１', 'tobaType1']);
    const toba2Idx = findColIdx(templeHeaders, ['塔婆申込２', '塔婆申込2', '塔婆申込２名称', '塔婆申込2名称', '塔婆2', '塔婆２', 'tobaType2']);
    const toba3Idx = findColIdx(templeHeaders, ['塔婆申込３', '塔婆申込3', '塔婆申込３名称', '塔婆申込3名称', '塔婆3', '塔婆３', 'tobaType3']);
    const fee1Idx = findColIdx(templeHeaders, ['集金項目１', '集金項目1', '集金1', '集金１', 'feeType1']);
    const fee1CatIdx = findColIdx(templeHeaders, ['集金項目１勘定科目', '集金項目1勘定科目', '集金１勘定科目', '集金1勘定科目', '集金項目１科目', '集金1科目', 'feeType1Category']);
    const fee1AmtIdx = findColIdx(templeHeaders, ['集金項目１基準金額', '集金項目1基準金額', '集金１基準金額', '集金1基準金額', '集金項目１標準金額', '集金1標準金額', '集金１金額', '集金1金額', 'feeType1DefaultAmount']);
    const fee2Idx = findColIdx(templeHeaders, ['集金項目２', '集金項目2', '集金2', '集金２', 'feeType2']);
    const fee2CatIdx = findColIdx(templeHeaders, ['集金項目２勘定科目', '集金項目2勘定科目', '集金２勘定科目', '集金2勘定科目', '集金項目２科目', '集金2科目', 'feeType2Category']);
    const fee2AmtIdx = findColIdx(templeHeaders, ['集金項目２基準金額', '集金項目2基準金額', '集金２基準金額', '集金2基準金額', '集金項目２標準金額', '集金2標準金額', '集金２金額', '集金2金額', 'feeType2DefaultAmount']);
    const fee3Idx = findColIdx(templeHeaders, ['集金項目３', '集金項目3', '集金3', '集金３', 'feeType3']);
    const fee3CatIdx = findColIdx(templeHeaders, ['集金項目３勘定科目', '集金項目3勘定科目', '集金３勘定科目', '集金3勘定科目', '集金項目３科目', '集金3科目', 'feeType3Category']);
    const fee3AmtIdx = findColIdx(templeHeaders, ['集金項目３基準金額', '集金項目3基準金額', '集金３基準金額', '集金3基準金額', '集金項目３標準金額', '集金3標準金額', '集金３金額', '集金3金額', 'feeType3DefaultAmount']);
    const annualNotesIdx = findColIdx(templeHeaders, ['年間行事特記', '行事特記事項', '行事特記', 'annualEventsNotes']);
    const colorIdx = findColIdx(templeHeaders, ['テーマカラー', 'カラー', '色']);

    templeRows.forEach((row, idx) => {
      const name = String((nameIdx !== -1 ? row[nameIdx] : row[2]) || '').trim();
      if (!name) return;

      const tId = String((idIdx !== -1 ? row[idIdx] : row[0]) || `temple-${idx + 1}`).trim();
      const isMainStr = String((isMainIdx !== -1 ? row[isMainIdx] : row[1]) || '').trim();
      const isMain = isMainStr.includes('本寺') || isMainStr.includes('自寺') || idx === 0;
      const mountainName = String((mountainNameIdx !== -1 ? row[mountainNameIdx] : row[3]) || '').trim();
      const sect = String((sectIdx !== -1 ? row[sectIdx] : row[4]) || '曹洞宗').trim();
      const chiefPriest = String((chiefPriestIdx !== -1 ? row[chiefPriestIdx] : row[5]) || '').trim();
      const postalCode = String((postalCodeIdx !== -1 ? row[postalCodeIdx] : row[6]) || '').trim();
      const address = String((addressIdx !== -1 ? row[addressIdx] : row[7]) || '').trim();
      const phone = String((phoneIdx !== -1 ? row[phoneIdx] : row[8]) || '').trim();
      const fax = String((faxIdx !== -1 ? row[faxIdx] : row[9]) || '').trim();
      const website = String((websiteIdx !== -1 ? row[websiteIdx] : row[10]) || '').trim();
      const bankInfo = String((bankInfoIdx !== -1 ? row[bankInfoIdx] : row[11]) || '').trim();
      
      const bonSeasonRaw = String((bonSeasonIdx !== -1 ? row[bonSeasonIdx] : '') || '').trim();
      const bonSeason = bonSeasonRaw.includes('7') ? '7月盆' : '8月盆';

      const fyStartM = fyStartMIdx !== -1 && row[fyStartMIdx] ? parseInt(String(row[fyStartMIdx]), 10) : undefined;
      const fyStartD = fyStartDIdx !== -1 && row[fyStartDIdx] ? parseInt(String(row[fyStartDIdx]), 10) : undefined;
      const fyEndM = fyEndMIdx !== -1 && row[fyEndMIdx] ? parseInt(String(row[fyEndMIdx]), 10) : undefined;
      const fyEndD = fyEndDIdx !== -1 && row[fyEndDIdx] ? parseInt(String(row[fyEndDIdx]), 10) : undefined;
      const tobaType1 = toba1Idx !== -1 && row[toba1Idx] !== undefined && row[toba1Idx] !== '' ? String(row[toba1Idx]).trim() : undefined;
      const tobaType2 = toba2Idx !== -1 && row[toba2Idx] !== undefined ? String(row[toba2Idx]).trim() : undefined;
      const tobaType3 = toba3Idx !== -1 && row[toba3Idx] !== undefined ? String(row[toba3Idx]).trim() : undefined;
      const feeType1 = fee1Idx !== -1 && row[fee1Idx] !== undefined ? String(row[fee1Idx]).trim() : undefined;
      const feeType1Category = fee1CatIdx !== -1 && row[fee1CatIdx] !== undefined ? String(row[fee1CatIdx]).trim() : undefined;
      const fee1AmtRaw = fee1AmtIdx !== -1 ? row[fee1AmtIdx] : undefined;
      const feeType1DefaultAmount = fee1AmtRaw !== undefined && fee1AmtRaw !== '' && !isNaN(Number(String(fee1AmtRaw).replace(/[^0-9.-]/g, ''))) ? Number(String(fee1AmtRaw).replace(/[^0-9.-]/g, '')) : undefined;
      const feeType2 = fee2Idx !== -1 && row[fee2Idx] !== undefined ? String(row[fee2Idx]).trim() : undefined;
      const feeType2Category = fee2CatIdx !== -1 && row[fee2CatIdx] !== undefined ? String(row[fee2CatIdx]).trim() : undefined;
      const fee2AmtRaw = fee2AmtIdx !== -1 ? row[fee2AmtIdx] : undefined;
      const feeType2DefaultAmount = fee2AmtRaw !== undefined && fee2AmtRaw !== '' && !isNaN(Number(String(fee2AmtRaw).replace(/[^0-9.-]/g, ''))) ? Number(String(fee2AmtRaw).replace(/[^0-9.-]/g, '')) : undefined;
      const feeType3 = fee3Idx !== -1 && row[fee3Idx] !== undefined ? String(row[fee3Idx]).trim() : undefined;
      const feeType3Category = fee3CatIdx !== -1 && row[fee3CatIdx] !== undefined ? String(row[fee3CatIdx]).trim() : undefined;
      const fee3AmtRaw = fee3AmtIdx !== -1 ? row[fee3AmtIdx] : undefined;
      const feeType3DefaultAmount = fee3AmtRaw !== undefined && fee3AmtRaw !== '' && !isNaN(Number(String(fee3AmtRaw).replace(/[^0-9.-]/g, ''))) ? Number(String(fee3AmtRaw).replace(/[^0-9.-]/g, '')) : undefined;
      const annualEventsNotes = String((annualNotesIdx !== -1 ? row[annualNotesIdx] : '') || '').trim();

      const color = String((colorIdx !== -1 ? row[colorIdx] : row[12]) || (isMain ? '#D4AF37' : '#2E7D32')).trim();

      const profile: TempleProfile = {
        id: tId,
        name,
        shortName: name,
        mountainName,
        sect,
        chiefPriest,
        postalCode,
        address,
        phone,
        fax,
        website,
        bankInfo,
        bonSeason,
        fiscalYearStartMonth: !isNaN(Number(fyStartM)) && fyStartM ? Number(fyStartM) : 4,
        fiscalYearStartDay: !isNaN(Number(fyStartD)) && fyStartD ? Number(fyStartD) : 1,
        fiscalYearEndMonth: !isNaN(Number(fyEndM)) && fyEndM ? Number(fyEndM) : 3,
        fiscalYearEndDay: !isNaN(Number(fyEndD)) && fyEndD ? Number(fyEndD) : 31,
        tobaType1: tobaType1 !== undefined ? tobaType1 : (isMain ? '施餓鬼塔婆' : undefined),
        tobaType2,
        tobaType3,
        feeType1,
        feeType1Category,
        feeType1DefaultAmount,
        feeType2,
        feeType2Category,
        feeType2DefaultAmount,
        feeType3,
        feeType3Category,
        feeType3DefaultAmount,
        annualEventsNotes,
        color,
        isMain,
      };
      parsedTemples.push(profile);

      templeNameToIdMap.set(name, tId);
      if (mountainName) {
        templeNameToIdMap.set(`${mountainName} ${name}`, tId);
        templeNameToIdMap.set(`${mountainName}${name}`, tId);
      }
    });
  }

  // 2. Parse Single Temple Info (寺院基本情報)
  const singleInfoSheetName = findSheet(['寺院基本情報', '自寺情報', '寺院情報']);
  const { headers: infoHeaders, rows: infoRows } = getSheetDataByName(singleInfoSheetName);
  let templeInfo: TempleInfo | undefined;

  if (infoRows.length > 0) {
    const infoMap = new Map<string, string>();
    infoRows.forEach((row) => {
      if (row[0] && row[1]) {
        infoMap.set(String(row[0]).trim(), String(row[1]).trim());
      }
    });

    const bonSeasonRaw = infoMap.get('お盆時期') || INITIAL_TEMPLE_INFO.bonSeason;
    const fyStartM = parseInt(infoMap.get('会計年度開始月') || '4', 10);
    const fyStartD = parseInt(infoMap.get('会計年度開始日') || '1', 10);
    const fyEndM = parseInt(infoMap.get('会計年度終了月') || '3', 10);
    const fyEndD = parseInt(infoMap.get('会計年度終了日') || '31', 10);
    const toba1 = infoMap.get('塔婆申込１') || infoMap.get('塔婆申込1') || infoMap.get('塔婆申込１名称');
    const toba2 = infoMap.get('塔婆申込２') || infoMap.get('塔婆申込2') || infoMap.get('塔婆申込２名称');
    const toba3 = infoMap.get('塔婆申込３') || infoMap.get('塔婆申込3') || infoMap.get('塔婆申込３名称');
    const fee1Name = infoMap.get('集金項目１') || infoMap.get('集金項目1') || infoMap.get('集金1') || infoMap.get('集金１');
    const fee1Category = infoMap.get('集金項目１勘定科目') || infoMap.get('集金項目1勘定科目') || infoMap.get('集金１勘定科目') || infoMap.get('集金1勘定科目');
    const fee1AmtStr = infoMap.get('集金項目１基準金額') || infoMap.get('集金項目1基準金額') || infoMap.get('集金１基準金額') || infoMap.get('集金1基準金額') || infoMap.get('集金１金額') || infoMap.get('集金1金額');
    const fee1Amount = fee1AmtStr && !isNaN(Number(fee1AmtStr.replace(/[^0-9.-]/g, ''))) ? Number(fee1AmtStr.replace(/[^0-9.-]/g, '')) : undefined;

    const fee2Name = infoMap.get('集金項目２') || infoMap.get('集金項目2') || infoMap.get('集金2') || infoMap.get('集金２');
    const fee2Category = infoMap.get('集金項目２勘定科目') || infoMap.get('集金項目2勘定科目') || infoMap.get('集金２勘定科目') || infoMap.get('集金2勘定科目');
    const fee2AmtStr = infoMap.get('集金項目２基準金額') || infoMap.get('集金項目2基準金額') || infoMap.get('集金２基準金額') || infoMap.get('集金2基準金額') || infoMap.get('集金２金額') || infoMap.get('集金2金額');
    const fee2Amount = fee2AmtStr && !isNaN(Number(fee2AmtStr.replace(/[^0-9.-]/g, ''))) ? Number(fee2AmtStr.replace(/[^0-9.-]/g, '')) : undefined;

    const fee3Name = infoMap.get('集金項目３') || infoMap.get('集金項目3') || infoMap.get('集金3') || infoMap.get('集金３');
    const fee3Category = infoMap.get('集金項目３勘定科目') || infoMap.get('集金項目3勘定科目') || infoMap.get('集金３勘定科目') || infoMap.get('集金3勘定科目');
    const fee3AmtStr = infoMap.get('集金項目３基準金額') || infoMap.get('集金項目3基準金額') || infoMap.get('集金３基準金額') || infoMap.get('集金3基準金額') || infoMap.get('集金３金額') || infoMap.get('集金3金額');
    const fee3Amount = fee3AmtStr && !isNaN(Number(fee3AmtStr.replace(/[^0-9.-]/g, ''))) ? Number(fee3AmtStr.replace(/[^0-9.-]/g, '')) : undefined;

    const annualNotes = infoMap.get('年間行事特記') || '';

    templeInfo = {
      id: 'temple-main',
      name: infoMap.get('寺院名（本寺）') || infoMap.get('寺院名') || INITIAL_TEMPLE_INFO.name,
      sect: infoMap.get('宗派') || INITIAL_TEMPLE_INFO.sect,
      mountainName: infoMap.get('山号') || INITIAL_TEMPLE_INFO.mountainName,
      chiefPriest: infoMap.get('住職名') || INITIAL_TEMPLE_INFO.chiefPriest,
      postalCode: infoMap.get('郵便番号') || INITIAL_TEMPLE_INFO.postalCode,
      address: infoMap.get('住所') || INITIAL_TEMPLE_INFO.address,
      phone: infoMap.get('電話番号') || INITIAL_TEMPLE_INFO.phone,
      fax: infoMap.get('FAX番号') || INITIAL_TEMPLE_INFO.fax,
      website: infoMap.get('ホームページ') || INITIAL_TEMPLE_INFO.website,
      bankInfo: infoMap.get('銀行振込口座') || INITIAL_TEMPLE_INFO.bankInfo,
      bonSeason: bonSeasonRaw === '7月盆' ? '7月盆' : '8月盆',
      fiscalYearStartMonth: isNaN(fyStartM) ? 4 : fyStartM,
      fiscalYearStartDay: isNaN(fyStartD) ? 1 : fyStartD,
      fiscalYearEndMonth: isNaN(fyEndM) ? 3 : fyEndM,
      fiscalYearEndDay: isNaN(fyEndD) ? 31 : fyEndD,
      tobaType1: toba1 !== undefined ? toba1 : '施餓鬼塔婆',
      tobaType2: toba2 || undefined,
      tobaType3: toba3 || undefined,
      feeType1: fee1Name || undefined,
      feeType1Category: fee1Category || undefined,
      feeType1DefaultAmount: fee1Amount,
      feeType2: fee2Name || undefined,
      feeType2Category: fee2Category || undefined,
      feeType2DefaultAmount: fee2Amount,
      feeType3: fee3Name || undefined,
      feeType3Category: fee3Category || undefined,
      feeType3DefaultAmount: fee3Amount,
      annualEventsNotes: annualNotes,
      isMain: true,
      color: '#D4AF37',
    };
  }

  const temples: TempleProfile[] = parsedTemples.length > 0 ? parsedTemples : (templeInfo ? [templeInfo] : []);
  if (temples.length > 0) {
    temples.forEach((t) => {
      if (t.name) templeNameToIdMap.set(t.name, t.id || 'temple-main');
      if (t.mountainName && t.name) {
        templeNameToIdMap.set(`${t.mountainName} ${t.name}`.trim(), t.id || 'temple-main');
        templeNameToIdMap.set(`${t.mountainName}${t.name}`.trim(), t.id || 'temple-main');
      }
    });
  }

  // 2-2. Parse Annual Events (寺院年間行事 / 年間行事計画)
  const annualEventsSheetName = findSheet(['寺院年間行事', '年間行事計画', '年間行事', '行事計画'], ['月', '行事名']);
  const { headers: aeHeaders, rows: aeRows } = getSheetDataByName(annualEventsSheetName);
  if (aeRows.length > 0) {
    const aeIdIdx = findColIdx(aeHeaders, ['行事ID', 'ID', 'id']);
    const aeTempleIdx = findColIdx(aeHeaders, ['所属寺院', '寺院名', '寺院']);
    const aeTempleIdIdx = findColIdx(aeHeaders, ['所属寺院ID', '寺院ID', 'templeId']);
    const aeMonthIdx = findColIdx(aeHeaders, ['月', '開催月', 'month']);
    const aeNameIdx = findColIdx(aeHeaders, ['行事名', '名称', 'タイトル', 'name']);
    const aeDateDescIdx = findColIdx(aeHeaders, ['日程・時期', '日程', '時期', 'dateDesc']);
    const aeDescIdx = findColIdx(aeHeaders, ['行事内容・備考', '行事内容', '内容', '備考', '説明', 'description']);

    const templeAnnualEventsMap = new Map<string, TempleAnnualEvent[]>();

    aeRows.forEach((row, idx) => {
      const name = String((aeNameIdx !== -1 ? row[aeNameIdx] : row[3]) || '').trim();
      const monthRaw = parseInt(String((aeMonthIdx !== -1 ? row[aeMonthIdx] : row[2]) || '1').replace(/[^0-9]/g, ''), 10);
      const month = !isNaN(monthRaw) && monthRaw >= 1 && monthRaw <= 12 ? monthRaw : 1;
      if (!name) return;

      const evId = String((aeIdIdx !== -1 ? row[aeIdIdx] : row[0]) || `AE-${Date.now()}-${idx + 1}`).trim();
      let tId = 'temple-main';
      if (aeTempleIdIdx !== -1 && row[aeTempleIdIdx]) {
        tId = String(row[aeTempleIdIdx]).trim();
      } else if (aeTempleIdx !== -1 && row[aeTempleIdx]) {
        const tName = String(row[aeTempleIdx]).trim();
        for (const [tN, tid] of templeNameToIdMap.entries()) {
          if (tName.includes(tN) || tN.includes(tName)) {
            tId = tid;
            break;
          }
        }
      }

      const dateDesc = String((aeDateDescIdx !== -1 ? row[aeDateDescIdx] : '') || '').trim();
      const description = String((aeDescIdx !== -1 ? row[aeDescIdx] : '') || '').trim();

      const ev: TempleAnnualEvent = {
        id: evId,
        month,
        name,
        dateDesc,
        description,
      };

      if (!templeAnnualEventsMap.has(tId)) {
        templeAnnualEventsMap.set(tId, []);
      }
      templeAnnualEventsMap.get(tId)!.push(ev);
    });

    temples.forEach((t) => {
      const tId = t.id || 'temple-main';
      if (templeAnnualEventsMap.has(tId)) {
        t.annualEvents = templeAnnualEventsMap.get(tId)!;
      }
    });

    if (templeInfo) {
      const mainTId = templeInfo.id || 'temple-main';
      if (templeAnnualEventsMap.has(mainTId)) {
        templeInfo.annualEvents = templeAnnualEventsMap.get(mainTId)!;
      }
    }
  }

  // 3. Parse Family Members (家族構成シート)
  const importAudit = getCurrentAuditFields();
  const familySheetName = findSheet(['家族構成', '家族', '家族一覧', '世帯員'], ['世帯ID', '続柄']);
  const { headers: familyHeaders, rows: familyRows } = getSheetDataByName(familySheetName);
  const familyMembersMap = new Map<string, FamilyMember[]>();

  if (familyRows.length > 0) {
    const fIdIdx = findColIdx(familyHeaders, ['家族ID', 'ID', 'id', 'No']);
    const hIdIdx = findColIdx(familyHeaders, ['世帯ID (檀家ID)', '世帯ID', '檀家ID', '世帯番号', 'householdId']);
    const fNameIdx = findColIdx(familyHeaders, ['氏名', '名前', '家族氏名', '氏名名']);
    const fFuriIdx = findColIdx(familyHeaders, ['フリガナ', 'ふりがな', 'カナ', '氏名カナ']);
    const fRelIdx = findColIdx(familyHeaders, ['続柄', '関係', '世帯主との続柄']);
    const fPhoneIdx = findColIdx(familyHeaders, ['電話番号', '電話', '携帯', 'TEL']);
    const fAddrIdx = findColIdx(familyHeaders, ['個別住所', '住所', '現住所', '別居住所', '連絡先住所']);
    const fChiefIdx = findColIdx(familyHeaders, ['施主指定', '施主フラグ', '施主', 'isChiefMourner', 'isSponsor']);
    const fToba1Idx = findColIdx(familyHeaders, ['塔婆申込１', '塔婆申込1', '施餓鬼塔婆申込', '施餓鬼塔婆', '施餓鬼申込', '施餓鬼', '塔婆申込', 'isSegakiToba', 'toba1Applied']);
    const fToba1TameIdx = findColIdx(familyHeaders, ['塔婆申込１為書き', '塔婆申込1為書き', '塔婆申込１為書', '施餓鬼為書き', '為書き', '施餓鬼為書', '為書', 'segakiTamegaki', 'toba1Tamegaki']);
    const fToba2Idx = findColIdx(familyHeaders, ['塔婆申込２', '塔婆申込2', '塔婆申込２申込', '塔婆申込2申込', 'toba2Applied']);
    const fToba2TameIdx = findColIdx(familyHeaders, ['塔婆申込２為書き', '塔婆申込2為書き', '塔婆申込２為書', 'toba2Tamegaki']);
    const fToba3Idx = findColIdx(familyHeaders, ['塔婆申込３', '塔婆申込3', '塔婆申込３申込', '塔婆申込3申込', 'toba3Applied']);
    const fToba3TameIdx = findColIdx(familyHeaders, ['塔婆申込３為書き', '塔婆申込3為書き', '塔婆申込３為書', 'toba3Tamegaki']);
    const fNotesIdx = findColIdx(familyHeaders, ['備考', 'メモ', '特記']);
    const fCDateIdx = findColIdx(familyHeaders, ['作成日', '作成年月日', '登録日', 'createdDate', 'createdAt']);
    const fCTimeIdx = findColIdx(familyHeaders, ['作成時間', '作成時刻', 'createdTime']);
    const fUDateIdx = findColIdx(familyHeaders, ['修正日', '更新日', '修正年月日', '更新年月日', 'updatedDate', 'updatedAt']);
    const fUTimeIdx = findColIdx(familyHeaders, ['修正時間', '更新時間', '修正時刻', '更新時刻', 'updatedTime']);

    familyRows.forEach((row, idx) => {
      const hId = String((hIdIdx !== -1 ? row[hIdIdx] : row[1]) || '').trim();
      const fName = String((fNameIdx !== -1 ? row[fNameIdx] : row[2]) || '').trim();
      if (!hId && !fName) return;

      const validHouseholdId = hId || `DK-UNKNOWN`;
      const fFuri = normalizeFurigana(fFuriIdx !== -1 ? row[fFuriIdx] : '');
      const fAddr = String((fAddrIdx !== -1 ? row[fAddrIdx] : '') || '').trim();
      const chiefVal = String((fChiefIdx !== -1 ? row[fChiefIdx] : '') || '').trim();
      const isChief = chiefVal === '施主' || chiefVal === '代表' || chiefVal === '当家' || chiefVal === '1' || chiefVal.toLowerCase() === 'true';
      const toba1Val = String((fToba1Idx !== -1 ? row[fToba1Idx] : '') || '').trim();
      const toba1Applied = toba1Val === '申込' || toba1Val === '申込済' || toba1Val === '対象' || toba1Val === '有' || toba1Val === '1' || toba1Val.toLowerCase() === 'true' || (toba1Val.includes('申込') && !toba1Val.includes('未')) || (toba1Val.includes('対象') && !toba1Val.includes('未'));
      const toba1Tamegaki = String((fToba1TameIdx !== -1 ? row[fToba1TameIdx] : '') || '').trim();

      const toba2Val = String((fToba2Idx !== -1 ? row[fToba2Idx] : '') || '').trim();
      const toba2Applied = toba2Val === '申込' || toba2Val === '申込済' || toba2Val === '対象' || toba2Val === '有' || toba2Val === '1' || toba2Val.toLowerCase() === 'true' || (toba2Val.includes('申込') && !toba2Val.includes('未')) || (toba2Val.includes('対象') && !toba2Val.includes('未'));
      const toba2Tamegaki = String((fToba2TameIdx !== -1 ? row[fToba2TameIdx] : '') || '').trim();

      const toba3Val = String((fToba3Idx !== -1 ? row[fToba3Idx] : '') || '').trim();
      const toba3Applied = toba3Val === '申込' || toba3Val === '申込済' || toba3Val === '対象' || toba3Val === '有' || toba3Val === '1' || toba3Val.toLowerCase() === 'true' || (toba3Val.includes('申込') && !toba3Val.includes('未')) || (toba3Val.includes('対象') && !toba3Val.includes('未'));
      const toba3Tamegaki = String((fToba3TameIdx !== -1 ? row[fToba3TameIdx] : '') || '').trim();

      const createdDate = normalizeAuditDate(fCDateIdx !== -1 ? row[fCDateIdx] : '') || importAudit.date;
      const createdTime = normalizeAuditTime(fCTimeIdx !== -1 ? row[fCTimeIdx] : '') || importAudit.time;
      const updatedDate = normalizeAuditDate(fUDateIdx !== -1 ? row[fUDateIdx] : '') || importAudit.date;
      const updatedTime = normalizeAuditTime(fUTimeIdx !== -1 ? row[fUTimeIdx] : '') || importAudit.time;

      const fm: FamilyMember = {
        id: String((fIdIdx !== -1 ? row[fIdIdx] : row[0]) || `FM-${validHouseholdId}-${idx + 1}`),
        householdId: validHouseholdId,
        name: fName,
        furigana: fFuri || undefined,
        relationship: String((fRelIdx !== -1 ? row[fRelIdx] : row[3]) || ''),
        phone: String((fPhoneIdx !== -1 ? row[fPhoneIdx] : row[4]) || ''),
        address: fAddr || undefined,
        isChiefMourner: isChief,
        isSponsor: isChief,
        isSegakiToba: toba1Applied,
        segakiTamegaki: toba1Tamegaki || undefined,
        toba1Applied,
        toba1Tamegaki: toba1Tamegaki || undefined,
        toba2Applied: toba2Applied || undefined,
        toba2Tamegaki: toba2Tamegaki || undefined,
        toba3Applied: toba3Applied || undefined,
        toba3Tamegaki: toba3Tamegaki || undefined,
        notes: String((fNotesIdx !== -1 ? row[fNotesIdx] : row[5]) || ''),
        createdDate,
        createdTime,
        updatedDate,
        updatedTime,
      };

      if (!familyMembersMap.has(validHouseholdId)) {
        familyMembersMap.set(validHouseholdId, []);
      }
      familyMembersMap.get(validHouseholdId)!.push(fm);
    });
  }

  // 4. Parse Households (檀家名簿 / 檀信徒名簿)
  const householdSheetName = findSheet(
    ['檀家名簿', '世帯名簿', '檀信徒名簿', '檀家', '世帯', '名簿', 'danka', 'household', '檀信徒'],
    ['世帯主名', '施主名', '住所', '電話番号']
  );
  const { headers: householdHeaders, rows: householdRows } = getSheetDataByName(householdSheetName);
  const households: Household[] = [];
  const householdTempleMap = new Map<string, string>();

  if (householdRows.length > 0) {
    const idIdx = findColIdx(householdHeaders, ['ID', 'id', '檀家ID', '世帯ID', '管理番号', 'コード', '檀家番号', 'No', 'NO']);
    const templeNameIdx = findColIdx(householdHeaders, ['所属寺院', '寺院名', '寺院', '兼務寺院']);
    const templeIdIdx = findColIdx(householdHeaders, ['所属寺院ID', '寺院ID', 'templeId']);
    const headIdx = findColIdx(householdHeaders, ['世帯主名', '施主名', '世帯主', '施主', '氏名', '名前', '代表者', '檀家名', '当家名', '戸主', '名義人']);
    const furiganaIdx = findColIdx(householdHeaders, ['フリガナ', 'ふりがな', 'カナ', 'かな', '読み', '氏名カナ', '世帯主カナ']);
    const postalIdx = findColIdx(householdHeaders, ['郵便番号', '郵便', '〒', 'zip', 'postcode']);
    const addressIdx = findColIdx(householdHeaders, ['住所', '所在地', '現住所', '住所1', '住所2', '町名番地', '送付先住所']);
    const phoneIdx = findColIdx(householdHeaders, ['電話番号', '電話', 'TEL', 'tel', '固定電話', '自宅電話']);
    const mobileIdx = findColIdx(householdHeaders, ['携帯番号', '携帯電話', '携帯', 'スマホ', 'mobile', 'TEL2']);
    const emailIdx = findColIdx(householdHeaders, ['メール', 'メールアドレス', 'E-mail', 'email', 'MAIL']);
    const typeIdx = findColIdx(householdHeaders, ['区分１', '区分1', '種別', '檀家種別', '区分', '檀信徒区分', '檀家区分', '会員種別']);
    const statusIdx = findColIdx(householdHeaders, ['区分２', '区分2', '状態', '状況', 'ステータス', '健在区分', '状態区分']);
    const districtIdx = findColIdx(householdHeaders, ['総代・世話人', '役職', '地区', '総代', '世話人', '役員', '組', '班', 'エリア', '担当地区']);
    const tombIdx = findColIdx(householdHeaders, ['墓地番号', '墓地', '区画', '墓番', '墓所', '墓所番号', '墓地区画', '納骨堂']);
    const toba1Idx = findColIdx(householdHeaders, ['塔婆申込１', '塔婆申込1', '施餓鬼塔婆申込', '施餓鬼塔婆', '施餓鬼申込', '施餓鬼', '塔婆申込', 'isSegakiToba', 'toba1Applied']);
    const toba1TameIdx = findColIdx(householdHeaders, ['塔婆申込１為書き', '塔婆申込1為書き', '塔婆申込１為書', '施餓鬼為書き', '為書き', '施餓鬼為書', '為書', 'segakiTamegaki', 'toba1Tamegaki']);
    const toba2Idx = findColIdx(householdHeaders, ['塔婆申込２', '塔婆申込2', '塔婆申込２申込', '塔婆申込2申込', 'toba2Applied']);
    const toba2TameIdx = findColIdx(householdHeaders, ['塔婆申込２為書き', '塔婆申込2為書き', '塔婆申込２為書', 'toba2Tamegaki']);
    const toba3Idx = findColIdx(householdHeaders, ['塔婆申込３', '塔婆申込3', '塔婆申込３申込', '塔婆申込3申込', 'toba3Applied']);
    const toba3TameIdx = findColIdx(householdHeaders, ['塔婆申込３為書き', '塔婆申込3為書き', '塔婆申込３為書', 'toba3Tamegaki']);
    const fee1AmtIdx = findColIdx(householdHeaders, ['集金１金額', '集金1金額', '集金項目１金額', '集金項目1金額', '集金１', '集金1', '集金項目１', '集金項目1', 'fee1Amount', 'fee1']);
    const fee2AmtIdx = findColIdx(householdHeaders, ['集金２金額', '集金2金額', '集金項目２金額', '集金項目2金額', '集金２', '集金2', '集金項目２', '集金項目2', 'fee2Amount', 'fee2']);
    const fee3AmtIdx = findColIdx(householdHeaders, ['集金３金額', '集金3金額', '集金項目３金額', '集金項目3金額', '集金３', '集金3', '集金項目３', '集金項目3', 'fee3Amount', 'fee3']);
    const tanagyoIdx = findColIdx(householdHeaders, ['棚経・月参り対象', '棚経・月参り', '棚経月参り', '棚経対象', '棚経', '月参り', 'tanagyoMonthlyVisit']);
    const tanagyoDateIdx = findColIdx(householdHeaders, ['棚経訪問日', '訪問日', '棚経日', '棚経日程', 'tanagyoDate']);
    const tanagyoTimeSlotIdx = findColIdx(householdHeaders, ['棚経時間帯', '時間帯', '棚経午前午後', 'tanagyoTimeSlot']);
    const tanagyoPriestIdx = findColIdx(householdHeaders, ['棚経担当僧侶', '棚経担当', '担当僧侶', 'tanagyoPriest', 'tanagyoPriestName']);
    const tanagyoOrderIdx = findColIdx(householdHeaders, ['棚経巡回順序', '棚経順序', '巡回順序', '巡回順', 'tanagyoOrder']);
    const tanagyoAddrIdx = findColIdx(householdHeaders, ['棚経伺い先住所', '棚経訪問先住所', '棚経住所', '伺い先住所', 'tanagyoAddress']);
    const tanagyoNotesIdx = findColIdx(householdHeaders, ['棚経訪問特記', '棚経特記', '棚経備考', 'tanagyoNotes']);
    const notesIdx = findColIdx(householdHeaders, ['メモ', '備考', '特記事項', '注記', '連絡事項']);
    const createdIdx = findColIdx(householdHeaders, ['登録日時', '登録日', '作成日時', '作成日', '日付', 'createdAt', 'createdDate']);
    const cDateIdx = findColIdx(householdHeaders, ['作成日', '作成年月日', 'createdDate']);
    const cTimeIdx = findColIdx(householdHeaders, ['作成時間', '作成時刻', 'createdTime']);
    const uDateIdx = findColIdx(householdHeaders, ['修正日', '更新日', '修正年月日', '更新年月日', 'updatedDate', 'updatedAt']);
    const uTimeIdx = findColIdx(householdHeaders, ['修正時間', '更新時間', '修正時刻', '更新時刻', 'updatedTime']);

    householdRows.forEach((row, idx) => {
      const familyHead = String((headIdx !== -1 ? row[headIdx] : (idIdx !== -1 && row[0] ? row[1] : row[0])) || '').trim();
      const rawId = String((idIdx !== -1 ? row[idIdx] : row[0]) || '').trim();
      if (!familyHead && !rawId) return;

      const householdId = rawId || `DK-${Date.now()}-${idx + 1}`;
      
      let templeId = forcedTempleId || options?.defaultTempleId || 'temple-main';
      if (!forcedTempleId) {
        if (templeIdIdx !== -1 && row[templeIdIdx]) {
          templeId = String(row[templeIdIdx]).trim();
        } else if (templeNameIdx !== -1 && row[templeNameIdx]) {
          const tName = String(row[templeNameIdx]).trim();
          for (const [name, id] of templeNameToIdMap.entries()) {
            if (tName.includes(name) || name.includes(tName)) {
              templeId = id;
              break;
            }
          }
        }
      }

      const furigana = normalizeFurigana(furiganaIdx !== -1 ? row[furiganaIdx] : '');
      const postalCode = String((postalIdx !== -1 ? row[postalIdx] : '') || '').trim();
      const address = String((addressIdx !== -1 ? row[addressIdx] : '') || '').trim();
      const phone = String((phoneIdx !== -1 ? row[phoneIdx] : '') || '').trim();
      const mobile = String((mobileIdx !== -1 ? row[mobileIdx] : '') || '').trim();
      const email = String((emailIdx !== -1 ? row[emailIdx] : '') || '').trim();
      const householdType = String((typeIdx !== -1 ? row[typeIdx] : '') || '').trim();
      const status = String((statusIdx !== -1 ? row[statusIdx] : '') || '').trim();
      const district = String((districtIdx !== -1 ? row[districtIdx] : '') || '').trim();
      const tombNumber = String((tombIdx !== -1 ? row[tombIdx] : '') || '').trim();

      const toba1Val = String((toba1Idx !== -1 ? row[toba1Idx] : '') || '').trim();
      const toba1Applied = toba1Val === '申込' || toba1Val === '申込済' || toba1Val === '対象' || toba1Val === '有' || toba1Val === '1' || toba1Val.toLowerCase() === 'true' || (toba1Val.includes('申込') && !toba1Val.includes('未')) || (toba1Val.includes('対象') && !toba1Val.includes('未'));
      const toba1Tamegaki = String((toba1TameIdx !== -1 ? row[toba1TameIdx] : '') || '').trim();

      const toba2Val = String((toba2Idx !== -1 ? row[toba2Idx] : '') || '').trim();
      const toba2Applied = toba2Val === '申込' || toba2Val === '申込済' || toba2Val === '対象' || toba2Val === '有' || toba2Val === '1' || toba2Val.toLowerCase() === 'true' || (toba2Val.includes('申込') && !toba2Val.includes('未')) || (toba2Val.includes('対象') && !toba2Val.includes('未'));
      const toba2Tamegaki = String((toba2TameIdx !== -1 ? row[toba2TameIdx] : '') || '').trim();

      const toba3Val = String((toba3Idx !== -1 ? row[toba3Idx] : '') || '').trim();
      const toba3Applied = toba3Val === '申込' || toba3Val === '申込済' || toba3Val === '対象' || toba3Val === '有' || toba3Val === '1' || toba3Val.toLowerCase() === 'true' || (toba3Val.includes('申込') && !toba3Val.includes('未')) || (toba3Val.includes('対象') && !toba3Val.includes('未'));
      const toba3Tamegaki = String((toba3TameIdx !== -1 ? row[toba3TameIdx] : '') || '').trim();

      const fee1Raw = fee1AmtIdx !== -1 ? row[fee1AmtIdx] : undefined;
      const fee1Amount = fee1Raw !== undefined && fee1Raw !== '' && !isNaN(Number(String(fee1Raw).replace(/[^0-9.-]/g, ''))) ? Number(String(fee1Raw).replace(/[^0-9.-]/g, '')) : undefined;
      const fee2Raw = fee2AmtIdx !== -1 ? row[fee2AmtIdx] : undefined;
      const fee2Amount = fee2Raw !== undefined && fee2Raw !== '' && !isNaN(Number(String(fee2Raw).replace(/[^0-9.-]/g, ''))) ? Number(String(fee2Raw).replace(/[^0-9.-]/g, '')) : undefined;
      const fee3Raw = fee3AmtIdx !== -1 ? row[fee3AmtIdx] : undefined;
      const fee3Amount = fee3Raw !== undefined && fee3Raw !== '' && !isNaN(Number(String(fee3Raw).replace(/[^0-9.-]/g, ''))) ? Number(String(fee3Raw).replace(/[^0-9.-]/g, '')) : undefined;

      const tanagyoVal = String((tanagyoIdx !== -1 ? row[tanagyoIdx] : '') || '').trim();
      const tanagyoMonthlyVisit = tanagyoVal === '対象' || tanagyoVal === '棚経' || tanagyoVal === '月参り' || tanagyoVal === '有' || tanagyoVal === '1' || tanagyoVal.toLowerCase() === 'true' || (tanagyoVal.includes('対象') && !tanagyoVal.includes('未'));
      const tanagyoDate = String((tanagyoDateIdx !== -1 ? row[tanagyoDateIdx] : '') || '').trim();
      const rawSlot = String((tanagyoTimeSlotIdx !== -1 ? row[tanagyoTimeSlotIdx] : '') || '').trim();
      const tanagyoTimeSlot: '午前' | '午後' | '時間未定' | undefined = 
        rawSlot === '午前' ? '午前' : rawSlot === '午後' ? '午後' : rawSlot === '時間未定' ? '時間未定' : undefined;
      const tanagyoPriestName = String((tanagyoPriestIdx !== -1 ? row[tanagyoPriestIdx] : '') || '').trim();
      const rawOrder = tanagyoOrderIdx !== -1 ? row[tanagyoOrderIdx] : undefined;
      const tanagyoOrder = rawOrder !== undefined && rawOrder !== '' && !isNaN(Number(rawOrder)) ? Number(rawOrder) : undefined;
      const tanagyoAddress = String((tanagyoAddrIdx !== -1 ? row[tanagyoAddrIdx] : '') || '').trim();
      const tanagyoNotes = String((tanagyoNotesIdx !== -1 ? row[tanagyoNotesIdx] : '') || '').trim();

      const notes = String((notesIdx !== -1 ? row[notesIdx] : '') || '').trim();
      const rawCreated = createdIdx !== -1 ? row[createdIdx] : '';
      const createdAt = normalizeDateInput(rawCreated) || new Date().toISOString().split('T')[0];

      const createdDate = normalizeAuditDate(cDateIdx !== -1 ? row[cDateIdx] : rawCreated) || importAudit.date;
      const createdTime = normalizeAuditTime(cTimeIdx !== -1 ? row[cTimeIdx] : '') || importAudit.time;
      const updatedDate = normalizeAuditDate(uDateIdx !== -1 ? row[uDateIdx] : '') || importAudit.date;
      const updatedTime = normalizeAuditTime(uTimeIdx !== -1 ? row[uTimeIdx] : '') || importAudit.time;

      const familyMembers: FamilyMember[] = familyMembersMap.get(householdId) || [];
      householdTempleMap.set(householdId, templeId);

      households.push({
        id: householdId,
        templeId,
        familyHead: familyHead || '氏名未設定',
        furigana,
        postalCode,
        address,
        phone,
        mobile,
        email,
        householdType,
        status,
        district,
        tombNumber,
        isSegakiToba: toba1Applied,
        segakiTamegaki: toba1Tamegaki || undefined,
        toba1Applied,
        toba1Tamegaki: toba1Tamegaki || undefined,
        toba2Applied: toba2Applied || undefined,
        toba2Tamegaki: toba2Tamegaki || undefined,
        toba3Applied: toba3Applied || undefined,
        toba3Tamegaki: toba3Tamegaki || undefined,
        fee1Amount: fee1Amount !== undefined ? fee1Amount : undefined,
        fee2Amount: fee2Amount !== undefined ? fee2Amount : undefined,
        fee3Amount: fee3Amount !== undefined ? fee3Amount : undefined,
        fee1: fee1Amount !== undefined ? fee1Amount : undefined,
        fee2: fee2Amount !== undefined ? fee2Amount : undefined,
        fee3: fee3Amount !== undefined ? fee3Amount : undefined,
        tanagyoMonthlyVisit,
        tanagyoDate: tanagyoDate || undefined,
        tanagyoTimeSlot: tanagyoTimeSlot || undefined,
        tanagyoPriestName: tanagyoPriestName || undefined,
        tanagyoOrder: tanagyoOrder !== undefined ? tanagyoOrder : undefined,
        tanagyoAddress: tanagyoAddress || undefined,
        tanagyoNotes: tanagyoNotes || undefined,
        notes,
        createdAt,
        createdDate,
        createdTime,
        updatedDate,
        updatedTime,
        familyMembers,
      });
    });
  }

  // 5. Parse Past Records (過去帳 / 精霊簿 / 故人)
  const pastSheetName = findSheet(
    ['過去帳', '精霊簿', '精霊', '故人', 'kakocho', 'past', '仏鑑'],
    ['戒名', '法名', '俗名', '命日', '没年月日']
  );
  const { headers: pastHeaders, rows: pastRows } = getSheetDataByName(pastSheetName);
  const pastRecords: PastRecord[] = [];

  if (pastRows.length > 0) {
    const idIdx = findColIdx(pastHeaders, ['ID', 'id', '過去帳ID', '故人ID', '管理番号', 'No', 'NO']);
    const templeNameIdx = findColIdx(pastHeaders, ['所属寺院', '寺院名', '寺院']);
    const templeIdIdx = findColIdx(pastHeaders, ['所属寺院ID', '寺院ID', 'templeId']);
    const hIdIdx = findColIdx(pastHeaders, ['檀家ID', '世帯ID', '檀家ID (世帯ID)', '檀家番号', 'householdId']);
    const dharmaIdx = findColIdx(pastHeaders, ['戒名・法名', '戒名', '法名', '法号', '尊霊', '霊位', '法名（戒名）', '院号法名']);
    const secularIdx = findColIdx(pastHeaders, ['俗名 (故人名)', '俗名', '故人名', '故人氏名', '本名', '氏名', '名前', '亡者名']);
    const furiganaIdx = findColIdx(pastHeaders, ['フリガナ', 'ふりがな', 'カナ', 'かな', '読み', '戒名カナ']);
    const deathDateIdx = findColIdx(pastHeaders, ['命日 (没年月日)', '命日', '没年月日', '逝去年月日', '死亡年月日', '忌日', '祥月命日', '死亡日']);
    const ageIdx = findColIdx(pastHeaders, ['享年 (行年)', '享年', '行年', '没年齢', '死亡時年齢', '年齢', '歳', '才']);
    const relIdx = findColIdx(pastHeaders, ['続柄', '施主との続柄', '関係', '戸主との関係', '世帯主との続柄']);
    const mournerIdx = findColIdx(pastHeaders, ['施主名 (現世帯主等)', '施主名', '当時の施主名', '世帯主名', '施主', '代表者', '当家', '現在の施主名']);
    const tombIdx = findColIdx(pastHeaders, ['墓地番号', '納骨・墓地位置', '墓所', '墓地', '区画', '納骨位置', '埋葬場所']);
    const niibonIdx = findColIdx(pastHeaders, ['新盆区分', '新盆', '初盆', '新盆該当年']);
    const notesIdx = findColIdx(pastHeaders, ['備考・行状', '備考', 'メモ', '過去帳備考', '引導法語', '特記']);
    const pCDateIdx = findColIdx(pastHeaders, ['作成日', '作成年月日', '登録日', 'createdDate', 'createdAt']);
    const pCTimeIdx = findColIdx(pastHeaders, ['作成時間', '作成時刻', 'createdTime']);
    const pUDateIdx = findColIdx(pastHeaders, ['修正日', '更新日', '修正年月日', '更新年月日', 'updatedDate', 'updatedAt']);
    const pUTimeIdx = findColIdx(pastHeaders, ['修正時間', '更新時間', '修正時刻', '更新時刻', 'updatedTime']);

    pastRows.forEach((row, idx) => {
      const dharmaName = String((dharmaIdx !== -1 ? row[dharmaIdx] : '') || '').trim();
      const secularName = String((secularIdx !== -1 ? row[secularIdx] : '') || '').trim();
      if (!dharmaName && !secularName) return;

      const recordId = String((idIdx !== -1 ? row[idIdx] : row[0]) || `PR-${Date.now()}-${idx + 1}`).trim();
      const householdId = String((hIdIdx !== -1 ? row[hIdIdx] : '') || '').trim();

      let templeId = forcedTempleId || options?.defaultTempleId || 'temple-main';
      if (!forcedTempleId) {
        if (templeIdIdx !== -1 && row[templeIdIdx]) {
          templeId = String(row[templeIdIdx]).trim();
        } else if (templeNameIdx !== -1 && row[templeNameIdx]) {
          const tName = String(row[templeNameIdx]).trim();
          for (const [name, id] of templeNameToIdMap.entries()) {
            if (tName.includes(name) || name.includes(tName)) {
              templeId = id;
              break;
            }
          }
        } else if (householdId && householdTempleMap.has(householdId)) {
          templeId = householdTempleMap.get(householdId)!;
        }
      }

      const furigana = normalizeFurigana(furiganaIdx !== -1 ? row[furiganaIdx] : '');
      const deathDate = normalizeDateInput(deathDateIdx !== -1 ? row[deathDateIdx] : '');

      let age: number | undefined = undefined;
      if (ageIdx !== -1 && row[ageIdx] !== undefined && row[ageIdx] !== '') {
        const numAge = parseInt(String(row[ageIdx]).replace(/[^0-9]/g, ''), 10);
        if (!isNaN(numAge)) age = numAge;
      }

      const relationship = String((relIdx !== -1 ? row[relIdx] : '') || '').trim();
      const chiefMourner = String((mournerIdx !== -1 ? row[mournerIdx] : '') || '').trim();
      const tombNumber = String((tombIdx !== -1 ? row[tombIdx] : '') || '').trim();
      const niibon = String((niibonIdx !== -1 ? row[niibonIdx] : '') || '').trim();
      const notes = String((notesIdx !== -1 ? row[notesIdx] : '') || '').trim();

      const createdDate = normalizeAuditDate(pCDateIdx !== -1 ? row[pCDateIdx] : '') || importAudit.date;
      const createdTime = normalizeAuditTime(pCTimeIdx !== -1 ? row[pCTimeIdx] : '') || importAudit.time;
      const updatedDate = normalizeAuditDate(pUDateIdx !== -1 ? row[pUDateIdx] : '') || importAudit.date;
      const updatedTime = normalizeAuditTime(pUTimeIdx !== -1 ? row[pUTimeIdx] : '') || importAudit.time;

      pastRecords.push({
        id: recordId,
        templeId,
        householdId,
        householdHeadName: chiefMourner,
        dharmaName,
        secularName,
        deceasedName: secularName,
        furigana,
        deathDate,
        ageAtDeath: age,
        age: age,
        relationship,
        chiefMourner,
        burialLocation: tombNumber,
        tombNumber,
        niibon,
        notes,
        createdDate,
        createdTime,
        updatedDate,
        updatedTime,
      });
    });
  }

  // 6. Parse Memorial Services (法事予約 / 法要予定)
  const memorialSheetName = findSheet(
    ['法事予約', '法要予定', '法事・予約一覧', '法事', '予約', '法要', 'memorial', 'service'],
    ['予定日', '法要日', '種別・回忌', '開始時刻']
  );
  const { headers: memHeaders, rows: memRows } = getSheetDataByName(memorialSheetName);
  const memorialServices: MemorialService[] = [];

  if (memRows.length > 0) {
    const idIdx = findColIdx(memHeaders, ['予約ID', 'ID', 'id', '管理番号', 'No']);
    const templeNameIdx = findColIdx(memHeaders, ['所属寺院', '寺院名', '寺院']);
    const templeIdIdx = findColIdx(memHeaders, ['所属寺院ID', '寺院ID', 'templeId']);
    const dateIdx = findColIdx(memHeaders, ['予定日', '法要日', '法事日', '日付', 'scheduledDate']);
    const timeIdx = findColIdx(memHeaders, ['開始時刻', '開始時間', '時間', '時刻', 'scheduledTime']);
    const endTimeIdx = findColIdx(memHeaders, ['終了時刻', '終了時間', 'endTime']);
    const typeIdx = findColIdx(memHeaders, ['種別・回忌', '種別', '法要種別', '法要名', '回忌', 'memorialType']);
    const mournerIdx = findColIdx(memHeaders, ['施主名', '施主', '世帯主名', '氏名', 'chiefMourner']);
    const dharmaIdx = findColIdx(memHeaders, ['戒名・法名', '戒名', '法名', 'dharmaName']);
    const secularIdx = findColIdx(memHeaders, ['俗名', '故人名', '故人氏名', 'deceasedName']);
    const venueIdx = findColIdx(memHeaders, ['会場', '場所', '式場', '法要会場', 'venue']);
    const addressIdx = findColIdx(memHeaders, ['自宅・会場住所', '会場住所', '住所', 'address']);
    const attendeesIdx = findColIdx(memHeaders, ['参列人数', '参列者数', '人数', 'attendeeCount']);
    const offeringIdx = findColIdx(memHeaders, ['お布施目安 (円)', 'お布施', '布施', '布施額', '金額', 'offeringAmount']);
    const tobaCountIdx = findColIdx(memHeaders, ['塔婆本数', '塔婆数', '本数', 'tobaCount']);
    const tobaTypeIdx = findColIdx(memHeaders, ['塔婆種別', '塔婆区分', 'tobaType']);
    const tobaFeeIdx = findColIdx(memHeaders, ['塔婆料合計 (円)', '塔婆料', '塔婆金額', 'tobaFee']);
    const tobaSponsorsIdx = findColIdx(memHeaders, ['塔婆志主一覧', '塔婆志主', '志主', 'tobaSponsors']);
    const statusIdx = findColIdx(memHeaders, ['案内状況', '案内ステータス', 'ステータス', '状態', 'status']);
    const receptionIdx = findColIdx(memHeaders, ['当日受付', '受付状況', '受付済', '受付', 'receptionCheckedIn']);
    const accountingIdx = findColIdx(memHeaders, ['出納記帳', '会計記帳', '出納済', '会計済', '出納', 'accountingRecorded']);
    const hIdIdx = findColIdx(memHeaders, ['檀家ID', '世帯ID', 'householdId']);
    const decIdIdx = findColIdx(memHeaders, ['故人ID (過去帳ID)', '過去帳ID', '故人ID', 'deceasedId']);
    const txIdIdx = findColIdx(memHeaders, ['出納取引ID', '取引ID', '出納ID', 'transactionId']);
    const notesIdx = findColIdx(memHeaders, ['備考・特記', '備考', 'メモ', '特記事項', 'notes']);
    const mCDateIdx = findColIdx(memHeaders, ['作成日', '作成年月日', '登録日', 'createdDate', 'createdAt']);
    const mCTimeIdx = findColIdx(memHeaders, ['作成時間', '作成時刻', 'createdTime']);
    const mUDateIdx = findColIdx(memHeaders, ['修正日', '更新日', '修正年月日', '更新年月日', 'updatedDate', 'updatedAt']);
    const mUTimeIdx = findColIdx(memHeaders, ['修正時間', '更新時間', '修正時刻', '更新時刻', 'updatedTime']);

    memRows.forEach((row, idx) => {
      const scheduledDate = normalizeDateInput(dateIdx !== -1 ? row[dateIdx] : '');
      const chiefMourner = String((mournerIdx !== -1 ? row[mournerIdx] : '') || '').trim();
      const memorialType = String((typeIdx !== -1 ? row[typeIdx] : '') || '年回忌法要').trim();
      if (!scheduledDate && !chiefMourner) return;

      const id = String((idIdx !== -1 ? row[idIdx] : row[0]) || `SRV-${Date.now()}-${idx + 1}`).trim();
      const householdId = String((hIdIdx !== -1 ? row[hIdIdx] : '') || '').trim();

      let templeId = forcedTempleId || options?.defaultTempleId || 'temple-main';
      if (!forcedTempleId) {
        if (templeIdIdx !== -1 && row[templeIdIdx]) {
          templeId = String(row[templeIdIdx]).trim();
        } else if (templeNameIdx !== -1 && row[templeNameIdx]) {
          const tName = String(row[templeNameIdx]).trim();
          for (const [name, tid] of templeNameToIdMap.entries()) {
            if (tName.includes(name) || name.includes(tName)) {
              templeId = tid;
              break;
            }
          }
        } else if (householdId && householdTempleMap.has(householdId)) {
          templeId = householdTempleMap.get(householdId)!;
        }
      }

      const scheduledTime = String((timeIdx !== -1 ? row[timeIdx] : '') || '10:00').trim();
      const endTime = String((endTimeIdx !== -1 ? row[endTimeIdx] : '') || '').trim();
      const dharmaName = String((dharmaIdx !== -1 ? row[dharmaIdx] : '') || '').trim();
      const deceasedName = String((secularIdx !== -1 ? row[secularIdx] : '') || '').trim();
      const venue = ((venueIdx !== -1 ? row[venueIdx] : '') || '本堂') as any;
      const address = String((addressIdx !== -1 ? row[addressIdx] : '') || '').trim();
      const attendeeCount = parseInt(String((attendeesIdx !== -1 ? row[attendeesIdx] : '') || '0').replace(/[^0-9]/g, ''), 10) || 0;
      const offeringAmount = parseInt(String((offeringIdx !== -1 ? row[offeringIdx] : '') || '0').replace(/[^0-9]/g, ''), 10) || 0;
      const tobaCount = parseInt(String((tobaCountIdx !== -1 ? row[tobaCountIdx] : '') || '0').replace(/[^0-9]/g, ''), 10) || 0;
      const tobaType = String((tobaTypeIdx !== -1 ? row[tobaTypeIdx] : '') || '').trim();
      const tobaFee = parseInt(String((tobaFeeIdx !== -1 ? row[tobaFeeIdx] : '') || '0').replace(/[^0-9]/g, ''), 10) || 0;
      
      const sponsorsStr = String((tobaSponsorsIdx !== -1 ? row[tobaSponsorsIdx] : '') || '').trim();
      const tobaSponsors = sponsorsStr ? sponsorsStr.split(/[、,]/).map((s) => s.trim()).filter(Boolean) : [];

      const status = ((statusIdx !== -1 ? row[statusIdx] : '') || '未入金') as any;
      const receptionCheckedIn = String((receptionIdx !== -1 ? row[receptionIdx] : '') || '').includes('済');
      const accountingRecorded = String((accountingIdx !== -1 ? row[accountingIdx] : '') || '').includes('済');
      const deceasedId = String((decIdIdx !== -1 ? row[decIdIdx] : '') || '').trim();
      const transactionId = String((txIdIdx !== -1 ? row[txIdIdx] : '') || '').trim();
      const notes = String((notesIdx !== -1 ? row[notesIdx] : '') || '').trim();

      const createdDate = normalizeAuditDate(mCDateIdx !== -1 ? row[mCDateIdx] : '') || importAudit.date;
      const createdTime = normalizeAuditTime(mCTimeIdx !== -1 ? row[mCTimeIdx] : '') || importAudit.time;
      const updatedDate = normalizeAuditDate(mUDateIdx !== -1 ? row[mUDateIdx] : '') || importAudit.date;
      const updatedTime = normalizeAuditTime(mUTimeIdx !== -1 ? row[mUTimeIdx] : '') || importAudit.time;

      memorialServices.push({
        id,
        templeId,
        householdId,
        deceasedId,
        transactionId,
        scheduledDate,
        scheduledTime,
        endTime,
        memorialType,
        chiefMourner: chiefMourner || '施主名未設定',
        dharmaName,
        deceasedName,
        venue,
        address,
        attendeeCount,
        offeringAmount,
        tobaCount,
        tobaType,
        tobaFee,
        tobaSponsors,
        status,
        receptionCheckedIn,
        accountingRecorded,
        notes,
        createdDate,
        createdTime,
        updatedDate,
        updatedTime,
      });
    });
  }

  // 7. Parse Temple Todos (寺院ToDo / タスク / 行事予定)
  const todoSheetName = findSheet(
    ['寺院todo', 'todo', 'タスク', '行事予定', 'タスク一覧', 'todo一覧', 'task'],
    ['タスク名', 'タイトル', '期日', '優先度']
  );
  const { headers: todoHeaders, rows: todoRows } = getSheetDataByName(todoSheetName);
  const templeTodos: TempleTodo[] = [];

  if (todoRows.length > 0) {
    const idIdx = findColIdx(todoHeaders, ['タスクID', 'ID', 'id', 'No']);
    const templeNameIdx = findColIdx(todoHeaders, ['所属寺院', '寺院名', '寺院']);
    const templeIdIdx = findColIdx(todoHeaders, ['所属寺院ID', '寺院ID', 'templeId']);
    const dateIdx = findColIdx(todoHeaders, ['期日', '予定日', '日付', '期限', 'dueDate']);
    const timeIdx = findColIdx(todoHeaders, ['時間', '時刻', 'dueTime']);
    const titleIdx = findColIdx(todoHeaders, ['タスク名 (件名)', 'タスク名', '件名', 'タイトル', '内容', 'title']);
    const catIdx = findColIdx(todoHeaders, ['分類・種別', '分類', '種別', 'カテゴリ', 'category']);
    const priorityIdx = findColIdx(todoHeaders, ['優先度', '重要度', 'priority']);
    const statusIdx = findColIdx(todoHeaders, ['状態', 'ステータス', '完了', 'completed']);
    const contactIdx = findColIdx(todoHeaders, ['関連施主名', '施主名', '相手先', '氏名', 'contactName', 'householdHeadName']);
    const hIdIdx = findColIdx(todoHeaders, ['檀家ID', '世帯ID', 'householdId']);
    const sIdIdx = findColIdx(todoHeaders, ['予約ID', '法事ID', 'serviceId', 'relatedServiceId']);
    const notesIdx = findColIdx(todoHeaders, ['詳細・メモ', '詳細', 'メモ', '備考', 'notes']);
    const createdIdx = findColIdx(todoHeaders, ['作成日', '登録日', 'createdAt', 'createdDate']);
    const tdCDateIdx = findColIdx(todoHeaders, ['作成日', '作成年月日', 'createdDate']);
    const tdCTimeIdx = findColIdx(todoHeaders, ['作成時間', '作成時刻', 'createdTime']);
    const tdUDateIdx = findColIdx(todoHeaders, ['修正日', '更新日', '修正年月日', '更新年月日', 'updatedDate', 'updatedAt']);
    const tdUTimeIdx = findColIdx(todoHeaders, ['修正時間', '更新時間', '修正時刻', '更新時刻', 'updatedTime']);

    todoRows.forEach((row, idx) => {
      const title = String((titleIdx !== -1 ? row[titleIdx] : '') || '').trim();
      const dueDate = normalizeDateInput(dateIdx !== -1 ? row[dateIdx] : '');
      if (!title && !dueDate) return;

      const id = String((idIdx !== -1 ? row[idIdx] : row[0]) || `TODO-${Date.now()}-${idx + 1}`).trim();
      const householdId = String((hIdIdx !== -1 ? row[hIdIdx] : '') || '').trim();

      let templeId = forcedTempleId || options?.defaultTempleId || 'temple-main';
      if (!forcedTempleId) {
        if (templeIdIdx !== -1 && row[templeIdIdx]) {
          templeId = String(row[templeIdIdx]).trim();
        } else if (templeNameIdx !== -1 && row[templeNameIdx]) {
          const tName = String(row[templeNameIdx]).trim();
          for (const [name, tid] of templeNameToIdMap.entries()) {
            if (tName.includes(name) || name.includes(tName)) {
              templeId = tid;
              break;
            }
          }
        } else if (householdId && householdTempleMap.has(householdId)) {
          templeId = householdTempleMap.get(householdId)!;
        }
      }

      const dueTime = String((timeIdx !== -1 ? row[timeIdx] : '') || '').trim();
      const category = (catIdx !== -1 ? String(row[catIdx] || '').trim() : '') || '法要準備';
      const pStr = String((priorityIdx !== -1 ? row[priorityIdx] : '') || '').trim();
      const priority = pStr.includes('至急') ? 'urgent' : pStr.includes('高') ? 'high' : pStr.includes('低') ? 'low' : 'medium';
      const statusVal = String((statusIdx !== -1 ? row[statusIdx] : '') || '').trim();
      const completed = statusVal === '完了' || statusVal === '済' || statusVal === '完了済' || statusVal === '1' || statusVal.toLowerCase() === 'true' || (statusVal.includes('完了') && !statusVal.includes('未完了') && !statusVal.includes('未'));
      const contactName = String((contactIdx !== -1 ? row[contactIdx] : '') || '').trim();
      const serviceId = String((sIdIdx !== -1 ? row[sIdIdx] : '') || '').trim();
      const notes = String((notesIdx !== -1 ? row[notesIdx] : '') || '').trim();
      const rawCreated = createdIdx !== -1 ? row[createdIdx] : '';
      const createdAt = normalizeDateInput(rawCreated) || new Date().toISOString().split('T')[0];

      const createdDate = normalizeAuditDate(tdCDateIdx !== -1 ? row[tdCDateIdx] : rawCreated) || importAudit.date;
      const createdTime = normalizeAuditTime(tdCTimeIdx !== -1 ? row[tdCTimeIdx] : '') || importAudit.time;
      const updatedDate = normalizeAuditDate(tdUDateIdx !== -1 ? row[tdUDateIdx] : '') || importAudit.date;
      const updatedTime = normalizeAuditTime(tdUTimeIdx !== -1 ? row[tdUTimeIdx] : '') || importAudit.time;

      templeTodos.push({
        id,
        templeId,
        title: title || '行事タスク',
        dueDate,
        dueTime,
        category,
        priority,
        completed,
        contactName,
        householdHeadName: contactName,
        householdId,
        serviceId,
        relatedServiceId: serviceId,
        notes,
        createdAt,
        createdDate,
        createdTime,
        updatedDate,
        updatedTime,
      });
    });
  }

  // 8. Parse Transactions (出納・会計 / 出納帳 / 財務)
  const txSheetName = findSheet(
    ['出納・会計', '出納帳', '会計', '出納', '財務', '収支', '出納明細', 'transaction', 'accounting'],
    ['取引日', '勘定科目', '金額', '収支区分']
  );
  const { headers: txHeaders, rows: txRows } = getSheetDataByName(txSheetName);
  const transactions: Transaction[] = [];

  if (txRows.length > 0) {
    const idIdx = findColIdx(txHeaders, ['取引ID', 'ID', 'id', 'No']);
    const templeNameIdx = findColIdx(txHeaders, ['所属寺院', '寺院名', '寺院']);
    const templeIdIdx = findColIdx(txHeaders, ['所属寺院ID', '寺院ID', 'templeId']);
    const dateIdx = findColIdx(txHeaders, ['日付', '取引日', '年月日', '記帳日', 'date']);
    const typeIdx = findColIdx(txHeaders, ['収支区分', '収支', '区分', '種別', '入出金', 'type']);
    const catIdx = findColIdx(txHeaders, ['勘定科目', '科目', '名目', '項目', 'category']);
    const amountIdx = findColIdx(txHeaders, ['金額 (円)', '金額', '入金額', '出金額', '合計', 'amount']);
    const headIdx = findColIdx(txHeaders, ['施主名・相手先', '施主名', '相手先', '檀家名', '納入者', '支払先', '氏名', '当家']);
    const payIdx = findColIdx(txHeaders, ['受取・支払方法', '支払方法', '受取方法', '入金方法', '決済方法', 'paymentMethod']);
    const receiptIdx = findColIdx(txHeaders, ['領収証番号', '受領証番号', '領収書番号', 'receiptNumber']);
    const hIdIdx = findColIdx(txHeaders, ['檀家ID (世帯ID)', '檀家ID', '世帯ID', 'householdId']);
    const sIdIdx = findColIdx(txHeaders, ['関連法要ID', '法事ID', '予約ID', 'relatedServiceId']);
    const notesIdx = findColIdx(txHeaders, ['摘要・備考', '摘要', '備考', 'メモ', '特記', 'notes']);
    const txCDateIdx = findColIdx(txHeaders, ['作成日', '作成年月日', '登録日', 'createdDate', 'createdAt']);
    const txCTimeIdx = findColIdx(txHeaders, ['作成時間', '作成時刻', 'createdTime']);
    const txUDateIdx = findColIdx(txHeaders, ['修正日', '更新日', '修正年月日', '更新年月日', 'updatedDate', 'updatedAt']);
    const txUTimeIdx = findColIdx(txHeaders, ['修正時間', '更新時間', '修正時刻', '更新時刻', 'updatedTime']);

    txRows.forEach((row, idx) => {
      const date = normalizeDateInput(dateIdx !== -1 ? row[dateIdx] : '');
      const rawAmount = String((amountIdx !== -1 ? row[amountIdx] : '') || '').replace(/[^0-9-]/g, '');
      const amount = parseInt(rawAmount, 10) || 0;
      if (!date && amount === 0) return;

      const id = String((idIdx !== -1 ? row[idIdx] : row[0]) || `TX-${Date.now()}-${idx + 1}`).trim();
      const householdId = String((hIdIdx !== -1 ? row[hIdIdx] : '') || '').trim();

      let templeId = forcedTempleId || options?.defaultTempleId || 'temple-main';
      if (!forcedTempleId) {
        if (templeIdIdx !== -1 && row[templeIdIdx]) {
          templeId = String(row[templeIdIdx]).trim();
        } else if (templeNameIdx !== -1 && row[templeNameIdx]) {
          const tName = String(row[templeNameIdx]).trim();
          for (const [name, tid] of templeNameToIdMap.entries()) {
            if (tName.includes(name) || name.includes(tName)) {
              templeId = tid;
              break;
            }
          }
        } else if (householdId && householdTempleMap.has(householdId)) {
          templeId = householdTempleMap.get(householdId)!;
        }
      }

      const rawType = String((typeIdx !== -1 ? row[typeIdx] : '') || '').trim();
      const type: '収入' | '支出' = rawType.includes('支') || amount < 0 ? '支出' : '収入';
      const category = String((catIdx !== -1 ? row[catIdx] : '') || (type === '収入' ? '法要布施' : '管理費')).trim();
      const householdHeadName = String((headIdx !== -1 ? row[headIdx] : '') || '').trim();
      const paymentMethod = String((payIdx !== -1 ? row[payIdx] : '') || '現金受付').trim();
      const receiptNumber = String((receiptIdx !== -1 ? row[receiptIdx] : '') || '').trim();
      const relatedServiceId = String((sIdIdx !== -1 ? row[sIdIdx] : '') || '').trim();
      const notes = String((notesIdx !== -1 ? row[notesIdx] : '') || '').trim();

      const createdDate = normalizeAuditDate(txCDateIdx !== -1 ? row[txCDateIdx] : '') || importAudit.date;
      const createdTime = normalizeAuditTime(txCTimeIdx !== -1 ? row[txCTimeIdx] : '') || importAudit.time;
      const updatedDate = normalizeAuditDate(txUDateIdx !== -1 ? row[txUDateIdx] : '') || importAudit.date;
      const updatedTime = normalizeAuditTime(txUTimeIdx !== -1 ? row[txUTimeIdx] : '') || importAudit.time;

      transactions.push({
        id,
        templeId,
        date: date || new Date().toISOString().split('T')[0],
        type,
        category,
        amount: Math.abs(amount),
        householdHeadName,
        paymentMethod,
        receiptNumber,
        householdId,
        relatedServiceId,
        notes,
        createdDate,
        createdTime,
        updatedDate,
        updatedTime,
      });
    });
  }

  // 9. Parse Master Options (マスタ設定)
  const parseMasterFromRows = (headers: string[], rows: (string | number | Date | undefined)[][]): MasterOptions | undefined => {
    if (!rows || rows.length === 0) return undefined;
    const householdTypes: string[] = [];
    const statuses: string[] = [];
    const districts: string[] = [];
    const incomeCategories: string[] = [];
    const expenseCategories: string[] = [];
    const paymentMethods: string[] = [];

    const hTypeIdx = findColIdx(headers, ['区分１', '区分1', '檀家種別', '世帯区分', '区分']);
    const statusIdx = findColIdx(headers, ['区分２', '区分2', '状態区分', 'ステータス', '状態']);
    const districtIdx = findColIdx(headers, ['総代・世話人', '役職', '地区', '総代', '世話人']);
    const incIdx = findColIdx(headers, ['収入の部 (勘定科目)', '勘定科目（収入）', '勘定科目(収入)', '収入の部', '収入科目', '収入科目名', '収入']);
    const expIdx = findColIdx(headers, ['支出の部 (勘定科目)', '勘定科目（支出）', '勘定科目(支出)', '支出の部', '支出科目', '支出科目名', '支出']);
    const payIdx = findColIdx(headers, ['決済方法', '支払・受取方法', '受取方法', '支払方法', '決済']);

    rows.forEach((row) => {
      const hType = String((hTypeIdx !== -1 ? row[hTypeIdx] : row[0]) || '').trim();
      const st = String((statusIdx !== -1 ? row[statusIdx] : row[1]) || '').trim();
      const dist = String((districtIdx !== -1 ? row[districtIdx] : row[2]) || '').trim();
      const inc = String((incIdx !== -1 ? row[incIdx] : row[3]) || '').trim();
      const exp = String((expIdx !== -1 ? row[expIdx] : row[4]) || '').trim();
      const pay = String((payIdx !== -1 ? row[payIdx] : row[5]) || '').trim();

      if (hType && !householdTypes.includes(hType)) householdTypes.push(hType);
      if (st && !statuses.includes(st)) statuses.push(st);
      if (dist && !districts.includes(dist)) districts.push(dist);
      if (inc && !incomeCategories.includes(inc)) incomeCategories.push(inc);
      if (exp && !expenseCategories.includes(exp)) expenseCategories.push(exp);
      if (pay && !paymentMethods.includes(pay)) paymentMethods.push(pay);
    });

    const incList = incomeCategories.length > 0 ? incomeCategories : (INITIAL_MASTER_OPTIONS.incomeCategories || []);
    const expList = expenseCategories.length > 0 ? expenseCategories : (INITIAL_MASTER_OPTIONS.expenseCategories || []);

    return {
      householdTypes: householdTypes.length > 0 ? householdTypes : INITIAL_MASTER_OPTIONS.householdTypes,
      statuses: statuses, // Respect empty statuses if cleared by user
      districts: districts.length > 0 ? districts : INITIAL_MASTER_OPTIONS.districts,
      incomeCategories: incList,
      expenseCategories: expList,
      accountingCategories: [...incList, ...expList.filter((c) => !incList.includes(c))],
      paymentMethods: paymentMethods.length > 0 ? paymentMethods : INITIAL_MASTER_OPTIONS.paymentMethods,
    };
  };

  const masterSheetName = findSheet(['マスタ設定（総合）', 'マスタ設定', 'マスタ', 'マスター', '設定']);
  const { headers: masterHeaders, rows: masterRows } = getSheetDataByName(masterSheetName);
  let masterOptions: MasterOptions | undefined = parseMasterFromRows(masterHeaders, masterRows);

  // Check per-temple master sheets (e.g., マスタ_圓福寺, マスタ_宝蔵寺)
  const templeMasterOptionsMap: Record<string, MasterOptions> = {};
  allSheetNames.forEach((sheetName) => {
    if (sheetName.startsWith('マスタ_') || sheetName.startsWith('マスター_')) {
      const tName = sheetName.replace(/^マスタ[ー]?_/, '').trim();
      const { headers: tHeaders, rows: tRows } = getSheetDataByName(sheetName);
      const parsed = parseMasterFromRows(tHeaders, tRows);
      if (parsed) {
        let matchedId = 'temple-main';
        for (const [name, id] of templeNameToIdMap.entries()) {
          if (tName.includes(name) || name.includes(tName)) {
            matchedId = id;
            break;
          }
        }
        templeMasterOptionsMap[matchedId] = parsed;
      }
    }
  });

  if (!masterOptions) {
    const mainKey = Object.keys(templeMasterOptionsMap)[0];
    masterOptions = templeMasterOptionsMap['temple-main'] || (mainKey ? templeMasterOptionsMap[mainKey] : undefined);
  }

  // 10. Parse Notice Templates (案内文テンプレート)
  const templateSheetName = findSheet(['案内文テンプレート', '案内文', 'テンプレート']);
  const { headers: templateHeaders, rows: templateRows } = getSheetDataByName(templateSheetName);
  let noticeTemplates: { higan: string; niibon: string } | undefined;

  if (templateRows.length > 0) {
    const idIdx = findColIdx(templateHeaders, ['テンプレートID', 'ID', 'id']);
    const nameIdx = findColIdx(templateHeaders, ['テンプレート名称', 'テンプレート名', '名称', 'name']);
    const typeIdx = findColIdx(templateHeaders, ['用紙種別', '用紙種類', '用紙', '種別', 'type']);
    const catIdx = findColIdx(templateHeaders, ['法要区分', 'テンプレート区分', '区分', 'category']);
    const contentIdx = findColIdx(templateHeaders, ['案内文本文', '本文', '案内文', '内容', 'content']);

    const isNewFormat = typeIdx !== -1 || (templateHeaders.length >= 4 && contentIdx !== -1);

    if (isNewFormat) {
      const importedTemplates: NoticeTemplateItem[] = [];
      templateRows.forEach((row, i) => {
        if (!row || row.length === 0) return;
        const rawContent = String((contentIdx !== -1 ? row[contentIdx] : row[4]) || '').trim();
        if (!rawContent) return;

        const rawId = String((idIdx !== -1 ? row[idIdx] : row[0]) || `tpl-imported-${Date.now()}-${i}`).trim();
        const rawName = String((nameIdx !== -1 ? row[nameIdx] : row[1]) || `案内文 ${i + 1}`).trim();
        const rawType = String((typeIdx !== -1 ? row[typeIdx] : row[2]) || '').trim();
        const rawCat = String((catIdx !== -1 ? row[catIdx] : row[3]) || '').trim();

        const docType: 'postcard' | 'a4' = rawType.includes('A4') || rawType.toLowerCase().includes('a4') ? 'a4' : 'postcard';
        let category: string = 'custom';
        if (rawCat.includes('彼岸')) category = 'higan';
        else if (rawCat.includes('新盆') || rawCat.includes('初盆')) category = 'niibon';
        else if (rawCat.includes('年回忌') || rawCat.includes('年忌')) category = 'memorial';
        else if (rawCat.includes('年中行事') || rawCat.includes('一般')) category = 'general';

        importedTemplates.push({
          id: rawId,
          name: rawName,
          type: docType,
          category,
          content: rawContent,
          isDefault: i < 4,
        });
      });

      if (importedTemplates.length > 0) {
        saveAllNoticeTemplates(importedTemplates);
        const higanTpl = importedTemplates.find((t) => t.category === 'higan');
        const niibonTpl = importedTemplates.find((t) => t.category === 'niibon');
        noticeTemplates = {
          higan: higanTpl?.content || DEFAULT_HIGAN_TEMPLATE,
          niibon: niibonTpl?.content || DEFAULT_NIIBON_TEMPLATE,
        };
      }
    } else {
      // Legacy 2-column format: [テンプレート区分, 案内文本文]
      let higan = '';
      let niibon = '';
      templateRows.forEach((row) => {
        const type = String(row[0] || '').trim();
        const content = String(row[1] || '').trim();
        if (type.includes('彼岸')) {
          higan = content;
        } else if (type.includes('新盆') || type.includes('初盆')) {
          niibon = content;
        }
      });

      if (higan || niibon) {
        const currentSaved = getSavedNoticeTemplates();
        noticeTemplates = {
          higan: higan || currentSaved.higan,
          niibon: niibon || currentSaved.niibon,
        };
        saveNoticeTemplates(noticeTemplates);
      }
    }
  }

  // 11. Parse Priests (登録僧侶一覧)
  const priestSheetName = findSheet(
    ['登録僧侶一覧', '登録僧侶', '僧侶一覧', '僧侶名簿', '僧侶'],
    ['僧侶名', '役職', 'フリガナ', '役職・区分', '僧侶ID']
  );
  const { headers: priestHeaders, rows: priestRows } = getSheetDataByName(priestSheetName);
  const parsedPriests: Priest[] = [];

  if (priestRows.length > 0) {
    const idIdx = findColIdx(priestHeaders, ['僧侶ID', 'ID', 'priestid']);
    const nameIdx = findColIdx(priestHeaders, ['僧侶名', '氏名', '名前', '僧名', 'name']);
    const furiIdx = findColIdx(priestHeaders, ['フリガナ', 'ふりがな', 'カナ', 'furigana']);
    const roleIdx = findColIdx(priestHeaders, ['役職・区分', '役職', '区分', '立場', 'role']);
    const templeNameIdx = findColIdx(priestHeaders, ['所属寺院名', '寺院名', '所属']);
    const phoneIdx = findColIdx(priestHeaders, ['電話番号', '電話', '連絡先', 'phone', 'tel']);
    const emailIdx = findColIdx(priestHeaders, ['メールアドレス', 'メール', 'email']);
    const notesIdx = findColIdx(priestHeaders, ['備考・特記', '備考', '特記', 'メモ', 'notes']);
    const autoIdx = findColIdx(priestHeaders, ['自動連携区分', '自動連携', '連携']);
    const templeIdIdx = findColIdx(priestHeaders, ['所属寺院ID', '寺院ID', 'templeid']);

    priestRows.forEach((row, idx) => {
      const name = nameIdx !== -1 ? String(row[nameIdx] || '').trim() : '';
      if (!name) return;

      const id = idIdx !== -1 && row[idIdx] ? String(row[idIdx]).trim() : `priest-import-${Date.now()}-${idx}`;
      const furigana = furiIdx !== -1 ? normalizeFurigana(String(row[furiIdx] || '')) : '';
      const role = roleIdx !== -1 && row[roleIdx] ? String(row[roleIdx]).trim() : '僧侶';
      const templeName = templeNameIdx !== -1 ? String(row[templeNameIdx] || '').trim() : '';
      const phone = phoneIdx !== -1 ? String(row[phoneIdx] || '').trim() : '';
      const email = emailIdx !== -1 ? String(row[emailIdx] || '').trim() : '';
      const notes = notesIdx !== -1 ? String(row[notesIdx] || '').trim() : '';
      const autoStr = autoIdx !== -1 ? String(row[autoIdx] || '').trim() : '';
      const rawTempleId = templeIdIdx !== -1 ? String(row[templeIdIdx] || '').trim() : '';

      parsedPriests.push({
        id,
        name,
        furigana,
        role,
        templeId: rawTempleId || (temples[0]?.id || 'temple-main'),
        templeName: templeName || temples.find((t) => t.id === rawTempleId)?.name || '',
        phone,
        email,
        notes,
        isAutoChief: autoStr.includes('自動') || role.includes('住職'),
        isMainChief: role.includes('本寺住職'),
      });
    });
  }

  const extractedFamilyMembers = households.flatMap((h) => h.familyMembers || []);

  const sanitized = sanitizeAppDataset({
    households,
    pastRecords,
    transactions,
    memorialServices,
    templeTodos,
    familyMembers: extractedFamilyMembers,
    temples,
    templeInfo,
  });

  const finalHouseholds = sanitized.households;
  const finalPastRecords = sanitized.pastRecords;
  const finalTransactions = sanitized.transactions;
  const finalMemorialServices = sanitized.memorialServices;
  const finalTempleTodos = sanitized.templeTodos;

  // Use parsed masterOptions directly if present, otherwise merge from data
  const mergedMasterOptions = masterOptions || mergeMasterOptionsWithData(
    EMPTY_MASTER_OPTIONS,
    finalHouseholds,
    finalTransactions
  );

  // 11. 一括会計設定 & 一括会計受付シートの読み込み
  const batchConfigSheetName = findSheet(
    ['一括会計設定', '一括会計設定マスタ', '一括設定'],
    ['項目１勘定科目', '項目1勘定科目', '受付日付', '項目１基準金額']
  );
  let parsedBatchConfig = null;
  let batchConfigHeaders: string[] = [];
  let batchConfigRows: string[][] = [];
  if (batchConfigSheetName && wb.Sheets[batchConfigSheetName]) {
    const { headers: cHeaders, rows: cRows } = getSheetDataByName(batchConfigSheetName);
    batchConfigHeaders = cHeaders;
    batchConfigRows = cRows.map((r) => r.map((c) => String(c ?? '')));
    if (cHeaders.length > 0 && cRows.length > 0) {
      parsedBatchConfig = parseBatchAccountingConfigFromRows([cHeaders, ...batchConfigRows]);
      if (parsedBatchConfig) {
        saveBatchAccountingConfig(parsedBatchConfig);
      }
    }
  }

  const batchSheetName = findSheet(
    ['一括会計受付', '一括会計', '一括受付', '一括記帳', '一括会計データ'],
    ['項目１チェック', '項目1チェック', '受付日付', '項目１金額', '世帯合計金額']
  );
  let parsedBatchAccountingData: BatchAccountingData | undefined = undefined;
  let batchHeaders: string[] = [];
  let batchRows: string[][] = [];
  if (batchSheetName && wb.Sheets[batchSheetName]) {
    const { headers: bHeaders, rows: bRows } = getSheetDataByName(batchSheetName);
    batchHeaders = bHeaders;
    batchRows = bRows.map((r) => r.map((c) => String(c ?? '')));
  }

  if ((batchHeaders.length > 0 && batchRows.length > 0) || parsedBatchConfig) {
    const configRows = batchConfigHeaders.length > 0 ? [batchConfigHeaders, ...batchConfigRows] : undefined;
    const receptionRows = batchHeaders.length > 0 ? [batchHeaders, ...batchRows] : undefined;
    const reconstructed = reconstructBatchAccountingData(configRows, receptionRows, finalHouseholds, templeInfo);
    if (reconstructed) {
      parsedBatchAccountingData = reconstructed;
      saveBatchAccountingData(reconstructed);
    }
  }

  return {
    templeInfo,
    temples,
    households: finalHouseholds,
    pastRecords: finalPastRecords,
    memorialServices: finalMemorialServices,
    templeTodos: finalTempleTodos,
    transactions: finalTransactions,
    masterOptions: mergedMasterOptions,
    templeMasterOptionsMap: Object.keys(templeMasterOptionsMap).length > 0 ? templeMasterOptionsMap : undefined,
    noticeTemplates,
    priests: parsedPriests.length > 0 ? parsedPriests : undefined,
    batchAccountingData: parsedBatchAccountingData,
  };
}
