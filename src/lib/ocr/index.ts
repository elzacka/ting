import { errorText } from '../errors'
import type { Rgba } from '../flatten'
import { checkSize } from './limits'
import { ocrCacheName } from './models'
import type { WorkerReply, WorkerRequest } from './worker'

const timeoutMs = 180_000

let worker: Worker | undefined
let nextId = 0

function start(): Worker {
  worker ??= new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
  return worker
}

// Lines top to bottom; segments on one visual line joined by two spaces.
export async function readText(img: Rgba): Promise<string[]> {
  checkSize(img)
  const w = start()
  const id = nextId++
  return new Promise<string[]>((resolve, reject) => {
    const done = () => {
      clearTimeout(timer)
      w.removeEventListener('message', onMessage)
      w.removeEventListener('error', onError)
    }
    const timer = setTimeout(() => {
      done()
      disposeOcr()
      reject(new Error('text recognition timed out'))
    }, timeoutMs)
    const onMessage = (e: MessageEvent<WorkerReply>) => {
      if (e.data.id !== id) return
      done()
      if ('error' in e.data) reject(new Error(e.data.error))
      else resolve(e.data.lines)
    }
    const onError = (e: ErrorEvent) => {
      done()
      disposeOcr()
      reject(new Error(errorText(e.error ?? e.message)))
    }
    w.addEventListener('message', onMessage)
    w.addEventListener('error', onError)
    w.postMessage({ id, img } satisfies WorkerRequest)
  })
}

// The download of this switch-on; the one before, if any, finishes (or stops) first
let download: Promise<void> | undefined
let previous: Promise<unknown> = Promise.resolve()
let generation = 0

// Puts the models and the runtime in the cache, so reading works offline later; also at
// start, for files an update added. One download at a time; turning reading off stops it.
export function prefetchOcr(): Promise<void> {
  if (download) return download
  const gen = generation
  const job = previous.then(async () => {
    const { fetchOcrFile, isOcrCached, ocrUrls } = await import('./cache')
    for (const url of Object.values(ocrUrls)) {
      if (gen !== generation) break
      if (!(await isOcrCached(url))) await fetchOcrFile(url)
    }
    // A file that landed after off deleted the cache is dropped again
    if (gen !== generation) await caches.delete(ocrCacheName)
  })
  const done = () => {
    if (download === job) download = undefined
  }
  download = job
  previous = job.then(done, done)
  return job
}

export function disposeOcr(): void {
  worker?.terminate()
  worker = undefined
}

// Receipt reading off: stops the download, the worker and deletes what was downloaded.
export async function removeOcr(): Promise<void> {
  generation++
  download = undefined
  disposeOcr()
  await caches.delete(ocrCacheName)
}
