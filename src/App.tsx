import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react'
import {
  clearTrialRows,
  db,
  deletePasskey,
  ensureCategoryProperty,
  hasPlainRows,
  readFieldSettings,
  readItems,
  readPasskey,
  readProperties,
  readVault,
  sealPlaintextRows,
  writeVault,
} from './db/db'
import type { Item, Property } from './db/schema'
import { useSealedQuery } from './db/useSealedQuery'
import { href, useRoute, type Route } from './lib/route'
import { t } from './lib/strings'
import { useFolderSync } from './lib/useFolderSync'
import { hasKey, initVault, lock, setupVault, startTrial, unlock, unlockWithKey, useVault } from './lib/vault'
import { openWithPasskey, passkeySupported, type PasskeyFailure, type PasskeyRecord } from './lib/passkey'
import { categoryColumnId, type FieldSettings } from './lib/fields'
import type { Filters } from './lib/filters'
import { usePlainPaste } from './lib/plainPaste'
import type { Sort } from './lib/sort'
import { useColumnWidths } from './lib/columnWidths'
import { useSearchShortcut } from './lib/useSearchShortcut'
import { useAutoLock } from './lib/useAutoLock'
import { useNarrow } from './lib/useNarrow'
import { useKeyboardInset } from './lib/useKeyboardInset'
import { readAutoLock, readHiddenColumns, readWrap, writeAutoLock, writeHiddenColumns, writeWrap } from './lib/prefs'
import { Icon, Logo } from './components/Icons'
import { AddItem } from './components/AddItem'
import { ItemList } from './components/ItemList'
import { ItemDetail } from './components/ItemDetail'
import { LockScreen } from './components/LockScreen'
import { Overview } from './components/Overview'
import { StoragePage } from './components/StoragePage'
import { UpdateButton } from './components/UpdateButton'
import { InstallBanner, TrialBanner } from './components/TrialBanner'
import { ErrorBoundary } from './components/ErrorBoundary'

