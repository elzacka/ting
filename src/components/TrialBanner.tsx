import { t } from '../lib/strings'
import { installSteps, useInstall } from '../lib/useInstall'

const stepsId = 'install-steps'

// In the demo's top bar: the browser's own install prompt where it has one,
// else the steps for this browser, opened under the bar
export function DownloadButton({ stepsOpen, onSteps }: { stepsOpen: boolean; onSteps: (open: boolean) => void }) {
  const install = useInstall()
  if (install?.kind === 'prompt') {
    return (
      <button type="button" className="btn btn-primary btn-pill" onClick={install.install}>
        {t.demo.download}
      </button>
    )
  }
  return (
    <button
      type="button"
      className="btn btn-primary btn-pill"
      aria-expanded={stepsOpen}
      aria-controls={stepsId}
      onClick={() => onSteps(!stepsOpen)}
    >
      {t.demo.download}
    </button>
  )
}

export function DemoBanner({ stepsOpen }: { stepsOpen: boolean }) {
  const steps = installSteps(useInstall())
  return (
    <div className="trial-banner" role="note">
      <span>{t.demo.notice}</span>
      <span id={stepsId} className="install-steps" hidden={!stepsOpen}>
        {steps}
      </span>
    </div>
  )
}
