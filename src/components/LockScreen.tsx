import { useState, type FormEvent } from 'react'
import { t } from '../lib/strings'
import { Icon } from './Icons'

type Props =
  | { mode: 'setup'; onSetup: (passphrase: string) => Promise<void> }
  | { mode: 'unlock'; onUnlock: (passphrase: string) => Promise<boolean>; idle: boolean | undefined }

const minLength = 12

// Shown instead of the app until the data key is in memory.
export function LockScreen(props: Props) {
  const [pass, setPass] = useState('')
  const [repeat, setRepeat] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (props.mode === 'setup') {
      if (pass.length < minLength) return setError(t.vault.minLength)
      if (pass !== repeat) return setError(t.vault.mismatch)
      setBusy(true)
      await props.onSetup(pass)
      return
    }
    setBusy(true)
    const ok = await props.onUnlock(pass)
    setBusy(false)
    if (!ok) {
      setError(t.vault.wrong)
      setPass('')
    }
  }

  return (
    <form className="stack narrow" onSubmit={onSubmit}>
      <div>
        <h1 className="title">{props.mode === 'setup' ? t.vault.setupTitle : t.vault.unlockTitle}</h1>
        <p>{props.mode === 'setup' ? t.vault.setupIntro : t.vault.unlockIntro}</p>
        {props.mode === 'unlock' && props.idle && <p className="hint">{t.vault.autoLocked}</p>}
      </div>
      <div className="field">
        <label htmlFor="pass">{t.vault.password}</label>
        <input
          id="pass"
          className="input"
          type="password"
          autoComplete={props.mode === 'setup' ? 'new-password' : 'current-password'}
          value={pass}
          onChange={(e) => setPass(e.target.value)}
          aria-invalid={error !== null}
          autoFocus
        />
      </div>
      {props.mode === 'setup' && (
        <div className="field">
          <label htmlFor="pass2">{t.vault.repeat}</label>
          <input
            id="pass2"
            className="input"
            type="password"
            autoComplete="new-password"
            value={repeat}
            onChange={(e) => setRepeat(e.target.value)}
          />
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="row">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          <Icon name={props.mode === 'setup' ? 'lock' : 'lockOpen'} size={20} />
          {busy ? t.vault.working : props.mode === 'setup' ? t.vault.create : t.vault.unlock}
        </button>
      </div>
      <p className="hint">{t.vault.tech}</p>
    </form>
  )
}
