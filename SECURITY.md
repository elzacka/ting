# Security

Threat model and security model for Ting, mapped to the OWASP Top 10:2025.
Current as of 2026-09-21, for version 0.1.0. Norwegian user-facing text about
the same topics is in `README.md`.

## What Ting is

Ting is a static web app. It has no server, no account, and no network calls
after the page has loaded, with one exception the user triggers by hand: "Slå
opp på nett" sends the digits of a barcode to one of three public catalogues
(`src/lib/lookup.ts`). Everything the user registers
lives in the browser's IndexedDB on the device, optionally mirrored to a folder
on disk and to downloaded copies. All of it is encrypted with a key derived from
a passphrase the user chooses.

That shape removes whole classes of risk (server-side access control, session
tokens, API abuse) and concentrates the rest in three places: the device, the
files the app writes, and the code that ships to the browser.

## Assets

| Asset | Where it is | Protection |
|---|---|---|
| Items, properties, field settings, photos | IndexedDB, `ting.json` and `bilder/` in the folder, downloaded copies | AES-256-GCM under a random data key (DEK) |
| The DEK | Memory while unlocked; wrapped in the `vault` setting and in every file | Wrapped with a key derived from the passphrase (Argon2id) |
| The passphrase | Component state while a form is open, never stored | Argon2id, 64 MiB, 3 passes, 1 lane, 16-byte salt, NFKC-normalised input |
| CSV and print output | Wherever the user puts them | None: they exist to be read. The app says so |

In the clear: row ids, the photo MIME type, the change stamp `localChangedAt`,
the folder handle, the wrapped key with its salt and parameters, and the
`exportedAt` on the outside of a file envelope. None of these reveal content.

## Threat model

| Actor | Can | Cannot |
|---|---|---|
| Someone with the unlocked device | See and change everything, like the user | Learn the passphrase |
| Someone with the locked device, the folder or a copy | Read ids, counts and timestamps; attempt an offline guess of the passphrase, paying the Argon2id cost per guess | Read content, forge a document (GCM tag), roll back the folder by editing a clear-text timestamp (reconcile uses the timestamp inside the sealed document) |
| A crafted `ting.json` or folder | Be rejected by the schema | Reference files outside `bilder/<uuid>.<ext>`, inject markup, ask for unbounded key-derivation memory |
| A page that frames the app | Load it | Show it: the app refuses to render inside a frame |
| A compromised dependency or CI action | Ship malicious code to every user | Nothing stops this except the controls under A03 below; it is the largest residual risk |
| The hosting provider (GitHub Pages) | Serve altered files, omit headers | Read user data: none is ever sent |
| A lookup catalogue (Open Library, Open Products Facts, Open Food Facts) | See the barcode digits and the IP address, only when the user presses "Slå opp på nett"; answer with a hostile name | Learn anything else: no cookies, no referrer, no other field. Inject anything: the answer is Zod-validated, bounded to 200 printable characters, rendered as text, and only fills the name field for the user to review before Lagre |

Out of scope: a compromised browser or operating system, malware on the device,
and an attacker who can watch the user type. No web app can defend against
those.

Deliberate choices that shape the model:

| Choice | Consequence |
|---|---|
| No recovery path | A lost passphrase means lost data. The app says so at setup |
| No server, no telemetry | Nothing to breach centrally; also nothing to alert on |
| Lookup is a button, never automatic, and barcode decoding stays on the device | A scan reveals nothing; a lookup reveals one code to one catalogue, by a choice made each time |
| The app opens locked, always | Reload or close drops the key |
| Idle lock after ten minutes, paused while edits are unsaved | A device left open re-locks, unless something is mid-edit; that exception was chosen over losing the edits |
| No content indexes in IndexedDB | Search decrypts and filters in memory; an index would leak content |

## OWASP Top 10:2025, category by category

