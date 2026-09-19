import type { ReactNode } from 'react'
import { Icon } from './Icons'

export function Notice({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="notice" role="status">
      <Icon name="warning" size={20} />
      <p>{children}</p>
      {action}
    </div>
  )
}
