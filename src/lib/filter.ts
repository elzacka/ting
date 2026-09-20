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
