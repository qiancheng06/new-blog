import Link from "next/link"

export default function BlogNotFound() {
  return <main className="blog-not-found"><p className="blog-kicker">404</p><h1>这篇文章找不到了。</h1><Link href="/">回到文章列表</Link></main>
}
