import { describe, expect, it } from 'vitest'
import { boxesFromMap, minAreaRect, placeTile, planTiles, tileH, toImageBoxes } from './detect'

// A solid band of probability, optionally leaning, on an empty map.
function band(w: number, h: number, x0: number, x1: number, yAt: (x: number) => number, thick: number): Uint8Array {
  const map = new Uint8Array(w * h)
  for (let x = x0; x < x1; x++) {
    for (let y = Math.round(yAt(x)); y < Math.round(yAt(x)) + thick; y++) map[y * w + x] = 230
  }
  return map
}

describe('planTiles', () => {
  it('uses one padded tile for a short page', () => {
    const plan = planTiles(1000, 500)
    expect(plan.tiles).toEqual([{ y0: 0, keepFrom: 0, keepTo: 500 }])
    expect(plan.tileH % 32).toBe(0)
    expect(plan.width % 32).toBe(0)
  })

  it('scales a narrow page up and a wide page down into the detector range', () => {
    expect(planTiles(500, 500).width).toBe(736)
    expect(planTiles(3000, 1000).width).toBe(1280)
  })

  it('cuts a tall page into tiles whose owned rows cover it once', () => {
    const plan = planTiles(1200, 4000)
    let next = 0
    for (const t of plan.tiles) {
      expect(t.keepFrom).toBe(next)
      expect(t.keepFrom).toBeGreaterThanOrEqual(t.y0)
      expect(t.keepTo).toBeLessThanOrEqual(t.y0 + tileH)
      next = t.keepTo
    }
    expect(next).toBe(plan.height)
    expect(plan.tiles.length).toBeGreaterThan(2)
  })

  it('keeps each cut away from the tile edges', () => {
    const plan = planTiles(1200, 6000)
    for (const t of plan.tiles.slice(0, -1)) expect(t.y0 + tileH - t.keepTo).toBeGreaterThan(64)
  })
})

describe('placeTile', () => {
  it('copies only the rows the tile owns, as 0..255', () => {
    const w = 4
    const map = new Uint8Array(w * 6)
    const prob = new Float32Array(w * 4).fill(1)
    placeTile(map, w, prob, { y0: 1, keepFrom: 2, keepTo: 4 })
    expect([...map.slice(0, w * 2)]).toEqual(new Array(w * 2).fill(0))
    expect([...map.slice(w * 2, w * 4)]).toEqual(new Array(w * 2).fill(255))
    expect([...map.slice(w * 4)]).toEqual(new Array(w * 2).fill(0))
  })
})

describe('minAreaRect', () => {
  it('finds a leaning rectangle', () => {
    const angle = Math.atan(0.2)
    const pts = [
      [0, 0],
      [200, 0],
      [200, 20],
      [0, 20],
    ].map(([x, y]) => ({ x: (x as number) * Math.cos(angle) - (y as number) * Math.sin(angle) + 50, y: (x as number) * Math.sin(angle) + (y as number) * Math.cos(angle) + 50 }))
    const r = minAreaRect(pts)
    expect(r.angle).toBeCloseTo(angle, 3)
    expect(r.w).toBeCloseTo(200, 0)
    expect(r.h).toBeCloseTo(20, 0)
  })

  it('puts the text direction along the width even for a tall blob', () => {
    const r = minAreaRect([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 100 },
      { x: 0, y: 100 },
    ])
    expect(Math.abs(r.angle)).toBeLessThanOrEqual(Math.PI / 4)
    expect(r.w).toBeCloseTo(10)
  })
})

describe('boxesFromMap', () => {
  it('finds each line as its own box, grown beyond the blob', () => {
    const w = 300
    const h = 200
    const a = band(w, h, 20, 280, () => 40, 14)
    const b = band(w, h, 20, 200, () => 120, 14)
    b.forEach((v, i) => v && (a[i] = v))
    const boxes = boxesFromMap(a, w, h)
    expect(boxes).toHaveLength(2)
    const first = boxes.find((r) => r.cy < 100)
    expect(first?.w).toBeGreaterThan(259)
    expect(first?.h).toBeGreaterThan(14)
    expect(first?.angle).toBeCloseTo(0, 1)
  })

  it('measures the lean of a sloping line', () => {
    const w = 400
    const h = 200
    const boxes = boxesFromMap(band(w, h, 20, 380, (x) => 40 + x * 0.1, 12), w, h)
    expect(boxes).toHaveLength(1)
    expect(boxes[0]?.angle).toBeCloseTo(Math.atan(0.1), 1)
  })

  it('drops faint blobs and specks', () => {
    const w = 200
    const h = 100
    const faint = band(w, h, 20, 180, () => 40, 12).map((v) => (v ? 100 : 0))
    expect(boxesFromMap(faint, w, h)).toHaveLength(0)
    const speck = new Uint8Array(w * h)
    speck[50 * w + 50] = 255
    expect(boxesFromMap(speck, w, h)).toHaveLength(0)
  })
})

describe('toImageBoxes', () => {
  it('scales back to the picture and drops tiny or outside boxes', () => {
    const out = toImageBoxes(
      [
        { cx: 100, cy: 50, w: 80, h: 20, angle: 0 },
        { cx: 100, cy: 50, w: 1, h: 20, angle: 0 },
        { cx: 900, cy: 50, w: 80, h: 20, angle: 0 },
      ],
      0.5,
      300,
      300,
    )
    expect(out).toEqual([{ cx: 200, cy: 100, w: 160, h: 40, angle: 0 }])
  })
})
