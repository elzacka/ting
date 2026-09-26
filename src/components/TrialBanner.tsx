import { href } from '../lib/route'
import { t } from '../lib/strings'
import { installSteps, useInstall } from '../lib/useInstall'
import { useNarrow } from '../lib/useNarrow'

// One quiet line under the top bar while there is no passphrase: that what is
// added now goes when the app closes, the way to keep it, and how to install
// the app where this browser can. It scrolls away with the page.
export function TrialBanner({ onSettings }: { onSettings: boolean }) {
  const install = useInstall()
  const narrow = useNarrow()
  const steps = installSteps(install)
  return (
    <div className="trial-banner" role="note">
      <span>{narrow ? t.trial.noticePhone : t.trial.notice}</span>
      {!onSettings && (
        <a className="trial-link" href={href.settings}>
          {t.trial.setPassphrase}
        </a>
      )}
      {install?.kind === 'prompt' && (
        <button type="button" className="summary-link" onClick={install.install}>
          {t.install.prompt}
        </button>
      )}
      {steps && <span>{steps}</span>}
    </div>
  )
}

// With a passphrase, in a browser that clears the data of a site nobody
// opens for seven days (Safari, and every browser on an iPhone): the same
// line, saying why installing keeps the register, until the app is installed.
export function InstallBanner() {
  const steps = installSteps(useInstall())
  if (!steps) return null
  return (
    <div className="trial-banner" role="note">
      <span>{t.install.evict}</span>
      <span>{steps}</span>
    </div>
  )
}
