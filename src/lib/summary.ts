import type { Item, Property } from '../db/schema'
import { columnId } from './grid'
import { parseNumber } from './values'

// The line above the table: how much there is and what it is worth. Nothing
// that needs a property the user may not have.

export type Total = { key: string; unit: string; sum: number }

function isMoney(unit: string | null): unit is string {
  return unit !== null && unit.trim().toLocaleLowerCase('nb') === 'kr'
}

// One sum per number property in kr that any of the things has a value in:
// a total of nothing is not 0 kr, it is no total.
export function totals(items: readonly Item[], properties: readonly Property[]): Total[] {
  return properties
    .filter((p) => isMoney(p.unit))
    .flatMap((p) => {
      const id = p.id
      let sum = 0
      let any = false
      for (const item of items) {
        for (const s of item.specs) {
          if (columnId({ key: s.key, unit: s.unit }) !== id) continue
          const n = parseNumber(s.value)
          if (n === null) continue
          sum += n
          any = true
        }
      }
      return any ? [{ key: p.key, unit: p.unit as string, sum }] : []
    })
}
