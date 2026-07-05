"use client"

import { useEffect, useMemo, useState } from "react"
import { getWorkspaceKnowledge, type KnowledgeCategory } from "@/shared/data/workspaceData"
import { contentUrl } from "@/shared/data/workspaceSources"

export function KnowledgePanel() {
  const [categories, setCategories] = useState<KnowledgeCategory[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const data = await getWorkspaceKnowledge()
      setCategories(data)
      setLoading(false)
    }

    void load()
  }, [])

  const totalPages = useMemo(() => categories.reduce((sum, category) => sum + category.pages.length, 0), [categories])

  return (
    <section className="feature-panel" id="knowledge">
      <div className="feature-heading">
        <div>
          <p className="eyebrow">Knowledge</p>
          <h2>Content Index</h2>
          <p>Obsidian remains the content site. Workspace shows index and entry points without scanning the vault.</p>
        </div>
        <a className="secondary-action" href={contentUrl("/")} target="_blank" rel="noreferrer">
          Open VitePress site
        </a>
      </div>

      {loading ? <p className="empty-state">Loading content index...</p> : null}
      {!loading && totalPages === 0 ? <p className="empty-state">No synced knowledge index yet.</p> : null}

      <div className="knowledge-grid">
        {categories.map((category) => (
          <article key={category.category} className="knowledge-card">
            <h3>{category.label}</h3>
            <p>{category.pages.length} pages</p>
            <div className="knowledge-links">
              {category.pages.slice(0, 5).map((page) => (
                <a key={`${category.category}-${page.name}`} href={contentUrl("/knowledge/")} target="_blank" rel="noreferrer">
                  {page.name}
                </a>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
