import { useEffect, useRef, type ClipboardEvent, type ReactNode } from 'react'
import { checkColumnWidth, columnWidth, tableWidth } from '../lib/columnWidths'
import type { ColumnDef } from '../lib/fields'
import type { Sort } from '../lib/sort'
import { rowHeight, useRowWindow } from '../lib/useRowWindow'
import { ColumnResizer } from './ColumnResizer'
import { ariaSort } from './SortHeader'

// The one table skeleton both views share: fixed column widths, a checkbox
// gutter, a header cell per column with a resize handle, and a body that
// renders only the rows on screen. What goes in a header cell and a row is
// the view's business.
type Props = {
  defs: ColumnDef[]
  widths: Record<string, number>
  sort: Sort | null
  onWidth: (id: string, w: number | null) => void
  hasSelection: boolean
  headerCheck: ReactNode
  label: (def: ColumnDef) => string
  header: (def: ColumnDef, index: number) => ReactNode
  rowCount: number
  row: (index: number) => ReactNode
  // Rows after the windowed ones, always rendered: new rows being typed
  tail?: ReactNode
  onPaste?: (e: ClipboardEvent<HTMLTableElement>) => void
  // Every row, not only the ones on screen: while printing, and while text
  // wraps, since the row window counts on one row height
  allRows?: boolean
  wrap?: boolean
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
  rowCount,
  row,
  tail,
  onPaste,
  allRows,
  wrap,
}: Props) {
  const { ref: bodyRef, window: win } = useRowWindow(rowCount, rowHeight, allRows || wrap)
  const tableRef = useRef<HTMLTableElement>(null)
  const headRef = useRef<HTMLTableSectionElement>(null)
  // Keeps the header row under the card's head while the page scrolls past
  // the table: the wrap scrolls sideways, so position: sticky would pin the
  // row to the wrap instead of the page. Not while printing: every row is on paper.
  useEffect(() => {
    const table = tableRef.current
    const head = headRef.current
    if (!table || !head) return
    let frame = 0
    const place = () => {
      frame = 0
      const cs = getComputedStyle(table)
      const stickyTop = parseFloat(cs.getPropertyValue('--topbar-h')) + parseFloat(cs.getPropertyValue('--head-h'))
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
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      ro.disconnect()
    }
  }, [])
  const span = defs.length + 1
  const indexes: number[] = []
  for (let i = win.start; i < win.end; i++) indexes.push(i)
  return (
    <div className="table-wrap">
      <table
        ref={tableRef}
        className={`grid${hasSelection ? ' has-selection' : ''}${wrap ? ' is-wrap' : ''}`}
        style={{ width: tableWidth(defs, widths) }}
        onPaste={onPaste}
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
              <th scope="col" key={def.id} className="grid-col" aria-sort={ariaSort(def, sort)}>
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

// Stands in for the rows above and below the window so the page keeps its height
function SpacerRow({ height, span }: { height: number; span: number }) {
  return (
    <tr className="grid-spacer" style={{ height }} aria-hidden="true">
      <td colSpan={span} />
    </tr>
  )
}
