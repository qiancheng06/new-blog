import type { Metadata } from "next"
import { ToolsPage } from "@/features/tools/ToolsPage"

export const metadata: Metadata = { title: "工具" }

export default function ToolsRoutePage() {
  return <ToolsPage />
}
