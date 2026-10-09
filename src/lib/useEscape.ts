import { useEffect, useRef } from 'react'

// Escape does what the nearest Avbryt or Lukk does. The surface opened last answers, so a
// question inside a panel closes before the panel. A field that handles Escape itself prevents it.
const stack: { current: () => void }[] = []

function onKey(e: KeyboardEvent) {
  if (e.key !== 'Escape' || e.defaultPrevented || e.isComposing) return
  const top = stack[stack.length - 1]
  if (!top) return
  e.preventDefault()
  top.current()
}

export function useEscape(handler: () => void, active = true): void {
  const ref = useRef(handler)
  ref.current = handler
  useEffect(() => {
    if (!active) return
    if (stack.length === 0) window.addEventListener('keydown', onKey)
    stack.push(ref)
    return () => {
      stack.splice(stack.lastIndexOf(ref), 1)
      if (stack.length === 0) window.removeEventListener('keydown', onKey)
    }
  }, [active])
}
