import type { Item } from '../db/schema'
import { categoryColumnId, type ColumnDef } from './fields'
import { cellsFrom, columnId } from './grid'
import { parsePath } from './paths'

// Where a new thing starts, wherever it is added (elzacka, 2026-10-11): a list holding
// «I bruk» there, a place at Leilighet, else at the place most things are in.

const fold = (s: string) => s.toLocaleLowerCase('nb').replace(/\s+/g, ' ').trim()
const inUse = 'i bruk'
const home = 'leilighet'
// A place kept as a plain list rather than with levels
const placeName = /^(?:plassering|sted|lokasjon)$/

export type Held = { value: string; at: number }

// The value most of them hold, the newest thing's on a tie
export function mostHeld(held: readonly Held[]): string | null {
  const count = new Map<string, Held & { n: number }>()
  for (const h of held) {
    const v = h.value.trim()
    if (v === '') continue
    const c = count.get(fold(v)) ?? { value: v, n: 0, at: 0 }
    count.set(fold(v), { value: c.value, n: c.n + 1, at: Math.max(c.at, h.at) })
  }
  let best: (Held & { n: number }) | null = null
  for (const c of count.values()) if (!best || c.n > best.n || (c.n === best.n && c.at > best.at)) best = c
  return best?.value ?? null
}

export function isPlace(d: Extract<ColumnDef, { kind: 'prop' }>): boolean {
  return d.type === 'path' || (d.type === 'choice' && placeName.test(fold(d.col.key)))
}

// Every list and place column's start; the caller keeps those the thing's category uses
export function startValues(defs: readonly ColumnDef[], items: readonly Item[]): Record<string, string> {
  const cells = items.map(cellsFrom)
  const out: Record<string, string> = {}
  for (const d of defs) {
    if (d.kind !== 'prop' || d.id === categoryColumnId || (d.type !== 'choice' && d.type !== 'path')) continue
    const held = cells.map((c, i) => ({ value: c[d.id] ?? '', at: items[i]?.createdAt ?? 0 }))
    if (isPlace(d)) {
      // A path starts at its top level; a list only at a value it holds
      const tops = d.type === 'path' ? held.map((h) => ({ ...h, value: parsePath(h.value)[0] ?? '' })) : held
      const value = tops.find((h) => fold(h.value) === home)?.value ?? mostHeld(tops)
      if (value) out[d.id] = value
      continue
    }
    const use = [...held.map((h) => h.value), ...(d.property?.options ?? [])].find((v) => fold(v) === inUse)
    if (use) out[d.id] = use.trim()
  }
  return out
}

// The first thing starts with the Kategori of the newest thing, like a new row in the table
export function firstCells(items: readonly Item[]): Record<string, string> {
  const newest = items.reduce<Item | null>((a, i) => (a === null || i.createdAt > a.createdAt ? i : a), null)
  const spec = newest?.specs.find((s) => columnId({ key: s.key, unit: s.unit }) === categoryColumnId)
  return spec ? { [categoryColumnId]: String(spec.value) } : {}
}
