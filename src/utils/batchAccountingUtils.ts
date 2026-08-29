import { BatchAccountingConfig, BatchAccountingData, Household, HouseholdBatchEntry, TempleInfo, TempleProfile } from '../types';
import { safeStorage, loadJsonState, saveJsonState } from './storageUtils';
import { formatJapaneseEraDate } from './memorialCalculator';

export const STORAGE_KEY_BATCH_ACCOUNTING = 'temple_batch_accounting_data';
export const STORAGE_KEY_BATCH_ACCOUNTING_CONFIG = 'temple_batch_accounting_config';

/**
 * 集金項目名から対応勘定科目を解決するヘルパー
 */
export function resolveCategoryForFeeItem(
  feeName: string,
  templeInfo?: TempleInfo,
  incomeCategories: string[] = ['法要布施', '護持会費', '特別寄付', '墓地管理費']
): string {
  if (!feeName) return '法要布施';
  const trimmed = feeName.trim();
  if (templeInfo?.feeType1 === trimmed && templeInfo.feeType1Category) return templeInfo.feeType1Category;
  if (templeInfo?.feeType2 === trimmed && templeInfo.feeType2Category) return templeInfo.feeType2Category;
  if (templeInfo?.feeType3 === trimmed && templeInfo.feeType3Category) return templeInfo.feeType3Category;
  if (templeInfo?.feeTypeMapping && templeInfo.feeTypeMapping[trimmed]) return templeInfo.feeTypeMapping[trimmed];
  if (incomeCategories.includes(trimmed)) return trimmed;
  if (trimmed.includes('護持') || trimmed.includes('会費')) return incomeCategories.find((c) => c.includes('護持') || c.includes('会費')) || '護持会費';
  if (trimmed.includes('墓地') || trimmed.includes('管理')) return incomeCategories.find((c) => c.includes('墓地') || c.includes('管理')) || '墓地管理費';
  if (trimmed.includes('寄付') || trimmed.includes('整備')) return incomeCategories.find((c) => c.includes('寄付')) || '特別寄付';
  return '法要布施';
}

/**
 * 寺院設定に基づくデフォルトの一括会計設定（Config）を生成
 */
export function getDefaultBatchAccountingConfig(templeInfo?: TempleInfo): BatchAccountingConfig {
  const todayEra = formatJapaneseEraDate(new Date().toISOString().slice(0, 10), false);
  const tFee1 = templeInfo?.feeType1?.trim() || '';
  const tFee2 = templeInfo?.feeType2?.trim() || '';
  const tFee3 = templeInfo?.feeType3?.trim() || '';
  const toba1 = templeInfo?.tobaType1?.trim() || '';

  // 項目1
  let notes1 = '';
  let cat1 = '法要布施';
  let defaultAmount1: number | '' = '';
  if (toba1) {
    notes1 = `${toba1}料`;
    cat1 = '法要布施';
    defaultAmount1 = 3000;
  } else if (tFee1) {
    notes1 = tFee1;
    cat1 = templeInfo?.feeType1Category || resolveCategoryForFeeItem(tFee1, templeInfo);
    defaultAmount1 = templeInfo?.feeType1DefaultAmount ?? 5000;
  }

  // 項目2
  let notes2 = '';
  let cat2 = '護持会費';
  let defaultAmount2: number | '' = '';
  if (toba1 && tFee1) {
    notes2 = tFee1;
    cat2 = templeInfo?.feeType1Category || resolveCategoryForFeeItem(tFee1, templeInfo);
    defaultAmount2 = templeInfo?.feeType1DefaultAmount ?? 5000;
  } else if (tFee2) {
    notes2 = tFee2;
    cat2 = templeInfo?.feeType2Category || resolveCategoryForFeeItem(tFee2, templeInfo);
    defaultAmount2 = templeInfo?.feeType2DefaultAmount ?? 3000;
  }

  // 項目3
  let notes3 = '';
  let cat3 = '特別寄付';
  let defaultAmount3: number | '' = '';
  if (toba1 && tFee1 && tFee2) {
    notes3 = tFee2;
    cat3 = templeInfo?.feeType2Category || resolveCategoryForFeeItem(tFee2, templeInfo);
    defaultAmount3 = templeInfo?.feeType2DefaultAmount ?? 3000;
  } else if (tFee3) {
    notes3 = tFee3;
    cat3 = templeInfo?.feeType3Category || resolveCategoryForFeeItem(tFee3, templeInfo);
    defaultAmount3 = templeInfo?.feeType3DefaultAmount ?? '';
  }

  return {
    id: `config-${templeInfo?.id || 'temple-main'}`,
    configDate: todayEra,
    cat1,
    notes1,
    defaultAmount1,
    cat2,
    notes2,
    defaultAmount2,
    cat3,
    notes3,
    defaultAmount3,
    appliedPreset: 'default',
    templeId: templeInfo?.id || 'temple-main',
    lastSavedAt: new Date().toISOString(),
  };
}

