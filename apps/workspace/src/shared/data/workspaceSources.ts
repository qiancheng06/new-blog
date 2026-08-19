export interface WorkspaceSource {
  id: string
  title: string
  role: string
  access: string
}

const CONTENT_SITE_BASE = process.env.NEXT_PUBLIC_CONTENT_SITE_BASE?.replace(/\/$/, "") || "http://127.0.0.1:5174"

export const workspaceSources: WorkspaceSource[] = [
  {
    id: "obsidian",
    title: "Obsidian Content",
    role: "Projects, todos, knowledge, and blog posts remain Markdown sources outside the React application.",
    access: "Workspace reads generated JSON and links to the VitePress content site.",
  },
  {
    id: "persona",
    title: "Persona Application API",
    role: "Runtime status, Companion chat, Memory governance, and Daily Notes use the local HTTP API.",
    access: "Workspace does not read SQLite, logs, environment files, or LLM providers directly.",
  },
]

export function contentUrl(path: string): string {
  const publicPath = path.replace(/^\/?\.vitepress\/dist/, "")
  const normalized = publicPath.startsWith("/") ? publicPath : `/${publicPath}`
  return `${CONTENT_SITE_BASE}${normalized}`
}
