import type { Metadata } from "next"
import { AiModelsPage } from "@/features/ai-console/AiModelsPage"

export const metadata: Metadata = { title: "模型连接" }

export default function AiModelSettingsPage() {
  return <AiModelsPage />
}
