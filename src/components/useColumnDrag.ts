import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'

// A header dragged sideways moves its column: a mouse once it has gone a few
// pixels, a finger once it has held still (a quick swipe still scrolls the
// table). The first id is Navn, which neither moves nor is passed.
const mouseSlop = 6
const touchSlop = 10
const holdMs = 400
const edge = 40

export type ColumnDrop = { id: string; target: string; after: boolean }

export function useColumnDrag(
  head: RefObject<HTMLElement | null>,
  ids: readonly string[],
  onMove?: (id: string, target: string) => void,
) {
  const [drop, setDrop] = useState<ColumnDrop | null>(null)
  // Once a finger holds a column the page must not scroll under it. The browser
  // decides at the first touch whether a scroll can be stopped, so the listener
  // sits on the header row for good rather than arriving with the hold.
  const holding = useRef(false)
  useEffect(() => {
    const el = head.current
    if (!el) return
    const still = (ev: TouchEvent) => {
      if (holding.current) ev.preventDefault()
    }
    el.addEventListener('touchmove', still, { passive: false })
    return () => el.removeEventListener('touchmove', still)
  }, [head])

  function onPointerDown(e: ReactPointerEvent<HTMLTableCellElement>, id: string) {
    if (!onMove || e.button !== 0 || ids.indexOf(id) < 1) return
    if (e.target instanceof Element && e.target.closest('input, select, textarea, summary, .col-resizer')) return
    const th = e.currentTarget
    const wrap = th.closest<HTMLElement>('.table-wrap')
    const row = th.parentElement
    if (!wrap || !row) return
    const touch = e.pointerType !== 'mouse'
    const from = ids.indexOf(id)
    const start = { x: e.clientX, y: e.clientY }
    let dragging = false
    let x = e.clientX
    let current: ColumnDrop | null = null
    let frame = 0
    const hold = touch ? window.setTimeout(begin, holdMs) : 0

    // The column under x; one scrolled in under the frozen Navn counts as the one beside it
    function aim() {
      const cells = [...row!.querySelectorAll<HTMLElement>('th[data-col]')]
      const nameRight = cells[0]?.getBoundingClientRect().right ?? 0
      const at = Math.max(x, nameRight + 1)
      const movable = cells.slice(1)
      const cell =
        movable.find((c) => {
          const r = c.getBoundingClientRect()
          return at >= r.left && at < r.right
        }) ?? (at < (movable[0]?.getBoundingClientRect().left ?? 0) ? movable[0] : movable.at(-1))
      const target = cell?.dataset.col
      const next = target && target !== id ? { id, target, after: from < ids.indexOf(target) } : null
      if (next?.target !== current?.target) setDrop(next ?? { id, target: id, after: false })
      current = next
    }
    // Near the table's edge, the table scrolls sideways under the held column
    function scroll() {
      const r = wrap!.getBoundingClientRect()
      const step = x < r.left + edge ? -12 : x > r.right - edge ? 12 : 0
      if (step !== 0) {
        wrap!.scrollLeft += step
        aim()
      }
      frame = requestAnimationFrame(scroll)
    }
    function begin() {
      dragging = true
      holding.current = true
      document.body.classList.add('is-moving-column')
      setDrop({ id, target: id, after: false })
      aim()
      frame = requestAnimationFrame(scroll)
    }
    function move(ev: PointerEvent) {
      if (ev.pointerId !== e.pointerId) return
      x = ev.clientX
      if (dragging) {
        aim()
        return
      }
      const dx = Math.abs(ev.clientX - start.x)
      const dy = Math.abs(ev.clientY - start.y)
      if (touch) {
        if (Math.max(dx, dy) > touchSlop) end()
      } else if (dx > mouseSlop) begin()
    }
    // A held finger opens no context menu
    function still(ev: Event) {
      if (dragging) ev.preventDefault()
    }
    // The click that ends a drag is not a sort
    function swallow(ev: Event) {
      ev.preventDefault()
      ev.stopPropagation()
    }
    function swallowClick() {
      window.addEventListener('click', swallow, true)
      window.setTimeout(() => window.removeEventListener('click', swallow, true), 400)
    }
    function up(ev: PointerEvent) {
      if (ev.pointerId !== e.pointerId) return
      const done = dragging ? current : null
      if (dragging) swallowClick()
      end()
      if (done) onMove?.(done.id, done.target)
    }
    // Escape drops the column where it was; the release that follows is no sort either
    function key(ev: KeyboardEvent) {
      if (ev.key !== 'Escape' || !dragging) return
      end()
      const release = (r: PointerEvent) => {
        if (r.pointerId !== e.pointerId) return
        window.removeEventListener('pointerup', release, true)
        swallowClick()
      }
      window.addEventListener('pointerup', release, true)
    }
    function end() {
      window.clearTimeout(hold)
      cancelAnimationFrame(frame)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', end)
      window.removeEventListener('contextmenu', still)
      window.removeEventListener('keydown', key)
      document.body.classList.remove('is-moving-column')
      dragging = false
      holding.current = false
      setDrop(null)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', end)
    window.addEventListener('contextmenu', still)
    window.addEventListener('keydown', key)
  }

  return { drop, onPointerDown }
}
