import { describe, expect, it } from 'vitest'
import type { Item, Property } from '../db/schema'
import { columnId } from './grid'
import { applyOptionEdit, isEmptyEdit, optionEdit, optionValues, type OptionRow } from './options'

const type: Property = { id: columnId({ key: 'Type', unit: null }), key: 'Type', unit: null, createdAt: 1, type: 'choice', options: ['Bøker', 'Brettspill'] }

function item(name: string, value: string | number | null, extra: Item['specs'] = []): Item {
  const specs = value === null ? [] : [{ key: 'Type', value, unit: null }]
  return { id: name, name, specs: [...specs, ...extra], photos: [], createdAt: 0, updatedAt: 0 }
}

const none = { renames: [], removed: [], added: [] }

describe('optionValues', () => {
  it('lists the values in use with their counts and the offered ones at 0, one per value however it was typed, in Norwegian order', () => {
    const items = [item('Dune', 'Bøker'), item('Emma', 'bøker'), item('Alien', 'Film'), item('Lampe', null)]
    expect(optionValues(items, type.id, type.options)).toEqual([
      { label: 'Brettspill', count: 0, mixed: false },
      { label: 'Bøker', count: 2, mixed: true },
      { label: 'Film', count: 1, mixed: false },
    ])
  })

  it('spells an alternative the way the list offers it', () => {
    expect(optionValues([item('Emma', 'bøker')], type.id, type.options)[1]).toEqual({ label: 'Bøker', count: 1, mixed: true })
  })

  it('spells one the list does not offer the way most things do', () => {
    const items = [item('Alien', 'film'), item('Heat', 'Film'), item('Up', 'Film')]
    expect(optionValues(items, type.id)).toEqual([{ label: 'Film', count: 3, mixed: true }])
  })

  it('reads a number as its text', () => {
    expect(optionValues([item('A', 5)], type.id)).toEqual([{ label: '5', count: 1, mixed: false }])
  })
})

describe('optionEdit', () => {
  const row = (from: string | null, name: string, remove = false, mixed = false): OptionRow => ({
    key: name,
    from,
    name,
    count: from ? 1 : null,
    mixed,
    remove,
  })

  it('asks for nothing when nothing changed', () => {
    expect(isEmptyEdit(optionEdit([row('Bøker', 'Bøker'), row('Film', '')]))).toBe(true)
  })

  it('renames one some things spell another way to itself', () => {
    expect(optionEdit([row('Bøker', 'Bøker', false, true)]).renames).toEqual([['Bøker', 'Bøker']])
  })

  it('turns the lines into renames, removals and new alternatives', () => {
    expect(optionEdit([row('Bøker', 'Bok'), row('Film', 'Film', true), row(null, ' Musikk '), row(null, '')])).toEqual({
      renames: [['Bøker', 'Bok']],
      removed: ['Film'],
      added: ['Musikk'],
    })
  })
})

describe('applyOptionEdit', () => {
  it('renames an alternative on every thing that holds it, however it was typed, and in the list', () => {
    const out = applyOptionEdit([item('Dune', 'Bøker'), item('Emma', 'bøker'), item('Alien', 'Film')], type, {
      ...none,
      renames: [['Bøker', 'Bok']],
    })
    expect(out.items.map((i) => [i.name, i.specs[0]?.value])).toEqual([
      ['Dune', 'Bok'],
      ['Emma', 'Bok'],
    ])
    expect(out.property.options).toEqual(['Bok', 'Brettspill'])
  })

  it('gives every thing the spelling of a rename to the same name, and leaves the ones already right', () => {
    const out = applyOptionEdit([item('Dune', 'Bøker'), item('Emma', 'bøker'), item('Heat', 'BØKER ')], type, {
      ...none,
      renames: [['Bøker', 'Bøker']],
    })
    expect(out.items.map((i) => [i.name, i.specs[0]?.value])).toEqual([
      ['Emma', 'Bøker'],
      ['Heat', 'Bøker'],
    ])
    expect(out.property.options).toEqual(['Bøker', 'Brettspill'])
  })

  it('makes one alternative of two when renamed onto the other', () => {
    const out = applyOptionEdit([item('Uno', 'Brettspill')], type, { ...none, renames: [['Brettspill', 'Bøker']] })
    expect(out.items[0]?.specs[0]?.value).toBe('Bøker')
    expect(out.property.options).toEqual(['Bøker'])
  })

  it('takes a removed alternative off the things and out of the list, and leaves their other values', () => {
    const farge = { key: 'Farge', value: 'Rød', unit: null }
    const out = applyOptionEdit([item('Dune', 'Bøker', [farge]), item('Alien', 'Film')], type, { ...none, removed: ['Bøker'] })
    expect(out.items).toEqual([item('Dune', null, [farge])])
    expect(out.property.options).toEqual(['Brettspill'])
  })

  it('keeps a value renamed onto one that is removed', () => {
    const out = applyOptionEdit([item('Uno', 'Brettspill'), item('Dune', 'Bøker')], type, {
      ...none,
      renames: [['Brettspill', 'Bøker']],
      removed: ['Bøker'],
    })
    expect(out.items.map((i) => i.specs[0]?.value)).toEqual(['Bøker', undefined])
    expect(out.property.options).toEqual(['Bøker'])
  })

  it('adds new alternatives once, and drops the list when it empties', () => {
    expect(applyOptionEdit([], type, { ...none, added: ['Musikk', 'bøker'] }).property.options).toEqual([
      'Bøker',
      'Brettspill',
      'Musikk',
    ])
    expect('options' in applyOptionEdit([], type, { ...none, removed: ['Bøker', 'Brettspill'] }).property).toBe(false)
  })

  it('leaves numbers and other columns alone', () => {
    const out = applyOptionEdit([item('A', 5, [{ key: 'Farge', value: 'Bøker', unit: null }])], type, {
      ...none,
      renames: [['Bøker', 'Bok']],
    })
    expect(out.items).toEqual([])
  })
})
