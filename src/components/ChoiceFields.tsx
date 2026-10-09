import type { Item } from '../db/schema'
import { categoryColumnId, type ChoiceDef } from '../lib/fields'
import { columnId } from '../lib/grid'
import { pathsInUse, spellLike } from '../lib/paths'
import { recentValues } from '../lib/values'
import { ChoiceMenu } from './ChoiceMenu'

// Column ids are JSON; encoded they are safe as element ids
export function domId(prefix: string, id: string): string {
  return `${prefix}-${encodeURIComponent(id)}`
}

// The first thing starts with the Kategori of the newest thing, like a new row in the table
export function firstCells(items: readonly Item[]): Record<string, string> {
  const newest = items.reduce<Item | null>((a, i) => (a === null || i.createdAt > a.createdAt ? i : a), null)
  const spec = newest?.specs.find((s) => columnId({ key: s.key, unit: s.unit }) === categoryColumnId)
  return spec ? { [categoryColumnId]: String(spec.value) } : {}
}

export function ChoiceFields({
  items,
  choices,
  cells,
  prefix,
  onChange,
}: {
  items: readonly Item[]
  choices: readonly ChoiceDef[]
  cells: Record<string, string>
  prefix: string
  onChange: (id: string, value: string) => void
}) {
  function valuesFor(def: ChoiceDef): string[] {
    const value = (i: Item) => {
      const spec = i.specs.find((x) => columnId({ key: x.key, unit: x.unit }) === def.id)
      return spec ? String(spec.value) : ''
    }
    // A place offers the way in as well as the places themselves
    if (def.type === 'path') return pathsInUse(items.map(value))
    return recentValues(items, value, def.property?.options ?? [])
  }

  return choices.map((def) => {
    const values = valuesFor(def)
    return (
      <div key={def.id} className="field">
        <label htmlFor={domId(prefix, def.id)}>{def.col.key}</label>
        <ChoiceMenu
          id={domId(prefix, def.id)}
          label={def.col.key}
          values={values}
          value={cells[def.id] ?? ''}
          onChange={(v) => onChange(def.id, v)}
          // A new place is typed with a slash between the levels and listed with its levels
          tidy={def.type === 'path' ? (v) => spellLike(values, v) : undefined}
        />
      </div>
    )
  })
}
