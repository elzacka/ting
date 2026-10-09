import { getSetting, raiseClock, readRegister, setSetting, writeRegister, writeVault } from '../db/db'
import type { Loaded } from './backup'
import type { FileExtras } from './backup'
import type { OpenKey, Vault } from './crypto'
import { mergeRegisters, newestStamp, noTombstones, type MergeSummary, type Register } from './merge'
import { adoptVault, currentKey, currentVault } from './vault'

// Sync between one person's own devices: each sends its whole register as a
// sealed file (AirDrop on Apple), the other merges it in. No server, no cloud.

const lastMergedKey = 'lastMergedAt'
const lastSentKey = 'lastSentAt'
const lastFetchedKey = 'lastFetchedAt'
const deviceIdKey = 'deviceId'

export type SyncStatus = { sentAt: number | null; fetchedAt: number | null }

export async function syncStatus(): Promise<SyncStatus> {
  return {
    sentAt: (await getSetting<number>(lastSentKey)) ?? null,
    fetchedAt: (await getSetting<number>(lastFetchedKey)) ?? null,
  }
}

export async function markSent(): Promise<void> {
  await setSetting(lastSentKey, Date.now())
}

// A plain word for the line after a merge: «Hentet fra iPhone»
export function deviceName(ua = navigator.userAgent, touch = navigator.maxTouchPoints > 1): string | undefined {
  if (/iPhone/.test(ua)) return 'iPhone'
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && touch)) return 'iPad'
  if (/Macintosh/.test(ua)) return 'Mac'
  if (/Android/.test(ua)) return 'Android'
  if (/Windows/.test(ua)) return 'Windows'
  return undefined
}

async function deviceId(): Promise<string> {
  const known = await getSetting<string>(deviceIdKey)
  if (known) return known
  const id = crypto.randomUUID()
  await setSetting(deviceIdKey, id)
  return id
}

// What a file or the folder carries besides things and columns
export async function fileExtras(register: Register, vault: Vault): Promise<FileExtras> {
  const name = deviceName()
  return {
    fieldsAt: register.fieldsAt,
    tombstones: register.tombstones,
    deviceId: await deviceId(),
    ...(name ? { deviceName: name } : {}),
    mergedAt: (await getSetting<number>(lastMergedKey)) ?? 0,
    vault,
  }
}

export type MergeResult = {
  summary: MergeSummary
  // The other device's clock was more than a day ahead
  future: boolean
  // The passphrase changed on the other device and now applies here
  passphraseChanged: boolean
}

const dayMs = 24 * 60 * 60 * 1000

// Merges a copy in. `open` is the key that opened it: another data key means
// the copy's vault is adopted and every row sealed again under it. Within one
// key, a newer passphrase in the sealed part replaces this device's.
export async function mergeIn(
  loaded: Loaded,
  open: OpenKey,
  envelopeVault: Vault | null,
  opts: { recordFetch: boolean },
): Promise<MergeResult> {
  const local = await readRegister()
  const remote: Register = {
    items: loaded.items,
    properties: loaded.properties,
    fields: loaded.fields ?? local.fields,
    fieldsAt: loaded.fieldsAt,
    tombstones: loaded.tombstones ?? noTombstones(),
  }
  // Edited twice: changed here after the other side last took in a copy, and
  // there after this side last did
  const since = Math.max((await getSetting<number>(lastMergedKey)) ?? 0, loaded.mergedAt)
  const { merged, summary } = mergeRegisters(local, remote, since)

  let passphraseChanged = false
  const otherKey = open.dekId !== currentKey().dekId
  if (otherKey && envelopeVault) {
    adoptVault(envelopeVault, open)
    await writeVault(envelopeVault)
  } else {
    const mine = currentVault()
    const theirs = loaded.vault
    if (mine && theirs && theirs.dekId === mine.dekId && (theirs.changedAt ?? 0) > (mine.changedAt ?? 0)) {
      adoptVault(theirs, currentKey())
      await writeVault(theirs)
      passphraseChanged = true
    }
  }
  await writeRegister(merged, local, otherKey)

  const newest = newestStamp(remote)
  await raiseClock(newest)
  const now = Date.now()
  await setSetting(lastMergedKey, now)
  if (opts.recordFetch) await setSetting(lastFetchedKey, now)
  return { summary, future: newest > now + dayMs, passphraseChanged }
}
