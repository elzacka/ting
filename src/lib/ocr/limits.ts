import type { Rgba } from '../flatten'

export const maxWidth = 4000
export const maxHeight = 12000

export function checkSize(img: Rgba): void {
  if (img.width < 1 || img.height < 1 || img.data.length < img.width * img.height * 4) throw new Error('invalid image')
  if (img.width > maxWidth || img.height > maxHeight) throw new Error('image too large')
}
