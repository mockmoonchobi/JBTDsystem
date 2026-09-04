import { Household, FamilyMember, MasterOptions, TobaApplicationItem, TempleProfile } from '../types';

export interface TobaSlotDef {
  slot: 1 | 2 | 3;
  fieldApplied: 'toba1Applied' | 'toba2Applied' | 'toba3Applied';
  fieldTamegaki: 'toba1Tamegaki' | 'toba2Tamegaki' | 'toba3Tamegaki';
  label: string; // '塔婆申込１', '塔婆申込２', '塔婆申込３'
  name: string;  // 実際の名称 (例: '施餓鬼塔婆', '彼岸塔婆')
}

export const DEFAULT_TOBA_TYPES = ['施餓鬼塔婆', '大塔婆', '小塔婆'];

/**
 * Returns configured toba slots (1 to 3) for the temple.
 * Slot 1 defaults to '施餓鬼塔婆'.
 * Slots with empty/blank names are omitted.
 */
export function getTobaSlots(templeInfo?: Partial<TempleProfile> | null): TobaSlotDef[] {
  const slots: TobaSlotDef[] = [];

  // 塔婆申込１ (デフォルト: '施餓鬼塔婆')
  const name1 = (templeInfo?.tobaType1 !== undefined ? templeInfo.tobaType1 : '施餓鬼塔婆').trim();
  if (name1) {
    slots.push({
      slot: 1,
      fieldApplied: 'toba1Applied',
      fieldTamegaki: 'toba1Tamegaki',
      label: '塔婆申込１',
      name: name1,
    });
  }

  // 塔婆申込２ (任意)
  const name2 = (templeInfo?.tobaType2 || '').trim();
  if (name2) {
    slots.push({
      slot: 2,
      fieldApplied: 'toba2Applied',
      fieldTamegaki: 'toba2Tamegaki',
      label: '塔婆申込２',
      name: name2,
    });
  }

  // 塔婆申込３ (任意)
  const name3 = (templeInfo?.tobaType3 || '').trim();
  if (name3) {
    slots.push({
      slot: 3,
      fieldApplied: 'toba3Applied',
      fieldTamegaki: 'toba3Tamegaki',
      label: '塔婆申込３',
      name: name3,
    });
  }

  // 万が一全て空の場合はスロット1をデフォルト「施餓鬼塔婆」として提供
  if (slots.length === 0) {
    slots.push({
      slot: 1,
      fieldApplied: 'toba1Applied',
      fieldTamegaki: 'toba1Tamegaki',
      label: '塔婆申込１',
      name: '施餓鬼塔婆',
    });
  }

  return slots;
}

/**
 * Returns the effective list of non-empty Toba application types configured for the temple.
 * Accepts templeInfo or masterOptions.
 */
export function getEffectiveTobaTypes(
  templeOrOptions?: Partial<TempleProfile> | MasterOptions | null,
  fallbackOptions?: MasterOptions
): string[] {
  if (!templeOrOptions) return ['施餓鬼塔婆'];

  // If it's a TempleProfile (contains tobaType1/2/3 or temple fields)
  if ('tobaType1' in templeOrOptions || 'tobaType2' in templeOrOptions || 'tobaType3' in templeOrOptions || 'sect' in templeOrOptions || 'mountainName' in templeOrOptions) {
    const slots = getTobaSlots(templeOrOptions as Partial<TempleProfile>);
    return slots.map((s) => s.name);
  }

  // Fallback for MasterOptions
  const master = (templeOrOptions as MasterOptions) || fallbackOptions;
  if (master?.tobaTypes && master.tobaTypes.length > 0) {
    const filtered = master.tobaTypes.filter((t) => t && t.trim() !== '');
    if (filtered.length > 0) return filtered;
  }

  return ['施餓鬼塔婆'];
}

/**
 * Matches a tobaType string against temple slots (slot 1, 2, or 3).
 */
