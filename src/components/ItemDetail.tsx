import { useRef, useState } from 'react'
import { deleteItem, updateItem } from '../db/db'
import { asImage } from '../lib/backup'
import type { Item } from '../db/schema'
import { formatValue } from '../lib/format'
import { href, navigate } from '../lib/route'
import { t } from '../lib/strings'
import { Icon } from './Icons'
import { useObjectUrl } from './useObjectUrl'
import { splitLinks } from '../lib/paste'

export function ItemDetail({ item }: { item: Item }) {
  const url = useObjectUrl(item.photo)
  const [confirming, setConfirming] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function onDelete() {
    await deleteItem(item.id)
    navigate(href.list)
  }

  // The photo is the one thing the table cannot hold, so it is set here.
  async function setPhoto(photo: Blob | null) {
    await updateItem(item.id, { name: item.name, specs: item.specs, photo })
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div className="stack narrow">
      <h1 className="title">{item.name}</h1>

      {url && <img className="photo" src={url} alt={t.detail.photoAlt(item.name)} />}

      <section className="stack-sm">
        <h2 className="section-label">{t.detail.specs}</h2>
        {item.specs.length === 0 ? (
          <p className="hint">{t.detail.noSpecs}</p>
        ) : (
          <dl className="specs">
            {item.specs.map((s, i) => (
              <div key={i}>
                <dt>{s.key}</dt>
                <dd>
                  <Linked text={formatValue(s)} />
                </dd>
              </div>
            ))}
          </dl>
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
