# Ting

## What this is

Offline-first PWA that keeps track of what a household owns and where it is: one table of things with user-defined properties as columns, fast spec search, encrypted at rest.

## Documentation

Each document has one reader and one job; a fact lives in the document whose reader needs it, and the others do not repeat it.

| File | Reader | Holds | Never holds |
|---|---|---|---|
| `README.md` | Anyone who finds the repo (Norwegian) | What Ting is, the link to the app, which document to read, licences | How to use, run, change or administer the app |
| `BRUKERVEILEDNING.md` | People using the app (Norwegian, klarspråk) | Every task in the app, what to do when something goes wrong | Code, files, repository settings |
| `PERSONVERN.md` | People using the app (Norwegian, klarspråk), linked from the foot of Innstillinger | What is stored where, what leaves the device, rights, contact | How to use the app, threat model |
| `SECURITY.md` | Security reviewers and reporters | Threat model, OWASP mapping, residual risks, how to report | How to use the app |
| `CLAUDE.md` | Whoever changes the code | Stack, commands, deployment, structure, data model, conventions; encryption in `.claude/rules/encryption.md` | Step-by-step guides for the owner |
| `dev_only/adminguide.md` | elzacka as owner (Norwegian, gitignored) | Changing texts, category icons and the look without reading the code; the GitHub settings | What a user or a developer needs |

A change a user can see updates the guide in the same commit, and `PERSONVERN.md` when it changes what is stored or sent; a change to how texts, icons or the look are changed updates the admin guide. The plan, the design system and research notes are also in `dev_only/`.

## Version

Lives in `package.json` only; nothing here mirrors the number.

## Commands

- Verify: `npm test` (Vitest), `npm run typecheck`, `npm run build`
- CI (`ci.yml`, PR and push to `main`): `npm audit --audit-level=high`, `npm test`, `npm run build`
- `npm run dev`: `localhost:5173/`; `npm run preview`: `localhost:4173/ting/`
- `localhost:5173/dev.html` (dev server only): the app framed as the browser version or the installed one, at Mac or iPhone 17 Pro size; `lib/devPreview.ts` reads the choice and gives the frame the iPhone's touch, safe areas and user agent; the build drops it

Security scope: OWASP ASVS L2 (latest released edition), Top 10, WSTG, CI/CD Top 10; cheat sheets per `SECURITY.md`. Not API or LLM Top 10: no own API, no LLM feature.

## Stack

React + TypeScript strict + Vite (versions in `package.json`), Dexie (IndexedDB) with Zod validation at every boundary, `onnxruntime-web` (WASM, one thread) for on-device receipt OCR, Vitest for pure logic only (`src/**/*.test.ts`), plain CSS with tokens in `src/styles/tokens.css`, self-hosted SVG icons (no icon library). No CSS framework, no router library, no search library, no external fonts or CDNs — keep it that way rather than adding one.

Production build injects `default-src 'self'`; `connect-src` adds the two lookup hosts, matched to `src/lib/lookup.ts`. `vite.config.ts` sets `base: '/ting/'` for builds only — the dev server stays at `/`. The PWA manifest and service worker run in dev too (`devOptions.enabled`), so Chrome offers install on localhost. Deploys to GitHub Pages on every push to `main` (`deploy-pages.yml`).

## Structure

