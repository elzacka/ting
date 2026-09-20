import type { Item } from '../db/schema'
import { isDateUnit, parseDateInput } from './dates'
import { parseNumber } from './filter'

// Query syntax, kept deliberately small:
//   sovepose            word, typo-tolerant
//   "sovepose vinter"   exact phrase
//   -sommer             exclude
//   komfort<0           spec compare: < > <= >= = :   (key is a prefix, ":" is contains)
//   has:bilde has:vekt (any property key prefix, so has:notat too)
//   kategori:tur         category contains (or = for exact)
//   kjøpsdato<01.01.26   date columns (unit "dato") compare as dates
//   "r-verdi">=4        quote a key that contains an operator character

export type Op = '<' | '>' | '<=' | '>=' | '=' | ':'

export type Term =
  | { type: 'word'; text: string; negate: boolean }
  | { type: 'phrase'; text: string; negate: boolean }
  | { type: 'spec'; key: string; op: Op; value: string; negate: boolean }
  | { type: 'has'; what: string; negate: boolean }

const tokenRe = /(-?)("(?:[^"]*)"|[^\s<>=:"]+)(?:(<=|>=|<|>|=|:)("(?:[^"]*)"|\S*))?|(-?)(\S+)/g

function unquote(s: string): string {
  return s.startsWith('"') && s.endsWith('"') && s.length >= 2 ? s.slice(1, -1) : s
}

// Lowercase and fold æ ø å plus other accents, so "var" finds "vår" and
// "sovepose" typed on a phone without the right keys still matches.
export function norm(s: string): string {
  return s
    .toLocaleLowerCase('nb')
    .trim()
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'o')
    .replace(/å/g, 'a')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

export function parseQuery(q: string): Term[] {
  const terms: Term[] = []
  for (const m of q.matchAll(tokenRe)) {
    const negate = (m[1] ?? m[5] ?? '') === '-'
    if (m[6] !== undefined) {
      const text = norm(m[6])
      if (text !== '') terms.push({ type: 'word', text, negate })
      continue
    }
    const head = m[2] ?? ''
    const op = m[3] as Op | undefined
    const rawValue = m[4] ?? ''
    if (op === undefined) {
      const text = norm(unquote(head))
      if (text === '') continue
      terms.push(head.startsWith('"') ? { type: 'phrase', text, negate } : { type: 'word', text, negate })
      continue
    }
    const key = norm(unquote(head))
    const value = norm(unquote(rawValue))
    if (key === '') continue
    if (key === 'has' && op === ':') {
      if (value !== '') terms.push({ type: 'has', what: value, negate })
      continue
    }
    if (value === '') {
      // "komfort<" while still typing: treat the key as a plain word.
      terms.push({ type: 'word', text: key, negate })
      continue
    }
    terms.push({ type: 'spec', key, op, value, negate })
  }
  return terms
}

// Damerau-Levenshtein with early exit once the distance cannot stay within max.
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1
  const prev2: number[] = []
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    let rowMin = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      let v = Math.min((prev[j] ?? 0) + 1, (cur[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, (prev2[j - 2] ?? 0) + 1)
      }
      cur[j] = v
      if (v < rowMin) rowMin = v
    }
    if (rowMin > max) return max + 1
    prev2.splice(0, prev2.length, ...prev)
    prev = cur
  }
  return prev[b.length] ?? max + 1
}

function tolerance(word: string): number {
  if (word.length < 4) return 0
  return word.length >= 8 ? 2 : 1
}

type Index = { name: string; text: string; tokens: string[] }

function indexOf(item: Item): Index {
  const parts = [item.name, item.category, ...item.specs.flatMap((s) => [s.key, String(s.value), s.unit ?? ''])]
  const text = norm(parts.join(' '))
  const tokens = text.split(/[\s,.;:()/]+/).filter(Boolean)
  return { name: norm(item.name), text, tokens }
}

// 4 = whole name, 3 = start of name, 2 = substring anywhere, 1 = fuzzy, 0 = miss.
export type Score = 0 | 1 | 2 | 3 | 4

function wordScore(word: string, idx: Index): Score {
  if (idx.name === word) return 4
  if (idx.name.startsWith(word)) return 3
  if (idx.text.includes(word)) return 2
  const max = tolerance(word)
  if (max === 0) return 0
  return idx.tokens.some((tok) => editDistance(word, tok, max) <= max) ? 1 : 0
}

function specHit(item: Item, key: string, op: Op, value: string): boolean {
  // "kategori:tur" and "kat=turutstyr" address the category field, not a spec.
  if ('kategori'.startsWith(key) && key.length >= 3) {
    const cat = norm(item.category)
    return op === '=' ? cat === value : op === ':' ? cat.includes(value) : false
  }
  const wanted = parseNumber(value)
  return item.specs.some((s) => {
    if (!norm(s.key).startsWith(key)) return false
    if (isDateUnit(s.unit)) {
      const want = parseDateInput(value)
      const have = parseDateInput(s.value)
      if (want === null || have === null) return false
      switch (op) {
        case '<':
          return have < want
        case '>':
          return have > want
        case '<=':
          return have <= want
        case '>=':
          return have >= want
        default:
          return have === want
      }
    }
    const actual = parseNumber(s.value)
    if (wanted !== null && actual !== null) {
      switch (op) {
        case '<':
          return actual < wanted
        case '>':
          return actual > wanted
        case '<=':
          return actual <= wanted
        case '>=':
          return actual >= wanted
        default:
          return actual === wanted
      }
    }
    const text = norm(String(s.value))
    if (op === ':') return text.includes(value)
    if (op === '=') return text === value
    return false
  })
}

function hasHit(item: Item, what: string): boolean {
  if (what === 'bilde' || what === 'foto') return item.photo !== null
  return item.specs.some((s) => norm(s.key).startsWith(what))
}

// Score of an item against all terms: 0 if any positive term misses or any
// negated term hits, otherwise the weakest positive hit (so fuzzy-only ranks last).
export function scoreItem(item: Item, terms: readonly Term[]): Score {
  if (terms.length === 0) return 2
  const idx = indexOf(item)
  let weakest: Score = 4
  for (const term of terms) {
    let s: Score
    switch (term.type) {
      case 'word':
        s = wordScore(term.text, idx)
        break
      case 'phrase':
        s = idx.name === term.text ? 4 : idx.name.startsWith(term.text) ? 3 : idx.text.includes(term.text) ? 2 : 0
        break
      case 'spec':
        s = specHit(item, term.key, term.op, term.value) ? 2 : 0
        break
      case 'has':
        s = hasHit(item, term.what) ? 2 : 0
        break
    }
    if (term.negate) {
      if (s > 0) return 0
      continue
    }
    if (s === 0) return 0
    if (s < weakest) weakest = s
  }
  return weakest
}

const collator = new Intl.Collator('nb', { sensitivity: 'base' })

export function searchItems(items: readonly Item[], query: string): Item[] {
  const trimmed = query.trim()
  // One letter: browse names starting with it, no fuzzing, no operators.
  if (trimmed.length === 1) {
    const letter = norm(trimmed)
    return items.filter((i) => norm(i.name).startsWith(letter)).sort((a, b) => collator.compare(a.name, b.name))
  }
  const terms = parseQuery(trimmed)
  return items
    .map((item) => ({ item, score: scoreItem(item, terms) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || collator.compare(a.item.name, b.item.name))
    .map((r) => r.item)
}
