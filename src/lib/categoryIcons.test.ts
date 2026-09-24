import { describe, expect, it } from 'vitest'
import { categoryIconFor, chosenIcon, guessCategoryIcon, isBookCategory, otherCategoryIcon } from './categoryIcons'

describe('guessCategoryIcon', () => {
  it('reads the words in the register elzacka actually keeps', () => {
    expect(guessCategoryIcon('Bøker og leker')).toBe('menu_book')
    expect(guessCategoryIcon('Data og kontor')).toBe('computer')
    expect(guessCategoryIcon('Hobby og håndarbeid')).toBe('palette')
    expect(guessCategoryIcon('Hvitevarer')).toBe('local_laundry_service')
    expect(guessCategoryIcon('Interiør')).toBe('lightbulb')
    expect(guessCategoryIcon('Kjøkken')).toBe('restaurant')
    expect(guessCategoryIcon('Klær og sko')).toBe('checkroom')
    expect(guessCategoryIcon('Lyd og bilde')).toBe('tv')
    expect(guessCategoryIcon('Mobil og tilbehør')).toBe('smartphone')
    expect(guessCategoryIcon('Møbler')).toBe('chair')
    expect(guessCategoryIcon('Personlig pleie')).toBe('spa')
    expect(guessCategoryIcon('Speiderutstyr')).toBe('local_fire_department')
    expect(guessCategoryIcon('Sport og fritid')).toBe('sports_soccer')
    expect(guessCategoryIcon('Turutstyr')).toBe('hiking')
    expect(guessCategoryIcon('Verktøy og vedlikehold')).toBe('handyman')
    expect(guessCategoryIcon('Vesker og bagasje')).toBe('luggage')
  })

  it('gives Elektronikk the glyph for a phone and a laptop together', () => {
    expect(guessCategoryIcon('Elektronikk')).toBe('devices')
    // and not the one either half of it used to have
    expect(guessCategoryIcon('Elektronikk og tilbehør')).toBe('devices')
  })

  it('matches a word, never a fragment inside one', () => {
    // "Elektronikk" contains "lek" and is not about toys
    expect(guessCategoryIcon('Elektronikk')).toBe('devices')
    // "Sportsutstyr" starts with "sport", which is a word beginning
    expect(guessCategoryIcon('Sportsutstyr')).toBe('sports_soccer')
  })

  it('does not care how the category is capitalised', () => {
    expect(guessCategoryIcon('KJØKKEN')).toBe('restaurant')
    expect(guessCategoryIcon('kjøkken')).toBe('restaurant')
  })

  it('gives anything it does not recognise the neutral glyph', () => {
    expect(guessCategoryIcon('Diverse')).toBe(otherCategoryIcon)
    expect(guessCategoryIcon('')).toBe(otherCategoryIcon)
  })

  it('takes the first word it knows, so a two-word name settles on one glyph', () => {
    // "Bøker og leker" is books before it is toys
    expect(guessCategoryIcon('Bøker og leker')).toBe('menu_book')
    expect(guessCategoryIcon('Leker og spill')).toBe('toys')
  })
})

describe('categoryIconFor', () => {
  it('uses the chosen icon, whatever case the category is written in', () => {
    expect(categoryIconFor('Kjøkken', { kjøkken: 'chair' })).toBe('chair')
    expect(categoryIconFor(' KJØKKEN ', { Kjøkken: 'chair' })).toBe('chair')
  })

  it('falls back to the guess without a choice, or when the pack has lost the chosen icon', () => {
    expect(categoryIconFor('Kjøkken')).toBe('restaurant')
    expect(categoryIconFor('Kjøkken', { Kjøkken: 'no_such_icon' })).toBe('restaurant')
  })

  it('tells an explicit choice from a guess', () => {
    expect(chosenIcon('Kjøkken', { Kjøkken: 'chair' })).toBe('chair')
    expect(chosenIcon('Kjøkken', {})).toBeNull()
  })
})

describe('isBookCategory', () => {
  it('knows books by the book icon, guessed from the name', () => {
    expect(isBookCategory('Bøker')).toBe(true)
    expect(isBookCategory('Bøker og leker')).toBe(true)
    expect(isBookCategory('Kjøkken')).toBe(false)
    expect(isBookCategory('')).toBe(false)
  })

  it('follows the icon chosen in Endre kategorier', () => {
    expect(isBookCategory('Litteratur', { Litteratur: 'menu_book' })).toBe(true)
    expect(isBookCategory('Bøker', { Bøker: 'chair' })).toBe(false)
  })
})
