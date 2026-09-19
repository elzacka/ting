import { useEffect, useRef } from 'react'
import type { Item, Property } from '../db/schema'
import { activeCount, categoryFilterId, valuesFor, type Filters } from '../lib/filters'
import { columnDefs, type FieldSettings } from '../lib/fields'
import { isDateUnit } from '../lib/dates'
import { t } from '../lib/strings'
import { Icon } from './Icons'

type Props = {
  items: Item[]
  properties: Property[]
  fields: FieldSettings
  filters: Filters
  onChange: (next: Filters) => void
}

type Def = { id: string; label: string; unit: string | null; values: ReturnType<typeof valuesFor> }

// One dropdown per filter. Native <details>, so it needs no library and works
// with the keyboard; a click outside closes whichever one is open.
export function FilterPanel({ items, properties, fields, filters, onChange }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const root = ref.current
      if (!root || !(e.target instanceof Node)) return
      for (const d of root.querySelectorAll<HTMLDetailsElement>('details[open]')) {
        if (!d.contains(e.target)) d.open = false
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  const defs: Def[] = columnDefs(fields, properties, items).flatMap((d) => {
    if (d.kind === 'category') {
      return [
        {
          id: categoryFilterId,
          label: fields.category.label ?? t.table.category,
          unit: null,
          values: valuesFor(items, null),
        },
      ]
    }
    if (d.kind === 'name') return []
    return [{ id: d.id, label: d.col.key, unit: d.col.unit, values: valuesFor(items, d.col) }]
  })

  function toggle(id: string, key: string, on: boolean) {
    const cur = filters[id] ?? []
    const next = on ? [...cur, key] : cur.filter((k) => k !== key)
    onChange({ ...filters, [id]: next })
  }

  return (
    <div className="filters" ref={ref}>
      {defs.map((def) => {
        const chosen = filters[def.id] ?? []
        const summary =
          chosen.length === 0
            ? def.label
            : chosen.length === 1
              ? `${def.label}: ${def.values.find((v) => v.key === chosen[0])?.label ?? chosen[0]}`
              : `${def.label} (${chosen.length})`
        return (
          <details key={def.id} className={`filter${chosen.length > 0 ? ' is-active' : ''}`}>
            <summary className="btn">
              {summary}
              <Icon name="chevronRight" size={16} className="filter-chevron" />
            </summary>
            <div className="filter-menu" role="group" aria-label={def.label}>
              {def.values.length === 0 && <p className="hint">{t.filters.noValues}</p>}
              {def.values.map((v) => (
                <label key={v.key} className="filter-option">
                  <input
                    type="checkbox"
                    checked={chosen.includes(v.key)}
                    onChange={(e) => toggle(def.id, v.key, e.target.checked)}
                  />
                  <span className="num">
                    {v.label}
                    {def.unit && !isDateUnit(def.unit) && <span className="grid-unit">{def.unit}</span>}
                  </span>
                </label>
              ))}
              {chosen.length > 0 && (
                <button
                  type="button"
                  className="btn filter-clear"
                  onClick={() => onChange({ ...filters, [def.id]: [] })}
                >
                  {t.filters.clearOne}
                </button>
              )}
            </div>
          </details>
        )
      })}
      {activeCount(filters) > 0 && (
        <button
          type="button"
          className="btn btn-icon"
          aria-label={t.filters.clearAll}
          title={t.filters.clearAll}
          onClick={() => onChange({})}
        >
          <Icon name="close" size={20} />
        </button>
      )}
    </div>
  )
}
