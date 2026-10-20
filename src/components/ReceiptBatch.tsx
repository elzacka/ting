import { useRef, useState, type ChangeEvent } from 'react'
import type { Item, Property } from '../db/schema'
import { errorText } from '../lib/errors'
import type { FieldSettings } from '../lib/fields'
import { importReceipts, type BatchResult } from '../lib/receiptBatch'
import { reviewOpen } from '../lib/receiptItems'
import { t } from '../lib/strings'
import { useNarrow } from '../lib/useNarrow'

type Props = { items: Item[]; properties: Property[]; fields: FieldSettings }

// Les inn kvitteringer: several photos, or a whole folder, read one after another and stored
// without review. The things carry «Ikke gjennomgått» until the user has checked them.
export function ReceiptBatch({ items, properties, fields }: Props) {
  const narrow = useNarrow()
  const filesRef = useRef<HTMLInputElement>(null)
  const folderRef = useRef<HTMLInputElement>(null)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [result, setResult] = useState<BatchResult | null>(null)
  const [failed, setFailed] = useState(false)

  async function run(e: ChangeEvent<HTMLInputElement>) {
    const files = [...(e.target.files ?? [])]
    e.target.value = ''
    if (files.length === 0) return
    setResult(null)
    setFailed(false)
    try {
      setResult(await importReceipts(files, items, properties, fields, (done, total) => setProgress({ done, total })))
    } catch (err) {
      console.error(errorText(err))
      setFailed(true)
    }
    setProgress(null)
  }

  const busy = progress !== null
  return (
    <div className="setting-row">
      <input ref={filesRef} type="file" accept="image/*" multiple className="visually-hidden" tabIndex={-1} onChange={(e) => void run(e)} />
      {/* A folder is picked at a desk; a phone picks several photos at once */}
      {!narrow && (
        <input
          ref={folderRef}
          type="file"
          // @ts-expect-error webkitdirectory is not in React's input types
          webkitdirectory=""
          className="visually-hidden"
          tabIndex={-1}
          onChange={(e) => void run(e)}
        />
      )}
      <div className="row">
        <button type="button" className="btn" disabled={busy} onClick={() => filesRef.current?.click()}>
          {t.receipt.batchFiles}
        </button>
        {!narrow && (
          <button type="button" className="btn" disabled={busy} onClick={() => folderRef.current?.click()}>
            {t.receipt.batchFolder}
          </button>
        )}
      </div>
      {progress && (
        <p className="setting-desc" role="status">
          {t.receipt.batchProgress(progress.done, progress.total)}
        </p>
      )}
      {result && (
        <p className="setting-desc" role="status">
          {t.receipt.batchDone(result.things, result.receipts, reviewOpen)}
          {result.failed.length > 0 && ` ${t.receipt.batchFailed(result.failed)}`}
        </p>
      )}
      {failed && (
        <p className="error" role="alert">
          {t.receipt.failed}
        </p>
      )}
    </div>
  )
}
