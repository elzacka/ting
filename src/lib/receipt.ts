export type ReceiptLine = { name: string; quantity: number; amount: number }
export type ReceiptRead = {
  storeName: string | null
  orgNr: string | null
  postcode: string | null
  terminal: string | null
  date: string | null
  lines: ReceiptLine[]
  total: number | null
  balanced: boolean
}

const round2 = (n: number) => Math.round(n * 100) / 100

const MONEY = '[-−–]?\\s?(?:\\d{1,3}(?:[ .\\u00a0]\\d{3})+|\\d+),\\d{2}'
const TAIL_MONEY = '[-−–]?\\s?(?:\\d{1,3}(?:\\.\\d{3})+|\\d+),\\d{2}'
const KR = '(?:kr\\.?|nok)'
const PURE_PRICE = new RegExp(`^(?:${KR}\\s*)?(${MONEY})\\s*${KR}?$`, 'i')
const TAIL_PRICE = new RegExp(`^(.*?)\\s+(?:${KR}\\s*)?(${TAIL_MONEY})\\s*${KR}?$`, 'i')
const TIMES = new RegExp(`^(\\d{1,3})\\s*[x×]\\s*(${MONEY})\\s*${KR}?$`, 'i')
const DOT_QTY = /^\d{1,3}\.\d{2}$/
const DATEISH = /(?<![\d.,])\d{1,2}[./]\d{1,2}[./]\d{2,4}|\d{4}-\d{2}-\d{2}|\d{1,2}\.?\s+[a-zæøå]{3,9}\.?\s+\d{4}/i
const TOTAL = /^(?:total\w*(?:\s+nok)?|sum|[åaàá]\s*betale)\b/i
const SUMMARY = /^(?:netto\w*|hvorav|mva|eks\.?\s*mva|grunnlag|avrunding|subtotal)\b/i
const COLUMN_HEADER = /^(?:artikkel|produkt)\b/i
const START_MARK = /^(?:\W*salgskvittering\b|\*{3,})/i
const SKIP_ITEM = /^(?:artikkel|produkt|antall|pris|bel[øoe0]p|mva|kasse|kasserer|bong|ordre)\b/i
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des']
const BRANDS = new Set(['IKEA', 'XXL', 'JYSK', 'ICA', 'H&M', 'NAF'])
const GENERIC = /^(?:interi[øoe0]r|outlet|as|asa|butikk|senter|avd\.?|avdeling|store|shop)$/i
const NOT_PLACE = /^(?:kasse|terminal|ordre|kvittering|bong|nr|bax|ref|butikk|id|avd|tlf|mva|org|dato|tid)$/i

type Num = { value: number; dot: boolean }

function parseMoney(s: string): number {
  const neg = /^\s*[-−–]/.test(s)
  const v = Number(s.replace(/[^\d,]/g, '').replace(',', '.'))
  return neg ? -v : v
}

// Trailing numeric segments become numbers, a VAT code after a price is dropped.
function splitLine(line: string): { text: string; nums: Num[] } {
  const segs = line.split(/\s{2,}/).map((s) => s.trim()).filter(Boolean)
  const numeric = (s: string) => PURE_PRICE.test(s) || DOT_QTY.test(s)
  const nums: Num[] = []
  let last = segs.length - 1
  if (last >= 1 && /^\d{1,2}$/.test(segs[last] ?? '') && numeric(segs[last - 1] ?? '')) last--
  for (; last >= 0; last--) {
    const s = segs[last] ?? ''
    const m = PURE_PRICE.exec(s)
    if (m?.[1]) nums.unshift({ value: parseMoney(m[1]), dot: false })
    else if (DOT_QTY.test(s)) nums.unshift({ value: Number(s), dot: true })
    else break
  }
  const text = segs.slice(0, last + 1)
  for (;;) {
    const t = TAIL_PRICE.exec(text[text.length - 1] ?? '')
    if (!t?.[2]) break
    nums.unshift({ value: parseMoney(t[2]), dot: false })
    text[text.length - 1] = t[1] ?? ''
  }
  return { text: text.join(' ').trim(), nums }
}

const lastPrice = (nums: readonly Num[]): number | null => nums.filter((n) => !n.dot).at(-1)?.value ?? null

const wholeQty = (v: number) => (Number.isInteger(v) && v >= 1 && v <= 999 ? v : 1)

