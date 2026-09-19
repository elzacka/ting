import { z } from 'zod'
import { itemSchema, propertySchema, type Item, type Property } from '../db/schema'

// One JSON document describes the whole catalogue. The folder store keeps
// photos as files next to it; the download copy embeds them as data URLs.

export const fileFormat = 1
export const dataFileName = 'ting.json'
export const photoDirName = 'bilder'

const storedItemSchema = itemSchema.omit({ photo: true, receiptImage: true }).extend({
  purchaseDate: z.number().nullable(),
  warrantyDate: z.number().nullable(),
  photoFile: z.string().nullable(),
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

export type StoredItem = z.infer<typeof storedItemSchema>
export type DataFile = z.infer<typeof dataFileSchema>

function extensionFor(blob: Blob): string {
  const map: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/gif': 'gif' }
  return map[blob.type] ?? 'bin'
}

export function photoFileName(item: Item): string | null {
  return item.photo ? `${photoDirName}/${item.id}.${extensionFor(item.photo)}` : null
}

function toStored(item: Item): StoredItem {
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

export function parseDataFile(text: string): DataFile {
  return dataFileSchema.parse(JSON.parse(text))
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

async function dataUrlToBlob(url: string): Promise<Blob> {
  const res = await fetch(url)
  return res.blob()
}

// Download copy: photos embedded, so one file holds everything.
export async function toBackupJson(items: readonly Item[], properties: readonly Property[]): Promise<string> {
  const file = toDataFile(items, properties)
  const withPhotos = await Promise.all(
    file.items.map(async (stored, i) => {
      const photo = items[i]?.photo ?? null
      return { ...stored, photoFile: null, photoData: photo ? await blobToDataUrl(photo) : null }
    }),
  )
  return JSON.stringify({ ...file, items: withPhotos }, null, 2)
}

export async function fromBackupJson(text: string): Promise<{ items: Item[]; properties: Property[] }> {
  const file = parseDataFile(text)
  const items = await Promise.all(
    file.items.map(async (s) => fromStored(s, s.photoData ? await dataUrlToBlob(s.photoData) : null)),
  )
  return { items, properties: file.properties }
}
