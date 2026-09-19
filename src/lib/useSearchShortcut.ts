import { useEffect } from 'react'

export const isMac = /Mac|iPhone|iPad/.test(navigator.platform)

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

// Cmd+K on Mac, Ctrl+K elsewhere, toggles the search. Typing a printable
// character while nothing else has focus opens it with that character as the query.
export function useSearchShortcut(enabled: boolean, onOpen: (initial: string) => void, onToggle: () => void): void {
  useEffect(() => {
    if (!enabled) return
    const handler = (e: KeyboardEvent) => {
      const mod = isMac ? e.metaKey : e.ctrlKey
      if (mod && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        onToggle()
        return
      }
      if (e.metaKey || e.ctrlKey || e.altKey || e.key.length !== 1 || e.key === ' ') return
      if (isTyping(e.target)) return
      e.preventDefault()
      onOpen(e.key)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [enabled, onOpen, onToggle])
}
