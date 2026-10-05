// Dev server only: dev.html frames the app and names the version and device in the URL
// (?versjon=demo|full, ?enhet=mobil). The build drops all of it, since import.meta.env.DEV is false there.
const params = import.meta.env.DEV ? new URLSearchParams(window.location.search) : null
const version = params?.get('versjon')

// true: the installed app, false: a browser tab, null: as the browser says
export const devInstalled: boolean | null = version === 'full' ? true : version === 'demo' ? false : null

// The frame gives an iPhone 17 Pro's width and height; the rest of the iPhone is set here:
// touch and no hover in scripts and CSS, no folder access, its user agent, and the installed
// app's safe areas (62 top, 34 bottom in portrait). Safari's own bars and the keyboard are not.
if (params?.get('enhet') === 'mobil') {
  const touch = (query: string) =>
    query
      .replaceAll('(pointer: coarse)', '(min-width: 0px)')
      .replaceAll('(hover: none)', '(min-width: 0px)')
      .replaceAll('(pointer: fine)', '(max-width: 0px)')
      .replaceAll('(hover: hover)', '(max-width: 0px)')
  const matchMedia = window.matchMedia.bind(window)
  window.matchMedia = (query: string) => matchMedia(touch(query))
  Object.defineProperty(window, 'showDirectoryPicker', { value: undefined })
  Object.defineProperties(navigator, {
    userAgent: {
      value:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1',
    },
    platform: { value: 'iPhone' },
    maxTouchPoints: { value: 5 },
  })

  const insets: Record<string, number> = devInstalled ? { top: 62, bottom: 34 } : {}
  const patch = (style: HTMLStyleElement) => {
    const css = style.textContent ?? ''
    const next = touch(css).replace(/env\(safe-area-inset-(\w+)\)/g, (_, side: string) => `${insets[side] ?? 0}px`)
    if (next !== css) style.textContent = next
  }
  // Vite adds a style element per CSS file and rewrites it on every save
  const all = () => document.querySelectorAll('style').forEach(patch)
  new MutationObserver(all).observe(document.head, { childList: true, subtree: true, characterData: true })
  all()
}
