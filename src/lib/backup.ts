import { z } from 'zod'
import { itemSchema, propertySchema, type Item, type Property } from '../db/schema'
import { openJson, sealJson, unlockVault, type OpenKey, type Sealed, type Vault } from './crypto'
import { categoryKey, type FieldSettings } from './fields'
import type { Tombstones } from './merge'

// One JSON document describes the whole register. The folder store keeps photos as files next
// to it; the downloaded backup embeds them as data URLs. On disk the document sits in an
// envelope: the vault in the clear, the document sealed under the data key. Plain files still load.

// 2 adds what merging needs: field stamps, tombstones, the device and the vault.
// A file from a newer app is refused, or this one would drop what it cannot read.
export const fileFormat = 2
export const dataFileName = 'ting.json'
export const photoDirName = 'bilder'

// One photo as a file beside the document, or embedded as a data URL, or
// both empty for a thing that has none.
const storedPhotoSchema = z.object({
  file: z.string().nullable().optional(),
  type: z.string().nullable().optional(),
  data: z.string().nullable().optional(),
})

// Files and rows from before 21 September 2026 carry a note field and a few unwritten fields;
// the note becomes the property Notat on load, the rest is dropped. Files from before 22
// September 2026 carry one photo in photoFile/photoType/photoData instead of the photos list.
const storedItemSchema = itemSchema.omit({ photos: true }).extend({
  photos: z.array(storedPhotoSchema).optional(),
  photoFile: z.string().nullable().optional(),
  photoType: z.string().nullable().optional(),
  photoData: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  category: z.string().optional(),
})

const fieldSettingsSchema = z.object({
  name: z.object({ label: z.string().nullable() }),
})

const tombstonesSchema = z.object({
  items: z.record(z.string(), z.number()),
  properties: z.record(z.string(), z.number()),
})

const sealedSchema = z.object({ iv: z.string(), data: z.string() })
// The parameters come from the file, so they are bounded: a crafted file must
// not be able to ask for gigabytes of memory before the passphrase is checked.
const vaultSchema = z.object({
  kdf: z.object({
    name: z.literal('argon2id'),
    m: z.int().min(8).max(262144),
    t: z.int().min(1).max(10),
    p: z.int().min(1).max(4),
    salt: z.string(),
  }),
  wrappedDek: sealedSchema,
  dekId: z.string(),
  changedAt: z.number().optional(),
})

export const dataFileSchema = z.object({
  app: z.literal('ting'),
  format: z.union([z.literal(1), z.literal(fileFormat)]),
  exportedAt: z.number(),
  items: z.array(storedItemSchema),
  // Optional so files written before properties existed still load.
  properties: z.array(propertySchema).default([]),
  // Labels, positions and the hidden flag of the two built-in columns.
  // Optional: files from before 20 September 2026 have none and leave
  // the device's own settings alone.
  fields: fieldSettingsSchema.optional(),
  fieldsAt: z.number().optional(),
  tombstones: tombstonesSchema.optional(),
  // Which device wrote the file, for the line after a merge
  deviceId: z.string().max(64).optional(),
  deviceName: z.string().max(40).optional(),
  // When the writing device last took in another copy: a field changed on both
  // sides only counts as edited twice if both changes came after this
  mergedAt: z.number().optional(),
  // The vault again, inside the seal: the copy in the clear can be swapped,
  // this one cannot, so only this one may replace a device's passphrase
  vault: vaultSchema.optional(),
})

export class NewerFileError extends Error {
  constructor() {
    super('newer file format')
    this.name = 'NewerFileError'
  }
}

function parseDoc(json: unknown): DataFile {
  const format = (json as { format?: unknown } | null)?.format
  if (typeof format === 'number' && format > fileFormat) throw new NewerFileError()
  return dataFileSchema.parse(json)
}

