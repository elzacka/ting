import { useEffect, useRef, useState, type FormEvent } from 'react'
import { readRegister, replaceAll, writeVault } from '../db/db'
import { itemsFromDataFile, NewerFileError, openEnvelope, parseAnyFile, toBackupJson, type Envelope, type Loaded } from '../lib/backup'
import type { OpenKey, Vault } from '../lib/crypto'
import { downloadText, exportFilename } from '../lib/export'
import { formatDate } from '../lib/format'
import { requestFullPhotoWrite } from '../lib/folderStore'
import { nothingNew } from '../lib/merge'
import { t } from '../lib/strings'
import { fileExtras, markFetched, markSent, mergeIn, syncStatus, type MergeResult, type SyncStatus } from '../lib/sync'
import { adoptVault, currentKey, currentVault } from '../lib/vault'
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

// An opened file, waiting for merge or replace. Only a sealed file merges: it
// proves it came from a device holding the key; a plain one only replaces
type Opened = { loaded: Loaded; open: OpenKey | null; vault: Vault | null; mergeable: boolean }

// The register as one sealed file, out to a backup or another device, and back
// in: merged with what is here, or replacing it. A trial has no vault to seal under.
export function ImportExport({ trial, held }: { trial: boolean; held: number }) {
  const [status, setStatus] = useState<SyncStatus>({ sentAt: null, fetchedAt: null })
  const [result, setResult] = useState<string[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [foreign, setForeign] = useState<Envelope | null>(null)
  const [pass, setPass] = useState('')
  const [wrong, setWrong] = useState(false)
  const [choice, setChoice] = useState<Opened | null>(null)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  // Plain text, since Chrome's share sheet refuses .json. A touch screen shares
  // (Lagre i Filer is in the sheet); a desk downloads, as its sheet cannot save
  const [share] = useState(
    () =>
      window.matchMedia('(pointer: coarse)').matches &&
      typeof navigator.canShare === 'function' &&
      navigator.canShare({ files: [new File([''], 'ting.txt', { type: 'text/plain' })] }),
  )

  useEffect(() => {
    let live = true
    void syncStatus().then((st) => {
      if (live) setStatus(st)
    })
    return () => {
      live = false
    }
  }, [])

  async function exportFile() {
    const vault = currentVault()
    if (!vault) return
    setResult(null)
    setError(null)
    const register = await readRegister()
    const json = await toBackupJson(register.items, register.properties, register.fields, currentKey(), vault, await fileExtras(register, vault))
    const name = exportFilename('txt')
    if (share) {
      try {
        await navigator.share({ files: [new File([json], name, { type: 'text/plain' })] })
      } catch (err) {
        // Closing the sheet is a choice; anything else falls back to a download
        if (err instanceof DOMException && err.name === 'AbortError') return
        console.error(errorText(err))
        downloadText(name, json, 'text/plain')
      }
    } else downloadText(name, json, 'text/plain')
    await markSent()
    setStatus(await syncStatus())
  }

  // An empty register has nothing to lose: the file simply comes in
  async function consider(o: Opened) {
    if (held === 0) await replace(o)
    else setChoice(o)
  }

  async function merge(o: Opened) {
    if (!o.open) return
    setChoice(null)
    const adopted = o.open.dekId !== currentKey().dekId
    const r = await mergeIn(o.loaded, o.open, o.vault, { recordFetch: true })
    setResult([...describe(r, o.loaded), ...(adopted ? [t.sync.adopted] : [])])
    setStatus(await syncStatus())
  }

  async function replace(o: Opened) {
    setChoice(null)
    // The trial's key dies with the tab, so a file under another key brings its own
    const adopted = trial && o.open !== null && o.vault !== null && o.open.dekId !== currentKey().dekId
    if (adopted && o.open && o.vault) {
      adoptVault(o.vault, o.open)
      await writeVault(o.vault)
    }
    requestFullPhotoWrite()
    await replaceAll(o.loaded.items, o.loaded.properties, o.loaded.fields, o.loaded.tombstones)
    await markFetched()
    setResult([t.sync.replaced(o.loaded.items.length), ...(adopted ? [t.sync.adopted] : [])])
    setStatus(await syncStatus())
  }

  async function receive(file: File | undefined) {
    setResult(null)
    setError(null)
    setForeign(null)
    setChoice(null)
    if (fileRef.current) fileRef.current.value = ''
    if (!file) return
    setBusy(true)
    try {
      const parsed = parseAnyFile(await file.text())
      if (parsed.kind === 'plain') {
        await consider({ loaded: await itemsFromDataFile(parsed.file), open: null, vault: null, mergeable: false })
      } else {
        const opened = await openEnvelope(parsed.envelope, currentKey())
        if (opened === 'foreign') setForeign(parsed.envelope)
        else if (opened !== 'wrong-passphrase')
          await consider({ loaded: await itemsFromDataFile(opened.file), open: opened.open, vault: parsed.envelope.vault, mergeable: !trial })
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
      await consider({ loaded: await itemsFromDataFile(opened.file), open: opened.open, vault: foreign.vault, mergeable: !trial })
    } finally {
      setBusy(false)
    }
  }

  // On a Mac, AirDrop leaves the file in Downloads: it can be dragged in here
  useEffect(() => {
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

  return (
    <>
      <div className="setting-row">
        <div className="setting-main">
          <div className="setting-text">
            <span id="import-title" className="setting-title">
              {t.sync.importTitle}
            </span>
            <p id="import-what" className="setting-desc num">
              {status.fetchedAt
                ? `${t.sync.importWhat}. ${t.sync.imported(formatDate(status.fetchedAt), formatTime(status.fetchedAt))}`
                : t.sync.importWhat}
            </p>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="text/plain,.txt,application/json,.json"
            className="visually-hidden"
            onChange={(e) => void receive(e.target.files?.[0])}
          />
          <button
            type="button"
            className="btn"
            disabled={busy}
            aria-describedby="import-title import-what"
            onClick={() => fileRef.current?.click()}
          >
            {t.sync.pick}
          </button>
        </div>
        {foreign && (
          <form className="stack-sm" onSubmit={(e) => void openForeign(e)}>
            <p>{t.sync.foreign}</p>
            <div className="field">
              <label htmlFor="import-pass">{t.vault.passphrase}</label>
              <input
                id="import-pass"
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
                {t.vault.unlock}
              </button>
              <button type="button" className="btn" onClick={() => setForeign(null)}>
                {t.action.cancel}
              </button>
            </div>
          </form>
        )}
        {choice && (
          // A merge loses nothing, so only a replace-only question looks like a warning
          <div className={choice.mergeable ? 'stack-sm' : 'confirm'} role="alertdialog" aria-labelledby="import-ask">
            <p id="import-ask">
              {choice.mergeable ? t.sync.ask(held, choice.loaded.items.length) : t.sync.replaceOnly(choice.loaded.items.length)}
              {/* A merge under another key takes over that key's passphrase: said before, not only after */}
              {choice.mergeable && choice.open && choice.open.dekId !== currentKey().dekId && ` ${t.sync.askAdopt}`}
            </p>
            <div className="row">
              {choice.mergeable && (
                <button type="button" className="btn btn-primary" onClick={() => void merge(choice)} autoFocus>
                  {t.sync.merge}
                </button>
              )}
              <button type="button" className="btn btn-danger" onClick={() => void replace(choice)} autoFocus={!choice.mergeable}>
                {t.sync.replace}
              </button>
              <button type="button" className="btn" onClick={() => setChoice(null)}>
                {t.action.cancel}
              </button>
            </div>
          </div>
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
      </div>
      {!trial && (
        <div className="setting-row">
          <div className="setting-main">
            <div className="setting-text">
              <span id="export-title" className="setting-title">
                {t.sync.exportTitle}
              </span>
              <p id="export-what" className="setting-desc num">
                {status.sentAt
                  ? `${t.sync.exportWhat}. ${t.sync.exported(formatDate(status.sentAt), formatTime(status.sentAt))}`
                  : t.sync.exportWhat}
              </p>
            </div>
            <button type="button" className="btn" aria-describedby="export-title export-what" onClick={() => void exportFile()}>
              {t.sync.exportButton}
            </button>
          </div>
        </div>
      )}
    </>
  )
}
