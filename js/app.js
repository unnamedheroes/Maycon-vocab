// js/app.js
//
// Application entry point. Holds the in-memory state (a mirror of what's in
// IndexedDB, kept for fast search/filter/sort) and wires together storage,
// document parsing, enrichment, and rendering.

import * as db from './db.js';
import { extractText } from './parsers.js';
import { extractUniqueWords, foldAccents } from './extraction.js';
import { enrichBatch } from './enrichment.js';
import { renderWordList, renderDocuments, renderFilterChips, openEditModal, setProgress } from './ui.js';

const state = {
  words: [],
  documents: [],
  search: '',
  posFilter: new Set(),
  cefrFilter: new Set(),
  sort: 'hu-asc',
  activeDocId: null,
  view: 'words',
};

const els = {};

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now() + '-' + Math.random().toString(16).slice(2);
}

function docsById() {
  return new Map(state.documents.map(d => [d.id, d]));
}

async function init() {
  cacheEls();
  bindEvents();

  // dedupeWords() also repairs any duplicate rows left over from an earlier,
  // buggier version of the app -- safe to run on every load.
  state.words = await db.dedupeWords();
  state.documents = await db.getAllDocuments();
  refreshFilterOptions();
  render();
}

function cacheEls() {
  els.fileInput = document.getElementById('file-input');
  els.search = document.getElementById('search-input');
  els.wordList = document.getElementById('word-list');
  els.docList = document.getElementById('doc-list');
  els.progress = document.getElementById('progress-banner');
  els.posFilters = document.getElementById('pos-filters');
  els.cefrFilters = document.getElementById('cefr-filters');
  els.sortSelect = document.getElementById('sort-select');
  els.wordCount = document.getElementById('word-count');
  els.viewWordsBtn = document.getElementById('view-words-btn');
  els.viewDocsBtn = document.getElementById('view-docs-btn');
  els.wordsPanel = document.getElementById('words-panel');
  els.docsPanel = document.getElementById('docs-panel');
  els.exportBtn = document.getElementById('export-btn');
  els.importInput = document.getElementById('import-input');
  els.activeDocBanner = document.getElementById('active-doc-banner');
  els.activeDocLabel = els.activeDocBanner.querySelector('span');
  els.clearDocFilter = document.getElementById('clear-doc-filter');
}

function bindEvents() {
  els.fileInput.addEventListener('change', e => {
    if (e.target.files.length) handleImport(Array.from(e.target.files));
    e.target.value = '';
  });

  els.search.addEventListener('input', () => { state.search = els.search.value; render(); });
  els.sortSelect.addEventListener('change', () => { state.sort = els.sortSelect.value; render(); });

  els.viewWordsBtn.addEventListener('click', () => switchView('words'));
  els.viewDocsBtn.addEventListener('click', () => switchView('documents'));

  els.wordList.addEventListener('click', e => {
    const editBtn = e.target.closest('[data-action="edit"]');
    const delBtn = e.target.closest('[data-action="delete-word"]');
    if (editBtn) {
      const word = state.words.find(w => w.id === editBtn.dataset.id);
      if (word) openEditModal(word, saveWord);
    } else if (delBtn) {
      const word = state.words.find(w => w.id === delBtn.dataset.id);
      if (word) deleteWord(word);
    }
  });

  els.docList.addEventListener('click', e => {
    const openBtn = e.target.closest('[data-action="open-doc"]');
    const delBtn = e.target.closest('[data-action="delete-doc"]');
    if (openBtn) {
      state.activeDocId = openBtn.dataset.id;
      switchView('words');
    } else if (delBtn) {
      deleteDocument(delBtn.dataset.id);
    }
  });

  els.clearDocFilter.addEventListener('click', () => { state.activeDocId = null; render(); });

  els.exportBtn.addEventListener('click', exportData);
  els.importInput.addEventListener('change', e => {
    if (e.target.files[0]) importData(e.target.files[0]);
    e.target.value = '';
  });
}

function switchView(view) {
  state.view = view;
  els.wordsPanel.classList.toggle('active', view === 'words');
  els.docsPanel.classList.toggle('active', view === 'documents');
  els.viewWordsBtn.classList.toggle('active', view === 'words');
  els.viewDocsBtn.classList.toggle('active', view === 'documents');
  render();
}

/* ---------- import pipeline ---------- */

async function handleImport(files) {
  for (const file of files) {
    try {
      setProgress(els.progress, `Reading ${file.name}...`);
      const text = await extractText(file);

      setProgress(els.progress, `Finding unique words in ${file.name}...`);
      const uniqueWords = extractUniqueWords(text);
      const byKey = new Map(state.words.map(w => [w.huKey, w]));

      const docId = uid();
      const toEnrich = [];
      // Work on copies so we never mutate state.words until the save
      // to IndexedDB has actually succeeded.
      const existingUpdates = [];

      for (const w of uniqueWords) {
        const existing = byKey.get(w);
        if (existing) {
          if (!existing.foundIn.includes(docId)) {
            existingUpdates.push({ ...existing, foundIn: [...existing.foundIn, docId], updatedAt: Date.now() });
          }
        } else if (!toEnrich.includes(w)) {
          toEnrich.push(w);
        }
      }

      setProgress(els.progress, `Looking up translations (0/${toEnrich.length}) — ${file.name}`);
      const enriched = await enrichBatch(toEnrich, (done, total) => {
        setProgress(els.progress, `Looking up translations (${done}/${total}) — ${file.name}`);
      });

      const newEntries = toEnrich.map(w => ({
        id: uid(),
        hu: w,
        huKey: w,
        en: (enriched[w] && enriched[w].en) || '',
        pos: (enriched[w] && enriched[w].pos) || '',
        cefr: (enriched[w] && enriched[w].cefr) || '',
        foundIn: [docId],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }));

      const doc = {
        id: docId,
        name: file.name,
        importedAt: Date.now(),
        totalExtracted: uniqueWords.length,
        newlyAdded: newEntries.length,
        duplicatesSkipped: uniqueWords.length - newEntries.length,
      };

      // Persist first. Only touch in-memory state once storage confirms it
      // actually went through, so the two never drift apart.
      await db.bulkPutWords([...newEntries, ...existingUpdates]);
      await db.putDocument(doc);

      for (const updated of existingUpdates) {
        const idx = state.words.findIndex(w => w.id === updated.id);
        if (idx !== -1) state.words[idx] = updated;
      }
      state.words.push(...newEntries);
      state.documents.push(doc);
    } catch (err) {
      console.error(err);
      setProgress(els.progress, `Problem importing ${file.name}: ${err.message}`);
      await new Promise(r => setTimeout(r, 3000));
    }
  }
  setProgress(els.progress, '', false);
  refreshFilterOptions();
  render();
}

