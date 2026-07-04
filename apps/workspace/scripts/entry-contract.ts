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
assert(!launcher.includes("legacy\\index.html"), "launcher must not open legacy HTML directly")
assert(!launcher.includes("%DASHBOARD%"), "launcher must not use the old dashboard variable")

const syncScript = readFileSync(join(workspaceRoot, "scripts", "sync-projects.js"), "utf-8")
assert(syncScript.includes("const LEGACY_DIR"), "sync script must write standalone HTML through LEGACY_DIR")
assert(!syncScript.includes("join(ROOT, 'index.html')"), "sync script must not write root index.html")

const layout = readFileSync(join(workspaceRoot, ".vitepress", "theme", "Layout.vue"), "utf-8")
assert(layout.includes("MemoryProfilePanel"), "Workspace layout must expose the Memory/Profile panel")

const personaApi = readFileSync(join(workspaceRoot, ".vitepress", "theme", "api", "personaApi.ts"), "utf-8")
assert(personaApi.includes("http://127.0.0.1:3001"), "Persona API client must default to 127.0.0.1:3001")
assert(!personaApi.includes("data/persona-os.db"), "Persona API client must not read SQLite directly")

const memoryPanel = readFileSync(join(workspaceRoot, ".vitepress", "theme", "components", "MemoryProfilePanel.vue"), "utf-8")
assert(memoryPanel.includes("/api/memory/profile"), "Memory/Profile panel must read the Application memory API")
assert(memoryPanel.includes("/api/memory/profile/corrections"), "Memory/Profile panel must use governed profile corrections")
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
