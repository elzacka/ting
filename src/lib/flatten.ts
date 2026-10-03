// Flattens a photo of a paper receipt into a cropped, scan-like image.
// Pure typed-array code with no DOM, so it can run in a Web Worker.
export type Rgba = { width: number; height: number; data: Uint8ClampedArray }
export type Point = { x: number; y: number }
export type Quad = [Point, Point, Point, Point] // top-left, top-right, bottom-right, bottom-left

const detectSize = 1000
const closeRadius = 4
const minValue = 110
const defaultSaturation = 40
const maxSaturation = 70
const minComponentShare = 0.1
const minAreaShare = 0.05
const hullKeep = 48
const blurRadius = 31

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)
const cross = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)

function polygonArea(p: readonly Point[]): number {
  let s = 0
  for (let i = 0; i < p.length; i++) {
    const a = p[i]!
    const b = p[(i + 1) % p.length]!
    s += a.x * b.y - b.x * a.y
  }
  return Math.abs(s) / 2
}

function fullImage(img: Rgba): Quad {
  const w = img.width
  const h = img.height
  return [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }]
}

// Clockwise around the centroid on screen, starting at the corner nearest the top-left.
export function orderCorners(points: readonly Point[]): Quad {
  if (points.length !== 4) throw new Error('orderCorners needs four points')
  const cx = points.reduce((s, p) => s + p.x, 0) / 4
  const cy = points.reduce((s, p) => s + p.y, 0) / 4
  const sorted = [...points].sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx))
  let start = 0
  for (let i = 1; i < 4; i++) {
    if (sorted[i]!.x + sorted[i]!.y < sorted[start]!.x + sorted[start]!.y) start = i
  }
  const at = (i: number) => sorted[(start + i) % 4]!
  return [at(0), at(1), at(2), at(3)]
}

// Area-averaged shrink of an interleaved image with `ch` channels.
function shrink(src: Uint8ClampedArray, w: number, h: number, ch: number, tw: number, th: number) {
  const out = new Uint8ClampedArray(tw * th * ch)
  const sx = w / tw
  const sy = h / th
  const sum = new Float64Array(ch)
  for (let y = 0; y < th; y++) {
    const y0 = Math.floor(y * sy)
    const y1 = Math.max(y0 + 1, Math.min(h, Math.floor((y + 1) * sy)))
    for (let x = 0; x < tw; x++) {
      const x0 = Math.floor(x * sx)
      const x1 = Math.max(x0 + 1, Math.min(w, Math.floor((x + 1) * sx)))
      sum.fill(0)
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const i = (yy * w + xx) * ch
          for (let c = 0; c < ch; c++) sum[c]! += src[i + c]!
        }
      }
      const n = (y1 - y0) * (x1 - x0)
      const o = (y * tw + x) * ch
      for (let c = 0; c < ch; c++) out[o + c] = sum[c]! / n
    }
  }
  return out
}

// Separable max (dilate) or min (erode) filter; outside the image counts as `edge`.
function rank(src: Uint8Array, w: number, h: number, r: number, max: boolean, edge: number): Uint8Array {
  const tmp = new Uint8Array(w * h)
  const out = new Uint8Array(w * h)
  const pass = (from: Uint8Array, to: Uint8Array, len: number, lines: number, step: number, lineStep: number) => {
    for (let l = 0; l < lines; l++) {
      const base = l * lineStep
      for (let i = 0; i < len; i++) {
        let v = edge
        if (i - r >= 0 && i + r < len) v = max ? 0 : 1
        for (let k = Math.max(0, i - r); k <= Math.min(len - 1, i + r); k++) {
          const s = from[base + k * step]!
          if (max ? s > v : s < v) v = s
        }
        to[base + i * step] = v
      }
    }
  }
  pass(src, tmp, w, h, 1, w)
  pass(tmp, out, h, w, w, 1)
  return out
}

// Otsu split of the saturation histogram, clamped so a clean image keeps the fixed default.
function saturationLimit(small: Uint8ClampedArray, n: number): number {
  const hist = new Float64Array(256)
  let total = 0
  for (let i = 0; i < n; i++) {
    const mx = Math.max(small[i * 4]!, small[i * 4 + 1]!, small[i * 4 + 2]!)
    if (mx <= minValue) continue
    hist[Math.round(((mx - Math.min(small[i * 4]!, small[i * 4 + 1]!, small[i * 4 + 2]!)) * 255) / mx)]!++
    total++
  }
  let sumAll = 0
  for (let t = 0; t < 256; t++) sumAll += t * hist[t]!
  let w0 = 0
  let sum0 = 0
  let best = -1
  let limit = defaultSaturation
  for (let t = 0; t < 255; t++) {
    w0 += hist[t]!
    sum0 += t * hist[t]!
    if (w0 === 0 || w0 === total) continue
    const m0 = sum0 / w0
    const m1 = (sumAll - sum0) / (total - w0)
    const between = w0 * (total - w0) * (m0 - m1) ** 2
    if (between > best) { best = between; limit = t }
  }
  return Math.min(maxSaturation, Math.max(defaultSaturation, limit))
}

