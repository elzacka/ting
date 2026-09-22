import type { IconName } from '../components/Icons'

// Which glyph stands for a category. The categories are the user's own words,
// so the match is by the words in them rather than by a fixed list: the first
// keyword that starts a word in the name wins, and anything unrecognised gets
// the neutral one. A wrong guess costs nothing — the name itself is the
// button's label.
//
// A word, not a fragment of one: "Elektronikk" is not about "lek", and
// matching anywhere in the string said it was.

const byKeyword: readonly (readonly [string, IconName])[] = [
  ['bok', 'menuBook'],
  ['bøk', 'menuBook'],
  ['lek', 'toys'],
  ['barn', 'toys'],
  ['elektronikk', 'devices'],
  ['data', 'computer'],
  ['kontor', 'computer'],
  ['pc', 'computer'],
  ['hobby', 'palette'],
  ['håndarbeid', 'palette'],
  ['kunst', 'palette'],
  ['hvitevare', 'localLaundryService'],
  ['vask', 'localLaundryService'],
  ['interiør', 'lightbulb'],
  ['lys', 'lightbulb'],
  ['kjøkken', 'restaurant'],
  ['klær', 'checkroom'],
  ['sko', 'checkroom'],
  ['lyd', 'tv'],
  ['bilde', 'tv'],
  ['mobil', 'smartphone'],
  ['telefon', 'smartphone'],
  ['møbler', 'chair'],
  ['møbel', 'chair'],
  ['pleie', 'spa'],
  ['helse', 'spa'],
  ['kosmetikk', 'spa'],
  ['speider', 'localFireDepartment'],
  ['sport', 'sportsSoccer'],
  ['fritid', 'sportsSoccer'],
  ['trening', 'sportsSoccer'],
  ['tur', 'hiking'],
  ['fjell', 'hiking'],
  ['verktøy', 'handyman'],
  ['vedlikehold', 'handyman'],
  ['bygg', 'handyman'],
  ['veske', 'luggage'],
  ['bagasje', 'luggage'],
  ['koffert', 'luggage'],
]

export const allCategoriesIcon: IconName = 'gridView'
export const otherCategoryIcon: IconName = 'category'

export function categoryIcon(name: string): IconName {
  const words = name.toLocaleLowerCase('nb').split(/[^\p{Letter}\p{Number}]+/u).filter(Boolean)
  for (const [keyword, icon] of byKeyword) {
    if (words.some((word) => word.startsWith(keyword))) return icon
  }
  return otherCategoryIcon
}
