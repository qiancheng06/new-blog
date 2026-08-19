import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, unlinkSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { config as loadEnv } from 'dotenv'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const REPO_ROOT = join(ROOT, '..', '..')
loadEnv({ path: join(REPO_ROOT, '.env') })
const LEGACY_DIR = join(ROOT, 'legacy')
const PUBLIC_DATA_DIR = join(ROOT, 'public', 'data')
const PROJECTS_DIR = join(ROOT, 'projects')
const PROJECTS_WEB_DIR = 'apps/workspace/projects'
const INDEX_HTML = join(LEGACY_DIR, 'index.html')
const DETAIL_HTML = join(LEGACY_DIR, 'detail.html')
const CALENDAR_HTML = join(LEGACY_DIR, 'calendar.html')
const VAULT_ROOT = process.env.OBSIDIAN_VAULT_PATH || 'C:\\Users\\33831\\OneDrive\\obsidian\\obsidian'
const TODO_DIR = join(VAULT_ROOT, 'todo')
const KNOWLEDGE_DIR = join(VAULT_ROOT, 'knowledge')
const BLOG_DIR = join(VAULT_ROOT, 'blog')
const BLOG_DATA_DIR = join(PUBLIC_DATA_DIR, 'blog')
const BLOG_MANIFEST = join(PUBLIC_DATA_DIR, 'blog-posts.json')
let projectsSourceAvailable = true
let todosSourceAvailable = true
let knowledgeSourceAvailable = true

