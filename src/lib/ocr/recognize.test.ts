import { describe, expect, it } from 'vitest'
import type { Rect } from './detect'
import { batchesByWidth, batchWidth, ctcDecode, groupLines, keepReads, parseDict, type Read } from './recognize'

const dict = parseDict('a\nb\nc\n')

// One row of probabilities per step, with the given class winning.
function steps(winners: number[], classes = dict.chars.length): Float32Array {
  const p = new Float32Array(winners.length * classes)
  winners.forEach((w, t) => (p[t * classes + w] = 0.9))
  return p
}

describe('parseDict', () => {
  it('puts a blank first and a space last', () => {
    expect(dict.chars).toEqual(['', 'a', 'b', 'c', ' '])
  })

  it('keeps lines that are a single odd character and drops only the final newline', () => {
    expect(parseDict('x\r\næ\n').chars.slice(1, -1)).toEqual(['x', 'æ'])
  })

  it('reads Latin, punctuation and currency, never Chinese or Japanese', () => {
    expect(parseDict('ø\n人\n€\nの\n–\n').classes).toEqual([0, 1, 3, 5, 6])
  })
})

describe('ctcDecode', () => {
  it('merges repeats, drops blanks, and keeps a repeat split by a blank', () => {
    expect(ctcDecode(steps([1, 1, 0, 1, 2, 2, 0, 0, 3]), 9, dict.chars.length, dict).text).toBe('aabc')
  })

  it('reads the appended space class', () => {
    expect(ctcDecode(steps([1, 4, 2]), 3, dict.chars.length, dict).text).toBe('a b')
  })

  it('scores the mean of the kept steps, and zero for nothing', () => {
    expect(ctcDecode(steps([1, 2]), 2, dict.chars.length, dict).score).toBeCloseTo(0.9)
    expect(ctcDecode(steps([0, 0]), 2, dict.chars.length, dict)).toEqual({ text: '', score: 0 })
  })

  it('takes the best allowed class when a masked one wins', () => {
    const masked = parseDict('a\n人\n')
    const p = new Float32Array([0, 0.3, 0.9, 0])
    expect(ctcDecode(p, 1, 4, masked).text).toBe('a')
  })
})

const rect = (cx: number, cy: number, w = 100, h = 40, angle = 0): Rect => ({ cx, cy, w, h, angle })
const read = (text: string, box: Rect, score = 0.9): Read => ({ text, score, box })

describe('groupLines', () => {
  it('orders lines top to bottom and segments left to right, two spaces apart', () => {
    const lines = groupLines([
      read('2', rect(300, 300)),
      read('b', rect(500, 102)),
      read('a', rect(100, 100)),
      read('1', rect(100, 300)),
    ])
    expect(lines).toEqual(['a  b', '1  2'])
  })

  it('keeps a line that slopes across the page in one row', () => {
    const angle = Math.atan(0.1)
    const lines = groupLines([
      read('left', rect(100, 500, 200, 40, angle)),
      read('right', rect(900, 580, 200, 40, angle)),
      read('next', rect(100, 560, 200, 40, angle)),
    ])
    expect(lines).toEqual(['left  right', 'next'])
  })

  it('does not join lines that only touch', () => {
    expect(groupLines([read('a', rect(100, 100)), read('b', rect(100, 140))])).toEqual(['a', 'b'])
  })

  it('gives nothing for nothing', () => {
    expect(groupLines([])).toEqual([])
  })
})

describe('keepReads', () => {
  it('drops blanks and low scores', () => {
    const kept = keepReads([read('ok', rect(0, 0)), read('  ', rect(0, 0)), read('weak', rect(0, 0), 0.2)])
    expect(kept.map((r) => r.text)).toEqual(['ok'])
  })
})

describe('batches', () => {
  it('groups similar widths, six at a time, indices intact', () => {
    const boxes = [200, 100, 220, 120, 110, 130, 140, 150].map((w) => rect(0, 0, w, 40))
    const batches = batchesByWidth(boxes)
    expect(batches.map((b) => b.length)).toEqual([6, 2])
    expect(batches[1]).toEqual([0, 2])
  })

  it('puts fewer wide lines in a batch', () => {
    const boxes = [900, 100, 500, 120, 1000, 1100].map((w) => rect(0, 0, w, 40))
    expect(batchesByWidth(boxes)).toEqual([[1, 3, 2], [0], [4], [5]])
  })

  it('pads to at least 320 wide, and to the widest crop otherwise', () => {
    expect(batchWidth([1, 2])).toBe(320)
    expect(batchWidth([2, 20])).toBe(960)
  })
})
