import { describe, expect, it } from 'vitest'
import type { Item } from '../db/schema'
import { fromStored, parseDataFile, photoFileName, toDataFile } from './backup'

const item: Item = {
  id: '3f1c2c2e-6a0b-4d1e-9a3a-1f2e3d4c5b6a',
  name: 'Sovepose',
  category: 'Turutstyr',
  specs: [{ key: 'Komforttemperatur', value: -12, unit: '°C' }],
  locationId: null,
  value: 2500,
  purchaseDate: new Date(Date.UTC(2024, 0, 15)),
  receiptImage: null,
  photo: new Blob(['x'], { type: 'image/jpeg' }),
  barcode: null,
  serialNumber: null,
  note: null,
  warrantyDate: null,
  createdAt: 1,
  updatedAt: 2,
}

describe('data file', () => {
  it('round-trips an item through JSON, with dates as numbers and the photo as a file name', () => {
    const file = toDataFile([item], [{ id: 'p1', key: 'Vekt', unit: 'gram', createdAt: 5 }], 123)
    const text = JSON.stringify(file)
    const parsed = parseDataFile(text)
    expect(parsed.exportedAt).toBe(123)
    expect(parsed.properties).toEqual([{ id: 'p1', key: 'Vekt', unit: 'gram', createdAt: 5 }])
    const stored = parsed.items[0]
    if (!stored) throw new Error('missing')
    expect(stored.photoFile).toBe('bilder/3f1c2c2e-6a0b-4d1e-9a3a-1f2e3d4c5b6a.jpg')
    expect(stored.purchaseDate).toBe(Date.UTC(2024, 0, 15))
    const back = fromStored(stored, item.photo)
    expect(back).toEqual(item)
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
