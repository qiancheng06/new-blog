import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const PROJECTS_DIR = join(ROOT, 'projects')
const INDEX_HTML = join(ROOT, 'index.html')
const DETAIL_HTML = join(ROOT, 'detail.html')
const CALENDAR_HTML = join(ROOT, 'calendar.html')
const TODO_DIR = 'C:\\Users\\33831\\OneDrive\\obsidian\\obsidian\\todo'
const KNOWLEDGE_DIR = 'C:\\Users\\33831\\OneDrive\\obsidian\\obsidian\\knowledge'

function parseFrontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---/)
  if (!m) return {}
  const fm = {}
  m[1].split('\n').forEach(line => {
    const idx = line.indexOf(':')
    if (idx < 0) return
    const k = line.slice(0, idx).trim()
    let v = line.slice(idx + 1).trim()
    if (v.startsWith('[') && v.endsWith(']')) {
      v = v.slice(1, -1).split(',').map(s => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean)
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
      filePath: join(PROJECTS_DIR, f).replace(/\\/g, '\\\\'),
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
    console.log('✅ Updated index.html + detail.html + calendar.html')
  } else {
    console.log('⚠️  No changes detected')
  }
}

main()
