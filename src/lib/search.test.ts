import { describe, expect, it } from 'vitest'
import type { Item } from '../db/schema'
import { parseQuery, searchItems } from './search'

function item(name: string, specs: Item['specs'], photo: Blob | null = null): Item {
  return {
    id: crypto.randomUUID(),
    name,
    specs,
    photos: photo ? [photo] : [],
    createdAt: 0,
    updatedAt: 0,
  }
}

const items = [
  item('Sovepose vinter', [{ key: 'Komforttemperatur', value: -12, unit: '°C' }, { key: 'Vekt', value: 1250, unit: 'gram' }]),
  item('Sovepose sommer', [{ key: 'Komforttemperatur', value: 5, unit: '°C' }], new Blob(['x'])),
  item('Kokeapparat', [{ key: 'Brensel', value: 'Gass', unit: null }, { key: 'Notat', value: 'Ligger i loftsboden', unit: null }]),
  item('Liggeunderlag', [{ key: 'R-verdi', value: 4.2, unit: null }]),
]

const names = (q: string) => searchItems(items, q).map((i) => i.name)

describe('parseQuery', () => {
  it('parses words, phrases, negation, spec compares and has', () => {
    expect(parseQuery('sovepose "vinter dun" -sommer komfort<0 vekt>=1000 brensel:gass has:bilde')).toEqual([
      { type: 'word', text: 'sovepose', negate: false },
      { type: 'phrase', text: 'vinter dun', negate: false },
      { type: 'word', text: 'sommer', negate: true },
      { type: 'spec', key: 'komfort', op: '<', value: '0', negate: false },
      { type: 'spec', key: 'vekt', op: '>=', value: '1000', negate: false },
      { type: 'spec', key: 'brensel', op: ':', value: 'gass', negate: false },
      { type: 'has', what: 'bilde', negate: false },
    ])
  })

  it('accepts a quoted key and treats a half-typed operator as a word', () => {
    expect(parseQuery('"r-verdi">=4')).toEqual([{ type: 'spec', key: 'r-verdi', op: '>=', value: '4', negate: false }])
    expect(parseQuery('komfort<')).toEqual([{ type: 'word', text: 'komfort', negate: false }])
  })
})

describe('searchItems', () => {
  it('matches everything on an empty query, sorted by name', () => {
    expect(names('')).toEqual(['Kokeapparat', 'Liggeunderlag', 'Sovepose sommer', 'Sovepose vinter'])
  })

  it('answers "komforttemperatur under 0"', () => {
    expect(names('komfort<0')).toEqual(['Sovepose vinter'])
    expect(names('komforttemperatur>=5')).toEqual(['Sovepose sommer'])
    expect(names('komfort=5')).toEqual(['Sovepose sommer'])
  })

  it('tolerates typos and ranks exact hits first', () => {
    expect(names('sovpose')).toEqual(['Sovepose sommer', 'Sovepose vinter'])
    expect(names('kokeaparat')).toEqual(['Kokeapparat'])
    expect(names('vintr')).toEqual(['Sovepose vinter'])
  })

  it('does not fuzz short words', () => {
    expect(names('gas')).toEqual(['Kokeapparat'])
    expect(names('gus')).toEqual([])
  })

  it('handles phrases, negation and combinations', () => {
    expect(names('"sovepose vinter"')).toEqual(['Sovepose vinter'])
    expect(names('sovepose -sommer')).toEqual(['Sovepose vinter'])
    expect(names('sovepose vekt>1000')).toEqual(['Sovepose vinter'])
  })

  it('supports has: for photo and spec keys, Notat among them', () => {
    expect(names('has:bilde')).toEqual(['Sovepose sommer'])
    expect(names('has:notat')).toEqual(['Kokeapparat'])
    expect(names('has:r-verdi')).toEqual(['Liggeunderlag'])
    expect(names('-has:komfort')).toEqual(['Kokeapparat', 'Liggeunderlag'])
  })

  it('matches text specs with : and =', () => {
    expect(names('brensel:gas')).toEqual(['Kokeapparat'])
    expect(names('brensel=gas')).toEqual([])
    expect(names('brensel=gass')).toEqual(['Kokeapparat'])
  })

  it('searches notes', () => {
    expect(names('loftsboden')).toEqual(['Kokeapparat'])
  })

  it('folds æ ø å so a plain-letter query still hits', () => {
    const withVar = [...items, item('Sovepose vår', [])]
    expect(searchItems(withVar, 'var').map((i) => i.name)).toEqual(['Sovepose vår'])
    expect(searchItems(withVar, 'sovepose var').map((i) => i.name)).toEqual(['Sovepose vår'])
  })

  it('ranks whole name, then name prefix, then substring, then fuzzy', () => {
    const ranked = [
      item('Telt', []),
      item('Teltstang', []),
      item('Presenning', [{ key: 'Notat', value: 'Brukes som telt', unit: null }]),
      item('Tlt', []),
    ]
    expect(searchItems(ranked, 'telt').map((i) => i.name)).toEqual(['Telt', 'Teltstang', 'Presenning', 'Tlt'])
  })

  it('treats a single letter as browse by first letter', () => {
    expect(names('s')).toEqual(['Sovepose sommer', 'Sovepose vinter'])
    expect(names('k')).toEqual(['Kokeapparat'])
  })
})
