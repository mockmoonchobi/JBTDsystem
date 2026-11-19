import { Transaction } from '../types';

export const UNSET_INCOME_CATEGORY = '科目未設定収入';
export const UNSET_EXPENSE_CATEGORY = '科目未設定支出';

/**
 * 勘定科目名の前後空白を除去した正規化文字列を返す
 */
export function normalizeCategoryName(category?: string | null): string {
  return String(category ?? '').trim();
}

/**
 * 勘定科目一覧をトリム・空文字除外・重複排除（設定順維持）して返す
 */
export function normalizeCategoryList(categories?: string[] | null): string[] {
  if (!Array.isArray(categories)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of categories) {
    const trimmed = normalizeCategoryName(raw);
    if (trimmed && !seen.has(trimmed)) {
      seen.add(trimmed);
      result.push(trimmed);
    }
  }
  return result;
}

/**
 * 設定済み勘定科目リストの範囲内で有効な科目を解決する。
 * preferred が設定済みリストに存在すればそのまま返し、存在しなければ先頭科目（空リストなら ''）を返す。
 * ユーザー設定外の固定文字列（'法要布施' など）を勝手に補完しない。
 */
export function resolveConfiguredCategory(
  preferred: string | undefined | null,
  configuredCategories: string[]
): string {
  const list = normalizeCategoryList(configuredCategories);
  if (list.length === 0) return '';
  const trimmed = normalizeCategoryName(preferred);
  if (trimmed && list.includes(trimmed)) {
    return trimmed;
  }
  return list[0];
}

/**
 * 設定済み勘定科目リストの中からキーワードに一致する科目を探し、
 * 見つからなければ同じ設定済みリスト内の fallbackIndex（または先頭、空なら ''）を返す。
 * ユーザー設定外の固定文字列は一切返さない。
 */
export function resolveKeywordConfiguredCategory(
  configuredCategories: string[],
  keywords: string[],
  fallbackIndex = 0
): string {
  const list = normalizeCategoryList(configuredCategories);
  if (list.length === 0) return '';
  for (const kw of keywords) {
    if (!kw) continue;
    const exact = list.find((c) => c === kw);
    if (exact) return exact;
  }
  for (const kw of keywords) {
    if (!kw) continue;
    const partial = list.find((c) => c.includes(kw));
    if (partial) return partial;
  }
  return list[fallbackIndex] ?? list[0] ?? '';
}

/**
 * 既存取引の編集用選択肢を生成する。
 * 既存レコードの科目が現在のマスタ設定外であっても、選択肢に現在値を含めることで
 * プルダウンの見た目と内部値が食い違うことを防ぐ。
 */
export function getEditCategoryOptions(
  currentCategory: string | undefined | null,
  configuredCategories: string[]
): {
  options: string[];
  currentValue: string;
  isExternal: boolean;
} {
  const list = normalizeCategoryList(configuredCategories);
  const trimmed = normalizeCategoryName(currentCategory);
  if (!trimmed) {
    return {
      options: list,
      currentValue: '',
      isExternal: false,
    };
  }
  if (list.includes(trimmed)) {
    return {
      options: list,
      currentValue: trimmed,
      isExternal: false,
    };
  }
  return {
    options: [trimmed, ...list],
    currentValue: trimmed,
    isExternal: true,
  };
}

/**
 * "収入:科目名" / "支出:科目名" 形式の select 値を最初のコロンで安全に分割する。
 * 科目名自体に ':' が含まれていても欠落しない。
 */
export function parseTypedCategoryValue(value: string): {
  type: '収入' | '支出';
  category: string;
} {
  const idx = value.indexOf(':');
  if (idx === -1) {
    return { type: '収入', category: normalizeCategoryName(value) };
  }
  const rawType = value.slice(0, idx);
  const type: '収入' | '支出' = rawType === '支出' ? '支出' : '収入';
  const category = normalizeCategoryName(value.slice(idx + 1));
  return { type, category };
}

