import { describe, expect, it } from 'vitest'
import type { Item, Property } from '../db/schema'
import { applyCategoryEdit, categoryNames, iconsAfter, sharedByAll, usesAfter } from './categories'
import { categoryProperty } from './fields'

function item(name: string, category: string): Item {
  return { id: name, name, specs: [{ key: 'Kategori', value: category, unit: '' }], photos: [], createdAt: 0, updatedAt: 0 }
}

const kategori: Property = { ...categoryProperty(), options: ['Kjøkken', 'Interiør'], icons: { Kjøkken: 'restaurant' } }
const rom: Property = { id: '["rom",""]', key: 'Rom', unit: '', createdAt: 1, type: 'choice', categories: ['Kjøkken'] }
const farge: Property = { id: '["farge",""]', key: 'Farge', unit: '', createdAt: 2, type: 'choice', categories: ['Interiør'] }

const none = { renames: [], icons: {}, added: [], removed: [], uses: [] }

describe('applyCategoryEdit', () => {
  it('renames a category on every thing, however it was typed', () => {
    const out = applyCategoryEdit([item('Kjele', 'Kjøkken'), item('Gryte', 'kjøkken'), item('Lampe', 'Interiør')], [], kategori, {
      ...none,
      renames: [['Kjøkken', 'Kjøkkenutstyr']],
    })
    expect(out.items.map((i) => [i.name, i.specs[0]?.value])).toEqual([
      ['Kjele', 'Kjøkkenutstyr'],
      ['Gryte', 'Kjøkkenutstyr'],
    ])
  })

  it('carries the rename into the columns that belong to the category and the list of choices', () => {
    const out = applyCategoryEdit([], [kategori, rom, farge], kategori, { ...none, renames: [['Kjøkken', 'Kjøkkenutstyr']] })
    expect(out.properties.find((p) => p.id === rom.id)?.categories).toEqual(['Kjøkkenutstyr'])
    expect(out.properties.some((p) => p.id === farge.id)).toBe(false)
    expect(out.properties[0]?.options).toEqual(['Kjøkkenutstyr', 'Interiør'])
  })

  it('makes one category of two when renamed onto the other', () => {
    const both: Property = { ...farge, categories: ['Interiør', 'Kjøkken'] }
    const out = applyCategoryEdit([item('Lampe', 'Interiør')], [both], kategori, { ...none, renames: [['Interiør', 'Kjøkken']] })
    expect(out.items[0]?.specs[0]?.value).toBe('Kjøkken')
    expect(out.properties.find((p) => p.id === both.id)?.categories).toEqual(['Kjøkken'])
    expect(out.properties[0]?.options).toEqual(['Kjøkken'])
  })

  it('stores the chosen icons, and leaves out the ones set back to the guess', () => {
    const out = applyCategoryEdit([], [], kategori, { ...none, icons: { Kjøkken: null, Interiør: 'chair' } })
    expect(out.properties[0]?.icons).toEqual({ Interiør: 'chair' })
  })

  it('adds a new category to the choices', () => {
    const out = applyCategoryEdit([], [], kategori, { ...none, added: [' Bad ', 'kjøkken'] })
    expect(out.properties[0]?.options).toEqual(['Kjøkken', 'Interiør', 'Bad'])
  })

  it('changes nothing for a rename to the same name or to nothing', () => {
    const out = applyCategoryEdit([item('Kjele', 'Kjøkken')], [rom], kategori, {
      ...none,
      renames: [['Kjøkken', 'Kjøkken'], ['Interiør', '  ']],
    })
    expect(out.items).toEqual([])
    expect(out.properties).toHaveLength(1)
  })

  it('takes a removed category out of the choices and out of every column', () => {
    const both: Property = { ...farge, categories: ['Interiør', 'Kjøkken'] }
    const out = applyCategoryEdit([], [rom, both], kategori, { ...none, removed: ['kjøkken'] })
    expect(out.properties[0]?.options).toEqual(['Interiør'])
    expect(out.properties.find((p) => p.id === both.id)?.categories).toEqual(['Interiør'])
    // Its own column is left with no category, not every one
    expect(out.properties.find((p) => p.id === rom.id)?.categories).toEqual([])
  })
})

