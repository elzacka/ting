import { useEffect, useRef, useState, type FormEvent } from 'react'
import { isDemo } from '../lib/useInstall'
import {
  addPasskey,
  currentSecret,
  deleteRecoveryCode,
  getSetting,
  readPasskey,
  readRemember,
  removePasskey,
  writeRemember,
  writeVault,
} from '../db/db'
import { formatTime } from '../lib/format'
import { errorText } from '../lib/errors'
import { receiptReadingKey } from '../lib/receiptItems'
import type { Item, Property } from '../db/schema'
import { categoryNames, sharedByAll } from '../lib/categories'
import { categoryColumnId, columnDefs, type FieldSettings } from '../lib/fields'
import { t } from '../lib/strings'
import { useEscape } from '../lib/useEscape'
import type { useFolderSync } from '../lib/useFolderSync'
import { unlockVault } from '../lib/crypto'
import { changePassphrase, currentKey, useVault } from '../lib/vault'
import { folderSupported } from '../lib/folderStore'
import { useNarrow } from '../lib/useNarrow'
import { passkeySupported, type PasskeyRecord } from '../lib/passkey'
import { AboutApp } from './AboutApp'
import { ImportExport } from './ImportExport'
import { ReceiptBatch } from './ReceiptBatch'
import { ReceiptSettings } from './ReceiptSettings'
import { Icon } from './Icons'
import { KeychainName } from './LockScreen'
import { SettingGroup, SettingSwitch } from './Setting'
import { naturalOrder } from '../lib/collator'

// A touch screen, read once: what it is does not change while the app runs
const coarsePointer = window.matchMedia('(pointer: coarse)').matches

type Props = {
  items: Item[]
  properties: Property[]
  fields: FieldSettings
  folder: ReturnType<typeof useFolderSync>
  autoLock: boolean
  onAutoLockChange: (on: boolean) => void
  // Remembering the device or Face ID changes whether the app can lock
  onGateChange: () => void
  hidden: Set<string>
  onHiddenChange: (ids: readonly string[], visible: boolean) => void
  wrap: boolean
  onWrapChange: (on: boolean) => void
}

// A confirmation has said its piece after a few seconds; an error stays until the next try
function useFade(text: string | null, fades: boolean, clear: (text: null) => void) {
  useEffect(() => {
    if (text === null || !fades) return
    const timer = setTimeout(() => clear(null), 4000)
    return () => clearTimeout(timer)
  }, [text, fades, clear])
}

