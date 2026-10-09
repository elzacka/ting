import { describe, expect, it } from 'vitest'
import type { Property } from '../db/schema'
import { bookCells, bookColumns, isbn13Of, languageName, surnameFirst, yearOf, type Book } from './books'
import { columnDefs, defaultFieldSettings } from './fields'
import { columnId } from './grid'

function prop(key: string, extra: Partial<Property> = {}): Property {
  return { id: columnId({ key, unit: null }), key, unit: null, createdAt: 0, ...extra }
}

describe('isbn13Of', () => {
  it('takes an ISBN-13 as it is and turns an ISBN-10 into one', () => {
    expect(isbn13Of('978-82-03-46232-0')).toBe('9788203462320')
    expect(isbn13Of('0-14-044913-2')).toBe('9780140449136')
    expect(isbn13Of('080442957X')).toBe('9780804429573')
  })

  it('refuses a wrong check digit and codes that are not books', () => {
    expect(isbn13Of('0140449133')).toBeNull()
    expect(isbn13Of('7038010009457')).toBeNull()
    expect(isbn13Of('SN-12345')).toBeNull()
    // The first ten digits of an ISBN-13 being typed, though they pass the ISBN-10 check
    expect(isbn13Of('9788203462')).toBeNull()
  })
})

describe('book fields', () => {
  it('writes the surname first and leaves a catalogue name with its comma alone', () => {
    expect(surnameFirst('Fiódor Dostoievski')).toBe('Dostoievski, Fiódor')
    expect(surnameFirst('Nesbø, Jo')).toBe('Nesbø, Jo')
    expect(surnameFirst('Homer')).toBe('Homer')
  })

  it('finds the year in a catalogue date', () => {
    expect(yearOf('March 2003')).toBe('2003')
    expect(yearOf('[cop. 1998]')).toBe('1998')
    expect(yearOf('udatert')).toBeNull()
  })

  it('names a language in Norwegian from a MARC or ISO code', () => {
    expect(languageName('nob')).toBe('Norsk bokmål')
    expect(languageName('ger')).toBe('Tysk')
    expect(languageName('eng')).toBe('Engelsk')
    expect(languageName('zxx')).toBeNull()
    expect(languageName('/languages/')).toBeNull()
  })
})

describe('bookColumns and bookCells', () => {
  const book: Book = { title: 'Snømannen', authors: ['Nesbø, Jo'], year: '2007', language: 'Norsk bokmål' }

  it('fills the register’s own Forfatter, Utgitt and Språk, and nothing it lacks', () => {
    const defs = columnDefs(defaultFieldSettings, [prop('Forfatter'), prop('Utgitt', { type: 'number' })], [])
    const cols = bookColumns(defs, 'Bøker')
    expect(bookCells(book, cols)).toEqual({ [prop('Forfatter').id]: 'Nesbø, Jo', [prop('Utgitt').id]: '2007' })
  })

  it('leaves a Dato column for Utgitt empty, since a year is no date', () => {
    const defs = columnDefs(defaultFieldSettings, [prop('Utgitt', { type: 'date', unit: 'dato' })], [])
    expect(bookCells(book, bookColumns(defs, 'Bøker'))).toEqual({})
  })

  it('skips a column another category owns', () => {
    const defs = columnDefs(defaultFieldSettings, [prop('Forfatter', { categories: ['Film'] })], [])
    expect(bookColumns(defs, 'Bøker')).toEqual({})
  })

  it('uses a Valgliste’s own spelling of the language', () => {
    const defs = columnDefs(defaultFieldSettings, [prop('Språk', { type: 'choice', options: ['Norsk', 'Engelsk'] })], [])
    expect(bookCells(book, bookColumns(defs, 'Bøker'))).toEqual({ [prop('Språk').id]: 'Norsk' })
    expect(bookCells({ ...book, language: 'Engelsk' }, bookColumns(defs, 'Bøker'))).toEqual({ [prop('Språk').id]: 'Engelsk' })
  })
})