// Paper is bright and unsaturated; warm light and shade raise its saturation, so the limit adapts.
function paperMask(small: Uint8ClampedArray, n: number): Uint8Array {
  const mask = new Uint8Array(n)
  const limit = saturationLimit(small, n)
  for (let i = 0; i < n; i++) {
    const r = small[i * 4]!
    const g = small[i * 4 + 1]!
    const b = small[i * 4 + 2]!
    const mx = Math.max(r, g, b)
    const mn = Math.min(r, g, b)
    if (mx > minValue && (mx - mn) * 255 < limit * mx) mask[i] = 1
  }
  return mask
}

// Keeps every component larger than a tenth of the largest, since a crease can split the paper.
function keepComponents(mask: Uint8Array, w: number, h: number): Uint8Array | null {
  const label = new Int32Array(w * h)
  const stack = new Int32Array(w * h)
  const sizes: number[] = [0]
  for (let s = 0; s < w * h; s++) {
    if (!mask[s] || label[s]) continue
    const id = sizes.length
    let size = 0
    let top = 0
    stack[top++] = s
    label[s] = id
    while (top > 0) {
      const p = stack[--top]!
      size++
      const x = p % w
      const y = (p - x) / w
      if (x > 0 && mask[p - 1] && !label[p - 1]) { label[p - 1] = id; stack[top++] = p - 1 }
      if (x < w - 1 && mask[p + 1] && !label[p + 1]) { label[p + 1] = id; stack[top++] = p + 1 }
      if (y > 0 && mask[p - w] && !label[p - w]) { label[p - w] = id; stack[top++] = p - w }
      if (y < h - 1 && mask[p + w] && !label[p + w]) { label[p + w] = id; stack[top++] = p + w }
    }
    sizes.push(size)
  }
  const largest = Math.max(...sizes)
  if (largest === 0) return null
  const keep = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i++) {
    const l = label[i]!
    if (l && sizes[l]! > largest * minComponentShare) keep[i] = 1
  }
  return keep
}

function convexHull(pts: Point[]): Point[] {
  const p = [...pts].sort((a, b) => a.x - b.x || a.y - b.y)
  const build = (list: Point[]) => {
    const h: Point[] = []
    for (const q of list) {
      while (h.length >= 2 && cross(h[h.length - 2]!, h[h.length - 1]!, q) <= 0) h.pop()
      h.push(q)
    }
    h.pop()
    return h
  }
  return [...build(p), ...build(p.reverse())]
}

// Drops the vertex whose triangle with its neighbours is smallest, until `n` remain.
function simplify(hull: Point[], n: number): Point[] {
  const p = [...hull]
  while (p.length > n) {
    let best = 0
    let bestArea = Infinity
    for (let i = 0; i < p.length; i++) {
      const a = Math.abs(cross(p[(i + p.length - 1) % p.length]!, p[i]!, p[(i + 1) % p.length]!))
      if (a < bestArea) { bestArea = a; best = i }
    }
    p.splice(best, 1)
  }
  return p
}

// The four hull vertices spanning the largest area.
function bestQuad(hull: Point[]): Point[] {
  const p = simplify(hull, hullKeep)
  const n = p.length
  let best: Point[] = []
  let bestArea = -1
  for (let a = 0; a < n - 3; a++) {
    for (let b = a + 1; b < n - 2; b++) {
      for (let c = b + 1; c < n - 1; c++) {
        for (let d = c + 1; d < n; d++) {
          const q = [p[a]!, p[b]!, p[c]!, p[d]!]
          const area = polygonArea(q)
          if (area > bestArea) { bestArea = area; best = q }
        }
      }
    }
  }
  return best
}

// Pushes each side of the quad out to the farthest hull point, so a clipped corner keeps its paper.
function enclose(q: Quad, hull: Point[]): Quad {
  const lines = q.map((a, i) => {
    const b = q[(i + 1) % 4]!
    const len = dist(a, b)
    const nx = (b.y - a.y) / len
    const ny = -(b.x - a.x) / len
    let off = 0
    for (const p of hull) off = Math.max(off, (p.x - a.x) * nx + (p.y - a.y) * ny)
    return { x: a.x + nx * off, y: a.y + ny * off, dx: b.x - a.x, dy: b.y - a.y }
  })
  const meet = (l: (typeof lines)[number], m: (typeof lines)[number]): Point => {
    const t = ((m.x - l.x) * m.dy - (m.y - l.y) * m.dx) / (l.dx * m.dy - l.dy * m.dx)
    return { x: l.x + l.dx * t, y: l.y + l.dy * t }
  }
  return [meet(lines[3]!, lines[0]!), meet(lines[0]!, lines[1]!), meet(lines[1]!, lines[2]!), meet(lines[2]!, lines[3]!)]
}

