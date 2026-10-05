import { useEffect, useMemo, useRef, useState } from 'react'
import { getSetting } from '../db/db'
import type { Item, Property } from '../db/schema'
import { categoryIconFor } from '../lib/categoryIcons'
import { categoryColumnId, columnDefs, type FieldSettings } from '../lib/fields'
import { formatValue } from '../lib/format'
import { columnId } from '../lib/grid'
import { handOverReceipt } from '../lib/receiptImage'
import { receiptReadingKey } from '../lib/receiptItems'
import { href, navigate } from '../lib/route'
import { searchItems } from '../lib/search'
import { t } from '../lib/strings'
import { isDemo } from '../lib/useInstall'
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
  // The folder is not being written: the gear says so, as the desk's header does
  stalled: boolean
}

// Thumbnail, name and the line under it: the same height as the CSS gives .list-row
const rowHeight = 56

// The phone's overview: the search and its hits, nothing before a search (the demo lists every
// example and has no bottom bar). Receipt, plus and Innstillinger sit at the bottom, where the
// thumb is. One row answers "where is it"; columns, totals and reports are desk work.
export function ItemList({ items, properties, fields, query, onQueryChange, stalled }: Props) {
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
  const searching = query.trim() !== ''
  const hits = useMemo(
    () => (searching ? searchItems(items, query) : isDemo ? [...items].sort((a, b) => a.name.localeCompare(b.name, 'nb')) : []),
    [items, query, searching],
  )
  const { ref, window: win } = useRowWindow<HTMLUListElement>(hits.length, rowHeight)

  // With receipt reading on, the receipt button left of plus opens the camera on that one tap,
  // and the photo goes on to the receipt screen; off, it opens that screen, which offers the
  // download. Plus stays one tap to Ny ting.
  const [receipts, setReceipts] = useState(false)
  useEffect(() => {
    void getSetting<boolean>(receiptReadingKey).then((on) => setReceipts(on === true))
  }, [])
  const receiptRef = useRef<HTMLInputElement>(null)
  function receiptTaken(input: HTMLInputElement) {
    const file = input.files?.[0]
    input.value = ''
    if (!file) return
    handOverReceipt(file)
    navigate(href.receipt)
  }

  return (
    <div className="phone-list">
      <div className="phone-search">
        <SearchField value={query} onChange={onQueryChange} autoFocus={false} />
      </div>
      {items.length === 0 ? (
        <p className="hint list-empty">{t.list.empty}</p>
      ) : !searching && !isDemo ? null : hits.length === 0 ? (
        <p className="hint list-empty">{t.list.noMatch}</p>
      ) : (
        <ul ref={ref} className="list" style={{ paddingTop: win.topPad, paddingBottom: win.bottomPad }}>
          {hits.slice(win.start, win.end).map((item) => (
            <Row key={item.id} item={item} metaIds={metaIds} icons={icons} />
          ))}
        </ul>
      )}
      {!isDemo && (
        <nav className="phone-bar" aria-label={t.nav.list}>
          {receipts ? (
            <>
              <input
                ref={receiptRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="visually-hidden"
                tabIndex={-1}
                onChange={(e) => receiptTaken(e.target)}
              />
              <button
                type="button"
                className="btn btn-icon btn-round"
                aria-label={t.receipt.fromReceipt}
                onClick={() => receiptRef.current?.click()}
              >
                <Icon name="receiptLong" />
              </button>
            </>
          ) : (
            <a className="btn btn-icon btn-round" href={href.receipt} aria-label={t.receipt.fromReceipt}>
              <Icon name="receiptLong" />
            </a>
          )}
          <a className="btn btn-icon btn-round" href={href.add} aria-label={t.table.addRow}>
            <Icon name="add" />
          </a>
          <a
            className={`btn btn-icon btn-round${stalled ? ' is-stalled' : ''}`}
            href={href.settings}
            aria-label={stalled ? t.nav.settingsStalled : t.nav.settings}
          >
            <Icon name="settings" />
          </a>
        </nav>
      )}
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
