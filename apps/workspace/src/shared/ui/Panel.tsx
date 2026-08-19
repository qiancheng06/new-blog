import type { ReactNode } from "react"

interface PanelProps {
  id: string
  eyebrow: string
  title: string
  description: string
  stats?: ReactNode
  actions?: ReactNode
  children: ReactNode
}

export function Panel({ id, eyebrow, title, description, stats, actions, children }: PanelProps) {
  return (
    <section className="feature-panel" id={id}>
      <div className="feature-heading">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
          <p>{description}</p>
          {stats ? (
            <div className="inline-stats" aria-label={`${title}摘要`}>
              {stats}
            </div>
          ) : null}
        </div>
        {actions ? <div className="feature-heading-tools">{actions}</div> : null}
      </div>
      {children}
    </section>
  )
}
