# CLAUDE.md

Project rules for Ting. Global rules in `~/.claude/CLAUDE.md` apply on top.

## What this is

Offline-first PWA that keeps track of what a household owns and where it is: one table of things with user-defined properties as columns, fast spec search, encrypted at rest. Plan and design system live in `dev_only/` (gitignored). User documentation is `BRUKERVEILEDNING.md` (Norwegian, klarspråk); `README.md` describes the app, `SECURITY.md` the threat model. A change a user can see updates the guide in the same commit.

## Version

0.1.0 (MAJOR.MINOR.PATCH). Bump here and in `package.json` together.

## Stack

| Layer | Choice |
|---|---|
| UI | React 19, TypeScript strict, Vite |
| Data | Dexie (IndexedDB), Zod at every boundary |
| Offline | vite-plugin-pwa (Workbox), `registerType: 'prompt'` |
| Icons | Self-hosted SVG paths in `src/components/Icons.tsx` |
| Tests | Vitest, pure logic only (`src/**/*.test.ts`) |
| Styling | Plain CSS, tokens in `src/styles/tokens.css` |

No CSS framework, no router library, no search library, no external fonts or CDNs. Production build injects a `default-src 'self'` CSP; `connect-src` adds the three lookup hosts.

Deployed to GitHub Pages at https://elzacka.github.io/ting/ by `.github/workflows/deploy-pages.yml` on every push to `main`; `.github/workflows/ci.yml` runs tests and build on pull requests. `vite.config.ts` uses `base: '/ting/'` for builds only; the dev server stays at `/`. The PWA manifest and service worker are served in dev too (`devOptions.enabled`), so Chrome offers install on localhost.

## Commands

| Command | Does |
|---|---|
| `npm run dev` | Dev server on 5173 |
| `npm run build` | Typecheck then production build to `dist/` |
| `npm run preview` | Serve `dist/` |
| `npm test` | Unit tests |
| `npm run typecheck` | `tsc` only |

## Structure

