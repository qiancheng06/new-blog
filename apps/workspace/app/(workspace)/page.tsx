import { CalendarPanel } from "@/features/calendar/CalendarPanel"
import { DailySummaryPanel } from "@/features/daily-summary/DailySummaryPanel"
import { KnowledgePanel } from "@/features/knowledge/KnowledgePanel"
import { ProjectsPanel } from "@/features/projects/ProjectsPanel"
import { TodosPanel } from "@/features/todos/TodosPanel"
import { WorkspaceShell } from "@/features/workspace/WorkspaceShell"
import { HomeQuickActions } from "@/features/workspace/HomeQuickActions"

export default function WorkspaceHome() {
  return (
    <WorkspaceShell>
      <div className="bento-grid">
        <div className="bento-main">
          <ProjectsPanel />
          <TodosPanel />
        </div>
        <div className="bento-aside">
          <HomeQuickActions />
          <CalendarPanel />
          <KnowledgePanel />
        </div>
      </div>
      <section id="daily-note" className="workspace-band">
        <DailySummaryPanel />
      </section>
    </WorkspaceShell>
  )
}
