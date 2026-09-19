import { useEffect, useState } from 'react'

// Not in lib.dom yet.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export type InstallState =
  | { kind: 'installed' }
  | { kind: 'chromium'; promptEvent: BeforeInstallPromptEvent }
  | { kind: 'ios-safari'; isIPad: boolean }
  | { kind: 'macos-safari' }
  | { kind: 'unsupported' }

export function isStandalone(): boolean {
  if (window.matchMedia('(display-mode: standalone)').matches) return true
  return (navigator as { standalone?: boolean }).standalone === true
}

// iPadOS presents itself as a Mac; touch points tell them apart.
function isIPad(): boolean {
  return /iPad/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

// Every WebKit and Chromium browser writes "Safari" in its user agent; only real Safari gets Safari steps.
function isRealSafari(): boolean {
  const ua = navigator.userAgent
  return /Safari/.test(ua) && !/Chrome|Chromium|CriOS|Edg\/|EdgA|EdgiOS|OPR|FxiOS|Firefox|SamsungBrowser/.test(ua)
}

function fallbackState(): InstallState {
  if (!isRealSafari()) return { kind: 'unsupported' }
  if (/iPhone|iPod/.test(navigator.userAgent)) return { kind: 'ios-safari', isIPad: false }
  if (isIPad()) return { kind: 'ios-safari', isIPad: true }
  if (navigator.platform === 'MacIntel') return { kind: 'macos-safari' }
  return { kind: 'unsupported' }
}

export function useInstallPrompt(): InstallState {
  const [state, setState] = useState<InstallState>(() => (isStandalone() ? { kind: 'installed' } : fallbackState()))

  useEffect(() => {
    if (isStandalone()) return
    const onPrompt = (e: Event) => {
      e.preventDefault()
      setState({ kind: 'chromium', promptEvent: e as BeforeInstallPromptEvent })
    }
    const onInstalled = () => setState({ kind: 'installed' })
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  return state
}
