# Ting

## What this is

Offline-first PWA that keeps track of what a household owns and where it is: one table of things with user-defined properties as columns, fast spec search, encrypted at rest.

## Documentation

Each document has one reader and one job; a fact lives in the document whose reader needs it, and the others do not repeat it.

| File | Reader | Holds | Never holds |
|---|---|---|---|
| `README.md` | Anyone who finds the repo (Norwegian) | What Ting is, the link to the app, which document to read, licences | How to use, run, change or administer the app |
| `BRUKERVEILEDNING.md` | People using the app (Norwegian, klarspråk) | Every task in the app, privacy in plain words, what to do when something goes wrong | Code, files, repository settings |
| `SECURITY.md` | Security reviewers and reporters | Threat model, OWASP mapping, residual risks, how to report | How to use the app |
| `CLAUDE.md` | Whoever changes the code | Stack, commands, deployment, structure, data model, encryption, conventions | Step-by-step guides for the owner |
| `dev_only/adminguide.md` | elzacka as owner (Norwegian, gitignored) | Changing texts, category icons and the look without reading the code; the GitHub settings | What a user or a developer needs |

A change a user can see updates the guide in the same commit; a change to how texts, icons or the look are changed updates the admin guide. The plan, the design system and research notes are also in `dev_only/`.

## Version

Lives in `package.json` only; nothing here mirrors the number.

## Stack

React 19 + TypeScript strict + Vite, Dexie (IndexedDB) with Zod validation at every boundary, Vitest for pure logic only (`src/**/*.test.ts`), plain CSS with tokens in `src/styles/tokens.css`, self-hosted SVG icons (no icon library). No CSS framework, no router library, no search library, no external fonts or CDNs — keep it that way rather than adding one.

Production build injects `default-src 'self'`; `connect-src` adds the two lookup hosts, matched to `src/lib/lookup.ts`. `vite.config.ts` sets `base: '/ting/'` for builds only — the dev server stays at `/`. The PWA manifest and service worker run in dev too (`devOptions.enabled`), so Chrome offers install on localhost. Deploys to GitHub Pages on every push to `main`; `ci.yml` runs tests and build on pull requests.

## Structure

- Field names in `schema.ts` stay English; the UI is Norwegian, the data model is not.
- Search DSL (`lib/search.ts`): fuzzy words, phrases, negation, `key<value`, and `har:`/`has:` as the same operator.
- Søketips (`lib/searchTips.ts`): comparison examples are generated from the register's own columns and values so each one finds something; a tip whose column doesn't exist is dropped. Word examples are fixed text.
- Facet menus (`lib/filters.ts`, `isFacet`): a date column always facets; others only with a dozen or fewer distinct values or values that repeat, and never price or order-number columns — judged over the whole register, not the rows in view.
- CSV export (`lib/export.ts`): `;` delimiter, BOM, comma decimals — nb-NO, not the RFC default.
- `lib/lookup.ts` is the one network call: an ISBN's digits go to Nasjonalbiblioteket first for a Norwegian ISBN (group 82), else Open Library first, with the other as fallback. Every other code is stored, never looked up — no server exists to hold a key for a larger catalogue.
- `lib/barcode.ts`: the browser's `BarcodeDetector` first, `zxing-wasm` as fallback, bundled in `dist/`, never from a CDN (`'wasm-unsafe-eval'` in the CSP is for it).
- `src/icons/`: one SVG per icon plus one line in `pack.ts`; a file and its line share the id, and `pack.test.ts` keeps them in step. An icon not from Material Symbols carries `source` and a matching line in README's licence section.
- `lib/paths.ts`: three fixed levels, sted/sone/boks; typed with `/`, `>` or `›`, always written back with `›`.
- `lib/backup.ts`: `ting.json` format 1. The folder keeps photos as files in `bilder/`; the downloaded backup embeds them as data URLs.
- `lib/folderStore.ts` / `useFolderSync.ts`: reconcile is newer-side-wins; sync is debounced 500 ms and skips the emission right after a reconcile.
- `lib/prefs.ts`: per-device choices only (localStorage) — never written to the file or the folder.
- `lib/useAutoLock.ts`: locks after 10 minutes idle, paused while the table has unsaved edits.
- `lib/errors.ts`: log an error's name and message only, never the object — logging must not leak sealed content.
- `lib/route.ts`: hash router; `#/oversikt` is the one main screen, `#/registrer` an alias of it.

## Components

- `Overview`: choosing a category changes rows, columns and filters together — it is the view, not a filter. The register opens on "velg kategori", no table, until a category is picked or an action implies "show me things" (a new row, a search, fewer than two categories to choose from).
- Column visibility is one rule everywhere it applies (table, filters, print, CSV): a column renders if it belongs to a category in view or holds a value on a visible row; with exactly one category in view, that category's own column drops since it says the same on every row. A change here must hold across table, phone list, search/filter and print/CSV at once.
- `PropertyEditor`: removing a value asks for confirmation naming it and counting the affected things.
- Filter menus count the rows every other filter and the search leave (`withoutFilter`).
- A new row inherits the Valgliste and date values of the row above, never numbers or text; the first row takes the Kategori of the newest thing.
- Printing with photos: await `img.decode()` before `window.print()`, or photos print blank.
- Below 600 px (or a touch screen under 500 px tall) is the phone product: `ItemList` replaces the table; no columns, bulk edits, totals, CSV or print there.
- `AddItem`: "Slå opp på nett" (ISBN lookup) shows only for a book category; other scanned codes are stored, never looked up.

