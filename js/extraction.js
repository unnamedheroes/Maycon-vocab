// js/extraction.js
//
// Turns raw document text into a deduplicated list of candidate Hungarian
// words. Kept deliberately simple: every letter-run of 2+ characters counts
// as a word, matched with a Unicode-aware regex so accented Hungarian
// letters (á, é, í, ó, ö, ő, ú, ü, ű) are handled correctly.

export function extractUniqueWords(text) {
  const matches = text.match(/[\p{L}]+/gu) || [];
  const seen = new Set();
  for (const raw of matches) {
    if (raw.length < 2) continue;
    seen.add(raw.toLowerCase());
  }
  return Array.from(seen);
}

/** Strips accents so search can match "alma" against a query of "álma" or vice versa. */
export function foldAccents(str) {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
