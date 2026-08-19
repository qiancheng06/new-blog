"use client"

import Link from "next/link"
import ReactMarkdown from "react-markdown"
import { FormEvent, useEffect, useRef, useState } from "react"
import { Bot, Eraser, MessageSquareText, Send, Settings2, Sparkles, UserRound } from "lucide-react"
import { buildAiRequest, getAiSettingsError } from "@/features/chat/aiSettings"
import { getPersonaJson, postPersonaJson } from "@/shared/api/personaApi"
import { useAiConsole } from "./AiConsoleShell"

interface ChatMessage {
  id: string
  role: "user" | "assistant"
  text: string
  time: string
}

interface EventsResponse {
  events?: Array<{ id: string; type: string; payload: string; timestamp: string }>
}

const quickPrompts = [
  "总结今天最值得推进的三件事",
  "根据最近对话指出一个潜在风险",
  "把当前想法整理成可执行步骤",
]

export function AiChatPage() {
  const { settings, setSettings, online } = useAiConsole()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(true)
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    let cancelled = false
    async function loadHistory() {
      try {
        const data = await getPersonaJson<EventsResponse>("/api/events")
        if (!cancelled) setMessages(eventsToMessages(data.events ?? []))
      } catch {
        if (!cancelled) setMessages([])
      } finally {
        if (!cancelled) setHistoryLoading(false)
      }
    }
    void loadHistory()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages, loading])

  async function send(event: FormEvent) {
    event.preventDefault()
    const text = input.trim()
    if (!text || loading) return
    const settingsError = getAiSettingsError(settings)
    if (settingsError) {
      setMessages((current) => [...current, createMessage("assistant", `模型连接未完成：${settingsError}`)])
      return
    }

    setInput("")
    setMessages((current) => [...current, createMessage("user", text)])
    setLoading(true)
    try {
      const data = await postPersonaJson<{ reply?: string }>("/api/chat", {
        text,
        page: "/ai",
        ai: buildAiRequest(settings),
      })
      setMessages((current) => [...current, createMessage("assistant", data.reply || "我在。")])
    } catch {
      setMessages((current) => [...current, createMessage("assistant", "请求失败，请检查 Persona API 与模型连接。")])
    } finally {
      setLoading(false)
      window.requestAnimationFrame(() => textareaRef.current?.focus())
    }
  }

  return (
    <div className="ai-page ai-chat-page">
      <header className="ai-page-header">
        <div>
          <span className="ai-page-kicker"><MessageSquareText size={14} />AI 对话</span>
          <h1>对话工作区</h1>
        </div>
        <div className="ai-page-header-status">
          <span className={`ai-health-dot ${online ? "online" : "offline"}`} />
          {online ? "已连接 Persona API" : "Persona API 离线"}
        </div>
      </header>

      <div className="ai-chat-layout">
        <section className="ai-chat-surface" aria-label="AI 对话">
          <header>
            <div>
              <Bot size={17} />
              <strong>当前会话</strong>
              <span>{settings.connectionMode === "custom" ? settings.model || "自定义模型" : "服务端模型"}</span>
            </div>
            <button type="button" title="清空当前视图" aria-label="清空当前视图" onClick={() => setMessages([])}>
              <Eraser size={16} />
            </button>
          </header>

          <div className="ai-message-scroll" ref={scrollRef} role="log" aria-live="polite">
            {historyLoading ? <div className="ai-message-state">正在读取最近对话</div> : null}
            {!historyLoading && messages.length === 0 ? (
              <div className="ai-chat-empty">
                <span><Sparkles size={21} /></span>
                <strong>开始一段对话</strong>
                <div className="ai-quick-prompts">
                  {quickPrompts.map((prompt) => (
                    <button key={prompt} type="button" onClick={() => setInput(prompt)}>{prompt}</button>
                  ))}
                </div>
              </div>
            ) : null}
            {messages.map((message) => (
              <article key={message.id} className={`ai-message ${message.role}`}>
                <span className="ai-message-avatar">
                  {message.role === "assistant" ? <Bot size={15} /> : <UserRound size={15} />}
                </span>
                <div>
                  <div className="ai-message-author">
                    <strong>{message.role === "assistant" ? "Persona" : "你"}</strong>
                    <time>{message.time}</time>
                  </div>
                  <div className="ai-message-content">
                    {message.role === "assistant" ? <ReactMarkdown>{message.text}</ReactMarkdown> : message.text}
                  </div>
                </div>
              </article>
            ))}
            {loading ? (
              <article className="ai-message assistant pending" role="status">
                <span className="ai-message-avatar"><Bot size={15} /></span>
                <div><div className="ai-message-author"><strong>Persona</strong></div><div className="ai-thinking"><i /><i /><i /></div></div>
              </article>
            ) : null}
          </div>

          <form className="ai-composer" onSubmit={send}>
            <textarea
              ref={textareaRef}
              rows={3}
              value={input}
              placeholder="输入消息"
              aria-label="输入 AI 消息"
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault()
                  void send(event)
                }
              }}
            />
            <div>
              <span>{settings.historyLimit} 条上下文 · 最长 {settings.maxTokens} tokens</span>
              <button type="submit" title="发送" aria-label="发送" disabled={!input.trim() || loading}><Send size={17} /></button>
            </div>
          </form>
        </section>

        <aside className="ai-chat-inspector" aria-label="当前对话参数">
          <header>
            <div><Settings2 size={16} /><strong>对话参数</strong></div>
            <Link href="/ai/models">模型连接</Link>
          </header>
          <RangeControl label="创造性" value={settings.temperature} output={settings.temperature.toFixed(1)} min={0} max={2} step={0.1} onChange={(temperature) => setSettings({ ...settings, temperature })} />
          <RangeControl label="采样范围" value={settings.topP} output={settings.topP.toFixed(2)} min={0.1} max={1} step={0.05} onChange={(topP) => setSettings({ ...settings, topP })} />
          <RangeControl label="最长回复" value={settings.maxTokens} output={`${settings.maxTokens}`} min={128} max={4096} step={128} onChange={(maxTokens) => setSettings({ ...settings, maxTokens })} />
          <RangeControl label="最近对话" value={settings.historyLimit} output={`${settings.historyLimit} 条`} min={0} max={10} step={1} onChange={(historyLimit) => setSettings({ ...settings, historyLimit })} />
          <div className="ai-inspector-divider" />
          <SwitchControl label="使用长期记忆" checked={settings.memoryEnabled} onChange={(memoryEnabled) => setSettings({ ...settings, memoryEnabled })} />
          <SwitchControl label="后台记忆分析" checked={settings.backgroundAnalysis} onChange={(backgroundAnalysis) => setSettings({ ...settings, backgroundAnalysis })} />
        </aside>
      </div>
    </div>
  )
}

