import { spawn, spawnSync, type ChildProcess } from "child_process"
import http from "http"

interface Service {
  name: string
  command: string
  readyUrl: string
  optional?: boolean
}

const services: Service[] = [
  {
    name: "Persona API",
    command: "npm.cmd run dev:backend",
    readyUrl: "http://127.0.0.1:3001/api/status",
  },
  {
    name: "Workspace dev server",
    command: "npm.cmd run dev",
    readyUrl: "http://127.0.0.1:5173/",
  },
  {
    name: "Blog dev server",
    command: "npm.cmd run dev:blog",
    readyUrl: "http://127.0.0.1:5175/",
  },
]

const children: ChildProcess[] = []

for (const service of services) {
  if (await isReady(service.readyUrl)) {
    console.log(`${service.name} already ready at ${service.readyUrl}`)
    continue
  }

  console.log(`starting ${service.name}: ${service.command}`)
  const child = spawn(service.command, {
    cwd: process.cwd(),
    shell: true,
    stdio: "inherit",
  })

  children.push(child)

  child.on("exit", (code) => {
    if (code && code !== 0) {
      console.error(`${service.name} exited with code ${code}`)
    }
  })
}

try {
  for (const service of services) {
    await waitForReady(service)
  }

  console.log("")
  console.log("local demo ready")
  console.log("- Workspace: http://127.0.0.1:5173/")
  console.log("- Blog: http://127.0.0.1:5175/")
  console.log("- Persona API: http://127.0.0.1:3001/api/status")
  console.log("")
  console.log("Press Ctrl+C to stop services started by this command.")
} catch (err) {
  console.error(err instanceof Error ? err.message : err)
  shutdown(1)
}

process.on("SIGINT", () => shutdown(0))
process.on("SIGTERM", () => shutdown(0))

if (children.length > 0) {
  await new Promise<void>(() => {
    // Keep the parent process alive while child services run.
  })
}

async function waitForReady(service: Service): Promise<void> {
  const deadline = Date.now() + 45_000

  while (Date.now() < deadline) {
    if (await isReady(service.readyUrl)) return
    await delay(1_000)
  }

  throw new Error(`${service.name} did not become ready at ${service.readyUrl}`)
}

function isReady(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      res.resume()
      resolve(Boolean(res.statusCode && res.statusCode >= 200 && res.statusCode < 300))
    })

    req.on("error", () => resolve(false))
    req.setTimeout(1_000, () => {
      req.destroy()
      resolve(false)
    })
  })
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function shutdown(code: number): never {
  for (const child of children) {
    if (child.killed) continue
    if (process.platform === "win32" && child.pid) {
      spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore" })
    } else {
      child.kill()
    }
  }
  process.exit(code)
}
