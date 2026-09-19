import { liveQuery } from 'dexie'
import { useEffect, useState } from 'react'

// Minimal subscription hook around Dexie's liveQuery. Re-runs when the
// tables the querier touched change. `undefined` while the first result loads.
export function useLiveQuery<T>(querier: () => Promise<T>, deps: readonly unknown[]): T | undefined {
  const [value, setValue] = useState<T | undefined>(undefined)

  useEffect(() => {
    const sub = liveQuery(querier).subscribe({
      next: setValue,
      error: (err: unknown) => console.error(err),
    })
    return () => sub.unsubscribe()
  }, deps)

  return value
}
