import Link from "next/link"

export function BlogHeader() {
  return (
    <header className="blog-header">
      <div className="blog-header-inner">
        <Link className="blog-brand" href="/">Persona / 博客</Link>
        <nav aria-label="博客导航">
          <Link href="/">文章</Link>
          <Link href="/tags">标签</Link>
        </nav>
      </div>
    </header>
  )
}

export function BlogFooter() {
  return <footer className="blog-footer"><span>Persona</span><span>持续记录，持续整理。</span></footer>
}