/* ---------- word & document actions ---------- */

async function saveWord(updated) {
  const collision = state.words.find(w => w.id !== updated.id && w.huKey === updated.huKey);
  if (collision) {
    alert(`"${collision.hu}" already exists in your database. Choose a different spelling, or delete the other entry first.`);
    return;
  }
  try {
    await db.putWord(updated);
    const idx = state.words.findIndex(w => w.id === updated.id);
    if (idx !== -1) state.words[idx] = updated;
    refreshFilterOptions();
    render();
  } catch (err) {
    console.error(err);
    alert('Could not save that change: ' + err.message);
  }
}

async function deleteWord(word) {
  if (!confirm(`Delete "${word.hu}"? This cannot be undone.`)) return;
  try {
    await db.deleteWord(word.id);
    state.words = state.words.filter(w => w.id !== word.id);
    refreshFilterOptions();
    render();
  } catch (err) {
    console.error(err);
    alert('Could not delete that word: ' + err.message);
  }
}

async function deleteDocument(docId) {
  if (!confirm('Remove this document? Words it introduced will stay in your database.')) return;
  try {
    await db.deleteDocument(docId);
    const affected = state.words.filter(w => w.foundIn.includes(docId));
    const updated = affected.map(w => ({ ...w, foundIn: w.foundIn.filter(id => id !== docId) }));
    if (updated.length) await db.bulkPutWords(updated);

    state.documents = state.documents.filter(d => d.id !== docId);
    for (const u of updated) {
      const idx = state.words.findIndex(w => w.id === u.id);
      if (idx !== -1) state.words[idx] = u;
    }
    if (state.activeDocId === docId) state.activeDocId = null;
    render();
  } catch (err) {
    console.error(err);
    alert('Could not remove that document: ' + err.message);
  }
}

/* ---------- backup / restore ---------- */

async function exportData() {
  const data = await db.exportDatabase();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `word-wall-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

async function importData(file) {
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    await db.importDatabase(data, { merge: true });
    state.words = await db.dedupeWords();
    state.documents = await db.getAllDocuments();
    refreshFilterOptions();
    render();
  } catch (err) {
    alert(err.message || 'That file did not look like a Word Wall backup.');
  }
}

/* ---------- filters, search, sort, render ---------- */

function refreshFilterOptions() {
  const posSet = new Set(state.words.map(w => w.pos).filter(Boolean));
  const cefrOrder = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
  renderFilterChips(els.posFilters, Array.from(posSet).sort(), state.posFilter, opt => {
    state.posFilter.has(opt) ? state.posFilter.delete(opt) : state.posFilter.add(opt);
    refreshFilterOptions();
    render();
  });
  renderFilterChips(
    els.cefrFilters,
    cefrOrder.filter(l => state.words.some(w => w.cefr === l)),
    state.cefrFilter,
    opt => {
      state.cefrFilter.has(opt) ? state.cefrFilter.delete(opt) : state.cefrFilter.add(opt);
      refreshFilterOptions();
      render();
    }
  );
}

function computeFilteredWords() {
  const q = foldAccents(state.search.trim().toLowerCase());
  let list = state.words;

  if (state.activeDocId) list = list.filter(w => w.foundIn.includes(state.activeDocId));
  if (q) {
    list = list.filter(w =>
      foldAccents(w.hu.toLowerCase()).includes(q) ||
      foldAccents((w.en || '').toLowerCase()).includes(q)
    );
  }
  if (state.posFilter.size) list = list.filter(w => state.posFilter.has(w.pos));
  if (state.cefrFilter.size) list = list.filter(w => state.cefrFilter.has(w.cefr));

  const cefrRank = { A1: 1, A2: 2, B1: 3, B2: 4, C1: 5, C2: 6, '': 7 };
  return [...list].sort((a, b) => {
    if (state.sort === 'en-asc') return (a.en || '').localeCompare(b.en || '', 'en');
    if (state.sort === 'cefr') return (cefrRank[a.cefr] || 7) - (cefrRank[b.cefr] || 7) || a.hu.localeCompare(b.hu, 'hu');
    return a.hu.localeCompare(b.hu, 'hu');
  });
}

function render() {
  const filtered = computeFilteredWords();
  els.wordCount.textContent = `${filtered.length} word${filtered.length === 1 ? '' : 's'}`;
  renderWordList(els.wordList, filtered, docsById());
  renderDocuments(els.docList, state.documents);

  if (state.activeDocId) {
    const doc = state.documents.find(d => d.id === state.activeDocId);
    els.activeDocBanner.classList.add('visible');
    els.activeDocLabel.textContent = doc ? `Showing words from "${doc.name}"` : '';
  } else {
    els.activeDocBanner.classList.remove('visible');
  }
}

init();