/**
 * 寺院設定に基づくデフォルトの一括会計受付データを生成
 */
export function getDefaultBatchAccountingData(templeInfo?: TempleInfo): BatchAccountingData {
  const config = getDefaultBatchAccountingConfig(templeInfo);
  return {
    ...config,
    entries: {},
  };
}

/**
 * 保存された一括会計設定（Config）をローカルストレージから取得
 */
export function getSavedBatchAccountingConfig(templeId?: string): BatchAccountingConfig | null {
  try {
    const raw = loadJsonState<BatchAccountingConfig | Record<string, BatchAccountingConfig> | null>(STORAGE_KEY_BATCH_ACCOUNTING_CONFIG, null);
    if (raw && typeof raw === 'object') {
      if ('configDate' in raw && 'cat1' in raw) {
        return raw as BatchAccountingConfig;
      }
      if (templeId && (raw as Record<string, BatchAccountingConfig>)[templeId]) {
        return (raw as Record<string, BatchAccountingConfig>)[templeId];
      }
      const firstKey = Object.keys(raw)[0];
      if (firstKey && (raw as Record<string, BatchAccountingConfig>)[firstKey]) {
        return (raw as Record<string, BatchAccountingConfig>)[firstKey];
      }
    }

    // フォールバック: 旧来の STORAGE_KEY_BATCH_ACCOUNTING から設定情報のみを抽出
    const oldData = getSavedBatchAccountingData(templeId);
    if (oldData) {
      return {
        id: `config-${oldData.templeId || templeId || 'temple-main'}`,
        configDate: oldData.configDate,
        cat1: oldData.cat1,
        notes1: oldData.notes1,
        defaultAmount1: oldData.defaultAmount1,
        cat2: oldData.cat2,
        notes2: oldData.notes2,
        defaultAmount2: oldData.defaultAmount2,
        cat3: oldData.cat3,
        notes3: oldData.notes3,
        defaultAmount3: oldData.defaultAmount3,
        appliedPreset: oldData.appliedPreset,
        templeId: oldData.templeId,
        lastSavedAt: oldData.lastSavedAt,
      };
    }
    return null;
  } catch (err) {
    console.warn('Error loading batch accounting config:', err);
    return null;
  }
}

/**
 * 一括会計設定（Config）を保存
 */
export function saveBatchAccountingConfig(config: BatchAccountingConfig): void {
  try {
    const updatedConfig: BatchAccountingConfig = {
      ...config,
      lastSavedAt: new Date().toISOString(),
    };
    saveJsonState(STORAGE_KEY_BATCH_ACCOUNTING_CONFIG, updatedConfig);
  } catch (err) {
    console.warn('Error saving batch accounting config:', err);
  }
}

/**
 * 保存された一括会計データをローカルストレージから取得
 */
export function getSavedBatchAccountingData(templeId?: string): BatchAccountingData | null {
  try {
    const raw = loadJsonState<BatchAccountingData | Record<string, BatchAccountingData> | null>(STORAGE_KEY_BATCH_ACCOUNTING, null);
    if (!raw) return null;

    let foundData: BatchAccountingData | null = null;
    if (raw && typeof raw === 'object') {
      if ('configDate' in raw && 'entries' in raw) {
        foundData = raw as BatchAccountingData;
      } else if (templeId && (raw as Record<string, BatchAccountingData>)[templeId]) {
        foundData = (raw as Record<string, BatchAccountingData>)[templeId];
      } else {
        const firstKey = Object.keys(raw)[0];
        if (firstKey && (raw as Record<string, BatchAccountingData>)[firstKey]) {
          foundData = (raw as Record<string, BatchAccountingData>)[firstKey];
        }
      }
    }

    if (foundData) {
      // 保存済みの一括会計設定（Config）があれば最新の設定値でマージ
      const savedConfig = getSavedBatchAccountingConfig(templeId || foundData.templeId);
      if (savedConfig) {
        return {
          ...foundData,
          configDate: savedConfig.configDate || foundData.configDate,
          cat1: savedConfig.cat1 || foundData.cat1,
          notes1: savedConfig.notes1 !== undefined ? savedConfig.notes1 : foundData.notes1,
          defaultAmount1: savedConfig.defaultAmount1 !== undefined ? savedConfig.defaultAmount1 : foundData.defaultAmount1,
          cat2: savedConfig.cat2 || foundData.cat2,
          notes2: savedConfig.notes2 !== undefined ? savedConfig.notes2 : foundData.notes2,
          defaultAmount2: savedConfig.defaultAmount2 !== undefined ? savedConfig.defaultAmount2 : foundData.defaultAmount2,
          cat3: savedConfig.cat3 || foundData.cat3,
          notes3: savedConfig.notes3 !== undefined ? savedConfig.notes3 : foundData.notes3,
          defaultAmount3: savedConfig.defaultAmount3 !== undefined ? savedConfig.defaultAmount3 : foundData.defaultAmount3,
          appliedPreset: savedConfig.appliedPreset || foundData.appliedPreset,
        };
      }
      return foundData;
    }
    return null;
  } catch (err) {
    console.warn('Error loading batch accounting data:', err);
    return null;
  }
}

