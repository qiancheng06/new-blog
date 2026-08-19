import type { Metadata } from "next"
import { AiChatPage } from "@/features/ai-console/AiChatPage"

export const metadata: Metadata = { title: "对话" }

export default function AiHomePage() {
  return <AiChatPage />
}
