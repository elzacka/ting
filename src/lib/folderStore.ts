import {
  deleteSetting,
  getSetting,
  localChangedAt,
  readFieldSettings,
  readItems,
  readProperties,
  replaceAll,
  setSetting,
} from '../db/db'
import type { Item, Property } from '../db/schema'
import type { FieldSettings } from './fields'
import {
  dataFileName,
  fromStored,
  openEnvelope,
  parseAnyFile,
  photoDirName,
  sealDataFile,
  toDataFile,
  type DataFile,
  type Envelope,
} from './backup'
import { decryptBytes, encryptBytes, type OpenKey, type Vault } from './crypto'
import { asImage } from './backup'

// The File System Access API is not fully typed in lib.dom yet.
type PermissionState = 'granted' | 'denied' | 'prompt'
type DirHandle = FileSystemDirectoryHandle & {
  queryPermission(opts: { mode: 'readwrite' }): Promise<PermissionState>
  requestPermission(opts: { mode: 'readwrite' }): Promise<PermissionState>
  values(): AsyncIterableIterator<FileSystemHandle>
  removeEntry(name: string): Promise<void>
}
declare global {
  interface Window {
    showDirectoryPicker?: (opts: { mode: 'readwrite'; id?: string }) => Promise<FileSystemDirectoryHandle>
  }
}

const handleKey = 'folderHandle'

export const folderSupported = typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function'

export async function savedFolder(): Promise<DirHandle | undefined> {
  return getSetting<DirHandle>(handleKey)
}

export async function pickFolder(): Promise<DirHandle> {
  if (!window.showDirectoryPicker) throw new Error('unsupported')
  const handle = (await window.showDirectoryPicker({ mode: 'readwrite', id: 'ting' })) as DirHandle
  await setSetting(handleKey, handle)
  return handle
}

export async function forgetFolder(): Promise<void> {
  await deleteSetting(handleKey)
}

export function queryPermission(handle: DirHandle): Promise<PermissionState> {
  return handle.queryPermission({ mode: 'readwrite' })
}

export function requestPermission(handle: DirHandle): Promise<PermissionState> {
  return handle.requestPermission({ mode: 'readwrite' })
}

async function readText(dir: DirHandle, name: string): Promise<string | null> {
  try {
    const fh = await dir.getFileHandle(name)
    return await (await fh.getFile()).text()
  } catch {
    return null
  }
}

async function writeFile(dir: DirHandle, name: string, data: Blob | Uint8Array | string): Promise<void> {
  const fh = await dir.getFileHandle(name, { create: true })
  const w = await fh.createWritable()
  await w.write(data as FileSystemWriteChunkType)
  await w.close()
}

// Photos are stored as bilder/<id>.bin: 12-byte nonce followed by the ciphertext.
// Only names the app itself writes: <uuid>.<ext>. A crafted ting.json cannot
// point at anything else in the folder.
const photoName = /^[0-9a-f-]{36}\.(bin|jpg|jpeg|png|webp|heic|heif|gif|avif)$/i

async function readPhoto(photos: DirHandle, stored: DataFile['items'][number], open: OpenKey): Promise<Blob | null> {
  if (!stored.photoFile) return null
  const name = stored.photoFile.replace(`${photoDirName}/`, '')
  if (!photoName.test(name)) return null
  try {
    const file = await (await photos.getFileHandle(name)).getFile()
    if (!name.endsWith('.bin')) return asImage(file) // written before encryption
    const bytes = new Uint8Array(await file.arrayBuffer())
    const plain = await decryptBytes(open.key, bytes.slice(0, 12), bytes.slice(12))
    return asImage(new Blob([plain as BlobPart], { type: stored.photoType ?? '' }))
  } catch {
    return null
  }
}

// A restore from a backup file can bring photos the folder never saw under
// ids whose files are newer than the restored items: the next write takes
// them all, once.
let writeAllPhotos = false
export function requestFullPhotoWrite(): void {
  writeAllPhotos = true
}

// True when the file is missing or older than the item's last change.
async function writtenSince(dir: DirHandle, name: string, changedAt: number): Promise<boolean> {
  try {
    const file = await (await dir.getFileHandle(name)).getFile()
    return file.lastModified < changedAt
  } catch {
    return true
  }
}

export type FolderRead =
  | { kind: 'empty' }
  | { kind: 'foreign'; envelope: Envelope }
  | { kind: 'wrong-passphrase' }
  | {
      kind: 'data'
      exportedAt: number
      items: Item[]
      properties: Property[]
      fields: FieldSettings | undefined
      open: OpenKey
      vault: Vault | null
    }

