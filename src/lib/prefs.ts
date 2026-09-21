// Per-device choices, kept in localStorage: they describe how this device is
// used, not the data, so they stay out of the vault and the folder.
//
// autoLock: whether the app locks itself after ten minutes without input.
// hiddenColumns: column ids the user has taken out of the table on this
// device (Tilpass visning on Innstillinger). Navn is never among them.
// wrap: whether long values in the table run onto more lines (off by default).

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

// Anything from localStorage is untrusted: keep only strings, bounded.
export function readHiddenColumns(): Set<string> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(keys.hiddenColumns) ?? '[]')
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.filter((v): v is string => typeof v === 'string' && v.length <= 200).slice(0, 200))
  } catch {
    return new Set()
  }
}

export function writeHiddenColumns(ids: ReadonlySet<string>): void {
  try {
    localStorage.setItem(keys.hiddenColumns, JSON.stringify([...ids]))
  } catch {
    // Private mode or blocked storage: the choice lasts for this page load only.
  }
}
