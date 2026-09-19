import { useCallback, useState } from 'react'

// A plain switch against accidental edits and deletions. The app always opens
// locked; unlocking lasts until the page is closed or reloaded.
// It is not access control: anyone at the keyboard can flip it.
export function useLock(): { locked: boolean; toggle: () => void } {
  const [locked, setLocked] = useState(true)
  const toggle = useCallback(() => setLocked((v) => !v), [])
  return { locked, toggle }
}
