import pkg from '../../package.json?raw'
import { t } from '../lib/strings'
import { Icon } from './Icons'

const repo = 'https://github.com/elzacka/ting'
// The version lives in package.json only
const version = (JSON.parse(pkg) as { version: string }).version

export function AboutApp() {
  return (
    <footer className="settings-footer">
      <div className="row toolbar">
        <a className="external-link" href={`${repo}/blob/main/PERSONVERN.md`} target="_blank" rel="noopener noreferrer">
          {t.about.privacy}
          <Icon name="openInNew" size={16} />
        </a>
        <a className="external-link" href={repo} target="_blank" rel="noopener noreferrer">
          {t.about.source}
          <Icon name="openInNew" size={16} />
        </a>
      </div>
      <p className="hint num">{t.about.line(version)}</p>
    </footer>
  )
}
