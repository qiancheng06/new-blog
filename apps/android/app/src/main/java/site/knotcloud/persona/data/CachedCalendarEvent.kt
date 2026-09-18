package site.knotcloud.persona.data

import kotlinx.serialization.Serializable

@Serializable
data class CachedCalendarEvent(
  val id: String,
  val title: String,
  val notes: String,
  val tagId: String,
  val completed: Boolean,
  val start: String,
  val end: String,
  val timeZone: String,
  val version: Int,
  val updatedAt: String,
)
