interface StateBlockProps {
  title?: string
  message: string
  tone?: "neutral" | "error"
  compact?: boolean
}

export function StateBlock({ title, message, tone = "neutral", compact = false }: StateBlockProps) {
  if (compact) {
    return <p className={`empty-state compact ${tone === "error" ? "error-state" : ""}`}>{message}</p>
  }

  return (
    <div className={`state-box ${tone}`}>
      {title ? <strong>{title}</strong> : null}
      <p>{message}</p>
    </div>
  )
}

export function SkeletonRows({ rows = 3 }: { rows?: number }) {
  return (
    <div className="skeleton-stack" aria-label="加载中">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="skeleton-row" />
      ))}
    </div>
  )
}
