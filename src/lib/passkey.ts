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

type PrfResults = { prf?: { enabled?: boolean; results?: { first?: ArrayBuffer | ArrayBufferView } } }

function prfOutput(cred: PublicKeyCredential): Uint8Array | null {
  const first = (cred.getClientExtensionResults() as PrfResults).prf?.results?.first
  if (!first) return null
  return first instanceof ArrayBuffer ? new Uint8Array(first) : new Uint8Array(first.buffer, first.byteOffset, first.byteLength)
}

function prfDisabled(cred: PublicKeyCredential): boolean {
  return (cred.getClientExtensionResults() as PrfResults).prf?.enabled === false
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
        allowCredentials: [{ type: 'public-key', id: credentialId as BufferSource }],
        userVerification: 'required',
        extensions: { prf: { eval: { first: salt as BufferSource } } } as AuthenticationExtensionsClientInputs,
      },
    })) as PublicKeyCredential | null
    return (cred && prfOutput(cred)) ?? 'failed'
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
        extensions: { prf: { eval: { first: salt as BufferSource } } } as AuthenticationExtensionsClientInputs,
      },
    })) as PublicKeyCredential | null
  } catch (err) {
    return failure(err)
  }
  if (!cred || prfDisabled(cred)) return 'failed'
  const id = new Uint8Array(cred.rawId)
  const secret = prfOutput(cred) ?? (await secretFrom(id, salt))
  if (typeof secret === 'string') return secret
  return {
    credentialId: toB64(id),
    salt: toB64(salt),
    wrappedDek: await wrapWith(await keyFromSecret(secret, label), open),
    dekId: open.dekId,
  }
}

// The data key, after Face ID or Touch ID
export async function openWithPasskey(record: PasskeyRecord): Promise<OpenKey | PasskeyFailure> {
  const secret = await secretFrom(fromB64(record.credentialId), fromB64(record.salt))
  if (typeof secret === 'string') return secret
  const open = await unwrapWith(await keyFromSecret(secret, label), record.wrappedDek)
  return open && open.dekId === record.dekId ? open : 'failed'
}
