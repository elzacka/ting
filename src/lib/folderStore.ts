import { db, deleteSetting, getSetting, localChangedAt, replaceAll, setSetting } from '../db/db'
import type { Item, Property } from '../db/schema'
import { dataFileName, fromStored, parseDataFile, photoDirName, photoFileName, toDataFile } from './backup'

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

async function writeFile(dir: DirHandle, name: string, data: Blob | string): Promise<void> {
  const fh = await dir.getFileHandle(name, { create: true })
  const w = await fh.createWritable()
  await w.write(data)
  await w.close()
}

export async function readFolder(
  dir: DirHandle,
): Promise<{ exportedAt: number; items: Item[]; properties: Property[] } | null> {
  const text = await readText(dir, dataFileName)
  if (text === null) return null
  const file = parseDataFile(text)
  const photos = await dir.getDirectoryHandle(photoDirName, { create: true })
  const items = await Promise.all(
    file.items.map(async (s) => {
      let photo: Blob | null = null
      if (s.photoFile) {
        try {
          const fh = await photos.getFileHandle(s.photoFile.replace(`${photoDirName}/`, ''))
          photo = await fh.getFile()
        } catch {
          photo = null
        }
      }
      return fromStored(s, photo)
    }),
  )
  return { exportedAt: file.exportedAt, items, properties: file.properties }
}

// Writes ting.json and only the photos that are missing or changed in size,
// and removes photo files for items that no longer exist.
export async function writeFolder(dir: DirHandle, items: readonly Item[], properties: readonly Property[]): Promise<number> {
  const exportedAt = Date.now()
  await writeFile(dir, dataFileName, JSON.stringify(toDataFile(items, properties, exportedAt), null, 2))

  const photos = (await dir.getDirectoryHandle(photoDirName, { create: true })) as DirHandle
  const wanted = new Map<string, Blob>()
  for (const item of items) {
    const name = photoFileName(item)
    if (name && item.photo) wanted.set(name.replace(`${photoDirName}/`, ''), item.photo)
  }
  const existing = new Map<string, number>()
  for await (const entry of photos.values()) {
    if (entry.kind === 'file') existing.set(entry.name, (await (entry as FileSystemFileHandle).getFile()).size)
  }
  for (const [name, blob] of wanted) {
    if (existing.get(name) !== blob.size) await writeFile(photos, name, blob)
  }
  for (const name of existing.keys()) {
    if (!wanted.has(name)) await photos.removeEntry(name)
  }
  return exportedAt
}

export type SyncResult = 'loaded' | 'written'

// Newer side wins: a file written after the last local edit is loaded,
// otherwise the local copy is written out.
export async function reconcile(dir: DirHandle): Promise<SyncResult> {
  const [onDisk, changedAt, local, props] = await Promise.all([
    readFolder(dir),
    localChangedAt(),
    db.items.toArray(),
    db.properties.toArray(),
  ])
  if (onDisk && onDisk.exportedAt > changedAt) {
    await replaceAll(onDisk.items, onDisk.properties)
    return 'loaded'
  }
  await writeFolder(dir, local, props)
  return 'written'
}
