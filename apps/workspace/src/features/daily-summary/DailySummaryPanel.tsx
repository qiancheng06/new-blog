"use client"

import { FormEvent, useEffect, useMemo, useState } from "react"
import { getPersonaJson, postPersonaJson } from "@/shared/api/personaApi"

interface DailyNote {
  id: string
  date: string
  summary: string
  highlights: string[]
  topicDistribution: Record<string, number>
  sourceEventId: string | null
  createdAt: string
  updatedAt: string
}

interface DailyNoteListResponse {
  items: DailyNote[]
}

interface DailySummaryGenerationResponse {
  note: DailyNote
  summaryEventId: string
  eventCount: number
}

export function DailySummaryPanel() {
  const [date, setDate] = useState(today())
  const [notes, setNotes] = useState<DailyNote[]>([])
  const [selected, setSelected] = useState<DailyNote | null>(null)
  const [eventCount, setEventCount] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState("")

  const topics = useMemo(
    () => selected ? Object.entries(selected.topicDistribution).sort((left, right) => right[1] - left[1]) : [],
    [selected],
  )

  async function loadNotes(preferredId?: string) {
    setLoading(true)
    setError("")
    try {
      const response = await getPersonaJson<DailyNoteListResponse>("/api/daily-summaries?limit=14&offset=0")
      setNotes(response.items)
      setSelected((current) => {
        const targetId = preferredId ?? current?.id
        return response.items.find((note) => note.id === targetId) ?? response.items[0] ?? null
      })
    } catch {
      setError("Daily Notes are unavailable.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadNotes()
  }, [])

  async function generate(event: FormEvent) {
    event.preventDefault()
    if (!date || generating) return

    setGenerating(true)
    setError("")
    try {
      const response = await postPersonaJson<DailySummaryGenerationResponse>("/api/daily-summaries", { date })
      setSelected(response.note)
      setEventCount(response.eventCount)
      await loadNotes(response.note.id)
    } catch {
      setError("Daily Note generation failed.")
    } finally {
      setGenerating(false)
    }
  }

  function selectNote(note: DailyNote) {
    setSelected(note)
    setDate(note.date)
    setEventCount(null)
  }

  return (
    <div className="daily-note-panel">
      <header className="daily-note-heading">
        <div>
          <h2>Daily Note</h2>
          <p>{selected ? `Updated ${formatTimestamp(selected.updatedAt)}` : "No summary selected"}</p>
        </div>
        <form className="daily-note-generate" onSubmit={generate}>
          <input
            className="input daily-note-date"
            type="date"
            value={date}
            aria-label="Daily Note date"
            onChange={(event) => setDate(event.target.value)}
          />
          <button className="compact-button active" type="submit" disabled={!date || generating}>
            {generating ? "Generating..." : "Generate"}
          </button>
        </form>
      </header>

      {error ? <p className="daily-note-alert error-state" role="alert">{error}</p> : null}

      <div className="daily-note-body">
        <div className="daily-note-content" aria-live="polite">
          {loading && !selected ? <p className="empty-state">Loading Daily Notes...</p> : null}
          {!loading && !selected ? <p className="empty-state">No Daily Note yet.</p> : null}
          {selected ? (
            <>
              <div className="daily-note-title-row">
                <strong>{selected.date}</strong>
                {eventCount !== null ? <span>{eventCount} events</span> : null}
              </div>
              <p className="daily-note-summary">{selected.summary}</p>

              {selected.highlights.length > 0 ? (
                <div className="daily-note-section">
                  <h3>Highlights</h3>
                  <ul>
                    {selected.highlights.map((highlight, index) => <li key={`${selected.id}-${index}`}>{highlight}</li>)}
                  </ul>
                </div>
              ) : null}

              {topics.length > 0 ? (
                <div className="daily-note-section">
                  <h3>Topics</h3>
                  <div className="daily-note-topics">
                    {topics.map(([topic, count]) => <span key={topic}>{topic} {count}</span>)}
                  </div>
                </div>
              ) : null}
            </>
          ) : null}
        </div>

        <aside className="daily-note-archive" aria-label="Recent Daily Notes">
          <div className="daily-note-archive-heading">
            <h3>Recent</h3>
            <button className="icon-button wide" type="button" disabled={loading} onClick={() => void loadNotes()}>
              Reload
            </button>
          </div>
          <div className="daily-note-list">
            {notes.map((note) => (
              <button
                key={note.id}
                className={selected?.id === note.id ? "active" : ""}
                type="button"
                onClick={() => selectNote(note)}
              >
                <span>{note.date}</span>
                <small>{truncate(note.summary, 72)}</small>
              </button>
            ))}
          </div>
        </aside>
      </div>
    </div>
  )
}

function today(): string {
  const now = new Date()
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 10)
}

function formatTimestamp(value: string): string {
  const parsed = new Date(value.endsWith("Z") ? value : `${value.replace(" ", "T")}Z`)
  if (Number.isNaN(parsed.getTime())) return value
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed)
}

function truncate(value: string, length: number): string {
  return value.length > length ? `${value.slice(0, length - 3)}...` : value
}