function datesIn(line: string, todayIso: string): string[] {
  const found: { at: number; iso: string }[] = []
  const add = (at: number, y: number, m: number, d: number) => {
    const probe = new Date(Date.UTC(y, m - 1, d))
    if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) return
    const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    if (iso <= todayIso) found.push({ at, iso })
  }
  const year = (s: string) => (s.length === 2 ? 2000 + Number(s) : Number(s))
  for (const m of line.matchAll(/(?<![\d.,/])(\d{1,2})[./](\d{1,2})[./](\d{4}|\d{2})(?!\d|[.,]\d)/g)) {
    add(m.index, year(m[3] ?? ''), Number(m[2]), Number(m[1]))
  }
  for (const m of line.matchAll(/(?<!\d)(\d{4})-(\d{2})-(\d{2})(?!\d)/g)) {
    add(m.index, Number(m[1]), Number(m[2]), Number(m[3]))
  }
  for (const m of line.matchAll(/(?<!\d)(\d{1,2})\.?\s+([a-zæøå]{3,9})\.?\s+(\d{4})(?!\d)/gi)) {
    const month = MONTHS.indexOf((m[2] ?? '').toLowerCase().slice(0, 3)) + 1
    if (month > 0) add(m.index, Number(m[3]), month, Number(m[1]))
  }
  return found.sort((a, b) => a.at - b.at).map((f) => f.iso)
}

function findDate(lines: readonly string[], today: Date): string | null {
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const labelled = /dato|kj[øoe0]psdato/i
  for (let i = 0; i < lines.length; i++) {
    if (!labelled.test(lines[i] ?? '')) continue
    const hit = datesIn(`${lines[i]}  ${lines[i + 1] ?? ''}`, todayIso)[0]
    if (hit) return hit
  }
  for (const l of lines) {
    const hit = datesIn(l, todayIso)[0]
    if (hit) return hit
  }
  return null
}

function validOrgNr(d: string): boolean {
  const w = [3, 2, 7, 6, 5, 4, 3, 2]
  const sum = w.reduce((s, x, i) => s + x * Number(d[i]), 0)
  const check = (11 - (sum % 11)) % 11
  return check !== 10 && check === Number(d[8])
}

function orgNrIn(line: string): { orgNr: string; marked: boolean } | null {
  for (const m of line.matchAll(/(?<!\d)(N[O0]\s?)?(\d{3} ?\d{3} ?\d{3})(?!\d)/gi)) {
    const digits = (m[2] ?? '').replace(/ /g, '')
    if (validOrgNr(digits)) return { orgNr: digits, marked: Boolean(m[1]) || /mva|org/i.test(line) }
  }
  return null
}

function findOrgNr(lines: readonly string[]): { orgNr: string; at: number } | null {
  const hits = lines.flatMap((l, at) => {
    const h = orgNrIn(l)
    return h ? [{ ...h, at }] : []
  })
  return hits.find((h) => h.marked) ?? hits[0] ?? null
}

function findTerminal(lines: readonly string[]): string | null {
  for (let i = 0; i < lines.length; i++) {
    const m = /\bbax\s*:(.*)$/i.exec(lines[i] ?? '')
    if (!m) continue
    const hit = /\d{3,}/.exec(m[1] ?? '') ?? /\d{3,}/.exec(lines[i + 1] ?? '')
    if (hit) return hit[0]
  }
  return null
}

// Total lines may print 499.00; a thousands dot is followed by three digits and is left alone.
const commaDecimal = (l: string) => l.replace(/(\d)\.(\d{2})(?!\d)/g, '$1,$2')

function findTotal(lines: readonly string[]): { at: number; amount: number } | null {
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i] ?? ''
    if (!TOTAL.test(l)) continue
    const amount = lastPrice(splitLine(commaDecimal(l)).nums) ?? lastPrice(splitLine(commaDecimal(lines[i + 1] ?? '')).nums)
    if (amount !== null) return { at: i, amount }
  }
  return null
}

const CODE = /^(?=.*[A-Z])[A-Z0-9]{3,}$/
const isCodeRow = (p: { text: string; nums: Num[] }) => p.nums.length >= 2 && CODE.test(p.text)

type Draft = ReceiptLine & { open: boolean; code: boolean }

