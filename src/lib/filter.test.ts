import { describe, expect, it } from 'vitest'
import type { Item } from '../db/schema'
import { parseNumber, specKeys } from './filter'

function item(name: string, specs: Item['specs']): Item {
  return {
    id: crypto.randomUUID(),
    name,
    category: 'Turutstyr',
    specs,
    locationId: null,
    value: null,
    purchaseDate: null,
    receiptImage: null,
    photo: null,
    barcode: null,
    serialNumber: null,
    note: null,
    warrantyDate: null,
    createdAt: 0,
    updatedAt: 0,
  }
}

describe('parseNumber', () => {
  it('handles Norwegian and unicode forms', () => {
    expect(parseNumber('−5')).toBe(-5)
    expect(parseNumber('5,5')).toBe(5.5)
    expect(parseNumber(' 1 250 ')).toBe(1250)
    expect(parseNumber('Gass')).toBeNull()
    expect(parseNumber('')).toBeNull()
  })
})

describe('specKeys', () => {
  it('returns distinct keys ignoring case, sorted', () => {
    const items = [
      item('A', [{ key: 'Komforttemperatur', value: -12, unit: '°C' }]),
      item('B', [{ key: 'komforttemperatur', value: 5, unit: '°C' }, { key: 'Brensel', value: 'Gass', unit: null }]),
    ]
    expect(specKeys(items)).toEqual(['Brensel', 'Komforttemperatur'])
  })
})
