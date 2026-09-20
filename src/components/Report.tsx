import { useMemo } from 'react'
import type { Item, Property } from '../db/schema'
import { formatBare, formatDate } from '../lib/format'
import { exportColumns } from '../lib/export'
import type { FieldSettings } from '../lib/fields'
import { columnId } from '../lib/grid'
import { isDateUnit } from '../lib/dates'
import { t } from '../lib/strings'

// Print-only rendering of the current selection. Hidden on screen via CSS.
export function Report({
  items,
  properties,
  fields,
}: {
  items: Item[]
  properties: Property[]
  fields: FieldSettings
}) {
  const defs = useMemo(() => exportColumns(items, properties, fields), [items, properties, fields])
  const today = formatDate(Date.now())

  return (
    <section className="report" aria-hidden="true">
      <h1 className="title">{t.report.docTitle}</h1>
      <p className="hint">{t.report.subtitle(today, items.length)}</p>
      <table className="report-table">
        <thead>
          <tr>
            {defs.map((d) => (
              <th scope="col" key={d.id}>
                {d.kind === 'category'
                  ? (fields.category.label ?? t.report.category)
                  : d.kind === 'name'
                    ? (fields.name.label ?? t.report.name)
                    : d.col.key}
                {d.kind === 'prop' && d.col.unit && !isDateUnit(d.col.unit) && (
                  <span className="grid-unit">{d.col.unit}</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              {defs.map((d) => {
                if (d.kind === 'category') return <td key={d.id}>{item.category}</td>
                if (d.kind === 'name') return <td key={d.id}>{item.name}</td>
                const s = item.specs.find((x) => columnId({ key: x.key, unit: x.unit }) === d.id)
                return (
                  <td key={d.id} className="num">
                    {s ? formatBare(s) : ''}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
