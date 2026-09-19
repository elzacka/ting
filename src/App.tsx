import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react'
import { db, readFieldSettings, readItems, readProperties, readVault, sealPlaintextRows, writeVault } from './db/db'
import type { Item, Property } from './db/schema'
import { useSealedQuery } from './db/useSealedQuery'
import { distinct } from './lib/filter'
import { href, useRoute, type Route } from './lib/route'
import { t } from './lib/strings'
import { useFolderSync } from './lib/useFolderSync'
import { initVault, lock, setupVault, unlock, useVault } from './lib/vault'
import type { FieldSettings } from './lib/fields'
import type { Filters } from './lib/filters'
import { usePlainPaste } from './lib/plainPaste'
import type { Sort } from './lib/sort'
import { useColumnWidths } from './lib/columnWidths'
import { useSearchShortcut } from './lib/useSearchShortcut'
import { useAutoLock } from './lib/useAutoLock'
import { readEditing, writeEditing } from './lib/editing'
import { Icon } from './components/Icons'
import { ItemDetail } from './components/ItemDetail'
import { ItemForm } from './components/ItemForm'
import { Home } from './components/Home'
import { ItemList } from './components/ItemList'
import { LockScreen } from './components/LockScreen'
import { RegisterTable } from './components/RegisterTable'
import { StoragePage } from './components/StoragePage'
import { UpdateButton } from './components/UpdateButton'
import { ErrorBoundary } from './components/ErrorBoundary'

export function App() {
  const route = useRoute()
  const vault = useVault()
  const unlocked = vault.status === 'open'
  useEffect(() => {
    void readVault().then(initVault)
  }, [])
  const items = useSealedQuery(() => db.items.toArray(), readItems, unlocked)
  const properties = useSealedQuery(() => db.properties.toArray(), readProperties, unlocked)
  const fields = useSealedQuery(() => db.settings.toArray(), readFieldSettings, unlocked)
  const folder = useFolderSync()
  usePlainPaste()
  useAutoLock(unlocked)

  async function onSetup(passphrase: string) {
    const v = await setupVault(passphrase)
    await writeVault(v)
    await sealPlaintextRows()
  }

  async function onUnlock(passphrase: string) {
    const ok = await unlock(passphrase)
    if (ok) await sealPlaintextRows()
    return ok
  }
  // One query for both top-level views, so a filter made in one carries into the other.
  // Mirrored into ?q= so a reload or a bookmark keeps it.
  const [query, setQuery] = useState(() => new URLSearchParams(window.location.search).get('q') ?? '')
  const [searchOpen, setSearchOpen] = useState(() => query !== '')
  const [filters, setFilters] = useState<Filters>({})
  const [sort, setSort] = useState<Sort | null>(null)
  const { widths, setWidth } = useColumnWidths()
  const [editing, setEditing] = useState(readEditing)
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
  useSearchShortcut(searchable && unlocked, openSearch, toggleSearch)
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
  function toggleEditing() {
    if (editing && dirty.current && !window.confirm(t.confirm.unsaved)) return
    writeEditing(!editing)
    setEditing(!editing)
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
            {unlocked && editing && (
              <a className="tab" href={href.register} aria-current={route.view === 'register' ? 'page' : undefined}>
                {t.nav.register}
              </a>
            )}
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
            {searchable && unlocked && (
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
            {unlocked && (
              <button
                type="button"
                role="switch"
                aria-checked={editing}
                className={`btn btn-quiet${editing ? ' is-active' : ''}`}
                onClick={toggleEditing}
              >
                <Icon name={editing ? 'edit' : 'editOff'} size={20} />
                {t.editing.label}
              </button>
            )}
            {unlocked && (
              <button type="button" className="btn btn-quiet" onClick={() => lock()}>
                <Icon name="lock" size={20} />
                {t.lock.lock}
              </button>
            )}
            {unlocked && (
              <a
                className="tab tab-quiet"
                href={href.storage}
                aria-current={route.view === 'storage' ? 'page' : undefined}
                onClick={guardNav}
              >
                {t.nav.storage}
              </a>
            )}
          </div>
        )}
      </header>

      <main className="stack">
        <ErrorBoundary>
          {vault.status === 'loading' ? (
            <p className="hint">{t.list.loading}</p>
          ) : vault.status === 'none' ? (
            <LockScreen mode="setup" onSetup={onSetup} />
          ) : vault.status === 'locked' ? (
            <LockScreen mode="unlock" onUnlock={onUnlock} idle={vault.idle} />
          ) : items === undefined || properties === undefined || fields === undefined ? (
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
              editing={editing}
            />
          )}
        </ErrorBoundary>
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
  editing: boolean
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
  editing,
}: ScreenProps) {
  if (route.view === 'home') return <Home />
  if (!editing && (route.view === 'register' || route.view === 'edit')) return <p className="hint">{t.editing.off}</p>
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
      />
    )
  }
  if (route.view === 'storage') {
    return <StoragePage items={items} properties={properties} folder={folder} />
  }
  const item = items.find((i) => i.id === route.id)
  if (!item) return <p className="hint">{t.detail.notFound}</p>
  if (route.view === 'edit') {
    return <ItemForm key={item.id} item={item} fields={fields} categories={distinct(items, (i) => i.category)} />
  }
  return <ItemDetail item={item} fields={fields} editing={editing} />
}
