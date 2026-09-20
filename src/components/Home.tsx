import { useMemo } from 'react'
import type { Item, Property } from '../db/schema'
import type { FieldSettings } from '../lib/fields'
import { formatNumber } from '../lib/format'
import { facets, missing, totals } from '../lib/home'
import { href } from '../lib/route'
import { t } from '../lib/strings'
import type { useFolderSync } from '../lib/useFolderSync'
import { Icon } from './Icons'

type Props = {
  items: Item[]
  properties: Property[]
  fields: FieldSettings
  folder: ReturnType<typeof useFolderSync>['status']
  onAddItem: () => void
  onOpenFilter: (id: string, valueKey: string) => void
  onOpenQuery: (query: string) => void
}

const timeFormat = new Intl.DateTimeFormat('nb-NO', { timeStyle: 'short' })

export function Home({ items, properties, fields, folder, onAddItem, onOpenFilter, onOpenQuery }: Props) {
  const sums = useMemo(() => totals(items, properties), [items, properties])
  const groups = useMemo(() => facets(items, properties, fields), [items, properties, fields])
  const gaps = useMemo(() => missing(items, properties), [items, properties])

  const storageLine =
    folder.kind === 'connected'
      ? `${t.storage.connected(folder.name)} ${
          folder.lastWrittenAt ? t.storage.lastWritten(timeFormat.format(folder.lastWrittenAt).replace(':', '.')) : t.storage.loaded
        }`
      : folder.kind === 'none' || folder.kind === 'unsupported' || folder.kind === 'checking'
        ? t.home.storageNone
        : t.home.storageStalled

  return (
    <div className="stack">
      {items.length === 0 ? (
        <p className="hint">{t.list.empty}</p>
      ) : (
        <div className="stats">
          <div className="stat">
            <span className="stat-value num">{items.length}</span>
            <span className="hint">{t.home.things}</span>
          </div>
          {sums.map((s) => (
            <div className="stat" key={s.key}>
              <span className="stat-value num">
                {formatNumber(s.sum)} {s.unit}
              </span>
              <span className="hint">{t.home.total(s.key)}</span>
            </div>
          ))}
        </div>
      )}

      <div>
        <button type="button" className="btn btn-primary" onClick={onAddItem}>
          <Icon name="add" size={20} />
          {t.table.addRow}
        </button>
      </div>

      {groups.length > 0 && (
        <div className="facets">
          {groups.map((g) => (
            <section className="stack-sm" key={g.id}>
              <h2 className="section-label">{g.label}</h2>
              <ul className="facet">
                {g.values.map((v) => (
                  <li key={v.key}>
                    <button type="button" className="facet-link" onClick={() => onOpenFilter(g.id, v.key)}>
                      {v.label}
                    </button>
                    <span className="num">{v.count}</span>
                  </li>
                ))}
                {g.more > 0 && (
                  <li>
                    <span className="hint">{t.home.more(g.more)}</span>
                  </li>
                )}
              </ul>
            </section>
          ))}
        </div>
      )}

      {gaps.length > 0 && (
        <section className="stack-sm">
          <h2 className="section-label">{t.home.missingTitle}</h2>
          <ul className="facet facet-narrow">
            {gaps.map((m) => (
              <li key={m.query}>
                <button type="button" className="facet-link" onClick={() => onOpenQuery(m.query)}>
                  {m.what === 'photo' ? t.home.missingPhoto(m.count) : t.home.missingValue(m.count, m.key)}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className={folder.kind === 'error' || folder.kind === 'needs-permission' || folder.kind === 'needs-passphrase' || folder.kind === 'conflict' ? 'hint stalled' : 'hint'}>
        {storageLine} <a href={href.storage}>{t.home.storageLink}</a>
      </p>
    </div>
  )
}