/**
 * 決算・表示用に科目ラベルを解決する。
 * 空欄の場合は「科目未設定収入」または「科目未設定支出」を返す。
 */
export function resolveFiscalCategoryLabel(
  category: string | undefined | null,
  type: '収入' | '支出' | string | undefined
): string {
  const trimmed = normalizeCategoryName(category);
  if (trimmed) return trimmed;
  return type === '支出' ? UNSET_EXPENSE_CATEGORY : UNSET_INCOME_CATEGORY;
}

export interface FiscalCategorySummary {
  incomeDisplayCategories: string[];
  expenseDisplayCategories: string[];
  extraIncomeCategories: string[];
  extraExpenseCategories: string[];
  incomeCategoryTotals: Record<string, number>;
  expenseCategoryTotals: Record<string, number>;
  operationalIncome: number;
  totalExpense: number;
}

/**
 * 決算書用：設定済み勘定科目（設定順）に加えて、取引レコードに実際に記載されている
 * 全ての科目（マスタ外科目・空欄の「科目未設定収入／支出」を含む）を漏れなく集計・列挙する。
 */
export function buildFiscalCategorySummary(
  transactions: Transaction[],
  configuredIncomeCategories: string[],
  configuredExpenseCategories: string[]
): FiscalCategorySummary {
  const baseIncome = normalizeCategoryList(configuredIncomeCategories);
  const baseExpense = normalizeCategoryList(configuredExpenseCategories);

  const incomeSet = new Set<string>(baseIncome);
  const expenseSet = new Set<string>(baseExpense);
  const extraIncomeCategories: string[] = [];
  const extraExpenseCategories: string[] = [];

  const incomeCategoryTotals: Record<string, number> = {};
  const expenseCategoryTotals: Record<string, number> = {};

  baseIncome.forEach((cat) => {
    incomeCategoryTotals[cat] = 0;
  });
  baseExpense.forEach((cat) => {
    expenseCategoryTotals[cat] = 0;
  });

  let operationalIncome = 0;
  let totalExpense = 0;

  transactions.forEach((t) => {
    if (!t) return;
    const amount = Number(t.amount) || 0;
    if (t.type === '収入') {
      const cat = resolveFiscalCategoryLabel(t.category, '収入');
      if (!incomeSet.has(cat)) {
        incomeSet.add(cat);
        extraIncomeCategories.push(cat);
      }
      incomeCategoryTotals[cat] = (incomeCategoryTotals[cat] || 0) + amount;
      operationalIncome += amount;
    } else if (t.type === '支出') {
      const cat = resolveFiscalCategoryLabel(t.category, '支出');
      if (!expenseSet.has(cat)) {
        expenseSet.add(cat);
        extraExpenseCategories.push(cat);
      }
      expenseCategoryTotals[cat] = (expenseCategoryTotals[cat] || 0) + amount;
      totalExpense += amount;
    }
  });

  return {
    incomeDisplayCategories: [...baseIncome, ...extraIncomeCategories],
    expenseDisplayCategories: [...baseExpense, ...extraExpenseCategories],
    extraIncomeCategories,
    extraExpenseCategories,
    incomeCategoryTotals,
    expenseCategoryTotals,
    operationalIncome,
    totalExpense,
  };
}

/**
 * 出納帳の科目絞り込みフィルタ用：設定済み科目＋実レコードに存在するマスタ外／未設定科目を列挙する
 */
export function buildFilterCategoryOptions(
  transactions: Transaction[],
  configuredIncomeCategories: string[],
  configuredExpenseCategories: string[]
): {
  incomeCategories: string[];
  expenseCategories: string[];
  extraIncomeCategories: string[];
  extraExpenseCategories: string[];
} {
  const summary = buildFiscalCategorySummary(
    transactions,
    configuredIncomeCategories,
    configuredExpenseCategories
  );
  return {
    incomeCategories: summary.incomeDisplayCategories,
    expenseCategories: summary.expenseDisplayCategories,
    extraIncomeCategories: summary.extraIncomeCategories,
    extraExpenseCategories: summary.extraExpenseCategories,
  };
}