export { storedItemSchema }
export type StoredPhoto = z.infer<typeof storedPhotoSchema>
export type StoredItem = z.infer<typeof storedItemSchema>
export type DataFile = z.infer<typeof dataFileSchema>

function extensionFor(blob: Blob): string {
  const map: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/gif': 'gif' }
  return map[blob.type] ?? 'bin'
}

// bilder/<id>-1.<ext>, numbered from one in the order the thing carries them (the sealed folder
// write uses <id>-1.bin, folderStore.ts). Flat, so the folder keeps one directory and the sweep
// of unclaimed files keeps working (elzacka, 22 September 2026).
export function photoFileNames(item: Item): string[] {
  return item.photos.map((photo, i) => `${photoDirName}/${item.id}-${i + 1}.${extensionFor(photo)}`)
}

export function toStored(item: Item): StoredItem {
  const { photos: _photos, ...rest } = item
  const names = photoFileNames(item)
  return {
    ...rest,
    photos: item.photos.map((photo, i) => ({ file: names[i] ?? null, type: photo.type })),
  }
}

// What a stored thing says about its photos, however it was written: the list,
// or the single photo a file could hold before the list existed.
export function storedPhotos(stored: StoredItem): StoredPhoto[] {
  if (stored.photos) return stored.photos
  if (stored.photoFile || stored.photoData) {
    return [{ file: stored.photoFile, type: stored.photoType, data: stored.photoData }]
  }
  return []
}

export const noteKey = 'Notat'

// Legacy built-in fields become properties on load, unless the thing already
// has one of that name: note is Notat (last), category is Kategori (first).
export function legacyAsSpecs(
  specs: Item['specs'],
  legacy: { note?: string | null | undefined; category?: string | undefined },
): Item['specs'] {
  const has = (key: string) => specs.some((s) => s.key.toLocaleLowerCase('nb') === key.toLocaleLowerCase('nb'))
  let out = specs
  const category = legacy.category?.trim() ?? ''
  if (category !== '' && !has(categoryKey)) out = [{ key: categoryKey, value: category, unit: null }, ...out]
  const note = legacy.note?.trim() ?? ''
  if (note !== '' && !has(noteKey)) out = [...out, { key: noteKey, value: note, unit: null }]
  return out
}

export type FileExtras = Pick<DataFile, 'fieldsAt' | 'tombstones' | 'deviceId' | 'deviceName' | 'mergedAt' | 'vault'>

export function toDataFile(
  items: readonly Item[],
  properties: readonly Property[],
  fields: FieldSettings,
  exportedAt = Date.now(),
  extras: FileExtras = {},
): DataFile {
  return { app: 'ting', format: fileFormat, exportedAt, items: items.map(toStored), properties: [...properties], fields, ...extras }
}

export function fromStored(stored: StoredItem, photos: Blob[]): Item {
  const { photos: _photos, photoFile: _file, photoData: _data, photoType: _type, note, category, ...rest } = stored
  return itemSchema.parse({ ...rest, specs: legacyAsSpecs(rest.specs, { note, category }), photos })
}

export const envelopeSchema = z.object({
  app: z.literal('ting'),
  enc: z.literal(1),
  exportedAt: z.number(),
  vault: vaultSchema,
  sealed: sealedSchema,
})

export type Envelope = z.infer<typeof envelopeSchema>

export function parseDataFile(text: string): DataFile {
  return parseDoc(JSON.parse(text))
}

export type ParsedFile = { kind: 'plain'; file: DataFile } | { kind: 'sealed'; envelope: Envelope }

// Accepts both an encrypted envelope and a plain document from before encryption.
export function parseAnyFile(text: string): ParsedFile {
  const json: unknown = JSON.parse(text)
  if (typeof json === 'object' && json !== null && 'enc' in json) {
    return { kind: 'sealed', envelope: envelopeSchema.parse(json) }
  }
  return { kind: 'plain', file: parseDoc(json) }
}

