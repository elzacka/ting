// A property with the unit "dato" holds dates. They are stored as ISO strings
// (yyyy-mm-dd) so they sort and compare as text, and shown as dd.mm.yy.

export const dateUnit = 'dato'

export function isDateUnit(unit: string | null | undefined): boolean {
  return (unit ?? '').trim().toLocaleLowerCase('nb') === dateUnit
}

const dmy = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})$/
const iso = /^(\d{4})-(\d{2})-(\d{2})$/

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

// Accepts 19.09.26, 19.09.2026, 19/9/26 and 2026-09-19. Two-digit years are 2000-2099.
export function parseDateInput(raw: string | number): string | null {
  const s = String(raw).trim()
  const m = dmy.exec(s)
  if (m) {
    const d = Number(m[1])
    const mo = Number(m[2])
    const y = m[3]?.length === 2 ? 2000 + Number(m[3]) : Number(m[3])
    if (!valid(y, mo, d)) return null
    return `${y}-${pad(mo)}-${pad(d)}`
  }
  const i = iso.exec(s)
  if (i) {
    const y = Number(i[1])
    const mo = Number(i[2])
    const d = Number(i[3])
    return valid(y, mo, d) ? s : null
  }
  return null
}

function valid(y: number, mo: number, d: number): boolean {
  if (mo < 1 || mo > 12 || d < 1) return false
  return d <= new Date(Date.UTC(y, mo, 0)).getUTCDate()
}

// ISO string to dd.mm.yy. Anything that is not a stored date comes back unchanged.
export function formatStoredDate(value: string | number): string {
  const i = iso.exec(String(value))
  if (!i) return String(value)
  return `${i[3]}.${i[2]}.${i[1]?.slice(2)}`
}
