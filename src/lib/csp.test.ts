import { describe, expect, it } from 'vitest'
import config from '../../vite.config.ts?raw'

// Nothing leaves the device but an ISBN lookup and the start page's visit count:
// the CSP names exactly the two catalogues and GoatCounter, and only lookup.ts
// and visitCount.ts talk to another origin. Receipt reading and sync must keep it so.

const files = import.meta.glob<string>(['/src/**/*.{ts,tsx}', '!/src/**/*.test.ts'], {
  query: '?raw',
  import: 'default',
  eager: true,
})

// Code only: a comment may name fetch() or an example address
const code = (text: string) => text.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')

describe('network boundary', () => {
  it('lets connect-src reach the two catalogues and img-src GoatCounter, nothing else', () => {
    expect(config).toContain("const lookupOrigins = ['https://api.nb.no', 'https://openlibrary.org']")
    expect(config).toContain("`connect-src 'self' ${lookupOrigins.join(' ')}`")
    expect(config).toContain(`"img-src 'self' data: blob: https://elzacka.goatcounter.com",`)
    expect(config.match(/https:\/\//g)).toHaveLength(3)
  })

  it('counts the start page only, never a view', () => {
    const counting = Object.entries(files)
      .filter(([, text]) => /\bcountVisit\(/.test(code(text)))
      .map(([path]) => path)
    expect(counting.sort()).toEqual(['/src/lib/visitCount.ts', '/src/main.tsx'])
    expect(code(files['/src/main.tsx'] ?? '')).toContain('countVisit(import.meta.env.BASE_URL)')
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
      .filter(([, text]) => (code(text).match(/https?:\/\/[a-z0-9.-]+/gi) ?? []).some((u) => !/api\.nb\.no|openlibrary\.org|^https:\/\/elzacka\.goatcounter\.com$|www\.w3\.org|^https:\/\/github\.com$/.test(u)))
      .map(([path]) => path)
    expect(outside).toEqual([])
  })
})
