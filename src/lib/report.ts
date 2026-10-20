import type { Item } from '../db/schema'
import { splitLevel } from './filters'
import { columnId } from './grid'
import { isPathUnit, pathPrefix } from './paths'
import { naturalOrder } from './collator'

// What the printed report is made of. The table prints itself; this is the
// other shape it can take: the things one under the other, each with its
// photo and its values, under headings that add up.

export type ReportGroup = { label: string | null; items: Item[] }

// A path column can be grouped at one of its levels: the id carries which,
// the same way a filter id does.
function valueIn(item: Item, filterId: string): string | null {
  const { id, level } = splitLevel(filterId)
  const spec = item.specs.find((s) => columnId({ key: s.key, unit: s.unit }) === id)
  if (spec === undefined) return null
  if (level !== null && isPathUnit(spec.unit)) return pathPrefix(spec.value, level)
  const value = String(spec.value).trim()
  return value === '' ? null : value
}

// The things a report covers, split by one column's value in print order. Two spellings of one word
// land together under the first; things with no value come last, unnamed. Without a column there is
// one unnamed group: the report is a plain list.
export function groupItems(items: readonly Item[], id: string | null): ReportGroup[] {
  if (id === null) return items.length === 0 ? [] : [{ label: null, items: [...items] }]
  const groups = new Map<string, ReportGroup>()
  for (const item of items) {
    const label = valueIn(item, id)
    const key = label === null ? '' : label.toLocaleLowerCase('nb')
    const group = groups.get(key)
    if (group) group.items.push(item)
    else groups.set(key, { label, items: [item] })
  }
  return [...groups.values()].sort((a, b) => {
    if (a.label === null) return 1
    if (b.label === null) return -1
    return naturalOrder.compare(a.label, b.label)
  })
}
