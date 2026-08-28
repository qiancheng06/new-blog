import { mkdtempSync, rmSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"

const dataDir = mkdtempSync(join(tmpdir(), "persona-mobile-contract-"))
process.env.PERSONA_DATA_DIR = dataDir
process.env.LLM_PROVIDER = "mock"

const { closeDb, initializeDb } = await import("../../infra/db/pool.js")
const { startApiServer, stopApiServer } = await import("./server.js")
const { createMobilePairingCode } = await import("./mobile.js")

initializeDb()
const port = 3137
const server = startApiServer({ port, hostname: "127.0.0.1" })

try {
  const pairing = createMobilePairingCode()
  const paired = await request<{ deviceId: string; accessToken: string; refreshToken: string }>("/api/mobile/v1/pair", {
    method: "POST", body: { code: pairing.code, name: "contract device", appVersion: "test" }, expected: 201,
  })
  const devices = await request<{ devices: Array<{ id: string }> }>("/api/mobile/devices")
  assert(devices.devices.some((device) => device.id === paired.deviceId), "device management must list paired device")
  await request("/api/mobile/devices/" + paired.deviceId, { method: "PATCH", body: { name: "renamed contract device" } })
  const calendar = await request<{ tags: Array<{ id: string }>; events: Array<{ reminder: { kind: string } }> }>("/api/mobile/v1/calendar", { token: paired.accessToken })
  assert(calendar.tags.length > 0, "mobile calendar must return seeded tags")
  const event = await request<{ event: { id: string; version: number; reminder: { kind: string; minutes?: number } } }>("/api/mobile/v1/calendar/events", {
    method: "POST", token: paired.accessToken, body: { title: "mobile reminder contract", tagId: calendar.tags[0].id, schedule: { kind: "timed", startsAt: "2027-01-02T09:00:00+08:00", endsAt: "2027-01-02T10:00:00+08:00", timeZone: "Asia/Shanghai" }, reminder: { kind: "before", minutes: 15 } }, expected: 201,
  })
  assert(event.event.reminder.kind === "before" && event.event.reminder.minutes === 15, "calendar reminder must round-trip through mobile API")
  const refreshed = await request<{ accessToken: string }>("/api/mobile/v1/token/refresh", { method: "POST", body: { refreshToken: paired.refreshToken } })
  await request("/api/mobile/v1/token/refresh", { method: "POST", body: { refreshToken: paired.refreshToken }, expected: 401 })
  await request("/api/mobile/v1/session/revoke", { method: "POST", token: refreshed.accessToken })
  await request("/api/mobile/v1/calendar", { token: refreshed.accessToken, expected: 401 })
  await request("/api/mobile/devices/" + paired.deviceId, { method: "DELETE", expected: 404 })
  console.log("mobile api contract ok")
} finally {
  await stopApiServer(server)
  closeDb()
  rmSync(dataDir, { recursive: true, force: true })
}

async function request<T = Record<string, unknown>>(path: string, options: { method?: string; body?: unknown; token?: string; expected?: number } = {}): Promise<T> {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, { method: options.method ?? "GET", headers: { "Content-Type": "application/json", ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}) }, body: options.body === undefined ? undefined : JSON.stringify(options.body) })
  const expected = options.expected ?? 200
  if (response.status !== expected) throw new Error(`${path}: expected ${expected}, got ${response.status} ${await response.text()}`)
  return await response.json() as T
}

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message) }