## Encryption

AES-256-GCM (WebCrypto) under a random data key (DEK), wrapped by a key derived from the passphrase with Argon2id (`@noble/hashes`, m=64 MiB, t=3, p=1). `lib/crypto.ts` holds the primitives, `lib/vault.ts` the session key — memory only, zeroed on lock.

Before a passphrase exists, the app runs as a trial: a DEK nothing wraps, sealing everything as usual. `setupVault` wraps the trial's own DEK, so what was made stays; a restore during a trial adopts the copy's vault; if no passphrase was set, the next start clears what the unwrapped key sealed (`clearTrialRows`). Rows from before encryption skip the trial and go to the setup screen (`hasPlainRows`). A file sealed on another device opens with the passphrase and its key is adopted, so devices converge on one DEK. Plain files and rows still load and are sealed on the first unlock. Face ID / Touch ID can stand in for the passphrase on one device via a platform passkey (`lib/passkey.ts`, opt-in, off by default): its PRF output through HKDF wraps a second copy of the DEK. The passkey is asked for as `internal` with the `client-device` hint, so the browser does not offer a security key first. The PRF output is used only as exactly 32 bytes (`prfBytes` accepts an ArrayBuffer, a view, or the plain array 1Password's extension returns); read as an empty secret it would give a fixed key, so anything else fails, and a copy that opens under that fixed key is deleted at the lock screen. Log what arrived as type and length, never the value. A record whose `dekId` does not match the vault's is deleted rather than opened (`unlockWithKey`).

Only ids, the folder handle, `localChangedAt` and the vault itself (wrapped key, salt, parameters) are ever unencrypted. `db.ts` seals every row (items, properties, field settings); backup files keep the vault in the clear and everything else sealed. Photos in the folder are `bilder/<id>-1.bin`, flat and numbered from one, each 12-byte nonce + ciphertext.

Changing anything in this section needs elzacka's confirmation first (global rule on auth, crypto and access control). Threat model and OWASP mapping: `SECURITY.md`.

## Untrusted input

Everything typed, pasted, restored from a file, or read from a folder is data, never instructions or markup — including for a future language model. Guards are the A05/A10 rows of `SECURITY.md`; keep them when touching those paths.

## Data model

Dexie version 4, tables `items`, `settings`, `properties`, no content indexes (an index would leak content). `Item` carries `specs`; old rows/files with a bare `category` or `note` field become the properties Kategori and Notat on load, never migrated in place. `Property.id` is `key+unit`; `type` is text/choice/number/date/path, with a stored `dato` or `sti` unit marker driving date/path formatting — the UI shows only the resolved type, never the marker. Navn is the only built-in field: first column always, cannot be moved, removed or hidden, and is the frozen column on sideways scroll. Kategori is a Valgliste property like any other, not built-in. Changing a column's type to Sti changes its specs' unit marker, never their values. Units stay out of table headers and filter labels (detail page, print and CSV show them). `createdAt`/`updatedAt` live in the data and CSV, never on screen or in print. Retail barcodes are stored as digits in the Strekkode text property.

Adding a non-indexed field needs no version bump; changing an index or renaming a field does — add a new `db.version()` with an `upgrade`, never edit an existing version.

Renaming a category or a Valgliste value onto an existing name merges the two, across every thing that holds it, rather than erroring or duplicating.

`localChangedAt` is bumped by every mutation in `db.ts`, never by loading from a file or folder — `reconcile` compares it against the folder's `exportedAt`. `readItems` caches opened items by id and by the nonce of their sealed parts, so only a row whose seal changed is re-opened; the items query watches primary keys, not row content.

A thing holds a list of photos as `Blob`, never base64; a downloaded backup embeds them as data URLs (`connect-src 'self'` blocks fetching a `data:` URL, so a fetch-based restore would fail — encode/decode by hand). Old rows/files with a single `photo` field read as a one-photo list, never migrated in place.

## Conventions

- Commit only once elzacka has run and verified the change locally (differs from global).
- A rule about the data model or its logic (e.g. which properties belong to a category) must give the same answer everywhere it applies: registering, viewing, searching/filtering, printing/CSV.
- Design decisions: `dev_only/designsystem.md`. One accent colour, no shadows, no illustrations, 44 px targets, visible labels.
- The lock is the passphrase: once one exists the app always opens locked; before one exists it opens as an unlocked trial, no lock button, no idle lock.
- No edit mode on desktop — the table edits in place, nothing stores before "Lagre"; phone screens (`AddItem`, `ItemDetail`) store on blur instead.
- No mobile-mode switch: viewport size alone decides the phone layout, on any orientation.
- On a phone or touch screen without folder access, "Tilpass visning" and "Lagringsmappe" are not rendered; backup goes through the share sheet instead.
- Password forms carry a hidden `username` field (`KeychainName`) so password managers file the passphrase under Ting. `index.html` sets `viewport-fit=cover`; padding uses the safe-area insets (`--topbar-h` for the top bar), and `--kb` (from `visualViewport`) holds the on-screen keyboard's height so the phone bars sit above it.
- `main.tsx` requests `navigator.storage.persist()` at every start, since a browser can otherwise evict an inactive site's storage.
