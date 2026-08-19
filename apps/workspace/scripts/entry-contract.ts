import { existsSync, readFileSync } from "fs"
import { join } from "path"

const workspaceRoot = join(process.cwd(), "apps", "workspace")
const blogRoot = join(process.cwd(), "apps", "blog")
const legacyRoot = join(workspaceRoot, "legacy")

const forbiddenRootHtml = ["index.html", "detail.html", "calendar.html"]
for (const file of forbiddenRootHtml) {
  assert(!existsSync(join(workspaceRoot, file)), `workspace root must not expose ${file} as an app entrypoint`)
}

const legacyHtml = ["index.html", "detail.html", "calendar.html"]
for (const file of legacyHtml) {
  assert(existsSync(join(legacyRoot, file)), `legacy workspace asset is missing: ${file}`)
}

const launcher = readFileSync(join(workspaceRoot, "start-blog.bat"), "utf-8")
assert(launcher.includes("http://127.0.0.1:5173"), "launcher must open the dev-server entrypoint")
assert(launcher.includes("Workspace Next.js"), "launcher must describe the Next.js Workspace entrypoint")
assert(!launcher.includes("legacy\\index.html"), "launcher must not open legacy HTML directly")
assert(!launcher.includes("%DASHBOARD%"), "launcher must not use the old dashboard variable")

const packageJson = readFileSync(join(process.cwd(), "package.json"), "utf-8")
assert(packageJson.includes('"dev": "next dev apps/workspace -H 127.0.0.1 -p 5173"'), "npm run dev must start Next.js Workspace")
assert(packageJson.includes('"dev:blog": "next dev apps/blog -H 127.0.0.1 -p 5175"'), "npm run dev:blog must start the separate Blog app")
assert(packageJson.includes('"build:blog":'), "Blog app must keep a dedicated build script")
assert(packageJson.includes('"dev:content"'), "VitePress content site must keep a dedicated dev script")
assert(packageJson.includes('"build:content"'), "VitePress content site must keep a dedicated build script")

const syncScript = readFileSync(join(workspaceRoot, "scripts", "sync-projects.js"), "utf-8")
assert(syncScript.includes("const LEGACY_DIR"), "sync script must write standalone HTML through LEGACY_DIR")
assert(!syncScript.includes("join(ROOT, 'index.html')"), "sync script must not write root index.html")

const nextPage = readFileSync(join(workspaceRoot, "app", "(workspace)", "page.tsx"), "utf-8")
assert(!nextPage.includes("MemoryPanel"), "Workspace home must not duplicate the AI memory page")
assert(nextPage.includes("ProjectsPanel"), "Next.js app must expose Projects")
assert(nextPage.includes("TodosPanel"), "Next.js app must expose Todos")
assert(nextPage.includes("CalendarPanel"), "Next.js app must expose Calendar")
assert(nextPage.includes("KnowledgePanel"), "Next.js app must expose Knowledge")
assert(nextPage.includes("DailySummaryPanel"), "Next.js app must preserve Daily Note")
assert(!nextPage.includes("StatusStrip"), "Workspace home must not duplicate runtime diagnostics")
assert(nextPage.includes("WorkspaceShell"), "Next.js app must use the primary Workspace shell")

const workspaceShell = readFileSync(join(workspaceRoot, "src", "features", "workspace", "WorkspaceShell.tsx"), "utf-8")
assert(!workspaceShell.includes("banner-wallpaper"), "Workspace shell must not depend on Firefly wallpaper visuals")
assert(workspaceShell.includes("workspace-app"), "Workspace shell must expose the operational app layout")
assert(workspaceShell.includes("TodayFocus"), "Workspace shell must expose today's focus")
assert(workspaceShell.includes("WorkspaceSidebar"), "Workspace shell must expose responsive sidebars")
assert(!workspaceShell.includes("AppearanceDrawer"), "Workspace home must not mount a redundant settings drawer")
assert(workspaceShell.includes("ChatDock"), "Workspace shell must expose Companion chat")

