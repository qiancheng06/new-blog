import { spawn } from "child_process"
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "fs"
import { tmpdir } from "os"
import { extname, join } from "path"

interface Step {
  name: string
  script: string
  localOnly?: boolean
}

const isCi = process.argv.includes("--ci")
const npmCli = process.env.npm_execpath
if (!npmCli) throw new Error("Verification must be started through npm run")

const steps: Step[] = [
  { name: "Backend TypeScript build", script: "build:backend" },
  { name: "NAS deployment and PWA contract test", script: "check:deploy" },
  { name: "Fresh database schema contract test", script: "contract:db-schema" },
  { name: "No-network API smoke test", script: "smoke:api" },
  { name: "No-network API contract test", script: "contract:api" },
  { name: "No-network Telegram contract test", script: "contract:telegram" },
  { name: "Telegram durable idempotency contract test", script: "contract:telegram-idempotency" },
  { name: "Todo lifecycle contract test", script: "contract:todos" },
  { name: "Project lifecycle contract test", script: "contract:projects" },
  { name: "Persisted Working State contract test", script: "contract:working-state" },
  { name: "Immutable Capture contract test", script: "contract:captures" },
  { name: "Ordered Memory commit contract test", script: "contract:ordered-memory" },
  { name: "Process Message ordering contract test", script: "contract:process-ordering" },
  { name: "Durable Analysis job contract test", script: "contract:analysis-jobs" },
  { name: "Recoverable Conversation job contract test", script: "contract:conversation-jobs" },
  { name: "Component runtime health contract test", script: "contract:runtime-health" },
  { name: "No-network runtime burst contract test", script: "contract:runtime-burst" },
  { name: "No-network Persona runtime startup contract test", script: "contract:runtime-startup" },
  { name: "No-network real-mode docs contract test", script: "contract:real-mode-docs" },
  { name: "Memory transaction rollback contract test", script: "contract:memory-transaction" },
  { name: "Governed Memory search contract test", script: "contract:memory-search" },
  { name: "Daily Summary end-to-end contract test", script: "contract:daily-summary" },
  { name: "Automatic Daily Summary scheduler contract test", script: "contract:daily-summary-scheduler" },
  { name: "Obsidian Daily Note archive contract test", script: "contract:obsidian-archive" },
  { name: "Obsidian Persona Snapshot scheduler contract test", script: "contract:obsidian-snapshot-scheduler" },
  { name: "Calendar persistence contract test", script: "contract:calendar" },
  { name: "Durable background jobs contract test", script: "contract:background-jobs" },
  { name: "Persona prompt fixture test", script: "fixture:persona" },
  { name: "Infra config contract test", script: "check:infra" },
  { name: "Runtime diagnostics contract test", script: "contract:runtime" },
  { name: "Memory inspection contract test", script: "inspect:memory" },
  { name: "Real-mode cleanup contract test", script: "contract:cleanup" },
  { name: "Workspace sync", script: "sync", localOnly: true },
  { name: "Workspace entrypoint contract test", script: "check:workspace" },
  { name: "Workspace production build", script: "build" },
  { name: "Blog production build", script: "build:blog" },
]

const ciDataRoot = isCi ? mkdtempSync(join(tmpdir(), "persona-verify-ci-")) : null

try {
  runRootStructureCheck()
  runCurrentDocCheck()

  for (const step of steps) {
    if (step.localOnly && isCi) continue
    await runStep(step, ciDataRoot)
  }
} finally {
  if (ciDataRoot) rmSync(ciDataRoot, { recursive: true, force: true })
}

console.log(`\nverify:${isCi ? "ci" : "local"} ok`)

