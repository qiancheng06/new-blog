import { watch } from 'fs'
import { exec } from 'child_process'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const PROJECTS_DIR = join(ROOT, 'projects')
const TODO_DIR = 'C:\\Users\\33831\\OneDrive\\obsidian\\obsidian\\todo'
const KNOWLEDGE_DIR = 'C:\\Users\\33831\\OneDrive\\obsidian\\obsidian\\knowledge'
const SYNC_CMD = 'node scripts/sync-projects.js'

let syncing = false
let pending = false

function doSync() {
  if (syncing) { pending = true; return }
  syncing = true
  exec(SYNC_CMD, { cwd: ROOT }, (err, stdout) => {
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
