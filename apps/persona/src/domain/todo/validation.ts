export const MAX_TODO_TITLE_LENGTH = 500

export class TodoValueError extends Error {}

export function normalizeTodoTitle(value: string): string {
  const normalized = value.trim().replace(/\s+/g, " ")
  if (!normalized) throw new TodoValueError("todo title is required")
  if (normalized.length > MAX_TODO_TITLE_LENGTH) throw new TodoValueError("todo title is too long")
  return normalized
}

export function normalizeTodoDueDate(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? ""
  if (!normalized) return null
  if (!isTodoDueDate(normalized)) throw new TodoValueError("todo due date is invalid")
  return normalized
}

export function isTodoDueDate(value: string): boolean {
  if (!/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}
