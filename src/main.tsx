// First, so its dev-only overrides are in place before any module reads the browser
import './lib/devPreview'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { isDemo } from './lib/useInstall'
import './styles/tokens.css'
import './styles/base.css'
import './styles/components.css'

// Ask the browser to keep IndexedDB. Nothing to show the user either way;
// the demo keeps nothing, and Firefox would ask the user.
if (!isDemo) void navigator.storage?.persist?.()

const root = document.getElementById('root')
if (!root) throw new Error('#root missing')

// frame-ancestors in a meta CSP is ignored by browsers and GitHub Pages sets no
// headers, so a framed copy (clickjacking) is refused here instead. dev.html frames it on the dev server.
if (window.self !== window.top && !import.meta.env.DEV) throw new Error('framed')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
