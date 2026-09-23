import { useSyncExternalStore } from 'react'
import { createVault, openKeyFrom, randomBytes, rewrapVault, unlockVault, type OpenKey, type Vault } from './crypto'

// Session state for the encryption key. The app opens locked; the key lives in
// memory only while unlocked and is dropped on lock, reload or close.
//
// Before any passphrase exists the app runs as a trial: a fresh data key in
// memory, nothing wrapping it. Everything is sealed under it as usual, so
// nothing is ever stored in the clear; without a wrapper the key dies with
// the tab, and what was sealed under it is unreadable and cleared on the next
// start. Choosing a passphrase wraps this same key, so the trial's things stay.

export type VaultState =
  | { status: 'loading' }
  | { status: 'none' }
  | { status: 'trial'; open: OpenKey }
  | { status: 'locked'; vault: Vault; idle?: boolean }
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
  return useSyncExternalStore(subscribeVault, () => state)
}

// Anything that holds plaintext in memory listens here and drops it on lock.
export function subscribeVault(l: () => void): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}

// The key for reads and writes. Throws when locked: callers only run unlocked.
export function currentKey(): OpenKey {
  if (state.status !== 'open' && state.status !== 'trial') throw new Error('locked')
  return state.open
}

// A key in memory to read and write with: unlocked, or trying the app
export function hasKey(v: VaultState): v is Extract<VaultState, { status: 'open' | 'trial' }> {
  return v.status === 'open' || v.status === 'trial'
}

export async function startTrial(): Promise<void> {
  set({ status: 'trial', open: await openKeyFrom(randomBytes(32)) })
}

export function currentVault(): Vault | null {
  return state.status === 'open' || state.status === 'locked' ? state.vault : null
}

export function initVault(stored: Vault | undefined): void {
  set(stored ? { status: 'locked', vault: stored } : { status: 'none' })
}

// A trial's key is wrapped as it is, so what was made during the trial stays
// readable; otherwise a fresh key.
export async function setupVault(passphrase: string): Promise<Vault> {
  if (state.status === 'trial') {
    const vault = await rewrapVault(passphrase, state.open)
    set({ status: 'open', vault, open: state.open })
    return vault
  }
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

// Opened another way than the passphrase (a passkey on this device): the key
// is taken only when it is the one this vault wraps.
export function unlockWithKey(open: OpenKey): boolean {
  if (state.status !== 'locked' || open.dekId !== state.vault.dekId) return false
  set({ status: 'open', vault: state.vault, open })
  return true
}

export function lock(reason?: 'idle'): void {
  if (state.status !== 'open') return
  state.open.dek.fill(0)
  set({ status: 'locked', vault: state.vault, idle: reason === 'idle' })
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
