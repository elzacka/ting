import { useRef, useState, type FormEvent } from 'react'
import { replaceAll, writeVault } from '../db/db'
import type { Item, Property } from '../db/schema'
import { itemsFromDataFile, openEnvelope, parseAnyFile, toBackupJson, type Envelope, type Loaded } from '../lib/backup'
import { columnDefs, type FieldSettings } from '../lib/fields'
import { downloadText, exportFilename } from '../lib/export'
import { formatDate } from '../lib/format'
import { missing } from '../lib/summary'
import { t } from '../lib/strings'
import type { useFolderSync } from '../lib/useFolderSync'
import { changePassphrase, currentKey, currentVault } from '../lib/vault'
import { Icon } from './Icons'
import { errorText } from '../lib/errors'
import { requestFullPhotoWrite } from '../lib/folderStore'

const timeFormat = new Intl.DateTimeFormat('nb-NO', { timeStyle: 'short' })
// Norwegian writes the time with a full stop: kl. 19.51
const formatTime = (ts: number) => timeFormat.format(ts).replace(':', '.')

type Props = {
  items: Item[]
  properties: Property[]
  fields: FieldSettings
  folder: ReturnType<typeof useFolderSync>
  autoLock: boolean
  onAutoLockChange: (on: boolean) => void
  hidden: Set<string>
  onHiddenChange: (id: string, visible: boolean) => void
  wrap: boolean
  onWrapChange: (on: boolean) => void
  onOpenQuery: (q: string) => void
}

