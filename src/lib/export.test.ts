import { describe, expect, it } from 'vitest'
import type { Item } from '../db/schema'
import { categoryProperty, defaultFieldSettings } from './fields'
import { columnId } from './grid'
import { exportFilename, toCsv } from './export'

function item(name: string, specs: Item['specs']): Item {
  return {
    id: crypto.randomUUID(),
    name,
    specs: [{ key: 'Kategori', value: 'Turutstyr', unit: null }, ...specs],
    photo: null,
    createdAt: Date.UTC(2026, 8, 19, 12),
    updatedAt: 0,
  }
}

describe('toCsv', () => {
  it('writes a BOM, semicolons, unit headers, comma decimals and quoting', () => {
    const csv = toCsv(
      [
        item('Sovepose', [{ key: 'Komforttemperatur', value: -12.5, unit: '°C' }, { key: 'Notat', value: 'Ligger; "trygt"', unit: null }]),
        item('Kokeapparat', [{ key: 'Brensel', value: 'Gass', unit: null }]),
      ],
      [categoryProperty()],
      defaultFieldSettings,
    )
    const lines = csv.split('\r\n')
    expect(lines[0]).toBe('﻿Navn;Kategori;Brensel;Komforttemperatur (°C);Notat;Opprettet')
    expect(lines[1]).toBe('Sovepose;Turutstyr;;-12,5;"Ligger; ""trygt""";19.09.26')
    expect(lines[2]).toBe('Kokeapparat;Turutstyr;Gass;;;19.09.26')
    expect(lines[3]).toBe('')
  })
})

describe('exportFilename', () => {
  it('uses the ISO date', () => {
    expect(exportFilename('csv', new Date(Date.UTC(2026, 8, 19, 12)))).toBe('ting-2026-09-19.csv')
  })
})

describe('toCsv column order', () => {
  it('follows the stored property order and skips empty properties', () => {
    const csv = toCsv(
      [item('Sovepose', [{ key: 'Komforttemperatur', value: -12, unit: '°C' }, { key: 'Vekt', value: 900, unit: 'gram' }])],
      [
        categoryProperty(),
        { id: columnId({ key: 'Vekt', unit: 'gram' }), key: 'Vekt', unit: 'gram', createdAt: 1, order: 0 },
        { id: columnId({ key: 'Farge', unit: null }), key: 'Farge', unit: null, createdAt: 2, order: 1 },
        { id: columnId({ key: 'Komforttemperatur', unit: '°C' }), key: 'Komforttemperatur', unit: '°C', createdAt: 3, order: 2 },
      ],
      defaultFieldSettings,
    )
    expect(csv.split('\r\n')[0]).toBe('\ufeffNavn;Kategori;Vekt (gram);Komforttemperatur (°C);Opprettet')
  })
})

describe('toCsv with renamed and hidden fields', () => {
  it('uses the label for Navn', () => {
    const csv = toCsv([item('Sovepose', [])], [categoryProperty()], { name: { label: 'Ting' } })
    expect(csv.split('\r\n')[0]).toBe('\ufeffTing;Kategori;Opprettet')
  })
})

describe('toCsv formula guard', () => {
  it('prefixes formula-like text with an apostrophe but leaves negative numbers', () => {
    const csv = toCsv(
      [
        item('=HYPERLINK("http://x")', [{ key: 'Komforttemperatur', value: -12, unit: '°C' }, { key: 'Notat', value: '+1 and @x', unit: null }]),
        item('Telt', [{ key: 'Brensel', value: '-DDE()', unit: null }]),
      ],
      [categoryProperty()],
      defaultFieldSettings,
    )
    const lines = csv.split('\r\n')
    expect(lines[1]).toContain(`"'=HYPERLINK(""http://x"")"`)
    expect(lines[1]).toContain(";-12;")
    expect(lines[1]).toContain("'+1 and @x")
    expect(lines[2]).toContain("'-DDE()")
  })
})
