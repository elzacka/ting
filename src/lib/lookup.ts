import { z } from 'zod'
import { isbn13Of, languageName, surnameFirst, yearOf, type Book } from './books'

// The app's one network call: an ISBN's digits to a library catalogue, nothing else, no
// cookies or referrer. Other codes are only stored, since the large catalogues need a key the
// app has no server to keep. These hosts are the whole connect-src in vite.config.ts.

export type Source = 'Nasjonalbiblioteket' | 'Open Library'

export type Lookup =
  | { kind: 'found'; book: Book; source: Source }
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

// Nasjonalbiblioteket's catalogue: every book published in Norway, by legal
// deposit. Titles come as "main : subtitle", creators as "Surname, Given",
// languages as MARC codes, the year in originInfo.issued.
const nasjonalbiblioteket = z.object({
  _embedded: z
    .object({
      items: z.array(
        z.object({
          metadata: z.object({
            title: z.string().optional(),
            creators: z.array(z.string()).optional(),
            languages: z.array(z.object({ code: z.string() })).optional(),
            originInfo: z.object({ issued: z.string().optional() }).optional(),
          }),
        }),
      ),
    })
    .optional(),
})

// Open Library's edition by ISBN, in one request without a redirect. Its
// search endpoint answers with the work, so a translation came back under
// the original's title; this one is the edition on the shelf.
const openLibrary = z.record(
  z.string(),
  z.object({
    details: z.object({
      title: z.string().optional(),
      authors: z.array(z.object({ name: z.string() })).optional(),
      publish_date: z.string().optional(),
      languages: z.array(z.object({ key: z.string() })).optional(),
    }),
  }),
)

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

function found(book: Book, source: Source): Lookup {
  const title = text(book.title)
  if (title === '') return { kind: 'notFound' }
  const authors = [...new Set(book.authors.map(text).filter(Boolean))]
  return { kind: 'found', book: { ...book, title, authors }, source }
}

async function fromNasjonalbiblioteket(isbn: string, signal: AbortSignal): Promise<Lookup> {
  const raw = await fetchJson(
    `https://api.nb.no/catalog/v1/items?q=isbn:${isbn}&filter=mediatype:b%C3%B8ker&size=1`,
    signal,
  )
  const parsed = nasjonalbiblioteket.safeParse(raw)
  const book = parsed.success ? parsed.data._embedded?.items[0]?.metadata : undefined
  if (!book?.title) return { kind: 'notFound' }
  return found(
    {
      title: book.title.split(' : ')[0] ?? '',
      authors: (book.creators ?? []).map(surnameFirst),
      year: yearOf(book.originInfo?.issued),
      language: languageName(book.languages?.[0]?.code),
    },
    'Nasjonalbiblioteket',
  )
}

async function fromOpenLibrary(isbn: string, signal: AbortSignal): Promise<Lookup> {
  const raw = await fetchJson(`https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=details`, signal)
  const parsed = openLibrary.safeParse(raw)
  const book = parsed.success ? parsed.data[`ISBN:${isbn}`]?.details : undefined
  if (!book?.title) return { kind: 'notFound' }
  return found(
    {
      title: book.title,
      authors: (book.authors ?? []).map((a) => surnameFirst(a.name)),
      year: yearOf(book.publish_date),
      language: languageName(book.languages?.[0]?.key.split('/').pop()),
    },
    'Open Library',
  )
}

// An ISBN to the two library catalogues, the Norwegian one first for a
// Norwegian ISBN (group 82). Other codes, serial numbers and QR content are
// never sent.
export async function lookup(code: string): Promise<Lookup> {
  const digits = isbn13Of(code)
  if (digits === null) return { kind: 'notFound' }
  if (!navigator.onLine) return { kind: 'offline' }
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
