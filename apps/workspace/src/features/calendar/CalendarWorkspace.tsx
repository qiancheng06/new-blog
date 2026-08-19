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
import { getWorkspaceTodos, type WorkspaceTodo } from "@/shared/data/workspaceData"

type CalendarView = "month" | "week" | "day"
type CalendarTone = "green" | "blue" | "amber" | "red" | "gray"

interface CalendarTag {
  id: string
  label: string
  tone: CalendarTone
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
}

interface EventDraft {
  title: string
  date: string
  startTime: string
  endTime: string
  allDay: boolean
  tagId: string
  notes: string
}

const STORAGE_KEY = "persona-calendar-events-v1"
const TAG_STORAGE_KEY = "persona-calendar-tags-v1"
const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"]
const HOURS = Array.from({ length: 15 }, (_, index) => index + 7)
const VIEW_OPTIONS: Array<{ value: CalendarView; label: string }> = [
  { value: "month", label: "月" },
  { value: "week", label: "周" },
  { value: "day", label: "日" },
]
const DEFAULT_TAGS: CalendarTag[] = [
  { id: "focus", label: "专注", tone: "green" },
  { id: "meeting", label: "会议", tone: "blue" },
  { id: "personal", label: "个人", tone: "amber" },
  { id: "reminder", label: "提醒", tone: "red" },
]
const TODO_TAG: CalendarTag = { id: "todo", label: "同步待办", tone: "gray" }
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
  const [query, setQuery] = useState("")
  const [hiddenTagIds, setHiddenTagIds] = useState<Set<string>>(() => new Set())
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null)
  const [draft, setDraft] = useState<EventDraft>(() => createDraft(today))
  const [formError, setFormError] = useState("")

  useEffect(() => {
    const storedTags = readStoredTags(window.localStorage.getItem(TAG_STORAGE_KEY))
    const storedEvents = readStoredEvents(window.localStorage.getItem(STORAGE_KEY), storedTags)
    setTags(storedTags)
    setLocalEvents(storedEvents)
    window.localStorage.setItem(TAG_STORAGE_KEY, JSON.stringify(storedTags))
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(storedEvents))
    setDataReady(true)
    void getWorkspaceTodos().then(setTodos).catch(() => setTodoError("同步待办暂不可用，本地日程仍可正常使用。"))
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

  function persistEvents(next: CalendarEvent[]) {
    setLocalEvents(next)
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }

  function persistTags(next: CalendarTag[]) {
    setTags(next)
    window.localStorage.setItem(TAG_STORAGE_KEY, JSON.stringify(next))
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

  function saveEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const title = draft.title.trim()
    if (!title) return setFormError("请填写日程标题。")
    if (!draft.allDay && draft.endTime <= draft.startTime) return setFormError("结束时间需要晚于开始时间。")

    const nextEvent: CalendarEvent = {
      id: editingEvent?.source === "local" ? editingEvent.id : createEventId(),
      title,
      start: `${draft.date}T${draft.allDay ? "00:00" : draft.startTime}`,
      end: `${draft.date}T${draft.allDay ? "23:59" : draft.endTime}`,
      allDay: draft.allDay,
      tagId: tags.some((tag) => tag.id === draft.tagId) ? draft.tagId : tags[0]?.id ?? DEFAULT_TAGS[0].id,
      notes: draft.notes.trim(),
      source: "local",
    }
    const next = editingEvent?.source === "local"
      ? localEvents.map((item) => item.id === editingEvent.id ? nextEvent : item)
      : [...localEvents, nextEvent]
    persistEvents(next.sort(compareEvents))
    const savedDate = parseLocalDate(nextEvent.start)
    setSelectedDate(savedDate)
    setCursor(savedDate)
    closeDialog()
  }

  function deleteEvent() {
    if (!editingEvent || editingEvent.source !== "local") return
    persistEvents(localEvents.filter((item) => item.id !== editingEvent.id))
    closeDialog()
  }

  function toggleTag(tagId: string) {
    setHiddenTagIds((current) => {
      const next = new Set(current)
      if (next.has(tagId)) next.delete(tagId)
      else next.add(tagId)
      return next
    })
  }

  function addTag(label: string, tone: CalendarTone) {
    const normalized = label.trim()
    if (!normalized || tags.some((tag) => tag.label === normalized)) return false
    persistTags([...tags, { id: createTagId(), label: normalized.slice(0, 16), tone }])
    return true
  }

  function updateTag(id: string, label: string, tone: CalendarTone) {
    const normalized = label.trim()
    if (!normalized || tags.some((tag) => tag.id !== id && tag.label === normalized)) return false
    persistTags(tags.map((tag) => tag.id === id ? { ...tag, label: normalized.slice(0, 16), tone } : tag))
    return true
  }

  function deleteTag(id: string) {
    if (tags.length <= 1) return false
    const fallback = tags.find((tag) => tag.id !== id)
    if (!fallback) return false
    const affected = localEvents.filter((event) => event.tagId === id).length
    if (affected > 0 && !window.confirm(`删除后，${affected} 个日程将移动到“${fallback.label}”。是否继续？`)) return false
    persistEvents(localEvents.map((event) => event.tagId === id ? { ...event, tagId: fallback.id } : event))
    persistTags(tags.filter((tag) => tag.id !== id))
    setHiddenTagIds((current) => {
      const next = new Set(current)
      next.delete(id)
      return next
    })
    return true
  }

  return (
    <main className="calendar-page">
      <header className="calendar-page-header">
        <div>
          <span className="module-kicker"><CalendarDays size={14} />日历</span>
          <h1>日程安排</h1>
        </div>
        <button className="calendar-primary-action" type="button" onClick={() => openCreate()}>
          <Plus size={16} />新建日程
        </button>
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
              <button type="button" title="在选中日期新建" aria-label="在选中日期新建" onClick={() => openCreate(selectedDate)}><Plus size={15} /></button>
            </header>
            <div className="calendar-agenda-list">
              {selectedEvents.length === 0 ? <p>这一天还没有日程</p> : selectedEvents.map((event) => <AgendaItem key={event.id} event={event} tags={tags} onOpen={openEvent} />)}
            </div>
          </section>

          <TagManager
            tags={tags}
            events={allEvents}
            hiddenTagIds={hiddenTagIds}
            onToggle={toggleTag}
            onAdd={addTag}
            onUpdate={updateTag}
            onDelete={deleteTag}
          />

          <section className="calendar-inspector-section calendar-summary">
            <div><span>本月日程</span><strong>{monthCount}</strong></div>
            <div><span>本地日程</span><strong>{localEvents.length}</strong></div>
          </section>
          {todoError ? <p className="calendar-sync-error"><CircleAlert size={14} />{todoError}</p> : null}
        </aside>
      </div>

      {dialogOpen ? (
        <EventDialog
          event={editingEvent}
          draft={draft}
          error={formError}
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

function TagManager({ tags, events, hiddenTagIds, onToggle, onAdd, onUpdate, onDelete }: {
  tags: CalendarTag[]
  events: CalendarEvent[]
  hiddenTagIds: Set<string>
  onToggle: (tagId: string) => void
  onAdd: (label: string, tone: CalendarTone) => boolean
  onUpdate: (id: string, label: string, tone: CalendarTone) => boolean
  onDelete: (id: string) => boolean
}) {
  const [editor, setEditor] = useState<{ id: string; label: string; tone: CalendarTone } | null>(null)
  const [editorError, setEditorError] = useState("")

  function saveTag(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editor) return
    const saved = editor.id ? onUpdate(editor.id, editor.label, editor.tone) : onAdd(editor.label, editor.tone)
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
        <button type="button" title="新建标签" aria-label="新建标签" disabled={Boolean(editor)} onClick={() => setEditor({ id: "", label: "", tone: "green" })}><Plus size={14} /></button>
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
              <button className="calendar-tag-edit" type="button" title={`编辑${tag.label}`} aria-label={`编辑${tag.label}`} disabled={Boolean(editor)} onClick={() => editTag(tag)}><Pencil size={13} /></button>
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
            {editor.id && tags.length > 1 ? <button className="delete" type="button" onClick={() => { if (onDelete(editor.id)) setEditor(null) }}><Trash2 size={13} />删除</button> : <span />}
            <div><button type="button" title="取消" aria-label="取消标签编辑" onClick={() => { setEditor(null); setEditorError("") }}><X size={14} /></button><button type="submit">保存</button></div>
          </footer>
        </form>
      ) : null}
    </section>
  )
}

function EventDialog({ event, draft, error, tags, onDraftChange, onClose, onDelete, onSubmit }: {
  event: CalendarEvent | null
  draft: EventDraft
  error: string
  tags: CalendarTag[]
  onDraftChange: (draft: EventDraft) => void
  onClose: () => void
  onDelete: () => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}) {
  const readOnly = event?.source === "todo"
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
              <label className="calendar-form-field"><span>日期</span><input type="date" required value={draft.date} onChange={(inputEvent) => onDraftChange({ ...draft, date: inputEvent.target.value })} /></label>
              <label className="calendar-all-day-toggle"><span>全天</span><button type="button" role="switch" aria-checked={draft.allDay} className={draft.allDay ? "on" : ""} onClick={() => onDraftChange({ ...draft, allDay: !draft.allDay })}><span /></button></label>
            </div>
            {!draft.allDay ? <div className="calendar-form-row">
              <label className="calendar-form-field"><span>开始</span><input type="time" required value={draft.startTime} onChange={(inputEvent) => onDraftChange({ ...draft, startTime: inputEvent.target.value })} /></label>
              <label className="calendar-form-field"><span>结束</span><input type="time" required value={draft.endTime} onChange={(inputEvent) => onDraftChange({ ...draft, endTime: inputEvent.target.value })} /></label>
            </div> : null}
            <fieldset className="calendar-category-field">
              <legend>标签</legend>
              <div>{tags.map((tag) => <button key={tag.id} type="button" className={draft.tagId === tag.id ? "active" : ""} onClick={() => onDraftChange({ ...draft, tagId: tag.id })}><span className={`calendar-color-dot ${tag.tone}`} />{tag.label}</button>)}</div>
            </fieldset>
            <label className="calendar-form-field"><span>备注</span><textarea rows={4} maxLength={500} value={draft.notes} placeholder="地点、准备事项或补充说明" onChange={(inputEvent) => onDraftChange({ ...draft, notes: inputEvent.target.value })} /></label>
            {error ? <p className="calendar-form-error" role="alert"><CircleAlert size={14} />{error}</p> : null}
            <footer>
              {event?.source === "local" ? <button className="calendar-delete-action" type="button" title="删除日程" onClick={onDelete}><Trash2 size={15} /><span>删除</span></button> : <span />}
              <div><button className="calendar-secondary-action" type="button" onClick={onClose}>取消</button><button className="calendar-primary-action" type="submit">保存日程</button></div>
            </footer>
          </form>
        )}
      </div>
    </div>
  )
}

