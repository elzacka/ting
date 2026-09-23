import type { Item, Property, PropertyType } from '../db/schema'
import { dateUnit, isDateUnit } from './dates'
import { isPathUnit, pathUnit } from './paths'
import { columnId, columnsFrom, type Column } from './grid'

// Display settings for the one built-in field. Navn can be renamed but never
// moved or removed: it is the identity of a thing, always the first column,
// frozen when the table scrolls sideways.
export type FieldSettings = {
  name: { label: string | null }
}

export const fieldSettingsKey = 'fields'

export const defaultFieldSettings: FieldSettings = {
  name: { label: null },
}

// The property Kategori: first column, a Valgliste, created when things carry
// one from before it was a property.
export const categoryKey = 'Kategori'
export const categoryColumnId = columnId({ key: categoryKey, unit: '' })
export const categoryProperty = (): Property => ({
  id: categoryColumnId,
  key: categoryKey,
  unit: '',
  createdAt: Date.now(),
  order: -2,
  type: 'choice',
  options: [],
})

// The property Strekkode: a text column, created the first time a code is
// scanned or typed on the phone form.
export const barcodeKey = 'Strekkode'
export const barcodeColumnId = columnId({ key: barcodeKey, unit: null })
export const barcodeProperty = (): Property => ({
  id: barcodeColumnId,
  key: barcodeKey,
  unit: null,
  createdAt: Date.now(),
  type: 'text',
})

export function readFieldSettings(raw: unknown): FieldSettings {
  const r = (raw ?? {}) as Partial<FieldSettings>
  return { name: { label: r.name?.label ?? null } }
}

export type ColumnDef =
  | { kind: 'name'; id: 'name'; order: number }
  | { kind: 'prop'; id: string; order: number; col: Column; property: Property | null; type: PropertyType }

// Every column in display order: Navn first, then the properties by their order.
export function columnDefs(_fields: FieldSettings, properties: readonly Property[], items: readonly Item[]): ColumnDef[] {
  const defs: ColumnDef[] = []
  defs.push({ kind: 'name', id: 'name', order: Number.MIN_SAFE_INTEGER })
  const stored = new Set<string>()
  for (const p of properties) {
    stored.add(p.id)
    defs.push({
      kind: 'prop',
      id: p.id,
      order: p.order ?? Number.MAX_SAFE_INTEGER - 1_000_000 + Math.min(p.createdAt / 1000, 999_999),
      col: { key: p.key, unit: p.unit },
      property: p,
      type: propertyType(p),
    })
  }
  for (const c of columnsFrom(items)) {
    const id = columnId(c)
    if (stored.has(id)) continue
    const marked: PropertyType = isDateUnit(c.unit) ? 'date' : isPathUnit(c.unit) ? 'path' : 'text'
    defs.push({ kind: 'prop', id, order: Number.MAX_SAFE_INTEGER, col: c, property: null, type: marked })
  }
  return defs.sort((a, b) => a.order - b.order)
}

export function propColumns(defs: readonly ColumnDef[]): Column[] {
  return defs.flatMap((d) => (d.kind === 'prop' ? [d.col] : []))
}

// Kategori values are typed by hand, so they are compared folded, the way the
// filters compare the values they were chosen from.
function foldCategory(value: string): string {
  return value.trim().toLocaleLowerCase('nb')
}

// A column belongs in the view when it belongs to at least one category in
// view: with Kjøkken and Interiør chosen together, Kjøkken's own Rom stays
// for the Kjøkken things, empty on the others, rather than hide what they
// hold (elzacka, 23 September 2026). A column that names no category belongs
// to all of them, so it always does. With no category chosen the view is
// every category at once, which leaves the columns that belong everywhere.
export function appliesTo(property: Property | null, categories: readonly string[]): boolean {
  const own = property?.categories
  if (!own || own.length === 0) return true
  if (categories.length === 0) return false
  const mine = new Set(own.map(foldCategory))
  return categories.some((c) => mine.has(foldCategory(c)))
}

// Whether a column is one the categories in view ask for. Those are shown
// even when empty: inside a category its own columns are the work list.
export function claimedBy(property: Property | null, categories: readonly string[]): boolean {
  return categories.length > 0 && (property?.categories?.length ?? 0) > 0 && appliesTo(property, categories)
}

// The list a column carries after it is used, or stopped being used, in one
// category. Emptied, it belongs everywhere again.
export function withCategory(property: Property | null, category: string, on: boolean): string[] {
  const own = property?.categories ?? []
  const fold = foldCategory(category)
  const rest = own.filter((c) => foldCategory(c) !== fold)
  return on ? [...rest, category] : rest
}

// Rows written before types existed: a marker unit means the type it marks,
// any other unit means number (text columns never carry a unit), otherwise text.
export function propertyType(p: Pick<Property, 'type' | 'unit'>): PropertyType {
  if (p.type) return p.type
  if (isDateUnit(p.unit)) return 'date'
  if (isPathUnit(p.unit)) return 'path'
  return p.unit ? 'number' : 'text'
}

// The unit a stored property gets for a type: dates and places carry their
// internal marker, text has none.
export function unitFor(type: PropertyType, unit: string): string | null {
  if (type === 'date') return dateUnit
  if (type === 'path') return pathUnit
  if (type === 'text' || type === 'choice') return null
  return unit.trim() === '' ? null : unit.trim()
}
