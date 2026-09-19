# CLAUDE.md

Project rules for Ting. Global rules in `~/.claude/CLAUDE.md` apply on top.

## What this is

Offline-first PWA that keeps track of what a household owns and where it is. MVP is limited to outdoor gear (Turutstyr) with fast spec search. Plan and design system live in `dev_only/` (gitignored).

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

No CSS framework, no router library, no search library, no external fonts or CDNs. Production build injects a `default-src 'self'` CSP.

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
| `src/db/useLiveQuery.ts` | Subscription hook over Dexie `liveQuery` |
| `src/lib/search.ts` | Query parser and matcher: fuzzy words, phrases, negation, `key<value`, `has:`. Pure and tested |
| `src/lib/grid.ts` | Items to table columns and cells and back. Pure and tested |
| `src/lib/export.ts` | CSV (`;`, BOM, comma decimals) and download helper. Tested |
| `src/lib/filter.ts` | `parseNumber`, `specKeys` |
| `src/lib/format.ts` | nb-NO numbers and dates, real minus sign, narrow no-break space before units |
| `src/lib/strings.ts` | Every user-facing string. Nothing hardcoded in components |
| `src/lib/route.ts` | Hash router: `#/` (home), `#/oversikt`, `#/registrer` (table), `#/innstillinger`, `#/ting/:id`, `#/ting/:id/rediger` |
| `src/lib/backup.ts` | `ting.json` format (format 1). Folder copy keeps photos as files in `bilder/`; download copy embeds them as data URLs. Tested |
| `src/lib/folderStore.ts` | File System Access: pick folder, permissions, read, write, reconcile (newer side wins) |
| `src/lib/useFolderSync.ts` | Keeps the folder in sync after every change, debounced 500 ms. Skips the first emission after reconcile |
| `src/lib/editing.ts` | The Redigering switch, stored per device in localStorage. Shown only on Legg til og endre and Innstillinger. Off makes the table view a hint and hides the edit actions; the vault lock is separate |
| `src/lib/useAutoLock.ts` | Locks after 10 minutes without pointer or key input; re-checks when the tab becomes visible |
| `src/lib/errors.ts` | `errorText`: what gets logged about an error (name and message, never the object) |
| `src/components/` | One file per screen or reusable piece. `RegisterTable` holds unsaved edits in memory until "Lagre"; `Report` is print-only; `ErrorBoundary` wraps `main` |
| `src/styles/` | `tokens.css`, `base.css`, `components.css` |

## Encryption

Everything stored is sealed: AES-256-GCM (WebCrypto) under a random data key (DEK); the DEK is wrapped by a key derived from the passphrase with Argon2id (`@noble/hashes`, m=64 MiB, t=3, p=1). `src/lib/crypto.ts` holds the primitives, `src/lib/vault.ts` the session key (memory only; the app opens locked, `lock()` zeroes the key). `src/db/db.ts` seals every row: items as one sealed JSON document plus sealed photo bytes, properties as sealed documents, field settings as a sealed setting. Only ids, the folder handle, `localChangedAt` and the vault (wrapped key, salt, parameters) are in the clear. Files on disk are envelopes (`src/lib/backup.ts`): vault in the clear, document sealed; photos in the folder are `bilder/<id>.bin` = 12-byte nonce + ciphertext. A file sealed on another device opens with the passphrase and its key is adopted, so devices converge on one DEK. Plain files and rows from before encryption still load; rows are sealed on the first unlock.

Changing anything here needs elzacka's confirmation first (global rule on auth, crypto and access control). Threat model and the OWASP Top 10:2025 mapping: `SECURITY.md`.

## Untrusted input

Everything a user types, pastes, restores from a file or reads from a folder is data, never instructions or markup. The guards, path by path, are the A05 and A10 rows of `SECURITY.md`; keep them when changing those paths. The rule for a future language model is there too.

## Data model

Dexie version 4: tables `items` (`id` only), `settings` (`key`) and `properties` (`id` only). Content indexes were dropped with encryption. Decrypted shapes: `Item`, `Property` (column definitions: `id` = key+unit, `key`, `unit`, `createdAt`, optional `order`, `type`: text, choice, number, date, and `options` for choice columns). A date property carries the internal unit marker `dato` so its specs format as dates; the UI shows the type, never that marker. Missing `type` on old rows means text, or date if the marker is set. Column order comes from `columnDefs` in `src/lib/fields.ts`, which interleaves the built-in fields (Kategori, Navn) with properties. Built-in field labels, positions and the hidden flag for Kategori live in `settings` under key `fields`. Navn cannot be hidden: it is the identity of an item everywhere. The same order and labels apply in the edit table, Oversikt, filters, report and CSV. A property exists independently of item values; removing one strips the matching spec from every item. Adding non-indexed fields needs no version bump. Changing indexes or renaming fields does: add `db.version(5)` with an `upgrade`, never edit an existing version.

Every mutation in `db.ts` bumps `localChangedAt`; loading from a file or folder does not. That is what `reconcile` compares against the folder's `exportedAt`.

Photos are stored as `Blob`, never base64.

`category` is free text. The table and the edit form offer existing categories and names through `<datalist>`; there is no category table. Decided 19 September 2026, closing the open question in the plan.

## Conventions

- Language in code, comments, commits: English. Language in UI: Norwegian (nb-NO), klarspråk, du-form
- Norwegian text: always a capital letter after a colon, also when a fragment follows. Overrides the klarsprak-norsk skill on that point. Decided by elzacka, 19 September 2026
- No emoji anywhere
- Commit format `type: description` (feat, fix, docs, refactor, test, chore)
- Commit only after the change has been run locally and verified by elzacka. Never push
- Design decisions: `dev_only/designsystem.md`. Follow it. One accent colour, no shadows, no illustrations, 44 px targets, visible labels
- Everything from outside (form input, storage) is validated with Zod before it becomes an `Item`
- The lock is the passphrase: the app always opens locked, the key lives in memory until lock or reload. Decided by elzacka, 19 September 2026
- Two header controls, never one: the Redigering switch (pencil, read-only mode, per device) and the Lås appen button (padlock, drops the key), plus the Innstillinger icon. Icon only with `aria-label` and `title`. Decided by elzacka, 19 September 2026
