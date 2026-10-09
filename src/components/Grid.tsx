import { useEffect, useRef, useState, type ClipboardEvent, type ReactNode } from 'react'
import { checkColumnWidth, columnWidth, tableWidth } from '../lib/columnWidths'
import type { ColumnDef } from '../lib/fields'
import type { Sort } from '../lib/sort'
import { rowHeight, useRowWindow } from '../lib/useRowWindow'
import { ColumnResizer } from './ColumnResizer'
import { ariaSort } from './SortHeader'
import { useColumnDrag, type ColumnDrop } from './useColumnDrag'

// The table skeleton both views share: fixed widths, a checkbox gutter, headers that resize
// and move, a body of the rows on screen. What goes in a header cell and a row is the view's.
type Props = {
  defs: ColumnDef[]
  widths: Record<string, number>
  sort: Sort | null
  onWidth: (id: string, w: number | null) => void
  hasSelection: boolean
  headerCheck: ReactNode
  label: (def: ColumnDef) => string
  header: (def: ColumnDef, index: number) => ReactNode
  // A header dragged onto another column's place; absent, headers stay put
  onMove?: ((id: string, targetId: string) => void) | undefined
  rowCount: number
  row: (index: number) => ReactNode
  // Rows after the windowed ones, always rendered: new rows being typed
  tail?: ReactNode
  onPaste?: (e: ClipboardEvent<HTMLTableElement>) => void
  // Focus left the table for somewhere outside it
  onLeave?: () => void
  // Every row, not only the ones on screen: while printing, and while text
  // wraps, since the row window counts on one row height
  allRows?: boolean
  wrap?: boolean
  // Height of the card's head the header row sticks under; a change moves the row
  headHeight: number
}

