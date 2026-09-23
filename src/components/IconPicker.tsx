import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { categoryIconPack, packIcon } from '../icons/pack'
import { t } from '../lib/strings'
import { CategoryIcon } from './CategoryIcon'

// The icon pack as a grid under the button that opened it, the way Reminders,
// Notion and Linear let you pick a list's icon: equal tiles, the chosen one
// ringed, the name of the one under the pointer or the keyboard in a line at
// the foot, arrows to move, Enter to take, Escape to leave. A search box
// appears once the pack grows past what a glance takes in.
const columns = 6
const searchFrom = 24

type Props = {
  anchor: DOMRect
  category: string
  // The explicit choice, or null while the icon is guessed from the name
  chosen: string | null
  suggested: string
  onPick: (id: string | null) => void
  onClose: () => void
}

const fold = (s: string) => s.trim().toLocaleLowerCase('nb')

export function IconPicker({ anchor, category, chosen, suggested, onPick, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const current = chosen ?? suggested
  const [shown, setShown] = useState(current)
  const [query, setQuery] = useState('')
  const icons = useMemo(() => {
    const q = fold(query)
    if (q === '') return categoryIconPack
    return categoryIconPack.filter((i) => fold(i.name).includes(q) || i.keywords.some((k) => k.startsWith(q)))
  }, [query])

  // The chosen tile has focus when the grid opens; a click outside closes it
  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus()
    const onDown = (e: MouseEvent) => {
      if (e.target instanceof Node && !ref.current?.contains(e.target)) onClose()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [onClose])

  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      e.stopPropagation()
      onClose()
      return
    }
    const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: columns, ArrowUp: -columns }[e.key]
    if (step === undefined && e.key !== 'Home' && e.key !== 'End') return
    const tiles = [...(ref.current?.querySelectorAll<HTMLButtonElement>('.icon-tile') ?? [])]
    const at = tiles.indexOf(document.activeElement as HTMLButtonElement)
    if (at < 0) return
    e.preventDefault()
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? tiles.length - 1 : Math.min(Math.max(at + (step ?? 0), 0), tiles.length - 1)
    tiles[next]?.focus()
  }

  // Under the button, left edges together, inside the window
  const width = columns * 44 + 16
  const left = Math.min(anchor.left, window.innerWidth - width - 16)
  const shownIcon = packIcon(shown)

  return createPortal(
    <div
      ref={ref}
      className="icon-picker"
      role="dialog"
      aria-label={t.categories.pickerTitle(category)}
      style={{ top: anchor.bottom + 4, left: Math.max(16, left), width }}
      onKeyDown={onKey}
    >
      {categoryIconPack.length > searchFrom && (
        <input
          className="input icon-search"
          type="search"
          aria-label={t.categories.search}
          placeholder={t.categories.search}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      )}
      <div className="icon-grid" role="radiogroup" aria-label={t.categories.pickerTitle(category)}>
        {icons.map((icon) => (
          <button
            key={icon.id}
            type="button"
            role="radio"
            aria-checked={icon.id === current}
            aria-label={icon.name}
            tabIndex={icon.id === current ? 0 : -1}
            className={`icon-tile${icon.id === current ? ' is-selected' : ''}`}
            onClick={() => onPick(icon.id)}
            onFocus={() => setShown(icon.id)}
            onMouseEnter={() => setShown(icon.id)}
          >
            <CategoryIcon id={icon.id} size={22} />
          </button>
        ))}
      </div>
      <div className="icon-picker-foot">
        <span>
          {shownIcon.name}
          {chosen === null && shown === suggested && ` · ${t.categories.suggested}`}
        </span>
        {chosen !== null && (
          <button type="button" className="summary-link" onClick={() => onPick(null)}>
            {t.categories.byName}
          </button>
        )}
      </div>
    </div>,
    document.body,
  )
}
