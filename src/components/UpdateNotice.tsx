import { useRegisterSW } from 'virtual:pwa-register/react'
import { t } from '../lib/strings'
import { Notice } from './Notice'

// The user decides when a new version takes over. Never swap the app underneath them.
export function UpdateNotice() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  if (!needRefresh) return null

  return (
    <Notice
      action={
        <div className="row">
          <button type="button" className="btn btn-primary" onClick={() => updateServiceWorker(true)}>
            {t.action.update}
          </button>
          <button type="button" className="btn" onClick={() => setNeedRefresh(false)}>
            {t.action.later}
          </button>
        </div>
      }
    >
      {t.notice.update}
    </Notice>
  )
}
