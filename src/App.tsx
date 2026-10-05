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
  resetDemo,
  sealPlaintextRows,
  writeVault,
} from './db/db'
import type { Item, Property } from './db/schema'
import { useSealedQuery } from './db/useSealedQuery'
import { href, useRoute, type Route } from './lib/route'
import { t } from './lib/strings'
import { useFolderSync } from './lib/useFolderSync'
import { errorText } from './lib/errors'
import { hasKey, initVault, lock, setupVault, startTrial, unlock, unlockWithKey, useVault } from './lib/vault'
import { exposedPasskey, openWithPasskey, passkeySupported, type PasskeyFailure, type PasskeyRecord } from './lib/passkey'
import { categoryColumnId, type FieldSettings } from './lib/fields'
import type { Filters } from './lib/filters'
import { usePlainPaste } from './lib/plainPaste'
import type { Sort } from './lib/sort'
import { useColumnWidths } from './lib/columnWidths'
import { searchKeys, searchKeysAria, useSearchShortcut } from './lib/useSearchShortcut'
import { useAutoLock } from './lib/useAutoLock'
import { useNarrow } from './lib/useNarrow'
import { useKeyboardInset } from './lib/useKeyboardInset'
import { loadHiddenColumns, readAutoLock, readWrap, saveHiddenColumns, writeAutoLock, writeWrap } from './lib/prefs'
import { Icon, Logo } from './components/Icons'
import { AddItem } from './components/AddItem'
import { ReceiptAdd } from './components/ReceiptAdd'
import { ItemList } from './components/ItemList'
import { ItemDetail } from './components/ItemDetail'
import { LockScreen } from './components/LockScreen'
import { Overview } from './components/Overview'
import { SettingsPage } from './components/SettingsPage'
import { UpdateButton } from './components/UpdateButton'
import { DemoBanner, DownloadButton, TrialBanner } from './components/TrialBanner'
import { isDemo } from './lib/useInstall'
import { demoRegister } from './lib/demo'
import { ErrorBoundary } from './components/ErrorBoundary'

