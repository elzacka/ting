import type { Item, Property } from '../db/schema'
import { unique } from './categories'
import { columnId } from './grid'

// The alternatives of a Valgliste: the values things hold and the ones the
// list offers before any thing holds them. Endre egenskaper shows them, and
// renames, adds and removes them. Pure: db.ts only seals and writes the result.
export type OptionEdit = {
  // An alternative renamed on every thing that holds it, whichever way it is
  // spelled there. Renamed onto another alternative's name, the two become one.
  renames: readonly (readonly [from: string, to: string])[]
  // Alternatives taken away, from the list and from every thing that holds them
  removed: readonly string[]
  // New alternatives, offered before any thing holds them
  added: readonly string[]
}

// One line in the editor: `from` is null on a new one, `count` how many
// things hold it, `mixed` whether some of them spell it another way
export type OptionRow = {
  key: string
  from: string | null
  name: string
  count: number | null
  mixed: boolean
  remove: boolean
}

const fold = (s: string) => s.trim().toLocaleLowerCase('nb')
const collator = new Intl.Collator('nb', { sensitivity: 'base', numeric: true })

// Every alternative with how many things hold it, one per value however it
// was typed: spelled the way the list offers it, else the way most things
// spell it. `mixed` marks one that some things spell another way, which
// saving the list evens out.
export function optionValues(
  items: readonly Item[],
  id: string,
  offered: readonly string[] = [],
): { label: string; count: number; mixed: boolean }[] {
  const spellings = new Map<string, Map<string, number>>()
  for (const item of items) {
    for (const s of item.specs) {
      if (columnId({ key: s.key, unit: s.unit }) !== id) continue
      const value = String(s.value).trim()
      const forms = spellings.get(fold(value)) ?? new Map<string, number>()
      forms.set(value, (forms.get(value) ?? 0) + 1)
      spellings.set(fold(value), forms)
    }
  }
  const out = new Map<string, { label: string; count: number; mixed: boolean }>()
  for (const o of offered) if (!out.has(fold(o))) out.set(fold(o), { label: o.trim(), count: 0, mixed: false })
  for (const [key, forms] of spellings) {
    const common = [...forms].reduce((best, form) => (form[1] > best[1] ? form : best))[0]
    const label = out.get(key)?.label ?? common
    const count = [...forms.values()].reduce((n, c) => n + c, 0)
    out.set(key, { label, count, mixed: [...forms.keys()].some((f) => f !== label) })
  }
  return [...out.values()].sort((a, b) => collator.compare(a.label, b.label))
}

// What the lines in the editor ask for. A line left without a name keeps the
// one it had; one some things spell another way is renamed to itself, so
// they all take the spelling the list shows.
export function optionEdit(rows: readonly OptionRow[]): OptionEdit {
  const final = (r: OptionRow) => (r.name.trim() !== '' ? r.name.trim() : (r.from ?? ''))
  return {
    renames: rows.flatMap((r) =>
      r.from !== null && !r.remove && (final(r) !== r.from || r.mixed) ? [[r.from, final(r)] as const] : [],
    ),
    removed: rows.flatMap((r) => (r.from !== null && r.remove ? [r.from] : [])),
    added: rows.flatMap((r) => (r.from === null && final(r) !== '' ? [final(r)] : [])),
  }
}

export function isEmptyEdit(edit: OptionEdit): boolean {
  return edit.renames.length === 0 && edit.removed.length === 0 && edit.added.length === 0
}

export function applyOptionEdit(
  items: readonly Item[],
  property: Property,
  edit: OptionEdit,
): { items: Item[]; property: Property } {
  const gone = new Set(edit.removed.map(fold))
  // A rename to the same name still evens out the spellings of that value
  const renames = edit.renames.filter(([, to]) => to.trim() !== '')
  const renamed = (value: string) => {
    const hit = renames.find(([from]) => fold(from) === fold(value))
    return hit ? hit[1].trim() : value
  }

  const changedItems = items.flatMap((item) => {
    let touched = false
    const specs = item.specs.flatMap((s) => {
      if (columnId({ key: s.key, unit: s.unit }) !== property.id) return [s]
      const value = String(s.value)
      if (gone.has(fold(value))) {
        touched = true
        return []
      }
      const next = renamed(value)
      if (next === value) return [s]
      touched = true
      return [{ ...s, value: next }]
    })
    return touched ? [{ ...item, specs }] : []
  })

  const options = unique([
    ...(property.options ?? []).filter((o) => !gone.has(fold(o))).map(renamed),
    ...edit.added.map((a) => a.trim()),
  ]).filter((o) => o !== '')
  const { options: _old, ...rest } = property
  return { items: changedItems, property: { ...rest, ...(options.length > 0 ? { options } : {}) } }
}
