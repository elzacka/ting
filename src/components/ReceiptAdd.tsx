import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { addProperty, getSealedSetting, getSetting, saveBatch, setSealedSetting } from '../db/db'
import type { Item, Property } from '../db/schema'
import { asImage } from '../lib/backup'
import { errorText } from '../lib/errors'
import { categoryColumnId, choiceDefs, columnDefs, propColumns, type FieldSettings } from '../lib/fields'
import { findCorners, scanLook, warp, type Quad, type Rgba } from '../lib/flatten'
import { formatNumber } from '../lib/format'
import { columnId, specsFrom } from '../lib/grid'
import { readText } from '../lib/ocr'
import { parseReceipt, splitAmount, storeKey } from '../lib/receipt'
import { fileToRgba, rgbaToJpeg, takeReceipt } from '../lib/receiptImage'
import { closestValue, linesSum, receiptColumns, receiptInputs, receiptReadingKey, type ReceiptRow } from '../lib/receiptItems'
import { href, navigate } from '../lib/route'
import { t } from '../lib/strings'
import { useEscape } from '../lib/useEscape'
import { recentValues } from '../lib/values'
import { ChoiceFields, firstCells } from './ChoiceFields'
import { ChoiceMenu } from './ChoiceMenu'
import { CornerEditor } from './CornerEditor'
import { Icon } from './Icons'
import { ReceiptSettings } from './ReceiptSettings'
import { PhotoPicker, ThumbMenu } from './ThumbMenu'
import { useObjectUrl } from './useObjectUrl'

type Props = {
  items: Item[]
  properties: Property[]
  fields: FieldSettings
  onDirtyChange: (dirty: boolean) => void
}

type Stage = 'pick' | 'reading' | 'review' | 'corners'

// Long side of the photo kept for cropping, and width of the stored receipt:
// enough to read every line, small enough to keep on every thing it bought
const sourceSide = 2400
const receiptWidth = 1200
// The store a receipt names, as the user last called it: keyed by org number
// and postcode, or the card terminal when the receipt prints neither
const storesKey = 'receiptStores'

// A list sealed under a key this device no longer holds reads as empty, like
// column widths: the next save seals it again under the current key
async function knownStores(): Promise<Record<string, string>> {
  try {
    return (await getSealedSetting<Record<string, string>>(storesKey)) ?? {}
  } catch (err) {
    console.error(errorText(err))
    return {}
  }
}

function specValue(item: Item, id: string): string {
  const spec = item.specs.find((s) => columnId({ key: s.key, unit: s.unit }) === id)
  return spec ? String(spec.value) : ''
}

