"use client"

import { Eye, EyeOff, PlugZap, RotateCcw, Server, ShieldCheck, TestTube2, Unplug } from "lucide-react"
import { useState } from "react"
import { buildAiRequest, defaultAiSettings, getAiSettingsError } from "@/features/chat/aiSettings"
import { postPersonaJson } from "@/shared/api/personaApi"
import { useAiConsole } from "./AiConsoleShell"

export function AiModelsPage() {
  const { settings, setSettings } = useAiConsole()
  const [showKey, setShowKey] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string; latency?: number } | null>(null)
  const settingsError = getAiSettingsError(settings)

  async function testConnection() {
    if (settingsError || testing) return
    setTesting(true)
    setTestResult(null)
    try {
      const result = await postPersonaJson<{ reply?: string; latencyMs?: number }>("/api/ai/test", {
        ai: buildAiRequest(settings),
      })
      setTestResult({ ok: true, message: result.reply || "连接成功", latency: result.latencyMs })
    } catch {
      setTestResult({ ok: false, message: "连接测试失败，请检查地址、模型和 Key。" })
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="ai-page ai-models-page">
      <header className="ai-page-header">
        <div>
          <span className="ai-page-kicker"><PlugZap size={14} />模型连接</span>
          <h1>供应商与模型</h1>
        </div>
        <button className="ai-secondary-button" type="button" onClick={() => setSettings(defaultAiSettings)}>
          <RotateCcw size={15} />恢复默认
        </button>
      </header>

      <div className="ai-models-grid">
        <section className="ai-settings-panel">
          <header><Server size={17} /><div><strong>连接方式</strong><span>选择 Persona 服务端配置或兼容接口</span></div></header>
          <div className="ai-mode-segments" role="group" aria-label="连接方式">
            <button type="button" className={settings.connectionMode === "server" ? "active" : ""} onClick={() => setSettings({ ...settings, connectionMode: "server" })}>
              <Server size={18} /><span>服务端默认</span>
            </button>
            <button type="button" className={settings.connectionMode === "custom" ? "active" : ""} onClick={() => setSettings({ ...settings, connectionMode: "custom" })}>
              <Unplug size={18} /><span>OpenAI 兼容接口</span>
            </button>
          </div>

          {settings.connectionMode === "custom" ? (
            <div className="ai-provider-form">
              <label>
                <span>API 地址</span>
                <input type="url" maxLength={2048} value={settings.endpoint} placeholder="https://example.com/v1/chat/completions" onChange={(event) => setSettings({ ...settings, endpoint: event.target.value })} />
              </label>
              <label>
                <span>模型名称</span>
                <input maxLength={200} value={settings.model} placeholder="model-name" onChange={(event) => setSettings({ ...settings, model: event.target.value })} />
              </label>
              <label>
                <span>API Key</span>
                <div className="ai-key-field">
                  <input type={showKey ? "text" : "password"} maxLength={4000} autoComplete="off" value={settings.apiKey} placeholder="仅当前浏览器会话保存" onChange={(event) => setSettings({ ...settings, apiKey: event.target.value })} />
                  <button type="button" title={showKey ? "隐藏 API Key" : "显示 API Key"} aria-label={showKey ? "隐藏 API Key" : "显示 API Key"} onClick={() => setShowKey((current) => !current)}>
                    {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </label>
              <p className={`ai-form-state ${settingsError ? "invalid" : "valid"}`}>{settingsError || "连接信息完整"}</p>
            </div>
          ) : (
            <div className="ai-server-mode-note">
              <ShieldCheck size={18} />
              <div><strong>由 Persona 后端管理凭据</strong><span>使用服务端环境中的供应商、模型和 Key。</span></div>
            </div>
          )}
        </section>

        <section className="ai-settings-panel ai-test-panel">
          <header><TestTube2 size={17} /><div><strong>连接测试</strong><span>不创建对话事件，不更新记忆</span></div></header>
          <dl className="ai-connection-summary">
            <div><dt>连接</dt><dd>{settings.connectionMode === "custom" ? "兼容接口" : "Persona 服务端"}</dd></div>
            <div><dt>模型</dt><dd>{settings.connectionMode === "custom" ? settings.model || "未填写" : "服务端默认"}</dd></div>
            <div><dt>采样</dt><dd>{settings.temperature.toFixed(1)} / {settings.topP.toFixed(2)}</dd></div>
            <div><dt>输出上限</dt><dd>{settings.maxTokens} tokens</dd></div>
          </dl>
          <button className="ai-primary-button" type="button" disabled={Boolean(settingsError) || testing} onClick={() => void testConnection()}>
            <PlugZap size={16} />{testing ? "测试中" : "测试连接"}
          </button>
          {testResult ? (
            <div className={`ai-test-result ${testResult.ok ? "success" : "failed"}`} role="status">
              <strong>{testResult.ok ? "连接成功" : "连接失败"}</strong>
              <span>{testResult.message}</span>
              {testResult.latency !== undefined ? <small>{testResult.latency} ms</small> : null}
            </div>
          ) : null}
        </section>
      </div>

      <section className="ai-settings-panel ai-instructions-panel">
        <header><ShieldCheck size={17} /><div><strong>补充指令</strong><span>应用于 AI 对话回复</span></div></header>
        <textarea rows={7} maxLength={1000} value={settings.instructions} placeholder="例如：回答简洁，优先给出下一步行动。" onChange={(event) => setSettings({ ...settings, instructions: event.target.value })} />
        <small>{settings.instructions.length}/1000</small>
      </section>
    </div>
  )
}