/**
 * 一括会計データを保存（設定テーブルと明細テーブルの両方を永続化）
 */
export function saveBatchAccountingData(data: BatchAccountingData): void {
  try {
    const lastSavedAt = new Date().toISOString();
    const updatedData: BatchAccountingData = {
      ...data,
      lastSavedAt,
    };
    saveJsonState(STORAGE_KEY_BATCH_ACCOUNTING, updatedData);

    // 設定情報も専用キーに独立して永続化
    const configToSave: BatchAccountingConfig = {
      id: `config-${data.templeId || 'temple-main'}`,
      configDate: data.configDate,
      cat1: data.cat1,
      notes1: data.notes1,
      defaultAmount1: data.defaultAmount1,
      cat2: data.cat2,
      notes2: data.notes2,
      defaultAmount2: data.defaultAmount2,
      cat3: data.cat3,
      notes3: data.notes3,
      defaultAmount3: data.defaultAmount3,
      appliedPreset: data.appliedPreset,
      templeId: data.templeId,
      lastSavedAt,
    };
    saveBatchAccountingConfig(configToSave);
  } catch (err) {
    console.warn('Error saving batch accounting data:', err);
  }
}

/**
 * 一括会計データをクリア
 */
export function clearBatchAccountingData(templeId?: string): void {
  try {
    if (templeId) {
      const raw = loadJsonState<any>(STORAGE_KEY_BATCH_ACCOUNTING, null);
      if (raw && typeof raw === 'object' && !('configDate' in raw) && raw[templeId]) {
        const next = { ...raw };
        delete next[templeId];
        saveJsonState(STORAGE_KEY_BATCH_ACCOUNTING, next);
        return;
      }
    }
    safeStorage.removeItem(STORAGE_KEY_BATCH_ACCOUNTING);
  } catch (err) {
    console.warn('Error clearing batch accounting data:', err);
  }
}

/**
 * 一括会計の世帯入力（チェック・金額）のみをクリアし、受付設定は保持
 */
export function clearBatchAccountingEntries(templeId?: string): void {
  try {
    const saved = getSavedBatchAccountingData(templeId);
    if (saved) {
      const updated: BatchAccountingData = {
        ...saved,
        entries: {},
        lastSavedAt: new Date().toISOString(),
      };
      saveJsonState(STORAGE_KEY_BATCH_ACCOUNTING, updated);
    }
  } catch (err) {
    console.warn('Error clearing batch accounting entries:', err);
  }
}

/**
 * 【一括会計設定】テーブル用ヘッダー定義（独立した設定用シート）
 */
export const BATCH_ACCOUNTING_CONFIG_SHEET_HEADERS = [
  '設定ID',
  '所属寺院',
  '受付日付',
  '項目１勘定科目',
  '項目１摘要',
  '項目１基準金額',
  '項目２勘定科目',
  '項目２摘要',
  '項目２基準金額',
  '項目３勘定科目',
  '項目３摘要',
  '項目３基準金額',
  '適用プリセット',
  '最終更新日時',
  '所属寺院ID',
];

/**
 * 一括会計設定を行データ（2次元配列）に変換
 */
