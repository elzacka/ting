import type { Item } from '../db/schema'

const collator = new Intl.Collator('nb', { sensitivity: 'base' })

// Accepts "-5", "−5", "5,5" and "5.5". Returns null for non-numeric text.
export function parseNumber(raw: string | number): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null
  const cleaned = raw.trim().replace('−', '-').replace(',', '.').replace(/\s/g, '')
  if (cleaned === '' || !/^-?\d+(\.\d+)?$/.test(cleaned)) return null
  return Number(cleaned)
}

// Distinct values of a text field, first spelling wins, sorted.
export function distinct(items: readonly Item[], pick: (item: Item) => string): string[] {
  const seen = new Map<string, string>()
  for (const item of items) {
    const v = pick(item)
    const k = v.toLocaleLowerCase('nb')
    if (v.trim() !== '' && !seen.has(k)) seen.set(k, v)
  }
  return [...seen.values()].sort(collator.compare)
}

// Every value of a text field, the one used last first: on a phone the next
// thing usually goes where the last one went. Values the field offers that
// no thing holds yet come after, in their own order.
export function recentValues(items: readonly Item[], pick: (item: Item) => string, options: readonly string[] = []): string[] {
  const latest = new Map<string, { value: string; at: number }>()
  for (const item of items) {
    const v = pick(item).trim()
    if (v === '') continue
    const k = v.toLocaleLowerCase('nb')
    const at = Math.max(item.createdAt, item.updatedAt)
    const cur = latest.get(k)
    if (!cur || at > cur.at) latest.set(k, { value: cur?.value ?? v, at })
  }
  const used = [...latest.values()].sort((a, b) => b.at - a.at).map((e) => e.value)
  const rest = options.filter((o) => o.trim() !== '' && !latest.has(o.trim().toLocaleLowerCase('nb')))
  return [...used, ...rest]
}

// What to offer under a field as it is typed: the whole list while it is
// empty or already holds one of the values, else the values containing it.
export function suggest(values: readonly string[], typed: string, limit: number): string[] {
  const q = typed.trim().toLocaleLowerCase('nb')
  if (q === '' || values.some((v) => v.toLocaleLowerCase('nb') === q)) return values.slice(0, limit)
  return values.filter((v) => v.toLocaleLowerCase('nb').includes(q)).slice(0, limit)
}
