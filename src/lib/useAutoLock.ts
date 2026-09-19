import { useEffect } from 'react'
import { lock } from './vault'

// Locks after a stretch without input, so a device left open does not stay
// open. A hidden tab throttles timers, so the check is repeated when the tab
// becomes visible again, before anything is shown.
export const autoLockMs = 10 * 60 * 1000

export function useAutoLock(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return
    let lastActivity = Date.now()
    let timer: ReturnType<typeof setTimeout> | undefined

    function arm() {
      clearTimeout(timer)
      timer = setTimeout(() => lock('idle'), autoLockMs)
    }
    function onActivity() {
      lastActivity = Date.now()
      arm()
    }
    function onVisibility() {
      if (document.visibilityState !== 'visible') return
      if (Date.now() - lastActivity >= autoLockMs) lock('idle')
      else arm()
    }

    arm()
    window.addEventListener('pointerdown', onActivity, { passive: true })
    window.addEventListener('keydown', onActivity, { passive: true })
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('pointerdown', onActivity)
      window.removeEventListener('keydown', onActivity)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [enabled])
}
