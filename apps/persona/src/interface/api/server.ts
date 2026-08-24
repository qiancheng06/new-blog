import { createServer, IncomingMessage, ServerResponse, type Server } from "http"
import { config } from "../../infra/config/index.js"
import { createWorkspaceEvent } from "../../domain/event/types.js"
import { EventIdentityConflictError } from "../../domain/event/store.js"
import {
  CONVERSATION_FALLBACK_REPLY,
  countConversationEventsToday,
  getRecentConversationEvents,
  handleConversationEvent,
} from "../../application/conversation.js"
import {
  getMemoryOverview,
  getMemoryProfile,
  getMemoryProposals,
  getMemorySearch,
  getMemorySourceInspection,
  getMemoryStatusStats,
  getMemoryTimelineEvents,
  getMemoryTopics,
  changeMemoryProfileState,
  changeMemoryTopicState,
  correctMemoryProfile,
  reviewMemoryProposal,
  MemoryConflictError,
  MemoryValidationError,
  MemoryNotFoundError,
  parseMemoryListState,
  parseMemoryProposalStatus,
} from "../../application/memory.js"
import {
  BackgroundJobConflictError,
  BackgroundJobNotFoundError,
  getBackgroundTaskStats,
  listBackgroundJobs,
  retryBackgroundJob,
  startBackgroundTaskWorker,
  stopBackgroundTaskWorker,
  type BackgroundJobStatus,
} from "../../application/background-tasks.js"
import {
  CalendarConflictError,
  CalendarNotFoundError,
  CalendarValidationError,
  createCalendarEvent,
  createCalendarEvents,
  createCalendarTag,
  deleteCalendarEvent,
  deleteCalendarTag,
  getCalendar,
  updateCalendarEvent,
  updateCalendarTag,
  type CalendarEventInput,
  type CalendarEventPatch,
  type CalendarDeleteScope,
  type CalendarTone,
} from "../../application/calendar.js"
import { getRuntimeHealthSnapshot, summarizeRuntimeHealth } from "../../application/runtime-health.js"
import {
  AnalysisJobConflictError,
  AnalysisJobNotFoundError,
  AnalysisJobValidationError,
  getAnalysisJobs,
  getAnalysisJobsStatus,
  parseAnalysisJobStatus,
  retryAnalysisJob,
} from "../../application/analysis-jobs.js"
import {
  ConversationExecutionError,
  ConversationJobConflictError,
  ConversationJobNotFoundError,
  ConversationJobValidationError,
  getConversationJobs,
  parseConversationJobStatus,
  retryConversationJob,
} from "../../application/conversation-jobs.js"
import {
  DailySummaryNotFoundError,
  DailySummaryArchiveConflictError,
  DailySummaryArchiveUnavailableError,
  DailySummaryValidationError,
  archiveDailySummary,
  generateDailySummary,
  getDailySummaries,
  getDailySummary,
} from "../../application/daily-summary.js"
import type { ProcessMessageOptions } from "../../ai-runtime/operators/process-message.js"
import { testModelConnection } from "../../application/model-connection.js"
import {
  PersonaSnapshotArchiveConflictError,
  PersonaSnapshotArchiveUnavailableError,
  archivePersonaSnapshot,
} from "../../application/obsidian-snapshot.js"
import {
  TodoConflictError,
  TodoNotFoundError,
  TodoValidationError,
  changeTodoStatus,
  createTodo,
  getTodo,
  getTodos,
  getTodosStatus,
  parseTodoStatus,
  assignTodoProject,
} from "../../application/todos.js"
import {
  ProjectConflictError,
  ProjectNotFoundError,
  ProjectValidationError,
  changeProjectDetails,
  changeProjectStatus,
  createProject,
  getProject,
  getProjects,
  getProjectsStatus,
  parseProjectStatus,
} from "../../application/projects.js"
import {
  WorkingStateConflictError,
  WorkingStateNotFoundError,
  WorkingStateValidationError,
  changeWorkingState,
  getWorkingState,
  getWorkingStateStatus,
} from "../../application/working-state.js"
import {
  CaptureNotFoundError,
  CaptureValidationError,
  createCapture,
  getCapture,
  getCaptures,
  getCapturesStatus,
  parseCaptureSource,
  parseCaptureType,
} from "../../application/captures.js"
import {
  EventFeedNotFoundError,
  EventFeedValidationError,
  getEventFeed,
  getEventFeedItem,
  parseEventFeedSource,
} from "../../application/events.js"
import {
  ConversationHistoryNotFoundError,
  ConversationHistoryValidationError,
  getConversationHistory,
  getConversationHistoryItem,
  parseConversationHistorySource,
  parseConversationHistoryStatus,
} from "../../application/conversations.js"

const CORS_HEADERS = {
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Idempotency-Key",
}

const MAX_JSON_BODY_BYTES = 64 * 1024

function json(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { "Content-Type": "application/json", ...CORS_HEADERS })
  res.end(JSON.stringify(data))
}

function readBody(req: IncomingMessage, maxBytes: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    let settled = false

    req.on("data", (chunk: Buffer) => {
      if (settled) return
      size += chunk.length
      if (size > maxBytes) {
        settled = true
        reject(new RequestBodyTooLargeError())
        return
      }
      chunks.push(chunk)
    })
    req.on("end", () => {
      if (settled) return
      settled = true
      resolve(Buffer.concat(chunks).toString("utf-8"))
    })
    req.on("error", (err) => {
      if (settled) return
      settled = true
      reject(err)
    })
  })
}

async function handleChat(req: IncomingMessage, res: ServerResponse) {
  const parsed = await readJsonObject<{
    text?: string
    page?: string
    evaluationRunId?: string
    requestId?: unknown
    ai?: unknown
  }>(req, res)
  if (!parsed) return

  const text = parsed.text?.trim()
  if (!text) return json(res, 400, { error: "text is required" })
  const ai = parseChatAiParameters(parsed.ai)
  if ("error" in ai) return json(res, 400, { error: ai.error })

  let requestId: string | undefined
  try {
    requestId = resolveIdempotencyKey(req, parsed.requestId)
  } catch (err) {
    if (err instanceof ChatRequestValidationError) return json(res, 400, { error: err.message })
    throw err
  }

  const event = createWorkspaceEvent(
    { text, page: parsed.page, evaluationRunId: parsed.evaluationRunId },
    { requestId },
  )
  console.log(`[web] ${text.slice(0, 60)}`)

  try {
    const result = await handleConversationEvent(event, {
      ai: ai.value,
      resumeDuplicate: Boolean(requestId),
    })
    json(res, 200, {
      reply: result.companionReply,
      eventId: result.event.id,
      replyEventId: result.replyEvent?.id,
      duplicate: result.duplicate,
      conversationJobId: result.job?.id,
      conversationJobStatus: result.job?.status,
    })
  } catch (err) {
    if (err instanceof EventIdentityConflictError) {
      return json(res, 409, { error: "idempotency key conflict" })
    }
    if (err instanceof ConversationExecutionError) {
      console.error("[web error] conversation processing failed")
      return json(res, 500, {
        reply: CONVERSATION_FALLBACK_REPLY,
        error: "processing failed",
        eventId: err.sourceEventId,
        conversationJobId: err.jobId,
      })
    }
    console.error("[web error]", err instanceof Error ? err.message : err)
    return json(res, 500, { reply: CONVERSATION_FALLBACK_REPLY, error: "processing failed" })
  }
}

