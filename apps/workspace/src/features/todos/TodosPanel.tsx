"use client"

import { useEffect, useMemo, useState } from "react"
import { Check } from "lucide-react"
import { getWorkspaceTodos, type WorkspaceTodo } from "@/shared/data/workspaceData"
import { contentUrl } from "@/shared/data/workspaceSources"
import { Panel } from "@/shared/ui/Panel"
import { SkeletonRows, StateBlock } from "@/shared/ui/StateBlock"

export function TodosPanel() {
  const [todos, setTodos] = useState<WorkspaceTodo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    async function load() {
      try {
        const data = await getWorkspaceTodos()
        setTodos(data)
      } catch {
        setError("待办 JSON 暂不可用。请确认 Obsidian 待办目录可用后运行 npm.cmd run sync。")
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [])

  const grouped = useMemo(() => {
    const today = toLocalDateKey(new Date())
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
    <Panel
      id="todos"
      eyebrow="待办"
      title="待办流"
      description="Obsidian 待办 Markdown 仍是数据源，Next.js 只读取同步后的 JSON 投影。"
      stats={
        <>
          <span>{summary.open} 个待处理</span>
          <span>{summary.dated} 个已排期</span>
          <span>{summary.total} 个总计</span>
        </>
      }
      actions={
        <div className="feature-actions">
          <a className="compact-link" href={contentUrl("/todo/")} target="_blank" rel="noreferrer">
            内容来源
          </a>
          <a className="compact-link" href="/calendar">打开日历</a>
        </div>
      }
    >

      {loading ? <SkeletonRows rows={2} /> : null}
      {!loading && error ? <StateBlock title="待办加载失败" message={error} tone="error" /> : null}
      {!loading && !error && todos.length === 0 ? (
        <StateBlock
          title="暂无同步待办"
          message="Obsidian 待办文件可用后，同步任务会把它们投影到 Workspace JSON 层。"
        />
      ) : null}

      {!loading && !error ? <div className="todo-columns">
        <TodoColumn title="今日" items={grouped.today} />
        <TodoColumn title="已逾期" items={grouped.overdue} tone="warn" />
        <TodoColumn title="即将到期" items={grouped.upcoming} />
        <TodoColumn title="未排期" items={grouped.unscheduled} />
        <TodoColumn title="已完成" items={grouped.done} />
      </div> : null}
    </Panel>
  )
}

function TodoColumn({ title, items, tone }: { title: string; items: WorkspaceTodo[]; tone?: "warn" }) {
  return (
    <div className={`todo-column ${tone ?? ""}`}>
      <h3>
        <span>{title}</span>
        <strong>{items.length}</strong>
      </h3>
      {items.length === 0 ? <StateBlock message="暂无" compact /> : null}
      {items.map((todo, index) => (
        <div key={`${todo.source}-${todo.text}-${index}`} className={`todo-item ${todo.done ? "done" : ""}`}>
          <span className="todo-check" aria-hidden="true">{todo.done ? <Check size={12} /> : null}</span>
          <p>{todo.text}</p>
          {todo.date ? <small>{todo.date}</small> : null}
        </div>
      ))}
    </div>
  )
}

function toLocalDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}
