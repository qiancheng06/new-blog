import type { Metadata } from "next"
import { AiSettingsPage } from "@/features/ai-console/AiSettingsPage"

export const metadata: Metadata = { title: "设置" }

export default function AiSettingsRoute() {
  return <AiSettingsPage />
}
