import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { addItem, addProperty } from '../db/db'
import { asImage } from '../lib/backup'
import { classify, cleanCode, decodeImage, digitsOf } from '../lib/barcode'
import type { Item, Property } from '../db/schema'
import { isBookCategory } from '../lib/categoryIcons'
import { errorText } from '../lib/errors'
import { recentValues } from '../lib/filter'
import {
  appliesTo,
  barcodeColumnId,
  barcodeKey,
  barcodeProperty,
  categoryColumnId,
  columnDefs,
  propColumns,
  type ColumnDef,
  type FieldSettings,
} from '../lib/fields'
import { columnId, inputFrom } from '../lib/grid'
import { pathsInUse } from '../lib/paths'
import { lookup } from '../lib/lookup'
import { t } from '../lib/strings'
import { Icon } from './Icons'
import { useObjectUrl } from './useObjectUrl'
import { PhotoStrip } from './PhotoStrip'
import { ValuePicker } from './ValuePicker'

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

// One thing at a time, for a phone with the thing in hand: the photos, the
// name and the Valgliste and place columns, which say what it is and where it
// goes, then the barcode, which few things need. Prices and the rest are desk
// work in the table. The Valgliste values stay for the next thing, so the
// second thing on the same shelf is a photo and a name.
export function AddItem({ items, properties, fields, onDirtyChange }: Props) {
  const defs = useMemo(() => columnDefs(fields, properties, items), [fields, properties, items])
  const nameLabel = fields.name.label ?? t.table.name
  const [name, setName] = useState('')
  // The first thing starts with the Kategori of the newest thing, like a new row in the table
  const [cells, setCells] = useState<Record<string, string>>(() => {
    const newest = items.reduce<Item | null>((a, i) => (a === null || i.createdAt > a.createdAt ? i : a), null)
    const spec = newest?.specs.find((s) => columnId({ key: s.key, unit: s.unit }) === categoryColumnId)
    return spec ? { [categoryColumnId]: String(spec.value) } : {}
  })
  // Kategori comes first and decides the rest: once it says Bok the form asks
  // what a book needs, not what a sleeping bag needs.
  const category = cells[categoryColumnId]?.trim() ?? ''
  const choices = useMemo(
    () =>
      defs.filter(
        (d): d is ChoiceDef =>
          d.kind === 'prop' &&
          (d.type === 'choice' || d.type === 'path') &&
          appliesTo(d.property, category === '' ? [] : [category]),
      ),
    [defs, category],
  )
  const [photos, setPhotos] = useState<Blob[]>([])
  const [saved, setSaved] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const url = useObjectUrl(photos[0] ?? null)
  // The barcode, serial number or QR code: scanned from a photo of the label
  // or typed from it. Only an ISBN in a book category can be looked up, since
  // books are what an open catalogue holds. What the last scan or lookup said
  // is one line under the field; in a book category, until there is an ISBN
  // to look up, that line says the lookup is there.
  const books = isBookCategory(category, properties.find((p) => p.id === categoryColumnId)?.icons)
  const [code, setCode] = useState('')
  const [codeNote, setCodeNote] = useState<string | null>(null)
  const [busy, setBusy] = useState<'scan' | 'lookup' | null>(null)
  const scanRef = useRef<HTMLInputElement>(null)

  const dirty = name.trim() !== '' || photos.length > 0 || code !== ''
  useEffect(() => {
    onDirtyChange(dirty)
  }, [dirty, onDirtyChange])
  useEffect(() => () => onDirtyChange(false), [onDirtyChange])

  function valuesFor(def: ChoiceDef): string[] {
    const value = (i: Item) => {
      const spec = i.specs.find((x) => columnId({ key: x.key, unit: x.unit }) === def.id)
      return spec ? String(spec.value) : ''
    }
    // A place offers the way in as well as the places themselves
    if (def.type === 'path') return pathsInUse(items.map(value))
    return recentValues(items, value, def.property?.options ?? [])
  }

  // The camera or the photo library, as the phone offers
  function addPhotos(files: FileList | null) {
    const added = [...(files ?? [])].map(asImage).filter((b): b is Blob => b !== null)
    if (fileRef.current) fileRef.current.value = ''
    if (added.length > 0) setPhotos((p) => [...p, ...added])
  }

  // Skann strekkode: the camera straight away, and the picture is only read,
  // never kept as a photo of the thing
  async function scan(file: File | undefined) {
    if (scanRef.current) scanRef.current.value = ''
    const image = asImage(file)
    if (!image) return
    setBusy('scan')
    setCodeNote(null)
    try {
      const found = await decodeImage(image)
      if (found) {
        setCode(found.value)
        setCodeNote(t.barcode.read(classify(found.value) === 'isbn' ? 'ISBN' : found.format))
      } else {
        setCodeNote(t.barcode.none)
      }
    } catch (err) {
      console.error(errorText(err))
      setCodeNote(t.barcode.none)
    } finally {
      setBusy(null)
    }
  }

  // The one network call in the app, on this button alone
  async function lookUp() {
    setBusy('lookup')
    setCodeNote(null)
    const result = await lookup(code)
    setBusy(null)
    if (result.kind === 'found') {
      setName(result.name)
      setCodeNote(t.barcode.found(result.source))
    } else {
      setCodeNote(t.barcode[result.kind])
    }
  }

  // Enter moves to the next field, as Neste on a phone's keyboard says; on
  // the last field it saves
  function nextOnEnter(e: KeyboardEvent<HTMLFormElement>) {
    if (e.key !== 'Enter' || !(e.target instanceof HTMLInputElement)) return
    const inputs = [...e.currentTarget.querySelectorAll<HTMLInputElement>('input.input')]
    const i = inputs.indexOf(e.target)
    if (i < 0 || i === inputs.length - 1) return
    e.preventDefault()
    inputs[i + 1]?.focus()
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
      // The Strekkode column exists from the first code on; until then it is
      // not among the columns and the value would be dropped
      let columns = propColumns(defs)
      if (code !== '') {
        if (!properties.some((p) => p.id === barcodeColumnId)) await addProperty(barcodeProperty())
        if (!columns.some((c) => columnId(c) === barcodeColumnId)) columns = [...columns, { key: barcodeKey, unit: null }]
      }
      // A retail code is stored as the scanner reads it: digits only
      const stored = classify(code) === 'other' ? code : digitsOf(code)
      await addItem(inputFrom({ name, cells: { ...cells, [barcodeColumnId]: stored }, photos }, columns))
      setSaved(name.trim())
      setName('')
      setPhotos([])
      setCode('')
      setCodeNote(null)
    } catch (err) {
      console.error(errorText(err))
      setError(t.error.saveFailed)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="stack narrow" onSubmit={(e) => void save(e)} onKeyDown={nextOnEnter}>
      <h1 className="title">{t.add.title}</h1>
      {url && <img className="photo" src={url} alt={t.add.photoAlt} />}
      {/* The thing, then its label: each photo is added the same way */}
      <PhotoStrip
        photos={photos}
        name={name.trim() === '' ? t.add.title : name}
        onFirst={(i) => setPhotos((p) => [p[i] as Blob, ...p.filter((_, n) => n !== i)])}
        onRemove={(i) => setPhotos((p) => p.filter((_, n) => n !== i))}
      />
      <div className="row">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="visually-hidden"
          onChange={(e) => addPhotos(e.target.files)}
        />
        <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
          <Icon name="photoCamera" size={20} />
          {photos.length === 0 ? t.action.choosePhoto : t.action.addPhoto}
        </button>
      </div>
      <div className="field">
        <label htmlFor="add-name">{nameLabel}</label>
        <input
          id="add-name"
          className="input"
          enterKeyHint="next"
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
          <ValuePicker
            id={domId('add', def.id)}
            label={def.col.key}
            kind={def.type === 'path' ? 'path' : 'choice'}
            values={valuesFor(def)}
            value={cells[def.id] ?? ''}
            onChange={(v) => setCells((prev) => ({ ...prev, [def.id]: v }))}
            enterKeyHint="next"
          />
        </div>
      ))}
      <div className="field">
        <label htmlFor="add-code">{t.barcode.label}</label>
        <div className="row toolbar">
          <input
            id="add-code"
            className="input input-code"
            inputMode="text"
            enterKeyHint="done"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            value={code}
            onChange={(e) => {
              setCode(cleanCode(e.target.value))
              setCodeNote(null)
            }}
          />
          <input
            ref={scanRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="visually-hidden"
            onChange={(e) => void scan(e.target.files?.[0])}
          />
          <button type="button" className="btn" disabled={busy !== null} onClick={() => scanRef.current?.click()}>
            <Icon name="photoCamera" size={20} />
            {busy === 'scan' ? t.barcode.scanning : t.barcode.scan}
          </button>
          {books && classify(code) === 'isbn' && (
            <button type="button" className="btn" disabled={busy !== null} onClick={() => void lookUp()}>
              {busy === 'lookup' ? t.barcode.looking : t.barcode.lookup}
            </button>
          )}
        </div>
        <p className="hint" aria-live="polite">
          {codeNote ?? (books && classify(code) !== 'isbn' ? t.barcode.bookHint : '')}
        </p>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="row form-bar">
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
