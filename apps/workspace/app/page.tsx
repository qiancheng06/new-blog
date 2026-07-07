import { CalendarPanel } from "@/features/calendar/CalendarPanel"
import { ChatDock } from "@/features/chat/ChatDock"
import { KnowledgePanel } from "@/features/knowledge/KnowledgePanel"
import { MemoryPanel } from "@/features/memory/MemoryPanel"
import { ProjectsPanel } from "@/features/projects/ProjectsPanel"
import { StatusStrip } from "@/features/status/StatusStrip"
import { TodosPanel } from "@/features/todos/TodosPanel"
import { contentUrl, workspaceSources } from "@/shared/data/workspaceSources"

const focusItems = [
  {
    label: "Projects",
    title: "Project Flow",
    text: "Markdown project files sync into a JSON middle layer, then render inside the Next.js workspace.",
    href: "#projects",
  },
  {
    label: "Todos",
    title: "Todo Stream",
    text: "Obsidian todo notes remain the source. The workspace reads structured synced data.",
    href: "#todos",
  },
  {
    label: "Calendar",
    title: "Month View",
    text: "Dated todo items are shown by month. Sync remains owned by the middle layer.",
    href: "#calendar",
  },
  {
    label: "Knowledge",
    title: "Content Site",
    text: "Knowledge and blog content stay in Obsidian plus VitePress. Workspace provides index and entry points.",
    href: "#knowledge",
  },
]

const navItems = [
  { label: "Projects", href: "#projects" },
  { label: "Todos", href: "#todos" },
  { label: "Calendar", href: "#calendar" },
  { label: "Knowledge", href: "#knowledge" },
  { label: "Memory", href: "#memory" },
]

export default function WorkspaceHome() {
  return (
    <main className="workspace-shell">
      <nav className="workspace-nav" aria-label="Workspace navigation">
        <a className="workspace-mark" href="#">
          Persona
        </a>
        <div className="workspace-nav-links">
          {navItems.map((item) => (
            <a key={item.href} href={item.href}>
              {item.label}
            </a>
          ))}
        </div>
      </nav>

      <section className="hero-panel">
        <div className="hero-copy">
          <p className="eyebrow">Local AI Workspace</p>
          <h1>Persona Workspace</h1>
          <p className="hero-lede">
            Next.js owns the interactive workspace. Obsidian remains the long-term content site, and Persona DB remains
            the long-term memory store. The UI reads through adapters and Application APIs only.
          </p>
          <div className="hero-actions">
            <a className="primary-action" href="#projects">
              Open workspace
            </a>
            <a className="secondary-action" href={contentUrl("/")} target="_blank" rel="noreferrer">
              Open content site
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

      <footer className="workspace-footer">
        <span>Next.js Workspace</span>
        <span>Obsidian content and Persona memory stay behind adapters.</span>
      </footer>

      <ChatDock />
    </main>
  )
}
