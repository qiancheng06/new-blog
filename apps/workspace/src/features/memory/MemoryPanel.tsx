"use client"

import { FormEvent, useEffect, useMemo, useState } from "react"
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
    if (loading) return "refreshing"
    if (error) return "backend offline"
    return `filter: ${profileState}`
  }, [error, loading, profileState])

  async function load() {
    setLoading(true)
    setError("")
    try {
      const data = await getPersonaJson<MemoryProfileResponse>(`/api/memory/profile?limit=12&offset=0&state=${profileState}`)
      setProfile(data.items)
    } catch {
      setError("Cannot read Memory Profile. Confirm the Persona backend is running.")
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
      setMessage("Correction recorded as a Memory governance event.")
      setCorrectionValue("")
      setCorrectionReason("")
      await load()
    } catch {
      setMessage("Correction failed. Check Persona API status.")
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
      setMessage(`${item.key} marked as ${state}.`)
      setStateReasons((current) => ({ ...current, [item.id]: "" }))
      await load()
    } catch {
      setMessage("State change failed. Check Persona API status.")
    } finally {
      setStateBusy("")
    }
  }

  return (
    <div className="memory-panel">
      <header className="memory-heading">
        <div>
          <h2>Memory Profile</h2>
          <p>{subtitle}</p>
        </div>
        <button className="icon-button" type="button" title="Refresh Memory" disabled={loading} onClick={() => void load()}>
          Refresh
        </button>
      </header>

      <div className="memory-controls">
        <div>
          <div className="filter-row" aria-label="Memory state filter">
            {stateOptions.map((option) => (
              <button
                key={option}
                type="button"
                className={`compact-button ${profileState === option ? "active" : ""}`}
                onClick={() => setProfileState(option)}
              >
                {option}
              </button>
            ))}
          </div>
          {message ? <p className="save-message">{message}</p> : null}
        </div>

        <form className="correction-form" onSubmit={submitCorrection}>
          <input
            className="input"
            value={correctionKey}
            placeholder="profile key"
            onChange={(event) => setCorrectionKey(event.target.value)}
          />
          <textarea
            className="textarea"
            value={correctionValue}
            placeholder="corrected value"
            onChange={(event) => setCorrectionValue(event.target.value)}
          />
          <input
            className="input"
            value={correctionReason}
            placeholder="reason, optional"
            onChange={(event) => setCorrectionReason(event.target.value)}
          />
          <button className="compact-button active" type="submit" disabled={saving || !correctionKey.trim()}>
            Apply correction
          </button>
        </form>
      </div>

      <div className="memory-list">
        {loading ? <p className="empty-state">Loading memory...</p> : null}
        {!loading && error ? <p className="error-state">{error}</p> : null}
        {!loading && !error && profile.length === 0 ? <p className="empty-state">No profile memory yet.</p> : null}

        {profile.map((item) => (
          <article key={item.id} className="memory-item">
            <div>
              <button className="memory-key" type="button" onClick={() => setCorrectionKey(item.key)}>
                {item.key}
              </button>
              <div className="memory-meta">
                <span>{formatDate(item.updated_at)}</span>
                <span>{item.state}</span>
              </div>
            </div>
            <div className="memory-value">{formatValue(item.value)}</div>
            <form className="state-form" onSubmit={(event) => event.preventDefault()}>
              <input
                className="input"
                value={stateReasons[item.id] ?? ""}
                placeholder="reason required"
                onChange={(event) => setStateReasons((current) => ({ ...current, [item.id]: event.target.value }))}
              />
              <div className="state-actions">
                <button
                  className="state-button"
                  type="button"
                  disabled={stateBusy === item.id || !stateReasons[item.id]?.trim()}
                  onClick={() => void submitStateChange(item, "archived")}
                >
                  Archive
                </button>
                <button
                  className="state-button warn"
                  type="button"
                  disabled={stateBusy === item.id || !stateReasons[item.id]?.trim()}
                  onClick={() => void submitStateChange(item, "suppressed")}
                >
                  Suppress
                </button>
                {item.state !== "active" ? (
                  <button
                    className="state-button good"
                    type="button"
                    disabled={stateBusy === item.id || !stateReasons[item.id]?.trim()}
                    onClick={() => void submitStateChange(item, "active")}
                  >
                    Restore
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
  if (!value) return "unknown"
  return value.replace("T", " ").replace(/\.\d+Z$/, "")
}