export function matchTobaSlot(
  tobaType: string,
  templeInfo?: Partial<TempleProfile> | null
): 1 | 2 | 3 | null {
  const clean = (tobaType || '').trim();
  const name1 = (templeInfo?.tobaType1 !== undefined ? templeInfo.tobaType1 : '施餓鬼塔婆').trim();
  const name2 = (templeInfo?.tobaType2 || '').trim();
  const name3 = (templeInfo?.tobaType3 || '').trim();

  // Slot 1: Default toba / Segaki
  if (
    clean === '塔婆申込１' ||
    clean === '塔婆申込1' ||
    clean === '塔婆１' ||
    clean === '塔婆1' ||
    clean === '施餓鬼塔婆' ||
    clean === '施餓鬼' ||
    clean === '大施餓鬼会' ||
    (name1 && clean === name1)
  ) {
    return 1;
  }

  // Slot 2: Toba 2
  if (
    clean === '塔婆申込２' ||
    clean === '塔婆申込2' ||
    clean === '塔婆２' ||
    clean === '塔婆2' ||
    (name2 && clean === name2)
  ) {
    return 2;
  }

  // Slot 3: Toba 3
  if (
    clean === '塔婆申込３' ||
    clean === '塔婆申込3' ||
    clean === '塔婆３' ||
    clean === '塔婆3' ||
    (name3 && clean === name3)
  ) {
    return 3;
  }

  return null;
}

/**
 * Retrieves the Toba application status & tamegaki for a household (head).
 */
export function getHouseholdTobaApplication(
  household?: Partial<Household> | null,
  tobaType: string = '施餓鬼塔婆',
  templeInfo?: Partial<TempleProfile> | null
): TobaApplicationItem {
  if (!household) return { applied: false, tamegaki: '' };

  // 1. Direct check in tobaApplications map
  if (household.tobaApplications && household.tobaApplications[tobaType] !== undefined) {
    return {
      applied: Boolean(household.tobaApplications[tobaType]?.applied),
      tamegaki: household.tobaApplications[tobaType]?.tamegaki || '',
    };
  }

  // 2. Check by Slot matching
  const slot = matchTobaSlot(tobaType, templeInfo);
  if (slot === 1) {
    if (household.toba1Applied !== undefined || household.toba1Tamegaki !== undefined) {
      return {
        applied: Boolean(household.toba1Applied),
        tamegaki: household.toba1Tamegaki || '',
      };
    }
    // Backward compatibility fallback for isSegakiToba / segakiTamegaki
    return {
      applied: Boolean(household.isSegakiToba),
      tamegaki: household.segakiTamegaki || '',
    };
  }
  if (slot === 2) {
    return {
      applied: Boolean(household.toba2Applied),
      tamegaki: household.toba2Tamegaki || '',
    };
  }
  if (slot === 3) {
    return {
      applied: Boolean(household.toba3Applied),
      tamegaki: household.toba3Tamegaki || '',
    };
  }

  // 3. Fallback for 施餓鬼塔婆 legacy
  if (tobaType === '施餓鬼塔婆' || tobaType === '施餓鬼' || tobaType === '大施餓鬼会') {
    return {
      applied: Boolean(household.isSegakiToba || household.toba1Applied),
      tamegaki: household.segakiTamegaki || household.toba1Tamegaki || '',
    };
  }

  return { applied: false, tamegaki: '' };
}

/**
 * Retrieves the Toba application status & tamegaki for a family member.
 */