export function SettingsPage({
  items,
  properties,
  fields,
  folder,
  autoLock,
  onAutoLockChange,
  onGateChange,
  hidden,
  onHiddenChange,
  wrap,
  onWrapChange,
}: Props) {
  const { status, connect, grant, adopt, disconnect } = folder
  const vault = useVault()
  const trial = vault.status === 'trial'
  // Navn, always shown and first, then the properties every category uses, by name
  const categories = categoryNames(items, properties.find((p) => p.id === categoryColumnId))
  const columns = columnDefs(fields, properties, items)
    .filter((d) => d.kind === 'name' || sharedByAll(d.property, categories))
    .sort((a, b) => (a.kind === 'name' ? -1 : b.kind === 'name' ? 1 : naturalOrder.compare(a.col.key, b.col.key)))
  const hideable = columns.flatMap((d) => (d.kind === 'prop' ? [d.id] : []))
  const visibleCount = columns.filter((d) => !hidden.has(d.id)).length
  const [folderPass, setFolderPass] = useState('')
  const [oldPass, setOldPass] = useState('')
  const [newPass, setNewPass] = useState('')
  const [repeatPass, setRepeatPass] = useState('')
  const [passMessage, setPassMessage] = useState<string | null>(null)
  useFade(passMessage, passMessage === t.vault.changed || passMessage === t.vault.chosen, setPassMessage)
  const [changingPass, setChangingPass] = useState(false)
  // «Husk passord» turned off before there was a password: it takes effect once one is chosen
  const [pendingLock, setPendingLock] = useState(false)
  // A password or lock change under way: the form and the switch wait, so a second tap does nothing
  const [busy, setBusy] = useState(false)
  function cancelPassChange() {
    setOldPass('')
    setNewPass('')
    setRepeatPass('')
    setPassMessage(null)
    setChangingPass(false)
    setPendingLock(false)
  }
  useEscape(cancelPassChange, changingPass)

  // The secret a register is sealed with until the user chooses a password (`currentSecret`). The
  // demo shows a new register, without a password.
  const [secret, setSecret] = useState<string | null | undefined>(undefined)
  const openVault = vault.status === 'open' ? vault.vault : null
  useEffect(() => {
    if (!openVault) return
    let live = true
    currentSecret()
      .then((value) => live && setSecret(value))
      .catch((err: unknown) => console.error(errorText(err)))
    return () => {
      live = false
    }
  }, [openVault])
  const hasPassword = !trial && secret === null
  const known = trial || secret !== undefined
  // What needs the password (a copy to open elsewhere, a lock to open with it) opens its form first,
  // and stops; until it is known whether there is one, it only stops.
  const passwordRow = useRef<HTMLDivElement>(null)
  function askPassword(thenLock = false): boolean {
    if (hasPassword) return false
    if (!known) return true
    setPassMessage(null)
    setChangingPass(true)
    setPendingLock(thenLock)
    passwordRow.current?.scrollIntoView({ block: 'center' })
    return true
  }

  // The table's own choices are desk work, and so is a folder where the
  // browser cannot reach one: no browser on a phone or a tablet can
  const narrow = useNarrow()
  const [reading, setReading] = useState(false)
  useEffect(() => {
    void getSetting<boolean>(receiptReadingKey).then((on) => setReading(on === true))
  }, [])
  const showFolder = folderSupported || !coarsePointer

  // «Husk passord» on: the app opens without a question (the device key). Off: it locks and asks for
  // Face ID or Touch ID where the device has it, else for the password, which a password manager
  // fills after its own Face ID or Touch ID. Off needs a password behind it.
  const [remember, setRemember] = useState(true)
  const [canPasskey, setCanPasskey] = useState(false)
  const [passkey, setPasskey] = useState<PasskeyRecord | null>(null)
  useEffect(() => {
    let live = true
    void Promise.all([readRemember(), passkeySupported(), readPasskey()]).then(([on, can, record]) => {
      if (!live) return
      setRemember(on)
      setCanPasskey(can)
      setPasskey(record)
    })
    return () => {
      live = false
    }
  }, [])
  async function run(action: () => Promise<void>) {
    if (busy) return
    setBusy(true)
    try {
      await action()
    } catch (err) {
      console.error(errorText(err))
    } finally {
      setBusy(false)
    }
  }
  function toggleRemember(on: boolean) {
    if (!on && askPassword(true)) return
    void run(async () => {
      if (on) {
        await writeRemember(true)
        await removePasskey()
        setPasskey(null)
        setRemember(true)
        return onGateChange()
      }
      await lockThisDevice()
    })
  }
  // Without Face ID the password becomes the only way in, so it is asked once more: a forgotten
  // one must not lock the register for good
  const [confirmingLock, setConfirmingLock] = useState(false)
  const [lockPass, setLockPass] = useState('')
  const [lockWrong, setLockWrong] = useState(false)
  // Face ID or Touch ID first, where the device has it; closing its sheet keeps «Husk passord» on.
  // The app's gate keeps the device's copy of the key behind it, or deletes the copy without it.
  async function lockThisDevice(passwordJustChosen = false) {
    const made = canPasskey && passkey === null ? await addPasskey(currentKey().dekId) : null
    if (made === 'cancelled') return
    if (made && made !== 'failed') setPasskey(made)
    else if (passkey === null && !passwordJustChosen) return setConfirmingLock(true)
    await finishLock()
  }
  async function finishLock() {
    await writeRemember(false)
    setRemember(false)
    onGateChange()
  }
  function cancelLock() {
    setConfirmingLock(false)
    setLockPass('')
    setLockWrong(false)
  }
  useEscape(cancelLock, confirmingLock)
  function onConfirmLock(e: FormEvent) {
    e.preventDefault()
    const stored = vault.status === 'open' ? vault.vault : null
    void run(async () => {
      if (!stored || !(await unlockVault(lockPass, stored))) return setLockWrong(true)
      cancelLock()
      await finishLock()
    })
  }

  // A register from 1.16 may already lock, or keep a folder, with no password of its own: ask for one
  useEffect(() => {
    if (known && !hasPassword && !trial && (!remember || passkey !== null || status.kind === 'connected')) setChangingPass(true)
  }, [known, hasPassword, trial, remember, passkey, status.kind])

  // Without a password the register's own secret stands in for the current one
  function onChangePass(e: FormEvent) {
    e.preventDefault()
    setPassMessage(null)
    if (newPass.length < 12) return setPassMessage(t.vault.minLength)
    if (!hasPassword && newPass !== repeatPass) return setPassMessage(t.vault.mismatch)
    void run(async () => {
      const v = await changePassphrase(hasPassword ? oldPass : (secret ?? ''), newPass)
      if (!v) return setPassMessage(t.vault.wrong)
      await writeVault(v)
      if (!hasPassword) await deleteRecoveryCode()
      setSecret(null)
      if (pendingLock) {
        setPendingLock(false)
        await lockThisDevice(true)
      }
      setOldPass('')
      setNewPass('')
      setRepeatPass('')
      setChangingPass(false)
      setPassMessage(hasPassword ? t.vault.changed : t.vault.chosen)
    })
  }

  // The line under the folder's title says where things stand; what the
  // other states ask for comes underneath.
  const folderLine = trial
    ? null
    : status.kind === 'connected'
      ? `${t.settings.connected(status.name)} ${t.settings.lastWritten(formatTime(status.lastWrittenAt))}`
      : status.kind === 'checking'
        ? t.settings.checking
        : status.kind === 'unsupported'
          ? t.settings.unsupported
          : null

  // The one risk on the page, everything in this browser alone, shows as the button's red border.
  // The demo shows the button as a new register has it.
  const folderAtRisk = trial || status.kind === 'none'

  const disconnectButton = (
    <button type="button" className="btn" onClick={disconnect}>
      {t.settings.disconnect}
    </button>
  )

  return (
    <div className="settings narrow">
      <h1 className="title">{t.settings.title}</h1>

      {/* The demo shows every setting and changes none */}
      <fieldset className="settings-body" disabled={isDemo}>

      <SettingGroup title={t.vault.lockTitle}>
        <div className="setting-row" ref={passwordRow}>
          <div className="setting-main" style={known ? undefined : { visibility: 'hidden' }}>
            <div className="setting-text">
              <span className="setting-title">{t.vault.passwordTitle}</span>
            </div>
            {!changingPass && (
              <button
                type="button"
                className={hasPassword ? 'btn' : 'btn is-missing'}
                aria-label={hasPassword ? t.vault.change : undefined}
                onClick={() => {
                  setPassMessage(null)
                  setChangingPass(true)
                }}
              >
                {hasPassword ? t.vault.changeShort : t.vault.choose}
              </button>
            )}
          </div>
          {!changingPass ? (
            passMessage && (
              <p className="setting-desc" role="status">
                {passMessage}
              </p>
            )
          ) : (
            <form className="stack-sm" onSubmit={onChangePass}>
              <KeychainName />
              {hasPassword && (
                <div className="field">
                  <label htmlFor="old-pass">{t.vault.current}</label>
                  <input
                    id="old-pass"
                    className="input"
                    type="password"
                    autoComplete="current-password"
                    value={oldPass}
                    onChange={(e) => setOldPass(e.target.value)}
                    autoFocus
                  />
                </div>
              )}
              <div className="field">
                <label htmlFor="new-pass">{t.vault.next}</label>
                <input
                  id="new-pass"
                  className="input"
                  type="password"
                  autoComplete="new-password"
                  value={newPass}
                  onChange={(e) => setNewPass(e.target.value)}
                  autoFocus={!hasPassword}
                />
              </div>
              {!hasPassword && (
                <div className="field">
                  <label htmlFor="repeat-pass">{t.vault.repeat}</label>
                  <input
                    id="repeat-pass"
                    className="input"
                    type="password"
                    autoComplete="new-password"
                    value={repeatPass}
                    onChange={(e) => setRepeatPass(e.target.value)}
                  />
                </div>
              )}
              {passMessage && (
                <p className="error" role="status">
                  {passMessage}
                </p>
              )}
              <div className="row">
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={busy || newPass === '' || (hasPassword ? oldPass === '' : repeatPass === '')}
                >
                  {hasPassword ? t.vault.change : t.vault.choose}
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={cancelPassChange}
                >
                  {t.action.cancel}
                </button>
              </div>
            </form>
          )}
        </div>
        <div className="setting-row">
          <SettingSwitch title={t.vault.rememberPassword} checked={remember} disabled={busy || confirmingLock} onChange={toggleRemember} />
          {confirmingLock && (
            <form className="stack-sm" onSubmit={onConfirmLock}>
              <KeychainName />
              <div className="field">
                <label htmlFor="lock-pass">{t.vault.current}</label>
                <input
                  id="lock-pass"
                  className="input"
                  type="password"
                  autoComplete="current-password"
                  value={lockPass}
                  onChange={(e) => setLockPass(e.target.value)}
                  aria-invalid={lockWrong}
                  autoFocus
                />
              </div>
              {lockWrong && (
                <p className="error" role="alert">
                  {t.vault.wrong}
                </p>
              )}
              <div className="row">
                <button type="submit" className="btn btn-primary" disabled={busy || lockPass === ''}>
                  {t.vault.confirmLock}
                </button>
                <button type="button" className="btn" onClick={cancelLock}>
                  {t.action.cancel}
                </button>
              </div>
            </form>
          )}
        </div>
        {/* An app that opens directly has nothing to lock */}
        {!remember && (
          <div className="setting-row">
            <SettingSwitch title={t.vault.autoLockOption} checked={autoLock} onChange={onAutoLockChange} />
          </div>
        )}
      </SettingGroup>

      {!narrow && (
        <SettingGroup title={t.settings.columnsTitle}>
          <div className="setting-row">
            <SettingSwitch title={t.table.wrap} checked={wrap} onChange={onWrapChange} />
          </div>
          {columns.length > 1 && (
            <details className="setting-row disclosure">
              <summary>
                <span className="setting-title">{t.settings.columnsList}</span>
                <span className="disclosure-meta">
                  {t.settings.columnsShown(visibleCount, columns.length)}
                  <Icon name="chevronRight" size={16} className="disclosure-chevron" />
                </span>
              </summary>
              <div className="disclosure-body">
                {/* Only the link that would change something, as in the print dialog */}
                <div className="disclosure-actions">
                  {hideable.some((id) => hidden.has(id)) && (
                    <button type="button" className="summary-link" onClick={() => onHiddenChange(hideable, true)}>
                      {t.action.pickAll}
                    </button>
                  )}
                  {hideable.some((id) => !hidden.has(id)) && (
                    <button type="button" className="summary-link" onClick={() => onHiddenChange(hideable, false)}>
                      {t.action.pickNone}
                    </button>
                  )}
                </div>
                {columns.map((def) => (
                  <label key={def.id} className="check-option">
                    <input
                      type="checkbox"
                      checked={def.kind === 'name' || !hidden.has(def.id)}
                      disabled={def.kind === 'name'}
                      onChange={(e) => onHiddenChange([def.id], e.target.checked)}
                    />
                    <span>{def.kind === 'prop' ? def.col.key : (fields.name.label ?? t.table.name)}</span>
                  </label>
                ))}
              </div>
            </details>
          )}
        </SettingGroup>
      )}

      <SettingGroup title={t.settings.storageTitle} className="is-column-start">
        {showFolder && (
          <div className="setting-row">
            <div className="setting-main">
              <div className="setting-text">
                <span className="setting-title">{t.settings.folderTitle}</span>
                {folderLine && (
                  <p className="setting-desc num">{folderLine}</p>
                )}
              </div>
              <div className="row">
                {(trial || status.kind === 'none' || status.kind === 'error' || status.kind === 'connected') && (
                  <button
                    type="button"
                    className={folderAtRisk ? 'btn is-missing' : 'btn'}
                    aria-label={folderAtRisk ? t.settings.chooseNone : t.settings.choose}
                    onClick={() => askPassword() || void connect()}
                  >
                    {t.settings.chooseShort}
                  </button>
                )}
                {(status.kind === 'connected' || status.kind === 'error') && disconnectButton}
              </div>
            </div>
            {status.kind === 'needs-permission' && (
              <div className="stack-sm">
                <p>{t.settings.needsPermission(status.name)}</p>
                <div className="row">
                  <button type="button" className="btn btn-primary" onClick={() => askPassword() || void grant()}>
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
                <KeychainName />
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
            {status.kind === 'error' && (
              <p className="error" role="alert">
                {t.settings.error(status.name)}
              </p>
            )}
          </div>
        )}

        <ImportExport trial={trial} held={items.length} askPassword={askPassword} />

      </SettingGroup>

      {/* One receipt at a time from the phone's add screen; a batch from any screen, here */}
      <SettingGroup title={t.receipt.settingsTitle}>
        <ReceiptSettings onChange={setReading} />
        {reading && <ReceiptBatch items={items} properties={properties} fields={fields} />}
      </SettingGroup>

      <AboutApp />
      </fieldset>
    </div>
  )
}
