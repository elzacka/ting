import type { Item, Property } from '../db/schema'
import { isDateUnit } from './dates'
import { categoryColumnId } from './fields'
import { parseNumber } from './filter'
import { columnId } from './grid'
import { isPathUnit } from './paths'

// Søketips, one operator per row with an example. The words are the same for
// everyone; the comparisons use the register's own columns and values, so
// every example is one that finds something here. A row whose column does not
// exist is left out. The parser in lib/search.ts is the source of truth.
export type Tip = readonly [example: string, meaning: string]

const wordTips: readonly Tip[] = [
  ['sovepose', 'Ord. Tåler skrivefeil'],
  ['"sovepose vinter"', 'Nøyaktig frase'],
  ['-sommer', 'Uten dette ordet'],
  ['s', 'Én bokstav: Alle navn som begynner på s'],
]

// A key or value with a space or an operator character in it goes in quotes
function term(s: string): string {
  const low = s.toLocaleLowerCase('nb')
  return /[\s<>=:"]/.test(low) ? `"${low.replace(/"/g, '')}"` : low
}

function valuesOf(items: readonly Item[], p: Property): (string | number)[] {
  const out: (string | number)[] = []
  for (const item of items) {
    for (const s of item.specs) if (columnId({ key: s.key, unit: s.unit }) === p.id) out.push(s.value)
  }
  return out
}

function mostCommon(values: readonly (string | number)[]): string | null {
  const counts = new Map<string, number>()
  for (const v of values) {
    const k = String(v).trim()
    if (k !== '') counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  let best: string | null = null
  let most = 0
  for (const [k, n] of counts) {
    if (n > most) {
      best = k
      most = n
    }
  }
  return best
}

// A piece of a value for "contains": its longest word, cut to four letters
function fragment(value: string): string {
  const word = value.split(/\s+/).reduce((a, b) => (b.length > a.length ? b : a), '')
  return word.length > 4 ? word.slice(0, 4) : word
}

// The middle value, rounded to its first digit: 1695 reads 2000
function roundMiddle(values: readonly (string | number)[]): number | null {
  const nums = values.flatMap((v) => {
    const n = parseNumber(v)
    return n === null ? [] : [n]
  })
  if (nums.length === 0) return null
  nums.sort((a, b) => a - b)
  const mid = nums[Math.floor(nums.length / 2)] ?? 0
  if (mid <= 0) return Math.round(mid)
  const step = 10 ** Math.floor(Math.log10(mid))
  return Math.round(mid / step) * step
}

export function searchTips(properties: readonly Property[], items: readonly Item[], year: number): Tip[] {
  const tips: Tip[] = [...wordTips]
  const kind = (p: Property) => p.type ?? (isDateUnit(p.unit) ? 'date' : 'text')

  const number = properties.find((p) => kind(p) === 'number' && roundMiddle(valuesOf(items, p)) !== null)
  if (number) {
    const n = roundMiddle(valuesOf(items, number))
    tips.push([`${term(number.key)}<${n}`, 'Mindre enn. Også <='], [`${term(number.key)}>${n}`, 'Større enn. Også >='])
  }

  const choice = properties.find(
    (p) => p.id !== categoryColumnId && kind(p) === 'choice' && !isPathUnit(p.unit) && mostCommon(valuesOf(items, p)) !== null,
  )
  const choiceValue = choice ? mostCommon(valuesOf(items, choice)) : null
  if (choice && choiceValue !== null) {
    tips.push(
      [`${term(choice.key)}=${term(choiceValue)}`, 'Nøyaktig lik'],
      [`${term(choice.key)}:${term(fragment(choiceValue))}`, 'Inneholder'],
    )
  }

  const category = properties.find((p) => p.id === categoryColumnId)
  const categoryValue = category ? mostCommon(valuesOf(items, category)) : null
  if (category && categoryValue !== null) {
    tips.push([`${term(category.key)}:${term(fragment(categoryValue))}`, 'Kategori som inneholder'])
  }

  const date = properties.find((p) => kind(p) === 'date')
  if (date) tips.push([`${term(date.key)}<01.01.${String(year % 100).padStart(2, '0')}`, 'Dato før'])

  tips.push(['har:bilde', 'Har minst ett bilde'])
  const any = number ?? choice ?? properties.find((p) => p.id !== categoryColumnId)
  if (any) tips.push([`-har:${term(any.key)}`, `Mangler en verdi i ${any.key}`])
  return tips
}
