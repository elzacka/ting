/// <reference lib="webworker" />
import * as ort from 'onnxruntime-web/wasm'
import { errorText } from '../errors'
import type { Rgba } from '../flatten'
import { fetchOcrFile, ocrUrls } from './cache'
import { createEngine, type Engine } from './engine'

export type WorkerRequest = { id: number; img: Rgba }
export type WorkerReply = { id: number; lines: string[] } | { id: number; error: string }

let engine: Promise<Engine> | undefined

async function load(): Promise<Engine> {
  const [det, rec, dict, wasm] = await Promise.all([
    fetchOcrFile(ocrUrls.det),
    fetchOcrFile(ocrUrls.rec),
    fetchOcrFile(ocrUrls.dict),
    fetchOcrFile(ocrUrls.wasm),
  ])
  // One thread: GitHub Pages cannot send the headers SharedArrayBuffer needs.
  ort.env.wasm.numThreads = 1
  ort.env.wasm.proxy = false
  ort.env.wasm.wasmBinary = wasm
  return createEngine(ort, { det: new Uint8Array(det), rec: new Uint8Array(rec), dict: new TextDecoder().decode(dict) })
}

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const { id, img } = e.data
  try {
    engine ??= load()
    const lines = await (await engine).read(img)
    self.postMessage({ id, lines } satisfies WorkerReply)
  } catch (err) {
    engine = undefined
    self.postMessage({ id, error: errorText(err) } satisfies WorkerReply)
  }
}
