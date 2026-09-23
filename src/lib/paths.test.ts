import { describe, expect, it } from 'vitest'
import { formatPath, isPathUnit, nextLevels, parsePath, pathPrefix, pathsInUse } from './paths'

describe('parsePath', () => {
  it('takes whichever separator the keyboard could reach', () => {
    expect(parsePath('Loftsbod/Hylle 2/Boks 4')).toEqual(['Loftsbod', 'Hylle 2', 'Boks 4'])
    expect(parsePath('Loftsbod>Hylle 2')).toEqual(['Loftsbod', 'Hylle 2'])
    expect(parsePath('Loftsbod › Hylle 2')).toEqual(['Loftsbod', 'Hylle 2'])
    expect(parsePath('Loftsbod / Hylle 2 › Boks 4')).toEqual(['Loftsbod', 'Hylle 2', 'Boks 4'])
  })

  it('drops the empty levels a stray separator leaves', () => {
    expect(parsePath('/Loftsbod//Hylle 2/')).toEqual(['Loftsbod', 'Hylle 2'])
    expect(parsePath('')).toEqual([])
    expect(parsePath('   ')).toEqual([])
  })

  it('reads a place that is only a room', () => {
    expect(parsePath('Loftsbod')).toEqual(['Loftsbod'])
  })
})

describe('formatPath', () => {
  it('writes the way in with the one separator the eye reads', () => {
    expect(formatPath(['Loftsbod', 'Hylle 2'])).toBe('Loftsbod › Hylle 2')
    expect(formatPath(['Loftsbod'])).toBe('Loftsbod')
    expect(formatPath([])).toBe('')
  })

  it('is what parsePath undoes, whatever was typed', () => {
    expect(formatPath(parsePath('Loftsbod/Hylle 2'))).toBe('Loftsbod › Hylle 2')
  })
})

describe('pathPrefix', () => {
  const place = 'Loftsbod › Hylle 2 › Boks 4'
  it('gives the way in as far as one level', () => {
    expect(pathPrefix(place, 1)).toBe('Loftsbod')
    expect(pathPrefix(place, 2)).toBe('Loftsbod › Hylle 2')
    expect(pathPrefix(place, 3)).toBe(place)
  })

  it('says nothing about a level the place does not reach', () => {
    expect(pathPrefix('Loftsbod', 2)).toBeNull()
    expect(pathPrefix(place, 4)).toBeNull()
    expect(pathPrefix('', 1)).toBeNull()
    expect(pathPrefix(place, 0)).toBeNull()
  })
})

describe('pathsInUse', () => {
  it('offers every place and every place on the way to one, shallowest first', () => {
    expect(pathsInUse(['Loftsbod › Hylle 2', 'Kjellerbod'])).toEqual([
      'Kjellerbod',
      'Loftsbod',
      'Loftsbod › Hylle 2',
    ])
  })

  it('names a place once however many things are in it', () => {
    expect(pathsInUse(['Loftsbod/Hylle 2', 'Loftsbod › Hylle 2'])).toEqual(['Loftsbod', 'Loftsbod › Hylle 2'])
  })

  it('stops at three levels', () => {
    expect(pathsInUse(['A/B/C/D'])).toEqual(['A', 'A › B', 'A › B › C'])
  })
})

describe('isPathUnit', () => {
  it('knows the marker a place column carries', () => {
    expect(isPathUnit('sti')).toBe(true)
    expect(isPathUnit(' Sti ')).toBe(true)
    expect(isPathUnit('dato')).toBe(false)
    expect(isPathUnit(null)).toBe(false)
  })
})

describe('nextLevels', () => {
  const paths = pathsInUse(['Bod › Hylle 1', 'Bod › Hylle 2 › Blå kasse', 'Bod › Gulv', 'Stue › Bokhylle'])

  it('offers the rooms while nothing is typed', () => {
    expect(nextLevels(paths, '')).toEqual({ base: [], options: ['Bod', 'Stue'] })
  })

  it('offers what is inside a place in use', () => {
    expect(nextLevels(paths, 'Bod')).toEqual({ base: ['Bod'], options: ['Gulv', 'Hylle 1', 'Hylle 2'] })
    expect(nextLevels(paths, 'bod / hylle 2')).toEqual({ base: ['bod', 'hylle 2'], options: ['Blå kasse'] })
  })

  it('narrows the level being typed to the places that start with it', () => {
    expect(nextLevels(paths, 'Bod › Hy')).toEqual({ base: ['Bod'], options: ['Hylle 1', 'Hylle 2'] })
    expect(nextLevels(paths, 'St')).toEqual({ base: [], options: ['Stue'] })
  })

  it('offers the places beside one that has nothing inside it', () => {
    expect(nextLevels(paths, 'Bod › Hylle 1')).toEqual({ base: ['Bod'], options: ['Gulv', 'Hylle 2'] })
    expect(nextLevels(paths, 'Bod › Hylle 2 › Blå kasse')).toEqual({ base: ['Bod', 'Hylle 2'], options: [] })
  })

  it('offers nothing for a place not in use', () => {
    expect(nextLevels(paths, 'Garasje').options).toEqual([])
    expect(nextLevels(paths, 'Bod › Loft').options).toEqual([])
  })
})
