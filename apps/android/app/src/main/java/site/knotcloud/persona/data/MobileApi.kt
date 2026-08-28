package site.knotcloud.persona.data

import kotlinx.serialization.Serializable
import retrofit2.http.*

@Serializable data class TokenResponse(val deviceId: String, val accessToken: String, val accessExpiresAt: String, val refreshToken: String, val refreshExpiresAt: String)
@Serializable data class PairRequest(val code: String, val name: String = "Android device", val appVersion: String = "")
@Serializable data class CalendarResponse(val events: List<CalendarEvent>, val tags: List<CalendarTag>, val timeZone: String)
@Serializable data class CalendarTag(val id: String, val label: String, val tone: String, val sortOrder: Int, val version: Int, val createdAt: String, val updatedAt: String)
@Serializable data class CalendarEvent(val id: String, val title: String, val notes: String, val tagId: String, val completed: Boolean, val schedule: Schedule, val reminder: Reminder = Reminder(), val seriesId: String? = null, val version: Int, val createdAt: String, val updatedAt: String)
// The API uses an explicit `kind` discriminator, so a flat DTO is safer than
// Kotlin sealed-class polymorphism (which defaults to a `type` discriminator).
@Serializable data class Schedule(val kind: String, val startDate: String? = null, val endDate: String? = null, val startsAt: String? = null, val endsAt: String? = null, val timeZone: String? = null)
@Serializable data class Reminder(val kind: String = "none", val minutes: Int? = null, val time: String? = null)
@Serializable data class ChatRequest(val text: String, val requestId: String? = null)
@Serializable data class ChatResponse(val reply: String, val eventId: String)
@Serializable data class CaptureRequest(val type: String, val text: String, val requestId: String? = null)
@Serializable data class CaptureRecord(val id: String, val type: String, val text: String, val timestamp: String, val createdAt: String)
@Serializable data class CaptureResponse(val capture: CaptureRecord, val duplicate: Boolean = false)
@Serializable data class CalendarWrite(val title: String, val notes: String = "", val tagId: String, val completed: Boolean = false, val schedule: Schedule, val reminder: Reminder = Reminder())

interface MobileApi {
  @POST("api/mobile/v1/pair") suspend fun pair(@Body request: PairRequest): TokenResponse
  @POST("api/mobile/v1/token/refresh") suspend fun refresh(@Body body: Map<String, String>): TokenResponse
  @POST("api/mobile/v1/session/revoke") suspend fun revoke(): Unit
  @GET("api/mobile/v1/calendar") suspend fun calendar(@Query("from") from: String, @Query("to") to: String): CalendarResponse
  @POST("api/mobile/v1/calendar/events") suspend fun createEvent(@Body value: CalendarWrite): Map<String, CalendarEvent>
  @POST("api/mobile/v1/chat") suspend fun chat(@Body value: ChatRequest): ChatResponse
  @POST("api/mobile/v1/captures") suspend fun capture(@Body value: CaptureRequest): CaptureResponse
}
