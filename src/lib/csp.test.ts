import { describe, expect, it } from 'vitest'
import config from '../../vite.config.ts?raw'

// Nothing leaves the device but an ISBN lookup: the CSP names exactly the two
// catalogues, and only lookup.ts talks to another origin. Receipt reading and
// sync must keep it so.

const files = import.meta.glob<string>(['/src/**/*.{ts,tsx}', '!/src/**/*.test.ts'], {
  query: '?raw',
  import: 'default',
  eager: true,
})

// Code only: a comment may name fetch() or an example address
const code = (text: string) => text.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')

describe('network boundary', () => {
  it('lets connect-src reach only this origin and the two catalogues', () => {
    expect(config).toContain("const lookupOrigins = ['https://api.nb.no', 'https://openlibrary.org']")
    expect(config).toContain("`connect-src 'self' ${lookupOrigins.join(' ')}`")
    expect(config.match(/https:\/\//g)).toHaveLength(2)
  })

  it('calls fetch only in the lookup and for the on-device models', () => {
    const fetching = Object.entries(files)
      .filter(([, text]) => /\bfetch\(/.test(code(text)))
      .map(([path]) => path)
    expect(fetching.sort()).toEqual(['/src/lib/lookup.ts', '/src/lib/ocr/cache.ts'])
  })

  // The repo is a link the user opens, never fetched
  it('names no other origin in app code', () => {
    const outside = Object.entries(files)
      .filter(([, text]) => (code(text).match(/https?:\/\/[a-z0-9.-]+/gi) ?? []).some((u) => !/api\.nb\.no|openlibrary\.org|www\.w3\.org|^https:\/\/github\.com$/.test(u)))
      .map(([path]) => path)
    expect(outside).toEqual([])
  })
})
