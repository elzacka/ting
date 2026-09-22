import { describe, expect, it } from 'vitest'
import type { Item, Property } from '../db/schema'
import { gapsByCategory, totals } from './summary'

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

describe('gapsByCategory', () => {
  it('counts what is missing in each category, each fact a search', () => {
    expect(gapsByCategory(items, [pris, type])).toEqual([
      {
        category: 'Klær',
        missing: [
          { what: 'photo', key: 'bilde', count: 1, query: 'kategori=klær -has:bilde' },
          { what: 'value', key: 'Pris', count: 1, query: 'kategori=klær -has:pris' },
        ],
      },
      {
        category: 'Turutstyr',
        missing: [{ what: 'photo', key: 'bilde', count: 1, query: 'kategori=turutstyr -has:bilde' }],
      },
    ])
  })

  it('leaves out a category with nothing missing', () => {
    const none = items.map((i) => ({ ...i, photo: null }))
    expect(gapsByCategory(none, [pris]).map((g) => g.category)).toEqual(['Klær'])
  })

  it('says nothing about photos while no thing has one', () => {
    const none = items.map((i) => ({ ...i, photo: null }))
    expect(gapsByCategory(none, [pris]).flatMap((g) => g.missing.map((m) => m.what))).toEqual(['value'])
  })

  it('does not ask a category for a column that does not belong to it', () => {
    const scoped: Property = { ...pris, categories: ['Turutstyr'] }
    expect(gapsByCategory(items, [scoped]).flatMap((g) => g.missing.map((m) => m.key))).toEqual(['bilde', 'bilde'])
  })

  it('puts the things without a category last, and asks for them by that', () => {
    const loose = { ...item('D', 'Turutstyr', []), specs: [] }
    const out = gapsByCategory([...items, loose], [pris])
    expect(out.map((g) => g.category)).toEqual(['Klær', 'Turutstyr', null])
    expect(out[2]?.missing.map((m) => m.query)).toEqual(['-has:kategori -has:bilde', '-has:kategori -has:pris'])
  })

  it('leaves the search bare when nothing is in a category at all', () => {
    const loose = items.map((i) => ({ ...i, specs: i.specs.filter((s) => s.key !== 'Kategori') }))
    expect(gapsByCategory(loose, [pris])).toEqual([
      {
        category: null,
        missing: [
          { what: 'photo', key: 'bilde', count: 2, query: '-has:bilde' },
          { what: 'value', key: 'Pris', count: 1, query: '-has:pris' },
        ],
      },
    ])
  })

  it('quotes a property name with a space', () => {
    const p: Property = { id: '["ny pris","kr"]', key: 'Ny pris', unit: 'kr', createdAt: 1, type: 'number' }
    const klaer = gapsByCategory(items, [p]).find((g) => g.category === 'Klær')
    expect(klaer?.missing.map((m) => m.query)).toContain('kategori=klær -has:"ny pris"')
  })
})
