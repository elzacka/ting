import { describe, expect, it } from 'vitest'
import type { Item } from '../db/schema'
import { categoryProperty, columnDefs, defaultFieldSettings, readFieldSettings } from './fields'
import { columnId } from './grid'

function item(name: string, specs: Item['specs']): Item {
  return {
    id: crypto.randomUUID(),
    name,
    specs,
    photo: null,
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
  it('puts Kategori and Navn first by default, then properties by order, then item-only columns', () => {
    expect(columnDefs(defaultFieldSettings, [categoryProperty(), ...props], items).map((d) => d.id)).toEqual([
      categoryProperty().id,
      'name',
      columnId({ key: 'R-verdi', unit: null }),
      columnId({ key: 'Brensel', unit: null }),
      columnId({ key: 'Vekt', unit: 'kg' }),
    ])
  })

  it('lets Navn sit anywhere', () => {
    const fields = { name: { label: null, order: 0.5 } }
    expect(columnDefs(fields, props, items).map((d) => d.kind)).toEqual(['prop', 'name', 'prop', 'prop'])
  })
})

describe('readFieldSettings', () => {
  it('fills in defaults for missing or partial settings', () => {
    expect(readFieldSettings(undefined)).toEqual(defaultFieldSettings)
    expect(readFieldSettings({ name: { label: 'Ting' } }).name).toEqual({ label: 'Ting', order: -1 })
  })
})
