import { describe, expect, it } from 'vitest'
import type { Item } from '../db/schema'
import { applyFilters, categoryFilterId, valuesFor } from './filters'
import { columnId } from './grid'

function item(name: string, category: string, specs: Item['specs']): Item {
  return {
    id: crypto.randomUUID(),
    name,
    category,
    specs,
    photo: null,
    createdAt: 0,
    updatedAt: 0,
  }
}

const komfort = { key: 'Komforttemperatur', unit: '°C' }
const brensel = { key: 'Brensel', unit: null }
const items = [
  item('Vinter', 'Turutstyr', [{ key: 'Komforttemperatur', value: -12, unit: '°C' }]),
  item('Sommer', 'Turutstyr', [{ key: 'komforttemperatur', value: '5', unit: '°C' }]),
  item('Vår', 'Turutstyr', [{ key: 'Komforttemperatur', value: 5, unit: '°C' }]),
  item('Kokeapparat', 'Kjøkken', [{ key: 'Brensel', value: 'Gass', unit: null }]),
  item('Primus', 'kjøkken', [{ key: 'Brensel', value: 'gass', unit: null }]),
]

describe('valuesFor', () => {
  it('lists distinct values, merging text case and number forms, sorted numerically', () => {
    expect(valuesFor(items, komfort)).toEqual([
      { key: '-12', label: '−12', count: 1 },
      { key: '5', label: '5', count: 2 },
    ])
    expect(valuesFor(items, brensel)).toEqual([{ key: 'gass', label: 'Gass', count: 2 }])
    expect(valuesFor(items, null).map((v) => v.label)).toEqual(['Kjøkken', 'Turutstyr'])
  })
})

describe('applyFilters', () => {
  it('is OR inside a filter and AND across filters', () => {
    const names = (f: Parameters<typeof applyFilters>[1]) => applyFilters(items, f).map((i) => i.name)
    expect(names({ [columnId(komfort)]: ['5'] })).toEqual(['Sommer', 'Vår'])
    expect(names({ [columnId(komfort)]: ['5', '-12'] })).toEqual(['Vinter', 'Sommer', 'Vår'])
    expect(names({ [categoryFilterId]: ['kjøkken'], [columnId(brensel)]: ['gass'] })).toEqual(['Kokeapparat', 'Primus'])
    expect(names({ [categoryFilterId]: ['turutstyr'], [columnId(brensel)]: ['gass'] })).toEqual([])
    expect(names({})).toHaveLength(5)
  })
})