const workspaceSidebar = readFileSync(join(workspaceRoot, "src", "features", "workspace", "WorkspaceSidebar.tsx"), "utf-8")
assert(workspaceSidebar.includes('href: "/ai"'), "Workspace sidebar must expose the AI module")
assert(workspaceSidebar.includes('href: "/knowledge"'), "Workspace sidebar must expose the knowledge page")
assert(workspaceSidebar.includes('href: "/tools"'), "Workspace sidebar must expose the tools page")
assert(!workspaceSidebar.includes('label: "项目"'), "Workspace sidebar must keep project navigation in the home quick access area")
const workspaceModuleList = workspaceSidebar.slice(workspaceSidebar.indexOf("const moduleLinks"), workspaceSidebar.indexOf("  return ("))
assert(!workspaceModuleList.includes("设置"), "Settings must remain separate from Workspace modules")
assert(workspaceSidebar.includes("sidebar-footer"), "Workspace sidebar must preserve the bottom settings entry")

const applicationFrame = readFileSync(join(workspaceRoot, "src", "features", "workspace", "ApplicationFrame.tsx"), "utf-8")
assert(applicationFrame.includes("<WorkspaceSidebar />"), "Dedicated modules must use the stable workspace sidebar")

const homeQuickActions = readFileSync(join(workspaceRoot, "src", "features", "workspace", "HomeQuickActions.tsx"), "utf-8")
assert(homeQuickActions.includes("draggable"), "Home quick access must support drag ordering")
assert(homeQuickActions.includes("persona-home-quick-actions"), "Home quick access order must persist locally")
assert(homeQuickActions.includes('id: "memory"'), "Home quick access must include memory")
assert(homeQuickActions.includes('href: "/ai/memory"'), "Home memory shortcut must open the dedicated AI memory page")

assert(nextPage.includes("HomeQuickActions"), "Workspace home must render quick access on the right column")

const appearance = readFileSync(join(workspaceRoot, "src", "features", "workspace", "appearance.ts"), "utf-8")
assert(appearance.includes("WorkspaceAppearanceConfig"), "Workspace must define appearance settings")
assert(appearance.includes('theme: "light"'), "Workspace appearance must default to light mode")

const workspaceStyles = readFileSync(join(workspaceRoot, "app", "workspace-theme.css"), "utf-8")
assert(workspaceStyles.includes("grid-template-columns: 240px minmax(0, 1fr)"), "Workspace must expose the desktop operational layout")
assert(!workspaceStyles.includes("wallpaper-desktop.webp"), "Workspace must not depend on Firefly desktop wallpaper")
assert(!workspaceStyles.includes("wallpaper-mobile.webp"), "Workspace must not depend on Firefly mobile wallpaper")
assert(workspaceStyles.includes("@media (max-width: 768px)"), "Workspace must expose a mobile layout")

const vitepressConfig = readFileSync(join(workspaceRoot, ".vitepress", "config.ts"), "utf-8")
assert(vitepressConfig.includes("blog/**"), "VitePress must exclude public blog content")
assert(!vitepressConfig.includes("SIDEBAR:BLOG"), "VitePress must not generate a blog sidebar")
assert(!vitepressConfig.includes("{ text: '博客', link: '/blog/' }"), "VitePress must not expose the blog navigation")

const blogRoutes = [
  join(blogRoot, "app", "layout.tsx"),
  join(blogRoot, "app", "page.tsx"),
  join(blogRoot, "app", "[slug]", "page.tsx"),
  join(blogRoot, "app", "tags", "page.tsx"),
  join(blogRoot, "src", "blogData.server.ts"),
]
for (const file of blogRoutes) assert(existsSync(file), `Blog route or adapter is missing: ${file}`)

