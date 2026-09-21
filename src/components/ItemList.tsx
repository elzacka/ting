import { useMemo } from 'react'
import type { Item, Property } from '../db/schema'
import { columnDefs, type FieldSettings } from '../lib/fields'
import { columnId } from '../lib/grid'
import { href } from '../lib/route'
import { searchItems } from '../lib/search'
import { t } from '../lib/strings'
import { useRowWindow } from '../lib/useRowWindow'
import { Icon } from './Icons'
import { SearchField } from './SearchField'
import { useObjectUrl } from './useObjectUrl'

type Props = {
  items: Item[]
  properties: Property[]
  fields: FieldSettings
  query: string
  onQueryChange: (q: string) => void
  searchOpen: boolean
  onSearchClose: () => void
}

// Thumbnail, name and the Valgliste values: the same height as the CSS gives .list-row
const rowHeight = 56

// The phone's overview: a way in and a list of hits. One row answers "where
// is it"; tapping it opens the thing. Columns, totals and reports are desk work.
export function ItemList({ items, properties, fields, query, onQueryChange, searchOpen, onSearchClose }: Props) {
  const defs = useMemo(() => columnDefs(fields, properties, items), [fields, properties, items])
  const choiceIds = useMemo(
    () => defs.flatMap((d) => (d.kind === 'prop' && d.type === 'choice' ? [d.id] : [])),
    [defs],
  )
  const hits = useMemo(() => searchItems(items, query), [items, query])
  const { ref, window: win } = useRowWindow<HTMLUListElement>(hits.length, rowHeight)

  return (
    <div className="stack">
      <div className="table-card">
      <div className="overview-head">
        <a className="btn btn-icon" href={href.add} aria-label={t.table.addRow} title={t.table.addRow}>
          <Icon name="add" />
        </a>
        <p className="summary">
          <strong>
            {items.length === 0 ? t.list.empty : query.trim() === '' ? t.summary.things(items.length) : t.summary.shown(hits.length, items.length)}
          </strong>
        </p>
      </div>
      {searchOpen && (
        <div className="controls">
          <div className="search-bar">
            <SearchField value={query} onChange={onQueryChange} onClose={onSearchClose} />
          </div>
        </div>
      )}
      {items.length === 0 ? null : hits.length === 0 ? (
        <p className="hint list-empty">{t.list.noMatch}</p>
      ) : (
        <ul ref={ref} className="list" style={{ paddingTop: win.topPad, paddingBottom: win.bottomPad }}>
          {hits.slice(win.start, win.end).map((item) => (
            <Row key={item.id} item={item} choiceIds={choiceIds} />
          ))}
        </ul>
      )}
      </div>
    </div>
  )
}

function Row({ item, choiceIds }: { item: Item; choiceIds: readonly string[] }) {
  const url = useObjectUrl(item.photo)
  const meta = choiceIds
    .map((id) => item.specs.find((s) => columnId({ key: s.key, unit: s.unit }) === id))
    .flatMap((s) => (s ? [String(s.value)] : []))
    .join(' · ')
  return (
    <li className="list-row">
      <a className="list-link" href={href.detail(item.id)}>
        {url ? <img className="thumb" src={url} alt="" /> : <span className="thumb thumb-empty" />}
        <span className="list-text">
          <span className="list-name">{item.name}</span>
          {meta !== '' && <span className="list-meta">{meta}</span>}
        </span>
      </a>
    </li>
  )
}
