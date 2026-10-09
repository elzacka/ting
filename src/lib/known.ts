import type { Item } from '../db/schema'
import { digitsOf } from './barcode'
import { isbn13Of } from './books'
import type { ChoiceDef } from './fields'
import { cellsFrom, isBarcode } from './grid'

// One spelling per code for comparing: an ISBN as its thirteen digits, any
// other number without hyphens, spaces or leading zeros (a code stored as a
// number lost those), anything else as typed
export function codeKey(code: string): string {
  const d = isbn13Of(code) ?? digitsOf(code.trim())
  return /^\d+$/.test(d) ? d.replace(/^0+(?=\d)/, '') : code.trim()
}

// The things that carry the code, newest first
export function sameCode(items: readonly Item[], code: string): Item[] {
  if (code.trim() === '') return []
  const key = codeKey(code)
  return items
    .filter((i) => i.specs.some((s) => isBarcode(s) && codeKey(String(s.value)) === key))
    .sort((a, b) => b.createdAt - a.createdAt)
}

// What a known thing says in the form's fields. Not dates: a purchase or a
// delivery date belongs to the thing in hand, not to the one before it.
export function knownCells(item: Item, fields: readonly ChoiceDef[]): Record<string, string> {
  const cells = cellsFrom(item)
  const out: Record<string, string> = {}
  for (const d of fields) {
    const v = cells[d.id] ?? ''
    if (v !== '' && d.type !== 'date') out[d.id] = v
  }
  return out
}
