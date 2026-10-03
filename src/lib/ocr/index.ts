import { errorText } from '../errors'
import type { Rgba } from '../flatten'
import { checkSize } from './limits'
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

// Puts the models and the runtime in the cache, so reading works offline later.
export async function prefetchOcr(): Promise<void> {
  const { fetchOcrFile, ocrUrls } = await import('./cache')
  for (const url of Object.values(ocrUrls)) await fetchOcrFile(url)
}

export function disposeOcr(): void {
  worker?.terminate()
  worker = undefined
}
