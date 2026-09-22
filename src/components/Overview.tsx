import { useCallback, useEffect, useMemo, useRef, useState, type ClipboardEvent } from 'react'
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
  setColumnOrder,
  setFieldSettings,
  setPropertyCategories,
} from '../db/db'
import type { Item, Property, PropertyType } from '../db/schema'
import { distinct, parseNumber } from '../lib/filter'
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
import { cellsFrom, columnId, inputFrom, type Column } from '../lib/grid'
import { searchItems } from '../lib/search'
import { applyFilters, valuesFor, withoutFilter, type Filters } from '../lib/filters'
import { FilterPanel } from './FilterPanel'
import { Grid } from './Grid'
import { PrintReport } from './PrintReport'
import { parseBlock } from '../lib/paste'
import { sortItems, type Sort } from '../lib/sort'
import { t } from '../lib/strings'
import { Icon } from './Icons'
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
  // Columns taken out of the table on Innstillinger; Navn is never among them
  hidden: Set<string>
  // Long values run onto more lines instead of ending in an ellipsis (Innstillinger)
  wrap: boolean
}

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
    options: string
  } | null>(null)
  // The open column menu is fixed to the window so the table's scroll box cannot clip it.
  const [menuPos, setMenuPos] = useState<{ id: string; top: number; left: number } | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [confirmingDiscard, setConfirmingDiscard] = useState(false)
  const [addingColumn, setAddingColumn] = useState(false)
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
  const categoryValues = useMemo(
    () =>
      categoryDef?.kind === 'prop'
        ? valuesFor(withoutFilter(searched, filters, categoryColumnId), categoryDef.col)
        : [],
    [categoryDef, searched, filters],
  )
  const cats = useMemo(() => filters[categoryColumnId] ?? [], [filters])
  // The label to write, and to hand a new row, while exactly one is in view.
  // Read from every thing, not from what is on screen: a search that leaves
  // none of them must not turn Bok back into the folded key.
  const oneCategory = useMemo(() => {
    if (cats.length !== 1 || categoryDef?.kind !== 'prop') return null
    return valuesFor(items, categoryDef.col).find((v) => v.key === cats[0])?.label ?? null
  }, [cats, categoryDef, items])

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
    const fits = (d: ColumnDef) =>
      d.kind === 'name' || (appliesTo(d.property, cats) && (claimedBy(d.property, cats) || used.has(d.id)))
    // With one category in view its own column says the same on every row
    const chosen = defs.filter(
      (d) => d.kind === 'name' || (!hidden.has(d.id) && !(cats.length === 1 && d.id === categoryColumnId)),
    )
    const extra = items.length === 0 ? 0 : chosen.filter((d) => !fits(d)).length
    return { shown: showAllCols || items.length === 0 ? chosen : chosen.filter(fits), extra }
  }, [defs, visible, newRows, filters, showAllCols, items.length, hidden, cats])

  // Skriv ut asks which columns go on paper; Navn always does, and the form
  // starts with Navn alone. Chosen once per session, null before that:
  // everything on screen (Cmd+P without a choice). While the browser takes
  // its snapshot the table itself narrows to the choice.
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
  useEffect(() => {
    const head = headRef.current
    const card = cardRef.current
    if (!head || !card) return
    const set = () => card.style.setProperty('--head-h', `${head.getBoundingClientRect().height}px`)
    set()
    const ro = new ResizeObserver(set)
    ro.observe(head)
    return () => ro.disconnect()
  }, [])
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
    () => (reporting ? groupItems(visible, printGroup) : []),
    [reporting, visible, printGroup],
  )
  // A Valgliste is the only column with few enough values to head a page.
  const groupChoices = useMemo(
    () => defs.flatMap((d) => (d.kind === 'prop' && d.type === 'choice' ? [d] : [])),
    [defs],
  )
  const groupLabel = useMemo(
    () => groupChoices.find((d) => d.id === printGroup)?.col.key ?? null,
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
  // Valgliste and date value (a shop and a purchase date carry down a
  // receipt, a location carries down a shelf). Prices, texts and numbers are
  // the row's own. The first row inherits only the Kategori of the newest thing.
  function inherited(prev?: NewRow): Record<string, string> {
    if (prev) {
      const cells: Record<string, string> = {}
      for (const def of defs) {
        if (def.kind !== 'prop' || (def.type !== 'choice' && def.type !== 'date')) continue
        const v = prev.cells[def.id] ?? ''
        if (v.trim() !== '') cells[def.id] = v
      }
      return cells
    }
    // In a category's own view that is what a new thing is; otherwise the
    // Kategori of the newest thing, which is what the last batch was.
    if (oneCategory !== null) return { [categoryColumnId]: oneCategory }
    const newest = items.reduce<Item | null>((a, i) => (a === null || i.createdAt > a.createdAt ? i : a), null)
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
    // inherited reads items, baseCells and defs; baseCells changes together with items
  }, [items, defs])

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
  const hasRows = items.length > 0 || newRows.length > 0
  const allIds = visible.map((i) => i.id)
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id))

  async function addColumn() {
    const key = columnDraft.key.trim()
    const unit = unitFor(columnDraft.type, columnDraft.unit)
    if (key === '') return
    const col = { key, unit }
    const id = columnId(col)
    if (columns.some((c) => columnId(c) === id)) {
      // The column may exist and be hidden for holding no value; show it
      // beside the message, so the message can be checked
      setColumnError(t.error.columnExists)
      if (!shown.some((d) => d.id === id)) setShowAllCols(true)
      return
    }
    setColumnError(null)
    const options = columnDraft.type === 'choice' ? parseOptions(columnDraft.options) : []
    const only = oneCategory !== null && columnDraft.onlyHere ? [oneCategory] : []
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
        options: renaming.type === 'choice' ? parseOptions(renaming.options) : [],
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
      if (def.kind !== 'prop' || def.type === 'text' || def.type === 'choice') continue
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
    setColumnDraft({ key: '', unit: '', type: 'text', options: '', onlyHere: true })
    setConfirmingDelete(false)
    setConfirmingDiscard(false)
    setError(null)
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
          {/* Every action on the register, header style: add, add a column, and
              the two reports, which take what is on screen */}
          <div className="row">
            {selected.size > 0 && !confirmingDelete && (
              <button type="button" className="btn btn-danger" onClick={() => setConfirmingDelete(true)}>
                <Icon name="delete" size={20} />
                {t.table.deleteSelected(selected.size)}
              </button>
            )}
            <button type="button" className="btn btn-icon" aria-label={t.table.addRow} onClick={addRow}>
              <Icon name="add" />
            </button>
            <button
              type="button"
              className={`btn btn-icon${addingColumn ? ' is-active' : ''}`}
              aria-label={t.table.addColumn}
              aria-expanded={addingColumn}
              aria-controls="column-form"
              onClick={() => setAddingColumn((v) => !v)}
            >
              <Icon name="viewColumn" />
            </button>
            {items.length > 0 && (
              <button
                type="button"
                className="btn btn-icon"
                aria-label={t.report.csv}
                onClick={() => downloadText(exportFilename('csv'), toCsv(visible, properties, fields), 'text/csv;charset=utf-8')}
              >
                <Icon name="download" />
              </button>
            )}
            {items.length > 0 && (
              <button
                type="button"
                className={`btn btn-icon${printPick ? ' is-active' : ''}`}
                aria-label={t.report.print}
                aria-expanded={printPick !== null}
                aria-controls="print-form"
                onClick={() => {
                  setDraftGroup(printGroup)
                  setDraftPhotos(printPhotos)
                  setPrintPick((p) => (p ? null : new Set(printCols ?? [])))
                }}
              >
                <Icon name="print" />
              </button>
            )}
          </div>
          {/* Kategori is the view, not a filter menu: one click changes the rows,
              the columns and the filters under them. Only worth a line once
              there is more than one category to choose between. */}
          {categoryValues.length > 1 && (
            <div className="view-pick" role="group" aria-label={t.view.label}>
              <button
                type="button"
                className={`view-tab${cats.length === 0 ? ' is-active' : ''}`}
                aria-pressed={cats.length === 0}
                onClick={() => onFiltersChange({ ...filters, [categoryColumnId]: [] })}
              >
                {t.view.all}
                <span className="hint num">{searched.length}</span>
              </button>
              {categoryValues.map((v) => {
                const on = cats.length === 1 && cats[0] === v.key
                return (
                  <button
                    key={v.key}
                    type="button"
                    className={`view-tab${on ? ' is-active' : ''}`}
                    aria-pressed={on}
                    onClick={() => onFiltersChange({ ...filters, [categoryColumnId]: on ? [] : [v.key] })}
                  >
                    {v.label}
                    <span className="hint num">{v.count}</span>
                  </button>
                )
              })}
            </div>
          )}
          <p className="summary">
            {/* What is on screen and the whole register; the gaps run their search */}
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
        </div>

        {(printPick || searchOpen || addingColumn) && (
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
              <div className="row toolbar">
                <button
                  type="button"
                  className="summary-link"
                  onClick={() => setPrintPick(new Set(shownAll.map((d) => d.id)))}
                >
                  {t.report.pickAll}
                </button>
                <button type="button" className="summary-link" onClick={() => setPrintPick(new Set())}>
                  {t.report.pickNone}
                </button>
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
                            {def.col.key}
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


          {searchOpen && (
            <div className="search-bar">
              <SearchField
                value={query}
                onChange={onQueryChange}
                onClose={onSearchClose}
                listTip={t.search.tipsTableText}
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
              <div className="row toolbar">
                <div className="field">
                  <label htmlFor="col-key">{t.table.columnKey}</label>
                  <input
                    id="col-key"
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
                    className="select input-narrow"
                    value={columnDraft.type}
                    onChange={(e) => setColumnDraft({ ...columnDraft, type: e.target.value as PropertyType })}
                  >
                    {(['text', 'choice', 'number', 'date'] as const).map((ty) => (
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
                      className="input input-narrow"
                      list="unit-options"
                      value={columnDraft.unit}
                      onChange={(e) => setColumnDraft({ ...columnDraft, unit: e.target.value })}
                    />
                  </div>
                )}
                {oneCategory !== null && (
                  <div className="field">
                    <label className="check-option">
                      <input
                        type="checkbox"
                        checked={columnDraft.onlyHere}
                        onChange={(e) => setColumnDraft({ ...columnDraft, onlyHere: e.target.checked })}
                      />
                      <span>{t.table.onlyIn(oneCategory)}</span>
                    </label>
                  </div>
                )}
                <div className="field field-actions">
                  <button type="submit" className="btn btn-primary">
                    {t.table.columnAdd}
                  </button>
                  <button type="button" className="btn" onClick={() => setAddingColumn(false)}>
                    {t.action.cancel}
                  </button>
                </div>
              </div>
              {columnError && (
                <p className="error" role="alert">
                  {columnError}
                </p>
              )}
            </form>
          )}
        </div>
        )}

        <div className="print-only">
          <h1 className="title">{t.report.docTitle}</h1>
          <p className="hint">{t.report.subtitle(formatDate(Date.now()), visible.length)}</p>
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

        <datalist id="unit-options">
          {t.table.unitOptions.map(([symbol, word]) => (
            <option key={symbol} value={symbol} label={word} />
          ))}
        </datalist>
        {defs.map(
          (def) =>
            def.kind === 'prop' &&
            def.type === 'choice' && (
              <datalist key={def.id} id={choiceListId(def.id)}>
                {[
                  ...new Set([
                    ...(def.property?.options ?? []),
                    ...distinct(items, (i) => {
                      const spec = i.specs.find((x) => columnId({ key: x.key, unit: x.unit }) === def.id)
                      return spec ? String(spec.value) : ''
                    }),
                  ]),
                ].map((v) => (
                  <option key={v} value={v} />
                ))}
              </datalist>
            ),
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
            label={labelOf}
            onPaste={onPaste}
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
                        {(['text', 'choice', 'number', 'date'] as const).map((ty) => (
                          <option key={ty} value={ty}>
                            {t.table.types[ty]}
                          </option>
                        ))}
                      </select>
                    )}
                    {def.kind === 'prop' && renaming.type === 'choice' && (
                      <input
                        className="input"
                        aria-label={t.table.columnOptions}
                        value={renaming.options}
                        onChange={(e) => setRenaming({ ...renaming, options: e.target.value })}
                      />
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
                                options: def.kind === 'prop' ? (def.property?.options ?? []).join(', ') : '',
                              })
                            }}
                          >
                            <Icon name="edit" size={16} />
                            {t.table.renameColumn}
                          </button>
                          {oneCategory !== null && def.kind === 'prop' && def.id !== categoryColumnId && (
                            <button
                              type="button"
                              className="col-menu-item"
                              role="menuitem"
                              onClick={() => void scopeColumn(def, oneCategory)}
                            >
                              <Icon name="viewColumn" size={16} />
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
            rowCount={visible.length}
            row={(i) => {
              const item = visible[i]
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
                    if (active?.row !== item.id) {
                      return (
                        <td key={def.id}>
                          <button
                            type="button"
                            className={def.kind === 'prop' ? 'grid-cell num' : 'grid-cell'}
                            aria-label={label}
                            onFocus={() => setActive({ row: item.id, col: def.id })}
                          >
                            {text}
                          </button>
                        </td>
                      )
                    }
                    const focus = active.col === def.id ? focusWithoutScroll : undefined
                    return (
                      <td key={def.id}>
                        <input
                          className={def.kind === 'prop' ? 'grid-input num' : 'grid-input'}
                          list={def.kind === 'name' ? 'name-options' : def.type === 'choice' ? choiceListId(def.id) : undefined}
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
                        <td key={def.id}>
                          <input
                            className="grid-input num"
                            list={def.type === 'choice' ? choiceListId(def.id) : undefined}
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

      {editing && (
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
