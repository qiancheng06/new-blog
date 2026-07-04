import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "Persona Workspace",
  description: "Local workspace for projects, memory, and Companion.",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  )
}
