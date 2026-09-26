import type { Item } from '../db/schema'
import { isDateUnit } from './dates'
import { columnId, type Column } from './grid'
import { parseNumber } from './values'

export type Sort = { id: string; dir: 'asc' | 'desc' }

const collator = new Intl.Collator('nb', { sensitivity: 'base', numeric: true })

// Sort key for a column: numbers by value, dates by ISO text, everything else by text.
// null means the item has no value for the column and goes last either way.
function keyFor(item: Item, id: string, columns: readonly Column[]): number | string | null {
  if (id === 'name') return item.name
  const col = columns.find((c) => columnId(c) === id)
  if (!col) return null
  const spec = item.specs.find((s) => columnId({ key: s.key, unit: s.unit }) === id)
  if (!spec) return null
  if (isDateUnit(col.unit)) return String(spec.value)
  const n = parseNumber(spec.value)
  return n === null ? String(spec.value) : n
}

export function sortItems(items: readonly Item[], columns: readonly Column[], sort: Sort | null): Item[] {
  if (!sort) return [...items]
  const dir = sort.dir === 'asc' ? 1 : -1
  return [...items]
    .map((item, i) => ({ item, i, key: keyFor(item, sort.id, columns) }))
    .sort((a, b) => {
      if (a.key === null && b.key === null) return a.i - b.i
      if (a.key === null) return 1
      if (b.key === null) return -1
      let c: number
      if (typeof a.key === 'number' && typeof b.key === 'number') c = a.key - b.key
      else if (typeof a.key === 'number') c = -1
      else if (typeof b.key === 'number') c = 1
      else c = collator.compare(a.key, b.key)
      return c === 0 ? a.i - b.i : c * dir
    })
    .map((r) => r.item)
}

// Click cycle on a header: ascending, then descending, then off.
export function nextSort(current: Sort | null, id: string): Sort | null {
  if (current?.id !== id) return { id, dir: 'asc' }
  return current.dir === 'asc' ? { id, dir: 'desc' } : null
}
