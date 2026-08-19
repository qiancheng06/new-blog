import Link from "next/link"
import { BlogFooter, BlogHeader } from "@/BlogChrome"
import { getBlogTags } from "@/blogData.server"

export default async function BlogTagsPage() {
  const tags = await getBlogTags()

  return (
    <div className="blog-site">
      <BlogHeader />
      <main className="blog-container">
        <header className="blog-intro"><p className="blog-kicker">INDEX</p><h1>标签</h1><p>按主题浏览所有公开文章。</p></header>
        {tags.length === 0 ? <div className="blog-empty">暂时还没有标签。</div> : <div className="tag-index">{tags.map(({ name, posts }) => <section id={`tag-${encodeURIComponent(name)}`} key={name}><h2>{name}<small>{posts.length} 篇</small></h2>{posts.map((post) => <Link href={`/${encodeURIComponent(post.slug)}`} key={post.slug}>{post.title}<time>{post.date}</time></Link>)}</section>)}</div>}
      </main>
      <BlogFooter />
    </div>
  )
}
