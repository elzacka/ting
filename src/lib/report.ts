import type { Item } from '../db/schema'
import { columnId } from './grid'

// What the printed report is made of. The table prints itself; this is the
// other shape it can take: the things one under the other, each with its
// photo and its values, under headings that add up.

export type ReportGroup = { label: string | null; items: Item[] }

const collator = new Intl.Collator('nb', { sensitivity: 'base', numeric: true })

function valueIn(item: Item, id: string): string | null {
  const spec = item.specs.find((s) => columnId({ key: s.key, unit: s.unit }) === id)
  const value = spec === undefined ? '' : String(spec.value).trim()
  return value === '' ? null : value
}

// The things a report covers, split by one column's value and in the order
// they will be printed. Values are grouped as they read, so two spellings of
// one word land together under the first of them. Things with no value in
// that column come last, under no name of their own. Without a column there
// is one group, unnamed: the report is a plain list.
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
    return collator.compare(a.label, b.label)
  })
}