describe('iconsAfter', () => {
  it('keeps the icon of the category the other was merged into', () => {
    const rows = [
      { from: 'Bok', name: 'Bøker', icon: null },
      { from: 'Bøker', name: 'Bøker', icon: 'book' },
      { from: 'Spill', name: 'Bøker', icon: null },
    ]
    expect(iconsAfter(rows)).toEqual({ Bøker: 'book' })
  })

  it('takes the first icon chosen when two get a new name', () => {
    const rows = [
      { from: 'Bok', name: 'Lesing', icon: null },
      { from: 'Blad', name: 'Lesing', icon: 'news' },
      { from: 'Hefte', name: 'Lesing', icon: 'book' },
    ]
    expect(iconsAfter(rows)).toEqual({ Lesing: 'news' })
  })
})

describe('usesAfter', () => {
  const pris: Property = { id: '["pris","kr"]', key: 'Pris', unit: 'kr', createdAt: 3, type: 'number' }

  it('lists the other categories when one stops using a property every category had', () => {
    expect(usesAfter(pris, [{ name: 'Kjøkken', on: false }, { name: 'Interiør', on: true }])).toEqual(['Interiør'])
  })

  it('keeps a property every category had that way while every row ticks it', () => {
    expect(usesAfter(pris, [{ name: 'Kjøkken', on: true }, { name: 'Interiør', on: true }])).toBeNull()
  })

  it('leaves no category on a property the last one stopped using', () => {
    expect(usesAfter(rom, [{ name: 'Kjøkken', on: false }, { name: 'Interiør', on: false }])).toEqual([])
  })

  it('lists a category once when two rows get the same name', () => {
    expect(usesAfter(rom, [{ name: 'Kjøkken', on: true }, { name: 'kjøkken', on: true }])).toEqual(['Kjøkken'])
  })
})

describe('applyCategoryEdit with uses', () => {
  it('stores the categories ticked for a property, and none as an empty list', () => {
    const out = applyCategoryEdit([], [kategori, rom, farge], kategori, {
      ...none,
      uses: [
        { property: rom, categories: [] },
        { property: farge, categories: ['Interiør', 'Kjøkken'] },
      ],
    })
    expect(out.properties.find((p) => p.id === rom.id)?.categories).toEqual([])
    expect(out.properties.find((p) => p.id === farge.id)?.categories).toEqual(['Interiør', 'Kjøkken'])
  })

  it('makes a property every category uses again with null', () => {
    const out = applyCategoryEdit([], [kategori, rom], kategori, { ...none, uses: [{ property: rom, categories: null }] })
    expect(out.properties.find((p) => p.id === rom.id)?.categories).toBeUndefined()
  })

  it('defines a column that only lived in item values', () => {
    const loose: Property = { id: '["merke",null]', key: 'Merke', unit: null, createdAt: 4 }
    const out = applyCategoryEdit([], [kategori], kategori, { ...none, uses: [{ property: loose, categories: ['Interiør'] }] })
    expect(out.properties.find((p) => p.id === loose.id)?.categories).toEqual(['Interiør'])
  })
})

describe('categoryNames', () => {
  it('lists the categories things hold and the ones offered, once each', () => {
    expect(categoryNames([item('Kjele', 'kjøkken'), item('Bok', 'Bøker')], kategori)).toEqual(['kjøkken', 'Bøker', 'Interiør'])
  })
})

describe('sharedByAll', () => {
  const pris: Property = { id: '["pris","kr"]', key: 'Pris', unit: 'kr', createdAt: 3, type: 'number' }

  it('is a property every category uses, with or without a list', () => {
    expect(sharedByAll(pris, ['Kjøkken', 'Interiør'])).toBe(true)
    expect(sharedByAll({ ...rom, categories: ['Kjøkken', 'Interiør'] }, ['Kjøkken', 'Interiør'])).toBe(true)
    expect(sharedByAll(null, ['Kjøkken'])).toBe(true)
  })

  it('stops being one when a category without it is added', () => {
    expect(sharedByAll(rom, ['Kjøkken'])).toBe(true)
    expect(sharedByAll(rom, ['Kjøkken', 'Interiør'])).toBe(false)
  })
})