async function handleAiConnectionTest(req: IncomingMessage, res: ServerResponse) {
  const parsed = await readJsonObject<{ ai?: unknown }>(req, res)
  if (!parsed) return
  const ai = parseChatAiParameters(parsed.ai)
  if ("error" in ai) return json(res, 400, { error: ai.error })

  try {
    json(res, 200, await testModelConnection(ai.value))
  } catch (err) {
    console.error("[ai connection test error]", err instanceof Error ? err.message : err)
    json(res, 502, { error: "model connection failed" })
  }
}

function parseChatAiParameters(input: unknown): { value: ProcessMessageOptions } | { error: string } {
  if (input === undefined) return { value: {} }
  if (!input || typeof input !== "object" || Array.isArray(input)) return { error: "ai must be an object" }

  const value = input as Record<string, unknown>
  const endpoint = parseOptionalString(value.endpoint, "ai.endpoint", 2048)
  if (typeof endpoint === "object") return { error: endpoint.error }
  const model = parseOptionalString(value.model, "ai.model", 200)
  if (typeof model === "object") return { error: model.error }
  const apiKey = parseOptionalString(value.apiKey, "ai.apiKey", 4000)
  if (typeof apiKey === "object") return { error: apiKey.error }
  const connectionError = validateCustomConnection(endpoint, model, apiKey)
  if (connectionError) return { error: connectionError }
  const temperature = parseBoundedNumber(value.temperature, "ai.temperature", 0, 2)
  if (typeof temperature === "string") return { error: temperature }
  const topP = parseBoundedNumber(value.topP, "ai.topP", 0.1, 1)
  if (typeof topP === "string") return { error: topP }
  const maxTokens = parseBoundedNumber(value.maxTokens, "ai.maxTokens", 128, 4096, true)
  if (typeof maxTokens === "string") return { error: maxTokens }
  const historyLimit = parseBoundedNumber(value.historyLimit, "ai.historyLimit", 0, 10, true)
  if (typeof historyLimit === "string") return { error: historyLimit }
  const memoryEnabled = parseOptionalBoolean(value.memoryEnabled, "ai.memoryEnabled")
  if (typeof memoryEnabled === "string") return { error: memoryEnabled }
  const backgroundAnalysis = parseOptionalBoolean(value.backgroundAnalysis, "ai.backgroundAnalysis")
  if (typeof backgroundAnalysis === "string") return { error: backgroundAnalysis }

  if (value.instructions !== undefined && typeof value.instructions !== "string") {
    return { error: "ai.instructions must be a string" }
  }
  const instructions = value.instructions?.trim()
  if (instructions && instructions.length > 1000) return { error: "ai.instructions must be at most 1000 characters" }

  return {
    value: {
      endpoint,
      model,
      apiKey,
      temperature,
      topP,
      maxTokens,
      historyLimit,
      memoryEnabled,
      backgroundAnalysis,
      ...(instructions ? { instructions } : {}),
    },
  }
}

function parseOptionalString(
  input: unknown,
  name: string,
  maxLength: number,
): string | undefined | { error: string } {
  if (input === undefined || input === "") return undefined
  if (typeof input !== "string") return { error: `${name} must be a string` }
  const value = input.trim()
  if (!value) return undefined
  return value.length <= maxLength ? value : { error: `${name} must be at most ${maxLength} characters` }
}

