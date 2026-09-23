import { useEffect } from 'react'

// How much of the window's bottom the on-screen keyboard covers, as --kb on
// the root. iOS keeps the page its full height under the keyboard, so a bar
// pinned to the bottom would sit behind it; the bars add --kb to their bottom
// offset instead. Zero wherever there is no on-screen keyboard.
export function useKeyboardInset(): void {
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const root = document.documentElement
    const update = () => {
      const inset = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop))
      root.style.setProperty('--kb', `${inset}px`)
    }
    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
      root.style.removeProperty('--kb')
    }
  }, [])
}
