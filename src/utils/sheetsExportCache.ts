export interface SheetUpdate {
  range: string;
  values: unknown[][];
  comparisonValues?: unknown[][];
}

/** One destination only; never persist a baseline across reloads or imports.
 * Compare exact exported values (not hashes or object identity). This includes
 * derived fields, nested edits, row order, and deletions.
 */
export class SheetsExportCache {
  private key = '';
  private generation = 0;
  private tables = new Map<string, string>();

  invalidate(): void {
    this.key = '';
    this.tables.clear();
    this.generation++;
  }

  plan(key: string, updates: SheetUpdate[], incremental: boolean) {
    const generation = this.generation;
    const previous = this.key === key ? this.tables : new Map<string, string>();
    const chunks = new Map<string, string[]>();
    const tableName = (update: SheetUpdate) => {
      const match = update.range.match(/^'((?:[^']|'')+)'!A[1-9]\d*$/);
      if (!match) throw new Error(`出力範囲が不正です: ${update.range}`);
      return match[1].replace(/''/g, "'");
    };
    for (const update of updates) {
      const name = tableName(update);
      // The exporter generates this timestamp at export time, even when the
      // template itself is unchanged. All actual template fields still compare.
      const values = name === '案内文テンプレート'
        ? update.values.map(row => row.slice(0, 5)) : (update.comparisonValues || update.values);
      const parts = chunks.get(name) || [];
      parts.push(JSON.stringify(values));
      chunks.set(name, parts);
    }
    const next = new Map([...chunks].map(([name, parts]) => [name, parts.join('\n')]));
    const changed = new Set([...next].filter(([name, value]) => !incremental || previous.get(name) !== value).map(([name]) => name));
    return {
      updates: updates.filter(update => changed.has(tableName(update))),
      changed,
      commit: () => {
        // A concurrent import/reset makes this baseline unsuitable for reuse.
        if (generation !== this.generation) return;
        this.key = key;
        this.tables = new Map([...previous, ...next]);
        this.generation++;
      },
    };
  }
}
