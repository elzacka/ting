import Dexie, { type EntityTable } from 'dexie'
import { passkeySchema, type PasskeyRecord } from '../lib/passkey'
import { itemSchema, propertySchema, type Item, type ItemInput, type Property } from './schema'
import { fromStored, legacyAsSpecs, storedItemSchema, toStored } from '../lib/backup'
import { columnId } from '../lib/grid'
import { decryptBytes, encryptBytes, fromB64, openJson, sealJson, toB64, type Sealed, type Vault } from '../lib/crypto'
import {
  categoryColumnId,
  categoryProperty,
  fieldSettingsKey,
  readFieldSettings as parseFieldSettings,
  type ColumnDef,
  type FieldSettings,
} from '../lib/fields'
import { errorText } from '../lib/errors'
import { applyCategoryEdit, type CategoryEdit } from '../lib/categories'
import { applyOptionEdit, type OptionEdit } from '../lib/options'
import { currentKey, subscribeVault, vaultState } from '../lib/vault'

// Every record is stored sealed under the session key: an item is one sealed
// JSON document plus its photos as separately sealed bytes, a property is one
// sealed document, and the field settings are a sealed setting. Only the id,
// the folder handle, the change stamp and the vault (which is itself only a
// wrapped key) are stored in the clear.

type SealedPhoto = { iv: string; data: ArrayBuffer; type: string }
type SealedItemRow = {
  id: string
  sealed: Sealed
  photos: SealedPhoto[]
  // Written before a thing could carry more than one. Read, never written.
  photo?: SealedPhoto | null
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

// A row's photos, whichever way the row was written: a list, or the one photo
// a thing could carry before it could carry several.
function sealedPhotos(row: SealedItemRow): SealedPhoto[] {
  if (row.photos) return row.photos
  return row.photo ? [row.photo] : []
}

async function sealItem(item: Item): Promise<SealedItemRow> {
  const { key } = currentKey()
  const sealed = await sealJson(key, toStored(item))
  const photos = await Promise.all(
    item.photos.map(async (photo) => {
      const { iv, data } = await encryptBytes(key, new Uint8Array(await photo.arrayBuffer()))
      return { iv: toB64(iv), data: data.buffer as ArrayBuffer, type: photo.type }
    }),
  )
  return { id: item.id, sealed, photos }
}

async function openItem(row: SealedItemRow): Promise<Item> {
  const { key } = currentKey()
  const stored = storedItemSchema.parse(await openJson(key, row.sealed))
  const photos = await Promise.all(
    sealedPhotos(row).map(async (p) => {
      const bytes = await decryptBytes(key, fromB64(p.iv), new Uint8Array(p.data))
      return new Blob([bytes as BlobPart], { type: p.type })
    }),
  )
  return fromStored(stored, photos)
}

async function sealProperty(p: Property): Promise<SealedPropertyRow> {
  return { id: p.id, sealed: await sealJson(currentKey().key, p) }
}

async function openProperty(row: SealedPropertyRow): Promise<Property> {
  return propertySchema.parse(await openJson(currentKey().key, row.sealed))
}

// --- reads -----------------------------------------------------------------

// One unreadable row must not hide the rest: it is skipped and named in the
// console. The row itself stays in the table untouched.
async function openAll<R extends { id: string }, T>(rows: R[], open: (row: R) => Promise<T>): Promise<T[]> {
  const results = await Promise.allSettled(rows.map(open))
  const out: T[] = []
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') out.push(r.value)
    else console.warn(`Skipping unreadable row ${rows[i]?.id}: ${errorText(r.reason)}`)
  })
  return out
}

// Opened items are kept by id and by the nonces of their sealed parts: a
// fresh seal means a fresh nonce, so an unchanged row costs nothing to read
// again. The cache belongs to one data key; another key empties it.
const opened = new Map<string, { dekId: string; iv: string; photoIvs: string; item: Item }>()
subscribeVault(() => {
  if (vaultState().status !== 'open') opened.clear()
})

async function openItemCached(row: SealedItemRow): Promise<Item> {
  const { dekId } = currentKey()
  // One nonce per photo: a photo added, dropped or replaced changes the join
  const photoIvs = sealedPhotos(row)
    .map((p) => p.iv)
    .join(' ')
  const hit = opened.get(row.id)
  if (hit && hit.dekId === dekId && hit.iv === row.sealed.iv && hit.photoIvs === photoIvs) return hit.item
  const item = await openItem(row)
  opened.set(row.id, { dekId, iv: row.sealed.iv, photoIvs, item })
  return item
}

export async function readItems(): Promise<Item[]> {
  const rows = await db.items.toArray()
  const keep = new Set(rows.map((r) => r.id))
  for (const id of opened.keys()) if (!keep.has(id)) opened.delete(id)
  return openAll(rows, openItemCached)
}

