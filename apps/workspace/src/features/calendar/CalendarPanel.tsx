"use client"

import { useEffect, useMemo, useState } from "react"
import { getWorkspaceTodos, type WorkspaceTodo } from "@/shared/data/workspaceData"

export function CalendarPanel() {
  const [todos, setTodos] = useState<WorkspaceTodo[]>([])
  const [cursor, setCursor] = useState(() => new Date())

  useEffect(() => {
    async function load() {
      setTodos(await getWorkspaceTodos())
    }

    void load()
  }, [])

  const month = cursor.getMonth()
  const year = cursor.getFullYear()
  const cells = useMemo(() => buildMonthCells(year, month), [month, year])
  const byDate = useMemo(() => {
    const map = new Map<string, WorkspaceTodo[]>()
    for (const todo of todos) {
      if (!todo.date) continue
      const items = map.get(todo.date) ?? []
      items.push(todo)
      map.set(todo.date, items)
    }
    return map
  }, [todos])

  function shiftMonth(offset: number) {
    setCursor(new Date(year, month + offset, 1))
  }

  return (
    <section className="feature-panel" id="calendar">
      <div className="feature-heading">
        <div>
          <p className="eyebrow">Calendar</p>
          <h2>待办日历</h2>
          <p>按日期查看 Obsidian todo 同步结果。当前是只读视图，编辑能力继续保留在 legacy 入口。</p>
        </div>
        <div className="calendar-actions">
          <button className="compact-button" type="button" onClick={() => shiftMonth(-1)}>
            ←
          </button>
          <strong>
            {year}-{String(month + 1).padStart(2, "0")}
          </strong>
          <button className="compact-button" type="button" onClick={() => shiftMonth(1)}>
            →
          </button>
        </div>
      </div>

      <div className="calendar-grid">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
          <div key={day} className="calendar-weekday">
            {day}
          </div>
        ))}
        {cells.map((cell) => {
          const dateKey = toDateKey(cell.date)
          const items = byDate.get(dateKey) ?? []
          return (
            <article key={dateKey} className={`calendar-cell ${cell.inMonth ? "" : "muted"}`}>
              <strong>{cell.date.getDate()}</strong>
              <div>
                {items.slice(0, 3).map((todo, index) => (
                  <p key={`${dateKey}-${index}`} className={todo.done ? "done" : ""}>
                    {todo.text}
                  </p>
                ))}
                {items.length > 3 ? <small>+{items.length - 3} more</small> : null}
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}

function buildMonthCells(year: number, month: number): Array<{ date: Date; inMonth: boolean }> {
  const first = new Date(year, month, 1)
  const mondayOffset = (first.getDay() + 6) % 7
  const start = new Date(year, month, 1 - mondayOffset)
  const cells = []

  for (let i = 0; i < 42; i += 1) {
    const date = new Date(start)
    date.setDate(start.getDate() + i)
    cells.push({ date, inMonth: date.getMonth() === month })
  }

  return cells
}

function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}
