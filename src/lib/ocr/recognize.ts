import type { Rect } from './detect'

export const recHeight = 48
const baseRatio = 320 / recHeight
const batchSize = 6
// The output holds every class at every step: wide lines go fewer at a time, so a batch stays near 18 MB
const batchPixels = batchSize * baseRatio * recHeight
const maxRatio = 64
const minScore = 0.5

export type Read = { text: string; score: number; box: Rect }

// chars: 0 is the CTC blank, then the dictionary, then a space; classes: the ones a receipt can hold.
export type Dict = { chars: string[]; classes: number[] }

// The model also reads Chinese and Japanese; on a Norwegian receipt such a read is a smudge or masked digits.
function latin(c: string): boolean {
  const p = c.codePointAt(0) ?? 0
  return p <= 0x24f || (p >= 0x2000 && p <= 0x20cf) || p === 0x2212
}

export function parseDict(text: string): Dict {
  const lines = text.split('\n').map((l) => l.replace(/\r$/, ''))
  if (lines[lines.length - 1] === '') lines.pop()
  const chars = ['', ...lines, ' ']
  return { chars, classes: chars.flatMap((c, i) => (i === 0 || latin(c) ? [i] : [])) }
}

// Greedy CTC over the allowed classes: best class per step, repeats merged, blanks dropped.
export function ctcDecode(probs: Float32Array, steps: number, classes: number, dict: Dict): { text: string; score: number } {
  let text = ''
  let sum = 0
  let n = 0
  let prev = -1
  for (let t = 0; t < steps; t++) {
    let best = 0
    let bestP = -Infinity
    for (const c of dict.classes) {
      const p = probs[t * classes + c] as number
      if (p > bestP) {
        bestP = p
        best = c
      }
    }
    if (best !== 0 && best !== prev) {
      text += dict.chars[best] ?? ''
      sum += bestP
      n++
    }
    prev = best
  }
  return { text, score: n === 0 ? 0 : sum / n }
}

export function cropRatio(b: Rect): number {
  return Math.min(maxRatio, b.w / b.h)
}

// Boxes of similar width go together, so a batch pads little; indices keep the original order.
export function batchesByWidth(boxes: Rect[]): number[][] {
  const order = boxes.map((_, i) => i).sort((a, b) => cropRatio(boxes[a] as Rect) - cropRatio(boxes[b] as Rect))
  const out: number[][] = []
  let cur: number[] = []
  for (const i of order) {
    const width = batchWidth([cropRatio(boxes[i] as Rect)])
    if (cur.length === batchSize || (cur.length > 0 && (cur.length + 1) * width > batchPixels)) {
      out.push(cur)
      cur = []
    }
    cur.push(i)
  }
  if (cur.length) out.push(cur)
  return out
}

export function batchWidth(ratios: number[]): number {
  return Math.floor(recHeight * Math.max(baseRatio, ...ratios))
}

export function keepReads(reads: Read[]): Read[] {
  return reads.filter((r) => r.text.trim() !== '' && r.score >= minScore)
}

function median(v: number[]): number {
  const s = [...v].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)] ?? 0
}

// How far b's centre lies off the text line through a, in pixels.
function offLine(a: Rect, b: Rect): number {
  const angle = (a.angle + b.angle) / 2
  return Math.abs((b.cy - a.cy) * Math.cos(angle) - (b.cx - a.cx) * Math.sin(angle))
}

function sameLine(line: Read[], r: Read): number {
  let best = Infinity
  for (const o of line) {
    const off = offLine(o.box, r.box)
    if (off < 0.5 * Math.min(o.box.h, r.box.h)) best = Math.min(best, off)
  }
  return best
}

// Reads that share a visual line: top to bottom, left to right, two spaces
// between segments. Lines lean and bend across a photographed receipt, so a
// read joins the line it sits on at its own angle, not a horizontal band.
export function groupLines(reads: Read[]): string[] {
  const slope = Math.tan(median(reads.map((r) => r.box.angle)))
  const key = (r: Read) => r.box.cy - r.box.cx * slope
  const lines: Read[][] = []
  for (const r of [...reads].sort((a, b) => key(a) - key(b))) {
    let target: Read[] | undefined
    let best = Infinity
    for (const line of lines) {
      const off = sameLine(line, r)
      if (off < best) {
        best = off
        target = line
      }
    }
    if (target) target.push(r)
    else lines.push([r])
  }
  const lineKey = (l: Read[]) => l.reduce((s, r) => s + key(r), 0) / l.length
  return lines
    .sort((a, b) => lineKey(a) - lineKey(b))
    .map((l) =>
      l
        .sort((a, b) => a.box.cx - b.box.cx)
        .map((r) => r.text.trim())
        .join('  '),
    )
}
