import type { Item } from '../db/schema'
import { isDateUnit } from './dates'
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

export type FilterValue = { key: string; label: string; count: number }

// A date column facets by year: a menu of every single day is no menu
function yearOf(v: string | number): string {
  return String(v).slice(0, 4)
}

function labelFor(v: string | number, unit: string | null): string {
  if (isDateUnit(unit)) return yearOf(v)
  const n = parseNumber(v)
  return n === null ? String(v).trim() : new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 2 }).format(n).replace('-', '−')
}

// Distinct values present for a column with how many things carry each,
// numeric-aware sort.
export function valuesFor(items: readonly Item[], col: Column): FilterValue[] {
  const seen = new Map<string, FilterValue>()
  const add = (k: string, label: string) => {
    const cur = seen.get(k)
    if (cur) cur.count += 1
    else seen.set(k, { key: k, label, count: 1 })
  }
  const id = columnId(col)
  for (const item of items) {
    for (const s of item.specs) {
      if (columnId({ key: s.key, unit: s.unit }) !== id) continue
      add(isDateUnit(s.unit) ? yearOf(s.value) : valueKey(s.value), labelFor(s.value, s.unit))
    }
  }
  return [...seen.values()].sort((a, b) => collator.compare(a.label, b.label))
}

export function itemValueKeys(item: Item, filterId: string): string[] {
  return item.specs
    .filter((s) => columnId({ key: s.key, unit: s.unit }) === filterId)
    .map((s) => (isDateUnit(s.unit) ? yearOf(s.value) : valueKey(s.value)))
}

// The rows every filter but one leaves: what that one filter's menu counts.
export function withoutFilter(items: readonly Item[], filters: Filters, id: string): Item[] {
  const { [id]: _own, ...rest } = filters
  return applyFilters(items, rest)
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
