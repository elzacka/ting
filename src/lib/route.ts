import { useEffect, useState } from 'react'

// Hash routing keeps browser back working and needs no server config.
export type Route =
  | { view: 'list' }
  | { view: 'storage' }
  | { view: 'detail'; id: string }

export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean)
  // 'registrer' was its own view until 20 September 2026; old links still land
  if (parts[0] === 'oversikt' || parts[0] === 'registrer') return { view: 'list' }
  if (parts[0] === 'innstillinger') return { view: 'storage' }
  if (parts[0] === 'ting' && parts[1]) {
    return { view: 'detail', id: parts[1] }
  }
  return { view: 'list' }
}

export const href = {
  list: '#/oversikt',
  storage: '#/innstillinger',
  detail: (id: string) => `#/ting/${id}`,
}

export function navigate(to: string): void {
  window.location.hash = to
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(window.location.hash))
  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash))
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}
