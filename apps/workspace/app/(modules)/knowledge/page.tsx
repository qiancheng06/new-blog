import type { Metadata } from "next"
import { KnowledgeLibraryPage } from "@/features/knowledge/KnowledgeLibraryPage"

export const metadata: Metadata = { title: "知识库" }

export default function KnowledgePage() {
  return <KnowledgeLibraryPage />
}
