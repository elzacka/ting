---
paths:
  - "src/lib/{crypto,vault,passkey,backup,folderStore}*.ts"
  - "src/db/db.ts"
  - "src/components/{LockScreen,SettingsPage}.tsx"
---

# Encryption

AES-256-GCM (WebCrypto) under a random data key (DEK), wrapped by a key derived from the passphrase with Argon2id (`@noble/hashes`, parameters `kdfDefaults` in `lib/crypto.ts`). `lib/crypto.ts` holds the primitives, `lib/vault.ts` the session key — memory only, zeroed on lock.

The first start of the installed app makes the vault itself: `generateRecoveryCode` (`lib/recoveryCode.ts`, 20 characters from a 32-letter alphabet, 100 bits, the secret `setupVault` stretches), sealed in the `recoveryCode` setting so Innstillinger can show it; `unlockVault` also reads it typed loosely. Choosing a passphrase of one's own deletes the code. `clearTrialRows` clears what an old trial sealed; rows from before encryption are sealed on the first unlock. Only the demo is a trial.

A file sealed on another device opens with the passphrase and its key is adopted, so devices converge on one DEK. Adopting a key (`KeyChange` in `db.ts`) seals the rows and sealed settings under it and stores them in one transaction with its vault; the session key switches only after, so rows and key never disagree.

Plain files and rows still load and are sealed on the first unlock. A record whose `dekId` does not match the vault's is deleted rather than opened (`unlockWithKey`).

A device opens without a question by default (`lib/deviceKey.ts`, switch `rememberDevice`): the `deviceKey` setting holds a second copy of the DEK wrapped under a non-extractable AES-GCM `CryptoKey` kept in IndexedDB, written after any unlock and any adopted vault unless Face ID is on, and used at start only when it opens the vault's `dekId`. It protects files, backups and the folder, not a browser profile someone can run code in. Never in a backup or the folder.

Face ID, Touch ID, Windows Hello or the screen lock (named per platform, `lib/unlockMethod.ts`) can stand in for the passphrase on one device via a platform passkey (`lib/passkey.ts`, opt-in, off by default): its PRF output through HKDF wraps a second copy of the DEK. The passkey is asked for as `internal` with the `client-device` hint, so the browser does not offer a security key first.

The PRF output is used only as exactly 32 bytes (`prfBytes` accepts an ArrayBuffer, a view, or the plain array 1Password's extension returns); read as an empty secret it would give a fixed key, so anything else fails, and a copy that opens under that fixed key is deleted at the lock screen. Log what arrived as type and length, never the value.

Only ids, the folder handle, sync times and switches (`clock`, `fieldsChangedAt`, `lastMergedAt` …), the device id and the vault itself (wrapped key, salt, parameters) are ever unencrypted. `db.ts` seals every row (items, properties, field settings, tombstones) and every per-device setting that names content (hidden columns, column widths, remembered receipt stores); backup files keep the vault in the clear and everything else sealed.

A newer passphrase reaches other devices only through the vault copy inside the sealed part (`sync.ts`), never the clear one, which anyone could swap. Photos in the folder are `bilder/<id>-1.bin`, flat and numbered from one, each 12-byte nonce + ciphertext.

Changing anything in this file needs elzacka's confirmation first (global rule on auth, crypto and access control). Threat model and OWASP mapping: `SECURITY.md`.