function createDraft(date: Date, hour = 9, tagId = DEFAULT_TAGS[0].id): EventDraft {
  return { title: "", date: dateKey(date), startTime: `${String(hour).padStart(2, "0")}:00`, endTime: `${String(Math.min(hour + 1, 23)).padStart(2, "0")}:00`, allDay: false, tagId, notes: "" }
}

function draftFromEvent(event: CalendarEvent, fallbackTagId: string): EventDraft {
  return {
    title: event.title,
    date: event.start.slice(0, 10),
    startTime: event.start.slice(11, 16) || "09:00",
    endTime: event.end.slice(11, 16) || "10:00",
    allDay: event.allDay,
    tagId: event.source === "todo" ? fallbackTagId : event.tagId,
    notes: event.notes,
  }
}

function readStoredEvents(value: string | null, tags: CalendarTag[]): CalendarEvent[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.map((item) => parseStoredEvent(item, tags)).filter((item): item is CalendarEvent => Boolean(item))
  } catch {
    return []
  }
}

function parseStoredEvent(value: unknown, tags: CalendarTag[]): CalendarEvent | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const event = value as Record<string, unknown>
  if (typeof event.id !== "string" || typeof event.title !== "string" || typeof event.start !== "string" || typeof event.end !== "string"
    || typeof event.allDay !== "boolean" || typeof event.notes !== "string" || event.source !== "local") return null
  const storedTagId = typeof event.tagId === "string" ? event.tagId : typeof event.category === "string" ? event.category : ""
  const tagId = tags.some((tag) => tag.id === storedTagId) ? storedTagId : tags[0]?.id ?? DEFAULT_TAGS[0].id
  return { id: event.id, title: event.title, start: event.start, end: event.end, allDay: event.allDay, tagId, notes: event.notes, source: "local" }
}

