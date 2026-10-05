import { useEffect, useState } from 'react'
import { getSetting, setSetting } from '../db/db'
import { errorText } from '../lib/errors'
import { disposeOcr, prefetchOcr } from '../lib/ocr'
import { ocrCacheName } from '../lib/ocr/models'
import { receiptReadingKey } from '../lib/receiptItems'
import { t } from '../lib/strings'

type State = 'off' | 'downloading' | 'ready' | 'failed'

// Kvitteringer: turning it on downloads the text recognition into the cache,
// so a receipt can be read later without a network; off deletes it again.
// Shown on Innstillinger, and on the receipt screen while it is off.
export function ReceiptSettings({ onReady }: { onReady?: () => void }) {
  const [state, setState] = useState<State>('off')

  useEffect(() => {
    void getSetting<boolean>(receiptReadingKey).then((on) => setState(on === true ? 'ready' : 'off'))
  }, [])

  async function toggle(on: boolean) {
    await setSetting(receiptReadingKey, on)
    if (!on) {
      setState('off')
      disposeOcr()
      await caches.delete(ocrCacheName)
      return
    }
    setState('downloading')
    try {
      await prefetchOcr()
      setState('ready')
      onReady?.()
    } catch (err) {
      console.error(errorText(err))
      setState('failed')
    }
  }

  return (
    <section className="setting">
      <div>
        <h2 className="section-label">{t.receipt.settingsTitle}</h2>
        <p className="hint">{t.receipt.what}</p>
      </div>
      <label className="check-option">
        <input
          type="checkbox"
          checked={state !== 'off'}
          disabled={state === 'downloading'}
          onChange={(e) => void toggle(e.target.checked)}
        />
        <span>{t.receipt.option}</span>
      </label>
      {state === 'downloading' && (
        <p className="hint" role="status">
          {t.receipt.downloading}
        </p>
      )}
      {state === 'ready' && <p className="hint">{t.receipt.ready}</p>}
      {state === 'failed' && (
        <p className="error" role="alert">
          {t.receipt.downloadFailed}
        </p>
      )}
    </section>
  )
}
