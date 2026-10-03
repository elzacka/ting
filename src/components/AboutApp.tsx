import pkg from '../../package.json?raw'
import { t } from '../lib/strings'

const repo = 'https://github.com/elzacka/ting'
// The version lives in package.json only
const version = (JSON.parse(pkg) as { version: string }).version

export function AboutApp() {
  return (
    <section className="setting">
      <h2 className="section-label">{t.about.title}</h2>
      <div className="row toolbar">
        <a className="btn" href={`${repo}/blob/main/PERSONVERN.md`} target="_blank" rel="noopener noreferrer">
          {t.about.privacy}
        </a>
        <a className="btn" href={repo} target="_blank" rel="noopener noreferrer">
          {t.about.source}
        </a>
      </div>
      <p className="hint num">{t.about.line(version)}</p>
    </section>
  )
}
