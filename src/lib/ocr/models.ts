// PP-OCRv5 by PaddlePaddle (Apache-2.0), ONNX from RapidOCR v3.9.2:
// https://www.modelscope.cn/models/RapidAI/RapidOCR/resolve/v3.9.2/ (onnx/PP-OCRv5/det, onnx/PP-OCRv5/rec, paddle/... for the dict)
// Same origin only, fetched when receipt reading is turned on.

// Also the Workbox cache name in vite.config.ts.
export const ocrCacheName = 'ting-ocr-v1'

export const modelFiles = {
  det: 'ch_PP-OCRv5_det_mobile.onnx',
  rec: 'latin_PP-OCRv5_rec_mobile.onnx',
  dict: 'ppocrv5_latin_dict.txt',
} as const

// Checked after every fetch and cache read: a swapped or damaged file is refused
export const modelSha256: Record<string, string> = {
  [modelFiles.det]: '4d97c44a20d30a81aad087d6a396b08f786c4635742afc391f6621f5c6ae78ae',
  [modelFiles.rec]: 'b20bd37c168a570f583afbc8cd7925603890efbcdc000a59e22c269d160b5f5a',
  [modelFiles.dict]: '3c0a8a79b612653c25f765271714f71281e4e955962c153e272b7b8c1d2b13ff',
}

export function modelUrl(base: string, file: string): string {
  return `${base}models/${file}`
}
