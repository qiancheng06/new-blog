"use client"

import { useEffect, useMemo, useState } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { getWorkspaceTodos, type WorkspaceTodo } from "@/shared/data/workspaceData"
import { contentUrl } from "@/shared/data/workspaceSources"
import { Panel } from "@/shared/ui/Panel"
import { SkeletonRows, StateBlock } from "@/shared/ui/StateBlock"

export function CalendarPanel() {
  const [todos, setTodos] = useState<WorkspaceTodo[]>([])
  const [cursor, setCursor] = useState(() => new Date())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    async function load() {
      try {
        setTodos(await getWorkspaceTodos())
      } catch {
        setError("日历待办投影暂不可用。请运行 npm.cmd run sync 后刷新页面。")
      } finally {
        setLoading(false)
      }
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

  function jumpToday() {
    setCursor(new Date())
  }

  return (
    <Panel
      id="calendar"
      eyebrow="日历"
      title="待办日历"
      description="主页保留同步待办的日期概览，完整日程在独立日历页管理。"
      stats={
        <>
          <span>{todos.filter((todo) => todo.date?.startsWith(`${year}-${String(month + 1).padStart(2, "0")}`)).length} 个本月事项</span>
          <span>{todos.filter((todo) => !todo.done).length} 个待处理</span>
        </>
      }
      actions={
        <div className="calendar-actions">
          <a className="compact-link" href="/calendar">打开日历</a>
          <a className="compact-link calendar-source" href={contentUrl("/todo/")} target="_blank" rel="noreferrer">
            内容来源
          </a>
          <div className="calendar-month-nav">
            <button className="compact-button" type="button" onClick={() => shiftMonth(-1)} aria-label="上个月">
              <ChevronLeft size={16} />
            </button>
            <button className="compact-button" type="button" onClick={jumpToday}>今天</button>
            <strong>{year}年{month + 1}月</strong>
            <button className="compact-button" type="button" onClick={() => shiftMonth(1)} aria-label="下个月">
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      }
    >

      {loading ? <SkeletonRows rows={3} /> : null}
      {!loading && error ? <StateBlock title="日历加载失败" message={error} tone="error" /> : null}
      {!loading && !error && byDate.size === 0 ? (
        <StateBlock
          title="暂无带日期的待办"
          message="同步后的待办 Markdown 出现 @YYYY-MM-DD 日期后，事项会显示在这里。"
        />
      ) : null}

      {!loading && !error && byDate.size > 0 ? <div className="calendar-grid">
        {["一", "二", "三", "四", "五", "六", "日"].map((day) => (
          <div key={day} className="calendar-weekday">
            {day}
          </div>
        ))}
        {cells.map((cell) => {
          const dateKey = toDateKey(cell.date)
          const items = byDate.get(dateKey) ?? []
          const today = dateKey === toDateKey(new Date())
          return (
            <article
              key={dateKey}
              className={`calendar-cell ${cell.inMonth ? "" : "muted"} ${today ? "today" : ""}`}
              aria-label={cell.date.toLocaleDateString("zh-CN", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
            >
              <time dateTime={dateKey}>
                <span className="calendar-date-short">{cell.date.getDate()}</span>
                <span className="calendar-date-long">{cell.date.toLocaleDateString("zh-CN", { weekday: "short", month: "short", day: "numeric" })}</span>
              </time>
              <div>
                {items.slice(0, 3).map((todo, index) => (
                  <p key={`${dateKey}-${index}`} className={todo.done ? "done" : ""}>
                    {todo.text}
                  </p>
                ))}
                {items.length > 3 ? <small>还有 {items.length - 3} 项</small> : null}
              </div>
            </article>
          )
        })}
      </div> : null}
    </Panel>
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
