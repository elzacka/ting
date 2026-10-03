import { useCallback, useEffect, useState } from 'react'
import { getSealedSetting, setSealedSetting } from '../db/db'
import { errorText } from './errors'
import type { ColumnDef } from './fields'

const legacyKey = 'ting.columnWidths'
const widthsKey = 'columnWidths'
export const minColumnWidth = 56
const headerPadding = 20 // th padding left and right
const headerExtra = 28 // menu chevron and sort arrow
const cellPadding = 18 // a cell's control: 8 px padding and 1 px border on each side
const thumbGap = 8 // between a thumbnail and the name
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
// A place carries the whole way in, so it is the widest of the lot
const defaults = { category: 160, name: 260, text: 160, choice: 160, number: 120, date: 112, path: 220 }

export function columnWidth(def: ColumnDef, widths: Widths): number {
  const set = widths[def.id]
  if (set !== undefined) return set
  return def.kind === 'prop' ? defaults[def.type] : defaults[def.kind]
}

export function tableWidth(defs: readonly ColumnDef[], widths: Widths, extra = 0): number {
  return checkColumnWidth() + defs.reduce((sum, d) => sum + columnWidth(d, widths), 0) + extra
}

const maxAutoWidth = 420

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

// Width from content for columns the user has not set: the widest value (measured in the cell
// font, off screen) or the header, plus chrome, capped so one long name cannot take the table.
// Runs over all rows, not only the windowed ones, so scrolling never changes a width.
export function autoWidths(
  defs: readonly ColumnDef[],
  label: (def: ColumnDef) => string,
  values: (def: ColumnDef) => Iterable<string>,
  thumbs: boolean,
): Widths {
  const ctx = document.createElement('canvas').getContext('2d')
  const out: Widths = {}
  if (!ctx) return out
  const font = cssVar('--font')
  const cellFont = `${cssVar('--text-cell')} ${font}`
  const headFont = `600 ${cssVar('--text-xs')} ${font}`
  for (const def of defs) {
    ctx.font = headFont
    let max = ctx.measureText(label(def)).width + headerPadding + headerExtra
    ctx.font = cellFont
    const extra = cellPadding + (def.kind === 'name' && thumbs ? 28 + thumbGap : 0)
    for (const v of values(def)) {
      const w = ctx.measureText(v).width + extra
      if (w > max) max = w
    }
    out[def.id] = Math.min(maxAutoWidth, Math.max(minColumnWidth, Math.ceil(max + slack)))
  }
  return out
}

// Stored or legacy, it is untrusted: keep only finite numbers in range.
function clean(parsed: unknown): Widths {
  if (typeof parsed !== 'object' || parsed === null) return {}
  const out: Widths = {}
  for (const [k, v] of Object.entries(parsed)) {
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = Math.min(2000, Math.max(minColumnWidth, v))
  }
  return out
}

// Keyed by column id, which names the property: sealed, and moved out of
// localStorage where an earlier version kept them in the clear.
async function load(): Promise<Widths> {
  const sealed = await getSealedSetting<unknown>(widthsKey)
  if (sealed !== undefined) return clean(sealed)
  try {
    const legacy = localStorage.getItem(legacyKey)
    if (legacy === null) return {}
    const widths = clean(JSON.parse(legacy))
    await setSealedSetting(widthsKey, widths)
    localStorage.removeItem(legacyKey)
    return widths
  } catch {
    return {}
  }
}

// Column widths chosen by the user, per column id, shared by both tables.
// Read once a key is open; dropped again on lock.
export function useColumnWidths(unlocked: boolean): { widths: Widths; setWidth: (id: string, w: number | null) => void } {
  const [widths, setWidths] = useState<Widths>({})
  useEffect(() => {
    if (!unlocked) return setWidths({})
    let live = true
    load()
      .then((w) => live && setWidths(w))
      .catch((err: unknown) => console.error(errorText(err)))
    return () => {
      live = false
    }
  }, [unlocked])
  const setWidth = useCallback((id: string, w: number | null) => {
    setWidths((prev) => {
      const next = { ...prev }
      if (w === null) delete next[id]
      else next[id] = Math.max(minColumnWidth, Math.round(w))
      setSealedSetting(widthsKey, next).catch((err: unknown) => console.error(errorText(err)))
      return next
    })
  }, [])
  return { widths, setWidth }
}

// The narrowest width that shows every value whole: each cell's text measured in its own font,
// off screen, plus the chrome. A cell's scrollWidth never comes out below its current width.
export function fitWidth(table: HTMLTableElement, colIndex: number): number {
  const probe = document.createElement('span')
  probe.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden;white-space:pre'
  document.body.appendChild(probe)
  let max = 0
  try {
    table.querySelectorAll('tr').forEach((row) => {
      const cell = row.children[colIndex]
      if (!(cell instanceof HTMLElement)) return
      // Spacer and foot rows span every column; their width says nothing about this one
      if (cell instanceof HTMLTableCellElement && cell.colSpan > 1) return
      const input = cell.querySelector('input')
      const inner =
        cell.querySelector<HTMLElement>('.sort-btn') ??
        cell.querySelector<HTMLElement>('.grid-link') ??
        cell.querySelector<HTMLElement>('.grid-cell') ??
        input ??
        cell
      probe.style.font = getComputedStyle(inner).font
      probe.textContent = input ? input.value : (inner.textContent ?? '')
      let w = probe.offsetWidth
      if (cell.tagName === 'TH') w += headerPadding + headerExtra
      else {
        w += cellPadding
        const thumb = cell.querySelector<HTMLElement>('.thumb')
        if (thumb) w += thumb.offsetWidth + thumbGap
      }
      if (w > max) max = w
    })
  } finally {
    probe.remove()
  }
  return Math.max(minColumnWidth, max + slack)
}
