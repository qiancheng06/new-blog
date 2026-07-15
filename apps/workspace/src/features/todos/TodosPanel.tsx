"use client"

import { useEffect, useMemo, useState } from "react"
import { getWorkspaceTodos, type WorkspaceTodo } from "@/shared/data/workspaceData"
import { contentUrl } from "@/shared/data/workspaceSources"

export function TodosPanel() {
  const [todos, setTodos] = useState<WorkspaceTodo[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const data = await getWorkspaceTodos()
      setTodos(data)
      setLoading(false)
    }

    void load()
  }, [])

  const grouped = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    const open = todos.filter((todo) => !todo.done)
    return {
      today: open.filter((todo) => todo.date === today),
      overdue: open.filter((todo) => todo.date && todo.date < today).slice(0, 8),
      upcoming: open.filter((todo) => todo.date && todo.date > today).slice(0, 8),
      unscheduled: open.filter((todo) => !todo.date).slice(0, 8),
      done: todos.filter((todo) => todo.done).slice(0, 6),
    }
  }, [todos])

  const summary = useMemo(() => {
    const open = todos.filter((todo) => !todo.done)
    return {
      total: todos.length,
      open: open.length,
      dated: open.filter((todo) => todo.date).length,
    }
  }, [todos])

  return (
    <section className="feature-panel" id="todos">
      <div className="feature-heading">
        <div>
          <p className="eyebrow">Todos</p>
          <h2>Todo Stream</h2>
          <p>Obsidian todo Markdown remains the source. Next.js reads the synced JSON projection.</p>
          <div className="inline-stats" aria-label="Todo summary">
            <span>{summary.open} open</span>
            <span>{summary.dated} dated</span>
            <span>{summary.total} total</span>
          </div>
        </div>
        <div className="feature-actions">
          <a className="compact-link" href={contentUrl("/todo/")} target="_blank" rel="noreferrer">
            Content source
          </a>
          <span className="compact-note">Legacy calendar stays in apps/workspace/legacy/calendar.html</span>
        </div>
      </div>

      {loading ? <p className="empty-state">Loading todos...</p> : null}
      {!loading && todos.length === 0 ? (
        <div className="empty-box">
          <strong>No synced todo data yet.</strong>
          <p>When Obsidian todo files are available, sync will project them into the Workspace JSON layer.</p>
        </div>
      ) : null}

      <div className="todo-columns">
        <TodoColumn title="Today" items={grouped.today} />
        <TodoColumn title="Overdue" items={grouped.overdue} tone="warn" />
        <TodoColumn title="Upcoming" items={grouped.upcoming} />
        <TodoColumn title="Unscheduled" items={grouped.unscheduled} />
        <TodoColumn title="Done" items={grouped.done} />
      </div>
    </section>
  )
}

function TodoColumn({ title, items, tone }: { title: string; items: WorkspaceTodo[]; tone?: "warn" }) {
  return (
    <div className={`todo-column ${tone ?? ""}`}>
      <h3>
        <span>{title}</span>
        <strong>{items.length}</strong>
      </h3>
      {items.length === 0 ? <p className="empty-state compact">None</p> : null}
      {items.map((todo, index) => (
        <div key={`${todo.source}-${todo.text}-${index}`} className={`todo-item ${todo.done ? "done" : ""}`}>
          <span className="todo-check">{todo.done ? "✓" : ""}</span>
          <p>{todo.text}</p>
          {todo.date ? <small>{todo.date}</small> : null}
        </div>
      ))}
    </div>
  )
}
