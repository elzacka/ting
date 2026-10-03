import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { asImage } from '../lib/backup'
import { t } from '../lib/strings'
import { Icon } from './Icons'
import { useObjectUrl } from './useObjectUrl'

type Action = { label: string; onSelect: () => void; danger?: boolean }

// A thumbnail that opens its choices under it: tap the photo, then say what to do with it
export function ThumbMenu({
  photo,
  count = 0,
  label,
  actions,
  large = false,
  children,
}: {
  photo: Blob | null
  count?: number
  label: string
  actions: readonly Action[]
  large?: boolean
  children?: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const id = useId()
  const url = useObjectUrl(photo)

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (e.target instanceof Node && !ref.current?.contains(e.target)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={ref} className={`thumb-menu${large ? ' thumb-menu-lg' : ''}`}>
      {children}
      <button
        type="button"
        className="thumb-pick"
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
      >
        {url ? <img src={url} alt="" /> : <Icon name="photoCamera" size={large ? 28 : 20} />}
        {count > 1 && <span className="thumb-count">{count}</span>}
      </button>
      {open && (
        <div id={id} className="col-menu-list thumb-menu-list">
          {actions.map((a) => (
            <button
              key={a.label}
              type="button"
              className={`col-menu-item${a.danger ? ' col-menu-danger' : ''}`}
              onClick={() => {
                setOpen(false)
                a.onSelect()
              }}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// A thing's photos as one thumbnail: the camera, the photo library, or clear them
export function PhotoPicker({
  photos,
  label,
  large,
  onAdd,
  onClear,
}: {
  photos: readonly Blob[]
  label: string
  large?: boolean
  onAdd: (added: Blob[]) => void
  onClear: () => void
}) {
  const cameraRef = useRef<HTMLInputElement>(null)
  const libraryRef = useRef<HTMLInputElement>(null)

  function add(input: HTMLInputElement) {
    const added = [...(input.files ?? [])].map(asImage).filter((b): b is Blob => b !== null)
    input.value = ''
    if (added.length > 0) onAdd(added)
  }

  const actions: Action[] = [
    { label: t.action.takePhoto, onSelect: () => cameraRef.current?.click() },
    { label: t.action.addPhoto, onSelect: () => libraryRef.current?.click() },
  ]
  if (photos.length > 0) {
    actions.push({ label: photos.length === 1 ? t.action.removePhoto : t.action.removePhotos, onSelect: onClear, danger: true })
  }

  return (
    <ThumbMenu photo={photos[0] ?? null} count={photos.length} label={label} actions={actions} large={large ?? false}>
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="visually-hidden"
        tabIndex={-1}
        onChange={(e) => add(e.target)}
      />
      <input
        ref={libraryRef}
        type="file"
        accept="image/*"
        multiple
        className="visually-hidden"
        tabIndex={-1}
        onChange={(e) => add(e.target)}
      />
    </ThumbMenu>
  )
}
