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
    <aside className="status-strip" aria-label="Persona 运行状态">
      <div className="status-heading">
        <h2>Persona 运行状态</h2>
        <span className={`status-pill ${online ? "online" : "offline"}`}>
          {loading ? "检查中" : online ? "在线" : "离线"}
        </span>
      </div>

      <div className="metric-grid">
        <div className="metric">
          <strong>{memory.profile}</strong>
          <span>画像</span>
        </div>
        <div className="metric">
          <strong>{memory.topics}</strong>
          <span>主题</span>
        </div>
        <div className="metric">
          <strong>{memory.timelineEvents}</strong>
          <span>时间线</span>
        </div>
      </div>

      <p className="status-note">
        运行状态仅来自 Application API；界面不会直接读取环境文件、SQLite、日志或 LLM 提供方。
      </p>
    </aside>
  )
}
