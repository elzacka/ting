import type { Rgba } from './flatten'

// Browser side of the receipt photo: decode, downscale, encode. The pixel
// work itself is in flatten.ts.

function canvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

// The photo upright (EXIF) and at most `maxSide` px on its long side: a 24 MP
// photo as RGBA is about 100 MB, more than an iPhone tab should hold twice
export async function fileToRgba(file: Blob, maxSide: number): Promise<Rgba> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const k = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const w = Math.round(bitmap.width * k)
  const h = Math.round(bitmap.height * k)
  const ctx = canvas(w, h).getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('no 2d context')
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()
  const data = ctx.getImageData(0, 0, w, h)
  return { width: w, height: h, data: data.data }
}

export async function rgbaToJpeg(img: Rgba, quality: number): Promise<Blob> {
  const c = canvas(img.width, img.height)
  const ctx = c.getContext('2d')
  if (!ctx) throw new Error('no 2d context')
  ctx.putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0)
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('encode failed'))), 'image/jpeg', quality))
}
