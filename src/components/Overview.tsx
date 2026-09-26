import { useCallback, useEffect, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { createPortal, flushSync } from 'react-dom'
import { downloadText, exportFilename, toCsv } from '../lib/export'
import { formatDate, formatNumber } from '../lib/format'
import { href } from '../lib/route'
import { totals } from '../lib/summary'
import { groupItems } from '../lib/report'
import { useObjectUrl } from './useObjectUrl'
import {
  addProperty,
  deleteItems,
  removeProperty,
  renameProperty,
  saveBatch,
  saveCategories,
  setColumnOrder,
  setFieldSettings,
  setPropertyCategories,
  setPropertyOptions,
} from '../db/db'
import type { Item, Property, PropertyType } from '../db/schema'
import { distinct, parseNumber } from '../lib/values'
import { autoWidths } from '../lib/columnWidths'
import {
  appliesTo,
  categoryColumnId,
  claimedBy,
  columnDefs,
  propColumns,
  unitFor,
  withCategory,
  type ColumnDef,
  type FieldSettings,
} from '../lib/fields'
import { parseDateInput } from '../lib/dates'
import { maxPathLevels, parsePath, pathsInUse } from '../lib/paths'
import { cellsFrom, columnId, inputFrom, type Column } from '../lib/grid'
import { searchItems } from '../lib/search'
import { searchTips } from '../lib/searchTips'
import { applyFilters, levelId, valueKey, valuesFor, withoutFilter, type Filters } from '../lib/filters'
import { FilterPanel } from './FilterPanel'
import { rowHeight } from '../lib/useRowWindow'
import { Grid, isNumberColumn } from './Grid'
import { PrintReport } from './PrintReport'
import { parseBlock } from '../lib/paste'
import { sortItems, type Sort } from '../lib/sort'
import { t } from '../lib/strings'
import { Icon } from './Icons'
import { allCategoriesIcon, categoryIconFor, otherCategoryIcon } from '../lib/categoryIcons'
import { CategoryIcon } from './CategoryIcon'
import { CategoryEditor } from './CategoryEditor'
import { PropertyEditor, type PropertyRow } from './PropertyEditor'
import type { CategoryEdit } from '../lib/categories'
import { isEmptyEdit, optionEdit, optionValues } from '../lib/options'
import { SearchField } from './SearchField'
import { SortHeader } from './SortHeader'
import { errorText } from '../lib/errors'

type RowEdit = { name?: string; cells?: Record<string, string> }
type NewRow = {
  tempId: string
  name: string
  cells: Record<string, string>
  // What the row started with (inherited values): typing the same is not an edit
  prefilled: Record<string, string>
}

// Focusing a cell inside the sticky name column must not scroll the table sideways.
function focusWithoutScroll(el: HTMLInputElement | null) {
  el?.focus({ preventScroll: true })
}

function parseOptions(raw: string): string[] {
  return [
    ...new Set(
      raw
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean),
    ),
  ]
}

function blankRow(prefilled: Record<string, string>): NewRow {
  return { tempId: crypto.randomUUID(), name: '', cells: { ...prefilled }, prefilled }
}

type Props = {
  items: Item[]
  properties: Property[]
  fields: FieldSettings
  query: string
  onQueryChange: (q: string) => void
  searchOpen: boolean
  onSearchClose: () => void
  sort: Sort | null
  onSortChange: (s: Sort | null) => void
  widths: Record<string, number>
  onWidth: (id: string, w: number | null) => void
  onDirtyChange: (dirty: boolean) => void
  filters: Filters
  onFiltersChange: (f: Filters) => void
  // Whether a category has been chosen at all. Until one is, the card shows
  // its categories and nothing else.
  categoryPicked: boolean
  onCategoryPickedChange: (picked: boolean) => void
  // Columns taken out of the table on Innstillinger; Navn is never among them
  hidden: Set<string>
  // Long values run onto more lines instead of ending in an ellipsis (Innstillinger)
  wrap: boolean
}

// "Interiør, Kjøkken og Bøker"
const listFormat = new Intl.ListFormat('nb', { type: 'conjunction' })
const collator = new Intl.Collator('nb', { sensitivity: 'base', numeric: true })

// Every field type a column can have, in the order the menus offer them.
const propertyTypes: readonly PropertyType[] = ['text', 'choice', 'number', 'date', 'path']

// Column ids are JSON; an id attribute with quotes in it breaks attribute selectors.
function choiceListId(columnId: string): string {
  return `choice-${encodeURIComponent(columnId)}`
}

