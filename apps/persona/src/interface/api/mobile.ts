import { createHash, randomBytes, randomUUID } from "crypto"
import type { IncomingMessage, ServerResponse } from "http"
import { createWorkspaceEvent } from "../../domain/event/types.js"
import { handleConversationEvent } from "../../application/conversation.js"
import {
  CalendarConflictError, CalendarNotFoundError, CalendarValidationError,
  createCalendarEvent, deleteCalendarEvent, getCalendar, updateCalendarEvent,
  type CalendarEventInput, type CalendarEventPatch,
} from "../../application/calendar.js"
import { CaptureNotFoundError, CaptureValidationError, createCapture, getCaptures } from "../../application/captures.js"
import { query, queryOne, run, withTransaction } from "../../infra/db/pool.js"

const ACCESS_TTL_MS = 15 * 60 * 1000
const REFRESH_TTL_MS = 90 * 24 * 60 * 60 * 1000
const PAIRING_TTL_MS = 5 * 60 * 1000
const attempts = new Map<string, { count: number; resetAt: number }>()

type Json = Record<string, unknown>
type Auth = { deviceId: string }

export class MobileDeviceValidationError extends Error {}
export class MobileDeviceNotFoundError extends Error {}

function hash(value: string): string { return createHash("sha256").update(value).digest("hex") }
function iso(ms: number): string { return new Date(ms).toISOString() }
function token(bytes = 32): string { return randomBytes(bytes).toString("base64url") }
function body(req: IncomingMessage): Promise<Json> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on("data", (chunk: Buffer) => { size += chunk.length; if (size <= 64 * 1024) chunks.push(chunk) })
    req.on("end", () => { if (size > 64 * 1024) return reject(new Error("request body too large")); try { resolve(JSON.parse(Buffer.concat(chunks).toString() || "{}")) } catch { reject(new Error("invalid JSON")) } })
    req.on("error", reject)
  })
}
function send(res: ServerResponse, status: number, value: unknown): true { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(value)); return true }
function string(value: unknown, fallback = ""): string { return typeof value === "string" ? value.trim() : fallback }
function rateLimit(req: IncomingMessage): boolean {
  const key = req.socket.remoteAddress || "unknown"
  const now = Date.now(); const current = attempts.get(key)
  if (!current || current.resetAt <= now) { attempts.set(key, { count: 1, resetAt: now + PAIRING_TTL_MS }); return true }
  if (current.count >= 10) return false
  current.count += 1; return true
}

export function createMobilePairingCode(): { code: string; expiresAt: string } {
  const code = token(9).replace(/[-_]/g, "").slice(0, 12).toUpperCase()
  const expiresAt = iso(Date.now() + PAIRING_TTL_MS)
  run("INSERT INTO mobile_pairing_codes (id, code_hash, expires_at) VALUES (?, ?, ?)", [randomUUID(), hash(code), expiresAt])
  return { code, expiresAt }
}

export function listMobileDevices(): Array<Record<string, unknown>> {
  return query("SELECT id, name, platform, app_version AS appVersion, created_at AS createdAt, last_seen_at AS lastSeenAt, revoked_at AS revokedAt FROM mobile_devices ORDER BY created_at DESC")
}

export function renameMobileDevice(id: string, name: string): Record<string, unknown> {
  const value = string(name).slice(0, 80)
  if (!value) throw new MobileDeviceValidationError("device name is required")
  const result = run("UPDATE mobile_devices SET name = ? WHERE id = ? AND revoked_at IS NULL", [value, id])
  if (result.changes !== 1) throw new MobileDeviceNotFoundError("device not found")
  return queryOne("SELECT id, name, platform, app_version AS appVersion, created_at AS createdAt, last_seen_at AS lastSeenAt, revoked_at AS revokedAt FROM mobile_devices WHERE id = ?", [id]) as Record<string, unknown>
}

