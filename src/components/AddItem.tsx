import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { addItem, addProperty } from '../db/db'
import { asImage } from '../lib/backup'
import { classify, cleanCode, decodeImage, digitsOf } from '../lib/barcode'
import type { Item, Property } from '../db/schema'
import { isBookCategory } from '../lib/categoryIcons'
import { errorText } from '../lib/errors'
import {
  barcodeColumnId,
  barcodeKey,
  barcodeProperty,
  categoryColumnId,
  choiceDefs,
  columnDefs,
  propColumns,
  type FieldSettings,
} from '../lib/fields'
import { columnId, inputFrom } from '../lib/grid'
import { lookup } from '../lib/lookup'
import { t } from '../lib/strings'
import { ChoiceFields, firstCells } from './ChoiceFields'
import { Icon } from './Icons'
import { PhotoStrip } from './PhotoStrip'
import { PhotoPicker } from './ThumbMenu'

type Props = {
  items: Item[]
  properties: Property[]
  fields: FieldSettings
  onDirtyChange: (dirty: boolean) => void
}

// One thing at a time, for a phone with the thing in hand: photos, name, the choice and path
// columns (what it is, where it goes), then the barcode. Prices and the rest are desk work.
// Choice values stay for the next thing, so a second thing on the shelf is a photo and a name.
export function AddItem({ items, properties, fields, onDirtyChange }: Props) {
  const defs = useMemo(() => columnDefs(fields, properties, items), [fields, properties, items])
  const nameLabel = fields.name.label ?? t.table.name
  const [name, setName] = useState('')
  const [cells, setCells] = useState<Record<string, string>>(() => firstCells(items))
  const category = cells[categoryColumnId]?.trim() ?? ''
  const choices = useMemo(() => choiceDefs(defs, category), [defs, category])
  const [photos, setPhotos] = useState<Blob[]>([])
  const [saved, setSaved] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  // The barcode, serial number or QR code: scanned from a photo of the label or typed. Only an
  // ISBN in a book category can be looked up, since an open catalogue holds books. A line under
  // the field shows the last scan or lookup; in a book category it says the lookup is there.
  const books = isBookCategory(category, properties.find((p) => p.id === categoryColumnId)?.icons)
  const [code, setCode] = useState('')
  const [codeNote, setCodeNote] = useState<string | null>(null)
  const [busy, setBusy] = useState<'scan' | 'lookup' | null>(null)
  const scanRef = useRef<HTMLInputElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  // What the field says now, for a read of a photo that finishes after the user typed a code
  const typed = useRef('')
  typed.current = code

  const dirty = name.trim() !== '' || photos.length > 0 || code !== ''
  useEffect(() => {
    onDirtyChange(dirty)
  }, [dirty, onDirtyChange])
  useEffect(() => () => onDirtyChange(false), [onDirtyChange])

  // The first code found in the pictures fills Strekkode, unless a code was typed meanwhile.
  // The line under the field says it was read; nothing found says so only for a scan.
  async function readCode(images: Blob[], scanned: boolean) {
    setBusy('scan')
    setCodeNote(null)
    try {
      for (const image of images) {
        const found = await decodeImage(image)
        if (!found) continue
        if (!scanned && typed.current !== '') return
        setCode(found.value)
        setCodeNote(t.barcode.read(classify(found.value) === 'isbn' ? 'ISBN' : found.format))
        return
      }
      if (scanned) setCodeNote(t.barcode.none)
    } catch (err) {
      console.error(errorText(err))
      if (scanned) setCodeNote(t.barcode.none)
    } finally {
      setBusy(null)
    }
  }

  // Skann strekkode: the camera straight away, and the picture is only read,
  // never kept as a photo of the thing
  function scan(file: File | undefined) {
    if (scanRef.current) scanRef.current.value = ''
    const image = asImage(file)
    if (image) void readCode([image], true)
  }

  // A photo of the label is read too, so the label is not photographed twice
  function addPhotos(added: Blob[]) {
    setPhotos((p) => [...p, ...added])
    if (code === '' && busy === null) void readCode(added, false)
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
      // The name is at the top of the form: bring it into view to be checked
      nameRef.current?.focus({ preventScroll: true })
      nameRef.current?.scrollIntoView({ block: 'center' })
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
      // Only the fields on screen: a value kept from a thing in another category waits for the next one
      const shown = Object.fromEntries(choices.map((d) => [d.id, cells[d.id] ?? '']))
      await addItem(inputFrom({ name, cells: { ...shown, [barcodeColumnId]: stored }, photos }, columns))
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
      {/* The thing and its name side by side; the thumbnail adds the thing, then its label */}
      <div className="add-head">
        <PhotoPicker
          photos={photos}
          label={t.add.photos(name.trim() === '' ? t.add.thing : name.trim(), photos.length)}
          large
          onAdd={addPhotos}
          onClear={() => setPhotos([])}
        />
        <div className="field">
          <label htmlFor="add-name">{nameLabel}</label>
          <input
            ref={nameRef}
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
      </div>
      <PhotoStrip
        photos={photos}
        name={name.trim() === '' ? t.add.title : name}
        onFirst={(i) => setPhotos((p) => [p[i] as Blob, ...p.filter((_, n) => n !== i)])}
        onRemove={(i) => setPhotos((p) => p.filter((_, n) => n !== i))}
      />
      <ChoiceFields
        items={items}
        choices={choices}
        cells={cells}
        prefix="add"
        onChange={(id, v) => setCells((prev) => ({ ...prev, [id]: v }))}
      />
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
            onChange={(e) => scan(e.target.files?.[0])}
          />
          <button
            type="button"
            className="btn btn-icon"
            aria-label={t.barcode.scan}
            disabled={busy !== null}
            onClick={() => scanRef.current?.click()}
          >
            <Icon name="barcodeScanner" />
          </button>
          {books && classify(code) === 'isbn' && (
            <button type="button" className="btn" disabled={busy !== null} onClick={() => void lookUp()}>
              {busy === 'lookup' ? t.barcode.looking : t.barcode.lookup}
            </button>
          )}
        </div>
        <p className="hint" aria-live="polite">
          {busy === 'scan' ? t.barcode.scanning : codeNote ?? (books && classify(code) !== 'isbn' ? t.barcode.bookHint : '')}
        </p>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="row form-bar">
        {/* Not while a code is read or looked up: the answer would land on the next thing */}
        <button type="submit" className="btn btn-primary" disabled={saving || busy !== null}>
          {t.action.save}
        </button>
        <span className="hint" aria-live="polite">
          {saved !== null && t.add.saved(saved)}
        </span>
      </div>
    </form>
  )
}