function runRootStructureCheck(): void {
  console.log("\n==> Repository structure check")

  const requiredDirs = [
    "apps/blog/app",
    "apps/persona/src",
    "apps/workspace/app/(workspace)",
    "apps/workspace/app/(ai)",
    "apps/workspace/app/(modules)",
    "docs/00-overview",
    "docs/01-workspace",
    "docs/02-persona",
    "docs/03-memory",
    "docs/04-application",
    "docs/05-infra",
    "docs/06-governance",
    "docs/07-product",
    "docs/99-archive",
  ]

  const requiredFiles = [
    "apps/blog/app/layout.tsx",
    "apps/blog/app/page.tsx",
    "apps/blog/src/blogData.server.ts",
    "apps/workspace/.vitepress/config.ts",
    "apps/workspace/legacy/index.html",
    "apps/workspace/legacy/detail.html",
    "apps/workspace/legacy/calendar.html",
    "apps/workspace/start-blog.bat",
    "apps/workspace/app/(workspace)/page.tsx",
    "apps/workspace/app/(ai)/ai/page.tsx",
    "apps/workspace/app/(modules)/calendar/page.tsx",
    "apps/workspace/src/features/calendar/CalendarWorkspace.tsx",
    "apps/workspace/src/features/calendar/calendarApi.ts",
    "apps/workspace/src/features/daily-summary/DailySummaryPanel.tsx",
    "apps/workspace/src/shared/api/personaApi.ts",
    "apps/workspace/src/features/pwa/PwaRegister.tsx",
    "apps/workspace/src/features/pwa/pwaMetadata.ts",
    "apps/workspace/scripts/entry-contract.ts",
    "apps/workspace/scripts/sync-projects.js",
    "apps/persona/src/index.ts",
    "apps/persona/src/main/index.ts",
    "apps/persona/src/interface/api/server.ts",
    "apps/persona/src/application/conversation.ts",
    "apps/persona/src/application/background-tasks.ts",
    "apps/persona/src/application/api-contract.ts",
    "apps/persona/src/application/events.ts",
    "apps/persona/src/application/conversations.ts",
    "apps/persona/src/application/analysis-jobs.ts",
    "apps/persona/src/application/analysis-job-contract.ts",
    "apps/persona/src/application/conversation-jobs.ts",
    "apps/persona/src/application/conversation-job-contract.ts",
    "apps/persona/src/application/todos.ts",
    "apps/persona/src/application/todo-contract.ts",
    "apps/persona/src/application/projects.ts",
    "apps/persona/src/application/project-contract.ts",
    "apps/persona/src/application/working-state.ts",
    "apps/persona/src/application/working-state-contract.ts",
    "apps/persona/src/application/captures.ts",
    "apps/persona/src/application/capture-contract.ts",
    "apps/persona/src/application/ordered-memory-commit.ts",
    "apps/persona/src/application/ordered-memory-commit-contract.ts",
    "apps/persona/src/application/process-message-ordering-contract.ts",
    "apps/persona/src/application/runtime-health.ts",
    "apps/persona/src/application/runtime-health-contract.ts",
    "apps/persona/src/application/memory-transaction-contract.ts",
    "apps/persona/src/application/memory-search-contract.ts",
    "apps/persona/src/application/daily-summary-contract.ts",
    "apps/persona/src/application/daily-summary-scheduler.ts",
    "apps/persona/src/application/daily-summary-scheduler-contract.ts",
    "apps/persona/src/application/obsidian-archive-contract.ts",
    "apps/persona/src/application/obsidian-snapshot.ts",
    "apps/persona/src/application/obsidian-snapshot-scheduler.ts",
    "apps/persona/src/application/obsidian-snapshot-scheduler-contract.ts",
    "apps/persona/src/application/calendar-contract.ts",
    "apps/persona/src/application/background-jobs-contract.ts",
    "apps/persona/src/domain/conversation-job/store.ts",
    "apps/persona/src/domain/event/feed.ts",
    "apps/persona/src/domain/memory-proposal/store.ts",
    "apps/persona/src/domain/memory/search.ts",
    "apps/persona/src/domain/persona-snapshot-run/store.ts",
    "apps/persona/src/infra/db/schema-contract.ts",
    "apps/persona/src/infra/obsidian/persona-snapshot-exporter.ts",
    "apps/persona/scripts/deployment-contract.ts",
    "Dockerfile",
    ".dockerignore",
    "deploy/nas/compose.yaml",
    "deploy/nas/Caddyfile",
    "deploy/nas/.env.example",
    "deploy/nas/backup-sqlite.mjs",
    "deploy/nas/README.md",
    "apps/workspace/app/manifest.ts",
    "apps/workspace/public/sw.js",
    "docs/00-overview/current-architecture.md",
    "docs/00-overview/deployment-and-client-architecture.md",
    "docs/06-governance/architecture-invariants.md",
  ]

  const allowedDocsDirs = new Set([
    "00-overview",
    "01-workspace",
    "02-persona",
    "03-memory",
    "04-application",
    "05-infra",
    "06-governance",
    "07-product",
    "99-archive",
  ])

  const forbiddenRootEntries = [
    ".references",
    ".vitepress",
    "--css-path",
    "app",
    "persona-dashboard",
    "scripts",
    "index.html",
    "detail.html",
    "calendar.html",
    "start-blog.bat",
    "public",
    "blog",
    "src",
  ]

  const missingDirs = requiredDirs.filter((entry) => !existsSync(join(process.cwd(), entry)))
  const missingFiles = requiredFiles.filter((entry) => !existsSync(join(process.cwd(), entry)))
  const stale = forbiddenRootEntries.filter((entry) => existsSync(join(process.cwd(), entry)))
  const unexpectedDocsDirs = readdirSync(join(process.cwd(), "docs"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => !allowedDocsDirs.has(name))
  const fileNotDir = requiredDirs.filter((entry) => {
    const fullPath = join(process.cwd(), entry)
    return existsSync(fullPath) && !statSync(fullPath).isDirectory()
  })

  const errors = [
    formatProblem("Missing required directories", missingDirs),
    formatProblem("Missing required files", missingFiles),
    formatProblem("Required paths are not directories", fileNotDir),
    formatProblem("Unexpected docs top-level directories", unexpectedDocsDirs),
    formatProblem("Forbidden root entries", stale),
  ].filter(Boolean)

  if (errors.length > 0) throw new Error(errors.join("\n"))
}

function runCurrentDocCheck(): void {
  console.log("\n==> Current documentation reference check")
  const roots = [
    "README.md",
    "deploy.md",
    ".env.example",
    "apps",
    "docs/00-overview",
    "docs/01-workspace",
    "docs/02-persona",
    "docs/03-memory",
    "docs/04-application",
    "docs/05-infra",
    "docs/06-governance",
    "docs/07-product",
    "package.json",
    "tsconfig.json",
  ]
  const patterns = [
    /DATABASE_URL/,
    /postgresql:\/\//,
    /localhost:(?:3001|4173|5173)/,
    /node scripts\/sync-projects/,
    /vitepress (?:dev|build) \./,
  ]
  const failures: string[] = []

  for (const file of roots.flatMap(listSearchableFiles)) {
    if (file.endsWith(join("apps", "persona", "scripts", "verify-local.ts"))) continue
    const content = readFileSync(file, "utf8")
    const match = patterns.find((pattern) => pattern.test(content))
    if (match) failures.push(`${file}: ${match.source}`)
  }

  if (failures.length > 0) {
    throw new Error(`Stale current documentation references:\n${failures.join("\n")}`)
  }
}

function listSearchableFiles(entry: string): string[] {
  if (!existsSync(entry)) return []
  const stats = statSync(entry)
  if (stats.isFile()) return [entry]
  if (!stats.isDirectory()) return []

  return readdirSync(entry, { withFileTypes: true }).flatMap((child) => {
    if (child.name === "node_modules" || child.name === ".next" || child.name === "dist") return []
    const childPath = join(entry, child.name)
    if (childPath.endsWith(join("apps", "workspace", "public", "data"))) return []
    if (child.isDirectory()) return listSearchableFiles(childPath)
    return [".md", ".ts", ".tsx", ".js", ".json", ".vue", ".html", ".example"]
      .includes(extname(child.name)) ? [childPath] : []
  })
}

async function runStep(step: Step, isolatedDataRoot: string | null): Promise<void> {
  console.log(`\n==> ${step.name}`)
  const isolatedDataDir = isolatedDataRoot
    ? join(isolatedDataRoot, step.script.replace(/[^a-z0-9_-]+/gi, "-"))
    : process.env.PERSONA_DATA_DIR
  const result = await new Promise<number | null>((resolve, reject) => {
    const child = spawn(process.execPath, [npmCli, "run", step.script], {
      cwd: process.cwd(),
      shell: false,
      stdio: "inherit",
      env: {
        ...process.env,
        CI: isCi ? "true" : process.env.CI,
        ...(isolatedDataDir ? { PERSONA_DATA_DIR: isolatedDataDir } : {}),
      },
    })
    child.on("error", reject)
    child.on("close", resolve)
  })
  if (result !== 0) throw new Error(`${step.name} failed with exit code ${result}`)
}

function formatProblem(label: string, entries: string[]): string {
  return entries.length > 0 ? `${label}: ${entries.join(", ")}` : ""
}
