// Barcodes: what a scanned or typed code is, and how to read one out of a
// photo. Decoding runs on the device; nothing here touches the network.

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

// Retail codes with a valid check digit get a kind; everything else (serial
// numbers, Code 128 labels, QR content) is 'other' and is never looked up.
export function classify(code: string): CodeKind {
  const d = digitsOf(code)
  if (!/^\d+$/.test(d)) return 'other'
  if (d.length === 13 && gs1Valid(d)) return /^97[89]/.test(d) ? 'isbn' : 'ean'
  if (d.length === 12 && gs1Valid(d)) return 'upc'
  if (d.length === 8 && gs1Valid(d)) return 'ean'
  return 'other'
}

// What a format is called on the label, for the line under the field
const formatNames: Record<string, string> = {
  ean_13: 'EAN-13',
  ean_8: 'EAN-8',
  upc_a: 'UPC-A',
  upc_e: 'UPC-E',
  itf: 'ITF',
  code_128: 'Code 128',
  code_39: 'Code 39',
  code_93: 'Code 93',
  codabar: 'Codabar',
  qr_code: 'QR',
  data_matrix: 'Data Matrix',
  pdf417: 'PDF417',
  aztec: 'Aztec',
}

export function formatName(format: string): string {
  return formatNames[format] ?? format
}

type Detector = { detect(source: ImageBitmap): Promise<{ rawValue: string; format: string }[]> }
type DetectorCtor = new () => Detector

export function canDecode(): boolean {
  return 'BarcodeDetector' in window
}

// Reads the first code in a still photo with the browser's own detector.
// Safari (every browser on iOS) has none: canDecode() says so and the
// number is typed from the label instead. A bundled decoder would go here.
export async function decodeImage(blob: Blob): Promise<Decoded | null> {
  if (!canDecode()) return null
  const Ctor = (window as unknown as { BarcodeDetector: DetectorCtor }).BarcodeDetector
  const bitmap = await createImageBitmap(blob)
  try {
    // No format list: every format the browser has (EAN, UPC, ITF, Code 128/39/93, QR, Data Matrix, PDF417, Aztec)
    const found = await new Ctor().detect(bitmap)
    const first = found.find((f) => cleanCode(f.rawValue) !== '')
    return first ? { value: cleanCode(first.rawValue), format: formatName(String(first.format).slice(0, 24)) } : null
  } finally {
    bitmap.close()
  }
}
