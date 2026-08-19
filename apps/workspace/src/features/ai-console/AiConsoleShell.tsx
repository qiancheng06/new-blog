"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Database,
  MessageSquareText,
  Moon,
  PlugZap,
  Sun,
} from "lucide-react"
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import {
  AI_API_KEY_SESSION_KEY,
  AI_SETTINGS_KEY,
  defaultAiSettings,
  parseAiSettings,
  type AiSettingsConfig,
} from "@/features/chat/aiSettings"
import { getPersonaJson } from "@/shared/api/personaApi"
import { ApplicationFrame } from "@/features/workspace/ApplicationFrame"

interface AiConsoleContextValue {
  settings: AiSettingsConfig
  setSettings: (value: AiSettingsConfig) => void
  online: boolean
  refreshHealth: () => Promise<boolean>
}

const AiConsoleContext = createContext<AiConsoleContextValue | null>(null)

const navigation = [
  { href: "/ai", label: "AI 对话", icon: MessageSquareText },
  { href: "/ai/models", label: "模型连接", icon: PlugZap },
  { href: "/ai/memory", label: "记忆", icon: Database },
]

export function AiConsoleShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const [settings, setSettings] = useState<AiSettingsConfig>(defaultAiSettings)
  const [settingsReady, setSettingsReady] = useState(false)
  const [online, setOnline] = useState(false)
  const [dark, setDark] = useState(false)

  useEffect(() => {
    const stored = parseAiSettings(window.localStorage.getItem(AI_SETTINGS_KEY))
    setSettings({ ...stored, apiKey: window.sessionStorage.getItem(AI_API_KEY_SESSION_KEY) ?? "" })
    setSettingsReady(true)
    setDark(document.documentElement.dataset.theme === "dark")
  }, [])

  useEffect(() => {
    const syncTheme = () => setDark(document.documentElement.dataset.theme === "dark")
    window.addEventListener("persona-appearance-change", syncTheme)
    return () => window.removeEventListener("persona-appearance-change", syncTheme)
  }, [])

  useEffect(() => {
    if (!settingsReady) return
    const { apiKey, ...persistedSettings } = settings
    window.localStorage.setItem(AI_SETTINGS_KEY, JSON.stringify(persistedSettings))
    if (apiKey) window.sessionStorage.setItem(AI_API_KEY_SESSION_KEY, apiKey)
    else window.sessionStorage.removeItem(AI_API_KEY_SESSION_KEY)
  }, [settings, settingsReady])

  const refreshHealth = useCallback(async () => {
    try {
      await getPersonaJson("/health")
      setOnline(true)
      return true
    } catch {
      setOnline(false)
      return false
    }
  }, [])

  useEffect(() => {
    void refreshHealth()
    const timer = window.setInterval(() => void refreshHealth(), 30_000)
    return () => {
      window.clearInterval(timer)
    }
  }, [refreshHealth])

  const value = useMemo(() => ({ settings, setSettings, online, refreshHealth }), [settings, online, refreshHealth])
  const modelLabel = settings.connectionMode === "custom" ? settings.model || "未配置模型" : "服务端默认"

  function toggleTheme() {
    const nextDark = !dark
    setDark(nextDark)
    document.documentElement.dataset.theme = nextDark ? "dark" : "light"
    try {
      const current = JSON.parse(window.localStorage.getItem("persona-workspace-appearance") || "{}") as Record<string, unknown>
      window.localStorage.setItem("persona-workspace-appearance", JSON.stringify({ ...current, theme: nextDark ? "dark" : "light" }))
    } catch {
      window.localStorage.setItem("persona-workspace-appearance", JSON.stringify({ theme: nextDark ? "dark" : "light" }))
    }
    window.dispatchEvent(new Event("persona-appearance-change"))
  }

  return (
    <AiConsoleContext.Provider value={value}>
      <ApplicationFrame className="ai-console-frame">
        <div className="ai-console-shell">
        <header className="ai-console-topbar">
          <div className="ai-console-context">
            <span className={`ai-health-dot ${online ? "online" : "offline"}`} />
            <span>{online ? "API 在线" : "API 离线"}</span>
            <i />
            <span>{modelLabel}</span>
          </div>
          <nav className="ai-console-section-nav" aria-label="AI 模块导航">
            {navigation.map((item) => {
              const active = item.href === "/ai" ? pathname === item.href : pathname.startsWith(item.href)
              return (
                <Link key={item.href} className={active ? "active" : ""} href={item.href}>
                  <item.icon size={15} />
                  <span>{item.label}</span>
                </Link>
              )
            })}
          </nav>
          <div className="ai-console-tools">
            <button type="button" title={dark ? "切换到明亮主题" : "切换到暗色主题"} aria-label={dark ? "切换到明亮主题" : "切换到暗色主题"} onClick={toggleTheme}>
              {dark ? <Sun size={17} /> : <Moon size={17} />}
            </button>
          </div>
        </header>

        <main className="ai-console-main">{children}</main>
        </div>
      </ApplicationFrame>
    </AiConsoleContext.Provider>
  )
}

export function useAiConsole(): AiConsoleContextValue {
  const context = useContext(AiConsoleContext)
  if (!context) throw new Error("useAiConsole must be used inside AiConsoleShell")
  return context
}