export function getFamilyMemberTobaApplication(
  member?: Partial<FamilyMember> | null,
  tobaType: string = '施餓鬼塔婆',
  templeInfo?: Partial<TempleProfile> | null
): TobaApplicationItem {
  if (!member) return { applied: false, tamegaki: '' };

  // 1. Direct check in tobaApplications map
  if (member.tobaApplications && member.tobaApplications[tobaType] !== undefined) {
    return {
      applied: Boolean(member.tobaApplications[tobaType]?.applied),
      tamegaki: member.tobaApplications[tobaType]?.tamegaki || '',
    };
  }

  // 2. Check by Slot matching
  const slot = matchTobaSlot(tobaType, templeInfo);
  if (slot === 1) {
    if (member.toba1Applied !== undefined || member.toba1Tamegaki !== undefined) {
      return {
        applied: Boolean(member.toba1Applied),
        tamegaki: member.toba1Tamegaki || '',
      };
    }
    // Backward compatibility fallback for isSegakiToba / segakiTamegaki
    return {
      applied: Boolean(member.isSegakiToba),
      tamegaki: member.segakiTamegaki || '',
    };
  }
  if (slot === 2) {
    return {
      applied: Boolean(member.toba2Applied),
      tamegaki: member.toba2Tamegaki || '',
    };
  }
  if (slot === 3) {
    return {
      applied: Boolean(member.toba3Applied),
      tamegaki: member.toba3Tamegaki || '',
    };
  }

  // 3. Fallback for 施餓鬼塔婆 legacy
  if (tobaType === '施餓鬼塔婆' || tobaType === '施餓鬼' || tobaType === '大施餓鬼会') {
    return {
      applied: Boolean(member.isSegakiToba || member.toba1Applied),
      tamegaki: member.segakiTamegaki || member.toba1Tamegaki || '',
    };
  }

  return { applied: false, tamegaki: '' };
}

/**
 * Immutably updates the Toba application status and tamegaki for a household.
 */
export function setHouseholdTobaApplication(
  household: Household,
  tobaType: string,
  appliedOrItem: boolean | { applied: boolean; tamegaki?: string },
  tamegaki?: string,
  templeInfo?: Partial<TempleProfile> | null
): Household {
  const cleanType = (tobaType || '').trim();
  const currentMap = { ...(household.tobaApplications || {}) };
  const currentApp = getHouseholdTobaApplication(household, cleanType, templeInfo);

  let isApplied: boolean;
  let nextTamegaki: string;

  if (typeof appliedOrItem === 'object' && appliedOrItem !== null) {
    isApplied = Boolean(appliedOrItem.applied);
    nextTamegaki = appliedOrItem.tamegaki !== undefined ? appliedOrItem.tamegaki : currentApp.tamegaki || '';
  } else {
    isApplied = Boolean(appliedOrItem);
    nextTamegaki = tamegaki !== undefined ? tamegaki : currentApp.tamegaki || '';
  }

  currentMap[cleanType] = {
    applied: isApplied,
    tamegaki: nextTamegaki,
  };

  const updated: Household = {
    ...household,
    tobaApplications: currentMap,
  };

  // Sync to explicit slot fields and slot aliases
  const slot = matchTobaSlot(cleanType, templeInfo);
  const name1 = (templeInfo?.tobaType1 !== undefined ? templeInfo.tobaType1 : '施餓鬼塔婆').trim();
  const name2 = (templeInfo?.tobaType2 || '').trim();
  const name3 = (templeInfo?.tobaType3 || '').trim();

  if (slot === 1 || cleanType === '施餓鬼塔婆') {
    updated.toba1Applied = isApplied;
    updated.toba1Tamegaki = nextTamegaki;
    updated.isSegakiToba = isApplied;
    updated.segakiTamegaki = nextTamegaki;
    currentMap['塔婆申込１'] = { applied: isApplied, tamegaki: nextTamegaki };
    currentMap['施餓鬼塔婆'] = { applied: isApplied, tamegaki: nextTamegaki };
    if (name1) currentMap[name1] = { applied: isApplied, tamegaki: nextTamegaki };
  } else if (slot === 2) {
    updated.toba2Applied = isApplied;
    updated.toba2Tamegaki = nextTamegaki;
    currentMap['塔婆申込２'] = { applied: isApplied, tamegaki: nextTamegaki };
    if (name2) currentMap[name2] = { applied: isApplied, tamegaki: nextTamegaki };
  } else if (slot === 3) {
    updated.toba3Applied = isApplied;
    updated.toba3Tamegaki = nextTamegaki;
    currentMap['塔婆申込３'] = { applied: isApplied, tamegaki: nextTamegaki };
    if (name3) currentMap[name3] = { applied: isApplied, tamegaki: nextTamegaki };
  }

  return updated;
}

