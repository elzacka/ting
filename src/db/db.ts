import Dexie, { type EntityTable } from 'dexie'
import { itemSchema, propertySchema, type Item, type ItemInput, type Property } from './schema'
import { fromStored, storedItemSchema, toStored } from '../lib/backup'
import { decryptBytes, encryptBytes, fromB64, openJson, sealJson, toB64, type Sealed, type Vault } from '../lib/crypto'
import { fieldSettingsKey, readFieldSettings as parseFieldSettings, type ColumnDef, type FieldSettings } from '../lib/fields'
import { currentKey } from '../lib/vault'

// Every record is stored sealed under the session key: an item is one sealed
// JSON document plus its photo as separately sealed bytes, a property is one
// sealed document, and the field settings are a sealed setting. Only the id,
// the folder handle, the change stamp and the vault (which is itself only a
// wrapped key) are stored in the clear.

type SealedItemRow = {
  id: string
  sealed: Sealed
  photo: { iv: string; data: ArrayBuffer; type: string } | null
}
type SealedPropertyRow = { id: string; sealed: Sealed }
type Setting = { key: string; value?: unknown; sealed?: Sealed }

const db = new Dexie('ting') as Dexie & {
  items: EntityTable<SealedItemRow, 'id'>
  settings: EntityTable<Setting, 'key'>
  properties: EntityTable<SealedPropertyRow, 'id'>
}

db.version(1).stores({
  items: 'id, name, category, updatedAt',
})

db.version(2).stores({
  items: 'id, name, category, updatedAt',
  settings: 'key',
})

db.version(3).stores({
  items: 'id, name, category, updatedAt',
  settings: 'key',
  properties: 'id, createdAt',
})

// Encrypted at rest: no indexes on content, they would leak it.
db.version(4).stores({
  items: 'id',
  settings: 'key',
  properties: 'id',
})

async function touch(): Promise<void> {
  await db.settings.put({ key: 'localChangedAt', value: Date.now() })
}

// --- sealing helpers -------------------------------------------------------

async function sealItem(item: Item): Promise<SealedItemRow> {
  const { key } = currentKey()
  const sealed = await sealJson(key, toStored(item))
  let photo: SealedItemRow['photo'] = null
  if (item.photo) {
    const { iv, data } = await encryptBytes(key, new Uint8Array(await item.photo.arrayBuffer()))
    photo = { iv: toB64(iv), data: data.buffer as ArrayBuffer, type: item.photo.type }
  }
  return { id: item.id, sealed, photo }
}

async function openItem(row: SealedItemRow): Promise<Item> {
  const { key } = currentKey()
  const stored = storedItemSchema.parse(await openJson(key, row.sealed))
  let photo: Blob | null = null
  if (row.photo) {
    const bytes = await decryptBytes(key, fromB64(row.photo.iv), new Uint8Array(row.photo.data))
    photo = new Blob([bytes as BlobPart], { type: row.photo.type })
  }
  return fromStored(stored, photo)
}

async function sealProperty(p: Property): Promise<SealedPropertyRow> {
  return { id: p.id, sealed: await sealJson(currentKey().key, p) }
}

async function openProperty(row: SealedPropertyRow): Promise<Property> {
  return propertySchema.parse(await openJson(currentKey().key, row.sealed))
}

// --- reads -----------------------------------------------------------------

export async function readItems(): Promise<Item[]> {
  const rows = await db.items.toArray()
  return Promise.all(rows.map(openItem))
}

export async function readProperties(): Promise<Property[]> {
  const rows = await db.properties.toArray()
  return Promise.all(rows.map(openProperty))
}

export async function readFieldSettings(): Promise<FieldSettings> {
  const row = await db.settings.get(fieldSettingsKey)
  if (!row?.sealed) return parseFieldSettings(undefined)
  return parseFieldSettings(await openJson(currentKey().key, row.sealed))
}

// --- writes ----------------------------------------------------------------

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
  const row = await sealItem(item)
  await db.transaction('rw', db.items, db.settings, async () => {
    await db.items.add(row)
    await touch()
  })
  return item.id
}

