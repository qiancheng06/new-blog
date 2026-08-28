package site.knotcloud.persona.reminders

import android.app.*
import android.content.*
import androidx.core.app.NotificationCompat

class ReminderReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val manager = context.getSystemService(NotificationManager::class.java)
    manager.createNotificationChannel(NotificationChannel("calendar", "日历提醒", NotificationManager.IMPORTANCE_HIGH))
    manager.notify(intent.getIntExtra("notificationId", 0), NotificationCompat.Builder(context, "calendar").setSmallIcon(android.R.drawable.ic_popup_reminder).setContentTitle("Persona 日历提醒").setContentText(intent.getStringExtra("title") ?: "即将开始").setAutoCancel(true).build())
  }
}
