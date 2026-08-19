import type { Metadata } from "next"
import { CalendarWorkspace } from "@/features/calendar/CalendarWorkspace"

export const metadata: Metadata = {
  title: "日历",
  description: "Persona 工作台日程、待办投影与时间安排。",
}

export default function CalendarPage() {
  return <CalendarWorkspace />
}
