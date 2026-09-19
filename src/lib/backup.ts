import { z } from 'zod'
import { itemSchema, propertySchema, type Item, type Property } from '../db/schema'
import { openJson, sealJson, unlockVault, type OpenKey, type Sealed, type Vault } from './crypto'

// One JSON document describes the whole catalogue. The folder store keeps
// photos as files next to it; the download copy embeds them as data URLs.
// On disk the document travels inside an envelope: the vault (wrapped key,
// salt, parameters) in the clear, the document itself sealed under the data
// key. Files written before encryption are plain documents and still load.

export const fileFormat = 1
export const dataFileName = 'ting.json'
export const photoDirName = 'bilder'

const storedItemSchema = itemSchema.omit({ photo: true, receiptImage: true }).extend({
  purchaseDate: z.number().nullable(),
  warrantyDate: z.number().nullable(),
  photoFile: z.string().nullable(),
  photoType: z.string().nullable().optional(),
  photoData: z.string().nullable().optional(),
})

export const dataFileSchema = z.object({
  app: z.literal('ting'),
  format: z.literal(fileFormat),
  exportedAt: z.number(),
  items: z.array(storedItemSchema),
  // Optional so files written before properties existed still load.
  properties: z.array(propertySchema).default([]),
})

export { storedItemSchema }
export type StoredItem = z.infer<typeof storedItemSchema>
export type DataFile = z.infer<typeof dataFileSchema>

function extensionFor(blob: Blob): string {
  const map: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/gif': 'gif' }
  return map[blob.type] ?? 'bin'
}

export function photoFileName(item: Item): string | null {
  return item.photo ? `${photoDirName}/${item.id}.${extensionFor(item.photo)}` : null
}

export function toStored(item: Item): StoredItem {
  const { photo: _photo, receiptImage: _receipt, ...rest } = item
  return {
    ...rest,
    purchaseDate: item.purchaseDate ? item.purchaseDate.getTime() : null,
    warrantyDate: item.warrantyDate ? item.warrantyDate.getTime() : null,
    photoFile: photoFileName(item),
  }
}

export function toDataFile(items: readonly Item[], properties: readonly Property[], exportedAt = Date.now()): DataFile {
  return { app: 'ting', format: fileFormat, exportedAt, items: items.map(toStored), properties: [...properties] }
}

export function fromStored(stored: StoredItem, photo: Blob | null): Item {
  const { photoFile: _file, photoData: _data, ...rest } = stored
  return itemSchema.parse({
    ...rest,
    purchaseDate: stored.purchaseDate === null ? null : new Date(stored.purchaseDate),
    warrantyDate: stored.warrantyDate === null ? null : new Date(stored.warrantyDate),
    photo,
    receiptImage: null,
  })
}

const sealedSchema = z.object({ iv: z.string(), data: z.string() })
const vaultSchema = z.object({
  kdf: z.object({ name: z.literal('argon2id'), m: z.number(), t: z.number(), p: z.number(), salt: z.string() }),
  wrappedDek: sealedSchema,
  dekId: z.string(),
})

export const envelopeSchema = z.object({
  app: z.literal('ting'),
  enc: z.literal(1),
  exportedAt: z.number(),
  vault: vaultSchema,
  sealed: sealedSchema,
})

export type Envelope = z.infer<typeof envelopeSchema>

export function parseDataFile(text: string): DataFile {
  return dataFileSchema.parse(JSON.parse(text))
}

export type ParsedFile = { kind: 'plain'; file: DataFile } | { kind: 'sealed'; envelope: Envelope }

// Accepts both an encrypted envelope and a plain document from before encryption.
export function parseAnyFile(text: string): ParsedFile {
  const json: unknown = JSON.parse(text)
  if (typeof json === 'object' && json !== null && 'enc' in json) {
    return { kind: 'sealed', envelope: envelopeSchema.parse(json) }
  }
  return { kind: 'plain', file: dataFileSchema.parse(json) }
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
  return { file: dataFileSchema.parse(await openJson(key.key, env.sealed)), open: key }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

// A photo is accepted only when it is an image. Anything else that arrives in a
// file, a folder or a picker is dropped rather than stored and rendered.
export const imageTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/gif', 'image/avif'])

export function asImage(blob: Blob | null | undefined): Blob | null {
  return blob && imageTypes.has(blob.type) ? blob : null
}

async function dataUrlToBlob(url: string): Promise<Blob | null> {
  if (!/^data:image\/[a-z0-9.+-]+;base64,/i.test(url)) return null
  const res = await fetch(url)
  return asImage(await res.blob())
}

// Download copy: photos embedded, the whole document sealed, so one file holds everything.
export async function toBackupJson(
  items: readonly Item[],
  properties: readonly Property[],
  open: OpenKey,
  vault: Vault,
): Promise<string> {
  const file = toDataFile(items, properties)
  const withPhotos = await Promise.all(
    file.items.map(async (stored, i) => {
      const photo = items[i]?.photo ?? null
      return { ...stored, photoFile: null, photoData: photo ? await blobToDataUrl(photo) : null }
    }),
  )
  return JSON.stringify(await sealDataFile(open, vault, { ...file, items: withPhotos }), null, 2)
}

export async function itemsFromDataFile(file: DataFile): Promise<{ items: Item[]; properties: Property[] }> {
  const items = await Promise.all(
    file.items.map(async (s) => fromStored(s, s.photoData ? await dataUrlToBlob(s.photoData) : null)),
  )
  return { items, properties: file.properties }
}
