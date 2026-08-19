import type { Metadata } from "next"
import { AiMemoryPage } from "@/features/ai-console/AiMemoryPage"

export const metadata: Metadata = { title: "记忆" }

export default function AiMemoryRoute() {
  return <AiMemoryPage />
}
