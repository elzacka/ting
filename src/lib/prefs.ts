// Per-device choices, kept in localStorage: they describe how this device is
// used, not the data, so they stay out of the vault and the folder.
//
// autoLock: whether the app locks itself after ten minutes without input.

const keys = { autoLock: 'ting.autoLock' } as const

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) !== 'off'
  } catch {
    return true
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
