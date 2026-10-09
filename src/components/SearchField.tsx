import { useRef, useState } from 'react'
import { asImage } from '../lib/backup'
import { decodeImage } from '../lib/barcode'
import { errorText } from '../lib/errors'
import { barcodeKey } from '../lib/grid'
import type { Tip } from '../lib/searchTips'
import { t } from '../lib/strings'
import { searchKeys } from '../lib/useSearchShortcut'
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
  // The phone finds a thing by its label: a scanned code becomes the search
  scan?: boolean
}

// strekkode=… in the search's own syntax, quoted when the code holds a space or an operator
function codeQuery(code: string): string {
  const c = code.replace(/"/g, '')
  return `${barcodeKey.toLocaleLowerCase('nb')}=${/[\s<>=:]/.test(c) ? `"${c}"` : c}`
}

export function SearchField({ value, onChange, onClose, tips = [], autoFocus = true, scan = false }: Props) {
  const ref = useRef<HTMLInputElement>(null)
  const scanRef = useRef<HTMLInputElement>(null)
  const finePointer = window.matchMedia('(pointer: fine)').matches
  const [reading, setReading] = useState(false)
  const [missed, setMissed] = useState(false)

  // A scanned code searches Strekkode for the same code, however it was typed there
  async function read(file: File | undefined) {
    if (scanRef.current) scanRef.current.value = ''
    const image = asImage(file)
    if (!image) return
    setReading(true)
    setMissed(false)
    try {
      const found = await decodeImage(image)
      if (found) onChange(codeQuery(found.value))
      else setMissed(true)
    } catch (err) {
      console.error(errorText(err))
      setMissed(true)
    } finally {
      setReading(false)
    }
  }

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
          onChange={(e) => {
            onChange(e.target.value)
            setMissed(false)
          }}
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
        ) : scan ? (
          <>
            <input
              ref={scanRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="visually-hidden"
              onChange={(e) => void read(e.target.files?.[0])}
            />
            <button
              type="button"
              className="btn btn-icon"
              aria-label={t.barcode.scan}
              disabled={reading}
              onClick={() => scanRef.current?.click()}
            >
              <Icon name="barcodeScanner" size={20} />
            </button>
          </>
        ) : (
          finePointer && <kbd className="kbd">{searchKeys}</kbd>
        )}
      </div>
      {(reading || missed) && (
        <p className="hint" aria-live="polite">
          {reading ? t.barcode.scanning : t.barcode.none}
        </p>
      )}
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
