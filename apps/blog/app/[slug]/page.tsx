import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { BlogFooter, BlogHeader } from "@/BlogChrome"
import { getBlogPost, getBlogPosts } from "@/blogData.server"

interface BlogPostPageProps {
  params: Promise<{ slug: string }>
}

export async function generateStaticParams() {
  return (await getBlogPosts()).map((post) => ({ slug: post.slug }))
}

export async function generateMetadata({ params }: BlogPostPageProps): Promise<Metadata> {
  const { slug } = await params
  const post = await getBlogPost(decodeURIComponent(slug))
  return post ? { title: post.title } : { title: "文章不存在" }
}

export default async function BlogPostPage({ params }: BlogPostPageProps) {
  const { slug } = await params
  const post = await getBlogPost(decodeURIComponent(slug))
  if (!post) notFound()

  return (
    <div className="blog-site">
      <BlogHeader />
      <main className="article-container">
        <Link className="back-link" href="/">← 返回文章列表</Link>
        <header className="article-header">
          <p className="blog-kicker">{post.date || "未注明日期"}</p>
          <h1>{post.title}</h1>
          {post.tags.length > 0 ? <div className="tag-row">{post.tags.map((tag) => <Link href={`/tags#tag-${encodeURIComponent(tag)}`} key={tag}>{tag}</Link>)}</div> : null}
        </header>
        <article className="prose">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{post.markdown}</ReactMarkdown>
        </article>
      </main>
      <BlogFooter />
    </div>
  )
}
