import { useMemo } from 'react'
import type { Item, Property } from '../db/schema'
import { categoryIconFor } from '../lib/categoryIcons'
import { categoryColumnId, columnDefs, type FieldSettings } from '../lib/fields'
import { formatValue } from '../lib/format'
import { columnId } from '../lib/grid'
import { href } from '../lib/route'
import { searchItems } from '../lib/search'
import { t } from '../lib/strings'
import { useRowWindow } from '../lib/useRowWindow'
import { CategoryIcon } from './CategoryIcon'
import { Icon } from './Icons'
import { SearchField } from './SearchField'
import { useObjectUrl } from './useObjectUrl'

type Props = {
  items: Item[]
  properties: Property[]
  fields: FieldSettings
  query: string
  onQueryChange: (q: string) => void
}

// Thumbnail, name and the line under it: the same height as the CSS gives .list-row
const rowHeight = 56

// The phone's overview: a list of hits and, at the bottom where the thumb is,
// the search field and the way to add a thing. One row answers "where is
// it"; tapping it opens the thing. Columns, totals and reports are desk work.
export function ItemList({ items, properties, fields, query, onQueryChange }: Props) {
  const defs = useMemo(() => columnDefs(fields, properties, items), [fields, properties, items])
  // The line under the name: the place first, since that is what a phone is
  // asked, then the choice values
  const metaIds = useMemo(
    () => [
      ...defs.flatMap((d) => (d.kind === 'prop' && d.type === 'path' ? [d.id] : [])),
      ...defs.flatMap((d) => (d.kind === 'prop' && d.type === 'choice' ? [d.id] : [])),
    ],
    [defs],
  )
  const icons = properties.find((p) => p.id === categoryColumnId)?.icons
  const hits = useMemo(() => searchItems(items, query), [items, query])
  const { ref, window: win } = useRowWindow<HTMLUListElement>(hits.length, rowHeight)

  return (
    <div className="phone-list">
      {items.length === 0 ? (
        <p className="hint list-empty">{t.list.empty}</p>
      ) : hits.length === 0 ? (
        <p className="hint list-empty">{t.list.noMatch}</p>
      ) : (
        <ul ref={ref} className="list" style={{ paddingTop: win.topPad, paddingBottom: win.bottomPad }}>
          {hits.slice(win.start, win.end).map((item) => (
            <Row key={item.id} item={item} metaIds={metaIds} icons={icons} />
          ))}
        </ul>
      )}
      <div className="phone-bar">
        <SearchField value={query} onChange={onQueryChange} autoFocus={false} />
        <a className="btn btn-icon btn-round" href={href.add} aria-label={t.table.addRow}>
          <Icon name="add" />
        </a>
      </div>
    </div>
  )
}

function Row({
  item,
  metaIds,
  icons,
}: {
  item: Item
  metaIds: readonly string[]
  icons: Readonly<Record<string, string>> | undefined
}) {
  const url = useObjectUrl(item.photos[0] ?? null)
  const spec = (id: string) => item.specs.find((s) => columnId({ key: s.key, unit: s.unit }) === id)
  const meta = metaIds
    .flatMap((id) => {
      const s = spec(id)
      return s ? [formatValue(s)] : []
    })
    .join(' · ')
  // No photo: the category's icon says what kind of thing it is
  const category = spec(categoryColumnId)
  return (
    <li className="list-row">
      <a className="list-link" href={href.detail(item.id)}>
        {url ? (
          <img className="thumb" src={url} alt="" />
        ) : (
          <span className="thumb thumb-empty">
            {category && <CategoryIcon id={categoryIconFor(String(category.value), icons)} />}
          </span>
        )}
        <span className="list-text">
          <span className="list-name">{item.name}</span>
          {meta !== '' && <span className="list-meta">{meta}</span>}
        </span>
      </a>
    </li>
  )
}
