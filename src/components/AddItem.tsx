import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { addItem, addProperty } from '../db/db'
import { asImage } from '../lib/backup'
import { classify, cleanCode, decodeImage, digitsOf } from '../lib/barcode'
import type { Item, Property } from '../db/schema'
import { bookCells, bookColumns, isbn13Of } from '../lib/books'
import { codeKey, knownCells, sameCode } from '../lib/known'
import { isBookCategory } from '../lib/categoryIcons'
import { errorText } from '../lib/errors'
import {
  barcodeColumnId,
  barcodeKey,
  barcodeProperty,
  categoryColumnId,
  categoryFields,
  columnDefs,
  propColumns,
  type ChoiceDef,
  type FieldSettings,
} from '../lib/fields'
import { parseDateInput } from '../lib/dates'
import { parseNumber } from '../lib/values'
import { columnId, inputFrom } from '../lib/grid'
import { lookup } from '../lib/lookup'
import { t } from '../lib/strings'
import { ChoiceFields, domId, firstCells } from './ChoiceFields'
import { Icon } from './Icons'
import { PhotoStrip } from './PhotoStrip'
import { PhotoPicker } from './ThumbMenu'

type Props = {
  items: Item[]
  properties: Property[]
  fields: FieldSettings
  onDirtyChange: (dirty: boolean) => void
}

