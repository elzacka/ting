import { describe, expect, it } from 'vitest'
import { cropRect, resizeRegion, toPlanes } from './image'

function solid(width: number, height: number, rgb: [number, number, number]) {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < width * height; i++) data.set([...rgb, 255], i * 4)
  return { width, height, data }
}

describe('resizeRegion', () => {
  it('keeps a flat colour flat, up or down', () => {
    for (const [w, h] of [[8, 4], [40, 20], [3, 3]] as const) {
      const out = resizeRegion(solid(20, 10, [10, 120, 250]), 0, 0, 20, 10, w, h)
      expect(out).toHaveLength(w * h * 3)
      expect(out[0]).toBeCloseTo(10)
      expect(out[out.length - 2]).toBeCloseTo(120)
      expect(out[out.length - 1]).toBeCloseTo(250)
    }
  })

  it('averages when shrinking', () => {
    const img = solid(4, 1, [0, 0, 0])
    img.data.set([200, 200, 200, 255], 4)
    img.data.set([200, 200, 200, 255], 8)
    const [v] = resizeRegion(img, 0, 0, 4, 1, 1, 1)
    expect(v).toBeGreaterThan(50)
    expect(v).toBeLessThan(150)
  })
})

describe('toPlanes', () => {
  it('writes blue, green, red planes scaled to -1..1 and pads the rest', () => {
    const out = toPlanes(new Float32Array([255, 0, 127.5]), 1, 1, 2, 1, 0.5)
    expect([...out]).toEqual([0, 0.5, -1, 0.5, 1, 0.5])
  })
})

describe('cropRect', () => {
  it('straightens a leaning stripe into an upright one', () => {
    const w = 200
    const h = 200
    const img = solid(w, h, [255, 255, 255])
    const angle = Math.atan(0.2)
    for (let x = 20; x < 180; x++) {
      const y0 = Math.round(100 + (x - 100) * 0.2)
      for (let y = y0 - 6; y < y0 + 6; y++) img.data.set([0, 0, 0, 255], (y * w + x) * 4)
    }
    const crop = cropRect(img, { cx: 100, cy: 100, w: 120, h: 12, angle })
    expect(crop.width).toBe(120)
    expect(crop.height).toBe(12)
    const dark = [...crop.data].filter((_, i) => i % 4 === 0 && (crop.data[i] as number) < 128).length
    expect(dark).toBeGreaterThan(120 * 12 * 0.9)
  })
})
