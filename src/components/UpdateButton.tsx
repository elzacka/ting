import { useRegisterSW } from 'virtual:pwa-register/react'
import { t } from '../lib/strings'
import { Icon } from './Icons'

// A quiet header button that appears when a new version is ready. The user
// decides when it takes over; nothing is swapped underneath them.
export function UpdateButton() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  if (!needRefresh) return null

  return (
    <button
      type="button"
      className="btn btn-icon is-active"
      aria-label={t.notice.update}
      title={t.notice.update}
      onClick={() => updateServiceWorker(true)}
    >
      <Icon name="autorenew" />
    </button>
  )
}
