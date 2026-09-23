import { packIcon } from '../icons/pack'

// A category's icon from the pack, drawn in the text colour like every other
// icon. Only paths from the pack's own files: nothing is inserted as markup.
export function CategoryIcon({ id, size = 20 }: { id: string; size?: number }) {
  const icon = packIcon(id)
  return (
    <svg width={size} height={size} viewBox={icon.viewBox} fill="currentColor" aria-hidden="true" focusable="false">
      {icon.paths.map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  )
}
