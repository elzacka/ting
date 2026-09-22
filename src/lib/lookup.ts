import { z } from 'zod'
import { classify, digitsOf } from './barcode'

// The one place the app talks to the network, and only when the user presses
// "Slå opp på nett": the digits of a retail code go to a public catalogue and
// a name comes back for the user to review. Nothing else leaves the device:
// no cookies, no referrer, no key, no cache. The hosts used here are the
// whole connect-src list in vite.config.ts; change both together.

export type Source =
  | 'Nasjonalbiblioteket'
  | 'Open Library'
  | 'Open Food Facts'
  | 'Open Products Facts'
  | 'Open Beauty Facts'
  | 'Open Pet Food Facts'

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
    .filter((ch) => ch >= ' ' && ch !== '')
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxText)
}

// Nasjonalbiblioteket's catalogue: every book published in Norway, by legal
// deposit. Titles come as "main : subtitle" and creators as "Surname, Given".
const nasjonalbiblioteket = z.object({
  _embedded: z
    .object({ items: z.array(z.object({ metadata: z.object({ title: z.string().optional(), creators: z.array(z.string()).optional() }) })) })
    .optional(),
})

// Open Library's search endpoint: the older /api/books answered 404 on
// 21 September 2026, this one answers in one request without a redirect
const openLibrary = z.object({
  docs: z.array(z.object({ title: z.string().optional(), author_name: z.array(z.string()).optional() })),
})

// The Open Food Facts family is one store with four fronts; product_type says
// which one answered
const factsSources: Record<string, Source> = {
  food: 'Open Food Facts',
  product: 'Open Products Facts',
  beauty: 'Open Beauty Facts',
  petfood: 'Open Pet Food Facts',
}

const facts = z.object({
  status: z.string().optional(),
  product: z
    .object({ product_name: z.string().optional(), brands: z.string().optional(), product_type: z.string().optional() })
    .partial()
    .optional(),
})

async function fetchJson(url: string, signal: AbortSignal, redirect: RequestRedirect = 'error'): Promise<unknown> {
  const res = await fetch(url, {
    mode: 'cors',
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
    cache: 'no-store',
    redirect,
    headers: { Accept: 'application/json' },
    signal,
  })
  if (!res.ok) return null
  return (await res.json()) as unknown
}

function bookName(title: string, authors: string[]): string {
  const names = [...new Set(authors.map(text).filter(Boolean))]
  return text([text(title), ...names].join(', '))
}

async function fromNasjonalbiblioteket(isbn: string, signal: AbortSignal): Promise<Lookup> {
  const raw = await fetchJson(
    `https://api.nb.no/catalog/v1/items?q=isbn:${isbn}&filter=mediatype:b%C3%B8ker&size=1`,
    signal,
  )
  const parsed = nasjonalbiblioteket.safeParse(raw)
  const book = parsed.success ? parsed.data._embedded?.items[0]?.metadata : undefined
  if (!book?.title) return { kind: 'notFound' }
  // The main title, and each creator as "Given Surname"
  const title = book.title.split(' : ')[0] ?? ''
  const authors = (book.creators ?? []).map((c) => c.split(', ').reverse().join(' '))
  const name = bookName(title, authors)
  return name === '' ? { kind: 'notFound' } : { kind: 'found', name, source: 'Nasjonalbiblioteket' }
}

async function fromOpenLibrary(isbn: string, signal: AbortSignal): Promise<Lookup> {
  const raw = await fetchJson(
    `https://openlibrary.org/search.json?isbn=${isbn}&fields=title,author_name&limit=1`,
    signal,
  )
  const parsed = openLibrary.safeParse(raw)
  const book = parsed.success ? parsed.data.docs[0] : undefined
  if (!book?.title) return { kind: 'notFound' }
  const name = bookName(book.title, book.author_name ?? [])
  return name === '' ? { kind: 'notFound' } : { kind: 'found', name, source: 'Open Library' }
}

// One request: product_type=all makes the food host redirect to whichever of
// the four holds the code, so this call follows redirects. The CSP still
// limits where it may land.
async function fromFacts(code: string, signal: AbortSignal): Promise<Lookup> {
  const raw = await fetchJson(
    `https://world.openfoodfacts.org/api/v3/product/${code}?product_type=all&fields=product_name,brands,product_type`,
    signal,
    'follow',
  )
  const parsed = facts.safeParse(raw)
  if (!parsed.success || parsed.data.status !== 'success') return { kind: 'notFound' }
  const product = text(parsed.data.product?.product_name ?? '')
  // Brands come as a list; the first one the product name does not already say
  const brand = (parsed.data.product?.brands ?? '')
    .split(',')
    .map(text)
    .find((b) => b !== '' && !product.toLocaleLowerCase().includes(b.toLocaleLowerCase()))
  const name = text([brand, product].filter(Boolean).join(' '))
  const source = factsSources[parsed.data.product?.product_type ?? ''] ?? 'Open Food Facts'
  return name === '' ? { kind: 'notFound' } : { kind: 'found', name, source }
}

// Books to the two library catalogues, the Norwegian one first for a
// Norwegian ISBN (group 82); other retail codes to the Open Food Facts family.
// Serial numbers and QR content are never sent.
export async function lookup(code: string): Promise<Lookup> {
  const kind = classify(code)
  if (kind === 'other') return { kind: 'notFound' }
  if (!navigator.onLine) return { kind: 'offline' }
  const digits = digitsOf(code)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    if (kind !== 'isbn') return await fromFacts(digits, controller.signal)
    const norwegian = digits.startsWith('97882')
    const first = await (norwegian ? fromNasjonalbiblioteket : fromOpenLibrary)(digits, controller.signal)
    if (first.kind === 'found') return first
    return await (norwegian ? fromOpenLibrary : fromNasjonalbiblioteket)(digits, controller.signal)
  } catch {
    return navigator.onLine ? { kind: 'failed' } : { kind: 'offline' }
  } finally {
    clearTimeout(timer)
  }
}
