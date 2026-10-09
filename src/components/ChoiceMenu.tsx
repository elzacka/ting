import { useEffect, useRef, useState, type KeyboardEvent, type SyntheticEvent } from 'react'
import { t } from '../lib/strings'
import { menuValues } from '../lib/values'
import { Icon } from './Icons'

type Props = {
  id: string
  label: string
  values: readonly string[]
  value: string
  onChange: (value: string) => void
  // How a typed value is written, such as a place with its levels
  tidy?: ((value: string) => string) | undefined
}

// A choice in a form: a dropdown with a field for a new value on top and the values in
// alphabetical order under it. What is typed is the value from the first letter, so Lagre
// stores it with no step between; a value in use keeps its own spelling.
export function ChoiceMenu({ id, label, values, value, onChange, tidy = (v) => v.trim() }: Props) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  // The value before typing, back when the typing is cleared or given up
  const before = useRef(value)
  const root = useRef<HTMLDivElement>(null)
  const field = useRef<HTMLInputElement>(null)
  const typed = tidy(draft).toLocaleLowerCase('nb')
  // While typing, the field shows the new value and the list the values in use
  const listed = menuValues(values, typed === '' ? value : '')
  const shown = listed.filter((v) => v.toLocaleLowerCase('nb').includes(typed))
  const current = value.trim().toLocaleLowerCase('nb')

  function type(text: string) {
    setDraft(text)
    const next = tidy(text)
    const known = menuValues(values, before.current).find((v) => v.toLocaleLowerCase('nb') === next.toLocaleLowerCase('nb'))
    onChange(next === '' ? before.current : (known ?? next))
  }

  function show() {
    before.current = value
    setOpen(true)
  }

  function close() {
    setDraft('')
    setOpen(false)
  }

  // A tap anywhere else closes the list; it floats, so nothing under the finger moves
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (e.target instanceof Node && !root.current?.contains(e.target)) close()
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open])

  // The whole list in view; nothing to choose from yet: straight to the keyboard
  useEffect(() => {
    if (!open) return
    document.getElementById(`${id}-list`)?.scrollIntoView({ block: 'nearest' })
    if (values.length === 0) field.current?.focus()
  }, [open, id, values.length])

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter' && e.key !== 'Escape') return
    // Not the form's Enter, which would move on or save
    e.preventDefault()
    e.stopPropagation()
    if (e.key === 'Escape') onChange(before.current)
    close()
    document.getElementById(id)?.focus()
  }

  // Taps in the list keep the focus in the field, so the keyboard stays up while typing
  const hold = (e: SyntheticEvent) => e.preventDefault()
  const keepFocus = { onPointerDown: hold, onMouseDown: hold }

  return (
    <div ref={root} className="choice-menu">
      <button
        id={id}
        type="button"
        className="select choice-menu-btn"
        aria-label={value.trim() === '' ? label : `${label}: ${value.trim()}`}
        aria-expanded={open}
        aria-controls={`${id}-list`}
        onClick={() => (open ? close() : show())}
        {...(open ? keepFocus : {})}
      >
        {value.trim()}
      </button>
      {open && (
        <div id={`${id}-list`} className="choice-menu-list">
          <input
            ref={field}
            className="input"
            aria-label={t.add.newValueFor(label)}
            placeholder={t.add.newValue}
            autoComplete="off"
            enterKeyHint="done"
            value={draft}
            onChange={(e) => type(e.target.value)}
            onKeyDown={onKey}
            onBlur={(e) => {
              if (!root.current?.contains(e.relatedTarget)) close()
            }}
          />
          {shown.length > 0 && (
            <div role="group" aria-label={label}>
              {shown.map((option) => {
                const chosen = typed === '' && option.toLocaleLowerCase('nb') === current
                return (
                  <button
                    key={option}
                    type="button"
                    className="choice-option"
                    aria-pressed={chosen}
                    {...keepFocus}
                    onClick={() => {
                      // The chosen value tapped again is taken away
                      onChange(chosen ? '' : option)
                      close()
                    }}
                  >
                    <span>{option}</span>
                    {chosen && <Icon name="check" size={20} />}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
