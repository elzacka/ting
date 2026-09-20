import { describe, expect, it } from 'vitest'
import { parseNumber } from './filter'

describe('parseNumber', () => {
  it('handles Norwegian and unicode forms', () => {
    expect(parseNumber('−5')).toBe(-5)
    expect(parseNumber('5,5')).toBe(5.5)
    expect(parseNumber(' 1 250 ')).toBe(1250)
    expect(parseNumber('Gass')).toBeNull()
    expect(parseNumber('')).toBeNull()
  })
})
