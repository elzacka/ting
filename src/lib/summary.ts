import type { Item, Property } from '../db/schema'
import { columnId } from './grid'
import { parseNumber } from './filter'

// The line above the table: how much there is, what it is worth, and what is
// still missing. Nothing that needs a property the user may not have.

export type Total = { key: string; unit: string; sum: number }
export type Missing = { what: 'photo' | 'value'; key: string; count: number; query: string }

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
