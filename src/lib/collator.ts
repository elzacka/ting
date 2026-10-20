// Norwegian alphabetical order, blind to case and accents. The natural order also reads digits as
// numbers, so «Hylle 2» comes before «Hylle 10».
export const looseOrder = new Intl.Collator('nb', { sensitivity: 'base' })
export const naturalOrder = new Intl.Collator('nb', { sensitivity: 'base', numeric: true })
