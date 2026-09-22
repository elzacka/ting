import type { Item, Property } from '../db/schema'
import { formatNumber, formatValue } from '../lib/format'
import { columnId } from '../lib/grid'
import type { ColumnDef } from '../lib/fields'
import type { ReportGroup } from '../lib/report'
import { totals } from '../lib/summary'
import { t } from '../lib/strings'
import { useObjectUrl } from './useObjectUrl'

type Props = {
  groups: ReportGroup[]
  // The columns chosen for the paper, in table order. Navn is the heading of
  // each block, so only the property columns are listed under it.
  columns: Extract<ColumnDef, { kind: 'prop' }>[]
  // The chosen columns' properties: what the sums are taken over, so a column
  // left off the paper is left out of the arithmetic too.
  properties: Property[]
  photos: boolean
  // The column the groups are named after: its id keeps it out of the blocks,
  // where it would repeat the heading on every line, and its label titles the
  // last group, the things that have no value in it.
  groupId: string | null
  groupKey: string | null
}

function Sums({ items, properties }: { items: readonly Item[]; properties: Property[] }) {
  const sums = totals(items, properties)
  if (sums.length === 0) return null
  return (
    <p className="report-sum">
      {sums.map((s) => (
        <span key={s.key}>{t.report.sum(s.key, `${formatNumber(s.sum)} ${s.unit}`)}</span>
      ))}
    </p>
  )
}

function Photo({ item }: { item: Item }) {
  const url = useObjectUrl(item.photos[0] ?? null)
  if (!url) return <div className="report-photo is-empty" aria-hidden="true" />
  return <img className="report-photo" src={url} alt={t.detail.photoAlt(item.name)} />
}

function Block({ item, columns, photos }: { item: Item; columns: Props['columns']; photos: boolean }) {
  const specs = new Map(item.specs.map((s) => [columnId({ key: s.key, unit: s.unit }), s]))
  const rows = columns.flatMap((def) => {
    const spec = specs.get(def.id)
    return spec === undefined || String(spec.value).trim() === '' ? [] : [{ def, spec }]
  })
  return (
    <article className="report-item">
      {photos && <Photo item={item} />}
      <div className="report-body">
        <h3 className="report-name">{item.name}</h3>
        {rows.length > 0 && (
          <dl className="report-specs">
            {rows.map(({ def, spec }) => (
              <div key={def.id}>
                <dt>{def.col.key}</dt>
                <dd>{formatValue(spec)}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </article>
  )
}

// The other shape the report can take: the things one under the other, each
// with its values and, if asked for, its photo. Only on paper — the screen
// has the table. A group heading carries what the things under it add up to,
// and the last line carries the lot.
export function PrintReport({ groups, columns, properties, photos, groupId, groupKey }: Props) {
  const everything = groups.flatMap((g) => g.items)
  // The heading already says it; saying it again on every line is noise. A
  // place grouped at one of its levels is the exception and keeps its column:
  // the heading names the room, the line says where in it (the level is in
  // groupId, so a place column's own id never matches and it stays).
  const shown = columns.filter((d) => d.id !== groupId)
  return (
    <div className="print-report">
      {groups.map((group) => (
        <section className="report-group" key={group.label ?? ''}>
          {groupKey !== null && (
            <h2 className="report-heading">{group.label ?? t.report.groupRest(groupKey)}</h2>
          )}
          {group.items.map((item) => (
            <Block key={item.id} item={item} columns={shown} photos={photos} />
          ))}
          {groupKey !== null && <Sums items={group.items} properties={properties} />}
        </section>
      ))}
      {/* What the whole report comes to, grouped or not */}
      {totals(everything, properties).length > 0 && (
        <div className="report-total">
          <strong>{t.report.grandTotal}</strong>
          <Sums items={everything} properties={properties} />
        </div>
      )}
    </div>
  )
}
