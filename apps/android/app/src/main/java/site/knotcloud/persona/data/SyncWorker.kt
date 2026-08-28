package site.knotcloud.persona.data

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import java.time.LocalDate

class SyncWorker(context: Context, parameters: WorkerParameters) : CoroutineWorker(context, parameters) {
  override suspend fun doWork(): Result {
    val session = Session(TokenStore(applicationContext))
    if (session.accessToken() == null) return Result.success()
    val today = LocalDate.now()
    val result = CalendarRepository(applicationContext, createMobileApi(session)).sync(today.minusDays(30).toString(), today.plusDays(90).toString())
    return if (result.isSuccess) Result.success() else Result.retry()
  }
}
