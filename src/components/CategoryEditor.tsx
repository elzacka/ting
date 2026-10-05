import { useCallback, useRef, useState, type FormEvent } from 'react'
import { chosenIcon, guessCategoryIcon } from '../lib/categoryIcons'
import { iconsAfter, type CategoryEdit } from '../lib/categories'
import { packIcon } from '../icons/pack'
import { t } from '../lib/strings'
import { CategoryIcon } from './CategoryIcon'
import { Icon } from './Icons'
import { IconPicker } from './IconPicker'

// Endre kategorier: a rename reaches every thing and column in the category;
// the bin shows only where no thing has it. Nothing is stored before Lagre.
type Row = { key: string; from: string | null; name: string; icon: string | null; count: number | null; remove: boolean }

type Props = {
  categories: readonly { label: string; count: number }[]
  icons: Readonly<Record<string, string>> | undefined
  onSave: (edit: CategoryEdit) => Promise<void>
  onClose: () => void
}

export function CategoryEditor({ categories, icons, onSave, onClose }: Props) {
  const [rows, setRows] = useState<Row[]>(() =>
    categories.map((c) => ({ key: c.label, from: c.label, name: c.label, icon: chosenIcon(c.label, icons), count: c.count, remove: false })),
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
    setRows((prev) => [...prev, { key, from: null, name: '', icon: null, count: null, remove: false }])
    requestAnimationFrame(() => listRef.current?.querySelector<HTMLInputElement>(`[data-row="${key}"]`)?.focus())
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    // An existing category left without a name keeps the one it had
    const final = (r: Row) => (r.name.trim() !== '' ? r.name.trim() : (r.from ?? ''))
    const staying = rows.filter((r) => !r.remove)
    setSaving(true)
    await onSave({
      renames: staying.flatMap((r) => (r.from !== null && final(r) !== r.from ? [[r.from, final(r)] as const] : [])),
      added: staying.flatMap((r) => (r.from === null && final(r) !== '' ? [final(r)] : [])),
      removed: rows.flatMap((r) => (r.remove && r.from !== null ? [r.from] : [])),
      icons: iconsAfter(staying.map((r) => ({ from: r.from, name: final(r), icon: r.icon }))),
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
            <li key={r.key} className={`category-row${r.remove ? ' is-removed' : ''}`}>
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
                disabled={r.remove}
                onChange={(e) => edit(r.key, { name: e.target.value })}
              />
              <span className="hint num">{r.count === null ? t.categories.newRow : t.summary.things(r.count)}</span>
              {(r.count ?? 0) === 0 && (
                <button
                  type="button"
                  className={`btn btn-icon property-remove${r.remove ? ' is-active' : ''}`}
                  aria-label={r.remove ? t.properties.keep(label) : t.properties.remove(label)}
                  aria-pressed={r.from === null ? undefined : r.remove}
                  onClick={() =>
                    // A new one nothing holds just goes
                    r.from === null ? setRows((prev) => prev.filter((x) => x.key !== r.key)) : edit(r.key, { remove: !r.remove })
                  }
                >
                  <Icon name={r.remove ? 'close' : 'delete'} size={24} />
                </button>
              )}
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