export function revokeMobileDevice(id: string): { revoked: true; id: string } {
  const result = run("UPDATE mobile_devices SET revoked_at = datetime('now') WHERE id = ? AND revoked_at IS NULL", [id])
  if (result.changes !== 1) throw new MobileDeviceNotFoundError("device not found")
  run("DELETE FROM mobile_access_tokens WHERE device_id = ?", [id])
  run("UPDATE mobile_refresh_tokens SET revoked_at = datetime('now') WHERE device_id = ?", [id])
  return { revoked: true, id }
}

function issueTokens(deviceId: string): { accessToken: string; accessExpiresAt: string; refreshToken: string; refreshExpiresAt: string } {
  const accessToken = token(); const refreshToken = token()
  const accessExpiresAt = iso(Date.now() + ACCESS_TTL_MS); const refreshExpiresAt = iso(Date.now() + REFRESH_TTL_MS)
  run("INSERT INTO mobile_access_tokens (token_hash, device_id, expires_at) VALUES (?, ?, ?)", [hash(accessToken), deviceId, accessExpiresAt])
  run("INSERT INTO mobile_refresh_tokens (id, device_id, token_hash, expires_at) VALUES (?, ?, ?, ?)", [randomUUID(), deviceId, hash(refreshToken), refreshExpiresAt])
  run("UPDATE mobile_devices SET last_seen_at = datetime('now') WHERE id = ?", [deviceId])
  return { accessToken, accessExpiresAt, refreshToken, refreshExpiresAt }
}

function auth(req: IncomingMessage): Auth | null {
  const value = req.headers.authorization || ""
  if (!value.startsWith("Bearer ")) return null
  const row = queryOne<{ device_id: string }>(
    `SELECT a.device_id FROM mobile_access_tokens a JOIN mobile_devices d ON d.id = a.device_id
     WHERE a.token_hash = ? AND a.expires_at > datetime('now') AND d.revoked_at IS NULL`, [hash(value.slice(7).trim())],
  )
  if (!row) return null
  run("UPDATE mobile_devices SET last_seen_at = datetime('now') WHERE id = ?", [row.device_id])
  return { deviceId: row.device_id }
}

