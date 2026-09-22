import type { IconName } from '../components/Icons'

// Which glyph stands for a category. The categories are the user's own words,
// so the match is by the words in them rather than by a fixed list: the first
// keyword the name contains wins, and anything unrecognised gets the neutral
// one. A wrong guess costs nothing — the name itself is the button's label.

const byKeyword: readonly (readonly [string, IconName])[] = [
  ['bok', 'menuBook'],
  ['bøk', 'menuBook'],
  ['lek', 'toys'],
  ['barn', 'toys'],
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
  const folded = name.toLocaleLowerCase('nb')
  for (const [word, icon] of byKeyword) if (folded.includes(word)) return icon
  return otherCategoryIcon
}
