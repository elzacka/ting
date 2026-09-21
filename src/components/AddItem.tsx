import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { addItem } from '../db/db'
import { asImage } from '../lib/backup'
import type { Item, Property } from '../db/schema'
import { errorText } from '../lib/errors'
import { distinct } from '../lib/filter'
import { categoryColumnId, columnDefs, propColumns, type ColumnDef, type FieldSettings } from '../lib/fields'
import { columnId, inputFrom } from '../lib/grid'
import { t } from '../lib/strings'
import { Icon } from './Icons'
import { useObjectUrl } from './useObjectUrl'

type Props = {
  items: Item[]
  properties: Property[]
  fields: FieldSettings
  onDirtyChange: (dirty: boolean) => void
}

type ChoiceDef = Extract<ColumnDef, { kind: 'prop' }>

// Column ids are JSON; encoded they are safe as element ids
function domId(prefix: string, id: string): string {
  return `${prefix}-${encodeURIComponent(id)}`
}

// One thing at a time, for a phone with the thing in hand: the photo, the name
// and the Valgliste columns, which say what it is and where it goes. Prices
// and the rest are desk work in the table. The Valgliste values stay for the
// next thing, so the second thing on the same shelf is a photo and a name.
export function AddItem({ items, properties, fields, onDirtyChange }: Props) {
  const defs = useMemo(() => columnDefs(fields, properties, items), [fields, properties, items])
  const choices = useMemo(
    () => defs.filter((d): d is ChoiceDef => d.kind === 'prop' && d.type === 'choice'),
    [defs],
  )
  const nameLabel = fields.name.label ?? t.table.name
  const [name, setName] = useState('')
  // The first thing starts with the Kategori of the newest thing, like a new row in the table
  const [cells, setCells] = useState<Record<string, string>>(() => {
    const newest = items.reduce<Item | null>((a, i) => (a === null || i.createdAt > a.createdAt ? i : a), null)
    const spec = newest?.specs.find((s) => columnId({ key: s.key, unit: s.unit }) === categoryColumnId)
    return spec ? { [categoryColumnId]: String(spec.value) } : {}
  })
  const [photo, setPhoto] = useState<Blob | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const url = useObjectUrl(photo)

  const dirty = name.trim() !== '' || photo !== null
  useEffect(() => {
    onDirtyChange(dirty)
  }, [dirty, onDirtyChange])
  useEffect(() => () => onDirtyChange(false), [onDirtyChange])

  function valuesFor(def: ChoiceDef): string[] {
    return [
      ...new Set([
        ...(def.property?.options ?? []),
        ...distinct(items, (i) => {
          const spec = i.specs.find((x) => columnId({ key: x.key, unit: x.unit }) === def.id)
          return spec ? String(spec.value) : ''
        }),
      ]),
    ]
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSaved(null)
    if (name.trim() === '') {
      setError(t.add.missingName)
      return
    }
    setSaving(true)
    try {
      await addItem(inputFrom({ name, cells, photo }, propColumns(defs)))
      setSaved(name.trim())
      setName('')
      setPhoto(null)
      if (fileRef.current) fileRef.current.value = ''
    } catch (err) {
      console.error(errorText(err))
      setError(t.error.saveFailed)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="stack narrow" onSubmit={(e) => void save(e)}>
      <h1 className="title">{t.add.title}</h1>
      {url && <img className="photo" src={url} alt={t.add.photoAlt} />}
      <div className="row">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="visually-hidden"
          onChange={(e) => setPhoto(asImage(e.target.files?.[0]))}
        />
        <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
          <Icon name="photoCamera" size={20} />
          {photo ? t.action.retakePhoto : t.action.takePhoto}
        </button>
      </div>
      <div className="field">
        <label htmlFor="add-name">{nameLabel}</label>
        <input
          id="add-name"
          className="input"
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            setError(null)
          }}
        />
      </div>
      {choices.map((def) => (
        <div key={def.id} className="field">
          <label htmlFor={domId('add', def.id)}>{def.col.key}</label>
          <input
            id={domId('add', def.id)}
            className="input"
            list={domId('add-list', def.id)}
            value={cells[def.id] ?? ''}
            onChange={(e) => setCells((prev) => ({ ...prev, [def.id]: e.target.value }))}
          />
          <datalist id={domId('add-list', def.id)}>
            {valuesFor(def).map((v) => (
              <option key={v} value={v} />
            ))}
          </datalist>
        </div>
      ))}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="row">
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {t.action.save}
        </button>
        <span className="hint" aria-live="polite">
          {saved !== null && t.add.saved(saved)}
        </span>
      </div>
    </form>
  )
}
