import type { InputHTMLAttributes } from 'react'
import { suggest } from '../lib/filter'
import { formatPath, nextLevels, parsePath } from '../lib/paths'
import { t } from '../lib/strings'

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  id: string
  label: string
  kind: 'choice' | 'path'
  // A Valgliste: its values, the one used last first. A place: every place in use
  values: readonly string[]
  value: string
  onChange: (value: string) => void
  // A tap on a suggestion; `done` when there is no level further in to choose
  onPick?: (value: string, done: boolean) => void
}

const limit = 12

// A field with the values already in use under it, to tap rather than type:
// a Valgliste offers its values, a place the next level in, so Bod, Hylle 2
// and Blå kasse are three taps. Typing narrows what is offered, and a new
// value is typed as before. The suggestions never take the focus from the
// field, so the keyboard stays where it is.
export function ValuePicker({ id, label, kind, values, value, onChange, onPick, ...input }: Props) {
  const path = kind === 'path' ? nextLevels(values, value) : null
  const options = path ? path.options : suggest(values, value, limit)
  const current = value.trim().toLocaleLowerCase('nb')

  function pick(option: string) {
    const next = path ? formatPath([...path.base, option]) : option
    let done = true
    if (path) {
      const further = nextLevels(values, next)
      done = further.options.length === 0 || further.base.length < parsePath(next).length
    }
    onChange(next)
    onPick?.(next, done)
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
