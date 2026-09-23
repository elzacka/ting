import { describe, expect, it } from 'vitest'
import { categoryIconPack, fallbackIconId, packIcon, packProblems } from './pack'
import { parseSvg } from './svg'

describe('the icon pack', () => {
  it('has a manifest line for every file and a file for every line', () => {
    expect(packProblems.filesWithoutEntry).toEqual([])
    expect(packProblems.entriesWithoutFile).toEqual([])
    expect(packProblems.duplicateIds).toEqual([])
  })

  it('can read every file', () => {
    expect(packProblems.unreadable).toEqual([])
  })

  it('names every icon in Norwegian and keeps ids plain', () => {
    for (const icon of categoryIconPack) {
      expect(icon.name.trim()).not.toBe('')
      expect(icon.id).toMatch(/^[a-z0-9_]+$/)
    }
  })

  it('keeps the neutral icon, last, and falls back to it', () => {
    expect(categoryIconPack.at(-1)?.id).toBe(fallbackIconId)
    expect(packIcon('no_such_icon').id).toBe(fallbackIconId)
  })
})

describe('parseSvg', () => {
  it('reads a Material Symbols download', () => {
    expect(
      parseSvg('<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px"><path d="M1 2h3z"/></svg>'),
    ).toEqual({ viewBox: '0 -960 960 960', paths: ['M1 2h3z'] })
  })

  it('makes a viewBox from width and height, and keeps every path', () => {
    expect(parseSvg("<svg width='24' height='24'><path d='M0 0h1'/><path fill='x' d='M2 2h1'/></svg>")).toEqual({
      viewBox: '0 0 24 24',
      paths: ['M0 0h1', 'M2 2h1'],
    })
  })

  it('refuses what it cannot draw', () => {
    expect(parseSvg('<svg viewBox="0 0 24 24"><circle r="4"/></svg>')).toBeNull()
    expect(parseSvg('<svg><path d="M0 0"/></svg>')).toBeNull()
    expect(parseSvg('not an svg')).toBeNull()
  })
})
