import type { Spec } from '../db/schema'
import { formatStoredDate, isDateUnit } from './dates'
import { parseNumber } from './filter'

const numberFormat = new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 2 })
const dateFormat = new Intl.DateTimeFormat('nb-NO', { day: '2-digit', month: '2-digit', year: '2-digit' })

// Value without its unit: numbers formatted nb-NO with a real minus sign, dates as dd.mm.yy.
export function formatBare(spec: Spec): string {
  if (isDateUnit(spec.unit)) return formatStoredDate(spec.value)
  const n = parseNumber(spec.value)
  return n === null ? String(spec.value) : numberFormat.format(n).replace('-', '−')
}

// Value with its unit after a narrow no-break space. A date column shows no unit.
export function formatValue(spec: Spec): string {
  const value = formatBare(spec)
  if (!spec.unit || isDateUnit(spec.unit)) return value
  return `${value} ${spec.unit.trim()}`
}

export function formatDate(ts: number): string {
  return dateFormat.format(new Date(ts))
}
