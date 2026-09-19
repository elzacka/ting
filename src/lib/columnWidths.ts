import { useCallback, useState } from 'react'
import type { ColumnDef } from './fields'

const storageKey = 'ting.columnWidths'
export const minColumnWidth = 56
const headerPadding = 20 // th padding left and right
const headerExtra = 28 // menu chevron and sort arrow
const slack = 4

export type Widths = Record<string, number>

// Excel-like: every column has an exact width, a default until the user sets one.
// The checkbox column is exactly the page gutter, so the first data column
// starts at the content edge.
export function checkColumnWidth(): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--gutter')
  const n = parseFloat(raw)
  return Number.isFinite(n) ? n : 24
}
const defaults = { category: 160, name: 260, text: 160, choice: 160, number: 120, date: 112 }

export function columnWidth(def: ColumnDef, widths: Widths): number {
  const set = widths[def.id]
  if (set !== undefined) return set
  return def.kind === 'prop' ? defaults[def.type] : defaults[def.kind]
}

export function tableWidth(defs: readonly ColumnDef[], widths: Widths, extra = 0): number {
  return checkColumnWidth() + defs.reduce((sum, d) => sum + columnWidth(d, widths), 0) + extra
}

// Anything from localStorage is untrusted: keep only finite numbers in range.
function read(): Widths {
  try {
    const raw = localStorage.getItem(storageKey)
    const parsed: unknown = raw ? JSON.parse(raw) : {}
    if (typeof parsed !== 'object' || parsed === null) return {}
    const out: Widths = {}
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === 'number' && Number.isFinite(v)) out[k] = Math.min(2000, Math.max(minColumnWidth, v))
    }
    return out
  } catch {
    return {}
  }
}

// Column widths chosen by the user, per column id, shared by both tables.
export function useColumnWidths(): { widths: Widths; setWidth: (id: string, w: number | null) => void } {
  const [widths, setWidths] = useState<Widths>(read)
  const setWidth = useCallback((id: string, w: number | null) => {
    setWidths((prev) => {
      const next = { ...prev }
      if (w === null) delete next[id]
      else next[id] = Math.max(minColumnWidth, Math.round(w))
      try {
        localStorage.setItem(storageKey, JSON.stringify(next))
      } catch {
        // Widths simply do not persist.
      }
      return next
    })
  }, [])
  return { widths, setWidth }
}

// Width that shows every value in the column in full. Measured from the DOM:
// scrollWidth already accounts for padding, the font and the dropdown indicator
// a suggestion list adds to an input.
export function fitWidth(table: HTMLTableElement, colIndex: number): number {
  let max = 0
  table.querySelectorAll('tr').forEach((row) => {
    const cell = row.children[colIndex]
    if (!(cell instanceof HTMLElement)) return
    let w: number
    if (cell.tagName === 'TH') {
      const label = cell.querySelector<HTMLElement>('.sort-btn')
      w = (label?.scrollWidth ?? 0) + headerPadding + headerExtra
    } else {
      const input = cell.querySelector('input')
      w = input ? input.scrollWidth + 2 : cell.scrollWidth
    }
    if (w > max) max = w
  })
  return Math.max(minColumnWidth, max + slack)
}
