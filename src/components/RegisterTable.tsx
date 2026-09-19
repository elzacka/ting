import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  addProperty,
  deleteItems,
  removeProperty,
  renameProperty,
  saveBatch,
  setColumnOrder,
  setFieldSettings,
} from '../db/db'
import type { Item, Property, PropertyType } from '../db/schema'
import { distinct, parseNumber, specKeys } from '../lib/filter'
import { columnDefs, propColumns, unitFor, type ColumnDef, type FieldSettings } from '../lib/fields'
import { parseDateInput } from '../lib/dates'
import { cellsFrom, columnId, inputFrom, type Column } from '../lib/grid'
import { searchItems } from '../lib/search'
import { sortItems, type Sort } from '../lib/sort'
import { t } from '../lib/strings'
import { Icon } from './Icons'
import { SearchField } from './SearchField'
import { checkColumnWidth, columnWidth, tableWidth } from '../lib/columnWidths'
import { ColumnResizer } from './ColumnResizer'
import { ariaSort, SortHeader } from './SortHeader'
import { errorText } from '../lib/errors'

type RowEdit = { name?: string; category?: string; note?: string; cells?: Record<string, string> }
type NewRow = {
  tempId: string
  name: string
  category: string
  prefilledCategory: string
  note: string
  cells: Record<string, string>
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

function blankRow(category: string): NewRow {
  return { tempId: crypto.randomUUID(), name: '', category, prefilledCategory: category, note: '', cells: {} }
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
}

export function RegisterTable({
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
  const [columnDraft, setColumnDraft] = useState<{ key: string; unit: string; type: PropertyType; options: string }>({
    key: '',
    unit: '',
    type: 'text',
    options: '',
  })
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const defs = useMemo(() => columnDefs(fields, properties, items), [fields, properties, items])
  const columns = useMemo(() => propColumns(defs), [defs])
  const categoryLabel = fields.category.label ?? t.table.category
  const nameLabel = fields.name.label ?? t.table.name

  function labelOf(def: ColumnDef): string {
    return def.kind === 'category' ? categoryLabel : def.kind === 'name' ? nameLabel : def.col.key
  }

  const baseCells = useMemo(() => new Map(items.map((i) => [i.id, cellsFrom(i)])), [items])
  const keys = useMemo(() => specKeys(items), [items])
  const categories = useMemo(() => distinct(items, (i) => i.category), [items])
  const names = useMemo(() => distinct(items, (i) => i.name), [items])
  // Edited rows stay visible even when they stop matching the query.
  const visible = useMemo(() => {
    const hits = searchItems(items, query)
    const ids = new Set(hits.map((i) => i.id))
    return sortItems([...hits, ...items.filter((i) => !ids.has(i.id) && edits[i.id] !== undefined)], columns, sort)
  }, [items, query, edits, columns, sort])

  const dirtyIds = Object.keys(edits).filter((id) => {
    const item = items.find((i) => i.id === id)
    const e = edits[id]
    if (!item || !e) return false
    const base = baseCells.get(id) ?? {}
    if (e.name !== undefined && e.name !== item.name) return true
    if (e.category !== undefined && e.category !== item.category) return true
    if (e.note !== undefined && e.note !== (item.note ?? '')) return true
    return Object.entries(e.cells ?? {}).some(([col, v]) => v !== (base[col] ?? ''))
  })
  // A new row counts once anything is typed into it, including a category the user chose themselves.
  const touched = (r: NewRow) =>
    r.name.trim() !== '' || r.category !== r.prefilledCategory || Object.values(r.cells).some((v) => v.trim() !== '')
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

  function value(item: Item, field: 'name' | 'category' | 'note'): string {
    const e = edits[item.id]
    if (e && e[field] !== undefined) return e[field]
    return field === 'note' ? (item.note ?? '') : item[field]
  }

  function cell(item: Item, col: Column): string {
    const id = columnId(col)
    return edits[item.id]?.cells?.[id] ?? baseCells.get(item.id)?.[id] ?? ''
  }

  function editItem(id: string, patch: RowEdit) {
    setStatus(null)
    setEdits((prev) => {
      const cur = prev[id] ?? {}
      return { ...prev, [id]: { ...cur, ...patch, cells: { ...(cur.cells ?? {}), ...(patch.cells ?? {}) } } }
    })
  }

  function editNew(tempId: string, patch: Partial<NewRow>) {
    setStatus(null)
    setNewRows((prev) =>
      prev.map((r) => (r.tempId === tempId ? { ...r, ...patch, cells: { ...r.cells, ...(patch.cells ?? {}) } } : r)),
    )
  }

  function toggle(id: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  }

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
    if (columns.some((c) => columnId(c) === columnId(col))) {
      setError(t.error.columnExists)
      return
    }
    setError(null)
    const options = columnDraft.type === 'choice' ? parseOptions(columnDraft.options) : []
    await addProperty({
      id: columnId(col),
      key,
      unit,
      type: columnDraft.type,
      ...(options.length > 0 ? { options } : {}),
      createdAt: Date.now(),
    })
    setColumnDraft({ key: '', unit: '', type: 'text', options: '' })
    setAddingColumn(false)
    setStatus(t.table.columnAdded(key))
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
    await setColumnOrder(list, fields)
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
    if (def.kind === 'category') {
      await setFieldSettings({ ...fields, category: { ...fields.category, hidden: true } })
    } else if (def.kind === 'prop') {
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
    setStatus(null)
    const added = newRows.filter(touched)
    const missingName =
      added.filter((r) => r.name.trim() === '').length +
      dirtyIds.filter((id) => (edits[id]?.name ?? 'x').trim() === '').length
    if (missingName > 0) {
      setError(t.error.rowsMissingName(missingName))
      return
    }
    const missingCategory = fields.category.hidden
      ? 0
      : added.filter((r) => r.category.trim() === '').length +
        dirtyIds.filter((id) => (edits[id]?.category ?? 'x').trim() === '').length
    if (missingCategory > 0) {
      setError(t.error.rowsMissingCategory(missingCategory))
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
    if (added.length === 0 && dirtyIds.length === 0) {
      setStatus(t.table.nothingToSave)
      return
    }
    setSaving(true)
    try {
      await saveBatch(
        added.map((r) => inputFrom({ ...r, photo: null }, columns)),
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
                  category: value(item, 'category'),
                  note: value(item, 'note'),
                  cells,
                  photo: item.photo,
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
      setStatus(t.table.saved)
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
    setColumnDraft({ key: '', unit: '', type: 'text', options: '' })
    setConfirmingDelete(false)
    setConfirmingDiscard(false)
    setError(null)
    setStatus(null)
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
      {searchOpen && (
        <div className="search-bar">
          <SearchField
            value={query}
            onChange={onQueryChange}
            onClose={onSearchClose}
            keys={keys}
            listTip={t.search.tipsTableText}
          />
        </div>
      )}

      <div className="row toolbar">
        <button
          type="button"
          className="btn"
          onClick={() =>
            setNewRows((prev) => [
              ...prev,
              blankRow(
                fields.category.hidden
                  ? ''
                  : (prev[prev.length - 1]?.category ?? items[items.length - 1]?.category ?? ''),
              ),
            ])
          }
        >
          <Icon name="add" size={20} />
          {t.table.addRow}
        </button>
        <button
          type="button"
          className="btn"
          aria-expanded={addingColumn}
          aria-controls="column-form"
          onClick={() => setAddingColumn((v) => !v)}
        >
          <Icon name="add" size={20} />
          {t.table.addColumn}
        </button>
        {fields.category.hidden && (
          <button
            type="button"
            className="btn"
            onClick={() => void setFieldSettings({ ...fields, category: { ...fields.category, hidden: false } })}
          >
            {t.table.showCategory(categoryLabel)}
          </button>
        )}
        {selected.size > 0 && !confirmingDelete && (
          <button type="button" className="btn btn-danger" onClick={() => setConfirmingDelete(true)}>
            <Icon name="delete" size={20} />
            {t.table.deleteSelected(selected.size)}
          </button>
        )}
      </div>

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
                onChange={(e) => setColumnDraft({ ...columnDraft, key: e.target.value })}
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
            <div className="field field-actions">
              <button type="submit" className="btn btn-primary">
                {t.table.columnAdd}
              </button>
              <button type="button" className="btn" onClick={() => setAddingColumn(false)}>
                {t.action.cancel}
              </button>
            </div>
          </div>
        </form>
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
              {t.action.yes}
            </button>
            <button type="button" className="btn" onClick={reset}>
              {t.action.no}
            </button>
          </div>
        </div>
      )}

      {removingColumn && (
        <div className="confirm" role="alertdialog" aria-labelledby="confirm-column">
          <p id="confirm-column">
            {removingColumn.kind === 'prop'
              ? t.table.removeColumnConfirm(removingColumn.col.key, usedBy(removingColumn.col))
              : t.table.hideCategoryConfirm(categoryLabel)}
          </p>
          <div className="row">
            <button
              type="button"
              className="btn btn-danger"
              autoFocus
              onClick={() => void doRemoveColumn(removingColumn)}
            >
              {removingColumn.kind === 'prop' ? t.table.removeColumnAction : t.table.hideCategoryAction}
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

      <datalist id="category-options">
        {categories.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <datalist id="unit-options">
        {t.table.unitOptions.map((u) => (
          <option key={u} value={u} />
        ))}
      </datalist>
      {defs.map(
        (def) =>
          def.kind === 'prop' &&
          def.type === 'choice' && (
            <datalist key={def.id} id={`choice-${def.id}`}>
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
        <div className="table-wrap">
          <table
            className={`grid${selected.size > 0 ? ' has-selection' : ''}`}
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
                  {allIds.length > 0 && !editing && (
                    <input
                      type="checkbox"
                      aria-label={t.table.selectAll}
                      checked={allSelected}
                      onChange={(e) => setSelected(e.target.checked ? new Set(allIds) : new Set())}
                    />
                  )}
                </th>
                {defs.map((def, index) => (
                  <th scope="col" key={def.id} className="grid-col" aria-sort={ariaSort(def, sort)}>
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
                              <button
                                type="button"
                                className="col-menu-item"
                                role="menuitem"
                                disabled={index === 0}
                                onClick={() => void moveColumn(def, -1)}
                              >
                                <Icon name="chevronLeft" size={16} />
                                {t.table.moveLeft}
                              </button>
                              <button
                                type="button"
                                className="col-menu-item"
                                role="menuitem"
                                disabled={index === defs.length - 1}
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
                                  <Icon name={def.kind === 'category' ? 'close' : 'delete'} size={16} />
                                  {def.kind === 'category' ? t.table.hideColumn : t.table.removeColumn}
                                </button>
                              )}
                            </div>,
                            document.body,
                          )}
                      </span>
                    )}
                    <ColumnResizer id={def.id} label={labelOf(def)} onWidth={onWidth} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((item) => (
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
                  {defs.map((def) =>
                    def.kind === 'category' ? (
                      <td key={def.id}>
                        <input
                          className="grid-input"
                          list="category-options"
                          aria-label={t.table.cell(item.name, categoryLabel)}
                          value={value(item, 'category')}
                          onChange={(e) => editItem(item.id, { category: e.target.value })}
                        />
                      </td>
                    ) : def.kind === 'name' ? (
                      <td key={def.id}>
                        <input
                          className="grid-input"
                          list="name-options"
                          aria-label={t.table.cell(item.name, nameLabel)}
                          value={value(item, 'name')}
                          onChange={(e) => editItem(item.id, { name: e.target.value })}
                        />
                      </td>
                    ) : (
                      <td key={def.id}>
                        <input
                          className="grid-input num"
                          list={def.type === 'choice' ? `choice-${def.id}` : undefined}
                          aria-label={t.table.cell(item.name, def.col.key)}
                          value={cell(item, def.col)}
                          onChange={(e) => editItem(item.id, { cells: { [def.id]: e.target.value } })}
                        />
                      </td>
                    ),
                  )}
                </tr>
              ))}
              {newRows.map((row) => (
                <tr key={row.tempId} className="is-new">
                  <td className="grid-check" />
                  {defs.map((def) =>
                    def.kind === 'category' ? (
                      <td key={def.id}>
                        <input
                          className="grid-input"
                          list="category-options"
                          aria-label={t.table.cell(row.name, categoryLabel)}
                          value={row.category}
                          onChange={(e) => editNew(row.tempId, { category: e.target.value })}
                          ref={
                            row.tempId === lastNewId && defs[0]?.kind === 'category' ? focusWithoutScroll : undefined
                          }
                        />
                      </td>
                    ) : def.kind === 'name' ? (
                      <td key={def.id}>
                        <input
                          className="grid-input"
                          list="name-options"
                          aria-label={t.table.cell(row.name, nameLabel)}
                          value={row.name}
                          onChange={(e) => editNew(row.tempId, { name: e.target.value })}
                          ref={
                            row.tempId === lastNewId && defs[0]?.kind !== 'category' ? focusWithoutScroll : undefined
                          }
                        />
                      </td>
                    ) : (
                      <td key={def.id}>
                        <input
                          className="grid-input num"
                          list={def.type === 'choice' ? `choice-${def.id}` : undefined}
                          aria-label={t.table.cell(row.name, def.col.key)}
                          value={row.cells[def.id] ?? ''}
                          onChange={(e) => editNew(row.tempId, { cells: { [def.id]: e.target.value } })}
                        />
                      </td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {items.length > 0 && visible.length === 0 && newRows.length === 0 && <p className="hint">{t.list.noMatch}</p>}

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {(items.length > 0 || newRows.length > 0) && (
        <div className="row">
          <button type="button" className="btn btn-primary" onClick={save} disabled={saving || !editing}>
            {t.action.save}
          </button>
          <span className="hint" aria-live="polite">
            {dirtyCount > 0 ? t.table.unsaved(dirtyCount) : status}
          </span>
        </div>
      )}
    </div>
  )
}