export function App() {
  const hashRoute = useRoute()
  // The demo adds nothing and has no settings: those routes show the register
  const route: Route = isDemo && ['settings', 'add', 'receipt'].includes(hashRoute.view) ? { view: 'list' } : hashRoute
  const narrow = useNarrow()
  const vault = useVault()
  // A key in memory, from a passphrase or from trying the app
  const unlocked = hasKey(vault)
  const trial = vault.status === 'trial'
  // The demo's reads wait until the examples are in, or they would open what an earlier tab left
  const [demoReady, setDemoReady] = useState(false)
  // No passphrase yet: the app opens as a trial, after clearing what an
  // earlier one left sealed under a key nobody kept. Rows from before
  // encryption are the exception: they go to the setup screen as they are.
  useEffect(() => {
    void (async () => {
      if (isDemo) {
        await startTrial()
        const { items, properties } = demoRegister(Date.now())
        await resetDemo(items, properties)
        return setDemoReady(true)
      }
      const stored = await readVault()
      if (stored || (await hasPlainRows())) return initVault(stored)
      await clearTrialRows()
      await startTrial()
    })()
  }, [])
  // Watching keys, not rows: a change anywhere in the table re-runs the read,
  // and the read opens only rows whose seal changed.
  const readable = unlocked && (demoReady || !isDemo)
  const items = useSealedQuery(() => db.items.toCollection().primaryKeys(), readItems, readable)
  const properties = useSealedQuery(() => db.properties.toArray(), readProperties, readable)
  const fields = useSealedQuery(() => db.settings.toArray(), readFieldSettings, readable)
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

  // Face ID or Touch ID, where this device has it set up for this vault. A copy wrapping another
  // key opens nothing and one under an empty secret opens for anyone; both go. undefined until
  // known: the lock screen waits, so the passphrase field does not raise the keyboard over Face ID.
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
      const kept = record && record.dekId === lockedVault.dekId && !(await exposedPasskey(record)) ? record : null
      if (record && !kept) await deletePasskey()
      const usable = kept && (await passkeySupported()) ? kept : null
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
  // The register opens on its categories alone, the demo on every example. Kept here rather
  // than in Overview so opening a thing and coming back does not send you to the start
  // (elzacka, 23 September 2026).
  const [categoryPicked, setCategoryPicked] = useState(isDemo)
  const [sort, setSort] = useState<Sort | null>(null)
  const { widths, setWidth } = useColumnWidths(readable)
  const [autoLock, setAutoLock] = useState(readAutoLock)
  // Tilpass visning: columns taken out of the table on this device
  const [hidden, setHidden] = useState<Set<string>>(() => new Set())
  useEffect(() => {
    if (!readable) return setHidden(new Set())
    let live = true
    loadHiddenColumns()
      .then((ids) => live && setHidden(ids))
      .catch((err: unknown) => console.error(errorText(err)))
    return () => {
      live = false
    }
  }, [readable])
  const [wrap, setWrap] = useState(readWrap)
  const [installSteps, setInstallSteps] = useState(false)
  const toggleWrap = useCallback((on: boolean) => {
    writeWrap(on)
    setWrap(on)
  }, [])
  const toggleHidden = useCallback((ids: readonly string[], visible: boolean) => {
    setHidden((prev) => {
      const next = new Set(prev)
      for (const id of ids) {
        if (visible) next.delete(id)
        else next.add(id)
      }
      saveHiddenColumns(next)
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
  // Hiding the panel keeps the search and filters: the header icon stays lit while a query or
  // filter narrows the table. The category is the view, not a filter, and lights nothing.
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
  const settingsLabel = folderStalled ? t.nav.settingsStalled : t.nav.settings

  // Locked: only the wordmark, whatever the route. The phone reaches Innstillinger from the
  // list's bottom bar, so there it is a page with a way back.
  const isTop = !unlocked || route.view === 'list' || (route.view === 'settings' && !narrow)

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
            {/* The phone's search is a field at the top of the list */}
            {searchable && unlocked && !narrow && (
              <button
                type="button"
                className={`btn btn-icon${query !== '' || Object.entries(filters).some(([id, v]) => id !== categoryColumnId && v.length > 0) ? ' is-active' : ''}`}
                aria-label={searchOpen ? t.search.close : t.search.open}
                aria-keyshortcuts={searchKeysAria}
                aria-pressed={searchOpen}
                aria-controls="search"
                onClick={toggleSearch}
              >
                <Icon name="search" />
                <span className="tip" aria-hidden="true">
                  {searchOpen ? t.search.close : t.search.open}
                  <kbd>{searchKeys}</kbd>
                </span>
              </button>
            )}
            {/* The phone locks when the app is closed; only the desk needs a lock button */}
            {vault.status === 'open' && !narrow && (
              <button type="button" className="btn btn-icon" aria-label={t.lock.lock} onClick={lockApp}>
                <Icon name="lockOpen" />
              </button>
            )}
            {isDemo && <DownloadButton stepsOpen={installSteps} onSteps={setInstallSteps} />}
            {unlocked && !narrow && !isDemo && (
              <a
                className={`btn btn-icon${route.view === 'settings' ? ' is-active' : ''}${folderStalled ? ' is-stalled' : ''}`}
                href={href.settings}
                aria-label={settingsLabel}
                aria-current={route.view === 'settings' ? 'page' : undefined}
                onClick={guardNav}
              >
                <Icon name="settings" />
              </a>
            )}
          </div>
        )}
      </header>

      {isDemo ? <DemoBanner stepsOpen={installSteps} /> : trial && <TrialBanner onSettings={route.view === 'settings'} />}

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
              categoryPicked={categoryPicked}
              onCategoryPickedChange={setCategoryPicked}
              sort={sort}
              onSortChange={setSort}
              widths={widths}
              onWidth={setWidth}
              onDirtyChange={onDirtyChange}
              folder={folder}
              stalled={folderStalled}
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
  categoryPicked: boolean
  onCategoryPickedChange: (picked: boolean) => void
  sort: Sort | null
  onSortChange: (s: Sort | null) => void
  widths: Record<string, number>
  onWidth: (id: string, w: number | null) => void
  onDirtyChange: (dirty: boolean) => void
  folder: ReturnType<typeof useFolderSync>
  stalled: boolean
  autoLock: boolean
  onAutoLockChange: (on: boolean) => void
  hidden: Set<string>
  onHiddenChange: (ids: readonly string[], visible: boolean) => void
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
  categoryPicked,
  onCategoryPickedChange,
  sort,
  onSortChange,
  widths,
  onWidth,
  onDirtyChange,
  folder,
  stalled,
  autoLock,
  onAutoLockChange,
  hidden,
  onHiddenChange,
  wrap,
  onWrapChange,
}: ScreenProps) {
  const search = { query, onQueryChange, searchOpen, onSearchClose }
  if (route.view === 'list' && narrow) {
    return (
      <ItemList
        items={items}
        properties={properties}
        fields={fields}
        query={query}
        onQueryChange={onQueryChange}
        stalled={stalled}
      />
    )
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
        categoryPicked={categoryPicked}
        onCategoryPickedChange={onCategoryPickedChange}
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
  if (route.view === 'settings') {
    return (
      <SettingsPage
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
  if (route.view === 'receipt') {
    return <ReceiptAdd items={items} properties={properties} fields={fields} onDirtyChange={onDirtyChange} />
  }
  const item = items.find((i) => i.id === route.id)
  if (!item) return <p className="hint">{t.detail.notFound}</p>
  return <ItemDetail item={item} items={items} properties={properties} fields={fields} />
}
