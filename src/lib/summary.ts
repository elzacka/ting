import type { Item, Property } from '../db/schema'
import { appliesTo, categoryColumnId } from './fields'
import { columnId } from './grid'
import { parseNumber } from './filter'

// The line above the table: how much there is, what it is worth, and what is
// still missing. Nothing that needs a property the user may not have.

export type Total = { key: string; unit: string; sum: number }
export type Missing = { what: 'photo' | 'value'; key: string; count: number; query: string }
// The same facts, split by the axis the register already has: what a thing
// is. `category` is null for the things that have not been told.
export type Gaps = { category: string | null; missing: Missing[] }

const collator = new Intl.Collator('nb', { sensitivity: 'base' })

function isMoney(unit: string | null): unit is string {
  return unit !== null && unit.trim().toLocaleLowerCase('nb') === 'kr'
}

// One sum per number property in kr.
export function totals(items: readonly Item[], properties: readonly Property[]): Total[] {
  return properties
    .filter((p) => isMoney(p.unit))
    .map((p) => {
      const id = p.id
      let sum = 0
      for (const item of items) {
        for (const s of item.specs) {
          if (columnId({ key: s.key, unit: s.unit }) !== id) continue
          const n = parseNumber(s.value)
          if (n !== null) sum += n
        }
      }
      return { key: p.key, unit: p.unit as string, sum }
    })
}

function queryKey(key: string): string {
  const k = key.trim().toLocaleLowerCase('nb')
  return /\s/.test(k) ? `"${k}"` : k
}


function categoryOf(item: Item): string | null {
  const spec = item.specs.find((s) => columnId({ key: s.key, unit: s.unit }) === categoryColumnId)
  const value = spec === undefined ? '' : String(spec.value).trim()
  return value === '' ? null : value
}

// Narrows a gap's search to one category. A category with a space in it has
// to be quoted, the way a two-word key does. With nothing categorised at all
// there is nothing to narrow to, and the search is the bare gap.
function inCategory(category: string | null, gap: string, split: boolean): string {
  if (!split) return gap
  if (category === null) return `-has:kategori ${gap}`
  const c = category.toLocaleLowerCase('nb')
  return `${/\s/.test(c) ? `kategori="${c}"` : `kategori=${c}`} ${gap}`
}

// What is missing, category by category: where the work is, not just how much
// of it there is. A category is left out once it has nothing missing, and a kr
// column counts only against the categories it belongs to — asking a book for
// its weight is not a gap. Categories in alphabetical order, the things
// without one last.
export function gapsByCategory(items: readonly Item[], properties: readonly Property[]): Gaps[] {
  // Nothing nags about a habit that has not started: the photo counts as a
  // gap once any thing at all carries one.
  const photosInUse = items.some((i) => i.photo !== null)
  const groups = new Map<string, { label: string | null; rows: Item[] }>()
  for (const item of items) {
    const label = categoryOf(item)
    const key = label === null ? '' : label.toLocaleLowerCase('nb')
    const group = groups.get(key)
    if (group) group.rows.push(item)
    else groups.set(key, { label, rows: [item] })
  }
  const split = groups.size > 1 || [...groups.values()].some((g) => g.label !== null)
  const out: Gaps[] = []
  for (const { label, rows } of groups.values()) {
    const missing: Missing[] = []
    const noPhoto = rows.filter((i) => i.photo === null).length
    if (photosInUse && noPhoto > 0)
      missing.push({ what: 'photo', key: 'bilde', count: noPhoto, query: inCategory(label, '-has:bilde', split) })
    for (const p of properties) {
      if (!isMoney(p.unit)) continue
      if (!appliesTo(p, label === null ? [] : [label])) continue
      const n = rows.filter((i) => !i.specs.some((s) => columnId({ key: s.key, unit: s.unit }) === p.id)).length
      if (n > 0)
        missing.push({ what: 'value', key: p.key, count: n, query: inCategory(label, `-has:${queryKey(p.key)}`, split) })
    }
    if (missing.length > 0) out.push({ category: label, missing })
  }
  return out.sort((a, b) => {
    if (a.category === null) return 1
    if (b.category === null) return -1
    return collator.compare(a.category, b.category)
  })
}
