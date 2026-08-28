package site.knotcloud.persona.data

import androidx.room.*

@Entity(tableName = "calendar_events") data class CachedCalendarEvent(@PrimaryKey val id: String, val title: String, val notes: String, val tagId: String, val completed: Boolean, val start: String, val end: String, val timeZone: String, val version: Int, val updatedAt: String)
@Dao interface CalendarDao { @Query("SELECT * FROM calendar_events ORDER BY start") suspend fun all(): List<CachedCalendarEvent>; @Insert(onConflict = OnConflictStrategy.REPLACE) suspend fun replace(events: List<CachedCalendarEvent>); @Query("DELETE FROM calendar_events") suspend fun clear() }
@Database(entities = [CachedCalendarEvent::class], version = 1, exportSchema = true)
abstract class PersonaDatabase : RoomDatabase() { abstract fun calendarDao(): CalendarDao }
