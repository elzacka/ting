import { describe, expect, it } from 'vitest'
import type { Item, Property } from '../db/schema'
import { missing, totals } from './summary'

function item(name: string, category: string, specs: Item['specs'], photo: Blob | null = null): Item {
  return {
    id: crypto.randomUUID(),
    name,
    specs: [{ key: 'Kategori', value: category, unit: null }, ...specs],
    photo,
    createdAt: 0,
    updatedAt: 0,
  }
}

const pris: Property = { id: '["pris","kr"]', key: 'Pris', unit: 'kr', createdAt: 1, type: 'number' }
const type: Property = { id: '["type",""]', key: 'Type', unit: '', createdAt: 2, type: 'choice', options: [] }
const merke: Property = { id: '["merke",""]', key: 'Merke', unit: '', createdAt: 3, type: 'text' }

const items = [
  item('A', 'Turutstyr', [{ key: 'Pris', value: 1000, unit: 'kr' }, { key: 'Type', value: 'Sovepose', unit: '' }]),
  item('B', 'Turutstyr', [{ key: 'Pris', value: '2 500', unit: 'kr' }, { key: 'Type', value: 'sovepose', unit: '' }], new Blob([''], { type: 'image/png' })),
  item('C', 'Klær', [{ key: 'Type', value: 'Jakke', unit: '' }, { key: 'Merke', value: 'Bergans', unit: '' }]),
]

describe('totals', () => {
  it('sums every number property in kr, reading nb-NO numbers', () => {
    expect(totals(items, [pris, type, merke])).toEqual([{ key: 'Pris', unit: 'kr', sum: 3500 }])
  })
  it('is empty without a kr property', () => {
    expect(totals(items, [type])).toEqual([])
  })
})

describe('missing', () => {
  it('counts things without a photo and without a kr value, each as a search', () => {
    expect(missing(items, [pris, type])).toEqual([
      { what: 'photo', key: 'bilde', count: 2, query: '-has:bilde' },
      { what: 'value', key: 'Pris', count: 1, query: '-has:pris' },
    ])
  })
  it('says nothing about photos while no thing has one', () => {
    const none = items.map((i) => ({ ...i, photo: null }))
    expect(missing(none, [pris]).map((m) => m.what)).toEqual(['value'])
  })
  it('quotes a property name with a space', () => {
    const p: Property = { id: '["ny pris","kr"]', key: 'Ny pris', unit: 'kr', createdAt: 1, type: 'number' }
    expect(missing(items, [p])[1]?.query).toBe('-has:"ny pris"')
  })
})