export async function handleMobileApi(req: IncomingMessage, res: ServerResponse, path: string, url: URL): Promise<boolean> {
  if (!path.startsWith("/api/mobile/v1/")) return false
  try {
    if (path === "/api/mobile/v1/pair" && req.method === "POST") {
      if (!rateLimit(req)) return send(res, 429, { error: "too many pairing attempts" }) as never
      const input = await body(req); const code = string(input.code).toUpperCase()
      if (!code || code.length < 8) return send(res, 400, { error: "code is required" }) as never
      const pairing = queryOne<{ id: string }>("SELECT id FROM mobile_pairing_codes WHERE code_hash = ? AND used_at IS NULL AND expires_at > datetime('now')", [hash(code)])
      if (!pairing) return send(res, 401, { error: "pairing code is invalid or expired" }) as never
      const deviceId = randomUUID(); const name = string(input.name, "Android device").slice(0, 80)
      const issued = withTransaction(() => {
        const claimed = run("UPDATE mobile_pairing_codes SET used_at = datetime('now') WHERE id = ? AND used_at IS NULL AND expires_at > datetime('now')", [pairing.id])
        if (claimed.changes !== 1) throw new Error("pairing code is invalid or expired")
        run("INSERT INTO mobile_devices (id, name, platform, app_version) VALUES (?, ?, 'android', ?)", [deviceId, name, string(input.appVersion).slice(0, 40)])
        return issueTokens(deviceId)
      })
      return send(res, 201, { deviceId, ...issued }) as never
    }
    if (path === "/api/mobile/v1/token/refresh" && req.method === "POST") {
      const input = await body(req); const refresh = string(input.refreshToken)
      const row = queryOne<{ id: string; device_id: string }>(`SELECT r.id, r.device_id FROM mobile_refresh_tokens r JOIN mobile_devices d ON d.id = r.device_id WHERE r.token_hash = ? AND r.rotated_at IS NULL AND r.revoked_at IS NULL AND r.expires_at > datetime('now') AND d.revoked_at IS NULL`, [hash(refresh)])
      if (!row) return send(res, 401, { error: "refresh token is invalid or expired" }) as never
      const issued = withTransaction(() => {
        const rotated = run("UPDATE mobile_refresh_tokens SET rotated_at = datetime('now') WHERE id = ? AND rotated_at IS NULL", [row.id])
        if (rotated.changes !== 1) throw new Error("refresh token is invalid or expired")
        return issueTokens(row.device_id)
      })
      return send(res, 200, { deviceId: row.device_id, ...issued }) as never
    }
    const identity = auth(req)
    if (!identity) return send(res, 401, { error: "valid mobile bearer token is required" }) as never
    if (path === "/api/mobile/v1/session/revoke" && req.method === "POST") { run("UPDATE mobile_devices SET revoked_at = datetime('now') WHERE id = ?", [identity.deviceId]); run("DELETE FROM mobile_access_tokens WHERE device_id = ?", [identity.deviceId]); run("UPDATE mobile_refresh_tokens SET revoked_at = datetime('now') WHERE device_id = ?", [identity.deviceId]); return send(res, 200, { revoked: true }) as never }
    if (path === "/api/mobile/v1/bootstrap" && req.method === "GET") { const from = string(url.searchParams.get("from"), new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)); const to = string(url.searchParams.get("to"), new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10)); return send(res, 200, { deviceId: identity.deviceId, calendar: getCalendar({ from, to }), captures: getCaptures({ limit: 20 }) }) as never }
    if (path === "/api/mobile/v1/calendar" && req.method === "GET") {
      const from = string(url.searchParams.get("from"), new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10))
      const to = string(url.searchParams.get("to"), new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10))
      return send(res, 200, getCalendar({ from, to })) as never
    }
    if (path === "/api/mobile/v1/calendar/events" && req.method === "POST") { return send(res, 201, { event: createCalendarEvent(await body(req) as unknown as CalendarEventInput) }) as never }
    const event = /^\/api\/mobile\/v1\/calendar\/events\/([^/]+)$/.exec(path)
    if (event && req.method === "PATCH") return send(res, 200, { event: updateCalendarEvent(decodeURIComponent(event[1]), await body(req) as unknown as CalendarEventPatch) }) as never
    if (event && req.method === "DELETE") { const input = await body(req); return send(res, 200, deleteCalendarEvent(decodeURIComponent(event[1]), Number(input.version), string(input.scope, "single") as never)) as never }
    if (path === "/api/mobile/v1/chat" && req.method === "POST") { const input = await body(req); const text = string(input.text); if (!text) return send(res, 400, { error: "text is required" }) as never; const result = await handleConversationEvent(createWorkspaceEvent({ text, page: "android" }, { requestId: string(input.requestId) || undefined }), {}); return send(res, 200, { reply: result.companionReply, eventId: result.event.id }) as never }
    if (path === "/api/mobile/v1/captures" && req.method === "GET") return send(res, 200, getCaptures({ limit: Number(url.searchParams.get("limit")) || 20, offset: Number(url.searchParams.get("offset")) || 0 })) as never
    if (path === "/api/mobile/v1/captures" && req.method === "POST") { const input = await body(req); return send(res, 201, await createCapture({ type: input.type, text: input.text, requestId: string(input.requestId) || undefined })) as never }
    return send(res, 404, { error: "mobile route not found" }) as never
  } catch (error) {
    if (error instanceof CalendarValidationError || error instanceof CaptureValidationError) return send(res, 400, { error: error.message }) as never
    if (error instanceof CalendarNotFoundError || error instanceof CaptureNotFoundError) return send(res, 404, { error: error.message }) as never
    if (error instanceof CalendarConflictError) return send(res, 409, { error: error.message }) as never
    console.error("[mobile api]", error instanceof Error ? error.message : error)
    return send(res, 500, { error: "mobile request failed" }) as never
  }
}
