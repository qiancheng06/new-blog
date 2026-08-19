"use client"

import { Activity, ArrowRight, BrainCircuit, CalendarClock, Database, Pin, PlugZap, RefreshCw, Wrench } from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"
import { DailySummaryPanel } from "@/features/daily-summary/DailySummaryPanel"
import { useSidebarFavorites, type SidebarFavorite } from "@/features/workspace/sidebarFavorites"
import { getPersonaJson } from "@/shared/api/personaApi"

interface StatusResponse {
  status: string
  uptime: number
  events_today: number
  background_tasks?: { pending?: number }
  memory?: { topics?: number; profile?: number; timelineEvents?: number }
}

const runtimeFavorite: SidebarFavorite = { id: "tool-runtime", label: "运行诊断", href: "/tools#runtime", kind: "tool" }
const dailyFavorite: SidebarFavorite = { id: "tool-daily-summary", label: "每日总结", href: "/tools#daily-summary", kind: "tool" }

const toolLinks = [
  { href: "/ai/models", label: "模型连接", description: "配置供应商、模型和 API Key，并执行无记忆写入的连接测试。", icon: PlugZap, tone: "blue" },
  { href: "/ai/memory", label: "记忆检查", description: "查看主题、画像和时间线，确认长期记忆是否按预期工作。", icon: Database, tone: "green" },
  { href: "/ai", label: "对话工作区", description: "使用当前模型与行为设置，直接进入完整 AI 对话。", icon: BrainCircuit, tone: "amber" },
]

export function ToolsPage() {
  const [status, setStatus] = useState<StatusResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const { toggleFavorite, isFavorite, isFull } = useSidebarFavorites()

  async function loadStatus() {
    setLoading(true)
    setError("")
    try {
      setStatus(await getPersonaJson<StatusResponse>("/api/status"))
    } catch {
      setStatus(null)
      setError("无法连接 Persona API。")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadStatus() }, [])

  return (
    <main className="module-page tools-page">
      <header className="module-page-header">
        <div>
          <span className="module-kicker"><Wrench size={14} />工具</span>
          <h1>AI 操作中心</h1>
          <p>把诊断、模型验证、记忆检查和每日总结集中到一个工作页面。</p>
        </div>
      </header>

      <section className="tool-runtime" id="runtime">
        <header className="module-section-header">
          <div><span className="module-section-icon green"><Activity size={17} /></span><div><strong>运行诊断</strong><small>来自 Persona Application API</small></div></div>
          <div className="module-section-actions">
            <PinButton favorite={runtimeFavorite} pinned={isFavorite(runtimeFavorite.id)} disabled={isFull && !isFavorite(runtimeFavorite.id)} onToggle={toggleFavorite} />
            <button className="module-icon-button" type="button" title="刷新状态" aria-label="刷新状态" disabled={loading} onClick={() => void loadStatus()}><RefreshCw size={15} /></button>
          </div>
        </header>
        <div className="tool-runtime-metrics">
          <Metric label="服务" value={loading ? "检查中" : status?.status === "ok" ? "在线" : "离线"} tone={status?.status === "ok" ? "online" : "offline"} />
          <Metric label="今日事件" value={String(status?.events_today ?? 0)} />
          <Metric label="记忆条目" value={String((status?.memory?.topics ?? 0) + (status?.memory?.profile ?? 0) + (status?.memory?.timelineEvents ?? 0))} />
          <Metric label="后台任务" value={String(status?.background_tasks?.pending ?? 0)} />
        </div>
        {error ? <p className="tool-runtime-error" role="alert">{error}</p> : null}
      </section>

      <section className="tool-launcher" aria-labelledby="tool-launcher-title">
        <header className="module-section-header"><div><span className="module-section-icon blue"><PlugZap size={17} /></span><div><strong id="tool-launcher-title">常用工具</strong><small>直接进入已有闭环功能</small></div></div></header>
        <div className="tool-link-list">
          {toolLinks.map((tool) => (
            <Link href={tool.href} key={tool.href}>
              <span className={`tool-link-icon ${tool.tone}`}><tool.icon size={17} /></span>
              <span><strong>{tool.label}</strong><small>{tool.description}</small></span>
              <ArrowRight size={16} />
            </Link>
          ))}
        </div>
      </section>

      <section className="tool-daily" id="daily-summary">
        <header className="module-section-header">
          <div><span className="module-section-icon amber"><CalendarClock size={17} /></span><div><strong>每日总结</strong><small>按日期生成并查看最近的工作记录</small></div></div>
          <PinButton favorite={dailyFavorite} pinned={isFavorite(dailyFavorite.id)} disabled={isFull && !isFavorite(dailyFavorite.id)} onToggle={toggleFavorite} />
        </header>
        <DailySummaryPanel />
      </section>
    </main>
  )
}

function Metric({ label, value, tone = "" }: { label: string; value: string; tone?: string }) {
  return <div><span>{label}</span><strong className={tone}>{value}</strong></div>
}

function PinButton({ favorite, pinned, disabled, onToggle }: { favorite: SidebarFavorite; pinned: boolean; disabled: boolean; onToggle: (favorite: SidebarFavorite) => void }) {
  return (
    <button className={`module-icon-button ${pinned ? "active" : ""}`} type="button" title={pinned ? "取消固定" : disabled ? "固定入口已满" : "固定到侧栏"} aria-label={pinned ? `取消固定${favorite.label}` : `固定${favorite.label}`} aria-pressed={pinned} disabled={disabled} onClick={() => onToggle(favorite)}>
      <Pin size={15} />
    </button>
  )
}
