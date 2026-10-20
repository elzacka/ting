import { getSealedSetting, setSealedSetting } from '../db/db'
import type { Item } from '../db/schema'
import { errorText } from './errors'
import type { ChoiceDef } from './fields'
import { scanLook, warp, type Quad, type Rgba } from './flatten'
import { formatNumber } from './format'
import { readText } from './ocr'
import { parseReceipt, splitAmount, storeKey } from './receipt'
import { receiptGuess } from './receiptGuess'
import { rgbaToJpeg } from './receiptImage'
import { closestValue, longDate, type ReceiptColumns, type ReceiptRow } from './receiptItems'
import { startValues } from './startValues'

// Long side of the photo kept for cropping, and width of the stored receipt:
// enough to read every line, small enough to keep on every thing it bought
export const sourceSide = 2400
const receiptWidth = 1200
// The store a receipt names, as the user last called it: keyed by org number
// and postcode, or the card terminal when the receipt prints neither
const storesKey = 'receiptStores'

// A list sealed under a key this device no longer holds reads as empty, like
// column widths: the next save seals it again under the current key
async function knownStores(): Promise<Record<string, string>> {
  try {
    return (await getSealedSetting<Record<string, string>>(storesKey)) ?? {}
  } catch (err) {
    console.error(errorText(err))
    return {}
  }
}

export async function rememberStore(key: string | null, store: string): Promise<void> {
  if (key && store.trim() !== '') await setSealedSetting(storesKey, { ...(await knownStores()), [key]: store.trim() })
}

export type ReceiptRead = {
  scan: Blob
  total: number | null
  key: string | null
  store: string
  date: string
  rows: ReceiptRow[]
  noLines: boolean
  // Kategori, status, place and the other lists, filled by rule from the register
  guess: Record<string, string>
}

export type ReadContext = {
  items: readonly Item[]
  cols: ReceiptColumns
  storeValues: readonly string[]
  lists: readonly ChoiceDef[]
}

// Crop and straighten, keep the scan as the proof of purchase, read the text
export async function readReceipt(img: Rgba, corners: Quad, ctx: ReadContext): Promise<ReceiptRead> {
  const flat = warp(img, corners, receiptWidth)
  const scan = await rgbaToJpeg(scanLook(flat), 0.75)
  const r = parseReceipt(await readText(flat), new Date())
  const known = await knownStores()
  const key = storeKey(r)
  const store = (key && known[key]) || (r.storeName ? closestValue(r.storeName, ctx.storeValues) : '')
  // One thing per unit: two duvets are two things, each with its share
  const lines: ReceiptRow[] = r.lines.flatMap((line) =>
    splitAmount(line.amount, line.quantity).map((price) => ({ include: true, name: line.name, price: formatNumber(price), photos: [] })),
  )
  // Status and the place start where every new thing does, whatever the lines say
  const guess = {
    ...receiptGuess(lines.map((row) => row.name), store, ctx.cols.store.id, ctx.lists, ctx.items),
    ...startValues(ctx.lists, ctx.items),
  }
  return {
    scan,
    total: r.total,
    key,
    store,
    date: r.date ? longDate(r.date) : '',
    rows: lines.length > 0 ? lines : [{ include: true, name: '', price: '', photos: [] }],
    noLines: lines.length === 0,
    guess,
  }
}
