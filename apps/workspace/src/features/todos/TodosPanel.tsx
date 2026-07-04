"use client"

import { useEffect, useMemo, useState } from "react"
import { getWorkspaceTodos, type WorkspaceTodo } from "@/shared/data/workspaceData"

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
      upcoming: open.filter((todo) => todo.date && todo.date > today).slice(0, 8),
      unscheduled: open.filter((todo) => !todo.date).slice(0, 8),
      done: todos.filter((todo) => todo.done).slice(0, 6),
    }
  }, [todos])

  return (
    <section className="feature-panel" id="todos">
      <div className="feature-heading">
        <div>
          <p className="eyebrow">Todos</p>
          <h2>待办流</h2>
          <p>Obsidian todo Markdown 仍是源，Next 通过同步 JSON 读取。</p>
        </div>
      </div>

      {loading ? <p className="empty-state">Loading todos...</p> : null}
      {!loading && todos.length === 0 ? <p className="empty-state">当前没有同步到待办数据。</p> : null}

      <div className="todo-columns">
        <TodoColumn title="Today" items={grouped.today} />
        <TodoColumn title="Upcoming" items={grouped.upcoming} />
        <TodoColumn title="Unscheduled" items={grouped.unscheduled} />
        <TodoColumn title="Done" items={grouped.done} />
      </div>
    </section>
  )
}

function TodoColumn({ title, items }: { title: string; items: WorkspaceTodo[] }) {
  return (
    <div className="todo-column">
      <h3>{title}</h3>
      {items.length === 0 ? <p className="empty-state compact">None</p> : null}
      {items.map((todo, index) => (
        <div key={`${todo.source}-${todo.text}-${index}`} className={`todo-item ${todo.done ? "done" : ""}`}>
          <span>{todo.done ? "✓" : "□"}</span>
          <p>{todo.text}</p>
          {todo.date ? <small>{todo.date}</small> : null}
        </div>
      ))}
    </div>
  )
}
