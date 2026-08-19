import { existsSync } from "fs"
import { readFile } from "fs/promises"
import { join } from "path"

export interface BlogPostMeta {
  slug: string
  title: string
  date: string
  tags: string[]
}

export interface BlogPost extends BlogPostMeta {
  markdown: string
}

function dataRoot(): string {
  const candidates = [
    join(process.cwd(), "public", "data"),
    join(process.cwd(), "apps", "workspace", "public", "data"),
  ]
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0]
}

async function readManifest(): Promise<BlogPostMeta[]> {
  try {
    const text = await readFile(join(dataRoot(), "blog-posts.json"), "utf8")
    const value = JSON.parse(text) as unknown
    if (!Array.isArray(value)) throw new Error("Blog manifest must be an array")
    return value.filter(isBlogPostMeta)
  } catch (error) {
    if (isMissingFile(error)) return []
    throw new Error("博客索引读取失败。请先运行 npm.cmd run sync。", { cause: error })
  }
}

export async function getBlogPosts(): Promise<BlogPostMeta[]> {
  return readManifest()
}

export async function getBlogPost(slug: string): Promise<BlogPost | null> {
  const posts = await readManifest()
  const meta = posts.find((post) => post.slug === slug)
  if (!meta) return null

  try {
    const markdown = await readFile(join(dataRoot(), "blog", `${meta.slug}.md`), "utf8")
    return { ...meta, markdown }
  } catch (error) {
    if (isMissingFile(error)) return null
    throw new Error(`文章读取失败：${meta.title}`, { cause: error })
  }
}

export async function getBlogTags(): Promise<Array<{ name: string; posts: BlogPostMeta[] }>> {
  const tagMap = new Map<string, BlogPostMeta[]>()
  for (const post of await readManifest()) {
    for (const tag of post.tags) tagMap.set(tag, [...(tagMap.get(tag) ?? []), post])
  }
  return [...tagMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b, "zh-CN"))
    .map(([name, posts]) => ({ name, posts }))
}

function isBlogPostMeta(value: unknown): value is BlogPostMeta {
  if (!value || typeof value !== "object") return false
  const post = value as Partial<BlogPostMeta>
  return typeof post.slug === "string" && typeof post.title === "string" && typeof post.date === "string" && Array.isArray(post.tags)
}

function isMissingFile(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "ENOENT")
}
