import { useEffect, useState } from 'react'
import { getSetting, setSetting } from '../db/db'
import { errorText } from '../lib/errors'
import { prefetchOcr, removeOcr } from '../lib/ocr'
import { receiptReadingKey } from '../lib/receiptItems'
import { t } from '../lib/strings'
import { SettingSwitch } from './Setting'

type State = 'off' | 'downloading' | 'ready' | 'failed'

// Kvitteringer: on downloads the text recognition into the cache, so a receipt
// reads without a network; off deletes it. One row: in its group on
// Innstillinger, in a card of its own on the receipt screen while it is off.
export function ReceiptSettings({ onReady }: { onReady?: () => void }) {
  const [state, setState] = useState<State>('off')

  useEffect(() => {
    void getSetting<boolean>(receiptReadingKey).then((on) => setState(on === true ? 'ready' : 'off'))
  }, [])

  async function toggle(on: boolean) {
    await setSetting(receiptReadingKey, on)
    if (!on) {
      setState('off')
      await removeOcr()
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
    <div className="setting-row">
      <SettingSwitch
        title={t.receipt.option}
        // Once on, the line says only that it is on; what it downloads matters until then
        description={state === 'ready' ? t.receipt.ready : t.receipt.what}
        checked={state !== 'off'}
        disabled={state === 'downloading'}
        onChange={(on) => void toggle(on)}
      />
      {state === 'downloading' && (
        <p className="setting-desc" role="status">
          {t.receipt.downloading}
        </p>
      )}
      {state === 'failed' && (
        <p className="error" role="alert">
          {t.receipt.downloadFailed}
        </p>
      )}
    </div>
  )
}
