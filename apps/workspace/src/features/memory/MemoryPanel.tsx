"use client"

import { FormEvent, useEffect, useMemo, useState } from "react"
import { RefreshCw } from "lucide-react"
import { getPersonaJson, postPersonaJson } from "@/shared/api/personaApi"

type ProjectionState = "active" | "archived" | "suppressed"
type ProfileStateFilter = ProjectionState | "all"

interface ProfileRow {
  id: string
  key: string
  value: string
  source_event_id: string | null
  updated_at: string
  state: ProjectionState
}

interface MemoryProfileResponse {
  items: ProfileRow[]
}

const stateOptions: ProfileStateFilter[] = ["active", "archived", "suppressed", "all"]
const stateLabels: Record<ProfileStateFilter, string> = {
  active: "活跃",
  archived: "已归档",
  suppressed: "已抑制",
  all: "全部",
}

export function MemoryPanel() {
  const [profile, setProfile] = useState<ProfileRow[]>([])
  const [profileState, setProfileState] = useState<ProfileStateFilter>("active")
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const [correctionKey, setCorrectionKey] = useState("")
  const [correctionValue, setCorrectionValue] = useState("")
  const [correctionReason, setCorrectionReason] = useState("")
  const [stateReasons, setStateReasons] = useState<Record<string, string>>({})
  const [stateBusy, setStateBusy] = useState("")

  const subtitle = useMemo(() => {
    if (loading) return "刷新中"
    if (error) return "后端离线"
    return `筛选：${stateLabels[profileState]}`
  }, [error, loading, profileState])

  const profileSummary = useMemo(() => {
    return {
      visible: profile.length,
      active: profile.filter((item) => item.state === "active").length,
      governed: profile.filter((item) => item.state !== "active").length,
    }
  }, [profile])

  async function load() {
    setLoading(true)
    setError("")
    try {
      const data = await getPersonaJson<MemoryProfileResponse>(`/api/memory/profile?limit=12&offset=0&state=${profileState}`)
      setProfile(data.items)
    } catch {
      setError("无法读取记忆画像，请确认 Persona 后端正在运行。")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileState])

  async function submitCorrection(event: FormEvent) {
    event.preventDefault()
    const key = correctionKey.trim()
    if (!key || saving) return

    setSaving(true)
    setMessage("")
    try {
      await postPersonaJson("/api/memory/profile/corrections", {
        key,
        value: parseCorrectionValue(correctionValue),
        reason: correctionReason.trim() || undefined,
      })
      setMessage("修正已记录为一条记忆治理事件。")
      setCorrectionValue("")
      setCorrectionReason("")
      await load()
    } catch {
      setMessage("修正失败，请检查 Persona API 状态。")
    } finally {
      setSaving(false)
    }
  }

  async function submitStateChange(item: ProfileRow, state: ProjectionState) {
    const reason = stateReasons[item.id]?.trim()
    if (!reason || stateBusy) return

    setStateBusy(item.id)
    setMessage("")
    try {
      await postPersonaJson("/api/memory/profile/state", {
        id: item.id,
        state,
        reason,
      })
      setMessage(`${item.key} 已标记为${stateLabels[state]}。`)
      setStateReasons((current) => ({ ...current, [item.id]: "" }))
      await load()
    } catch {
      setMessage("状态变更失败，请检查 Persona API 状态。")
    } finally {
      setStateBusy("")
    }
  }

  return (
    <div className="memory-panel">
      <header className="memory-heading">
        <div>
          <h2>记忆画像</h2>
          <p>{subtitle}</p>
          <div className="inline-stats" aria-label="记忆画像摘要">
            <span>{profileSummary.visible} 条可见</span>
            <span>{profileSummary.active} 条活跃</span>
            <span>{profileSummary.governed} 条受治理</span>
          </div>
        </div>
        <button className="icon-button wide" type="button" title="刷新记忆" disabled={loading} onClick={() => void load()}>
          <RefreshCw size={16} />
          <span>刷新</span>
        </button>
      </header>

      <div className="memory-controls">
        <div className="memory-filter-card">
          <span className="control-label">画像状态</span>
          <div className="filter-row" aria-label="记忆状态筛选">
            {stateOptions.map((option) => (
              <button
                key={option}
                type="button"
                className={`compact-button ${profileState === option ? "active" : ""}`}
                onClick={() => setProfileState(option)}
              >
                {stateLabels[option]}
              </button>
            ))}
          </div>
          {message ? <p className="save-message">{message}</p> : null}
        </div>

        <form className="correction-form" onSubmit={submitCorrection}>
          <span className="control-label">记录修正</span>
          <input
            className="input"
            aria-label="画像键名"
            value={correctionKey}
            placeholder="画像键名"
            onChange={(event) => setCorrectionKey(event.target.value)}
          />
          <textarea
            className="textarea"
            aria-label="修正后的画像值"
            value={correctionValue}
            placeholder="修正后的值"
            onChange={(event) => setCorrectionValue(event.target.value)}
          />
          <input
            className="input"
            aria-label="修正原因"
            value={correctionReason}
            placeholder="修正原因（可选）"
            onChange={(event) => setCorrectionReason(event.target.value)}
          />
          <button className="compact-button active" type="submit" disabled={saving || !correctionKey.trim()}>
            应用修正
          </button>
        </form>
      </div>

      <div className="memory-list">
        {loading ? <p className="empty-state">正在加载记忆…</p> : null}
        {!loading && error ? <p className="error-state">{error}</p> : null}
        {!loading && !error && profile.length === 0 ? <p className="empty-state">暂无画像记忆。</p> : null}

        {profile.map((item) => (
          <article key={item.id} className="memory-item">
            <div>
              <button className="memory-key" type="button" onClick={() => setCorrectionKey(item.key)}>
                {item.key}
              </button>
              <div className="memory-meta">
                <span>{formatDate(item.updated_at)}</span>
                <span className={`state-badge ${item.state}`}>{stateLabels[item.state]}</span>
              </div>
            </div>
            <div className="memory-value">{formatValue(item.value)}</div>
            <form className="state-form" onSubmit={(event) => event.preventDefault()}>
              <input
                className="input"
                aria-label={`更改 ${item.key} 状态的原因`}
                value={stateReasons[item.id] ?? ""}
                placeholder="必须填写原因"
                onChange={(event) => setStateReasons((current) => ({ ...current, [item.id]: event.target.value }))}
              />
              <div className="state-actions">
                <button
                  className="state-button"
                  type="button"
                  disabled={stateBusy === item.id || !stateReasons[item.id]?.trim()}
                  onClick={() => void submitStateChange(item, "archived")}
                >
                  归档
                </button>
                <button
                  className="state-button warn"
                  type="button"
                  disabled={stateBusy === item.id || !stateReasons[item.id]?.trim()}
                  onClick={() => void submitStateChange(item, "suppressed")}
                >
                  抑制
                </button>
                {item.state !== "active" ? (
                  <button
                    className="state-button good"
                    type="button"
                    disabled={stateBusy === item.id || !stateReasons[item.id]?.trim()}
                    onClick={() => void submitStateChange(item, "active")}
                  >
                    恢复
                  </button>
                ) : null}
              </div>
            </form>
          </article>
        ))}
      </div>
    </div>
  )
}

function parseCorrectionValue(value: string): unknown {
  const trimmed = value.trim()
  if (!trimmed) return ""
  try {
    return JSON.parse(trimmed) as unknown
  } catch {
    return trimmed
  }
}

function formatValue(value: string): string {
  try {
    const parsed = JSON.parse(value) as unknown
    if (Array.isArray(parsed)) return parsed.join(", ")
    if (parsed && typeof parsed === "object") return JSON.stringify(parsed)
    return String(parsed)
  } catch {
    return value
  }
}

function formatDate(value: string): string {
  if (!value) return "未知"
  return value.replace("T", " ").replace(/\.\d+Z$/, "")
}
