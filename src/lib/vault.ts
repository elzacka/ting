import { useSyncExternalStore } from 'react'
import { createVault, rewrapVault, unlockVault, type OpenKey, type Vault } from './crypto'

// Session state for the encryption key. The app opens locked; the key lives in
// memory only while unlocked and is dropped on lock, reload or close.

export type VaultState =
  | { status: 'loading' }
  | { status: 'none' }
  | { status: 'locked'; vault: Vault }
  | { status: 'open'; vault: Vault; open: OpenKey }

let state: VaultState = { status: 'loading' }
const listeners = new Set<() => void>()

function set(next: VaultState) {
  state = next
  for (const l of listeners) l()
}

export function vaultState(): VaultState {
  return state
}

export function useVault(): VaultState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state,
  )
}

// The key for reads and writes. Throws when locked: callers only run unlocked.
export function currentKey(): OpenKey {
  if (state.status !== 'open') throw new Error('locked')
  return state.open
}

export function currentVault(): Vault | null {
  return state.status === 'open' || state.status === 'locked' ? state.vault : null
}

export function initVault(stored: Vault | undefined): void {
  set(stored ? { status: 'locked', vault: stored } : { status: 'none' })
}

export async function setupVault(passphrase: string): Promise<Vault> {
  const { vault, open } = await createVault(passphrase)
  set({ status: 'open', vault, open })
  return vault
}

export async function unlock(passphrase: string): Promise<boolean> {
  if (state.status !== 'locked') return state.status === 'open'
  const open = await unlockVault(passphrase, state.vault)
  if (!open) return false
  set({ status: 'open', vault: state.vault, open })
  return true
}

export function lock(): void {
  if (state.status !== 'open') return
  state.open.dek.fill(0)
  set({ status: 'locked', vault: state.vault })
}

// Verifies the old passphrase, wraps the same data key under the new one.
export async function changePassphrase(oldPass: string, newPass: string): Promise<Vault | null> {
  if (state.status !== 'open') return null
  if (!(await unlockVault(oldPass, state.vault))) return null
  const vault = await rewrapVault(newPass, state.open)
  set({ status: 'open', vault, open: state.open })
  return vault
}

// Adopts a vault from a file written elsewhere, once its passphrase opened it.
export function adoptVault(vault: Vault, open: OpenKey): void {
  set({ status: 'open', vault, open })
}
