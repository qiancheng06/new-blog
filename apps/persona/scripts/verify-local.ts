import { spawn } from "child_process"
import { existsSync, readdirSync, statSync } from "fs"
import { join } from "path"

interface Step {
  name: string
  command: string
}

const steps: Step[] = [
  {
    name: "Backend TypeScript build",
    command: "npm.cmd run build:backend",
  },
  {
    name: "No-network API smoke test",
    command: "npm.cmd run smoke:api",
  },
  {
    name: "No-network API contract test",
    command: "npm.cmd run contract:api",
  },
  {
    name: "No-network Telegram contract test",
    command: "npm.cmd run contract:telegram",
  },
  {
    name: "Telegram durable idempotency contract test",
    command: "npm.cmd run contract:telegram-idempotency",
  },
  {
    name: "Ordered asynchronous Memory commit contract test",
    command: "npm.cmd run contract:ordered-memory",
  },
  {
    name: "Process Message out-of-order Analysis contract test",
    command: "npm.cmd run contract:process-ordering",
  },
  {
    name: "Durable Analysis job recovery contract test",
    command: "npm.cmd run contract:analysis-jobs",
  },
  {
    name: "No-network runtime burst contract test",
    command: "npm.cmd run contract:runtime-burst",
  },
  {
    name: "No-network Persona runtime startup contract test",
    command: "npm.cmd run contract:runtime-startup",
  },
  {
    name: "No-network real-mode docs contract test",
    command: "npm.cmd run contract:real-mode-docs",
  },
  {
    name: "Memory transaction rollback contract test",
    command: "npm.cmd run contract:memory-transaction",
  },
  {
    name: "Daily Summary end-to-end contract test",
    command: "npm.cmd run contract:daily-summary",
  },
  {
    name: "Obsidian Daily Note archive contract test",
    command: "npm.cmd run contract:obsidian-archive",
  },
  {
    name: "Persona prompt fixture test",
    command: "npm.cmd run fixture:persona",
  },
  {
    name: "Infra config contract test",
    command: "npm.cmd run check:infra",
  },
  {
    name: "Runtime diagnostics contract test",
    command: "npm.cmd run contract:runtime",
  },
  {
    name: "Memory inspection contract test",
    command: "npm.cmd run inspect:memory",
  },
  {
    name: "Real-mode cleanup contract test",
    command: "npm.cmd run contract:cleanup",
  },
  {
    name: "Workspace sync",
    command: "npm.cmd run sync",
  },
  {
    name: "Workspace entrypoint contract test",
    command: "npm.cmd run check:workspace",
  },
  {
    name: "Current-doc stale reference check",
    command: [
      "rg",
      "-n",
      "\"DATABASE_URL|postgresql://|localhost:5173|localhost:4173|localhost:3001|node scripts/sync-projects|vitepress dev \\\\.|vitepress build \\\\.\"",
      "--glob",
      "\"!apps/persona/scripts/verify-local.ts\"",
      "--glob",
      "\"!docs/99-archive/**\"",
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
    ].join(" "),
  },
]

runRootStructureCheck()

for (const step of steps) {
  await runStep(step)
}

console.log("\nverify:local ok")

