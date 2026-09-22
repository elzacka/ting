import { describe, expect, it } from 'vitest'
import type { Item } from '../db/schema'
import { applyFilters, levelId, splitLevel, valuesFor, withoutFilter } from './filters'
import { categoryColumnId } from './fields'
import { columnId } from './grid'
import { pathUnit } from './paths'

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

describe('a place column, level by level', () => {
  const col = { key: 'Plassering', unit: pathUnit }
  const id = columnId(col)
  const placed = [
    item('Telt', 'Turutstyr', [{ key: 'Plassering', value: 'Loftsbod › Hylle 2 › Boks 4', unit: pathUnit }]),
    item('Sekk', 'Turutstyr', [{ key: 'Plassering', value: 'Loftsbod › Hylle 2', unit: pathUnit }]),
    item('Ski', 'Turutstyr', [{ key: 'Plassering', value: 'Kjellerbod', unit: pathUnit }]),
    item('Krakk', 'Møbler', []),
  ]

  it('splits a filter id back into its column and its level', () => {
    expect(splitLevel(levelId(id, 2))).toEqual({ id, level: 2 })
    expect(splitLevel(id)).toEqual({ id, level: null })
  })

  it('offers the rooms at level one, counting everything inside them', () => {
    expect(valuesFor(placed, col, 1)).toEqual([
      { key: 'kjellerbod', label: 'Kjellerbod', count: 1 },
      { key: 'loftsbod', label: 'Loftsbod', count: 2 },
    ])
  })

  it('offers the way in, not just the last step, deeper down', () => {
    expect(valuesFor(placed, col, 2).map((v) => v.label)).toEqual(['Loftsbod › Hylle 2'])
    expect(valuesFor(placed, col, 3).map((v) => v.label)).toEqual(['Loftsbod › Hylle 2 › Boks 4'])
  })

  it('finds everything in a room, however deep in it the thing is', () => {
    expect(applyFilters(placed, { [levelId(id, 1)]: ['loftsbod'] }).map((i) => i.name)).toEqual(['Telt', 'Sekk'])
  })

  it('finds what is on one shelf without the rest of the room', () => {
    expect(applyFilters(placed, { [levelId(id, 2)]: ['loftsbod › hylle 2'] }).map((i) => i.name)).toEqual([
      'Telt',
      'Sekk',
    ])
    expect(applyFilters(placed, { [levelId(id, 3)]: ['loftsbod › hylle 2 › boks 4'] }).map((i) => i.name)).toEqual([
      'Telt',
    ])
  })

  it('leaves out a thing with no place at all, and one that does not go that deep', () => {
    expect(applyFilters(placed, { [levelId(id, 2)]: ['kjellerbod'] })).toEqual([])
  })
})
