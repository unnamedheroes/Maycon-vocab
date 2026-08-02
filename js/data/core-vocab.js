// js/data/core-vocab.js
//
// Small hand-picked reference lists used to make a rough CEFR guess for a
// Hungarian word when no better information is available, and a few
// morphological cues used as a last-resort part-of-speech guess.
//
// These are heuristics, not a certified frequency list or a full Hungarian
// morphological analyzer -- every word's level and part of speech can be
// corrected by hand in the app, and these lists can be extended freely.

export const CORE_A1 = new Set([
  'én', 'te', 'ő', 'mi', 'ti', 'ők', 'van', 'vagyok', 'vagy', 'vagyunk', 'vagytok',
  'nem', 'igen', 'kérem', 'köszönöm', 'szia', 'szervusz', 'jó', 'rossz', 'nagy',
  'kicsi', 'ház', 'víz', 'kenyér', 'alma', 'tej', 'kutya', 'macska', 'könyv',
  'asztal', 'szék', 'ablak', 'ajtó', 'autó', 'iskola', 'tanár', 'diák', 'anya',
  'apa', 'gyerek', 'testvér', 'barát', 'nap', 'hold', 'csillag', 'reggel', 'este',
  'éjjel', 'hétfő', 'kedd', 'szerda', 'csütörtök', 'péntek', 'szombat', 'vasárnap',
  'egy', 'kettő', 'három', 'négy', 'öt', 'hat', 'hét', 'nyolc', 'kilenc', 'tíz',
  'piros', 'kék', 'zöld', 'sárga', 'fekete', 'fehér', 'eszik', 'iszik', 'alszik',
  'megy', 'jön', 'lát', 'hall', 'mond', 'kér', 'ad', 'vesz', 'szeret', 'akar',
  'tud', 'ért', 'dolgozik', 'játszik', 'tanul', 'ír', 'olvas', 'néz', 'hol',
  'mikor', 'miért', 'hogyan', 'ki', 'mennyi', 'mit',
]);

export const CORE_A2 = new Set([
  'hétvége', 'hónap', 'január', 'február', 'március', 'április', 'május', 'június',
  'július', 'augusztus', 'szeptember', 'október', 'november', 'december', 'tavasz',
  'nyár', 'ősz', 'tél', 'idő', 'időjárás', 'meleg', 'hideg', 'eső', 'hó', 'szél',
  'munka', 'pénz', 'bolt', 'piac', 'étterem', 'orvos', 'kórház', 'rendőr', 'tűzoltó',
  'repülőtér', 'vonat', 'busz', 'hajó', 'kerékpár', 'utca', 'város', 'falu', 'ország',
  'nyelv', 'angol', 'magyar', 'német', 'francia', 'spanyol', 'könnyű', 'nehéz',
  'gyors', 'lassú', 'magas', 'alacsony', 'öreg', 'fiatal', 'szép', 'csúnya', 'drága',
  'olcsó', 'tiszta', 'piszkos', 'éhes', 'szomjas', 'fáradt', 'boldog', 'szomorú',
  'mérges', 'érdekes', 'unalmas', 'fontos', 'szükséges', 'lehetséges', 'biztos',
]);

// Deliberately conservative suffix cues -- used only when translation-based
// lookups fail to return a part of speech.
export const SUFFIX_POS_RULES = [
  { test: /ni$/, pos: 'verb' },
  { test: /(unk|ünk|tok|tek|tök|nak|nek|juk|jük)$/, pos: 'verb' },
  { test: /(an|en|ul|ül)$/, pos: 'adverb' },
  { test: /(ó|ő)$/, pos: 'adjective' },
  { test: /(os|es|ös|as|is|ú|ű)$/, pos: 'adjective' },
  { test: /k$/, pos: 'noun' },
];
