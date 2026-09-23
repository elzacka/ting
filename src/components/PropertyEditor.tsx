import { useEffect, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import type { PropertyType } from '../db/schema'
import { t } from '../lib/strings'
import { Icon } from './Icons'

// Endre egenskaper: every property but Kategori (that one is Endre
// kategorier) on one line each, so several can be changed or removed at once:
// the name, the field type, the unit of a number, the categories it belongs
// to, and a mark to remove it. Nothing is stored before Lagre, and removing
// values from things asks first. One property at a time stays in the column
// menu.
export type PropertyRow = {
  id: string
  key: string
  type: PropertyType
  unit: string
  categories: string[]
  remove: boolean
  count: number
  was: { key: string; type: PropertyType; unit: string; categories: string[] }
}

type Props = {
  rows: PropertyRow[]
  categories: readonly string[]
  onSave: (rows: PropertyRow[]) => Promise<void>
  onClose: () => void
}

const types: readonly PropertyType[] = ['text', 'choice', 'number', 'date', 'path']
const fold = (s: string) => s.trim().toLocaleLowerCase('nb')
const listFormat = new Intl.ListFormat('nb', { type: 'conjunction' })

export function changed(r: PropertyRow): boolean {
  const sameCats =
    r.categories.length === r.was.categories.length && r.categories.every((c) => r.was.categories.some((w) => fold(w) === fold(c)))
  return r.remove || r.key.trim() !== r.was.key || r.type !== r.was.type || r.unit.trim() !== r.was.unit || !sameCats
}

export function PropertyEditor({ rows: initial, categories, onSave, onClose }: Props) {
  const [rows, setRows] = useState(initial)
  const [scope, setScope] = useState<{ id: string; anchor: DOMRect } | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [saving, setSaving] = useState(false)
  const edit = (id: string, patch: Partial<PropertyRow>) => setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)))

  const losing = rows.filter((r) => r.remove && r.count > 0)

  async function store() {
    setSaving(true)
    await onSave(rows.filter(changed))
    setSaving(false)
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    // Values leave things only after a yes
    if (losing.length > 0 && !confirming) setConfirming(true)
    else void store()
  }

  const open = scope ? rows.find((r) => r.id === scope.id) : undefined

  return (
    <form id="property-form" className="stack-sm" onSubmit={submit}>
      <p className="field-label">{t.properties.title}</p>
      <p className="hint">{t.properties.hint}</p>
      <div className="property-rows" role="list">
        {rows.map((r) => {
          const where = r.categories.length === 0 ? t.properties.scopeAll : listFormat.format(r.categories)
          return (
            <div key={r.id} role="listitem" className={`property-row${r.remove ? ' is-removed' : ''}`}>
              <input
                className="input"
                aria-label={t.properties.name(r.was.key)}
                value={r.key}
                disabled={r.remove}
                onChange={(e) => edit(r.id, { key: e.target.value })}
              />
              <select
                className="select"
                aria-label={t.properties.type(r.was.key)}
                value={r.type}
                disabled={r.remove}
                onChange={(e) => edit(r.id, { type: e.target.value as PropertyType })}
              >
                {types.map((ty) => (
                  <option key={ty} value={ty}>
                    {t.table.types[ty]}
                  </option>
                ))}
              </select>
              {r.type === 'number' ? (
                <input
                  className="input"
                  list="unit-options"
                  aria-label={t.properties.unit(r.was.key)}
                  placeholder={t.table.columnUnit}
                  value={r.unit}
                  disabled={r.remove}
                  onChange={(e) => edit(r.id, { unit: e.target.value })}
                />
              ) : (
                <span />
              )}
              <button
                type="button"
                className="btn property-scope"
                aria-label={t.properties.scopeButton(r.was.key, where)}
                aria-haspopup="dialog"
                aria-expanded={scope?.id === r.id}
                disabled={r.remove || categories.length === 0}
                onClick={(e) => setScope(scope?.id === r.id ? null : { id: r.id, anchor: e.currentTarget.getBoundingClientRect() })}
              >
                <span>{where}</span>
                <Icon name="chevronRight" size={16} className="property-scope-chevron" />
              </button>
              <span className="hint num">{t.summary.things(r.count)}</span>
              <button
                type="button"
                className={`btn btn-icon property-remove${r.remove ? ' is-active' : ''}`}
                aria-label={r.remove ? t.properties.keep(r.was.key) : t.properties.remove(r.was.key)}
                aria-pressed={r.remove}
                onClick={() => {
                  edit(r.id, { remove: !r.remove })
                  setConfirming(false)
                }}
              >
                <Icon name={r.remove ? 'close' : 'delete'} size={20} />
              </button>
            </div>
          )
        })}
      </div>
      {confirming && losing.length > 0 && (
        <div className="confirm" role="alertdialog" aria-labelledby="property-confirm">
          <p id="property-confirm">
            {t.properties.confirmRemove(
              listFormat.format(losing.map((r) => r.was.key)),
              losing.reduce((n, r) => n + r.count, 0),
            )}
          </p>
        </div>
      )}
      <div className="row">
        <button type="submit" className={`btn ${confirming ? 'btn-danger-fill' : 'btn-primary'}`} disabled={saving}>
          {confirming ? t.properties.removeAndSave : t.action.save}
        </button>
        <button type="button" className="btn" onClick={onClose}>
          {t.action.cancel}
        </button>
      </div>
      {scope && open && (
        <ScopePicker
          anchor={scope.anchor}
          name={open.was.key}
          categories={categories}
          chosen={open.categories}
          onChange={(next) => edit(open.id, { categories: next })}
          onClose={() => setScope(null)}
        />
      )}
    </form>
  )
}

// Which categories a property belongs to: none ticked is every category
function ScopePicker({
  anchor,
  name,
  categories,
  chosen,
  onChange,
  onClose,
}: {
  anchor: DOMRect
  name: string
  categories: readonly string[]
  chosen: string[]
  onChange: (next: string[]) => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.querySelector('input')?.focus()
    const onDown = (e: MouseEvent) => {
      if (e.target instanceof Node && !ref.current?.contains(e.target)) onClose()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [onClose])
  const has = (c: string) => chosen.some((x) => fold(x) === fold(c))
  return createPortal(
    <div
      ref={ref}
      className="scope-picker"
      role="dialog"
      aria-label={t.properties.scopeTitle(name)}
      style={{ top: anchor.bottom + 4, left: anchor.left, maxHeight: Math.max(160, window.innerHeight - anchor.bottom - 20) }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          onClose()
        }
      }}
    >
      <label className="check-option">
        <input type="checkbox" checked={chosen.length === 0} onChange={() => onChange([])} />
        <span>{t.properties.scopeAll}</span>
      </label>
      {categories.map((c) => (
        <label key={c} className="check-option">
          <input
            type="checkbox"
            checked={has(c)}
            onChange={(e) => onChange(e.target.checked ? [...chosen, c] : chosen.filter((x) => fold(x) !== fold(c)))}
          />
          <span>{c}</span>
        </label>
      ))}
    </div>,
    document.body,
  )
}