// Reads the folder. A file sealed under another data key needs the passphrase
// once; the key that opened it comes back so the caller can adopt it. A photo
// the file points at but the folder cannot deliver (sync lag, a stray delete)
// falls back to the copy the browser already holds for that item, so loading
// never drops a photo the user still has.
export async function readFolder(
  dir: DirHandle,
  open: OpenKey,
  passphrase?: string,
  localPhotos: ReadonlyMap<string, Blob> = new Map(),
): Promise<FolderRead> {
  const text = await readText(dir, dataFileName)
  if (text === null) return { kind: 'empty' }
  const parsed = parseAnyFile(text)
  let file: DataFile
  let key = open
  let vault: Vault | null = null
  if (parsed.kind === 'sealed') {
    const result = await openEnvelope(parsed.envelope, open, passphrase)
    if (result === 'foreign') return { kind: 'foreign', envelope: parsed.envelope }
    if (result === 'wrong-passphrase') return { kind: 'wrong-passphrase' }
    file = result.file
    key = result.open
    vault = parsed.envelope.vault
  } else {
    file = parsed.file
  }
  const photos = (await dir.getDirectoryHandle(photoDirName, { create: true })) as DirHandle
  const items = await Promise.all(
    file.items.map(async (s) =>
      fromStored(s, (await readPhoto(photos, s, key)) ?? (s.photoFile ? (localPhotos.get(s.id) ?? null) : null)),
    ),
  )
  return { kind: 'data', exportedAt: file.exportedAt, items, properties: file.properties, fields: file.fields, open: key, vault }
}

// Writes ting.json as an envelope and photos as sealed .bin files. A photo is
// written when its item changed after the file on disk was last written, and
// gets a fresh nonce each time; unchanged photos are left alone, so a save
// costs what changed, not the whole folder. Removed items lose their file.
export async function writeFolder(
  dir: DirHandle,
  items: readonly Item[],
  properties: readonly Property[],
  fields: FieldSettings,
  open: OpenKey,
  vault: Vault,
): Promise<number> {
  const exportedAt = Date.now()
  const photos = (await dir.getDirectoryHandle(photoDirName, { create: true })) as DirHandle

  const file = toDataFile(items, properties, fields, exportedAt)
  const wanted = new Set<string>()
  const all = writeAllPhotos
  writeAllPhotos = false
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    const stored = file.items[i]
    if (!item || !stored) continue
    if (!item.photo) {
      stored.photoFile = null
      continue
    }
    const name = `${item.id}.bin`
    if (all || (await writtenSince(photos, name, item.updatedAt))) {
      const { iv, data } = await encryptBytes(open.key, new Uint8Array(await item.photo.arrayBuffer()))
      const bytes = new Uint8Array(iv.length + data.length)
      bytes.set(iv)
      bytes.set(data, iv.length)
      await writeFile(photos, name, bytes)
    }
    stored.photoFile = `${photoDirName}/${name}`
    stored.photoType = item.photo.type
    wanted.add(name)
  }
  for await (const entry of photos.values()) {
    if (entry.kind === 'file' && !wanted.has(entry.name)) await photos.removeEntry(entry.name)
  }

  await writeFile(dir, dataFileName, JSON.stringify(await sealDataFile(open, vault, file), null, 2))
  return exportedAt
}

export type SyncResult = 'loaded' | 'written' | 'foreign'

// Newer side wins: a file written after the last local edit is loaded,
// otherwise the local copy is written out.
export async function reconcile(dir: DirHandle, open: OpenKey, vault: Vault): Promise<SyncResult> {
  const local = await readItems()
  const onDisk = await readFolder(dir, open, undefined, localPhotoMap(local))
  if (onDisk.kind === 'foreign') return 'foreign'
  const changedAt = await localChangedAt()
  if (onDisk.kind === 'data' && onDisk.exportedAt > changedAt) {
    await replaceAll(onDisk.items, onDisk.properties, onDisk.fields)
    return 'loaded'
  }
  await writeFolder(dir, local, await readProperties(), await readFieldSettings(), open, vault)
  return 'written'
}

export function localPhotoMap(items: readonly Item[]): Map<string, Blob> {
  const map = new Map<string, Blob>()
  for (const item of items) if (item.photo) map.set(item.id, item.photo)
  return map
}

