# Word Wall (online version)

A personal Hungarian–English vocabulary database. Import your own `.docx`,
`.pdf`, or `.txt` documents and it extracts every unique Hungarian word,
translates it, tags its part of speech, guesses a CEFR level, and remembers
which document(s) it came from.

No build step, no backend, no account, nothing to install — just a link.
Requires an internet connection every time you use it (for the document
readers, loaded from a CDN, and for translation/dictionary lookups).

## How it works

- **Import**: `.docx` is read with [mammoth.js](https://github.com/mwilliamson/mammoth.js),
  `.pdf` with [pdf.js](https://mozilla.github.io/pdf.js/), `.txt` directly.
- **Extraction**: every run of letters (2+ characters) is treated as a
  candidate word (`js/extraction.js`), deduplicated per document.
- **Enrichment**: new words are translated via the free
  [MyMemory](https://mymemory.translated.net/) API, part of speech via the free
  [dictionaryapi.dev](https://dictionaryapi.dev/) (with a small suffix-based
  fallback), and CEFR level via a local heuristic (`js/enrichment.js`,
  reference data in `js/data/core-vocab.js`). All of this is approximate —
  every field is editable in the app.
- **Storage**: everything lives in the browser's IndexedDB (`js/db.js`), so
  your vocabulary persists across visits on the same browser/device with no
  server. Use Export/Import to move it to another device.

## File structure

```
index.html              entry point
css/styles.css           all styling
js/
  app.js                 wires everything together, owns app state
  db.js                   IndexedDB access (the only file that touches storage)
  parsers.js              docx/pdf/txt -> plain text
  extraction.js            plain text -> unique word list
  enrichment.js            translation + part of speech + CEFR
  ui.js                    DOM rendering
  data/core-vocab.js       heuristic reference word lists
icons/icon.svg            app icon
```

## Running it locally

Because it uses ES modules, opening `index.html` directly from disk
(`file://`) will not work in most browsers — serve it over `http://` instead.
From this folder:

```
python3 -m http.server 8000
```

then visit `http://localhost:8000`.

## Deploying so you have a link to share

**GitHub Pages**
1. Create a new public repository and upload everything in this folder
   (keep the folder structure as-is).
2. Go to *Settings → Pages*, set the branch to `main` and the folder to `/`.
3. Your app will be live at `https://<username>.github.io/<repo>/`.

**Netlify Drop**
1. Go to [app.netlify.com/drop](https://app.netlify.com/drop).
2. Drag this whole folder onto the page. You'll get a live link instantly.

## Known limitations

- Needs internet every time it's opened — the document readers load from a
  CDN and aren't cached for offline use in this version.
- CEFR levels and parts of speech are best-effort guesses, not certified —
  correct them by hand as needed.
- Free translation/dictionary APIs are rate-limited; very large documents
  (thousands of new unique words) may take a while to fully enrich.
- Vocabulary data is stored per-browser (IndexedDB) — it doesn't
  automatically sync between devices; use Export/Import for that.
- Removing a document only removes it from each word's "found in" list —
  words themselves are never deleted automatically.
