import { useId, type ReactNode } from 'react'
import { Icon } from './Icons'

// Innstillinger: a group of rows. Each row names itself, so the heading is for screen readers only.
export function SettingGroup({ title, className, children }: { title: string; className?: string; children: ReactNode }) {
  return (
    <section className={className ? `setting-group ${className}` : 'setting-group'}>
      <h2 className="visually-hidden">{title}</h2>
      {children}
    </section>
  )
}

type SwitchProps = {
  title: string
  checked: boolean
  disabled?: boolean
  onChange: (on: boolean) => void
}

// A setting that applies at once: the whole line toggles it
export function SettingSwitch({ title, checked, disabled = false, onChange }: SwitchProps) {
  const id = useId()
  return (
    <label className="setting-main setting-switch">
      <span className="setting-text">
        <span id={`${id}-title`} className="setting-title">
          {title}
        </span>
      </span>
      <input
        type="checkbox"
        role="switch"
        className="switch"
        checked={checked}
        disabled={disabled}
        aria-labelledby={`${id}-title`}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  )
}

type TitleProps = {
  title: string
  id?: string
  // The id of the folded part (SettingMore), when the row has something beyond its title
  foldId?: string | undefined
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

// A row's title, with its status and rarer actions folded under it: the title itself opens them,
// a chevron beside it says so. Without anything to tell, a plain title.
export function SettingTitle({ title, id, foldId, open = false, onOpenChange }: TitleProps) {
  if (!foldId) {
    return (
      <span id={id} className="setting-title">
        {title}
      </span>
    )
  }
  return (
    <button
      type="button"
      id={id}
      className="setting-title setting-fold"
      aria-expanded={open}
      aria-controls={foldId}
      onClick={() => onOpenChange?.(!open)}
    >
      {title}
      <Icon name="chevronRight" size={16} className="disclosure-chevron" />
    </button>
  )
}

export function SettingMore({ id, open, children }: { id: string; open: boolean; children: ReactNode }) {
  return (
    <div id={id} className="setting-more" hidden={!open}>
      {children}
    </div>
  )
}
