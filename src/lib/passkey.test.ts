import { describe, expect, it } from 'vitest'
import { toB64 } from './crypto'
import { assertionValid, base64url, derToRaw, type PasskeyRecord } from './passkey'

const origin = 'https://elzacka.github.io'
const rpId = 'elzacka.github.io'
const subtle = globalThis.crypto.subtle

// r and s as DER INTEGERs: a leading zero where the high bit is set, none where a byte is zero
function rawToDer(raw: Uint8Array): Uint8Array {
  const int = (half: Uint8Array) => {
    let start = 0
    while (start < half.length - 1 && half[start] === 0) start++
    const body = half.subarray(start)
    return (body[0] ?? 0) & 0x80 ? [0x02, body.length + 1, 0, ...body] : [0x02, body.length, ...body]
  }
  const body = [...int(raw.subarray(0, 32)), ...int(raw.subarray(32))]
  return Uint8Array.from([0x30, body.length, ...body])
}

async function authenticatorData(flags: number, id = rpId): Promise<Uint8Array> {
  const hash = new Uint8Array(await subtle.digest('SHA-256', new TextEncoder().encode(id)))
  return Uint8Array.from([...hash, flags, 0, 0, 0, 1])
}

function clientData(challenge: Uint8Array, over: Record<string, string> = {}): Uint8Array {
  return new TextEncoder().encode(JSON.stringify({ type: 'webauthn.get', challenge: base64url(challenge), origin, ...over }))
}

async function signed(data: Uint8Array, client: Uint8Array): Promise<Uint8Array> {
  const hash = new Uint8Array(await subtle.digest('SHA-256', client as BufferSource))
  return Uint8Array.from([...data, ...hash])
}

async function es256() {
  const pair = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  const spki = new Uint8Array(await subtle.exportKey('spki', pair.publicKey))
  const record: PasskeyRecord = { credentialId: 'aWQ=', publicKey: toB64(spki), algorithm: -7, dekId: 'd' }
  const sign = async (bytes: Uint8Array) =>
    rawToDer(new Uint8Array(await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, pair.privateKey, bytes as BufferSource)))
  return { record, sign }
}

async function rs256() {
  const params = { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }
  const pair = await subtle.generateKey(params, true, ['sign', 'verify'])
  const spki = new Uint8Array(await subtle.exportKey('spki', pair.publicKey))
  const record: PasskeyRecord = { credentialId: 'aWQ=', publicKey: toB64(spki), algorithm: -257, dekId: 'd' }
  const sign = async (bytes: Uint8Array) => new Uint8Array(await subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, bytes as BufferSource))
  return { record, sign }
}

describe('assertionValid', () => {
  it('accepts an ES256 or RS256 signature over this challenge, origin and rpId, with the user verified', async () => {
    for (const make of [es256, rs256]) {
      const { record, sign } = await make()
      const challenge = crypto.getRandomValues(new Uint8Array(32))
      const data = await authenticatorData(0b101)
      const client = clientData(challenge)
      const signature = await sign(await signed(data, client))
      expect(await assertionValid(record, challenge, origin, rpId, { clientDataJSON: client, authenticatorData: data, signature })).toBe(true)
    }
  })

  it('refuses another challenge, origin, type or rpId, a user not verified, and a changed signature', async () => {
    const { record, sign } = await es256()
    const challenge = crypto.getRandomValues(new Uint8Array(32))
    const check = async (data: Uint8Array, client: Uint8Array, tamper = false) => {
      const signature = await sign(await signed(data, client))
      if (tamper) signature[signature.length - 1] = (signature[signature.length - 1] ?? 0) ^ 1
      return assertionValid(record, challenge, origin, rpId, { clientDataJSON: client, authenticatorData: data, signature })
    }
    const good = await authenticatorData(0b101)
    expect(await check(good, clientData(crypto.getRandomValues(new Uint8Array(32))))).toBe(false)
    expect(await check(good, clientData(challenge, { origin: 'https://evil.example' }))).toBe(false)
    expect(await check(good, clientData(challenge, { type: 'webauthn.create' }))).toBe(false)
    expect(await check(await authenticatorData(0b101, 'evil.example'), clientData(challenge))).toBe(false)
    expect(await check(await authenticatorData(0b001), clientData(challenge))).toBe(false)
    expect(await check(good, clientData(challenge), true)).toBe(false)
  })
})

describe('derToRaw', () => {
  it('pads short integers and drops the sign byte', () => {
    const raw = new Uint8Array(64)
    raw[0] = 0x80
    raw[63] = 1
    expect(derToRaw(rawToDer(raw))).toEqual(raw)
  })

  it('refuses what is not a DER sequence of two integers', () => {
    expect(derToRaw(Uint8Array.from([0x31, 0]))).toBeNull()
    expect(derToRaw(Uint8Array.from([0x30, 4, 0x03, 1, 1, 0x02]))).toBeNull()
  })
})
