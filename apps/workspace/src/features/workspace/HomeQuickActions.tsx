"use client"

import {
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Database,
  FileText,
  FolderKanban,
  GripVertical,
  ListTodo,
  RotateCcw,
} from "lucide-react"
import { DragEvent, useEffect, useState } from "react"

type QuickActionId = "projects" | "todos" | "calendar" | "memory" | "daily-note"

interface QuickAction {
  id: QuickActionId
  label: string
  href: string
  icon: typeof FolderKanban
}

const QUICK_ACTION_ORDER_KEY = "persona-home-quick-actions"

const defaultActions: QuickAction[] = [
  { id: "projects", label: "项目", href: "#projects", icon: FolderKanban },
  { id: "todos", label: "待办", href: "#todos", icon: ListTodo },
  { id: "calendar", label: "日历", href: "/calendar", icon: CalendarDays },
  { id: "memory", label: "记忆", href: "/ai/memory", icon: Database },
  { id: "daily-note", label: "日记", href: "#daily-note", icon: FileText },
]

export function HomeQuickActions() {
  const [actions, setActions] = useState(defaultActions)
  const [draggingId, setDraggingId] = useState<QuickActionId | null>(null)

  useEffect(() => {
    const storedOrder = readStoredOrder(window.localStorage.getItem(QUICK_ACTION_ORDER_KEY))
    if (storedOrder) setActions(sortByOrder(storedOrder))
  }, [])

  function updateActions(next: QuickAction[]) {
    setActions(next)
    window.localStorage.setItem(QUICK_ACTION_ORDER_KEY, JSON.stringify(next.map((item) => item.id)))
  }

  function moveAction(id: QuickActionId, offset: -1 | 1) {
    const sourceIndex = actions.findIndex((item) => item.id === id)
    const destinationIndex = sourceIndex + offset
    if (sourceIndex < 0 || destinationIndex < 0 || destinationIndex >= actions.length) return
    updateActions(moveItem(actions, sourceIndex, destinationIndex))
  }

  function handleDrop(event: DragEvent<HTMLLIElement>, targetId: QuickActionId) {
    event.preventDefault()
    if (!draggingId || draggingId === targetId) return
    const sourceIndex = actions.findIndex((item) => item.id === draggingId)
    const destinationIndex = actions.findIndex((item) => item.id === targetId)
    if (sourceIndex >= 0 && destinationIndex >= 0) updateActions(moveItem(actions, sourceIndex, destinationIndex))
    setDraggingId(null)
  }

  return (
    <aside className="home-quick-actions" aria-label="快捷访问">
      <header>
        <strong>快捷访问</strong>
        <button type="button" title="恢复默认顺序" aria-label="恢复默认顺序" onClick={() => updateActions(defaultActions)}>
          <RotateCcw size={14} />
        </button>
      </header>
      <ol>
        {actions.map((item, index) => {
          const Icon = item.icon
          return (
            <li
              key={item.id}
              draggable
              className={draggingId === item.id ? "dragging" : ""}
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = "move"
                event.dataTransfer.setData("text/plain", item.id)
                setDraggingId(item.id)
              }}
              onDragEnd={() => setDraggingId(null)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => handleDrop(event, item.id)}
            >
              <span className="home-quick-handle" title="拖动排序" aria-hidden="true"><GripVertical size={15} /></span>
              <a href={item.href}>
                <Icon size={16} />
                <span>{item.label}</span>
              </a>
              <div className="home-quick-move">
                <button type="button" title={`上移${item.label}`} aria-label={`上移${item.label}`} disabled={index === 0} onClick={() => moveAction(item.id, -1)}><ChevronUp size={13} /></button>
                <button type="button" title={`下移${item.label}`} aria-label={`下移${item.label}`} disabled={index === actions.length - 1} onClick={() => moveAction(item.id, 1)}><ChevronDown size={13} /></button>
              </div>
            </li>
          )
        })}
      </ol>
    </aside>
  )
}

function readStoredOrder(value: string | null): QuickActionId[] | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(value) as unknown
    if (!Array.isArray(parsed)) return null
    const ids = parsed.filter((item): item is QuickActionId => typeof item === "string" && defaultActions.some((action) => action.id === item))
    return ids.length === defaultActions.length && new Set(ids).size === defaultActions.length ? ids : null
  } catch {
    return null
  }
}

function sortByOrder(order: QuickActionId[]): QuickAction[] {
  return order.map((id) => defaultActions.find((item) => item.id === id)!).filter(Boolean)
}

function moveItem<T>(items: T[], sourceIndex: number, destinationIndex: number): T[] {
  const next = [...items]
  const [item] = next.splice(sourceIndex, 1)
  next.splice(destinationIndex, 0, item)
  return next
}
