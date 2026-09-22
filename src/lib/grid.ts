import type { Item, ItemInput, Spec } from '../db/schema'
import { formatStoredDate, isDateUnit, parseDateInput } from './dates'
import { formatPath, isPathUnit, parsePath } from './paths'
import { parseNumber } from './filter'

// A column is one spec key with one unit. The same key with two different
// units becomes two columns, which keeps every cell a plain value.
export type Column = { key: string; unit: string | null }

const collator = new Intl.Collator('nb', { sensitivity: 'base' })

export function columnId(col: Column): string {
  return JSON.stringify([col.key.toLocaleLowerCase('nb'), (col.unit ?? '').toLocaleLowerCase('nb')])
}

export function columnsFrom(items: readonly Item[]): Column[] {
  const seen = new Map<string, Column>()
  for (const item of items) {
    for (const s of item.specs) {
      const col = { key: s.key, unit: s.unit }
      const id = columnId(col)
      if (!seen.has(id)) seen.set(id, col)
    }
  }
  return [...seen.values()].sort(
    (a, b) => collator.compare(a.key, b.key) || collator.compare(a.unit ?? '', b.unit ?? ''),
  )
}

// A date and a place are shown the way they read, not the way they are
// stored: the cell the eye sees and the cell the editor starts from are the
// same text, whichever separator the place was typed with.
export function cellsFrom(item: Item): Record<string, string> {
  const cells: Record<string, string> = {}
  for (const s of item.specs) {
    const value = isDateUnit(s.unit)
      ? formatStoredDate(s.value)
      : isPathUnit(s.unit)
        ? formatPath(parsePath(s.value))
        : String(s.value)
    cells[columnId({ key: s.key, unit: s.unit })] = value
  }
  return cells
}

// Builds the specs list from a row's cells, in column order, skipping blanks.
export function specsFrom(cells: Record<string, string>, columns: readonly Column[]): Spec[] {
  const specs: Spec[] = []
  for (const col of columns) {
    const raw = (cells[columnId(col)] ?? '').trim()
    if (raw === '') continue
    const value = isDateUnit(col.unit)
      ? (parseDateInput(raw) ?? raw)
      : isPathUnit(col.unit)
        ? formatPath(parsePath(raw))
        : (parseNumber(raw) ?? raw)
    specs.push({ key: col.key, value, unit: col.unit })
  }
  return specs
}

export function inputFrom(
  row: { name: string; cells: Record<string, string>; photos: readonly Blob[] },
  columns: readonly Column[],
): ItemInput {
  return {
    name: row.name.trim(),
    photos: [...row.photos],
    specs: specsFrom(row.cells, columns),
  }
}
