import { describe, expect, it } from 'vitest'
import { createVault, encryptBytes, decryptBytes, fromB64, openJson, rewrapVault, sealJson, toB64, unlockVault } from './crypto'

// Tiny Argon2id parameters keep the tests fast; production uses kdfDefaults.
const fast = { m: 256, t: 1, p: 1 }

describe('vault', () => {
  it('opens with the right passphrase and refuses the wrong one', async () => {
    const { vault, open } = await createVault('riktig passord', fast)
    const again = await unlockVault('riktig passord', vault)
    expect(again?.dekId).toBe(open.dekId)
    expect(await unlockVault('feil passord', vault)).toBeNull()
  })

  it('keeps the same data key across a passphrase change', async () => {
    const { vault, open } = await createVault('gammelt', fast)
    const next = await rewrapVault('nytt', open, fast)
    expect(next.dekId).toBe(vault.dekId)
    expect((await unlockVault('nytt', next))?.dekId).toBe(open.dekId)
    expect(await unlockVault('gammelt', next)).toBeNull()
  })

  it('treats the passphrase as Unicode-normalised text', async () => {
    const { vault } = await createVault('blåbær', fast)
    expect(await unlockVault('blåbær', vault)).not.toBeNull()
  })
})

describe('sealing', () => {
  it('round-trips JSON and bytes, with a fresh nonce each time', async () => {
    const { open } = await createVault('x', fast)
    const a = await sealJson(open.key, { navn: 'Sovepose', vekt: 1250 })
    const b = await sealJson(open.key, { navn: 'Sovepose', vekt: 1250 })
    expect(a.iv).not.toBe(b.iv)
    expect(await openJson(open.key, a)).toEqual({ navn: 'Sovepose', vekt: 1250 })
    const raw = new Uint8Array([1, 2, 3, 250])
    const { iv, data } = await encryptBytes(open.key, raw)
    expect(await decryptBytes(open.key, iv, data)).toEqual(raw)
  })

  it('fails closed on tampering', async () => {
    const { open } = await createVault('x', fast)
    const sealed = await sealJson(open.key, 'hemmelig')
    const bytes = fromB64(sealed.data)
    bytes[0] = (bytes[0] ?? 0) ^ 1
    await expect(openJson(open.key, { ...sealed, data: toB64(bytes) })).rejects.toThrow()
  })
})
