import Dexie, { type EntityTable } from 'dexie'
import { itemSchema, propertySchema, type Item, type ItemInput, type Property } from './schema'
import { fieldSettingsKey, type ColumnDef, type FieldSettings } from '../lib/fields'

type Setting = { key: string; value: unknown }

const db = new Dexie('ting') as Dexie & {
  items: EntityTable<Item, 'id'>
  settings: EntityTable<Setting, 'key'>
  properties: EntityTable<Property, 'id'>
}

db.version(1).stores({
  items: 'id, name, category, updatedAt',
})

// settings: folder handle for the on-disk copy, and when local data last changed.
db.version(2).stores({
  items: 'id, name, category, updatedAt',
  settings: 'key',
})

// properties: column definitions that exist independently of item values.
db.version(3).stores({
  items: 'id, name, category, updatedAt',
  settings: 'key',
  properties: 'id, createdAt',
})

async function touch(): Promise<void> {
  await db.settings.put({ key: 'localChangedAt', value: Date.now() })
}

export async function addItem(input: ItemInput): Promise<string> {
  const now = Date.now()
  const item = itemSchema.parse({
    ...input,
    id: crypto.randomUUID(),
    locationId: null,
    value: null,
    purchaseDate: null,
    receiptImage: null,
    barcode: null,
    serialNumber: null,
    warrantyDate: null,
    createdAt: now,
    updatedAt: now,
  })
  await db.transaction('rw', db.items, db.settings, async () => {
    await db.items.add(item)
    await touch()
  })
  return item.id
}

export async function updateItem(id: string, input: ItemInput): Promise<void> {
  const existing = await db.items.get(id)
  if (!existing) throw new Error(`Item ${id} not found`)
  const item = itemSchema.parse({ ...existing, ...input, updatedAt: Date.now() })
  await db.transaction('rw', db.items, db.settings, async () => {
    await db.items.put(item)
    await touch()
  })
}

export async function deleteItem(id: string): Promise<void> {
  await db.transaction('rw', db.items, db.settings, async () => {
    await db.items.delete(id)
    await touch()
  })
}

// One transaction for a whole table save: new rows and edited rows together.
export async function saveBatch(added: ItemInput[], edited: { id: string; input: ItemInput }[]): Promise<void> {
  await db.transaction('rw', db.items, db.settings, async () => {
    for (const input of added) await addItem(input)
    for (const { id, input } of edited) await updateItem(id, input)
  })
}

export async function deleteItems(ids: string[]): Promise<void> {
  await db.transaction('rw', db.items, db.settings, async () => {
    await db.items.bulkDelete(ids)
    await touch()
  })
}

export async function addProperty(property: Property): Promise<void> {
  await db.transaction('rw', db.properties, db.settings, async () => {
    await db.properties.put(propertySchema.parse(property))
    await touch()
  })
}

export async function setFieldSettings(fields: FieldSettings): Promise<void> {
  await db.transaction('rw', db.settings, async () => {
    await db.settings.put({ key: fieldSettingsKey, value: fields })
    await touch()
  })
}

// Writes the full column order in one go: built-in fields and properties.
// Property columns without a definition get one.
export async function setColumnOrder(defs: readonly ColumnDef[], fields: FieldSettings): Promise<void> {
  const next: FieldSettings = { category: { ...fields.category }, name: { ...fields.name } }
  const props: Property[] = []
  defs.forEach((d, i) => {
    if (d.kind === 'category') next.category.order = i
    else if (d.kind === 'name') next.name.order = i
    else props.push({ id: d.id, key: d.col.key, unit: d.col.unit, createdAt: d.property?.createdAt ?? Date.now(), order: i })
  })
  await db.transaction('rw', db.properties, db.settings, async () => {
    await db.properties.bulkPut(props.map((p) => propertySchema.parse(p)))
    await db.settings.put({ key: fieldSettingsKey, value: next })
    await touch()
  })
}

// Renames a column everywhere: the definition (created if the column only
// lived in item values) and the matching spec on every item.
export async function renameProperty(
  oldId: string,
  next: { id: string; key: string; unit: string | null; type: Property['type'] },
  matches: (spec: Item['specs'][number]) => boolean,
): Promise<void> {
  await db.transaction('rw', db.properties, db.items, db.settings, async () => {
    if (next.id !== oldId && (await db.properties.get(next.id))) throw new Error('exists')
    const old = await db.properties.get(oldId)
    if (old) await db.properties.delete(oldId)
    await db.properties.put(
      propertySchema.parse({
        id: next.id,
        key: next.key,
        unit: next.unit,
        type: next.type,
        createdAt: old?.createdAt ?? Date.now(),
        ...(old?.order !== undefined ? { order: old.order } : {}),
      }),
    )
    const items = await db.items.toArray()
    for (const item of items) {
      if (!item.specs.some(matches)) continue
      await db.items.put({
        ...item,
        specs: item.specs.map((s) => (matches(s) ? { ...s, key: next.key, unit: next.unit } : s)),
        updatedAt: Date.now(),
      })
    }
    await touch()
  })
}

// Removes the definition, and the matching spec from every item that has it.
export async function removeProperty(id: string, matches: (spec: Item['specs'][number]) => boolean): Promise<void> {
  await db.transaction('rw', db.properties, db.items, db.settings, async () => {
    await db.properties.delete(id)
    const items = await db.items.toArray()
    for (const item of items) {
      if (!item.specs.some(matches)) continue
      await db.items.put({ ...item, specs: item.specs.filter((s) => !matches(s)), updatedAt: Date.now() })
    }
    await touch()
  })
}

// Replaces everything with what a file or a folder holds. Does not touch
// localChangedAt: loading is not a local edit.
export async function replaceAll(items: Item[], properties: Property[]): Promise<void> {
  const parsedItems = items.map((i) => itemSchema.parse(i))
  const parsedProps = properties.map((p) => propertySchema.parse(p))
  await db.transaction('rw', db.items, db.properties, async () => {
    await db.items.clear()
    await db.items.bulkAdd(parsedItems)
    await db.properties.clear()
    await db.properties.bulkAdd(parsedProps)
  })
}

export async function localChangedAt(): Promise<number> {
  const row = await db.settings.get('localChangedAt')
  return typeof row?.value === 'number' ? row.value : 0
}

export async function getSetting<T>(key: string): Promise<T | undefined> {
  const row = await db.settings.get(key)
  return row?.value as T | undefined
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await db.settings.put({ key, value })
}

export async function deleteSetting(key: string): Promise<void> {
  await db.settings.delete(key)
}

export { db }