export async function updateItem(id: string, input: ItemInput): Promise<void> {
  const existing = await db.items.get(id)
  if (!existing) throw new Error(`Item ${id} not found`)
  const current = await openItem(existing)
  const item = itemSchema.parse({ ...current, ...input, updatedAt: Date.now() })
  const row = await sealItem(item)
  await db.transaction('rw', db.items, db.settings, async () => {
    await db.items.put(row)
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
  const now = Date.now()
  const rows: SealedItemRow[] = []
  for (const input of added) {
    rows.push(
      await sealItem(
        itemSchema.parse({
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
        }),
      ),
    )
  }
  for (const { id, input } of edited) {
    const existing = await db.items.get(id)
    if (!existing) continue
    const current = await openItem(existing)
    rows.push(await sealItem(itemSchema.parse({ ...current, ...input, updatedAt: now })))
  }
  await db.transaction('rw', db.items, db.settings, async () => {
    await db.items.bulkPut(rows)
    await touch()
  })
}

export async function deleteItems(ids: string[]): Promise<void> {
  await db.transaction('rw', db.items, db.settings, async () => {
    await db.items.bulkDelete(ids)
    await touch()
  })
}

export async function addProperty(property: Property): Promise<void> {
  const row = await sealProperty(propertySchema.parse(property))
  await db.transaction('rw', db.properties, db.settings, async () => {
    await db.properties.put(row)
    await touch()
  })
}

export async function setFieldSettings(fields: FieldSettings): Promise<void> {
  const sealed = await sealJson(currentKey().key, fields)
  await db.transaction('rw', db.settings, async () => {
    await db.settings.put({ key: fieldSettingsKey, sealed })
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
    else
      props.push({
        id: d.id,
        key: d.col.key,
        unit: d.col.unit,
        createdAt: d.property?.createdAt ?? Date.now(),
        order: i,
        ...(d.property?.type ? { type: d.property.type } : {}),
        ...(d.property?.options ? { options: d.property.options } : {}),
      })
  })
  const rows = await Promise.all(props.map((p) => sealProperty(propertySchema.parse(p))))
  const sealedFields = await sealJson(currentKey().key, next)
  await db.transaction('rw', db.properties, db.settings, async () => {
    await db.properties.bulkPut(rows)
    await db.settings.put({ key: fieldSettingsKey, sealed: sealedFields })
    await touch()
  })
}

// Renames a column everywhere: the definition (created if the column only
// lived in item values) and the matching spec on every item.
export async function renameProperty(
  oldId: string,
  next: { id: string; key: string; unit: string | null; type: Property['type']; options?: string[] },
  matches: (spec: Item['specs'][number]) => boolean,
): Promise<void> {
  const oldRow = await db.properties.get(oldId)
  if (next.id !== oldId && (await db.properties.get(next.id))) throw new Error('exists')
  const old = oldRow ? await openProperty(oldRow) : null
  const def = await sealProperty(
    propertySchema.parse({
      id: next.id,
      key: next.key,
      unit: next.unit,
      type: next.type,
      ...(next.options && next.options.length > 0 ? { options: next.options } : {}),
      createdAt: old?.createdAt ?? Date.now(),
      ...(old?.order !== undefined ? { order: old.order } : {}),
    }),
  )
  const items = await readItems()
  const changed = await Promise.all(
    items
      .filter((item) => item.specs.some(matches))
      .map((item) =>
        sealItem({
          ...item,
          specs: item.specs.map((s) => (matches(s) ? { ...s, key: next.key, unit: next.unit } : s)),
          updatedAt: Date.now(),
        }),
      ),
  )
  await db.transaction('rw', db.properties, db.items, db.settings, async () => {
    if (oldRow) await db.properties.delete(oldId)
    await db.properties.put(def)
    await db.items.bulkPut(changed)
    await touch()
  })
}

// Removes the definition, and the matching spec from every item that has it.
export async function removeProperty(id: string, matches: (spec: Item['specs'][number]) => boolean): Promise<void> {
  const items = await readItems()
  const changed = await Promise.all(
    items
      .filter((item) => item.specs.some(matches))
      .map((item) => sealItem({ ...item, specs: item.specs.filter((s) => !matches(s)), updatedAt: Date.now() })),
  )
  await db.transaction('rw', db.properties, db.items, db.settings, async () => {
    await db.properties.delete(id)
    await db.items.bulkPut(changed)
    await touch()
  })
}

// Replaces everything with what a file or a folder holds. Does not touch
// localChangedAt: loading is not a local edit.
export async function replaceAll(items: Item[], properties: Property[]): Promise<void> {
  const itemRows = await Promise.all(items.map((i) => sealItem(itemSchema.parse(i))))
  const propRows = await Promise.all(properties.map((p) => sealProperty(propertySchema.parse(p))))
  await db.transaction('rw', db.items, db.properties, async () => {
    await db.items.clear()
    await db.items.bulkAdd(itemRows)
    await db.properties.clear()
    await db.properties.bulkAdd(propRows)
  })
}

// --- plain settings ----------------------------------------------------------

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

export const vaultKey = 'vault'

export function readVault(): Promise<Vault | undefined> {
  return getSetting<Vault>(vaultKey)
}

export function writeVault(vault: Vault): Promise<void> {
  return setSetting(vaultKey, vault)
}

// --- one-time migration of data written before encryption ------------------

type PlainItemRow = Item & { sealed?: undefined }
type PlainPropertyRow = Property & { sealed?: undefined }

// Rows from version 3 still carry their fields in the clear. The first unlock
// after a passphrase is set rewrites them sealed.
export async function sealPlaintextRows(): Promise<number> {
  const rawItems = (await db.items.toArray()) as unknown as (SealedItemRow | PlainItemRow)[]
  const rawProps = (await db.properties.toArray()) as unknown as (SealedPropertyRow | PlainPropertyRow)[]
  const fieldsRow = await db.settings.get(fieldSettingsKey)

  const itemRows: SealedItemRow[] = []
  for (const r of rawItems) {
    if (r.sealed) continue
    itemRows.push(await sealItem(itemSchema.parse(r)))
  }
  const propRows: SealedPropertyRow[] = []
  for (const r of rawProps) {
    if (r.sealed) continue
    propRows.push(await sealProperty(propertySchema.parse(r)))
  }
  const fieldsSealed =
    fieldsRow && !fieldsRow.sealed ? await sealJson(currentKey().key, parseFieldSettings(fieldsRow.value)) : null

  await db.transaction('rw', db.items, db.properties, db.settings, async () => {
    if (itemRows.length) await db.items.bulkPut(itemRows)
    if (propRows.length) await db.properties.bulkPut(propRows)
    if (fieldsSealed) await db.settings.put({ key: fieldSettingsKey, sealed: fieldsSealed })
  })
  return itemRows.length + propRows.length
}

export { db }
