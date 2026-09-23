import type { IconName } from '../components/Icons'
import { categoryIconPack, fallbackIconId, hasPackIcon } from '../icons/pack'

// Which icon stands for a category: the one the user chose from the pack, or
// until they do, one guessed from the words in the category's own name. The
// guess takes the first pack icon with a keyword that starts a word in the
// name, and a name it does not recognise gets the neutral one. A wrong guess
// costs nothing: the name is always shown beside it, and the user can choose.
//
// A word, not a fragment of one: "Elektronikk" is not about "lek", and
// matching anywhere in the string said it was.

// Alle is not a category, so its glyph is a UI icon rather than a pack icon
export const allCategoriesIcon: IconName = 'gridView'
export const otherCategoryIcon = fallbackIconId

function words(name: string): string[] {
  return name.toLocaleLowerCase('nb').split(/[^\p{Letter}\p{Number}]+/u).filter(Boolean)
}

export function guessCategoryIcon(name: string): string {
  const ws = words(name)
  for (const icon of categoryIconPack) {
    if (icon.keywords.some((k) => ws.some((w) => w.startsWith(k)))) return icon.id
  }
  return otherCategoryIcon
}

const fold = (s: string) => s.trim().toLocaleLowerCase('nb')

// The chosen icon (keyed by the category as written, compared however it was
// typed) while the pack still has it, else the guess
export function categoryIconFor(label: string, chosen?: Readonly<Record<string, string>>): string {
  const key = fold(label)
  const hit = chosen ? Object.entries(chosen).find(([k]) => fold(k) === key)?.[1] : undefined
  return hit !== undefined && hasPackIcon(hit) ? hit : guessCategoryIcon(label)
}

// Only the explicit choice, or null while the guess stands
export function chosenIcon(label: string, chosen?: Readonly<Record<string, string>>): string | null {
  const key = fold(label)
  const hit = chosen ? Object.entries(chosen).find(([k]) => fold(k) === key)?.[1] : undefined
  return hit !== undefined && hasPackIcon(hit) ? hit : null
}
