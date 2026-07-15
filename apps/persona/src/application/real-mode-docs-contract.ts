import { readFileSync } from "fs"

const checklist = read("docs/07-product/real-mode-evaluation.md")
const template = read("docs/07-product/real-mode-evaluation-result-template.md")
const readiness = read("docs/07-product/evaluation-results/2026-07-05-p16-readiness.md")

verifyChecklist()
verifyTemplate()
verifyReadinessRecord()

console.log("real-mode docs contract ok")

function verifyChecklist(): void {
  assertIncludes(checklist, "## DeepSeek Quality Check", "checklist must include DeepSeek gate")
  assertIncludes(checklist, "## Telegram End-To-End Check", "checklist must include Telegram gate")
  assertIncludes(checklist, "## Workspace Real Backend Check", "checklist must include Workspace real-backend gate")
  assertIncludes(checklist, "## Cleanup After Evaluation", "checklist must include cleanup gate")
  assertIncludes(checklist, "OBSIDIAN_VAULT_PATH", "checklist must include Obsidian scope/config")
  assertIncludes(checklist, "npm.cmd run verify:local", "checklist must require default gate")
  assertIncludes(checklist, "npm.cmd run diagnose:runtime", "checklist must require diagnostics")
  assertIncludes(checklist, "PERSONA_EVALUATION_RUN_ID", "checklist must describe Telegram evaluation labels")
  assertIncludes(checklist, "TELEGRAM_ALLOWED_CHAT_IDS", "checklist must require Telegram trusted-chat scope")
  assertIncludes(checklist, "Never paste real API keys", "checklist must forbid secret leakage")
}

function verifyTemplate(): void {
  const headings = [
    "## Run Metadata",
    "## Preflight",
    "## Obsidian Scope",
    "## DeepSeek Quality Check",
    "## Telegram End-To-End Check",
    "## Workspace Real Backend Check",
    "## Cleanup",
    "## Rollback",
    "## Final Verdict",
    "## Follow-Up Tasks",
  ]

  for (const heading of headings) {
    assertIncludes(template, heading, `template missing ${heading}`)
  }

  assertIncludes(template, "Do not commit secrets", "template must forbid committing secrets")
  assertIncludes(template, "Workspace avoided direct reads from `.env`, `data/`, provider logs, or SQLite", "template must preserve Workspace/backend boundary check")
  assertIncludes(template, "Timeline-only apply used", "template must preserve cleanup apply boundary")
  assertIncludes(template, "TELEGRAM_ALLOWED_CHAT_IDS", "template must record Telegram trusted-chat scope")
}

function verifyReadinessRecord(): void {
  assertIncludes(readiness, "not a substitute for human-run", "readiness record must not claim real-mode completion")
  assertIncludes(readiness, "Telegram end-to-end: not run", "readiness must track Telegram as not run")
  assertIncludes(readiness, "Workspace browser real-backend: not run", "readiness must track Workspace browser as not run")
  assertIncludes(readiness, "Cleanup review/apply decision: not run", "readiness must track cleanup decision as not run")
  assertIncludes(readiness, "Obsidian scope: not resolved", "readiness must track Obsidian scope as unresolved")
  assertIncludes(readiness, "Long-running reliability: not run", "readiness must track long-running reliability as not run")
  assertIncludes(readiness, "NO-GO for claiming P16 completion", "readiness must preserve P16 NO-GO")
}

function read(path: string): string {
  return readFileSync(path, "utf-8")
}

function assertIncludes(content: string, expected: string, message: string): void {
  if (!content.includes(expected)) throw new Error(message)
}

export {}
