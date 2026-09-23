import { argon2id } from '@noble/hashes/argon2.js'

// Everything stored is encrypted with a random data key (DEK) under
// AES-256-GCM. The DEK is wrapped by a key derived from the passphrase with
// Argon2id. The wrapped DEK, salt and parameters travel with the data, so the
// same passphrase opens it on any device. There is no recovery path.

export type KdfParams = { name: 'argon2id'; m: number; t: number; p: number; salt: string }
export type Sealed = { iv: string; data: string }
export type Vault = { kdf: KdfParams; wrappedDek: Sealed; dekId: string }

// 64 MiB, 3 passes, 1 lane: about half a second on a recent laptop.
export type KdfTuning = { m: number; t: number; p: number }
export const kdfDefaults: KdfTuning = { m: 65536, t: 3, p: 1 }

const subtle = globalThis.crypto.subtle

export function randomBytes(n: number): Uint8Array {
  return globalThis.crypto.getRandomValues(new Uint8Array(n))
}

export function toB64(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s)
}

export function fromB64(s: string): Uint8Array {
  const bin = atob(s)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function deriveKek(passphrase: string, kdf: KdfParams): Uint8Array {
  return argon2id(new TextEncoder().encode(passphrase.normalize('NFKC')), fromB64(kdf.salt), {
    t: kdf.t,
    m: kdf.m,
    p: kdf.p,
    dkLen: 32,
  })
}

async function importAes(raw: Uint8Array): Promise<CryptoKey> {
  return subtle.importKey('raw', raw as BufferSource, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

export async function encryptBytes(key: CryptoKey, plain: Uint8Array): Promise<{ iv: Uint8Array; data: Uint8Array }> {
  const iv = randomBytes(12)
  const data = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, plain as BufferSource))
  return { iv, data }
}

export async function decryptBytes(key: CryptoKey, iv: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, data as BufferSource))
}

export async function sealJson(key: CryptoKey, value: unknown): Promise<Sealed> {
  const { iv, data } = await encryptBytes(key, new TextEncoder().encode(JSON.stringify(value)))
  return { iv: toB64(iv), data: toB64(data) }
}

export async function openJson<T = unknown>(key: CryptoKey, sealed: Sealed): Promise<T> {
  const plain = await decryptBytes(key, fromB64(sealed.iv), fromB64(sealed.data))
  return JSON.parse(new TextDecoder().decode(plain)) as T
}

export async function dekIdOf(dek: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await subtle.digest('SHA-256', dek as BufferSource))
  return toB64(digest.slice(0, 12))
}

// The data key kept in memory while unlocked.
export type OpenKey = { dek: Uint8Array; key: CryptoKey; dekId: string }

export async function openKeyFrom(dek: Uint8Array): Promise<OpenKey> {
  return { dek, key: await importAes(dek), dekId: await dekIdOf(dek) }
}

// New vault: fresh DEK, fresh salt, DEK wrapped under the passphrase.
export async function createVault(passphrase: string, params: KdfTuning = kdfDefaults): Promise<{ vault: Vault; open: OpenKey }> {
  const kdf: KdfParams = { name: 'argon2id', ...params, salt: toB64(randomBytes(16)) }
  const dek = randomBytes(32)
  const open = await openKeyFrom(dek)
  return { vault: await wrapDek(passphrase, kdf, open), open }
}

export async function wrapDek(passphrase: string, kdf: KdfParams, open: OpenKey): Promise<Vault> {
  const kek = await importAes(deriveKek(passphrase, kdf))
  const { iv, data } = await encryptBytes(kek, open.dek)
  return { kdf, wrappedDek: { iv: toB64(iv), data: toB64(data) }, dekId: open.dekId }
}

// Wrong passphrase surfaces as a failed GCM tag check; that is turned into null.
export async function unlockVault(passphrase: string, vault: Vault): Promise<OpenKey | null> {
  const kek = await importAes(deriveKek(passphrase, vault.kdf))
  try {
    const dek = await decryptBytes(kek, fromB64(vault.wrappedDek.iv), fromB64(vault.wrappedDek.data))
    return await openKeyFrom(dek)
  } catch {
    return null
  }
}

// Same DEK, new passphrase (or new parameters): only the wrapper changes.
export async function rewrapVault(passphrase: string, open: OpenKey, params: KdfTuning = kdfDefaults): Promise<Vault> {
  const kdf: KdfParams = { name: 'argon2id', ...params, salt: toB64(randomBytes(16)) }
  return wrapDek(passphrase, kdf, open)
}

// A second way to the same data key, on one device: a secret the device's own
// authenticator hands over only after Face ID or Touch ID (a passkey's PRF
// output), stretched by HKDF into a wrapping key. The label keeps this key
// apart from anything else the same secret might one day be used for.
export async function keyFromSecret(secret: Uint8Array, label: string): Promise<CryptoKey> {
  const base = await subtle.importKey('raw', secret as BufferSource, 'HKDF', false, ['deriveKey'])
  return subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: new TextEncoder().encode(label) },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function wrapWith(kek: CryptoKey, open: OpenKey): Promise<Sealed> {
  const { iv, data } = await encryptBytes(kek, open.dek)
  return { iv: toB64(iv), data: toB64(data) }
}

// A wrong key surfaces as a failed GCM tag check; that is turned into null.
export async function unwrapWith(kek: CryptoKey, wrapped: Sealed): Promise<OpenKey | null> {
  try {
    return await openKeyFrom(await decryptBytes(kek, fromB64(wrapped.iv), fromB64(wrapped.data)))
  } catch {
    return null
  }
}
