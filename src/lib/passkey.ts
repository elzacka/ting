import { z } from 'zod'
import { fromB64, randomBytes, toB64 } from './crypto'
import { errorText } from './errors'
import { t } from './strings'

// Face ID or Touch ID in front of this device's copy of the data key (lib/deviceKey.ts), as an app
// lock: a platform passkey, user verified, its signature checked here. No PRF secret: providers give
// it unevenly (iCloud Keychain in Chrome, 1Password). Decided by elzacka, 2026-10-20.

export const passkeySchema = z.object({
  credentialId: z.string().min(1).max(1024),
  // SubjectPublicKeyInfo, as the browser hands it over at creation
  publicKey: z.string().min(1).max(1024),
  algorithm: z.union([z.literal(-7), z.literal(-257)]),
  dekId: z.string().max(64),
})
export type PasskeyRecord = z.infer<typeof passkeySchema>

// What a ceremony ended in, when it did not verify the user
export type PasskeyFailure = 'cancelled' | 'failed'

// Closing the sheet, or letting it time out, is a choice rather than a fault
function failure(err: unknown): PasskeyFailure {
  if (err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'AbortError')) return 'cancelled'
  console.error(errorText(err))
  return 'failed'
}

// A device that can verify its user on its own: Face ID, Touch ID, Windows Hello or the screen lock
export async function passkeySupported(): Promise<boolean> {
  try {
    return typeof PublicKeyCredential !== 'undefined' && (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())
  } catch {
    return false
  }
}

// Makes the passkey. The browsers ask only while the document has focus. One user id per device,
// so a new passkey replaces the device's earlier one in its password list.
export async function createPasskey(dekId: string, userId: Uint8Array): Promise<PasskeyRecord | PasskeyFailure> {
  try {
    const cred = (await navigator.credentials.create({
      publicKey: {
        rp: { name: t.vault.keychainName },
        user: { id: userId as BufferSource, name: t.vault.keychainName, displayName: t.vault.keychainName },
        challenge: randomBytes(32) as BufferSource,
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },
          { type: 'public-key', alg: -257 },
        ],
        authenticatorSelection: { authenticatorAttachment: 'platform', residentKey: 'preferred', userVerification: 'required' },
        hints: ['client-device'],
      } as PublicKeyCredentialCreationOptions, // hints is newer than the DOM types
    })) as PublicKeyCredential | null
    const response = cred?.response as AuthenticatorAttestationResponse | undefined
    const publicKey = response?.getPublicKey()
    const algorithm = response?.getPublicKeyAlgorithm()
    if (!cred || !publicKey || (algorithm !== -7 && algorithm !== -257)) return 'failed'
    return { credentialId: toB64(new Uint8Array(cred.rawId)), publicKey: toB64(new Uint8Array(publicKey)), algorithm, dekId }
  } catch (err) {
    return failure(err)
  }
}

// Face ID or Touch ID: 'ok' only for a signature by this passkey, over this challenge, from this
// origin, with the user verified
export async function verifyPasskey(record: PasskeyRecord): Promise<'ok' | PasskeyFailure> {
  const challenge = randomBytes(32)
  try {
    const cred = (await navigator.credentials.get({
      publicKey: {
        challenge: challenge as BufferSource,
        // The passkey was made on this device's own authenticator; saying so keeps the browser
        // from offering a security key or a phone first. A password manager that saved the passkey
        // (1Password) answers before the device: the page has no say in which provider answers.
        allowCredentials: [{ type: 'public-key', id: fromB64(record.credentialId) as BufferSource, transports: ['internal'] }],
        hints: ['client-device'],
        userVerification: 'required',
      } as PublicKeyCredentialRequestOptions, // hints is newer than the DOM types
    })) as PublicKeyCredential | null
    const response = cred?.response as AuthenticatorAssertionResponse | undefined
    if (!response) return 'failed'
    const ok = await assertionValid(record, challenge, location.origin, location.hostname, {
      clientDataJSON: new Uint8Array(response.clientDataJSON),
      authenticatorData: new Uint8Array(response.authenticatorData),
      signature: new Uint8Array(response.signature),
    })
    if (!ok) console.error('Passkey assertion did not verify')
    return ok ? 'ok' : 'failed'
  } catch (err) {
    return failure(err)
  }
}

