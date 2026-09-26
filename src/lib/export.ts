import type { Item, Property } from '../db/schema'
import { columnDefs, type FieldSettings } from './fields'
import { columnId, columnsFrom, type Column } from './grid'
import { formatStoredDate, isDateUnit } from './dates'
import { parseNumber } from './values'

const dateFormat = new Intl.DateTimeFormat('nb-NO', { day: '2-digit', month: '2-digit', year: '2-digit' })

// A cell that starts with = + - @ or a tab is read as a formula by Excel and
// Numbers, so text like "=HYPERLINK(...)" typed into a field would run there.
// Such text gets a leading apostrophe. Plain negative numbers are left alone.
function csvCell(v: string): string {
  const formulaLike = /^[=+\-@\t\r]/.test(v) && parseNumber(v) === null
  const safe = formulaLike ? `'${v}` : v
  return /[";\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

function cellValue(item: Item, col: Column): string {
  const s = item.specs.find((x) => columnId({ key: x.key, unit: x.unit }) === columnId(col))
  if (!s) return ''
  if (isDateUnit(s.unit)) return formatStoredDate(s.value)
  const n = parseNumber(s.value)
  // Comma decimal so a Norwegian spreadsheet reads it as a number.
  return n === null ? String(s.value) : String(n).replace('.', ',')
}

// Columns in the shared order, skipping properties nobody has a value for.
export function exportColumns(items: readonly Item[], properties: readonly Property[], fields: FieldSettings) {
  const used = new Set(columnsFrom(items).map(columnId))
  return columnDefs(fields, properties, items).filter((d) => d.kind !== 'prop' || used.has(d.id))
}

export function toCsv(items: readonly Item[], properties: readonly Property[], fields: FieldSettings): string {
  const defs = exportColumns(items, properties, fields)
  const header = defs.map((d) =>
    d.kind === 'name'
      ? (fields.name.label ?? 'Navn')
      : d.col.unit && !isDateUnit(d.col.unit)
          ? `${d.col.key} (${d.col.unit})`
          : d.col.key,
  )
  const rows = [
    [...header, 'Opprettet'],
    ...items.map((item) => [
      ...defs.map((d) =>
        d.kind === 'name' ? item.name : cellValue(item, d.col),
      ),
      dateFormat.format(new Date(item.createdAt)),
    ]),
  ]
  return '﻿' + rows.map((r) => r.map(csvCell).join(';')).join('\r\n') + '\r\n'
}

export function downloadText(filename: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function exportFilename(ext: string, date = new Date()): string {
  const iso = date.toISOString().slice(0, 10)
  return `ting-${iso}.${ext}`
}
