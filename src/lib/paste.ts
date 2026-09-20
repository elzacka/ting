// A block copied from a spreadsheet arrives as lines separated by newlines and
// cells separated by tabs. One cell with neither is an ordinary paste and is
// left to the input; anything else fills right and down from the cell it lands in.
export function parseBlock(text: string): string[][] | null {
  if (!/[\t\r\n]/.test(text)) return null
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  if (lines[lines.length - 1] === '') lines.pop()
  const rows = lines.map((line) => line.split('\t').map((cell) => cell.trim()))
  return rows.length === 1 && rows[0]?.length === 1 ? null : rows
}

// http(s) links in free text, for rendering as links. Everything else stays text.
const urlRe = /https?:\/\/[^\s<>"'«»]+/g

export function splitLinks(text: string): { text: string; href: string | null }[] {
  const out: { text: string; href: string | null }[] = []
  let last = 0
  for (const m of text.matchAll(urlRe)) {
    const at = m.index ?? 0
    if (at > last) out.push({ text: text.slice(last, at), href: null })
    // A trailing full stop or comma belongs to the sentence, not the link
    const raw = m[0].replace(/[.,;:)]+$/, '')
    out.push({ text: raw, href: raw })
    last = at + raw.length
  }
  if (last < text.length) out.push({ text: text.slice(last), href: null })
  return out
}
