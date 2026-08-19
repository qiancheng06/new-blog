"use client"

import { ArrowRight, CheckCircle2, CircleAlert, Clock3, FolderKanban } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import {
  getWorkspaceProjects,
  getWorkspaceTodos,
  type WorkspaceProject,
  type WorkspaceTodo,
} from "@/shared/data/workspaceData"
import { SkeletonRows, StateBlock } from "@/shared/ui/StateBlock"

/**
 * 今日焦点：工作台首屏行动区。
 * 从现有 todos/projects JSON 派生「需要处理」（逾期 > 今日到期 > 后续）与「活跃项目」，
 * 各截断展示并锚点到完整面板，替代原来的重型总览头部。
 */
export function TodayFocus() {
  const [projects, setProjects] = useState<WorkspaceProject[]>([])
  const [todos, setTodos] = useState<WorkspaceTodo[]>([])
  const [now, setNow] = useState<Date | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    setNow(new Date())
    async function load() {
      try {
        const [nextProjects, nextTodos] = await Promise.all([getWorkspaceProjects(), getWorkspaceTodos()])
        setProjects(nextProjects)
        setTodos(nextTodos)
      } catch {
        setError("同步后的 JSON 数据可用后，今日焦点会显示在这里。")
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [])

  const summary = useMemo(() => {
    const today = now ? toLocalDateKey(now) : ""
    const open = todos.filter((todo) => !todo.done)
    const overdue = open.filter((todo) => today && todo.date && todo.date < today)
    const dueToday = open.filter((todo) => today && todo.date === today)
    const upcoming = open.filter((todo) => !todo.date || (today && todo.date > today))
    return {
      activeProjects: projects.filter((project) => project.status === "in-progress"),
      overdue,
      dueToday,
      focus: [...overdue, ...dueToday, ...upcoming].slice(0, 5),
    }
  }, [now, projects, todos])

  const dateLabel = now
    ? now.toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "long" })
    : "今天"

  return (
    <section className="overview-panel focus-panel" id="overview">
      <header className="focus-head">
        <div>
          <h2>今日焦点</h2>
          <p>
            {dateLabel}
            {!loading && !error
              ? ` — ${summary.overdue.length} 项逾期 · ${summary.dueToday.length} 项今日到期 · ${summary.activeProjects.length} 个活跃项目`
              : ""}
          </p>
        </div>
      </header>

      {loading ? <SkeletonRows rows={2} /> : null}
      {!loading && error ? <StateBlock title="焦点加载失败" message={error} tone="error" /> : null}
      {!loading && !error ? (
        <div className="overview-grid">
          <article className="overview-card">
            <div className="overview-card-title">
              <Clock3 size={18} />
              <strong>需要处理</strong>
              <span>{summary.focus.length}</span>
              <a className="card-more" href="#todos">全部 →</a>
            </div>
            {summary.focus.map((todo, index) => {
              const isOverdue = Boolean(todo.date && now && todo.date < toLocalDateKey(now))
              return (
                <a key={`${todo.source}-${index}`} href="#todos" className="overview-row todo-summary-row">
                  {isOverdue ? (
                    <CircleAlert size={15} className="focus-overdue-icon" />
                  ) : (
                    <CheckCircle2 size={15} />
                  )}
                  <span>
                    <b>{todo.text}</b>
                    <small>{isOverdue ? `逾期 · ${todo.date}` : todo.date || "未安排日期"}</small>
                  </span>
                </a>
              )
            })}
            {summary.focus.length === 0 ? <p className="overview-empty">当前没有待处理事项。</p> : null}
          </article>

          <article className="overview-card">
            <div className="overview-card-title">
              <FolderKanban size={18} />
              <strong>活跃项目</strong>
              <span>{summary.activeProjects.length}</span>
              <a className="card-more" href="#projects">全部 →</a>
            </div>
            {summary.activeProjects.slice(0, 4).map((project) => (
              <a key={project.id} href="#projects" className="overview-row">
                <span>
                  <b>{project.name}</b>
                  <small>{formatPriority(project.priority)}优先级</small>
                </span>
                <ArrowRight size={15} />
              </a>
            ))}
            {summary.activeProjects.length === 0 ? <p className="overview-empty">暂无活跃项目。</p> : null}
          </article>
        </div>
      ) : null}
    </section>
  )
}

function toLocalDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

function formatPriority(priority: string): string {
  return ({ high: "高", medium: "中", low: "低" } as Record<string, string>)[priority] ?? priority
}
