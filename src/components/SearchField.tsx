import { useRef } from 'react'
import { t } from '../lib/strings'
import { isMac } from '../lib/useSearchShortcut'
import { Icon } from './Icons'

type Props = {
  value: string
  onChange: (q: string) => void
  onClose: () => void
  listTip?: string
}

export function SearchField({ value, onChange, onClose, listTip }: Props) {
  const ref = useRef<HTMLInputElement>(null)
  const finePointer = window.matchMedia('(pointer: fine)').matches

  return (
    <>
      <div className="search search-block">
        <Icon name="search" size={20} className="icon-lead" />
        <label htmlFor="search" className="visually-hidden">
          {t.search.label}
        </label>
        <input
          ref={ref}
          id="search"
          className="input"
          type="search"
          inputMode="search"
          placeholder={t.search.placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Escape') return
            if (value !== '') onChange('')
            else onClose()
          }}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          autoFocus
        />
        {value !== '' ? (
          <button type="button" className="btn btn-icon" aria-label={t.search.clear} onClick={() => onChange('')}>
            <Icon name="close" size={20} />
          </button>
        ) : (
          finePointer && <kbd className="kbd">{isMac ? '⌘K' : 'Ctrl+K'}</kbd>
        )}
      </div>
      <details className="tips">
        <summary>
          {t.search.tips}
          <Icon name="chevronRight" size={14} className="tips-chevron" />
        </summary>
        <div className="tips-body">
          <div className="tips-grid">
            {t.search.tipRows.map(([example, meaning]) => (
              <div className="tips-row" key={example}>
                <code className="mono">{example}</code>
                <span>{meaning}</span>
              </div>
            ))}
          </div>
          {listTip && <p className="hint">{listTip}</p>}
        </div>
      </details>
    </>
  )
}
