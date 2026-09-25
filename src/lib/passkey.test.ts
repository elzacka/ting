import { describe, expect, it } from 'vitest'
import { keyFromSecret, openKeyFrom, randomBytes, toB64, wrapWith } from './crypto'
import { exposedPasskey, prfBytes } from './passkey'

const secret = Array.from({ length: 32 }, (_, i) => i * 7)

describe('prfBytes', () => {
  it('takes 32 bytes as the browser hands them over', () => {
    expect(prfBytes(new Uint8Array(secret).buffer)).toEqual(new Uint8Array(secret))
    expect(prfBytes(new Uint8Array(secret))).toEqual(new Uint8Array(secret))
    expect(prfBytes(new DataView(new Uint8Array(secret).buffer))).toEqual(new Uint8Array(secret))
  })

  it('reads a view inside a larger buffer from its own offset', () => {
    const buffer = new Uint8Array([9, 9, ...secret, 9]).buffer
    expect(prfBytes(new Uint8Array(buffer, 2, 32))).toEqual(new Uint8Array(secret))
  })

  it("takes 1Password's plain array of byte values", () => {
    expect(prfBytes(secret)).toEqual(new Uint8Array(secret))
  })

  it('refuses any other length', () => {
    for (const n of [0, 16, 31, 33, 64]) {
      expect(prfBytes(new ArrayBuffer(n))).toBeNull()
      expect(prfBytes(new Array(n).fill(1))).toBeNull()
    }
  })

  it('refuses an array holding anything but byte values', () => {
    for (const bad of [256, -1, 1.5, '1', null]) {
      expect(prfBytes([...secret.slice(1), bad])).toBeNull()
    }
  })

  it('refuses a sparse array and 32 zeros, which would give a fixed key', () => {
    expect(prfBytes(new Array(32))).toBeNull()
    expect(prfBytes([...secret.slice(0, 16), , ...secret.slice(17)])).toBeNull()
    expect(prfBytes(new Array(32).fill(0))).toBeNull()
    expect(prfBytes(new ArrayBuffer(32))).toBeNull()
  })

  it('refuses what is not bytes at all', () => {
    for (const value of [undefined, null, 'secret', 32, {}, { length: 32 }]) {
      expect(prfBytes(value)).toBeNull()
    }
  })
})

describe('exposedPasskey', () => {
  const record = async (key: Uint8Array) => {
    const open = await openKeyFrom(randomBytes(32))
    return {
      credentialId: toB64(randomBytes(16)),
      salt: toB64(randomBytes(32)),
      wrappedDek: await wrapWith(await keyFromSecret(key, 'ting-passkey-1'), open),
      dekId: open.dekId,
    }
  }

  it('finds a copy wrapped under an empty secret', async () => {
    expect(await exposedPasskey(await record(new Uint8Array(0)))).toBe(true)
  })

  it('leaves a copy wrapped under a real secret', async () => {
    expect(await exposedPasskey(await record(new Uint8Array(secret)))).toBe(false)
  })
})
