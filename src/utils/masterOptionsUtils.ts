import { Household, MasterOptions, Transaction } from '../types';
import { EMPTY_MASTER_OPTIONS } from '../data/initialData';

export interface ExtractedMasterDifferences {
  newHouseholdTypes: string[];
  newStatuses: string[];
  newDistricts: string[];
  newTobaTypes: string[];
  newIncomeCategories: string[];
  newExpenseCategories: string[];
  newPaymentMethods: string[];
  totalNewCount: number;
}

/**
 * Merges imported household and transaction data into MasterOptions,
 * ensuring all newly introduced 区分, 地区, 勘定科目, and 決済方法 are recorded in the master list.
 */
export function mergeMasterOptionsWithData(
  currentMaster?: MasterOptions,
  households?: Household[],
  transactions?: Transaction[]
): MasterOptions {
  const base = currentMaster || EMPTY_MASTER_OPTIONS;

  const householdTypes = new Set<string>(base.householdTypes || []);
  // Keep user-configured statuses strictly intact (do not auto-resurrect statuses from households if master exists)
  const statuses = new Set<string>(base.statuses || []);
  const districts = new Set<string>(base.districts || []);
  const tobaTypes = new Set<string>(base.tobaTypes || []);
  const incomeCategories = new Set<string>(base.incomeCategories || []);
  const expenseCategories = new Set<string>(base.expenseCategories || []);
  const paymentMethods = new Set<string>(base.paymentMethods || []);

  if (households && households.length > 0) {
    households.forEach((h) => {
      if (h.householdType && typeof h.householdType === 'string' && h.householdType.trim()) {
        householdTypes.add(h.householdType.trim());
      }
      // Only extract statuses if currentMaster was completely omitted/undefined
      if (!currentMaster && h.status && typeof h.status === 'string' && h.status.trim()) {
        statuses.add(h.status.trim());
      }
      if (h.district && typeof h.district === 'string' && h.district.trim()) {
        districts.add(h.district.trim());
      }
      if (h.tobaApplications) {
        Object.keys(h.tobaApplications).forEach((k) => {
          if (k && k.trim()) tobaTypes.add(k.trim());
        });
      }
    });
  }

  if (transactions && transactions.length > 0) {
    transactions.forEach((t) => {
      if (t.category && typeof t.category === 'string' && t.category.trim()) {
        const cat = t.category.trim();
        if (t.type === '支出') {
          expenseCategories.add(cat);
        } else {
          incomeCategories.add(cat);
        }
      }
      if (t.paymentMethod && typeof t.paymentMethod === 'string' && t.paymentMethod.trim()) {
        paymentMethods.add(t.paymentMethod.trim());
      }
    });
  }

  const incList = Array.from(incomeCategories);
  const expList = Array.from(expenseCategories);
  const allAccounting = Array.from(new Set([...incList, ...expList]));

  return {
    householdTypes: Array.from(householdTypes),
    statuses: Array.from(statuses),
    districts: Array.from(districts),
    tobaTypes: Array.from(tobaTypes),
    incomeCategories: incList,
    expenseCategories: expList,
    accountingCategories: allAccounting,
    paymentMethods: Array.from(paymentMethods),
  };
}

/**
 * Merges ONLY the user-selected master items into MasterOptions.
 */
export function mergeSelectedMasterOptions(
  currentMaster: MasterOptions | undefined,
  diff: ExtractedMasterDifferences,
  selectedKeys: Record<string, boolean>
): MasterOptions {
  const base = currentMaster || EMPTY_MASTER_OPTIONS;

  const householdTypes = new Set<string>(base.householdTypes || []);
  const statuses = new Set<string>(base.statuses || []);
  const districts = new Set<string>(base.districts || []);
  const tobaTypes = new Set<string>(base.tobaTypes || []);
  const incomeCategories = new Set<string>(base.incomeCategories || []);
  const expenseCategories = new Set<string>(base.expenseCategories || []);
  const paymentMethods = new Set<string>(base.paymentMethods || []);

  diff.newHouseholdTypes.forEach((t) => {
    if (selectedKeys[`ht:${t}`] !== false) householdTypes.add(t);
  });
  diff.newStatuses.forEach((s) => {
    if (selectedKeys[`st:${s}`] !== false) statuses.add(s);
  });
  diff.newDistricts.forEach((d) => {
    if (selectedKeys[`dst:${d}`] !== false) districts.add(d);
  });
  diff.newTobaTypes.forEach((tb) => {
    if (selectedKeys[`tb:${tb}`] !== false) tobaTypes.add(tb);
  });
  diff.newIncomeCategories.forEach((inc) => {
    if (selectedKeys[`inc:${inc}`] !== false) incomeCategories.add(inc);
  });
  diff.newExpenseCategories.forEach((exp) => {
    if (selectedKeys[`exp:${exp}`] !== false) expenseCategories.add(exp);
  });
  diff.newPaymentMethods.forEach((pm) => {
    if (selectedKeys[`pm:${pm}`] !== false) paymentMethods.add(pm);
  });

  const incList = Array.from(incomeCategories);
  const expList = Array.from(expenseCategories);
  const allAccounting = Array.from(new Set([...incList, ...expList]));

  return {
    householdTypes: Array.from(householdTypes),
    statuses: Array.from(statuses),
    districts: Array.from(districts),
    tobaTypes: Array.from(tobaTypes),
    incomeCategories: incList,
    expenseCategories: expList,
    accountingCategories: allAccounting,
    paymentMethods: Array.from(paymentMethods),
  };
}

/**
 * Calculates which new master items will be added compared to the existing master options.
 */
