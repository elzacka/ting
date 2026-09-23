import { describe, expect, it } from 'vitest'
import type { Item, Property } from '../db/schema'
import { applyCategoryEdit } from './categories'
import { categoryProperty } from './fields'

function item(name: string, category: string): Item {
  return { id: name, name, specs: [{ key: 'Kategori', value: category, unit: '' }], photos: [], createdAt: 0, updatedAt: 0 }
}

const kategori: Property = { ...categoryProperty(), options: ['Kjøkken', 'Interiør'], icons: { Kjøkken: 'restaurant' } }
const rom: Property = { id: '["rom",""]', key: 'Rom', unit: '', createdAt: 1, type: 'choice', categories: ['Kjøkken'] }
const farge: Property = { id: '["farge",""]', key: 'Farge', unit: '', createdAt: 2, type: 'choice', categories: ['Interiør'] }

const none = { renames: [], icons: {}, added: [] }

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
})