| Path | Holds |
|---|---|
| `src/db/schema.ts` | Zod schemas and types. Field names are English; the plan's Norwegian names map 1:1 |
| `src/db/db.ts` | Dexie instance, `addItem`, `updateItem`, `deleteItem` |
| `src/db/useSealedQuery.ts` | Subscription hook over Dexie `liveQuery`: watches sealed rows, reads the decrypted view |
| `src/lib/search.ts` | Query parser and matcher: fuzzy words, phrases, negation, `key<value`, `has:`. Pure and tested |
| `src/lib/grid.ts` | Items to table columns and cells and back. Pure and tested |
| `src/lib/export.ts` | CSV (`;`, BOM, comma decimals) and download helper. Tested |
| `src/lib/filter.ts` | `parseNumber`, `distinct` |
| `src/lib/filters.ts` | Filter values with counts per column (a date column facets by year), `applyFilters`, `withoutFilter` (what one menu counts: the rows every other filter and the search leave). Tested |
| `src/lib/format.ts` | nb-NO numbers and dates, real minus sign, narrow no-break space before units |
| `src/lib/strings.ts` | Every user-facing string. Nothing hardcoded in components |
| `src/lib/route.ts` | Hash router: `#/` and `#/oversikt` (the one main screen; `#/registrer` is an alias), `#/innstillinger`, `#/ting/ny`, `#/ting/:id` |
| `src/lib/backup.ts` | `ting.json` format (format 1). Folder copy keeps photos as files in `bilder/`; download copy embeds them as data URLs. Tested |
| `src/lib/folderStore.ts` | File System Access: pick folder, permissions, read, write, reconcile (newer side wins) |
| `src/lib/useFolderSync.ts` | Keeps the folder in sync after every change, debounced 500 ms. Skips the first emission after reconcile |
| `src/lib/prefs.ts` | Per-device flag in localStorage: the idle-lock setting (default on) |
| `src/lib/useAutoLock.ts` | Locks after 10 minutes without pointer or key input; re-checks when the tab becomes visible. Paused while the table has unsaved edits; can be turned off on Innstillinger |
| `src/lib/errors.ts` | `errorText`: what gets logged about an error (name and message, never the object) |
| `src/lib/summary.ts` | The line above the table: totals per kr property, what is missing (each a search). Pure and tested |
| `src/lib/useRowWindow.ts` | Both tables and the phone list render only the rows on screen (fixed row height, page scroll, padding keeps the height) |
| `src/lib/useNarrow.ts` | True below 600 px: the phone product. Not a mode, the width decides |
| `src/lib/barcode.ts` | `classify` (isbn, ean, upc by GS1 check digit, else other), `cleanCode`, `decodeImage`: the browser's `BarcodeDetector` first, then `zxing-wasm` (the one image dependency; its wasm ships in `dist/`, precached, loaded on the first scan, never from a CDN; `'wasm-unsafe-eval'` in the CSP is for it). Tested |
| `src/lib/lookup.ts` | The one network call: "Slå opp på nett" sends the digits of a retail code to Open Library (ISBN) or Open Products Facts then Open Food Facts (EAN, UPC), and returns a name for the user to review. The three hosts are the `connect-src` list in `vite.config.ts`; change both together |
| `src/lib/paste.ts` | `parseBlock`: a spreadsheet block (tabs, newlines) for the table, filling right and down from the cell it lands in; `splitLinks`: http(s) addresses in text, for the detail page. Tested |
| `src/components/` | One file per screen or reusable piece. `Overview` is the main screen, one card: a head line (count, totals, the gaps and Vis tomme kolonner as links, small and grey, at the left; the add, add-column, CSV and print icons at the right, Slett valgte beside them while rows are ticked), a tinted band with whatever is open (search and filters, the print form, the column form), then the table, whose foot row reads Legg til ting and becomes a new row on click (print asks which columns go on paper, Navn always; the table narrows to the choice while the browser takes its snapshot), search and filters, the table (a name is a link; any other cell turns its row into inputs; unsaved edits stay in memory until "Lagre", which sticks to the bottom while there is something to save). `Grid` is the table skeleton (widths, header cells with resize, windowed body). `ItemDetail` shows a thing, sets its photo and deletes it (every other field is a column in the table). Below 600 px the overview is `ItemList` instead: search and a list of hits (thumbnail, name, the Valgliste values), no columns, totals or reports; `useNarrow` decides. `AddItem` is the phone's way in (`#/ting/ny`): camera, Navn, Strekkode (scan from a photo of the label, or type; Slå opp på nett for retail codes) and the Valgliste columns, saved one thing at a time; the Valgliste values stay for the next thing. `ItemDetail` shows a thing with every column as a row, each edited in place and stored when left (Enter or blur; Escape drops it), sets its photo and deletes it. `ErrorBoundary` wraps `main` |
| `src/styles/` | `tokens.css`, `base.css`, `components.css` |

## Encryption

Everything stored is sealed: AES-256-GCM (WebCrypto) under a random data key (DEK); the DEK is wrapped by a key derived from the passphrase with Argon2id (`@noble/hashes`, m=64 MiB, t=3, p=1). `src/lib/crypto.ts` holds the primitives, `src/lib/vault.ts` the session key (memory only; the app opens locked, `lock()` zeroes the key). `src/db/db.ts` seals every row: items as one sealed JSON document plus sealed photo bytes, properties as sealed documents, field settings as a sealed setting. Only ids, the folder handle, `localChangedAt` and the vault (wrapped key, salt, parameters) are in the clear. Files on disk are envelopes (`src/lib/backup.ts`): vault in the clear, document sealed; photos in the folder are `bilder/<id>.bin` = 12-byte nonce + ciphertext. A file sealed on another device opens with the passphrase and its key is adopted, so devices converge on one DEK. Plain (unsealed) files and rows still load; rows are sealed on the first unlock.

Changing anything here needs elzacka's confirmation first (global rule on auth, crypto and access control). Threat model and the OWASP Top 10:2025 mapping: `SECURITY.md`.

## Untrusted input

Everything a user types, pastes, restores from a file or reads from a folder is data, never instructions or markup. The guards, path by path, are the A05 and A10 rows of `SECURITY.md`; keep them when changing those paths. The rule for a future language model is there too.

## Data model

