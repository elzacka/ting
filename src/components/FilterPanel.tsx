import { useEffect, useRef, useState } from 'react'
import type { Item, Property } from '../db/schema'
import { activeCount, valuesFor, withoutFilter, type Filters, type FilterValue } from '../lib/filters'
import { isDateUnit } from '../lib/dates'
import { parseNumber } from '../lib/filter'
import { columnDefs, type FieldSettings } from '../lib/fields'
import { t } from '../lib/strings'
import { Icon } from './Icons'

type Props = {
  // Every thing, for the column list
  items: Item[]
  // The things the search leaves: what the menus count
  searched: Item[]
  properties: Property[]
  fields: FieldSettings
  filters: Filters
  onChange: (next: Filters) => void
}

type Def = { id: string; label: string; unit: string | null; values: FilterValue[] }

// Short menus show everything; long text menus the top twelve, the rest on
// request, and a box to type in once opened up. Numbers and years are never
// cut: they are few and their order carries meaning. A column whose values
// are nearly all different (order numbers, prices, free text) is no facet at
// all; the search is the way into those.
const shortMenu = 12
const searchable = 30
const facetMaxUnique = 0.6

function isNumeric(values: FilterValue[], unit: string | null): boolean {
  return isDateUnit(unit) || values.every((v) => parseNumber(v.label) !== null)
}

// Text values most-used first, numbers and years in their own order
function order(values: FilterValue[], unit: string | null): FilterValue[] {
  return isNumeric(values, unit) ? values : [...values].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'nb'))
}

function isFacet(values: FilterValue[], unit: string | null): boolean {
  if (values.length === 0) return false
  if (values.length <= shortMenu || isNumeric(values, unit)) return true
  const rows = values.reduce((n, v) => n + v.count, 0)
  return values.length <= rows * facetMaxUnique
}

// One dropdown per filter, counting the rows the other filters and the search
// leave, so choosing Kategori shrinks Kat2 to what exists there. A menu with
// nothing left to offer is not shown. Native <details>: no library, works
// with the keyboard; a click outside closes whichever one is open.
export function FilterPanel({ items, searched, properties, fields, filters, onChange }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [narrow, setNarrow] = useState<Record<string, string>>({})

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
    if (d.kind === 'name') return []
    const values = order(valuesFor(withoutFilter(searched, filters, d.id), d.col), d.col.unit)
    if (!isFacet(values, d.col.unit)) return []
    return [{ id: d.id, label: d.col.key, unit: d.col.unit, values }]
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
              {(() => {
                const open = expanded[def.id] === true
                const typed = (narrow[def.id] ?? '').trim().toLocaleLowerCase('nb')
                const listed = def.values.filter((v) => chosen.includes(v.key) || v.label.toLocaleLowerCase('nb').includes(typed))
                const cut = !open && listed.length > shortMenu && !isNumeric(def.values, def.unit)
                const rows = cut ? listed.slice(0, shortMenu) : listed
                return (
                  <>
                    {open && def.values.length > searchable && (
                      <input
                        className="input filter-narrow"
                        type="search"
                        aria-label={t.filters.narrow(def.label)}
                        placeholder={t.filters.narrow(def.label)}
                        value={narrow[def.id] ?? ''}
                        onChange={(e) => setNarrow({ ...narrow, [def.id]: e.target.value })}
                      />
                    )}
                    {rows.map((v) => (
                      <label key={v.key} className="filter-option">
                        <input
                          type="checkbox"
                          checked={chosen.includes(v.key)}
                          onChange={(e) => toggle(def.id, v.key, e.target.checked)}
                        />
                        <span className="num">{v.label}</span>
                        <span className="hint num filter-count">{v.count}</span>
                      </label>
                    ))}
                    {cut && (
                      <button
                        type="button"
                        className="btn filter-clear"
                        onClick={() => setExpanded({ ...expanded, [def.id]: true })}
                      >
                        {t.filters.showAll(listed.length)}
                      </button>
                    )}
                  </>
                )
              })()}
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
        <button type="button" className="summary-link" onClick={() => onChange({})}>
          {t.filters.clearAll}
        </button>
      )}
    </div>
  )
}
