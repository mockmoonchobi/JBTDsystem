/**
 * Unicode and Japanese Text Printing Utility
 * Handles surrogate pairs (e.g. 𣘺 U+2363A, 𠮷 U+20BB7) and Ideographic Variation Sequences (IVS).
 * Prevents character corruption (e.g.  / ◆に？) during string manipulation in envelopes and postcards.
 */

/**
 * Safely splits a string into individual graphemes/characters without breaking
 * surrogate pairs (JIS Level 3/4, SIP Plane 2) or IVS (Ideographic Variation Selectors).
 *
 * @param text The input text
 * @returns Array of individual grapheme clusters/characters
 */
export function toGraphemes(text: string): string[] {
  if (!text) return [];

  // Modern browsers / JS runtimes support Intl.Segmenter with grapheme granularity
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    try {
      const segmenter = new Intl.Segmenter('ja-JP', { granularity: 'grapheme' });
      return Array.from(segmenter.segment(text), (s) => s.segment);
    } catch {
      // Fallback if Intl.Segmenter fails
    }
  }

  // Array.from iterates by Unicode code points, preventing surrogate pairs from breaking
  return Array.from(text);
}

/**
 * Safely joins characters of a string with a space character (e.g. full-width space '　'),
 * ensuring surrogate pairs like '𣘺' or '𠮷' are not split into high/low surrogates.
 *
 * @param text The input string
 * @param space The space character to insert between characters (default: '　')
 * @returns Formatted string with spaces between individual characters
 */
export function safeJoinWithSpace(text: string, space: string = '　'): string {
  if (!text) return '';
  return toGraphemes(text).join(space);
}

/**
 * Returns the true visible character count of a string, treating surrogate pairs and IVS as single characters.
 *
 * @param text The input string
 * @returns Number of visible graphemes/characters
 */
export function getGraphemeLength(text: string): number {
  if (!text) return 0;
  return toGraphemes(text).length;
}