function readItems(rows: readonly string[]): ReceiptLine[] {
  const cleaned = rows.map((r) => r.replace(/\([^)]*\d,\d{2}[^)]*\)/g, '').trim())
  const items: Draft[] = []
  let pending = ''
  cleaned.forEach((line, i) => {
    if (!line) return
    const last = items.at(-1)
    const times = TIMES.exec(line)
    if (times) {
      if (last) {
        last.quantity = wholeQty(Number(times[1]))
        last.amount = round2(last.quantity * parseMoney(times[2] ?? ''))
      }
      return
    }
    const parsed = splitLine(line)
    const text = parsed.text.replace(/^art\.?\s*nr\.?\s*\d+\s*/i, '').trim()
    const amount = lastPrice(parsed.nums)
    if (amount === null) {
      if (!text || /^\d{6,}/.test(text) || SKIP_ITEM.test(text) || !/\p{L}/u.test(text)) return
      if (last?.open) {
        last.name = text
        last.open = false
      } else if (last?.code && !isCodeRow(splitLine(cleaned.slice(i + 1).find(Boolean) ?? ''))) {
        last.name = `${last.name} ${text}`
        last.code = false
      } else pending = text
      return
    }
    if (amount < 0) {
      if (last) last.amount = round2(last.amount + amount)
      return
    }
    const code = isCodeRow({ text, nums: parsed.nums })
    let name = code || !text ? pending || text : text
    let quantity = parsed.nums.length >= 3 || parsed.nums[0]?.dot ? wholeQty(parsed.nums[0]?.value ?? 1) : 1
    if (!code && parsed.nums.length < 3) {
      const lead = /^(\d{1,3})\s+(\D.*)$/.exec(name)
      if (lead) {
        quantity = wholeQty(Number(lead[1]))
        name = lead[2] ?? name
      }
    }
    items.push({ name, quantity, amount, open: !name, code })
    pending = ''
  })
  return items
    .filter((d) => !d.open && d.name)
    .map((d) => ({ name: d.name.replace(/\s+/g, ' ').trim(), quantity: d.quantity, amount: d.amount }))
}

function titleCase(word: string): string {
  const fix = (w: string) =>
    w.length > 1 && w === w.toUpperCase() && w !== w.toLowerCase() && !BRANDS.has(w)
      ? (w[0] ?? '') + w.slice(1).toLowerCase()
      : w
  return word.split('-').map(fix).join('-')
}

function placeCase(place: string): string {
  return place
    .trim()
    .split(/([\s-]+)/)
    .map((w) => (w.length ? w.charAt(0).toLocaleUpperCase('nb') + w.slice(1).toLocaleLowerCase('nb') : w))
    .join('')
}

function postcodeIn(line: string): { postcode: string; place: string } | null {
  const a = /(?:^|[\s,])(\d{4})[\s,]+(\p{Lu}[\p{L}\- ]{1,30})$/u.exec(line)
  const b = /^(\p{Lu}[\p{L}\- ]{1,30}?)[\s,]+(\d{4})$/u.exec(line)
  const postcode = a?.[1] ?? b?.[2]
  const place = (a?.[2] ?? b?.[1] ?? '').trim()
  const first = place.split(/\s+/)[0] ?? ''
  if (!postcode || postcode === '0000' || !place || NOT_PLACE.test(first)) return null
  return { postcode, place: placeCase(place) }
}

const NOISE = [
  /kvittering/i,
  /klubben|registrer deg|medlem|kundeklubb/i,
  /@|e-?post/i,
  /www\.|https?:|\.(?:no|com)\b/i,
  /\b(?:tlf|tel|telefon|mob|fax)\b|(?:^|\s)(?:\+47\s?)?\d{2}\s?\d{2}\s?\d{2}\s?\d{2}$/i,
  /\b(?:org\.?\s*nr|mva|org)\b/i,
  /^\p{L}[\p{L}.\- ]*\s\d{1,3}\s?[A-Za-z]?$/u,
]
const isNoise = (l: string) =>
  l.length > 40 || (l.match(/\p{L}/gu)?.length ?? 0) < 3 || NOISE.some((r) => r.test(l)) || orgNrIn(l) !== null || postcodeIn(l) !== null

function headerLines(lines: readonly string[], end: number): string[] {
  const out: string[] = []
  for (let i = 0; i < end; i++) {
    const l = lines[i] ?? ''
    if (!l) continue
    if (DATEISH.test(l) || orgNrIn(l)) break
    if (/kvittering/i.test(l)) {
      if (out.length) break
      continue
    }
    if (!isNoise(l)) out.push(l.split(/\s{2,}/).join(' '))
  }
  return out
}

