import { deleteSetting, getSetting, readRegister, setSetting } from '../db/db'
import type { Item } from '../db/schema'
import {
  dataFileName,
  fromStored,
  openEnvelope,
  parseAnyFile,
  photoDirName,
  sealDataFile,
  storedPhotos,
  toDataFile,
  type DataFile,
  type Envelope,
  type Loaded,
  type StoredPhoto,
} from './backup'
import { decryptBytes, encryptBytes, type OpenKey, type Vault } from './crypto'
import { asImage } from './backup'
import type { Register } from './merge'
import { fileExtras, mergeIn, type MergeResult } from './sync'
import { currentKey, currentVault } from './vault'

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

// Photos are stored as bilder/<id>-1.bin: 12-byte nonce, then ciphertext. Only names the app
// writes: <uuid>-<n>.<ext>, or <uuid>.<ext> from when a thing held one photo. A crafted
// ting.json cannot point at anything else in the folder.
const photoName = /^[0-9a-f-]{36}(-\d{1,4})?\.(bin|jpg|jpeg|png|webp|heic|heif|gif|avif)$/i

async function readPhoto(photos: DirHandle, stored: StoredPhoto, open: OpenKey): Promise<Blob | null> {
  if (!stored.file) return null
  const name = stored.file.replace(`${photoDirName}/`, '')
  if (!photoName.test(name)) return null
  try {
    const file = await (await photos.getFileHandle(name)).getFile()
    if (!name.endsWith('.bin')) return asImage(file) // written before encryption
    const bytes = new Uint8Array(await file.arrayBuffer())
    const plain = await decryptBytes(open.key, bytes.slice(0, 12), bytes.slice(12))
    return asImage(new Blob([plain as BlobPart], { type: stored.type ?? '' }))
  } catch {
    return null
  }
}

// A thing's photos from the folder. A file that will not open leaves a hole,
// and the local copy fills it if there is one: a folder that has lost a photo
// must not take the app's away as well.
async function readAllPhotos(
  photos: DirHandle,
  stored: DataFile['items'][number],
  open: OpenKey,
  local: readonly Blob[],
): Promise<Blob[]> {
  const wanted = storedPhotos(stored)
  const out = await Promise.all(wanted.map(async (p, i) => (await readPhoto(photos, p, open)) ?? local[i] ?? null))
  return out.filter((b): b is Blob => b !== null)
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
  | { kind: 'data'; loaded: Loaded; open: OpenKey; vault: Vault | null }

// Reads the folder. A file sealed under another data key needs the passphrase once; the key
// that opened it comes back for the caller to adopt. A photo the folder cannot deliver (sync
// lag, a stray delete) falls back to the browser's copy, so loading never drops a photo.
export async function readFolder(
  dir: DirHandle,
  open: OpenKey,
  passphrase?: string,
  localPhotos: ReadonlyMap<string, Blob[]> = new Map(),
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
    file.items.map(async (s) => fromStored(s, await readAllPhotos(photos, s, key, localPhotos.get(s.id) ?? []))),
  )
  const loaded: Loaded = {
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
  return { kind: 'data', loaded, open: key, vault }
}

// Writes ting.json as an envelope and photos as sealed .bin files. A photo is rewritten, with a
// fresh nonce, only when its item changed after the file was last written, so a save costs what
// changed. Removed items lose their file.
export async function writeFolder(dir: DirHandle, register: Register, open: OpenKey, vault: Vault): Promise<number> {
  const exportedAt = Date.now()
  const photos = (await dir.getDirectoryHandle(photoDirName, { create: true })) as DirHandle
  const { items, properties, fields } = register
  const file = toDataFile(items, properties, fields, exportedAt, await fileExtras(register, vault))
  const wanted = new Set<string>()
  const all = writeAllPhotos
  writeAllPhotos = false
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    const stored = file.items[i]
    if (!item || !stored) continue
    stored.photos = []
    for (let n = 0; n < item.photos.length; n++) {
      const photo = item.photos[n]
      if (!photo) continue
      const name = `${item.id}-${n + 1}.bin`
      if (all || (await writtenSince(photos, name, item.updatedAt))) {
        const { iv, data } = await encryptBytes(open.key, new Uint8Array(await photo.arrayBuffer()))
        const bytes = new Uint8Array(iv.length + data.length)
        bytes.set(iv)
        bytes.set(data, iv.length)
        await writeFile(photos, name, bytes)
      }
      stored.photos.push({ file: `${photoDirName}/${name}`, type: photo.type })
      wanted.add(name)
    }
  }
  for await (const entry of photos.values()) {
    if (entry.kind === 'file' && !wanted.has(entry.name)) await photos.removeEntry(entry.name)
  }

  await writeFile(dir, dataFileName, JSON.stringify(await sealDataFile(open, vault, file), null, 2))
  return exportedAt
}

// The folder is one more copy: merged in the same way as a file from another
// device, then written back with whatever this side added.
export async function reconcile(
  dir: DirHandle,
  open: OpenKey,
  passphrase?: string,
): Promise<MergeResult | 'empty' | 'foreign' | 'wrong-passphrase'> {
  const local = await readRegister()
  const onDisk = await readFolder(dir, open, passphrase, localPhotoMap(local.items))
  if (onDisk.kind === 'foreign' || onDisk.kind === 'wrong-passphrase') return onDisk.kind
  const result = onDisk.kind === 'data' ? await mergeIn(onDisk.loaded, onDisk.open, onDisk.vault, { recordFetch: false }) : 'empty'
  const vault = currentVault()
  if (vault) await writeFolder(dir, await readRegister(), currentKey(), vault)
  return result
}

export function localPhotoMap(items: readonly Item[]): Map<string, Blob[]> {
  const map = new Map<string, Blob[]>()
  for (const item of items) if (item.photos.length > 0) map.set(item.id, item.photos)
  return map
}