export function convertBatchAccountingConfigToRows(
  config: BatchAccountingConfig | undefined,
  allTemples: TempleProfile[] = []
): { headers: string[]; rows: (string | number)[][] } {
  const templeMap = new Map<string, TempleProfile>();
  allTemples.forEach((t) => {
    if (t.id) templeMap.set(t.id, t);
  });

  const getTempleLabel = (tId?: string): string => {
    const id = tId || allTemples[0]?.id || 'temple-main';
    const found = templeMap.get(id);
    if (!found) {
      const foundByName = allTemples.find(
        (t) => t.id === id || t.name === id || (t.mountainName && `${t.mountainName} ${t.name}` === id)
      );
      if (foundByName) {
        return `${foundByName.mountainName ? foundByName.mountainName + ' ' : ''}${foundByName.name}（${foundByName.isMain ? '本寺' : '兼務'}）`;
      }
      return allTemples[0]?.name || '本寺';
    }
    return `${found.mountainName ? found.mountainName + ' ' : ''}${found.name}（${found.isMain ? '本寺' : '兼務'}）`;
  };

  const getTempleId = (tId?: string): string => {
    if (!tId) {
      const mainT = allTemples.find((t) => t.isMain);
      return mainT?.id || allTemples[0]?.id || 'temple-main';
    }
    return tId;
  };

  const targetTempleId = config?.templeId || getTempleId();
  const configDate = config?.configDate || formatJapaneseEraDate(new Date().toISOString().slice(0, 10), false);
  const cat1 = config?.cat1 || '法要布施';
  const notes1 = config?.notes1 !== undefined ? config.notes1 : '';
  const defAmt1 = config?.defaultAmount1 !== undefined && config?.defaultAmount1 !== '' ? Number(config.defaultAmount1) : '';
  
  const cat2 = config?.cat2 || '護持会費';
  const notes2 = config?.notes2 !== undefined ? config.notes2 : '';
  const defAmt2 = config?.defaultAmount2 !== undefined && config?.defaultAmount2 !== '' ? Number(config.defaultAmount2) : '';

  const cat3 = config?.cat3 || '特別寄付';
  const notes3 = config?.notes3 !== undefined ? config.notes3 : '';
  const defAmt3 = config?.defaultAmount3 !== undefined && config?.defaultAmount3 !== '' ? Number(config.defaultAmount3) : '';

  const appliedPreset = config?.appliedPreset || 'default';
  const savedAt = config?.lastSavedAt || new Date().toLocaleString('ja-JP');

  const rows: (string | number)[][] = [
    [
      config?.id || `config-${targetTempleId}`,
      getTempleLabel(targetTempleId),
      configDate,
      cat1,
      notes1,
      defAmt1,
      cat2,
      notes2,
      defAmt2,
      cat3,
      notes3,
      defAmt3,
      appliedPreset,
      savedAt,
      targetTempleId,
    ],
  ];

  return {
    headers: BATCH_ACCOUNTING_CONFIG_SHEET_HEADERS,
    rows,
  };
}

/**
 * インポートされた一括会計設定行データから BatchAccountingConfig を復元
 */
export function parseBatchAccountingConfigFromRows(rows: any[][]): BatchAccountingConfig | null {
  if (!rows || rows.length < 2) return null;

  const headerRow = rows[0].map((h: any) => String(h || '').trim().replace(/[\s\r\n_（）()【】\[\]/・\-]/g, ''));
  
  const findCol = (aliases: string[]): number => {
    for (const alias of aliases) {
      const cleanAlias = alias.replace(/[\s\r\n_（）()【】\[\]/・\-]/g, '');
      const idx = headerRow.findIndex((h: string) => h === cleanAlias || h.includes(cleanAlias));
      if (idx !== -1) return idx;
    }
    return -1;
  };

  const idCol = findCol(['設定ID', 'ID', 'configId', 'id']);
  const dateCol = findCol(['受付日付', '日付', 'date', 'configDate']);
  
  const cat1Col = findCol(['項目1勘定科目', '項目１勘定科目', '科目1', 'cat1']);
  const notes1Col = findCol(['項目1摘要', '項目１摘要', '摘要1', 'notes1']);
  const defAmt1Col = findCol(['項目1基準金額', '項目１基準金額', '基準金額1', 'defaultAmount1']);

  const cat2Col = findCol(['項目2勘定科目', '項目２勘定科目', '科目2', 'cat2']);
  const notes2Col = findCol(['項目2摘要', '項目２摘要', '摘要2', 'notes2']);
  const defAmt2Col = findCol(['項目2基準金額', '項目２基準金額', '基準金額2', 'defaultAmount2']);

  const cat3Col = findCol(['項目3勘定科目', '項目３勘定科目', '科目3', 'cat3']);
  const notes3Col = findCol(['項目3摘要', '項目３摘要', '摘要3', 'notes3']);
  const defAmt3Col = findCol(['項目3基準金額', '項目３基準金額', '基準金額3', 'defaultAmount3']);

  const presetCol = findCol(['適用プリセット', 'プリセット', 'preset']);
  const templeIdCol = findCol(['所属寺院ID', '寺院ID', 'templeId']);
  const savedAtCol = findCol(['最終更新日時', '更新日時', 'savedAt']);

  const parseNum = (val: any): number | '' => {
    if (val === '' || val === null || val === undefined) return '';
    const n = Number(String(val).replace(/[,¥円\s]/g, ''));
    return isNaN(n) ? '' : n;
  };

  // 1行目のデータ行を取得
  const row = rows[1];
  if (!row || row.length === 0) return null;

  return {
    id: idCol !== -1 ? String(row[idCol] || '').trim() : undefined,
    configDate: dateCol !== -1 && row[dateCol] ? String(row[dateCol]).trim() : formatJapaneseEraDate(new Date().toISOString().slice(0, 10), false),
    cat1: cat1Col !== -1 && row[cat1Col] ? String(row[cat1Col]).trim() : '法要布施',
    notes1: notes1Col !== -1 && row[notes1Col] !== undefined ? String(row[notes1Col]).trim() : '',
    defaultAmount1: defAmt1Col !== -1 ? parseNum(row[defAmt1Col]) : '',
    cat2: cat2Col !== -1 && row[cat2Col] ? String(row[cat2Col]).trim() : '護持会費',
    notes2: notes2Col !== -1 && row[notes2Col] !== undefined ? String(row[notes2Col]).trim() : '',
    defaultAmount2: defAmt2Col !== -1 ? parseNum(row[defAmt2Col]) : '',
    cat3: cat3Col !== -1 && row[cat3Col] ? String(row[cat3Col]).trim() : '特別寄付',
    notes3: notes3Col !== -1 && row[notes3Col] !== undefined ? String(row[notes3Col]).trim() : '',
    defaultAmount3: defAmt3Col !== -1 ? parseNum(row[defAmt3Col]) : '',
    appliedPreset: presetCol !== -1 && row[presetCol] ? String(row[presetCol]).trim() : 'default',
    templeId: templeIdCol !== -1 && row[templeIdCol] ? String(row[templeIdCol]).trim() : 'temple-main',
    lastSavedAt: savedAtCol !== -1 && row[savedAtCol] ? String(row[savedAtCol]).trim() : new Date().toISOString(),
  };
}