export function Grid({
  defs,
  widths,
  sort,
  onWidth,
  hasSelection,
  headerCheck,
  label,
  header,
  onMove,
  rowCount,
  row,
  tail,
  onPaste,
  onLeave,
  allRows,
  wrap,
  headHeight,
}: Props) {
  const { ref: bodyRef, window: win } = useRowWindow(rowCount, rowHeight, allRows || wrap)
  const tableRef = useRef<HTMLTableElement>(null)
  const headRef = useRef<HTMLTableSectionElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  // A column moved from the keyboard keeps focus on its header once it lands
  const refocus = useRef<{ id: string; order: string } | null>(null)
  useEffect(() => {
    const r = refocus.current
    if (r === null || defs.map((d) => d.id).join() === r.order) return
    const th = [...(headRef.current?.querySelectorAll<HTMLElement>('th[data-col]') ?? [])].find((c) => c.dataset.col === r.id)
    th?.querySelector<HTMLElement>('.sort-btn')?.focus()
    refocus.current = null
  }, [defs])
  const { drop, onPointerDown } = useColumnDrag(headRef, defs.map((d) => d.id), onMove)
  // More columns to the right than the card shows: the edge fades, since an
  // overlay scrollbar at the foot of a long table says nothing
  const [more, setMore] = useState(false)
  useEffect(() => {
    const wrap = wrapRef.current
    const table = tableRef.current
    if (!wrap || !table) return
    const check = () => setMore(wrap.scrollLeft + wrap.clientWidth < wrap.scrollWidth - 1)
    check()
    wrap.addEventListener('scroll', check, { passive: true })
    const ro = new ResizeObserver(check)
    ro.observe(wrap)
    ro.observe(table)
    return () => {
      wrap.removeEventListener('scroll', check)
      ro.disconnect()
    }
  }, [])
  // Keeps the header row under the card's head while the page scrolls past
  // the table: the wrap scrolls sideways, so position: sticky would pin the
  // row to the wrap instead of the page. Not while printing: every row is on paper.
  useEffect(() => {
    const table = tableRef.current
    const head = headRef.current
    if (!table || !head) return
    let frame = 0
    // Hover means nothing while the rows slide under a still pointer: the
    // checkbox of whichever row passes would flash. Off until the scroll settles.
    let settle = 0
    const place = () => {
      frame = 0
      table.classList.add('is-scrolling')
      window.clearTimeout(settle)
      settle = window.setTimeout(() => table.classList.remove('is-scrolling'), 160)
      // The top bar is measured, not read from --topbar-h: that holds a calc()
      // with the safe area, which parseFloat cannot read
      const topbar = document.querySelector('.topbar')?.getBoundingClientRect().height ?? 0
      const stickyTop = topbar + parseFloat(getComputedStyle(table).getPropertyValue('--head-h'))
      const rect = table.getBoundingClientRect()
      const room = rect.height - head.getBoundingClientRect().height
      const offset = Math.min(Math.max(0, stickyTop - rect.top), Math.max(0, room))
      head.style.transform = offset > 0 ? `translateY(${offset}px)` : ''
    }
    const schedule = () => {
      if (frame === 0) frame = requestAnimationFrame(place)
    }
    place()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    const ro = new ResizeObserver(schedule)
    ro.observe(table)
    return () => {
      if (frame !== 0) cancelAnimationFrame(frame)
      window.clearTimeout(settle)
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      ro.disconnect()
    }
  }, [headHeight])
  const span = defs.length + 1
  const indexes: number[] = []
  for (let i = win.start; i < win.end; i++) indexes.push(i)
  return (
    <div className={`table-wrap${more ? ' has-more' : ''}`} ref={wrapRef}>
      <table
        ref={tableRef}
        className={`grid${hasSelection ? ' has-selection' : ''}${wrap ? ' is-wrap' : ''}`}
        style={{ width: tableWidth(defs, widths) }}
        onPaste={onPaste}
        onBlur={(e) => {
          if (!(e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget))) onLeave?.()
        }}
      >
        <colgroup>
          <col style={{ width: checkColumnWidth() }} />
          {defs.map((def) => (
            <col key={def.id} style={{ width: columnWidth(def, widths) }} />
          ))}
        </colgroup>
        <thead ref={headRef}>
          <tr>
            <th scope="col" className="grid-check">
              {headerCheck}
            </th>
            {defs.map((def, index) => (
              <th
                scope="col"
                key={def.id}
                data-col={def.id}
                className={`grid-col${isNumberColumn(def) ? ' is-number' : ''}${dropClass(def.id, drop)}`}
                aria-sort={ariaSort(def, sort)}
                onPointerDown={(e) => onPointerDown(e, def.id)}
                onKeyDown={(e) => {
                  // Alt and an arrow is the keyboard's drag
                  if (!onMove || !e.altKey || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return
                  // Not from the rename field, where Option and an arrow jumps a word
                  if (!(e.target instanceof Element && e.target.closest('.sort-btn'))) return
                  const target = defs[index + (e.key === 'ArrowLeft' ? -1 : 1)]
                  if (!target || index === 0 || target.kind === 'name') return
                  e.preventDefault()
                  refocus.current = { id: def.id, order: defs.map((d) => d.id).join() }
                  onMove(def.id, target.id)
                }}
              >
                {header(def, index)}
                <ColumnResizer id={def.id} label={label(def)} onWidth={onWidth} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody ref={bodyRef}>
          {win.topPad > 0 && <SpacerRow height={win.topPad} span={span} />}
          {indexes.map(row)}
          {win.bottomPad > 0 && <SpacerRow height={win.bottomPad} span={span} />}
          {tail}
        </tbody>
      </table>
    </div>
  )
}

function dropClass(id: string, drop: ColumnDrop | null): string {
  if (!drop) return ''
  if (drop.id === id) return ' is-dragged'
  if (drop.target !== id) return ''
  return drop.after ? ' is-drop-after' : ' is-drop-before'
}

// Numbers line up on the right, like the sum they add up to
export function isNumberColumn(def: ColumnDef): boolean {
  return def.kind === 'prop' && def.type === 'number'
}

// Stands in for the rows above and below the window so the page keeps its height
function SpacerRow({ height, span }: { height: number; span: number }) {
  return (
    <tr className="grid-spacer" style={{ height }} aria-hidden="true">
      <td colSpan={span} />
    </tr>
  )
}
