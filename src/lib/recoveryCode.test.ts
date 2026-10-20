import { describe, expect, it } from 'vitest'
import { createVault, unlockVault } from './crypto'
import { generateRecoveryCode, normalizeCode, secretsFor } from './recoveryCode'

describe('recovery code', () => {
  it('is 20 characters in groups of four, without lookalikes', () => {
    for (let i = 0; i < 50; i++) expect(generateRecoveryCode()).toMatch(/^([A-HJ-NP-Z2-9]{4}-){4}[A-HJ-NP-Z2-9]{4}$/)
  })

  it('differs every time', () => {
    expect(generateRecoveryCode()).not.toBe(generateRecoveryCode())
  })

  it('reads a typed code in any case, with or without dashes or spaces', () => {
    expect(normalizeCode('abcd-efgh-jkmn-pqrs-tuvw')).toBe('ABCDEFGHJKMNPQRSTUVW')
    expect(normalizeCode('ABCD EFGH JKMN PQRS TUVW')).toBe('ABCDEFGHJKMNPQRSTUVW')
  })

  it('leaves a passphrase of the user\'s own alone', () => {
    expect(normalizeCode('a long passphrase of mine')).toBeNull()
    expect(secretsFor('a long passphrase of mine')).toEqual(['a long passphrase of mine'])
  })

  it('opens a vault with the code typed loosely', async () => {
    const code = generateRecoveryCode()
    const { vault, open } = await createVault(code, { m: 8, t: 1, p: 1 })
    const loose = code.replace(/-/g, '').toLowerCase()
    expect((await unlockVault(loose, vault))?.dekId).toBe(open.dekId)
    expect(await unlockVault(generateRecoveryCode(), vault)).toBeNull()
  })
})