/**
 * Immutably updates the Toba application status and tamegaki for a family member.
 */
export function setFamilyMemberTobaApplication(
  member: FamilyMember,
  tobaType: string,
  appliedOrItem: boolean | { applied: boolean; tamegaki?: string },
  tamegaki?: string,
  templeInfo?: Partial<TempleProfile> | null
): FamilyMember {
  const cleanType = (tobaType || '').trim();
  const currentMap = { ...(member.tobaApplications || {}) };
  const currentApp = getFamilyMemberTobaApplication(member, cleanType, templeInfo);

  let isApplied: boolean;
  let nextTamegaki: string;

  if (typeof appliedOrItem === 'object' && appliedOrItem !== null) {
    isApplied = Boolean(appliedOrItem.applied);
    nextTamegaki = appliedOrItem.tamegaki !== undefined ? appliedOrItem.tamegaki : currentApp.tamegaki || '';
  } else {
    isApplied = Boolean(appliedOrItem);
    nextTamegaki = tamegaki !== undefined ? tamegaki : currentApp.tamegaki || '';
  }

  currentMap[cleanType] = {
    applied: isApplied,
    tamegaki: nextTamegaki,
  };

  const updated: FamilyMember = {
    ...member,
    tobaApplications: currentMap,
  };

  // Sync to explicit slot fields and slot aliases
  const slot = matchTobaSlot(cleanType, templeInfo);
  const name1 = (templeInfo?.tobaType1 !== undefined ? templeInfo.tobaType1 : '施餓鬼塔婆').trim();
  const name2 = (templeInfo?.tobaType2 || '').trim();
  const name3 = (templeInfo?.tobaType3 || '').trim();

  if (slot === 1 || cleanType === '施餓鬼塔婆') {
    updated.toba1Applied = isApplied;
    updated.toba1Tamegaki = nextTamegaki;
    updated.isSegakiToba = isApplied;
    updated.segakiTamegaki = nextTamegaki;
    currentMap['塔婆申込１'] = { applied: isApplied, tamegaki: nextTamegaki };
    currentMap['施餓鬼塔婆'] = { applied: isApplied, tamegaki: nextTamegaki };
    if (name1) currentMap[name1] = { applied: isApplied, tamegaki: nextTamegaki };
  } else if (slot === 2) {
    updated.toba2Applied = isApplied;
    updated.toba2Tamegaki = nextTamegaki;
    currentMap['塔婆申込２'] = { applied: isApplied, tamegaki: nextTamegaki };
    if (name2) currentMap[name2] = { applied: isApplied, tamegaki: nextTamegaki };
  } else if (slot === 3) {
    updated.toba3Applied = isApplied;
    updated.toba3Tamegaki = nextTamegaki;
    currentMap['塔婆申込３'] = { applied: isApplied, tamegaki: nextTamegaki };
    if (name3) currentMap[name3] = { applied: isApplied, tamegaki: nextTamegaki };
  }

  return updated;
}

/**
 * Checks if the household head or any of its family members have applied for the given Toba type.
 */
export function isHouseholdAppliedForToba(
  household: Household,
  tobaType: string,
  templeInfo?: Partial<TempleProfile> | null
): boolean {
  if (getHouseholdTobaApplication(household, tobaType, templeInfo).applied) return true;
  if (household.familyMembers && household.familyMembers.length > 0) {
    return household.familyMembers.some((fm) => getFamilyMemberTobaApplication(fm, tobaType, templeInfo).applied);
  }
  return false;
}

