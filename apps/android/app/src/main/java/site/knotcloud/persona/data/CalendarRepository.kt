package site.knotcloud.persona.data

import android.content.Context
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import androidx.room.Room
import site.knotcloud.persona.reminders.ReminderScheduler

class CalendarRepository(private val context: Context, private val api: MobileApi) {
  private val db = Room.databaseBuilder(context, PersonaDatabase::class.java, "persona-cache.db").fallbackToDestructiveMigration().build()
  fun cached(): Flow<List<CachedCalendarEvent>> = flow { emit(db.calendarDao().all()) }
  suspend fun sync(from: String, to: String): Result<List<CachedCalendarEvent>> = runCatching {
    val response = api.calendar(from, to)
    db.calendarDao().all().forEach { ReminderScheduler.cancel(context, it.id) }
    val cached = response.events.map { event -> CachedCalendarEvent(event.id, event.title, event.notes, event.tagId, event.completed, event.schedule.startsAt ?: event.schedule.startDate.orEmpty(), event.schedule.endsAt ?: event.schedule.endDate.orEmpty(), event.schedule.timeZone.orEmpty(), event.version, event.updatedAt) }
    db.calendarDao().replace(cached)
    response.events.forEach { event -> ReminderScheduler.scheduleEvent(context, event) }
    cached
  }
}
