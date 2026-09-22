import { describe, expect, it } from 'vitest'
import { categoryIcon, otherCategoryIcon } from './categoryIcons'

describe('categoryIcon', () => {
  it('reads the words in the register elzacka actually keeps', () => {
    expect(categoryIcon('Bøker og leker')).toBe('menuBook')
    expect(categoryIcon('Data og kontor')).toBe('computer')
    expect(categoryIcon('Hobby og håndarbeid')).toBe('palette')
    expect(categoryIcon('Hvitevarer')).toBe('localLaundryService')
    expect(categoryIcon('Interiør')).toBe('lightbulb')
    expect(categoryIcon('Kjøkken')).toBe('restaurant')
    expect(categoryIcon('Klær og sko')).toBe('checkroom')
    expect(categoryIcon('Lyd og bilde')).toBe('tv')
    expect(categoryIcon('Mobil og tilbehør')).toBe('smartphone')
    expect(categoryIcon('Møbler')).toBe('chair')
    expect(categoryIcon('Personlig pleie')).toBe('spa')
    expect(categoryIcon('Speiderutstyr')).toBe('localFireDepartment')
    expect(categoryIcon('Sport og fritid')).toBe('sportsSoccer')
    expect(categoryIcon('Turutstyr')).toBe('hiking')
    expect(categoryIcon('Verktøy og vedlikehold')).toBe('handyman')
    expect(categoryIcon('Vesker og bagasje')).toBe('luggage')
  })

  it('gives Elektronikk the glyph for a phone and a laptop together', () => {
    expect(categoryIcon('Elektronikk')).toBe('devices')
    // and not the one either half of it used to have
    expect(categoryIcon('Elektronikk og tilbehør')).toBe('devices')
  })

  it('matches a word, never a fragment inside one', () => {
    // "Elektronikk" contains "lek" and is not about toys
    expect(categoryIcon('Elektronikk')).toBe('devices')
    // "Sportsutstyr" starts with "sport", which is a word beginning
    expect(categoryIcon('Sportsutstyr')).toBe('sportsSoccer')
  })

  it('does not care how the category is capitalised', () => {
    expect(categoryIcon('KJØKKEN')).toBe('restaurant')
    expect(categoryIcon('kjøkken')).toBe('restaurant')
  })

  it('gives anything it does not recognise the neutral glyph', () => {
    expect(categoryIcon('Diverse')).toBe(otherCategoryIcon)
    expect(categoryIcon('')).toBe(otherCategoryIcon)
  })

  it('takes the first word it knows, so a two-word name settles on one glyph', () => {
    // "Bøker og leker" is books before it is toys
    expect(categoryIcon('Bøker og leker')).toBe('menuBook')
    expect(categoryIcon('Leker og spill')).toBe('toys')
  })
})
