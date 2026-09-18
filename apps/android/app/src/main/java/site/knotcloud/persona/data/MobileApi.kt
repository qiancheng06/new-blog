package site.knotcloud.persona.data

import kotlinx.serialization.Serializable
import retrofit2.http.*

@Serializable data class TokenResponse(val deviceId: String, val accessToken: String, val accessExpiresAt: String, val refreshToken: String, val refreshExpiresAt: String)
@Serializable data class PairRequest(val code: String, val name: String = "Android device", val appVersion: String = "")
@Serializable data class RefreshRequest(val refreshToken: String)
@Serializable data class BootstrapResponse(val deviceId: String, val calendar: CalendarResponse, val captures: CapturePage)
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
@Serializable data class CapturePage(val items: List<CaptureRecord> = emptyList(), val limit: Int = 0, val offset: Int = 0)
@Serializable data class CaptureResponse(val capture: CaptureRecord, val duplicate: Boolean = false)
@Serializable data class CalendarWrite(val title: String, val notes: String = "", val tagId: String, val completed: Boolean = false, val schedule: Schedule, val reminder: Reminder = Reminder())
@Serializable data class CalendarEventEnvelope(val event: CalendarEvent)
@Serializable data class CalendarDeleteResponse(val deleted: Boolean = true, val id: String = "", val version: Int? = null)

interface MobileApi {
  @POST("api/mobile/v1/pair") suspend fun pair(@Body request: PairRequest): TokenResponse
  @POST("api/mobile/v1/token/refresh") suspend fun refresh(@Body body: RefreshRequest): TokenResponse
  @POST("api/mobile/v1/session/revoke") suspend fun revoke(): Unit
  @GET("api/mobile/v1/bootstrap") suspend fun bootstrap(@Query("from") from: String, @Query("to") to: String): BootstrapResponse
  @GET("api/mobile/v1/calendar") suspend fun calendar(@Query("from") from: String, @Query("to") to: String): CalendarResponse
  @POST("api/mobile/v1/calendar/events") suspend fun createEvent(@Body value: CalendarWrite): CalendarEventEnvelope
  @PATCH("api/mobile/v1/calendar/events/{id}") suspend fun updateEvent(@Path("id") id: String, @Body value: Map<String, @JvmSuppressWildcards Any?>): CalendarEventEnvelope
  @HTTP(method = "DELETE", path = "api/mobile/v1/calendar/events/{id}", hasBody = true) suspend fun deleteEvent(@Path("id") id: String, @Body value: Map<String, @JvmSuppressWildcards Any?>): CalendarDeleteResponse
  @POST("api/mobile/v1/chat") suspend fun chat(@Body value: ChatRequest): ChatResponse
  @GET("api/mobile/v1/captures") suspend fun captures(@Query("limit") limit: Int = 20, @Query("offset") offset: Int = 0): CapturePage
  @POST("api/mobile/v1/captures") suspend fun capture(@Body value: CaptureRequest): CaptureResponse
}
