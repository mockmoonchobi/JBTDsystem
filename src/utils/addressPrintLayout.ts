import { toGraphemes } from './unicodeUtils';

export type AddressLayout = { lines: string[]; sizes: number[] };
export type AddressMeasure = (text: string, fontPt: number) => number;
/** Extents are CSS pixels: mm and pt therefore do not depend on preview zoom. */
export function layoutVerticalAddress(text: string, heightMm: number, fontPt: number, secondPt: number,
  measure: AddressMeasure = (s, pt) => toGraphemes(s).length * pt * 96 / 72 * 1.025): AddressLayout {
  const clean = text.trim().replace(/[\s　]+/g, '　');
  if (!clean) return { lines: [], sizes: [] };
  const limit = heightMm * 96 / 25.4 - 2;
  if (measure(clean, fontPt) <= limit) return { lines: [clean], sizes: [fontPt] };
  const chars = toGraphemes(clean);
  const candidate = (at: number) => {
    const lines = [chars.slice(0, at).join('').trim(), chars.slice(at).join('').trim()];
    const lengths = [measure(lines[0], fontPt), measure(lines[1], secondPt)];
    return { lines, lengths, score: Math.max(...lengths) };
  };
  const breaks = chars.flatMap((c, i) => c === '　' && i > 0 && i < chars.length - 1 ? [candidate(i)] : []);
  // Prefer the existing street/building boundary when both columns fit.
  const fitting = breaks.filter(c => c.score <= limit);
  let choices = fitting;
  if (!choices.length) {
    // Balance the columns with logarithmic measurements, including long print runs.
    let low = 1, high = chars.length - 1;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      const c = candidate(middle);
      if (c.lengths[0] < c.lengths[1]) low = middle + 1;
      else high = middle;
    }
    choices = [candidate(low), ...(low > 1 ? [candidate(low - 1)] : [])];
  }
  const best = choices.filter(c => c.lines.every(Boolean)).sort((a, b) => a.score - b.score)[0];
  if (!best) return { lines: [clean], sizes: [fontPt * Math.min(1, limit / measure(clean, fontPt))] };
  const scale = Math.min(1, limit / best.score);
  return { lines: best.lines, sizes: [fontPt * scale, secondPt * scale] };
}