/**
 * 【一括会計受付】テーブル用ヘッダー定義（個別世帯の受付入力明細シート）
 */
export const BATCH_ACCOUNTING_SHEET_HEADERS = [
  '世帯ID',
  '所属寺院',
  '世帯主名',
  '受付日付',
  '項目１チェック',
  '項目１金額',
  '項目２チェック',
  '項目２金額',
  '項目３チェック',
  '項目３金額',
  '世帯合計金額',
  '備考',
  '最終更新日時',
  '所属寺院ID',
];

/**
 * 一括会計受付明細データをエクスポート用行データ（2次元配列）に変換
 * 入力・チェックがある檀家のみを抽出して出力（不要な全件コピーの肥大化を防止）
 */
export function convertBatchAccountingToRows(
  batchData: BatchAccountingData | undefined,
  households: Household[],
  allTemples: TempleProfile[] = []
): { headers: string[]; rows: (string | number)[][] } {
  const templeMap = new Map<string, TempleProfile>();
  allTemples.forEach((t) => {
    if (t.id) templeMap.set(t.id, t);
  });

  const getTempleLabel = (tId?: string): string => {
    const id = tId || allTemples[0]?.id || 'temple-main';
    const found = templeMap.get(id);
    if (!found) {
      const foundByName = allTemples.find(
        (t) => t.id === id || t.name === id || (t.mountainName && `${t.mountainName} ${t.name}` === id)
      );
      if (foundByName) {
        return `${foundByName.mountainName ? foundByName.mountainName + ' ' : ''}${foundByName.name}（${foundByName.isMain ? '本寺' : '兼務'}）`;
      }
      return allTemples[0]?.name || '本寺';
    }
    return `${found.mountainName ? found.mountainName + ' ' : ''}${found.name}（${found.isMain ? '本寺' : '兼務'}）`;
  };

  const getTempleId = (tId?: string): string => {
    if (!tId) {
      const mainT = allTemples.find((t) => t.isMain);
      return mainT?.id || allTemples[0]?.id || 'temple-main';
    }
    return tId;
  };

  const configDate = batchData?.configDate || formatJapaneseEraDate(new Date().toISOString().slice(0, 10), false);
  const savedAt = batchData?.lastSavedAt || new Date().toLocaleString('ja-JP');
  const targetTempleId = batchData?.templeId || getTempleId();
  const entries = batchData?.entries || {};

  // 入力（チェックまたは金額）がある世帯のみを抽出
  const enteredHouseholdMap = new Map<string, HouseholdBatchEntry>();
  Object.entries(entries).forEach(([hId, entry]) => {
    if (!entry) return;
    const hasCheck = Boolean(entry.check1 || entry.check2 || entry.check3);
    const hasAmount = (entry.amount1 !== '' && entry.amount1 !== undefined && entry.amount1 !== 0) ||
                      (entry.amount2 !== '' && entry.amount2 !== undefined && entry.amount2 !== 0) ||
                      (entry.amount3 !== '' && entry.amount3 !== undefined && entry.amount3 !== 0);
    if (hasCheck || hasAmount) {
      enteredHouseholdMap.set(hId, entry);
    }
  });

  const rows: (string | number)[][] = [];

  if (enteredHouseholdMap.size > 0) {
    const householdMap = new Map<string, Household>();
    households.forEach((h) => householdMap.set(h.id, h));

    const enteredHouseholds: { id: string; household?: Household; entry: HouseholdBatchEntry }[] = [];
    enteredHouseholdMap.forEach((entry, hId) => {
      enteredHouseholds.push({
        id: hId,
        household: householdMap.get(hId),
        entry,
      });
    });

    // 読み仮名・世帯主名でソート
    enteredHouseholds.sort((a, b) => {
      const furiganaA = (a.household?.furigana || a.household?.familyHead || a.id).trim();
      const furiganaB = (b.household?.furigana || b.household?.familyHead || b.id).trim();
      return furiganaA.localeCompare(furiganaB, 'ja');
    });

    enteredHouseholds.forEach(({ id, household, entry }) => {
      const hTempleId = household?.templeId || targetTempleId;
      const familyHead = household?.familyHead || '';
      
      const check1 = entry.check1 ? '済' : '未';
      const amount1 = entry.check1 && typeof entry.amount1 === 'number' ? entry.amount1 : (entry.amount1 !== '' && entry.amount1 !== undefined ? Number(entry.amount1) : '');
      
      const check2 = entry.check2 ? '済' : '未';
      const amount2 = entry.check2 && typeof entry.amount2 === 'number' ? entry.amount2 : (entry.amount2 !== '' && entry.amount2 !== undefined ? Number(entry.amount2) : '');

      const check3 = entry.check3 ? '済' : '未';
      const amount3 = entry.check3 && typeof entry.amount3 === 'number' ? entry.amount3 : (entry.amount3 !== '' && entry.amount3 !== undefined ? Number(entry.amount3) : '');

      const total = (typeof amount1 === 'number' ? amount1 : 0) + 
                    (typeof amount2 === 'number' ? amount2 : 0) + 
                    (typeof amount3 === 'number' ? amount3 : 0);

      rows.push([
        id,
        getTempleLabel(hTempleId),
        familyHead,
        configDate,
        check1,
        amount1,
        check2,
        amount2,
        check3,
        amount3,
        total > 0 ? total : '',
        entry.notes || '',
        savedAt,
        getTempleId(hTempleId),
      ]);
    });
  }

  return {
    headers: BATCH_ACCOUNTING_SHEET_HEADERS,
    rows,
  };
}

