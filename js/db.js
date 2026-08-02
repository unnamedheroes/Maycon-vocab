// js/db.js
//
// Thin promise-based wrapper around IndexedDB. This is the only module that
// talks to storage directly -- everything else in the app goes through these
// functions, so the storage engine could be swapped later without touching
// the rest of the code.

const DB_NAME = 'wordwall-db';
const DB_VERSION = 1;
const STORE_WORDS = 'words';
const STORE_DOCS = 'documents';

let dbPromise = null;

function openDatabase() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_WORDS)) {
        const store = db.createObjectStore(STORE_WORDS, { keyPath: 'id' });
        store.createIndex('huKey', 'huKey', { unique: true });
        store.createIndex('cefr', 'cefr', { unique: false });
        store.createIndex('pos', 'pos', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_DOCS)) {
        db.createObjectStore(STORE_DOCS, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function getStore(storeName, mode) {
  const db = await openDatabase();
  return db.transaction(storeName, mode).objectStore(storeName);
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getAllWords() {
  const store = await getStore(STORE_WORDS, 'readonly');
  return reqToPromise(store.getAll());
}

export async function getWordByKey(huKey) {
  const store = await getStore(STORE_WORDS, 'readonly');
  return reqToPromise(store.index('huKey').get(huKey));
}

export async function putWord(word) {
  const store = await getStore(STORE_WORDS, 'readwrite');
  return reqToPromise(store.put(word));
}

export async function bulkPutWords(words) {
  if (!words.length) return;
  const store = await getStore(STORE_WORDS, 'readwrite');
  await Promise.all(words.map(w => reqToPromise(store.put(w))));
}

export async function deleteWord(id) {
  const store = await getStore(STORE_WORDS, 'readwrite');
  return reqToPromise(store.delete(id));
}

export async function getAllDocuments() {
  const store = await getStore(STORE_DOCS, 'readonly');
  return reqToPromise(store.getAll());
}

export async function putDocument(doc) {
  const store = await getStore(STORE_DOCS, 'readwrite');
  return reqToPromise(store.put(doc));
}

export async function deleteDocument(id) {
  const store = await getStore(STORE_DOCS, 'readwrite');
  return reqToPromise(store.delete(id));
}

export async function clearAll() {
  const wStore = await getStore(STORE_WORDS, 'readwrite');
  await reqToPromise(wStore.clear());
  const dStore = await getStore(STORE_DOCS, 'readwrite');
  await reqToPromise(dStore.clear());
}

/** Full backup of everything in the database, ready to JSON.stringify. */
export async function exportDatabase() {
  const [words, documents] = await Promise.all([getAllWords(), getAllDocuments()]);
  return { version: DB_VERSION, exportedAt: new Date().toISOString(), words, documents };
}

/**
 * Merge a previously exported backup into the current database. Existing
 * words win on conflicting fields but gain any "found in" document
 * references from the incoming file; missing fields are filled in.
 */
export async function importDatabase(data, { merge = true } = {}) {
  if (!data || !Array.isArray(data.words)) throw new Error('That file does not look like a Word Wall backup.');
  if (!merge) await clearAll();

  const existingWords = await getAllWords();
  const byKey = new Map(existingWords.map(w => [w.huKey, w]));

  for (const incoming of data.words) {
    if (!incoming.huKey || !incoming.hu) continue;
    const existing = byKey.get(incoming.huKey);
    if (!existing) {
      byKey.set(incoming.huKey, incoming);
    } else {
      const mergedFoundIn = Array.from(new Set([...(existing.foundIn || []), ...(incoming.foundIn || [])]));
      byKey.set(incoming.huKey, {
        ...existing,
        en: existing.en || incoming.en,
        pos: existing.pos || incoming.pos,
        cefr: existing.cefr || incoming.cefr,
        foundIn: mergedFoundIn,
        updatedAt: Date.now(),
      });
    }
  }

  await bulkPutWords(Array.from(byKey.values()));

  if (Array.isArray(data.documents)) {
    const existingDocs = await getAllDocuments();
    const knownIds = new Set(existingDocs.map(d => d.id));
    for (const doc of data.documents) {
      if (!knownIds.has(doc.id)) await putDocument(doc);
    }
  }
}
