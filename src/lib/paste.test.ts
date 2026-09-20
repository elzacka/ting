import { describe, expect, it } from 'vitest'
import { parseBlock, splitLinks } from './paste'

describe('parseBlock', () => {
  it('leaves a single value to the input', () => {
    expect(parseBlock('Osprey Ariel 65')).toBeNull()
    expect(parseBlock('Osprey\n')).toBeNull()
  })
  it('splits lines on newlines and cells on tabs, trimming each cell', () => {
    expect(parseBlock('Turutstyr\tOsprey Ariel 65\t2170\r\nKjøkken\tPrimus \t\n')).toEqual([
      ['Turutstyr', 'Osprey Ariel 65', '2170'],
      ['Kjøkken', 'Primus', ''],
    ])
  })
  it('treats one column of lines as a block too', () => {
    expect(parseBlock('Bod\nBod\nLoft')).toEqual([['Bod'], ['Bod'], ['Loft']])
  })
})

describe('splitLinks', () => {
  it('finds http and https links and keeps the rest as text', () => {
    expect(splitLinks('Produktside: https://www.mammut.com/no/x. Kjøpt på REI.')).toEqual([
      { text: 'Produktside: ', href: null },
      { text: 'https://www.mammut.com/no/x', href: 'https://www.mammut.com/no/x' },
      { text: '. Kjøpt på REI.', href: null },
    ])
  })
  it('ignores other schemes', () => {
    expect(splitLinks('javascript:alert(1) og ftp://x')).toEqual([{ text: 'javascript:alert(1) og ftp://x', href: null }])
  })
  it('returns plain text unchanged', () => {
    expect(splitLinks('Felles.')).toEqual([{ text: 'Felles.', href: null }])
  })
})
