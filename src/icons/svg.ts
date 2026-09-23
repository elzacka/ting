// Reads the drawing out of an icon file: its viewBox and the d of every path.
// Nothing else is kept, so an icon is drawn by the app's own <svg> in the text
// colour, never inserted as markup. A file without a viewBox (or width and
// height to make one from) or without a path is not an icon here.
export type SvgShape = { viewBox: string; paths: readonly string[] }

export function parseSvg(raw: string): SvgShape | null {
  const open = raw.match(/<svg\b[^>]*>/i)?.[0]
  if (!open) return null
  let viewBox = open.match(/\bviewBox\s*=\s*["']([^"']+)["']/i)?.[1]?.trim()
  if (!viewBox) {
    const w = open.match(/\bwidth\s*=\s*["'](\d+(?:\.\d+)?)(?:px)?["']/i)?.[1]
    const h = open.match(/\bheight\s*=\s*["'](\d+(?:\.\d+)?)(?:px)?["']/i)?.[1]
    if (!w || !h) return null
    viewBox = `0 0 ${w} ${h}`
  }
  if (!/^-?[\d.]+([\s,]+-?[\d.]+){3}$/.test(viewBox)) return null
  const paths = [...raw.matchAll(/<path\b[^>]*?\sd\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1] ?? '').filter(Boolean)
  return paths.length > 0 ? { viewBox, paths } : null
}
