"use client"

import { useEffect, useMemo, useState } from "react"
import { getWorkspaceKnowledge, type KnowledgeCategory } from "@/shared/data/workspaceData"
import { contentUrl } from "@/shared/data/workspaceSources"
import { Panel } from "@/shared/ui/Panel"
import { SkeletonRows, StateBlock } from "@/shared/ui/StateBlock"

export function KnowledgePanel() {
  const [categories, setCategories] = useState<KnowledgeCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    async function load() {
      try {
        const data = await getWorkspaceKnowledge()
        setCategories(data)
      } catch {
        setError("知识 JSON 暂不可用。请先运行内容同步，再使用索引。")
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [])

  const totalPages = useMemo(() => categories.reduce((sum, category) => sum + category.pages.length, 0), [categories])

  return (
    <Panel
      id="knowledge"
      eyebrow="知识"
      title="内容索引"
      description="从同步索引快速进入独立知识库，原始内容仍由 Obsidian 与内容站管理。"
      stats={
        <>
          <span>{categories.length} 个分类</span>
          <span>{totalPages} 篇内容</span>
        </>
      }
      actions={
        <a className="secondary-action" href="/knowledge">
          打开知识库
        </a>
      }
    >

      {loading ? <SkeletonRows rows={2} /> : null}
      {!loading && error ? <StateBlock title="知识索引加载失败" message={error} tone="error" /> : null}
      {!loading && !error && totalPages === 0 ? (
        <StateBlock
          title="暂无同步知识索引"
          message="内容站仍可使用；同步时检测到 vault 后，索引会显示在这里。"
        />
      ) : null}

      {!loading && !error ? <div className="knowledge-grid">
        {categories.map((category) => (
          <article key={category.category} className="knowledge-card">
            <div className="knowledge-card-head">
              <h3>{category.label}</h3>
              <span>{category.pages.length}</span>
            </div>
            <div className="knowledge-links">
              {category.pages.slice(0, 5).map((page) => (
                <a key={`${category.category}-${page.name}`} href={contentUrl(page.link || "/knowledge/")} target="_blank" rel="noreferrer">
                  {page.name}
                </a>
              ))}
            </div>
          </article>
        ))}
      </div> : null}
    </Panel>
  )
}
