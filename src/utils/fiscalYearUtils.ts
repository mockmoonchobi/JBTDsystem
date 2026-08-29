import { TempleInfo, Transaction } from '../types';
import { normalizeDateInput, getJapaneseEra } from './memorialCalculator';

export { getJapaneseEra };

export interface FiscalYearInfo {
  year: number; // e.g. 2026
  eraLabel: string; // e.g. "令和8年度"
  fullLabel: string; // e.g. "令和8年度 (2026/04/01 〜 2027/03/31)"
  startDateStr: string; // e.g. "2026/04/01"
  endDateStr: string; // e.g. "2027/03/31"
  startDate: Date;
  endDate: Date;
  isCurrentFY: boolean;
}

/**
 * Gets the fiscal year start month/day from TempleInfo (defaults to 4/1)
 */
export function getFiscalYearConfig(templeInfo?: TempleInfo) {
  const startMonth = templeInfo?.fiscalYearStartMonth ?? 4;
  const startDay = templeInfo?.fiscalYearStartDay ?? 1;

  let endMonth = templeInfo?.fiscalYearEndMonth;
  let endDay = templeInfo?.fiscalYearEndDay;

  if (!endMonth || !endDay) {
    endMonth = startMonth === 1 ? 12 : startMonth - 1;
    const dummyDate = new Date(2025, endMonth, 0);
    endDay = dummyDate.getDate();
  }

  return { startMonth, startDay, endMonth, endDay };
}

/**
 * Calculates which Fiscal Year a given date string belongs to
 */
export function getFiscalYearOfDate(dateStr: string, templeInfo?: TempleInfo): number {
  const norm = normalizeDateInput(dateStr);
  const parts = norm.split('/');
  if (parts.length < 3) return new Date().getFullYear();

  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);

  if (isNaN(year) || isNaN(month) || isNaN(day)) return new Date().getFullYear();

  const { startMonth, startDay } = getFiscalYearConfig(templeInfo);

  if (month < startMonth || (month === startMonth && day < startDay)) {
    return year - 1;
  }
  return year;
}

/**
 * Returns full FiscalYearInfo for a given fiscal year number (e.g. 2026)
 */
export function getFiscalYearInfo(fyYear: number, templeInfo?: TempleInfo): FiscalYearInfo {
  const { startMonth, startDay } = getFiscalYearConfig(templeInfo);

  const startDate = new Date(fyYear, startMonth - 1, startDay);
  
  const nextFYStart = new Date(fyYear + 1, startMonth - 1, startDay);
  const endDate = new Date(nextFYStart.getTime() - 1000 * 60 * 60 * 24);

  const startMonthPadded = String(startMonth).padStart(2, '0');
  const startDayPadded = String(startDay).padStart(2, '0');
  const endMonthPadded = String(endDate.getMonth() + 1).padStart(2, '0');
  const endDayPadded = String(endDate.getDate()).padStart(2, '0');

  const startDateStr = `${fyYear}/${startMonthPadded}/${startDayPadded}`;
  const endDateStr = `${endDate.getFullYear()}/${endMonthPadded}/${endDayPadded}`;

  const currentFY = getFiscalYearOfDate(new Date().toISOString().slice(0, 10), templeInfo);
  const isCurrentFY = fyYear === currentFY;

  const eraStr = getJapaneseEra(fyYear);
  const eraLabel = `${eraStr.replace('年', '')}年度`;
  const fullLabel = `${eraLabel}${isCurrentFY ? ' (当期)' : ''} (${startDateStr} 〜 ${endDateStr})`;

  return {
    year: fyYear,
    eraLabel,
    fullLabel,
    startDateStr,
    endDateStr,
    startDate,
    endDate,
    isCurrentFY,
  };
}

/**
 * Gets a sorted list of all fiscal years available in transactions + current year
 */
export function getAvailableFiscalYears(transactions: Transaction[], templeInfo?: TempleInfo): FiscalYearInfo[] {
  const fySet = new Set<number>();
  const currentFY = getFiscalYearOfDate(new Date().toISOString().slice(0, 10), templeInfo);
  fySet.add(currentFY);

  transactions.forEach((tx) => {
    if (tx.date) {
      const fy = getFiscalYearOfDate(tx.date, templeInfo);
      if (!isNaN(fy) && fy > 1900 && fy < 2100) {
        fySet.add(fy);
      }
    }
  });

  const sortedYears = Array.from(fySet).sort((a, b) => b - a);
  return sortedYears.map((y) => getFiscalYearInfo(y, templeInfo));
}

