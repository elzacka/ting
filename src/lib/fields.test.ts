import { describe, expect, it } from 'vitest'
import type { Item } from '../db/schema'
import { columnDefs, defaultFieldSettings, readFieldSettings } from './fields'
import { columnId } from './grid'

function item(name: string, specs: Item['specs']): Item {
  return {
    id: crypto.randomUUID(),
    name,
    category: 'Turutstyr',
    specs,
    locationId: null,
    value: null,
    purchaseDate: null,
    receiptImage: null,
    photo: null,
    barcode: null,
    serialNumber: null,
    note: null,
    warrantyDate: null,
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
  it('puts built-in fields first by default, then properties by order, then item-only columns', () => {
    expect(columnDefs(defaultFieldSettings, props, items).map((d) => d.id)).toEqual([
      'category',
      'name',
      columnId({ key: 'R-verdi', unit: null }),
      columnId({ key: 'Brensel', unit: null }),
      columnId({ key: 'Vekt', unit: 'kg' }),
    ])
  })

  it('lets built-in fields sit anywhere and drops a hidden category', () => {
    const fields = { category: { label: null, order: 9, hidden: false }, name: { label: null, order: 0.5 } }
    expect(columnDefs(fields, props, items).map((d) => d.kind)).toEqual(['prop', 'name', 'prop', 'category', 'prop'])
    const hidden = { ...fields, category: { ...fields.category, hidden: true } }
    expect(columnDefs(hidden, props, items).some((d) => d.kind === 'category')).toBe(false)
  })
})

describe('readFieldSettings', () => {
  it('fills in defaults for missing or partial settings', () => {
    expect(readFieldSettings(undefined)).toEqual(defaultFieldSettings)
    expect(readFieldSettings({ name: { label: 'Ting' } }).name).toEqual({ label: 'Ting', order: -1 })
  })
})