export function detectNewMasterOptions(
  currentMaster?: MasterOptions,
  households?: Household[],
  transactions?: Transaction[]
): ExtractedMasterDifferences {
  const base = currentMaster || EMPTY_MASTER_OPTIONS;

  const currentHTypes = new Set<string>(base.householdTypes || []);
  const currentStatuses = new Set<string>(base.statuses || []);
  const currentDistricts = new Set<string>(base.districts || []);
  const currentTobaTypes = new Set<string>(base.tobaTypes || []);
  const currentIncome = new Set<string>(base.incomeCategories || []);
  const currentExpense = new Set<string>(base.expenseCategories || []);
  const currentPayment = new Set<string>(base.paymentMethods || []);

  const newHTypes = new Set<string>();
  const newStatuses = new Set<string>();
  const newDistricts = new Set<string>();
  const newTobaTypes = new Set<string>();
  const newIncome = new Set<string>();
  const newExpense = new Set<string>();
  const newPayment = new Set<string>();

  if (households && households.length > 0) {
    households.forEach((h) => {
      if (h.householdType && typeof h.householdType === 'string' && h.householdType.trim()) {
        const val = h.householdType.trim();
        if (!currentHTypes.has(val)) newHTypes.add(val);
      }
      if (h.status && typeof h.status === 'string' && h.status.trim()) {
        const val = h.status.trim();
        if (!currentStatuses.has(val)) newStatuses.add(val);
      }
      if (h.district && typeof h.district === 'string' && h.district.trim()) {
        const val = h.district.trim();
        if (!currentDistricts.has(val)) newDistricts.add(val);
      }
      if (h.tobaApplications) {
        Object.keys(h.tobaApplications).forEach((k) => {
          const val = k.trim();
          if (val && !currentTobaTypes.has(val)) newTobaTypes.add(val);
        });
      }
    });
  }

  if (transactions && transactions.length > 0) {
    transactions.forEach((t) => {
      if (t.category && typeof t.category === 'string' && t.category.trim()) {
        const val = t.category.trim();
        if (t.type === '支出') {
          if (!currentExpense.has(val)) newExpense.add(val);
        } else {
          if (!currentIncome.has(val)) newIncome.add(val);
        }
      }
      if (t.paymentMethod && typeof t.paymentMethod === 'string' && t.paymentMethod.trim()) {
        const val = t.paymentMethod.trim();
        if (!currentPayment.has(val)) newPayment.add(val);
      }
    });
  }

  const listHTypes = Array.from(newHTypes);
  const listStatuses = Array.from(newStatuses);
  const listDistricts = Array.from(newDistricts);
  const listTobaTypes = Array.from(newTobaTypes);
  const listIncome = Array.from(newIncome);
  const listExpense = Array.from(newExpense);
  const listPayment = Array.from(newPayment);

  const totalNewCount =
    listHTypes.length +
    listStatuses.length +
    listDistricts.length +
    listTobaTypes.length +
    listIncome.length +
    listExpense.length +
    listPayment.length;

  return {
    newHouseholdTypes: listHTypes,
    newStatuses: listStatuses,
    newDistricts: listDistricts,
    newTobaTypes: listTobaTypes,
    newIncomeCategories: listIncome,
    newExpenseCategories: listExpense,
    newPaymentMethods: listPayment,
    totalNewCount,
  };
}

/**
 * Resolves the MasterOptions for a specific temple, falling back to temple's own master, or map, or global fallback.
 */
export function getTempleMasterOptions(
  templeId: string,
  templeMasterOptionsMap?: Record<string, MasterOptions>,
  temples?: { id?: string; masterOptions?: MasterOptions }[],
  globalFallback?: MasterOptions
): MasterOptions {
  if (templeMasterOptionsMap && templeMasterOptionsMap[templeId]) {
    return templeMasterOptionsMap[templeId];
  }
  if (temples) {
    const found = temples.find((t) => (t.id || 'temple-main') === templeId);
    if (found?.masterOptions) {
      return found.masterOptions;
    }
  }
  return globalFallback || EMPTY_MASTER_OPTIONS;
}

/**
 * Combines all master options from multiple temples into a unified set of options.
 */
export function mergeAllTempleMasterOptions(
  templeMasterOptionsMap: Record<string, MasterOptions>,
  defaultMaster?: MasterOptions
): MasterOptions {
  const allMasters = Object.values(templeMasterOptionsMap);
  if (allMasters.length === 0) {
    return defaultMaster || EMPTY_MASTER_OPTIONS;
  }

  const hTypes = new Set<string>();
  const statuses = new Set<string>();
  const districts = new Set<string>();
  const tobaTypes = new Set<string>();
  const incCats = new Set<string>();
  const expCats = new Set<string>();
  const payMethods = new Set<string>();

  allMasters.forEach((m) => {
    (m.householdTypes || []).forEach((x) => hTypes.add(x));
    (m.statuses || []).forEach((x) => statuses.add(x));
    (m.districts || []).forEach((x) => districts.add(x));
    (m.tobaTypes || []).forEach((x) => tobaTypes.add(x));
    (m.incomeCategories || []).forEach((x) => incCats.add(x));
    (m.expenseCategories || []).forEach((x) => expCats.add(x));
    (m.paymentMethods || []).forEach((x) => payMethods.add(x));
  });

  const incList = Array.from(incCats);
  const expList = Array.from(expCats);

  return {
    householdTypes: Array.from(hTypes),
    statuses: Array.from(statuses),
    districts: Array.from(districts),
    tobaTypes: Array.from(tobaTypes),
    incomeCategories: incList,
    expenseCategories: expList,
    accountingCategories: Array.from(new Set([...incList, ...expList])),
    paymentMethods: Array.from(payMethods),
  };
}

