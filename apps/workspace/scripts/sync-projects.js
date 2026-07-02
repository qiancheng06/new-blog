import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { config as loadEnv } from 'dotenv'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const REPO_ROOT = join(ROOT, '..', '..')
loadEnv({ path: join(REPO_ROOT, '.env') })
const PROJECTS_DIR = join(ROOT, 'projects')
const PROJECTS_WEB_DIR = 'apps/workspace/projects'
const INDEX_HTML = join(ROOT, 'index.html')
const DETAIL_HTML = join(ROOT, 'detail.html')
const CALENDAR_HTML = join(ROOT, 'calendar.html')
const VAULT_ROOT = process.env.OBSIDIAN_VAULT_PATH || 'C:\\Users\\33831\\OneDrive\\obsidian\\obsidian'
const TODO_DIR = join(VAULT_ROOT, 'todo')
const KNOWLEDGE_DIR = join(VAULT_ROOT, 'knowledge')
const BLOG_DIR = join(VAULT_ROOT, 'blog')
const BLOG_INDEX = join(BLOG_DIR, 'index.md')
const BLOG_TAGS = join(BLOG_DIR, 'tags.md')
const CONFIG_TS = join(ROOT, '.vitepress', 'config.ts')

function parseFrontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---/)
  if (!m) return {}
  const fm = {}
  let pendingKey = null
  m[1].split('\n').forEach(line => {
    if (pendingKey) {
      const li = line.match(/^\s+-\s+(.+)/)
      if (li) {
        if (!Array.isArray(fm[pendingKey])) fm[pendingKey] = []
        fm[pendingKey].push(li[1].trim().replace(/^['"]|['"]$/g, ''))
        return
      }
      pendingKey = null
      if (!fm[pendingKey] || (Array.isArray(fm[pendingKey]) && fm[pendingKey].length === 0))
        delete fm[pendingKey]
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

// ── Todo parsing ──

function loadTodos() {
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
        link: `.vitepress/dist/knowledge/${config.sub}/${name}.html`,
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
      link: `./${name}`,
      title: fm.title || name,
      date: fm.date || '',
      tags: Array.isArray(fm.tags) ? fm.tags : [],
    }
  }).sort((a, b) => {
    if (!a.date && !b.date) return a.title.localeCompare(b.title)
    if (!a.date) return 1
    if (!b.date) return -1
    return b.date.localeCompare(a.date)
  })
}

function replaceMdBlock(content, markerName, newContent) {
  const startMarker = `<!-- ${markerName} -->`
  const endMarker = `<!-- /${markerName} -->`
  const startIdx = content.indexOf(startMarker)
  const endIdx = content.indexOf(endMarker)
  if (startIdx === -1 || endIdx === -1) {
    console.error(`Cannot find markers '${markerName}' in blog file`)
    return content
  }
  const blockEnd = endIdx + endMarker.length
  const prefix = content.slice(0, startIdx + startMarker.length)
  const suffix = content.slice(blockEnd)
  return prefix + '\n' + newContent + '\n' + endMarker + suffix
}

function genBlogList(posts) {
  return posts.map(p => {
    const tags = p.tags.map(t => `<span class="blog-tag">${t}</span>`).join(' ')
    const date = p.date ? `— ${p.date}` : ''
    return `- [${p.title}](${p.link}) ${tags} ${date}`.trim()
  }).join('\n')
}

function genTagIndex(posts) {
  const tagMap = {}
  for (const p of posts) {
    for (const t of p.tags) {
      if (!tagMap[t]) tagMap[t] = []
      tagMap[t].push(p)
    }
  }
  const sortedTags = Object.keys(tagMap).sort()
  return sortedTags.map(tag => {
    const items = tagMap[tag].map(p => `- [${p.title}](${p.link})`).join('\n')
    return `## ${tag}\n\n${items}`
  }).join('\n\n')
}

function replaceTsBlock(content, markerName, newContent) {
  const startMarker = `// ${markerName}`
  const endMarker = `// /${markerName}`
  const startIdx = content.indexOf(startMarker)
  const endIdx = content.indexOf(endMarker)
  if (startIdx === -1 || endIdx === -1) {
    console.error(`Cannot find markers '${markerName}' in config.ts`)
    return content
  }
  const blockEnd = endIdx + endMarker.length
  const prefix = content.slice(0, startIdx + startMarker.length)
  const suffix = content.slice(blockEnd)
  return prefix + '\n' + newContent + '\n' + endMarker + suffix
}

function genSidebarPosts(posts) {
  return posts.map(p => `            { text: '${p.title.replace(/'/g, "\\'")}', link: '/blog/${p.link.replace('./', '')}' },`).join('\n')
}

function genSidebarBlock(posts) {
  const buildingTags = ['VitePress', 'Obsidian', '前端架构', '前端', 'Node.js', '前端工程化', 'Vue', 'CSS', 'JavaScript', '架构设计']
  const carTags = ['ROS', '智能车', '控制算法', '嵌入式']

  const buildingPosts = posts.filter(p => p.tags.some(t => buildingTags.includes(t)))
  const carPosts = posts.filter(p => p.tags.some(t => carTags.includes(t)))
  const otherPosts = posts.filter(p =>
    !p.tags.some(t => buildingTags.includes(t)) && !p.tags.some(t => carTags.includes(t))
  )

  const lines = [
    "      '/blog/': [",
    "        { text: '文章列表', link: '/blog/' },",
    "        { text: '标签索引', link: '/blog/tags' },",
  ]

  if (buildingPosts.length > 0) {
    lines.push('        {')
    lines.push("          text: '博客搭建',")
    lines.push('          collapsed: false,')
    lines.push('          items: [')
    buildingPosts.forEach(p => {
      const title = p.title.replace(/'/g, "\\'")
      const link = p.link.replace('./', '')
      lines.push(`            { text: '${title}', link: '/blog/${link}' },`)
    })
    lines.push('          ],')
    lines.push('        },')
  }

  if (carPosts.length > 0) {
    lines.push('        {')
    lines.push("          text: '智能车',")
    lines.push('          collapsed: false,')
    lines.push('          items: [')
    carPosts.forEach(p => {
      const title = p.title.replace(/'/g, "\\'")
      const link = p.link.replace('./', '')
      lines.push(`            { text: '${title}', link: '/blog/${link}' },`)
    })
    lines.push('          ],')
    lines.push('        },')
  }

  if (otherPosts.length > 0) {
    otherPosts.forEach(p => {
      const title = p.title.replace(/'/g, "\\'")
      const link = p.link.replace('./', '')
      lines.push(`        { text: '${title}', link: '/blog/${link}' },`)
    })
  }

  lines.push('      ],')
  return lines.join('\n')
}

function syncBlog() {
  const posts = loadBlogPosts()
  let updated = false

  // Update index.md
  let idxContent = readFileSync(BLOG_INDEX, 'utf-8')
  const newIdx = replaceMdBlock(idxContent, 'BLOG_LIST', genBlogList(posts))
  if (newIdx !== idxContent) {
    idxContent = newIdx
    writeFileSync(BLOG_INDEX, idxContent, 'utf-8')
    updated = true
  }

  // Update tags.md
  let tagsContent = readFileSync(BLOG_TAGS, 'utf-8')
  const newTags = replaceMdBlock(tagsContent, 'BLOG_TAGS', genTagIndex(posts))
  if (newTags !== tagsContent) {
    writeFileSync(BLOG_TAGS, newTags, 'utf-8')
    updated = true
  }

  // Update config.ts sidebar
  let configContent = readFileSync(CONFIG_TS, 'utf-8')
  const newConfig = replaceTsBlock(configContent, 'SIDEBAR:BLOG', genSidebarBlock(posts))
  if (newConfig !== configContent) {
    writeFileSync(CONFIG_TS, newConfig, 'utf-8')
    updated = true
  }

  return updated
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

  const newIdx = replaceBlock(idxHtml, 'EMBEDDED_PROJECTS', jsContent)
  if (newIdx !== idxHtml) { idxHtml = newIdx; updated = true }

  const newIdxTodo = replaceBlockRaw(idxHtml, 'TODO_DATA', todoJSON)
  if (newIdxTodo !== idxHtml) { idxHtml = newIdxTodo; updated = true }

  const newIdxKn = replaceBlockRaw(idxHtml, 'KNOWLEDGE_DATA', knowledgeJSON)
  if (newIdxKn !== idxHtml) { idxHtml = newIdxKn; updated = true }

  const newDet = replaceBlock(detHtml, 'ALL_PROJECTS', jsContent)
  if (newDet !== detHtml) { detHtml = newDet; updated = true }

  const newDetTodo = replaceBlockRaw(detHtml, 'TODO_DATA', todoJSON)
  if (newDetTodo !== detHtml) { detHtml = newDetTodo; updated = true }

  const newDetKn = replaceBlockRaw(detHtml, 'KNOWLEDGE_DATA', knowledgeJSON)
  if (newDetKn !== detHtml) { detHtml = newDetKn; updated = true }

  if (calHtml) {
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
  else if (updated) console.log('✅ Updated index.html + detail.html + calendar.html')
  else if (blogUpdated) console.log('✅ Updated blog')
  else console.log('⚠️  No changes detected')
}

main()
