import { useEffect, useRef, useState, type FormEvent } from 'react'
import { getSetting, readRegister, setSetting } from '../db/db'
import { itemsFromDataFile, NewerFileError, openEnvelope, parseAnyFile, toBackupJson, type Envelope, type Loaded } from '../lib/backup'
import type { OpenKey, Vault } from '../lib/crypto'
import { downloadText, exportFilename } from '../lib/export'
import { formatDate } from '../lib/format'
import { nothingNew } from '../lib/merge'
import { t } from '../lib/strings'
import { fileExtras, markSent, mergeIn, syncEnabledKey, syncStatus, type MergeResult, type SyncStatus } from '../lib/sync'
import { currentKey, currentVault } from '../lib/vault'
import { errorText } from '../lib/errors'

const timeFormat = new Intl.DateTimeFormat('nb-NO', { timeStyle: 'short' })
const formatTime = (ts: number) => timeFormat.format(ts).replace(':', '.')

// What a merge did, in the order a reader needs it
function describe(r: MergeResult, loaded: Loaded): string[] {
  const date = formatDate(loaded.exportedAt)
  const time = formatTime(loaded.exportedAt)
  const s = r.summary
  const lines: string[] = []
  if (nothingNew(s)) lines.push(t.sync.nothing(date, time))
  else {
    const counts = t.sync.counts(s.added, s.changed, s.deleted)
    lines.push(`${t.sync.from(loaded.deviceName, date, time)}${counts ? `: ${counts}` : ''}.`)
    if (s.layout) lines.push(t.sync.layout)
    if (s.both > 0) lines.push(t.sync.both(s.both))
  }
  if (r.future) lines.push(t.sync.future)
  if (r.passphraseChanged) lines.push(t.sync.passphraseChanged)
  return lines
}

// Synkroniser: send the register with AirDrop (the share sheet) and merge in
// what comes back. Off until switched on; the stamps are kept either way.
export function DeviceSync() {
  const [on, setOn] = useState(false)
  const [status, setStatus] = useState<SyncStatus>({ sentAt: null, fetchedAt: null })
  const [result, setResult] = useState<string[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [foreign, setForeign] = useState<Envelope | null>(null)
  const [pass, setPass] = useState('')
  const [wrong, setWrong] = useState(false)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let live = true
    void (async () => {
      const [enabled, st] = await Promise.all([getSetting<boolean>(syncEnabledKey), syncStatus()])
      if (!live) return
      setOn(enabled === true)
      setStatus(st)
    })()
    return () => {
      live = false
    }
  }, [])

  async function toggle(next: boolean) {
    setOn(next)
    await setSetting(syncEnabledKey, next)
  }

  async function send() {
    const vault = currentVault()
    if (!vault) return
    setResult(null)
    setError(null)
    const register = await readRegister()
    const json = await toBackupJson(register.items, register.properties, register.fields, currentKey(), vault, await fileExtras(register, vault))
    const name = exportFilename('json')
    const file = new File([json], name, { type: 'application/json' })
    // Safari offers AirDrop in the share sheet; Chrome refuses .json there and downloads
    if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file] })
        await markSent()
        setStatus(await syncStatus())
        return
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return
        console.error(errorText(err))
      }
    }
    downloadText(name, json, 'application/json')
    await markSent()
    setStatus(await syncStatus())
  }

  async function merge(loaded: Loaded, open: OpenKey, envelopeVault: Vault | null) {
    const r = await mergeIn(loaded, open, envelopeVault, { recordFetch: true })
    setResult(describe(r, loaded))
    setStatus(await syncStatus())
  }

  async function receive(file: File | undefined) {
    setResult(null)
    setError(null)
    setForeign(null)
    if (fileRef.current) fileRef.current.value = ''
    if (!file) return
    setBusy(true)
    try {
      const parsed = parseAnyFile(await file.text())
      // Only a sealed file is merged: it proves it came from a device holding
      // the key. A plain one is a backup from before encryption, for Gjenopprett
      if (parsed.kind === 'plain') {
        setError(t.sync.notTing)
      } else {
        const opened = await openEnvelope(parsed.envelope, currentKey())
        if (opened === 'foreign') setForeign(parsed.envelope)
        else if (opened !== 'wrong-passphrase') await merge(await itemsFromDataFile(opened.file), opened.open, parsed.envelope.vault)
      }
    } catch (err) {
      console.error(errorText(err))
      setError(err instanceof NewerFileError ? t.sync.newer : t.sync.notTing)
    } finally {
      setBusy(false)
    }
  }

  async function openForeign(e: FormEvent) {
    e.preventDefault()
    if (!foreign) return
    setBusy(true)
    try {
      const opened = await openEnvelope(foreign, currentKey(), pass)
      if (opened === 'wrong-passphrase' || opened === 'foreign') return setWrong(true)
      setForeign(null)
      setPass('')
      setWrong(false)
      await merge(await itemsFromDataFile(opened.file), opened.open, foreign.vault)
    } finally {
      setBusy(false)
    }
  }

  // On a Mac, AirDrop leaves the file in Downloads: it can be dragged in here
  useEffect(() => {
    if (!on) return
    const over = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) e.preventDefault()
    }
    const drop = (e: DragEvent) => {
      const file = e.dataTransfer?.files[0]
      if (!file) return
      e.preventDefault()
      void receive(file)
    }
    document.addEventListener('dragover', over)
    document.addEventListener('drop', drop)
    return () => {
      document.removeEventListener('dragover', over)
      document.removeEventListener('drop', drop)
    }
  })

  const statusLine = [
    status.sentAt ? t.sync.sent(formatDate(status.sentAt), formatTime(status.sentAt)) : null,
    status.fetchedAt ? t.sync.fetched(formatDate(status.fetchedAt), formatTime(status.fetchedAt)) : null,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <section className="setting">
      <div>
        <h2 className="section-label">{t.sync.title}</h2>
        <p className="hint">{t.sync.what}</p>
      </div>
      <label className="check-option">
        <input type="checkbox" checked={on} onChange={(e) => void toggle(e.target.checked)} />
        <span>{t.sync.option}</span>
      </label>
      {on && (
        <>
          <div className="row toolbar">
            <button type="button" className="btn" onClick={() => void send()}>
              {t.sync.send}
            </button>
            <input
              id="sync-file"
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="visually-hidden"
              onChange={(e) => void receive(e.target.files?.[0])}
            />
            <button type="button" className="btn" disabled={busy} onClick={() => fileRef.current?.click()}>
              {t.sync.fetch}
            </button>
          </div>
          {statusLine && <p className="hint num">{statusLine}</p>}
        </>
      )}
      {foreign && (
        <form className="stack-sm" onSubmit={(e) => void openForeign(e)}>
          <p>{t.sync.foreign}</p>
          <div className="field">
            <label htmlFor="sync-pass">{t.vault.passphrase}</label>
            <input
              id="sync-pass"
              className="input"
              type="password"
              autoComplete="current-password"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              autoFocus
            />
          </div>
          {wrong && (
            <p className="error" role="alert">
              {t.vault.wrong}
            </p>
          )}
          <div className="row">
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {t.sync.fetch}
            </button>
            <button type="button" className="btn" onClick={() => setForeign(null)}>
              {t.action.cancel}
            </button>
          </div>
        </form>
      )}
      {result && (
        <div role="status">
          {result.map((line) => (
            <p key={line} className="hint">
              {line}
            </p>
          ))}
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
