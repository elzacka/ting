import { useCallback, useRef, useState, type FormEvent } from 'react'
import { chosenIcon, guessCategoryIcon } from '../lib/categoryIcons'
import type { CategoryEdit } from '../lib/categories'
import { packIcon } from '../icons/pack'
import { t } from '../lib/strings'
import { CategoryIcon } from './CategoryIcon'
import { IconPicker } from './IconPicker'

// Endre kategorier: every category with its icon, its name and how many
// things it holds. The icon opens the pack; the name renames the category on
// every thing and every column that belongs to it; Ny kategori adds one before
// any thing has it. Nothing is stored before Lagre, like the table.
type Row = { key: string; from: string | null; name: string; icon: string | null; count: number | null }

type Props = {
  categories: readonly { label: string; count: number }[]
  icons: Readonly<Record<string, string>> | undefined
  onSave: (edit: CategoryEdit) => Promise<void>
  onClose: () => void
}

export function CategoryEditor({ categories, icons, onSave, onClose }: Props) {
  const [rows, setRows] = useState<Row[]>(() =>
    categories.map((c) => ({ key: c.label, from: c.label, name: c.label, icon: chosenIcon(c.label, icons), count: c.count })),
  )
  const [picking, setPicking] = useState<{ key: string; anchor: DOMRect } | null>(null)
  const [saving, setSaving] = useState(false)
  const iconButtons = useRef(new Map<string, HTMLButtonElement>())
  const listRef = useRef<HTMLUListElement>(null)

  const edit = (key: string, patch: Partial<Row>) => setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)))

  const closePicker = useCallback(() => {
    setPicking((p) => {
      if (p) requestAnimationFrame(() => iconButtons.current.get(p.key)?.focus())
      return null
    })
  }, [])

  function addRow() {
    const key = crypto.randomUUID()
    setRows((prev) => [...prev, { key, from: null, name: '', icon: null, count: null }])
    requestAnimationFrame(() => listRef.current?.querySelector<HTMLInputElement>(`[data-row="${key}"]`)?.focus())
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    // An existing category left without a name keeps the one it had
    const final = (r: Row) => (r.name.trim() !== '' ? r.name.trim() : (r.from ?? ''))
    setSaving(true)
    await onSave({
      renames: rows.flatMap((r) => (r.from !== null && final(r) !== r.from ? [[r.from, final(r)] as const] : [])),
      added: rows.flatMap((r) => (r.from === null && final(r) !== '' ? [final(r)] : [])),
      icons: Object.fromEntries(rows.flatMap((r) => (final(r) !== '' ? [[final(r), r.icon]] : []))),
    })
    setSaving(false)
  }

  const open = picking ? rows.find((r) => r.key === picking.key) : undefined

  return (
    <form id="category-form" className="stack-sm category-form" onSubmit={(e) => void submit(e)}>
      <p className="field-label">{t.categories.title}</p>
      <p className="hint">{t.categories.hint}</p>
      <ul className="category-rows" ref={listRef}>
        {rows.map((r) => {
          const shown = r.icon ?? guessCategoryIcon(r.name)
          const label = r.name.trim() || r.from || t.categories.add
          return (
            <li key={r.key} className="category-row">
              <button
                type="button"
                ref={(el) => {
                  if (el) iconButtons.current.set(r.key, el)
                  else iconButtons.current.delete(r.key)
                }}
                className="category-icon-btn"
                aria-label={t.categories.iconButton(label, packIcon(shown).name)}
                aria-haspopup="dialog"
                aria-expanded={picking?.key === r.key}
                onClick={(e) =>
                  setPicking(picking?.key === r.key ? null : { key: r.key, anchor: e.currentTarget.getBoundingClientRect() })
                }
              >
                <CategoryIcon id={shown} size={22} />
              </button>
              <input
                className="input"
                data-row={r.key}
                aria-label={t.categories.name}
                placeholder={r.from ?? t.categories.add}
                value={r.name}
                onChange={(e) => edit(r.key, { name: e.target.value })}
              />
              <span className="hint num">{r.count === null ? t.categories.newRow : t.summary.things(r.count)}</span>
            </li>
          )
        })}
      </ul>
      <div className="row">
        <button type="button" className="summary-link" onClick={addRow}>
          {t.categories.add}
        </button>
      </div>
      <div className="row">
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {t.action.save}
        </button>
        <button type="button" className="btn" onClick={onClose}>
          {t.action.cancel}
        </button>
      </div>
      {picking && open && (
        <IconPicker
          anchor={picking.anchor}
          category={open.name.trim() || open.from || t.categories.add}
          chosen={open.icon}
          suggested={guessCategoryIcon(open.name)}
          onPick={(id) => {
            edit(open.key, { icon: id })
            closePicker()
          }}
          onClose={closePicker}
        />
      )}
    </form>
  )
}
