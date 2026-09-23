import { describe, expect, it } from 'vitest'
import type { Item, Property } from '../db/schema'
import { categoryColumnId } from './fields'
import { searchTips } from './searchTips'

function item(specs: Item['specs']): Item {
  return { id: crypto.randomUUID(), name: 'x', specs, photos: [], createdAt: 0, updatedAt: 0 }
}

const pris: Property = { id: '["pris","kr"]', key: 'Pris', unit: 'kr', createdAt: 1, type: 'number' }
const butikk: Property = { id: '["kjøpt hvor",""]', key: 'Kjøpt hvor', unit: '', createdAt: 2, type: 'choice' }
const kategori: Property = { id: categoryColumnId, key: 'Kategori', unit: '', createdAt: 0, type: 'choice' }
const kjopt: Property = { id: '["kjøpt","dato"]', key: 'Kjøpt', unit: 'dato', createdAt: 3, type: 'date' }

const items = [
  item([
    { key: 'Pris', value: 1695, unit: 'kr' },
    { key: 'Kjøpt hvor', value: 'Clas Ohlson', unit: '' },
    { key: 'Kategori', value: 'Elektronikk', unit: '' },
  ]),
  item([
    { key: 'Pris', value: 2990, unit: 'kr' },
    { key: 'Kjøpt hvor', value: 'Clas Ohlson', unit: '' },
    { key: 'Kategori', value: 'Elektronikk', unit: '' },
  ]),
  item([{ key: 'Pris', value: 149, unit: 'kr' }]),
]

describe('searchTips', () => {
  const tips = searchTips([kategori, pris, butikk, kjopt], items, 2026)
  const examples = tips.map(([e]) => e)

  it('compares on the register’s own number column, at a round middle value', () => {
    expect(examples).toContain('pris<2000')
    expect(examples).toContain('pris>2000')
  })
  it('quotes a key or value with a space in it', () => {
    expect(examples).toContain('"kjøpt hvor"="clas ohlson"')
    expect(examples).toContain('"kjøpt hvor":ohls')
  })
  it('uses the most common category and this year for dates', () => {
    expect(examples).toContain('kategori:elek')
    expect(examples).toContain('kjøpt<01.01.26')
  })
  it('writes har:, not has:', () => {
    expect(examples).toContain('har:bilde')
    expect(examples).toContain('-har:pris')
  })
  it('leaves out rows for columns the register does not have', () => {
    const bare = searchTips([], [], 2026).map(([e]) => e)
    expect(bare).toEqual(['sovepose', '"sovepose vinter"', '-sommer', 's', 'har:bilde'])
  })
})
