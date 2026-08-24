"use client"

import type { ReactNode } from "react"
import { MobileWorkspaceNav } from "./MobileWorkspaceNav"
import { WorkspaceSidebar } from "./WorkspaceSidebar"

interface ApplicationFrameProps {
  children: ReactNode
  className?: string
}

/** Keeps the workspace navigation identical when a user enters a dedicated module. */
export function ApplicationFrame({ children, className = "" }: ApplicationFrameProps) {
  return (
    <div className={`application-frame ${className}`.trim()}>
      <MobileWorkspaceNav />
      <aside className="application-frame-sidebar" aria-label="工作区侧栏">
        <WorkspaceSidebar />
      </aside>
      <div className="application-frame-content">{children}</div>
    </div>
  )
}
