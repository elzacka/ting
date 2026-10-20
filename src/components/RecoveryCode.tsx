import { useEffect, useState } from 'react'
import { readRecoveryAck, readRecoveryCode, writeRecoveryAck } from '../db/db'
import { errorText } from '../lib/errors'
import { t } from '../lib/strings'

// The code the app made for this register: shown here at any time, to copy into a password manager
// or write down. It opens a backup or a file on a device that has not seen the register.
export function RecoveryCode({ onAck, version }: { onAck: () => void; version: number }) {
  const [code, setCode] = useState<string | undefined>()
  const [acked, setAcked] = useState(true)
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    void Promise.all([readRecoveryCode(), readRecoveryAck()])
      .then(([c, a]) => {
        setCode(c)
        setAcked(a)
      })
      .catch((err: unknown) => console.error(errorText(err)))
  }, [version])
  if (!code) return null

  async function copy() {
    if (!code) return
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
    } catch (err) {
      console.error(errorText(err))
    }
  }
  async function ack() {
    await writeRecoveryAck()
    setAcked(true)
    onAck()
  }

  return (
    <div className="setting-row">
      <span className="setting-title">{t.recovery.title}</span>
      <p className="setting-desc">{t.recovery.what}</p>
      <p>
        <code className="recovery-code">{code}</code>
      </p>
      <div className="row">
        <button type="button" className="btn" onClick={() => void copy()}>
          {copied ? t.recovery.copied : t.recovery.copy}
        </button>
        {!acked && (
          <button type="button" className="btn btn-primary" onClick={() => void ack()}>
            {t.recovery.saved}
          </button>
        )}
      </div>
    </div>
  )
}
