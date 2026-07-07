"use client"

import { useEffect, useMemo, useState } from "react"
import { getWorkspaceProjects, type WorkspaceProject } from "@/shared/data/workspaceData"
import { contentUrl } from "@/shared/data/workspaceSources"

const priorityRank: Record<string, number> = { high: 0, medium: 1, low: 2 }

export function ProjectsPanel() {
  const [projects, setProjects] = useState<WorkspaceProject[]>([])
  const [status, setStatus] = useState("all")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const data = await getWorkspaceProjects()
      setProjects(data)
      setLoading(false)
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

  return (
    <section className="feature-panel" id="projects">
      <div className="feature-heading">
        <div>
          <p className="eyebrow">Projects</p>
          <h2>Project Board</h2>
          <p>Read-only project state from the Workspace JSON middle layer. Markdown remains the source.</p>
        </div>
        <div className="feature-heading-tools">
          <div className="feature-actions">
            <a className="compact-link" href={contentUrl("/projects/")} target="_blank" rel="noreferrer">
              Content source
            </a>
            <span className="compact-note">Legacy detail stays in apps/workspace/legacy/detail.html</span>
          </div>
          <div className="filter-row">
            {statuses.map((item) => (
              <button
                key={item}
                className={`compact-button ${status === item ? "active" : ""}`}
                type="button"
                onClick={() => setStatus(item)}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? <p className="empty-state">Loading projects...</p> : null}
      {!loading && visibleProjects.length === 0 ? (
        <div className="empty-box">
          <strong>No synced project data in this worktree.</strong>
          <p>Run sync with local project Markdown available, or use the content-site and legacy fallbacks.</p>
        </div>
      ) : null}

      <div className="project-grid">
        {visibleProjects.map((project) => {
          const tasks = project.sections.flatMap((section) => section.tasks)
          const done = tasks.filter((task) => task.done).length
          const total = tasks.length
          const percent = total > 0 ? Math.round((done / total) * 100) : 0

          return (
            <article key={project.id} className="project-card">
              <div className="project-card-top">
                <span className={`status-chip ${project.status}`}>{project.status}</span>
                <span className="priority-chip">{project.priority}</span>
              </div>
              <h3>{project.name}</h3>
              <div className="progress-track" aria-label={`${project.name} progress`}>
                <span style={{ width: `${percent}%` }} />
              </div>
              <p className="progress-copy">
                {done}/{total} tasks done - {percent}%
              </p>
              <div className="tag-row">
                {project.tags.slice(0, 4).map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
