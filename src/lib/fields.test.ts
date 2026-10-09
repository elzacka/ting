import { describe, expect, it } from 'vitest'
import type { Item, Property } from '../db/schema'
import {
  appliesTo,
  categoryFields,
  categoryProperty,
  choiceDefs,
  claimedBy,
  columnDefs,
  defaultFieldSettings,
  moveColumnTo,
  readFieldSettings,
  withCategory,
} from './fields'
import { columnId } from './grid'
import { pathUnit } from './paths'

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
    expect(appliesTo(null, ['Bok'])).toBe(true)
  })

  it('keeps a column no category uses out of every category', () => {
    expect(appliesTo(column([]), ['Bok'])).toBe(false)
    expect(appliesTo(column([]), [])).toBe(false)
  })

  it('keeps a named column out of the view of every category at once', () => {
    expect(appliesTo(column(['Bok']), [])).toBe(false)
  })

  it('matches the category however it was typed', () => {
    expect(appliesTo(column(['Bok']), ['bok'])).toBe(true)
    expect(appliesTo(column(['Turutstyr']), [' turutstyr '])).toBe(true)
    expect(appliesTo(column(['Bok']), ['Elektronikk'])).toBe(false)
  })

  it('belongs to a view of several categories when one of them has it', () => {
    expect(appliesTo(column(['Bok', 'Tegneserie']), ['Bok', 'Tegneserie'])).toBe(true)
    expect(appliesTo(column(['Bok']), ['Bok', 'Tegneserie'])).toBe(true)
    expect(appliesTo(column(['Bok']), ['Elektronikk', 'Tegneserie'])).toBe(false)
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

  it('is asked for by a view of several categories when one of them asks', () => {
    expect(claimedBy(column(['Bok']), ['Bok', 'Elektronikk'])).toBe(true)
  })
})

describe('withCategory', () => {
  const all = ['Bok', 'Elektronikk', 'Kjøkken']

  it('adds a category to a column and takes it off again', () => {
    expect(withCategory(column(['Bok']), 'Elektronikk', true, all)).toEqual(['Bok', 'Elektronikk'])
    expect(withCategory(column(['Bok', 'Elektronikk']), 'Bok', false, all)).toEqual(['Elektronikk'])
  })

  it('leaves a column no category uses when the last one stops, not one every category uses', () => {
    expect(withCategory(column(['Bok']), 'bok', false, all)).toEqual([])
  })

  it('keeps every other category on a column every category used', () => {
    expect(withCategory(column(), 'Bok', false, all)).toEqual(['Elektronikk', 'Kjøkken'])
    expect(withCategory(column(), 'Bok', true, all)).toBeUndefined()
  })

  it('does not list the same category twice', () => {
    expect(withCategory(column(['Bok']), 'bok', true, all)).toEqual(['bok'])
  })
})

describe('choiceDefs', () => {
  const prop = (key: string, order: number, type: 'choice' | 'path' | 'text', categories?: string[]) => ({
    id: columnId({ key, unit: null }),
    key,
    unit: null,
    createdAt: 0,
    order,
    type,
    ...(categories ? { categories } : {}),
  })
  // Moved on the desk: Type and Plassering left of Kategori, a text column among them
  const properties = [
    prop('Type', 0, 'choice', ['Bøker']),
    prop('Plassering', 1, 'path'),
    prop('Notat', 2, 'text'),
    { ...categoryProperty(), order: 3 },
    prop('Rom', 4, 'choice'),
  ]
  const ids = (category: string) =>
    choiceDefs(columnDefs(defaultFieldSettings, properties, []), category).map((d) => d.col.key)

  it('puts Kategori first, then places, then the other lists, whatever the column order', () => {
    expect(ids('Bøker')).toEqual(['Kategori', 'Plassering', 'Type', 'Rom'])
  })

  it('leaves out the lists another category owns', () => {
    expect(ids('Klær')).toEqual(['Kategori', 'Plassering', 'Rom'])
    expect(ids('')).toEqual(['Kategori', 'Plassering', 'Rom'])
  })
})

describe('moveColumnTo', () => {
  const defs = columnDefs(
    defaultFieldSettings,
    ['A', 'B', 'C', 'D'].map((key, order) => ({ id: columnId({ key, unit: null }), key, unit: null, createdAt: 0, order })),
    [],
  )
  const ids = (list: ReturnType<typeof moveColumnTo>) => list?.map((d) => d.id)
  const id = (key: string) => columnId({ key, unit: null })

  it('puts a column moved right after its target, past the hidden ones between', () => {
    expect(ids(moveColumnTo(defs, id('A'), id('C')))).toEqual(ids([defs[0]!, defs[2]!, defs[3]!, defs[1]!, defs[4]!]))
  })

  it('puts a column moved left before its target', () => {
    expect(ids(moveColumnTo(defs, id('D'), id('A')))).toEqual(ids([defs[0]!, defs[4]!, defs[1]!, defs[2]!, defs[3]!]))
  })

  it('never moves Navn or puts a column before it', () => {
    expect(moveColumnTo(defs, 'name', id('B'))).toBeNull()
    expect(moveColumnTo(defs, id('B'), 'name')).toBeNull()
    expect(moveColumnTo(defs, id('B'), id('B'))).toBeNull()
  })
})

describe('categoryFields', () => {
  const p = (key: string, order: number, extra: Partial<Property> = {}) => ({
    id: columnId({ key, unit: null }),
    key,
    unit: null,
    createdAt: 0,
    order,
    ...extra,
  })
  const props: Property[] = [
    p('Forfatter', 0, { categories: ['Bøker'] }),
    p('Merke', 1, { categories: ['Verktøy'] }),
    p('Plassering', 2, { type: 'path', unit: pathUnit }),
    p('Notat', 3),
  ]
  const keys = (category: string, has?: (id: string) => boolean) =>
    categoryFields(columnDefs(defaultFieldSettings, props, []), category, has).map((d) => d.col.key)

  it('lists the place first, then the category’s own and every-category fields in column order', () => {
    expect(keys('Bøker')).toEqual(['Plassering', 'Forfatter', 'Notat'])
    expect(keys('Verktøy')).toEqual(['Plassering', 'Merke', 'Notat'])
  })

  it('keeps another category’s field only while it holds a value', () => {
    expect(keys('Bøker', (id) => id === columnId({ key: 'Merke', unit: null }))).toContain('Merke')
  })
})
