export interface WorkspaceTask {
  text: string
  done: boolean
}

export interface WorkspaceProjectSection {
  name: string
  tasks: WorkspaceTask[]
}

export interface WorkspaceProject {
  id: string
  name: string
  status: string
  priority: string
  tags: string[]
  repo?: string
  filePath?: string
  sections: WorkspaceProjectSection[]
}

export interface WorkspaceTodo {
  text: string
  done: boolean
  date: string
  source: string
}

export interface KnowledgePage {
  name: string
  link: string
  icon?: string
  count?: number
}

export interface KnowledgeCategory {
  category: string
  label: string
  icon?: string
  sub?: string
  pages: KnowledgePage[]
}

export class WorkspaceDataError extends Error {
  constructor(
    message: string,
    public readonly path: string,
    public readonly status?: number,
  ) {
    super(message)
  }
}

export async function getWorkspaceProjects(): Promise<WorkspaceProject[]> {
  return getWorkspaceJson<WorkspaceProject[]>("/data/projects.json")
}

export async function getWorkspaceTodos(): Promise<WorkspaceTodo[]> {
  return getWorkspaceJson<WorkspaceTodo[]>("/data/todos.json")
}

export async function getWorkspaceKnowledge(): Promise<KnowledgeCategory[]> {
  return getWorkspaceJson<KnowledgeCategory[]>("/data/knowledge.json")
}

async function getWorkspaceJson<T>(path: string): Promise<T> {
  const response = await fetch(path, { headers: { Accept: "application/json" } })
  if (!response.ok) {
    throw new WorkspaceDataError(`Workspace data request failed: ${path}`, path, response.status)
  }
  return (await response.json()) as T
}
