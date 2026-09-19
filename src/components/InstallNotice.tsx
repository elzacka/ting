import { useState } from 'react'
import { t } from '../lib/strings'
import { useInstallPrompt } from '../lib/useInstallPrompt'
import { Icon } from './Icons'

const dismissedKey = 'ting.installDismissed'

function readDismissed(): boolean {
  try {
    return localStorage.getItem(dismissedKey) === '1'
  } catch {
    return false
  }
}

// Offered once, in the page flow, until installed or dismissed. Chromium gets the
// native prompt; Safari gets the two steps inline, since it has no prompt.
export function InstallNotice() {
  const install = useInstallPrompt()
  const [dismissed, setDismissed] = useState(readDismissed)
  const [showSteps, setShowSteps] = useState(false)

  if (dismissed || install.kind === 'installed' || install.kind === 'unsupported') return null

  function dismiss() {
    try {
      localStorage.setItem(dismissedKey, '1')
    } catch {
      // Storage unavailable: the notice simply shows again next visit.
    }
    setDismissed(true)
  }

  async function onAction() {
    if (install.kind === 'chromium') {
      await install.promptEvent.prompt()
      const choice = await install.promptEvent.userChoice
      if (choice.outcome === 'accepted') dismiss()
      return
    }
    setShowSteps((v) => !v)
  }

  const steps =
    install.kind === 'ios-safari'
      ? t.install.stepsIos(install.isIPad)
      : install.kind === 'macos-safari'
        ? t.install.stepsMac
        : []

  return (
    <div className="notice notice-quiet" role="status">
      <Icon name="add" size={20} />
      <div className="stack-sm">
        <p>{t.install.title}</p>
        {showSteps && (
          <ol className="install-steps">
            {steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        )}
      </div>
      <div className="row">
        <button type="button" className="btn" onClick={onAction} aria-expanded={install.kind === 'chromium' ? undefined : showSteps}>
          {install.kind === 'chromium' ? t.install.install : showSteps ? t.install.hide : t.install.how}
        </button>
        <button type="button" className="btn btn-icon" aria-label={t.notice.dismiss} onClick={dismiss}>
          <Icon name="close" size={20} />
        </button>
      </div>
    </div>
  )
}
