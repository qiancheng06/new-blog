import type { Metadata } from "next"
import "./blog.css"

export const metadata: Metadata = {
  title: { default: "博客", template: "%s · 博客" },
  description: "记录技术、项目与长期实践。",
}

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="blog-body">{children}</body>
    </html>
  )
}