// A passkey the app no longer uses: the device's password list may drop it (Signal API, where there)
export function forgetPasskey(credentialId: string): void {
  type Signal = { signalUnknownCredential?: (o: { rpId: string; credentialId: string }) => Promise<void> }
  if (typeof PublicKeyCredential === 'undefined') return
  const pkc = PublicKeyCredential as unknown as Signal
  void pkc.signalUnknownCredential?.({ rpId: location.hostname, credentialId: base64url(fromB64(credentialId)) }).catch(() => undefined)
}

type Assertion = { clientDataJSON: Uint8Array; authenticatorData: Uint8Array; signature: Uint8Array }

// The checks a relying party makes (WebAuthn §7.2), less the ones that need a server
export async function assertionValid(record: PasskeyRecord, challenge: Uint8Array, origin: string, rpId: string, a: Assertion): Promise<boolean> {
  const client = parseClientData(a.clientDataJSON)
  if (!client || client.type !== 'webauthn.get' || client.origin !== origin || client.challenge !== base64url(challenge)) return false
  if (client.crossOrigin === true || client.topOrigin !== undefined) return false
  if (a.authenticatorData.length < 37) return false
  const rpIdHash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rpId)))
  if (!rpIdHash.every((b, i) => b === a.authenticatorData[i])) return false
  // Flags: bit 0 user present, bit 2 user verified
  const flags = a.authenticatorData[32] ?? 0
  if ((flags & 0b101) !== 0b101) return false
  const clientHash = new Uint8Array(await crypto.subtle.digest('SHA-256', a.clientDataJSON as BufferSource))
  const signed = new Uint8Array(a.authenticatorData.length + clientHash.length)
  signed.set(a.authenticatorData)
  signed.set(clientHash, a.authenticatorData.length)
  const ecdsa = record.algorithm === -7
  const params = ecdsa ? { name: 'ECDSA', namedCurve: 'P-256' } : { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }
  try {
    const key = await crypto.subtle.importKey('spki', fromB64(record.publicKey) as BufferSource, params, false, ['verify'])
    const signature = ecdsa ? derToRaw(a.signature) : a.signature
    if (!signature) return false
    return await crypto.subtle.verify(ecdsa ? { name: 'ECDSA', hash: 'SHA-256' } : params, key, signature as BufferSource, signed as BufferSource)
  } catch {
    return false
  }
}

function parseClientData(bytes: Uint8Array): { type?: unknown; origin?: unknown; challenge?: unknown; crossOrigin?: unknown; topOrigin?: unknown } | null {
  try {
    const value: unknown = JSON.parse(new TextDecoder().decode(bytes))
    return value && typeof value === 'object' ? value : null
  } catch {
    return null
  }
}

export function base64url(bytes: Uint8Array): string {
  return toB64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// An ES256 signature arrives DER-encoded (SEQUENCE of two INTEGERs); WebCrypto wants r and s as
// 32 bytes each
export function derToRaw(der: Uint8Array): Uint8Array | null {
  if (der[0] !== 0x30) return null
  let at = 2
  const out = new Uint8Array(64)
  for (const half of [0, 32]) {
    if (der[at] !== 0x02) return null
    const length = der[at + 1] ?? 0
    let int = der.subarray(at + 2, at + 2 + length)
    at += 2 + length
    while (int.length > 32 && int[0] === 0) int = int.subarray(1)
    if (int.length > 32) return null
    out.set(int, half + 32 - int.length)
  }
  return out
}