export async function sealDataFile(open: OpenKey, vault: Vault, file: DataFile): Promise<Envelope> {
  const sealed: Sealed = await sealJson(open.key, file)
  return { app: 'ting', enc: 1, exportedAt: file.exportedAt, vault, sealed }
}

// Opens an envelope with the session key when it was sealed under the same
// data key, otherwise with the passphrase given. Returns the key that opened it,
// so a foreign file's vault can be adopted.
export async function openEnvelope(
  env: Envelope,
  open: OpenKey,
  passphrase?: string,
): Promise<{ file: DataFile; open: OpenKey } | 'foreign' | 'wrong-passphrase'> {
  let key = open
  if (env.vault.dekId !== open.dekId) {
    if (passphrase === undefined) return 'foreign'
    const other = await unlockVault(passphrase, env.vault)
    if (!other) return 'wrong-passphrase'
    key = other
  }
  return { file: parseDoc(await openJson(key.key, env.sealed)), open: key }
}

// The mirror of dataUrlToBlob, encoded by hand for the same reason: no browser-only reader in a
// pure conversion. btoa runs in chunks, since one call with a megapixel photo overflows the stack.
async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const chunk = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return `data:${blob.type};base64,${btoa(binary)}`
}

// A photo is accepted only when it is an image. Anything else that arrives in a
// file, a folder or a picker is dropped rather than stored and rendered.
export const imageTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/gif', 'image/avif'])

export function asImage(blob: Blob | null | undefined): Blob | null {
  return blob && imageTypes.has(blob.type) ? blob : null
}

// Decoded by hand, not by fetch(): the production CSP says connect-src 'self', which a data: URL
// is not, so fetching one throws and fails the restore. A bad base64 from a file returns null
// rather than throwing (elzacka, 22 September 2026).
function dataUrlToBlob(url: string): Blob | null {
  const match = /^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]*)$/i.exec(url)
  const type = match?.[1]
  const base64 = match?.[2]
  if (type === undefined || base64 === undefined) return null
  try {
    const binary = atob(base64.replace(/\s/g, ''))
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return asImage(new Blob([bytes], { type }))
  } catch {
    return null
  }
}

// Download copy: photos embedded, the whole document sealed, so one file holds everything.
export async function toBackupJson(
  items: readonly Item[],
  properties: readonly Property[],
  fields: FieldSettings,
  open: OpenKey,
  vault: Vault,
  extras: FileExtras = {},
): Promise<string> {
  const file = toDataFile(items, properties, fields, Date.now(), extras)
  const withPhotos = await Promise.all(
    file.items.map(async (stored, i) => {
      const photos = items[i]?.photos ?? []
      return {
        ...stored,
        photos: await Promise.all(
          photos.map(async (photo) => ({ file: null, type: photo.type, data: await blobToDataUrl(photo) })),
        ),
      }
    }),
  )
  return JSON.stringify(await sealDataFile(open, vault, { ...file, items: withPhotos }), null, 2)
}

export type Loaded = {
  items: Item[]
  properties: Property[]
  fields: FieldSettings | undefined
  fieldsAt: number
  tombstones: Tombstones | undefined
  exportedAt: number
  deviceName: string | undefined
  mergedAt: number
  vault: Vault | undefined
}

export async function itemsFromDataFile(file: DataFile): Promise<Loaded> {
  const items = await Promise.all(
    file.items.map(async (s) => {
      const photos = storedPhotos(s).map((p) => (p.data ? dataUrlToBlob(p.data) : null))
      return fromStored(s, photos.filter((b): b is Blob => b !== null))
    }),
  )
  return {
    items,
    properties: file.properties,
    fields: file.fields,
    fieldsAt: file.fieldsAt ?? 0,
    tombstones: file.tombstones,
    exportedAt: file.exportedAt,
    deviceName: file.deviceName,
    mergedAt: file.mergedAt ?? 0,
    vault: file.vault,
  }
}
