import { z } from 'zod'
import { fromB64, keyFromSecret, randomBytes, toB64, unwrapWith, wrapWith, type OpenKey } from './crypto'
import { errorText } from './errors'
import { t } from './strings'

// Face ID or Touch ID in place of the passphrase, on one device. A passkey
// made on the device's own authenticator (WebAuthn) hands over a secret
// through its PRF extension, and only after the user is verified; that secret
// is the key a second copy of the data key is wrapped under. The copy is kept
// on this device alone, never in a backup or the folder, and the passphrase
// stays the way in everywhere else and whenever the passkey fails.
// Decided by elzacka, 24 September 2026.

const label = 'ting-passkey-1'

export const passkeySchema = z.object({
  credentialId: z.string().min(1).max(1024),
  salt: z.string().min(1).max(128),
  wrappedDek: z.object({ iv: z.string().max(64), data: z.string().max(256) }),
  dekId: z.string().max(64),
})
export type PasskeyRecord = z.infer<typeof passkeySchema>

// What a ceremony ended in, when it gave no key
export type PasskeyFailure = 'cancelled' | 'failed'

type PrfResults = { prf?: { enabled?: boolean; results?: { first?: unknown } } }

// The PRF secret is 32 bytes. Browsers hand it over as an ArrayBuffer or a
// view of one, 1Password's extension as a plain array of numbers. Any other
// form or length is refused, and so are an array with holes and 32 zeros:
// read as an empty or a zero secret, it would wrap the data key under a key
// anyone can derive from this code.
export function prfBytes(first: unknown): Uint8Array | null {
  const bytes =
    first instanceof ArrayBuffer
      ? new Uint8Array(first)
      : ArrayBuffer.isView(first)
        ? new Uint8Array(first.buffer, first.byteOffset, first.byteLength)
        : Array.isArray(first) && Array.from(first).every((b) => Number.isInteger(b) && b >= 0 && b <= 255)
          ? Uint8Array.from(first as number[])
          : null
  return bytes?.length === 32 && bytes.some((b) => b !== 0) ? bytes : null
}

// What arrived in place of a secret, never its value: enough to tell a
// missing secret from one in the wrong form
function shape(value: unknown): string {
  if (value === undefined) return 'missing'
  if (value instanceof ArrayBuffer) return `ArrayBuffer(${value.byteLength})`
  if (ArrayBuffer.isView(value)) return `${value.constructor.name}(${value.byteLength})`
  if (Array.isArray(value)) return `Array(${value.length})`
  return typeof value
}

// The secret a ceremony handed over. At creation a missing one is normal:
// some devices give it only when the passkey is used, and are asked again.
function prfOutput(cred: PublicKeyCredential, creating: boolean): Uint8Array | null {
  const first = (cred.getClientExtensionResults() as PrfResults).prf?.results?.first
  const bytes = prfBytes(first)
  if (!bytes && !(creating && first === undefined)) console.error(`Passkey secret unusable: ${shape(first)}`)
  return bytes
}

function prfDisabled(cred: PublicKeyCredential): boolean {
  const disabled = (cred.getClientExtensionResults() as PrfResults).prf?.enabled === false
  if (disabled) console.error('Passkey made without a secret (prf.enabled false)')
  return disabled
}

// Closing the sheet, or letting it time out, is a choice rather than a fault
function failure(err: unknown): PasskeyFailure {
  if (err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'AbortError')) return 'cancelled'
  console.error(errorText(err))
  return 'failed'
}

// A device that can verify its user on its own: Face ID, Touch ID or the
// device code. Whether it also gives a PRF secret shows only when one is made.
export async function passkeySupported(): Promise<boolean> {
  if (typeof PublicKeyCredential === 'undefined') return false
  try {
    const caps = await (
      PublicKeyCredential as unknown as { getClientCapabilities?: () => Promise<Record<string, boolean>> }
    ).getClientCapabilities?.()
    if (caps && caps['extension:prf'] === false) return false
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
  } catch {
    return false
  }
}

async function secretFrom(credentialId: Uint8Array, salt: Uint8Array): Promise<Uint8Array | PasskeyFailure> {
  try {
    const cred = (await navigator.credentials.get({
      publicKey: {
        challenge: randomBytes(32) as BufferSource,
        // The passkey was made on this device's own authenticator. Saying so,
        // and preferring it, keeps the browser from offering a security key or
        // a phone first. A password manager that saved the passkey (1Password)
        // answers before Face ID or Touch ID whatever this asks: the page has
        // no say in which provider holds a passkey or answers for it.
        allowCredentials: [{ type: 'public-key', id: credentialId as BufferSource, transports: ['internal'] }],
        hints: ['client-device'],
        userVerification: 'required',
        extensions: { prf: { eval: { first: salt as BufferSource } } } as AuthenticationExtensionsClientInputs,
      } as PublicKeyCredentialRequestOptions, // hints is newer than the DOM types
    })) as PublicKeyCredential | null
    return (cred && prfOutput(cred, false)) ?? 'failed'
  } catch (err) {
    return failure(err)
  }
}

// Makes the passkey and wraps the open data key under its secret. Some
// devices give the secret as the passkey is made; the rest are asked once more.
export async function createPasskey(open: OpenKey): Promise<PasskeyRecord | PasskeyFailure> {
  const salt = randomBytes(32)
  let cred: PublicKeyCredential | null
  try {
    cred = (await navigator.credentials.create({
      publicKey: {
        rp: { name: t.vault.keychainName },
        user: { id: randomBytes(16) as BufferSource, name: t.vault.keychainName, displayName: t.vault.keychainName },
        challenge: randomBytes(32) as BufferSource,
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },
          { type: 'public-key', alg: -257 },
        ],
        authenticatorSelection: { authenticatorAttachment: 'platform', residentKey: 'preferred', userVerification: 'required' },
        hints: ['client-device'],
        extensions: { prf: { eval: { first: salt as BufferSource } } } as AuthenticationExtensionsClientInputs,
      } as PublicKeyCredentialCreationOptions, // hints is newer than the DOM types
    })) as PublicKeyCredential | null
  } catch (err) {
    return failure(err)
  }
  if (!cred || prfDisabled(cred)) return 'failed'
  const id = new Uint8Array(cred.rawId)
  const secret = prfOutput(cred, true) ?? (await secretFrom(id, salt))
  if (typeof secret === 'string') return secret
  return {
    credentialId: toB64(id),
    salt: toB64(salt),
    wrappedDek: await wrapWith(await keyFromSecret(secret, label), open),
    dekId: open.dekId,
  }
}

// A copy wrapped under the key an empty secret gives opens for anyone who
// reads this code, so it protects nothing: the lock screen deletes it. A
// browser that refuses an empty key could never have made one.
export async function exposedPasskey(record: PasskeyRecord): Promise<boolean> {
  try {
    const exposed = (await unwrapWith(await keyFromSecret(new Uint8Array(0), label), record.wrappedDek)) !== null
    if (exposed) console.error('Passkey copy under an empty secret found: the data key it wrapped was readable')
    return exposed
  } catch {
    return false
  }
}

// The data key, after Face ID or Touch ID
export async function openWithPasskey(record: PasskeyRecord): Promise<OpenKey | PasskeyFailure> {
  const secret = await secretFrom(fromB64(record.credentialId), fromB64(record.salt))
  if (typeof secret === 'string') return secret
  const open = await unwrapWith(await keyFromSecret(secret, label), record.wrappedDek)
  if (open && open.dekId === record.dekId) return open
  console.error('Passkey secret does not open the data key')
  return 'failed'
}