export function StoragePage({
  items,
  properties,
  fields,
  folder,
  autoLock,
  onAutoLockChange,
  hidden,
  onHiddenChange,
  wrap,
  onWrapChange,
  onOpenQuery,
}: Props) {
  const gaps = missing(items, properties)
  const columns = columnDefs(fields, properties, items).filter((d) => d.kind === 'prop')
  const visibleCount = columns.filter((d) => !hidden.has(d.id)).length
  const { status, connect, grant, adopt, disconnect, useFolderSide, useLocalSide } = folder
  const fileRef = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<Loaded | null>(null)
  const [foreignCopy, setForeignCopy] = useState<Envelope | null>(null)
  const [copyPass, setCopyPass] = useState('')
  const [copyError, setCopyError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [folderPass, setFolderPass] = useState('')
  const [oldPass, setOldPass] = useState('')
  const [newPass, setNewPass] = useState('')
  const [passMessage, setPassMessage] = useState<string | null>(null)
  const [changingPass, setChangingPass] = useState(false)

  async function download() {
    const v = currentVault()
    if (!v) return
    downloadText(exportFilename('json'), await toBackupJson(items, properties, fields, currentKey(), v), 'application/json')
  }

  async function onFile(file: File | undefined) {
    setMessage(null)
    setCopyError(null)
    setForeignCopy(null)
    if (!file) return
    try {
      const parsed = parseAnyFile(await file.text())
      if (parsed.kind === 'plain') {
        setPending(await itemsFromDataFile(parsed.file))
      } else {
        const opened = await openEnvelope(parsed.envelope, currentKey())
        if (opened === 'foreign') setForeignCopy(parsed.envelope)
        else if (opened !== 'wrong-passphrase') setPending(await itemsFromDataFile(opened.file))
      }
    } catch (err) {
      console.error(errorText(err))
      setMessage(t.storage.restoreFailed)
    }
    if (fileRef.current) fileRef.current.value = ''
  }

  async function openForeignCopy(e: FormEvent) {
    e.preventDefault()
    if (!foreignCopy) return
    const opened = await openEnvelope(foreignCopy, currentKey(), copyPass)
    if (opened === 'wrong-passphrase' || opened === 'foreign') {
      setCopyError(t.vault.wrong)
      return
    }
    setForeignCopy(null)
    setCopyPass('')
    setPending(await itemsFromDataFile(opened.file))
  }

  async function restore() {
    if (!pending) return
    requestFullPhotoWrite()
    await replaceAll(pending.items, pending.properties, pending.fields)
    setMessage(t.storage.restoreDone(pending.items.length))
    setPending(null)
  }

  async function onChangePass(e: FormEvent) {
    e.preventDefault()
    setPassMessage(null)
    if (newPass.length < 12) return setPassMessage(t.vault.minLength)
    const v = await changePassphrase(oldPass, newPass)
    if (!v) return setPassMessage(t.vault.wrong)
    await writeVault(v)
    setOldPass('')
    setNewPass('')
    setChangingPass(false)
    setPassMessage(t.vault.changed)
  }

  return (
    <div className="stack narrow">
      {/* What is missing, above the settings since it is about the register,
          not the device: a quiet band, there only while something is missing.
          Each fact is a search that opens the overview narrowed to those things. */}
      {gaps.length > 0 && (
        <p className="notice" role="status">
          {gaps.map((m) => (
            <span key={m.query}>
              <button type="button" className="status-link" onClick={() => onOpenQuery(m.query)}>
                {m.what === 'photo' ? t.summary.missingPhoto(m.count) : t.summary.missingValue(m.count, m.key)}
              </button>
              .{' '}
            </span>
          ))}
        </p>
      )}

      <h1 className="title">{t.storage.title}</h1>

      <section className="setting">
        <div className="setting-head">
          <div>
            <h2 className="section-label">{t.storage.folderTitle}</h2>
            <p className="hint">{t.storage.folderWhat}</p>
          </div>
          <div className="row">
            {(status.kind === 'none' || status.kind === 'error') && (
              <button type="button" className="btn btn-icon" aria-label={t.storage.choose} onClick={connect}>
                <Icon name="folderOpen" />
              </button>
            )}
            {(status.kind === 'connected' || status.kind === 'error') && (
              <button type="button" className="btn btn-icon" aria-label={t.storage.disconnect} onClick={disconnect}>
                <Icon name="folderOff" />
              </button>
            )}
          </div>
        </div>
        {status.kind === 'unsupported' && <p>{t.storage.unsupported}</p>}
        {status.kind === 'checking' && <p className="hint">{t.storage.checking}</p>}
        {status.kind === 'needs-permission' && (
          <div className="stack-sm">
            <p>{t.storage.needsPermission(status.name)}</p>
            <div className="row">
              <button type="button" className="btn btn-primary" onClick={grant}>
                {t.storage.grant}
              </button>
              <button type="button" className="btn btn-icon" aria-label={t.storage.disconnect} onClick={disconnect}>
                <Icon name="folderOff" />
              </button>
            </div>
          </div>
        )}
        {status.kind === 'needs-passphrase' && (
          <form
            className="stack-sm"
            onSubmit={(e) => {
              e.preventDefault()
              void adopt(folderPass)
            }}
          >
            <p>{t.vault.folderForeign(status.name)}</p>
            <div className="field">
              <label htmlFor="folder-pass">{t.vault.password}</label>
              <input
                id="folder-pass"
                className="input"
                type="password"
                autoComplete="current-password"
                value={folderPass}
                onChange={(e) => setFolderPass(e.target.value)}
              />
            </div>
            {status.wrong && (
              <p className="error" role="alert">
                {t.vault.wrong}
              </p>
            )}
            <div className="row">
              <button type="submit" className="btn btn-primary">
                {t.vault.folderOpen}
              </button>
              <button type="button" className="btn btn-icon" aria-label={t.storage.disconnect} onClick={disconnect}>
                <Icon name="folderOff" />
              </button>
            </div>
          </form>
        )}
        {status.kind === 'connected' && (
          <p className="hint">
            {t.storage.connected(status.name)}{' '}
            <span className="num">
              {status.lastWrittenAt ? t.storage.lastWritten(formatTime(status.lastWrittenAt)) : t.storage.loaded}
            </span>
          </p>
        )}
        {status.kind === 'conflict' && (
          <div className="confirm" role="alertdialog" aria-labelledby="folder-conflict">
            <p id="folder-conflict">
              {t.storage.conflict(status.name, status.folderCount, formatDate(status.folderAt), status.localCount)}
            </p>
            <div className="row toolbar">
              <button type="button" className="btn" onClick={() => void useFolderSide()}>
                {t.storage.useFolder}
              </button>
              <button type="button" className="btn" onClick={() => void useLocalSide()}>
                {t.storage.useLocal}
              </button>
              <button type="button" className="btn" onClick={disconnect}>
                {t.action.cancel}
              </button>
            </div>
          </div>
        )}
        {status.kind === 'error' && (
          <p className="error" role="alert">
            {t.storage.error(status.name)}
          </p>
        )}
      </section>

      <section className="setting">
        <div className="setting-head">
          <div>
            <h2 className="section-label">{t.storage.copyTitle}</h2>
            <p className="hint">{t.storage.copyWhat}</p>
          </div>
          <div className="row">
            <button
              type="button"
              className="btn btn-icon"
              aria-label={t.storage.download}
              disabled={items.length === 0}
              onClick={() => void download()}
            >
              <Icon name="download" />
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="visually-hidden"
              onChange={(e) => void onFile(e.target.files?.[0])}
            />
            <button
              type="button"
              className="btn btn-icon"
              aria-label={t.storage.restore}
              onClick={() => fileRef.current?.click()}
            >
              <Icon name="upload" />
            </button>
          </div>
        </div>
        {foreignCopy && (
          <form className="stack-sm" onSubmit={openForeignCopy}>
            <p>{t.vault.copyForeign}</p>
            <div className="field">
              <label htmlFor="copy-pass">{t.vault.password}</label>
              <input
                id="copy-pass"
                className="input"
                type="password"
                autoComplete="current-password"
                value={copyPass}
                onChange={(e) => setCopyPass(e.target.value)}
                autoFocus
              />
            </div>
            {copyError && (
              <p className="error" role="alert">
                {copyError}
              </p>
            )}
            <div className="row">
              <button type="submit" className="btn btn-primary">
                {t.vault.unlock}
              </button>
              <button type="button" className="btn" onClick={() => setForeignCopy(null)}>
                {t.action.cancel}
              </button>
            </div>
          </form>
        )}
        {pending && (
          <div className="confirm" role="alertdialog" aria-labelledby="restore-text">
            <p id="restore-text">{t.storage.restoreConfirm(pending.items.length)}</p>
            <div className="row">
              <button type="button" className="btn btn-danger" onClick={() => void restore()} autoFocus>
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

      <section className="setting">
        <div className="setting-head">
          <div>
            <h2 className="section-label" id="view-title">
              {t.storage.viewTitle}
            </h2>
            <p className="hint" id="view-hint">
              {t.table.wrap}
            </p>
          </div>
          <span className="setting-check">
            <input
              type="checkbox"
              aria-labelledby="view-title view-hint"
              checked={wrap}
              onChange={(e) => onWrapChange(e.target.checked)}
            />
          </span>
        </div>
        <details className="disclosure">
          <summary>
            <span>{t.storage.viewList}</span>
            <span className="disclosure-meta">
              {t.storage.viewShown(visibleCount, columns.length)}
              <Icon name="chevronRight" size={16} className="disclosure-chevron" />
            </span>
          </summary>
          <div className="disclosure-body">
            {columns.map((def) => (
              <label key={def.id} className="check-option">
                <input
                  type="checkbox"
                  checked={!hidden.has(def.id)}
                  onChange={(e) => onHiddenChange(def.id, e.target.checked)}
                />
                <span>{def.col.key}</span>
              </label>
            ))}
          </div>
        </details>
      </section>

      <section className="setting">
        <div className="setting-head">
          <div>
            <h2 className="section-label" id="lock-title">
              {t.vault.lockTitle}
            </h2>
            <p className="hint" id="lock-hint">
              {t.vault.autoLockOption}
            </p>
          </div>
          <span className="setting-check">
            <input
              type="checkbox"
              aria-labelledby="lock-title lock-hint"
              checked={autoLock}
              onChange={(e) => onAutoLockChange(e.target.checked)}
            />
          </span>
        </div>
      </section>

      <section className="setting">
        <div className="setting-head">
          <div>
            <h2 className="section-label">{t.vault.changeTitle}</h2>
            <p className="hint">{t.vault.changeWhat}</p>
          </div>
          {!changingPass && (
            <button
              type="button"
              className="btn btn-icon"
              aria-label={t.vault.change}
              onClick={() => {
                setPassMessage(null)
                setChangingPass(true)
              }}
            >
              <Icon name="key" />
            </button>
          )}
        </div>
        {!changingPass ? (
          passMessage && (
            <p className="hint" role="status">
              {passMessage}
            </p>
          )
        ) : (
          <form className="stack-sm" onSubmit={(e) => void onChangePass(e)}>
            <div className="field">
              <label htmlFor="old-pass">{t.vault.current}</label>
              <input
                id="old-pass"
                className="input"
                type="password"
                autoComplete="current-password"
                value={oldPass}
                onChange={(e) => setOldPass(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="new-pass">{t.vault.next}</label>
              <input
                id="new-pass"
                className="input"
                type="password"
                autoComplete="new-password"
                value={newPass}
                onChange={(e) => setNewPass(e.target.value)}
              />
            </div>
            {passMessage && (
              <p className={passMessage === t.vault.changed ? 'hint' : 'error'} role="status">
                {passMessage}
              </p>
            )}
            <div className="row">
              <button type="submit" className="btn" disabled={oldPass === '' || newPass === ''}>
                {t.vault.change}
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setOldPass('')
                  setNewPass('')
                  setPassMessage(null)
                  setChangingPass(false)
                }}
              >
                {t.action.cancel}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  )
}