/**
 * Gets the designated sponsor member in familyMembers if one exists.
 */
export function getDesignatedSponsorMember(household?: Partial<Household> | null): FamilyMember | undefined {
  if (!household || !household.familyMembers) return undefined;
  return household.familyMembers.find((m) => m.isChiefMourner || m.isSponsor);
}

/**
 * Retrieves the Toba application status & tamegaki for the household's sponsor.
 * If a family member is designated as sponsor (isChiefMourner/isSponsor), returns that member's application.
 * Otherwise, returns the household head's application.
 */
export function getHouseholdSponsorTobaApplication(
  household?: Partial<Household> | null,
  tobaType: string = '施餓鬼塔婆',
  templeInfo?: Partial<TempleProfile> | null
): TobaApplicationItem {
  if (!household) return { applied: false, tamegaki: '' };
  const designated = getDesignatedSponsorMember(household);
  if (designated) {
    return getFamilyMemberTobaApplication(designated, tobaType, templeInfo);
  }
  return getHouseholdTobaApplication(household, tobaType, templeInfo);
}

/**
 * Checks if the household's sponsor has applied for the given Toba type.
 */
export function isHouseholdSponsorAppliedForToba(
  household?: Partial<Household> | null,
  tobaType: string = '施餓鬼塔婆',
  templeInfo?: Partial<TempleProfile> | null
): boolean {
  return Boolean(getHouseholdSponsorTobaApplication(household, tobaType, templeInfo).applied);
}

/**
 * Sets the Toba application for the household's sponsor.
 * If a family member is designated as sponsor, updates that member's application.
 * Also keeps the household's top-level slot fields synchronized for list display and spreadsheet exports.
 */
export function setHouseholdSponsorTobaApplication(
  household: Household,
  tobaType: string,
  appliedOrItem: boolean | { applied: boolean; tamegaki?: string },
  tamegaki?: string,
  templeInfo?: Partial<TempleProfile> | null
): Household {
  const designated = getDesignatedSponsorMember(household);
  if (designated) {
    const updatedMembers = (household.familyMembers || []).map((m) => {
      if (m.id === designated.id || (m.isChiefMourner || m.isSponsor)) {
        return setFamilyMemberTobaApplication(m, tobaType, appliedOrItem, tamegaki, templeInfo);
      }
      return m;
    });
    // Keep household-level slot fields in sync with sponsor application
    const hhWithFields = setHouseholdTobaApplication(household, tobaType, appliedOrItem, tamegaki, templeInfo);
    return {
      ...hhWithFields,
      familyMembers: updatedMembers,
    };
  }

  return setHouseholdTobaApplication(household, tobaType, appliedOrItem, tamegaki, templeInfo);
}

/**
 * Toggles the Toba application status for the household's sponsor.
 */
export function toggleHouseholdSponsorTobaApplication(
  household: Household,
  tobaType: string,
  explicitNextVal?: boolean,
  templeInfo?: Partial<TempleProfile> | null
): Household {
  const currentApp = getHouseholdSponsorTobaApplication(household, tobaType, templeInfo);
  const nextVal = explicitNextVal !== undefined ? explicitNextVal : !currentApp.applied;
  return setHouseholdSponsorTobaApplication(household, tobaType, nextVal, currentApp.tamegaki, templeInfo);
}

/**
 * Gets the total number of applications (head + family members) for the given Toba type.
 */
export function getHouseholdTobaCount(
  household: Household,
  tobaType: string,
  templeInfo?: Partial<TempleProfile> | null
): number {
  let count = getHouseholdTobaApplication(household, tobaType, templeInfo).applied ? 1 : 0;
  if (household.familyMembers && household.familyMembers.length > 0) {
    count += household.familyMembers.filter((fm) => getFamilyMemberTobaApplication(fm, tobaType, templeInfo).applied).length;
  }
  return count;
}
