"use client"

import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock3,
  LoaderCircle,
  Pencil,
  Plus,
  Search,
  Tags,
  Trash2,
  X,
} from "lucide-react"
import { useEffect, useMemo, useState, type FormEvent } from "react"
import { PersonaApiError } from "@/shared/api/personaApi"
import { getWorkspaceTodos, type WorkspaceTodo } from "@/shared/data/workspaceData"
import {
  createServerCalendarEvent,
  createServerCalendarEvents,
  createServerCalendarTag,
  deleteServerCalendarEvent,
  deleteServerCalendarTag,
  getCalendarRange,
  updateServerCalendarEvent,
  updateServerCalendarTag,
  type CalendarApiEvent,
  type CalendarApiSchedule,
  type CalendarDeleteScope,
  type CalendarTone,
} from "./calendarApi"

type CalendarView = "month" | "week" | "day"

interface CalendarTag {
  id: string
  label: string
  tone: CalendarTone
  sortOrder: number
  version: number
}

interface CalendarEvent {
  id: string
  title: string
  start: string
  end: string
  allDay: boolean
  tagId: string
  notes: string
  source: "local" | "todo"
  completed?: boolean
  version: number
  seriesId: string | null
}

interface EventDraft {
  title: string
  date: string
  endDate: string
  startTime: string
  endTime: string
  allDay: boolean
  tagId: string
  notes: string
  repeatMode: "none" | "weekly"
  repeatWeekdays: number[]
  repeatUntil: string
}

const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"]
const HOURS = Array.from({ length: 15 }, (_, index) => index + 7)
const VIEW_OPTIONS: Array<{ value: CalendarView; label: string }> = [
  { value: "month", label: "月" },
  { value: "week", label: "周" },
  { value: "day", label: "日" },
]
const DEFAULT_TAGS: CalendarTag[] = [
  { id: "focus", label: "专注", tone: "green", sortOrder: 10, version: 1 },
  { id: "meeting", label: "会议", tone: "blue", sortOrder: 20, version: 1 },
  { id: "personal", label: "个人", tone: "amber", sortOrder: 30, version: 1 },
  { id: "reminder", label: "提醒", tone: "red", sortOrder: 40, version: 1 },
]
const TODO_TAG: CalendarTag = { id: "todo", label: "同步待办", tone: "gray", sortOrder: 1_000_000, version: 0 }
const TAG_TONES: CalendarTone[] = ["green", "blue", "amber", "red", "gray"]

