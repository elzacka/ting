import { describe, expect, it } from 'vitest'
import type { Item, Property, Spec } from '../db/schema'
import { categoryColumnId, columnDefs, defaultFieldSettings, type ChoiceDef } from './fields'
import { columnId } from './grid'
import { receiptGuess } from './receiptGuess'

const kat = { key: 'Kategori', unit: '' }
const merke = { key: 'Merke', unit: null }
const type = { key: 'Type', unit: null }
const status = { key: 'Status', unit: null }
const sted = { key: 'Plassering', unit: 'sti' }
const butikk = { key: 'Kjøpt hvor', unit: null }
const id = columnId

const props: Property[] = [
  { id: categoryColumnId, key: 'Kategori', unit: '', type: 'choice', createdAt: 1 },
  { id: id(merke), ...merke, type: 'choice', createdAt: 1, options: ['Samsung'] },
  { id: id(type), ...type, type: 'choice', createdAt: 1, categories: ['Tekstil'] },
  { id: id(status), ...status, type: 'choice', createdAt: 1, options: ['I bruk', 'Solgt'] },
  { id: id(sted), ...sted, type: 'path', createdAt: 1 },
  { id: id(butikk), ...butikk, type: 'choice', createdAt: 1 },
]

let at = 0
function thing(name: string, specs: [{ key: string; unit: string | null }, string][]): Item {
  at++
  return { id: name, name, specs: specs.map(([c, value]): Spec => ({ ...c, value })), photos: [], createdAt: at, updatedAt: at }
}

const items = [
  thing('Dyne', [[kat, 'Tekstil'], [type, 'Dyne'], [sted, 'Leilighet › Soverom']]),
  thing('Pute', [[kat, 'Tekstil'], [type, 'Pute'], [sted, 'Leilighet › Soverom'], [butikk, 'Lun Sentrum']]),
  thing('Drill', [[kat, 'Verktøy'], [merke, 'Bosch'], [sted, 'Kjellerbod']]),
  thing('Bordlampe', [[kat, 'Belysning'], [merke, 'IKEA'], [sted, 'Leilighet › Stue']]),
  thing('Mobil', [[kat, 'Elektronikk'], [merke, 'Samsung'], [sted, 'Leilighet']]),
]
const lists = columnDefs(defaultFieldSettings, props, items).filter(
  (d): d is ChoiceDef => d.kind === 'prop' && (d.type === 'choice' || d.type === 'path') && d.id !== id(butikk),
)
const guess = (names: string[], store = '') => receiptGuess(names, store, id(butikk), lists, items)

describe('receiptGuess', () => {
  it('reads Type from the end of a compound and Kategori from the things of that Type', () => {
    const g = guess(['Duna ekstra varm dundyne hvit'])
    expect(g[id(type)]).toBe('Dyne')
    expect(g[categoryColumnId]).toBe('Tekstil')
  })

  it('takes a brand named on the line, and its category', () => {
    const g = guess(['SAMSUNG QLED 55" Q80D'])
    expect(g[id(merke)]).toBe('Samsung')
    expect(g[categoryColumnId]).toBe('Elektronikk')
  })

  it('takes the brand from the store when the line names none', () => {
    expect(guess(['Bordplate eik 74x'], 'IKEA Sentrum')[id(merke)]).toBe('IKEA')
  })

  it('takes the category of a thing named alike', () => {
    expect(guess(['Bordlampe messing'])[categoryColumnId]).toBe('Belysning')
  })

  it('takes the category most things from the same store hold', () => {
    expect(guess(['Duna 140x200'], 'Lun Sentrum')[categoryColumnId]).toBe('Tekstil')
  })

  it('starts in use, at the place most things are in', () => {
    const g = guess(['Noe helt annet'])
    expect(g[id(status)]).toBe('I bruk')
    expect(g[id(sted)]).toBe('Leilighet')
    expect(g[categoryColumnId]).toBeUndefined()
  })

  it('fills a field only where every line agrees', () => {
    const g = guess(['Duna dundyne', 'Samsung mobil'])
    expect(g[id(type)]).toBeUndefined()
    expect(g[id(merke)]).toBeUndefined()
    expect(g[categoryColumnId]).toBeUndefined()
    expect(guess(['Duna dundyne', 'Annen dyne'])[categoryColumnId]).toBe('Tekstil')
  })

  it('starts a place kept as a list at the value most things hold', () => {
    const list = { key: 'Plassering', unit: null }
    const ps: Property[] = [{ id: categoryColumnId, key: 'Kategori', unit: '', type: 'choice', createdAt: 1 }, { id: id(list), ...list, type: 'choice', createdAt: 1 }]
    const own = [
      thing('Sofa', [[kat, 'Møbler'], [list, 'Leilighet']]),
      thing('Lampe', [[kat, 'Belysning'], [list, 'Leilighet']]),
      thing('Telt', [[kat, 'Tur'], [list, 'Kjellerbod']]),
    ]
    const defs = columnDefs(defaultFieldSettings, ps, own).filter((d): d is ChoiceDef => d.kind === 'prop' && d.type === 'choice')
    expect(receiptGuess(['Noe'], '', id(butikk), defs, own)[id(list)]).toBe('Leilighet')
  })

  it('takes the value every earlier thing from the store holds, when two or more do', () => {
    const merkeOnly = lists.filter((d) => d.id !== categoryColumnId)
    const kid = [
      thing('Dyne', [[merke, 'Nordisk'], [butikk, 'Lun Sentrum']]),
      thing('Pute', [[merke, 'Nordisk'], [butikk, 'Lun Sentrum']]),
      thing('Pledd', [[merke, 'Annet'], [butikk, 'Butikk Nord']]),
    ]
    expect(receiptGuess(['Dyne 140x200'], 'Lun Sentrum', id(butikk), merkeOnly, kid)[id(merke)]).toBe('Nordisk')
    expect(receiptGuess(['Dyne 140x200'], 'Butikk Nord', id(butikk), merkeOnly, kid)[id(merke)]).toBeUndefined()
  })

  it('does not read a short value inside a word', () => {
    const short = [...lists.filter((d) => d.id !== id(merke))]
    const withLg = columnDefs(defaultFieldSettings, [...props.filter((p) => p.id !== id(merke)), { id: id(merke), ...merke, type: 'choice', createdAt: 1, options: ['LG'] }], items)
      .filter((d): d is ChoiceDef => d.kind === 'prop' && d.id === id(merke))
    expect(receiptGuess(['Belg til stol'], '', id(butikk), [...short, ...withLg], items)[id(merke)]).toBeUndefined()
    expect(receiptGuess(['LG OLED 65'], '', id(butikk), [...short, ...withLg], items)[id(merke)]).toBe('LG')
  })
})
