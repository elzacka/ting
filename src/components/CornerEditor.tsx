import { useEffect, useRef, useState, type PointerEvent } from 'react'
import type { Point, Quad } from '../lib/flatten'
import { t } from '../lib/strings'

type Props = {
  url: string
  width: number
  height: number
  quad: Quad
  onChange: (quad: Quad) => void
}

// The photo with the four corners the crop uses, each a handle to drag. A fold
// or a shadow can fool the edge finder; a finger cannot.
export function CornerEditor({ url, width, height, quad, onChange }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const dragging = useRef<number | null>(null)

  // Photo pixels per screen pixel, measured once laid out: handles stay 44 px on screen
  const [scale, setScale] = useState(1)
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const measure = () => {
      const w = svg.getBoundingClientRect().width
      if (w > 0) setScale(width / w)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(svg)
    return () => ro.disconnect()
  }, [width])

  function toPhoto(e: PointerEvent): Point {
    const box = svgRef.current?.getBoundingClientRect()
    if (!box) return { x: 0, y: 0 }
    const k = width / box.width
    return {
      x: Math.min(width, Math.max(0, (e.clientX - box.left) * k)),
      y: Math.min(height, Math.max(0, (e.clientY - box.top) * k)),
    }
  }

  function move(e: PointerEvent) {
    const i = dragging.current
    if (i === null) return
    const next = [...quad] as Quad
    next[i] = toPhoto(e)
    onChange(next)
  }

  // Arrow keys move a focused handle, for a keyboard or a switch
  function nudge(i: number, key: string) {
    const step = 10 * scale
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[key]
    if (!d) return false
    const p = quad[i]
    if (!p) return false
    const next = [...quad] as Quad
    next[i] = { x: Math.min(width, Math.max(0, p.x + (d[0] ?? 0))), y: Math.min(height, Math.max(0, p.y + (d[1] ?? 0))) }
    onChange(next)
    return true
  }

  const r = 22 * scale
  return (
    <svg
      ref={svgRef}
      className="corner-editor"
      viewBox={`0 0 ${width} ${height}`}
      onPointerMove={move}
      onPointerUp={() => (dragging.current = null)}
      onPointerCancel={() => (dragging.current = null)}
    >
      <image href={url} width={width} height={height} />
      <polygon className="corner-edge" points={quad.map((p) => `${p.x},${p.y}`).join(' ')} />
      {quad.map((p, i) => (
        <circle
          key={i}
          className="corner-handle"
          cx={p.x}
          cy={p.y}
          r={r}
          tabIndex={0}
          role="button"
          aria-label={t.receipt.corner(i + 1)}
          onPointerDown={(e) => {
            dragging.current = i
            e.currentTarget.setPointerCapture(e.pointerId)
          }}
          onKeyDown={(e) => {
            if (nudge(i, e.key)) e.preventDefault()
          }}
        />
      ))}
    </svg>
  )
}