function RangeControl(props: { label: string; value: number; output: string; min: number; max: number; step: number; onChange: (value: number) => void }) {
  return (
    <label className="ai-inspector-range">
      <span><b>{props.label}</b><output>{props.output}</output></span>
      <input type="range" min={props.min} max={props.max} step={props.step} value={props.value} onChange={(event) => props.onChange(Number(event.target.value))} />
    </label>
  )
}

function SwitchControl({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <div className="ai-inspector-switch">
      <b>{label}</b>
      <button type="button" role="switch" aria-label={label} aria-checked={checked} className={checked ? "on" : ""} onClick={() => onChange(!checked)}><span /></button>
    </div>
  )
}

function eventsToMessages(events: NonNullable<EventsResponse["events"]>): ChatMessage[] {
  return events
    .filter((event) => event.type === "message" || event.type === "companion_reply")
    .slice(0, 16)
    .reverse()
    .map((event) => {
      let text = ""
      try {
        const payload = JSON.parse(event.payload) as { text?: unknown }
        text = typeof payload.text === "string" ? payload.text : ""
      } catch {
        text = ""
      }
      return {
        id: event.id,
        role: (event.type === "companion_reply" ? "assistant" : "user") as ChatMessage["role"],
        text,
        time: formatTime(event.timestamp),
      }
    })
    .filter((message) => message.text.length > 0)
}

function createMessage(role: ChatMessage["role"], text: string): ChatMessage {
  return { id: `${role}-${Date.now()}-${Math.random()}`, role, text, time: formatTime(new Date().toISOString()) }
}

function formatTime(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "刚刚" : date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })
}
