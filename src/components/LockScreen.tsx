import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { PasskeyFailure } from '../lib/passkey'
import { t } from '../lib/strings'
import { unlockMethod } from '../lib/unlockMethod'
import { Icon } from './Icons'

type Props = {
  onUnlock: (passphrase: string) => Promise<boolean>
  // Set when this device opens the app with a passkey (Face ID, Touch ID, Windows Hello, the screen lock)
  onPasskey: (() => Promise<'ok' | PasskeyFailure>) | undefined
  idle: boolean | undefined
}

// Shown instead of the app until the data key is in memory.
export function LockScreen(props: Props) {
  const [pass, setPass] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [show, setShow] = useState(false)
  const passRef = useRef<HTMLInputElement>(null)
  const onPasskey = props.onPasskey
  const [passkeyFailed, setPasskeyFailed] = useState(false)
  const asked = useRef(false)

  async function tryPasskey() {
    if (!onPasskey) return
    setPasskeyFailed(false)
    setBusy(true)
    const result = await onPasskey()
    setBusy(false)
    if (result === 'failed') setPasskeyFailed(true)
  }

  // Face ID is asked for as the lock screen shows, once: an app that opens
  // with a glance. Closing the sheet leaves the button and the passphrase.
  useEffect(() => {
    if (!onPasskey || asked.current || document.visibilityState !== 'visible') return
    asked.current = true
    void tryPasskey()
  }, [onPasskey])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    const ok = await props.onUnlock(pass)
    setBusy(false)
    if (!ok) {
      setError(t.vault.wrong)
      passRef.current?.select()
    }
  }

  return (
    <form className="stack narrow" onSubmit={onSubmit}>
      <div>
        <h1 className="title">{t.vault.unlockTitle}</h1>
        {props.idle && <p className="hint">{t.vault.autoLocked}</p>}
      </div>
      {onPasskey && (
        <div className="stack-sm">
          <div className="row">
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void tryPasskey()}>
              <Icon name="lockOpen" size={20} />
              {t.vault.passkeyUnlock(unlockMethod())}
            </button>
          </div>
          {passkeyFailed && (
            <p className="error" role="alert">
              {t.vault.passkeyFailed(unlockMethod())}
            </p>
          )}
        </div>
      )}
      {/* The password manager files the password under Ting and fills it after its own Face ID */}
      <KeychainName />
      <div className="field">
        <label htmlFor="pass">{t.vault.passphrase}</label>
        <div className="input-reveal">
          <input
            id="pass"
            ref={passRef}
            className="input"
            type={show ? 'text' : 'password'}
            autoComplete="current-password"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            aria-invalid={error !== null}
            // With Face ID the keyboard would cover its sheet
            autoFocus={!onPasskey}
          />
          <button
            type="button"
            className="btn btn-icon"
            aria-label={show ? t.vault.hide : t.vault.show}
            aria-pressed={show}
            onClick={() => setShow(!show)}
          >
            <Icon name={show ? 'visibilityOff' : 'visibility'} />
          </button>
        </div>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="row">
        <button type="submit" className={onPasskey ? 'btn' : 'btn btn-primary'} disabled={busy}>
          <Icon name="lockOpen" size={20} />
          {busy ? t.vault.working : t.vault.unlock}
        </button>
      </div>
    </form>
  )
}

// Another device's or file's password is asked for, never saved: GitHub Pages gives every app of
// the account one origin, so a manager cannot tell which login it is and offers another app's
export const codeField = { 'data-1p-ignore': true, 'data-lpignore': 'true', 'data-bwignore': 'true' } as const

// A password manager files a password under an account name, and iOS and
// 1Password offer to fill one without it less readily. Out of sight and out
// of the tab order; it only gives the passphrase a name.
export function KeychainName() {
  return (
    <input
      type="text"
      name="username"
      autoComplete="username"
      value={t.vault.keychainName}
      readOnly
      tabIndex={-1}
      aria-hidden="true"
      className="visually-hidden"
    />
  )
}
