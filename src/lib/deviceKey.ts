import { unwrapWith, wrapWith, type OpenKey, type Sealed } from './crypto'

// A second copy of the data key, wrapped under a non-extractable AES key this browser keeps, so
// the app opens without a question. It keeps files and the folder sealed, not a device someone
// else can run code on. Never in a backup or the folder.

export type DeviceKeyRecord = { key: CryptoKey; wrappedDek: Sealed; dekId: string }

export function isDeviceKeyRecord(value: unknown): value is DeviceKeyRecord {
  const v = value as Partial<DeviceKeyRecord> | null | undefined
  return !!v && v.key instanceof CryptoKey && typeof v.dekId === 'string' && !!v.wrappedDek
}

export async function makeDeviceKey(open: OpenKey): Promise<DeviceKeyRecord> {
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
  return { key, wrappedDek: await wrapWith(key, open), dekId: open.dekId }
}

// The data key, when this record opens the vault with that id
export async function openWithDeviceKey(record: DeviceKeyRecord, dekId: string): Promise<OpenKey | null> {
  if (record.dekId !== dekId) return null
  const open = await unwrapWith(record.key, record.wrappedDek)
  return open && open.dekId === dekId ? open : null
}
