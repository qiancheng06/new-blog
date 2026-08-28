package site.knotcloud.persona.data

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

class CalendarViewModel(private val repository: CalendarRepository) : ViewModel() {
  private val _events = MutableStateFlow<List<CachedCalendarEvent>>(emptyList())
  val events: StateFlow<List<CachedCalendarEvent>> = _events
  private val _offline = MutableStateFlow(false)
  val offline: StateFlow<Boolean> = _offline
  init { viewModelScope.launch { repository.cached().collect { _events.value = it } } }
  fun refresh(from: String, to: String) { viewModelScope.launch { _offline.value = repository.sync(from, to).isFailure } }
}
