package site.knotcloud.persona.data

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import java.time.LocalDate

sealed interface CalendarUiState {
  data object Loading : CalendarUiState
  data object Demo : CalendarUiState
  data class Live(val offline: Boolean, val eventCount: Int) : CalendarUiState
}

class CalendarViewModel(private val repository: CalendarRepository) : ViewModel() {
  private val _events = MutableStateFlow<List<CachedCalendarEvent>>(emptyList())
  val events: StateFlow<List<CachedCalendarEvent>> = _events
  private val _state = MutableStateFlow<CalendarUiState>(CalendarUiState.Loading)
  val state: StateFlow<CalendarUiState> = _state
  private val _offline = MutableStateFlow(false)
  val offline: StateFlow<Boolean> = _offline

  init {
    viewModelScope.launch {
      repository.cached().collect { list ->
        _events.value = list
        if (list.isEmpty() && _state.value is CalendarUiState.Loading) {
          _state.value = CalendarUiState.Demo
        }
      }
    }
  }

  fun refresh() {
    val today = LocalDate.now()
    viewModelScope.launch {
      val result = repository.sync(today.minusDays(30).toString(), today.plusDays(90).toString())
      _offline.value = result.isFailure
      _state.value = if (result.isSuccess) {
        CalendarUiState.Live(offline = false, eventCount = result.getOrDefault(emptyList()).size)
      } else if (_events.value.isNotEmpty()) {
        CalendarUiState.Live(offline = true, eventCount = _events.value.size)
      } else {
        CalendarUiState.Demo
      }
    }
  }
}
