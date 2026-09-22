import { describe, expect, it } from 'vitest'
import type { Item } from '../db/schema'
import {
  appliesTo,
  categoryProperty,
  claimedBy,
  columnDefs,
  defaultFieldSettings,
  readFieldSettings,
  withCategory,
} from './fields'
import { columnId } from './grid'

function item(name: string, specs: Item['specs']): Item {
  return {
    id: crypto.randomUUID(),
    name,
    specs,
    photos: [],
    createdAt: 0,
    updatedAt: 0,
  }
}

const items = [item('A', [{ key: 'Vekt', value: 1, unit: 'kg' }])]
const props = [
  { id: columnId({ key: 'Brensel', unit: null }), key: 'Brensel', unit: null, createdAt: 2, order: 1 },
  { id: columnId({ key: 'R-verdi', unit: null }), key: 'R-verdi', unit: null, createdAt: 1, order: 0 },
]

describe('columnDefs', () => {
  it('puts Navn first, then Kategori and the properties by order, then item-only columns', () => {
    expect(columnDefs(defaultFieldSettings, [categoryProperty(), ...props], items).map((d) => d.id)).toEqual([
      'name',
      categoryProperty().id,
      columnId({ key: 'R-verdi', unit: null }),
      columnId({ key: 'Brensel', unit: null }),
      columnId({ key: 'Vekt', unit: 'kg' }),
    ])
  })

  it('keeps Navn first whatever the property orders say', () => {
    const early = props.map((p) => ({ ...p, order: -100 }))
    expect(columnDefs(defaultFieldSettings, early, items).map((d) => d.kind)).toEqual(['name', 'prop', 'prop', 'prop'])
  })
})

describe('readFieldSettings', () => {
  it('fills in defaults for missing or partial settings', () => {
    expect(readFieldSettings(undefined)).toEqual(defaultFieldSettings)
    expect(readFieldSettings({ name: { label: 'Ting' } }).name).toEqual({ label: 'Ting' })
  })
})

function column(categories?: string[]) {
  return {
    id: columnId({ key: 'Forfatter', unit: null }),
    key: 'Forfatter',
    unit: null,
    createdAt: 0,
    ...(categories ? { categories } : {}),
  }
}

describe('appliesTo', () => {
  it('lets a column that names no category belong everywhere', () => {
    expect(appliesTo(column(), [])).toBe(true)
    expect(appliesTo(column(), ['Bok'])).toBe(true)
    expect(appliesTo(column([]), ['Bok'])).toBe(true)
    expect(appliesTo(null, ['Bok'])).toBe(true)
  })

  it('keeps a named column out of the view of every category at once', () => {
    expect(appliesTo(column(['Bok']), [])).toBe(false)
  })

  it('matches the category however it was typed', () => {
    expect(appliesTo(column(['Bok']), ['bok'])).toBe(true)
    expect(appliesTo(column(['Turutstyr']), [' turutstyr '])).toBe(true)
    expect(appliesTo(column(['Bok']), ['Elektronikk'])).toBe(false)
  })

  it('needs every category in view, not just one of them', () => {
    expect(appliesTo(column(['Bok', 'Tegneserie']), ['Bok', 'Tegneserie'])).toBe(true)
    expect(appliesTo(column(['Bok']), ['Bok', 'Tegneserie'])).toBe(false)
  })
})

describe('claimedBy', () => {
  it('is the columns a category asks for, which stay on screen while empty', () => {
    expect(claimedBy(column(['Bok']), ['Bok'])).toBe(true)
    expect(claimedBy(column(['Bok']), ['Elektronikk'])).toBe(false)
    // Belongs everywhere, so no category asked for it in particular
    expect(claimedBy(column(), ['Bok'])).toBe(false)
    expect(claimedBy(column(['Bok']), [])).toBe(false)
  })
})

describe('withCategory', () => {
  it('narrows a column to a category and widens it back', () => {
    expect(withCategory(column(), 'Bok', true)).toEqual(['Bok'])
    expect(withCategory(column(['Bok']), 'Elektronikk', true)).toEqual(['Bok', 'Elektronikk'])
    expect(withCategory(column(['Bok', 'Elektronikk']), 'Bok', false)).toEqual(['Elektronikk'])
    // Emptied, it belongs everywhere again
    expect(withCategory(column(['Bok']), 'bok', false)).toEqual([])
  })

  it('does not list the same category twice', () => {
    expect(withCategory(column(['Bok']), 'bok', true)).toEqual(['bok'])
  })
})
