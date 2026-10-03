import type { Item } from '../db/schema'
import { categoryColumnId, type ChoiceDef } from '../lib/fields'
import { columnId } from '../lib/grid'
import { pathsInUse } from '../lib/paths'
import { recentValues } from '../lib/values'
import { ValuePicker } from './ValuePicker'

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

  return choices.map((def) => (
    <div key={def.id} className="field">
      <label htmlFor={domId(prefix, def.id)}>{def.col.key}</label>
      <ValuePicker
        id={domId(prefix, def.id)}
        label={def.col.key}
        kind={def.type === 'path' ? 'path' : 'choice'}
        values={valuesFor(def)}
        value={cells[def.id] ?? ''}
        onChange={(v) => onChange(def.id, v)}
        enterKeyHint="next"
      />
    </div>
  ))
}
