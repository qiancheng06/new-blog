import { spawnSync } from "child_process"

const fakeDeepseekKey = "sk-realistic-but-fake-deepseek-key-123456"
const fakeTelegramToken = "123456:fake-telegram-token-secret"

const result = spawnSync(
  process.execPath,
  [
    "--import",
    "tsx",
    "apps/persona/src/infra/diagnostics/runtime-diagnostics.ts",
  ],
  {
    cwd: process.cwd(),
    encoding: "utf-8",
    env: {
      ...process.env,
      LLM_PROVIDER: "deepseek",
      OPENAI_API_KEY: fakeDeepseekKey,
      TELEGRAM_TOKEN: fakeTelegramToken,
      TELEGRAM_ALLOWED_CHAT_IDS: "123456",
      API_PORT: "3001",
      API_HOST: "127.0.0.1",
      PERSONA_ALLOWED_ORIGINS: "http://127.0.0.1:5173",
      PERSONA_TIME_ZONE: "Asia/Shanghai",
      PERSONA_DAILY_SUMMARY_TIME: "00:05",
      PERSONA_OBSIDIAN_SNAPSHOT_ENABLED: "true",
      PERSONA_OBSIDIAN_SNAPSHOT_TIME: "00:15",
      OBSIDIAN_VAULT_PATH: "C:\\definitely\\missing\\vault",
    },
  },
)

const output = `${result.stdout}\n${result.stderr}`

assert(result.status === 0, `diagnostics should pass with realistic fake secrets: ${output}`)
assert(output.includes("Persona runtime diagnostics"), "diagnostics header missing")
assert(output.includes("No network calls"), "diagnostics must state no-network behavior")
assert(output.includes("[OK] OPENAI_API_KEY"), "DeepSeek key status missing")
assert(output.includes("[OK] TELEGRAM_TOKEN"), "Telegram token status missing")
assert(output.includes("[OK] TELEGRAM_ALLOWED_CHAT_IDS"), "Telegram allowlist status missing")
assert(output.includes("[OK] API_HOST"), "loopback API host status missing")
assert(output.includes("[OK] Daily Summary scheduler"), "Daily Summary scheduler status missing")
assert(output.includes("enabled at 00:05 (Asia/Shanghai)"), "Daily Summary schedule detail mismatch")
assert(output.includes("[OK] Persona Snapshot scheduler"), "Persona Snapshot scheduler status missing")
assert(output.includes("enabled at 00:15 (Asia/Shanghai)"), "Persona Snapshot schedule detail mismatch")
assert(output.includes("[WARN] Obsidian vault"), "missing vault should be a warning")
assert(output.includes("sk-...[redacted]"), "DeepSeek key should be redacted")
assert(output.includes("telegram-token...[redacted]"), "Telegram token should be redacted")
assert(!output.includes(fakeDeepseekKey), "DeepSeek key leaked")
assert(!output.includes(fakeTelegramToken), "Telegram token leaked")
assert(!output.includes("C:\\definitely\\missing\\vault"), "vault absolute path leaked")

const failing = spawnSync(
  process.execPath,
  [
    "--import",
    "tsx",
    "apps/persona/src/infra/diagnostics/runtime-diagnostics.ts",
  ],
  {
    cwd: process.cwd(),
    encoding: "utf-8",
    env: {
      ...process.env,
      LLM_PROVIDER: "deepseek",
      OPENAI_API_KEY: "sk-your_deepseek_key_here",
      TELEGRAM_TOKEN: "",
      TELEGRAM_ALLOWED_CHAT_IDS: "",
      API_PORT: "abc",
      API_HOST: "127.0.0.1",
      PERSONA_ALLOWED_ORIGINS: "http://127.0.0.1:5173",
      PERSONA_OBSIDIAN_SNAPSHOT_ENABLED: "false",
      OBSIDIAN_VAULT_PATH: "",
    },
  },
)

const failingOutput = `${failing.stdout}\n${failing.stderr}`
assert(failing.status === 1, "diagnostics should fail for invalid API_PORT and placeholder DeepSeek key")
assert(failingOutput.includes("[FAIL] API_PORT"), "invalid API_PORT should fail")
assert(failingOutput.includes("[FAIL] OPENAI_API_KEY"), "placeholder DeepSeek key should fail")
assert(!failingOutput.includes("sk-your_deepseek_key_here"), "placeholder key should not be printed")

const insideRepoVault = "docs"
const insideRepo = spawnSync(
  process.execPath,
  [
    "--import",
    "tsx",
    "apps/persona/src/infra/diagnostics/runtime-diagnostics.ts",
  ],
  {
    cwd: process.cwd(),
    encoding: "utf-8",
    env: {
      ...process.env,
      LLM_PROVIDER: "mock",
      OPENAI_API_KEY: "",
      TELEGRAM_TOKEN: "",
      TELEGRAM_ALLOWED_CHAT_IDS: "",
      API_PORT: "3001",
      API_HOST: "127.0.0.1",
      PERSONA_ALLOWED_ORIGINS: "http://127.0.0.1:5173",
      PERSONA_OBSIDIAN_SNAPSHOT_ENABLED: "false",
      OBSIDIAN_VAULT_PATH: insideRepoVault,
    },
  },
)

const insideRepoOutput = `${insideRepo.stdout}\n${insideRepo.stderr}`
assert(insideRepo.status === 0, `inside-repo vault warning should not fail diagnostics: ${insideRepoOutput}`)
assert(insideRepoOutput.includes("[WARN] Obsidian vault"), "inside-repo vault should warn")
assert(insideRepoOutput.includes("appears inside repository"), "inside-repo vault warning should explain boundary")
assert(insideRepoOutput.includes("leaf: docs"), "inside-repo vault should only print leaf name")
assert(!insideRepoOutput.includes(process.cwd()), "inside-repo vault should not leak absolute project path")

const projectRoot = spawnSync(
  process.execPath,
  [
    "--import",
    "tsx",
    "apps/persona/src/infra/diagnostics/runtime-diagnostics.ts",
  ],
  {
    cwd: process.cwd(),
    encoding: "utf-8",
    env: {
      ...process.env,
      LLM_PROVIDER: "mock",
      OPENAI_API_KEY: "",
      TELEGRAM_TOKEN: "",
      TELEGRAM_ALLOWED_CHAT_IDS: "",
      API_PORT: "3001",
      API_HOST: "127.0.0.1",
      PERSONA_ALLOWED_ORIGINS: "http://127.0.0.1:5173",
      PERSONA_OBSIDIAN_SNAPSHOT_ENABLED: "false",
      OBSIDIAN_VAULT_PATH: ".",
    },
  },
)

const projectRootOutput = `${projectRoot.stdout}\n${projectRoot.stderr}`
assert(projectRoot.status === 0, `project-root vault warning should not fail diagnostics: ${projectRootOutput}`)
assert(projectRootOutput.includes("[WARN] Obsidian vault"), "project root must be treated as inside repository")
assert(projectRootOutput.includes("appears inside repository"), "project-root warning should explain boundary")
assert(!projectRootOutput.includes(process.cwd()), "project-root vault should not leak absolute project path")

console.log("runtime diagnostics contract ok")

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}
