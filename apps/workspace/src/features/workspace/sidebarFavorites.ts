"use client"

import { useCallback, useEffect, useState } from "react"

export interface SidebarFavorite {
  id: string
  label: string
  href: string
  kind: "ai" | "knowledge" | "tool" | "content"
}

export const SIDEBAR_FAVORITES_LIMIT = 5
export const SIDEBAR_FAVORITES_KEY = "persona-sidebar-favorites"
export const SIDEBAR_FAVORITES_EVENT = "persona-sidebar-favorites-change"
const BLOG_BASE_URL = process.env.NEXT_PUBLIC_BLOG_BASE_URL?.replace(/\/$/, "") || "http://127.0.0.1:5175"

export const suggestedSidebarFavorites: SidebarFavorite[] = [
  { id: "ai-models", label: "模型连接", href: "/ai/models", kind: "ai" },
  { id: "ai-memory", label: "AI 记忆", href: "/ai/memory", kind: "ai" },
  { id: "blog", label: "博客", href: `${BLOG_BASE_URL}/`, kind: "content" },
]

const defaultFavorites = suggestedSidebarFavorites.slice(0, 2)

export function useSidebarFavorites() {
  const [favorites, setFavorites] = useState<SidebarFavorite[]>(defaultFavorites)

  useEffect(() => {
    const sync = () => setFavorites(readSidebarFavorites())
    sync()
    window.addEventListener("storage", sync)
    window.addEventListener(SIDEBAR_FAVORITES_EVENT, sync)
    return () => {
      window.removeEventListener("storage", sync)
      window.removeEventListener(SIDEBAR_FAVORITES_EVENT, sync)
    }
  }, [])

  const toggleFavorite = useCallback((favorite: SidebarFavorite) => {
    const current = readSidebarFavorites()
    const exists = current.some((item) => item.id === favorite.id)
    const next = exists
      ? current.filter((item) => item.id !== favorite.id)
      : current.length < SIDEBAR_FAVORITES_LIMIT
        ? [...current, favorite]
        : current
    writeSidebarFavorites(next)
    setFavorites(next)
  }, [])

  return {
    favorites,
    toggleFavorite,
    isFavorite: (id: string) => favorites.some((item) => item.id === id),
    isFull: favorites.length >= SIDEBAR_FAVORITES_LIMIT,
  }
}

function readSidebarFavorites(): SidebarFavorite[] {
  const value = window.localStorage.getItem(SIDEBAR_FAVORITES_KEY)
  if (!value) return defaultFavorites
  try {
    const parsed = JSON.parse(value) as unknown
    if (!Array.isArray(parsed)) return defaultFavorites
    return parsed.filter(isSidebarFavorite).filter((item) => item.id !== "ai-settings").slice(0, SIDEBAR_FAVORITES_LIMIT)
  } catch {
    return defaultFavorites
  }
}

function writeSidebarFavorites(favorites: SidebarFavorite[]) {
  window.localStorage.setItem(SIDEBAR_FAVORITES_KEY, JSON.stringify(favorites))
  window.dispatchEvent(new Event(SIDEBAR_FAVORITES_EVENT))
}

function isSidebarFavorite(value: unknown): value is SidebarFavorite {
  if (!value || typeof value !== "object") return false
  const item = value as Partial<SidebarFavorite>
  return typeof item.id === "string"
    && typeof item.label === "string"
    && typeof item.href === "string"
    && ["ai", "knowledge", "tool", "content"].includes(item.kind ?? "")
}