/**
 * インポートされた行データ（2次元配列）から BatchAccountingData を復元
 * 旧フォーマット（設定＋明細混合）および新フォーマット（明細のみ）の両方に対応
 */
export function parseBatchAccountingFromRows(
  rows: any[][],
  households: Household[] = []
): BatchAccountingData | null {
  if (!rows || rows.length < 2) return null;

  const headerRow = rows[0].map((h: any) => String(h || '').trim().replace(/[\s\r\n_（）()【】\[\]/・\-]/g, ''));
  
  const findCol = (aliases: string[]): number => {
    for (const alias of aliases) {
      const cleanAlias = alias.replace(/[\s\r\n_（）()【】\[\]/・\-]/g, '');
      const idx = headerRow.findIndex((h: string) => h === cleanAlias || h.includes(cleanAlias));
      if (idx !== -1) return idx;
    }
    return -1;
  };

  const idCol = findCol(['世帯ID', '檀家ID', 'ID', 'householdId']);
  const dateCol = findCol(['受付日付', '日付', 'date', 'configDate']);
  
  const chk1Col = findCol(['項目1チェック', '項目１チェック', 'チェック1', 'check1']);
  const cat1Col = findCol(['項目1勘定科目', '項目１勘定科目', '科目1', 'cat1']);
  const notes1Col = findCol(['項目1摘要', '項目１摘要', '摘要1', 'notes1']);
  const defAmt1Col = findCol(['項目1基準金額', '項目１基準金額', '基準金額1', '初期金額1', 'defaultAmount1']);
  const amt1Col = findCol(['項目1金額', '項目１金額', '金額1', 'amount1']);

  const chk2Col = findCol(['項目2チェック', '項目２チェック', 'チェック2', 'check2']);
  const cat2Col = findCol(['項目2勘定科目', '項目２勘定科目', '科目2', 'cat2']);
  const notes2Col = findCol(['項目2摘要', '項目２摘要', '摘要2', 'notes2']);
  const defAmt2Col = findCol(['項目2基準金額', '項目２基準金額', '基準金額2', '初期金額2', 'defaultAmount2']);
  const amt2Col = findCol(['項目2金額', '項目２金額', '金額2', 'amount2']);

  const chk3Col = findCol(['項目3チェック', '項目３チェック', 'チェック3', 'check3']);
  const cat3Col = findCol(['項目3勘定科目', '項目３勘定科目', '科目3', 'cat3']);
  const notes3Col = findCol(['項目3摘要', '項目３摘要', '摘要3', 'notes3']);
  const defAmt3Col = findCol(['項目3基準金額', '項目３基準金額', '基準金額3', '初期金額3', 'defaultAmount3']);
  const amt3Col = findCol(['項目3金額', '項目３金額', '金額3', 'amount3']);

  const notesCol = findCol(['備考', 'メモ', '特記', 'notes']);
  const presetCol = findCol(['適用プリセット', 'プリセット', 'preset']);
  const templeIdCol = findCol(['所属寺院ID', '寺院ID', 'templeId']);
  const savedAtCol = findCol(['最終更新日時', '更新日時', 'savedAt']);

  let detectedConfigDate = '';
  let detectedCat1 = '';
  let detectedNotes1 = '';
  let detectedDefaultAmt1: number | '' = '';
  let detectedCat2 = '';
  let detectedNotes2 = '';
  let detectedDefaultAmt2: number | '' = '';
  let detectedCat3 = '';
  let detectedNotes3 = '';
  let detectedDefaultAmt3: number | '' = '';
  let detectedPreset = 'default';
  let detectedTempleId = 'temple-main';
  let detectedSavedAt = '';

  const parseCheck = (val: any): boolean => {
    if (val === true || val === 1 || val === '1') return true;
    const s = String(val || '').trim().toLowerCase();
    return s === '済' || s === 'true' || s === 'yes' || s === '〇' || s === '○' || s === 'v' || s === 'checked';
  };

  const parseNum = (val: any): number | '' => {
    if (val === '' || val === null || val === undefined) return '';
    const n = Number(String(val).replace(/[,¥円\s]/g, ''));
    return isNaN(n) ? '' : n;
  };

  const entries: Record<string, HouseholdBatchEntry> = {};

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    const rawId = idCol !== -1 ? String(row[idCol] || '').trim() : '';
    if (!rawId) continue;

    // 設定情報の検出 (旧フォーマット互換)
    if (dateCol !== -1 && row[dateCol] && !detectedConfigDate) {
      detectedConfigDate = String(row[dateCol]).trim();
    }
    if (cat1Col !== -1 && row[cat1Col] && !detectedCat1) detectedCat1 = String(row[cat1Col]).trim();
    if (notes1Col !== -1 && row[notes1Col] && !detectedNotes1) detectedNotes1 = String(row[notes1Col]).trim();
    if (defAmt1Col !== -1 && row[defAmt1Col] !== undefined && row[defAmt1Col] !== '' && detectedDefaultAmt1 === '') {
      detectedDefaultAmt1 = parseNum(row[defAmt1Col]);
    }

    if (cat2Col !== -1 && row[cat2Col] && !detectedCat2) detectedCat2 = String(row[cat2Col]).trim();
    if (notes2Col !== -1 && row[notes2Col] && !detectedNotes2) detectedNotes2 = String(row[notes2Col]).trim();
    if (defAmt2Col !== -1 && row[defAmt2Col] !== undefined && row[defAmt2Col] !== '' && detectedDefaultAmt2 === '') {
      detectedDefaultAmt2 = parseNum(row[defAmt2Col]);
    }

    if (cat3Col !== -1 && row[cat3Col] && !detectedCat3) detectedCat3 = String(row[cat3Col]).trim();
    if (notes3Col !== -1 && row[notes3Col] && !detectedNotes3) detectedNotes3 = String(row[notes3Col]).trim();
    if (defAmt3Col !== -1 && row[defAmt3Col] !== undefined && row[defAmt3Col] !== '' && detectedDefaultAmt3 === '') {
      detectedDefaultAmt3 = parseNum(row[defAmt3Col]);
    }

    if (presetCol !== -1 && row[presetCol] && detectedPreset === 'default') detectedPreset = String(row[presetCol]).trim();
    if (templeIdCol !== -1 && row[templeIdCol] && detectedTempleId === 'temple-main') detectedTempleId = String(row[templeIdCol]).trim();
    if (savedAtCol !== -1 && row[savedAtCol] && !detectedSavedAt) detectedSavedAt = String(row[savedAtCol]).trim();

    // メタデータ設定専用行の場合は世帯データとして登録しない
    if (rawId === '_CONFIG_' || rawId.startsWith('[') || rawId.toLowerCase() === 'config') {
      continue;
    }

    const c1 = chk1Col !== -1 ? parseCheck(row[chk1Col]) : false;
    const a1 = amt1Col !== -1 ? parseNum(row[amt1Col]) : '';

    const c2 = chk2Col !== -1 ? parseCheck(row[chk2Col]) : false;
    const a2 = amt2Col !== -1 ? parseNum(row[amt2Col]) : '';

    const c3 = chk3Col !== -1 ? parseCheck(row[chk3Col]) : false;
    const a3 = amt3Col !== -1 ? parseNum(row[amt3Col]) : '';
    const note = notesCol !== -1 ? String(row[notesCol] || '').trim() : undefined;

    if (c1 || a1 !== '' || c2 || a2 !== '' || c3 || a3 !== '') {
      entries[rawId] = {
        householdId: rawId,
        check1: c1 || a1 !== '',
        amount1: a1,
        check2: c2 || a2 !== '',
        amount2: a2,
        check3: c3 || a3 !== '',
        amount3: a3,
        notes: note,
        updatedAt: new Date().toISOString(),
      };
    }
  }

  // 保存済みの専用設定テーブルがある場合はそちらを優先適用
  const savedConfig = getSavedBatchAccountingConfig(detectedTempleId);

  return {
    id: savedConfig?.id || `config-${detectedTempleId}`,
    configDate: savedConfig?.configDate || detectedConfigDate || formatJapaneseEraDate(new Date().toISOString().slice(0, 10), false),
    cat1: savedConfig?.cat1 || detectedCat1 || '法要布施',
    notes1: savedConfig?.notes1 !== undefined ? savedConfig.notes1 : (detectedNotes1 !== undefined ? detectedNotes1 : ''),
    defaultAmount1: savedConfig?.defaultAmount1 !== undefined ? savedConfig.defaultAmount1 : (detectedDefaultAmt1 !== '' ? detectedDefaultAmt1 : ''),
    cat2: savedConfig?.cat2 || detectedCat2 || '護持会費',
    notes2: savedConfig?.notes2 !== undefined ? savedConfig.notes2 : (detectedNotes2 !== undefined ? detectedNotes2 : ''),
    defaultAmount2: savedConfig?.defaultAmount2 !== undefined ? savedConfig.defaultAmount2 : (detectedDefaultAmt2 !== '' ? detectedDefaultAmt2 : ''),
    cat3: savedConfig?.cat3 || detectedCat3 || '特別寄付',
    notes3: savedConfig?.notes3 !== undefined ? savedConfig.notes3 : (detectedNotes3 !== undefined ? detectedNotes3 : ''),
    defaultAmount3: savedConfig?.defaultAmount3 !== undefined ? savedConfig.defaultAmount3 : (detectedDefaultAmt3 !== '' ? detectedDefaultAmt3 : ''),
    appliedPreset: savedConfig?.appliedPreset || detectedPreset || 'default',
    entries,
    templeId: detectedTempleId || 'temple-main',
    lastSavedAt: detectedSavedAt || new Date().toISOString(),
  };
}

/**
 * 一括会計設定シートと受付明細シートの両方から統合された BatchAccountingData を再構築
 */
export function reconstructBatchAccountingData(
  configRows?: any[][],
  receptionRows?: any[][],
  households: Household[] = [],
  templeInfo?: TempleInfo
): BatchAccountingData | null {
  const parsedConfig = configRows && configRows.length >= 2 ? parseBatchAccountingConfigFromRows(configRows) : null;
  const parsedReception = receptionRows && receptionRows.length >= 2 ? parseBatchAccountingFromRows(receptionRows, households) : null;

  if (!parsedConfig && !parsedReception) {
    return null;
  }

  const baseConfig = parsedConfig || getSavedBatchAccountingConfig(templeInfo?.id) || getDefaultBatchAccountingConfig(templeInfo);
  const entries = parsedReception?.entries || {};

  return {
    ...baseConfig,
    entries,
    lastSavedAt: parsedReception?.lastSavedAt || baseConfig.lastSavedAt || new Date().toISOString(),
  };
}
