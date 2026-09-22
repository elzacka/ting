import { t } from '../lib/strings'
import { Icon } from './Icons'
import { useObjectUrl } from './useObjectUrl'

type Props = {
  photos: readonly Blob[]
  name: string
  onFirst: (index: number) => void
  onRemove: (index: number) => void
}

function Tile({
  photo,
  index,
  name,
  onFirst,
  onRemove,
}: {
  photo: Blob
  index: number
  name: string
  onFirst: () => void
  onRemove: () => void
}) {
  const url = useObjectUrl(photo)
  const first = index === 0
  return (
    <div className={`photo-tile${first ? ' is-first' : ''}`}>
      <button
        type="button"
        className="photo-tile-pick"
        aria-label={first ? t.action.firstPhoto : t.action.makeFirstPhoto}
        aria-pressed={first}
        disabled={first}
        onClick={onFirst}
      >
        {url && <img src={url} alt={t.detail.photoAlt(name)} />}
      </button>
      <button
        type="button"
        className="btn btn-icon photo-tile-drop"
        aria-label={t.action.removePhotoAt(index + 1)}
        onClick={onRemove}
      >
        <Icon name="close" size={16} />
      </button>
    </div>
  )
}

// Every photo a thing carries, the first one first. Tapping one makes it the
// first, which is the one the table, the phone list and the report show.
// Only worth drawing once there is more than one to choose between.
export function PhotoStrip({ photos, name, onFirst, onRemove }: Props) {
  if (photos.length < 2) return null
  return (
    <div className="photo-strip" role="group" aria-label={t.detail.photos}>
      {photos.map((photo, i) => (
        <Tile
          key={i}
          photo={photo}
          index={i}
          name={name}
          onFirst={() => onFirst(i)}
          onRemove={() => onRemove(i)}
        />
      ))}
    </div>
  )
}
