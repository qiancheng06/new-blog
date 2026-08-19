"use client"

import { BrainCircuit, Database, History, RefreshCw, Search, Tag } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { getPersonaJson } from "@/shared/api/personaApi"

type MemoryTab = "topics" | "profile" | "timeline"

interface MemoryOverview {
  stats: { topics: number; profile: number; timelineEvents: number }
  topics: Array<{ id: string; name: string; summary: string; message_count: number; state: string; last_active_at: string }>
  profile: Array<{ id: string; key: string; value: string; state: string; updated_at: string }>
  timelineEvents: Array<{ id: string; date: string; type: string; summary: string; created_at: string }>
}

const emptyMemory: MemoryOverview = {
  stats: { topics: 0, profile: 0, timelineEvents: 0 },
  topics: [],
  profile: [],
  timelineEvents: [],
}

export function AiMemoryPage() {
  const [memory, setMemory] = useState<MemoryOverview>(emptyMemory)
  const [tab, setTab] = useState<MemoryTab>("topics")
  const [query, setQuery] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  async function loadMemory() {
    setLoading(true)
    setError("")
    try {
      const data = await getPersonaJson<MemoryOverview>("/api/memory?topicLimit=30&profileLimit=30&timelineLimit=30")
      setMemory(data)
    } catch {
      setError("无法读取记忆，请确认 Persona API 正在运行。")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadMemory() }, [])

  const normalizedQuery = query.trim().toLowerCase()
  const visibleTopics = useMemo(() => memory.topics.filter((item) => `${item.name} ${item.summary}`.toLowerCase().includes(normalizedQuery)), [memory.topics, normalizedQuery])
  const visibleProfile = useMemo(() => memory.profile.filter((item) => `${item.key} ${item.value}`.toLowerCase().includes(normalizedQuery)), [memory.profile, normalizedQuery])
  const visibleTimeline = useMemo(() => memory.timelineEvents.filter((item) => `${item.type} ${item.summary} ${item.date}`.toLowerCase().includes(normalizedQuery)), [memory.timelineEvents, normalizedQuery])

  return (
    <div className="ai-page ai-memory-page">
      <header className="ai-page-header">
        <div>
          <span className="ai-page-kicker"><Database size={14} />记忆</span>
          <h1>AI 记忆检查</h1>
        </div>
        <button className="ai-secondary-button" type="button" disabled={loading} onClick={() => void loadMemory()}><RefreshCw size={15} />刷新</button>
      </header>

      <section className="ai-memory-metrics" aria-label="记忆统计">
        <div><span><Tag size={16} /></span><strong>{memory.stats.topics}</strong><small>主题</small></div>
        <div><span><BrainCircuit size={16} /></span><strong>{memory.stats.profile}</strong><small>画像</small></div>
        <div><span><History size={16} /></span><strong>{memory.stats.timelineEvents}</strong><small>时间线事件</small></div>
      </section>

      <section className="ai-memory-browser">
        <header>
          <div className="ai-memory-tabs" role="tablist" aria-label="记忆类型">
            <button type="button" role="tab" aria-selected={tab === "topics"} className={tab === "topics" ? "active" : ""} onClick={() => setTab("topics")}>主题</button>
            <button type="button" role="tab" aria-selected={tab === "profile"} className={tab === "profile" ? "active" : ""} onClick={() => setTab("profile")}>画像</button>
            <button type="button" role="tab" aria-selected={tab === "timeline"} className={tab === "timeline" ? "active" : ""} onClick={() => setTab("timeline")}>时间线</button>
          </div>
          <label className="ai-memory-search">
            <Search size={15} />
            <input value={query} placeholder="筛选记忆" aria-label="筛选记忆" onChange={(event) => setQuery(event.target.value)} />
          </label>
        </header>

        <div className="ai-memory-list" role="tabpanel">
          {loading ? <div className="ai-memory-state">正在读取记忆</div> : null}
          {!loading && error ? <div className="ai-memory-state error">{error}</div> : null}
          {!loading && !error && tab === "topics" ? visibleTopics.map((item) => (
            <article key={item.id} className="ai-memory-row">
              <span className="ai-memory-row-icon topic"><Tag size={15} /></span>
              <div><div className="ai-memory-row-title"><strong>{item.name}</strong><span className={`ai-memory-badge ${item.state}`}>{stateLabel(item.state)}</span></div><p>{item.summary || "暂无摘要"}</p></div>
              <div className="ai-memory-row-meta"><strong>{item.message_count}</strong><span>消息</span><time>{formatDate(item.last_active_at)}</time></div>
            </article>
          )) : null}
          {!loading && !error && tab === "profile" ? visibleProfile.map((item) => (
            <article key={item.id} className="ai-memory-row">
              <span className="ai-memory-row-icon profile"><BrainCircuit size={15} /></span>
              <div><div className="ai-memory-row-title"><strong>{item.key}</strong><span className={`ai-memory-badge ${item.state}`}>{stateLabel(item.state)}</span></div><p>{formatMemoryValue(item.value)}</p></div>
              <div className="ai-memory-row-meta"><time>{formatDate(item.updated_at)}</time></div>
            </article>
          )) : null}
          {!loading && !error && tab === "timeline" ? visibleTimeline.map((item) => (
            <article key={item.id} className="ai-memory-row">
              <span className="ai-memory-row-icon timeline"><History size={15} /></span>
              <div><div className="ai-memory-row-title"><strong>{timelineLabel(item.type)}</strong></div><p>{item.summary}</p></div>
              <div className="ai-memory-row-meta"><time>{item.date}</time></div>
            </article>
          )) : null}
          {!loading && !error && currentCount(tab, visibleTopics.length, visibleProfile.length, visibleTimeline.length) === 0 ? <div className="ai-memory-state">没有匹配的记忆</div> : null}
        </div>
      </section>
    </div>
  )
}

function currentCount(tab: MemoryTab, topics: number, profile: number, timeline: number): number {
  return tab === "topics" ? topics : tab === "profile" ? profile : timeline
}

function stateLabel(value: string): string {
  if (value === "archived") return "已归档"
  if (value === "suppressed") return "已抑制"
  return "活跃"
}

function timelineLabel(value: string): string {
  if (value === "milestone") return "里程碑"
  if (value === "shift") return "转变"
  return "洞察"
}

function formatMemoryValue(value: string): string {
  try {
    const parsed = JSON.parse(value) as unknown
    return typeof parsed === "string" ? parsed : JSON.stringify(parsed)
  } catch {
    return value
  }
}

function formatDate(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" })
}
