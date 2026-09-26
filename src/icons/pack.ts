import { parseSvg, type SvgShape } from './svg'

// The category icon pack: what a user can choose for a category, and what the
// app guesses from a category's name until they do.
//
// One SVG per icon in ./category, the file named by the icon's id. One entry
// per icon below: the Norwegian name the picker shows and reads out, and the
// words that make the app guess it. The guess tries the entries in this order
// and takes the first whose word starts a word in the category's name.
type Entry = {
  id: string
  name: string
  keywords: readonly string[]
  // Where the drawing is from, when it is not Material Symbols
  source?: string
}

const manifest: readonly Entry[] = [
  { id: 'book', name: 'Bok', keywords: ['bok', 'bøk'] },
  { id: 'person_play', name: 'Underholdning', keywords: ['underholdning', 'film', 'musikk'] },
  { id: 'child_hat', name: 'Leker', keywords: ['lek', 'barn'] },
  { id: 'devices', name: 'Elektronikk', keywords: ['elektronikk'] },
  { id: 'computer', name: 'Datamaskin', keywords: ['data', 'kontor', 'pc'] },
  { id: 'palette', name: 'Hobby', keywords: ['hobby', 'håndarbeid', 'kunst'] },
  { id: 'local_laundry_service', name: 'Vaskemaskin', keywords: ['hvitevare', 'vask'] },
  { id: 'lightbulb', name: 'Lyspære', keywords: ['interiør', 'lys'] },
  { id: 'restaurant', name: 'Kjøkken', keywords: ['kjøkken'] },
  { id: 'checkroom', name: 'Klær', keywords: ['klær', 'sko'] },
  { id: 'tv', name: 'TV', keywords: ['lyd', 'bilde'] },
  { id: 'smartphone', name: 'Mobil', keywords: ['mobil', 'telefon'] },
  { id: 'chair', name: 'Møbler', keywords: ['møbler', 'møbel'] },
  { id: 'spa', name: 'Pleie', keywords: ['pleie', 'helse', 'kosmetikk'] },
  { id: 'local_fire_department', name: 'Bål', keywords: ['speider'] },
  { id: 'sports_soccer', name: 'Sport', keywords: ['sport', 'fritid', 'trening'] },
  { id: 'hiking', name: 'Tur', keywords: ['tur', 'fjell'] },
  { id: 'handyman', name: 'Verktøy', keywords: ['verktøy', 'vedlikehold', 'bygg'] },
  { id: 'luggage', name: 'Bagasje', keywords: ['veske', 'bagasje', 'koffert'] },
  // The neutral one: for a name nothing above matches, and for several
  // categories at once. Keep it, and keep it last.
  { id: 'category', name: 'Annet', keywords: [] },
]

export const defaultSource = 'Material Symbols (Google, Apache License 2.0)'
export const fallbackIconId = 'category'

export type PackIcon = Entry & SvgShape & { source: string }

// Built into the bundle: the files are read when the app is built, not fetched
const files = import.meta.glob<string>('./category/*.svg', { query: '?raw', import: 'default', eager: true })

const idOf = (path: string) => path.replace(/^.*\//, '').replace(/\.svg$/, '')
const shapes = new Map<string, SvgShape | null>(Object.entries(files).map(([path, raw]) => [idOf(path), parseSvg(raw)]))

export const categoryIconPack: readonly PackIcon[] = manifest.flatMap((entry) => {
  const shape = shapes.get(entry.id)
  return shape ? [{ ...entry, ...shape, source: entry.source ?? defaultSource }] : []
})

const byId = new Map(categoryIconPack.map((icon) => [icon.id, icon]))

export function hasPackIcon(id: string): boolean {
  return byId.has(id)
}

// The icon with this id, or the neutral one
export function packIcon(id: string): PackIcon {
  const icon = byId.get(id) ?? byId.get(fallbackIconId)
  if (!icon) throw new Error('The icon pack has no fallback icon')
  return icon
}

// What does not line up, for the test that keeps the pack whole
export const packProblems = {
  filesWithoutEntry: [...shapes.keys()].filter((id) => !manifest.some((e) => e.id === id)),
  entriesWithoutFile: manifest.filter((e) => !shapes.has(e.id)).map((e) => e.id),
  unreadable: [...shapes.entries()].filter(([, shape]) => shape === null).map(([id]) => id),
  duplicateIds: manifest.map((e) => e.id).filter((id, i, all) => all.indexOf(id) !== i),
}
