import type { Rgba } from '../flatten'
import type { Rect } from './detect'

type Axis = { first: Int32Array; taps: Float32Array[] }

// Tent filter whose width follows the scale, so shrinking averages instead of skipping pixels.
function axisWeights(srcLen: number, dstLen: number): Axis {
  const scale = srcLen / dstLen
  const support = Math.max(scale, 1)
  const first = new Int32Array(dstLen)
  const taps: Float32Array[] = []
  for (let i = 0; i < dstLen; i++) {
    const center = (i + 0.5) * scale
    const lo = Math.max(0, Math.floor(center - support))
    const hi = Math.min(srcLen, Math.ceil(center + support))
    const w = new Float32Array(Math.max(1, hi - lo))
    let sum = 0
    for (let j = lo; j < hi; j++) {
      const v = Math.max(0, 1 - Math.abs((j + 0.5 - center) / support))
      w[j - lo] = v
      sum += v
    }
    if (sum === 0) w[0] = sum = 1
    for (let k = 0; k < w.length; k++) w[k] = (w[k] ?? 0) / sum
    first[i] = Math.min(lo, srcLen - 1)
    taps.push(w)
  }
  return { first, taps }
}

// Resizes a region of the image to dw x dh; returns interleaved RGB, 0..255.
export function resizeRegion(
  img: Rgba,
  x0: number,
  y0: number,
  w: number,
  h: number,
  dw: number,
  dh: number,
): Float32Array {
  const ax = axisWeights(w, dw)
  const ay = axisWeights(h, dh)
  const tmp = new Float32Array(h * dw * 3)
  const src = img.data
  for (let row = 0; row < h; row++) {
    const base = (y0 + row) * img.width + x0
    for (let x = 0; x < dw; x++) {
      const taps = ax.taps[x] as Float32Array
      const start = base + (ax.first[x] as number)
      let r = 0
      let g = 0
      let b = 0
      for (let k = 0; k < taps.length; k++) {
        const p = (start + k) * 4
        const t = taps[k] as number
        r += t * (src[p] as number)
        g += t * (src[p + 1] as number)
        b += t * (src[p + 2] as number)
      }
      const o = (row * dw + x) * 3
      tmp[o] = r
      tmp[o + 1] = g
      tmp[o + 2] = b
    }
  }
  const out = new Float32Array(dh * dw * 3)
  const rowLen = dw * 3
  for (let y = 0; y < dh; y++) {
    const taps = ay.taps[y] as Float32Array
    const start = ay.first[y] as number
    const o = y * rowLen
    for (let k = 0; k < taps.length; k++) {
      const t = taps[k] as number
      const s = (start + k) * rowLen
      for (let i = 0; i < rowLen; i++) out[o + i] = (out[o + i] as number) + t * (tmp[s + i] as number)
    }
  }
  return out
}

// PaddleOCR models read BGR planes scaled to -1..1; columns or rows past the picture stay white.
export function toPlanes(rgb: Float32Array, w: number, h: number, outW: number, outH: number, pad: number): Float32Array {
  const plane = outW * outH
  const out = new Float32Array(3 * plane).fill(pad)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3
      const o = y * outW + x
      out[o] = (rgb[i + 2] as number) / 127.5 - 1
      out[plane + o] = (rgb[i + 1] as number) / 127.5 - 1
      out[2 * plane + o] = (rgb[i] as number) / 127.5 - 1
    }
  }
  return out
}

// The rotated rectangle straightened into its own picture, sampled bilinearly at 1:1.
export function cropRect(img: Rgba, r: Rect): Rgba {
  const width = Math.max(1, Math.round(r.w))
  const height = Math.max(1, Math.round(r.h))
  const data = new Uint8ClampedArray(width * height * 4)
  const cos = Math.cos(r.angle)
  const sin = Math.sin(r.angle)
  const px = (x: number, y: number, c: number) =>
    img.data[(Math.min(img.height - 1, Math.max(0, y)) * img.width + Math.min(img.width - 1, Math.max(0, x))) * 4 + c] as number
  for (let j = 0; j < height; j++) {
    for (let i = 0; i < width; i++) {
      const u = ((i + 0.5) * r.w) / width - r.w / 2
      const v = ((j + 0.5) * r.h) / height - r.h / 2
      const x = r.cx + u * cos - v * sin - 0.5
      const y = r.cy + u * sin + v * cos - 0.5
      const x0 = Math.floor(x)
      const y0 = Math.floor(y)
      const fx = x - x0
      const fy = y - y0
      for (let c = 0; c < 3; c++) {
        const top = px(x0, y0, c) * (1 - fx) + px(x0 + 1, y0, c) * fx
        const bottom = px(x0, y0 + 1, c) * (1 - fx) + px(x0 + 1, y0 + 1, c) * fx
        data[(j * width + i) * 4 + c] = top * (1 - fy) + bottom * fy
      }
      data[(j * width + i) * 4 + 3] = 255
    }
  }
  return { width, height, data }
}
