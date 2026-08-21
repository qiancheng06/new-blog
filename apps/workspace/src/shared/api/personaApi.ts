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
  return requestPersonaJson<T>(path, {
    ...init,
    cache: init?.cache ?? "no-store",
    headers: {
      Accept: "application/json",
      ...init?.headers,
    },
  })
}

export async function postPersonaJson<T>(path: string, body: unknown, init?: RequestInit): Promise<T> {
  return sendPersonaJson<T>("POST", path, body, init)
}

export async function patchPersonaJson<T>(path: string, body: unknown, init?: RequestInit): Promise<T> {
  return sendPersonaJson<T>("PATCH", path, body, init)
}

export async function deletePersonaJson<T>(path: string, body: unknown, init?: RequestInit): Promise<T> {
  return sendPersonaJson<T>("DELETE", path, body, init)
}

async function sendPersonaJson<T>(
  method: "POST" | "PATCH" | "DELETE",
  path: string,
  body: unknown,
  init?: RequestInit,
): Promise<T> {
  return requestPersonaJson<T>(path, {
    ...init,
    method,
    body: JSON.stringify(body),
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...init?.headers,
    },
  })
}

async function requestPersonaJson<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(personaUrl(path), {
    ...init,
  })

  if (!response.ok) {
    let detail = ""
    try {
      const error = await response.json() as { error?: unknown }
      if (typeof error.error === "string") detail = error.error
    } catch {
      // Keep the transport-level error when the response is not JSON.
    }
    throw new PersonaApiError(detail || `Persona API request failed: ${path}`, response.status)
  }
  return (await response.json()) as T
}
