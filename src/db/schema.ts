import { z } from 'zod'

export const specSchema = z.object({
  key: z.string().trim().min(1),
  value: z.union([z.string().trim().min(1), z.number()]),
  unit: z.string().trim().nullable(),
})

// A thing is a name, its properties as specs, and maybe a photo. Everything
// else it can carry is a property: Kategori and Notat among them.
export const itemSchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1),
  specs: z.array(specSchema),
  photo: z.instanceof(Blob).nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
})

export type Spec = z.infer<typeof specSchema>
export type Item = z.infer<typeof itemSchema>

// What the form produces. Everything else is filled in by the db layer.
export const itemInputSchema = itemSchema.pick({
  name: true,
  specs: true,
  photo: true,
})

export type ItemInput = z.infer<typeof itemInputSchema>

// A property is a column definition: it exists even when no item has a value for it.
export const propertySchema = z.object({
  id: z.string().min(1),
  key: z.string().trim().min(1),
  unit: z.string().trim().nullable(),
  createdAt: z.number(),
  // Position among columns. Missing on rows written before ordering existed.
  order: z.number().optional(),
  // Field type. Missing on older rows: dates are recognised by their unit marker, the rest is text.
  type: z.enum(['text', 'choice', 'number', 'date']).optional(),
  // Choices offered by a Liste column, on top of values already in use.
  options: z.array(z.string().trim().min(1)).optional(),
})

export type PropertyType = 'text' | 'choice' | 'number' | 'date'

export type Property = z.infer<typeof propertySchema>
