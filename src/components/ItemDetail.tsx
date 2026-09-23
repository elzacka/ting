import { useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { deleteItem, updateItem } from '../db/db'
import { asImage } from '../lib/backup'
import type { Item, Property } from '../db/schema'
import { parseDateInput } from '../lib/dates'
import { pathsInUse } from '../lib/paths'
import { errorText } from '../lib/errors'
import { appliesTo, categoryColumnId, columnDefs, propColumns, type ColumnDef, type FieldSettings } from '../lib/fields'
import { parseNumber, recentValues } from '../lib/filter'
import { formatValue } from '../lib/format'
import { cellsFrom, columnId, inputFrom } from '../lib/grid'
import { href, navigate } from '../lib/route'
import { t } from '../lib/strings'
import { Icon } from './Icons'
import { useObjectUrl } from './useObjectUrl'
import { PhotoStrip } from './PhotoStrip'
import { ValuePicker } from './ValuePicker'
import { splitLinks } from '../lib/paste'

type Props = { item: Item; items: Item[]; properties: Property[]; fields: FieldSettings }

type PropDef = Extract<ColumnDef, { kind: 'prop' }>

function domId(prefix: string, id: string): string {
  return `${prefix}-${encodeURIComponent(id)}`
}

// A thing, every column as a row, each stored the moment it is left. Nothing
// here waits for Lagre: on a phone this is the way to correct a thing.
export function ItemDetail({ item, items, properties, fields }: Props) {
  const url = useObjectUrl(item.photos[0] ?? null)
  const [confirming, setConfirming] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const defs = useMemo(() => columnDefs(fields, properties, items), [fields, properties, items])
  const nameLabel = fields.name.label ?? t.table.name
  const cells = useMemo(() => cellsFrom(item), [item])
  // The properties this thing's category has, the same rule as the table's
  // columns, and any other the thing holds a value in; not every property of
  // every category. The place comes first: it answers where the thing is.
  const props = useMemo(() => {
    const category = cells[categoryColumnId] ?? ''
    const shown = defs.filter(
      (d): d is PropDef =>
        d.kind === 'prop' && ((cells[d.id] ?? '') !== '' || appliesTo(d.property, category === '' ? [] : [category])),
    )
    return [...shown.filter((d) => d.type === 'path'), ...shown.filter((d) => d.type !== 'path')]
  }, [defs, cells])
  // The row being edited and what it says so far; 'name' or a column id
  const [editing, setEditing] = useState<{ id: string; draft: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function onDelete() {
    await deleteItem(item.id)
    navigate(href.list)
  }

  // The photos are the one thing the table cannot hold, so they are set here.
  // The first is the one every other screen shows.
  async function setPhotos(photos: Blob[]) {
    await updateItem(item.id, { name: item.name, specs: item.specs, photos })
    if (fileRef.current) fileRef.current.value = ''
  }

  function addPhotos(files: FileList | null) {
    const added = [...(files ?? [])].map(asImage).filter((b): b is Blob => b !== null)
    if (added.length > 0) void setPhotos([...item.photos, ...added])
    else if (fileRef.current) fileRef.current.value = ''
  }

  function makeFirst(index: number) {
    const photo = item.photos[index]
    if (!photo) return
    void setPhotos([photo, ...item.photos.filter((_, i) => i !== index)])
  }

  function dropPhoto(index: number) {
    void setPhotos(item.photos.filter((_, i) => i !== index))
  }

  function start(id: string) {
    setError(null)
    setEditing({ id, draft: id === 'name' ? item.name : (cells[id] ?? '') })
  }

  // `picked` is a value tapped among the suggestions, stored at once
  async function commit(picked?: string) {
    if (!editing) return
    const { id } = editing
    const draft = picked ?? editing.draft
    const value = draft.trim()
    const def = props.find((d) => d.id === id)
    if (id === 'name' && value === '') {
      setError(t.add.missingName)
      return
    }
    if (def && value !== '' && def.type === 'number' && parseNumber(value) === null) {
      setError(t.error.notNumbers(1, def.col.key))
      return
    }
    if (def && value !== '' && def.type === 'date' && parseDateInput(value) === null) {
      setError(t.error.notDates(1, def.col.key))
      return
    }
    const unchanged = id === 'name' ? value === item.name : value === (cells[id] ?? '')
    if (!unchanged) {
      try {
        await updateItem(
          item.id,
          inputFrom(
            {
              name: id === 'name' ? value : item.name,
              cells: id === 'name' ? cells : { ...cells, [id]: value },
              photos: item.photos,
            },
            propColumns(defs),
          ),
        )
      } catch (err) {
        console.error(errorText(err))
        setError(t.error.saveFailed)
        return
      }
    }
    // Another row may have been opened while this one was being stored
    setEditing((cur) => (cur?.id === id ? null : cur))
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      void commit()
    } else if (e.key === 'Escape') {
      setEditing(null)
      setError(null)
    }
  }

  // The values in use, for tapping: a Valgliste's, the one used last first,
  // or every place on the way to one
  function valuesFor(def: PropDef): string[] {
    const value = (i: Item) => {
      const s = i.specs.find((x) => columnId({ key: x.key, unit: x.unit }) === def.id)
      return s ? String(s.value) : ''
    }
    if (def.type === 'path') return pathsInUse(items.map(value))
    return recentValues(items, value, def.property?.options ?? [])
  }

  function field(id: string, label: string, def?: PropDef) {
    const change = (draft: string) => {
      setError(null)
      setEditing({ id, draft })
    }
    if (def?.type === 'choice' || def?.type === 'path') {
      return (
        <div className="spec-pick">
          <ValuePicker
            id={domId('edit', id)}
            label={label}
            aria-label={label}
            kind={def.type}
            values={valuesFor(def)}
            value={editing?.draft ?? ''}
            onChange={change}
            // A value tapped is the answer, unless a place has a level further in
            onPick={(v, done) => {
              if (done) void commit(v)
            }}
            onBlur={() => void commit()}
            onKeyDown={onKey}
            // Selected, so one delete brings back every place or value to tap
            onFocus={(e) => e.currentTarget.select()}
            enterKeyHint="done"
            autoFocus
          />
        </div>
      )
    }
    return (
      <input
        id={domId('edit', id)}
        className="input"
        aria-label={label}
        inputMode={def?.type === 'number' ? 'decimal' : undefined}
        enterKeyHint="done"
        value={editing?.draft ?? ''}
        onChange={(e) => change(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={onKey}
        autoFocus
      />
    )
  }

  // The whole row opens the field, not only the pencil: on a touch screen the
  // pencils are out of sight, and the row is the target. A link in a value
  // still opens the link.
  function startFromRow(e: MouseEvent, id: string) {
    if (editing?.id === id || (e.target instanceof Element && e.target.closest('a, button'))) return
    start(id)
  }

  const editButton = (id: string, label: string) => (
    <button type="button" className="btn btn-icon spec-edit" aria-label={t.detail.edit(label)} onClick={() => start(id)}>
      <Icon name="edit" size={20} />
    </button>
  )

  return (
    <div className="stack narrow">
      {editing?.id === 'name' ? (
        <h1 className="title">{field('name', nameLabel)}</h1>
      ) : (
        <h1 className="title spec-row-edit spec-row-tap" onClick={(e) => startFromRow(e, 'name')}>
          {item.name}
          {editButton('name', nameLabel)}
        </h1>
      )}

      {url && <img className="photo" src={url} alt={t.detail.photoAlt(item.name)} />}

      <PhotoStrip photos={item.photos} name={item.name} onFirst={makeFirst} onRemove={dropPhoto} />

      <section className="stack-sm">
        <h2 className="section-label">{t.detail.specs}</h2>
        {props.length === 0 ? (
          <p className="hint">{t.detail.noSpecs}</p>
        ) : (
          <dl className="specs">
            {props.map((def) => {
              const spec = item.specs.find((s) => columnId({ key: s.key, unit: s.unit }) === def.id)
              return (
                <div key={def.id} className="spec-row-tap" onClick={(e) => startFromRow(e, def.id)}>
                  <dt>{def.col.key}</dt>
                  <dd className="spec-row-edit">
                    {editing?.id === def.id ? (
                      field(def.id, def.col.key, def)
                    ) : (
                      <>
                        <span className="spec-value">{spec && <Linked text={formatValue(spec)} />}</span>
                        {editButton(def.id, def.col.key)}
                      </>
                    )}
                  </dd>
                </div>
              )
            })}
          </dl>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </section>

      <div className="row toolbar">
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
          {item.photos.length === 0 ? t.action.choosePhoto : t.action.addPhoto}
        </button>
        {/* With several, each tile carries its own way out */}
        {item.photos.length === 1 && (
          <button type="button" className="btn" onClick={() => dropPhoto(0)}>
            {t.action.removePhoto}
          </button>
        )}
      </div>

      {/* At the foot, on its own: nowhere near the buttons used every day */}
      {confirming ? (
        <div className="confirm" role="alertdialog" aria-labelledby="confirm-text">
          <p id="confirm-text">{t.confirm.delete(item.name)}</p>
          <div className="row">
            <button type="button" className="btn btn-danger" onClick={onDelete}>
              {t.action.delete}
            </button>
            <button type="button" className="btn" onClick={() => setConfirming(false)} autoFocus>
              {t.action.cancel}
            </button>
          </div>
        </div>
      ) : (
        <div className="row detail-foot">
          <button type="button" className="btn btn-danger" onClick={() => setConfirming(true)}>
            <Icon name="delete" size={20} />
            {t.action.delete}
          </button>
        </div>
      )}
    </div>
  )
}

// http(s) addresses in text open in a new tab; the text itself stays text.
function Linked({ text }: { text: string }) {
  return (
    <>
      {splitLinks(text).map((part, i) =>
        part.href ? (
          <a key={i} href={part.href} target="_blank" rel="noopener noreferrer">
            {part.text}
          </a>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </>
  )
}
