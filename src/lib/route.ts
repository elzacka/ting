import { useEffect, useState } from 'react'

// Hash routing keeps browser back working and needs no server config.
export type Route =
  | { view: 'home' }
  | { view: 'list' }
  | { view: 'register' }
  | { view: 'storage' }
  | { view: 'detail'; id: string }
  | { view: 'edit'; id: string }

export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean)
  if (parts[0] === 'oversikt') return { view: 'list' }
  if (parts[0] === 'registrer') return { view: 'register' }
  if (parts[0] === 'lagring') return { view: 'storage' }
  if (parts[0] === 'ting' && parts[1]) {
    return parts[2] === 'rediger' ? { view: 'edit', id: parts[1] } : { view: 'detail', id: parts[1] }
  }
  return { view: 'home' }
}

export const href = {
  home: '#/',
  list: '#/oversikt',
  register: '#/registrer',
  storage: '#/lagring',
  detail: (id: string) => `#/ting/${id}`,
  edit: (id: string) => `#/ting/${id}/rediger`,
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
