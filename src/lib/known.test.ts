import { describe, expect, it } from 'vitest'
import type { Item } from '../db/schema'
import { columnDefs, defaultFieldSettings } from './fields'
import { columnId } from './grid'
import { codeKey, knownCells, sameCode } from './known'

function item(name: string, createdAt: number, specs: Item['specs']): Item {
  return { id: crypto.randomUUID(), name, specs, photos: [], createdAt, updatedAt: createdAt }
}

describe('codeKey', () => {
  it('spells an ISBN-10 as its ISBN-13 and drops what a number would have lost', () => {
    expect(codeKey('0-14-044913-2')).toBe('9780140449136')
    expect(codeKey('012345678905')).toBe(codeKey('12345678905'))
    expect(codeKey(' SN-12 ')).toBe('SN-12')
  })
})

describe('sameCode and knownCells', () => {
  const items = [
    item('Kaffe 250 g', 1, [{ key: 'Strekkode', value: 12345678905, unit: null }]),
    item('Kaffe 250 g', 2, [
      { key: 'Strekkode', value: '012345678905', unit: null },
      { key: 'Merke', value: 'Friele', unit: null },
      { key: 'Kjøpsdato', value: '2026-10-01', unit: 'dato' },
    ]),
    item('Te', 3, [{ key: 'Strekkode', value: '7038010009457', unit: null }]),
  ]

  it('finds every thing with the code, newest first, whether stored as text or as a number', () => {
    expect(sameCode(items, '012345678905').map((i) => i.createdAt)).toEqual([2, 1])
    expect(sameCode(items, '')).toEqual([])
  })

  it('copies the known thing’s values, but not its dates', () => {
    const defs = columnDefs(
      defaultFieldSettings,
      [
        { id: columnId({ key: 'Merke', unit: null }), key: 'Merke', unit: null, createdAt: 0 },
        { id: columnId({ key: 'Kjøpsdato', unit: 'dato' }), key: 'Kjøpsdato', unit: 'dato', createdAt: 0, type: 'date' },
      ],
      [],
    ).flatMap((d) => (d.kind === 'prop' ? [d] : []))
    expect(knownCells(items[1]!, defs)).toEqual({ [columnId({ key: 'Merke', unit: null })]: 'Friele' })
  })
})
