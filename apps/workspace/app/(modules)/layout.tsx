import type { Metadata } from "next"
import { ApplicationFrame } from "@/features/workspace/ApplicationFrame"
import "../globals.css"
import "../workspace-theme.css"
import "../modules.css"

export const metadata: Metadata = {
  title: { default: "Persona 模块", template: "%s | Persona" },
  description: "Persona 的知识库与 AI 工具模块。",
}

export default function ModulesLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var v=JSON.parse(localStorage.getItem('persona-workspace-appearance')||'{}');var t=v.theme||'light';document.documentElement.dataset.theme=t==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):t;document.documentElement.dataset.motion=v.motion===false?'off':'on';document.documentElement.style.setProperty('--accent-hue',String(v.accentHue||165));}catch(e){document.documentElement.dataset.theme='light';}})();`,
          }}
        />
      </head>
      <body><ApplicationFrame>{children}</ApplicationFrame></body>
    </html>
  )
}
