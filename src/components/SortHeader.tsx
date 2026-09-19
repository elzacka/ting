import type { ColumnDef } from '../lib/fields'
import { nextSort, type Sort } from '../lib/sort'
import { t } from '../lib/strings'
import { Icon } from './Icons'

type Props = { def: ColumnDef; label: string; sort: Sort | null; onSort: (s: Sort | null) => void }

// Column name as a button: click cycles ascending, descending, off.
export function SortHeader({ def, label, sort, onSort }: Props) {
  const active = sort?.id === def.id ? sort.dir : null
  return (
    <button
      type="button"
      className={`sort-btn${active ? ' is-active' : ''}`}
      aria-label={t.table.sortBy(label)}
      onClick={() => onSort(nextSort(sort, def.id))}
    >
      {label}
      {active && <Icon name={active === 'asc' ? 'arrowUp' : 'arrowDown'} size={14} className="sort-arrow" />}
    </button>
  )
}

export function ariaSort(def: ColumnDef, sort: Sort | null): 'ascending' | 'descending' | undefined {
  if (sort?.id !== def.id) return undefined
  return sort.dir === 'asc' ? 'ascending' : 'descending'
}
