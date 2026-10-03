// A rotated rectangle: centre, size along and across the text, angle of the text direction in radians.
export type Rect = { cx: number; cy: number; w: number; h: number; angle: number }
type Pt = { x: number; y: number }
export type Tile = { y0: number; keepFrom: number; keepTo: number }
export type TilePlan = { scale: number; width: number; height: number; tileH: number; tiles: Tile[] }

export const tileH = 1280
const overlap = 256
const minWidth = 736
const maxWidth = 1280
const thresh = 0.3
const boxThresh = 0.5
const unclipRatio = 1.6

const ceil32 = (n: number) => Math.ceil(n / 32) * 32

// Receipts are tall and narrow: scale the width into the range the detector
// is good at, then cut the height into overlapping tiles of a fixed size.
export function planTiles(imgW: number, imgH: number): TilePlan {
  const scale = Math.min(maxWidth, Math.max(minWidth, imgW)) / imgW
  const width = ceil32(imgW * scale)
  const height = Math.max(32, Math.ceil(imgH * scale))
  if (height <= tileH) {
    const h = ceil32(height)
    return { scale, width, height, tileH: h, tiles: [{ y0: 0, keepFrom: 0, keepTo: height }] }
  }
  const starts: number[] = []
  for (let y = 0; y + tileH < height; y += tileH - overlap) starts.push(y)
  starts.push(height - tileH)
  const tiles = starts.map((y0, i) => {
    const prev = starts[i - 1]
    const next = starts[i + 1]
    // Cut where the overlap is deepest inside both tiles, away from the padded edges.
    const keepFrom = prev === undefined ? 0 : Math.floor((y0 + prev + tileH) / 2)
    const keepTo = next === undefined ? height : Math.floor((next + y0 + tileH) / 2)
    return { y0, keepFrom, keepTo }
  })
  return { scale, width, height, tileH, tiles }
}

// Copies the rows a tile owns from its probability output into the page-sized map.
export function placeTile(map: Uint8Array, width: number, prob: Float32Array, tile: Tile): void {
  for (let y = tile.keepFrom; y < tile.keepTo; y++) {
    const src = (y - tile.y0) * width
    const dst = y * width
    for (let x = 0; x < width; x++) {
      map[dst + x] = Math.round(Math.min(1, Math.max(0, prob[src + x] as number)) * 255)
    }
  }
}

// Same 2x2 dilation as the reference, so thin strokes join up.
function dilate(mask: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(mask.length)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      out[i] = mask[i] || (x > 0 && mask[i - 1]) || (y > 0 && mask[i - w]) || (x > 0 && y > 0 && mask[i - w - 1]) ? 1 : 0
    }
  }
  return out
}

function cross(o: Pt, a: Pt, b: Pt): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
}

// Andrew's monotone chain.
function convexHull(pts: Pt[]): Pt[] {
  const p = [...pts].sort((a, b) => a.x - b.x || a.y - b.y)
  if (p.length < 3) return p
  const build = (list: Pt[]) => {
    const out: Pt[] = []
    for (const q of list) {
      while (out.length >= 2 && cross(out[out.length - 2] as Pt, out[out.length - 1] as Pt, q) <= 0) out.pop()
      out.push(q)
    }
    out.pop()
    return out
  }
  return [...build(p), ...build([...p].reverse())]
}

// Smallest rectangle around the points, found by trying each hull edge as a side.
export function minAreaRect(pts: Pt[]): Rect {
  const hull = convexHull(pts)
  let best: Rect | undefined
  let bestArea = Infinity
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i] as Pt
    const b = hull[(i + 1) % hull.length] as Pt
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    if (len === 0) continue
    const ux = (b.x - a.x) / len
    const uy = (b.y - a.y) / len
    let u0 = Infinity
    let u1 = -Infinity
    let v0 = Infinity
    let v1 = -Infinity
    for (const p of hull) {
      const u = p.x * ux + p.y * uy
      const v = -p.x * uy + p.y * ux
      u0 = Math.min(u0, u)
      u1 = Math.max(u1, u)
      v0 = Math.min(v0, v)
      v1 = Math.max(v1, v)
    }
    const area = (u1 - u0) * (v1 - v0)
    if (area >= bestArea) continue
    bestArea = area
    const mu = (u0 + u1) / 2
    const mv = (v0 + v1) / 2
    best = { cx: mu * ux - mv * uy, cy: mu * uy + mv * ux, w: u1 - u0, h: v1 - v0, angle: Math.atan2(uy, ux) }
  }
  return best ? uprightRect(best) : boundsRect(pts)
}

