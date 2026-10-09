import { describe, expect, it } from 'vitest'
import type { Item } from '../db/schema'
import { menuValues, parseNumber, recentValues, suggest } from './values'

describe('parseNumber', () => {
  it('handles Norwegian and unicode forms', () => {
    expect(parseNumber('−5')).toBe(-5)
    expect(parseNumber('5,5')).toBe(5.5)
    expect(parseNumber(' 1 250 ')).toBe(1250)
    expect(parseNumber('Gass')).toBeNull()
    expect(parseNumber('')).toBeNull()
  })
})

describe('recentValues', () => {
  const item = (id: string, value: string, at: number): Item =>
    ({ id, name: id, specs: [], photos: [], createdAt: at, updatedAt: at, value }) as unknown as Item
  const pick = (i: Item) => (i as unknown as { value: string }).value

  it('puts the value used last first, one spelling each', () => {
    const items = [item('a', 'Friluft', 1), item('b', 'Bøker', 3), item('c', 'friluft', 5), item('d', '', 9)]
    expect(recentValues(items, pick)).toEqual(['Friluft', 'Bøker'])
  })

  it('adds the offered values nothing holds yet, last', () => {
    expect(recentValues([item('a', 'Bøker', 1)], pick, ['Kjøkken', 'bøker', ' '])).toEqual(['Bøker', 'Kjøkken'])
  })
})

describe('suggest', () => {
  const values = ['Friluft', 'Bøker', 'Elektronikk', 'Kjøkken']

  it('offers everything while the field is empty or holds a listed value', () => {
    expect(suggest(values, '', 3)).toEqual(['Friluft', 'Bøker', 'Elektronikk'])
    expect(suggest(values, 'bøker', 10)).toEqual(values)
  })

  it('narrows to the values containing what is typed', () => {
    expect(suggest(values, 'k', 10)).toEqual(['Bøker', 'Elektronikk', 'Kjøkken'])
    expect(suggest(values, 'xyz', 10)).toEqual([])
  })
})

describe('menuValues', () => {
  it('sorts alphabetically, Norwegian letters last and numbers in order', () => {
    expect(menuValues(['Å', 'b', 'Hylle 10', 'Ø', 'a', 'Hylle 2'], '')).toEqual(['a', 'b', 'Hylle 2', 'Hylle 10', 'Ø', 'Å'])
  })

  it('lists a new chosen value in its place', () => {
    expect(menuValues(['Kjøkken', 'Bad'], ' Garasje ')).toEqual(['Bad', 'Garasje', 'Kjøkken'])
  })

  it('keeps the first spelling of a value', () => {
    expect(menuValues(['Bad', 'bad', ''], 'BAD')).toEqual(['Bad'])
  })
})

describe('parseNumber past fifteen digits', () => {
  it('leaves a long serial number as text rather than round it', () => {
    expect(parseNumber('1234567890123456789')).toBeNull()
    expect(parseNumber('123456789012345')).toBe(123456789012345)
  })
})
