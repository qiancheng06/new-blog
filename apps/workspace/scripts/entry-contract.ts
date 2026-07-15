import { existsSync, readFileSync } from "fs"
import { join } from "path"

const workspaceRoot = join(process.cwd(), "apps", "workspace")
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
assert(packageJson.includes('"dev:content"'), "VitePress content site must keep a dedicated dev script")
assert(packageJson.includes('"build:content"'), "VitePress content site must keep a dedicated build script")

const syncScript = readFileSync(join(workspaceRoot, "scripts", "sync-projects.js"), "utf-8")
assert(syncScript.includes("const LEGACY_DIR"), "sync script must write standalone HTML through LEGACY_DIR")
assert(!syncScript.includes("join(ROOT, 'index.html')"), "sync script must not write root index.html")

const nextPage = readFileSync(join(workspaceRoot, "app", "page.tsx"), "utf-8")
assert(nextPage.includes("Persona Workspace"), "Next.js app must be the primary Workspace shell")
assert(nextPage.includes("StatusStrip"), "Next.js app must expose runtime status")
assert(nextPage.includes("MemoryPanel"), "Next.js app must expose Memory/Profile")
assert(nextPage.includes("ChatDock"), "Next.js app must expose Companion chat")
assert(nextPage.includes("ProjectsPanel"), "Next.js app must expose Projects")
assert(nextPage.includes("TodosPanel"), "Next.js app must expose Todos")
assert(nextPage.includes("CalendarPanel"), "Next.js app must expose Calendar")
assert(nextPage.includes("KnowledgePanel"), "Next.js app must expose Knowledge")

const workspaceSources = readFileSync(join(workspaceRoot, "src", "shared", "data", "workspaceSources.ts"), "utf-8")
assert(workspaceSources.includes("Obsidian"), "Workspace data layer must describe the Obsidian content source")
assert(workspaceSources.includes("Persona"), "Workspace data layer must describe the Persona memory source")
assert(!workspaceSources.includes("data/persona-os.db"), "Workspace data layer must not point UI at SQLite directly")

const workspaceData = readFileSync(join(workspaceRoot, "src", "shared", "data", "workspaceData.ts"), "utf-8")
assert(workspaceData.includes("/data/projects.json"), "Workspace data layer must expose project JSON")
assert(workspaceData.includes("/data/todos.json"), "Workspace data layer must expose todo JSON")
assert(workspaceData.includes("/data/knowledge.json"), "Workspace data layer must expose knowledge JSON")

const nextPersonaApi = readFileSync(join(workspaceRoot, "src", "shared", "api", "personaApi.ts"), "utf-8")
assert(nextPersonaApi.includes("http://127.0.0.1:3001"), "Next Persona API client must default to 127.0.0.1:3001")
assert(!nextPersonaApi.includes("data/persona-os.db"), "Next Persona API client must not read SQLite directly")
assert(nextPersonaApi.includes('cache: init?.cache ?? "no-store"'), "Persona runtime reads must bypass browser caches")

const dailySummaryPanel = readFileSync(
  join(workspaceRoot, "src", "features", "daily-summary", "DailySummaryPanel.tsx"),
  "utf-8",
)
assert(dailySummaryPanel.includes("/api/daily-summaries"), "Daily Note panel must use the Application summary API")
assert(dailySummaryPanel.includes("Generate"), "Daily Note panel must expose summary generation")

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
