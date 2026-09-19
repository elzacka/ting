import type { MouseEvent as ReactMouseEvent } from 'react'
import { fitWidth, minColumnWidth } from '../lib/columnWidths'
import { t } from '../lib/strings'

type Props = { id: string; label: string; onWidth: (id: string, w: number | null) => void }

// Thin handle at a header's right edge: drag to resize, double-click to fit the content.
export function ColumnResizer({ id, label, onWidth }: Props) {
  function onMouseDown(e: ReactMouseEvent<HTMLDivElement>) {
    e.preventDefault()
    e.stopPropagation()
    const th = e.currentTarget.closest('th')
    if (!th) return
    const startX = e.clientX
    const startW = th.getBoundingClientRect().width
    const move = (ev: MouseEvent) => onWidth(id, Math.max(minColumnWidth, startW + ev.clientX - startX))
    const up = () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      document.body.style.cursor = ''
    }
    document.body.style.cursor = 'col-resize'
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  function onDoubleClick(e: ReactMouseEvent<HTMLDivElement>) {
    e.preventDefault()
    e.stopPropagation()
    const th = e.currentTarget.closest('th')
    const table = th?.closest('table')
    if (!th || !table) return
    onWidth(id, fitWidth(table, Array.from(th.parentElement?.children ?? []).indexOf(th)))
  }

  return (
    <div
      className="col-resizer"
      role="separator"
      aria-orientation="vertical"
      aria-label={t.table.resize(label)}
      title={t.table.resizeHint}
      onMouseDown={onMouseDown}
      onDoubleClick={onDoubleClick}
    />
  )
}
