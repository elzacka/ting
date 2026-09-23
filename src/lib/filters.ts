import type { Item } from '../db/schema'
import { isDateUnit } from './dates'
import { isPathUnit, pathPrefix } from './paths'
import { parseNumber } from './filter'
import { columnId, type Column } from './grid'

// One filter per column: the set of accepted values (empty = no filter).
// Values are compared by their normalised text so "5" and 5 are the same.
// A place column has one filter per level, keyed "<column>#1", "<column>#2":
// the level is in the id, so nothing downstream needs to know the types.
export type Filters = Record<string, string[]>

export const categoryFilterId = 'category'

const levelMark = '#'

export function levelId(id: string, level: number): string {
  return `${id}${levelMark}${level}`
}

// A filter id split back into the column it narrows and the level it narrows
// it to, or no level for the columns that have only one.
export function splitLevel(filterId: string): { id: string; level: number | null } {
  const at = filterId.lastIndexOf(levelMark)
  if (at < 0) return { id: filterId, level: null }
  const level = Number(filterId.slice(at + 1))
  return Number.isInteger(level) && level > 0 ? { id: filterId.slice(0, at), level } : { id: filterId, level: null }
}

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

// What one spec offers a filter: a year for a date, the way in as far as the
// level for a place, the value itself for everything else. Null when the spec
// has nothing to say at that level.
function keyOf(value: string | number, unit: string | null, level: number | null): string | null {
  if (level !== null) {
    const prefix = pathPrefix(value, level)
    return prefix === null ? null : valueKey(prefix)
  }
  return isDateUnit(unit) ? yearOf(value) : valueKey(value)
}

function labelOf(value: string | number, unit: string | null, level: number | null): string {
  const prefix = level === null ? null : pathPrefix(value, level)
  return prefix ?? labelFor(value, unit)
}

// Distinct values present for a column with how many things carry each,
// numeric-aware sort. A level narrows a place column to its first n steps.
export function valuesFor(items: readonly Item[], col: Column, level: number | null = null): FilterValue[] {
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
      const key = keyOf(s.value, s.unit, level)
      if (key !== null) add(key, labelOf(s.value, s.unit, level))
    }
  }
  return [...seen.values()].sort((a, b) => collator.compare(a.label, b.label))
}

export function itemValueKeys(item: Item, filterId: string): string[] {
  const { id, level } = splitLevel(filterId)
  return item.specs
    .filter((s) => columnId({ key: s.key, unit: s.unit }) === id)
    .flatMap((s) => {
      const key = keyOf(s.value, s.unit, isPathUnit(s.unit) ? level : null)
      return key === null ? [] : [key]
    })
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

// Whether a column is worth a menu, judged over the whole register rather
// than the rows in view: in one category of twenty things nearly every brand
// is different, over three hundred the brands repeat. A date is always one
// (it facets by year); anything else is when its values are few, or repeat
// enough that a menu is shorter than the list. Prices and order numbers do
// not: the search takes those (pris>1000).
const facetShort = 12
const facetMaxUnique = 0.6

export function isFacet(all: readonly FilterValue[], unit: string | null): boolean {
  if (all.length === 0) return false
  if (isDateUnit(unit) || all.length <= facetShort) return true
  const rows = all.reduce((n, v) => n + v.count, 0)
  return all.length <= rows * facetMaxUnique
}
