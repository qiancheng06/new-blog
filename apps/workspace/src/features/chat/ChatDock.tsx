"use client"

import { FormEvent, useEffect, useRef, useState } from "react"
import { MessageCircle, Send, X } from "lucide-react"
import { getPersonaJson, postPersonaJson } from "@/shared/api/personaApi"
import { buildAiRequest, defaultAiSettings, getAiSettingsError, type AiSettingsConfig } from "./aiSettings"

interface ChatMessage {
  role: "user" | "assistant"
  text: string
  time: string
}

interface ChatResponse {
  reply?: string
}

const quickPrompts = [
  "总结今天的工作台状态",
  "检查活跃项目的风险",
  "帮我把笔记整理成下一步行动",
]

function formatTime(date: Date): string {
  return `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`
}

export function ChatDock({
  openSignal = 0,
  aiSettings = defaultAiSettings,
}: {
  openSignal?: number
  aiSettings?: AiSettingsConfig
}) {
  const [open, setOpen] = useState(false)
  const [online, setOnline] = useState(false)
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    async function checkHealth() {
      try {
        await getPersonaJson("/health")
        setOnline(true)
      } catch {
        setOnline(false)
      }
    }

    void checkHealth()
  }, [])

  useEffect(() => {
    if (openSignal > 0) openChat()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openSignal])

  useEffect(() => {
    if (!open) return
    window.requestAnimationFrame(() => inputRef.current?.focus())

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeChat()
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [open])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages, loading])

  async function send(event: FormEvent) {
    event.preventDefault()
    const text = input.trim()
    if (!text || loading) return
    const settingsError = getAiSettingsError(aiSettings)
    if (settingsError) {
      setMessages((current) => [
        ...current,
        { role: "assistant", text: `AI 参数未完成：${settingsError}`, time: formatTime(new Date()) },
      ])
      return
    }

    setInput("")
    setMessages((current) => [...current, { role: "user", text, time: formatTime(new Date()) }])
    setLoading(true)

    try {
      const data = await postPersonaJson<ChatResponse>("/api/chat", {
        text,
        page: globalThis.location?.pathname ?? "/",
        ai: buildAiRequest(aiSettings),
      })
      setOnline(true)
      setMessages((current) => [
        ...current,
        { role: "assistant", text: data.reply || "我在。", time: formatTime(new Date()) },
      ])
    } catch {
      setOnline(false)
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          text: "连接失败。请使用 npm.cmd run dev:backend 启动 Persona。",
          time: formatTime(new Date()),
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  function openChat() {
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setOpen(true)
  }

  function closeChat() {
    setOpen(false)
    window.requestAnimationFrame(() => previousFocusRef.current?.focus())
  }

  if (!open) {
    return (
      <div className="chat-dock">
        <button className="chat-fab" type="button" title="打开 Companion" onClick={openChat}>
          <span className={`chat-fab-dot ${online ? "online" : "offline"}`} />
          <MessageCircle size={22} />
        </button>
      </div>
    )
  }

  return (
    <section className="chat-dock chat-panel" role="dialog" aria-modal="false" aria-label="Companion 对话">
      <header className="chat-header">
        <div>
          <strong>Companion</strong>
          <span>
            {online ? "Persona API 在线" : "Persona API 离线"} · {aiSettings.connectionMode === "custom" ? aiSettings.model || "自定义模型" : "服务端模型"}
          </span>
        </div>
        <button className="icon-button" type="button" title="关闭对话" onClick={closeChat}>
          <X size={18} />
        </button>
      </header>

      <div className="chat-messages" ref={scrollRef} role="log" aria-live="polite" aria-relevant="additions">
        {messages.length === 0 ? (
          <div className="chat-empty">
            <p className="empty-state">发送一条消息，Companion 会通过本地 Application API 回复。</p>
            <div className="quick-prompt-row" aria-label="快捷提示">
              {quickPrompts.map((prompt) => (
                <button key={prompt} type="button" onClick={() => setInput(prompt)}>
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {messages.map((message, index) => (
          <div key={`${message.role}-${index}`} className={`chat-message ${message.role}`}>
            {message.text}
            <span className="chat-time">{message.time}</span>
          </div>
        ))}
        {loading ? <div className="chat-message assistant" role="status">思考中…</div> : null}
      </div>

      <form className="chat-input-row" onSubmit={send}>
        <textarea
          ref={inputRef}
          className="input chat-input"
          aria-label="给 Companion 发送消息"
          value={input}
          rows={1}
          placeholder="输入消息…"
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault()
              void send(event)
            }
          }}
        />
        <button className="chat-send" type="submit" disabled={!input.trim() || loading} title="发送">
          <Send size={17} />
        </button>
      </form>
    </section>
  )
}
