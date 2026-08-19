"use client"

import {
  BookOpen,
  BrainCircuit,
  Check,
  ChevronDown,
  LayoutDashboard,
  Plus,
  Settings2,
  Sparkles,
  Wrench,
} from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"
import { suggestedSidebarFavorites, useSidebarFavorites } from "./sidebarFavorites"

/**
 * 全站共用的工作区侧栏：四个核心模块保持稳定，细分功能在固定入口中呈现。
 */
export function WorkspaceSidebar() {
  const pathname = usePathname()
  const [pickerOpen, setPickerOpen] = useState(false)
  const { favorites, toggleFavorite, isFavorite, isFull } = useSidebarFavorites()
  const homeHref = pathname === "/" ? "#overview" : "/#overview"
  const moduleLinks = [
    { href: homeHref, label: "总览", icon: LayoutDashboard },
    { href: "/ai", label: "AI 中心", icon: BrainCircuit },
    { href: "/knowledge", label: "知识库", icon: BookOpen },
    { href: "/tools", label: "工具", icon: Wrench },
  ]

  return (
    <div className="workspace-sidebar">
      <Link className="workspace-switcher sidebar-card" href="/" aria-label="返回工作台首页" title="工作台首页">
        <div className="persona-avatar" role="img" aria-label="Persona 头像"><Sparkles size={20} /></div>
        <div><strong>Persona</strong><small>我的工作台</small></div>
        <ChevronDown size={16} className="switcher-chevron" />
      </Link>

      <section className="sidebar-card workspace-module-nav">
        <div className="sidebar-section-heading"><span>工作区</span></div>
        <nav aria-label="工作区模块">
          {moduleLinks.map((item) => (
            <Link key={item.href} className={isModuleActive(pathname, item.href) ? "active" : ""} href={item.href}>
              <item.icon size={15} />
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
      </section>

      <section className="sidebar-card sidebar-favorites">
        <div className="sidebar-section-heading">
          <span>固定</span>
          <button type="button" title="管理固定入口" aria-label="管理固定入口" aria-expanded={pickerOpen} onClick={() => setPickerOpen((current) => !current)}>
            <Plus size={14} />
          </button>
        </div>
        {pickerOpen ? (
          <div className="sidebar-favorite-picker" aria-label="可固定入口">
            {suggestedSidebarFavorites.map((item) => {
              const pinned = isFavorite(item.id)
              return (
                <button key={item.id} type="button" className={pinned ? "active" : ""} disabled={!pinned && isFull} onClick={() => toggleFavorite(item)}>
                  <span>{item.label}</span>
                  {pinned ? <Check size={13} /> : null}
                </button>
              )
            })}
          </div>
        ) : null}
        <nav aria-label="固定入口">
          {favorites.map((item) => (
            item.href.startsWith("http") ? (
              <a key={item.id} href={item.href} target="_blank" rel="noreferrer"><FavoriteMark kind={item.kind} /><span>{item.label}</span></a>
            ) : (
              <Link key={item.id} className={isFavoriteActive(pathname, item.href) ? "active" : ""} href={item.href}><FavoriteMark kind={item.kind} /><span>{item.label}</span></Link>
            )
          ))}
        </nav>
      </section>

      <div className="sidebar-footer">
        <Link className={pathname.startsWith("/ai/settings") ? "active" : ""} href="/ai/settings">
          <span className="sidebar-settings-icon"><Settings2 size={16} /></span>
          <span className="sidebar-settings-copy"><strong>设置</strong></span>
        </Link>
      </div>

    </div>
  )
}

function FavoriteMark({ kind }: { kind: "ai" | "knowledge" | "tool" | "content" }) {
  if (kind === "knowledge" || kind === "content") return <BookOpen size={14} />
  if (kind === "tool") return <Wrench size={14} />
  return <BrainCircuit size={14} />
}

function isModuleActive(pathname: string, href: string): boolean {
  if (href.includes("#overview")) return pathname === "/"
  return pathname === href || pathname.startsWith(`${href}/`)
}

function isFavoriteActive(pathname: string, href: string): boolean {
  const path = href.split("#")[0]
  return pathname === path
}
