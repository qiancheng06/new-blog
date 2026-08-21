export const MAX_WORKING_TOPICS = 12
export const MAX_WORKING_QUESTIONS = 10
export const MAX_WORKING_TOPIC_LENGTH = 100
export const MAX_WORKING_QUESTION_LENGTH = 500

export class WorkingStateValueError extends Error {}

export function normalizeWorkingTopics(value: unknown): string[] {
  return normalizeStringList(value, {
    field: "active topics",
    maxItems: MAX_WORKING_TOPICS,
    maxLength: MAX_WORKING_TOPIC_LENGTH,
  })
}

export function normalizeWorkingQuestions(value: unknown): string[] {
  return normalizeStringList(value, {
    field: "current questions",
    maxItems: MAX_WORKING_QUESTIONS,
    maxLength: MAX_WORKING_QUESTION_LENGTH,
  })
}

function normalizeStringList(
  value: unknown,
  options: { field: string; maxItems: number; maxLength: number },
): string[] {
  if (!Array.isArray(value)) throw new WorkingStateValueError(`${options.field} must be an array`)
  if (value.length > options.maxItems) throw new WorkingStateValueError(`${options.field} has too many items`)

  const items: string[] = []
  const seen = new Set<string>()
  for (const valueItem of value) {
    if (typeof valueItem !== "string") {
      throw new WorkingStateValueError(`${options.field} must contain strings`)
    }
    const item = valueItem.trim().replace(/\s+/g, " ")
    if (!item) throw new WorkingStateValueError(`${options.field} contains an empty item`)
    if (item.length > options.maxLength) {
      throw new WorkingStateValueError(`${options.field} item is too long`)
    }
    const key = item.toLowerCase()
    if (!seen.has(key)) {
      seen.add(key)
      items.push(item)
    }
  }
  return items
}
