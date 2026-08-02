// js/enrichment.js
//
// Fills in an English translation, a part of speech, and a rough CEFR level
// for a Hungarian word. Uses free public APIs when online, and always falls
// back to a local heuristic (or an empty string the user can fill in by
// hand) rather than blocking or throwing.

import { CORE_A1, CORE_A2, SUFFIX_POS_RULES } from './data/core-vocab.js';

const POS_OPTIONS = [
  'noun', 'verb', 'adjective', 'adverb', 'pronoun',
  'preposition', 'conjunction', 'interjection', 'numeral',
];

export async function translate(word) {
  try {
    const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(word)}&langpair=hu|en`);
    if (!res.ok) return '';
    const data = await res.json();
    const translated = data && data.responseData && data.responseData.translatedText;
    if (!translated) return '';
    const clean = translated.trim();
    if (!clean || clean.toLowerCase() === word.toLowerCase()) return '';
    if (/no translation|please select|invalid/i.test(clean)) return '';
    return clean;
  } catch (e) {
    return '';
  }
}

export async function lookupPartOfSpeech(englishWord) {
  if (!englishWord || !/^[a-zA-Z]+$/.test(englishWord.trim())) return '';
  try {
    const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(englishWord.trim())}`);
    if (!res.ok) return '';
    const data = await res.json();
    const meaning = data[0] && data[0].meanings && data[0].meanings[0];
    const pos = meaning && meaning.partOfSpeech;
    return POS_OPTIONS.includes(pos) ? pos : (pos || '');
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

export function estimateCEFR(huWord) {
  const w = huWord.toLowerCase();
  if (CORE_A1.has(w)) return 'A1';
  if (CORE_A2.has(w)) return 'A2';
  const len = w.length;
  if (len <= 5) return 'A2';
  if (len <= 7) return 'B1';
  if (len <= 9) return 'B2';
  if (len <= 12) return 'C1';
  return 'C2';
}

/**
 * Enrich a single Hungarian word. Never throws -- on any failure it falls
 * back to local heuristics or empty strings.
 */
export async function enrichWord(huWord) {
  const en = await translate(huWord);
  let pos = await lookupPartOfSpeech(en);
  if (!pos) pos = guessPartOfSpeechFromSuffix(huWord);
  const cefr = estimateCEFR(huWord);
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
        : { en: '', pos: '', cefr: estimateCEFR(w) };
    });
    if (onProgress) onProgress(Math.min(i + concurrency, words.length), words.length);
  }
  return results;
}
