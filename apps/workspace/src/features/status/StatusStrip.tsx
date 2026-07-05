"use client"

import { useEffect, useState } from "react"
import { getPersonaJson } from "@/shared/api/personaApi"

interface MemoryStats {
  topics: number
  profile: number
  timelineEvents: number
}

interface StatusResponse {
  status: string
  memory?: Partial<MemoryStats>
}

export function StatusStrip() {
  const [online, setOnline] = useState(false)
  const [loading, setLoading] = useState(true)
  const [memory, setMemory] = useState<MemoryStats>({ topics: 0, profile: 0, timelineEvents: 0 })

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const status = await getPersonaJson<StatusResponse>("/api/status")
        if (cancelled) return
        setOnline(status.status === "ok")
        setMemory({
          topics: Number(status.memory?.topics ?? 0),
          profile: Number(status.memory?.profile ?? 0),
          timelineEvents: Number(status.memory?.timelineEvents ?? 0),
        })
      } catch {
        if (!cancelled) setOnline(false)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    const timer = window.setInterval(load, 30_000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [])

  return (
    <aside className="status-strip" aria-label="Persona runtime status">
      <div className="status-heading">
        <h2>Persona Runtime</h2>
        <span className={`status-pill ${online ? "online" : "offline"}`}>
          {loading ? "checking" : online ? "online" : "offline"}
        </span>
      </div>

      <div className="metric-grid">
        <div className="metric">
          <strong>{memory.profile}</strong>
          <span>Profile</span>
        </div>
        <div className="metric">
          <strong>{memory.topics}</strong>
          <span>Topics</span>
        </div>
        <div className="metric">
          <strong>{memory.timelineEvents}</strong>
          <span>Timeline</span>
        </div>
      </div>

      <p className="status-note">
        Runtime data comes from Application APIs only. The UI does not read env files, SQLite, logs, or LLM providers.
      </p>
    </aside>
  )
}
