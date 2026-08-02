// js/ui.js
//
// Framework-free DOM rendering. Each function takes the data it needs and
// (re)renders one part of the page. Word lists are paginated client-side so
// the DOM stays light even with a very large vocabulary.

const PAGE_SIZE = 150;

export function renderWordList(container, words, page = 1) {
  const visible = words.slice(0, page * PAGE_SIZE);
  container.innerHTML = '';

  if (words.length === 0) {
    container.innerHTML = '<p class="empty-state">No words yet. Import a document to get started.</p>';
    return;
  }

  const frag = document.createDocumentFragment();
  for (const w of visible) frag.appendChild(wordCardEl(w));
  container.appendChild(frag);

  if (visible.length < words.length) {
    const btn = document.createElement('button');
    btn.className = 'load-more';
    btn.textContent = `Show more (${words.length - visible.length} left)`;
    btn.addEventListener('click', () => renderWordList(container, words, page + 1));
    container.appendChild(btn);
  }
}

function wordCardEl(word) {
  const el = document.createElement('div');
  el.className = 'word-card';
  const foundInCount = (word.foundIn || []).length;
  el.innerHTML = `
    <div class="word-card-main">
      <div class="word-hu">${escapeHtml(word.hu)}</div>
      <div class="word-en">${escapeHtml(word.en || '—')}</div>
    </div>
    <div class="word-tags">
      ${word.pos ? `<span class="tag tag-pos">${escapeHtml(word.pos)}</span>` : ''}
      ${word.cefr ? `<span class="tag tag-cefr tag-cefr-${escapeAttr(word.cefr)}">${escapeHtml(word.cefr)}</span>` : ''}
    </div>
    <div class="word-found-in">${foundInCount} document${foundInCount === 1 ? '' : 's'}</div>
    <button class="edit-btn" data-action="edit" data-id="${escapeAttr(word.id)}" aria-label="Edit ${escapeAttr(word.hu)}">✎</button>
  `;
  return el;
}

export function renderDocuments(container, documents) {
  container.innerHTML = '';
  if (documents.length === 0) {
    container.innerHTML = '<p class="empty-state">No documents imported yet.</p>';
    return;
  }
  const sorted = [...documents].sort((a, b) => b.importedAt - a.importedAt);
  for (const doc of sorted) {
    const el = document.createElement('div');
    el.className = 'doc-card';
    el.innerHTML = `
      <div class="doc-name">${escapeHtml(doc.name)}</div>
      <div class="doc-stats">
        <span>${doc.totalExtracted} words</span>
        <span class="doc-new">+${doc.newlyAdded} new</span>
        <span class="doc-dup">${doc.duplicatesSkipped} duplicate${doc.duplicatesSkipped === 1 ? '' : 's'}</span>
      </div>
      <div class="doc-actions">
        <button data-action="open-doc" data-id="${escapeAttr(doc.id)}">View words</button>
        <button data-action="delete-doc" data-id="${escapeAttr(doc.id)}" class="danger">Remove</button>
      </div>
    `;
    container.appendChild(el);
  }
}

export function openEditModal(word, onSave) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true">
      <h2>Edit word</h2>
      <label>Hungarian<input type="text" id="edit-hu" value="${escapeAttr(word.hu)}" /></label>
      <label>English<input type="text" id="edit-en" value="${escapeAttr(word.en || '')}" /></label>
      <label>Part of speech
        <select id="edit-pos">
          ${['', 'noun', 'verb', 'adjective', 'adverb', 'pronoun', 'preposition', 'conjunction', 'interjection', 'numeral']
            .map(p => `<option value="${p}" ${p === word.pos ? 'selected' : ''}>${p || '(none)'}</option>`).join('')}
        </select>
      </label>
      <label>CEFR level
        <select id="edit-cefr">
          ${['', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2']
            .map(l => `<option value="${l}" ${l === word.cefr ? 'selected' : ''}>${l || '(none)'}</option>`).join('')}
        </select>
      </label>
      <div class="modal-actions">
        <button data-action="cancel">Cancel</button>
        <button data-action="save" class="primary">Save</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.querySelector('[data-action="cancel"]').addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  overlay.querySelector('[data-action="save"]').addEventListener('click', () => {
    onSave({
      ...word,
      hu: overlay.querySelector('#edit-hu').value.trim() || word.hu,
      huKey: (overlay.querySelector('#edit-hu').value.trim() || word.hu).toLowerCase(),
      en: overlay.querySelector('#edit-en').value.trim(),
      pos: overlay.querySelector('#edit-pos').value,
      cefr: overlay.querySelector('#edit-cefr').value,
      updatedAt: Date.now(),
    });
    close();
  });
}

export function renderFilterChips(container, options, selectedSet, onToggle) {
  container.innerHTML = '';
  for (const opt of options) {
    const btn = document.createElement('button');
    btn.className = 'chip' + (selectedSet.has(opt) ? ' active' : '');
    btn.textContent = opt;
    btn.addEventListener('click', () => onToggle(opt));
    container.appendChild(btn);
  }
}

export function setProgress(el, message, visible = true) {
  el.textContent = message || '';
  el.classList.toggle('visible', Boolean(visible && message));
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function escapeAttr(str) { return escapeHtml(str); }
