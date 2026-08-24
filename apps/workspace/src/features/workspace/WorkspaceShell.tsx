"use client"

import type { ReactNode } from "react"
import { useEffect, useState } from "react"
import { ChatDock } from "@/features/chat/ChatDock"
import {
  AI_API_KEY_SESSION_KEY,
  AI_SETTINGS_KEY,
  defaultAiSettings,
  parseAiSettings,
  type AiSettingsConfig,
} from "@/features/chat/aiSettings"
import {
  defaultWorkspaceAppearance,
  parseWorkspaceAppearance,
  WORKSPACE_APPEARANCE_KEY,
  type WorkspaceAppearanceConfig,
} from "./appearance"
import { MobileWorkspaceNav } from "./MobileWorkspaceNav"
import { TodayFocus } from "./TodayFocus"
import { WorkspaceSidebar } from "./WorkspaceSidebar"

export function WorkspaceShell({ children }: { children: ReactNode }) {
  const [appearance, setAppearance] = useState<WorkspaceAppearanceConfig>(defaultWorkspaceAppearance)
  const [appearanceReady, setAppearanceReady] = useState(false)
  const [aiSettings, setAiSettings] = useState<AiSettingsConfig>(defaultAiSettings)
  const [aiSettingsReady, setAiSettingsReady] = useState(false)

  useEffect(() => {
    setAppearance(parseWorkspaceAppearance(window.localStorage.getItem(WORKSPACE_APPEARANCE_KEY)))
    setAppearanceReady(true)
  }, [])

  useEffect(() => {
    const stored = parseAiSettings(window.localStorage.getItem(AI_SETTINGS_KEY))
    setAiSettings({ ...stored, apiKey: window.sessionStorage.getItem(AI_API_KEY_SESSION_KEY) ?? "" })
    setAiSettingsReady(true)
  }, [])

  useEffect(() => {
    if (!aiSettingsReady) return
    const { apiKey, ...persistedSettings } = aiSettings
    window.localStorage.setItem(AI_SETTINGS_KEY, JSON.stringify(persistedSettings))
    if (apiKey) window.sessionStorage.setItem(AI_API_KEY_SESSION_KEY, apiKey)
    else window.sessionStorage.removeItem(AI_API_KEY_SESSION_KEY)
  }, [aiSettings, aiSettingsReady])

  useEffect(() => {
    if (!appearanceReady) return
    const root = document.documentElement
    const systemDark = window.matchMedia("(prefers-color-scheme: dark)")
    const apply = () => {
      const resolved = appearance.theme === "system" ? (systemDark.matches ? "dark" : "light") : appearance.theme
      root.dataset.theme = resolved
      root.dataset.motion = appearance.motion ? "on" : "off"
      root.style.setProperty("--accent-hue", String(appearance.accentHue))
    }

    apply()
    window.localStorage.setItem(WORKSPACE_APPEARANCE_KEY, JSON.stringify(appearance))
    systemDark.addEventListener("change", apply)
    return () => systemDark.removeEventListener("change", apply)
  }, [appearance, appearanceReady])

  const sidebar = <WorkspaceSidebar />

  return (
    <main className="workspace-shell" id="top">
      <MobileWorkspaceNav />
      <div className="workspace-app">
        <aside className="workspace-rail" aria-label="工作区侧栏">
          {sidebar}
        </aside>

        <div className="workspace-main-column">
          <TodayFocus />
          {children}

          <footer className="workspace-footer">
            <span>Persona 工作台</span>
            <span>Obsidian 内容与 Persona 记忆始终通过适配层接入。</span>
          </footer>
        </div>
      </div>

      <ChatDock aiSettings={aiSettings} />
    </main>
  )
}
