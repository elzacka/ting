import { useCallback, useState } from 'react'

const key = 'ting.locked'

// Locked until the user unlocks; an unreadable preference also means locked.
function read(): boolean {
  try {
    return localStorage.getItem(key) !== '0'
  } catch {
    return true
  }
}

// A plain switch against accidental edits and deletions, remembered per device.
// It is not access control: anyone at the keyboard can flip it.
export function useLock(): { locked: boolean; toggle: () => void } {
  const [locked, setLocked] = useState(read)
  const toggle = useCallback(() => {
    setLocked((v) => {
      try {
        localStorage.setItem(key, v ? '0' : '1')
      } catch {
        // Preference simply does not persist.
      }
      return !v
    })
  }, [])
  return { locked, toggle }
}
