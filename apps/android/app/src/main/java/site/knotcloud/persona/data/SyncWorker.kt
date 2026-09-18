package site.knotcloud.persona.data

import android.content.Context
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkerParameters
import androidx.work.WorkManager

class SyncWorker(context: Context, parameters: WorkerParameters) : CoroutineWorker(context, parameters) {
  override suspend fun doWork(): Result {
    val session = Session(TokenStore(applicationContext))
    if (!session.isPaired()) return Result.success()
    val api = createMobileApi(session)
    val result = CalendarRepository(applicationContext) { api }.sync()
    return if (result.isSuccess) Result.success() else Result.retry()
  }

  companion object {
    fun enqueue(context: Context) {
      val work = OneTimeWorkRequestBuilder<SyncWorker>()
        .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
        .build()
      WorkManager.getInstance(context).enqueueUniqueWork("persona-calendar-sync", androidx.work.ExistingWorkPolicy.KEEP, work)
    }
  }
}
