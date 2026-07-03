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
      API_PORT: "3001",
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
      API_PORT: "abc",
      OBSIDIAN_VAULT_PATH: "",
    },
  },
)

const failingOutput = `${failing.stdout}\n${failing.stderr}`
assert(failing.status === 1, "diagnostics should fail for invalid API_PORT and placeholder DeepSeek key")
assert(failingOutput.includes("[FAIL] API_PORT"), "invalid API_PORT should fail")
assert(failingOutput.includes("[FAIL] OPENAI_API_KEY"), "placeholder DeepSeek key should fail")
assert(!failingOutput.includes("sk-your_deepseek_key_here"), "placeholder key should not be printed")

console.log("runtime diagnostics contract ok")

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}
