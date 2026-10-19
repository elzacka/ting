// Sends only the page path to GoatCounter: no query string, hash, title or screen size, nothing stored on the device.
const ENDPOINT = 'https://elzacka.goatcounter.com/count'

export function countVisit(path: string): void {
  if (!import.meta.env.PROD) return
  new Image().src = `${ENDPOINT}?p=${encodeURIComponent(path)}&rnd=${Math.random().toString(36).slice(2, 7)}`
}