Dexie version 4: tables `items` (`id` only), `settings` (`key`) and `properties` (`id` only). No content indexes: they would leak content. Decrypted shapes: `Item` (id, name, specs, photo, createdAt, updatedAt; rows and files may also carry `category` or `note`, which become the properties Kategori and Notat on load, and `ensureCategoryProperty` creates the Kategori property row, a Valgliste at order -2, on unlock if things carry one and it is missing), `Property` (column definitions: `id` = key+unit, `key`, `unit`, `createdAt`, optional `order`, `type`: text, choice, number, date, and `options` for choice columns). A date property carries the internal unit marker `dato` so its specs format as dates; the UI shows the type, never that marker. Units are not shown in table headers or filter labels (elzacka, 19 September 2026); they appear on the detail page, in the print report and in CSV. Missing `type` on old rows means text, or date if the marker is set. Column order comes from `columnDefs` in `src/lib/fields.ts`: Navn first, always, then the properties by `order`. Navn's label lives in `settings` under key `fields`. Navn cannot be moved or removed: it is the identity of an item everywhere, and the frozen column when the table scrolls sideways. A column that holds no value for any row on screen is not rendered; the toolbar's "Vis n tomme kolonner" brings them back. The same order and labels apply in the table, filters, print and CSV. `createdAt` and `updatedAt` are kept in the data and in CSV but not shown anywhere in the app or the print report (elzacka, 19 September 2026). A property exists independently of item values; removing one strips the matching spec from every item. Adding non-indexed fields needs no version bump. Changing indexes or renaming fields does: add `db.version(5)` with an `upgrade`, never edit an existing version.

Every mutation in `db.ts` bumps `localChangedAt`; loading from a file or folder does not. That is what `reconcile` compares against the folder's `exportedAt`.

`readItems` keeps opened items in memory keyed by id and the nonces of their sealed parts, so a change re-opens only the rows whose seal changed; the cache empties on lock. The items query watches primary keys, not rows. The folder write skips a photo whose file is newer than the item's `updatedAt`; a restore from a backup file asks for one full photo write. In the table only the row being touched has inputs. A new row inherits the Valgliste and date values of the row above (shop and date down a receipt, location down a shelf), never numbers or text; the first row inherits the Kategori of the newest thing.

Photos are stored as `Blob`, never base64.

Strekkode is a text property created the first time a code is saved from the phone form (`barcodeProperty` in `fields.ts`); retail codes are stored as digits.

Kategori is a property like any other (a Valgliste, first column by default), not a built-in field; the only built-in is Navn. Its cells offer the values already in the column through `<datalist>`. Decided by elzacka, 21 September 2026.

## Conventions

- Language in code, comments, commits: English. Language in UI: Norwegian (nb-NO), klarspråk, du-form
- Norwegian text: always a capital letter after a colon, also when a fragment follows. Overrides the klarsprak-norsk skill on that point. Decided by elzacka, 19 September 2026
- No emoji anywhere
- Commit format `type: description` (feat, fix, docs, refactor, test, chore)
- Commit only after the change has been run locally and verified by elzacka. Never push
- Design decisions: `dev_only/designsystem.md`. Follow it. One accent colour, no shadows, no illustrations, 44 px targets, visible labels
- Everything from outside (form input, storage) is validated with Zod before it becomes an `Item`
- The lock is the passphrase: the app always opens locked, the key lives in memory until lock or reload. Decided by elzacka, 19 September 2026
- Header controls: search, the Lås appen button (padlock, drops the key) and the Innstillinger icon. Icon only with `aria-label` and `title`; the same style for every register action in the card head and for every setting's control on Innstillinger, where each section is a head row (title and one line left, control right) with its state underneath (elzacka, 21 September 2026). No toolbar of text buttons. Hiding the search panel keeps the query and the filters; the search icon stays lit while either narrows the table. No edit mode: the table edits in place, and nothing is stored before "Lagre". Decided by elzacka, 21 September 2026. The phone screens (Ny ting, the thing's page) store at once instead: on a phone nothing is ever unsaved
- Below 600 px the app is the phone product: add one thing, find a thing, look at a thing. Columns, bulk edits, totals, CSV and print are desk work and are not rendered there. No mobile-mode switch; the width decides. Decided by elzacka, 21 September 2026
