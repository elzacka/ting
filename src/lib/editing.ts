// Whether the app lets the user add and change things. Off means browse only:
// the edit views are unreachable and the detail page shows no edit actions.
// Stored per device, so a phone kept for looking things up stays that way.
const storageKey = 'ting.editing'

export function readEditing(): boolean {
  try {
    return localStorage.getItem(storageKey) !== 'off'
  } catch {
    return true
  }
}

export function writeEditing(on: boolean): void {
  try {
    localStorage.setItem(storageKey, on ? 'on' : 'off')
  } catch {
    // Private mode or blocked storage: the choice lasts for this page load only.
  }
}
