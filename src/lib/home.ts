import type { Item, Property } from '../db/schema'
import { columnDefs, type FieldSettings } from './fields'
import { categoryFilterId, valueKey } from './filters'
import { columnId } from './grid'
import { parseNumber } from './filter'
import { t } from './strings'

// What the home page can say from the data alone: how much there is, what it
// is worth, how it splits, and what is still missing. Nothing that needs a
// property the user may not have.

export type Total = { key: string; unit: string; sum: number }
export type FacetValue = { key: string; label: string; count: number }
export type Facet = { id: string; label: string; values: FacetValue[]; more: number }
export type Missing = { what: 'photo' | 'value'; key: string; count: number; query: string }

const maxFacets = 3
const maxValues = 6

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

// Kategori when it has more than one value, then the Valgliste properties in
// column order, at most three facets, at most six values each, most first.
export function facets(items: readonly Item[], properties: readonly Property[], fields: FieldSettings): Facet[] {
  const out: Facet[] = []
  for (const def of columnDefs(fields, properties, items)) {
    if (out.length === maxFacets) break
    if (def.kind === 'name') continue
    if (def.kind === 'prop' && def.type !== 'choice') continue
    const id = def.kind === 'category' ? categoryFilterId : def.id
    const label = def.kind === 'category' ? (fields.category.label ?? t.table.category) : def.col.key
    const counts = new Map<string, FacetValue>()
    for (const item of items) {
      const raw =
        def.kind === 'category'
          ? [item.category]
          : item.specs.filter((s) => columnId({ key: s.key, unit: s.unit }) === def.id).map((s) => String(s.value))
      for (const v of raw) {
        const text = v.trim()
        if (text === '') continue
        const k = valueKey(text)
        const cur = counts.get(k)
        if (cur) cur.count += 1
        else counts.set(k, { key: k, label: text, count: 1 })
      }
    }
    const values = [...counts.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'nb'))
    if (def.kind === 'category' && values.length < 2) continue
    if (values.length === 0) continue
    out.push({ id, label, values: values.slice(0, maxValues), more: Math.max(0, values.length - maxValues) })
  }
  return out
}

function queryKey(key: string): string {
  const k = key.trim().toLocaleLowerCase('nb')
  return /\s/.test(k) ? `"${k}"` : k
}

// Things without a photo, and without a value in each kr property. Each row
// is a search the overview can run.
export function missing(items: readonly Item[], properties: readonly Property[]): Missing[] {
  const out: Missing[] = []
  const noPhoto = items.filter((i) => i.photo === null).length
  if (noPhoto > 0) out.push({ what: 'photo', key: 'bilde', count: noPhoto, query: '-has:bilde' })
  for (const p of properties) {
    if (!isMoney(p.unit)) continue
    const n = items.filter((i) => !i.specs.some((s) => columnId({ key: s.key, unit: s.unit }) === p.id)).length
    if (n > 0) out.push({ what: 'value', key: p.key, count: n, query: `-has:${queryKey(p.key)}` })
  }
  return out
}
