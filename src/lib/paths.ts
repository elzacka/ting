// A property with the unit "sti" holds a place: the whole way in, from the
// room to the box. Stored as one string so a cell stays a plain value, the
// way a date does, and read as levels wherever the levels matter.
//
// The way in is typed with a slash, an angle bracket or the bracket itself,
// whichever the keyboard at hand can reach, and always written back with the
// one the eye reads best (elzacka, 22 September 2026).

export const pathUnit = 'sti'

// Sted, sone, boks. Deeper than that is still stored and still searched; it
// is the menus and the editor that stop at three (elzacka, 22 September 2026).
export const maxPathLevels = 3

export const pathSeparator = ' › '

export function isPathUnit(unit: string | null | undefined): boolean {
  return (unit ?? '').trim().toLocaleLowerCase('nb') === pathUnit
}

export function parsePath(value: string | number): string[] {
  return String(value)
    .split(/[/>›]/)
    .map((part) => part.trim())
    .filter((part) => part !== '')
}

export function formatPath(parts: readonly string[]): string {
  return parts.join(pathSeparator)
}

// The way in as far as one level, or null when the place does not go that
// deep: a thing in Loftsbod has nothing to say about level two.
export function pathPrefix(value: string | number, level: number): string | null {
  const parts = parsePath(value)
  return level < 1 || parts.length < level ? null : formatPath(parts.slice(0, level))
}

// Every place in use, and every place on the way to one: a thing in
// "Loftsbod › Hylle 2" puts both Loftsbod and Loftsbod › Hylle 2 on the list,
// so the next thing can be put on the shelf or just on the loft. Alphabetical,
// shallowest first, and never deeper than the levels a place is allowed.
export function pathsInUse(values: readonly (string | number)[]): string[] {
  const seen = new Set<string>()
  for (const value of values) {
    const parts = parsePath(value).slice(0, maxPathLevels)
    for (let level = 1; level <= parts.length; level++) seen.add(formatPath(parts.slice(0, level)))
  }
  return [...seen].sort((a, b) => parsePath(a).length - parsePath(b).length || a.localeCompare(b, 'nb'))
}

const foldLevel = (s: string) => s.toLocaleLowerCase('nb')

function levelsUnder(paths: readonly string[], base: readonly string[]): string[] {
  if (base.length >= maxPathLevels) return []
  const seen = new Map<string, string>()
  for (const path of paths) {
    const parts = parsePath(path)
    if (parts.length <= base.length) continue
    if (!base.every((b, i) => foldLevel(b) === foldLevel(parts[i] ?? ''))) continue
    const next = parts[base.length] ?? ''
    if (!seen.has(foldLevel(next))) seen.set(foldLevel(next), next)
  }
  return [...seen.values()]
}

// The places one level further in, so a place can be tapped together on a
// phone rather than typed: the levels under what is typed when it is a place
// in use. At the end of a place, the others beside it, so a thing can move
// to the next shelf; while a level is being typed, the ones beside it that
// start with it. `base` is the way in that the options continue.
export function nextLevels(paths: readonly string[], value: string): { base: string[]; options: string[] } {
  const levels = parsePath(value)
  const under = levelsUnder(paths, levels)
  if (under.length > 0 || levels.length === 0) return { base: levels, options: under }
  const parent = levels.slice(0, -1)
  const last = foldLevel(levels[levels.length - 1] ?? '')
  const beside = levelsUnder(paths, parent)
  const complete = beside.some((o) => foldLevel(o) === last)
  return {
    base: parent,
    options: beside.filter((o) => foldLevel(o) !== last && (complete || foldLevel(o).startsWith(last))),
  }
}
