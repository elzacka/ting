import { useEffect, useRef, useState, type FormEvent } from 'react'
import { updateItem } from '../db/db'
import type { Item, ItemInput } from '../db/schema'
import { parseNumber } from '../lib/filter'
import { href, navigate } from '../lib/route'
import type { FieldSettings } from '../lib/fields'
import { asImage } from '../lib/backup'
import { t } from '../lib/strings'
import { Icon } from './Icons'
import { useObjectUrl } from './useObjectUrl'

type SpecDraft = { key: string; value: string; unit: string }

const emptySpec: SpecDraft = { key: '', value: '', unit: '' }

function toDraft(item: Item): { name: string; note: string; specs: SpecDraft[]; photo: Blob | null } {
  return {
    name: item.name,
    note: item.note ?? '',
    photo: item.photo,
    specs:
      item.specs.length > 0
        ? item.specs.map((s) => ({ key: s.key, value: String(s.value), unit: s.unit ?? '' }))
        : [{ ...emptySpec }],
  }
}

export function ItemForm({
  item,
  fields,
  categories,
}: {
  item: Item
  fields: FieldSettings
  categories: readonly string[]
}) {
  const initial = toDraft(item)
  const [name, setName] = useState(initial.name)
  const [category, setCategory] = useState(item.category)
  const [note, setNote] = useState(initial.note)
  const [photo, setPhoto] = useState<Blob | null>(initial.photo)
  const [specs, setSpecs] = useState<SpecDraft[]>(initial.specs)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const photoUrl = useObjectUrl(photo)
  const [confirmingDiscard, setConfirmingDiscard] = useState(false)

  const dirty =
    name !== initial.name ||
    category !== item.category ||
    note !== initial.note ||
    photo !== initial.photo ||
    JSON.stringify(specs) !== JSON.stringify(initial.specs)

  // Esc: unchanged form goes straight back, a changed one asks first.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (confirmingDiscard) {
        setConfirmingDiscard(false)
        return
      }
      if (dirty) setConfirmingDiscard(true)
      else navigate(href.detail(item.id))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dirty, confirmingDiscard, item.id])

  function setSpec(i: number, patch: Partial<SpecDraft>) {
    setSpecs((prev) => prev.map((s, j) => (j === i ? { ...s, ...patch } : s)))
  }

  function addSpec() {
    setSpecs((prev) => [...prev, { ...emptySpec }])
  }

  function removeSpec(i: number) {
    setSpecs((prev) => prev.filter((_, j) => j !== i))
  }

  async function onSubmit(e?: FormEvent) {
    e?.preventDefault()
    setError(null)
    setConfirmingDiscard(false)

    const trimmedName = name.trim()
    if (trimmedName === '') {
      setError(t.error.nameMissing)
      return
    }

    const filled = specs.filter((s) => s.key.trim() !== '' || s.value.trim() !== '' || s.unit.trim() !== '')
    if (filled.some((s) => s.key.trim() === '' || s.value.trim() === '')) {
      setError(t.error.specIncomplete)
      return
    }

    if (!fields.category.hidden && category.trim() === '') {
      setError(t.error.categoryMissing)
      return
    }

    const input: ItemInput = {
      name: trimmedName,
      category: category.trim(),
      note: note.trim() === '' ? null : note.trim(),
      photo,
      specs: filled.map((s) => {
        const n = parseNumber(s.value)
        return { key: s.key.trim(), value: n ?? s.value.trim(), unit: s.unit.trim() === '' ? null : s.unit.trim() }
      }),
    }

    setSaving(true)
    try {
      await updateItem(item.id, input)
      navigate(href.detail(item.id))
    } catch (err) {
      console.error(err)
      setError(t.error.saveFailed)
      setSaving(false)
    }
  }

  return (
    <form className="stack narrow" onSubmit={onSubmit} noValidate>
      <h1 className="title">{t.form.editTitle}</h1>

      <div className="field">
        <label htmlFor="name">{fields.name.label ?? t.form.name}</label>
        <input
          id="name"
          className="input"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-invalid={error === t.error.nameMissing}
          autoComplete="off"
          autoFocus
        />
      </div>

      {!fields.category.hidden && (
        <div className="field">
          <label htmlFor="category">{fields.category.label ?? t.form.category}</label>
          <input
            id="category"
            className="input"
            type="text"
            list="category-options"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            aria-invalid={error === t.error.categoryMissing}
            autoComplete="off"
          />
          <datalist id="category-options">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
      )}

      <div className="field">
        <span className="field-label">
          {t.form.photo} <span className="hint">({t.form.photoHint})</span>
        </span>
        {photoUrl && <img className="photo-preview" src={photoUrl} alt="" />}
        <div className="row">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="visually-hidden"
            onChange={(e) => setPhoto(asImage(e.target.files?.[0]))}
          />
          <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
            <Icon name="photoCamera" size={20} />
            {t.action.choosePhoto}
          </button>
          {photo && (
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => {
                setPhoto(null)
                if (fileRef.current) fileRef.current.value = ''
              }}
            >
              {t.action.removePhoto}
            </button>
          )}
        </div>
      </div>

      <fieldset className="stack-sm" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="field-label">{t.form.specs}</legend>
        {specs.map((s, i) => (
          <div className="spec-row" key={i}>
            <div className="field">
              <label htmlFor={`spec-key-${i}`} className="visually-hidden">
                {t.form.specKey}
              </label>
              <input
                id={`spec-key-${i}`}
                className="input"
                type="text"
                placeholder={t.form.specKey}
                value={s.key}
                onChange={(e) => setSpec(i, { key: e.target.value })}
                autoComplete="off"
              />
            </div>
            <div className="field">
              <label htmlFor={`spec-value-${i}`} className="visually-hidden">
                {t.form.specValue}
              </label>
              <input
                id={`spec-value-${i}`}
                className="input num"
                type="text"
                placeholder={t.form.specValue}
                value={s.value}
                onChange={(e) => setSpec(i, { value: e.target.value })}
                autoComplete="off"
              />
            </div>
            <div className="field">
              <label htmlFor={`spec-unit-${i}`} className="visually-hidden">
                {t.form.specUnit}
              </label>
              <input
                id={`spec-unit-${i}`}
                className="input"
                type="text"
                placeholder={t.form.specUnit}
                value={s.unit}
                onChange={(e) => setSpec(i, { unit: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && i === specs.length - 1) {
                    e.preventDefault()
                    addSpec()
                  }
                }}
                autoComplete="off"
              />
            </div>
            <button
              type="button"
              className="btn btn-icon"
              aria-label={t.action.removeSpec}
              onClick={() => removeSpec(i)}
            >
              <Icon name="close" size={20} />
            </button>
          </div>
        ))}
        <div>
          <button type="button" className="btn" onClick={addSpec}>
            <Icon name="add" size={20} />
            {t.action.addSpec}
          </button>
        </div>
      </fieldset>

      <div className="field">
        <label htmlFor="note">{t.form.note}</label>
        <textarea id="note" className="textarea" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {confirmingDiscard && (
        <div className="confirm" role="alertdialog" aria-labelledby="form-discard">
          <p id="form-discard">{t.confirm.saveOrDiscard}</p>
          <div className="row">
            <button type="button" className="btn btn-primary" autoFocus onClick={() => void onSubmit()}>
              {t.action.yes}
            </button>
            <a className="btn" href={href.detail(item.id)}>
              {t.action.no}
            </a>
          </div>
        </div>
      )}

      <div className="row">
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {t.action.save}
        </button>
        <a className="btn" href={href.detail(item.id)}>
          {t.action.cancel}
        </a>
      </div>
    </form>
  )
}
