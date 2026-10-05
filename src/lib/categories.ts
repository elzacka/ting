import type { Item, Property } from '../db/schema'
import { categoryColumnId } from './fields'
import { columnId } from './grid'

// Changes made in Endre kategorier, applied to the things and the properties.
// Pure: the one transaction in db.ts only seals and writes what comes back.
export type CategoryEdit = {
  // A category renamed everywhere it is used. Renamed onto another category's
  // name, the two become one.
  renames: readonly (readonly [from: string, to: string])[]
  // The icon for each category, by its name after the renames; null is the
  // one guessed from the name
  icons: Readonly<Record<string, string | null>>
  // New categories, offered in the list before any thing has them
  added: readonly string[]
  // Categories no thing has, taken out of the list
  removed: readonly string[]
}

const fold = (s: string) => s.trim().toLocaleLowerCase('nb')

// One entry per category however it was typed, the first spelling kept
export function unique(values: readonly string[]): string[] {
  const seen = new Set<string>()
  return values.filter((v) => {
    const k = fold(v)
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

// The icon each category ends up with, by its name after the renames. Two
// rows given one name: the row that kept it wins, else the first icon chosen.
export function iconsAfter(
  rows: readonly { from: string | null; name: string; icon: string | null }[],
): Record<string, string | null> {
  const out = new Map<string, { name: string; icon: string | null; kept: boolean }>()
  for (const r of rows) {
    if (r.name === '') continue
    const kept = r.from !== null && fold(r.from) === fold(r.name)
    const prev = out.get(fold(r.name))
    if (!prev || (kept && !prev.kept) || (!prev.kept && prev.icon === null)) out.set(fold(r.name), { name: r.name, icon: r.icon, kept })
  }
  return Object.fromEntries([...out.values()].map((v) => [v.name, v.icon]))
}

function renamed(value: string, renames: CategoryEdit['renames']): string {
  const hit = renames.find(([from]) => fold(from) === fold(value))
  return hit ? hit[1].trim() : value
}

export function applyCategoryEdit(
  items: readonly Item[],
  properties: readonly Property[],
  kategori: Property,
  edit: CategoryEdit,
): { items: Item[]; properties: Property[] } {
  const renames = edit.renames.filter(([from, to]) => to.trim() !== '' && from !== to.trim())
  const removed = new Set(edit.removed.map(fold))

  const changedItems = items.flatMap((item) => {
    let touched = false
    const specs = item.specs.map((s) => {
      if (columnId({ key: s.key, unit: s.unit }) !== categoryColumnId || typeof s.value !== 'string') return s
      const next = renamed(s.value, renames)
      if (next === s.value) return s
      touched = true
      return { ...s, value: next }
    })
    return touched ? [{ ...item, specs }] : []
  })

  const changedProps = properties.flatMap((p) => {
    if (p.id === categoryColumnId || !p.categories || p.categories.length === 0) return []
    const kept = p.categories.filter((c) => !removed.has(fold(c)))
    // A column that belonged only to a removed category stays with it, not with all
    const categories = unique((kept.length > 0 ? kept : p.categories).map((c) => renamed(c, renames)))
    const same = categories.length === p.categories.length && categories.every((c, i) => c === p.categories?.[i])
    return same ? [] : [{ ...p, categories }]
  })

  const options = unique([...(kategori.options ?? []).map((o) => renamed(o, renames)), ...edit.added.map((a) => a.trim())]).filter(
    (o) => o !== '' && !removed.has(fold(o)),
  )
  const icons = Object.fromEntries(
    Object.entries(edit.icons).flatMap(([label, id]) => (id === null || label.trim() === '' ? [] : [[label.trim(), id]])),
  )
  const { icons: _oldIcons, options: _oldOptions, ...rest } = kategori
  const nextKategori: Property = {
    ...rest,
    ...(options.length > 0 ? { options } : {}),
    ...(Object.keys(icons).length > 0 ? { icons } : {}),
  }

  return { items: changedItems, properties: [nextKategori, ...changedProps] }
}
