package site.knotcloud.persona.reminders

import android.content.*
import site.knotcloud.persona.data.SyncWorker

class BootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    ReminderScheduler.reschedule(context)
    SyncWorker.enqueue(context)
  }
}
