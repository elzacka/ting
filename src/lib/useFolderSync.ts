import { liveQuery } from 'dexie'
import { useCallback, useEffect, useRef, useState } from 'react'
import { db } from '../db/db'
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

type Handle = Awaited<ReturnType<typeof pickFolder>>

export type FolderStatus =
  | { kind: 'unsupported' }
  | { kind: 'none' }
  | { kind: 'checking' }
  | { kind: 'needs-permission'; name: string }
  | { kind: 'connected'; name: string; lastWrittenAt: number | null }
  | { kind: 'error'; name: string; message: string }

const writeDelayMs = 500

export function useFolderSync() {
  const [status, setStatus] = useState<FolderStatus>(folderSupported ? { kind: 'checking' } : { kind: 'unsupported' })
  const handleRef = useRef<Handle | null>(null)
  const unsubscribe = useRef<() => void>(() => {})

  const startWatching = useCallback((handle: Handle) => {
    unsubscribe.current()
    let timer: ReturnType<typeof setTimeout> | undefined
    let first = true
    const sub = liveQuery(async () => ({ items: await db.items.toArray(), props: await db.properties.toArray() })).subscribe({
      next: ({ items, props }) => {
        // The first emission is the state we just reconciled; nothing to write.
        if (first) {
          first = false
          return
        }
        clearTimeout(timer)
        timer = setTimeout(async () => {
          try {
            const at = await writeFolder(handle, items, props)
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
      try {
        const result = await reconcile(handle)
        setStatus({ kind: 'connected', name: handle.name, lastWrittenAt: result === 'written' ? Date.now() : null })
        startWatching(handle)
      } catch (err) {
        setStatus({ kind: 'error', name: handle.name, message: String(err) })
      }
    },
    [startWatching],
  )

  useEffect(() => {
    if (!folderSupported) return
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
  }, [activate])

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

  const disconnect = useCallback(async () => {
    unsubscribe.current()
    handleRef.current = null
    await forgetFolder()
    setStatus({ kind: 'none' })
  }, [])

  return { status, connect, grant, disconnect }
}