export async function readProperties(): Promise<Property[]> {
  return openAll(await db.properties.toArray(), openProperty)
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

// Writes the full column order in one go. Navn is not in the order: it is
// always first. Property columns without a definition get one.
export async function setColumnOrder(defs: readonly ColumnDef[]): Promise<void> {
  const props: Property[] = []
  defs.forEach((d, i) => {
    if (d.kind !== 'name')
      props.push({
        id: d.id,
        key: d.col.key,
        unit: d.col.unit,
        createdAt: d.property?.createdAt ?? Date.now(),
        order: i,
        ...(d.property?.type ? { type: d.property.type } : {}),
        ...(d.property?.options ? { options: d.property.options } : {}),
        ...(d.property?.categories ? { categories: d.property.categories } : {}),
        ...(d.property?.icons ? { icons: d.property.icons } : {}),
      })
  })
  const rows = await Promise.all(props.map((p) => sealProperty(propertySchema.parse(p))))
  await db.transaction('rw', db.properties, db.settings, async () => {
    await db.properties.bulkPut(rows)
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
      ...(old?.categories && old.categories.length > 0 ? { categories: old.categories } : {}),
      ...(old?.icons ? { icons: old.icons } : {}),
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

// Narrows a column to a set of Kategori values, or widens it back to all of
// them with an empty list. A column that only ever lived in item values gets
// a definition here, which is what carries the choice.
export async function setPropertyCategories(property: Property, categories: string[]): Promise<void> {
  const { categories: _old, ...rest } = property
  const next = propertySchema.parse({ ...rest, ...(categories.length > 0 ? { categories } : {}) })
  const row = await sealProperty(next)
  await db.transaction('rw', db.properties, db.settings, async () => {
    await db.properties.put(row)
    await touch()
  })
}

// Endre kategorier in one go: renames on every thing and every column that
// belongs to a category, the icons and the new categories on Kategori.
export async function saveCategories(edit: CategoryEdit): Promise<void> {
  const items = await readItems()
  const properties = await readProperties()
  const kategori = properties.find((p) => p.id === categoryColumnId) ?? categoryProperty()
  const out = applyCategoryEdit(items, properties, kategori, edit)
  const now = Date.now()
  const itemRows = await Promise.all(out.items.map((i) => sealItem(itemSchema.parse({ ...i, updatedAt: now }))))
  const propRows = await Promise.all(out.properties.map((p) => sealProperty(propertySchema.parse(p))))
  await db.transaction('rw', db.properties, db.items, db.settings, async () => {
    await db.items.bulkPut(itemRows)
    await db.properties.bulkPut(propRows)
    await touch()
  })
}

// The alternatives of one Valgliste in one go: renamed and removed on every
// thing that holds them, and the list the property offers.
export async function setPropertyOptions(id: string, edit: OptionEdit): Promise<void> {
  const property = (await readProperties()).find((p) => p.id === id)
  if (!property) throw new Error(`Property ${id} not found`)
  const out = applyOptionEdit(await readItems(), property, edit)
  const now = Date.now()
  const itemRows = await Promise.all(out.items.map((i) => sealItem(itemSchema.parse({ ...i, updatedAt: now }))))
  const propRow = await sealProperty(propertySchema.parse(out.property))
  await db.transaction('rw', db.properties, db.items, db.settings, async () => {
    await db.items.bulkPut(itemRows)
    await db.properties.put(propRow)
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
export async function replaceAll(items: Item[], properties: Property[], fields?: FieldSettings): Promise<void> {
  const itemRows = await Promise.all(items.map((i) => sealItem(itemSchema.parse(i))))
  const propRows = await Promise.all(properties.map((p) => sealProperty(propertySchema.parse(p))))
  const fieldRow = fields ? await sealJson(currentKey().key, parseFieldSettings(fields)) : null
  await db.transaction('rw', db.items, db.properties, db.settings, async () => {
    await db.items.clear()
    await db.items.bulkAdd(itemRows)
    await db.properties.clear()
    await db.properties.bulkAdd(propRows)
    if (fieldRow) await db.settings.put({ key: fieldSettingsKey, sealed: fieldRow })
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

// Face ID or Touch ID on this device: a second wrapped copy of the data key
// (`lib/passkey.ts`). In the clear like the vault, since only the device's
// authenticator can open it; never in a backup or the folder.
const passkeyKey = 'passkey'

export async function readPasskey(): Promise<PasskeyRecord | null> {
  const parsed = passkeySchema.safeParse(await getSetting(passkeyKey))
  return parsed.success ? parsed.data : null
}

export function writePasskey(record: PasskeyRecord): Promise<void> {
  return setSetting(passkeyKey, record)
}

export function deletePasskey(): Promise<void> {
  return deleteSetting(passkeyKey)
}

// Kategori was a built-in field until 21 September 2026. Things from before
// carry it as a Kategori spec once opened; the property row that makes it a
// Valgliste in the first column is created here, once, if it is missing.
export async function ensureCategoryProperty(): Promise<void> {
  const rows = await db.properties.toArray()
  if (rows.some((r) => r.id === categoryColumnId)) return
  const items = await readItems()
  if (!items.some((i) => i.specs.some((s) => columnId({ key: s.key, unit: s.unit }) === categoryColumnId))) return
  await addProperty(categoryProperty())
}

// --- before a passphrase ------------------------------------------------------

// Rows from before encryption, still in the clear. They wait for a passphrase
// on the setup screen rather than be sealed under a trial key that dies with the tab.
export async function hasPlainRows(): Promise<boolean> {
  const items = (await db.items.toArray()) as unknown as { sealed?: unknown }[]
  const props = (await db.properties.toArray()) as unknown as { sealed?: unknown }[]
  return items.some((r) => !r.sealed) || props.some((r) => !r.sealed)
}

// What an earlier trial sealed under a key nobody kept: unreadable, so gone.
export async function clearTrialRows(): Promise<void> {
  await db.transaction('rw', db.items, db.properties, db.settings, async () => {
    await db.items.clear()
    await db.properties.clear()
    await db.settings.delete(fieldSettingsKey)
    await db.settings.delete('localChangedAt')
  })
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
    const legacy = r as PlainItemRow & { note?: string | null; category?: string }
    itemRows.push(await sealItem(itemSchema.parse({ ...legacy, specs: legacyAsSpecs(legacy.specs, legacy) })))
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
