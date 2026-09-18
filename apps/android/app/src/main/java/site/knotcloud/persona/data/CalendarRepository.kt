package site.knotcloud.persona.data

import android.content.Context
import android.content.SharedPreferences
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOn
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import site.knotcloud.persona.reminders.ReminderScheduler
import java.time.LocalDate

/** Lightweight JSON cache so the demo avoids Room/KSP on this Windows host. */
class CalendarRepository(
  private val context: Context,
  private val apiProvider: () -> MobileApi?,
) {
  private val prefs: SharedPreferences =
    context.getSharedPreferences("persona_calendar_cache", Context.MODE_PRIVATE)
  private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }
  private val cacheFlow = MutableStateFlow(readCache())

  fun cached(): Flow<List<CachedCalendarEvent>> = flow {
    emit(cacheFlow.value)
    cacheFlow.collect { emit(it) }
  }.flowOn(Dispatchers.Main)

  fun cachedSnapshot(): List<CachedCalendarEvent> = cacheFlow.value

  suspend fun sync(from: String = LocalDate.now().minusDays(30).toString(), to: String = LocalDate.now().plusDays(90).toString()): Result<List<CachedCalendarEvent>> =
    runCatching {
      val api = apiProvider() ?: error("Mobile API is not available until the device is paired")
      val response = api.calendar(from, to)
      val cached = response.events.map { event ->
        CachedCalendarEvent(
          id = event.id,
          title = event.title,
          notes = event.notes,
          tagId = event.tagId,
          completed = event.completed,
          start = event.schedule.startsAt ?: event.schedule.startDate.orEmpty(),
          end = event.schedule.endsAt ?: event.schedule.endDate.orEmpty(),
          timeZone = event.schedule.timeZone.orEmpty(),
          version = event.version,
          updatedAt = event.updatedAt,
        )
      }
      cacheFlow.value.forEach { ReminderScheduler.cancel(context, it.id) }
      writeCache(cached)
      cacheFlow.value = cached
      response.events.forEach { event -> ReminderScheduler.scheduleEvent(context, event) }
      cached
    }

  private fun readCache(): List<CachedCalendarEvent> {
    val raw = prefs.getString("events", null) ?: return emptyList()
    return runCatching { json.decodeFromString<List<CachedCalendarEvent>>(raw) }.getOrDefault(emptyList())
  }

  private fun writeCache(events: List<CachedCalendarEvent>) {
    prefs.edit().putString("events", json.encodeToString(events)).apply()
  }
}
