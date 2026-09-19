import { describe, expect, it } from 'vitest'
import { formatStoredDate, isDateUnit, parseDateInput } from './dates'

describe('dates', () => {
  it('recognises the unit regardless of case', () => {
    expect(isDateUnit('dato')).toBe(true)
    expect(isDateUnit('Dato ')).toBe(true)
    expect(isDateUnit('gram')).toBe(false)
    expect(isDateUnit(null)).toBe(false)
  })

  it('parses Norwegian and ISO input to ISO', () => {
    expect(parseDateInput('19.09.26')).toBe('2026-09-19')
    expect(parseDateInput('19.09.2026')).toBe('2026-09-19')
    expect(parseDateInput('1/9/26')).toBe('2026-09-01')
    expect(parseDateInput('2026-09-19')).toBe('2026-09-19')
    expect(parseDateInput('31.02.26')).toBeNull()
    expect(parseDateInput('snart')).toBeNull()
  })

  it('formats stored dates as dd.mm.yy and leaves other text alone', () => {
    expect(formatStoredDate('2026-09-19')).toBe('19.09.26')
    expect(formatStoredDate('snart')).toBe('snart')
  })
})
