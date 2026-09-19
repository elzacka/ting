import type { Item } from '../db/schema'
import { formatStoredDate, isDateUnit } from './dates'
import { parseNumber } from './filter'
import { columnId, type Column } from './grid'

// One filter per column: the set of accepted values (empty = no filter).
// Values are compared by their normalised text so "5" and 5 are the same.
export type Filters = Record<string, string[]>

export const categoryFilterId = 'category'

const collator = new Intl.Collator('nb', { sensitivity: 'base', numeric: true })

export function valueKey(v: string | number): string {
  const n = parseNumber(v)
  return n === null ? String(v).trim().toLocaleLowerCase('nb') : String(n)
}

export type FilterValue = { key: string; label: string }

function labelFor(v: string | number, unit: string | null): string {
  if (isDateUnit(unit)) return formatStoredDate(v)
  const n = parseNumber(v)
  return n === null ? String(v).trim() : new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 2 }).format(n).replace('-', '−')
}

// Distinct values present for a column, numeric-aware sort.
export function valuesFor(items: readonly Item[], col: Column | null): FilterValue[] {
  const seen = new Map<string, FilterValue>()
  for (const item of items) {
    if (col === null) {
      const k = valueKey(item.category)
      if (!seen.has(k)) seen.set(k, { key: k, label: item.category })
      continue
    }
    const id = columnId(col)
    for (const s of item.specs) {
      if (columnId({ key: s.key, unit: s.unit }) !== id) continue
      const k = valueKey(s.value)
      if (!seen.has(k)) seen.set(k, { key: k, label: labelFor(s.value, s.unit) })
    }
  }
  return [...seen.values()].sort((a, b) => collator.compare(a.label, b.label))
}

export function itemValueKeys(item: Item, filterId: string): string[] {
  if (filterId === categoryFilterId) return [valueKey(item.category)]
  return item.specs.filter((s) => columnId({ key: s.key, unit: s.unit }) === filterId).map((s) => valueKey(s.value))
}

export function applyFilters(items: readonly Item[], filters: Filters): Item[] {
  const active = Object.entries(filters).filter(([, values]) => values.length > 0)
  if (active.length === 0) return [...items]
  return items.filter((item) =>
    active.every(([id, values]) => {
      const mine = itemValueKeys(item, id)
      return values.some((v) => mine.includes(v))
    }),
  )
}

export function activeCount(filters: Filters): number {
  return Object.values(filters).filter((v) => v.length > 0).length
}
