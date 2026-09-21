import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Everything is local: no fonts, icons or code come from outside, and nothing
// leaves the device except the one lookup the user asks for by pressing
// "Slå opp på nett" (src/lib/lookup.ts): the digits of a barcode to one of
// the three catalogues below. The CSP says so to the browser, which also helps
// Android browsers treat the app as safe to install.
const lookupOrigins = ['https://openlibrary.org', 'https://world.openproductsfacts.org', 'https://world.openfoodfacts.org']

const productionCsp = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  `connect-src 'self' ${lookupOrigins.join(' ')}`,
  "font-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self' blob:",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
  "object-src 'none'",
].join('; ')

const securityHeaders = {
  name: 'inject-prod-security-headers',
  apply: 'build' as const,
  transformIndexHtml(html: string) {
    const tags = [
      `<meta http-equiv="Content-Security-Policy" content="${productionCsp}" />`,
      '<meta http-equiv="X-Content-Type-Options" content="nosniff" />',
      '<meta http-equiv="Permissions-Policy" content="camera=(self), microphone=(), geolocation=()" />',
    ].join('\n    ')
    return html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    ${tags}`)
  },
}

// Published at elzacka.github.io/ting/, so production assets need the prefix.
// The dev server stays at the root so localhost:5173 keeps working as before.
export default defineConfig(({ command, isPreview }) => {
  const base = command === 'build' || isPreview ? '/ting/' : '/'
  return {
    base,
    plugins: [
      react(),
      securityHeaders,
      VitePWA({
        registerType: 'prompt',
        includeAssets: ['icon.svg', 'apple-touch-icon.png'],
        // Serve manifest and service worker in dev too, so Chrome offers "Installer" on localhost.
        devOptions: { enabled: true, type: 'module' },
        manifest: {
          id: base,
          name: 'Ting',
          short_name: 'Ting',
          description: 'Hold oversikt over det du eier, og hvor du har det',
          lang: 'nb',
          dir: 'ltr',
          start_url: base,
          scope: base,
          display: 'standalone',
          display_override: ['standalone', 'minimal-ui'],
          // Reopen the running window instead of a second one when launched again.
          launch_handler: { client_mode: 'navigate-existing' },
          theme_color: '#fbfbfa',
          background_color: '#fbfbfa',
          categories: ['productivity', 'utilities'],
          prefer_related_applications: false,
          icons: [
            { src: `${base}icon-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: `${base}icon-384.png`, sizes: '384x384', type: 'image/png', purpose: 'any' },
            { src: `${base}icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: `${base}icon-maskable-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png}'],
        },
      }),
    ],
    server: { port: 5173, strictPort: true },
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts'],
    },
  }
})