| #   | Category                               | Applies how                                                      | Controls                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --- | -------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A01 | Broken Access Control                  | No roles, no server. Access is the device plus the passphrase    | App opens locked; `lock()` zeroes the key; idle lock in `useAutoLock.ts` (10 minutes without pointer or key input, re-checked when the tab becomes visible); folder access through the browser's own permission prompt                                                                                                                                                                                                                                                                                |
| A02 | Security Misconfiguration              | Static hosting, so headers are what the host gives               | CSP `default-src 'self'`, `script-src 'self'`, `object-src 'none'`, `base-uri 'self'`, injected at build; no inline scripts; `connect-src` names the three lookup hosts and nothing else, and no other directive allows an external origin; `registerType: 'prompt'` for the service worker so an update is never silent. Limits: `frame-ancestors`, `X-Content-Type-Options` and `Permissions-Policy` are only honoured as HTTP headers, and GitHub Pages sets none. Chrome logs this. The `<meta>` tags stay as documentation; `main.tsx` refuses to render when framed, which covers clickjacking without a header               |
| A03 | Software Supply Chain Failures         | Five runtime dependencies, one build pipeline                    | `package-lock.json` with `npm ci`; `npm audit --audit-level=high` in CI; GitHub Actions pinned to commit SHAs; Dependabot weekly for npm and actions; `permissions: contents: read` on both workflows; no CDN, fonts or icons from outside                                                                                                                                                                                                                                                            |
| A04 | Cryptographic Failures                 | All data at rest                                                 | WebCrypto AES-256-GCM with a fresh 12-byte IV per seal; Argon2id from `@noble/hashes`; random DEK per vault; a wrong passphrase surfaces only as a failed tag check; the DEK is zeroed on lock; a file sealed on another device is opened with the passphrase and its key adopted, so devices converge on one DEK. Known gap: no additional authenticated data binds a sealed row to its id, so someone with database write access could swap two sealed rows. Accepted: they already have the device |
| A05 | Injection                              | Everything typed, pasted, restored or read from a folder is data | React text nodes only; no `dangerouslySetInnerHTML`, `innerHTML`, `eval` or `new RegExp` from input; Zod on every document (`itemSchema`, `propertySchema`, `dataFileSchema`, `envelopeSchema`, unknown keys dropped); CSV cells starting with `=`, `+`, `-`, `@` or tab get an apostrophe; photos accepted only with image MIME types; folder photo names must be `<uuid>.<ext>`; route ids are matched, never interpreted; localStorage values are validated; links in text are rendered only for `http(s)://` addresses matched by a fixed pattern, as text, with `rel="noopener noreferrer"`, and other schemes stay plain text; a pasted spreadsheet block is split on tabs and newlines into cell strings and goes through the same validation as typed cells; the phone form and the in-place edits on a thing's page build their input with the same `inputFrom` and store through the same schema as the table; a decoded barcode is reduced to printable characters and 128 of them (`cleanCode`), a lookup answer to 200, and a retail code is only sent when its GS1 check digit is valid |
| A06 | Insecure Design                        | The design is the main control                                   | Local-only, encrypted by default, no account to phish, threat model written down here and in `CLAUDE.md`; every store boundary validates; minimum passphrase length 12 with a hint to use a sentence                                                                                                                                                                                                                                                                                                  |
| A07 | Authentication Failures                | The passphrase is the only credential                            | Never stored or logged; Argon2id bounds offline guessing; no lockout counter because guessing happens offline against the file anyway; idle lock covers the abandoned-device case. Inherent limit: JavaScript strings cannot be zeroed, so the passphrase lingers in memory until garbage collection                                                                                                                                                                                                  |
| A08 | Software or Data Integrity Failures    | Code integrity comes from the pipeline, data integrity from GCM  | Every document and photo carries a GCM tag; reconcile between device and folder compares the `exportedAt` inside the sealed document, so a clear-text timestamp cannot force a rollback; Workbox precache uses content hashes; pinned actions and lockfile as under A03. Files written before encryption are still accepted unauthenticated, by design, and sealed on the first unlock                                                                                                                |
| A09 | Security Logging and Alerting Failures | No telemetry by design, so "alerting" means telling the user     | Sync errors surface in the Lagring status; restore and save failures show a message; the console gets only the error's name and message (`errorText`), never the object, which for a validation error would carry the content that failed; an unreadable row is skipped and named in the console rather than hiding the catalogue                                                                                                                                                                     |
| A10 | Mishandling of Exceptional Conditions  | Corrupt files, hostile parameters, render errors, a slow or hostile catalogue | A lookup has an 8 s timeout, `redirect: 'error'`, `credentials: 'omit'`, `referrerPolicy: 'no-referrer'` and `cache: 'no-store'`, and every failure becomes one of four messages; KDF parameters read from a file are bounded (`m` up to 256 MiB, `t` up to 10, `p` up to 4) before any derivation runs; one undecryptable row does not block the rest; an error boundary shows a message and a reload button instead of a blank page; wrong passphrase, bad JSON and schema failures are caught and shown                                                                                                                                                                              |

## Residual risks, in order

| Priority | Risk | Why it stays |
|---|---|---|
| P1 | Supply chain: a malicious dependency or action update | Pins, audit and Dependabot reduce the window; they do not close it. Review every dependency PR |
| P2 | Weak passphrase | Twelve characters is a floor, not strength. Argon2id makes each guess expensive, not impossible |
| P3 | Sealed-row swap by someone with database write access | Would need AAD on every seal; the attacker already has the device |
| P3 | Idle lock is paused while edits are unsaved | A device left open mid-edit stays open until the edit is saved or discarded |

## If a language model is ever added

Field content, file content and model output are all untrusted. Send content
to the model as delimited data with a fixed instruction, never concatenated
into the instruction. Model output only fills fields for the user to review; it
never triggers an action, a write, a navigation or a file operation. Nothing
leaves the device without an explicit, per-use choice by the user, and the
encrypted-at-rest promise in the README must be revisited first.

## Reporting

Open an issue at https://github.com/elzacka/ting/issues or write to
hei@tazk.no. There is no bug bounty.