export function CalendarWorkspace() {
  const today = useMemo(() => startOfDay(new Date()), [])
  const [cursor, setCursor] = useState(today)
  const [selectedDate, setSelectedDate] = useState(today)
  const [view, setView] = useState<CalendarView>("month")
  const [localEvents, setLocalEvents] = useState<CalendarEvent[]>([])
  const [tags, setTags] = useState<CalendarTag[]>(DEFAULT_TAGS)
  const [todos, setTodos] = useState<WorkspaceTodo[]>([])
  const [dataReady, setDataReady] = useState(false)
  const [todoError, setTodoError] = useState("")
  const [calendarError, setCalendarError] = useState("")
  const [apiOnline, setApiOnline] = useState(false)
  const [saving, setSaving] = useState(false)
  const [query, setQuery] = useState("")
  const [hiddenTagIds, setHiddenTagIds] = useState<Set<string>>(() => new Set())
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null)
  const [draft, setDraft] = useState<EventDraft>(() => createDraft(today))
  const [formError, setFormError] = useState("")

  const range = useMemo(() => calendarRange(cursor, view), [cursor, view])

  useEffect(() => {
    let active = true
    setDataReady(false)
    void getCalendarRange(range.from, range.to)
      .then((result) => {
        if (!active) return
        setLocalEvents(result.events.map(calendarEventFromApi))
        setTags(result.tags)
        setApiOnline(true)
        setCalendarError("")
      })
      .catch(() => {
        if (!active) return
        setApiOnline(false)
        setCalendarError("Persona API 暂不可用，当前缓存仍可查看，写入已暂停。")
      })
      .finally(() => { if (active) setDataReady(true) })
    return () => { active = false }
  }, [range.from, range.to])

  useEffect(() => {
    void getWorkspaceTodos().then(setTodos).catch(() => setTodoError("同步待办暂不可用，服务端日程仍可正常使用。"))
  }, [])

  useEffect(() => {
    if (!dialogOpen) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeDialog()
    }
    window.addEventListener("keydown", closeOnEscape)
    return () => window.removeEventListener("keydown", closeOnEscape)
  }, [dialogOpen])

  const todoEvents = useMemo(() => todosToEvents(todos), [todos])
  const allEvents = useMemo(() => [...localEvents, ...todoEvents].sort(compareEvents), [localEvents, todoEvents])
  const normalizedQuery = query.trim().toLowerCase()
  const visibleEvents = useMemo(
    () => allEvents.filter((event) => !hiddenTagIds.has(event.tagId)
      && (!normalizedQuery || `${event.title} ${event.notes}`.toLowerCase().includes(normalizedQuery))),
    [allEvents, hiddenTagIds, normalizedQuery],
  )
  const selectedEvents = useMemo(
    () => visibleEvents.filter((event) => eventDateKey(event) === dateKey(selectedDate)),
    [selectedDate, visibleEvents],
  )
  const monthCount = useMemo(() => allEvents.filter((event) => event.start.startsWith(monthKey(cursor))).length, [allEvents, cursor])

  async function refreshCalendar(): Promise<void> {
    const result = await getCalendarRange(range.from, range.to)
    setLocalEvents(result.events.map(calendarEventFromApi))
    setTags(result.tags)
    setApiOnline(true)
    setCalendarError("")
  }

  function moveCursor(offset: number) {
    const next = view === "month"
      ? new Date(cursor.getFullYear(), cursor.getMonth() + offset, 1)
      : addDays(cursor, offset * (view === "week" ? 7 : 1))
    setCursor(next)
    setSelectedDate(next)
  }

  function jumpToday() {
    setCursor(today)
    setSelectedDate(today)
  }

  function chooseDate(date: Date) {
    const next = startOfDay(date)
    setSelectedDate(next)
    if (view === "month" && (next.getMonth() !== cursor.getMonth() || next.getFullYear() !== cursor.getFullYear())) {
      setCursor(new Date(next.getFullYear(), next.getMonth(), 1))
    }
  }

  function selectDateFromCalendar(date: Date) {
    const next = startOfDay(date)
    setSelectedDate(next)
  }

  function openCreate(date = selectedDate, hour = 9) {
    if (!apiOnline) {
      setCalendarError("连接 Persona API 后才能新建日程。")
      return
    }
    const nextDate = startOfDay(date)
    setSelectedDate(nextDate)
    setEditingEvent(null)
    setDraft(createDraft(nextDate, hour, tags[0]?.id ?? DEFAULT_TAGS[0].id))
    setFormError("")
    setDialogOpen(true)
  }

  function openEvent(event: CalendarEvent) {
    setEditingEvent(event)
    setSelectedDate(parseLocalDate(event.start))
    setDraft(draftFromEvent(event, tags[0]?.id ?? DEFAULT_TAGS[0].id))
    setFormError("")
    setDialogOpen(true)
  }

  function closeDialog() {
    setDialogOpen(false)
    setEditingEvent(null)
    setFormError("")
  }

  async function saveEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const title = draft.title.trim()
    if (!title) return setFormError("请填写日程标题。")
    if (draft.endDate < draft.date) return setFormError("结束日期不能早于开始日期。")
    if (!draft.allDay && draft.endDate === draft.date && draft.endTime <= draft.startTime) return setFormError("结束时间需要晚于开始时间。")

    if (draft.repeatMode === "weekly" && draft.repeatWeekdays.length === 0) return setFormError("请至少选择一个重复星期。")
    if (draft.repeatMode === "weekly" && draft.repeatUntil < draft.date) return setFormError("重复截止日期不能早于开始日期。")
    const dates = editingEvent ? [draft.date] : repeatDates(draft)
    if (dates.length === 0) return setFormError("当前规则没有可创建的日期。")
    if (dates.length > 104) return setFormError("单次最多批量创建 104 个日程，请缩短截止日期。")

    const baseValue = {
      title,
      tagId: tags.some((tag) => tag.id === draft.tagId) ? draft.tagId : tags[0]?.id ?? DEFAULT_TAGS[0].id,
      notes: draft.notes.trim(),
      completed: editingEvent?.completed ?? false,
    }
    const values = dates.map((date) => ({ ...baseValue, schedule: scheduleFromDraft(draft, date) }))
    setSaving(true)
    try {
      const saved = editingEvent?.source === "local"
        ? [await updateServerCalendarEvent(editingEvent.id, editingEvent.version, values[0])]
        : draft.repeatMode === "weekly"
          ? await createServerCalendarEvents(values)
          : [await createServerCalendarEvent(values[0])]
      const nextEvents = saved.map(calendarEventFromApi)
      const nextIds = new Set(nextEvents.map((item) => item.id))
      setLocalEvents((current) => {
        const without = current.filter((item) => !nextIds.has(item.id))
        return [...without, ...nextEvents].sort(compareEvents)
      })
      const savedDate = parseLocalDate(nextEvents[0].start)
      setSelectedDate(savedDate)
      setCursor(savedDate)
      setCalendarError("")
      closeDialog()
    } catch (error) {
      if (error instanceof PersonaApiError && error.status === 409) {
        await refreshCalendar().catch(() => undefined)
        setFormError("该日程已在另一设备更新，已刷新最新数据，请重新修改。")
      } else {
        setApiOnline(false)
        setFormError("保存失败，请确认 Persona API 正在运行。")
      }
    } finally {
      setSaving(false)
    }
  }

  async function deleteEvent(scope: CalendarDeleteScope = "single") {
    if (!editingEvent || editingEvent.source !== "local") return
    setSaving(true)
    try {
      const result = await deleteServerCalendarEvent(editingEvent.id, editingEvent.version, scope)
      const deletedIds = new Set(result.deletedIds)
      setLocalEvents((current) => current.filter((item) => !deletedIds.has(item.id)))
      closeDialog()
    } catch (error) {
      if (error instanceof PersonaApiError && error.status === 409) {
        await refreshCalendar().catch(() => undefined)
        setFormError("该日程已在另一设备更新，已刷新最新数据。")
      } else {
        setApiOnline(false)
        setFormError("删除失败，请确认 Persona API 正在运行。")
      }
    } finally {
      setSaving(false)
    }
  }

  function toggleTag(tagId: string) {
    setHiddenTagIds((current) => {
      const next = new Set(current)
      if (next.has(tagId)) next.delete(tagId)
      else next.add(tagId)
      return next
    })
  }

  async function addTag(label: string, tone: CalendarTone) {
    const normalized = label.trim()
    if (!normalized || tags.some((tag) => tag.label === normalized)) return false
    try {
      const tag = await createServerCalendarTag(normalized.slice(0, 16), tone)
      setTags((current) => [...current, tag].sort((left, right) => left.sortOrder - right.sortOrder))
      return true
    } catch {
      setApiOnline(false)
      setCalendarError("标签保存失败，请确认 Persona API 正在运行。")
      return false
    }
  }

  async function updateTag(id: string, label: string, tone: CalendarTone) {
    const normalized = label.trim()
    if (!normalized || tags.some((tag) => tag.id !== id && tag.label === normalized)) return false
    const currentTag = tags.find((tag) => tag.id === id)
    if (!currentTag) return false
    try {
      const updated = await updateServerCalendarTag(id, currentTag.version, normalized.slice(0, 16), tone)
      setTags((current) => current.map((tag) => tag.id === id ? updated : tag))
      return true
    } catch (error) {
      if (error instanceof PersonaApiError && error.status === 409) await refreshCalendar().catch(() => undefined)
      else setApiOnline(false)
      setCalendarError("标签已变化或保存失败，请重试。")
      return false
    }
  }

  async function deleteTag(id: string) {
    if (tags.length <= 1) return false
    const fallback = tags.find((tag) => tag.id !== id)
    if (!fallback) return false
    const affected = localEvents.filter((event) => event.tagId === id).length
    if (affected > 0 && !window.confirm(`删除后，${affected} 个日程将移动到“${fallback.label}”。是否继续？`)) return false
    const currentTag = tags.find((tag) => tag.id === id)
    if (!currentTag) return false
    try {
      await deleteServerCalendarTag(id, currentTag.version, fallback.id)
      setLocalEvents((current) => current.map((event) => event.tagId === id ? { ...event, tagId: fallback.id, version: event.version + 1 } : event))
      setTags((current) => current.filter((tag) => tag.id !== id))
      setHiddenTagIds((current) => {
        const next = new Set(current)
        next.delete(id)
        return next
      })
      return true
    } catch (error) {
      if (error instanceof PersonaApiError && error.status === 409) await refreshCalendar().catch(() => undefined)
      else setApiOnline(false)
      setCalendarError("标签删除失败，已保留现有数据。")
      return false
    }
  }

  return (
    <main className="calendar-page">
      <header className="calendar-page-header">
        <div>
          <span className="module-kicker"><CalendarDays size={14} />日历</span>
          <h1>日程安排</h1>
        </div>
        <button className="calendar-primary-action" type="button" disabled={!apiOnline} onClick={() => openCreate()}><Plus size={16} />新建日程</button>
      </header>

      <div className="calendar-toolbar">
        <div className="calendar-navigation">
          <button type="button" title="上一时段" aria-label="上一时段" onClick={() => moveCursor(-1)}><ChevronLeft size={17} /></button>
          <button className="calendar-today-button" type="button" onClick={jumpToday}>今天</button>
          <button type="button" title="下一时段" aria-label="下一时段" onClick={() => moveCursor(1)}><ChevronRight size={17} /></button>
          <strong>{formatCursorTitle(cursor, view)}</strong>
        </div>
        <label className="calendar-search">
          <Search size={15} />
          <input value={query} placeholder="搜索日程" aria-label="搜索日程" onChange={(event) => setQuery(event.target.value)} />
          {query ? <button type="button" title="清空搜索" aria-label="清空搜索" onClick={() => setQuery("")}><X size={14} /></button> : null}
        </label>
        <div className="calendar-view-switch" role="group" aria-label="日历视图">
          {VIEW_OPTIONS.map((option) => (
            <button key={option.value} type="button" className={view === option.value ? "active" : ""} aria-pressed={view === option.value} onClick={() => setView(option.value)}>{option.label}</button>
          ))}
        </div>
      </div>

      <div className="calendar-workspace">
        <section className="calendar-surface" aria-label={`${formatCursorTitle(cursor, view)}日历`}>
          {!dataReady ? <div className="calendar-loading"><LoaderCircle className="spinning" size={18} />正在载入日历</div> : null}
          {dataReady && view === "month" ? (
            <MonthView
              cursor={cursor}
              selectedDate={selectedDate}
              today={today}
              events={visibleEvents}
              tags={tags}
              onSelectDate={selectDateFromCalendar}
              onOpenEvent={openEvent}
            />
          ) : null}
          {dataReady && view === "week" ? (
            <TimeView dates={weekDates(cursor)} today={today} events={visibleEvents} tags={tags} onSelect={chooseDate} onSelectDate={selectDateFromCalendar} onCreate={openCreate} onOpenEvent={openEvent} />
          ) : null}
          {dataReady && view === "day" ? (
            <TimeView dates={[startOfDay(cursor)]} today={today} events={visibleEvents} tags={tags} onSelect={chooseDate} onSelectDate={selectDateFromCalendar} onCreate={openCreate} onOpenEvent={openEvent} />
          ) : null}
        </section>

        <aside className="calendar-inspector">
          <section className="calendar-inspector-section calendar-agenda">
            <header>
              <div><span>{selectedDate.toLocaleDateString("zh-CN", { weekday: "long" })}</span><strong>{selectedDate.toLocaleDateString("zh-CN", { month: "long", day: "numeric" })}</strong></div>
              <button type="button" title="在选中日期新建" aria-label="在选中日期新建" disabled={!apiOnline} onClick={() => openCreate(selectedDate)}><Plus size={15} /></button>
            </header>
            <div className="calendar-agenda-list">
              {selectedEvents.length === 0 ? <p>这一天还没有日程</p> : selectedEvents.map((event) => <AgendaItem key={event.id} event={event} tags={tags} onOpen={openEvent} />)}
            </div>
          </section>

          <TagManager
            tags={tags}
            events={allEvents}
            hiddenTagIds={hiddenTagIds}
            writable={apiOnline}
            onToggle={toggleTag}
            onAdd={addTag}
            onUpdate={updateTag}
            onDelete={deleteTag}
          />

          <section className="calendar-inspector-section calendar-summary">
            <div><span>本月日程</span><strong>{monthCount}</strong></div>
            <div><span>服务端日程</span><strong>{localEvents.length}</strong></div>
          </section>
          {calendarError ? <p className="calendar-sync-error" role="status"><CircleAlert size={14} />{calendarError}</p> : null}
          {todoError ? <p className="calendar-sync-error"><CircleAlert size={14} />{todoError}</p> : null}
        </aside>
      </div>

      {dialogOpen ? (
        <EventDialog
          event={editingEvent}
          draft={draft}
          error={formError}
          saving={saving}
          tags={tags}
          onDraftChange={setDraft}
          onClose={closeDialog}
          onDelete={deleteEvent}
          onSubmit={saveEvent}
        />
      ) : null}
    </main>
  )
}