function validateCustomConnection(endpoint?: string, model?: string, apiKey?: string): string | undefined {
  if (!endpoint && !model && !apiKey) return undefined
  if (!endpoint) return "ai.endpoint is required for a custom model connection"
  if (!model) return "ai.model is required for a custom model connection"

  let parsed: URL
  try {
    parsed = new URL(endpoint)
  } catch {
    return "ai.endpoint must be a valid URL"
  }

  const localHttp = parsed.protocol === "http:"
    && (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1" || parsed.hostname === "[::1]")
  if (parsed.protocol !== "https:" && !localHttp) {
    return "ai.endpoint must use HTTPS, except for localhost"
  }
  if (parsed.username || parsed.password) return "ai.endpoint must not include credentials"
  if (!localHttp && !apiKey) return "ai.apiKey is required for a remote custom model connection"
  return undefined
}

function parseBoundedNumber(
  input: unknown,
  name: string,
  min: number,
  max: number,
  integer = false,
): number | undefined | string {
  if (input === undefined) return undefined
  if (typeof input !== "number" || !Number.isFinite(input) || input < min || input > max) {
    return `${name} must be a number between ${min} and ${max}`
  }
  if (integer && !Number.isInteger(input)) return `${name} must be an integer`
  return input
}

function parseOptionalBoolean(input: unknown, name: string): boolean | undefined | string {
  if (input === undefined) return undefined
  return typeof input === "boolean" ? input : `${name} must be a boolean`
}

function handleHealth(_req: IncomingMessage, res: ServerResponse) {
  const counters = getSafeHealthCounters()
  json(res, 200, {
    status: "ok",
    uptime: process.uptime(),
    events_today: counters.eventsToday,
    background_tasks: counters.backgroundTasks,
    analysis_jobs: counters.analysisJobs,
  })
}

function handleReady(_req: IncomingMessage, res: ServerResponse) {
  const health = getRuntimeHealthSnapshot()
  json(res, health.ready ? 200 : 503, {
    status: health.ready ? "ready" : "not_ready",
    components: health.components,
  })
}

function handleEvents(url: URL, res: ServerResponse) {
  try {
    json(res, 200, getEventFeed({
      source: parseEventFeedSource(readText(url, "source")),
      type: readText(url, "type"),
      query: readText(url, "q"),
      since: readText(url, "since"),
      before: readText(url, "before"),
      limit: readNumber(url, "limit"),
      offset: readNumber(url, "offset"),
    }))
  } catch (err) {
    handleEventFeedError(err, res)
  }
}

function handleEventById(id: string, res: ServerResponse) {
  try {
    json(res, 200, { event: getEventFeedItem(id) })
  } catch (err) {
    handleEventFeedError(err, res)
  }
}

function handleConversations(url: URL, res: ServerResponse) {
  try {
    json(res, 200, getConversationHistory({
      source: parseConversationHistorySource(readText(url, "source")),
      status: parseConversationHistoryStatus(readText(url, "status")),
      query: readText(url, "q"),
      since: readText(url, "since"),
      before: readText(url, "before"),
      limit: readNumber(url, "limit"),
      offset: readNumber(url, "offset"),
    }))
  } catch (err) {
    handleConversationHistoryError(err, res)
  }
}

function handleConversationHistoryById(id: string, res: ServerResponse) {
  try {
    json(res, 200, { conversation: getConversationHistoryItem(id) })
  } catch (err) {
    handleConversationHistoryError(err, res)
  }
}

function handleStatus(_req: IncomingMessage, res: ServerResponse) {
  let health = getRuntimeHealthSnapshot()
  let backgroundTasks = getSafeHealthCounters().backgroundTasks
  let eventsToday = 0
  let memory = { topics: 0, profile: 0, timelineEvents: 0, pendingProposals: 0 }
  let todos = { open: 0, done: 0, cancelled: 0, overdue: 0, dueToday: 0 }
  let projects = { active: 0, paused: 0, done: 0, archived: 0 }
  let captures = { notes: 0, ideas: 0, journals: 0 }
  let workingState: ReturnType<typeof getWorkingStateStatus> = {
    mode: "S1",
    hasCurrentProject: false,
    activeTopicCount: 0,
    currentQuestionCount: 0,
  }
  let recentEvents: ReturnType<typeof getRecentConversationEvents> = []

  if (health.components.database.status === "ok") {
    try {
      eventsToday = countConversationEventsToday()
      memory = getMemoryStatusStats()
      todos = getTodosStatus()
      projects = getProjectsStatus()
      captures = getCapturesStatus()
      workingState = getWorkingStateStatus()
      recentEvents = getRecentConversationEvents(5)
      backgroundTasks = getBackgroundTaskStats()
    } catch {
      health = summarizeRuntimeHealth({
        ...health.components,
        database: { status: "failed" },
      })
    }
  }
  json(res, 200, {
    status: health.status,
    ready: health.ready,
    components: health.components,
    uptime: process.uptime(),
    events_today: eventsToday,
    background_tasks: backgroundTasks,
    analysis_jobs: health.components.analysis.jobs,
    conversation_jobs: health.components.conversation.jobs,
    memory,
    todos,
    projects,
    captures,
    working_state: workingState,
    recent_events: recentEvents.map((event) => ({
      id: event.id,
      source: event.source,
      type: event.type,
      timestamp: event.timestamp,
      preview: getEventPreview(event.payload),
    })),
  })
}

function handleCalendar(url: URL, res: ServerResponse): void {
  try {
    json(res, 200, getCalendar({
      from: url.searchParams.get("from") ?? "",
      to: url.searchParams.get("to") ?? "",
    }))
  } catch (err) {
    handleCalendarError(err, res)
  }
}

async function handleCalendarEventCreate(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const parsed = await readJsonObject<Record<string, unknown>>(req, res)
  if (!parsed) return
  try {
    json(res, 201, { event: createCalendarEvent(parsed as unknown as CalendarEventInput) })
  } catch (err) {
    handleCalendarError(err, res)
  }
}

async function handleCalendarEventBulkCreate(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const parsed = await readJsonObject<{ events?: CalendarEventInput[] }>(req, res)
  if (!parsed) return
  try {
    json(res, 201, { events: createCalendarEvents(parsed.events as CalendarEventInput[]) })
  } catch (err) {
    handleCalendarError(err, res)
  }
}

async function handleCalendarEventUpdate(req: IncomingMessage, id: string, res: ServerResponse): Promise<void> {
  const parsed = await readJsonObject<Record<string, unknown>>(req, res)
  if (!parsed) return
  try {
    json(res, 200, { event: updateCalendarEvent(id, parsed as unknown as CalendarEventPatch) })
  } catch (err) {
    handleCalendarError(err, res)
  }
}

async function handleCalendarEventDelete(req: IncomingMessage, id: string, res: ServerResponse): Promise<void> {
  const parsed = await readJsonObject<{ version?: number; scope?: CalendarDeleteScope }>(req, res)
  if (!parsed) return
  try {
    json(res, 200, deleteCalendarEvent(id, parsed.version as number, parsed.scope ?? "single"))
  } catch (err) {
    handleCalendarError(err, res)
  }
}

async function handleCalendarTagCreate(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const parsed = await readJsonObject<{ label?: string; tone?: CalendarTone; sortOrder?: number }>(req, res)
  if (!parsed) return
  try {
    json(res, 201, {
      tag: createCalendarTag({
        label: parsed.label as string,
        tone: parsed.tone as CalendarTone,
        sortOrder: parsed.sortOrder,
      }),
    })
  } catch (err) {
    handleCalendarError(err, res)
  }
}

async function handleCalendarTagUpdate(req: IncomingMessage, id: string, res: ServerResponse): Promise<void> {
  const parsed = await readJsonObject<{
    version?: number
    label?: string
    tone?: CalendarTone
    sortOrder?: number
  }>(req, res)
  if (!parsed) return
  try {
    json(res, 200, {
      tag: updateCalendarTag(id, {
        version: parsed.version as number,
        label: parsed.label,
        tone: parsed.tone,
        sortOrder: parsed.sortOrder,
      }),
    })
  } catch (err) {
    handleCalendarError(err, res)
  }
}

async function handleCalendarTagDelete(req: IncomingMessage, id: string, res: ServerResponse): Promise<void> {
  const parsed = await readJsonObject<{ version?: number; fallbackTagId?: string }>(req, res)
  if (!parsed) return
  try {
    json(res, 200, deleteCalendarTag({
      id,
      version: parsed.version as number,
      fallbackTagId: parsed.fallbackTagId as string,
    }))
  } catch (err) {
    handleCalendarError(err, res)
  }
}

function handleBackgroundJobs(url: URL, res: ServerResponse): void {
  const status = readText(url, "status")
  const normalizedStatus = isBackgroundJobStatus(status) ? status : undefined
  if (status && !normalizedStatus) {
    json(res, 400, { error: "status must be queued, running, succeeded, or failed" })
    return
  }
  json(res, 200, {
    items: listBackgroundJobs({ status: normalizedStatus, limit: readNumber(url, "limit") }),
  })
}

function handleBackgroundJobRetry(id: string, res: ServerResponse): void {
  try {
    json(res, 200, { job: retryBackgroundJob(id) })
  } catch (err) {
    handleBackgroundJobError(err, res)
  }
}

function handleMemoryOverview(url: URL, res: ServerResponse) {
  json(res, 200, getMemoryOverview({
    topicLimit: readNumber(url, "topicLimit"),
    profileLimit: readNumber(url, "profileLimit"),
    timelineLimit: readNumber(url, "timelineLimit"),
  }))
}

function handleMemoryTopics(url: URL, res: ServerResponse) {
  json(res, 200, getMemoryTopics({
    limit: readNumber(url, "limit"),
    offset: readNumber(url, "offset"),
    name: readText(url, "name"),
    state: parseMemoryListState(readText(url, "state")),
  }))
}

function handleMemoryProfile(url: URL, res: ServerResponse) {
  json(res, 200, getMemoryProfile({
    limit: readNumber(url, "limit"),
    offset: readNumber(url, "offset"),
    key: readText(url, "key"),
    state: parseMemoryListState(readText(url, "state")),
  }))
}

function handleMemoryTimeline(url: URL, res: ServerResponse) {
  const type = readText(url, "type")
  json(res, 200, getMemoryTimelineEvents({
    limit: readNumber(url, "limit"),
    offset: readNumber(url, "offset"),
    type: isTimelineType(type) ? type : undefined,
    date: readText(url, "date"),
    sourceEventId: readText(url, "sourceEventId"),
  }))
}

function handleMemorySources(_url: URL, res: ServerResponse) {
  json(res, 200, getMemorySourceInspection())
}

function handleTodos(url: URL, res: ServerResponse) {
  try {
    json(res, 200, getTodos({
      status: parseTodoStatus(readText(url, "status")),
      projectId: readText(url, "projectId"),
      dueBefore: readText(url, "dueBefore"),
      dueAfter: readText(url, "dueAfter"),
      limit: readNumber(url, "limit"),
      offset: readNumber(url, "offset"),
    }))
  } catch (err) {
    handleTodoError(err, res)
  }
}

function handleTodoById(id: string, res: ServerResponse) {
  try {
    json(res, 200, { todo: getTodo(id) })
  } catch (err) {
    handleTodoError(err, res)
  }
}

async function handleTodoCreate(req: IncomingMessage, res: ServerResponse) {
  const parsed = await readJsonObject<{ title?: unknown; dueDate?: unknown; projectId?: unknown }>(req, res)
  if (!parsed) return
  try {
    const result = createTodo({ title: parsed.title ?? "", dueDate: parsed.dueDate, projectId: parsed.projectId })
    json(res, 201, { eventId: result.event.id, todo: result.todo })
  } catch (err) {
    handleTodoError(err, res)
  }
}

async function handleTodoProject(req: IncomingMessage, id: string, res: ServerResponse) {
  const parsed = await readJsonObject<{ projectId?: unknown; reason?: unknown }>(req, res)
  if (!parsed) return
  try {
    const result = assignTodoProject({ id, projectId: parsed.projectId ?? null, reason: parsed.reason })
    json(res, 200, { eventId: result.event.id, todo: result.todo })
  } catch (err) {
    handleTodoError(err, res)
  }
}

function handleProjects(url: URL, res: ServerResponse) {
  try {
    json(res, 200, getProjects({
      status: parseProjectStatus(readText(url, "status")),
      topic: readText(url, "topic"),
      limit: readNumber(url, "limit"),
      offset: readNumber(url, "offset"),
    }))
  } catch (err) {
    handleProjectError(err, res)
  }
}

function handleProjectById(id: string, res: ServerResponse) {
  try {
    json(res, 200, { project: getProject(id) })
  } catch (err) {
    handleProjectError(err, res)
  }
}

async function handleProjectCreate(req: IncomingMessage, res: ServerResponse) {
  const parsed = await readJsonObject<{ name?: unknown; summary?: unknown; topics?: unknown }>(req, res)
  if (!parsed) return
  try {
    const result = createProject({ name: parsed.name ?? "", summary: parsed.summary, topics: parsed.topics })
    json(res, 201, { eventId: result.event.id, project: result.project })
  } catch (err) {
    handleProjectError(err, res)
  }
}

async function handleProjectDetails(req: IncomingMessage, id: string, res: ServerResponse) {
  const parsed = await readJsonObject<{
    name?: unknown
    summary?: unknown
    topics?: unknown
    reason?: unknown
  }>(req, res)
  if (!parsed) return
  try {
    const result = changeProjectDetails({
      id,
      name: parsed.name,
      summary: parsed.summary,
      topics: parsed.topics,
      reason: parsed.reason,
    })
    json(res, 200, { eventId: result.event.id, project: result.project })
  } catch (err) {
    handleProjectError(err, res)
  }
}

async function handleProjectState(req: IncomingMessage, id: string, res: ServerResponse) {
  const parsed = await readJsonObject<{ status?: unknown; reason?: unknown }>(req, res)
  if (!parsed) return
  try {
    const result = changeProjectStatus({ id, status: parsed.status, reason: parsed.reason })
    json(res, 200, {
      eventId: result.event.id,
      project: result.project,
      ...(result.workingStateEvent ? { workingStateEventId: result.workingStateEvent.id } : {}),
    })
  } catch (err) {
    handleProjectError(err, res)
  }
}

function handleWorkingState(res: ServerResponse) {
  try {
    json(res, 200, { workingState: getWorkingState() })
  } catch (err) {
    handleWorkingStateError(err, res)
  }
}

function handleCaptures(url: URL, res: ServerResponse) {
  try {
    json(res, 200, getCaptures({
      type: parseCaptureType(readText(url, "type")),
      source: parseCaptureSource(readText(url, "source")),
      query: readText(url, "q"),
      limit: readNumber(url, "limit"),
      offset: readNumber(url, "offset"),
    }))
  } catch (err) {
    handleCaptureError(err, res)
  }
}

function handleCaptureById(id: string, res: ServerResponse) {
  try {
    json(res, 200, { capture: getCapture(id) })
  } catch (err) {
    handleCaptureError(err, res)
  }
}

async function handleCaptureCreate(req: IncomingMessage, res: ServerResponse) {
  const parsed = await readJsonObject<{
    type?: unknown
    text?: unknown
    requestId?: unknown
  }>(req, res)
  if (!parsed) return

  let requestId: string | undefined
  try {
    requestId = resolveIdempotencyKey(req, parsed.requestId)
  } catch (err) {
    if (err instanceof ChatRequestValidationError) return json(res, 400, { error: err.message })
    throw err
  }

  try {
    const result = await createCapture({
      type: parsed.type,
      text: parsed.text,
      requestId,
    })
    json(res, result.duplicate ? 200 : 202, {
      capture: result.capture,
      duplicate: result.duplicate,
    })
  } catch (err) {
    if (err instanceof EventIdentityConflictError) {
      json(res, 409, { error: "idempotency key conflict" })
      return
    }
    handleCaptureError(err, res)
  }
}

async function handleWorkingStateChange(req: IncomingMessage, res: ServerResponse) {
  const parsed = await readJsonObject<{
    currentProjectId?: unknown
    activeTopics?: unknown
    currentQuestions?: unknown
    mode?: unknown
    reason?: unknown
  }>(req, res)
  if (!parsed) return
  try {
    const result = changeWorkingState({
      currentProjectId: parsed.currentProjectId,
      activeTopics: parsed.activeTopics,
      currentQuestions: parsed.currentQuestions,
      mode: parsed.mode,
      reason: parsed.reason,
    })
    json(res, 200, { eventId: result.event.id, workingState: result.workingState })
  } catch (err) {
    handleWorkingStateError(err, res)
  }
}

async function handleTodoState(req: IncomingMessage, id: string, res: ServerResponse) {
  const parsed = await readJsonObject<{ status?: unknown; reason?: unknown }>(req, res)
  if (!parsed) return
  try {
    const result = changeTodoStatus({
      id,
      status: parsed.status,
      reason: parsed.reason ?? "",
    })
    json(res, 200, { eventId: result.event.id, todo: result.todo })
  } catch (err) {
    handleTodoError(err, res)
  }
}

function handleMemoryProposals(url: URL, res: ServerResponse) {
  try {
    json(res, 200, getMemoryProposals({
      status: parseMemoryProposalStatus(readText(url, "status")),
      sourceEventId: readText(url, "sourceEventId"),
      limit: readNumber(url, "limit"),
      offset: readNumber(url, "offset"),
    }))
  } catch (err) {
    handleMemoryWriteError(err, res)
  }
}

function handleMemorySearch(url: URL, res: ServerResponse) {
  try {
    json(res, 200, getMemorySearch({
      query: readText(url, "q") ?? "",
      limit: readNumber(url, "limit"),
    }))
  } catch (err) {
    handleMemoryWriteError(err, res)
  }
}

async function handleMemoryProfileCorrection(req: IncomingMessage, res: ServerResponse) {
  const parsed = await readJsonObject<{ key?: string; value?: unknown; reason?: string }>(req, res)
  if (!parsed) return

  try {
    const result = correctMemoryProfile({
      key: parsed.key ?? "",
      value: parsed.value,
      reason: parsed.reason,
    })
    json(res, 200, {
      eventId: result.event.id,
      profile: result.profile,
    })
  } catch (err) {
    if (err instanceof MemoryValidationError) {
      return json(res, 400, { error: err.message })
    }
    throw err
  }
}

async function handleMemoryProfileState(req: IncomingMessage, res: ServerResponse) {
  const parsed = await readJsonObject<{ id?: string; state?: string; reason?: string }>(req, res)
  if (!parsed) return

  try {
    const result = changeMemoryProfileState({
      id: parsed.id ?? "",
      state: parsed.state as never,
      reason: parsed.reason ?? "",
    })
    json(res, 200, { eventId: result.event.id, profile: result.profile })
  } catch (err) {
    handleMemoryWriteError(err, res)
  }
}

async function handleMemoryTopicState(req: IncomingMessage, res: ServerResponse) {
  const parsed = await readJsonObject<{ id?: string; state?: string; reason?: string }>(req, res)
  if (!parsed) return

  try {
    const result = changeMemoryTopicState({
      id: parsed.id ?? "",
      state: parsed.state as never,
      reason: parsed.reason ?? "",
    })
    json(res, 200, { eventId: result.event.id, topic: result.topic })
  } catch (err) {
    handleMemoryWriteError(err, res)
  }
}

async function handler(req: IncomingMessage, res: ServerResponse, onShutdownRequest?: () => void) {
  applyCorsHeaders(req, res)

  if (req.method === "OPTIONS") {
    const origin = req.headers.origin
    if (origin && !config.allowedOrigins.includes(origin)) {
      return json(res, 403, { error: "origin not allowed" })
    }
    res.writeHead(204)
    res.end()
    return
  }

  const requestUrl = new URL(req.url || "/", "http://localhost")
  const url = requestUrl.pathname

  try {
    if (url === "/api/chat" && req.method === "POST") {
      return await handleChat(req, res)
    }
    if (url === "/api/ai/test" && req.method === "POST") {
      return await handleAiConnectionTest(req, res)
    }
    if (url === "/health" && req.method === "GET") {
      return handleHealth(req, res)
    }
    if (url === "/api/runtime/shutdown" && req.method === "POST") {
      return handleRuntimeShutdown(req, res, onShutdownRequest)
    }
    if (url === "/ready" && req.method === "GET") {
      return handleReady(req, res)
    }
    if (url === "/api/events" && req.method === "GET") {
      return handleEvents(requestUrl, res)
    }
    const eventMatch = /^\/api\/events\/([^/]+)$/.exec(url)
    if (eventMatch && req.method === "GET") {
      return handleEventById(eventMatch[1], res)
    }
    if (url === "/api/conversations" && req.method === "GET") {
      return handleConversations(requestUrl, res)
    }
    const conversationHistoryMatch = /^\/api\/conversations\/([^/]+)$/.exec(url)
    if (conversationHistoryMatch && req.method === "GET") {
      return handleConversationHistoryById(conversationHistoryMatch[1], res)
    }
    if (url === "/api/status" && req.method === "GET") {
      return handleStatus(req, res)
    }
    if (url === "/api/calendar" && req.method === "GET") {
      return handleCalendar(requestUrl, res)
    }
    if (url === "/api/calendar/events" && req.method === "POST") {
      return await handleCalendarEventCreate(req, res)
    }
    if (url === "/api/calendar/events/bulk" && req.method === "POST") {
      return await handleCalendarEventBulkCreate(req, res)
    }
    const calendarEventMatch = /^\/api\/calendar\/events\/([^/]+)$/.exec(url)
    if (calendarEventMatch && req.method === "PATCH") {
      return await handleCalendarEventUpdate(req, decodeURIComponent(calendarEventMatch[1]), res)
    }
    if (calendarEventMatch && req.method === "DELETE") {
      return await handleCalendarEventDelete(req, decodeURIComponent(calendarEventMatch[1]), res)
    }
    if (url === "/api/calendar/tags" && req.method === "POST") {
      return await handleCalendarTagCreate(req, res)
    }
    const calendarTagMatch = /^\/api\/calendar\/tags\/([^/]+)$/.exec(url)
    if (calendarTagMatch && req.method === "PATCH") {
      return await handleCalendarTagUpdate(req, decodeURIComponent(calendarTagMatch[1]), res)
    }
    if (calendarTagMatch && req.method === "DELETE") {
      return await handleCalendarTagDelete(req, decodeURIComponent(calendarTagMatch[1]), res)
    }
    if (url === "/api/background-jobs" && req.method === "GET") {
      return handleBackgroundJobs(requestUrl, res)
    }
    const retryJobMatch = /^\/api\/background-jobs\/([^/]+)\/retry$/.exec(url)
    if (retryJobMatch && req.method === "POST") {
      return handleBackgroundJobRetry(decodeURIComponent(retryJobMatch[1]), res)
    }
    if (url === "/api/working-state" && req.method === "GET") {
      return handleWorkingState(res)
    }
    if (url === "/api/working-state" && req.method === "POST") {
      return await handleWorkingStateChange(req, res)
    }
    if (url === "/api/captures" && req.method === "GET") {
      return handleCaptures(requestUrl, res)
    }
    if (url === "/api/captures" && req.method === "POST") {
      return await handleCaptureCreate(req, res)
    }
    const captureMatch = /^\/api\/captures\/([^/]+)$/.exec(url)
    if (captureMatch && req.method === "GET") {
      return handleCaptureById(captureMatch[1], res)
    }
    if (url === "/api/todos" && req.method === "GET") {
      return handleTodos(requestUrl, res)
    }
    if (url === "/api/todos" && req.method === "POST") {
      return await handleTodoCreate(req, res)
    }
    const todoProjectMatch = /^\/api\/todos\/([^/]+)\/project$/.exec(url)
    if (todoProjectMatch && req.method === "POST") {
      return await handleTodoProject(req, todoProjectMatch[1], res)
    }
    const todoStateMatch = /^\/api\/todos\/([^/]+)\/state$/.exec(url)
    if (todoStateMatch && req.method === "POST") {
      return await handleTodoState(req, todoStateMatch[1], res)
    }
    const todoMatch = /^\/api\/todos\/([^/]+)$/.exec(url)
    if (todoMatch && req.method === "GET") {
      return handleTodoById(todoMatch[1], res)
    }
    if (url === "/api/projects" && req.method === "GET") {
      return handleProjects(requestUrl, res)
    }
    if (url === "/api/projects" && req.method === "POST") {
      return await handleProjectCreate(req, res)
    }
    const projectDetailsMatch = /^\/api\/projects\/([^/]+)\/details$/.exec(url)
    if (projectDetailsMatch && req.method === "POST") {
      return await handleProjectDetails(req, projectDetailsMatch[1], res)
    }
    const projectStateMatch = /^\/api\/projects\/([^/]+)\/state$/.exec(url)
    if (projectStateMatch && req.method === "POST") {
      return await handleProjectState(req, projectStateMatch[1], res)
    }
    const projectMatch = /^\/api\/projects\/([^/]+)$/.exec(url)
    if (projectMatch && req.method === "GET") {
      return handleProjectById(projectMatch[1], res)
    }
    if (url === "/api/analysis-jobs" && req.method === "GET") {
      return handleAnalysisJobs(requestUrl, res)
    }
    if (url === "/api/conversation-jobs" && req.method === "GET") {
      return handleConversationJobs(requestUrl, res)
    }
    const conversationJobRetryMatch = /^\/api\/conversation-jobs\/([^/]+)\/retry$/.exec(url)
    if (conversationJobRetryMatch && req.method === "POST") {
      return await handleConversationJobRetry(req, conversationJobRetryMatch[1], res)
    }
    const analysisJobRetryMatch = /^\/api\/analysis-jobs\/([^/]+)\/retry$/.exec(url)
    if (analysisJobRetryMatch && req.method === "POST") {
      return await handleAnalysisJobRetry(req, analysisJobRetryMatch[1], res)
    }
    if (url === "/api/memory" && req.method === "GET") {
      return handleMemoryOverview(requestUrl, res)
    }
    if (url === "/api/memory/topics" && req.method === "GET") {
      return handleMemoryTopics(requestUrl, res)
    }
    if (url === "/api/memory/profile" && req.method === "GET") {
      return handleMemoryProfile(requestUrl, res)
    }
    if (url === "/api/memory/timeline" && req.method === "GET") {
      return handleMemoryTimeline(requestUrl, res)
    }
    if (url === "/api/memory/sources" && req.method === "GET") {
      return handleMemorySources(requestUrl, res)
    }
    if (url === "/api/memory/proposals" && req.method === "GET") {
      return handleMemoryProposals(requestUrl, res)
    }
    if (url === "/api/memory/search" && req.method === "GET") {
      return handleMemorySearch(requestUrl, res)
    }
    const memoryProposalReviewMatch = /^\/api\/memory\/proposals\/([^/]+)\/review$/.exec(url)
    if (memoryProposalReviewMatch && req.method === "POST") {
      return await handleMemoryProposalReview(req, memoryProposalReviewMatch[1], res)
    }
    if (url === "/api/memory/profile/corrections" && req.method === "POST") {
      return await handleMemoryProfileCorrection(req, res)
    }
    if (url === "/api/memory/profile/state" && req.method === "POST") {
      return await handleMemoryProfileState(req, res)
    }
    if (url === "/api/memory/topics/state" && req.method === "POST") {
      return await handleMemoryTopicState(req, res)
    }
    if (url === "/api/daily-summaries" && req.method === "POST") {
      return await handleDailySummaryGeneration(req, res)
    }
    if (url === "/api/daily-summaries" && req.method === "GET") {
      return handleDailySummaries(requestUrl, res)
    }
    if (url === "/api/archives/obsidian/snapshot" && req.method === "POST") {
      return await handlePersonaSnapshotArchive(req, res)
    }
    const dailySummaryArchiveMatch = /^\/api\/daily-summaries\/(\d{4}-\d{2}-\d{2})\/archive$/.exec(url)
    if (dailySummaryArchiveMatch && req.method === "POST") {
      return await handleDailySummaryArchive(req, dailySummaryArchiveMatch[1], res)
    }
    const dailySummaryMatch = /^\/api\/daily-summaries\/(\d{4}-\d{2}-\d{2})$/.exec(url)
    if (dailySummaryMatch && req.method === "GET") {
      return handleDailySummaryByDate(dailySummaryMatch[1], res)
    }
    json(res, 404, { error: "not found" })
  } catch (err) {
    console.error("[api error]", err instanceof Error ? err.message : err)
    json(res, 500, { error: "internal error" })
  }
}

async function readJsonObject<T extends Record<string, unknown>>(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<T | null> {
  if (readMediaType(req) !== "application/json") {
    json(res, 415, { error: "content-type must be application/json" })
    return null
  }

  const contentLength = Number(req.headers["content-length"])
  if (Number.isFinite(contentLength) && contentLength > MAX_JSON_BODY_BYTES) {
    req.resume()
    json(res, 413, { error: "request body too large" })
    return null
  }

  let body: string
  try {
    body = await readBody(req, MAX_JSON_BODY_BYTES)
  } catch (err) {
    if (err instanceof RequestBodyTooLargeError) {
      json(res, 413, { error: "request body too large" })
      return null
    }
    throw err
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(body) as unknown
  } catch {
    json(res, 400, { error: "invalid json" })
    return null
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    json(res, 400, { error: "json object required" })
    return null
  }

  return parsed as T
}

function readMediaType(req: IncomingMessage): string {
  const contentType = req.headers["content-type"]
  const value = Array.isArray(contentType) ? contentType[0] : contentType
  return value?.split(";", 1)[0].trim().toLowerCase() ?? ""
}

class RequestBodyTooLargeError extends Error {}
class ChatRequestValidationError extends Error {}

function handleMemoryWriteError(err: unknown, res: ServerResponse): void {
  if (err instanceof MemoryValidationError) {
    json(res, 400, { error: err.message })
    return
  }
  if (err instanceof MemoryNotFoundError) {
    json(res, 404, { error: err.message })
    return
  }
  if (err instanceof MemoryConflictError) {
    json(res, 409, { error: err.message })
    return
  }
  throw err
}

function handleTodoError(err: unknown, res: ServerResponse): void {
  if (err instanceof TodoValidationError) {
    json(res, 400, { error: err.message })
    return
  }
  if (err instanceof TodoNotFoundError) {
    json(res, 404, { error: err.message })
    return
  }
  if (err instanceof TodoConflictError) {
    json(res, 409, { error: err.message })
    return
  }
  throw err
}

function handleProjectError(err: unknown, res: ServerResponse): void {
  if (err instanceof ProjectValidationError) {
    json(res, 400, { error: err.message })
    return
  }
  if (err instanceof ProjectNotFoundError) {
    json(res, 404, { error: err.message })
    return
  }
  if (err instanceof ProjectConflictError) {
    json(res, 409, { error: err.message })
    return
  }
  throw err
}

function handleWorkingStateError(err: unknown, res: ServerResponse): void {
  if (err instanceof WorkingStateValidationError) {
    json(res, 400, { error: err.message })
    return
  }
  if (err instanceof WorkingStateNotFoundError) {
    json(res, 404, { error: err.message })
    return
  }
  if (err instanceof WorkingStateConflictError) {
    json(res, 409, { error: err.message })
    return
  }
  throw err
}

function handleCaptureError(err: unknown, res: ServerResponse): void {
  if (err instanceof CaptureValidationError) {
    json(res, 400, { error: err.message })
    return
  }
  if (err instanceof CaptureNotFoundError) {
    json(res, 404, { error: err.message })
    return
  }
  throw err
}

function handleEventFeedError(err: unknown, res: ServerResponse): void {
  if (err instanceof EventFeedValidationError) {
    json(res, 400, { error: err.message })
    return
  }
  if (err instanceof EventFeedNotFoundError) {
    json(res, 404, { error: err.message })
    return
  }
  throw err
}

function handleConversationHistoryError(err: unknown, res: ServerResponse): void {
  if (err instanceof ConversationHistoryValidationError) {
    json(res, 400, { error: err.message })
    return
  }
  if (err instanceof ConversationHistoryNotFoundError) {
    json(res, 404, { error: err.message })
    return
  }
  throw err
}

function handleAnalysisJobError(err: unknown, res: ServerResponse): void {
  if (err instanceof AnalysisJobValidationError) {
    json(res, 400, { error: err.message })
    return
  }
  if (err instanceof AnalysisJobNotFoundError) {
    json(res, 404, { error: err.message })
    return
  }
  if (err instanceof AnalysisJobConflictError) {
    json(res, 409, { error: err.message })
    return
  }
  throw err
}

function handleConversationJobError(err: unknown, res: ServerResponse): void {
  if (err instanceof ConversationJobValidationError) {
    json(res, 400, { error: err.message })
    return
  }
  if (err instanceof ConversationJobNotFoundError) {
    json(res, 404, { error: err.message })
    return
  }
  if (err instanceof ConversationJobConflictError) {
    json(res, 409, { error: err.message })
    return
  }
  if (err instanceof ConversationExecutionError) {
    json(res, 500, {
      error: err.message,
      eventId: err.sourceEventId,
      conversationJobId: err.jobId,
    })
    return
  }
  throw err
}

function handleDailySummaryError(err: unknown, res: ServerResponse): void {
  if (err instanceof DailySummaryValidationError) {
    json(res, 400, { error: err.message })
    return
  }
  if (err instanceof DailySummaryNotFoundError) {
    json(res, 404, { error: err.message })
    return
  }
  if (err instanceof DailySummaryArchiveConflictError) {
    json(res, 409, { error: err.message })
    return
  }
  if (err instanceof DailySummaryArchiveUnavailableError) {
    json(res, 503, { error: err.message })
    return
  }
  throw err
}

function handleCalendarError(err: unknown, res: ServerResponse): void {
  if (err instanceof CalendarValidationError) {
    json(res, 400, { error: err.message })
    return
  }
  if (err instanceof CalendarNotFoundError) {
    json(res, 404, { error: err.message })
    return
  }
  if (err instanceof CalendarConflictError) {
    json(res, 409, { error: err.message })
    return
  }
  throw err
}

function handleBackgroundJobError(err: unknown, res: ServerResponse): void {
  if (err instanceof BackgroundJobNotFoundError) {
    json(res, 404, { error: err.message })
    return
  }
  if (err instanceof BackgroundJobConflictError) {
    json(res, 409, { error: err.message })
    return
  }
  throw err
}

function readNumber(url: URL, key: string): number | undefined {
  const value = url.searchParams.get(key)
  if (value === null || value.trim() === "") return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function readText(url: URL, key: string): string | undefined {
  const value = url.searchParams.get(key)?.trim()
  return value ? value : undefined
}

function isTimelineType(value: string | undefined): value is "insight" | "shift" | "milestone" {
  return value === "insight" || value === "shift" || value === "milestone"
}

function isBackgroundJobStatus(value: string | undefined): value is BackgroundJobStatus {
  return value === "queued" || value === "running" || value === "succeeded" || value === "failed"
}

function getEventPreview(payloadText: string): string {
  try {
    const payload = JSON.parse(payloadText) as Record<string, unknown>
    const text = payload.text
    return typeof text === "string" ? text.slice(0, 80) : ""
  } catch {
    return ""
  }
}

function applyCorsHeaders(req: IncomingMessage, res: ServerResponse): void {
  for (const [name, value] of Object.entries(CORS_HEADERS)) {
    res.setHeader(name, value)
  }

  const origin = req.headers.origin
  if (origin && config.allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin)
    res.setHeader("Vary", "Origin")
  }
}

async function handleDailySummaryGeneration(req: IncomingMessage, res: ServerResponse) {
  const parsed = await readJsonObject<{ date?: string }>(req, res)
  if (!parsed) return

  try {
    json(res, 200, await generateDailySummary({ date: parsed.date }))
  } catch (err) {
    handleDailySummaryError(err, res)
  }
}

function handleDailySummaries(url: URL, res: ServerResponse) {
  json(res, 200, {
    items: getDailySummaries({
      limit: readNumber(url, "limit"),
      offset: readNumber(url, "offset"),
    }),
  })
}

function handleDailySummaryByDate(date: string, res: ServerResponse) {
  try {
    json(res, 200, { note: getDailySummary(date) })
  } catch (err) {
    handleDailySummaryError(err, res)
  }
}

function resolveIdempotencyKey(req: IncomingMessage, bodyValue: unknown): string | undefined {
  const headerValue = req.headers["idempotency-key"]
  if (Array.isArray(headerValue)) throw new ChatRequestValidationError("idempotency key is invalid")
  if (bodyValue !== undefined && typeof bodyValue !== "string") {
    throw new ChatRequestValidationError("requestId must be a string")
  }
  const headerKey = headerValue?.trim() || ""
  const bodyKey = typeof bodyValue === "string" ? bodyValue.trim() : ""
  if (headerKey && bodyKey && headerKey !== bodyKey) {
    throw new ChatRequestValidationError("requestId does not match Idempotency-Key")
  }
  const key = headerKey || bodyKey
  if (!key) return undefined
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(key)) {
    throw new ChatRequestValidationError("idempotency key is invalid")
  }
  return key
}

function getSafeHealthCounters(): {
  eventsToday: number
  analysisJobs: { pending: number; running: number; succeeded: number; failed: number }
  backgroundTasks: ReturnType<typeof getBackgroundTaskStats>
} {
  try {
    return {
      eventsToday: countConversationEventsToday(),
      analysisJobs: getAnalysisJobsStatus(),
      backgroundTasks: getBackgroundTaskStats(),
    }
  } catch {
    return {
      eventsToday: 0,
      analysisJobs: { pending: 0, running: 0, succeeded: 0, failed: 0 },
      backgroundTasks: {
        queued: 0,
        running: 0,
        failed: 0,
        succeeded: 0,
        inMemory: 0,
        pending: 0,
      },
    }
  }
}

async function handleMemoryProposalReview(req: IncomingMessage, id: string, res: ServerResponse) {
  const parsed = await readJsonObject<{ decision?: string; reason?: string }>(req, res)
  if (!parsed) return

  try {
    const result = reviewMemoryProposal({
      id,
      decision: parsed.decision as never,
      reason: parsed.reason ?? "",
    })
    json(res, 200, {
      eventId: result.event.id,
      proposal: result.proposal,
      profile: result.profile,
    })
  } catch (err) {
    handleMemoryWriteError(err, res)
  }
}

function handleAnalysisJobs(url: URL, res: ServerResponse) {
  try {
    const limit = readNumber(url, "limit")
    const offset = readNumber(url, "offset")
    json(res, 200, {
      items: getAnalysisJobs({
        status: parseAnalysisJobStatus(readText(url, "status")),
        limit,
        offset,
      }),
      limit: normalizePageLimit(limit),
      offset: normalizePageOffset(offset),
    })
  } catch (err) {
    handleAnalysisJobError(err, res)
  }
}

function handleConversationJobs(url: URL, res: ServerResponse) {
  try {
    const limit = readNumber(url, "limit")
    const offset = readNumber(url, "offset")
    json(res, 200, {
      items: getConversationJobs({
        status: parseConversationJobStatus(readText(url, "status")),
        limit,
        offset,
      }),
      limit: normalizePageLimit(limit),
      offset: normalizePageOffset(offset),
    })
  } catch (err) {
    handleConversationJobError(err, res)
  }
}

async function handleConversationJobRetry(req: IncomingMessage, id: string, res: ServerResponse) {
  const parsed = await readJsonObject<Record<string, never>>(req, res)
  if (!parsed) return
  try {
    const result = await retryConversationJob(id)
    json(res, 200, {
      job: result.job,
      retryEventId: result.retryEventId,
      reply: result.companionReply,
      eventId: result.job.sourceEventId,
      replyEventId: result.replyEvent.id,
    })
  } catch (err) {
    handleConversationJobError(err, res)
  }
}

async function handleAnalysisJobRetry(req: IncomingMessage, id: string, res: ServerResponse) {
  const parsed = await readJsonObject<Record<string, never>>(req, res)
  if (!parsed) return
  try {
    json(res, 202, retryAnalysisJob(id))
  } catch (err) {
    handleAnalysisJobError(err, res)
  }
}

async function handleDailySummaryArchive(req: IncomingMessage, date: string, res: ServerResponse) {
  const parsed = await readJsonObject<Record<string, never>>(req, res)
  if (!parsed) return

  try {
    json(res, 200, archiveDailySummary(date))
  } catch (err) {
    handleDailySummaryError(err, res)
  }
}

async function handlePersonaSnapshotArchive(req: IncomingMessage, res: ServerResponse) {
  const parsed = await readJsonObject<Record<string, never>>(req, res)
  if (!parsed) return

  try {
    json(res, 200, archivePersonaSnapshot())
  } catch (err) {
    if (err instanceof PersonaSnapshotArchiveConflictError) {
      json(res, 409, { error: err.message })
      return
    }
    if (err instanceof PersonaSnapshotArchiveUnavailableError) {
      json(res, 503, { error: err.message })
      return
    }
    throw err
  }
}

function normalizePageLimit(value: number | undefined): number {
  if (value === undefined) return 20
  if (!Number.isFinite(value)) return 1
  return Math.min(100, Math.max(1, Math.floor(value)))
}

function normalizePageOffset(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return 0
  return Math.max(0, Math.floor(value))
}

export interface ApiServerOptions {
  port?: number
  hostname?: string
  onShutdownRequest?: () => void
}

export function createApiServer(options: Pick<ApiServerOptions, "onShutdownRequest"> = {}): Server {
  return createServer((req, res) => handler(req, res, options.onShutdownRequest))
}

export function startApiServer(options: ApiServerOptions = {}): Server {
  const server = createApiServer(options)
  const port = options.port ?? config.apiPort
  const hostname = options.hostname ?? config.apiHost

  startBackgroundTaskWorker()
  server.listen(port, hostname, () => {
    console.log(`api server listening on http://${hostname}:${port}`)
  })

  return server
}

export function stopApiServer(server: Server): Promise<void> {
  stopBackgroundTaskWorker()
  return new Promise((resolve, reject) => {
    server.close((err) => {
      if (err) reject(err)
      else resolve()
    })
  })
}

function handleRuntimeShutdown(req: IncomingMessage, res: ServerResponse, onShutdownRequest?: () => void): void {
  if (!isLoopbackAddress(req.socket.remoteAddress)) {
    json(res, 403, { error: "local access only" })
    return
  }
  if (!onShutdownRequest) {
    json(res, 409, { error: "runtime shutdown is unavailable" })
    return
  }

  json(res, 202, { stopping: true })
  setImmediate(onShutdownRequest)
}

function isLoopbackAddress(address: string | undefined): boolean {
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1"
}
