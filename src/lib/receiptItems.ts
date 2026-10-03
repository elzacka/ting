import type { ItemInput, Property, Spec } from '../db/schema'
import { dateUnit } from './dates'
import { columnId } from './grid'
import { categoryKey } from './fields'
import { parseNumber } from './values'

// Which columns a receipt fills: the register's own where one fits by type and
// name, otherwise one made here. Prices go to a kr column, never a new
// "Pris" next to an existing "Verdi".

// Receipt reading downloads its models first, so it is a switch, off until turned on
export const receiptReadingKey = 'receiptReading'

export type ReceiptColumns = { store: Property; date: Property; price: Property; missing: Property[] }

const storeName = /kjøpt hos|butikk|forhandler|kjøpested|kjøpssted/i
const dateName = /kjøp/i
const priceName = /pris|verdi|kost|beløp/i

function pick(properties: readonly Property[], fits: (p: Property) => boolean, make: () => Property): { p: Property; made: boolean } {
  const found = properties.find(fits)
  return found ? { p: found, made: false } : { p: make(), made: true }
}

export function receiptColumns(properties: readonly Property[], now: number): ReceiptColumns {
  const store = pick(
    properties,
    (p) => (p.type === 'choice' || p.type === 'text' || p.type === undefined) && storeName.test(p.key),
    () => ({ id: columnId({ key: 'Kjøpt hos', unit: null }), key: 'Kjøpt hos', unit: null, type: 'choice', createdAt: now }),
  )
  const date = pick(
    properties,
    (p) => (p.type === 'date' || p.unit === dateUnit) && dateName.test(p.key),
    () => ({ id: columnId({ key: 'Kjøpsdato', unit: dateUnit }), key: 'Kjøpsdato', unit: dateUnit, type: 'date', createdAt: now }),
  )
  const price = pick(
    properties,
    (p) => p.unit === 'kr' && priceName.test(p.key),
    () => ({ id: columnId({ key: 'Pris', unit: 'kr' }), key: 'Pris', unit: 'kr', type: 'number', createdAt: now }),
  )
  return {
    store: store.p,
    date: date.p,
    price: price.p,
    missing: [store, date, price].filter((x) => x.made).map((x) => x.p),
  }
}

export type ReceiptRow = { include: boolean; name: string; price: string }

// One thing per ticked row with a name, each carrying the receipt as its photo
export function receiptInputs(
  rows: readonly ReceiptRow[],
  cols: ReceiptColumns,
  shared: { store: string; date: string | null; category: string; photo: Blob },
): ItemInput[] {
  const common: Spec[] = []
  if (shared.category.trim() !== '') common.push({ key: categoryKey, value: shared.category.trim(), unit: '' })
  if (shared.store.trim() !== '') common.push({ key: cols.store.key, value: shared.store.trim(), unit: cols.store.unit })
  if (shared.date) common.push({ key: cols.date.key, value: shared.date, unit: cols.date.unit })
  return rows
    .filter((r) => r.include && r.name.trim() !== '')
    .map((r) => {
      const price = parseNumber(r.price)
      const specs = price === null ? common : [...common, { key: cols.price.key, value: price, unit: cols.price.unit }]
      return { name: r.name.trim(), specs, photos: [shared.photo] }
    })
}

// OCR reads ø as o or e in bold print: "Bjerkely Vestby" is the "Bjørkely
// Vestby" already in the register. Two edits at most, never on short names.
export function closestValue(suggestion: string, values: readonly string[]): string {
  const norm = (v: string) => v.toLocaleLowerCase('nb').replace(/\s+/g, ' ').trim()
  const s = norm(suggestion)
  if (s.length < 5) return suggestion
  let best: { value: string; d: number } | null = null
  for (const v of values) {
    const d = editDistance(s, norm(v))
    if (d <= 2 && (!best || d < best.d)) best = { value: v, d }
  }
  return best?.value ?? suggestion
}

function editDistance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 3
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min((prev[j] ?? 0) + 1, (cur[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    prev = cur
  }
  return prev[b.length] ?? 0
}
