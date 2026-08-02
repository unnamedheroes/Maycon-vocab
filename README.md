# Word Wall

A personal, offline-capable Hungarian–English vocabulary database. Import your
own `.docx`, `.pdf`, or `.txt` documents and it extracts every unique
Hungarian word, translates it, tags its part of speech, guesses a CEFR level,
and remembers which document(s) it came from.

No build step, no backend, no account. It's a static site — host it anywhere,
or just open `index.html` after your first online visit and it keeps working
offline.

## How it works

- **Import**: `.docx` is read with [mammoth.js](https://github.com/mwilliamson/mammoth.js),
  `.pdf` with [pdf.js](https://mozilla.github.io/pdf.js/), `.txt` directly.
- **Extraction**: every run of letters (2+ characters) is treated as a
  candidate word (`js/extraction.js`), deduplicated per document.
- **Enrichment**: new words are translated via the free
  [MyMemory](https://mymemory.translated.net/) API, part of speech via the free
  [dictionaryapi.dev](https://dictionaryapi.dev/) (with a small offline
  suffix-based fallback), and CEFR level via a local heuristic
  (`js/enrichment.js`, reference data in `js/data/core-vocab.js`). All of this
  is approximate — every field is editable in the app.
- **Storage**: everything lives in the browser's IndexedDB (`js/db.js`), so it
  persists across sessions with no server, and scales far better than
  `localStorage` for a large vocabulary.
- **Offline**: `service-worker.js` caches the app shell (HTML/CSS/JS and the
  two reader libraries) the first time it loads successfully. After that, the
  app opens and works with no connection — only translation/dictionary
  lookups for *new* words need the network.

## File structure

```
index.html              entry point
manifest.json           PWA install metadata
service-worker.js        offline caching
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

Each module has one job, so e.g. adding a new file format only touches
`parsers.js`, and swapping the storage engine only touches `db.js`.

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

## Installing for offline use

Open the hosted link once while online. Most browsers will offer an
"Install" or "Add to Home Screen" option (address bar on desktop Chrome/Edge,
share menu on mobile Safari/Chrome). After installing, the app opens and
works with no connection — new documents can still be imported offline, but
translation/CEFR/part-of-speech lookups for brand-new words will wait until
you're back online (they're safely queued as "not yet enriched" and can be
edited by hand any time).

## Known limitations

- CEFR levels and parts of speech are best-effort guesses, not certified —
  correct them by hand as needed.
- Free translation/dictionary APIs are rate-limited; very large documents
  (thousands of new unique words) may take a while to fully enrich.
- Removing a document only removes it from each word's "found in" list —
  words themselves are never deleted automatically, so nothing you've
  corrected by hand is ever lost.
