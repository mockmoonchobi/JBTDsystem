import { Household, FamilyMember, MasterOptions, TempleProfile } from '../types';

export interface FeeSlotDef {
  slot: 1 | 2 | 3;
  fieldAmount: 'fee1Amount' | 'fee2Amount' | 'fee3Amount';
  label: string; // '集金１', '集金２', '集金３'
  name: string;  // 実際の名称 (例: '護寺会費', '墓地管理費')
}

/**
 * 寺院情報に設定されている有効な集金スロット（1〜3）を取得します。
 * 空欄・未設定のスロットは除外されます。
 * 一つも設定されていない場合は空配列 [] を返します。
 */
export function getFeeSlots(templeInfo?: Partial<TempleProfile> | null): FeeSlotDef[] {
  const slots: FeeSlotDef[] = [];

  // 集金項目１ (任意)
  const name1 = (templeInfo?.feeType1 || '').trim();
  if (name1) {
    slots.push({
      slot: 1,
      fieldAmount: 'fee1Amount',
      label: '集金１',
      name: name1,
    });
  }

  // 集金項目２ (任意)
  const name2 = (templeInfo?.feeType2 || '').trim();
  if (name2) {
    slots.push({
      slot: 2,
      fieldAmount: 'fee2Amount',
      label: '集金２',
      name: name2,
    });
  }

  // 集金項目３ (任意)
  const name3 = (templeInfo?.feeType3 || '').trim();
  if (name3) {
    slots.push({
      slot: 3,
      fieldAmount: 'fee3Amount',
      label: '集金３',
      name: name3,
    });
  }

  return slots;
}

/**
 * 寺院情報またはマスタから有効な集金項目名称の配列を取得します。
 */
export function getEffectiveFeeTypes(
  templeOrOptions?: Partial<TempleProfile> | MasterOptions | null,
  fallbackOptions?: MasterOptions
): string[] {
  if (!templeOrOptions) return [];

  // TempleProfile の場合
  if ('feeType1' in templeOrOptions || 'feeType2' in templeOrOptions || 'feeType3' in templeOrOptions || 'sect' in templeOrOptions || 'mountainName' in templeOrOptions) {
    const slots = getFeeSlots(templeOrOptions as Partial<TempleProfile>);
    return slots.map((s) => s.name);
  }

  // MasterOptions のフォールバック
  const master = (templeOrOptions as MasterOptions) || fallbackOptions;
  if (master?.feeTypes && master.feeTypes.length > 0) {
    return master.feeTypes.filter((t) => t && t.trim() !== '');
  }

  return [];
}

/**
 * 集金項目名（またはスロット文字列）がどのスロット（1, 2, 3）に該当するか判定します。
 */
export function matchFeeSlot(
  feeType: string | number,
  templeInfo?: Partial<TempleProfile> | null
): 1 | 2 | 3 | null {
  if (typeof feeType === 'number') {
    if (feeType === 1 || feeType === 2 || feeType === 3) return feeType;
    return null;
  }

  const name1 = (templeInfo?.feeType1 || '').trim();
  const name2 = (templeInfo?.feeType2 || '').trim();
  const name3 = (templeInfo?.feeType3 || '').trim();

  if (feeType === '1' || feeType === '集金１' || feeType === '集金1' || (name1 && feeType === name1)) {
    return 1;
  }
  if (feeType === '2' || feeType === '集金２' || feeType === '集金2' || (name2 && feeType === name2)) {
    return 2;
  }
  if (feeType === '3' || feeType === '集金３' || feeType === '集金3' || (name3 && feeType === name3)) {
    return 3;
  }
  return null;
}

/**
 * 世帯から特定の集金スロットまたは集金名に該当する金額を取得します。
 */
export function getHouseholdFeeAmount(
  household?: Partial<Household> | null,
  feeTypeOrSlot: string | number = 1,
  templeInfo?: Partial<TempleProfile> | null
): number | undefined {
  if (!household) return undefined;

  const slot = matchFeeSlot(feeTypeOrSlot, templeInfo);
  if (slot === 1) {
    if (household.fee1Amount !== undefined) return household.fee1Amount;
    if (household.fee1 !== undefined && household.fee1 !== '') {
      const num = Number(household.fee1);
      return !isNaN(num) ? num : undefined;
    }
  } else if (slot === 2) {
    if (household.fee2Amount !== undefined) return household.fee2Amount;
    if (household.fee2 !== undefined && household.fee2 !== '') {
      const num = Number(household.fee2);
      return !isNaN(num) ? num : undefined;
    }
  } else if (slot === 3) {
    if (household.fee3Amount !== undefined) return household.fee3Amount;
    if (household.fee3 !== undefined && household.fee3 !== '') {
      const num = Number(household.fee3);
      return !isNaN(num) ? num : undefined;
    }
  }

  return undefined;
}

/**
 * 世帯に特定の集金スロットの金額を設定した新しい Household オブジェクトを返します。
 */
export function setHouseholdFeeAmount(
  household: Household,
  feeTypeOrSlot: string | number,
  amount: number | string | undefined | null,
  templeInfo?: Partial<TempleProfile> | null
): Household {
  const slot = matchFeeSlot(feeTypeOrSlot, templeInfo);
  const parsedAmount = amount === undefined || amount === null || amount === '' 
    ? undefined 
    : typeof amount === 'number' 
      ? amount 
      : !isNaN(Number(amount)) 
        ? Number(amount) 
        : undefined;

  const updated = { ...household };

  if (slot === 1) {
    updated.fee1Amount = parsedAmount;
    updated.fee1 = parsedAmount;
  } else if (slot === 2) {
    updated.fee2Amount = parsedAmount;
    updated.fee2 = parsedAmount;
  } else if (slot === 3) {
    updated.fee3Amount = parsedAmount;
    updated.fee3 = parsedAmount;
  }

  return updated;
}

/**
 * 金額を日本円形式（例: ¥5,000）または「—」に整形します。
 */
export function formatFeeAmount(amount?: number | string | null): string {
  if (amount === undefined || amount === null || amount === '') return '—';
  const num = typeof amount === 'number' ? amount : Number(amount);
  if (isNaN(num)) return '—';
  return `¥${num.toLocaleString()}`;
}
