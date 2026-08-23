import type { Metadata } from "next"
import { PwaRegister } from "@/features/pwa/PwaRegister"
import { pwaMetadata, pwaViewport } from "@/features/pwa/pwaMetadata"
import "../globals.css"
import "../workspace-theme.css"

export const metadata: Metadata = {
  ...pwaMetadata,
  title: "Persona 工作台",
  description: "汇聚项目、待办、知识、记忆与 Companion 的本地工作台。",
}
export const viewport = pwaViewport

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var v=JSON.parse(localStorage.getItem('persona-workspace-appearance')||'{}');var t=v.theme||'light';document.documentElement.dataset.theme=t==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):t;document.documentElement.dataset.motion=v.motion===false?'off':'on';document.documentElement.style.setProperty('--accent-hue',String(v.accentHue||165));}catch(e){document.documentElement.dataset.theme='light';}})();`,
          }}
        />
      </head>
      <body><PwaRegister />{children}</body>
    </html>
  )
}
