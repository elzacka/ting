import type { Item, Property, Spec } from '../db/schema'
import type { FieldSettings } from './fields'
import { columnId } from './grid'

// Per-field newest-wins (`stamps`, else `updatedAt`), so edits to different fields
// on two devices both survive; tombstones keep deletes deleted. Idempotent and
// symmetric, so an old or repeated file can never destroy data.

export type Tombstones = { items: Record<string, number>; properties: Record<string, number> }

export const noTombstones = (): Tombstones => ({ items: {}, properties: {} })

export type Register = {
  items: Item[]
  properties: Property[]
  fields: FieldSettings
  fieldsAt: number
  tombstones: Tombstones
}

export type MergeSummary = {
  added: number
  changed: number
  deleted: number
  // Things whose same field changed on both sides since the last merge
  both: number
  // Columns, their order or the field settings came from the other side
  layout: boolean
}

const nameField = 'name'
const photosField = 'photos'
const specField = (s: Pick<Spec, 'key' | 'unit'>) => `spec:${columnId(s)}`

function fieldIds(item: Item): string[] {
  return [nameField, photosField, ...item.specs.map(specField), ...Object.keys(item.stamps ?? {})]
}

// A value this side never held and never removed has no say: zero
function stampOf(item: Item, field: string): number {
  const stamp = item.stamps?.[field]
  if (stamp !== undefined) return stamp
  if (field.startsWith('spec:') && !item.specs.some((s) => specField(s) === field)) return 0
  return item.updatedAt
}

// The newest change anywhere on the thing: what a tombstone is weighed against
export function lastChange(item: Item): number {
  return Math.max(item.updatedAt, ...Object.values(item.stamps ?? {}))
}

// Photos compare by type and size: re-reading or re-sealing a photo makes a
// new Blob with the same bytes, and hashing every photo on every save costs
function samePhotos(a: readonly Blob[], b: readonly Blob[]): boolean {
  return a.length === b.length && a.every((p, i) => p.type === b[i]?.type && p.size === b[i]?.size)
}

function valueOf(item: Item, field: string): unknown {
  if (field === nameField) return item.name
  if (field === photosField) return item.photos.map((p) => `${p.type}:${p.size}`)
  const spec = item.specs.find((s) => specField(s) === field)
  return spec ? [spec.value, spec.unit ?? ''] : null
}

function sameValue(a: Item, b: Item, field: string): boolean {
  if (field === photosField) return samePhotos(a.photos, b.photos)
  return JSON.stringify(valueOf(a, field)) === JSON.stringify(valueOf(b, field))
}

// Fields that differ get the new stamp, the rest keep theirs. A thing nothing changed on keeps its times, or it would outrank a delete.
export function stampChanges(prev: Item, next: Item, at: number): Item {
  const stamps: Record<string, number> = {}
  let changed = false
  for (const f of new Set([...fieldIds(prev), ...fieldIds(next)])) {
    const same = sameValue(prev, next, f)
    changed ||= !same
    const stamp = same ? stampOf(prev, f) : at
    if (stamp > 0) stamps[f] = stamp
  }
  return changed ? { ...next, stamps, updatedAt: at } : { ...next, stamps: prev.stamps, updatedAt: prev.updatedAt }
}

// A thing brought back on purpose (a restore over a delete): newer than any
// tombstone, while each field keeps the stamp it had.
export function revive(item: Item, at: number): Item {
  const stamps: Record<string, number> = {}
  for (const f of new Set(fieldIds(item))) stamps[f] = stampOf(item, f)
  return { ...item, stamps, updatedAt: at }
}

// Ties go the same way on both devices, so two copies never swap values
function remoteWins(local: unknown, remote: unknown, ls: number, rs: number): boolean {
  if (rs !== ls) return rs > ls
  return JSON.stringify(remote) > JSON.stringify(local)
}

