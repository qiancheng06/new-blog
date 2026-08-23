"use client"

import { BrainCircuit, LoaderCircle, Monitor, Moon, Palette, PlugZap, Power, PowerOff, RotateCcw, Settings2, Sun } from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"
import { defaultAiSettings } from "@/features/chat/aiSettings"
import {
  defaultWorkspaceAppearance,
  parseWorkspaceAppearance,
  WORKSPACE_APPEARANCE_KEY,
  type WorkspaceAppearanceConfig,
  type WorkspaceTheme,
} from "@/features/workspace/appearance"
import { useAiConsole } from "./AiConsoleShell"

const themes: Array<{ value: WorkspaceTheme; label: string; icon: typeof Sun }> = [
  { value: "light", label: "明亮", icon: Sun },
  { value: "dark", label: "暗色", icon: Moon },
  { value: "system", label: "跟随系统", icon: Monitor },
]

export function AiSettingsPage() {
  const { settings, setSettings, online, refreshHealth } = useAiConsole()
  const runtimeExternallyManaged = process.env.NEXT_PUBLIC_PERSONA_RUNTIME_MODE === "external"
  const [appearance, setAppearance] = useState<WorkspaceAppearanceConfig>(defaultWorkspaceAppearance)
  const [appearanceReady, setAppearanceReady] = useState(false)
  const [runtimeAction, setRuntimeAction] = useState<"start" | "stop" | null>(null)
  const [runtimeMessage, setRuntimeMessage] = useState("")
  const [runtimeError, setRuntimeError] = useState(false)

  useEffect(() => {
    setAppearance(parseWorkspaceAppearance(window.localStorage.getItem(WORKSPACE_APPEARANCE_KEY)))
    setAppearanceReady(true)
  }, [])

  useEffect(() => {
    if (!appearanceReady) return
    const root = document.documentElement
    const systemDark = window.matchMedia("(prefers-color-scheme: dark)")
    const apply = () => {
      const resolved = appearance.theme === "system" ? (systemDark.matches ? "dark" : "light") : appearance.theme
      root.dataset.theme = resolved
      root.dataset.motion = appearance.motion ? "on" : "off"
      root.style.setProperty("--accent-hue", String(appearance.accentHue))
      window.dispatchEvent(new Event("persona-appearance-change"))
    }
    apply()
    window.localStorage.setItem(WORKSPACE_APPEARANCE_KEY, JSON.stringify(appearance))
    systemDark.addEventListener("change", apply)
    return () => systemDark.removeEventListener("change", apply)
  }, [appearance, appearanceReady])

  function resetAiBehavior() {
    setSettings({
      ...settings,
      temperature: defaultAiSettings.temperature,
      topP: defaultAiSettings.topP,
      maxTokens: defaultAiSettings.maxTokens,
      historyLimit: defaultAiSettings.historyLimit,
      memoryEnabled: defaultAiSettings.memoryEnabled,
      backgroundAnalysis: defaultAiSettings.backgroundAnalysis,
      instructions: defaultAiSettings.instructions,
    })
  }

  async function startPersonaApi() {
    if (runtimeAction || online) return
    setRuntimeAction("start")
    setRuntimeMessage("")
    setRuntimeError(false)
    try {
      const response = await fetch("/api/persona/runtime", { method: "POST" })
      const result = await response.json() as { online?: boolean; started?: boolean; error?: string }
      if (!response.ok || !result.online) throw new Error(result.error || "Persona API 启动失败。")
      await refreshHealth()
      setRuntimeMessage(result.started ? "Persona API 已启动。" : "Persona API 已在运行。")
    } catch (error) {
      setRuntimeError(true)
      setRuntimeMessage(error instanceof Error ? error.message : "Persona API 启动失败。")
    } finally {
      setRuntimeAction(null)
    }
  }

  async function stopPersonaApi() {
    if (runtimeAction || !online) return
    setRuntimeAction("stop")
    setRuntimeMessage("")
    setRuntimeError(false)
    try {
      const response = await fetch("/api/persona/runtime", { method: "DELETE" })
      const result = await response.json() as { online?: boolean; stopped?: boolean; error?: string }
      if (!response.ok || result.online) throw new Error(result.error || "Persona API 停止失败。")
      await refreshHealth()
      setRuntimeMessage(result.stopped ? "Persona API 已停止。" : "Persona API 当前未运行。")
    } catch (error) {
      setRuntimeError(true)
      setRuntimeMessage(error instanceof Error ? error.message : "Persona API 停止失败。")
    } finally {
      setRuntimeAction(null)
    }
  }

  return (
    <div className="ai-page ai-settings-page">
      <header className="ai-page-header">
        <div>
          <span className="ai-page-kicker"><Settings2 size={14} />设置</span>
          <h1>AI 模块设置</h1>
        </div>
        <Link className="ai-secondary-button" href="/ai/models"><PlugZap size={15} />API 与模型</Link>
      </header>

      <section className="ai-settings-panel ai-runtime-control">
        <header><Power size={17} /><div><strong>{runtimeExternallyManaged ? "Persona API" : "本地 Persona API"}</strong><span>{runtimeExternallyManaged ? "由 NAS 容器与 Cloudflare 网关管理" : "启动网页对话、记忆和每日总结所需的本地服务"}</span></div></header>
        <div className="ai-runtime-control-row">
          <span className={`ai-runtime-state ${online ? "online" : "offline"}`}><i />{online ? "运行中" : "未运行"}</span>
          {runtimeExternallyManaged
            ? <span className="ai-runtime-managed">NAS 托管</span>
            : <button className={online ? "ai-danger-button" : "ai-primary-button"} type="button" disabled={runtimeAction !== null} onClick={() => void (online ? stopPersonaApi() : startPersonaApi())}>
                {runtimeAction ? <LoaderCircle className="spinning" size={16} /> : online ? <PowerOff size={16} /> : <Power size={16} />}
                {runtimeAction === "start" ? "启动中" : runtimeAction === "stop" ? "停止中" : online ? "停止 Persona API" : "启动 Persona API"}
              </button>}
        </div>
        {runtimeMessage ? <p className={`ai-runtime-message ${runtimeError ? "error" : "success"}`} role="status">{runtimeMessage}</p> : null}
      </section>

      <div className="ai-settings-page-grid">
        <section className="ai-settings-panel">
          <header><Palette size={17} /><div><strong>工作台外观</strong><span>与现有前端共享主题配置</span></div></header>
          <div className="ai-theme-segments" role="group" aria-label="界面主题">
            {themes.map(({ value, label, icon: Icon }) => (
              <button key={value} type="button" className={appearance.theme === value ? "active" : ""} onClick={() => setAppearance({ ...appearance, theme: value })}>
                <Icon size={17} /><span>{label}</span>
              </button>
            ))}
          </div>
          <label className="ai-setting-range">
            <span><b>主题色相</b><output>{appearance.accentHue}</output></span>
            <input type="range" min="120" max="220" value={appearance.accentHue} onChange={(event) => setAppearance({ ...appearance, accentHue: Number(event.target.value) })} />
          </label>
          <SettingSwitch label="界面动效" checked={appearance.motion} onChange={(motion) => setAppearance({ ...appearance, motion })} />
          <button className="ai-secondary-button ai-settings-reset" type="button" onClick={() => setAppearance(defaultWorkspaceAppearance)}><RotateCcw size={15} />恢复外观默认值</button>
        </section>

        <section className="ai-settings-panel">
          <header><BrainCircuit size={17} /><div><strong>AI 默认行为</strong><span>应用于新发送的消息</span></div></header>
          <label className="ai-setting-range">
            <span><b>最近对话</b><output>{settings.historyLimit} 条</output></span>
            <input type="range" min="0" max="10" step="1" value={settings.historyLimit} onChange={(event) => setSettings({ ...settings, historyLimit: Number(event.target.value) })} />
          </label>
          <label className="ai-setting-range">
            <span><b>最长回复</b><output>{settings.maxTokens} tokens</output></span>
            <input type="range" min="128" max="4096" step="128" value={settings.maxTokens} onChange={(event) => setSettings({ ...settings, maxTokens: Number(event.target.value) })} />
          </label>
          <SettingSwitch label="使用长期记忆" checked={settings.memoryEnabled} onChange={(memoryEnabled) => setSettings({ ...settings, memoryEnabled })} />
          <SettingSwitch label="后台分析与记忆更新" checked={settings.backgroundAnalysis} onChange={(backgroundAnalysis) => setSettings({ ...settings, backgroundAnalysis })} />
          <p className="ai-analysis-note">后台记忆分析使用 Persona 服务端模型，不保存当前浏览器的 API Key。</p>
          <button className="ai-secondary-button ai-settings-reset" type="button" onClick={resetAiBehavior}><RotateCcw size={15} />恢复 AI 默认值</button>
        </section>
      </div>

      <section className="ai-settings-panel ai-settings-instructions">
        <header><BrainCircuit size={17} /><div><strong>补充指令</strong><span>控制回复习惯，不改变模型连接</span></div></header>
        <textarea rows={7} maxLength={1000} value={settings.instructions} placeholder="例如：回答简洁，优先给出下一步行动。" onChange={(event) => setSettings({ ...settings, instructions: event.target.value })} />
        <small>{settings.instructions.length}/1000</small>
      </section>
    </div>
  )
}

function SettingSwitch({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <div className="ai-setting-switch">
      <b>{label}</b>
      <button type="button" role="switch" aria-label={label} aria-checked={checked} className={checked ? "on" : ""} onClick={() => onChange(!checked)}><span /></button>
    </div>
  )
}
