"use client"

import { FormEvent, useEffect, useRef, useState } from "react"
import { getPersonaJson, postPersonaJson } from "@/shared/api/personaApi"

interface ChatMessage {
  role: "user" | "assistant"
  text: string
  time: string
}

interface ChatResponse {
  reply?: string
}

function formatTime(date: Date): string {
  return `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`
}

export function ChatDock() {
  const [open, setOpen] = useState(false)
  const [online, setOnline] = useState(false)
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)

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
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages, loading])

  async function send(event: FormEvent) {
    event.preventDefault()
    const text = input.trim()
    if (!text || loading) return

    setInput("")
    setMessages((current) => [...current, { role: "user", text, time: formatTime(new Date()) }])
    setLoading(true)

    try {
      const data = await postPersonaJson<ChatResponse>("/api/chat", {
        text,
        page: globalThis.location?.pathname ?? "/",
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
          text: "连接失败。请确认 Persona 后端正在运行：npm.cmd run dev:backend 或 npm.cmd run dev:backend:mock。",
          time: formatTime(new Date()),
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  if (!open) {
    return (
      <div className="chat-dock">
        <button className="chat-fab" type="button" title="打开 Companion" onClick={() => setOpen(true)}>
          {online ? "●" : "○"}
        </button>
      </div>
    )
  }

  return (
    <section className="chat-dock chat-panel" aria-label="Companion chat">
      <header className="chat-header">
        <div>
          <strong>Companion</strong>
          <span>{online ? "Persona API 在线" : "Persona API 离线"}</span>
        </div>
        <button className="icon-button" type="button" title="关闭聊天" onClick={() => setOpen(false)}>
          ×
        </button>
      </header>

      <div className="chat-messages" ref={scrollRef}>
        {messages.length === 0 ? (
          <p className="empty-state">输入一句话，Companion 会通过本地 Application API 回复。</p>
        ) : null}
        {messages.map((message, index) => (
          <div key={`${message.role}-${index}`} className={`chat-message ${message.role}`}>
            {message.text}
            <span className="chat-time">{message.time}</span>
          </div>
        ))}
        {loading ? <div className="chat-message assistant">正在思考...</div> : null}
      </div>

      <form className="chat-input-row" onSubmit={send}>
        <textarea
          className="input chat-input"
          value={input}
          rows={1}
          placeholder="说点什么..."
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault()
              void send(event)
            }
          }}
        />
        <button className="chat-send" type="submit" disabled={!input.trim() || loading} title="发送">
          →
        </button>
      </form>
    </section>
  )
}
