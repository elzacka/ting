import { describe, expect, it } from 'vitest'
import type { Property } from '../db/schema'
import { closestValue, linesSum, receiptColumns, receiptInputs } from './receiptItems'

const photo = new Blob(['k'], { type: 'image/jpeg' })

describe('receiptColumns', () => {
  it('makes Kjøpt hos, Kjøpsdato and Pris when the register has none', () => {
    const cols = receiptColumns([], 7)
    expect(cols.missing.map((p) => [p.key, p.unit, p.type])).toEqual([
      ['Kjøpt hos', null, 'choice'],
      ['Kjøpsdato', 'dato', 'date'],
      ['Pris', 'kr', 'number'],
    ])
  })

  it('uses the register’s own columns where they fit by name and type', () => {
    const own: Property[] = [
      { id: 'a', key: 'Butikk', unit: null, type: 'choice', createdAt: 1 },
      { id: 'b', key: 'Kjøpt', unit: 'dato', type: 'date', createdAt: 1 },
      { id: 'c', key: 'Verdi', unit: 'kr', type: 'number', createdAt: 1 },
    ]
    const cols = receiptColumns(own, 7)
    expect([cols.store.id, cols.date.id, cols.price.id]).toEqual(['a', 'b', 'c'])
    expect(cols.missing).toEqual([])
  })

  it('does not take a price column that is not in kroner', () => {
    const cols = receiptColumns([{ id: 'v', key: 'Pris', unit: 'EUR', type: 'number', createdAt: 1 }], 7)
    expect(cols.price.unit).toBe('kr')
  })
})

describe('receiptInputs', () => {
  const cols = receiptColumns([], 7)
  const shared = {
    store: 'Butikken Sentrum',
    date: '2026-01-15',
    more: [{ key: 'Kategori', value: 'Hjem', unit: '' }],
    receipt: photo,
  }

  it('makes one thing per ticked, named row with the shared values and its own price', () => {
    const out = receiptInputs(
      [
        { include: true, name: 'Lampe', price: '1 299,50', photos: [] },
        { include: false, name: 'Pose', price: '2,00', photos: [] },
        { include: true, name: ' ', price: '10', photos: [] },
      ],
      cols,
      shared,
    )
    expect(out).toHaveLength(1)
    expect(out[0]?.name).toBe('Lampe')
    expect(out[0]?.specs).toEqual([
      { key: 'Kategori', value: 'Hjem', unit: '' },
      { key: 'Kjøpt hos', value: 'Butikken Sentrum', unit: null },
      { key: 'Kjøpsdato', value: '2026-01-15', unit: 'dato' },
      { key: 'Pris', value: 1299.5, unit: 'kr' },
    ])
    expect(out[0]?.photos).toEqual([photo])
  })

  it('leaves out a price that is not a number and a missing date', () => {
    const out = receiptInputs([{ include: true, name: 'Lampe', price: 'ukjent', photos: [] }], cols, { ...shared, date: null })
    expect(out[0]?.specs.map((s) => s.key)).toEqual(['Kategori', 'Kjøpt hos'])
  })

  it('puts the thing’s own photos before the receipt, so one of them is the main photo', () => {
    const own = new Blob(['p'], { type: 'image/jpeg' })
    const out = receiptInputs([{ include: true, name: 'Lampe', price: '10', photos: [own] }], cols, shared)
    expect(out[0]?.photos).toEqual([own, photo])
  })
})

describe('closestValue', () => {
  it('matches an OCR misreading to a store already in the register', () => {
    expect(closestValue('Bjerkely Vestby', ['Nordlys Sentrum', 'Bjørkely Vestby'])).toBe('Bjørkely Vestby')
  })
  it('keeps the suggestion when nothing is close', () => {
    expect(closestValue('Nordlys Sentrum', ['Bjørkely Vestby'])).toBe('Nordlys Sentrum')
    expect(closestValue('Kid', ['Kad'])).toBe('Kid')
  })
})

describe('linesSum', () => {
  it('counts a line left out, since the receipt total includes it', () => {
    const rows = [
      { include: true, name: 'Dyne', price: '499,00', photos: [] },
      { include: false, name: 'Bærepose', price: '2,50', photos: [] },
      { include: true, name: '', price: '', photos: [] },
    ]
    expect(linesSum(rows)).toBeCloseTo(501.5)
  })
})
