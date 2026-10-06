// PP-OCRv6 small by PaddlePaddle (Apache-2.0), ONNX from RapidOCR v3.9.2:
// https://www.modelscope.cn/models/RapidAI/RapidOCR/resolve/v3.9.2/ (onnx/PP-OCRv6/det, onnx/PP-OCRv6/rec, paddle/PP-OCRv6/rec/PP-OCRv6_rec_small for the dict)
// Same origin only, fetched when receipt reading is turned on.

// Also the Workbox cache name in vite.config.ts.
export const ocrCacheName = 'ting-ocr-v1'

export const modelFiles = {
  det: 'PP-OCRv6_det_small.onnx',
  rec: 'PP-OCRv6_rec_small.onnx',
  dict: 'ppocrv6_dict.txt',
} as const

// Checked after every fetch and cache read: a swapped or damaged file is refused
export const modelSha256: Record<string, string> = {
  [modelFiles.det]: '090f04abcd9d9a7498bc4ebf677e4cb9bdce1fe4197ddb7e529f1ef44e1ff94f',
  [modelFiles.rec]: '6f327246b50388f3c176ae304bd95767ea6dc0c9ae92153ef8cbe210b3c14884',
  [modelFiles.dict]: 'b5f2bfe2bdd9448429e3e82b51c789775d9b42f2403d082b00662eb77e401c5d',
}

export function modelUrl(base: string, file: string): string {
  return `${base}models/${file}`
}
