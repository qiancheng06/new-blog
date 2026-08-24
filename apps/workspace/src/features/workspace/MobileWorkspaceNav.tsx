"use client"

import { Menu, Sparkles, X } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { WorkspaceSidebar } from "./WorkspaceSidebar"

export function MobileWorkspaceNav() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => setOpen(false), [pathname])

  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      setOpen(false)
      triggerRef.current?.focus()
    }

    document.body.style.overflow = "hidden"
    window.addEventListener("keydown", closeOnEscape)
    requestAnimationFrame(() => closeRef.current?.focus())

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener("keydown", closeOnEscape)
    }
  }, [open])

  function closeDrawer(returnFocus = false) {
    setOpen(false)
    if (returnFocus) requestAnimationFrame(() => triggerRef.current?.focus())
  }

  return (
    <>
      <header className="mobile-workspace-nav">
        <Link className="mobile-workspace-home" href="/" aria-label="返回工作台首页">
          <span className="mobile-workspace-mark" aria-hidden="true"><Sparkles size={17} /></span>
          <span><strong>Persona</strong><small>工作台</small></span>
        </Link>
        <button
          ref={triggerRef}
          className="mobile-workspace-menu"
          type="button"
          title="打开导航"
          aria-label="打开导航"
          aria-controls="mobile-workspace-drawer"
          aria-expanded={open}
          onClick={() => setOpen(true)}
        >
          <Menu size={20} />
        </button>
      </header>

      <button
        className={`mobile-workspace-backdrop ${open ? "open" : ""}`}
        type="button"
        tabIndex={open ? 0 : -1}
        aria-label="关闭导航"
        aria-hidden={!open}
        onClick={() => closeDrawer(true)}
      />

      <aside
        id="mobile-workspace-drawer"
        className={`mobile-workspace-drawer ${open ? "open" : ""}`}
        aria-label="工作区导航"
        aria-hidden={!open}
      >
        <header>
          <strong>导航</strong>
          <button ref={closeRef} type="button" title="关闭导航" aria-label="关闭导航" onClick={() => closeDrawer(true)}>
            <X size={19} />
          </button>
        </header>
        <div
          className="mobile-workspace-drawer-scroll"
          onClickCapture={(event) => {
            if (event.target instanceof Element && event.target.closest("a")) closeDrawer()
          }}
        >
          <WorkspaceSidebar />
        </div>
      </aside>
    </>
  )
}
