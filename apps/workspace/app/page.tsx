import { ChatDock } from "@/features/chat/ChatDock"
import { CalendarPanel } from "@/features/calendar/CalendarPanel"
import { KnowledgePanel } from "@/features/knowledge/KnowledgePanel"
import { MemoryPanel } from "@/features/memory/MemoryPanel"
import { ProjectsPanel } from "@/features/projects/ProjectsPanel"
import { StatusStrip } from "@/features/status/StatusStrip"
import { TodosPanel } from "@/features/todos/TodosPanel"
import { contentUrl, workspaceSources } from "@/shared/data/workspaceSources"

const focusItems = [
  {
    label: "Projects",
    title: "项目推进",
    text: "从 Markdown 项目源同步到 JSON 中间层，再由 Next.js 工作台展示。",
    href: "#projects",
  },
  {
    label: "Todos",
    title: "待办流",
    text: "保留 Obsidian todo 作为源，前端读取同步后的结构化数据。",
    href: "#todos",
  },
  {
    label: "Calendar",
    title: "日历",
    text: "按月查看带日期的 todo，同步链路仍由中间层负责。",
    href: "#calendar",
  },
  {
    label: "Knowledge",
    title: "内容站",
    text: "知识库和博客长期由 Obsidian + VitePress 承载，Workspace 提供入口和索引。",
    href: "#knowledge",
  },
]

export default function WorkspaceHome() {
  return (
    <main className="workspace-shell">
      <section className="hero-panel">
        <div className="hero-copy">
          <p className="eyebrow">Local AI Workspace</p>
          <h1>Persona Workspace</h1>
          <p className="hero-lede">
            Next.js 负责工作台体验，Obsidian 作为长期内容站，Persona DB 作为长期个人记忆库。
            前端只通过中间层和 Application API 访问数据源。
          </p>
          <div className="hero-actions">
            <a className="primary-action" href="#projects">
              查看工作台
            </a>
            <a className="secondary-action" href={contentUrl("/")} target="_blank" rel="noreferrer">
              打开内容站
            </a>
          </div>
        </div>
        <StatusStrip />
      </section>

      <section className="module-grid" aria-label="Workspace modules">
        {focusItems.map((item) => (
          <a key={item.label} className="module-card" href={item.href}>
            <span>{item.label}</span>
            <h2>{item.title}</h2>
            <p>{item.text}</p>
          </a>
        ))}
      </section>

      <section className="source-grid" aria-label="Workspace data sources">
        {workspaceSources.map((source) => (
          <article key={source.id} className="source-card">
            <h2>{source.title}</h2>
            <p>{source.role}</p>
            <small>{source.access}</small>
          </article>
        ))}
      </section>

      <ProjectsPanel />
      <TodosPanel />
      <CalendarPanel />
      <KnowledgePanel />

      <section id="memory" className="workspace-band">
        <MemoryPanel />
      </section>

      <ChatDock />
    </main>
  )
}
