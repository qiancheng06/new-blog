"use client"

import { BrainCircuit, Eye, EyeOff, RotateCcw, Server, SlidersHorizontal, Unplug, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { defaultAiSettings, getAiSettingsError, type AiSettingsConfig } from "./aiSettings"

interface AiSettingsDrawerProps {
  open: boolean
  value: AiSettingsConfig
  onChange: (value: AiSettingsConfig) => void
  onClose: () => void
}

export function AiSettingsDrawer({ open, value, onChange, onClose }: AiSettingsDrawerProps) {
  const [showApiKey, setShowApiKey] = useState(false)
  const drawerRef = useRef<HTMLElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const connectionError = getAiSettingsError(value)

  useEffect(() => {
    if (!open) return
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    drawerRef.current?.focus()

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onCloseRef.current()
      if (event.key !== "Tab" || !drawerRef.current) return

      const focusable = Array.from(
        drawerRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'),
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
        aria-label="关闭 AI 参数"
        tabIndex={open ? 0 : -1}
        onClick={onClose}
      />
      <aside
        ref={drawerRef}
        className={`ai-settings-drawer ${open ? "open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-hidden={!open}
        aria-label="AI 参数"
        tabIndex={-1}
        inert={!open}
      >
        <header className="ai-settings-header">
          <div>
            <span className="drawer-icon"><BrainCircuit size={18} /></span>
            <div>
              <strong>AI 参数</strong>
              <p>下一条消息起生效</p>
            </div>
          </div>
          <button className="icon-button" type="button" title="关闭 AI 参数" onClick={onClose}>
            <X size={18} />
          </button>
        </header>

        <section className="ai-settings-group" aria-labelledby="connection-settings">
          <div className="ai-settings-group-title" id="connection-settings">
            <Server size={16} />
            <span>模型连接</span>
          </div>
          <div className="ai-provider-segments" role="group" aria-label="模型连接方式">
            <button
              type="button"
              className={value.connectionMode === "server" ? "active" : ""}
              onClick={() => onChange({ ...value, connectionMode: "server" })}
            >
              <Server size={16} />
              <span>服务端默认</span>
            </button>
            <button
              type="button"
              className={value.connectionMode === "custom" ? "active" : ""}
              onClick={() => onChange({ ...value, connectionMode: "custom" })}
            >
              <Unplug size={16} />
              <span>兼容接口</span>
            </button>
          </div>

          {value.connectionMode === "custom" ? (
            <div className="ai-connection-fields">
              <label>
                <span>API 地址</span>
                <input
                  type="url"
                  value={value.endpoint}
                  maxLength={2048}
                  placeholder="https://example.com/v1/chat/completions"
                  onChange={(event) => onChange({ ...value, endpoint: event.target.value })}
                />
              </label>
              <label>
                <span>模型</span>
                <input
                  value={value.model}
                  maxLength={200}
                  placeholder="model-name"
                  onChange={(event) => onChange({ ...value, model: event.target.value })}
                />
              </label>
              <label>
                <span>API Key</span>
                <div className="ai-secret-field">
                  <input
                    type={showApiKey ? "text" : "password"}
                    value={value.apiKey}
                    maxLength={4000}
                    autoComplete="off"
                    placeholder="仅当前会话保存"
                    onChange={(event) => onChange({ ...value, apiKey: event.target.value })}
                  />
                  <button
                    type="button"
                    title={showApiKey ? "隐藏 API Key" : "显示 API Key"}
                    aria-label={showApiKey ? "隐藏 API Key" : "显示 API Key"}
                    onClick={() => setShowApiKey((current) => !current)}
                  >
                    {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </label>
              <p className={`ai-connection-state ${connectionError ? "invalid" : "valid"}`} role="status">
                {connectionError ?? "连接配置完整"}
              </p>
            </div>
          ) : null}
        </section>

        <section className="ai-settings-group" aria-labelledby="generation-settings">
          <div className="ai-settings-group-title" id="generation-settings">
            <SlidersHorizontal size={16} />
            <span>生成参数</span>
          </div>
          <RangeSetting
            label="创造性"
            value={value.temperature}
            output={value.temperature.toFixed(1)}
            min={0}
            max={2}
            step={0.1}
            onChange={(temperature) => onChange({ ...value, temperature })}
          />
          <RangeSetting
            label="采样范围"
            value={value.topP}
            output={value.topP.toFixed(2)}
            min={0.1}
            max={1}
            step={0.05}
            onChange={(topP) => onChange({ ...value, topP })}
          />
          <RangeSetting
            label="最长回复"
            value={value.maxTokens}
            output={`${value.maxTokens} tokens`}
            min={128}
            max={4096}
            step={128}
            onChange={(maxTokens) => onChange({ ...value, maxTokens })}
          />
          <RangeSetting
            label="最近对话"
            value={value.historyLimit}
            output={`${value.historyLimit} 条`}
            min={0}
            max={10}
            step={1}
            onChange={(historyLimit) => onChange({ ...value, historyLimit })}
          />
        </section>

        <section className="ai-settings-group" aria-labelledby="memory-settings">
          <div className="ai-settings-group-title" id="memory-settings">
            <BrainCircuit size={16} />
            <span>上下文与记忆</span>
          </div>
          <ToggleSetting
            label="使用长期记忆"
            checked={value.memoryEnabled}
            onChange={(memoryEnabled) => onChange({ ...value, memoryEnabled })}
          />
          <ToggleSetting
            label="后台分析与记忆更新"
            checked={value.backgroundAnalysis}
            onChange={(backgroundAnalysis) => onChange({ ...value, backgroundAnalysis })}
          />
        </section>

        <label className="ai-settings-group ai-instructions">
          <span className="ai-settings-group-title">补充指令</span>
          <textarea
            value={value.instructions}
            maxLength={1000}
            rows={5}
            placeholder="例如：回答简洁，优先给出下一步行动。"
            onChange={(event) => onChange({ ...value, instructions: event.target.value })}
          />
          <small>{value.instructions.length}/1000</small>
        </label>

        <button className="reset-ai-settings" type="button" onClick={() => onChange(defaultAiSettings)}>
          <RotateCcw size={16} />
          恢复默认参数
        </button>
      </aside>
    </>
  )
}

interface RangeSettingProps {
  label: string
  value: number
  output: string
  min: number
  max: number
  step: number
  onChange: (value: number) => void
}

function RangeSetting({ label, value, output, min, max, step, onChange }: RangeSettingProps) {
  return (
    <label className="ai-range-setting">
      <span><b>{label}</b><output>{output}</output></span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  )
}

function ToggleSetting({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <div className="ai-toggle-setting">
      <b>{label}</b>
      <button
        className={`toggle ${checked ? "on" : ""}`}
        type="button"
        role="switch"
        aria-label={label}
        aria-checked={checked}
        onClick={() => onChange(!checked)}
      ><span /></button>
    </div>
  )
}
