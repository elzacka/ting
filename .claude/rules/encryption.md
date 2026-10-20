---
paths:
  - "src/lib/{crypto,vault,passkey,backup,folderStore}*.ts"
  - "src/db/db.ts"
  - "src/components/{LockScreen,SettingsPage}.tsx"
---

# Encryption

AES-256-GCM (WebCrypto) under a random data key (DEK), wrapped by a key derived from the passphrase with Argon2id (`@noble/hashes`, parameters `kdfDefaults` in `lib/crypto.ts`). `lib/crypto.ts` holds the primitives, `lib/vault.ts` the session key — memory only, zeroed on lock.

The first start of the installed app makes the vault itself under `generateRecoveryCode` (`lib/recoveryCode.ts`, 100 bits), sealed in the `recoveryCode` setting and never shown: its presence means no passphrase. «Velg passord» rewraps with `changePassphrase` using it as the old secret, then deletes it; `currentSecret` deletes one whose salt is not the stored vault's (a file's or another device's passphrase was taken over).

`unlockVault` reads a code typed loosely, for files sealed with a 1.16 code, which was shown. `clearTrialRows` clears what an old trial sealed; rows from before encryption are sealed on the first unlock. Only the demo is a trial.

A file sealed on another device opens with the passphrase and its key is adopted, so devices converge on one DEK. Adopting a key (`KeyChange` in `db.ts`) seals the rows and sealed settings under it and stores them in one transaction with its vault; the session key switches only after, so rows and key never disagree.

Plain files and rows still load and are sealed on the first unlock. A key whose `dekId` does not match the vault's is refused (`unlockWithKey`).

«Husk passord» in Innstillinger is `rememberDevice`: on (the default) opens with the device key; off makes a passkey where the device has one, so the lock asks for Face ID or Touch ID in front of the device key, else deletes the device key and asks for the passphrase.

The device key (`lib/deviceKey.ts`, the `deviceKey` setting) is a second copy of the DEK wrapped under a non-extractable AES-GCM `CryptoKey` in IndexedDB. The gate in `App.tsx` keeps it while «Husk passord» is on or a passkey guards it, after any unlock and adopted vault, and deletes it otherwise; it is used only when it opens the vault's `dekId`.

It protects files, backups and the folder, not a browser profile someone can run code in. Never in a backup or the folder.

Face ID, Touch ID, Windows Hello or the screen lock (named per platform, `lib/unlockMethod.ts`) is an app lock in front of the device key, not a key: a platform passkey (`lib/passkey.ts`) whose assertion the page verifies itself (`assertionValid`). No PRF: providers give it unevenly.

A record whose `dekId` no longer matches goes; after an adopted vault the gate moves it to the new `dekId`. The passkey is asked for as `internal` with the `client-device` hint, so the browser does not offer a security key first.

Only ids, the folder handle, sync times and switches (`clock`, `fieldsChangedAt`, `lastMergedAt`, `rememberDevice`, `passkeyOffered` …), the device id and the passkey user id, the passkey record (credential id, public key) and the vault itself (wrapped key, salt, parameters) are ever unencrypted. `db.ts` seals every row (items, properties, field settings, tombstones) and every per-device setting that names content (hidden columns, column widths, remembered receipt stores); backup files keep the vault in the clear and everything else sealed.

A newer passphrase reaches other devices only through the vault copy inside the sealed part (`sync.ts`), never the clear one, which anyone could swap. Photos in the folder are `bilder/<id>-1.bin`, flat and numbered from one, each 12-byte nonce + ciphertext.

Changing anything in this file needs elzacka's confirmation first (global rule on auth, crypto and access control). Threat model and OWASP mapping: `SECURITY.md`.
