import { describe, expect, it } from 'vitest'
import { itemSchema, propertySchema } from '../db/schema'
import { demoRegister } from './demo'
import { categoryColumnId } from './fields'
import { columnId } from './grid'

describe('demoRegister', () => {
  const { items, properties } = demoRegister(1_760_000_000_000)

  it('holds rows the database accepts', () => {
    for (const i of items) expect(itemSchema.safeParse(i).success).toBe(true)
    for (const p of properties) expect(propertySchema.safeParse(p).success).toBe(true)
  })

  it('gives every value a column, and every column a category it shows in', () => {
    const ids = new Set(properties.map((p) => p.id))
    const categories = new Set(items.map((i) => String(i.specs.find((s) => columnId(s) === categoryColumnId)?.value)))
    for (const i of items) for (const s of i.specs) expect(ids).toContain(columnId(s))
    for (const p of properties) for (const c of p.categories ?? []) expect(categories).toContain(c)
  })
})
