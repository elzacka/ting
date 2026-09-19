import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react'
import { db } from './db/db'
import type { Item, Property } from './db/schema'
import { useLiveQuery } from './db/useLiveQuery'
import { distinct } from './lib/filter'
import { href, useRoute, type Route } from './lib/route'
import { t } from './lib/strings'
import { useFolderSync } from './lib/useFolderSync'
import { useLock } from './lib/useLock'
import { fieldSettingsKey, readFieldSettings, type FieldSettings } from './lib/fields'
import type { Filters } from './lib/filters'
import { usePlainPaste } from './lib/plainPaste'
import type { Sort } from './lib/sort'
import { useColumnWidths } from './lib/columnWidths'
import { useSearchShortcut } from './lib/useSearchShortcut'
import { Icon } from './components/Icons'
import { ItemDetail } from './components/ItemDetail'
import { ItemForm } from './components/ItemForm'
import { Home } from './components/Home'
import { ItemList } from './components/ItemList'
import { RegisterTable } from './components/RegisterTable'
import { StoragePage } from './components/StoragePage'
import { UpdateButton } from './components/UpdateButton'

export function App() {
  const route = useRoute()
  const items = useLiveQuery(() => db.items.toArray(), [])
  const properties = useLiveQuery(() => db.properties.toArray(), [])
  const fields = useLiveQuery(async () => readFieldSettings((await db.settings.get(fieldSettingsKey))?.value), [])
  const folder = useFolderSync()
  usePlainPaste()
  const { locked, toggle: toggleLock } = useLock()
  // One query for both top-level views, so a filter made in one carries into the other.
  // Mirrored into ?q= so a reload or a bookmark keeps it.
  const [query, setQuery] = useState(() => new URLSearchParams(window.location.search).get('q') ?? '')
  const [searchOpen, setSearchOpen] = useState(() => query !== '')
  const [filters, setFilters] = useState<Filters>({})
  const [sort, setSort] = useState<Sort | null>(null)
  const { widths, setWidth } = useColumnWidths()
  const searchable = route.view === 'list' || route.view === 'register'
  const openSearch = useCallback((initial: string) => {
    setSearchOpen(true)
    if (initial !== '') setQuery(initial)
    else document.getElementById('search')?.focus()
  }, [])
  const closeSearch = useCallback(() => {
    setSearchOpen(false)
    setQuery('')
    setFilters({})
  }, [])
  const toggleSearch = useCallback(() => {
    if (searchOpen) closeSearch()
    else openSearch('')
  }, [searchOpen, closeSearch, openSearch])
  useSearchShortcut(searchable, openSearch, toggleSearch)
  useEffect(() => {
    const url = new URL(window.location.href)
    if (query.trim() === '') url.searchParams.delete('q')
    else url.searchParams.set('q', query)
    window.history.replaceState(null, '', url)
  }, [query])
  const dirty = useRef(false)
  const onDirtyChange = useCallback((d: boolean) => {
    dirty.current = d
  }, [])

  const isTop = route.view === 'home' || route.view === 'list' || route.view === 'register' || route.view === 'storage'

  // The table holds unsaved edits in memory; leaving it drops them.
  function guardNav(e: MouseEvent<HTMLAnchorElement>) {
    if (dirty.current && !window.confirm(t.confirm.unsaved)) e.preventDefault()
  }

  return (
    <div className="page">
      <header className="topbar">
        {isTop ? (
          <nav className="row" aria-label={t.nav.list}>
            <a className="wordmark" href={href.home} onClick={guardNav} aria-label={t.nav.home}>
              {t.appName}
            </a>
            <a
              className="tab"
              href={href.list}
              aria-current={route.view === 'list' ? 'page' : undefined}
              onClick={guardNav}
            >
              {t.nav.list}
            </a>
            <a className="tab" href={href.register} aria-current={route.view === 'register' ? 'page' : undefined}>
              {t.nav.register}
            </a>
          </nav>
        ) : (
          <a
            className="btn btn-icon"
            href={route.view === 'edit' ? href.detail(route.id) : href.list}
            aria-label={t.action.back}
          >
            <Icon name="arrowBack" />
          </a>
        )}
        {isTop && (
          <div className="row topbar-end">
            <UpdateButton />
            {searchable && (
              <button
                type="button"
                className={`btn btn-icon${query !== '' ? ' is-active' : ''}`}
                aria-label={searchOpen ? t.search.close : t.search.open}
                aria-pressed={searchOpen}
                aria-controls="search"
                onClick={toggleSearch}
              >
                <Icon name="search" />
              </button>
            )}
            {route.view === 'register' && (
              <button
                type="button"
                className={`btn btn-icon${locked ? ' is-active' : ''}`}
                aria-label={locked ? t.lock.unlock : t.lock.lock}
                aria-pressed={locked}
                onClick={toggleLock}
              >
                <Icon name={locked ? 'lock' : 'lockOpen'} />
              </button>
            )}
            <a
              className="tab tab-quiet"
              href={href.storage}
              aria-current={route.view === 'storage' ? 'page' : undefined}
              onClick={guardNav}
            >
              {t.nav.storage}
            </a>
          </div>
        )}
      </header>

      <main className="stack">
        {items === undefined || properties === undefined || fields === undefined ? (
          <p className="hint">{t.list.loading}</p>
        ) : (
          <Screen
            items={items}
            properties={properties}
            fields={fields}
            route={route}
            query={query}
            onQueryChange={setQuery}
            searchOpen={searchOpen}
            onSearchClose={closeSearch}
            filters={filters}
            onFiltersChange={setFilters}
            sort={sort}
            onSortChange={setSort}
            widths={widths}
            onWidth={setWidth}
            onDirtyChange={onDirtyChange}
            folder={folder}
            locked={locked}
          />
        )}
      </main>
    </div>
  )
}

type ScreenProps = {
  items: Item[]
  properties: Property[]
  fields: FieldSettings
  route: Route
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
  onDirtyChange: (dirty: boolean) => void
  folder: ReturnType<typeof useFolderSync>
  locked: boolean
}

function Screen({
  items,
  properties,
  fields,
  route,
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
  onDirtyChange,
  folder,
  locked,
}: ScreenProps) {
  if (route.view === 'home') return <Home />
  const search = { query, onQueryChange, searchOpen, onSearchClose }
  if (route.view === 'list') {
    return (
      <ItemList
        items={items}
        properties={properties}
        fields={fields}
        {...search}
        filters={filters}
        onFiltersChange={onFiltersChange}
        sort={sort}
        onSortChange={onSortChange}
        widths={widths}
        onWidth={onWidth}
      />
    )
  }
  if (route.view === 'register') {
    return (
      <RegisterTable
        items={items}
        properties={properties}
        fields={fields}
        {...search}
        sort={sort}
        onSortChange={onSortChange}
        widths={widths}
        onWidth={onWidth}
        onDirtyChange={onDirtyChange}
        locked={locked}
      />
    )
  }
  if (route.view === 'storage') {
    return <StoragePage items={items} properties={properties} folder={folder} locked={locked} />
  }
  const item = items.find((i) => i.id === route.id)
  if (!item) return <p className="hint">{t.detail.notFound}</p>
  if (route.view === 'edit' && !locked) {
    return <ItemForm key={item.id} item={item} fields={fields} categories={distinct(items, (i) => i.category)} />
  }
  return <ItemDetail item={item} fields={fields} locked={locked} />
}
