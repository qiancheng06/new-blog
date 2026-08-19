"use client"

import { useEffect, useMemo, useState } from "react"
import { getWorkspaceProjects, type WorkspaceProject } from "@/shared/data/workspaceData"
import { contentUrl } from "@/shared/data/workspaceSources"
import { Panel } from "@/shared/ui/Panel"
import { SkeletonRows, StateBlock } from "@/shared/ui/StateBlock"

const priorityRank: Record<string, number> = { high: 0, medium: 1, low: 2 }

export function ProjectsPanel() {
  const [projects, setProjects] = useState<WorkspaceProject[]>([])
  const [status, setStatus] = useState("all")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    async function load() {
      try {
        const data = await getWorkspaceProjects()
        setProjects(data)
      } catch {
        setError("项目 JSON 暂不可用。请运行 npm.cmd run sync 后重新加载工作台。")
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [])

  const statuses = useMemo(() => {
    const values = Array.from(new Set(projects.map((project) => project.status).filter(Boolean)))
    return ["all", ...values]
  }, [projects])

  const visibleProjects = useMemo(() => {
    return projects
      .filter((project) => status === "all" || project.status === status)
      .sort((a, b) => (priorityRank[a.priority] ?? 9) - (priorityRank[b.priority] ?? 9) || a.name.localeCompare(b.name))
  }, [projects, status])

  const totals = useMemo(() => {
    const tasks = projects.flatMap((project) => project.sections.flatMap((section) => section.tasks))
    return {
      projects: projects.length,
      active: projects.filter((project) => project.status === "in-progress").length,
      done: tasks.filter((task) => task.done).length,
      tasks: tasks.length,
    }
  }, [projects])

  return (
    <Panel
      id="projects"
      eyebrow="项目"
      title="项目看板"
      description="通过 Workspace JSON 中间层只读展示项目状态，Markdown 仍是数据源。"
      stats={
        <>
          <span>{totals.projects} 个项目</span>
          <span>{totals.active} 个进行中</span>
          <span>
            {totals.done}/{totals.tasks} 个任务
          </span>
        </>
      }
      actions={
        <>
          <div className="feature-actions">
            <a className="compact-link" href={contentUrl("/projects/")} target="_blank" rel="noreferrer">
              内容来源
            </a>
            <span className="compact-note">旧版详情页仍保留在 apps/workspace/legacy/detail.html</span>
          </div>
          <div className="filter-row">
            {statuses.map((item) => (
              <button
                key={item}
                className={`compact-button ${status === item ? "active" : ""}`}
                type="button"
                onClick={() => setStatus(item)}
              >
                {formatStatus(item)}
              </button>
            ))}
          </div>
        </>
      }
    >

      {loading ? <SkeletonRows rows={3} /> : null}
      {!loading && error ? <StateBlock title="项目加载失败" message={error} tone="error" /> : null}
      {!loading && !error && visibleProjects.length === 0 ? (
        <StateBlock
          title="当前工作树暂无同步项目"
          message="请在本地项目 Markdown 可用时运行同步，也可以先使用内容站和旧版页面。"
        />
      ) : null}

      {!loading && !error ? <div className="project-grid">
        {visibleProjects.map((project) => {
          const tasks = project.sections.flatMap((section) => section.tasks)
          const done = tasks.filter((task) => task.done).length
          const total = tasks.length
          const percent = total > 0 ? Math.round((done / total) * 100) : 0

          return (
            <article key={project.id} className="project-card">
              <div className="project-card-top">
                <span className={`status-chip ${project.status}`}>{formatStatus(project.status)}</span>
                <span className="priority-chip">{formatPriority(project.priority)}</span>
              </div>
              <h3>{project.name}</h3>
              <div className="progress-track" aria-label={`${project.name} 进度`}>
                <span style={{ width: `${percent}%` }} />
              </div>
              <p className="progress-copy">
                已完成 {done}/{total} 个任务 · {percent}%
              </p>
              <div className="tag-row">
                {project.tags.slice(0, 4).map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
              <div className="project-foot">
                <span>{project.sections.length} 个阶段</span>
                <span>{project.filePath || "工作台数据源"}</span>
              </div>
            </article>
          )
        })}
      </div> : null}
    </Panel>
  )
}

function formatStatus(status: string): string {
  const labels: Record<string, string> = {
    all: "全部",
    "in-progress": "进行中",
    active: "活跃",
    paused: "已暂停",
    done: "已完成",
    archived: "已归档",
  }
  return labels[status] ?? status
}

function formatPriority(priority: string): string {
  const labels: Record<string, string> = { high: "高", medium: "中", low: "低" }
  return labels[priority] ?? priority
}
