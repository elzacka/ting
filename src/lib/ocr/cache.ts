import { modelFiles, modelSha256, modelUrl, ocrCacheName } from './models'

// ORT's own wasm; Vite emits the file and gives its URL.
import wasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url'

const base = import.meta.env.BASE_URL

export const ocrUrls = {
  det: modelUrl(base, modelFiles.det),
  rec: modelUrl(base, modelFiles.rec),
  dict: modelUrl(base, modelFiles.dict),
  wasm: wasmUrl,
}

async function sha256(bytes: ArrayBuffer): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
  return [...digest].map((b) => b.toString(16).padStart(2, '0')).join('')
}

// A model must match its pinned SHA-256; the runtime's wasm is pinned by the lockfile
async function verified(url: string, bytes: ArrayBuffer): Promise<ArrayBuffer> {
  const expected = modelSha256[url.split('/').pop() ?? '']
  if (expected !== undefined && (await sha256(bytes)) !== expected) throw new Error(`checksum mismatch: ${url.split('/').pop()}`)
  return bytes
}

// The files come from this origin only; a cached copy is used first, so reading works offline.
export async function fetchOcrFile(url: string): Promise<ArrayBuffer> {
  const cache = typeof caches === 'undefined' ? undefined : await caches.open(ocrCacheName)
  const hit = await cache?.match(url)
  if (hit) {
    try {
      return await verified(url, await hit.arrayBuffer())
    } catch {
      await cache?.delete(url)
    }
  }
  const res = await fetch(url)
  if (!res.ok) throw new Error(`fetch failed: ${url.split('/').pop()}`)
  const bytes = await verified(url, await res.clone().arrayBuffer())
  await cache?.put(url, res)
  return bytes
}
