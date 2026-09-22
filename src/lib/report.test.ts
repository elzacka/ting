import { describe, expect, it } from 'vitest'
import type { Item } from '../db/schema'
import { columnId } from './grid'
import { groupItems } from './report'

const kategori = columnId({ key: 'Kategori', unit: '' })

function item(name: string, category?: string): Item {
  return {
    id: crypto.randomUUID(),
    name,
    specs: category === undefined ? [] : [{ key: 'Kategori', value: category, unit: null }],
    photo: null,
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
