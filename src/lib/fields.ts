import type { Item, Property, PropertyType } from '../db/schema'
import { dateUnit, isDateUnit } from './dates'
import { columnId, columnsFrom, type Column } from './grid'

// Display settings for the one built-in field. Navn can be renamed and moved
// like a property but never removed: it is the identity of a thing in every
// view. Kategori was a built-in until 21 September 2026; it is a property.
export type FieldSettings = {
  name: { label: string | null; order: number }
}

export const fieldSettingsKey = 'fields'

export const defaultFieldSettings: FieldSettings = {
  name: { label: null, order: -1 },
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

export function readFieldSettings(raw: unknown): FieldSettings {
  const r = (raw ?? {}) as Partial<FieldSettings>
  return { name: { ...defaultFieldSettings.name, ...(r.name ?? {}) } }
}

export type ColumnDef =
  | { kind: 'name'; id: 'name'; order: number }
  | { kind: 'prop'; id: string; order: number; col: Column; property: Property | null; type: PropertyType }

// Every visible column in display order: Navn and the properties interleaved.
export function columnDefs(fields: FieldSettings, properties: readonly Property[], items: readonly Item[]): ColumnDef[] {
  const defs: ColumnDef[] = []
  defs.push({ kind: 'name', id: 'name', order: fields.name.order })
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
    defs.push({ kind: 'prop', id, order: Number.MAX_SAFE_INTEGER, col: c, property: null, type: isDateUnit(c.unit) ? 'date' : 'text' })
  }
  return defs.sort((a, b) => a.order - b.order)
}

export function propColumns(defs: readonly ColumnDef[]): Column[] {
  return defs.flatMap((d) => (d.kind === 'prop' ? [d.col] : []))
}

// Rows written before types existed: the date marker means date, any other
// unit means number (text columns never carry a unit), otherwise text.
export function propertyType(p: Pick<Property, 'type' | 'unit'>): PropertyType {
  if (p.type) return p.type
  if (isDateUnit(p.unit)) return 'date'
  return p.unit ? 'number' : 'text'
}

// The unit a stored property gets for a type: dates carry the internal marker, text has none.
export function unitFor(type: PropertyType, unit: string): string | null {
  if (type === 'date') return dateUnit
  if (type === 'text' || type === 'choice') return null
  return unit.trim() === '' ? null : unit.trim()
}
