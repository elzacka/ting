import { addProperty, saveBatch } from '../db/db'
import type { Item, Property } from '../db/schema'
import { asImage } from './backup'
import { errorText } from './errors'
import { categoryColumnId, choiceDefs, columnDefs, propColumns, type ChoiceDef, type FieldSettings } from './fields'
import { findCorners } from './flatten'
import { columnId, specsFrom } from './grid'
import { fileToRgba } from './receiptImage'
import { readReceipt, rememberStore, sourceSide } from './receiptRead'
import { receiptColumns, receiptInputs, reviewColumn, reviewKey, reviewOpen } from './receiptItems'
import { recentValues } from './values'
import { firstCells, startValues } from './startValues'

export type BatchResult = { things: number; receipts: number; failed: string[] }

// Reads every receipt photo in turn and stores its things at once, each marked «Ikke
// gjennomgått» so they can be found and completed later. A photo that fails or holds no
// lines stores nothing and is named in `failed`; the rest are kept.
export async function importReceipts(
  files: readonly File[],
  items: readonly Item[],
  properties: readonly Property[],
  fields: FieldSettings,
  onProgress: (done: number, total: number) => void,
): Promise<BatchResult> {
  const images = files
    .filter((f) => asImage(f))
    .sort((a, b) => a.name.localeCompare(b.name, 'nb', { numeric: true }))
  const result: BatchResult = { things: 0, receipts: 0, failed: [] }
  if (images.length === 0) return result

  const now = Date.now()
  const cols = receiptColumns(properties, now)
  const review = reviewColumn(properties, now)
  for (const p of [...cols.missing, ...(review.made ? [review.p] : [])]) await addProperty(p)
  const known = [...properties, ...cols.missing, ...(review.made ? [review.p] : [])]
  const defs = columnDefs(fields, known, items)
  const own = (d: ChoiceDef) => d.id !== cols.store.id && d.id !== cols.date.id && d.id !== review.p.id
  const lists = defs.filter((d): d is ChoiceDef => d.kind === 'prop' && (d.type === 'choice' || d.type === 'path') && own(d))
  const storeValues = recentValues(items, (i) => i.specs.find((s) => columnId({ key: s.key, unit: s.unit }) === cols.store.id)?.value.toString() ?? '', cols.store.options ?? [])

  onProgress(0, images.length)
  for (const [n, file] of images.entries()) {
    try {
      const img = await fileToRgba(file, sourceSide)
      const r = await readReceipt(img, findCorners(img), { items, cols, storeValues, lists })
      if (r.noLines) throw new Error('no lines')
      const cells = { ...firstCells(items), ...startValues(lists, items), ...r.guess }
      const choices = choiceDefs(defs, cells[categoryColumnId]?.trim() ?? '').filter(own)
      const more = [...specsFrom(cells, propColumns(choices)), { key: reviewKey, value: reviewOpen, unit: null }]
      const inputs = receiptInputs(r.rows, cols, { store: r.store, date: r.date || null, more, receipt: r.scan })
      await saveBatch(inputs, [])
      await rememberStore(r.key, r.store)
      result.things += inputs.length
      result.receipts++
    } catch (err) {
      console.error(errorText(err))
      result.failed.push(file.name)
    }
    onProgress(n + 1, images.length)
  }
  return result
}
