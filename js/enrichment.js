// js/enrichment.js
//
// Fills in an English translation, a part of speech, and a rough CEFR level
// for a Hungarian word. Uses free public APIs when online, and always falls
// back to a local heuristic (or an empty string the user can fill in by
// hand) rather than blocking, throwing, or guessing with false confidence.

import { CORE_A1, CORE_A2, SUFFIX_POS_RULES, EN_BASIC, HU_SUFFIXES } from './data/core-vocab.js';

const POS_OPTIONS = [
  'noun', 'verb', 'adjective', 'adverb', 'pronoun',
  'preposition', 'conjunction', 'interjection', 'numeral',
];

// Below this confidence score, MyMemory's own match quality is too low to
// trust -- an empty translation (left for manual entry) beats a wrong one.
const MIN_TRANSLATION_CONFIDENCE = 0.3;

export async function translate(word) {
  try {
    const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(word)}&langpair=hu|en`);
    if (!res.ok) return '';
    const data = await res.json();

    const status = data && data.responseStatus;
    if (status && Number(status) !== 200) return '';

    const match = data && data.responseData && data.responseData.match;
    if (typeof match === 'number' && match < MIN_TRANSLATION_CONFIDENCE) return '';

    const translated = data && data.responseData && data.responseData.translatedText;
    if (!translated) return '';
    const clean = translated.trim().replace(/\.$/, '');
    if (!clean) return '';
    if (clean.toLowerCase() === word.toLowerCase()) return '';
    if (/no translation|please select|invalid|moses/i.test(clean)) return '';
    // MyMemory occasionally returns a whole sentence for a single input word
    // when it has no real match -- that's not a usable translation.
    if (clean.split(/\s+/).length > 4) return '';
    return clean;
  } catch (e) {
    return '';
  }
}

/**
 * Reduces an English translation like "to eat" or "a big house" down to the
 * single word most useful for a dictionary/part-of-speech lookup.
 */
function coreEnglishWord(str) {
  if (!str) return '';
  let s = str.toLowerCase().trim();
  if (/^to\s+/.test(s)) return { word: s.replace(/^to\s+/, '').split(/\s+/)[0], impliedPos: 'verb' };
  s = s.replace(/^(a|an|the)\s+/, '');
  const first = (s.match(/[a-z']+/) || [])[0] || '';
  return { word: first, impliedPos: '' };
}

export async function lookupPartOfSpeech(englishWord) {
  if (!englishWord) return '';
  const { word, impliedPos } = coreEnglishWord(englishWord);
  if (impliedPos) return impliedPos; // "to eat" -> verb, no lookup needed
  if (!word) return '';
  try {
    const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
    if (!res.ok) return '';
    const data = await res.json();
    const meaning = data[0] && data[0].meanings && data[0].meanings[0];
    const pos = meaning && meaning.partOfSpeech;
    return pos && POS_OPTIONS.includes(pos) ? pos : (pos || '');
  } catch (e) {
    return '';
  }
}

export function guessPartOfSpeechFromSuffix(huWord) {
  const w = huWord.toLowerCase();
  for (const rule of SUFFIX_POS_RULES) {
    if (rule.test.test(w)) return rule.pos;
  }
  return '';
}

function countSyllables(word) {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return 0;
  const m = w.match(/[aeiouy]+/g);
  let n = m ? m.length : 1;
  if (w.endsWith('e') && n > 1) n -= 1;
  return Math.max(n, 1);
}

/** Strips one layer of common Hungarian case/possessive/plural endings. */
function stripHungarianSuffix(word) {
  const w = word.toLowerCase();
  for (const suffix of HU_SUFFIXES) {
    if (w.length - suffix.length >= 3 && w.endsWith(suffix)) {
      return w.slice(0, -suffix.length);
    }
  }
  return w;
}

/**
 * CEFR level is judged primarily from the English translation (Hungarian's
 * grammatical endings make raw Hungarian word length a poor proxy for
 * difficulty -- "házban" is 6 letters but is built from the very basic word
 * "ház" plus a case ending). Known basic Hungarian words are still checked
 * first since that's the most reliable signal available.
 */
export function estimateCEFR(huWord, enWord) {
  const hu = huWord.toLowerCase();
  if (CORE_A1.has(hu)) return 'A1';
  if (CORE_A2.has(hu)) return 'A2';

  const { word: enCore } = coreEnglishWord(enWord || '');
  if (enCore) {
    if (EN_BASIC.has(enCore)) return 'A2';
    const len = enCore.length;
    const syll = countSyllables(enCore);
    if (len <= 4 && syll <= 2) return 'A2';
    if (len <= 6 && syll <= 2) return 'B1';
    if (len <= 9 && syll <= 3) return 'B2';
    return 'C1';
  }

  // No usable translation -- fall back to a rough Hungarian stem length.
  const stem = stripHungarianSuffix(hu);
  const len = stem.length;
  if (len <= 4) return 'A2';
  if (len <= 6) return 'B1';
  if (len <= 8) return 'B2';
  return 'C1';
}

/**
 * Enrich a single Hungarian word. Never throws -- on any failure it falls
 * back to local heuristics or empty strings.
 */
export async function enrichWord(huWord) {
  const en = await translate(huWord);
  let pos = await lookupPartOfSpeech(en);
  if (!pos) pos = guessPartOfSpeechFromSuffix(huWord);
  const cefr = estimateCEFR(huWord, en);
  return { en, pos, cefr };
}

/**
 * Enrich many words with limited concurrency, so the free APIs behind this
 * aren't hammered, reporting progress as it goes.
 */
export async function enrichBatch(words, onProgress, concurrency = 4) {
  const results = {};
  for (let i = 0; i < words.length; i += concurrency) {
    const chunk = words.slice(i, i + concurrency);
    const settled = await Promise.allSettled(chunk.map(enrichWord));
    chunk.forEach((w, idx) => {
      results[w] = settled[idx].status === 'fulfilled'
        ? settled[idx].value
        : { en: '', pos: '', cefr: estimateCEFR(w, '') };
    });
    if (onProgress) onProgress(Math.min(i + concurrency, words.length), words.length);
  }
  return results;
}
