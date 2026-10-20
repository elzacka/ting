import { useId, type ReactNode } from 'react'

// Innstillinger: a group of rows. Each row names itself, so the heading is for screen readers only.
export function SettingGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="setting-group">
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
