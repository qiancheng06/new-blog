package site.knotcloud.persona.data

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import site.knotcloud.persona.BuildConfig
import java.util.UUID

data class ChatLine(val fromUser: Boolean, val text: String)

enum class ConnectionMode { Demo, Live }

data class PersonaUiState(
  val mode: ConnectionMode = ConnectionMode.Demo,
  val paired: Boolean = false,
  val deviceId: String? = null,
  val busy: Boolean = false,
  val error: String? = null,
  val chat: List<ChatLine> = emptyList(),
  val captures: List<CaptureRecord> = emptyList(),
  val captureSaved: Boolean = false,
  val pairingCodeHint: String = "在网页 Workspace 设置中生成配对码",
)

class PersonaViewModel(
  private val session: Session,
  private val apiProvider: () -> MobileApi?,
) : ViewModel() {
  private val _state = MutableStateFlow(PersonaUiState())
  val state: StateFlow<PersonaUiState> = _state

  init {
    val paired = session.isPaired()
    _state.value = _state.value.copy(
      paired = paired,
      mode = if (paired) ConnectionMode.Live else ConnectionMode.Demo,
      deviceId = session.deviceId(),
    )
  }

  fun sendChat(text: String) = launch {
    val value = text.trim()
    if (value.isEmpty()) return@launch
    _state.value = _state.value.copy(chat = _state.value.chat + ChatLine(true, value))
    val api = apiProvider()
    if (api != null && session.isPaired()) {
      val reply = api.chat(ChatRequest(text = value, requestId = UUID.randomUUID().toString()))
      _state.value = _state.value.copy(chat = _state.value.chat + ChatLine(false, reply.reply))
    } else {
      _state.value = _state.value.copy(
        chat = _state.value.chat + ChatLine(false, "我先记下来了。当前是本地演示模式；在设置中配对后即可连接 Persona API。"),
      )
    }
  }

  fun saveCapture(type: String, text: String) = launch {
    val value = text.trim()
    if (value.isEmpty()) return@launch
    val api = apiProvider()
    if (api != null && session.isPaired()) {
      val result = api.capture(CaptureRequest(type = type, text = value, requestId = UUID.randomUUID().toString()))
      _state.value = _state.value.copy(
        captures = listOf(result.capture) + _state.value.captures.filterNot { it.id == result.capture.id },
        captureSaved = true,
      )
    } else {
      val local = CaptureRecord(
        id = UUID.randomUUID().toString(),
        type = type,
        text = value,
        timestamp = java.time.Instant.now().toString(),
        createdAt = java.time.Instant.now().toString(),
      )
      _state.value = _state.value.copy(captures = listOf(local) + _state.value.captures, captureSaved = true)
    }
  }

  fun pair(code: String) = launch {
    val normalized = code.trim().uppercase()
    if (normalized.length < 8) {
      _state.value = _state.value.copy(error = "配对码至少 8 位")
      return@launch
    }
    val api = withContext(Dispatchers.IO) { createPairingApi() }
    val tokens = api.pair(
      PairRequest(
        code = normalized,
        name = android.os.Build.MODEL ?: "Android device",
        appVersion = BuildConfig.VERSION_NAME,
      ),
    )
    session.save(tokens)
    _state.value = _state.value.copy(
      paired = true,
      mode = ConnectionMode.Live,
      deviceId = tokens.deviceId,
      error = null,
      captureSaved = false,
    )
  }

  fun disconnect() = launch {
    val api = apiProvider()
    runCatching { api?.revoke() }
    session.clear()
    _state.value = _state.value.copy(
      paired = false,
      mode = ConnectionMode.Demo,
      deviceId = null,
      error = null,
    )
  }

  fun clearError() {
    _state.value = _state.value.copy(error = null, captureSaved = false)
  }

  private fun launch(work: suspend () -> Unit) {
    viewModelScope.launch {
      _state.value = _state.value.copy(busy = true, error = null, captureSaved = false)
      runCatching { work() }
        .onFailure { error ->
          _state.value = _state.value.copy(error = error.message ?: "请求失败")
        }
      _state.value = _state.value.copy(busy = false)
    }
  }

  companion object {
    fun factory(context: Context): ViewModelProvider.Factory = object : ViewModelProvider.Factory {
      @Suppress("UNCHECKED_CAST")
      override fun <T : ViewModel> create(modelClass: Class<T>): T {
        val session = Session(TokenStore(context.applicationContext))
        val api by lazy { createMobileApi(session) }
        return PersonaViewModel(session, { if (session.isPaired()) api else null }) as T
      }
    }
  }
}
