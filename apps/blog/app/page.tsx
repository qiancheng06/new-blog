import Link from "next/link"
import { BlogFooter, BlogHeader } from "@/BlogChrome"
import { getBlogPosts } from "@/blogData.server"

export default async function BlogIndexPage() {
  const posts = await getBlogPosts()

  return (
    <div className="blog-site">
      <BlogHeader />
      <main className="blog-container">
        <header className="blog-intro">
          <p className="blog-kicker">PERSONA / NOTES</p>
          <h1>博客</h1>
          <p>记录技术、项目和那些值得慢慢想清楚的事情。</p>
        </header>
        {posts.length === 0 ? (
          <div className="blog-empty">暂时还没有公开文章。</div>
        ) : (
          <div className="post-list">
            {posts.map((post) => (
              <article className="post-list-item" key={post.slug}>
                <div className="post-meta"><time>{post.date || "未注明日期"}</time></div>
                <h2><Link href={`/${encodeURIComponent(post.slug)}`}>{post.title}</Link></h2>
                {post.tags.length > 0 ? (
                  <div className="tag-row">
                    {post.tags.map((tag) => <Link href={`/tags#tag-${encodeURIComponent(tag)}`} key={tag}>{tag}</Link>)}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </main>
      <BlogFooter />
    </div>
  )
}
