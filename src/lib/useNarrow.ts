import { useEffect, useState } from 'react'

// Under 600 px the app is the phone product: one thing at a time, a list of
// hits, no columns. The width decides; there is no mode to switch. A phone
// turned on its side is wider than that but still a phone: a touch screen
// under 500 px tall counts too.
const query = '(max-width: 599px), (pointer: coarse) and (max-height: 499px)'

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
