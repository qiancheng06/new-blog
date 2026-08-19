"use client"

import { Monitor, Moon, RotateCcw, Sparkles, Sun, X } from "lucide-react"
import { useEffect, useRef } from "react"
import {
  defaultWorkspaceAppearance,
  type WorkspaceAppearanceConfig,
  type WorkspaceTheme,
} from "./appearance"

interface AppearanceDrawerProps {
  open: boolean
  value: WorkspaceAppearanceConfig
  onChange: (value: WorkspaceAppearanceConfig) => void
  onClose: () => void
}

const themes: Array<{ value: WorkspaceTheme; label: string; icon: typeof Sun }> = [
  { value: "light", label: "明亮", icon: Sun },
  { value: "dark", label: "暗色", icon: Moon },
  { value: "system", label: "跟随系统", icon: Monitor },
]

export function AppearanceDrawer({ open, value, onChange, onClose }: AppearanceDrawerProps) {
  const drawerRef = useRef<HTMLElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    drawerRef.current?.focus()

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onCloseRef.current()
      if (event.key !== "Tab" || !drawerRef.current) return

      const focusable = Array.from(
        drawerRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'),
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => {
      window.removeEventListener("keydown", handleKeyDown)
      previousFocusRef.current?.focus()
    }
  }, [open])

  return (
    <>
      <button
        className={`drawer-backdrop ${open ? "visible" : ""}`}
        type="button"
        aria-label="关闭显示设置"
        tabIndex={open ? 0 : -1}
        onClick={onClose}
      />
      <aside
        ref={drawerRef}
        className={`appearance-drawer ${open ? "open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-hidden={!open}
        aria-label="显示设置"
        tabIndex={-1}
        inert={!open}
      >
        <header>
          <div>
            <span className="drawer-icon"><Sparkles size={17} /></span>
            <div>
              <strong>显示设置</strong>
              <p>按你的习惯调整工作台。</p>
            </div>
          </div>
          <button className="icon-button" type="button" title="关闭设置" onClick={onClose}>
            <X size={18} />
          </button>
        </header>

        <div className="appearance-section">
          <span className="control-label">主题</span>
          <div className="theme-segments">
            {themes.map(({ value: theme, label, icon: Icon }) => (
              <button
                key={theme}
                type="button"
                className={value.theme === theme ? "active" : ""}
                onClick={() => onChange({ ...value, theme })}
              >
                <Icon size={16} />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>

        <label className="appearance-section range-control">
          <span><b>主题色相</b><output>{value.accentHue}</output></span>
          <input
            type="range"
            min="120"
            max="220"
            value={value.accentHue}
            onChange={(event) => onChange({ ...value, accentHue: Number(event.target.value) })}
          />
        </label>

        <div className="appearance-section motion-row">
          <div>
            <b>界面动效</b>
            <span>柔和的进入与悬停过渡</span>
          </div>
          <button
            className={`toggle ${value.motion ? "on" : ""}`}
            type="button"
            role="switch"
            aria-checked={value.motion}
            onClick={() => onChange({ ...value, motion: !value.motion })}
          ><span /></button>
        </div>

        <button className="reset-appearance" type="button" onClick={() => onChange(defaultWorkspaceAppearance)}>
          <RotateCcw size={16} />
          恢复默认设置
        </button>
      </aside>
    </>
  )
}
