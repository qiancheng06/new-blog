import { watch } from 'fs'
import { exec } from 'child_process'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { config as loadEnv } from 'dotenv'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const REPO_ROOT = join(ROOT, '..', '..')
loadEnv({ path: join(REPO_ROOT, '.env') })
const PROJECTS_DIR = join(ROOT, 'projects')
const VAULT_ROOT = process.env.OBSIDIAN_VAULT_PATH || 'C:\\Users\\33831\\OneDrive\\obsidian\\obsidian'
const TODO_DIR = join(VAULT_ROOT, 'todo')
const KNOWLEDGE_DIR = join(VAULT_ROOT, 'knowledge')
const BLOG_DIR = join(VAULT_ROOT, 'blog')
const SYNC_CMD = `node "${join(__dirname, 'sync-projects.js')}"`

let syncing = false
let pending = false

function doSync() {
  if (syncing) { pending = true; return }
  syncing = true
  exec(SYNC_CMD, { cwd: join(ROOT, '..', '..') }, (err, stdout) => {
    if (stdout) console.log(stdout.trim())
    if (err) console.error('sync error:', err.message)
    syncing = false
    if (pending) { pending = false; doSync() }
  })
}

// Watch projects
try {
  watch(PROJECTS_DIR, { recursive: true }, (event, filename) => {
    if (filename && filename.endsWith('.md')) {
      console.log(`📁 ${filename} changed → sync`)
      doSync()
    }
  })
  console.log('👀 Watching projects/*.md')
} catch (e) {
  console.error('Cannot watch projects:', e.message)
}

// Watch vault todo
try {
  watch(TODO_DIR, { recursive: true }, (event, filename) => {
    if (filename && filename.endsWith('.md')) {
      console.log(`📁 todo/${filename} changed → sync`)
      doSync()
    }
  })
  console.log('👀 Watching vault/todo/*.md')
} catch (e) {
  console.error('Cannot watch todo:', e.message)
}

// Watch vault knowledge
try {
  watch(KNOWLEDGE_DIR, { recursive: true }, (event, filename) => {
    if (filename && filename.endsWith('.md') && !filename.includes('inbox')) {
      console.log(`📁 knowledge/${filename} changed → sync`)
      doSync()
    }
  })
  console.log('👀 Watching vault/knowledge/*.md')
} catch (e) {
  console.error('Cannot watch knowledge:', e.message)
}

// Watch vault blog
try {
  watch(BLOG_DIR, { recursive: true }, (event, filename) => {
    if (filename && filename.endsWith('.md')) {
      console.log(`📁 blog/${filename} changed → sync`)
      doSync()
    }
  })
  console.log('👀 Watching vault/blog/*.md')
} catch (e) {
  console.error('Cannot watch blog:', e.message)
}
