import { useState } from 'react'
import { deleteItem } from '../db/db'
import type { Item } from '../db/schema'
import { formatDate, formatValue } from '../lib/format'
import { href, navigate } from '../lib/route'
import type { FieldSettings } from '../lib/fields'
import { t } from '../lib/strings'
import { Icon } from './Icons'
import { useObjectUrl } from './useObjectUrl'

export function ItemDetail({ item, fields }: { item: Item; fields: FieldSettings }) {
  const url = useObjectUrl(item.photo)
  const [confirming, setConfirming] = useState(false)

  async function onDelete() {
    await deleteItem(item.id)
    navigate(href.list)
  }

  return (
    <div className="stack narrow">
      <div>
        <h1 className="title">{item.name}</h1>
        {!fields.category.hidden && item.category !== '' && <p className="hint">{item.category}</p>}
      </div>

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
                <dd>{formatValue(s)}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      {item.note && (
        <section className="stack-sm">
          <h2 className="section-label">{t.detail.note}</h2>
          <p style={{ whiteSpace: 'pre-wrap' }}>{item.note}</p>
        </section>
      )}

      <p className="hint num">
        {t.detail.created} {formatDate(item.createdAt)}
        {item.updatedAt !== item.createdAt && ` · ${t.detail.updated} ${formatDate(item.updatedAt)}`}
      </p>

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
        <div className="row">
          <a className="btn" href={href.edit(item.id)}>
            <Icon name="edit" size={20} />
            {t.action.edit}
          </a>
          <button type="button" className="btn btn-danger" onClick={() => setConfirming(true)}>
            <Icon name="delete" size={20} />
            {t.action.delete}
          </button>
        </div>
      )}
    </div>
  )
}
