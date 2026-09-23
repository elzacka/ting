import { useRef } from 'react'
import type { Tip } from '../lib/searchTips'
import { t } from '../lib/strings'
import { isMac } from '../lib/useSearchShortcut'
import { Icon } from './Icons'

type Props = {
  value: string
  onChange: (q: string) => void
  // The desk's panel closes on Escape; the phone's field is always there
  onClose?: () => void
  // Søketips teach keyboard syntax: the desk has them, the phone does not
  tips?: readonly Tip[]
  // Opened by a click, the field takes the focus; the phone's field waits for a tap
  autoFocus?: boolean
}

export function SearchField({ value, onChange, onClose, tips = [], autoFocus = true }: Props) {
  const ref = useRef<HTMLInputElement>(null)
  const finePointer = window.matchMedia('(pointer: fine)').matches

  return (
    <div className="search-column">
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
            // Søk on a phone's keyboard puts the keyboard away and shows the hits
            if (e.key === 'Enter' && !finePointer) e.currentTarget.blur()
            if (e.key !== 'Escape') return
            if (value !== '') onChange('')
            else onClose?.()
          }}
          enterKeyHint="search"
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          autoFocus={autoFocus}
        />
        {value !== '' ? (
          <button type="button" className="btn btn-icon" aria-label={t.search.clear} onClick={() => onChange('')}>
            <Icon name="close" size={20} />
          </button>
        ) : (
          finePointer && <kbd className="kbd">{isMac ? '⌘K' : 'Ctrl+K'}</kbd>
        )}
      </div>
      {tips.length > 0 && (
        <details className="tips">
          <summary>
            {t.search.tips}
            <Icon name="chevronRight" size={14} className="tips-chevron" />
          </summary>
          <div className="tips-body">
            <div className="tips-grid">
              {tips.map(([example, meaning]) => (
                <div className="tips-row" key={example}>
                  <code className="mono">{example}</code>
                  <span>{meaning}</span>
                </div>
              ))}
            </div>
          </div>
        </details>
      )}
    </div>
  )
}
