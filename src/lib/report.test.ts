import { describe, expect, it } from 'vitest'
import type { Item } from '../db/schema'
import { columnId } from './grid'
import { levelId } from './filters'
import { pathUnit } from './paths'
import { groupItems } from './report'

const kategori = columnId({ key: 'Kategori', unit: '' })

function item(name: string, category?: string): Item {
  return {
    id: crypto.randomUUID(),
    name,
    specs: category === undefined ? [] : [{ key: 'Kategori', value: category, unit: null }],
    photos: [],
    createdAt: 0,
    updatedAt: 0,
  }
}

describe('groupItems', () => {
  it('makes one unnamed group without a column to group by', () => {
    const items = [item('A', 'Bok'), item('B', 'Turutstyr')]
    expect(groupItems(items, null)).toEqual([{ label: null, items }])
  })

  it('has nothing to print when there is nothing to print', () => {
    expect(groupItems([], null)).toEqual([])
    expect(groupItems([], kategori)).toEqual([])
  })

  it('splits by the column, in alphabetical order', () => {
    const out = groupItems([item('A', 'Turutstyr'), item('B', 'Bok'), item('C', 'Bok')], kategori)
    expect(out.map((g) => g.label)).toEqual(['Bok', 'Turutstyr'])
    expect(out[0]?.items.map((i) => i.name)).toEqual(['B', 'C'])
  })

  it('keeps the order the table had inside a group', () => {
    const out = groupItems([item('C', 'Bok'), item('A', 'Bok'), item('B', 'Bok')], kategori)
    expect(out[0]?.items.map((i) => i.name)).toEqual(['C', 'A', 'B'])
  })

  it('gathers two spellings of one value under the first of them', () => {
    const out = groupItems([item('A', 'Bok'), item('B', 'bok')], kategori)
    expect(out.map((g) => g.label)).toEqual(['Bok'])
    expect(out[0]?.items).toHaveLength(2)
  })

  it('puts the things with no value last, under no name', () => {
    const out = groupItems([item('A'), item('B', 'Bok'), item('C', '  ')], kategori)
    expect(out.map((g) => g.label)).toEqual(['Bok', null])
    expect(out[1]?.items.map((i) => i.name)).toEqual(['A', 'C'])
  })
})

describe('groupItems by a place', () => {
  const plassering = columnId({ key: 'Plassering', unit: pathUnit })
  function placed(name: string, place?: string): Item {
    return {
      id: crypto.randomUUID(),
      name,
      specs: place === undefined ? [] : [{ key: 'Plassering', value: place, unit: pathUnit }],
      photos: [],
      createdAt: 0,
      updatedAt: 0,
    }
  }
  const items = [
    placed('Telt', 'Loftsbod › Hylle 2 › Boks 4'),
    placed('Sekk', 'Loftsbod › Hylle 1'),
    placed('Ski', 'Kjellerbod'),
    placed('Krakk'),
  ]

  it('gathers a whole room under one heading', () => {
    const out = groupItems(items, levelId(plassering, 1))
    expect(out.map((g) => g.label)).toEqual(['Kjellerbod', 'Loftsbod', null])
    expect(out[1]?.items.map((i) => i.name)).toEqual(['Telt', 'Sekk'])
  })

  it('splits the room into its shelves a level down, and leaves out what does not reach', () => {
    const out = groupItems(items, levelId(plassering, 2))
    expect(out.map((g) => g.label)).toEqual(['Loftsbod › Hylle 1', 'Loftsbod › Hylle 2', null])
    expect(out[2]?.items.map((i) => i.name)).toEqual(['Ski', 'Krakk'])
  })
})
