import { useEffect, useState, type InputHTMLAttributes } from 'react'
import { suggest } from '../lib/values'
import { formatPath, nextLevels, parsePath } from '../lib/paths'
import { t } from '../lib/strings'

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  id: string
  label: string
  kind: 'choice' | 'path'
  // A choice column: its values, the one used last first. A place: every place in use
  values: readonly string[]
  value: string
  onChange: (value: string) => void
  // A tap on a suggestion; `done` when there is no level further in to choose
  onPick?: (value: string, done: boolean) => void
  // A form, not an edit in place: a short choice list is the chips alone
  chips?: boolean
}

const limit = 12

// A field with the values in use under it, to tap rather than type: a choice offers its values,
// a place the next level in (Bod, Hylle 2, Blå kasse: three taps). Typing narrows them. The
// chips never take the focus from the field, so the keyboard stays up.
export function ValuePicker({ id, label, kind, values, value, onChange, onPick, chips = false, ...input }: Props) {
  const path = kind === 'path' ? nextLevels(values, value) : null
  const options = path ? path.options : suggest(values, value, limit)
  const current = value.trim().toLocaleLowerCase('nb')

  // A dozen values or fewer need no field beside them: the chosen chip is filled, and
  // «Annet» opens the field for a new value. A value typed before stays in its field.
  const [typing, setTyping] = useState(false)
  const known = current === '' || values.some((v) => v.toLocaleLowerCase('nb') === current)
  const chipsOnly = chips && !path && !typing && known && values.length > 0 && values.length <= limit
  useEffect(() => {
    if (typing) document.getElementById(id)?.focus()
  }, [typing, id])

  function pick(option: string) {
    const next = path ? formatPath([...path.base, option]) : option
    let done = true
    if (path) {
      const further = nextLevels(values, next)
      done = further.options.length === 0 || further.base.length < parsePath(next).length
    }
    setTyping(false)
    onChange(next)
    onPick?.(next, done)
  }

  if (chipsOnly) {
    return (
      <div id={id} className="picks" role="group" aria-label={label}>
        {values.map((option) => {
          const chosen = option.toLocaleLowerCase('nb') === current
          return (
            <button
              key={option}
              type="button"
              className="pick"
              aria-pressed={chosen}
              onClick={() => (chosen ? onChange('') : pick(option))}
            >
              {option}
            </button>
          )
        })}
        <button
          type="button"
          className="pick"
          onClick={() => {
            onChange('')
            setTyping(true)
          }}
        >
          {t.add.other}
        </button>
      </div>
    )
  }

  return (
    <>
      <input
        id={id}
        className="input"
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        {...input}
      />
      {options.length > 0 && (
        <div className="picks" role="group" aria-label={t.add.suggestions(label)}>
          {options.map((option) => (
            <button
              key={option}
              type="button"
              className="pick"
              aria-pressed={path ? undefined : option.toLocaleLowerCase('nb') === current}
              onPointerDown={(e) => e.preventDefault()}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(option)}
            >
              {option}
            </button>
          ))}
        </div>
      )}
    </>
  )
}
