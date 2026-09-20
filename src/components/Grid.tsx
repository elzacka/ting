import type { ClipboardEvent, ReactNode } from 'react'
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
  // Every row, not only the ones on screen: while printing
  allRows?: boolean
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
}: Props) {
  const { ref: bodyRef, window: win } = useRowWindow(rowCount, rowHeight, allRows)
  const span = defs.length + 1
  const indexes: number[] = []
  for (let i = win.start; i < win.end; i++) indexes.push(i)
  return (
    <div className="table-wrap">
      <table
        className={`grid${hasSelection ? ' has-selection' : ''}`}
        style={{ width: tableWidth(defs, widths) }}
        onPaste={onPaste}
      >
        <colgroup>
          <col style={{ width: checkColumnWidth() }} />
          {defs.map((def) => (
            <col key={def.id} style={{ width: columnWidth(def, widths) }} />
          ))}
        </colgroup>
        <thead>
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
