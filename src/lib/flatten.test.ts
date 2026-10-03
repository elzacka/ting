import { describe, expect, it } from 'vitest'
import { findCorners, homography, orderCorners, scanLook, warp, type Point, type Quad, type Rgba } from './flatten'

const square: Quad = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }]

function apply(H: number[], p: Point): Point {
  const d = H[6]! * p.x + H[7]! * p.y + H[8]!
  return { x: (H[0]! * p.x + H[1]! * p.y + H[2]!) / d, y: (H[3]! * p.x + H[4]! * p.y + H[5]!) / d }
}

function image(w: number, h: number, fill: (x: number, y: number) => [number, number, number]): Rgba {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b] = fill(x, y)
      data.set([r, g, b, 255], (y * w + x) * 4)
    }
  }
  return { width: w, height: h, data }
}

function inside(q: Quad, p: Point): boolean {
  let sign = 0
  for (let i = 0; i < 4; i++) {
    const a = q[i]!
    const b = q[(i + 1) % 4]!
    const c = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)
    if (c !== 0) {
      if (sign && Math.sign(c) !== sign) return false
      sign = Math.sign(c)
    }
  }
  return true
}

const sheet: Quad = [{ x: 150, y: 80 }, { x: 430, y: 120 }, { x: 400, y: 520 }, { x: 110, y: 470 }]
const wood: [number, number, number] = [170, 120, 70]
const paper: [number, number, number] = [235, 235, 230]

function expectNear(found: Quad, want: Quad, tol: number) {
  found.forEach((p, i) => {
    expect(Math.hypot(p.x - want[i]!.x, p.y - want[i]!.y)).toBeLessThan(tol)
  })
}

describe('homography', () => {
  it('maps a square onto a quad and back', () => {
    const quad: Quad = [{ x: 10, y: 20 }, { x: 110, y: 30 }, { x: 90, y: 150 }, { x: 5, y: 120 }]
    const H = homography(square, quad)
    square.forEach((p, i) => {
      const m = apply(H, p)
      expect(m.x).toBeCloseTo(quad[i]!.x, 6)
      expect(m.y).toBeCloseTo(quad[i]!.y, 6)
    })
    const back = homography(quad, square)
    const mid = apply(back, apply(H, { x: 0.3, y: 0.7 }))
    expect(mid.x).toBeCloseTo(0.3, 6)
    expect(mid.y).toBeCloseTo(0.7, 6)
  })
})

describe('orderCorners', () => {
  it('orders shuffled points as top-left, top-right, bottom-right, bottom-left', () => {
    const [tl, tr, br, bl] = sheet
    for (const shuffled of [[br, tl, bl, tr], [bl, br, tr, tl], [tr, bl, tl, br]]) {
      expect(orderCorners(shuffled)).toEqual([tl, tr, br, bl])
    }
  })
})

describe('findCorners', () => {
  it('finds a white rotated quadrilateral on brown', () => {
    const img = image(600, 600, (x, y) => (inside(sheet, { x: x + 0.5, y: y + 0.5 }) ? paper : wood))
    expectNear(findCorners(img), sheet, 4)
  })

  it('joins the two halves of a sheet split by a fold', () => {
    const img = image(600, 600, (x, y) => {
      if (!inside(sheet, { x: x + 0.5, y: y + 0.5 })) return wood
      return Math.abs(y - 300) < 7 ? [110, 105, 100] : paper
    })
    expectNear(findCorners(img), sheet, 4)
  })

  it('keeps a corner of the sheet that is shaded and warmer', () => {
    const img = image(600, 600, (x, y) => {
      if (!inside(sheet, { x: x + 0.5, y: y + 0.5 })) return [175, 135, 105]
      return x + y < 360 ? [205, 185, 165] : paper
    })
    expectNear(findCorners(img), sheet, 4)
  })

  it('works on an image larger than the detection size', () => {
    const big = sheet.map((p) => ({ x: p.x * 3, y: p.y * 3 })) as Quad
    const img = image(1800, 1800, (x, y) => (inside(big, { x: x + 0.5, y: y + 0.5 }) ? paper : wood))
    expectNear(findCorners(img), big, 10)
  })

  it('falls back to the whole image when no paper is found', () => {
    const img = image(200, 100, () => wood)
    expect(findCorners(img)).toEqual([{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 100 }, { x: 0, y: 100 }])
  })
})

describe('warp', () => {
  it('turns a checkerboard quad into an upright rectangle of the expected size', () => {
    const quad: Quad = [{ x: 40, y: 30 }, { x: 240, y: 30 }, { x: 240, y: 130 }, { x: 40, y: 130 }]
    const img = image(300, 200, (x, y) => ((Math.floor((x - 40) / 50) + Math.floor((y - 30) / 25)) % 2 ? [0, 0, 0] : [255, 255, 255]))
    const out = warp(img, quad)
    expect([out.width, out.height]).toEqual([200, 100])
    const px = (x: number, y: number) => out.data[(y * out.width + x) * 4]!
    expect(px(25, 12)).toBe(255)
    expect(px(75, 12)).toBe(0)
    expect(px(25, 37)).toBe(0)
  })

  it('corrects perspective and downscales to maxWidth', () => {
    const img = image(600, 600, (x, y) => (inside(sheet, { x: x + 0.5, y: y + 0.5 }) ? paper : wood))
    const out = warp(img, sheet, 100)
    expect(out.width).toBe(100)
    expect(out.data[(50 * 100 + 50) * 4]).toBe(235)
    expect(out.data[(2 * 100 + 2) * 4]).toBe(235)
  })
})

describe('scanLook', () => {
  it('evens out shading and keeps a dark stroke dark', () => {
    const img = image(400, 300, (x, y) => {
      const shade = 255 - (x / 400) * 100
      const v = y > 148 && y < 153 && x > 100 && x < 300 ? 20 : shade
      return [v, v, v]
    })
    const out = scanLook(img)
    const px = (x: number, y: number) => out.data[(y * out.width + x) * 4]!
    expect(px(20, 50)).toBeGreaterThan(220)
    expect(px(380, 50)).toBeGreaterThan(220)
    expect(px(200, 280)).toBeGreaterThan(220)
    expect(px(200, 150)).toBeLessThan(90)
  })
})

describe('speed', () => {
  it('warps and scan-looks a 1200x4000 output quickly', () => {
    const img = image(3000, 4000, (x, y) => [200 + ((x ^ y) & 31), 200, 200])
    const quad: Quad = [{ x: 100, y: 100 }, { x: 1300, y: 140 }, { x: 1280, y: 4000 }, { x: 90, y: 3950 }]
    let t = performance.now()
    const flat = warp(img, quad)
    const warpMs = performance.now() - t
    t = performance.now()
    scanLook(flat)
    const lookMs = performance.now() - t
    expect(warpMs).toBeLessThan(1500)
    expect(lookMs).toBeLessThan(1500)
  })
})
