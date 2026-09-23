import { useEffect, useRef, useState, type RefObject } from 'react'

// Renders only the rows on screen. Rows have one fixed height, so the range
// follows from where the table body sits in the viewport. The page scrolls,
// not the table, so the window is watched rather than a scroll box.
export type RowWindow = { start: number; end: number; topPad: number; bottomPad: number }

const overscan = 12

// The desk table: a 32 px cell, 3 px of padding and the 1 px hairline
export const rowHeight = 36

// `all` renders every row: printing needs the whole table on the page.
export function useRowWindow<E extends HTMLElement = HTMLTableSectionElement>(
  count: number,
  rowHeight: number,
  all = false,
): { ref: RefObject<E | null>; window: RowWindow } {
  const ref = useRef<E | null>(null)
  const [range, setRange] = useState<[number, number]>([0, Math.min(count, overscan * 2)])

  useEffect(() => {
    let frame = 0
    const measure = () => {
      frame = 0
      const el = ref.current
      if (!el) return
      const top = el.getBoundingClientRect().top
      const first = Math.max(0, Math.floor(-top / rowHeight) - overscan)
      const shown = Math.ceil(window.innerHeight / rowHeight) + overscan * 2
      const last = Math.min(count, first + shown)
      setRange((prev) => (prev[0] === first && prev[1] === last ? prev : [first, last]))
    }
    const schedule = () => {
      if (frame === 0) frame = requestAnimationFrame(measure)
    }
    measure()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    return () => {
      if (frame !== 0) cancelAnimationFrame(frame)
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
    }
  }, [count, rowHeight])

  const [start, end] = all ? [0, count] : [Math.min(range[0], count), Math.min(range[1], count)]
  return { ref, window: { start, end, topPad: start * rowHeight, bottomPad: (count - end) * rowHeight } }
}
