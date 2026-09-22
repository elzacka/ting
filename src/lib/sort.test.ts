import { describe, expect, it } from 'vitest'
import type { Item } from '../db/schema'
import { columnId } from './grid'
import { nextSort, sortItems } from './sort'

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

const vekt = { key: 'Vekt', unit: 'gram' }
const dato = { key: 'Kjøpsdato', unit: 'dato' }
const items = [
  item('Telt', 'Turutstyr', [{ key: 'Vekt', value: 2400, unit: 'gram' }, { key: 'Kjøpsdato', value: '2024-05-01', unit: 'dato' }]),
  item('Ås', 'Annet', []),
  item('Sovepose', 'Turutstyr', [{ key: 'Vekt', value: '900', unit: 'gram' }, { key: 'Kjøpsdato', value: '2026-01-15', unit: 'dato' }]),
  item('Ørn', 'Bok', [{ key: 'Vekt', value: 12, unit: 'gram' }]),
]
const names = (s: Parameters<typeof sortItems>[2]) => sortItems(items, [vekt, dato], s).map((i) => i.name)

describe('sortItems', () => {
  it('sorts text with Norwegian collation and numbers by value, empties last', () => {
    expect(names({ id: 'name', dir: 'asc' })).toEqual(['Sovepose', 'Telt', 'Ørn', 'Ås'])
    expect(names({ id: 'name', dir: 'desc' })).toEqual(['Ås', 'Ørn', 'Telt', 'Sovepose'])
    expect(names({ id: columnId(vekt), dir: 'asc' })).toEqual(['Ørn', 'Sovepose', 'Telt', 'Ås'])
    expect(names({ id: columnId(vekt), dir: 'desc' })).toEqual(['Telt', 'Sovepose', 'Ørn', 'Ås'])
    expect(names({ id: columnId(dato), dir: 'asc' })).toEqual(['Telt', 'Sovepose', 'Ås', 'Ørn'])
    expect(names(null)).toEqual(['Telt', 'Ås', 'Sovepose', 'Ørn'])
  })
})

describe('nextSort', () => {
  it('cycles ascending, descending, off', () => {
    expect(nextSort(null, 'name')).toEqual({ id: 'name', dir: 'asc' })
    expect(nextSort({ id: 'name', dir: 'asc' }, 'name')).toEqual({ id: 'name', dir: 'desc' })
    expect(nextSort({ id: 'name', dir: 'desc' }, 'name')).toBeNull()
    expect(nextSort({ id: 'name', dir: 'desc' }, 'category')).toEqual({ id: 'category', dir: 'asc' })
  })
})
