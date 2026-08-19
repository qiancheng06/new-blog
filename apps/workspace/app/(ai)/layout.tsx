import type { Metadata } from "next"
import { AiConsoleShell } from "@/features/ai-console/AiConsoleShell"
import "../globals.css"
import "../workspace-theme.css"
import "../ai-console.css"

export const metadata: Metadata = {
  title: {
    default: "AI 中心 | Persona",
    template: "%s | Persona AI",
  },
  description: "Persona 的 AI 对话、模型连接与记忆管理模块。",
}

export default function AiLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var v=JSON.parse(localStorage.getItem('persona-workspace-appearance')||'{}');var t=v.theme||'light';document.documentElement.dataset.theme=t==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):t;document.documentElement.dataset.motion=v.motion===false?'off':'on';document.documentElement.style.setProperty('--accent-hue',String(v.accentHue||165));}catch(e){document.documentElement.dataset.theme='light';}})();`,
          }}
        />
      </head>
      <body>
        <AiConsoleShell>{children}</AiConsoleShell>
      </body>
    </html>
  )
}
