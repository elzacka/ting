import { liveQuery } from 'dexie'
import { useCallback, useEffect, useRef, useState } from 'react'
import { db, readItems, readProperties, replaceAll, writeVault } from '../db/db'
import {
  folderSupported,
  forgetFolder,
  localPhotoMap,
  pickFolder,
  queryPermission,
  readFolder,
  reconcile,
  requestPermission,
  savedFolder,
  writeFolder,
} from './folderStore'
import type { FolderRead } from './folderStore'
import { sameItemSet } from './backup'
import { adoptVault, currentKey, currentVault, useVault } from './vault'

type Handle = Awaited<ReturnType<typeof pickFolder>>

export type FolderStatus =
  | { kind: 'unsupported' }
  | { kind: 'none' }
  | { kind: 'checking' }
  | { kind: 'needs-permission'; name: string }
  | { kind: 'needs-passphrase'; name: string; wrong: boolean }
  | { kind: 'connected'; name: string; lastWrittenAt: number | null }
  | { kind: 'conflict'; name: string; folderCount: number; folderAt: number; localCount: number }
  | { kind: 'error'; name: string; message: string }

const writeDelayMs = 500

export function useFolderSync() {
  const vault = useVault()
  const unlocked = vault.status === 'open'
  const [status, setStatus] = useState<FolderStatus>(folderSupported ? { kind: 'checking' } : { kind: 'unsupported' })
  const handleRef = useRef<Handle | null>(null)
  const conflictRef = useRef<Extract<FolderRead, { kind: 'data' }> | null>(null)
  const unsubscribe = useRef<() => void>(() => {})

  const startWatching = useCallback((handle: Handle) => {
    unsubscribe.current()
    let timer: ReturnType<typeof setTimeout> | undefined
    let first = true
    // Watches the sealed rows for change; the decrypted content is read when writing.
    const sub = liveQuery(async () => ({ i: await db.items.toArray(), p: await db.properties.toArray() })).subscribe({
      next: () => {
        if (first) {
          first = false
          return
        }
        clearTimeout(timer)
        timer = setTimeout(async () => {
          try {
            const v = currentVault()
            if (!v) return
            const at = await writeFolder(handle, await readItems(), await readProperties(), currentKey(), v)
            setStatus({ kind: 'connected', name: handle.name, lastWrittenAt: at })
          } catch (err) {
            setStatus({ kind: 'error', name: handle.name, message: String(err) })
          }
        }, writeDelayMs)
      },
      error: (err: unknown) => setStatus({ kind: 'error', name: handle.name, message: String(err) }),
    })
    unsubscribe.current = () => {
      clearTimeout(timer)
      sub.unsubscribe()
    }
  }, [])

  const activate = useCallback(
    async (handle: Handle) => {
      handleRef.current = handle
      const v = currentVault()
      if (!v) return
      try {
        const result = await reconcile(handle, currentKey(), v)
        if (result === 'foreign') {
          setStatus({ kind: 'needs-passphrase', name: handle.name, wrong: false })
          return
        }
        setStatus({ kind: 'connected', name: handle.name, lastWrittenAt: result === 'written' ? Date.now() : null })
        startWatching(handle)
      } catch (err) {
        setStatus({ kind: 'error', name: handle.name, message: String(err) })
      }
    },
    [startWatching],
  )

  useEffect(() => {
    if (!folderSupported || !unlocked) return
    let cancelled = false
    ;(async () => {
      const handle = await savedFolder()
      if (cancelled) return
      if (!handle) {
        setStatus({ kind: 'none' })
        return
      }
      handleRef.current = handle
      const perm = await queryPermission(handle)
      if (cancelled) return
      if (perm === 'granted') await activate(handle)
      else setStatus({ kind: 'needs-permission', name: handle.name })
    })()
    return () => {
      cancelled = true
      unsubscribe.current()
    }
  }, [activate, unlocked])

  // Both sides hold items and they are not the same set: neither may silently
  // replace the other, so the user picks. Same set means the folder is this
  // data's own mirror and newest-wins is right.
  const differs = useCallback(async (handle: Handle, folder: FolderRead): Promise<boolean> => {
    if (folder.kind !== 'data' || folder.items.length === 0) return false
    const local = await readItems()
    if (local.length === 0) return false
    if (sameItemSet(local, folder.items)) return false
    conflictRef.current = folder
    setStatus({
      kind: 'conflict',
      name: handle.name,
      folderCount: folder.items.length,
      folderAt: folder.exportedAt,
      localCount: local.length,
    })
    return true
  }, [])

  // Must run from a click: the browser shows its picker or permission prompt.
  const connect = useCallback(async () => {
    try {
      const handle = await pickFolder()
      handleRef.current = handle
      const folder = await readFolder(handle, currentKey(), undefined, localPhotoMap(await readItems()))
      if (await differs(handle, folder)) return
      await activate(handle)
    } catch (err) {
      if ((err as { name?: string }).name === 'AbortError') return
      setStatus({ kind: 'error', name: '', message: String(err) })
    }
  }, [activate, differs])

  const useFolderSide = useCallback(async () => {
    const handle = handleRef.current
    const folder = conflictRef.current
    if (!handle || !folder) return
    conflictRef.current = null
    if (folder.vault && folder.open !== currentKey()) {
      adoptVault(folder.vault, folder.open)
      await writeVault(folder.vault)
    }
    await replaceAll(folder.items, folder.properties)
    setStatus({ kind: 'connected', name: handle.name, lastWrittenAt: null })
    startWatching(handle)
  }, [startWatching])

  const useLocalSide = useCallback(async () => {
    const handle = handleRef.current
    const v = currentVault()
    if (!handle || !v) return
    conflictRef.current = null
    try {
      const at = await writeFolder(handle, await readItems(), await readProperties(), currentKey(), v)
      setStatus({ kind: 'connected', name: handle.name, lastWrittenAt: at })
      startWatching(handle)
    } catch (err) {
      setStatus({ kind: 'error', name: handle.name, message: String(err) })
    }
  }, [startWatching])

  const grant = useCallback(async () => {
    const handle = handleRef.current
    if (!handle) return
    const perm = await requestPermission(handle)
    if (perm === 'granted') await activate(handle)
  }, [activate])

  // A folder sealed on another device: its passphrase opens it, and its key
  // becomes this device's key so both sides share one from now on.
  const adopt = useCallback(
    async (passphrase: string) => {
      const handle = handleRef.current
      if (!handle) return
      const result = await readFolder(handle, currentKey(), passphrase, localPhotoMap(await readItems()))
      if (result.kind === 'wrong-passphrase' || result.kind === 'foreign') {
        setStatus({ kind: 'needs-passphrase', name: handle.name, wrong: true })
        return
      }
      if (await differs(handle, result)) return
      if (result.kind === 'data' && result.vault) {
        adoptVault(result.vault, result.open)
        await writeVault(result.vault)
        await replaceAll(result.items, result.properties)
      }
      setStatus({ kind: 'connected', name: handle.name, lastWrittenAt: null })
      startWatching(handle)
    },
    [differs, startWatching],
  )

  const disconnect = useCallback(async () => {
    unsubscribe.current()
    handleRef.current = null
    conflictRef.current = null
    await forgetFolder()
    setStatus({ kind: 'none' })
  }, [])

  return { status, connect, grant, adopt, disconnect, useFolderSide, useLocalSide }
}
