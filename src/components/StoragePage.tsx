import { useRef, useState } from 'react'
import { replaceAll } from '../db/db'
import type { Item, Property } from '../db/schema'
import { fromBackupJson, toBackupJson } from '../lib/backup'
import { downloadText, exportFilename } from '../lib/export'
import { t } from '../lib/strings'
import type { useFolderSync } from '../lib/useFolderSync'

const timeFormat = new Intl.DateTimeFormat('nb-NO', { timeStyle: 'short' })

type Props = { items: Item[]; properties: Property[]; folder: ReturnType<typeof useFolderSync>; locked: boolean }

export function StoragePage({ items, properties, folder, locked }: Props) {
  const { status, connect, grant, disconnect } = folder
  const fileRef = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<{ items: Item[]; properties: Property[] } | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  async function onFile(file: File | undefined) {
    setMessage(null)
    if (!file) return
    try {
      setPending(await fromBackupJson(await file.text()))
    } catch (err) {
      console.error(err)
      setMessage(t.storage.restoreFailed)
    }
    if (fileRef.current) fileRef.current.value = ''
  }

  async function restore() {
    if (!pending) return
    await replaceAll(pending.items, pending.properties)
    setMessage(t.storage.restoreDone(pending.items.length))
    setPending(null)
  }

  return (
    <div className="stack narrow">
      <h1 className="title">{t.storage.title}</h1>
      <p>{t.storage.intro}</p>

      <section className="stack-sm">
        <h2 className="section-label">{t.storage.folderTitle}</h2>
        <p className="hint">{t.storage.folderIntro}</p>
        {status.kind === 'unsupported' && <p>{t.storage.unsupported}</p>}
        {status.kind === 'checking' && <p className="hint">{t.storage.checking}</p>}
        {status.kind === 'none' && (
          <div>
            <button type="button" className="btn btn-primary" onClick={connect}>
              {t.storage.choose}
            </button>
          </div>
        )}
        {status.kind === 'needs-permission' && (
          <div className="stack-sm">
            <p>{t.storage.needsPermission(status.name)}</p>
            <div className="row">
              <button type="button" className="btn btn-primary" onClick={grant}>
                {t.storage.grant}
              </button>
              <button type="button" className="btn" onClick={disconnect}>
                {t.storage.disconnect}
              </button>
            </div>
          </div>
        )}
        {status.kind === 'connected' && (
          <div className="stack-sm">
            <p>
              {t.storage.connected(status.name)}{' '}
              <span className="hint num">
                {status.lastWrittenAt ? t.storage.lastWritten(timeFormat.format(status.lastWrittenAt)) : t.storage.loaded}
              </span>
            </p>
            {!locked && (
              <div>
                <button type="button" className="btn" onClick={disconnect}>
                  {t.storage.disconnect}
                </button>
              </div>
            )}
          </div>
        )}
        {status.kind === 'error' && (
          <div className="stack-sm">
            <p className="error" role="alert">
              {t.storage.error(status.name, status.message)}
            </p>
            <div className="row">
              <button type="button" className="btn btn-primary" onClick={connect}>
                {t.storage.choose}
              </button>
              <button type="button" className="btn" onClick={disconnect}>
                {t.storage.disconnect}
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="stack-sm">
        <h2 className="section-label">{t.storage.copyTitle}</h2>
        <p className="hint">{t.storage.copyIntro}</p>
        <div className="row toolbar">
          <button
            type="button"
            className="btn"
            disabled={items.length === 0}
            onClick={async () => downloadText(exportFilename('json'), await toBackupJson(items, properties), 'application/json')}
          >
            {t.storage.download}
          </button>
          <input ref={fileRef} type="file" accept="application/json,.json" className="visually-hidden" onChange={(e) => onFile(e.target.files?.[0])} />
          {!locked && (
            <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
              {t.storage.restore}
            </button>
          )}
        </div>
        {pending && (
          <div className="confirm" role="alertdialog" aria-labelledby="restore-text">
            <p id="restore-text">{t.storage.restoreConfirm(pending.items.length)}</p>
            <div className="row">
              <button type="button" className="btn btn-danger" onClick={restore} autoFocus>
                {t.storage.replace}
              </button>
              <button type="button" className="btn" onClick={() => setPending(null)}>
                {t.action.cancel}
              </button>
            </div>
          </div>
        )}
        {message && (
          <p className="hint" role="status">
            {message}
          </p>
        )}
      </section>
    </div>
  )
}
