import { useEffect } from 'react'

// Pasted text always lands as plain text. Inputs cannot take rich text anyway,
// but a copied cell or line often carries tabs, line breaks and padding.
// Single-line fields get those collapsed to one space; textareas keep line breaks.
export function usePlainPaste(): void {
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const el = e.target
      if (!(el instanceof HTMLInputElement) && !(el instanceof HTMLTextAreaElement)) return
      const raw = e.clipboardData?.getData('text/plain')
      if (raw === undefined) return
      const text = el instanceof HTMLTextAreaElement ? raw.replace(/\r\n?/g, '\n') : raw.replace(/\s+/g, ' ').trim()
      if (text === raw) return
      e.preventDefault()
      const start = el.selectionStart ?? el.value.length
      const end = el.selectionEnd ?? start
      // setRangeText keeps the undo stack out, so use the editing command where available.
      if (!document.execCommand('insertText', false, text)) {
        el.setRangeText(text, start, end, 'end')
        el.dispatchEvent(new Event('input', { bubbles: true }))
      }
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [])
}