function isConvex(q: Quad): boolean {
  let sign = 0
  for (let i = 0; i < 4; i++) {
    const c = cross(q[i]!, q[(i + 1) % 4]!, q[(i + 2) % 4]!)
    if (c === 0) return false
    if (sign && Math.sign(c) !== sign) return false
    sign = Math.sign(c)
  }
  return true
}

export function findCorners(img: Rgba): Quad {
  const { width: w, height: h } = img
  const scale = Math.max(1, Math.max(w, h) / detectSize)
  const tw = Math.max(1, Math.round(w / scale))
  const th = Math.max(1, Math.round(h / scale))
  const small = tw === w && th === h ? img.data : shrink(img.data, w, h, 4, tw, th)

  // Closing fills the text; erode treats outside as paper so a sheet touching the frame is kept.
  const raw = paperMask(small, tw * th)
  const closed = rank(rank(raw, tw, th, closeRadius, true, 0), tw, th, closeRadius, false, 1)
  const keep = keepComponents(closed, tw, th)
  if (!keep) return fullImage(img)

  const pts: Point[] = []
  for (let y = 0; y < th; y++) {
    let l = -1
    let r = -1
    for (let x = 0; x < tw; x++) {
      if (keep[y * tw + x]) { if (l < 0) l = x; r = x }
    }
    if (l < 0) continue
    pts.push({ x: l, y }, { x: r + 1, y }, { x: l, y: y + 1 }, { x: r + 1, y: y + 1 })
  }
  const hull = pts.length >= 3 ? convexHull(pts) : []
  if (hull.length < 4) return fullImage(img)

  const sx = w / tw
  const sy = h / th
  const fitted = orderCorners(bestQuad(hull))
  const quad = orderCorners(enclose(fitted, hull).map((p) => ({ x: p.x * sx, y: p.y * sy })))
  if (polygonArea(quad) < minAreaShare * w * h || !isConvex(quad)) return fullImage(img)
  return quad
}

// 3x3 row-major matrix, h22 = 1, mapping `from` onto `to`.
export function homography(from: Quad, to: Quad): number[] {
  const m: number[][] = []
  for (let i = 0; i < 4; i++) {
    const { x, y } = from[i]!
    const { x: u, y: v } = to[i]!
    m.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u])
    m.push([0, 0, 0, x, y, 1, -v * x, -v * y, v])
  }
  for (let c = 0; c < 8; c++) {
    let piv = c
    for (let r = c + 1; r < 8; r++) if (Math.abs(m[r]![c]!) > Math.abs(m[piv]![c]!)) piv = r
    ;[m[c], m[piv]] = [m[piv]!, m[c]!]
    const pr = m[c]!
    if (Math.abs(pr[c]!) < 1e-12) throw new Error('Degenerate quad')
    for (let r = 0; r < 8; r++) {
      if (r === c) continue
      const row = m[r]!
      const f = row[c]! / pr[c]!
      for (let k = c; k < 9; k++) row[k]! -= f * pr[k]!
    }
  }
  return [...m.map((row, i) => row[8]! / row[i]!), 1]
}

