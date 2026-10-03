import { describe, expect, it } from 'vitest'
import type { Item, Property } from '../db/schema'
import { lastChange, mergeRegisters, newestStamp, noTombstones, nothingNew, revive, stampChanges, type Register } from './merge'

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const photo = (bytes: string) => new Blob([bytes], { type: 'image/jpeg' })

function thing(n: number, over: Partial<Item> = {}): Item {
  return { id: id(n), name: `Ting ${n}`, specs: [], photos: [], createdAt: 1, updatedAt: 1, ...over }
}

function reg(items: Item[], over: Partial<Register> = {}): Register {
  return { items, properties: [], fields: { name: { label: null } }, fieldsAt: 0, tombstones: noTombstones(), ...over }
}

const price = (value: number) => ({ key: 'Pris', value, unit: 'kr' })

describe('stampChanges', () => {
  it('stamps only the fields that changed', () => {
    const prev = thing(1, { specs: [price(100)], updatedAt: 5 })
    const next = stampChanges(prev, { ...prev, specs: [price(120)] }, 9)
    expect(next.updatedAt).toBe(9)
    expect(next.stamps?.name).toBe(5)
    expect(next.stamps?.['spec:["pris","kr"]']).toBe(9)
  })

  it('records a removed value with the time it was removed', () => {
    const prev = thing(1, { specs: [price(100)], updatedAt: 5 })
    const next = stampChanges(prev, { ...prev, specs: [] }, 9)
    expect(next.stamps?.['spec:["pris","kr"]']).toBe(9)
  })

  it('treats a photo with the same type and size as unchanged', () => {
    const prev = thing(1, { photos: [photo('abc')], updatedAt: 5 })
    expect(stampChanges(prev, { ...prev, photos: [photo('xyz')] }, 9).updatedAt).toBe(5)
    expect(stampChanges(prev, { ...prev, photos: [photo('abcd')] }, 9).stamps?.photos).toBe(9)
  })
})

describe('mergeRegisters', () => {
  it('keeps a photo added on one side and a price fixed on the other', () => {
    const base = thing(1, { specs: [price(100)], updatedAt: 5 })
    const phone = stampChanges(base, { ...base, photos: [photo('p')] }, 10)
    const mac = stampChanges(base, { ...base, specs: [price(150)] }, 11)
    const { merged, summary } = mergeRegisters(reg([mac]), reg([phone]), 6)
    expect(merged.items[0]?.photos).toHaveLength(1)
    expect(merged.items[0]?.specs).toEqual([price(150)])
    expect(summary).toMatchObject({ added: 0, changed: 1, deleted: 0, both: 0 })
  })

  it('keeps the newest value when both sides changed the same field, and counts it', () => {
    const base = thing(1, { specs: [price(100)], updatedAt: 5 })
    const a = stampChanges(base, { ...base, specs: [price(110)] }, 10)
    const b = stampChanges(base, { ...base, specs: [price(120)] }, 12)
    const { merged, summary } = mergeRegisters(reg([a]), reg([b]), 6)
    expect(merged.items[0]?.specs).toEqual([price(120)])
    expect(summary.both).toBe(1)
  })

  it('gives the same result in either order and when repeated', () => {
    const base = thing(1, { specs: [price(100)], updatedAt: 5 })
    const a = reg([stampChanges(base, { ...base, name: 'Telt' }, 10), thing(2)])
    const b = reg([stampChanges(base, { ...base, specs: [price(90)] }, 11), thing(3)])
    const ab = mergeRegisters(a, b, 0).merged
    const ba = mergeRegisters(b, a, 0).merged
    const sort = (r: Register) => [...r.items].sort((x, y) => x.id.localeCompare(y.id))
    expect(sort(ab)).toEqual(sort(ba))
    const again = mergeRegisters(ab, b, 0)
    expect(nothingNew(again.summary)).toBe(true)
  })

  it('does not let a side that never held a value remove it', () => {
    const base = thing(1, { updatedAt: 5 })
    const withPrice = stampChanges(base, { ...base, specs: [price(100)] }, 10)
    const renamed = stampChanges(base, { ...base, name: 'Nytt navn' }, 12)
    const { merged } = mergeRegisters(reg([withPrice]), reg([renamed]), 0)
    expect(merged.items[0]).toMatchObject({ name: 'Nytt navn', specs: [price(100)] })
  })

  it('adds things only the other side has', () => {
    const { merged, summary } = mergeRegisters(reg([thing(1)]), reg([thing(1), thing(2)]), 0)
    expect(merged.items.map((i) => i.id)).toEqual([id(1), id(2)])
    expect(summary.added).toBe(1)
  })

  it('deletes a thing the other side deleted, and keeps it deleted', () => {
    const tomb = { items: { [id(1)]: 20 }, properties: {} }
    const { merged, summary } = mergeRegisters(reg([thing(1, { updatedAt: 10 })]), reg([], { tombstones: tomb }), 0)
    expect(merged.items).toEqual([])
    expect(summary.deleted).toBe(1)
    const back = mergeRegisters(merged, reg([thing(1, { updatedAt: 10 })]), 0)
    expect(back.merged.items).toEqual([])
    expect(back.summary.added).toBe(0)
  })

  it('keeps a thing edited after the other side deleted it', () => {
    const tomb = { items: { [id(1)]: 20 }, properties: {} }
    const { merged } = mergeRegisters(reg([thing(1, { updatedAt: 30 })]), reg([], { tombstones: tomb }), 0)
    expect(merged.items).toHaveLength(1)
  })

  it('lets a revived thing win over its tombstone', () => {
    const tomb = { items: { [id(1)]: 20 }, properties: {} }
    const restored = revive(thing(1, { updatedAt: 10 }), 30)
    expect(lastChange(restored)).toBe(30)
    expect(restored.stamps?.name).toBe(10)
    expect(mergeRegisters(reg([restored]), reg([], { tombstones: tomb }), 0).merged.items).toHaveLength(1)
  })

  it('merges columns by id, newest wins, and drops removed ones', () => {
    const vekt: Property = { id: 'vekt', key: 'Vekt', unit: 'kg', createdAt: 1, updatedAt: 5 }
    const farge: Property = { id: 'farge', key: 'Farge', unit: null, createdAt: 1 }
    const local = reg([], { properties: [vekt, farge] })
    const remote = reg([], {
      properties: [{ ...vekt, order: 3, updatedAt: 9 }],
      tombstones: { items: {}, properties: { farge: 4 } },
    })
    const { merged, summary } = mergeRegisters(local, remote, 0)
    expect(merged.properties).toEqual([{ ...vekt, order: 3, updatedAt: 9 }])
    expect(summary.layout).toBe(true)
  })

  it('takes the newer field settings', () => {
    const local = reg([], { fieldsAt: 2 })
    const remote = reg([], { fields: { name: { label: 'Gjenstand' } }, fieldsAt: 5 })
    expect(mergeRegisters(local, remote, 0).merged.fields.name.label).toBe('Gjenstand')
  })

  it('finds the newest stamp anywhere in a register', () => {
    const r = reg([thing(1, { updatedAt: 3, stamps: { name: 40 } })], { tombstones: { items: { x: 50 }, properties: {} } })
    expect(newestStamp(r)).toBe(50)
  })
})

describe('stampChanges without a change', () => {
  it('keeps the times of a thing nothing changed on', () => {
    const prev = thing(1, { specs: [price(100)], updatedAt: 5 })
    expect(stampChanges(prev, { ...prev }, 9).updatedAt).toBe(5)
  })
})