function readStoredTags(value: string | null): CalendarTag[] {
  if (!value) return DEFAULT_TAGS.map((tag) => ({ ...tag }))
  try {
    const parsed = JSON.parse(value) as unknown
    if (!Array.isArray(parsed)) return DEFAULT_TAGS.map((tag) => ({ ...tag }))
    const seenIds = new Set<string>()
    const seenLabels = new Set<string>()
    const result = parsed.flatMap((item): CalendarTag[] => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return []
      const tag = item as Record<string, unknown>
      const id = typeof tag.id === "string" ? tag.id.trim() : ""
      const label = typeof tag.label === "string" ? tag.label.trim().slice(0, 16) : ""
      const tone = TAG_TONES.includes(tag.tone as CalendarTone) ? tag.tone as CalendarTone : null
      if (!id || id === TODO_TAG.id || !label || !tone || seenIds.has(id) || seenLabels.has(label)) return []
      seenIds.add(id)
      seenLabels.add(label)
      return [{ id, label, tone }]
    })
    return result.length ? result : DEFAULT_TAGS.map((tag) => ({ ...tag }))
  } catch {
    return DEFAULT_TAGS.map((tag) => ({ ...tag }))
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
  }))
}

function createEventId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `event-${Date.now()}`
}

function createTagId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? `tag-${crypto.randomUUID()}` : `tag-${Date.now()}`
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
