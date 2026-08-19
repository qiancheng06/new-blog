import { spawn } from "child_process"
import { NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const apiPort = Number(process.env.API_PORT || 3001)
const healthUrl = `http://127.0.0.1:${apiPort}/health`
const shutdownUrl = `http://127.0.0.1:${apiPort}/api/runtime/shutdown`

export async function GET(request: NextRequest) {
  if (!isLocalRequest(request)) return NextResponse.json({ error: "local access only" }, { status: 403 })
  return NextResponse.json({ online: await isApiReady() })
}

export async function POST(request: NextRequest) {
  if (!isLocalRequest(request)) return NextResponse.json({ error: "local access only" }, { status: 403 })
  if (await isApiReady()) return NextResponse.json({ online: true, started: false })

  try {
    await startPersonaBackend()
    const online = await waitForApiState(true, 15_000)
    if (!online) {
      return NextResponse.json({ error: "Persona API 未能在 15 秒内启动。", online: false }, { status: 504 })
    }
    return NextResponse.json({ online: true, started: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Persona API 启动失败。"
    return NextResponse.json({ error: message, online: false }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  if (!isLocalRequest(request)) return NextResponse.json({ error: "local access only" }, { status: 403 })
  if (!await isApiReady()) return NextResponse.json({ online: false, stopped: false })

  try {
    const response = await fetch(shutdownUrl, {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(3_000),
    })
    if (!response.ok) {
      const result = await response.json().catch(() => ({})) as { error?: string }
      return NextResponse.json({ error: result.error || "Persona API 拒绝了停止请求。", online: true }, { status: response.status })
    }

    const offline = await waitForApiState(false, 15_000)
    if (!offline) {
      return NextResponse.json({ error: "Persona API 未能在 15 秒内停止。", online: true }, { status: 504 })
    }
    return NextResponse.json({ online: false, stopped: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Persona API 停止失败。"
    return NextResponse.json({ error: message, online: await isApiReady() }, { status: 500 })
  }
}

function isLocalRequest(request: NextRequest): boolean {
  const hostname = request.nextUrl.hostname.toLowerCase()
  return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "[::1]" || hostname === "::1"
}

async function startPersonaBackend(): Promise<void> {
  await new Promise<void>((resolveStart, rejectStart) => {
    const options = {
      detached: true,
      env: process.env,
      stdio: "ignore" as const,
      windowsHide: true,
    }
    const child = process.platform === "win32"
      ? spawn("cmd.exe", ["/d", "/s", "/c", "npm.cmd run dev:backend"], options)
      : spawn("npm", ["run", "dev:backend"], options)
    child.once("error", rejectStart)
    child.once("spawn", () => {
      child.unref()
      resolveStart()
    })
  })
}

async function isApiReady(): Promise<boolean> {
  try {
    const response = await fetch(healthUrl, { cache: "no-store", signal: AbortSignal.timeout(1_500) })
    return response.ok
  } catch {
    return false
  }
}

async function waitForApiState(expectedOnline: boolean, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await isApiReady() === expectedOnline) return true
    await new Promise((resolveWait) => setTimeout(resolveWait, 500))
  }
  return false
}
