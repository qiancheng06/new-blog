package site.knotcloud.persona.reminders

import android.app.*
import android.content.*
import site.knotcloud.persona.data.CalendarEvent

object ReminderScheduler {
  fun schedule(context: Context, eventId: String, title: String, atMillis: Long) {
    val alarm = context.getSystemService(AlarmManager::class.java)
    val intent = Intent(context, ReminderReceiver::class.java).putExtra("notificationId", eventId.hashCode()).putExtra("title", title)
    val pending = PendingIntent.getBroadcast(context, eventId.hashCode(), intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    if (android.os.Build.VERSION.SDK_INT >= 31 && alarm.canScheduleExactAlarms()) alarm.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, atMillis, pending)
    else if (android.os.Build.VERSION.SDK_INT >= 23) alarm.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, atMillis, pending) else alarm.set(AlarmManager.RTC_WAKEUP, atMillis, pending)
  }
  fun cancel(context: Context, eventId: String) {
    val pending = PendingIntent.getBroadcast(context, eventId.hashCode(), Intent(context, ReminderReceiver::class.java), PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE)
    if (pending != null) context.getSystemService(AlarmManager::class.java).cancel(pending)
  }
  fun reschedule(context: Context) { /* foreground/bootstrap schedules future events again */ }

  fun scheduleTimedEvent(context: Context, event: CalendarEvent, minutesBefore: Long) {
    val startsAt = event.schedule.startsAt ?: return
    val at = java.time.Instant.parse(startsAt).toEpochMilli() - minutesBefore * 60_000L
    if (at > System.currentTimeMillis()) schedule(context, event.id, event.title, at)
  }

  fun scheduleEvent(context: Context, event: CalendarEvent) {
    when (event.reminder.kind) {
      "before" -> event.reminder.minutes?.let { scheduleTimedEvent(context, event, it.toLong()) }
      "allDayAt" -> {
        val date = event.schedule.startDate ?: return
        val time = event.reminder.time ?: return
        val zone = java.time.ZoneId.systemDefault()
        val at = java.time.LocalDateTime.parse("${date}T$time").atZone(zone).toInstant().toEpochMilli()
        if (at > System.currentTimeMillis()) schedule(context, event.id, event.title, at)
      }
    }
  }
}
