"use client"

import { BookOpen, ExternalLink, FileText, Pin, RefreshCw, Search } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { getWorkspaceKnowledge, type KnowledgeCategory, type KnowledgePage } from "@/shared/data/workspaceData"
import { contentUrl } from "@/shared/data/workspaceSources"
import { useSidebarFavorites } from "@/features/workspace/sidebarFavorites"

export function KnowledgeLibraryPage() {
  const [categories, setCategories] = useState<KnowledgeCategory[]>([])
  const [selectedCategory, setSelectedCategory] = useState("all")
  const [query, setQuery] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const { toggleFavorite, isFavorite, isFull } = useSidebarFavorites()

  async function loadKnowledge() {
    setLoading(true)
    setError("")
    try {
      setCategories(await getWorkspaceKnowledge())
    } catch {
      setError("知识索引暂不可用，请先运行内容同步。")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadKnowledge() }, [])

  const allPages = useMemo(
    () => categories.flatMap((category) => category.pages.map((page) => ({ category, page }))),
    [categories],
  )
  const normalizedQuery = query.trim().toLowerCase()
  const visiblePages = useMemo(
    () => allPages.filter(({ category, page }) => {
      const categoryMatches = selectedCategory === "all" || category.category === selectedCategory
      const queryMatches = !normalizedQuery || `${page.name} ${category.label} ${category.sub ?? ""}`.toLowerCase().includes(normalizedQuery)
      return categoryMatches && queryMatches
    }),
    [allPages, normalizedQuery, selectedCategory],
  )

  return (
    <main className="module-page knowledge-library-page">
      <header className="module-page-header">
        <div>
          <span className="module-kicker"><BookOpen size={14} />知识库</span>
          <h1>内容索引</h1>
          <p>集中搜索同步后的 Obsidian 内容，原始文档继续由内容站负责展示。</p>
        </div>
        <a className="module-secondary-action" href={contentUrl("/")} target="_blank" rel="noreferrer">
          <ExternalLink size={15} />内容站
        </a>
      </header>

      <section className="module-toolbar" aria-label="知识库筛选">
        <label className="module-search">
          <Search size={16} />
          <input value={query} placeholder="搜索标题或分类" aria-label="搜索知识库" onChange={(event) => setQuery(event.target.value)} />
        </label>
        <span>{visiblePages.length} / {allPages.length} 篇内容</span>
        <button className="module-icon-button" type="button" title="刷新索引" aria-label="刷新索引" disabled={loading} onClick={() => void loadKnowledge()}>
          <RefreshCw size={15} />
        </button>
      </section>

      <div className="knowledge-library-layout">
        <aside className="knowledge-category-nav" aria-label="知识分类">
          <button type="button" className={selectedCategory === "all" ? "active" : ""} onClick={() => setSelectedCategory("all")}>
            <span>全部内容</span><small>{allPages.length}</small>
          </button>
          {categories.map((category) => (
            <button key={category.category} type="button" className={selectedCategory === category.category ? "active" : ""} onClick={() => setSelectedCategory(category.category)}>
              <span>{category.label}</span><small>{category.pages.length}</small>
            </button>
          ))}
        </aside>

        <section className="knowledge-result-list" aria-live="polite">
          {loading ? <div className="module-state">正在读取知识索引</div> : null}
          {!loading && error ? <div className="module-state error">{error}</div> : null}
          {!loading && !error && visiblePages.length === 0 ? <div className="module-state">没有匹配的内容</div> : null}
          {!loading && !error ? visiblePages.map(({ category, page }) => (
            <KnowledgeRow
              key={`${category.category}-${page.link}-${page.name}`}
              category={category}
              page={page}
              pinned={isFavorite(favoriteId(category, page))}
              pinDisabled={isFull && !isFavorite(favoriteId(category, page))}
              onTogglePin={() => toggleFavorite({
                id: favoriteId(category, page),
                label: page.name,
                href: contentUrl(page.link || "/knowledge/"),
                kind: "knowledge",
              })}
            />
          )) : null}
        </section>
      </div>
    </main>
  )
}

function KnowledgeRow({
  category,
  page,
  pinned,
  pinDisabled,
  onTogglePin,
}: {
  category: KnowledgeCategory
  page: KnowledgePage
  pinned: boolean
  pinDisabled: boolean
  onTogglePin: () => void
}) {
  return (
    <article className="knowledge-result-row">
      <span className="knowledge-result-icon"><FileText size={16} /></span>
      <div>
        <strong>{page.name}</strong>
        <span>{category.label}{category.sub ? ` / ${category.sub}` : ""}</span>
      </div>
      <button className={pinned ? "active" : ""} type="button" title={pinned ? "取消固定" : pinDisabled ? "固定入口已满" : "固定到侧栏"} aria-label={pinned ? `取消固定${page.name}` : `固定${page.name}`} aria-pressed={pinned} disabled={pinDisabled} onClick={onTogglePin}>
        <Pin size={15} />
      </button>
      <a href={contentUrl(page.link || "/knowledge/")} target="_blank" rel="noreferrer" title="打开内容" aria-label={`打开${page.name}`}>
        <ExternalLink size={15} />
      </a>
    </article>
  )
}

function favoriteId(category: KnowledgeCategory, page: KnowledgePage): string {
  return `knowledge:${category.category}:${page.link || page.name}`
}
