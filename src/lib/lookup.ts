import { z } from 'zod'
import { classify, digitsOf } from './barcode'

// The one place the app talks to the network, and only when the user presses
// "Slå opp på nett": the digits of an ISBN go to a library catalogue and a
// title comes back for the user to review. Nothing else leaves the device: no
// cookies, no referrer, no key, no cache. Other codes are only stored: the
// open catalogue for goods other than food is small, and the large ones need
// a key the app has no server to keep. The hosts used here are the whole
// connect-src list in vite.config.ts; change both together.

export type Source = 'Nasjonalbiblioteket' | 'Open Library'

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

// An ISBN to the two library catalogues, the Norwegian one first for a
// Norwegian ISBN (group 82). Other codes, serial numbers and QR content are
// never sent.
export async function lookup(code: string): Promise<Lookup> {
  if (classify(code) !== 'isbn') return { kind: 'notFound' }
  if (!navigator.onLine) return { kind: 'offline' }
  const digits = digitsOf(code)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
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