// Ny fra kvittering: a photo of the receipt, read on the device, becomes one
// thing per item bought, each with the store, the date, its price, its own
// photos and the receipt itself as the proof of purchase.
export function ReceiptAdd({ items, properties, fields, onDirtyChange }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [stage, setStage] = useState<Stage>('pick')
  useEscape(() => setStage('review'), stage === 'corners')
  const [source, setSource] = useState<{ img: Rgba; preview: Blob } | null>(null)
  const [quad, setQuad] = useState<Quad | null>(null)
  const [scan, setScan] = useState<Blob | null>(null)
  const previewUrl = useObjectUrl(source?.preview ?? null)
  const [rows, setRows] = useState<ReceiptRow[]>([])
  const [store, setStore] = useState('')
  const [date, setDate] = useState('')
  // Kategori and the choice and path columns it asks for, shared by every thing on the receipt
  const [cells, setCells] = useState<Record<string, string>>(() => firstCells(items))
  const [total, setTotal] = useState<number | null>(null)
  const [key, setKey] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  // Reading is a download the user switches on; until then this screen offers it
  const [reading, setReading] = useState<boolean | undefined>(undefined)
  useEffect(() => {
    void getSetting<boolean>(receiptReadingKey).then((on) => setReading(on === true))
  }, [])

  const cols = useMemo(() => receiptColumns(properties, Date.now()), [properties])
  const storeValues = useMemo(
    () => recentValues(items, (i) => specValue(i, cols.store.id), cols.store.options ?? []),
    [items, cols.store],
  )
  const defs = useMemo(() => columnDefs(fields, properties, items), [fields, properties, items])
  const category = cells[categoryColumnId]?.trim() ?? ''
  // The store is filled above from the receipt, so it is not asked twice
  const choices = useMemo(() => choiceDefs(defs, category).filter((d) => d.id !== cols.store.id), [defs, category, cols.store.id])

  const dirty = stage === 'review' || stage === 'corners'
  useEffect(() => {
    onDirtyChange(dirty)
  }, [dirty, onDirtyChange])
  useEffect(() => () => onDirtyChange(false), [onDirtyChange])

  // The photo taken from the list's receipt button, once on arrival
  useEffect(() => {
    const file = takeReceipt()
    if (file) void pick(file)
  }, [])

  async function pick(file: File | undefined) {
    if (fileRef.current) fileRef.current.value = ''
    const image = asImage(file)
    if (!image) return
    setNote(null)
    setStage('reading')
    try {
      const img = await fileToRgba(image, sourceSide)
      const corners = findCorners(img)
      setSource({ img, preview: await rgbaToJpeg(img, 0.7) })
      setQuad(corners)
      await read(img, corners)
    } catch (err) {
      console.error(errorText(err))
      setNote(t.receipt.failed)
      setStage('pick')
    }
  }

  // Crop and straighten, keep the scan as the proof of purchase, read the text
  async function read(img: Rgba, corners: Quad) {
    setStage('reading')
    const flat = warp(img, corners, receiptWidth)
    setScan(await rgbaToJpeg(scanLook(flat), 0.75))
    const r = parseReceipt(await readText(flat), new Date())
    const known = await knownStores()
    const k = storeKey(r)
    setKey(k)
    setStore((k && known[k]) || (r.storeName ? closestValue(r.storeName, storeValues) : ''))
    setDate(r.date ?? '')
    setTotal(r.total)
    // One thing per unit: two duvets are two things, each with its share
    const next: ReceiptRow[] = r.lines.flatMap((line) =>
      splitAmount(line.amount, line.quantity).map((price) => ({ include: true, name: line.name, price: formatNumber(price), photos: [] })),
    )
    setRows(next.length > 0 ? next : [{ include: true, name: '', price: '', photos: [] }])
    setNote(next.length > 0 ? null : t.receipt.noLines)
    setStage('review')
  }

  async function useCorners() {
    if (!source || !quad) return
    try {
      await read(source.img, quad)
    } catch (err) {
      console.error(errorText(err))
      setNote(t.receipt.failed)
      setStage('review')
    }
  }

  function setRow(i: number, patch: Partial<ReceiptRow>) {
    setRows((prev) => prev.map((r, n) => (n === i ? { ...r, ...patch } : r)))
  }

  const chosen = rows.filter((r) => r.include && r.name.trim() !== '')
  const sum = linesSum(rows)
  const unbalanced = total !== null && Math.abs(sum - total) > 0.005

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!scan || chosen.length === 0) return
    setSaving(true)
    try {
      for (const p of cols.missing) await addProperty(p)
      const more = specsFrom(cells, propColumns(choices))
      await saveBatch(receiptInputs(rows, cols, { store, date: date || null, more, receipt: scan }), [])
      if (key && store.trim() !== '') {
        await setSealedSetting(storesKey, { ...(await knownStores()), [key]: store.trim() })
      }
      onDirtyChange(false)
      navigate(href.list)
    } catch (err) {
      console.error(errorText(err))
      setNote(t.error.saveFailed)
      setSaving(false)
    }
  }

  const pickButton = (
    <>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="visually-hidden"
        onChange={(e) => void pick(e.target.files?.[0])}
      />
      {reading === false && (
        <ReceiptSettings onReady={() => setReading(true)} />
      )}
      {stage === 'pick' && reading && (
        <div className="row">
          <button type="button" className="btn btn-primary" onClick={() => fileRef.current?.click()}>
            <Icon name="photoCamera" size={20} />
            {t.receipt.pick}
          </button>
        </div>
      )}
    </>
  )

  if (stage === 'corners' && source && quad && previewUrl) {
    return (
      <div className="stack narrow">
        <h1 className="title">{t.receipt.title}</h1>
        <p className="hint">{t.receipt.adjustHint}</p>
        <CornerEditor url={previewUrl} width={source.img.width} height={source.img.height} quad={quad} onChange={setQuad} />
        <div className="row form-bar">
          <button type="button" className="btn btn-primary" onClick={() => void useCorners()}>
            {t.receipt.useCorners}
          </button>
          <button type="button" className="btn" onClick={() => setStage('review')}>
            {t.action.cancel}
          </button>
        </div>
      </div>
    )
  }

  return (
    <form className="stack narrow" onSubmit={(e) => void save(e)}>
      <h1 className="title">{t.receipt.title}</h1>
      {pickButton}
      {stage === 'reading' && (
        <p className="hint" role="status">
          {t.receipt.reading}
        </p>
      )}
      {note && (
        <p className="hint" role="status">
          {note}
        </p>
      )}
      {stage === 'review' && (
        <>
          {/* What the receipt says first, then what it cannot say: the category, the place */}
          <div className="receipt-head">
            <ThumbMenu
              photo={scan}
              label={t.receipt.thumb}
              large
              actions={[
                { label: t.receipt.retake, onSelect: () => fileRef.current?.click() },
                { label: t.receipt.adjust, onSelect: () => setStage('corners') },
              ]}
            />
            <div className="stack-sm">
              <div className="field">
                <label htmlFor="receipt-store">{cols.store.key}</label>
                <ChoiceMenu id="receipt-store" label={cols.store.key} values={storeValues} value={store} onChange={setStore} />
              </div>
              <div className="field">
                <label htmlFor="receipt-date">{cols.date.key}</label>
                <input id="receipt-date" className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
            </div>
          </div>
          <fieldset className="receipt-lines">
            <legend>{t.receipt.things}</legend>
            {rows.map((row, i) => (
              <div key={i} className="receipt-line">
                <input
                  type="checkbox"
                  checked={row.include}
                  aria-label={t.receipt.include(row.name)}
                  onChange={(e) => setRow(i, { include: e.target.checked })}
                />
                <PhotoPicker
                  photos={row.photos}
                  label={t.add.photos(row.name.trim() === '' ? t.receipt.lineThing(i + 1) : row.name.trim(), row.photos.length)}
                  onAdd={(added) => setRow(i, { photos: [...row.photos, ...added] })}
                  onClear={() => setRow(i, { photos: [] })}
                />
                <input
                  className="input"
                  aria-label={t.receipt.lineName(i + 1)}
                  value={row.name}
                  onChange={(e) => setRow(i, { name: e.target.value })}
                />
                <input
                  className="input num"
                  inputMode="decimal"
                  aria-label={t.receipt.linePrice(i + 1)}
                  value={row.price}
                  onChange={(e) => setRow(i, { price: e.target.value })}
                />
              </div>
            ))}
            <div className="row">
              <button type="button" className="btn" onClick={() => setRows((prev) => [...prev, { include: true, name: '', price: '', photos: [] }])}>
                {t.receipt.addLine}
              </button>
            </div>
          </fieldset>
          {unbalanced && total !== null && (
            <p className="hint warn" role="status">
              {t.receipt.unbalanced(formatNumber(sum), formatNumber(total))}
            </p>
          )}
          <ChoiceFields
            items={items}
            choices={choices}
            cells={cells}
            prefix="receipt"
            onChange={(id, v) => setCells((prev) => ({ ...prev, [id]: v }))}
          />
          <div className="row form-bar">
            <button type="submit" className="btn btn-primary" disabled={saving || chosen.length === 0}>
              {t.receipt.save(chosen.length)}
            </button>
          </div>
        </>
      )}
    </form>
  )
}