const aiRoutes = [
  join(workspaceRoot, "app", "(ai)", "layout.tsx"),
  join(workspaceRoot, "app", "(ai)", "ai", "page.tsx"),
  join(workspaceRoot, "app", "(ai)", "ai", "models", "page.tsx"),
  join(workspaceRoot, "app", "(ai)", "ai", "memory", "page.tsx"),
  join(workspaceRoot, "app", "(ai)", "ai", "settings", "page.tsx"),
  join(workspaceRoot, "app", "api", "persona", "runtime", "route.ts"),
]
for (const file of aiRoutes) assert(existsSync(file), `AI route is missing: ${file}`)

const aiShell = readFileSync(join(workspaceRoot, "src", "features", "ai-console", "AiConsoleShell.tsx"), "utf-8")
assert(aiShell.includes('href: "/ai"'), "AI shell must expose the conversation route")
assert(aiShell.includes('href: "/ai/models"'), "AI shell must expose the model route")
assert(aiShell.includes('href: "/ai/memory"'), "AI shell must expose the memory route")
assert(!aiShell.includes('href: "/ai/settings"'), "AI shell must not expose a settings entry")
assert(!workspaceSidebar.includes('href: "/ai/settings"'), "Workspace sidebar must not expose the AI settings entry")
assert(aiShell.includes("ApplicationFrame"), "AI shell must use the persistent workspace frame")

const aiChat = readFileSync(join(workspaceRoot, "src", "features", "ai-console", "AiChatPage.tsx"), "utf-8")
assert(aiChat.includes('postPersonaJson<{ reply?: string }>("/api/chat"'), "AI conversation must use the Persona chat API")
assert(aiChat.includes("buildAiRequest"), "AI conversation must forward governed model settings")

const aiModels = readFileSync(join(workspaceRoot, "src", "features", "ai-console", "AiModelsPage.tsx"), "utf-8")
assert(aiModels.includes('postPersonaJson<{ reply?: string; latencyMs?: number }>("/api/ai/test"'), "AI models must expose a non-persisting connection test")

const aiSettings = readFileSync(join(workspaceRoot, "src", "features", "ai-console", "AiSettingsPage.tsx"), "utf-8")
assert(aiSettings.includes('fetch("/api/persona/runtime", { method: "POST" })'), "AI settings must expose the local Persona API launcher")
assert(aiSettings.includes('fetch("/api/persona/runtime", { method: "DELETE" })'), "AI settings must expose the local Persona API stop control")

const runtimeRoute = readFileSync(join(workspaceRoot, "app", "api", "persona", "runtime", "route.ts"), "utf-8")
assert(runtimeRoute.includes("isLocalRequest"), "Persona API launcher must reject non-local requests")
assert(runtimeRoute.includes('"npm.cmd run dev:backend"'), "Persona API launcher must use the fixed backend command")
assert(runtimeRoute.includes("shutdownUrl"), "Persona API launcher must stop the backend through its governed shutdown endpoint")

const personaApiServer = readFileSync(join(process.cwd(), "apps", "persona", "src", "interface", "api", "server.ts"), "utf-8")
assert(personaApiServer.includes('url === "/api/runtime/shutdown"'), "Persona API must expose the governed runtime shutdown endpoint")
assert(personaApiServer.includes("isLoopbackAddress"), "Persona API shutdown must reject non-local callers")

const aiMemory = readFileSync(join(workspaceRoot, "src", "features", "ai-console", "AiMemoryPage.tsx"), "utf-8")
assert(aiMemory.includes('getPersonaJson<MemoryOverview>("/api/memory'), "AI memory must use the governed memory API")

const aiStyles = readFileSync(join(workspaceRoot, "app", "ai-console.css"), "utf-8")
assert(aiStyles.includes(".application-frame.ai-console-frame"), "AI module must align with the shared desktop frame")
assert(aiStyles.includes("@media (max-width: 680px)"), "AI module must expose a mobile layout")

const blogLayout = readFileSync(join(blogRoot, "app", "layout.tsx"), "utf-8")
assert(blogLayout.includes("blog-body"), "Blog app must expose its independent site shell")

