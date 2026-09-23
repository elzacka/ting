import { useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { errorText } from '../lib/errors'
import { t } from '../lib/strings'
import { Icon } from './Icons'

// Time the new version gets to take over before the page reloads anyway
const fallbackMs = 4000

// A quiet header button that appears when a new version is ready. The user
// decides when it takes over; nothing is swapped underneath them.
//
// The reload does not wait for the page's own controller to change: a window
// the old version never controlled (a hard reload, the first visit) gets no
// such event, and the button used to sit there doing nothing. It waits for
// the new version to be active instead, and reloads at once when it already
// is (another window took it over first).
export function UpdateButton() {
  const {
    needRefresh: [needRefresh],
  } = useRegisterSW()
  const [busy, setBusy] = useState(false)

  if (!needRefresh) return null

  async function update() {
    setBusy(true)
    try {
      const waiting = (await navigator.serviceWorker.getRegistration())?.waiting
      if (waiting) {
        waiting.addEventListener('statechange', () => {
          if (waiting.state === 'activated') window.location.reload()
        })
        waiting.postMessage({ type: 'SKIP_WAITING' })
        setTimeout(() => window.location.reload(), fallbackMs)
        return
      }
    } catch (err) {
      console.error(errorText(err))
    }
    window.location.reload()
  }

  return (
    <button
      type="button"
      className="btn btn-icon is-active"
      aria-label={t.notice.update}
      aria-busy={busy}
      disabled={busy}
      onClick={() => void update()}
    >
      <Icon name="autorenew" />
    </button>
  )
}
