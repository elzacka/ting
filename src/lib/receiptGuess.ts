import type { Item } from '../db/schema'
import { categoryColumnId, type ChoiceDef } from './fields'
import { cellsFrom } from './grid'
import { parsePath } from './paths'

// What a receipt cannot say, read from the register instead: Kategori, the lists
// a line names (Merke, Type, Farge), where new things go and that they are in use.
// By rule, never a generative model; a field stays empty rather than guessed wrong.

const fold = (s: string) => s.toLocaleLowerCase('nb').replace(/\s+/g, ' ').trim()
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const inUse = 'i bruk'

type Named = { value: string; test: RegExp; length: number }

// A value as a word, or of four letters or more as the end of a compound: "dundyne" is a Dyne
function named(value: string): Named | null {
  const v = fold(value)
  if (v === '') return null
  const head = v.length >= 4 && !v.includes(' ') ? '\\p{L}*' : ''
  return { value, test: new RegExp(`(?<![\\p{L}\\p{N}])${head}${escape(v)}(?![\\p{L}\\p{N}])`, 'u'), length: v.length }
}

function longestIn(text: string, values: readonly Named[]): string | null {
  const t = fold(text)
  let best: Named | null = null
  for (const v of values) if (v.test.test(t) && (!best || v.length > best.length)) best = v
  return best?.value ?? null
}

// The value most of them hold, the newest thing's on a tie
type Held = { value: string; at: number }
function mostHeld(held: readonly Held[]): string | null {
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

const words = (s: string) => fold(s).match(/\p{L}{4,}/gu) ?? []
const sameWord = (a: string, b: string) => a === b || a.endsWith(b) || b.endsWith(a)

type Row = { cells: Record<string, string>; words: string[]; at: number }

// The things named most like the line, a word shared by few counting more than one
// shared by many: "hvit" in half the register says nothing
function namedAlike(name: string, rows: readonly Row[]): Row[] {
  const df = new Map<string, number>()
  for (const w of new Set(words(name))) df.set(w, rows.filter((r) => r.words.some((x) => sameWord(w, x))).length)
  let best: Row[] = []
  let top = 1
  for (const r of rows) {
    let score = 0
    for (const [w, d] of df) if (d > 0 && r.words.some((x) => sameWord(w, x))) score += Math.log((rows.length + 1) / d)
    if (score > top) {
      top = score
      best = [r]
    } else if (score === top && best.length > 0) best.push(r)
  }
  return best
}

const categoryOf = (rows: readonly Row[]) => mostHeld(rows.map((r) => ({ value: r.cells[categoryColumnId] ?? '', at: r.at })))

function lineGuess(name: string, store: string, storeId: string, lists: readonly ChoiceDef[], values: Map<string, Named[]>, rows: readonly Row[]) {
  const out: Record<string, string> = {}
  const hits: [string, string][] = []
  for (const d of lists) {
    if (d.id === categoryColumnId) continue
    const own = longestIn(name, values.get(d.id) ?? [])
    if (own) hits.push([d.id, fold(own)])
    // A store that is also the brand: IKEA sells IKEA
    const v = own ?? longestIn(store, values.get(d.id) ?? [])
    if (v) out[d.id] = v
  }
  // Named outright, else as held by things with the same Merke or Type, named alike, or from the same store
  const guessed =
    longestIn(name, values.get(categoryColumnId) ?? []) ??
    categoryOf(rows.filter((r) => hits.some(([id, v]) => fold(r.cells[id] ?? '') === v))) ??
    categoryOf(namedAlike(name, rows)) ??
    (store.trim() === '' ? null : categoryOf(rows.filter((r) => fold(r.cells[storeId] ?? '') === fold(store))))
  if (guessed) out[categoryColumnId] = guessed
  return out
}

// One value per field for every thing on the receipt: a field the lines disagree on is left
// out. A place starts at the place most things are in (the home, not the storage room), a
// list that holds "I bruk" starts there, since a receipt is scanned right after buying.
export function receiptGuess(
  names: readonly string[],
  store: string,
  storeId: string,
  lists: readonly ChoiceDef[],
  items: readonly Item[],
): Record<string, string> {
  const rows: Row[] = items.map((i) => ({ cells: cellsFrom(i), words: words(i.name), at: i.createdAt }))
  const values = new Map<string, Named[]>()
  const out: Record<string, string> = {}
  for (const d of lists) {
    if (d.type === 'path') {
      const home = mostHeld(rows.map((r) => ({ value: parsePath(r.cells[d.id] ?? '')[0] ?? '', at: r.at })))
      if (home) out[d.id] = home
      continue
    }
    const all = new Map<string, string>()
    for (const v of [...rows.map((r) => r.cells[d.id] ?? ''), ...(d.property?.options ?? [])]) {
      if (v.trim() !== '' && !all.has(fold(v))) all.set(fold(v), v.trim())
    }
    const use = all.get(inUse)
    if (use) out[d.id] = use
    values.set(d.id, [...all.values()].flatMap((v) => named(v) ?? []))
  }
  const guesses = names.filter((n) => n.trim() !== '').map((n) => lineGuess(n, store, storeId, lists, values, rows))
  for (const id of new Set(guesses.flatMap((g) => Object.keys(g)))) {
    const first = guesses[0]?.[id]
    if (first && guesses.every((g) => g[id] !== undefined && fold(g[id]) === fold(first))) out[id] = first
  }
  return out
}
