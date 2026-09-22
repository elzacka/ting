import { describe, expect, it } from 'vitest'
import type { Item } from '../db/schema'
import { applyFilters, valuesFor, withoutFilter } from './filters'
import { categoryColumnId } from './fields'
import { columnId } from './grid'

function item(name: string, category: string, specs: Item['specs']): Item {
  return {
    id: crypto.randomUUID(),
    name,
    specs: [{ key: 'Kategori', value: category, unit: null }, ...specs],
    photos: [],
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
    expect(valuesFor(items, { key: 'Kategori', unit: '' }).map((v) => v.label)).toEqual(['Kjøkken', 'Turutstyr'])
  })
})

describe('applyFilters', () => {
  it('is OR inside a filter and AND across filters', () => {
    const names = (f: Parameters<typeof applyFilters>[1]) => applyFilters(items, f).map((i) => i.name)
    expect(names({ [columnId(komfort)]: ['5'] })).toEqual(['Sommer', 'Vår'])
    expect(names({ [columnId(komfort)]: ['5', '-12'] })).toEqual(['Vinter', 'Sommer', 'Vår'])
    expect(names({ [categoryColumnId]: ['kjøkken'], [columnId(brensel)]: ['gass'] })).toEqual(['Kokeapparat', 'Primus'])
    expect(names({ [categoryColumnId]: ['turutstyr'], [columnId(brensel)]: ['gass'] })).toEqual([])
    expect(names({})).toHaveLength(5)
  })
})

describe('withoutFilter', () => {
  it('applies every filter but the named one, so a menu counts what the others leave', () => {
    const f = { [categoryColumnId]: ['kjøkken'], [columnId(brensel)]: ['gass'] }
    expect(withoutFilter(items, f, columnId(brensel)).map((i) => i.name)).toEqual(['Kokeapparat', 'Primus'])
    expect(withoutFilter(items, f, categoryColumnId).map((i) => i.name)).toEqual(['Kokeapparat', 'Primus'])
    expect(withoutFilter(items, { [categoryColumnId]: ['turutstyr'] }, categoryColumnId)).toHaveLength(5)
  })
})

describe('date columns', () => {
  it('facet by year', () => {
    const dated = [
      item('A', 'Turutstyr', [{ key: 'Kjøpt', value: '2021-06-01', unit: 'dato' }]),
      item('B', 'Turutstyr', [{ key: 'Kjøpt', value: '2021-12-24', unit: 'dato' }]),
      item('C', 'Turutstyr', [{ key: 'Kjøpt', value: '2023-01-02', unit: 'dato' }]),
    ]
    const col = { key: 'Kjøpt', unit: 'dato' }
    expect(valuesFor(dated, col)).toEqual([
      { key: '2021', label: '2021', count: 2 },
      { key: '2023', label: '2023', count: 1 },
    ])
    expect(applyFilters(dated, { [columnId(col)]: ['2021'] }).map((i) => i.name)).toEqual(['A', 'B'])
  })
})