export function App() {
  const route = useRoute()
  const narrow = useNarrow()
  const vault = useVault()
  // A key in memory, from a passphrase or from trying the app
  const unlocked = hasKey(vault)
  const trial = vault.status === 'trial'
  // No passphrase yet: the app opens as a trial, after clearing what an
  // earlier one left sealed under a key nobody kept. Rows from before
  // encryption are the exception: they go to the setup screen as they are.
  useEffect(() => {
    void (async () => {
      const stored = await readVault()
      if (stored || (await hasPlainRows())) return initVault(stored)
      await clearTrialRows()
      await startTrial()
    })()
  }, [])
  // Watching keys, not rows: a change anywhere in the table re-runs the read,
  // and the read opens only rows whose seal changed.
  const items = useSealedQuery(() => db.items.toCollection().primaryKeys(), readItems, unlocked)
  const properties = useSealedQuery(() => db.properties.toArray(), readProperties, unlocked)
  const fields = useSealedQuery(() => db.settings.toArray(), readFieldSettings, unlocked)
  const folder = useFolderSync()
  usePlainPaste()
  useKeyboardInset()

  async function onSetup(passphrase: string) {
    const v = await setupVault(passphrase)
    await writeVault(v)
    await migrate()
  }

  async function onUnlock(passphrase: string) {
    const ok = await unlock(passphrase)
    if (ok) await migrate()
    return ok
  }

  // Face ID or Touch ID, where this device has it set up for this vault. A
  // copy wrapping another data key (a restore or a folder took over another
  // vault) opens nothing, so it goes.
  // undefined while not yet known: the lock screen waits for it, so the
  // passphrase field does not take the focus (and raise a phone's keyboard)
  // over the Face ID sheet
  const [passkey, setPasskey] = useState<PasskeyRecord | null | undefined>(undefined)
  const lockedVault = vault.status === 'locked' ? vault.vault : null
  useEffect(() => {
    if (!lockedVault) {
      setPasskey(undefined)
      return
    }
    let live = true
    void (async () => {
      const record = await readPasskey()
      if (record && record.dekId !== lockedVault.dekId) await deletePasskey()
      const usable = record && record.dekId === lockedVault.dekId && (await passkeySupported()) ? record : null
      if (live) setPasskey(usable)
    })()
    return () => {
      live = false
    }
  }, [vault.status, lockedVault])

  async function onPasskey(): Promise<'ok' | PasskeyFailure> {
    if (!passkey) return 'failed'
    const opened = await openWithPasskey(passkey)
    if (typeof opened === 'string') return opened
    if (!unlockWithKey(opened)) return 'failed'
    await migrate()
    return 'ok'
  }

  // Data written by earlier versions is brought forward on every unlock: rows
  // from before encryption get sealed, a legacy Kategori gets its property.
  async function migrate() {
    await sealPlaintextRows()
    await ensureCategoryProperty()
  }
  // One query for both top-level views, so a filter made in one carries into the other.
  // Mirrored into ?q= so a reload or a bookmark keeps it.
  const [query, setQuery] = useState(() => new URLSearchParams(window.location.search).get('q') ?? '')
  const [searchOpen, setSearchOpen] = useState(() => query !== '')
  const [filters, setFilters] = useState<Filters>({})
  // The register opens on its categories alone: the table waits for one to be
  // picked. Kept here rather than in Overview so opening a thing and coming
  // back does not send you to the start (elzacka, 23 September 2026).
  const [viewPicked, setViewPicked] = useState(false)
  const [sort, setSort] = useState<Sort | null>(null)
  const { widths, setWidth } = useColumnWidths()
  const [autoLock, setAutoLock] = useState(readAutoLock)
  // Tilpass visning: columns taken out of the table on this device
  const [hidden, setHidden] = useState(readHiddenColumns)
  const [wrap, setWrap] = useState(readWrap)
  const toggleWrap = useCallback((on: boolean) => {
    writeWrap(on)
    setWrap(on)
  }, [])
  const toggleHidden = useCallback((id: string, visible: boolean) => {
    setHidden((prev) => {
      const next = new Set(prev)
      if (visible) next.delete(id)
      else next.add(id)
      writeHiddenColumns(next)
      return next
    })
  }, [])
  const toggleAutoLock = useCallback((on: boolean) => {
    writeAutoLock(on)
    setAutoLock(on)
  }, [])
  const searchable = route.view === 'list'
  const openSearch = useCallback((initial: string) => {
    setSearchOpen(true)
    if (initial !== '') setQuery(initial)
    else document.getElementById('search')?.focus()
  }, [])
  // Hiding the panel keeps the search and the filters: the header icon stays
  // lit while a query or a filter narrows the table. The category is the
  // view, not a filter, and lights nothing. Clearing is the field's own X, the
  // filters' "Fjern alle filtre", or "Vis alle ting".
  const closeSearch = useCallback(() => {
    setSearchOpen(false)
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
  const [unsaved, setUnsaved] = useState(false)
  const onDirtyChange = useCallback((d: boolean) => {
    dirty.current = d
    setUnsaved(d)
  }, [])
  // Paused while something is unsaved: a lock would drop it. Decided by elzacka.
  useAutoLock(vault.status === 'open' && autoLock && !unsaved)

  // The folder is not being written: permission gone, a write failed, or a
  // choice is waiting on Innstillinger. Said on the icon, since that is the
  // only place the header can say it.
  const folderStalled = ['needs-permission', 'needs-passphrase', 'conflict', 'error'].includes(folder.status.kind)
  const storageLabel = folderStalled ? t.nav.storageStalled : t.nav.storage

  // Locked: only the wordmark, whatever the route.
  const isTop = !unlocked || route.view === 'list' || route.view === 'storage'

  // The table holds unsaved edits in memory; leaving it drops them.
  function guardNav(e: MouseEvent<HTMLAnchorElement>) {
    if (dirty.current && !window.confirm(t.confirm.unsaved)) e.preventDefault()
  }
  function lockApp() {
    if (dirty.current && !window.confirm(t.confirm.unsaved)) return
    lock()
  }

  return (
    <div className="page">
      <header className="topbar">
        {isTop ? (
          <nav className="row" aria-label={t.nav.list}>
            <a className="wordmark" href={href.list} onClick={guardNav} aria-label={t.nav.home}>
              <Logo />
              {t.appName}
            </a>
          </nav>
        ) : (
          <nav className="row" aria-label={t.action.back}>
            <a
              className="btn btn-icon"
              href={href.list}
              aria-label={t.action.back}
            >
              <Icon name="arrowBack" />
            </a>
            <a className="wordmark" href={href.list} aria-label={t.nav.home}>
              <Logo />
              {t.appName}
            </a>
          </nav>
        )}
        {isTop && (
          <div className="row topbar-end">
            <UpdateButton />
            {/* The phone's search is a field at the bottom of the list */}
            {searchable && unlocked && !narrow && (
              <button
                type="button"
                className={`btn btn-icon${query !== '' || Object.entries(filters).some(([id, v]) => id !== categoryColumnId && v.length > 0) ? ' is-active' : ''}`}
                aria-label={searchOpen ? t.search.close : t.search.open}
                aria-pressed={searchOpen}
                aria-controls="search"
                onClick={toggleSearch}
              >
                <Icon name="search" />
              </button>
            )}
            {vault.status === 'open' && (
              <button type="button" className="btn btn-icon" aria-label={t.lock.lock} onClick={lockApp}>
                <Icon name="lockOpen" />
              </button>
            )}
            {unlocked && (
              <a
                className={`btn btn-icon${route.view === 'storage' ? ' is-active' : ''}${folderStalled ? ' is-stalled' : ''}`}
                href={href.storage}
                aria-label={storageLabel}
                aria-current={route.view === 'storage' ? 'page' : undefined}
                onClick={guardNav}
              >
                <Icon name="settings" />
              </a>
            )}
          </div>
        )}
      </header>

      {trial && <TrialBanner onSettings={route.view === 'storage'} />}
      {vault.status === 'open' && isTop && <InstallBanner />}

      <main className="stack">
        <ErrorBoundary>
          {vault.status === 'loading' ? (
            <p className="hint">{t.list.loading}</p>
          ) : vault.status === 'none' ? (
            <LockScreen mode="setup" onSetup={onSetup} />
          ) : vault.status === 'locked' && passkey === undefined ? (
            <p className="hint">{t.list.loading}</p>
          ) : vault.status === 'locked' ? (
            <LockScreen mode="unlock" onUnlock={onUnlock} onPasskey={passkey ? onPasskey : undefined} idle={vault.idle} />
          ) : items === undefined || properties === undefined || fields === undefined ? (
            <p className="hint">{t.list.loading}</p>
          ) : (
            <Screen
              items={items}
              properties={properties}
              fields={fields}
              route={route}
              narrow={narrow}
              query={query}
              onQueryChange={setQuery}
              searchOpen={searchOpen}
              onSearchClose={closeSearch}
              filters={filters}
              onFiltersChange={setFilters}
              viewPicked={viewPicked}
              onViewPickedChange={setViewPicked}
              sort={sort}
              onSortChange={setSort}
              widths={widths}
              onWidth={setWidth}
              onDirtyChange={onDirtyChange}
              folder={folder}
              autoLock={autoLock}
              onAutoLockChange={toggleAutoLock}
              hidden={hidden}
              onHiddenChange={toggleHidden}
              wrap={wrap}
              onWrapChange={toggleWrap}
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
  narrow: boolean
  query: string
  onQueryChange: (q: string) => void
  searchOpen: boolean
  onSearchClose: () => void
  filters: Filters
  onFiltersChange: (f: Filters) => void
  viewPicked: boolean
  onViewPickedChange: (picked: boolean) => void
  sort: Sort | null
  onSortChange: (s: Sort | null) => void
  widths: Record<string, number>
  onWidth: (id: string, w: number | null) => void
  onDirtyChange: (dirty: boolean) => void
  folder: ReturnType<typeof useFolderSync>
  autoLock: boolean
  onAutoLockChange: (on: boolean) => void
  hidden: Set<string>
  onHiddenChange: (id: string, visible: boolean) => void
  wrap: boolean
  onWrapChange: (on: boolean) => void
}

function Screen({
  items,
  properties,
  fields,
  route,
  narrow,
  query,
  onQueryChange,
  searchOpen,
  onSearchClose,
  filters,
  onFiltersChange,
  viewPicked,
  onViewPickedChange,
  sort,
  onSortChange,
  widths,
  onWidth,
  onDirtyChange,
  folder,
  autoLock,
  onAutoLockChange,
  hidden,
  onHiddenChange,
  wrap,
  onWrapChange,
}: ScreenProps) {
  const search = { query, onQueryChange, searchOpen, onSearchClose }
  if (route.view === 'list' && narrow) {
    return <ItemList items={items} properties={properties} fields={fields} query={query} onQueryChange={onQueryChange} />
  }
  if (route.view === 'list') {
    return (
      <Overview
        items={items}
        properties={properties}
        fields={fields}
        {...search}
        filters={filters}
        onFiltersChange={onFiltersChange}
        viewPicked={viewPicked}
        onViewPickedChange={onViewPickedChange}
        sort={sort}
        onSortChange={onSortChange}
        widths={widths}
        onWidth={onWidth}
        onDirtyChange={onDirtyChange}
        hidden={hidden}
        wrap={wrap}
      />
    )
  }
  if (route.view === 'storage') {
    return (
      <StoragePage
        items={items}
        properties={properties}
        fields={fields}
        folder={folder}
        autoLock={autoLock}
        onAutoLockChange={onAutoLockChange}
        hidden={hidden}
        onHiddenChange={onHiddenChange}
        wrap={wrap}
        onWrapChange={onWrapChange}
      />
    )
  }
  if (route.view === 'add') {
    return <AddItem items={items} properties={properties} fields={fields} onDirtyChange={onDirtyChange} />
  }
  const item = items.find((i) => i.id === route.id)
  if (!item) return <p className="hint">{t.detail.notFound}</p>
  return <ItemDetail item={item} items={items} properties={properties} fields={fields} />
}