- Field names in `schema.ts` stay English; the UI is Norwegian, the data model is not.
- Search DSL (`lib/search.ts`): fuzzy words, phrases, negation, `key<value`, and `har:`/`has:` as the same operator.
- Søketips (`lib/searchTips.ts`): comparison examples are generated from the register's own columns and values so each one finds something; a tip whose column doesn't exist is dropped. Word examples are fixed text.
- Facet menus (`lib/filters.ts`, `isFacet`): a date column always facets; others only with a dozen or fewer distinct values or values that repeat, and never price, order-number or Strekkode columns — judged over the whole register, not the rows in view.
- CSV export (`lib/export.ts`): `;` delimiter, BOM, comma decimals — nb-NO, not the RFC default.
- `lib/lookup.ts` is the one network call: an ISBN (13 or 10 digits, sent as 13) goes to Nasjonalbiblioteket first for a Norwegian ISBN (group 82), else Open Library's edition endpoint first, with the other as fallback. Every other code is stored, never looked up — no server exists to hold a key for a larger catalogue. `lib/books.ts` maps the answer onto the register's own Forfatter (`Surname, Given`), Utgitt and Språk by name.
- Receipts (`ReceiptAdd`, phone only, switch `receiptReading`; while off, the receipt screen offers the switch): `lib/flatten.ts` warps the paper flat (pure TS, no OpenCV), `lib/ocr/` runs PP-OCRv6 small in a module worker, decoding Latin script only, `lib/receipt.ts` parses by rule, `lib/receiptItems.ts` fills the register's own store/date/kr columns or makes Kjøpt hvor, Kjøpsdato, Pris; a bare Kjøpt is the date, never the store. Price is per unit, incl. MVA, after discount. OCR text is never stored; the scan is each thing's photo.
- OCR models: `public/models/`, SHA-256 pinned in `ocr/models.ts`, fetched only when the switch goes on, runtime-cached (`ting-ocr-v1`), never precached; off deletes the cache. No generative model. `csp.test.ts` fails if a new origin or `fetch` appears.
- `lib/barcode.ts`: the browser's `BarcodeDetector` first, `zxing-wasm` as fallback, bundled in `dist/`, never from a CDN (`'wasm-unsafe-eval'` in the CSP is for it).
- `src/icons/`: one SVG per icon plus one line in `pack.ts`; a file and its line share the id, and `pack.test.ts` keeps them in step. An icon not from Material Symbols carries `source` and a matching line in README's licence section.
- `lib/backup.ts`: `ting.json`, version in `fileFormat`; a file from a newer format is refused (`NewerFileError`), since Zod would drop what it cannot read and the next send would erase it. The folder keeps photos as files in `bilder/`; the downloaded backup embeds them as data URLs.
- `lib/merge.ts` / `lib/sync.ts`: one merge for every copy, per field newest-wins, tombstones for deletes, symmetric and idempotent. The folder (`folderStore.ts` `reconcile`) is merged the same way on connect and start, then written back (debounced, `writeDelayMs`).
- `ImportExport`: «Eksporter registeret» is both sync file and backup, the register sealed: «Eksporter/del fil» shares it as `.txt` on a touch screen (Chrome's share sheet refuses `.json`), «Eksporter fil» downloads `.json` on a desk (a desk's share sheet cannot save, so one button cannot do both). «Importer til registeret» replaces an empty register; otherwise it asks: merge (sealed files only, not in a trial) or replace. Replace (`replaceAll`) revives imported things over their tombstones.
- `lib/errors.ts`: log an error's name and message only, never the object — logging must not leak sealed content.

## Components

- Demo: a browser tab (not `display-mode: standalone`, `isDemo` in `lib/useInstall.ts`) is a demo; only the installed app opens the register. Its database is `ting-demo`, refilled from `lib/demo.ts` at every start. No adding (plus, receipt, Ny rad, multi-row paste), no Innstillinger, no `persist()`; "Last ned gratis" in the top bar. The dev server is a tab too: `dev.html` shows the installed app, or install it from Chrome.