function boundsRect(pts: Pt[]): Rect {
  const xs = pts.map((p) => p.x)
  const ys = pts.map((p) => p.y)
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0, angle: 0 }
}

// Text direction is the axis closest to horizontal.
function uprightRect(r: Rect): Rect {
  let { w, h, angle } = r
  while (angle > Math.PI / 4) {
    angle -= Math.PI / 2
    ;[w, h] = [h, w]
  }
  while (angle <= -Math.PI / 4) {
    angle += Math.PI / 2
    ;[w, h] = [h, w]
  }
  return { cx: r.cx, cy: r.cy, w, h, angle }
}

function growRect(r: Rect): Rect {
  const d = (r.w * r.h * unclipRatio) / (2 * (r.w + r.h))
  return { ...r, w: r.w + 2 * d, h: r.h + 2 * d }
}

// Mean probability inside the rectangle.
function meanProb(map: Uint8Array, mapW: number, mapH: number, r: Rect): number {
  const cos = Math.cos(r.angle)
  const sin = Math.sin(r.angle)
  const ext = (Math.abs(r.w * cos) + Math.abs(r.h * sin)) / 2
  const eyt = (Math.abs(r.w * sin) + Math.abs(r.h * cos)) / 2
  let sum = 0
  let n = 0
  for (let y = Math.max(0, Math.floor(r.cy - eyt)); y <= Math.min(mapH - 1, Math.ceil(r.cy + eyt)); y++) {
    for (let x = Math.max(0, Math.floor(r.cx - ext)); x <= Math.min(mapW - 1, Math.ceil(r.cx + ext)); x++) {
      const dx = x - r.cx
      const dy = y - r.cy
      if (Math.abs(dx * cos + dy * sin) > r.w / 2 + 0.5 || Math.abs(-dx * sin + dy * cos) > r.h / 2 + 0.5) continue
      sum += map[y * mapW + x] as number
      n++
    }
  }
  return n === 0 ? 0 : sum / (n * 255)
}

// The extreme pixels of each row are enough to find the hull of a blob.
function outline(members: Int32Array, count: number, w: number): Pt[] {
  const left = new Map<number, number>()
  const right = new Map<number, number>()
  for (let k = 0; k < count; k++) {
    const i = members[k] as number
    const x = i % w
    const y = (i - x) / w
    if (x < (left.get(y) ?? Infinity)) left.set(y, x)
    if (x > (right.get(y) ?? -Infinity)) right.set(y, x)
  }
  const pts: Pt[] = []
  for (const [y, x] of left) pts.push({ x, y }, { x: right.get(y) as number, y })
  return pts
}

// Lines of text lean a few degrees on a photographed receipt, so a connected
// blob of probable pixels becomes a rotated rectangle; it is grown back
// because the detector is trained on shrunken text areas.
export function boxesFromMap(map: Uint8Array, w: number, h: number): Rect[] {
  const cut = Math.round(thresh * 255)
  const mask = new Uint8Array(map.length)
  for (let i = 0; i < map.length; i++) mask[i] = (map[i] as number) > cut ? 1 : 0
  const bin = dilate(mask, w, h)
  const members = new Int32Array(map.length)
  const boxes: Rect[] = []
  for (let start = 0; start < bin.length; start++) {
    if (!bin[start]) continue
    let head = 0
    let count = 0
    members[count++] = start
    bin[start] = 0
    while (head < count) {
      const i = members[head++] as number
      const x = i % w
      const y = (i - x) / w
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
          const n = ny * w + nx
          if (!bin[n]) continue
          bin[n] = 0
          members[count++] = n
        }
      }
    }
    const rect = minAreaRect(outline(members, count, w))
    if (Math.min(rect.w, rect.h) < 3) continue
    if (meanProb(map, w, h, rect) < boxThresh) continue
    const g = growRect(rect)
    if (Math.min(g.w, g.h) >= 5) boxes.push(g)
  }
  return boxes
}

// Map coordinates back to the picture; tiny boxes and boxes outside it are dropped.
export function toImageBoxes(boxes: Rect[], scale: number, imgW: number, imgH: number): Rect[] {
  return boxes
    .map((b) => ({ cx: b.cx / scale, cy: b.cy / scale, w: b.w / scale, h: b.h / scale, angle: b.angle }))
    .filter((b) => b.w > 3 && b.h > 3 && b.cx >= 0 && b.cy >= 0 && b.cx <= imgW && b.cy <= imgH)
}
