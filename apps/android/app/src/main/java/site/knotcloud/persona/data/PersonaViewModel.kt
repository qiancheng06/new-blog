package site.knotcloud.persona.data

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.util.UUID

data class ChatLine(val fromUser: Boolean, val text: String)

class PersonaViewModel(private val session: Session, private val api: MobileApi, private val calendar: CalendarRepository) : ViewModel() {
  private val _paired = MutableStateFlow(session.accessToken() != null)
  val paired: StateFlow<Boolean> = _paired
  private val _busy = MutableStateFlow(false)
  val busy: StateFlow<Boolean> = _busy
  private val _error = MutableStateFlow<String?>(null)
  val error: StateFlow<String?> = _error
  private val _chat = MutableStateFlow<List<ChatLine>>(emptyList())
  val chat: StateFlow<List<ChatLine>> = _chat
  private val _captures = MutableStateFlow<List<String>>(emptyList())
  val captures: StateFlow<List<String>> = _captures

  fun pair(code: String) = launch { session.save(api.pair(PairRequest(code))); _paired.value = true }
  fun sendChat(text: String) = launch { _chat.value = _chat.value + ChatLine(true, text); val reply = api.chat(ChatRequest(text, UUID.randomUUID().toString())); _chat.value = _chat.value + ChatLine(false, reply.reply) }
  fun saveCapture(type: String, text: String) = launch { val result = api.capture(CaptureRequest(type, text, UUID.randomUUID().toString())); _captures.value = listOf(result.capture.text) + _captures.value }
  fun addEvent(title: String) = launch { val start = java.time.OffsetDateTime.now().plusHours(1).withSecond(0).withNano(0); api.createEvent(CalendarWrite(title = title, tagId = "focus", schedule = Schedule("timed", startsAt = start.toString(), endsAt = start.plusHours(1).toString(), timeZone = java.time.ZoneId.systemDefault().id))); calendar.sync(LocalDate.now().minusDays(30).toString(), LocalDate.now().plusDays(90).toString()) }
  fun logout() = launch { runCatching { api.revoke() }; session.clear(); _paired.value = false }
  fun clearError() { _error.value = null }
  private fun launch(work: suspend () -> Unit) { viewModelScope.launch { _busy.value = true; _error.value = null; runCatching { work() }.onFailure { _error.value = it.message ?: "请求失败" }; _busy.value = false } }
}