/**
 * Checks if a date falls within a specific fiscal year
 */
export function isDateInFiscalYear(dateStr: string, fyYear: number, templeInfo?: TempleInfo): boolean {
  if (!dateStr) return false;
  const txFY = getFiscalYearOfDate(dateStr, templeInfo);
  return txFY === fyYear;
}

/**
 * Check if a transaction is an auto-generated carryover transaction
 */
export function isAutoCarryoverTransaction(tx: Transaction): boolean {
  if (!tx) return false;
  if (tx.id && tx.id.startsWith('TX-CARRYOVER-')) return true;
  if (tx.receiptNumber && tx.receiptNumber.startsWith('CARRYOVER-')) return true;
  if (tx.notes && tx.notes.includes('【期初自動処理】')) return true;
  return false;
}

/**
 * Check if a transaction is any carryover transaction (manual or auto)
 */
export function isCarryoverTransaction(tx: Transaction): boolean {
  if (!tx) return false;
  if (isAutoCarryoverTransaction(tx)) return true;
  if (tx.category === '繰越金' || tx.category === '前期繰越' || tx.category === '前期繰越金') return true;
  if (tx.householdHeadName && (tx.householdHeadName.includes('前期繰越') || tx.householdHeadName.includes('繰越金'))) return true;
  if (tx.notes && (tx.notes.includes('前期繰越') || tx.notes.includes('繰越金'))) return true;
  return false;
}

/**
 * Strict chronological comparator for transactions.
 * Guarantees that on any given day (e.g. fiscal year opening day):
 * 1. Carryover transactions (前期繰越金) always appear FIRST at the top of that day.
 * 2. Regular transactions follow in stable order.
 */
export function compareTransactionsChronological(a: Transaction, b: Transaction): number {
  const dateA = a.date || '';
  const dateB = b.date || '';
  const dateCmp = dateA.localeCompare(dateB);
  if (dateCmp !== 0) {
    return dateCmp;
  }

  const aIsCarryover = isCarryoverTransaction(a);
  const bIsCarryover = isCarryoverTransaction(b);

  if (aIsCarryover && !bIsCarryover) return -1;
  if (!aIsCarryover && bIsCarryover) return 1;

  return (a.receiptNumber || a.id || '').localeCompare(b.receiptNumber || b.id || '');
}

/**
 * Strips any legacy or auto-generated carryover transaction records from transaction list.
 * This ensures carryover is strictly calculated on-the-fly and never persisted as a database record.
 */
export function stripAutoCarryoverTransactions(transactions: Transaction[]): Transaction[] {
  return transactions.filter((tx) => !isAutoCarryoverTransaction(tx));
}

/**
 * Calculates the dynamic prior carryover balance (前期繰越金) for a specific fiscal year
 * based on all recorded transactions prior to this fiscal year's start date.
 */
export function calculatePriorCarryoverBalance(
  transactions: Transaction[],
  targetFiscalYear: number,
  templeInfo?: TempleInfo
): {
  priorIncome: number;
  priorExpense: number;
  priorBalance: number;
  hasPriorActivity: boolean;
} {
  let priorIncome = 0;
  let priorExpense = 0;
  let hasPriorActivity = false;

  transactions.forEach((tx) => {
    if (!tx.date) return;
    if (isAutoCarryoverTransaction(tx)) return; // Exclude legacy auto carryover records

    const txFY = getFiscalYearOfDate(tx.date, templeInfo);
    if (txFY < targetFiscalYear) {
      hasPriorActivity = true;
      if (tx.type === '収入') {
        priorIncome += tx.amount || 0;
      } else if (tx.type === '支出') {
        priorExpense += tx.amount || 0;
      }
    }
  });

  return {
    priorIncome,
    priorExpense,
    priorBalance: priorIncome - priorExpense,
    hasPriorActivity,
  };
}

