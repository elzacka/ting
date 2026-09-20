import { useEffect, useMemo, useState } from 'react'
import { flushSync } from 'react-dom'
import type { Item, Property } from '../db/schema'
import { downloadText, exportFilename, toCsv } from '../lib/export'
import { applyFilters, type Filters } from '../lib/filters'
import { formatBare, formatDate, formatNumber } from '../lib/format'
import { columnDefs, type ColumnDef, type FieldSettings } from '../lib/fields'
import { columnId, type Column } from '../lib/grid'
import { href } from '../lib/route'
import { searchItems } from '../lib/search'
import { missing, totals } from '../lib/summary'
import { sortItems, type Sort } from '../lib/sort'
import { t } from '../lib/strings'
import { FilterPanel } from './FilterPanel'
import { Icon } from './Icons'
import { SearchField } from './SearchField'
import { SortHeader } from './SortHeader'
import { Grid } from './Grid'
import { useObjectUrl } from './useObjectUrl'

type Props = {
  items: Item[]
  properties: Property[]
  fields: FieldSettings
  query: string
  onQueryChange: (q: string) => void
  searchOpen: boolean
  onSearchClose: () => void
  filters: Filters
  onFiltersChange: (f: Filters) => void
  sort: Sort | null
  onSortChange: (s: Sort | null) => void
  widths: Record<string, number>
  onWidth: (id: string, w: number | null) => void
  onAddItem: () => void
  onOpenQuery: (query: string) => void
}

function cellText(item: Item, col: Column): string {
  const id = columnId(col)
  const s = item.specs.find((x) => columnId({ key: x.key, unit: x.unit }) === id)
  return s ? formatBare(s) : ''
}

export function ItemList({
  items,
  properties,
  fields,
  query,
  onQueryChange,
  searchOpen,
  onSearchClose,
  filters,
  onFiltersChange,
  sort,
  onSortChange,
  widths,
  onWidth,
  onAddItem,
  onOpenQuery,
}: Props) {
  // Printing needs every row on the page, not the windowed ones. Cmd+P and the
  // link both go through the same state; flushSync so the rows exist before
  // the browser takes its snapshot.
  const [printing, setPrinting] = useState(false)
  useEffect(() => {
    const before = () => flushSync(() => setPrinting(true))
    const after = () => setPrinting(false)
    window.addEventListener('beforeprint', before)
    window.addEventListener('afterprint', after)
    return () => {
      window.removeEventListener('beforeprint', before)
      window.removeEventListener('afterprint', after)
    }
  }, [])

  const defs = useMemo(() => columnDefs(fields, properties, items), [fields, properties, items])
  const categoryLabel = fields.category.label ?? t.table.category
  const nameLabel = fields.name.label ?? t.table.name
  const labelOf = (def: ColumnDef) => (def.kind === 'category' ? categoryLabel : def.kind === 'name' ? nameLabel : def.col.key)
  const columns = useMemo(() => defs.flatMap((d) => (d.kind === 'prop' ? [d.col] : [])), [defs])
  const visible = useMemo(
    () => sortItems(applyFilters(searchItems(items, query), filters), columns, sort),
    [items, query, filters, columns, sort],
  )

  const sums = useMemo(() => totals(items, properties), [items, properties])
  const gaps = useMemo(() => missing(items, properties), [items, properties])

  const addButton = (
    <div>
      <button type="button" className="btn btn-primary" onClick={onAddItem}>
        <Icon name="add" size={20} />
        {t.table.addRow}
      </button>
    </div>
  )

  if (items.length === 0) {
    return (
      <div className="stack">
        <p className="hint">{t.list.empty}</p>
        {addButton}
      </div>
    )
  }

  const narrowed = visible.length !== items.length

  return (
    <div className="stack">
      {/* One line about what is on screen and the whole register; the gaps run
          their search, and the two actions take what is on screen */}
      <p className="summary">
        <span>{narrowed ? t.summary.shown(visible.length, items.length) : t.summary.things(items.length)}</span>
        {sums.map((x) => (
          <span key={x.key}>{t.summary.total(x.key, `${formatNumber(x.sum)} ${x.unit}`)}</span>
        ))}
        {gaps.map((m) => (
          <button type="button" className="summary-link" key={m.query} onClick={() => onOpenQuery(m.query)}>
            {m.what === 'photo' ? t.summary.missingPhoto(m.count) : t.summary.missingValue(m.count, m.key)}
          </button>
        ))}
        <button
          type="button"
          className="summary-link"
          onClick={() => downloadText(exportFilename('csv'), toCsv(visible, properties, fields), 'text/csv;charset=utf-8')}
        >
          {t.report.csv}
        </button>
        <button type="button" className="summary-link" onClick={() => window.print()}>
          {t.report.print}
        </button>
      </p>

      <div className="print-only">
        <h1 className="title">{t.report.docTitle}</h1>
        <p className="hint">{t.report.subtitle(formatDate(Date.now()), visible.length)}</p>
      </div>

      {addButton}

      {searchOpen && (
        <div className="search-bar">
          <SearchField
            value={query}
            onChange={onQueryChange}
            onClose={onSearchClose}
          />
          <FilterPanel
            items={items}
            properties={properties}
            fields={fields}
            filters={filters}
            onChange={onFiltersChange}
          />
        </div>
      )}

      {visible.length === 0 && (
        <div className="empty">
          <p>{query.trim() !== '' ? t.search.noMatch(query.trim()) : t.list.noMatch}</p>
          <button
            type="button"
            className="btn"
            onClick={() => {
              onQueryChange('')
              onFiltersChange({})
            }}
          >
            {t.search.showAll}
          </button>
        </div>
      )}

      {visible.length > 0 && (
        <Grid
          defs={defs}
          widths={widths}
          sort={sort}
          onWidth={onWidth}
          readOnly
          hasSelection={false}
          allRows={printing}
          label={labelOf}
          headerCheck={null}
          header={(def) => <SortHeader def={def} label={labelOf(def)} sort={sort} onSort={onSortChange} />}
          rowCount={visible.length}
          row={(i) => {
            const item = visible[i]
            if (!item) return null
            return <ReadRow key={item.id} item={item} defs={defs} />
          }}
        />
      )}


    </div>
  )
}

function ReadRow({ item, defs }: { item: Item; defs: ColumnDef[] }) {
  const url = useObjectUrl(item.photo)
  return (
    <tr>
      <td className="grid-check" />
      {defs.map((def) =>
        def.kind === 'category' ? (
          <td key={def.id}>{item.category}</td>
        ) : def.kind === 'name' ? (
          <td key={def.id}>
            <a className="grid-link" href={href.detail(item.id)}>
              {url && <img className="thumb" src={url} alt="" />}
              {item.name}
            </a>
          </td>
        ) : (
          <td key={def.id} className="tabular">
            {cellText(item, def.col)}
          </td>
        ),
      )}
    </tr>
  )
}
