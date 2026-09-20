import { describe, expect, it } from 'vitest'
import type { Item } from '../db/schema'
import { createVault } from './crypto'
import { fromStored, openEnvelope, parseAnyFile, parseDataFile, photoFileName, sameItemSet, sealDataFile, toDataFile } from './backup'

const item: Item = {
  id: '3f1c2c2e-6a0b-4d1e-9a3a-1f2e3d4c5b6a',
  name: 'Sovepose',
  specs: [{ key: 'Kategori', value: 'Turutstyr', unit: null }, { key: 'Komforttemperatur', value: -12, unit: '°C' }],
  photo: new Blob(['x'], { type: 'image/jpeg' }),
  createdAt: 1,
  updatedAt: 2,
}

const fields = { name: { label: null, order: -1 } }

describe('data file', () => {
  it('round-trips an item through JSON, with the photo as a file name', () => {
    const file = toDataFile([item], [{ id: 'p1', key: 'Vekt', unit: 'gram', createdAt: 5 }], fields, 123)
    const text = JSON.stringify(file)
    const parsed = parseDataFile(text)
    expect(parsed.exportedAt).toBe(123)
    expect(parsed.properties).toEqual([{ id: 'p1', key: 'Vekt', unit: 'gram', createdAt: 5 }])
    const stored = parsed.items[0]
    if (!stored) throw new Error('missing')
    expect(stored.photoFile).toBe('bilder/3f1c2c2e-6a0b-4d1e-9a3a-1f2e3d4c5b6a.jpg')
    const back = fromStored(stored, item.photo)
    expect(back).toEqual(item)
    expect(parsed.fields).toEqual(fields)
  })

  it('turns a legacy note into the property Notat, unless the thing has one', () => {
    const stored = { ...toDataFile([item], [], fields, 1).items[0]!, note: 'Ligger i boden' }
    expect(fromStored(stored, null).specs.at(-1)).toEqual({ key: 'Notat', value: 'Ligger i boden', unit: null })
    const withNotat = { ...stored, specs: [{ key: 'notat', value: 'Finnes', unit: null }] }
    expect(fromStored(withNotat, null).specs).toHaveLength(1)
  })

  it('turns a legacy category into the property Kategori, first, unless the thing has one', () => {
    const stored = { ...toDataFile([item], [], fields, 1).items[0]!, specs: [{ key: 'Vekt', value: 1, unit: 'kg' }], category: 'Kjøkken' }
    expect(fromStored(stored, null).specs.map((s) => s.key)).toEqual(['Kategori', 'Vekt'])
    const withIt = { ...stored, specs: [{ key: 'kategori', value: 'Bod', unit: null }] }
    expect(fromStored(withIt, null).specs).toHaveLength(1)
  })

  it('loads files without field settings and leaves them undefined', () => {
    expect(parseDataFile('{"app":"ting","format":1,"exportedAt":0,"items":[]}').fields).toBeUndefined()
  })

  it('loads files written before properties existed', () => {
    expect(parseDataFile('{"app":"ting","format":1,"exportedAt":0,"items":[]}').properties).toEqual([])
  })

  it('rejects files that are not from Ting', () => {
    expect(() => parseDataFile('{"app":"other","format":1,"exportedAt":0,"items":[]}')).toThrow()
    expect(() => parseDataFile('not json')).toThrow()
  })

  it('gives items without a photo no file name', () => {
    expect(photoFileName({ ...item, photo: null })).toBeNull()
  })
})

describe('envelope', () => {
  it('seals a document, opens it with the same key, and needs the passphrase for a foreign key', async () => {
    const fast = { m: 256, t: 1, p: 1 }
    const a = await createVault('passord for enhet a', fast)
    const b = await createVault('passord for enhet b', fast)
    const file = toDataFile([{ ...item, photo: null }], [], fields, 42)
    const text = JSON.stringify(await sealDataFile(a.open, a.vault, file))
    expect(text).not.toContain('Sovepose')
    const parsed = parseAnyFile(text)
    if (parsed.kind !== 'sealed') throw new Error('expected envelope')
    const same = await openEnvelope(parsed.envelope, a.open)
    expect(same !== 'foreign' && same !== 'wrong-passphrase' && same.file.items[0]?.name).toBe('Sovepose')
    expect(await openEnvelope(parsed.envelope, b.open)).toBe('foreign')
    expect(await openEnvelope(parsed.envelope, b.open, 'feil')).toBe('wrong-passphrase')
    const opened = await openEnvelope(parsed.envelope, b.open, 'passord for enhet a')
    expect(opened !== 'foreign' && opened !== 'wrong-passphrase' && opened.open.dekId).toBe(a.open.dekId)
  })

  it('rejects an envelope whose key derivation would exhaust memory', async () => {
    const a = await createVault('passord for enhet a', { m: 256, t: 1, p: 1 })
    const env = await sealDataFile(a.open, a.vault, toDataFile([], [], fields, 1))
    const hostile = { ...env, vault: { ...env.vault, kdf: { ...env.vault.kdf, m: 4194304 } } }
    expect(() => parseAnyFile(JSON.stringify(hostile))).toThrow()
  })

  it('still reads a plain document from before encryption', () => {
    const plain = parseAnyFile('{"app":"ting","format":1,"exportedAt":1,"items":[]}')
    expect(plain.kind).toBe('plain')
  })
})

describe('sameItemSet', () => {
  const a = [{ id: '1' }, { id: '2' }]
  it('is true for the same ids in any order', () => {
    expect(sameItemSet(a, [{ id: '2' }, { id: '1' }])).toBe(true)
  })
  it('is false when one side has an item the other lacks', () => {
    expect(sameItemSet(a, [{ id: '1' }, { id: '3' }])).toBe(false)
    expect(sameItemSet(a, [{ id: '1' }])).toBe(false)
  })
  it('is true for two empty sets', () => {
    expect(sameItemSet([], [])).toBe(true)
  })
})