function MonthView({ cursor, selectedDate, today, events, tags, onSelectDate, onOpenEvent }: {
  cursor: Date
  selectedDate: Date
  today: Date
  events: CalendarEvent[]
  tags: CalendarTag[]
  onSelectDate: (date: Date) => void
  onOpenEvent: (event: CalendarEvent) => void
}) {
  const cells = useMemo(() => monthCells(cursor), [cursor])
  const eventsByDay = useMemo(() => groupEventsByDay(events), [events])
  return (
    <div className="calendar-month-view">
      <div className="calendar-month-weekdays">{WEEKDAYS.map((day) => <span key={day}>{day}</span>)}</div>
      <div className="calendar-month-grid">
        {cells.map((date) => {
          const key = dateKey(date)
          const dayEvents = eventsByDay.get(key) ?? []
          return (
            <section
              key={key}
              className={`calendar-month-cell ${date.getMonth() === cursor.getMonth() ? "" : "outside"} ${sameDay(date, today) ? "today" : ""} ${sameDay(date, selectedDate) ? "selected" : ""}`}
              role="button"
              tabIndex={0}
              aria-label={`打开${date.toLocaleDateString("zh-CN")}`}
              onClick={() => onSelectDate(date)}
              onKeyDown={(keyEvent) => { if (keyEvent.key === "Enter" || keyEvent.key === " ") onSelectDate(date) }}
            >
              <span className="calendar-day-number">{date.getDate()}</span>
              <div className="calendar-month-events">
                {dayEvents.slice(0, 3).map((event) => <EventChip key={event.id} event={event} tags={tags} onOpen={onOpenEvent} />)}
                {dayEvents.length > 3 ? <span className="calendar-more-events">还有 {dayEvents.length - 3} 项</span> : null}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}

function TimeView({ dates, today, events, tags, onSelect, onSelectDate, onCreate, onOpenEvent }: {
  dates: Date[]
  today: Date
  events: CalendarEvent[]
  tags: CalendarTag[]
  onSelect: (date: Date) => void
  onSelectDate: (date: Date) => void
  onCreate: (date: Date, hour?: number) => void
  onOpenEvent: (event: CalendarEvent) => void
}) {
  const byDay = useMemo(() => groupEventsByDay(events), [events])
  const columns = `54px repeat(${dates.length}, minmax(${dates.length === 1 ? "420px" : "116px"}, 1fr))`
  return (
    <div className={`calendar-time-view ${dates.length === 1 ? "single" : "week"}`}>
      <div className="calendar-time-header" style={{ gridTemplateColumns: columns }}>
        <span />
        {dates.map((date) => <button key={dateKey(date)} type="button" className={sameDay(date, today) ? "today" : ""} onClick={() => onSelectDate(date)}><small>{WEEKDAYS[(date.getDay() + 6) % 7]}</small><strong>{date.getDate()}</strong></button>)}
      </div>
      <div className="calendar-all-day-row" style={{ gridTemplateColumns: columns }}>
        <span>全天</span>
        {dates.map((date) => (
          <div key={dateKey(date)}>
            {(byDay.get(dateKey(date)) ?? []).filter((event) => event.allDay).map((event) => <EventChip key={event.id} event={event} tags={tags} onOpen={onOpenEvent} />)}
          </div>
        ))}
      </div>
      <div className="calendar-time-body" style={{ gridTemplateColumns: columns }}>
        <div className="calendar-hour-labels">{HOURS.map((hour) => <span key={hour}>{String(hour).padStart(2, "0")}:00</span>)}</div>
        {dates.map((date) => {
          const timedEvents = (byDay.get(dateKey(date)) ?? []).filter((event) => !event.allDay)
          return (
            <div key={dateKey(date)} className={`calendar-time-column ${sameDay(date, today) ? "today" : ""}`}>
              {HOURS.map((hour) => <button key={hour} type="button" title={`${hour}:00 新建日程`} aria-label={`${date.toLocaleDateString("zh-CN")} ${hour}:00`} onDoubleClick={() => onCreate(date, hour)} onClick={() => onSelect(date)} />)}
              {timedEvents.map((event) => {
                const position = timePosition(event)
                const tag = getEventTag(event, tags)
                return (
                  <button key={event.id} type="button" className={`calendar-time-event tone-${tag.tone} ${event.completed ? "completed" : ""}`} style={{ top: position.top, height: position.height }} onClick={() => onOpenEvent(event)}>
                    <strong>{event.title}</strong><span>{formatEventTime(event)}</span>
                  </button>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function EventChip({ event, tags, onOpen }: { event: CalendarEvent; tags: CalendarTag[]; onOpen: (event: CalendarEvent) => void }) {
  const tag = getEventTag(event, tags)
  return (
    <button type="button" className={`calendar-event-chip tone-${tag.tone} ${event.completed ? "completed" : ""}`} title={event.title} onClick={(clickEvent) => { clickEvent.stopPropagation(); onOpen(event) }}>
      <span className={`calendar-color-dot ${tag.tone}`} />
      <span>{event.allDay ? "" : formatEventTime(event)} {event.title}</span>
    </button>
  )
}

function AgendaItem({ event, tags, onOpen }: { event: CalendarEvent; tags: CalendarTag[]; onOpen: (event: CalendarEvent) => void }) {
  const tag = getEventTag(event, tags)
  return (
    <button type="button" className={event.completed ? "completed" : ""} onClick={() => onOpen(event)}>
      <span className={`calendar-agenda-mark ${tag.tone}`} />
      <span><strong>{event.title}</strong><small>{event.allDay ? "全天" : formatEventTime(event)} · {tag.label}</small></span>
    </button>
  )
}

function TagManager({ tags, events, hiddenTagIds, writable, onToggle, onAdd, onUpdate, onDelete }: {
  tags: CalendarTag[]
  events: CalendarEvent[]
  hiddenTagIds: Set<string>
  writable: boolean
  onToggle: (tagId: string) => void
  onAdd: (label: string, tone: CalendarTone) => Promise<boolean>
  onUpdate: (id: string, label: string, tone: CalendarTone) => Promise<boolean>
  onDelete: (id: string) => Promise<boolean>
}) {
  const [editor, setEditor] = useState<{ id: string; label: string; tone: CalendarTone } | null>(null)
  const [editorError, setEditorError] = useState("")

  async function saveTag(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editor) return
    const saved = await (editor.id ? onUpdate(editor.id, editor.label, editor.tone) : onAdd(editor.label, editor.tone))
    if (!saved) {
      setEditorError("标签名称不能为空或重复。")
      return
    }
    setEditor(null)
    setEditorError("")
  }

  function editTag(tag: CalendarTag) {
    setEditor({ ...tag })
    setEditorError("")
  }

  return (
    <section className="calendar-inspector-section calendar-filters">
      <header>
        <div><Tags size={15} /><strong>日历标签</strong></div>
        <button type="button" title="新建标签" aria-label="新建标签" disabled={Boolean(editor) || !writable} onClick={() => setEditor({ id: "", label: "", tone: "green" })}><Plus size={14} /></button>
      </header>
      <div className="calendar-tag-list">
        {tags.map((tag) => {
          const active = !hiddenTagIds.has(tag.id)
          const count = events.filter((event) => event.tagId === tag.id).length
          return (
            <div key={tag.id} className="calendar-tag-row">
              <button type="button" className={active ? "active" : ""} aria-pressed={active} onClick={() => onToggle(tag.id)}>
                <span className={`calendar-color-dot ${tag.tone}`} /><span>{tag.label}</span><small>{count}</small><span className="calendar-filter-check">{active ? <Check size={12} /> : null}</span>
              </button>
              <button className="calendar-tag-edit" type="button" title={`编辑${tag.label}`} aria-label={`编辑${tag.label}`} disabled={Boolean(editor) || !writable} onClick={() => editTag(tag)}><Pencil size={13} /></button>
            </div>
          )
        })}
        <div className="calendar-tag-row locked">
          <button type="button" className={!hiddenTagIds.has(TODO_TAG.id) ? "active" : ""} aria-pressed={!hiddenTagIds.has(TODO_TAG.id)} onClick={() => onToggle(TODO_TAG.id)}>
            <span className={`calendar-color-dot ${TODO_TAG.tone}`} /><span>{TODO_TAG.label}</span><small>{events.filter((event) => event.tagId === TODO_TAG.id).length}</small><span className="calendar-filter-check">{!hiddenTagIds.has(TODO_TAG.id) ? <Check size={12} /> : null}</span>
          </button>
        </div>
      </div>
      {editor ? (
        <form className="calendar-tag-editor" onSubmit={saveTag}>
          <div>
            <input autoFocus value={editor.label} maxLength={16} placeholder="标签名称" aria-label="标签名称" onChange={(event) => setEditor({ ...editor, label: event.target.value })} />
            <div className="calendar-tag-tones" role="group" aria-label="标签颜色">
              {TAG_TONES.map((tone) => <button key={tone} type="button" className={editor.tone === tone ? "active" : ""} title={toneLabel(tone)} aria-label={toneLabel(tone)} aria-pressed={editor.tone === tone} onClick={() => setEditor({ ...editor, tone })}><span className={`calendar-color-dot ${tone}`} /></button>)}
            </div>
          </div>
          {editorError ? <p role="alert">{editorError}</p> : null}
          <footer>
            {editor.id && tags.length > 1 ? <button className="delete" type="button" onClick={() => { void onDelete(editor.id).then((deleted) => { if (deleted) setEditor(null) }) }}><Trash2 size={13} />删除</button> : <span />}
            <div><button type="button" title="取消" aria-label="取消标签编辑" onClick={() => { setEditor(null); setEditorError("") }}><X size={14} /></button><button type="submit">保存</button></div>
          </footer>
        </form>
      ) : null}
    </section>
  )
}

function EventDialog({ event, draft, error, saving, tags, onDraftChange, onClose, onDelete, onSubmit }: {
  event: CalendarEvent | null
  draft: EventDraft
  error: string
  saving: boolean
  tags: CalendarTag[]
  onDraftChange: (draft: EventDraft) => void
  onClose: () => void
  onDelete: (scope: CalendarDeleteScope) => void | Promise<void>
  onSubmit: (event: FormEvent<HTMLFormElement>) => void | Promise<void>
}) {
  const readOnly = event?.source === "todo"
  const [deleteScopeOpen, setDeleteScopeOpen] = useState(false)
  const batchCount = !event && draft.repeatMode === "weekly" ? repeatDates(draft).length : 1
  const toggleWeekday = (weekday: number) => {
    const selected = draft.repeatWeekdays.includes(weekday)
      ? draft.repeatWeekdays.filter((item) => item !== weekday)
      : [...draft.repeatWeekdays, weekday].sort((left, right) => left - right)
    onDraftChange({ ...draft, repeatWeekdays: selected })
  }
  return (
    <div className="calendar-dialog-backdrop" role="presentation" onMouseDown={(mouseEvent) => { if (mouseEvent.target === mouseEvent.currentTarget) onClose() }}>
      <div className="calendar-dialog" role="dialog" aria-modal="true" aria-labelledby="calendar-dialog-title">
        <header>
          <div><span>{readOnly ? "同步待办" : event ? "编辑日程" : "新建日程"}</span><h2 id="calendar-dialog-title">{readOnly ? event.title : event ? "调整日程" : "安排新事项"}</h2></div>
          <button type="button" title="关闭" aria-label="关闭" onClick={onClose}><X size={17} /></button>
        </header>
        {readOnly && event ? (
          <div className="calendar-readonly-event">
            <div><CalendarDays size={16} /><span>{parseLocalDate(event.start).toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "long" })}</span></div>
            <div><Clock3 size={16} /><span>全天 · {event.completed ? "已完成" : "待处理"}</span></div>
            <p>该事项来自同步待办。请在原始待办中修改，日历会在下次同步后更新。</p>
            <footer><button className="calendar-secondary-action" type="button" onClick={onClose}>关闭</button></footer>
          </div>
        ) : (
          <form onSubmit={onSubmit}>
            <label className="calendar-form-field"><span>标题</span><input autoFocus value={draft.title} maxLength={80} placeholder="日程名称" onChange={(inputEvent) => onDraftChange({ ...draft, title: inputEvent.target.value })} /></label>
            <div className="calendar-form-row">
              <label className="calendar-form-field"><span>开始日期</span><input type="date" required value={draft.date} onChange={(inputEvent) => onDraftChange(updateDraftStartDate(draft, inputEvent.target.value))} /></label>
              <label className="calendar-form-field"><span>结束日期</span><input type="date" required min={draft.date} value={draft.endDate} onChange={(inputEvent) => onDraftChange({ ...draft, endDate: inputEvent.target.value })} /></label>
            </div>
            <label className="calendar-all-day-toggle"><span>全天</span><button type="button" role="switch" aria-checked={draft.allDay} className={draft.allDay ? "on" : ""} onClick={() => onDraftChange({ ...draft, allDay: !draft.allDay })}><span /></button></label>
            {!draft.allDay ? <div className="calendar-form-row">
              <label className="calendar-form-field"><span>开始</span><input type="time" required value={draft.startTime} onChange={(inputEvent) => onDraftChange({ ...draft, startTime: inputEvent.target.value })} /></label>
              <label className="calendar-form-field"><span>结束</span><input type="time" required value={draft.endTime} onChange={(inputEvent) => onDraftChange({ ...draft, endTime: inputEvent.target.value })} /></label>
            </div> : null}
            {!event ? (
              <fieldset className="calendar-repeat-field">
                <legend>重复</legend>
                <div className="calendar-repeat-mode" role="group" aria-label="重复方式">
                  <button type="button" className={draft.repeatMode === "none" ? "active" : ""} aria-pressed={draft.repeatMode === "none"} onClick={() => onDraftChange({ ...draft, repeatMode: "none" })}>不重复</button>
                  <button type="button" className={draft.repeatMode === "weekly" ? "active" : ""} aria-pressed={draft.repeatMode === "weekly"} onClick={() => onDraftChange({ ...draft, repeatMode: "weekly" })}>每周</button>
                </div>
                {draft.repeatMode === "weekly" ? (
                  <div className="calendar-repeat-options">
                    <div className="calendar-weekday-picker" role="group" aria-label="重复星期">
                      {WEEKDAYS.map((label, index) => {
                        const weekday = index + 1
                        const active = draft.repeatWeekdays.includes(weekday)
                        return <button key={label} type="button" className={active ? "active" : ""} aria-pressed={active} aria-label={`星期${label}`} onClick={() => toggleWeekday(weekday)}>{label}</button>
                      })}
                    </div>
                    <label className="calendar-form-field"><span>重复至</span><input type="date" required min={draft.date} value={draft.repeatUntil} onChange={(inputEvent) => onDraftChange({ ...draft, repeatUntil: inputEvent.target.value })} /></label>
                    <p className={batchCount > 104 ? "error" : ""}>{batchCount > 104 ? "超过单次 104 项限制，请缩短日期" : `将批量创建 ${batchCount} 个日程`}</p>
                  </div>
                ) : null}
              </fieldset>
            ) : null}
            <fieldset className="calendar-category-field">
              <legend>标签</legend>
              <div>{tags.map((tag) => <button key={tag.id} type="button" className={draft.tagId === tag.id ? "active" : ""} onClick={() => onDraftChange({ ...draft, tagId: tag.id })}><span className={`calendar-color-dot ${tag.tone}`} />{tag.label}</button>)}</div>
            </fieldset>
            <label className="calendar-form-field"><span>备注</span><textarea rows={4} maxLength={500} value={draft.notes} placeholder="地点、准备事项或补充说明" onChange={(inputEvent) => onDraftChange({ ...draft, notes: inputEvent.target.value })} /></label>
            {error ? <p className="calendar-form-error" role="alert"><CircleAlert size={14} />{error}</p> : null}
            <footer>
              {event?.source === "local" ? <button className="calendar-delete-action" type="button" title="删除日程" disabled={saving} onClick={() => event.seriesId ? setDeleteScopeOpen(true) : void onDelete("single")}><Trash2 size={15} /><span>删除</span></button> : <span />}
              <div><button className="calendar-secondary-action" type="button" disabled={saving} onClick={onClose}>取消</button><button className="calendar-primary-action" type="submit" disabled={saving || batchCount > 104}>{saving ? "保存中" : !event && draft.repeatMode === "weekly" ? `批量添加 ${batchCount} 项` : "保存日程"}</button></div>
            </footer>
          </form>
        )}
        {deleteScopeOpen && event?.seriesId ? (
          <div className="calendar-delete-scope-backdrop" role="presentation" onMouseDown={(mouseEvent) => { if (mouseEvent.target === mouseEvent.currentTarget) setDeleteScopeOpen(false) }}>
            <section className="calendar-delete-scope" role="dialog" aria-modal="true" aria-labelledby="calendar-delete-scope-title">
              <header><strong id="calendar-delete-scope-title">删除重复日程</strong><button type="button" title="关闭" aria-label="关闭删除选项" onClick={() => setDeleteScopeOpen(false)}><X size={16} /></button></header>
              <button type="button" disabled={saving} onClick={() => { setDeleteScopeOpen(false); void onDelete("single") }}>仅删除本次</button>
              <button type="button" disabled={saving} onClick={() => { setDeleteScopeOpen(false); void onDelete("future") }}>删除本次及以后</button>
              <button type="button" disabled={saving} onClick={() => { setDeleteScopeOpen(false); void onDelete("series") }}>删除整组日程</button>
              <button className="cancel" type="button" onClick={() => setDeleteScopeOpen(false)}>取消</button>
            </section>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function createDraft(date: Date, hour = 9, tagId = DEFAULT_TAGS[0].id): EventDraft {
  const startDate = dateKey(date)
  return {
    title: "",
    date: startDate,
    endDate: startDate,
    startTime: `${String(hour).padStart(2, "0")}:00`,
    endTime: `${String(Math.min(hour + 1, 23)).padStart(2, "0")}:00`,
    allDay: false,
    tagId,
    notes: "",
    repeatMode: "none",
    repeatWeekdays: [isoWeekday(date)],
    repeatUntil: dateKey(addDays(date, 28)),
  }
}

function draftFromEvent(event: CalendarEvent, fallbackTagId: string): EventDraft {
  return {
    title: event.title,
    date: event.start.slice(0, 10),
    endDate: event.end.slice(0, 10),
    startTime: event.start.slice(11, 16) || "09:00",
    endTime: event.end.slice(11, 16) || "10:00",
    allDay: event.allDay,
    tagId: event.source === "todo" ? fallbackTagId : event.tagId,
    notes: event.notes,
    repeatMode: "none",
    repeatWeekdays: [isoWeekday(parseLocalDate(event.start))],
    repeatUntil: event.start.slice(0, 10),
  }
}

function todosToEvents(todos: WorkspaceTodo[]): CalendarEvent[] {
  return todos.filter((todo) => /^\d{4}-\d{2}-\d{2}$/.test(todo.date)).map((todo, index) => ({
    id: `todo:${todo.source}:${todo.date}:${index}`,
    title: todo.text,
    start: `${todo.date}T00:00`,
    end: `${todo.date}T23:59`,
    allDay: true,
    tagId: TODO_TAG.id,
    notes: `来源：${todo.source}`,
    source: "todo",
    completed: todo.done,
    version: 0,
    seriesId: null,
  }))
}

function calendarEventFromApi(event: CalendarApiEvent): CalendarEvent {
  if (event.schedule.kind === "allDay") {
    const finalDate = addDays(parseLocalDate(event.schedule.endDate), -1)
    return {
      id: event.id,
      title: event.title,
      start: `${event.schedule.startDate}T00:00`,
      end: `${dateKey(finalDate)}T23:59`,
      allDay: true,
      tagId: event.tagId,
      notes: event.notes,
      source: "local",
      completed: event.completed,
      version: event.version,
      seriesId: event.seriesId,
    }
  }
  return {
    id: event.id,
    title: event.title,
    start: localDateTime(event.schedule.startsAt),
    end: localDateTime(event.schedule.endsAt),
    allDay: false,
    tagId: event.tagId,
    notes: event.notes,
    source: "local",
    completed: event.completed,
    version: event.version,
    seriesId: event.seriesId,
  }
}

function scheduleFromDraft(draft: EventDraft, occurrenceDate = draft.date): CalendarApiSchedule {
  const durationDays = dayDistance(parseLocalDate(draft.date), parseLocalDate(draft.endDate))
  const occurrenceEndDate = addDays(parseLocalDate(occurrenceDate), durationDays)
  if (draft.allDay) {
    return {
      kind: "allDay",
      startDate: occurrenceDate,
      endDate: dateKey(addDays(occurrenceEndDate, 1)),
    }
  }
  const [year, month, day] = occurrenceDate.split("-").map(Number)
  const [endYear, endMonth, endDay] = dateKey(occurrenceEndDate).split("-").map(Number)
  const [startHour, startMinute] = draft.startTime.split(":").map(Number)
  const [endHour, endMinute] = draft.endTime.split(":").map(Number)
  return {
    kind: "timed",
    startsAt: new Date(year, month - 1, day, startHour, startMinute).toISOString(),
    endsAt: new Date(endYear, endMonth - 1, endDay, endHour, endMinute).toISOString(),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  }
}

function repeatDates(draft: EventDraft): string[] {
  if (draft.repeatMode === "none") return [draft.date]
  if (draft.repeatWeekdays.length === 0 || draft.repeatUntil < draft.date) return []
  const selected = new Set(draft.repeatWeekdays)
  const until = parseLocalDate(draft.repeatUntil)
  const dates: string[] = []
  let current = parseLocalDate(draft.date)
  while (current <= until && dates.length <= 104) {
    if (selected.has(isoWeekday(current))) dates.push(dateKey(current))
    current = addDays(current, 1)
  }
  return dates
}

function updateDraftStartDate(draft: EventDraft, nextDate: string): EventDraft {
  const durationDays = dayDistance(parseLocalDate(draft.date), parseLocalDate(draft.endDate))
  const next = parseLocalDate(nextDate)
  return {
    ...draft,
    date: nextDate,
    endDate: dateKey(addDays(next, Math.max(0, durationDays))),
    repeatWeekdays: draft.repeatMode === "none" ? [isoWeekday(next)] : draft.repeatWeekdays,
    repeatUntil: draft.repeatUntil < nextDate ? dateKey(addDays(next, 28)) : draft.repeatUntil,
  }
}

function isoWeekday(date: Date): number {
  return ((date.getDay() + 6) % 7) + 1
}

function dayDistance(from: Date, to: Date): number {
  const fromUtc = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate())
  const toUtc = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate())
  return Math.round((toUtc - fromUtc) / 86_400_000)
}

function localDateTime(value: string): string {
  const date = new Date(value)
  return `${dateKey(date)}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`
}

function calendarRange(cursor: Date, view: CalendarView): { from: string; to: string } {
  if (view === "month") {
    const cells = monthCells(cursor)
    return { from: dateKey(cells[0]), to: dateKey(cells[cells.length - 1]) }
  }
  if (view === "week") {
    const dates = weekDates(cursor)
    return { from: dateKey(dates[0]), to: dateKey(dates[dates.length - 1]) }
  }
  return { from: dateKey(cursor), to: dateKey(cursor) }
}

function getEventTag(event: CalendarEvent, tags: CalendarTag[]): CalendarTag {
  if (event.source === "todo" || event.tagId === TODO_TAG.id) return TODO_TAG
  return tags.find((tag) => tag.id === event.tagId) ?? tags[0] ?? DEFAULT_TAGS[0]
}

function toneLabel(tone: CalendarTone): string {
  return { green: "绿色", blue: "蓝色", amber: "琥珀色", red: "红色", gray: "灰色" }[tone]
}

function monthCells(cursor: Date): Date[] {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
  const start = addDays(first, -((first.getDay() + 6) % 7))
  return Array.from({ length: 42 }, (_, index) => addDays(start, index))
}

function weekDates(cursor: Date): Date[] {
  const start = addDays(startOfDay(cursor), -((cursor.getDay() + 6) % 7))
  return Array.from({ length: 7 }, (_, index) => addDays(start, index))
}

function groupEventsByDay(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const result = new Map<string, CalendarEvent[]>()
  for (const event of events) {
    const key = eventDateKey(event)
    result.set(key, [...(result.get(key) ?? []), event])
  }
  return result
}

function timePosition(event: CalendarEvent): { top: string; height: string } {
  const startMinutes = timeMinutes(event.start)
  const endMinutes = timeMinutes(event.end)
  const visibleStart = Math.max(startMinutes, HOURS[0] * 60)
  const visibleEnd = Math.min(Math.max(endMinutes, visibleStart + 30), (HOURS[HOURS.length - 1] + 1) * 60)
  return { top: `${((visibleStart - HOURS[0] * 60) / 60) * 48}px`, height: `${Math.max(24, ((visibleEnd - visibleStart) / 60) * 48)}px` }
}

function timeMinutes(value: string): number {
  const [hour, minute] = value.slice(11, 16).split(":").map(Number)
  return hour * 60 + minute
}

function formatEventTime(event: CalendarEvent): string {
  return `${event.start.slice(11, 16)}-${event.end.slice(11, 16)}`
}

function formatCursorTitle(cursor: Date, view: CalendarView): string {
  if (view === "month") return cursor.toLocaleDateString("zh-CN", { year: "numeric", month: "long" })
  if (view === "day") return cursor.toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "long" })
  const dates = weekDates(cursor)
  const first = dates[0]
  const last = dates[6]
  if (first.getFullYear() !== last.getFullYear()) return `${first.getFullYear()}年${first.getMonth() + 1}月${first.getDate()}日 - ${last.getFullYear()}年${last.getMonth() + 1}月${last.getDate()}日`
  return `${first.getFullYear()}年${first.getMonth() + 1}月${first.getDate()}日 - ${last.getMonth() + 1}月${last.getDate()}日`
}

function compareEvents(left: CalendarEvent, right: CalendarEvent): number {
  return left.start.localeCompare(right.start) || Number(right.allDay) - Number(left.allDay) || left.title.localeCompare(right.title, "zh-CN")
}

function parseLocalDate(value: string): Date {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number)
  return new Date(year, month - 1, day)
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function addDays(date: Date, amount: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount)
}

function sameDay(left: Date, right: Date): boolean {
  return dateKey(left) === dateKey(right)
}

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

function eventDateKey(event: CalendarEvent): string {
  return event.start.slice(0, 10)
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
}
