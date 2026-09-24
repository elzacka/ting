// Barcodes: what a scanned or typed code is, and how to read one out of a
// photo. Decoding runs on the device; nothing here touches the network.
// Two readers: the browser's own BarcodeDetector where it has one (Chrome
// and Edge on Android and macOS), and the bundled ZXing port (zxing-wasm,
// MIT) everywhere, which is what Safari and every browser on iOS get. The wasm file ships with
// the app and loads on the first scan; nothing is fetched from a CDN.
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url'

export type CodeKind = 'isbn' | 'ean' | 'upc' | 'other'

export type Decoded = { value: string; format: string }

const maxLength = 128

// What a code may contain once it is data in the app: printable text, no
// control characters, bounded. A QR code holding a URL stays a string.
export function cleanCode(raw: string): string {
  return [...raw]
    .filter((ch) => ch >= ' ' && ch !== '')
    .join('')
    .trim()
    .slice(0, maxLength)
}

// GS1 check digit: weights 1 and 3 from the right, over all digits but the last.
function gs1Valid(digits: string): boolean {
  let sum = 0
  for (let i = 0; i < digits.length - 1; i++) {
    const weight = (digits.length - 1 - i) % 2 === 0 ? 1 : 3
    sum += Number(digits[i]) * weight
  }
  return (10 - (sum % 10)) % 10 === Number(digits[digits.length - 1])
}

// Digits only, hyphens and spaces dropped: what a label prints under the bars.
export function digitsOf(code: string): string {
  return code.replace(/[\s-]/g, '')
}

// Retail codes with a valid check digit get a kind and are stored as digits;
// everything else (serial numbers, Code 128 labels, QR content without a GS1
// code) is 'other' and is stored as read. Only an ISBN is ever looked up.
export function classify(code: string): CodeKind {
  const d = digitsOf(code)
  if (!/^\d+$/.test(d)) return 'other'
  if (d.length === 13 && gs1Valid(d)) return /^97[89]/.test(d) ? 'isbn' : 'ean'
  if (d.length === 12 && gs1Valid(d)) return 'upc'
  if (d.length === 8 && gs1Valid(d)) return 'ean'
  return 'other'
}

// The retail code inside a 2D code on a pack: a GS1 Digital Link
// (https://host/01/<gtin>...) or a GS1 element string (01 and fourteen
// digits, then other fields; HRI form brackets the 01). Both pad the code
// with zeros to fourteen digits; the code as the label prints it comes back,
// and the rest of the content stays where it is. Null when there is none.
export function gtinOf(code: string): string | null {
  const digits = /\/01\/(\d{8,14})(?=[/?#]|$)/.exec(code)?.[1] ?? /^\(?01\)?(\d{14})/.exec(code)?.[1]
  if (!digits) return null
  for (const len of [8, 12, 13]) {
    const printed = digits.slice(-len)
    if (digits.length >= len && /^0*$/.test(digits.slice(0, -len)) && classify(printed) !== 'other') return printed
  }
  return null
}

// What a format is called on the label, for the line under the field. Keys
// as BarcodeDetector names them (snake_case) and as ZXing does (CamelCase).
const formatNames: Record<string, string> = {
  ean_13: 'EAN-13',
  EAN13: 'EAN-13',
  ean_8: 'EAN-8',
  EAN8: 'EAN-8',
  upc_a: 'UPC-A',
  UPCA: 'UPC-A',
  upc_e: 'UPC-E',
  UPCE: 'UPC-E',
  itf: 'ITF',
  ITF: 'ITF',
  ITF14: 'ITF-14',
  code_128: 'Code 128',
  Code128: 'Code 128',
  code_39: 'Code 39',
  Code39: 'Code 39',
  code_93: 'Code 93',
  Code93: 'Code 93',
  codabar: 'Codabar',
  Codabar: 'Codabar',
  DataBar: 'DataBar',
  DataBarExp: 'DataBar Expanded',
  qr_code: 'QR',
  QRCode: 'QR',
  MicroQRCode: 'Micro QR',
  data_matrix: 'Data Matrix',
  DataMatrix: 'Data Matrix',
  pdf417: 'PDF417',
  PDF417: 'PDF417',
  aztec: 'Aztec',
  Aztec: 'Aztec',
}

export function formatName(format: string): string {
  return formatNames[format] ?? format
}

type Detector = { detect(source: ImageBitmap): Promise<{ rawValue: string; format: string }[]> }
type DetectorCtor = { new (): Detector; getSupportedFormats(): Promise<string[]> }

function found(value: string, format: string): Decoded | null {
  const clean = cleanCode(value)
  if (clean === '') return null
  return { value: gtinOf(clean) ?? clean, format: formatName(String(format).slice(0, 24)) }
}

// A photo the browser cannot read, or cannot even decode as an image, is ZXing's to try
async function viaBrowser(blob: Blob): Promise<Decoded | null> {
  if (!('BarcodeDetector' in window)) return null
  const Ctor = (window as unknown as { BarcodeDetector: DetectorCtor }).BarcodeDetector
  // Chrome on Windows and Linux has the constructor and no reader behind it
  const formats = await Ctor.getSupportedFormats().catch(() => [])
  if (formats.length === 0) return null
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(blob)
  } catch {
    return null
  }
  try {
    // No format list: every format the browser has
    for (const r of await new Ctor().detect(bitmap)) {
      const hit = found(r.rawValue, r.format)
      if (hit) return hit
    }
    return null
  } catch {
    return null
  } finally {
    bitmap.close()
  }
}

async function viaZxing(blob: Blob): Promise<Decoded | null> {
  const { prepareZXingModule, readBarcodesFromImageFile } = await import('zxing-wasm/reader')
  prepareZXingModule({
    overrides: { locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmUrl : prefix + path) },
  })
  for (const r of await readBarcodesFromImageFile(blob, { tryHarder: true, maxNumberOfSymbols: 4 })) {
    if (!r.isValid) continue
    const hit = found(r.text, r.format)
    if (hit) return hit
  }
  return null
}

// Reads the first code in a still photo: the browser's detector first, since
// it is quick and already there, then ZXing, which also has a second go at a
// photo the browser gave up on.
export async function decodeImage(blob: Blob): Promise<Decoded | null> {
  return (await viaBrowser(blob)) ?? (await viaZxing(blob))
}
