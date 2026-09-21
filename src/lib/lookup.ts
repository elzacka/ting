import { z } from 'zod'
import { classify, digitsOf } from './barcode'

// The one place the app talks to the network, and only when the user presses
// "Slå opp på nett": the digits of a retail code go to a public catalogue and
// a name comes back for the user to review. Nothing else leaves the device:
// no cookies, no referrer, no key, no cache. The three hosts used here are
// the whole connect-src list in vite.config.ts; change both together.

export type Source = 'Open Library' | 'Open Products Facts' | 'Open Food Facts'

export type Lookup =
  | { kind: 'found'; name: string; source: Source }
  | { kind: 'notFound' }
  | { kind: 'offline' }
  | { kind: 'failed' }

const timeoutMs = 8000
const maxText = 200

// Text from outside becomes one bounded line of printable characters.
function text(raw: string): string {
  return [...raw]
    .filter((ch) => ch >= ' ' && ch !== '')
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxText)
}

// Open Library's search endpoint: the older /api/books answered 404 on
// 21 September 2026, this one answers in one request without a redirect
const openLibrary = z.object({
  docs: z.array(z.object({ title: z.string().optional(), author_name: z.array(z.string()).optional() })),
})

const productsFacts = z.object({
  status: z.number().optional(),
  product: z.object({ product_name: z.string().optional(), brands: z.string().optional() }).partial().optional(),
})

async function fetchJson(url: string, signal: AbortSignal): Promise<unknown> {
  const res = await fetch(url, {
    mode: 'cors',
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
    cache: 'no-store',
    redirect: 'error',
    headers: { Accept: 'application/json' },
    signal,
  })
  if (!res.ok) return null
  return (await res.json()) as unknown
}

async function fromOpenLibrary(isbn: string, signal: AbortSignal): Promise<Lookup> {
  const raw = await fetchJson(
    `https://openlibrary.org/search.json?isbn=${isbn}&fields=title,author_name&limit=1`,
    signal,
  )
  const parsed = openLibrary.safeParse(raw)
  const book = parsed.success ? parsed.data.docs[0] : undefined
  if (!book?.title) return { kind: 'notFound' }
  const authors = [...new Set((book.author_name ?? []).map(text).filter(Boolean))]
  const name = text([text(book.title), ...authors].join(', '))
  return name === '' ? { kind: 'notFound' } : { kind: 'found', name, source: 'Open Library' }
}

async function fromFacts(host: string, source: Source, code: string, signal: AbortSignal): Promise<Lookup> {
  const raw = await fetchJson(`https://${host}/api/v2/product/${code}.json?fields=product_name,brands`, signal)
  const parsed = productsFacts.safeParse(raw)
  if (!parsed.success || parsed.data.status !== 1) return { kind: 'notFound' }
  const product = text(parsed.data.product?.product_name ?? '')
  // Brands come as a list; the first one the product name does not already say
  const brand = (parsed.data.product?.brands ?? '')
    .split(',')
    .map(text)
    .find((b) => b !== '' && !product.toLocaleLowerCase().includes(b.toLocaleLowerCase()))
  const name = text([brand, product].filter(Boolean).join(' '))
  return name === '' ? { kind: 'notFound' } : { kind: 'found', name, source }
}

// Books to Open Library; other retail codes to the Open Food Facts family,
// household goods first. Serial numbers and QR content are never sent.
export async function lookup(code: string): Promise<Lookup> {
  const kind = classify(code)
  if (kind === 'other') return { kind: 'notFound' }
  if (!navigator.onLine) return { kind: 'offline' }
  const digits = digitsOf(code)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    if (kind === 'isbn') return await fromOpenLibrary(digits, controller.signal)
    const first = await fromFacts('world.openproductsfacts.org', 'Open Products Facts', digits, controller.signal)
    if (first.kind === 'found') return first
    return await fromFacts('world.openfoodfacts.org', 'Open Food Facts', digits, controller.signal)
  } catch {
    return navigator.onLine ? { kind: 'failed' } : { kind: 'offline' }
  } finally {
    clearTimeout(timer)
  }
}
