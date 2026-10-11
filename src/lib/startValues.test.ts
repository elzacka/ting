import { describe, expect, it } from 'vitest'
import type { Item, Property } from '../db/schema'
import { columnDefs, defaultFieldSettings } from './fields'
import { columnId } from './grid'
import { startValues } from './startValues'

const status = { key: 'Status', unit: null }
const sted = { key: 'Plassering', unit: 'sti' }
const list = { key: 'Plassering', unit: null }
const merke = { key: 'Merke', unit: null }

function thing(at: number, specs: [{ key: string; unit: string | null }, string][]): Item {
  return { id: String(at), name: 'x', specs: specs.map(([c, value]) => ({ ...c, value })), photos: [], createdAt: at, updatedAt: at }
}
const start = (props: Property[], items: Item[]) => startValues(columnDefs(defaultFieldSettings, props, items), items)
const prop = (c: { key: string; unit: string | null }, type: Property['type'], options?: string[]): Property => ({
  id: columnId(c), ...c, type, createdAt: 1, ...(options ? { options } : {}),
})

describe('startValues', () => {
  it('starts a list holding I bruk there, even when no thing holds it yet', () => {
    expect(start([prop(status, 'choice', ['Lagret', 'I bruk'])], [])[columnId(status)]).toBe('I bruk')
    expect(start([prop(merke, 'choice', ['Kid'])], [])[columnId(merke)]).toBeUndefined()
  })

  it('starts a place at Leilighet, though more things are elsewhere', () => {
    const items = [thing(1, [[sted, 'Kjellerbod › Hylle 1']]), thing(2, [[sted, 'Kjellerbod']]), thing(3, [[sted, 'Leilighet › Stue']])]
    expect(start([prop(sted, 'path')], items)[columnId(sted)]).toBe('Leilighet')
  })

  it('starts a place kept as a list at Leilighet, else at the value most things hold', () => {
    const lp = [prop(list, 'choice')]
    expect(start(lp, [thing(1, [[list, 'Kjellerbod']]), thing(2, [[list, 'Leilighet']])])[columnId(list)]).toBe('Leilighet')
    expect(start(lp, [thing(1, [[list, 'Kjellerbod']]), thing(2, [[list, 'Kjellerbod']]), thing(3, [[list, 'Loft']])])[columnId(list)]).toBe('Kjellerbod')
  })
})