function runRootStructureCheck(): void {
  console.log("\n==> Repository structure check")

  const requiredDirs = [
    "apps/workspace",
    "apps/persona/src",
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
    "apps/workspace/.vitepress/config.ts",
    "apps/workspace/legacy/index.html",
    "apps/workspace/legacy/detail.html",
    "apps/workspace/legacy/calendar.html",
    "apps/workspace/start-blog.bat",
    "apps/workspace/app/page.tsx",
    "apps/workspace/src/features/daily-summary/DailySummaryPanel.tsx",
    "apps/workspace/src/shared/api/personaApi.ts",
    "apps/workspace/src/shared/data/workspaceData.ts",
    "apps/workspace/src/shared/data/workspaceSources.ts",
    "apps/workspace/scripts/entry-contract.ts",
    "apps/workspace/scripts/sync-projects.js",
    "apps/workspace/scripts/watch.js",
    "apps/persona/src/index.ts",
    "apps/persona/src/main/index.ts",
    "apps/persona/src/main/runtime-startup-contract.ts",
    "apps/persona/src/interface/api/server.ts",
    "apps/persona/src/interface/telegram/access.ts",
    "apps/persona/src/interface/telegram/events.ts",
    "apps/persona/src/interface/telegram/telegram-contract.ts",
    "apps/persona/src/application/conversation.ts",
    "apps/persona/src/application/background-tasks.ts",
    "apps/persona/src/application/api-contract.ts",
    "apps/persona/src/application/real-mode-docs-contract.ts",
    "apps/persona/src/application/memory-transaction-contract.ts",
    "apps/persona/src/application/daily-summary-contract.ts",
    "apps/persona/src/application/obsidian-archive-contract.ts",
    "apps/persona/src/infra/obsidian/daily-note-exporter.ts",
    "apps/persona/src/application/runtime-burst-contract.ts",
    "apps/persona/src/application/telegram-idempotency-contract.ts",
    "apps/persona/src/application/ordered-memory-commit.ts",
    "apps/persona/src/application/ordered-memory-commit-contract.ts",
    "apps/persona/src/application/process-message-ordering-contract.ts",
    "apps/persona/src/application/analysis-jobs.ts",
    "apps/persona/src/application/analysis-job-contract.ts",
    "apps/persona/src/domain/analysis-job/store.ts",
    "apps/persona/src/ai-runtime/prompts/prompt-fixture.ts",
    "apps/persona/src/infra/config/config-contract.ts",
    "apps/persona/src/infra/diagnostics/runtime-diagnostics.ts",
    "apps/persona/src/infra/diagnostics/runtime-diagnostics-contract.ts",
    "apps/persona/src/domain/memory/inspect-memory.ts",
    "apps/persona/src/domain/memory/cleanup-real-mode-tests.ts",
    "apps/persona/src/domain/memory/cleanup-real-mode-tests-contract.ts",
    "docs/00-overview/README.md",
    "docs/00-overview/current-architecture.md",
    "docs/00-overview/AI_LOADING_GUIDE.md",
    "docs/00-overview/next-agent-task-queue.md",
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
    ".vitepress",
    "scripts",
    "index.html",
    "detail.html",
    "calendar.html",
    "start-blog.bat",
    "public",
    "blog",
    "src",
  ]

  const missing = requiredDirs.filter((entry) => !existsSync(join(process.cwd(), entry)))
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

  if (
    missing.length > 0 ||
    missingFiles.length > 0 ||
    stale.length > 0 ||
    unexpectedDocsDirs.length > 0 ||
    fileNotDir.length > 0
  ) {
    if (missing.length > 0) console.error(`Missing required directories: ${missing.join(", ")}`)
    if (missingFiles.length > 0) console.error(`Missing required files: ${missingFiles.join(", ")}`)
    if (fileNotDir.length > 0) console.error(`Required paths are not directories: ${fileNotDir.join(", ")}`)
    if (unexpectedDocsDirs.length > 0) console.error(`Unexpected docs top-level directories: ${unexpectedDocsDirs.join(", ")}`)
    if (stale.length > 0) console.error(`Stale root entries should stay under apps/ or archive: ${stale.join(", ")}`)
    throw new Error("Repository structure check failed")
  }
}

async function runStep(step: Step): Promise<void> {
  console.log(`\n==> ${step.name}`)

  const result = await new Promise<number | null>((resolve, reject) => {
    const child = spawn(step.command, {
      cwd: process.cwd(),
      shell: true,
      stdio: step.name.includes("stale reference") ? ["ignore", "pipe", "pipe"] : "inherit",
    })

    let stdout = ""
    let stderr = ""

    if (child.stdout) child.stdout.on("data", (chunk) => { stdout += chunk.toString() })
    if (child.stderr) child.stderr.on("data", (chunk) => { stderr += chunk.toString() })

    child.on("error", reject)
    child.on("close", (code) => {
      if (step.name.includes("stale reference")) {
        const filtered = stdout
          .split(/\r?\n/)
          .filter((line) => line.trim().length > 0)
          .filter((line) => !line.includes("docs\\99-archive") && !line.includes("docs/99-archive"))

        if (filtered.length > 0) {
          console.error(filtered.join("\n"))
          resolve(2)
          return
        }
      }

      if (stderr.trim() && step.name.includes("stale reference")) {
        console.error(stderr.trim())
      }
      resolve(code)
    })
  })

  if (result !== 0 && !(step.name.includes("stale reference") && result === 1)) {
    throw new Error(`${step.name} failed with exit code ${result}`)
  }
}
