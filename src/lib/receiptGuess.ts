import type { Item } from '../db/schema'
import { categoryColumnId, type ChoiceDef } from './fields'
import { cellsFrom } from './grid'
import { isPlace, mostHeld } from './startValues'

// What a receipt cannot say, read from the register instead: Kategori and the lists
// a line names (Merke, Type, Farge). Where it starts otherwise is `startValues`.
// By rule, never a generative model; a field stays empty rather than guessed wrong.

const fold = (s: string) => s.toLocaleLowerCase('nb').replace(/\s+/g, ' ').trim()
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

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

// The value every earlier thing from the store holds, two at least: what Kid sold was Kid
function sameAtStore(rows: readonly Row[], id: string): string | null {
  const held = rows.map((r) => r.cells[id] ?? '').filter((v) => v.trim() !== '')
  return held.length >= 2 && held.every((v) => fold(v) === fold(held[0] ?? '')) ? (held[0] ?? null) : null
}

function lineGuess(name: string, store: string, storeId: string, lists: readonly ChoiceDef[], values: Map<string, Named[]>, rows: readonly Row[]) {
  const out: Record<string, string> = {}
  const hits: [string, string][] = []
  const fromStore = store.trim() === '' ? [] : rows.filter((r) => fold(r.cells[storeId] ?? '') === fold(store))
  for (const d of lists) {
    if (d.id === categoryColumnId || !values.has(d.id)) continue
    const own = longestIn(name, values.get(d.id) ?? [])
    if (own) hits.push([d.id, fold(own)])
    // A store that is also the brand: IKEA sells IKEA
    const v = own ?? longestIn(store, values.get(d.id) ?? []) ?? sameAtStore(fromStore, d.id)
    if (v) out[d.id] = v
  }
  // Named outright, else as held by things with the same Merke or Type, named alike, or from the same store
  const guessed =
    longestIn(name, values.get(categoryColumnId) ?? []) ??
    categoryOf(rows.filter((r) => hits.some(([id, v]) => fold(r.cells[id] ?? '') === v))) ??
    categoryOf(namedAlike(name, rows)) ??
    categoryOf(fromStore)
  if (guessed) out[categoryColumnId] = guessed
  return out
}

// One value per field for every thing on the receipt: a field the lines disagree on is left out
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
    if (isPlace(d)) continue
    const all = new Map<string, string>()
    for (const v of [...rows.map((r) => r.cells[d.id] ?? ''), ...(d.property?.options ?? [])]) {
      if (v.trim() !== '' && !all.has(fold(v))) all.set(fold(v), v.trim())
    }
    values.set(d.id, [...all.values()].flatMap((v) => named(v) ?? []))
  }
  const guesses = names.filter((n) => n.trim() !== '').map((n) => lineGuess(n, store, storeId, lists, values, rows))
  for (const id of new Set(guesses.flatMap((g) => Object.keys(g)))) {
    const first = guesses[0]?.[id]
    if (first && guesses.every((g) => g[id] !== undefined && fold(g[id]) === fold(first))) out[id] = first
  }
  return out
}
