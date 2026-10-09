import { describe, expect, it } from 'vitest'
import { formatNumber } from './format'

describe('formatNumber', () => {
  it('spaces numbers from five digits up, so a year reads as one', () => {
    expect(formatNumber(2003)).toBe('2003')
    expect(formatNumber(12500)).toBe('12 500')
    expect(formatNumber(-4.5)).toBe('−4,5')
  })
})
