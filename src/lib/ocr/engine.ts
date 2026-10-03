import type * as OrtTypes from 'onnxruntime-web'
import type { Rgba } from '../flatten'
import { checkSize } from './limits'
import { boxesFromMap, placeTile, planTiles, toImageBoxes, type Rect } from './detect'
import { cropRect, resizeRegion, toPlanes } from './image'
import {
  batchesByWidth,
  batchWidth,
  cropRatio,
  ctcDecode,
  groupLines,
  keepReads,
  parseDict,
  recHeight,
  type Read,
} from './recognize'

export type Ort = Pick<typeof OrtTypes, 'InferenceSession' | 'Tensor'>
export type Models = { det: Uint8Array; rec: Uint8Array; dict: string }
export type Engine = { read(img: Rgba): Promise<string[]>; dispose(): Promise<void> }

export async function createEngine(ort: Ort, models: Models): Promise<Engine> {
  const opts = { executionProviders: ['wasm'], graphOptimizationLevel: 'all' } as const
  const det = await ort.InferenceSession.create(models.det, opts)
  const rec = await ort.InferenceSession.create(models.rec, opts)
  const chars = parseDict(models.dict)

  async function detect(img: Rgba): Promise<Rect[]> {
    const plan = planTiles(img.width, img.height)
    const map = new Uint8Array(plan.width * plan.height)
    for (const tile of plan.tiles) {
      const rows = Math.min(plan.tileH, plan.height - tile.y0)
      const top = Math.min(img.height - 1, Math.round(tile.y0 / plan.scale))
      const srcH = Math.max(1, Math.min(img.height - top, Math.round(rows / plan.scale)))
      const rgb = resizeRegion(img, 0, top, img.width, srcH, plan.width, rows)
      const input = toPlanes(rgb, plan.width, rows, plan.width, plan.tileH, 1)
      const out = await det.run({ x: new ort.Tensor('float32', input, [1, 3, plan.tileH, plan.width]) })
      placeTile(map, plan.width, (Object.values(out)[0] as OrtTypes.Tensor).data as Float32Array, tile)
    }
    return toImageBoxes(boxesFromMap(map, plan.width, plan.height), plan.scale, img.width, img.height)
  }

  async function recognise(img: Rgba, boxes: Rect[]): Promise<Read[]> {
    const reads: Read[] = new Array(boxes.length)
    for (const batch of batchesByWidth(boxes)) {
      const w = batchWidth(batch.map((i) => cropRatio(boxes[i] as Rect)))
      const input = new Float32Array(batch.length * 3 * recHeight * w)
      batch.forEach((idx, n) => {
        const crop = cropRect(img, boxes[idx] as Rect)
        const cw = Math.max(1, Math.min(w, Math.ceil(recHeight * (crop.width / crop.height))))
        const rgb = resizeRegion(crop, 0, 0, crop.width, crop.height, cw, recHeight)
        input.set(toPlanes(rgb, cw, recHeight, w, recHeight, 0), n * 3 * recHeight * w)
      })
      const out = await rec.run({ x: new ort.Tensor('float32', input, [batch.length, 3, recHeight, w]) })
      const t = Object.values(out)[0] as OrtTypes.Tensor
      const [, steps, classes] = t.dims as [number, number, number]
      const data = t.data as Float32Array
      batch.forEach((idx, n) => {
        const probs = data.subarray(n * steps * classes, (n + 1) * steps * classes)
        reads[idx] = { ...ctcDecode(probs, steps, classes, chars), box: boxes[idx] as Rect }
      })
    }
    return reads
  }

  return {
    async read(img) {
      checkSize(img)
      return groupLines(keepReads(await recognise(img, await detect(img))))
    },
    async dispose() {
      await det.release()
      await rec.release()
    },
  }
}
