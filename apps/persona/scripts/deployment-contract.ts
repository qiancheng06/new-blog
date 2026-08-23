import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), "utf8")
const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message)
}

const requiredFiles = [
  "Dockerfile",
  ".dockerignore",
  "deploy/nas/compose.yaml",
  "deploy/nas/Caddyfile",
  "deploy/nas/.env.example",
  "deploy/nas/backup-sqlite.mjs",
  "deploy/nas/README.md",
  "apps/workspace/app/manifest.ts",
  "apps/workspace/public/sw.js",
  "apps/workspace/public/icons/persona-192.png",
  "apps/workspace/public/icons/persona-512.png",
  "apps/workspace/public/icons/persona-maskable-512.png",
  "apps/workspace/public/icons/apple-touch-icon.png",
]

for (const file of requiredFiles) assert(existsSync(join(root, file)), `Missing deployment file: ${file}`)

const compose = read("deploy/nas/compose.yaml")
for (const service of ["persona-api", "workspace", "gateway", "cloudflared", "backup"]) {
  assert(compose.includes(`  ${service}:`), `Compose service missing: ${service}`)
}
assert(!/^\s+ports:/m.test(compose), "NAS services must not publish host ports")
assert(compose.includes("PERSONA_ALLOWED_ORIGINS"), "Compose must inject the exact allowed origin")
assert(compose.includes("/app/data"), "Persona SQLite directory must be a mounted data path")
assert(compose.includes("PERSONA_DATA_DIR: /app/data"), "Persona must use the mounted SQLite directory")
assert(compose.includes("condition: service_healthy"), "Dependent services must wait for health checks")

const caddy = read("deploy/nas/Caddyfile")
assert(caddy.includes("handle_path /persona-api/*"), "Gateway must strip the Persona API prefix")
assert(caddy.includes("reverse_proxy persona-api:3001"), "Gateway Persona upstream is missing")
assert(caddy.includes("reverse_proxy workspace:5173"), "Gateway Workspace upstream is missing")

const dockerfile = read("Dockerfile")
assert(dockerfile.includes("FROM node:22-bookworm-slim"), "NAS image must use Node.js 22 on glibc Linux")
assert(dockerfile.includes("NEXT_PUBLIC_PERSONA_API_BASE=/persona-api"), "Workspace image must use the same-origin API prefix")
assert(dockerfile.includes("npm run build:backend") && dockerfile.includes("npm run build"), "NAS image must build both applications")

const dockerignore = read(".dockerignore")
for (const protectedPath of [".env", "data", "apps/workspace/public/data"]) {
  assert(dockerignore.split(/\r?\n/).includes(protectedPath), `Docker context must exclude ${protectedPath}`)
}

const serviceWorker = read("apps/workspace/public/sw.js")
assert(serviceWorker.includes('url.pathname.startsWith("/persona-api/")'), "Service Worker must keep Persona API network-only")
assert(serviceWorker.includes('url.pathname.startsWith("/api/")'), "Service Worker must keep Next API routes network-only")
assert(serviceWorker.includes('caches.match("/offline")'), "Service Worker offline navigation fallback is missing")

const manifest = read("apps/workspace/app/manifest.ts")
assert(manifest.includes('start_url: "/calendar"'), "Installed Persona PWA must open the calendar")
assert(manifest.includes('purpose: "maskable"'), "PWA maskable icon is missing")

for (const layout of ["(workspace)", "(modules)", "(ai)"]) {
  assert(read(`apps/workspace/app/${layout}/layout.tsx`).includes("<PwaRegister"), `PWA registration missing from ${layout}`)
}

const backup = read("deploy/nas/backup-sqlite.mjs")
assert(backup.includes("await db.backup"), "SQLite backups must use the consistent backup API")

console.log("deployment contract ok")
