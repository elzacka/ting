import { liveQuery } from 'dexie'
import { useEffect, useState } from 'react'

// Watches sealed rows through Dexie's liveQuery and re-reads the decrypted
// view whenever they change. Decryption happens outside the liveQuery zone,
// which only needs to see the table reads.
export function useSealedQuery<T>(watch: () => Promise<unknown>, read: () => Promise<T>, enabled: boolean): T | undefined {
  const [value, setValue] = useState<T | undefined>(undefined)

  useEffect(() => {
    if (!enabled) {
      setValue(undefined)
      return
    }
    let alive = true
    const sub = liveQuery(watch).subscribe({
      next: () => {
        read()
          .then((v) => {
            if (alive) setValue(v)
          })
          .catch((err: unknown) => console.error(err))
      },
      error: (err: unknown) => console.error(err),
    })
    return () => {
      alive = false
      sub.unsubscribe()
    }
    // watch and read are stable module functions
  }, [enabled])

  return value
}