function mergeItem(local: Item, remote: Item, since: number): { item: Item; changed: boolean; both: boolean } {
  let changed = false
  let both = false
  let name = local.name
  let photos = local.photos
  const specs = new Map<string, Spec>(local.specs.map((s) => [specField(s), s]))
  const stamps: Record<string, number> = {}
  for (const f of new Set([...fieldIds(local), ...fieldIds(remote)])) {
    const ls = stampOf(local, f)
    const rs = stampOf(remote, f)
    if (Math.max(ls, rs) > 0) stamps[f] = Math.max(ls, rs)
    if (sameValue(local, remote, f)) continue
    if (ls > since && rs > since) both = true
    if (!remoteWins(valueOf(local, f), valueOf(remote, f), ls, rs)) continue
    changed = true
    if (f === nameField) name = remote.name
    else if (f === photosField) photos = remote.photos
    else {
      const spec = remote.specs.find((s) => specField(s) === f)
      if (spec) specs.set(f, spec)
      else specs.delete(f)
    }
  }
  const item: Item = {
    ...local,
    name,
    photos,
    specs: [...specs.values()],
    stamps,
    createdAt: Math.min(local.createdAt, remote.createdAt),
    updatedAt: Math.max(local.updatedAt, remote.updatedAt),
  }
  return { item, changed, both }
}

function propertyStamp(p: Property): number {
  return p.updatedAt ?? p.createdAt
}

function mergeTombstones(a: Tombstones, b: Tombstones): Tombstones {
  const pick = (x: Record<string, number>, y: Record<string, number>) => {
    const out = { ...x }
    for (const [id, at] of Object.entries(y)) out[id] = Math.max(out[id] ?? 0, at)
    return out
  }
  return { items: pick(a.items, b.items), properties: pick(a.properties, b.properties) }
}

// `since` is when this device last merged: a field changed after it on both
// sides was edited twice, and the summary says so.
export function mergeRegisters(local: Register, remote: Register, since: number): { merged: Register; summary: MergeSummary } {
  const tombstones = mergeTombstones(local.tombstones, remote.tombstones)
  const summary: MergeSummary = { added: 0, changed: 0, deleted: 0, both: 0, layout: false }

  const remoteById = new Map(remote.items.map((i) => [i.id, i]))
  const items: Item[] = []
  for (const l of local.items) {
    const r = remoteById.get(l.id)
    remoteById.delete(l.id)
    const merged = r ? mergeItem(l, r, since) : { item: l, changed: false, both: false }
    const gone = tombstones.items[l.id]
    if (gone !== undefined && gone >= lastChange(merged.item)) {
      summary.deleted++
      continue
    }
    if (merged.changed) summary.changed++
    if (merged.both) summary.both++
    items.push(merged.item)
  }
  for (const r of remoteById.values()) {
    const gone = tombstones.items[r.id]
    if (gone !== undefined && gone >= lastChange(r)) continue
    summary.added++
    items.push(r)
  }

  const remoteProps = new Map(remote.properties.map((p) => [p.id, p]))
  const properties: Property[] = []
  const keepProperty = (p: Property) => {
    const gone = tombstones.properties[p.id]
    return gone === undefined || gone < propertyStamp(p)
  }
  for (const l of local.properties) {
    const r = remoteProps.get(l.id)
    remoteProps.delete(l.id)
    const winner = r && remoteWins(l, r, propertyStamp(l), propertyStamp(r)) ? r : l
    if (!keepProperty(winner)) {
      summary.layout = true
      continue
    }
    if (winner !== l && JSON.stringify(winner) !== JSON.stringify(l)) summary.layout = true
    properties.push(winner)
  }
  for (const r of remoteProps.values()) {
    if (!keepProperty(r)) continue
    summary.layout = true
    properties.push(r)
  }

  const fieldsFromRemote = remoteWins(local.fields, remote.fields, local.fieldsAt, remote.fieldsAt)
  if (fieldsFromRemote && JSON.stringify(local.fields) !== JSON.stringify(remote.fields)) summary.layout = true
  const fields = fieldsFromRemote ? remote.fields : local.fields
  const fieldsAt = Math.max(local.fieldsAt, remote.fieldsAt)

  return { merged: { items, properties, fields, fieldsAt, tombstones }, summary }
}

export function nothingNew(s: MergeSummary): boolean {
  return s.added === 0 && s.changed === 0 && s.deleted === 0 && !s.layout
}

// The newest stamp a register carries: a file from a device whose clock runs
// far ahead shows here, and this device's next stamps start after it.
export function newestStamp(r: Register): number {
  let max = r.fieldsAt
  for (const i of r.items) max = Math.max(max, lastChange(i))
  for (const p of r.properties) max = Math.max(max, propertyStamp(p))
  for (const at of [...Object.values(r.tombstones.items), ...Object.values(r.tombstones.properties)]) max = Math.max(max, at)
  return max
}
