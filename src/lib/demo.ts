import type { Item, Property, Spec } from '../db/schema'
import { dateUnit } from './dates'
import { categoryKey, categoryProperty } from './fields'
import { pathUnit } from './paths'
import { columnId } from './grid'

// The examples a browser tab shows: a few things across categories and the
// three places, so the table, the filters and the search have something to show.

const place = { key: 'Plassering', unit: pathUnit }
const brand = { key: 'Merke', unit: null }
const author = { key: 'Forfatter', unit: null }
const bought = { key: 'Kjøpsdato', unit: dateUnit }
const price = { key: 'Pris', unit: 'kr' }

type Example = [name: string, category: string, where: string, more: [col: { key: string; unit: string | null }, value: string | number][]]

const examples: Example[] = [
  ['Hodetelefoner', 'Elektronikk', 'Leilighet › Soverom › Nattbord', [[brand, 'Sony'], [bought, '2025-03-12'], [price, 3490]]],
  ['Bærbar høyttaler', 'Elektronikk', 'Leilighet › Stue › Hylle 2', [[brand, 'JBL'], [bought, '2024-06-01'], [price, 1290]]],
  ['Kaffekvern', 'Kjøkken', 'Leilighet › Kjøkken › Skap 2', [[brand, 'Wilfa'], [bought, '2024-11-02'], [price, 899]]],
  ['Stavmikser', 'Kjøkken', 'Leilighet › Kjøkken › Skuff 1', [[brand, 'Braun'], [bought, '2023-06-15'], [price, 649]]],
  ['Drill', 'Verktøy', 'Kjellerbod › Hylle 1 › Boks 2', [[brand, 'Bosch'], [bought, '2022-04-20'], [price, 1990]]],
  ['Vaterpass', 'Verktøy', 'Kjellerbod › Hylle 1', []],
  ['Telt', 'Tur', 'Loftsbod › Hylle 2', [[brand, 'Helsport'], [bought, '2021-05-30'], [price, 4200]]],
  ['Sovepose', 'Tur', 'Loftsbod › Hylle 2 › Boks 1', [[bought, '2021-05-30'], [price, 1800]]],
  ['Sult', 'Bøker', 'Leilighet › Stue › Bokhylle', [[author, 'Knut Hamsun']]],
  ['Kristin Lavransdatter', 'Bøker', 'Leilighet › Stue › Bokhylle', [[author, 'Sigrid Undset']]],
]

export function demoRegister(now: number): { items: Item[]; properties: Property[] } {
  const prop = (col: { key: string; unit: string | null }, order: number, type: Property['type'], categories?: string[]): Property => ({
    id: columnId(col),
    key: col.key,
    unit: col.unit,
    createdAt: now,
    order,
    type,
    ...(categories ? { categories } : {}),
  })
  const properties: Property[] = [
    { ...categoryProperty(), createdAt: now },
    prop(place, 0, 'path'),
    prop(brand, 1, 'text', ['Elektronikk', 'Kjøkken', 'Verktøy', 'Tur']),
    prop(author, 2, 'text', ['Bøker']),
    prop(bought, 3, 'date', ['Elektronikk', 'Kjøkken', 'Verktøy', 'Tur']),
    prop(price, 4, 'number', ['Elektronikk', 'Kjøkken', 'Verktøy', 'Tur']),
  ]
  const spec = (col: { key: string; unit: string | null }, value: string | number): Spec => ({ key: col.key, unit: col.unit, value })
  const items = examples.map(([name, category, where, more], i): Item => ({
    id: crypto.randomUUID(),
    name,
    specs: [spec({ key: categoryKey, unit: '' }, category), spec(place, where), ...more.map(([col, value]) => spec(col, value))],
    photos: [],
    // Newest first in the order above
    createdAt: now - i,
    updatedAt: now - i,
  }))
  return { items, properties }
}
