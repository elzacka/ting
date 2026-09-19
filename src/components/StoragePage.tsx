import { useRef, useState, type FormEvent } from 'react'
import { replaceAll, writeVault } from '../db/db'
import type { Item, Property } from '../db/schema'
import { itemsFromDataFile, openEnvelope, parseAnyFile, toBackupJson, type Envelope } from '../lib/backup'
import { downloadText, exportFilename } from '../lib/export'
import { t } from '../lib/strings'
import type { useFolderSync } from '../lib/useFolderSync'
import { changePassphrase, currentKey, currentVault } from '../lib/vault'
import { errorText } from '../lib/errors'

const timeFormat = new Intl.DateTimeFormat('nb-NO', { timeStyle: 'short' })

type Props = { items: Item[]; properties: Property[]; folder: ReturnType<typeof useFolderSync> }

type Pending = { items: Item[]; properties: Property[] }

export function StoragePage({ items, properties, folder }: Props) {
  const { status, connect, grant, adopt, disconnect } = folder
  const fileRef = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<Pending | null>(null)
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
    downloadText(exportFilename('json'), await toBackupJson(items, properties, currentKey(), v), 'application/json')
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
    await replaceAll(pending.items, pending.properties)
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
      <h1 className="title">{t.storage.title}</h1>

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
              <button type="button" className="btn" onClick={disconnect}>
                {t.storage.disconnect}
              </button>
            </div>
          </form>
        )}
        {status.kind === 'connected' && (
          <div className="stack-sm">
            <p>
              {t.storage.connected(status.name)}{' '}
              <span className="hint num">
                {status.lastWrittenAt ? t.storage.lastWritten(timeFormat.format(status.lastWrittenAt)) : t.storage.loaded}
              </span>
            </p>
            <div>
              <button type="button" className="btn" onClick={disconnect}>
                {t.storage.disconnect}
              </button>
            </div>
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
        <p className="hint">
          {t.storage.copyIntro} {t.storage.copyIsSealed}
        </p>
        <div className="row toolbar">
          <button type="button" className="btn" disabled={items.length === 0} onClick={() => void download()}>
            {t.storage.download}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="visually-hidden"
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
          <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
            {t.storage.restore}
          </button>
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

      <section className="stack-sm">
        <h2 className="section-label">{t.vault.changeTitle}</h2>
        <p className="hint">{t.vault.changeIntro}</p>
        {!changingPass ? (
          <div className="row">
            <button
              type="button"
              className="btn"
              onClick={() => {
                setPassMessage(null)
                setChangingPass(true)
              }}
            >
              {t.vault.change}
            </button>
            {passMessage && (
              <p className="hint" role="status">
                {passMessage}
              </p>
            )}
          </div>
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
