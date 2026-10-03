import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { addProperty, getSealedSetting, saveBatch, setSealedSetting } from '../db/db'
import type { Item, Property } from '../db/schema'
import { asImage } from '../lib/backup'
import { errorText } from '../lib/errors'
import { categoryColumnId, categoryKey } from '../lib/fields'
import { findCorners, scanLook, warp, type Quad, type Rgba } from '../lib/flatten'
import { formatNumber } from '../lib/format'
import { columnId } from '../lib/grid'
import { readText } from '../lib/ocr'
import { parseReceipt, splitAmount, storeKey } from '../lib/receipt'
import { fileToRgba, rgbaToJpeg } from '../lib/receiptImage'
import { closestValue, receiptColumns, receiptInputs, type ReceiptRow } from '../lib/receiptItems'
import { t } from '../lib/strings'
import { parseNumber, recentValues } from '../lib/values'
import { CornerEditor } from './CornerEditor'
import { Icon } from './Icons'
import { useObjectUrl } from './useObjectUrl'
import { ValuePicker } from './ValuePicker'

type Props = {
  items: Item[]
  properties: Property[]
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

function specValue(item: Item, id: string): string {
  const spec = item.specs.find((s) => columnId({ key: s.key, unit: s.unit }) === id)
  return spec ? String(spec.value) : ''
}

// Ny fra kvittering: a photo of the receipt, read on the device, becomes one
// thing per item bought, each with the store, the date, its price and the
// receipt itself as the proof of purchase.
export function ReceiptAdd({ items, properties, onDirtyChange }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [stage, setStage] = useState<Stage>('pick')
  const [source, setSource] = useState<{ img: Rgba; preview: Blob } | null>(null)
  const [quad, setQuad] = useState<Quad | null>(null)
  const [scan, setScan] = useState<Blob | null>(null)
  const scanUrl = useObjectUrl(scan)
  const previewUrl = useObjectUrl(source?.preview ?? null)
  const [rows, setRows] = useState<ReceiptRow[]>([])
  const [store, setStore] = useState('')
  const [date, setDate] = useState('')
  const [category, setCategory] = useState(() => {
    const newest = items.reduce<Item | null>((a, i) => (a === null || i.createdAt > a.createdAt ? i : a), null)
    return newest ? specValue(newest, categoryColumnId) : ''
  })
  const [total, setTotal] = useState<number | null>(null)
  const [key, setKey] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [saved, setSaved] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)

  const cols = useMemo(() => receiptColumns(properties, Date.now()), [properties])
  const storeValues = useMemo(
    () => recentValues(items, (i) => specValue(i, cols.store.id), cols.store.options ?? []),
    [items, cols.store],
  )
  const categoryValues = useMemo(
    () => recentValues(items, (i) => specValue(i, categoryColumnId), properties.find((p) => p.id === categoryColumnId)?.options ?? []),
    [items, properties],
  )

  const dirty = stage === 'review' || stage === 'corners'
  useEffect(() => {
    onDirtyChange(dirty)
  }, [dirty, onDirtyChange])
  useEffect(() => () => onDirtyChange(false), [onDirtyChange])

  async function pick(file: File | undefined) {
    if (fileRef.current) fileRef.current.value = ''
    const image = asImage(file)
    if (!image) return
    setSaved(null)
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
    const known = await getSealedSetting<Record<string, string>>(storesKey)
    const k = storeKey(r)
    setKey(k)
    setStore((k && known?.[k]) || (r.storeName ? closestValue(r.storeName, storeValues) : ''))
    setDate(r.date ?? '')
    setTotal(r.total)
    // One thing per unit: two duvets are two things, each with its share
    const next: ReceiptRow[] = r.lines.flatMap((line) =>
      splitAmount(line.amount, line.quantity).map((price) => ({ include: true, name: line.name, price: formatNumber(price) })),
    )
    setRows(next.length > 0 ? next : [{ include: true, name: '', price: '' }])
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
  const sum = rows.filter((r) => r.include).reduce((a, r) => a + (parseNumber(r.price) ?? 0), 0)
  const unbalanced = total !== null && Math.abs(sum - total) > 0.005

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!scan || chosen.length === 0) return
    setSaving(true)
    try {
      for (const p of cols.missing) await addProperty(p)
      await saveBatch(receiptInputs(rows, cols, { store, date: date || null, category, photo: scan }), [])
      if (key && store.trim() !== '') {
        const known = (await getSealedSetting<Record<string, string>>(storesKey)) ?? {}
        await setSealedSetting(storesKey, { ...known, [key]: store.trim() })
      }
      setSaved(chosen.length)
      setRows([])
      setScan(null)
      setSource(null)
      setStage('pick')
    } catch (err) {
      console.error(errorText(err))
      setNote(t.error.saveFailed)
    } finally {
      setSaving(false)
    }
  }

  const pickButton = (
    <>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="visually-hidden"
        onChange={(e) => void pick(e.target.files?.[0])}
      />
      <button
        type="button"
        className={`btn${stage === 'pick' ? ' btn-primary' : ''}`}
        disabled={stage === 'reading'}
        onClick={() => fileRef.current?.click()}
      >
        <Icon name="photoCamera" size={20} />
        {t.receipt.pick}
      </button>
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
      {stage === 'review' && scanUrl && <img className="photo receipt-scan" src={scanUrl} alt={t.receipt.imageAlt} />}
      <div className="row toolbar">
        {pickButton}
        {stage === 'review' && (
          <button type="button" className="btn" onClick={() => setStage('corners')}>
            {t.receipt.adjust}
          </button>
        )}
      </div>
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
      {saved !== null && (
        <p className="hint" role="status">
          {t.receipt.saved(saved)}
        </p>
      )}
      {stage === 'review' && (
        <>
          <div className="field">
            <label htmlFor="receipt-category">{categoryKey}</label>
            <ValuePicker id="receipt-category" label={categoryKey} kind="choice" values={categoryValues} value={category} onChange={setCategory} />
          </div>
          <div className="field">
            <label htmlFor="receipt-store">{cols.store.key}</label>
            <ValuePicker id="receipt-store" label={cols.store.key} kind="choice" values={storeValues} value={store} onChange={setStore} />
          </div>
          <div className="field">
            <label htmlFor="receipt-date">{cols.date.key}</label>
            <input id="receipt-date" className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <fieldset className="receipt-lines">
            <legend className="section-label">{t.receipt.things}</legend>
            {rows.map((row, i) => (
              <div key={i} className="receipt-line">
                <input
                  type="checkbox"
                  checked={row.include}
                  aria-label={t.receipt.include(row.name)}
                  onChange={(e) => setRow(i, { include: e.target.checked })}
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
              <button type="button" className="btn" onClick={() => setRows((prev) => [...prev, { include: true, name: '', price: '' }])}>
                {t.receipt.addLine}
              </button>
            </div>
          </fieldset>
          {unbalanced && total !== null && (
            <p className="hint warn" role="status">
              {t.receipt.unbalanced(formatNumber(sum), formatNumber(total))}
            </p>
          )}
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
