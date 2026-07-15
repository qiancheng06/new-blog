export const PERSONA_API_BASE =
  process.env.NEXT_PUBLIC_PERSONA_API_BASE?.replace(/\/$/, "") || "http://127.0.0.1:3001"

export class PersonaApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message)
  }
}

export function personaUrl(path: string): string {
  return `${PERSONA_API_BASE}${path.startsWith("/") ? path : `/${path}`}`
}

export async function getPersonaJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(personaUrl(path), {
    ...init,
    cache: init?.cache ?? "no-store",
    headers: {
      Accept: "application/json",
      ...init?.headers,
    },
  })

  if (!response.ok) throw new PersonaApiError(`Persona API request failed: ${path}`, response.status)
  return (await response.json()) as T
}

export async function postPersonaJson<T>(path: string, body: unknown, init?: RequestInit): Promise<T> {
  const response = await fetch(personaUrl(path), {
    method: "POST",
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...init?.headers,
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) throw new PersonaApiError(`Persona API request failed: ${path}`, response.status)
  return (await response.json()) as T
}
