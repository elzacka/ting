import { z } from 'zod'

export const specSchema = z.object({
  key: z.string().trim().min(1),
  value: z.union([z.string().trim().min(1), z.number()]),
  unit: z.string().trim().nullable(),
})

// A thing is a name, its properties as specs, and its photos; Kategori and Notat are properties.
// The first photo is the one shown where there is room for one. A single `photo` from before
// photos became a list reads as a list of one.
export const itemSchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1),
  specs: z.array(specSchema),
  photos: z.array(z.instanceof(Blob)),
  createdAt: z.number(),
  updatedAt: z.number(),
  // When each field last changed, for merging copies (`lib/merge.ts`). A field
  // missing here changed at `updatedAt`.
  stamps: z.record(z.string(), z.number()).optional(),
})

export type Spec = z.infer<typeof specSchema>
export type Item = z.infer<typeof itemSchema>

// What the form produces. Everything else is filled in by the db layer.
export const itemInputSchema = itemSchema.pick({
  name: true,
  specs: true,
  photos: true,
})

export type ItemInput = z.infer<typeof itemInputSchema>

// A property is a column definition: it exists even when no item has a value for it.
export const propertySchema = z.object({
  id: z.string().min(1),
  key: z.string().trim().min(1),
  unit: z.string().trim().nullable(),
  createdAt: z.number(),
  // Last change, for merging copies. Missing on rows from before: createdAt.
  updatedAt: z.number().optional(),
  // Position among columns. Missing on rows written before ordering existed.
  order: z.number().optional(),
  // Field type. Missing on older rows: dates are recognised by their unit marker, the rest is text.
  type: z.enum(['text', 'choice', 'number', 'date', 'path']).optional(),
  // Choices offered by a choice column, on top of values already in use.
  options: z.array(z.string().trim().min(1)).optional(),
  // The Kategori values this column belongs to. Missing or empty means it
  // belongs to every category: that is what a column is until it is narrowed.
  categories: z.array(z.string().trim().min(1)).optional(),
  // On the Kategori property only: the icon chosen per category, keyed by the category as
  // written, valued by an id from the icon pack (else the icon guessed from the name). Ids are
  // plain words, so nothing from a file becomes anything but a lookup key.
  icons: z.record(z.string().trim().min(1).max(200), z.string().regex(/^[a-z0-9_]{1,64}$/)).optional(),
})

export type PropertyType = 'text' | 'choice' | 'number' | 'date' | 'path'

export type Property = z.infer<typeof propertySchema>
