import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles/tokens.css'
import './styles/base.css'
import './styles/components.css'

// Ask the browser to keep IndexedDB. Nothing to show the user either way.
void navigator.storage?.persist?.()

const root = document.getElementById('root')
if (!root) throw new Error('#root missing')

// frame-ancestors in a meta CSP is ignored by browsers and GitHub Pages sets no
// headers, so a framed copy (clickjacking) is refused here instead.
if (window.self !== window.top) throw new Error('framed')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
