import { useMemo, useState } from 'react'
import type { Item, Property } from '../db/schema'
import { downloadText, exportFilename, toCsv } from '../lib/export'
import { specKeys } from '../lib/filter'
import { activeCount, applyFilters, type Filters } from '../lib/filters'
import { formatBare } from '../lib/format'
import { columnDefs, type ColumnDef, type FieldSettings } from '../lib/fields'
import { columnId, type Column } from '../lib/grid'
import { href } from '../lib/route'
import { searchItems } from '../lib/search'
import { sortItems, type Sort } from '../lib/sort'
import { t } from '../lib/strings'
import { FilterPanel } from './FilterPanel'
import { Icon } from './Icons'
import { Report } from './Report'
import { SearchField } from './SearchField'
import { checkColumnWidth, columnWidth, tableWidth } from '../lib/columnWidths'
import { ColumnResizer } from './ColumnResizer'
import { ariaSort, SortHeader } from './SortHeader'
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
}: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const keys = useMemo(() => specKeys(items), [items])
  const defs = useMemo(() => columnDefs(fields, properties, items), [fields, properties, items])
  const categoryLabel = fields.category.label ?? t.table.category
  const nameLabel = fields.name.label ?? t.table.name
  const columns = useMemo(() => defs.flatMap((d) => (d.kind === 'prop' ? [d.col] : [])), [defs])
  const visible = useMemo(
    () => sortItems(applyFilters(searchItems(items, query), filters), columns, sort),
    [items, query, filters, columns, sort],
  )

  if (items.length === 0) {
    return <p className="hint">{t.list.empty}</p>
  }

  const selectedVisible = visible.filter((i) => selected.has(i.id))
  const reportItems = selectedVisible.length > 0 ? selectedVisible : visible
  const allVisibleSelected = visible.length > 0 && visible.every((i) => selected.has(i.id))
  const hasSelection = selected.size > 0

  function toggle(id: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  }

  function toggleAll(on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev)
      for (const i of visible) {
        if (on) next.add(i.id)
        else next.delete(i.id)
      }
      return next
    })
  }

  return (
    <div className="stack">
      {searchOpen && (
        <div className="search-bar">
          <SearchField
            value={query}
            onChange={onQueryChange}
            onClose={onSearchClose}
            keys={keys}
            listTip={t.search.tipsListText}
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
        <div className="table-wrap">
          <table
            className={`grid grid-read${hasSelection ? ' has-selection' : ''}`}
            style={{ width: tableWidth(defs, widths) }}
          >
            <colgroup>
              <col style={{ width: checkColumnWidth() }} />
              {defs.map((def) => (
                <col key={def.id} style={{ width: columnWidth(def, widths) }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th scope="col" className="grid-check">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={(e) => toggleAll(e.target.checked)}
                    aria-label={t.list.selectAll}
                  />
                </th>
                {defs.map((def) => {
                  const label = def.kind === 'category' ? categoryLabel : def.kind === 'name' ? nameLabel : def.col.key
                  return (
                    <th scope="col" key={def.id} className="grid-col" aria-sort={ariaSort(def, sort)}>
                      <SortHeader def={def} label={label} sort={sort} onSort={onSortChange} />
                      <ColumnResizer id={def.id} label={label} onWidth={onWidth} />
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {visible.map((item) => (
                <ReadRow
                  key={item.id}
                  item={item}
                  defs={defs}
                  checked={selected.has(item.id)}
                  onCheck={(on) => toggle(item.id, on)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {visible.length > 0 && (
        <section className="stack-sm">
          <h2 className="section-label">{t.report.title}</h2>
          <p className="hint">{t.report.purpose}</p>
          <div className="export">
            <div className="row toolbar">
              <button
                type="button"
                className="btn"
                onClick={() =>
                  downloadText(exportFilename('csv'), toCsv(reportItems, properties, fields), 'text/csv;charset=utf-8')
                }
              >
                {t.report.csv}
              </button>
              <button type="button" className="btn" onClick={() => window.print()}>
                {t.report.print}
              </button>
            </div>
            <div className="row">
              <span className="hint" aria-live="polite">
                {selectedVisible.length > 0
                  ? t.report.scopeSelected(reportItems.length)
                  : t.report.scopeVisible(reportItems.length, query.trim() !== '' || activeCount(filters) > 0)}
              </span>
              {hasSelection && (
                <button
                  type="button"
                  className="btn btn-icon"
                  aria-label={t.list.clearSelection}
                  onClick={() => setSelected(new Set())}
                >
                  <Icon name="close" size={20} />
                </button>
              )}
            </div>
          </div>
        </section>
      )}

      <Report items={reportItems} properties={properties} fields={fields} />
    </div>
  )
}

type RowProps = { item: Item; defs: ColumnDef[]; checked: boolean; onCheck: (on: boolean) => void }

function ReadRow({ item, defs, checked, onCheck }: RowProps) {
  const url = useObjectUrl(item.photo)
  return (
    <tr>
      <td className="grid-check">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onCheck(e.target.checked)}
          aria-label={t.list.selectRow(item.name)}
        />
      </td>
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
