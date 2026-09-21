import { useEffect, useState } from 'react'

// Under 600 px the app is the phone product: one thing at a time, a list of
// hits, no columns. The width decides; there is no mode to switch.
const query = '(max-width: 599px)'

export function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mql = window.matchMedia(query)
    const onChange = () => setNarrow(mql.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])
  return narrow
}