function storeName(header: readonly string[], place: string | null): string | null {
  // A logo read as the bare brand: the printed line with brand and branch says more
  const lone = header[0]
  const fuller = lone && !/\s/.test(lone) ? header.find((l) => l.toLowerCase().startsWith(`${lone.toLowerCase()} `)) : undefined
  const first = fuller ?? lone
  if (!first) return null
  const key = first.toLowerCase()
  const line = header.find((c) => c.toLowerCase() === key && c !== c.toUpperCase()) ?? first
  const words = line.split(/\s+/).map((w) => (line === line.toUpperCase() ? titleCase(w) : w))
  const brand = words[0] ?? line
  const second = words[1]
  if (second && GENERIC.test(second)) return place ? `${brand} ${place}` : brand
  if (!second && place && place.toLowerCase() !== brand.toLowerCase()) return `${brand} ${place}`
  return words.join(' ')
}

function placeFor(postcode: { postcode: string; place: string } | null, header: readonly string[]): string | null {
  if (!postcode) return null
  const n = Number(postcode.postcode)
  if (n >= 1 && n <= 1299) {
    for (const l of header) {
      const m = /^(\p{L}+)\s+(?:senter|storsenter|st[øoe0]rsenter|torg|kj[øoe0]pesenter)\b/iu.exec(l)
      if (m?.[1]) return placeCase(m[1])
    }
  }
  return postcode.place
}

const EMPTY: ReceiptRead = {
  storeName: null,
  orgNr: null,
  postcode: null,
  terminal: null,
  date: null,
  lines: [],
  total: null,
  balanced: false,
}

export function parseReceipt(text: readonly string[], today: Date): ReceiptRead {
  try {
    const lines = text.map((s) => String(s ?? '').replace(/ /g, ' ').replace(/\t/g, '  ').trim())
    const total = findTotal(lines)
    const firstPrice = lines.findIndex((l) => lastPrice(splitLine(l).nums) !== null)
    const summaryAt = lines.findIndex((l, i) => i > firstPrice && firstPrice >= 0 && SUMMARY.test(l))
    const bound = Math.min(total?.at ?? lines.length, summaryAt >= 0 ? summaryAt : lines.length)
    const head = lines.slice(0, bound)
    const colHeader = head.findIndex((l) => COLUMN_HEADER.test(l))
    const priceAt = head.findIndex((l) => lastPrice(splitLine(l).nums) !== null)
    const headerEnd = colHeader >= 0 ? colHeader : priceAt >= 0 ? priceAt : bound
    const marks = head.flatMap((l, i) => (START_MARK.test(l) || DATEISH.test(l) || orgNrIn(l) ? [i] : []))
    const priceAfter = (i: number) => head.slice(i + 1).some((l) => lastPrice(splitLine(l).nums) !== null)
    const marker = [...marks].reverse().find(priceAfter) ?? marks.at(-1) ?? -1
    const start = colHeader >= 0 ? colHeader + 1 : marker + 1
    const pcLine = lines.slice(0, headerEnd).map(postcodeIn).find(Boolean) ?? null
    const header = headerLines(lines, headerEnd)
    const place = placeFor(pcLine, header)
    const items = readItems(lines.slice(start, bound))
    const sum = round2(items.reduce((s, x) => s + x.amount, 0))
    return {
      storeName: storeName(header, place),
      orgNr: findOrgNr(lines)?.orgNr ?? null,
      postcode: pcLine?.postcode ?? null,
      terminal: findTerminal(lines),
      date: findDate(lines, today),
      lines: items,
      total: total?.amount ?? null,
      balanced: items.length > 0 && total !== null && Math.abs(sum - total.amount) < 0.005,
    }
  } catch {
    return { ...EMPTY, lines: [] }
  }
}

export function storeKey(r: ReceiptRead): string | null {
  if (r.orgNr) return r.postcode ? `${r.orgNr}:${r.postcode}` : r.orgNr
  return r.terminal ? `bax:${r.terminal}` : null
}

export function splitAmount(amount: number, n: number): number[] {
  const count = Math.max(1, Math.floor(n))
  const ore = Math.round(Math.abs(amount) * 100)
  const base = Math.floor(ore / count)
  const extra = ore - base * count
  const sign = amount < 0 ? -1 : 1
  return Array.from({ length: count }, (_, i) => (sign * (base + (i < extra ? 1 : 0))) / 100)
}