const moduleRoutes = [
  join(workspaceRoot, "app", "(modules)", "layout.tsx"),
  join(workspaceRoot, "app", "(modules)", "calendar", "page.tsx"),
  join(workspaceRoot, "app", "(modules)", "knowledge", "page.tsx"),
  join(workspaceRoot, "app", "(modules)", "tools", "page.tsx"),
]
for (const file of moduleRoutes) assert(existsSync(file), `Workspace module route is missing: ${file}`)

const calendarWorkspace = readFileSync(join(workspaceRoot, "src", "features", "calendar", "CalendarWorkspace.tsx"), "utf-8")
assert(calendarWorkspace.includes('type CalendarView = "month" | "week" | "day"'), "Calendar must expose month, week, and day views")
assert(calendarWorkspace.includes("persona-calendar-events-v1"), "Calendar events must persist locally")
assert(calendarWorkspace.includes("persona-calendar-tags-v1"), "Calendar tags must be user-configurable and persist locally")
assert(calendarWorkspace.includes("selectDateFromCalendar"), "Calendar date selection must update the inspector without changing views")
assert(calendarWorkspace.includes("deleteEvent"), "Calendar must support event deletion")
assert(homeQuickActions.includes('href: "/calendar"'), "Home calendar shortcut must open the dedicated calendar page")

const knowledgeLibrary = readFileSync(join(workspaceRoot, "src", "features", "knowledge", "KnowledgeLibraryPage.tsx"), "utf-8")
assert(knowledgeLibrary.includes("getWorkspaceKnowledge"), "Knowledge page must read the generated index")
assert(knowledgeLibrary.includes("toggleFavorite"), "Knowledge entries must support sidebar pinning")
assert(syncScript.includes("/knowledge/${config.sub}/${name}.html"), "Knowledge sync must emit public content routes")

const toolsPage = readFileSync(join(workspaceRoot, "src", "features", "tools", "ToolsPage.tsx"), "utf-8")
assert(toolsPage.includes('getPersonaJson<StatusResponse>("/api/status")'), "Tools page must expose live runtime diagnostics")
assert(toolsPage.includes("DailySummaryPanel"), "Tools page must expose the working Daily Summary tool")

const blogAdapter = readFileSync(join(blogRoot, "src", "blogData.server.ts"), "utf-8")
assert(blogAdapter.includes("public", "Blog data must read generated public data") && blogAdapter.includes("blog-posts.json"), "Blog data must use the generated manifest")
assert(!blogAdapter.includes("OBSIDIAN_VAULT_PATH"), "Blog adapter must not read the Obsidian vault")

assert(packageJson.includes('"react-markdown"'), "Blog must declare a Markdown renderer")
assert(packageJson.includes('"remark-gfm"'), "Blog must support GitHub-flavored Markdown")

const workspaceSources = readFileSync(join(workspaceRoot, "src", "shared", "data", "workspaceSources.ts"), "utf-8")
assert(workspaceSources.includes("Obsidian"), "Workspace data layer must describe the Obsidian content source")
assert(workspaceSources.includes("Persona"), "Workspace data layer must describe the Persona memory source")
assert(!workspaceSources.includes("data/persona-os.db"), "Workspace data layer must not point UI at SQLite directly")

const workspaceData = readFileSync(join(workspaceRoot, "src", "shared", "data", "workspaceData.ts"), "utf-8")
assert(workspaceData.includes("/data/projects.json"), "Workspace data layer must expose project JSON")
assert(workspaceData.includes("/data/todos.json"), "Workspace data layer must expose todo JSON")
assert(workspaceData.includes("/data/knowledge.json"), "Workspace data layer must expose knowledge JSON")

const panelUi = readFileSync(join(workspaceRoot, "src", "shared", "ui", "Panel.tsx"), "utf-8")
assert(panelUi.includes("feature-panel"), "Workspace must provide a shared panel shell")

const stateUi = readFileSync(join(workspaceRoot, "src", "shared", "ui", "StateBlock.tsx"), "utf-8")
assert(stateUi.includes("SkeletonRows"), "Workspace must provide a shared loading skeleton")
assert(stateUi.includes("StateBlock"), "Workspace must provide a shared empty/error state block")

