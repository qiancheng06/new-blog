export const PERSONA_API_BASE =
  (import.meta.env.VITE_PERSONA_API_BASE as string | undefined)?.replace(/\/$/, "") ||
  "http://127.0.0.1:3001"

export function personaUrl(path: string): string {
  return `${PERSONA_API_BASE}${path.startsWith("/") ? path : `/${path}`}`
}

export async function getPersonaJson<T>(path: string, timeoutMs = 5000): Promise<T> {
  const response = await fetch(personaUrl(path), {
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!response.ok) throw new Error(`${path} failed: ${response.status}`)
  return await response.json() as T
}

export async function postPersonaJson<T>(path: string, data: unknown, timeoutMs = 5000): Promise<T> {
  const response = await fetch(personaUrl(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!response.ok) throw new Error(`${path} failed: ${response.status}`)
  return await response.json() as T
}
