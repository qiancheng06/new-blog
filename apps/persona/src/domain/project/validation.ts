export const MAX_PROJECT_NAME_LENGTH = 200
export const MAX_PROJECT_SUMMARY_LENGTH = 4_000
export const MAX_PROJECT_TOPICS = 20
export const MAX_PROJECT_TOPIC_LENGTH = 100

export class ProjectValueError extends Error {}

export function normalizeProjectName(value: string): string {
  const normalized = value.trim().replace(/\s+/g, " ")
  if (!normalized) throw new ProjectValueError("project name is required")
  if (normalized.length > MAX_PROJECT_NAME_LENGTH) throw new ProjectValueError("project name is too long")
  return normalized
}

export function normalizeProjectSummary(value: string | null | undefined): string {
  const normalized = value?.trim() ?? ""
  if (normalized.length > MAX_PROJECT_SUMMARY_LENGTH) throw new ProjectValueError("project summary is too long")
  return normalized
}

export function normalizeProjectTopics(value: unknown): string[] {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) throw new ProjectValueError("project topics must be an array")
  if (value.length > MAX_PROJECT_TOPICS) throw new ProjectValueError("project has too many topics")

  const topics: string[] = []
  const seen = new Set<string>()
  for (const item of value) {
    if (typeof item !== "string") throw new ProjectValueError("project topics must contain strings")
    const topic = item.trim().replace(/\s+/g, " ")
    if (!topic) throw new ProjectValueError("project topic is required")
    if (topic.length > MAX_PROJECT_TOPIC_LENGTH) throw new ProjectValueError("project topic is too long")
    const key = topic.toLowerCase()
    if (!seen.has(key)) {
      seen.add(key)
      topics.push(topic)
    }
  }
  return topics
}