export function Overview({
  items,
  properties,
  fields,
  query,
  onQueryChange,
  searchOpen,
  onSearchClose,
  sort,
  onSortChange,
  widths,
  onWidth,
  onDirtyChange,
  filters,
  onFiltersChange,
  categoryPicked,
  onCategoryPickedChange,
  hidden,
  wrap,
}: Props) {
  const [edits, setEdits] = useState<Record<string, RowEdit>>({})
  const [newRows, setNewRows] = useState<NewRow[]>([])
  const [removingColumn, setRemovingColumn] = useState<ColumnDef | null>(null)
  const [renaming, setRenaming] = useState<{
    def: ColumnDef
    key: string
    unit: string
    type: PropertyType
  } | null>(null)
  // The open column menu is fixed to the window so the table's scroll box cannot clip it.
  const [menuPos, setMenuPos] = useState<{ id: string; top: number; left: number } | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [confirmingDiscard, setConfirmingDiscard] = useState(false)
  const [addingColumn, setAddingColumn] = useState(false)
  const [editingCategories, setEditingCategories] = useState(false)
  const [editingProperties, setEditingProperties] = useState(false)
  // The Valgliste whose alternatives Endre egenskaper opens on, from its column menu
  const [optionsFor, setOptionsFor] = useState<string | null>(null)
  // Endre verdi for the ticked things: which property, and the value it gets
  const [bulk, setBulk] = useState<{ defId: string; value: string } | null>(null)
  // Skriv ut from the selection: the things that go on paper, nothing else
  const [printOnly, setPrintOnly] = useState<Set<string> | null>(null)
  // Shown inside the column form: the page's error line sits under the table
  const [columnError, setColumnError] = useState<string | null>(null)
  // Columns the view leaves out are hidden; this shows every one of them anyway
  const [showAllCols, setShowAllCols] = useState(false)
  // A column added while one category is in view belongs to that category
  // unless the user says otherwise.
  const [columnDraft, setColumnDraft] = useState<{
    key: string
    unit: string
    type: PropertyType
    options: string
    onlyHere: boolean
  }>({
    key: '',
    unit: '',
    type: 'text',
    options: '',
    onlyHere: true,
  })
  // Only the row being touched carries inputs; every other row is text.
  const [active, setActive] = useState<{ row: string; col: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const defs = useMemo(() => columnDefs(fields, properties, items), [fields, properties, items])
  const columns = useMemo(() => propColumns(defs), [defs])
  const nameLabel = fields.name.label ?? t.table.name

  function labelOf(def: ColumnDef): string {
    return def.kind === 'name' ? nameLabel : def.col.key
  }

  const baseCells = useMemo(() => new Map(items.map((i) => [i.id, cellsFrom(i)])), [items])
  // Columns fit their content unless the user has dragged or fitted them
  const fitted = useMemo(
    () =>
      autoWidths(
        defs,
        labelOf,
        (def) =>
          def.kind === 'name' ? items.map((i) => i.name) : items.map((i) => baseCells.get(i.id)?.[def.id] ?? ''),
        items.some((i) => i.photos.length > 0),
      ),
    // labelOf reads fields, which defs already depend on
    [defs, items, baseCells],
  )
  const effectiveWidths = useMemo(() => ({ ...fitted, ...widths }), [fitted, widths])
  const names = useMemo(() => distinct(items, (i) => i.name), [items])
  const tips = useMemo(() => searchTips(properties, items, new Date().getFullYear()), [properties, items])
  // Edited rows stay visible even when they stop matching the query.
  const searched = useMemo(() => searchItems(items, query), [items, query])
  const visible = useMemo(() => {
    const hits = applyFilters(searched, filters)
    const ids = new Set(hits.map((i) => i.id))
    return sortItems([...hits, ...items.filter((i) => !ids.has(i.id) && edits[i.id] !== undefined)], columns, sort)
  }, [items, searched, filters, edits, columns, sort])

  // Kategori is the view: the categories it names decide the rows, the
  // columns, the filters and what a new row is born with. The chosen keys are
  // folded the way the filters fold them; the labels come from the values.
  const categoryDef = useMemo(() => defs.find((d) => d.id === categoryColumnId), [defs])
  // The categories in the dropdown: those things have, counted over what the
  // search and the other filters leave, and the ones made in Endre kategorier
  // before any thing has them, at 0
  const categoryValues = useMemo(() => {
    if (categoryDef?.kind !== 'prop') return []
    const inUse = valuesFor(withoutFilter(searched, filters, categoryColumnId), categoryDef.col)
    const known = new Set(valuesFor(items, categoryDef.col).map((v) => v.key))
    const empty = (categoryDef.property?.options ?? [])
      .filter((o) => !known.has(valueKey(o)))
      .map((o) => ({ key: valueKey(o), label: o, count: 0 }))
    return [...inUse, ...empty].sort((a, b) => collator.compare(a.label, b.label))
  }, [categoryDef, searched, filters, items])
  // Every category with every thing it holds, for Endre kategorier
  const allCategories = useMemo(() => {
    if (categoryDef?.kind !== 'prop') return []
    const inUse = valuesFor(items, categoryDef.col)
    const known = new Set(inUse.map((v) => v.key))
    const empty = (categoryDef.property?.options ?? [])
      .filter((o) => !known.has(valueKey(o)))
      .map((o) => ({ key: valueKey(o), label: o, count: 0 }))
    return [...inUse, ...empty].sort((a, b) => collator.compare(a.label, b.label))
  }, [categoryDef, items])
  const cats = useMemo(() => filters[categoryColumnId] ?? [], [filters])
  // The icons chosen for categories, carried by the Kategori property
  const chosenIcons = categoryDef?.kind === 'prop' ? categoryDef.property?.icons : undefined
  // The label to write, and to hand a new row, while exactly one is in view.
  // Read from every thing and the categories made in Endre kategorier, not
  // from what is on screen: a search that leaves none of them, or a category
  // no thing has yet, must not turn Bok back into the folded key.
  const oneCategory = useMemo(() => {
    if (cats.length !== 1 || categoryDef?.kind !== 'prop') return null
    return allCategories.find((v) => v.key === cats[0])?.label ?? null
  }, [cats, categoryDef, allCategories])
  // Every chosen category as written, the same way: for the field, the
  // property form and a new property's categories
  const catLabels = useMemo(() => {
    if (categoryDef?.kind !== 'prop') return []
    return cats.map((k) => allCategories.find((v) => v.key === k)?.label ?? k)
  }, [cats, categoryDef, allCategories])

  // The category dropdown. Several categories can be ticked at once, and
  // ticking keeps it open; Alle and Velg kategori close it.
  const [picking, setPicking] = useState(false)
  // Fixed to the window, under the button, so the card's clipping cannot cut it
  const [pickerPos, setPickerPos] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(
    null,
  )
  const currentRef = useRef<HTMLButtonElement>(null)
  const pickerRef = useRef<HTMLDivElement>(null)
  const currentLabel = cats.length === 0 ? t.categoryPicker.all : catLabels.join(', ')
  // Measured, not 100vh: the list ends a gutter above the window's real
  // bottom edge and scrolls inside itself when the categories need more room
  function positionPicker() {
    const r = currentRef.current?.getBoundingClientRect()
    if (!r) return
    const top = r.bottom + 4
    setPickerPos({ top, left: r.left, width: r.width, maxHeight: Math.max(160, window.innerHeight - top - 16) })
  }
  function openPicker() {
    positionPicker()
    setPicking(true)
  }
  function closePicker() {
    setPicking(false)
    requestAnimationFrame(() => currentRef.current?.focus())
  }
  function pickCategory(key: string | null) {
    onFiltersChange({ ...filters, [categoryColumnId]: key === null ? [] : [key] })
    onCategoryPickedChange(true)
    closePicker()
  }
  // Ticks or unticks one category. None left is no category and no table.
  function toggleCategory(key: string) {
    const next = cats.includes(key) ? cats.filter((k) => k !== key) : [...cats, key]
    onFiltersChange({ ...filters, [categoryColumnId]: next })
    onCategoryPickedChange(next.length > 0)
  }
  // Velg kategori: back to no category and no table
  function unpickCategory() {
    onFiltersChange({ ...filters, [categoryColumnId]: [] })
    onCategoryPickedChange(false)
    closePicker()
  }
  // Open: the chosen one has focus, the arrows move through the list, a
  // click anywhere else closes it (Escape is in the key handler below)
  useEffect(() => {
    if (!picking) return
    const menu = pickerRef.current
    ;(menu?.querySelector<HTMLButtonElement>('[aria-checked="true"]') ?? menu?.querySelector('button'))?.focus()
    const onDown = (e: MouseEvent) => {
      if (!(e.target instanceof Node)) return
      if (menu?.contains(e.target) || currentRef.current?.contains(e.target)) return
      setPicking(false)
    }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('resize', positionPicker)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('resize', positionPicker)
    }
  }, [picking])
  // The arrows, Home and End move through a menu's buttons
  function onMenuKey(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') return
    e.preventDefault()
    const items = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('button')]
    const at = items.indexOf(document.activeElement as HTMLButtonElement)
    const next =
      e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : (at + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
    items[next]?.focus()
  }

  // Plus asks what to add: a thing, or a property. Fixed to the window under
  // the button, right edges together, since the button sits at the card's edge.
  const addRef = useRef<HTMLButtonElement>(null)
  const addMenuRef = useRef<HTMLDivElement>(null)
  const [addMenu, setAddMenu] = useState<{ top: number; right: number } | null>(null)
  function openAddMenu() {
    const r = addRef.current?.getBoundingClientRect()
    if (r) setAddMenu({ top: r.bottom + 4, right: window.innerWidth - r.right })
  }
  function closeAddMenu() {
    setAddMenu(null)
    requestAnimationFrame(() => addRef.current?.focus())
  }
  useEffect(() => {
    if (!addMenu) return
    const menu = addMenuRef.current
    menu?.querySelector('button')?.focus()
    const onDown = (e: MouseEvent) => {
      if (!(e.target instanceof Node)) return
      if (menu?.contains(e.target) || addRef.current?.contains(e.target)) return
      setAddMenu(null)
    }
    const onResize = () => setAddMenu(null)
    document.addEventListener('mousedown', onDown)
    window.addEventListener('resize', onResize)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('resize', onResize)
    }
  }, [addMenu])

  // A column earns its place twice over: it must belong to every category in
  // view, and then either be one those categories ask for or hold a value for
  // a row on screen (or a new row, or an active filter). Navn always.
  // Everything else is noise for the view at hand: a sleeping-bag column in a
  // list of books. Inside one category its own columns stay even when empty —
  // there they are the work list, not noise.
  const { shown: shownAll, extra } = useMemo(() => {
    const used = new Set<string>()
    for (const item of visible) for (const s of item.specs) used.add(columnId({ key: s.key, unit: s.unit }))
    for (const row of newRows) for (const [id, v] of Object.entries(row.cells)) if (v.trim() !== '') used.add(id)
    for (const [id, values] of Object.entries(filters)) if (values.length > 0) used.add(id)
    // One value on every row says nothing about any of them, the same way
    // Kategori says nothing inside one category. Not while rows are being
    // typed or changed: then the column is where the change goes.
    const uniform = new Set<string>()
    if (visible.length > 1 && newRows.length === 0 && Object.keys(edits).length === 0) {
      for (const d of defs) {
        if (d.kind !== 'prop') continue
        const first = baseCells.get(visible[0]?.id ?? '')?.[d.id] ?? ''
        if (first !== '' && visible.every((i) => (baseCells.get(i.id)?.[d.id] ?? '') === first)) uniform.add(d.id)
      }
    }
    // A category's own columns stay even when every row says the same: they
    // are its work list. Only the ones that belong everywhere give way.
    const fits = (d: ColumnDef) =>
      d.kind === 'name' ||
      (appliesTo(d.property, cats) && (claimedBy(d.property, cats) || (used.has(d.id) && !uniform.has(d.id))))
    // With one category in view its own column says the same on every row
    const chosen = defs.filter(
      (d) => d.kind === 'name' || (!hidden.has(d.id) && !(cats.length === 1 && d.id === categoryColumnId)),
    )
    const extra = items.length === 0 ? 0 : chosen.filter((d) => !fits(d)).length
    return { shown: showAllCols || items.length === 0 ? chosen : chosen.filter(fits), extra }
  }, [defs, visible, newRows, edits, baseCells, filters, showAllCols, items.length, hidden, cats])

  // The column form's help follows the field in use. For the name it is the
  // properties that start with what is typed: a name in use is taken into
  // this category rather than made twice, so the help says where it is.
  const [columnFocus, setColumnFocus] = useState<'key' | 'type' | 'options' | 'unit' | 'scope'>('key')
  function columnHelp(): string | null {
    const h = t.table.columnHelp
    if (columnFocus === 'type') return h.types[columnDraft.type]
    if (columnFocus === 'options') return h.options
    if (columnFocus === 'unit') return h.unit
    if (columnFocus === 'scope') return h.scope
    const typed = columnDraft.key.trim().toLocaleLowerCase('nb')
    if (typed === '') return null
    const matches = defs.filter((d) => labelOf(d).toLocaleLowerCase('nb').startsWith(typed))
    const exact = matches.find((d) => labelOf(d).toLocaleLowerCase('nb') === typed)
    if (!exact) return matches.length > 0 ? `${h.similar}: ${matches.map(labelOf).join(', ')}` : null
    const key = labelOf(exact)
    const own = exact.kind === 'prop' ? (exact.property?.categories ?? []) : []
    if (own.length === 0) return h.everywhere(key)
    const where = listFormat.format(own)
    if (catLabels.length === 0) return h.elsewhere(key, where)
    const missing = catLabels.filter((c) => !appliesTo(exact.kind === 'prop' ? exact.property : null, [c]))
    return missing.length === 0 ? h.here(key, listFormat.format(catLabels)) : h.shared(key, where, listFormat.format(missing))
  }

  // Skriv ut asks which columns go on paper; Navn always does, and the form
  // starts with what is on screen, the same as Cmd+P without a choice. The
  // choice holds for the session. While the browser takes its snapshot the
  // table itself narrows to it.
  const [printCols, setPrintCols] = useState<Set<string> | null>(null)
  const [printPick, setPrintPick] = useState<Set<string> | null>(null)
  const [printing, setPrinting] = useState(false)
  // Two choices that change the shape of the paper rather than its contents:
  // the column the things are grouped under, and whether each carries its
  // photo. Either one turns the table into the report layout; neither leaves
  // the table printing itself, as it always has.
  const [printGroup, setPrintGroup] = useState<string | null>(null)
  const [printPhotos, setPrintPhotos] = useState(false)
  const [draftGroup, setDraftGroup] = useState<string | null>(null)
  const [draftPhotos, setDraftPhotos] = useState(false)
  // The head's height goes into --head-h on the card, so the table's header
  // row can stick right under it whatever the head line wraps to
  const cardRef = useRef<HTMLDivElement>(null)
  const headRef = useRef<HTMLDivElement>(null)
  const [headHeight, setHeadHeight] = useState(0)
  useEffect(() => {
    const head = headRef.current
    const card = cardRef.current
    if (!head || !card) return
    const set = () => {
      const h = head.getBoundingClientRect().height
      card.style.setProperty('--head-h', `${h}px`)
      setHeadHeight(h)
    }
    set()
    const ro = new ResizeObserver(set)
    ro.observe(head)
    return () => ro.disconnect()
  }, [])
  // One band at a time: the print form, the columns, or the search (whose
  // state lives in App). Opening one closes the others.
  function openPanel(which: 'print' | 'print-selected' | 'columns' | 'categories' | 'properties' | 'bulk' | null) {
    setAddingColumn(which === 'columns')
    setEditingCategories(which === 'categories')
    setEditingProperties(which === 'properties')
    setOptionsFor(null)
    setBulk(which === 'bulk' ? { defId: bulkDefs[0]?.id ?? categoryColumnId, value: '' } : null)
    setPrintOnly(which === 'print-selected' ? new Set(selected) : null)
    if (which === 'print' || which === 'print-selected') {
      setDraftGroup(printGroup)
      setDraftPhotos(printPhotos)
      setPrintPick(new Set(printCols ?? shownAll.map((d) => d.id)))
    } else {
      setPrintPick(null)
    }
    if (which !== null && searchOpen) onSearchClose()
  }
  useEffect(() => {
    if (!searchOpen) return
    setAddingColumn(false)
    setPrintPick(null)
    setEditingCategories(false)
    setEditingProperties(false)
    setBulk(null)
  }, [searchOpen])

  // What Endre verdi offers: the properties of the categories in view, and
  // Kategori always, since moving things between categories is the common case
  const bulkDefs = useMemo(
    () =>
      defs.flatMap((d) =>
        d.kind === 'prop' && (d.id === categoryColumnId || appliesTo(d.property, cats)) ? [d] : [],
      ),
    [defs, cats],
  )
  // The same value into one property of every ticked thing, as edits: the
  // rows show what changes, and nothing is stored before Lagre
  function applyBulk() {
    if (!bulk) return
    for (const id of selected) editItem(id, { cells: { [bulk.defId]: bulk.value.trim() } })
    setBulk(null)
  }
  // The rows the table shows, or while printing from the selection, the ticked ones
  const listed = useMemo(
    () => (printing && printOnly ? visible.filter((i) => printOnly.has(i.id)) : visible),
    [printing, printOnly, visible],
  )

  // Endre kategorier stored: a category renamed while it is ticked stays ticked
  async function saveCategoryEdit(edit: CategoryEdit) {
    try {
      await saveCategories(edit)
    } catch (err) {
      console.error(errorText(err))
      setError(t.error.saveFailed)
      return
    }
    if (cats.length > 0) {
      const next = cats.map((k) => {
        const hit = edit.renames.find(([from]) => valueKey(from) === k)
        return hit ? valueKey(hit[1]) : k
      })
      onFiltersChange({ ...filters, [categoryColumnId]: [...new Set(next)] })
    }
    openPanel(null)
  }
  const shown = useMemo(
    () => (printing && printCols ? shownAll.filter((d) => d.kind === 'name' || printCols.has(d.id)) : shownAll),
    [shownAll, printing, printCols],
  )

  // The report layout instead of the table: asked for by a grouping, by the
  // photos, or by both. The columns and the sums are the ones chosen for the
  // paper, so a column left off is left out of the arithmetic as well.
  const reporting = printing && printCols !== null && (printGroup !== null || printPhotos)
  const reportColumns = useMemo(
    () => shown.flatMap((d) => (d.kind === 'prop' ? [d] : [])),
    [shown],
  )
  const reportProperties = useMemo(
    () => reportColumns.flatMap((d) => (d.property ? [d.property] : [])),
    [reportColumns],
  )
  const reportGroups = useMemo(
    () => (reporting ? groupItems(listed, printGroup) : []),
    [reporting, listed, printGroup],
  )
  // Few enough values to head a page: a Valgliste, or a place at one of its
  // levels — by room, by shelf, by box. Only the columns on screen, the same
  // ones the form offers for the paper: a column of another category, or
  // Kategori inside one, would put everything under one heading.
  const groupChoices = useMemo(
    () =>
      shownAll.flatMap((d) => {
        if (d.kind !== 'prop') return []
        if (d.type === 'choice') return [{ id: d.id, label: d.col.key }]
        if (d.type !== 'path') return []
        const deepest = Math.min(
          maxPathLevels,
          items.reduce((deep, item) => {
            const spec = item.specs.find((x) => columnId({ key: x.key, unit: x.unit }) === d.id)
            return spec ? Math.max(deep, parsePath(spec.value).length) : deep
          }, 0),
        )
        return Array.from({ length: deepest }, (_, i) => ({
          id: levelId(d.id, i + 1),
          label: t.filters.level(d.col.key, i + 1),
        }))
      }),
    [shownAll, items],
  )
  const groupLabel = useMemo(
    () => groupChoices.find((d) => d.id === printGroup)?.label ?? null,
    [groupChoices, printGroup],
  )
  const anyPhoto = useMemo(() => visible.some((i) => i.photos.length > 0), [visible])

  // Photos are object URLs the browser has to fetch and decode; a snapshot
  // taken before they land prints empty frames.
  async function waitForPhotos() {
    const imgs = [...document.querySelectorAll<HTMLImageElement>('.print-report img')]
    await Promise.all(imgs.map((img) => img.decode().catch(() => undefined)))
  }

  const dirtyIds = Object.keys(edits).filter((id) => {
    const item = items.find((i) => i.id === id)
    const e = edits[id]
    if (!item || !e) return false
    const base = baseCells.get(id) ?? {}
    if (e.name !== undefined && e.name !== item.name) return true
    return Object.entries(e.cells ?? {}).some(([col, v]) => v !== (base[col] ?? ''))
  })
  // A new row counts once anything is typed into it beyond what it inherited.
  const touched = (r: NewRow) =>
    r.name.trim() !== '' || Object.entries(r.cells).some(([id, v]) => v.trim() !== '' && v !== (r.prefilled[id] ?? ''))
  const dirtyCount = dirtyIds.length + newRows.filter(touched).length

  useEffect(() => {
    onDirtyChange(dirtyCount > 0)
    if (dirtyCount === 0) return
    const guard = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }
    window.addEventListener('beforeunload', guard)
    return () => window.removeEventListener('beforeunload', guard)
  }, [dirtyCount, onDirtyChange])

  useEffect(() => () => onDirtyChange(false), [onDirtyChange])

  function value(item: Item, field: 'name'): string {
    const e = edits[item.id]
    if (e && e[field] !== undefined) return e[field]
    return item[field]
  }

  // A new row inherits what describes the batch from the row above: every
  // Valgliste, date and place (a shop and a purchase date carry down a
  // receipt, a place carries down a shelf). Prices, texts and numbers are
  // the row's own. The first row inherits only the Kategori of the newest thing.
  function inherited(prev?: NewRow): Record<string, string> {
    if (prev) {
      const cells: Record<string, string> = {}
      for (const def of defs) {
        if (def.kind !== 'prop' || (def.type !== 'choice' && def.type !== 'date' && def.type !== 'path')) continue
        const v = prev.cells[def.id] ?? ''
        if (v.trim() !== '') cells[def.id] = v
      }
      return cells
    }
    // In a category's own view that is what a new thing is; otherwise the
    // Kategori of the newest thing, which is what the last batch was.
    if (oneCategory !== null) return { [categoryColumnId]: oneCategory }
    // Several chosen: the newest thing among them, so the row stays in view
    const pool = cats.length > 1 ? visible : items
    const newest = pool.reduce<Item | null>((a, i) => (a === null || i.createdAt > a.createdAt ? i : a), null)
    const value = newest ? (baseCells.get(newest.id)?.[categoryColumnId] ?? '') : ''
    return value === '' ? {} : { [categoryColumnId]: value }
  }

  function cell(item: Item, col: Column): string {
    const id = columnId(col)
    return edits[item.id]?.cells?.[id] ?? baseCells.get(item.id)?.[id] ?? ''
  }

  function editItem(id: string, patch: RowEdit) {
    setEdits((prev) => {
      const cur = prev[id] ?? {}
      return { ...prev, [id]: { ...cur, ...patch, cells: { ...(cur.cells ?? {}), ...(patch.cells ?? {}) } } }
    })
  }

  function editNew(tempId: string, patch: Partial<NewRow>) {
    setNewRows((prev) =>
      prev.map((r) => (r.tempId === tempId ? { ...r, ...patch, cells: { ...r.cells, ...(patch.cells ?? {}) } } : r)),
    )
  }

  // A block from a spreadsheet fills right and down from the cell it lands in,
  // by position: the first pasted column goes into the column pasted into, and
  // so on. Rows past the last one become new rows. One value pastes as usual.
  function onPaste(e: ClipboardEvent<HTMLTableElement>) {
    const el = e.target
    if (!(el instanceof HTMLInputElement)) return
    const rowId = el.dataset['row']
    const colId = el.dataset['col']
    if (!rowId || !colId) return
    const block = parseBlock(e.clipboardData.getData('text/plain'))
    if (!block) return
    e.preventDefault()
    e.stopPropagation()
    const order = [...visible.map((i) => ({ kind: 'item' as const, id: i.id })), ...newRows.map((r) => ({ kind: 'new' as const, id: r.tempId }))]
    const startRow = order.findIndex((r) => r.id === rowId)
    const startCol = shown.findIndex((d) => d.id === colId)
    if (startRow < 0 || startCol < 0) return
    const extra: NewRow[] = []
    block.forEach((line, i) => {
      const cells: Record<string, string> = {}
      const patch: RowEdit = { cells }
      line.forEach((value, j) => {
        const def = shown[startCol + j]
        if (!def) return
        if (def.kind === 'name') patch.name = value
        else cells[def.id] = value
      })
      const target = order[startRow + i]
      if (target?.kind === 'item') editItem(target.id, patch)
      else if (target?.kind === 'new') editNew(target.id, patch)
      else {
        const row = blankRow(inherited(extra[extra.length - 1]))
        extra.push({ ...row, name: patch.name ?? row.name, cells: { ...row.cells, ...cells } })
      }
    })
    if (extra.length > 0) setNewRows((prev) => [...prev, ...extra])
  }

  function toggle(id: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const addRow = useCallback(() => {
    setNewRows((prev) => [...prev, blankRow(inherited(prev[prev.length - 1]))])
    // inherited reads items, baseCells and defs (baseCells changes together
    // with items) and the categories in view
  }, [items, defs, oneCategory, cats, visible])

  // Printing needs every row on the page, not the windowed ones. Cmd+P and the
  // link both go through the same state; flushSync so the rows exist before
  // the browser takes its snapshot.
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

  // What is on screen, like the count beside it: a filtered register says what
  // the filter leaves, not what the register holds (elzacka, 22 September 2026)
  const sums = useMemo(() => totals(visible, properties), [visible, properties])
  const narrowed = visible.length !== items.length

  // Adding or editing rows is one mode, selecting rows is another. Never both.
  const editing = newRows.length > 0 || dirtyIds.length > 0
  useEffect(() => {
    if (editing) setSelected(new Set())
  }, [editing])
  const lastNewId = newRows[newRows.length - 1]?.tempId
  // A new row comes after every other. Added from the foot it is already
  // where the pointer is and stays put; added from the head, with hundreds of
  // things above it, it is brought to the middle of the screen, or nothing
  // would seem to happen.
  useEffect(() => {
    if (!lastNewId) return
    const input = document.querySelector<HTMLElement>(`input[data-row="${lastNewId}"]`)
    if (!input) return
    const { top, bottom } = input.getBoundingClientRect()
    if (top < 0 || bottom > window.innerHeight - 2 * rowHeight) input.scrollIntoView({ block: 'center', inline: 'nearest' })
  }, [lastNewId])
  // The table waits for a category. Until one is picked the card is its
  // categories and nothing else — but anything that means "show me things"
  // opens it too: a new row, a search, or having no categories to pick
  // between in the first place. The chooser itself is only drawn from two
  // categories up, and a table nobody can reach would be a trap.
  const showTable =
    categoryPicked || newRows.length > 0 || query.trim() !== '' || categoryValues.length <= 1
  const hasRows = showTable && (items.length > 0 || newRows.length > 0)
  const allIds = visible.map((i) => i.id)
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id))

  async function addColumn() {
    const key = columnDraft.key.trim()
    const unit = unitFor(columnDraft.type, columnDraft.unit)
    if (key === '') return
    const col = { key, unit }
    const id = columnId(col)
    if (columns.some((c) => columnId(c) === id)) {
      // A property another category uses: this one uses it too, rather than
      // two properties with one name
      const existing = defs.find((d) => d.id === id)
      const missing =
        existing?.kind === 'prop' && existing.property ? catLabels.filter((c) => !appliesTo(existing.property, [c])) : []
      if (existing?.kind === 'prop' && existing.property && missing.length > 0) {
        const property = existing.property
        try {
          await setPropertyCategories(
            property,
            missing.reduce<string[]>((acc, c) => withCategory({ ...property, categories: acc }, c, true), property.categories ?? []),
          )
        } catch (err) {
          console.error(errorText(err))
          setColumnError(t.error.saveFailed)
          return
        }
        setColumnError(null)
        setColumnDraft({ key: '', unit: '', type: 'text', options: '', onlyHere: true })
        openPanel(null)
        return
      }
      // The column may exist and be hidden for holding no value; show it
      // beside the message, so the message can be checked
      setColumnError(t.error.columnExists)
      if (!shown.some((d) => d.id === id)) setShowAllCols(true)
      return
    }
    setColumnError(null)
    const options = columnDraft.type === 'choice' ? parseOptions(columnDraft.options) : []
    const only = columnDraft.onlyHere ? catLabels : []
    try {
      await addProperty({
        id,
        key,
        unit,
        type: columnDraft.type,
        ...(options.length > 0 ? { options } : {}),
        ...(only.length > 0 ? { categories: only } : {}),
        createdAt: Date.now(),
      })
    } catch (err) {
      console.error(errorText(err))
      setColumnError(t.error.saveFailed)
      return
    }
    setColumnDraft({ key: '', unit: '', type: 'text', options: '', onlyHere: true })
    setAddingColumn(false)
  }

  // Narrows a column to the category in view, or takes it back out again. A
  // column that only ever lived in item values gets a definition on the way.
  async function scopeColumn(def: ColumnDef, category: string) {
    closeMenu()
    if (def.kind !== 'prop') return
    const property: Property = def.property ?? {
      id: def.id,
      key: def.col.key,
      unit: def.col.unit,
      type: def.type,
      createdAt: Date.now(),
    }
    try {
      await setPropertyCategories(property, withCategory(def.property, category, !claimedBy(def.property, cats)))
    } catch (err) {
      console.error(errorText(err))
      setError(t.error.saveFailed)
    }
  }

  // Swaps a column with its neighbour and stores the whole order.
  function closeMenu() {
    for (const d of document.querySelectorAll<HTMLDetailsElement>('details.col-menu[open]')) d.open = false
    setMenuPos(null)
  }

  async function moveColumn(def: ColumnDef, dir: -1 | 1) {
    closeMenu()
    const list = [...defs]
    const i = list.findIndex((d) => d.id === def.id)
    const j = i + dir
    if (i < 0 || j < 0 || j >= list.length) return
    const a = list[i]
    const b = list[j]
    if (!a || !b) return
    list[i] = b
    list[j] = a
    await setColumnOrder(list)
  }

  async function commitRename() {
    if (!renaming) return
    const key = renaming.key.trim()
    if (key === '') return
    const { def } = renaming
    if (def.kind !== 'prop') {
      setError(null)
      await setFieldSettings({ ...fields, [def.kind]: { ...fields[def.kind], label: key } })
      setRenaming(null)
      return
    }
    const unit = unitFor(renaming.type, renaming.unit)
    const fromId = def.id
    const nextId = columnId({ key, unit })
    if (nextId !== fromId && columns.some((c) => columnId(c) === nextId)) {
      setError(t.error.columnExists)
      return
    }
    setError(null)
    await renameProperty(
      fromId,
      {
        id: nextId,
        key,
        unit,
        type: renaming.type,
        options: renaming.type === 'choice' && def.property?.options ? def.property.options : [],
      },
      (s) => columnId({ key: s.key, unit: s.unit }) === fromId,
    )
    // Unsaved edits in that column follow it to the new id.
    if (nextId !== fromId) {
      const move = (cells: Record<string, string>) => {
        if (!(fromId in cells)) return cells
        const { [fromId]: v, ...rest } = cells
        return { ...rest, [nextId]: v ?? '' }
      }
      setEdits((prev) =>
        Object.fromEntries(Object.entries(prev).map(([id, e]) => [id, { ...e, cells: move(e.cells ?? {}) }])),
      )
      setNewRows((prev) => prev.map((r) => ({ ...r, cells: move(r.cells) })))
    }
    setRenaming(null)
  }

  // Every property but Kategori, as Endre egenskaper edits it. Every one
  // carries its values as alternatives, so a column turned into a Valgliste
  // there shows what its alternatives will be.
  function propertyRows(): PropertyRow[] {
    return defs.flatMap((d) => {
      if (d.kind !== 'prop' || d.id === categoryColumnId) return []
      const unit = d.type === 'number' ? (d.col.unit ?? '') : ''
      const categories = d.property?.categories ?? []
      const options = optionValues(items, d.id, d.property?.options).map((o) => ({
        key: o.label,
        from: o.label,
        name: o.label,
        count: o.count,
        mixed: o.mixed,
        remove: false,
      }))
      return [
        {
          id: d.id,
          key: d.col.key,
          type: d.type,
          unit,
          categories,
          options,
          remove: false,
          count: usedBy(d.col),
          was: { key: d.col.key, type: d.type, unit, categories },
        },
      ]
    })
  }

  // Endre egenskaper stored: removals first, then names, types and units
  // (renameProperty carries every thing's value along), then categories,
  // then a Valgliste's alternatives, on the things and in its list
  async function savePropertyEdit(rows: PropertyRow[]) {
    if (dirtyCount > 0) {
      setError(t.properties.dirtyFirst)
      return
    }
    const kept = rows.filter((r) => !r.remove)
    const nextIds = kept.map((r) => columnId({ key: r.key.trim() || r.was.key, unit: unitFor(r.type, r.unit) }))
    const taken = new Set(columns.map((c) => columnId(c)).filter((id) => !rows.some((r) => r.id === id)))
    if (nextIds.some((id, i) => taken.has(id) || nextIds.indexOf(id) !== i)) {
      setError(t.error.columnExists)
      return
    }
    setError(null)
    try {
      for (const r of rows.filter((x) => x.remove)) {
        await removeProperty(r.id, (s) => columnId({ key: s.key, unit: s.unit }) === r.id)
      }
      for (const [i, r] of kept.entries()) {
        const def = defs.find((d) => d.id === r.id)
        if (def?.kind !== 'prop') continue
        const key = r.key.trim() || r.was.key
        const unit = unitFor(r.type, r.unit)
        const id = nextIds[i] ?? r.id
        const options = def.property?.options ?? []
        if (key !== r.was.key || r.type !== r.was.type || r.unit.trim() !== r.was.unit) {
          await renameProperty(r.id, { id, key, unit, type: r.type, options }, (s) => columnId({ key: s.key, unit: s.unit }) === r.id)
        }
        const sameCats =
          r.categories.length === r.was.categories.length && r.categories.every((c) => r.was.categories.includes(c))
        if (!sameCats) {
          await setPropertyCategories(
            {
              id,
              key,
              unit,
              type: r.type,
              createdAt: def.property?.createdAt ?? Date.now(),
              ...(def.property?.order !== undefined ? { order: def.property.order } : {}),
              ...(options.length > 0 ? { options } : {}),
            },
            r.categories,
          )
        }
        const optEdit = optionEdit(r.options)
        if (r.type === 'choice' && !isEmptyEdit(optEdit)) await setPropertyOptions(id, optEdit)
      }
    } catch (err) {
      console.error(errorText(err))
      setError(t.error.saveFailed)
      return
    }
    // A filter on a renamed alternative follows it; one on a removed alternative goes
    let nextFilters = filters
    for (const r of kept) {
      const chosen = filters[r.id]
      const optEdit = optionEdit(r.options)
      if (!chosen || chosen.length === 0 || r.type !== 'choice' || isEmptyEdit(optEdit)) continue
      const gone = new Set(optEdit.removed.map(valueKey))
      const next = chosen
        .filter((k) => !gone.has(k))
        .map((k) => {
          const hit = optEdit.renames.find(([from]) => valueKey(from) === k)
          return hit ? valueKey(hit[1]) : k
        })
      nextFilters = { ...nextFilters, [r.id]: [...new Set(next)] }
    }
    if (nextFilters !== filters) onFiltersChange(nextFilters)
    openPanel(null)
  }

  function usedBy(col: Column): number {
    const id = columnId(col)
    return items.filter((i) => i.specs.some((s) => columnId({ key: s.key, unit: s.unit }) === id)).length
  }

  // Unused property column goes at once; a used one, and Kategori, ask first.
  async function requestRemoveColumn(def: ColumnDef) {
    closeMenu()
    if (def.kind === 'prop' && usedBy(def.col) === 0) await doRemoveColumn(def)
    else setRemovingColumn(def)
  }

  async function doRemoveColumn(def: ColumnDef) {
    if (def.kind === 'prop') {
      const id = def.id
      await removeProperty(id, (s) => columnId({ key: s.key, unit: s.unit }) === id)
      const drop = (cells: Record<string, string>) => {
        const { [id]: _gone, ...rest } = cells
        return rest
      }
      setEdits((prev) =>
        Object.fromEntries(Object.entries(prev).map(([rid, e]) => [rid, { ...e, cells: drop(e.cells ?? {}) }])),
      )
      setNewRows((prev) => prev.map((r) => ({ ...r, cells: drop(r.cells) })))
    }
    setRemovingColumn(null)
  }

  async function save() {
    setError(null)
    const added = newRows.filter(touched)
    const missingName =
      added.filter((r) => r.name.trim() === '').length +
      dirtyIds.filter((id) => (edits[id]?.name ?? 'x').trim() === '').length
    if (missingName > 0) {
      setError(t.error.rowsMissingName(missingName))
      return
    }
    for (const def of defs) {
      // Numbers and dates are checked; a place, like text, is whatever was typed
      if (def.kind !== 'prop' || def.type === 'text' || def.type === 'choice' || def.type === 'path') continue
      const values = [
        ...added.map((r) => r.cells[def.id] ?? ''),
        ...dirtyIds.map((id) => edits[id]?.cells?.[def.id] ?? ''),
      ].filter((v) => v.trim() !== '')
      const bad = values.filter((v) =>
        def.type === 'number' ? parseNumber(v) === null : parseDateInput(v) === null,
      ).length
      if (bad > 0) {
        setError(def.type === 'number' ? t.error.notNumbers(bad, def.col.key) : t.error.notDates(bad, def.col.key))
        return
      }
    }
    if (added.length === 0 && dirtyIds.length === 0) return
    setSaving(true)
    try {
      await saveBatch(
        added.map((r) => inputFrom({ ...r, photos: [] }, columns)),
        dirtyIds.flatMap((id) => {
          const item = items.find((i) => i.id === id)
          if (!item) return []
          const cells = { ...(baseCells.get(id) ?? {}), ...(edits[id]?.cells ?? {}) }
          return [
            {
              id,
              input: inputFrom(
                {
                  name: value(item, 'name'),
                  cells,
                  photos: item.photos,
                },
                columns,
              ),
            },
          ]
        }),
      )
      setEdits({})
      setNewRows([])
      setSelected(new Set())
      setActive(null)
    } catch (err) {
      console.error(errorText(err))
      setError(t.error.saveFailed)
    } finally {
      setSaving(false)
    }
  }

  async function deleteSelected() {
    await deleteItems([...selected])
    setSelected(new Set())
    setConfirmingDelete(false)
  }

  // Back to the view as it was: drop unsaved rows, edits and columns.
  function reset() {
    setNewRows([])
    setEdits({})
    setRemovingColumn(null)
    setSelected(new Set())
    setAddingColumn(false)
    setEditingCategories(false)
    setEditingProperties(false)
    setBulk(null)
    setColumnDraft({ key: '', unit: '', type: 'text', options: '', onlyHere: true })
    setConfirmingDelete(false)
    setConfirmingDiscard(false)
    setError(null)
    setActive(null)
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
  }

  // Column menus are native <details>; a click outside or any scroll closes the open one.
  useEffect(() => {
    const closeAll = () => {
      for (const d of document.querySelectorAll<HTMLDetailsElement>('details.col-menu[open]')) d.open = false
      setMenuPos(null)
    }
    const onDown = (e: MouseEvent) => {
      if (!(e.target instanceof Node)) return
      const open = document.querySelector<HTMLDetailsElement>('details.col-menu[open]')
      const inMenu = e.target instanceof Element && e.target.closest('.col-menu-list') !== null
      if (open && !open.contains(e.target) && !inMenu) closeAll()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('scroll', closeAll, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('scroll', closeAll, true)
    }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (e.target instanceof HTMLElement && e.target.id === 'search') return
      if (picking) {
        closePicker()
        return
      }
      if (addMenu) {
        closeAddMenu()
        return
      }
      if (renaming) {
        setRenaming(null)
        return
      }
      if (confirmingDiscard || confirmingDelete || removingColumn) {
        setConfirmingDiscard(false)
        setConfirmingDelete(false)
        setRemovingColumn(null)
        return
      }
      if (dirtyCount === 0) reset()
      else setConfirmingDiscard(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <div className="stack">
      <div className={`table-card${reporting ? ' is-report' : ''}`} ref={cardRef}>
        <div className="overview-head" ref={headRef}>
          <div className="head-row">
          {/* Kategori is the view, not a filter menu: one click changes the rows,
              the columns and the filters under them. Only worth a control
              once there is more than one category to choose between. One
              button says which category this is, or Velg kategori until one
              is picked, and opens the choice as a dropdown under it: Alle,
              then every category with its glyph and count, and once a table
              shows, Velg kategori above them as the way back to none. */}
          {categoryValues.length > 1 && (
            <>
              {/* The app's select field without its frame, in both states:
                  the chevron says it is a choice and not a heading */}
              <button
                type="button"
                ref={currentRef}
                className={`select category-select${showTable ? '' : ' is-placeholder'}`}
                aria-haspopup="menu"
                aria-expanded={picking}
                aria-label={showTable ? t.categoryPicker.change(currentLabel) : t.categoryPicker.label}
                onClick={() => (picking ? closePicker() : openPicker())}
              >
                {showTable &&
                  (cats.length === 0 ? (
                    <Icon name={allCategoriesIcon} size={20} />
                  ) : (
                    <CategoryIcon
                      id={cats.length === 1 ? categoryIconFor(currentLabel, chosenIcons) : otherCategoryIcon}
                      size={20}
                    />
                  ))}
                <span>{showTable ? currentLabel : t.categoryPicker.label}</span>
              </button>
              {picking &&
                pickerPos &&
                createPortal(
                  <div
                    ref={pickerRef}
                    className="category-menu"
                    role="menu"
                    aria-label={t.categoryPicker.label}
                    style={{ top: pickerPos.top, left: pickerPos.left, minWidth: pickerPos.width, maxHeight: pickerPos.maxHeight }}
                    onKeyDown={onMenuKey}
                  >
                    {/* Clears every tick: back to Velg kategori and no table.
                        Only once something is chosen */}
                    {showTable && (
                      <button
                        type="button"
                        role="menuitem"
                        className="category-menu-item category-menu-placeholder"
                        onClick={unpickCategory}
                      >
                        <span className="category-menu-name">{t.categoryPicker.clear}</span>
                      </button>
                    )}
                    <button
                      type="button"
                      role="menuitemradio"
                      aria-checked={showTable && cats.length === 0}
                      className={`category-menu-item${showTable && cats.length === 0 ? ' is-active' : ''}`}
                      onClick={() => pickCategory(null)}
                    >
                      <span className="category-menu-check" aria-hidden="true">
                        {showTable && cats.length === 0 && <Icon name="check" size={18} />}
                      </span>
                      <Icon name={allCategoriesIcon} size={20} />
                      <span className="category-menu-name">{t.categoryPicker.all}</span>
                      <span className="category-menu-count num">{searched.length}</span>
                    </button>
                    {categoryValues.map((v) => {
                      const on = cats.includes(v.key)
                      return (
                        <button
                          key={v.key}
                          type="button"
                          role="menuitemcheckbox"
                          aria-checked={on}
                          className={`category-menu-item${on ? ' is-active' : ''}`}
                          onClick={() => toggleCategory(v.key)}
                        >
                          <span className="category-menu-check" aria-hidden="true">
                            {on && <Icon name="check" size={18} />}
                          </span>
                          <CategoryIcon id={categoryIconFor(v.label, chosenIcons)} />
                          <span className="category-menu-name">{v.label}</span>
                          <span className="category-menu-count num">{v.count}</span>
                        </button>
                      )
                    })}
                    {/* Names, icons and new categories: the panel in the band */}
                    <button
                      type="button"
                      role="menuitem"
                      className="category-menu-item category-menu-edit"
                      onClick={() => {
                        setPicking(false)
                        openPanel('categories')
                      }}
                    >
                      <span className="category-menu-check" aria-hidden="true" />
                      <Icon name="edit" size={20} />
                      <span className="category-menu-name">{t.categories.edit}</span>
                    </button>
                  </div>,
                  document.body,
                )}
            </>
          )}
          {/* Every action on the register, header style: add (a thing or a
              property, from a menu), and the two reports, which take what is
              on screen. Only add while no table is showing: the reports act
              on a table that is not there. */}
          {selected.size > 0 ? (
            /* Ticked things: what can be done with all of them at once, in
               place of the register's own actions until the ticks go */
            <div className="row head-actions selection-bar" role="toolbar" aria-label={t.selection.count(selected.size)}>
              <span className="selection-count num">{t.selection.count(selected.size)}</span>
              <button
                type="button"
                className={`btn${bulk ? ' is-active' : ''}`}
                aria-expanded={bulk !== null}
                aria-controls="bulk-form"
                onClick={() => openPanel(bulk ? null : 'bulk')}
              >
                {t.selection.edit}
              </button>
              <button
                type="button"
                className={`btn${printPick && printOnly ? ' is-active' : ''}`}
                aria-expanded={printPick !== null && printOnly !== null}
                aria-controls="print-form"
                onClick={() => openPanel(printPick && printOnly ? null : 'print-selected')}
              >
                {t.selection.print}
              </button>
              <button
                type="button"
                className="btn"
                onClick={() =>
                  downloadText(
                    exportFilename('csv'),
                    toCsv(
                      visible.filter((i) => selected.has(i.id)),
                      properties,
                      fields,
                    ),
                    'text/csv;charset=utf-8',
                  )
                }
              >
                {t.selection.csv}
              </button>
              <button
                type="button"
                className="btn btn-danger"
                disabled={confirmingDelete}
                onClick={() => setConfirmingDelete(true)}
              >
                <Icon name="delete" size={20} />
                {t.selection.delete}
              </button>
              <button
                type="button"
                className="btn btn-icon"
                aria-label={t.selection.clear}
                onClick={() => {
                  setSelected(new Set())
                  openPanel(null)
                }}
              >
                <Icon name="close" />
              </button>
            </div>
          ) : (
          <div className="row head-actions">
            <button
              type="button"
              ref={addRef}
              className={`btn btn-icon${addMenu || addingColumn ? ' is-active' : ''}`}
              aria-label={t.table.add}
              aria-haspopup="menu"
              aria-expanded={addMenu !== null}
              onClick={() => (addMenu ? closeAddMenu() : openAddMenu())}
            >
              <Icon name="add" />
            </button>
            {addMenu &&
              createPortal(
                <div
                  ref={addMenuRef}
                  className="col-menu-list add-menu"
                  role="menu"
                  aria-label={t.table.add}
                  style={{ top: addMenu.top, right: addMenu.right }}
                  onKeyDown={onMenuKey}
                >
                  <button
                    type="button"
                    className="col-menu-item"
                    role="menuitem"
                    onClick={() => {
                      setAddMenu(null)
                      addRow()
                    }}
                  >
                    {t.table.addRow}
                  </button>
                  <button
                    type="button"
                    className="col-menu-item"
                    role="menuitem"
                    onClick={() => {
                      setAddMenu(null)
                      openPanel('columns')
                    }}
                  >
                    {t.table.addColumnMenu}
                  </button>
                </div>,
                document.body,
              )}
            {showTable && items.length > 0 && (
              <button
                type="button"
                className="btn btn-icon"
                aria-label={t.report.csv}
                onClick={() => downloadText(exportFilename('csv'), toCsv(visible, properties, fields), 'text/csv;charset=utf-8')}
              >
                <Icon name="download" />
              </button>
            )}
            {showTable && items.length > 0 && (
              <button
                type="button"
                className={`btn btn-icon${printPick ? ' is-active' : ''}`}
                aria-label={t.report.print}
                aria-expanded={printPick !== null}
                aria-controls="print-form"
                onClick={() => openPanel(printPick ? null : 'print')}
              >
                <Icon name="print" />
              </button>
            )}
          </div>
          )}
          </div>
          {showTable && (
          <p className="summary">
            {/* What is on screen and the whole register */}
            <strong>
              {items.length === 0
                ? t.list.empty
                : narrowed
                  ? t.summary.shown(visible.length, items.length)
                  : t.summary.things(items.length)}
            </strong>
            {sums.map((x) => (
              <span key={x.key}>{t.summary.total(x.key, `${formatNumber(x.sum)} ${x.unit}`)}</span>
            ))}
            {(extra > 0 || showAllCols) && (
              <button type="button" className="summary-link" onClick={() => setShowAllCols((v) => !v)}>
                {showAllCols ? t.table.hideMore : t.table.showMore(extra)}
              </button>
            )}
          </p>
          )}
        </div>

        {(printPick || searchOpen || addingColumn || editingCategories || editingProperties || bulk) && (
        <div className="controls">

          {printPick && (
            <form
              id="print-form"
              className="stack-sm"
              onSubmit={(e) => {
                e.preventDefault()
                // The choice must be in the DOM before the browser takes its
                // snapshot, and a photo that has not decoded yet prints blank.
                flushSync(() => {
                  setPrintCols(printPick)
                  setPrintGroup(draftGroup)
                  setPrintPhotos(draftPhotos)
                  setPrintPick(null)
                  setPrinting(true)
                })
                void waitForPhotos().then(() => window.print())
              }}
            >
              <p className="field-label">{t.report.pick}</p>
              {printOnly && <p className="hint">{t.selection.printing(printOnly.size)}</p>}
              {/* Only the link that would change something: Velg alle while a
                  column is left out, Fjern alle while one is in */}
              <div className="row toolbar">
                {shownAll.some((d) => d.kind !== 'name' && !printPick.has(d.id)) && (
                  <button
                    type="button"
                    className="summary-link"
                    onClick={() => setPrintPick(new Set(shownAll.map((d) => d.id)))}
                  >
                    {t.report.pickAll}
                  </button>
                )}
                {shownAll.some((d) => d.kind !== 'name' && printPick.has(d.id)) && (
                  <button type="button" className="summary-link" onClick={() => setPrintPick(new Set())}>
                    {t.report.pickNone}
                  </button>
                )}
              </div>
              <div className="row toolbar">
                {shownAll.map((def) => (
                  <label key={def.id} className="check-option">
                    <input
                      type="checkbox"
                      checked={def.kind === 'name' || printPick.has(def.id)}
                      disabled={def.kind === 'name'}
                      onChange={(e) =>
                        setPrintPick((p) => {
                          const next = new Set(p)
                          if (e.target.checked) next.add(def.id)
                          else next.delete(def.id)
                          return next
                        })
                      }
                    />
                    <span>{labelOf(def)}</span>
                  </label>
                ))}
              </div>
              {/* What shape the paper takes. Either of these turns the table
                  into the report: the things one under the other, under
                  headings that add up. */}
              {(groupChoices.length > 0 || anyPhoto) && (
                <div className="row toolbar print-shape">
                  {groupChoices.length > 0 && (
                    <div className="field">
                      <label htmlFor="print-group">{t.report.groupBy}</label>
                      <select
                        id="print-group"
                        className="select input-key"
                        value={draftGroup ?? ''}
                        onChange={(e) => setDraftGroup(e.target.value === '' ? null : e.target.value)}
                      >
                        <option value="">{t.report.groupNone}</option>
                        {groupChoices.map((def) => (
                          <option key={def.id} value={def.id}>
                            {def.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  {anyPhoto && (
                    <div className="field">
                      <label className="check-option">
                        <input
                          type="checkbox"
                          checked={draftPhotos}
                          onChange={(e) => setDraftPhotos(e.target.checked)}
                        />
                        <span>{t.report.withPhotos}</span>
                      </label>
                    </div>
                  )}
                </div>
              )}
              <div className="row">
                <button type="submit" className="btn btn-primary">
                  {t.report.print}
                </button>
                <button type="button" className="btn" onClick={() => setPrintPick(null)}>
                  {t.action.cancel}
                </button>
              </div>
            </form>
          )}


          {bulk && (
            <form
              id="bulk-form"
              className="stack-sm"
              onSubmit={(e) => {
                e.preventDefault()
                applyBulk()
              }}
            >
              <p className="field-label">{t.selection.editTitle(selected.size)}</p>
              <div className="row toolbar">
                <div className="field">
                  <label htmlFor="bulk-prop">{t.selection.property}</label>
                  <select
                    id="bulk-prop"
                    className="select input-key"
                    value={bulk.defId}
                    onChange={(e) => setBulk({ ...bulk, defId: e.target.value })}
                  >
                    {bulkDefs.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.col.key}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="bulk-value">{t.selection.value}</label>
                  <input
                    id="bulk-value"
                    className="input input-key"
                    list={
                      bulkDefs.find((d) => d.id === bulk.defId && (d.type === 'choice' || d.type === 'path'))
                        ? choiceListId(bulk.defId)
                        : undefined
                    }
                    value={bulk.value}
                    onChange={(e) => setBulk({ ...bulk, value: e.target.value })}
                    autoFocus
                  />
                </div>
                <div className="field field-actions">
                  <button type="submit" className="btn btn-primary">
                    {t.selection.apply}
                  </button>
                  <button type="button" className="btn" onClick={() => openPanel(null)}>
                    {t.action.cancel}
                  </button>
                </div>
              </div>
              <p className="hint">{t.selection.editHint}</p>
            </form>
          )}

          {editingProperties && (
            <PropertyEditor
              key={optionsFor ?? ''}
              rows={propertyRows()}
              categories={allCategories.map((c) => c.label)}
              open={optionsFor}
              onSave={savePropertyEdit}
              onClose={() => openPanel(null)}
            />
          )}

          {editingCategories && (
            <CategoryEditor
              categories={allCategories}
              icons={chosenIcons}
              onSave={saveCategoryEdit}
              onClose={() => openPanel(null)}
            />
          )}

          {searchOpen && (
            <div className="search-bar">
              <SearchField
                value={query}
                onChange={onQueryChange}
                onClose={onSearchClose}
                tips={tips}
              />
              <FilterPanel
                items={items}
                searched={searched}
                properties={properties}
                fields={fields}
                filters={filters}
                onChange={onFiltersChange}
              />
            </div>
          )}


          {addingColumn && (
            <form
              id="column-form"
              className="stack-sm column-form"
              onSubmit={(e) => {
                e.preventDefault()
                void addColumn()
              }}
            >
              <p className="field-label">{t.table.addColumn}</p>
              <div className="row toolbar">
                <div className="field">
                  <label htmlFor="col-key">{t.table.columnKey}</label>
                  <input
                    id="col-key"
                    aria-describedby="column-help"
                    onFocus={() => setColumnFocus('key')}
                    className="input input-key"
                    value={columnDraft.key}
                    onChange={(e) => {
                      setColumnDraft({ ...columnDraft, key: e.target.value })
                      setColumnError(null)
                    }}
                    autoFocus
                  />
                </div>
                <div className="field">
                  <label htmlFor="col-type">{t.table.columnType}</label>
                  <select
                    id="col-type"
                    aria-describedby="column-help"
                    onFocus={() => setColumnFocus('type')}
                    className="select input-narrow"
                    value={columnDraft.type}
                    onChange={(e) => setColumnDraft({ ...columnDraft, type: e.target.value as PropertyType })}
                  >
                    {(propertyTypes).map((ty) => (
                      <option key={ty} value={ty}>
                        {t.table.types[ty]}
                      </option>
                    ))}
                  </select>
                </div>
                {columnDraft.type === 'choice' && (
                  <div className="field">
                    <label htmlFor="col-options">{t.table.columnOptions}</label>
                    <input
                      id="col-options"
                      aria-describedby="column-help"
                      onFocus={() => setColumnFocus('options')}
                      className="input input-key"
                      value={columnDraft.options}
                      onChange={(e) => setColumnDraft({ ...columnDraft, options: e.target.value })}
                    />
                  </div>
                )}
                {columnDraft.type === 'number' && (
                  <div className="field">
                    <label htmlFor="col-unit">
                      {t.table.columnUnit} <span className="hint">({t.table.columnUnitOptional})</span>
                    </label>
                    <input
                      id="col-unit"
                      aria-describedby="column-help"
                      onFocus={() => setColumnFocus('unit')}
                      className="input input-narrow"
                      list="unit-options"
                      value={columnDraft.unit}
                      onChange={(e) => setColumnDraft({ ...columnDraft, unit: e.target.value })}
                    />
                  </div>
                )}
                {catLabels.length > 0 && (
                  <div className="field">
                    <label className="check-option">
                      <input
                        type="checkbox"
                        aria-describedby="column-help"
                        onFocus={() => setColumnFocus('scope')}
                        checked={columnDraft.onlyHere}
                        onChange={(e) => setColumnDraft({ ...columnDraft, onlyHere: e.target.checked })}
                      />
                      <span>{t.table.onlyIn(listFormat.format(catLabels))}</span>
                    </label>
                  </div>
                )}
                <div className="field field-actions">
                  <button type="submit" className="btn btn-primary">
                    {t.table.columnAdd}
                  </button>
                  <button type="button" className="btn" onClick={() => openPanel(null)}>
                    {t.action.close}
                  </button>
                </div>
              </div>
              {columnError && (
                <p className="error" role="alert">
                  {columnError}
                </p>
              )}
              <p id="column-help" className="hint column-help">
                {columnHelp()}
              </p>
              <div className="row">
                <button type="button" className="summary-link" onClick={() => openPanel('properties')}>
                  {t.properties.edit}
                </button>
              </div>
            </form>
          )}
        </div>
        )}

        <div className="print-only">
          <h1 className="title">{t.report.docTitle}</h1>
          <p className="hint">{t.report.subtitle(formatDate(Date.now()), listed.length)}</p>
        </div>

        {reporting && (
          <PrintReport
            groups={reportGroups}
            columns={reportColumns}
            properties={reportProperties}
            photos={printPhotos}
            groupId={printGroup}
            groupKey={groupLabel}
          />
        )}

        {confirmingDiscard && (
          <div className="confirm" role="alertdialog" aria-labelledby="confirm-discard">
            <p id="confirm-discard">{t.confirm.saveOrDiscard}</p>
            <div className="row">
              <button
                type="button"
                className="btn btn-primary"
                autoFocus
                onClick={() => {
                  setConfirmingDiscard(false)
                  void save()
                }}
              >
                {t.action.save}
              </button>
              <button type="button" className="btn" onClick={reset}>
                {t.confirm.discard}
              </button>
            </div>
          </div>
        )}

        {removingColumn && (
          <div className="confirm" role="alertdialog" aria-labelledby="confirm-column">
            <p id="confirm-column">
              {removingColumn.kind === 'prop' && t.table.removeColumnConfirm(removingColumn.col.key, usedBy(removingColumn.col))}
            </p>
            <div className="row">
              <button
                type="button"
                className="btn btn-danger"
                autoFocus
                onClick={() => void doRemoveColumn(removingColumn)}
              >
                {t.table.removeColumnAction}
              </button>
              <button type="button" className="btn" onClick={() => setRemovingColumn(null)}>
                {t.action.cancel}
              </button>
            </div>
          </div>
        )}

        {confirmingDelete && (
          <div className="confirm" role="alertdialog" aria-labelledby="confirm-many">
            <p id="confirm-many">{t.confirm.deleteMany(selected.size)}</p>
            <div className="row">
              <button type="button" className="btn btn-danger" onClick={deleteSelected} autoFocus>
                {t.action.delete}
              </button>
              <button type="button" className="btn" onClick={() => setConfirmingDelete(false)}>
                {t.action.cancel}
              </button>
            </div>
          </div>
        )}

        {/* Alphabetical by the word: the symbols mix letters with ° and å
            and would not sort the way anyone reads them */}
        <datalist id="unit-options">
          {[...t.table.unitOptions].sort((a, b) => a[1].localeCompare(b[1], 'nb')).map(([symbol, word]) => (
            <option key={symbol} value={symbol} label={word} />
          ))}
        </datalist>
        {defs.map(
          (def) => {
            if (def.kind !== 'prop') return null
            // A place offers every place in use and every place on the way to
            // one, so the shelf is one pick and the loft another.
            if (def.type === 'path') {
              const places = pathsInUse(
                items.flatMap((i) => {
                  const spec = i.specs.find((x) => columnId({ key: x.key, unit: x.unit }) === def.id)
                  return spec ? [spec.value] : []
                }),
              )
              return (
                <datalist key={def.id} id={choiceListId(def.id)}>
                  {places.map((v) => (
                    <option key={v} value={v} />
                  ))}
                </datalist>
              )
            }
            if (def.type !== 'choice') return null
            // The same list Endre alternativer shows: alphabetical, one line
            // per value however it was typed
            return (
              <datalist key={def.id} id={choiceListId(def.id)}>
                {optionValues(items, def.id, def.property?.options).map((o) => (
                  <option key={o.label} value={o.label} />
                ))}
              </datalist>
            )
          },
        )}
        <datalist id="name-options">
          {names.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>

        {hasRows && (
          <Grid
            defs={shown}
            widths={effectiveWidths}
            sort={sort}
            onWidth={onWidth}
            hasSelection={selected.size > 0}
            allRows={printing}
            wrap={wrap}
            headHeight={headHeight}
            label={labelOf}
            onPaste={onPaste}
            onLeave={() => setNewRows((prev) => (prev.every(touched) ? prev : prev.filter(touched)))}
            headerCheck={
              <>
                {allIds.length > 0 && !editing && (
                  <input
                    type="checkbox"
                    aria-label={t.table.selectAll}
                    checked={allSelected}
                    onChange={(e) => setSelected(e.target.checked ? new Set(allIds) : new Set())}
                  />
                )}
              </>
            }
            header={(def, index) => (
              <>
                {renaming && renaming.def.id === def.id ? (
                  <form
                    className="row grid-col-rename"
                    onSubmit={(e) => {
                      e.preventDefault()
                      void commitRename()
                    }}
                  >
                    <input
                      className="input"
                      aria-label={t.table.columnKey}
                      value={renaming.key}
                      onChange={(e) => setRenaming({ ...renaming, key: e.target.value })}
                      autoFocus
                    />
                    {def.kind === 'prop' && (
                      <select
                        className="select input-narrow"
                        aria-label={t.table.columnType}
                        value={renaming.type}
                        onChange={(e) => setRenaming({ ...renaming, type: e.target.value as PropertyType })}
                      >
                        {(propertyTypes).map((ty) => (
                          <option key={ty} value={ty}>
                            {t.table.types[ty]}
                          </option>
                        ))}
                      </select>
                    )}
                    {def.kind === 'prop' && renaming.type === 'number' && (
                      <input
                        className="input input-narrow"
                        list="unit-options"
                        aria-label={t.table.columnUnit}
                        value={renaming.unit}
                        onChange={(e) => setRenaming({ ...renaming, unit: e.target.value })}
                      />
                    )}
                    <button type="submit" className="btn btn-icon" aria-label={t.table.renameSave}>
                      <Icon name="check" size={20} />
                    </button>
                    <button
                      type="button"
                      className="btn btn-icon"
                      aria-label={t.table.renameCancel}
                      onClick={() => setRenaming(null)}
                    >
                      <Icon name="close" size={20} />
                    </button>
                  </form>
                ) : (
                  <span className="grid-col-head">
                    <SortHeader def={def} label={labelOf(def)} sort={sort} onSort={onSortChange} />
                    <details
                      className="col-menu"
                      onToggle={(e) => {
                        const d = e.currentTarget
                        if (!d.open) {
                          setMenuPos((p) => (p?.id === def.id ? null : p))
                          return
                        }
                        const r = d.querySelector('summary')?.getBoundingClientRect()
                        if (r) setMenuPos({ id: def.id, top: r.bottom + 2, left: r.left })
                      }}
                    >
                      <summary aria-label={t.table.columnMenu(labelOf(def))}>
                        <Icon name="chevronRight" size={14} className="col-menu-chevron" />
                      </summary>
                    </details>
                    {menuPos?.id === def.id &&
                      createPortal(
                        <div className="col-menu-list" role="menu" style={{ top: menuPos.top, left: menuPos.left }}>
                          <button
                            type="button"
                            className="col-menu-item"
                            role="menuitem"
                            onClick={() => {
                              closeMenu()
                              setRenaming({
                                def,
                                key: labelOf(def),
                                unit: def.kind === 'prop' && def.type === 'number' ? (def.col.unit ?? '') : '',
                                type: def.kind === 'prop' ? def.type : 'text',
                              })
                            }}
                          >
                            <Icon name="edit" size={16} />
                            {t.table.renameColumn}
                          </button>
                          {def.kind === 'prop' && def.type === 'choice' && (
                            <button
                              type="button"
                              className="col-menu-item"
                              role="menuitem"
                              onClick={() => {
                                closeMenu()
                                if (def.id === categoryColumnId) {
                                  openPanel('categories')
                                  return
                                }
                                openPanel('properties')
                                setOptionsFor(def.id)
                              }}
                            >
                              <Icon name="list" size={16} />
                              {def.id === categoryColumnId ? t.categories.edit : t.options.edit}
                            </button>
                          )}
                          {oneCategory !== null && def.kind === 'prop' && def.id !== categoryColumnId && (
                            <button
                              type="button"
                              className="col-menu-item"
                              role="menuitem"
                              onClick={() => void scopeColumn(def, oneCategory)}
                            >
                              <Icon name="label" size={16} />
                              {claimedBy(def.property, cats)
                                ? t.table.notIn(oneCategory)
                                : (def.property?.categories?.length ?? 0) > 0
                                  ? t.table.alsoIn(oneCategory)
                                  : t.table.onlyIn(oneCategory)}
                            </button>
                          )}
                          <button
                            type="button"
                            className="col-menu-item"
                            role="menuitem"
                            disabled={index <= 1}
                            onClick={() => void moveColumn(def, -1)}
                          >
                            <Icon name="chevronLeft" size={16} />
                            {t.table.moveLeft}
                          </button>
                          <button
                            type="button"
                            className="col-menu-item"
                            role="menuitem"
                            disabled={index === shown.length - 1}
                            onClick={() => void moveColumn(def, 1)}
                          >
                            <Icon name="chevronRight" size={16} />
                            {t.table.moveRight}
                          </button>
                          {def.kind !== 'name' && (
                            <button
                              type="button"
                              className="col-menu-item col-menu-danger"
                              role="menuitem"
                              onClick={() => void requestRemoveColumn(def)}
                            >
                              <Icon name="delete" size={16} />
                              {t.table.removeColumn}
                            </button>
                          )}
                        </div>,
                        document.body,
                      )}
                  </span>
                )}
              </>
            )}
            rowCount={listed.length}
            row={(i) => {
              const item = listed[i]
              if (!item) return null
              return (
                <tr key={item.id} className={dirtyIds.includes(item.id) ? 'is-dirty' : undefined}>
                  <td className="grid-check">
                    {!editing && (
                      <input
                        type="checkbox"
                        aria-label={t.table.selectRow(item.name)}
                        checked={selected.has(item.id)}
                        onChange={(e) => toggle(item.id, e.target.checked)}
                      />
                    )}
                  </td>
                  {shown.map((def) => {
                    const label = t.table.cell(item.name, labelOf(def))
                    const text = def.kind === 'name' ? value(item, 'name') : cell(item, def.col)
                    if (active?.row !== item.id && def.kind === 'name') {
                      return (
                        <td key={def.id}>
                          <NameCell item={item} name={text} />
                        </td>
                      )
                    }
                    const numeric = isNumberColumn(def)
                    if (active?.row !== item.id) {
                      const n = numeric ? parseNumber(text) : null
                      return (
                        <td key={def.id} className={numeric ? 'is-number' : undefined}>
                          <button
                            type="button"
                            className={def.kind === 'prop' ? 'grid-cell num' : 'grid-cell'}
                            aria-label={label}
                            onFocus={() => setActive({ row: item.id, col: def.id })}
                          >
                            {n === null ? text : formatNumber(n)}
                          </button>
                        </td>
                      )
                    }
                    const focus = active.col === def.id ? focusWithoutScroll : undefined
                    return (
                      <td key={def.id} className={numeric ? 'is-number' : undefined}>
                        <input
                          className={def.kind === 'prop' ? 'grid-input num' : 'grid-input'}
                          list={def.kind === 'name' ? 'name-options' : def.type === 'choice' || def.type === 'path' ? choiceListId(def.id) : undefined}
                          aria-label={label}
                          value={text}
                          ref={focus}
                          data-row={item.id}
                          data-col={def.id}
                          onChange={(e) =>
                            editItem(item.id, def.kind === 'name' ? { name: e.target.value } : { cells: { [def.id]: e.target.value } })
                          }
                        />
                      </td>
                    )
                  })}
                </tr>
              )
            }}
            tail={
              <>
                {newRows.map((row) => (
                  <tr key={row.tempId} className="is-new">
                    <td className="grid-check" />
                    {shown.map((def) =>
                      def.kind === 'name' ? (
                        <td key={def.id}>
                          <input
                            className="grid-input"
                            list="name-options"
                            aria-label={t.table.cell(row.name, nameLabel)}
                            value={row.name}
                            onChange={(e) => editNew(row.tempId, { name: e.target.value })}
                            data-row={row.tempId}
                            data-col={def.id}
                            ref={row.tempId === lastNewId && shown[0]?.kind === 'name' ? focusWithoutScroll : undefined}
                          />
                        </td>
                      ) : (
                        <td key={def.id} className={isNumberColumn(def) ? 'is-number' : undefined}>
                          <input
                            className="grid-input num"
                            list={def.type === 'choice' || def.type === 'path' ? choiceListId(def.id) : undefined}
                            aria-label={t.table.cell(row.name, def.col.key)}
                            value={row.cells[def.id] ?? ''}
                            onChange={(e) => editNew(row.tempId, { cells: { [def.id]: e.target.value } })}
                            data-row={row.tempId}
                            data-col={def.id}
                            ref={row.tempId === lastNewId && shown[0]?.id === def.id ? focusWithoutScroll : undefined}
                          />
                        </td>
                      ),
                    )}
                  </tr>
                ))}
                <tr className="grid-ghost" aria-hidden="true">
                  <td className="grid-check" />
                  <td colSpan={shown.length}>
                    <input className="grid-input" placeholder={t.table.addRow} readOnly tabIndex={-1} onFocus={addRow} />
                  </td>
                </tr>
              </>
            }
          />
        )}

        {items.length > 0 && visible.length === 0 && newRows.length === 0 && (
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
      </div>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {dirtyCount > 0 && (
        <div className="row save-bar">
          <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>
            {t.action.save}
          </button>
          <span className="hint" aria-live="polite">
            {t.table.unsaved(dirtyCount)}
          </span>
        </div>
      )}
    </div>
  )
}

// The name is the way to the thing; the thumbnail rides along
function NameCell({ item, name }: { item: Item; name: string }) {
  const url = useObjectUrl(item.photos[0] ?? null)
  return (
    <a className="grid-link" href={href.detail(item.id)}>
      {url && <img className="thumb" src={url} alt="" />}
      {name}
    </a>
  )
}