function parseFrontmatter(text) {
  const m = text.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)
  if (!m) return {}
  const fm = {}
  let pendingKey = null
  m[1].split(/\r?\n/).forEach(line => {
    if (pendingKey) {
      const li = line.match(/^\s+-\s+(.+)/)
      if (li) {
        if (!Array.isArray(fm[pendingKey])) fm[pendingKey] = []
        fm[pendingKey].push(li[1].trim().replace(/^['"]|['"]$/g, ''))
        return
      }
      const previousKey = pendingKey
      pendingKey = null
      if (!fm[previousKey] || (Array.isArray(fm[previousKey]) && fm[previousKey].length === 0))
        delete fm[previousKey]
    }
    const idx = line.indexOf(':')
    if (idx < 0) return
    const k = line.slice(0, idx).trim()
    let v = line.slice(idx + 1).trim()
    if (v.startsWith('[') && v.endsWith(']')) {
      v = v.slice(1, -1).split(',').map(s => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean)
    } else if (v === '') {
      pendingKey = k
      return
    } else if (v === 'true') v = true
    else if (v === 'false') v = false
    else if (!isNaN(Number(v)) && v !== '') v = Number(v)
    fm[k] = v
  })
  return fm
}

function parseSections(text) {
  const sections = []
  let current = null
  for (const line of text.split('\n')) {
    const sm = line.match(/^##\s+(.+)/)
    if (sm) { current = { name: sm[1].trim(), tasks: [] }; sections.push(current); continue }
    const tm = line.match(/^-\s+\[([ x])\]\s+(.+)/)
    if (tm && current) current.tasks.push({ text: tm[2].trim(), done: tm[1] === 'x' })
  }
  return sections
}

function loadProjects() {
  if (!existsSync(PROJECTS_DIR)) {
    projectsSourceAvailable = false
    console.log('Workspace projects directory not found, using empty project list:', PROJECTS_DIR)
    return []
  }
  const files = readdirSync(PROJECTS_DIR).filter(f => f.endsWith('.md'))
  const projects = []
  for (const f of files) {
    const text = readFileSync(join(PROJECTS_DIR, f), 'utf-8')
    const fm = parseFrontmatter(text)
    const sections = parseSections(text)
    if (!fm.name) continue
    projects.push({
      id: f.replace(/\.md$/, ''),
      name: fm.name,
      status: fm.status || 'planning',
      priority: fm.priority || 'medium',
      tags: fm.tags || [],
      repo: fm.repo || '',
      filePath: `${PROJECTS_WEB_DIR}/${f}`,
      sections,
    })
  }
  return projects
}

function genJS(projects) {
  return JSON.stringify(projects, null, 2)
    .replace(/"done": false/g, 'done: false')
    .replace(/"done": true/g, 'done: true')
    .replace(/"text"/g, 'text')
    .replace(/"name"/g, 'name')
    .replace(/"id"/g, 'id')
    .replace(/"status"/g, 'status')
    .replace(/"priority"/g, 'priority')
    .replace(/"tags"/g, 'tags')
    .replace(/"repo"/g, 'repo')
    .replace(/"filePath"/g, 'filePath')
    .replace(/"sections"/g, 'sections')
    .replace(/"tasks"/g, 'tasks')
}

function genJSON(obj) {
  return JSON.stringify(obj, null, 2)
}

function writeJsonIfAvailable(fileName, data, available) {
  if (!available) return false
  mkdirSync(PUBLIC_DATA_DIR, { recursive: true })
  const filePath = join(PUBLIC_DATA_DIR, fileName)
  const nextContent = `${genJSON(data)}\n`
  const prevContent = existsSync(filePath) ? readFileSync(filePath, 'utf-8') : ''
  if (prevContent === nextContent) return false
  writeFileSync(filePath, nextContent, 'utf-8')
  return true
}

// ── Todo parsing ──

function loadTodos() {
  if (!existsSync(TODO_DIR)) {
    todosSourceAvailable = false
    console.log('TODO_DIR not found, keeping existing synced todo data:', TODO_DIR)
    return []
  }
  if (!existsSync(TODO_DIR)) { console.log('⚠️  TODO_DIR not found:', TODO_DIR); return [] }
  const files = readdirSync(TODO_DIR).filter(f => f.endsWith('.md') && f !== 'index.md')
  const todos = []
  for (const f of files) {
    const text = readFileSync(join(TODO_DIR, f), 'utf-8')
    const lines = text.split('\n')
    for (const line of lines) {
      const tm = line.match(/^-\s+\[([ x])\]\s+(.+?)(?:\s+@(\d{4}-\d{2}-\d{2}))?\s*$/)
      if (tm) {
        const date = tm[3] || ''
        todos.push({
          text: tm[2].trim(),
          done: tm[1] === 'x',
          date,
          source: f.replace(/\.md$/, ''),
        })
      }
    }
  }
  // Sort by date ascending, empty dates last
  todos.sort((a, b) => {
    if (!a.date && !b.date) return 0
    if (!a.date) return 1
    if (!b.date) return -1
    return a.date.localeCompare(b.date)
  })
  return todos
}

// ── HTML block replacement ──

function replaceBlock(content, varName, newValue) {
  const startMarker = `// SYNC:${varName}`
  const endMarker = `// /SYNC:${varName}`
  const startIdx = content.indexOf(startMarker)
  const endIdx = content.indexOf(endMarker)
  if (startIdx === -1 || endIdx === -1) {
    console.error(`Cannot find SYNC markers for '${varName}'`)
    return content
  }
  // Strip outer array brackets since template already wraps with [ ... ];
  const firstB = newValue.indexOf('[')
  const lastB = newValue.lastIndexOf(']')
  const inner = firstB !== -1 && lastB !== -1 && lastB > firstB
    ? newValue.slice(firstB + 1, lastB).trim()
    : newValue
  const blockEnd = endIdx + endMarker.length
  const prefix = content.slice(0, startIdx)
  const suffix = content.slice(blockEnd)
  return prefix + startMarker + '\n' + `const ${varName} = [` + '\n' + inner + '\n];\n' + endMarker + suffix
}

function replaceBlockRaw(content, varName, newValue) {
  const startMarker = `// SYNC:${varName}`
  const endMarker = `// /SYNC:${varName}`
  const startIdx = content.indexOf(startMarker)
  const endIdx = content.indexOf(endMarker)
  if (startIdx === -1 || endIdx === -1) {
    console.error(`Cannot find SYNC markers for '${varName}'`)
    return content
  }
  const blockEnd = endIdx + endMarker.length
  const prefix = content.slice(0, startIdx)
  const suffix = content.slice(blockEnd)
  return prefix + startMarker + '\n' + `const ${varName} = ` + newValue + ';\n' + endMarker + suffix
}

function upsertBlock(content, varName, defaultValue) {
  const startMarker = `// SYNC:${varName}`
  const endMarker = `// /SYNC:${varName}`
  if (content.includes(startMarker) && content.includes(endMarker)) {
    return content // already has markers, skip
  }
  const insert = `\n${startMarker}\n${defaultValue}\n${endMarker}\n`
  // Insert before first SYNC marker or at end
  const firstSync = content.indexOf('// SYNC:')
  if (firstSync !== -1) {
    const before = content.slice(0, firstSync)
    const after = content.slice(firstSync)
    return before + insert + after
  }
  const scriptEnd = content.lastIndexOf('</script>')
  if (scriptEnd !== -1) {
    return content.slice(0, scriptEnd) + insert + content.slice(scriptEnd)
  }
  return content + insert
}

// ── Knowledge scanning ──

const CATEGORY_CONFIG = {
  'resource-library': { label: '资源库', icon: '📦', sub: 'resource-library' },
  'tech-manual': { label: '技术手册', icon: '📋', sub: 'tech-manual' },
  'skill-tree': { label: '技能树', icon: '🌳', sub: 'skill-tree' },
}

const PAGE_ICONS = {
  datasets: '🗃️', tools: '🔧', 'reading-list': '📖', 'ros-resources': '🤖',
  'git-cheatsheet': '📋', 'docker-commands': '🐳', troubleshooting: '🐛',
  ros: '🤖', yolo: '🎯', opencv: '👁️', 'pure-pursuit': '🎯', matlab: '📊',
  c51: '🔌', esp32: '📡', '5g': '📶',
  embedded: '🔌', 'computer-vision': '👁️', 'web-dev': '🌐',
}

function loadKnowledge() {
  const result = []
  const inboxFiles = []

  if (!existsSync(KNOWLEDGE_DIR)) {
    knowledgeSourceAvailable = false
    console.log('KNOWLEDGE_DIR not found, keeping existing synced knowledge data:', KNOWLEDGE_DIR)
    return []
  }

  for (const [cat, config] of Object.entries(CATEGORY_CONFIG)) {
    const dirPath = join(KNOWLEDGE_DIR, config.sub)
    if (!existsSync(dirPath)) { result.push({ category: cat, ...config, pages: [] }); continue }

    const files = readdirSync(dirPath).filter(f => f.endsWith('.md') && f !== 'index.md' && !['test.md', 'json.md', 'URL.md', '12.md', '张雪峰.md'].includes(f))
    const pages = files.map(f => {
      const name = f.replace(/\.md$/, '')
      const text = readFileSync(join(dirPath, f), 'utf-8')
      const fm = parseFrontmatter(text)
      // Count content items (tasks or list items)
      const itemCount = (text.match(/^-\s/gm) || []).length
      return {
        name: fm.title || name,
        link: `/knowledge/${config.sub}/${name}.html`,
        icon: PAGE_ICONS[name] || '📄',
        count: itemCount || undefined,
      }
    })
    result.push({ category: cat, ...config, pages })
  }

  // Count inbox files
  const inboxPath = join(KNOWLEDGE_DIR, 'inbox')
  if (existsSync(inboxPath)) {
    const files = readdirSync(inboxPath).filter(f => f.endsWith('.md') && f !== 'index.md' && f !== 'README.md')
    result.push({
      category: 'inbox', label: '收件箱', icon: '📥',
      pages: [{ name: `${files.length} 篇待整理`, link: '', icon: '📄', count: files.length }],
    })
  }

  return result
}

// ── Blog scanning ──

function loadBlogPosts() {
  if (!existsSync(BLOG_DIR)) return []
  const files = readdirSync(BLOG_DIR).filter(f => f.endsWith('.md') && !['index.md', 'tags.md'].includes(f))
  return files.map(f => {
    const text = readFileSync(join(BLOG_DIR, f), 'utf-8')
    const fm = parseFrontmatter(text)
    const name = f.replace(/\.md$/, '')
    return {
      sourceFile: f,
      slug: normalizeBlogSlug(fm.slug || name),
      title: fm.title || name,
      date: fm.date || '',
      tags: Array.isArray(fm.tags) ? fm.tags : [],
      markdown: stripBlogFrontmatter(text),
    }
  }).sort((a, b) => {
    if (!a.date && !b.date) return a.title.localeCompare(b.title)
    if (!a.date) return 1
    if (!b.date) return -1
    return b.date.localeCompare(a.date)
  })
}

function normalizeBlogSlug(value) {
  const slug = String(value)
    .normalize('NFC')
    .trim()
    .replace(/[/\\?#%]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  if (!slug) throw new Error(`Blog slug is empty: ${value}`)
  return slug
}

function stripBlogFrontmatter(text) {
  const body = text.replace(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '')
  return body
    .replace(/^\s*(?:<span class=["']blog-tag["'][\s\S]*?<\/span>\s*)+(?:<a class=["']blog-tag-link["'][\s\S]*?<\/a>)?\s*/i, '')
    .trimStart()
}

function syncBlog() {
  if (!existsSync(BLOG_DIR)) {
    console.log('Blog source directory not found, keeping existing generated data:', BLOG_DIR)
    return false
  }

  const posts = loadBlogPosts()
  const seenSlugs = new Set()
  for (const post of posts) {
    if (seenSlugs.has(post.slug)) throw new Error(`Duplicate blog slug: ${post.slug}`)
    seenSlugs.add(post.slug)
  }

  mkdirSync(PUBLIC_DATA_DIR, { recursive: true })
  mkdirSync(BLOG_DATA_DIR, { recursive: true })

  const generatedFiles = new Set(posts.map(post => `${post.slug}.md`))
  for (const file of readdirSync(BLOG_DATA_DIR)) {
    if (file.endsWith('.md') && !generatedFiles.has(file)) unlinkSync(join(BLOG_DATA_DIR, file))
  }

  for (const post of posts) {
    writeFileSync(join(BLOG_DATA_DIR, `${post.slug}.md`), post.markdown, 'utf-8')
  }

  writeFileSync(
    BLOG_MANIFEST,
    JSON.stringify(posts.map(({ slug, title, date, tags }) => ({ slug, title, date, tags })), null, 2) + '\n',
    'utf-8',
  )
  return true
}

function main() {
  // 1. Projects
  const projects = loadProjects()
  const jsContent = projects.length > 0 ? genJS(projects) : ''

  // 2. Todos
  const todos = loadTodos()
  const todoJSON = genJSON(todos)

  // 3. Knowledge
  const knowledge = loadKnowledge()
  const knowledgeJSON = genJSON(knowledge)

  // 4. Read HTML files
  let idxHtml = readFileSync(INDEX_HTML, 'utf-8')
  let detHtml = readFileSync(DETAIL_HTML, 'utf-8')
  let calHtml = existsSync(CALENDAR_HTML) ? readFileSync(CALENDAR_HTML, 'utf-8') : ''

  // Add markers if missing
  idxHtml = upsertBlock(idxHtml, 'TODO_DATA', '')
  detHtml = upsertBlock(detHtml, 'TODO_DATA', '')
  if (calHtml) calHtml = upsertBlock(calHtml, 'TODO_DATA', '')

  idxHtml = upsertBlock(idxHtml, 'KNOWLEDGE_DATA', '')
  detHtml = upsertBlock(detHtml, 'KNOWLEDGE_DATA', '')

  // Update each block
  let updated = false

  if (writeJsonIfAvailable('projects.json', projects, projectsSourceAvailable)) updated = true
  if (writeJsonIfAvailable('todos.json', todos, todosSourceAvailable)) updated = true
  if (writeJsonIfAvailable('knowledge.json', knowledge, knowledgeSourceAvailable)) updated = true

  if (projectsSourceAvailable) {
    const newIdx = replaceBlock(idxHtml, 'EMBEDDED_PROJECTS', jsContent)
    if (newIdx !== idxHtml) { idxHtml = newIdx; updated = true }
  }

  if (todosSourceAvailable) {
    const newIdxTodo = replaceBlockRaw(idxHtml, 'TODO_DATA', todoJSON)
    if (newIdxTodo !== idxHtml) { idxHtml = newIdxTodo; updated = true }
  }

  if (knowledgeSourceAvailable) {
    const newIdxKn = replaceBlockRaw(idxHtml, 'KNOWLEDGE_DATA', knowledgeJSON)
    if (newIdxKn !== idxHtml) { idxHtml = newIdxKn; updated = true }
  }

  if (projectsSourceAvailable) {
    const newDet = replaceBlock(detHtml, 'ALL_PROJECTS', jsContent)
    if (newDet !== detHtml) { detHtml = newDet; updated = true }
  }

  if (todosSourceAvailable) {
    const newDetTodo = replaceBlockRaw(detHtml, 'TODO_DATA', todoJSON)
    if (newDetTodo !== detHtml) { detHtml = newDetTodo; updated = true }
  }

  if (knowledgeSourceAvailable) {
    const newDetKn = replaceBlockRaw(detHtml, 'KNOWLEDGE_DATA', knowledgeJSON)
    if (newDetKn !== detHtml) { detHtml = newDetKn; updated = true }
  }

  if (calHtml && todosSourceAvailable) {
    const newCalTodo = replaceBlockRaw(calHtml, 'TODO_DATA', todoJSON)
    if (newCalTodo !== calHtml) { calHtml = newCalTodo; updated = true }
  }

  if (updated) {
    writeFileSync(INDEX_HTML, idxHtml, 'utf-8')
    writeFileSync(DETAIL_HTML, detHtml, 'utf-8')
    if (calHtml) writeFileSync(CALENDAR_HTML, calHtml, 'utf-8')
  }

  // 5. Blog
  const blogUpdated = syncBlog()

  if (updated && blogUpdated) console.log('✅ Updated all files + blog')
  else if (updated) console.log('✅ Updated legacy/index.html + legacy/detail.html + legacy/calendar.html')
  else if (blogUpdated) console.log('✅ Updated blog')
  else console.log('⚠️  No changes detected')
}

main()