export function warp(img: Rgba, quad: Quad, maxWidth?: number): Rgba {
  const [tl, tr, br, bl] = quad
  let ow = Math.max(dist(tl, tr), dist(bl, br))
  let oh = Math.max(dist(tl, bl), dist(tr, br))
  if (maxWidth && ow > maxWidth) {
    oh *= maxWidth / ow
    ow = maxWidth
  }
  const width = Math.max(1, Math.round(ow))
  const height = Math.max(1, Math.round(oh))
  const rect: Quad = [{ x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: height }, { x: 0, y: height }]
  const H = homography(rect, quad)
  const [h0, h1, h2, h3, h4, h5, h6, h7] = H as [number, number, number, number, number, number, number, number]
  const sw = img.width
  const sh = img.height
  const src = img.data
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    const py = y + 0.5
    for (let x = 0; x < width; x++) {
      const px = x + 0.5
      const d = h6 * px + h7 * py + 1
      const fx = (h0 * px + h1 * py + h2) / d - 0.5
      const fy = (h3 * px + h4 * py + h5) / d - 0.5
      const x0 = Math.floor(fx)
      const y0 = Math.floor(fy)
      const tx = fx - x0
      const ty = fy - y0
      const xa = Math.min(sw - 1, Math.max(0, x0))
      const xb = Math.min(sw - 1, Math.max(0, x0 + 1))
      const ya = Math.min(sh - 1, Math.max(0, y0))
      const yb = Math.min(sh - 1, Math.max(0, y0 + 1))
      const i00 = (ya * sw + xa) * 4
      const i10 = (ya * sw + xb) * 4
      const i01 = (yb * sw + xa) * 4
      const i11 = (yb * sw + xb) * 4
      const o = (y * width + x) * 4
      for (let c = 0; c < 4; c++) {
        const top = src[i00 + c]! + (src[i10 + c]! - src[i00 + c]!) * tx
        const bot = src[i01 + c]! + (src[i11 + c]! - src[i01 + c]!) * tx
        data[o + c] = top + (bot - top) * ty
      }
    }
  }
  return { width, height, data }
}

// Box blur with running sums; the window shrinks at the edges.
function boxBlur(src: Uint8ClampedArray, w: number, h: number, r: number): Float32Array {
  const tmp = new Float32Array(w * h)
  const out = new Float32Array(w * h)
  for (let y = 0; y < h; y++) {
    let sum = 0
    for (let x = 0; x < Math.min(w, r); x++) sum += src[y * w + x]!
    for (let x = 0; x < w; x++) {
      if (x + r < w) sum += src[y * w + x + r]!
      if (x - r - 1 >= 0) sum -= src[y * w + x - r - 1]!
      tmp[y * w + x] = sum / (Math.min(w - 1, x + r) - Math.max(0, x - r) + 1)
    }
  }
  for (let x = 0; x < w; x++) {
    let sum = 0
    for (let y = 0; y < Math.min(h, r); y++) sum += tmp[y * w + x]!
    for (let y = 0; y < h; y++) {
      if (y + r < h) sum += tmp[(y + r) * w + x]!
      if (y - r - 1 >= 0) sum -= tmp[(y - r - 1) * w + x]!
      out[y * w + x] = sum / (Math.min(h - 1, y + r) - Math.max(0, y - r) + 1)
    }
  }
  return out
}

export function scanLook(img: Rgba): Rgba {
  const { width: w, height: h, data } = img
  const gray = new Uint8ClampedArray(w * h)
  for (let i = 0; i < w * h; i++) {
    gray[i] = (data[i * 4]! * 77 + data[i * 4 + 1]! * 151 + data[i * 4 + 2]! * 28) >> 8
  }

  const qw = Math.max(1, Math.round(w / 4))
  const qh = Math.max(1, Math.round(h / 4))
  const bg = boxBlur(shrink(gray, w, h, 1, qw, qh), qw, qh, blurRadius)

  const norm = new Uint8ClampedArray(w * h)
  const hist = new Uint32Array(256)
  for (let y = 0; y < h; y++) {
    const fy = Math.min(qh - 1, Math.max(0, ((y + 0.5) * qh) / h - 0.5))
    const y0 = Math.floor(fy)
    const y1 = Math.min(qh - 1, y0 + 1)
    const ty = fy - y0
    for (let x = 0; x < w; x++) {
      const fx = Math.min(qw - 1, Math.max(0, ((x + 0.5) * qw) / w - 0.5))
      const x0 = Math.floor(fx)
      const x1 = Math.min(qw - 1, x0 + 1)
      const tx = fx - x0
      const a = bg[y0 * qw + x0]! + (bg[y0 * qw + x1]! - bg[y0 * qw + x0]!) * tx
      const b = bg[y1 * qw + x0]! + (bg[y1 * qw + x1]! - bg[y1 * qw + x0]!) * tx
      const back = Math.max(1, a + (b - a) * ty)
      const v = Math.min(255, (255 * gray[y * w + x]!) / back)
      norm[y * w + x] = v
      hist[norm[y * w + x]!]!++
    }
  }

  // Light stretch: the darkest 0.5 % maps to black, nothing is pushed past white.
  let acc = 0
  let lo = 0
  while (lo < 254 && acc + hist[lo]! < w * h * 0.005) acc += hist[lo++]!
  const out = new Uint8ClampedArray(w * h * 4)
  const k = 255 / (255 - lo)
  for (let i = 0; i < w * h; i++) {
    const v = (norm[i]! - lo) * k
    out[i * 4] = v
    out[i * 4 + 1] = v
    out[i * 4 + 2] = v
    out[i * 4 + 3] = 255
  }
  return { width: w, height: h, data: out }
}