// One thing at a time, phone in hand: Kategori first, since it decides which fields follow (the
// same ones as on a thing's page); the code right under it, so a scan fills the rest. Lists,
// places and dates stay for the next thing, as on a new row in the table.
export function AddItem({ items, properties, fields, onDirtyChange }: Props) {
  const defs = useMemo(() => columnDefs(fields, properties, items), [fields, properties, items])
  const nameLabel = fields.name.label ?? t.table.name
  const [name, setName] = useState('')
  const [cells, setCells] = useState<Record<string, string>>(() => firstCells(items))
  const category = cells[categoryColumnId]?.trim() ?? ''
  const categoryDef = defs.find((d): d is ChoiceDef => d.id === categoryColumnId && d.kind === 'prop')
  // Read from the properties on every change, so a field added to the category shows at once
  const shownFields = useMemo(
    () => categoryFields(defs, category).filter((d) => d.id !== categoryColumnId && d.id !== barcodeColumnId),
    [defs, category],
  )
  const [photos, setPhotos] = useState<Blob[]>([])
  const [saved, setSaved] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  // The barcode, serial number or QR code, first after Kategori: scanned from a photo of the label
  // or typed. Only an ISBN in a book category goes to a catalogue, since an open one holds books.
  // A line under the field shows the last scan, fill or lookup.
  const books = isBookCategory(category, properties.find((p) => p.id === categoryColumnId)?.icons)
  const bookCols = useMemo(() => (books ? bookColumns(defs, category) : {}), [books, defs, category])
  const [code, setCode] = useState('')
  const isbn = books ? isbn13Of(code) : null
  const [codeNote, setCodeNote] = useState<string | null>(null)
  const [busy, setBusy] = useState<'scan' | 'lookup' | null>(null)
  // The code last filled from, what that fill wrote, and whether trying again could help
  const looked = useRef<string | null>(null)
  const filled = useRef<Record<string, string>>({})
  const [retry, setRetry] = useState(false)
  const scanRef = useRef<HTMLInputElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  // What the field and Kategori say now, for an answer that arrives after either changed
  const typed = useRef('')
  typed.current = code
  const categoryNow = useRef(category)
  categoryNow.current = category
  const nameNow = useRef(name)
  nameNow.current = name
  const cellsNow = useRef(cells)
  cellsNow.current = cells

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
        setCodeNote(t.barcode.read)
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

  // The code spelt for comparing, and the things in the register that already carry it
  const key = code.trim() === '' ? null : codeKey(code)
  const known = useMemo(() => (key === null ? [] : sameCode(items, code)), [items, key])

  // Another category: the note no longer applies, and the code fills the new fields afresh
  useEffect(() => {
    looked.current = null
    setCodeNote(null)
    setRetry(false)
  }, [category])

  // A code the register knows fills the form from its newest thing, without the network. An ISBN
  // it does not know is the app's one network call, once per ISBN.
  useEffect(() => {
    if (busy !== null || looked.current === key) return
    const last = known[0]
    if (key !== null && last) {
      looked.current = key
      apply(last.name, knownCells(last, shownFields))
      setCodeNote(t.barcode.known(known.length))
      return
    }
    // The code moved on, say a typed one past a shorter code it began with: that fill was for another thing
    if (Object.keys(filled.current).length > 0) apply('', {})
    looked.current = key
    if (key !== null && isbn !== null) void lookUp(isbn, key)
  }, [key, isbn, busy, known, shownFields])

  async function lookUp(target: string, at: string) {
    looked.current = at
    const inCategory = category
    setBusy('lookup')
    setCodeNote(null)
    setRetry(false)
    const result = await lookup(target)
    setBusy(null)
    // The field or the category changed while the catalogue answered: the answer is for another
    // thing, and the one in the field now is looked up afresh
    if (codeKey(typed.current) !== at || categoryNow.current !== inCategory) {
      looked.current = null
      return
    }
    if (result.kind !== 'found') {
      setCodeNote(t.barcode[result.kind])
      setRetry(result.kind === 'offline' || result.kind === 'failed')
      return
    }
    apply(result.book.title, bookCells(result.book, bookCols))
    setCodeNote(t.barcode.found(result.source))
  }

  // A field the user typed in keeps it; an empty one, or one the last fill wrote, takes this one,
  // and what the last fill wrote that this one lacks is emptied
  function apply(fillName: string, fill: Record<string, string>) {
    const before = filled.current
    const free = (id: string, now: string) => now.trim() === '' || now === before[id]
    const next = { ...cellsNow.current }
    for (const [id, v] of Object.entries(before)) if (id !== 'name' && !(id in fill) && next[id] === v) delete next[id]
    // Only what this fill wrote is its own, for the next fill and for Lagre to clear
    const wrote: Record<string, string> = {}
    for (const [id, v] of Object.entries(fill)) {
      if (!free(id, next[id] ?? '')) continue
      next[id] = v
      wrote[id] = v
    }
    if (free('name', nameNow.current)) {
      setName(fillName)
      wrote.name = fillName
    }
    filled.current = wrote
    setCells(next)
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
    const wrong = shownFields.find((d) => {
      const v = (cells[d.id] ?? '').trim()
      return v !== '' && ((d.type === 'number' && parseNumber(v) === null) || (d.type === 'date' && parseDateInput(v) === null))
    })
    if (wrong) {
      setError(wrong.type === 'number' ? t.error.notNumbers(1, wrong.col.key) : t.error.notDates(1, wrong.col.key))
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
      // A retail code is stored as the scanner reads it, digits only; a book's ISBN as its thirteen
      // digits, so every copy of an edition is found by one search
      const stored = isbn ?? (classify(code) === 'other' ? code : digitsOf(code))
      // Only the fields on screen: a value kept from a thing in another category waits for the next one
      const shown = Object.fromEntries(
        [...(categoryDef ? [categoryDef] : []), ...shownFields].map((d) => [d.id, cells[d.id] ?? '']),
      )
      await addItem(inputFrom({ name, cells: { ...shown, [barcodeColumnId]: stored }, photos }, columns))
      setSaved(name.trim())
      setName('')
      setPhotos([])
      setCode('')
      setCodeNote(null)
      // Text and numbers belong to this thing, and so does what the catalogue filled in
      const own = filled.current
      setCells((prev) => {
        const next = { ...prev }
        for (const d of shownFields) if (d.type === 'text' || d.type === 'number') delete next[d.id]
        for (const [id, v] of Object.entries(own)) if (next[id] === v) delete next[id]
        return next
      })
      filled.current = {}
      looked.current = null
      setRetry(false)
      // The next thing starts at the top, by Kategori and the scan
      window.scrollTo({ top: 0 })
    } catch (err) {
      console.error(errorText(err))
      setError(t.error.saveFailed)
    } finally {
      setSaving(false)
    }
  }

  function choiceField(d: ChoiceDef) {
    return (
      <ChoiceFields
        key={d.id}
        items={items}
        choices={[d]}
        cells={cells}
        prefix="add"
        onChange={(id, v) => setCells((prev) => ({ ...prev, [id]: v }))}
      />
    )
  }

  const codeField = (
    <div className="field">
      <label htmlFor="add-code">{books ? t.barcode.isbn : t.barcode.label}</label>
      <div className="row toolbar">
        <input
          id="add-code"
          className="input input-code"
          inputMode="text"
          enterKeyHint={books ? 'next' : 'done'}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          value={code}
          onChange={(e) => {
            setCode(cleanCode(e.target.value))
            setCodeNote(null)
            setRetry(false)
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
          aria-label={books ? t.barcode.scanIsbn : t.barcode.scan}
          disabled={busy !== null}
          onClick={() => scanRef.current?.click()}
        >
          <Icon name="barcodeScanner" />
        </button>
        {isbn !== null && retry && (
          <button type="button" className="btn" disabled={busy !== null} onClick={() => void lookUp(isbn, codeKey(code))}>
            {t.barcode.lookup}
          </button>
        )}
      </div>
      <p className="hint" aria-live="polite">
        {busy === 'scan'
          ? t.barcode.scanning
          : busy === 'lookup'
            ? t.barcode.looking
            : codeNote}
      </p>
    </div>
  )

  return (
    <form className="stack narrow" onSubmit={(e) => void save(e)} onKeyDown={nextOnEnter}>
      <h1 className="title">{t.add.title}</h1>
      {categoryDef && choiceField(categoryDef)}
      {codeField}
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
      {shownFields.map((d) =>
        d.type === 'choice' || d.type === 'path' ? (
          choiceField(d)
        ) : (
          <div key={d.id} className="field">
            <label htmlFor={domId('add', d.id)}>{d.col.key}</label>
            <input
              id={domId('add', d.id)}
              className="input"
              enterKeyHint="next"
              inputMode={d.type === 'number' ? 'decimal' : undefined}
              value={cells[d.id] ?? ''}
              onChange={(e) => {
                setCells((prev) => ({ ...prev, [d.id]: e.target.value }))
                setError(null)
              }}
            />
          </div>
        ),
      )}
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
