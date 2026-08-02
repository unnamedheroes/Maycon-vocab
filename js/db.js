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
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_WORDS, 'readwrite');
    const store = tx.objectStore(STORE_WORDS);
    for (const w of words) store.put(w);
    // Resolve/reject on the *transaction*, not individual requests -- if any
    // single put() fails (e.g. a uniqueness clash), IndexedDB rolls back the
    // whole transaction even for requests that already reported success, so
    // that's the only truthful signal to wait on.
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Save was rolled back.'));
  });
}

export async function deleteWord(id) {
  const store = await getStore(STORE_WORDS, 'readwrite');
  return reqToPromise(store.delete(id));
}

/**
 * Repairs duplicate rows that share the same huKey (this can happen from an
 * older version of the app, or from a partially-failed import). Merges each
 * group into a single record -- keeping the union of "found in" documents
 * and the first non-empty value for each field -- and removes the extras.
 * Safe to call every time the app starts; it's a no-op once data is clean.
 */
export async function dedupeWords() {
  const words = await getAllWords();
  const byKey = new Map();
  const toDelete = [];

  for (const w of words) {
    const key = w.huKey || (w.hu || '').toLowerCase();
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...w, huKey: key });
    } else {
      byKey.set(key, {
        ...existing,
        en: existing.en || w.en,
        pos: existing.pos || w.pos,
        cefr: existing.cefr || w.cefr,
        foundIn: Array.from(new Set([...(existing.foundIn || []), ...(w.foundIn || [])])),
        updatedAt: Date.now(),
      });
      toDelete.push(w.id);
    }
  }

  const cleaned = Array.from(byKey.values());
  if (toDelete.length > 0) {
    await bulkPutWords(cleaned);
    await Promise.all(toDelete.map(id => deleteWord(id)));
  }
  return cleaned;
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