const workflowPanels = [
  join(workspaceRoot, "src", "features", "projects", "ProjectsPanel.tsx"),
  join(workspaceRoot, "src", "features", "todos", "TodosPanel.tsx"),
  join(workspaceRoot, "src", "features", "calendar", "CalendarPanel.tsx"),
  join(workspaceRoot, "src", "features", "knowledge", "KnowledgePanel.tsx"),
]

for (const file of workflowPanels) {
  const content = readFileSync(file, "utf-8")
  assert(content.includes("@/shared/ui/Panel"), `${file} must use the shared panel shell`)
  assert(content.includes("SkeletonRows"), `${file} must expose a loading skeleton`)
  assert(content.includes("StateBlock"), `${file} must expose empty/error states`)
}

const nextPersonaApi = readFileSync(join(workspaceRoot, "src", "shared", "api", "personaApi.ts"), "utf-8")
assert(nextPersonaApi.includes("http://127.0.0.1:3001"), "Next Persona API client must default to 127.0.0.1:3001")
assert(!nextPersonaApi.includes("data/persona-os.db"), "Next Persona API client must not read SQLite directly")
assert(nextPersonaApi.includes('cache: init?.cache ?? "no-store"'), "Persona runtime reads must bypass browser caches")

const dailySummaryPanel = readFileSync(
  join(workspaceRoot, "src", "features", "daily-summary", "DailySummaryPanel.tsx"),
  "utf-8",
)
assert(dailySummaryPanel.includes("/api/daily-summaries"), "Daily Note panel must use the Application summary API")
assert(dailySummaryPanel.includes("生成中"), "Daily Note panel must expose summary generation")

const layout = readFileSync(join(workspaceRoot, ".vitepress", "theme", "Layout.vue"), "utf-8")
assert(layout.includes("MemoryProfilePanel"), "Workspace layout must expose the Memory/Profile panel")

const personaApi = readFileSync(join(workspaceRoot, ".vitepress", "theme", "api", "personaApi.ts"), "utf-8")
assert(personaApi.includes("http://127.0.0.1:3001"), "Persona API client must default to 127.0.0.1:3001")
assert(!personaApi.includes("data/persona-os.db"), "Persona API client must not read SQLite directly")

const memoryPanel = readFileSync(join(workspaceRoot, ".vitepress", "theme", "components", "MemoryProfilePanel.vue"), "utf-8")
assert(memoryPanel.includes("/api/memory/profile"), "Memory/Profile panel must read the Application memory API")
assert(memoryPanel.includes("/api/memory/profile/corrections"), "Memory/Profile panel must use governed profile corrections")
assert(memoryPanel.includes("/api/memory/profile/state"), "Memory/Profile panel must use governed profile state APIs")
assert(memoryPanel.includes("reason required"), "Memory/Profile state controls must require a reason")
assert(!memoryPanel.includes("legacy/"), "Memory/Profile panel must not depend on legacy HTML")
assert(!memoryPanel.includes("data/persona-os.db"), "Memory/Profile panel must not read SQLite directly")
assert(!memoryPanel.includes("DELETE"), "Memory/Profile panel must not expose delete operations")
assert(!memoryPanel.includes("/api/memory/patch"), "Memory/Profile panel must not write raw memory patches")

const staleEntrypointPatterns = [
  "apps/workspace/index.html",
  "file:// 可打开",
  "当前仪表盘是",
  "仪表盘 index.html",
]

const searchableFiles = [
  join(legacyRoot, "index.html"),
  join(legacyRoot, "detail.html"),
  join(legacyRoot, "calendar.html"),
]

for (const file of searchableFiles) {
  const content = readFileSync(file, "utf-8")
  for (const pattern of staleEntrypointPatterns) {
    assert(!content.includes(pattern), `${file} must not describe legacy HTML as the current entrypoint: ${pattern}`)
  }
}

console.log("workspace entry contract ok")

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}
