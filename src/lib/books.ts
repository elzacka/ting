import { classify, digitsOf } from './barcode'
import type { ChoiceDef, ColumnDef } from './fields'
import { appliesTo } from './fields'

// What a catalogue says about one edition, in the register's spelling:
// authors as "Surname, Given", the year as four digits, the language by its Norwegian name
export type Book = { title: string; authors: string[]; year: string | null; language: string | null }

// The thirteen digits of an ISBN, from an ISBN-13 or an ISBN-10 (older books
// print only the ten); null for anything else. The catalogues match on thirteen.
export function isbn13Of(code: string): string | null {
  const d = digitsOf(code).toUpperCase()
  if (classify(d) === 'isbn') return d
  // Ten digits starting 978 or 979 are an ISBN-13 still being typed, not an ISBN-10
  if (!/^\d{9}[\dX]$/.test(d) || /^97[89]/.test(d)) return null
  const sum = [...d].reduce((s, ch, i) => s + (ch === 'X' ? 10 : Number(ch)) * (10 - i), 0)
  if (sum % 11 !== 0) return null
  const body = `978${d.slice(0, 9)}`
  const check = [...body].reduce((s, ch, i) => s + Number(ch) * (i % 2 === 0 ? 1 : 3), 0)
  return `${body}${(10 - (check % 10)) % 10}`
}

// "Given Surname" turned round; a name that already has its comma stays as it is
export function surnameFirst(name: string): string {
  const n = name.trim().replace(/\s+/g, ' ')
  if (n.includes(',')) return n
  const at = n.lastIndexOf(' ')
  return at < 0 ? n : `${n.slice(at + 1)}, ${n.slice(0, at)}`
}

// The first year in a catalogue's date: "2003", "March 2003", "[cop. 1998]"
export function yearOf(date: string | undefined): string | null {
  return /\b(1[4-9]\d\d|20\d\d)\b/.exec(date ?? '')?.[1] ?? null
}

// Library catalogues use MARC codes; where one differs from ISO 639-2/T, the T code
const marcToIso: Record<string, string> = {
  alb: 'sqi', arm: 'hye', baq: 'eus', bur: 'mya', chi: 'zho', cze: 'ces', dut: 'nld', fre: 'fra', geo: 'kat',
  ger: 'deu', gre: 'ell', ice: 'isl', mac: 'mkd', mao: 'mri', may: 'msa', per: 'fas', rum: 'ron', slo: 'slk',
  tib: 'bod', wel: 'cym',
}
const languageNames = new Intl.DisplayNames(['nb'], { type: 'language', fallback: 'none' })

// "nob" or "eng" as "Norsk bokmål" or "Engelsk"; null for a code no one can name
export function languageName(code: string | undefined): string | null {
  const c = code?.trim().toLowerCase() ?? ''
  if (!/^[a-z]{2,3}$/.test(c) || c === 'zxx') return null
  try {
    const name = languageNames.of(marcToIso[c] ?? c)
    return name ? name.charAt(0).toLocaleUpperCase('nb') + name.slice(1) : null
  } catch {
    return null
  }
}

export type BookColumns = { author?: ChoiceDef; year?: ChoiceDef; language?: ChoiceDef }

// The register's own columns a book fills, found by name, in the category in view
const bookKeys: Record<keyof BookColumns, string[]> = {
  author: ['forfatter', 'forfattere'],
  year: ['utgitt', 'utgivelsesår'],
  language: ['språk'],
}
export function bookColumns(defs: readonly ColumnDef[], category: string): BookColumns {
  const found: BookColumns = {}
  for (const [field, keys] of Object.entries(bookKeys) as [keyof BookColumns, string[]][]) {
    const def = defs.find(
      (d): d is ChoiceDef =>
        d.kind === 'prop' && keys.includes(d.col.key.trim().toLocaleLowerCase('nb')) && appliesTo(d.property, [category]),
    )
    if (def) found[field] = def
  }
  return found
}

// The cells a book fills. A Valgliste takes its own spelling of a value it
// already has, and "Norsk" stands for "Norsk bokmål" when that is the list's word.
export function bookCells(book: Book, columns: BookColumns): Record<string, string> {
  const cells: Record<string, string> = {}
  const put = (def: ChoiceDef | undefined, value: string | null) => {
    if (!def || value === null || value === '') return
    cells[def.id] = def.type === 'choice' ? ownSpelling(def.property?.options ?? [], value) : value
  }
  put(columns.author, book.authors.length > 0 ? book.authors.join('; ') : null)
  // A year alone is no date: a Dato column is left for the user
  if (columns.year?.type !== 'date') put(columns.year, book.year)
  put(columns.language, book.language)
  return cells
}

function ownSpelling(options: readonly string[], value: string): string {
  const fold = (s: string) => s.trim().toLocaleLowerCase('nb')
  return (
    options.find((o) => fold(o) === fold(value)) ??
    options.find((o) => fold(value).startsWith(`${fold(o)} `)) ??
    value
  )
}
