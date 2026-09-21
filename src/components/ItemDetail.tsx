import { useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { deleteItem, updateItem } from '../db/db'
import { asImage } from '../lib/backup'
import type { Item, Property } from '../db/schema'
import { parseDateInput } from '../lib/dates'
import { errorText } from '../lib/errors'
import { columnDefs, propColumns, type ColumnDef, type FieldSettings } from '../lib/fields'
import { distinct, parseNumber } from '../lib/filter'
import { formatValue } from '../lib/format'
import { cellsFrom, columnId, inputFrom } from '../lib/grid'
import { href, navigate } from '../lib/route'
import { t } from '../lib/strings'
import { Icon } from './Icons'
import { useObjectUrl } from './useObjectUrl'
import { splitLinks } from '../lib/paste'

type Props = { item: Item; items: Item[]; properties: Property[]; fields: FieldSettings }

type PropDef = Extract<ColumnDef, { kind: 'prop' }>

function domId(prefix: string, id: string): string {
  return `${prefix}-${encodeURIComponent(id)}`
}

// A thing, every column as a row, each stored the moment it is left. Nothing
// here waits for Lagre: on a phone this is the way to correct a thing.
export function ItemDetail({ item, items, properties, fields }: Props) {
  const url = useObjectUrl(item.photo)
  const [confirming, setConfirming] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const defs = useMemo(() => columnDefs(fields, properties, items), [fields, properties, items])
  const props = useMemo(() => defs.filter((d): d is PropDef => d.kind === 'prop'), [defs])
  const nameLabel = fields.name.label ?? t.table.name
  const cells = useMemo(() => cellsFrom(item), [item])
  // The row being edited and what it says so far; 'name' or a column id
  const [editing, setEditing] = useState<{ id: string; draft: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function onDelete() {
    await deleteItem(item.id)
    navigate(href.list)
  }

  // The photo is the one thing the table cannot hold, so it is set here.
  async function setPhoto(photo: Blob | null) {
    await updateItem(item.id, { name: item.name, specs: item.specs, photo })
    if (fileRef.current) fileRef.current.value = ''
  }

  function start(id: string) {
    setError(null)
    setEditing({ id, draft: id === 'name' ? item.name : (cells[id] ?? '') })
  }

  async function commit() {
    if (!editing) return
    const { id, draft } = editing
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
              photo: item.photo,
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

  function field(id: string, label: string, def?: PropDef) {
    return (
      <input
        id={domId('edit', id)}
        className="input"
        aria-label={label}
        list={def?.type === 'choice' ? domId('edit-list', id) : undefined}
        inputMode={def?.type === 'number' ? 'decimal' : undefined}
        value={editing?.draft ?? ''}
        onChange={(e) => {
          setError(null)
          setEditing({ id, draft: e.target.value })
        }}
        onBlur={() => void commit()}
        onKeyDown={onKey}
        autoFocus
      />
    )
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
        <h1 className="title spec-row-edit">
          {item.name}
          {editButton('name', nameLabel)}
        </h1>
      )}

      {url && <img className="photo" src={url} alt={t.detail.photoAlt(item.name)} />}

      <section className="stack-sm">
        <h2 className="section-label">{t.detail.specs}</h2>
        {props.length === 0 ? (
          <p className="hint">{t.detail.noSpecs}</p>
        ) : (
          <dl className="specs">
            {props.map((def) => {
              const spec = item.specs.find((s) => columnId({ key: s.key, unit: s.unit }) === def.id)
              return (
                <div key={def.id}>
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
        {props.map(
          (def) =>
            def.type === 'choice' && (
              <datalist key={def.id} id={domId('edit-list', def.id)}>
                {[
                  ...new Set([
                    ...(def.property?.options ?? []),
                    ...distinct(items, (i) => {
                      const s = i.specs.find((x) => columnId({ key: x.key, unit: x.unit }) === def.id)
                      return s ? String(s.value) : ''
                    }),
                  ]),
                ].map((v) => (
                  <option key={v} value={v} />
                ))}
              </datalist>
            ),
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </section>

      {confirming ? (
        <div className="confirm" role="alertdialog" aria-labelledby="confirm-text">
          <p id="confirm-text">{t.confirm.delete(item.name)}</p>
          <div className="row">
            <button type="button" className="btn btn-danger" onClick={onDelete} autoFocus>
              {t.action.delete}
            </button>
            <button type="button" className="btn" onClick={() => setConfirming(false)}>
              {t.action.cancel}
            </button>
          </div>
        </div>
      ) : (
        <div className="row toolbar">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="visually-hidden"
            onChange={(e) => void setPhoto(asImage(e.target.files?.[0]))}
          />
          <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
            <Icon name="photoCamera" size={20} />
            {item.photo ? t.action.changePhoto : t.action.choosePhoto}
          </button>
          {item.photo && (
            <button type="button" className="btn" onClick={() => void setPhoto(null)}>
              {t.action.removePhoto}
            </button>
          )}
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
