import { getSealedSetting, setSealedSetting } from '../db/db'
import { errorText } from './errors'

// Per-device choices, outside the vault file and the folder. Flags (autoLock,
// wrap) live in localStorage; hidden columns name properties, so they are sealed.

const keys = { autoLock: 'ting.autoLock', hiddenColumns: 'ting.hiddenColumns', wrap: 'ting.wrap' } as const

function readFlag(key: string, fallback = true): boolean {
  try {
    const v = localStorage.getItem(key)
    return v === null ? fallback : v !== 'off'
  } catch {
    return fallback
  }
}

function writeFlag(key: string, on: boolean): void {
  try {
    localStorage.setItem(key, on ? 'on' : 'off')
  } catch {
    // Private mode or blocked storage: the choice lasts for this page load only.
  }
}

export const readAutoLock = () => readFlag(keys.autoLock)
export const writeAutoLock = (on: boolean) => writeFlag(keys.autoLock, on)
export const readWrap = () => readFlag(keys.wrap, false)
export const writeWrap = (on: boolean) => writeFlag(keys.wrap, on)

// Stored or legacy, it is untrusted: keep only strings, bounded.
function cleanIds(parsed: unknown): Set<string> {
  if (!Array.isArray(parsed)) return new Set()
  return new Set(parsed.filter((v): v is string => typeof v === 'string' && v.length <= 200).slice(0, 200))
}

const hiddenKey = 'hiddenColumns'

// Read after unlock. A list an earlier version left in localStorage in the
// clear is sealed once and removed.
export async function loadHiddenColumns(): Promise<Set<string>> {
  const sealed = await getSealedSetting<unknown>(hiddenKey)
  if (sealed !== undefined) return cleanIds(sealed)
  try {
    const legacy = localStorage.getItem(keys.hiddenColumns)
    if (legacy === null) return new Set()
    const ids = cleanIds(JSON.parse(legacy))
    await setSealedSetting(hiddenKey, [...ids])
    localStorage.removeItem(keys.hiddenColumns)
    return ids
  } catch {
    return new Set()
  }
}

export function saveHiddenColumns(ids: ReadonlySet<string>): void {
  setSealedSetting(hiddenKey, [...ids]).catch((err: unknown) => console.error(errorText(err)))
}