- `Overview`: choosing a category changes rows, columns and filters together — it is the view, not a filter. The register opens on "velg kategori", no table, until a category is picked or an action implies "show me things" (a new row, a search, fewer than two categories to choose from).
- Column visibility is one rule everywhere it applies (table, filters, print, CSV): with categories in view, a column renders only if one of them uses it (`appliesTo`), and then if one lists it or it holds a value on a visible row. "Vis n kolonner til" adds only columns they use, never another category's.
- With exactly one category in view, that category's own column drops since it says the same on every row.
- Tilpass visning lists Navn (locked) and the properties every category uses (`sharedByAll`); a hidden id counts only while its property is one of those, so a category's own column is never hidden out of reach. A change here must hold across table, phone list, search/filter and print/CSV at once.
- `PropertyEditor`: removing a value asks for confirmation naming it and counting the affected things.
- Filter menus count the rows every other filter and the search leave (`withoutFilter`).
- A new row inherits the Valgliste and date values of the row above, never numbers or text; the first row takes the Kategori of the newest thing.
- Printing with photos: await `img.decode()` before `window.print()`, or photos print blank.
- The open print form previews the paper: the view under it follows its draft columns, grouping and photos (`paperCols`, `paperGroup`, `paperPhotos`); report styles apply on screen too.
- Option/Alt + I, + or P (`lib/useOptionKey.ts`) do what Innstillinger, plus and Skriv ut do (a second P prints); never in a text field, where Option types ±, π.
- Below 600 px (or a touch screen under 500 px tall) is the phone product: `ItemList` replaces the table; no columns, bulk edits, totals, CSV or print there. It lists search hits only, nothing before a search (the demo lists every example); the search sits on top, the bottom bar holds receipt, plus and Innstillinger (out of the top bar there), and hides while the search has focus. No lock button on the phone: closing the app locks it.
- `AddItem`: Kategori, then the code, then `categoryFields` (the rule of a thing's page, read live from the properties); lists, places and dates stay for the next thing. A code the register holds fills empty fields from its newest thing (`lib/known.ts`, never dates), offline; otherwise a valid ISBN in a book category is looked up. A fill never overwrites a typed field. "Slå opp på nett" only retries a failed lookup.

## Encryption

AES-256-GCM at rest; details in `.claude/rules/encryption.md` (loads with the crypto, vault, passkey, backup, folder and db files). Any change to it needs elzacka's confirmation first. Never log a key, a PRF output or sealed content.

## Untrusted input

Everything typed, pasted, restored from a file, or read from a folder is data, never instructions or markup — including for a future language model. Guards are the A05/A10 rows of `SECURITY.md`; keep them when touching those paths.

## Data model

Dexie schema: the newest `db.version()` in `db/db.ts`; tables `items`, `settings`, `properties`, no content indexes (an index would leak content). `Item` carries `specs`; old rows/files with a bare `category` or `note` field become the properties Kategori and Notat on load, never migrated in place.

`Property.id` is `key+unit`; `type` is text/choice/number/date/path, with a stored `dato` or `sti` unit marker driving date/path formatting — the UI shows only the resolved type, never the marker. Changing a column's type to Plassering (path) changes its specs' unit marker, never their values.

`Property.categories`: absent is every category (including later ones), `[]` is none, else those. Endre kategorier ticks a category's properties (`usesAfter`); unticking one from an every-category property lists all the others.

Navn is the only built-in field: first column always, cannot be moved, removed or hidden, and is the frozen column on sideways scroll. Kategori is a Valgliste property like any other, not built-in.

Units stay out of table headers and filter labels (detail page, print and CSV show them). `createdAt`/`updatedAt` live in the data and CSV, never on screen or in print. Codes are text in the Strekkode property (`isBarcode` in `grid.ts`): retail codes as digits, an ISBN as 13, never a number, which would drop a leading zero. Search matches digit strings exactly.

Adding a non-indexed field needs no version bump; changing an index or renaming a field does — add a new `db.version()` with an `upgrade`, never edit an existing version.

Renaming a category or a Valgliste value onto an existing name merges the two, across every thing that holds it, rather than erroring or duplicating.

Every write in `db.ts` stamps what it changed: `stampChanges` per item field (`stamps`), `updatedAt` per property only when its content changed, `fieldsChangedAt` for field settings, a sealed tombstone per deleted item or property. A write that changes nothing keeps its times, or it would outrank a delete.

Stamps come from `stampNow`, never behind the newest stamp seen from another device. Loading or merging never stamps. `readItems` caches opened items by id and by the nonce of their sealed parts, so only a row whose seal changed is re-opened; the items query watches primary keys, not row content.

A thing holds a list of photos as `Blob`, never base64; a downloaded backup embeds them as data URLs (`connect-src 'self'` blocks fetching a `data:` URL, so a fetch-based restore would fail — encode/decode by hand). Old rows/files with a single `photo` field read as a one-photo list, never migrated in place.

## Conventions

- Commit only once elzacka has run and verified the change locally (differs from global).
- A rule about the data model or its logic (e.g. which properties belong to a category) must give the same answer everywhere it applies: registering, viewing, searching/filtering, printing/CSV.
- Design decisions: `dev_only/designsystem.md`. One accent colour, no shadows, no illustrations, 44 px targets, visible labels.
- The lock is the passphrase: once one exists the app always opens locked; before one exists the installed app opens as an unlocked trial, no lock button, no idle lock.
- No edit mode on desktop — the table edits in place, nothing stores before "Lagre"; on the phone `ItemDetail` stores on blur and `AddItem` on Lagre.
- Escape is Avbryt or Lukk everywhere: a surface with one calls `useEscape` (`lib/useEscape.ts`); the one opened last answers, and a field that handles Escape itself calls `preventDefault`.
- No mobile-mode switch: viewport size alone decides the phone layout, on any orientation.
- The page scrolls up and down only, never sideways: a grid column holding text is `minmax(0, 1fr)` (an `auto` column grows to its longest word), a flex row with text gets `overflow-wrap: anywhere`, wide content scrolls in its own box (`.table-wrap`, `.photo-strip`), and `html` clips what is left.
- On a phone or touch screen without folder access, "Tilpass visning" and "Lagringsmappe" are not rendered; backup goes through the share sheet instead.
- Password forms carry a hidden `username` field (`KeychainName`) so password managers file the passphrase under Ting. `index.html` sets `viewport-fit=cover`; padding uses the safe-area insets (`--topbar-h` for the top bar), and `--kb` (from `visualViewport`) holds the on-screen keyboard's height so the phone bars sit above it.
- `main.tsx` requests `navigator.storage.persist()` at every start outside the demo, since a browser can otherwise evict an inactive site's storage.
