import { describe, expect, it } from 'vitest'
import { classify, cleanCode, digitsOf } from './barcode'

describe('classify', () => {
  it('knows a book by its 978 or 979 prefix and check digit', () => {
    expect(classify('9781788168663')).toBe('isbn')
    expect(classify('978-1-78816-866-3')).toBe('isbn')
    expect(classify('9791234567896')).toBe('isbn')
  })

  it('knows retail codes by length and check digit', () => {
    expect(classify('7029981042369')).toBe('ean')
    expect(classify('036000291452')).toBe('upc')
    expect(classify('96385074')).toBe('ean')
  })

  it('treats a wrong check digit, letters and other lengths as something else', () => {
    expect(classify('9781788168664')).toBe('other')
    expect(classify('N9LMTF070124')).toBe('other')
    expect(classify('12345')).toBe('other')
    expect(classify('https://example.com/x')).toBe('other')
    expect(classify('')).toBe('other')
  })
})

describe('cleanCode', () => {
  it('keeps printable text, drops control characters, trims and bounds', () => {
    expect(cleanCode(' 123' + String.fromCharCode(0) + '\n456 ')).toBe('123456')
    expect(cleanCode('x'.repeat(200))).toHaveLength(128)
  })
})

describe('digitsOf', () => {
  it('drops hyphens and spaces only', () => {
    expect(digitsOf('978-1 78816 866-3')).toBe('9781788168663')
    expect(digitsOf('N9LM')).toBe('N9LM')
  })
})
