import { useEffect, useRef } from 'react'
import { isMac } from './useSearchShortcut'

export type OptionKey = 'I' | 'P' | '+'

// As shown in a tip, and as aria-keyshortcuts names it
export const optionKeys = (key: OptionKey) => (isMac ? `⌥${key}` : `Alt+${key}`)
export const optionKeysAria = (key: OptionKey) => `Alt+${key === '+' ? 'Plus' : key}`

// Option types ±, π and ı into a text field on a Mac; there the field keeps the key.
function inTextField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable || target.tagName === 'TEXTAREA') return true
  return target instanceof HTMLInputElement && !['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file'].includes(target.type)
}

// A letter by its physical key, since Option makes P into π on a Mac; the plus by what it
// types, since its key differs per layout (± with Option on a Norwegian Mac).
function matches(e: KeyboardEvent, key: OptionKey): boolean {
  if (key === '+') return e.key === '+' || e.key === '±' || e.code === 'NumpadAdd'
  return e.code === `Key${key}`
}

// Option (Alt elsewhere) with a key runs the action, outside a text field.
export function useOptionKey(key: OptionKey, enabled: boolean, onPress: () => void): void {
  const ref = useRef(onPress)
  ref.current = onPress
  useEffect(() => {
    if (!enabled) return
    const handler = (e: KeyboardEvent) => {
      if (!e.altKey || e.metaKey || e.ctrlKey || !matches(e, key) || inTextField(e.target)) return
      e.preventDefault()
      ref.current()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [key, enabled])
}
