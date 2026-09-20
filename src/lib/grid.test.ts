import { describe, expect, it } from 'vitest'
import type { Item } from '../db/schema'
import { cellsFrom, columnId, columnsFrom, specsFrom } from './grid'

function item(name: string, specs: Item['specs']): Item {
  return {
    id: crypto.randomUUID(),
    name,
    category: 'Turutstyr',
    specs,
    photo: null,
    createdAt: 0,
    updatedAt: 0,
  }
}

const items = [
  item('A', [
    { key: 'Vekt', value: 1250, unit: 'gram' },
    { key: 'Komforttemperatur', value: -12, unit: '°C' },
  ]),
  item('B', [
    { key: 'vekt', value: 1.1, unit: 'kg' },
    { key: 'komforttemperatur', value: 5, unit: '°C' },
  ]),
]

describe('columnsFrom', () => {
  it('merges same key and unit ignoring case, splits on unit', () => {
    expect(columnsFrom(items)).toEqual([
      { key: 'Komforttemperatur', unit: '°C' },
      { key: 'Vekt', unit: 'gram' },
      { key: 'vekt', unit: 'kg' },
    ])
  })
})

describe('cellsFrom and specsFrom', () => {
  it('round-trips a row through cells', () => {
    const columns = columnsFrom(items)
    const first = items[0]
    if (!first) throw new Error('fixture missing')
    const cells = cellsFrom(first)
    expect(cells[columnId({ key: 'vekt', unit: 'GRAM' })]).toBe('1250')
    expect(specsFrom(cells, columns)).toEqual([
      { key: 'Komforttemperatur', value: -12, unit: '°C' },
      { key: 'Vekt', value: 1250, unit: 'gram' },
    ])
  })

  it('skips blank cells and keeps text values', () => {
    const brensel = { key: 'Brensel', unit: null }
    const vekt = { key: 'Vekt', unit: 'gram' }
    expect(specsFrom({ [columnId(brensel)]: 'Gass', [columnId(vekt)]: '  ' }, [brensel, vekt])).toEqual([
      { key: 'Brensel', value: 'Gass', unit: null },
    ])
  })
})
