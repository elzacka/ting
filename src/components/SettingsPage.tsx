import { useEffect, useRef, useState, type FormEvent } from 'react'
import { deletePasskey, readPasskey, replaceAll, writePasskey, writeVault } from '../db/db'
import type { Item, Property } from '../db/schema'
import { itemsFromDataFile, openEnvelope, parseAnyFile, toBackupJson, type Envelope, type Loaded } from '../lib/backup'
import { columnDefs, type FieldSettings } from '../lib/fields'
import { downloadText, exportFilename } from '../lib/export'
import { formatDate } from '../lib/format'
import { t } from '../lib/strings'
import type { useFolderSync } from '../lib/useFolderSync'
import type { OpenKey } from '../lib/crypto'
import { adoptVault, changePassphrase, currentKey, currentVault, setupVault, useVault } from '../lib/vault'
import { errorText } from '../lib/errors'
import { folderSupported, requestFullPhotoWrite } from '../lib/folderStore'
import { useNarrow } from '../lib/useNarrow'
import { createPasskey, passkeySupported, type PasskeyRecord } from '../lib/passkey'
import { Icon } from './Icons'
import { KeychainName } from './LockScreen'

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
}

export function SettingsPage({
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
}: Props) {
  const { status, connect, grant, adopt, disconnect, useFolderSide, useLocalSide } = folder
  const trial = useVault().status === 'trial'
  const columns = columnDefs(fields, properties, items).filter((d) => d.kind === 'prop')
  const visibleCount = columns.filter((d) => !hidden.has(d.id)).length
  const fileRef = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<Loaded | null>(null)
  // A copy opened with its own passphrase during a trial: restoring it takes
  // over that passphrase and key, since the trial's key dies with the tab
  const [adopting, setAdopting] = useState<{ vault: Envelope['vault']; open: OpenKey } | null>(null)
  const [setupPass, setSetupPass] = useState('')
  const [setupRepeat, setSetupRepeat] = useState('')
  const [foreignBackup, setForeignBackup] = useState<Envelope | null>(null)
  const [backupPass, setBackupPass] = useState('')
  const [backupError, setBackupError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [folderPass, setFolderPass] = useState('')
  const [oldPass, setOldPass] = useState('')
  const [newPass, setNewPass] = useState('')
  const [passMessage, setPassMessage] = useState<string | null>(null)
  const [changingPass, setChangingPass] = useState(false)
  // The table's own choices are desk work, and so is a folder where the
  // browser cannot reach one: no browser on a phone or a tablet can
  const narrow = useNarrow()
  const [touch] = useState(() => window.matchMedia('(pointer: coarse)').matches)
  const showFolder = folderSupported || !touch
  // A touch screen saves the copy through the share sheet (Filer, AirDrop,
  // e-post), which a download in an installed app on an iPhone cannot do
  const [shareable] = useState(
    () =>
      touch &&
      typeof navigator.canShare === 'function' &&
      navigator.canShare({ files: [new File([''], 'ting.json', { type: 'application/json' })] }),
  )

  // Face ID or Touch ID on this device, where it can verify its user. A copy
  // wrapping another data key (a restore took over another vault) is stale.
  const [canPasskey, setCanPasskey] = useState(false)
  const [passkey, setPasskey] = useState<PasskeyRecord | null>(null)
  const [passkeyBusy, setPasskeyBusy] = useState(false)
  const [passkeyMessage, setPasskeyMessage] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    void (async () => {
      const [can, record] = await Promise.all([passkeySupported(), readPasskey()])
      if (!live) return
      setCanPasskey(can)
      setPasskey(record && record.dekId === currentVault()?.dekId ? record : null)
    })()
    return () => {
      live = false
    }
  }, [])

  async function togglePasskey(on: boolean) {
    setPasskeyMessage(null)
    if (!on) {
      await deletePasskey()
      setPasskey(null)
      return
    }
    setPasskeyBusy(true)
    const made = await createPasskey(currentKey())
    setPasskeyBusy(false)
    if (made === 'cancelled') return
    if (made === 'failed') return setPasskeyMessage(t.vault.passkeyNotHere)
    await writePasskey(made)
    setPasskey(made)
  }

  async function download() {
    const v = currentVault()
    if (!v) return
    const name = exportFilename('json')
    const json = await toBackupJson(items, properties, fields, currentKey(), v)
    if (shareable) {
      try {
        await navigator.share({ files: [new File([json], name, { type: 'application/json' })] })
        return
      } catch (err) {
        // Closing the sheet is a choice; anything else falls back to a download
        if (err instanceof DOMException && err.name === 'AbortError') return
        console.error(errorText(err))
      }
    }
    downloadText(name, json, 'application/json')
  }

  async function onFile(file: File | undefined) {
    setMessage(null)
    setBackupError(null)
    setForeignBackup(null)
    if (!file) return
    try {
      const parsed = parseAnyFile(await file.text())
      if (parsed.kind === 'plain') {
        setPending(await itemsFromDataFile(parsed.file))
      } else {
        const opened = await openEnvelope(parsed.envelope, currentKey())
        if (opened === 'foreign') setForeignBackup(parsed.envelope)
        else if (opened !== 'wrong-passphrase') setPending(await itemsFromDataFile(opened.file))
      }
    } catch (err) {
      console.error(errorText(err))
      setMessage(t.settings.restoreFailed)
    }
    if (fileRef.current) fileRef.current.value = ''
  }

  async function openForeignBackup(e: FormEvent) {
    e.preventDefault()
    if (!foreignBackup) return
    const opened = await openEnvelope(foreignBackup, currentKey(), backupPass)
    if (opened === 'wrong-passphrase' || opened === 'foreign') {
      setBackupError(t.vault.wrong)
      return
    }
    if (trial) setAdopting({ vault: foreignBackup.vault, open: opened.open })
    setForeignBackup(null)
    setBackupPass('')
    setPending(await itemsFromDataFile(opened.file))
  }

  async function restore() {
    if (!pending) return
    if (trial && adopting) {
      adoptVault(adopting.vault, adopting.open)
      await writeVault(adopting.vault)
      setAdopting(null)
    }
    requestFullPhotoWrite()
    await replaceAll(pending.items, pending.properties, pending.fields)
    setMessage(t.settings.restoreDone(pending.items.length))
    setPending(null)
  }

  // The trial's key, wrapped under the passphrase chosen here: what was made
  // during the trial stays, and from now on the app opens locked.
  async function onSetup(e: FormEvent) {
    e.preventDefault()
    setPassMessage(null)
    if (setupPass.length < 12) return setPassMessage(t.vault.minLength)
    if (setupPass !== setupRepeat) return setPassMessage(t.vault.mismatch)
    await writeVault(await setupVault(setupPass))
    setSetupPass('')
    setSetupRepeat('')
    setPassMessage(t.trial.done)
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

  // The line under the folder's title says where things stand; what the
  // other states ask for comes underneath.
  const folderLine = trial
    ? t.trial.folderFirst
    : status.kind === 'none'
      ? t.settings.folderNone
      : status.kind === 'connected'
        ? `${t.settings.connected(status.name)} ${status.lastWrittenAt ? t.settings.lastWritten(formatTime(status.lastWrittenAt)) : t.settings.loaded}`
        : status.kind === 'checking'
          ? t.settings.checking
          : status.kind === 'unsupported'
            ? t.settings.unsupported
            : null

  const disconnectButton = (
    <button type="button" className="btn" onClick={disconnect}>
      {t.settings.disconnect}
    </button>
  )

  return (
    <div className="stack narrow">
      <h1 className="title">{t.settings.title}</h1>

      {trial && (
        <section className="setting">
          <div>
            <h2 className="section-label">{t.vault.setupTitle}</h2>
            <p className="hint">{t.trial.why}</p>
            <p className="hint">{t.trial.lost}</p>
          </div>
          <form className="stack-sm" onSubmit={(e) => void onSetup(e)}>
            <KeychainName />
            <div className="field">
              <label htmlFor="setup-pass">{t.vault.passphrase}</label>
              <input
                id="setup-pass"
                className="input"
                type="password"
                autoComplete="new-password"
                value={setupPass}
                onChange={(e) => setSetupPass(e.target.value)}
                autoFocus
              />
            </div>
            <div className="field">
              <label htmlFor="setup-repeat">{t.vault.repeat}</label>
              <input
                id="setup-repeat"
                className="input"
                type="password"
                autoComplete="new-password"
                value={setupRepeat}
                onChange={(e) => setSetupRepeat(e.target.value)}
              />
            </div>
            {passMessage && (
              <p className="error" role="alert">
                {passMessage}
              </p>
            )}
            <div className="row">
              <button type="submit" className="btn btn-primary" disabled={setupPass === '' || setupRepeat === ''}>
                {t.vault.create}
              </button>
            </div>
          </form>
        </section>
      )}

      {showFolder && (
        <section className="setting">
          <div className="setting-head">
            <div>
              <h2 className="section-label">{t.settings.folderTitle}</h2>
              {folderLine && <p className="hint num">{folderLine}</p>}
            </div>
            <div className="row">
              {!trial && (status.kind === 'none' || status.kind === 'error') && (
                <button type="button" className="btn" onClick={connect}>
                  {t.settings.choose}
                </button>
              )}
              {(status.kind === 'connected' || status.kind === 'error') && disconnectButton}
            </div>
          </div>
          {status.kind === 'needs-permission' && (
            <div className="stack-sm">
              <p>{t.settings.needsPermission(status.name)}</p>
              <div className="row">
                <button type="button" className="btn btn-primary" onClick={grant}>
                  {t.settings.grant}
                </button>
                {disconnectButton}
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
                <label htmlFor="folder-pass">{t.vault.passphrase}</label>
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
                {disconnectButton}
              </div>
            </form>
          )}
          {status.kind === 'conflict' && (
            <div className="confirm" role="alertdialog" aria-labelledby="folder-conflict">
              <p id="folder-conflict">
                {t.settings.conflict(status.name, status.folderCount, formatDate(status.folderAt), status.localCount)}
              </p>
              <div className="row toolbar">
                <button type="button" className="btn" onClick={() => void useFolderSide()}>
                  {t.settings.useFolder}
                </button>
                <button type="button" className="btn" onClick={() => void useLocalSide()}>
                  {t.settings.useLocal}
                </button>
                <button type="button" className="btn" onClick={disconnect}>
                  {t.action.cancel}
                </button>
              </div>
            </div>
          )}
          {status.kind === 'error' && (
            <p className="error" role="alert">
              {t.settings.error(status.name)}
            </p>
          )}
        </section>
      )}

      <section className="setting">
        <div className="setting-head">
          <div>
            <h2 className="section-label">{t.settings.backupTitle}</h2>
            <p className="hint">{t.settings.backupWhat}</p>
          </div>
          {!trial && (
            <button type="button" className="btn" disabled={items.length === 0} onClick={() => void download()}>
              {shareable ? t.settings.share : t.settings.download}
            </button>
          )}
        </div>
        {/* Replaces everything: set apart from the download, in the colour of
            what cannot be undone, and confirmed before anything is replaced */}
        <div className="row">
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="visually-hidden"
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
          <button type="button" className="btn btn-danger setting-danger" onClick={() => fileRef.current?.click()}>
            {t.settings.restore}
          </button>
        </div>
        {foreignBackup && (
          <form className="stack-sm" onSubmit={openForeignBackup}>
            <p>{t.vault.backupForeign}</p>
            <div className="field">
              <label htmlFor="backup-pass">{t.vault.passphrase}</label>
              <input
                id="backup-pass"
                className="input"
                type="password"
                autoComplete="current-password"
                value={backupPass}
                onChange={(e) => setBackupPass(e.target.value)}
                autoFocus
              />
            </div>
            {backupError && (
              <p className="error" role="alert">
                {backupError}
              </p>
            )}
            <div className="row">
              <button type="submit" className="btn btn-primary">
                {t.vault.unlock}
              </button>
              <button type="button" className="btn" onClick={() => setForeignBackup(null)}>
                {t.action.cancel}
              </button>
            </div>
          </form>
        )}
        {pending && (
          <div className="confirm" role="alertdialog" aria-labelledby="restore-text">
            <p id="restore-text">{t.settings.restoreConfirm(pending.items.length)}</p>
            <div className="row">
              <button type="button" className="btn btn-danger" onClick={() => void restore()} autoFocus>
                {t.settings.replace}
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

      {/* A choice and its sentence are one label: the text is part of the
          target, and the box sits right beside what it switches */}
      {!narrow && (
        <section className="setting">
          <h2 className="section-label">{t.settings.columnsTitle}</h2>
          <label className="check-option">
            <input type="checkbox" checked={wrap} onChange={(e) => onWrapChange(e.target.checked)} />
            <span>{t.table.wrap}</span>
          </label>
          {columns.length > 0 && (
            <details className="disclosure">
              <summary>
                <span>{t.settings.columnsList}</span>
                <span className="disclosure-meta">
                  {t.settings.columnsShown(visibleCount, columns.length)}
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
                    <span>{def.kind === 'prop' ? def.col.key : ''}</span>
                  </label>
                ))}
              </div>
            </details>
          )}
        </section>
      )}

      <section className="setting">
        <h2 className="section-label">{t.vault.lockTitle}</h2>
        <label className="check-option">
          <input type="checkbox" checked={autoLock} onChange={(e) => onAutoLockChange(e.target.checked)} />
          <span>{t.vault.autoLockOption}</span>
        </label>
        {!trial && canPasskey && (
          <label className="check-option">
            <input
              type="checkbox"
              checked={passkey !== null}
              disabled={passkeyBusy}
              onChange={(e) => void togglePasskey(e.target.checked)}
            />
            <span>{t.vault.passkeyOption}</span>
          </label>
        )}
        {passkeyMessage && (
          <p className="error" role="alert">
            {passkeyMessage}
          </p>
        )}
      </section>

      {/* During a trial the passphrase is chosen at the top instead */}
      {!trial && (
        <section className="setting">
          <div className="setting-head">
            <div>
              <h2 className="section-label">{t.vault.changeTitle}</h2>
              <p className="hint">{t.vault.changeWhat}</p>
            </div>
            {!changingPass && (
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
              <KeychainName />
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
      )}
    </div>
  )
}
