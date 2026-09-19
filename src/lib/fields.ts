import type { Item, Property, PropertyType } from '../db/schema'
import { dateUnit, isDateUnit } from './dates'
import { columnId, columnsFrom, type Column } from './grid'

// Display settings for the two built-in fields. They can be renamed and moved
// like properties; Kategori can also be hidden. Navn cannot: it is the identity
// of a thing in every view.
export type FieldSettings = {
  category: { label: string | null; order: number; hidden: boolean }
  name: { label: string | null; order: number }
}

export const fieldSettingsKey = 'fields'

export const defaultFieldSettings: FieldSettings = {
  category: { label: null, order: -2, hidden: false },
  name: { label: null, order: -1 },
}

export function readFieldSettings(raw: unknown): FieldSettings {
  const r = (raw ?? {}) as Partial<FieldSettings>
  return {
    category: { ...defaultFieldSettings.category, ...(r.category ?? {}) },
    name: { ...defaultFieldSettings.name, ...(r.name ?? {}) },
  }
}

export type ColumnDef =
  | { kind: 'category'; id: 'category'; order: number }
  | { kind: 'name'; id: 'name'; order: number }
  | { kind: 'prop'; id: string; order: number; col: Column; property: Property | null; type: PropertyType }

// Every visible column in display order: built-in fields and properties interleaved.
export function columnDefs(fields: FieldSettings, properties: readonly Property[], items: readonly Item[]): ColumnDef[] {
  const defs: ColumnDef[] = []
  if (!fields.category.hidden) defs.push({ kind: 'category', id: 'category', order: fields.category.order })
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
