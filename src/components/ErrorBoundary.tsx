import { Component, type ErrorInfo, type ReactNode } from 'react'
import { errorText } from '../lib/errors'
import { t } from '../lib/strings'

// A render error shows a message instead of a blank page. Data is untouched:
// every write is a completed transaction, and the folder copy is only written
// from a successful read.
type State = { crashed: boolean }

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { crashed: false }

  static getDerivedStateFromError(): State {
    return { crashed: true }
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error(errorText(error), info.componentStack)
  }

  render() {
    if (!this.state.crashed) return this.props.children
    return (
      <div className="stack narrow" role="alert">
        <p>{t.error.crashed}</p>
        <button type="button" className="btn" onClick={() => window.location.reload()}>
          {t.error.reload}
        </button>
      </div>
    )
  }
}
