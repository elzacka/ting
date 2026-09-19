import { liveQuery } from 'dexie'
import { useCallback, useEffect, useRef, useState } from 'react'
import { db, readItems, readProperties, replaceAll, writeVault } from '../db/db'
import {
  folderSupported,
  forgetFolder,
  pickFolder,
  queryPermission,
  readFolder,
  reconcile,
  requestPermission,
  savedFolder,
  writeFolder,
} from './folderStore'
import { adoptVault, currentKey, currentVault, useVault } from './vault'

type Handle = Awaited<ReturnType<typeof pickFolder>>

export type FolderStatus =
  | { kind: 'unsupported' }
  | { kind: 'none' }
  | { kind: 'checking' }
  | { kind: 'needs-permission'; name: string }
  | { kind: 'needs-passphrase'; name: string; wrong: boolean }
  | { kind: 'connected'; name: string; lastWrittenAt: number | null }
  | { kind: 'error'; name: string; message: string }

const writeDelayMs = 500

export function useFolderSync() {
  const vault = useVault()
  const unlocked = vault.status === 'open'
  const [status, setStatus] = useState<FolderStatus>(folderSupported ? { kind: 'checking' } : { kind: 'unsupported' })
  const handleRef = useRef<Handle | null>(null)
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

  // Must run from a click: the browser shows its picker or permission prompt.
  const connect = useCallback(async () => {
    try {
      const handle = await pickFolder()
      await activate(handle)
    } catch (err) {
      if ((err as { name?: string }).name === 'AbortError') return
      setStatus({ kind: 'error', name: '', message: String(err) })
    }
  }, [activate])

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
      const result = await readFolder(handle, currentKey(), passphrase)
      if (result.kind === 'wrong-passphrase' || result.kind === 'foreign') {
        setStatus({ kind: 'needs-passphrase', name: handle.name, wrong: true })
        return
      }
      if (result.kind === 'data' && result.vault) {
        adoptVault(result.vault, result.open)
        await writeVault(result.vault)
        await replaceAll(result.items, result.properties)
      }
      setStatus({ kind: 'connected', name: handle.name, lastWrittenAt: null })
      startWatching(handle)
    },
    [startWatching],
  )

  const disconnect = useCallback(async () => {
    unsubscribe.current()
    handleRef.current = null
    await forgetFolder()
    setStatus({ kind: 'none' })
  }, [])

  return { status, connect, grant, adopt, disconnect }
}
