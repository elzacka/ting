import { liveQuery } from 'dexie'
import { useCallback, useEffect, useRef, useState } from 'react'
import { db, readRegister } from '../db/db'
import {
  folderSupported,
  forgetFolder,
  pickFolder,
  queryPermission,
  reconcile,
  requestPermission,
  savedFolder,
  writeFolder,
} from './folderStore'
import { currentKey, currentVault, useVault } from './vault'
import { errorText } from './errors'

type Handle = Awaited<ReturnType<typeof pickFolder>>

export type FolderStatus =
  | { kind: 'unsupported' }
  | { kind: 'none' }
  | { kind: 'checking' }
  | { kind: 'needs-permission'; name: string }
  | { kind: 'needs-passphrase'; name: string; wrong: boolean }
  | { kind: 'connected'; name: string; lastWrittenAt: number }
  | { kind: 'error'; name: string }

const writeDelayMs = 500

export function useFolderSync() {
  const vault = useVault()
  const unlocked = vault.status === 'open'
  const [status, setStatus] = useState<FolderStatus>(folderSupported ? { kind: 'checking' } : { kind: 'unsupported' })
  const handleRef = useRef<Handle | null>(null)
  const unsubscribe = useRef<() => void>(() => {})

  // What went wrong is logged; the screen says what to do.
  const fail = useCallback((name: string, err: unknown) => {
    console.error(errorText(err))
    setStatus({ kind: 'error', name })
  }, [])

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
            const at = await writeFolder(handle, await readRegister(), currentKey(), v)
            setStatus({ kind: 'connected', name: handle.name, lastWrittenAt: at })
          } catch (err) {
            fail(handle.name, err)
          }
        }, writeDelayMs)
      },
      error: (err: unknown) => fail(handle.name, err),
    })
    unsubscribe.current = () => {
      clearTimeout(timer)
      sub.unsubscribe()
    }
  }, [fail])

  // Merges the folder in and writes back what this side adds. A folder sealed
  // on another device needs its passphrase once; its key then becomes this
  // device's key, so both sides share one from then on.
  const activate = useCallback(
    async (handle: Handle, passphrase?: string) => {
      handleRef.current = handle
      try {
        const result = await reconcile(handle, currentKey(), passphrase)
        if (result === 'foreign' || result === 'wrong-passphrase') {
          setStatus({ kind: 'needs-passphrase', name: handle.name, wrong: result === 'wrong-passphrase' })
          return
        }
        setStatus({ kind: 'connected', name: handle.name, lastWrittenAt: Date.now() })
        startWatching(handle)
      } catch (err) {
        fail(handle.name, err)
      }
    },
    [fail, startWatching],
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
      await activate(await pickFolder())
    } catch (err) {
      if ((err as { name?: string }).name === 'AbortError') return
      fail('', err)
    }
  }, [activate, fail])

  const grant = useCallback(async () => {
    const handle = handleRef.current
    if (!handle) return
    const perm = await requestPermission(handle)
    if (perm === 'granted') await activate(handle)
  }, [activate])

  const adopt = useCallback(
    async (passphrase: string) => {
      const handle = handleRef.current
      if (handle) await activate(handle, passphrase)
    },
    [activate],
  )

  const disconnect = useCallback(async () => {
    unsubscribe.current()
    handleRef.current = null
    await forgetFolder()
    setStatus({ kind: 'none' })
  }, [])

  return { status, connect, grant, adopt, disconnect }
}
