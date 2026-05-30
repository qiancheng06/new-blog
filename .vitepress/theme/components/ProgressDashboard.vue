<template>
  <div class="progress-dashboard">
    <div class="status-tabs">
      <button v-for="s in statuses" :key="s.key" :class="['tab', { active: statusFilter === s.key }]" @click="statusFilter = s.key">
        {{ s.label }}<span class="count">{{ statusCounts[s.key] || 0 }}</span>
      </button>
    </div>

    <div class="project-grid">
      <div v-for="(p, pi) in filteredProjects" :key="p.id || p.name" :class="['project-card', p.status, p.priority, { expanded: openIndex === pi }]">
        <div class="card-click-area" @click="toggleExpand(pi)">
          <div class="card-top">
            <span class="status-badge" :style="{ background: statusColors[p.status] }">{{ statusLabels[p.status] }}</span>
            <span class="priority-badge">{{ priorityLabels[p.priority] }}</span>
          </div>
          <h3 class="project-name">{{ p.name }}</h3>
          <div class="progress-bar-wrap">
            <div class="progress-bar" :style="{ width: p.progress + '%' }"><div class="progress-glow" /></div>
            <span class="progress-text">{{ p.completedTasks }}/{{ p.totalTasks }} · {{ p.progress }}%</span>
          </div>
          <div class="tags"><span v-for="tag in p.tags" :key="tag" class="tag">{{ tag }}</span></div>
          <a v-if="p.repo" :href="p.repo" target="_blank" class="repo-link" @click.stop>{{ p.repo.replace('https://github.com/', '') }}</a>
        </div>

        <div v-if="openIndex === pi" class="card-detail">
          <div v-for="(s, si) in editableProjects[pi].sections" :key="si" class="detail-section">
            <div class="detail-section-header">
              <span class="detail-section-title">{{ s.name }}</span>
              <span class="detail-section-count">{{ sectionProgress(s).done }}/{{ sectionProgress(s).total }}</span>
            </div>
            <div class="detail-tasks">
              <div v-for="(t, ti) in s.tasks" :key="ti" :class="['detail-task', { done: t.done }]">
                <span class="detail-task-check" @click="toggleTask(pi, si, ti)">{{ t.done ? '✓' : '○' }}</span>
                <span class="detail-task-text">{{ t.text }}</span>
                <button class="detail-task-del" @click="deleteTask(pi, si, ti)">×</button>
              </div>
            </div>
            <div class="detail-add-form">
              <input v-model="newTaskText[pi + '-' + si]" placeholder="新任务，回车添加" @keydown.enter="addTask(pi, si)" @click.stop>
              <button @click.stop="addTask(pi, si)">+</button>
            </div>
          </div>
          <div class="detail-footer">
            <span class="storage-badge" :class="{ saved: dataSaved }">{{ dataSaved ? '✅ 已保存' : '📄 原始数据' }}</span>
            <button class="detail-btn" @click="openIndex = -1">收起</button>
          </div>
        </div>
      </div>
    </div>

    <p v-if="filteredProjects.length === 0" class="empty">无匹配项目</p>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, reactive } from 'vue'

interface TaskItem { text: string; done: boolean }
interface TaskSection { name: string; tasks: TaskItem[] }
interface Project {
  id: string; name: string; status: string; priority: string
  tags: string[]; repo: string; progress: number
  totalTasks: number; completedTasks: number
  sections: TaskSection[]
}

const STORAGE_KEY = 'vitepress_projects_data'
const openIndex = ref(-1)
const newTaskText = reactive<Record<string, string>>({})
const dataSaved = ref(false)

const modules = import.meta.glob('../../../projects/*.md', { eager: true, query: '?raw', import: 'default' })

function parseFrontmatter(raw: string): Record<string, any> {
  const match = raw.match(/^---\n([\s\S]*?)\n---/)
  if (!match) return {}
  const fm: Record<string, any> = {}
  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(':')
    if (idx === -1) continue
    const key = line.slice(0, idx).trim()
    let val: any = line.slice(idx + 1).trim()
    if (val.startsWith('[') && val.endsWith(']')) val = val.slice(1, -1).split(',').map((s: string) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean)
    else if (val === 'true') val = true
    else if (val === 'false') val = false
    else if (!isNaN(Number(val))) val = Number(val)
    fm[key] = val
  }
  return fm
}

function buildProjects(): Project[] {
  const result: Project[] = []
  for (const [path, raw] of Object.entries(modules)) {
    const fm = parseFrontmatter(raw as string)
    const items: { type: string; text: string; done?: boolean }[] = []
    let currentSection = ''
    for (const line of (raw as string).split('\n')) {
      const sm = line.match(/^##\s+(.+)/)
      if (sm) { currentSection = sm[1].trim(); items.push({ type: 'section', text: currentSection }); continue }
      const tm = line.match(/^-\s+\[([ x])\]\s+(.+)/)
      if (tm) items.push({ type: 'task', text: tm[2].trim(), done: tm[1] === 'x' })
    }
    const sections: TaskSection[] = []
    items.forEach(item => {
      if (item.type === 'section') { sections.push({ name: item.text, tasks: [] }); return }
      if (item.type === 'task' && sections.length > 0) sections[sections.length - 1].tasks.push({ text: item.text, done: item.done || false })
    })
    const allTasks = sections.flatMap(s => s.tasks)
    const done = allTasks.filter(t => t.done).length
    const id = path.split('/').pop()?.replace('.md', '') || ''
    result.push({
      id,
      name: fm.name || id,
      status: fm.status || 'planning',
      priority: fm.priority || 'medium',
      tags: fm.tags || [],
      repo: fm.repo || '',
      totalTasks: allTasks.length,
      completedTasks: done,
      progress: allTasks.length > 0 ? Math.round((done / allTasks.length) * 100) : 0,
      sections,
    })
  }
  return result.sort((a, b) => {
    const order: Record<string, number> = { high: 1, medium: 2, low: 3 }
    return (order[a.priority] || 9) - (order[b.priority] || 9)
  })
}

const sourceProjects = computed(() => buildProjects())

function loadEditable(): Project[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      const data = JSON.parse(saved) as Project[]
      if (Array.isArray(data) && data.length > 0) { dataSaved.value = true; return data }
    }
  } catch {}
  dataSaved.value = false
  return []
}

function saveEditable() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(editableProjects.value))
  dataSaved.value = true
}

const editableProjects = ref<Project[]>(loadEditable().length > 0 ? loadEditable() : buildProjects())

watch(sourceProjects, () => {
  const saved = loadEditable()
  if (saved.length === 0) editableProjects.value = buildProjects()
}, { immediate: false })

const filteredProjects = computed(() => {
  const f = statusFilter.value === 'all' ? editableProjects.value : editableProjects.value.filter(p => p.status === statusFilter.value)
  return f
})

function toggleExpand(idx: number) {
  openIndex.value = openIndex.value === idx ? -1 : idx
}

function toggleTask(pi: number, si: number, ti: number) {
  const task = editableProjects.value[pi].sections[si].tasks[ti]
  if (task) task.done = !task.done
  recalc(pi)
  saveEditable()
}

function deleteTask(pi: number, si: number, ti: number) {
  editableProjects.value[pi].sections[si].tasks.splice(ti, 1)
  recalc(pi)
  saveEditable()
}

function addTask(pi: number, si: number) {
  const key = pi + '-' + si
  const text = newTaskText[key]?.trim()
  if (!text) return
  editableProjects.value[pi].sections[si].tasks.push({ text, done: false })
  newTaskText[key] = ''
  recalc(pi)
  saveEditable()
}

function recalc(pi: number) {
  const p = editableProjects.value[pi]
  const all = p.sections.flatMap(s => s.tasks)
  const done = all.filter(t => t.done).length
  p.totalTasks = all.length
  p.completedTasks = done
  p.progress = all.length > 0 ? Math.round((done / all.length) * 100) : 0
}

function sectionProgress(s: TaskSection) {
  const total = s.tasks.length
  const done = s.tasks.filter(t => t.done).length
  return { total, done }
}

const statusFilter = ref('all')

const statuses = computed(() => {
  const keys = ['all', 'in-progress', 'planning', 'paused', 'done']
  return keys.map(k => ({ key: k, label: statusLabels[k] }))
})

const statusLabels: Record<string, string> = {
  all: '全部', 'in-progress': '进行中', planning: '规划中', paused: '暂停', done: '已完成',
}
const statusColors: Record<string, string> = {
  'in-progress': '#4a9eff', planning: '#fdcb6e', paused: '#636e72', done: '#00b894',
}
const priorityLabels: Record<string, string> = { high: '高优先', medium: '中优先', low: '低优先' }

const statusCounts = computed(() => {
  const counts: Record<string, number> = { all: editableProjects.value.length }
  for (const p of editableProjects.value) counts[p.status] = (counts[p.status] || 0) + 1
  return counts
})
</script>

<style scoped>
.progress-dashboard { margin: 1rem 0; }
.status-tabs { display: flex; gap: .5rem; margin-bottom: 1.5rem; flex-wrap: wrap; }
.tab {
  display: flex; align-items: center; gap: .4rem; padding: .45rem 1rem;
  border: 1px solid rgba(255,255,255,.08); border-radius: 8px;
  background: rgba(255,255,255,.03); color: rgba(255,255,255,.6);
  cursor: pointer; font-size: .85rem; transition: all .2s;
}
.tab:hover { background: rgba(255,255,255,.06); color: rgba(255,255,255,.85); }
.tab.active { background: rgba(74,158,255,.15); border-color: rgba(74,158,255,.3); color: #4a9eff; }
.count {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 1.4rem; height: 1.4rem; padding: 0 .3rem; border-radius: 10px;
  background: rgba(255,255,255,.06); font-size: .75rem; font-weight: 600;
}
.tab.active .count { background: rgba(74,158,255,.2); }
.project-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 1rem; }
.project-card {
  background: #1a1b2e; border: 1px solid rgba(255,255,255,.06);
  border-radius: 12px; overflow: hidden; transition: all .3s ease; position: relative;
}
.project-card::before {
  content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px; opacity: 0; transition: opacity .3s; z-index: 1;
}
.project-card.expanded::before { opacity: 1; }
.project-card:hover::before { opacity: 1; }
.project-card:hover { border-color: rgba(255,255,255,.12); transform: translateY(-2px); box-shadow: 0 8px 32px rgba(0,0,0,.3); }
.project-card.in-progress::before { background: linear-gradient(90deg, #4a9eff, #7c3aed); }
.project-card.planning::before { background: linear-gradient(90deg, #fdcb6e, #e17055); }
.project-card.paused::before { background: linear-gradient(90deg, #636e72, #b2bec3); }
.project-card.done::before { background: linear-gradient(90deg, #00b894, #00cec9); }
.card-click-area { padding: 1.25rem; cursor: pointer; }
.card-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: .75rem; }
.status-badge { font-size: .7rem; font-weight: 600; padding: .15rem .55rem; border-radius: 4px; color: #fff; text-transform: uppercase; letter-spacing: .3px; }
.priority-badge { font-size: .7rem; color: rgba(255,255,255,.35); padding: .15rem .4rem; border: 1px solid rgba(255,255,255,.08); border-radius: 4px; }
.project-name { font-size: 1.15rem; font-weight: 700; color: #fff; margin: 0 0 .75rem; letter-spacing: -.01em; }
.progress-bar-wrap { display: flex; align-items: center; gap: .6rem; margin-bottom: .75rem; }
.progress-bar { flex: 1; height: 6px; border-radius: 3px; background: rgba(255,255,255,.06); position: relative; overflow: hidden; }
.project-card.in-progress .progress-bar { background: linear-gradient(90deg, #4a9eff, #7c3aed); }
.project-card.planning .progress-bar { background: linear-gradient(90deg, #fdcb6e, #e17055); }
.project-card.paused .progress-bar { background: #636e72; }
.project-card.done .progress-bar { background: linear-gradient(90deg, #00b894, #00cec9); }
.progress-glow { position: absolute; top: 0; right: 0; width: 20px; height: 100%; background: rgba(255,255,255,.3); filter: blur(3px); }
.progress-text { font-size: .8rem; color: rgba(255,255,255,.45); white-space: nowrap; min-width: 3em; text-align: right; }
.tags { display: flex; flex-wrap: wrap; gap: .35rem; margin-bottom: .6rem; }
.tag { font-size: .72rem; padding: .15rem .5rem; border-radius: 4px; background: rgba(74,158,255,.1); color: rgba(74,158,255,.8); border: 1px solid rgba(74,158,255,.15); }
.repo-link { display: inline-block; font-size: .78rem; color: rgba(255,255,255,.35); margin-bottom: .75rem; text-decoration: none; transition: color .2s; }
.repo-link:hover { color: #4a9eff; }

.card-detail { border-top: 1px solid rgba(255,255,255,.06); padding: 1rem 1.25rem; animation: slideDown .2s ease; }
@keyframes slideDown { from { opacity: 0; max-height: 0; } to { opacity: 1; max-height: 600px; } }
.detail-section { margin-bottom: .75rem; }
.detail-section:last-child { margin-bottom: 0; }
.detail-section-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: .3rem; }
.detail-section-title { font-size: .78rem; font-weight: 600; color: rgba(255,255,255,.5); text-transform: uppercase; letter-spacing: .3px; }
.detail-section-count { font-size: .72rem; color: rgba(255,255,255,.3); }
.detail-tasks { list-style: none; padding: 0; margin: 0; }
.detail-task {
  display: flex; align-items: center; gap: .4rem;
  padding: .22rem 0; font-size: .85rem; color: rgba(255,255,255,.55); border-radius: 4px;
}
.detail-task:hover { background: rgba(255,255,255,.03); }
.detail-task.done { color: rgba(255,255,255,.3); text-decoration: line-through; }
.detail-task-check { flex-shrink: 0; width: 1rem; text-align: center; font-size: .75rem; cursor: pointer; transition: color .2s; }
.detail-task-check:hover { color: var(--vp-c-brand-1); }
.detail-task.done .detail-task-check { color: #00b894; }
.detail-task.done .detail-task-check:hover { color: #fdcb6e; }
.detail-task-text { flex: 1; }
.detail-task-del {
  opacity: 0; flex-shrink: 0; width: 1.2rem; height: 1.2rem; display: flex; align-items: center; justify-content: center;
  border: none; background: rgba(255,255,255,.06); color: rgba(255,255,255,.3);
  border-radius: 4px; cursor: pointer; font-size: .7rem; transition: all .2s;
}
.detail-task:hover .detail-task-del { opacity: .6; }
.detail-task-del:hover { opacity: 1 !important; color: #e17055; background: rgba(225,112,85,.15); }
.detail-add-form {
  display: flex; gap: .35rem; margin-top: .35rem; padding-top: .35rem; border-top: 1px solid rgba(255,255,255,.04);
}
.detail-add-form input {
  flex: 1; background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.06);
  border-radius: 6px; padding: .25rem .5rem; color: var(--vp-c-text-1); font-size: .8rem; outline: none;
}
.detail-add-form input:focus { border-color: rgba(74,158,255,.3); }
.detail-add-form button {
  padding: .25rem .6rem; border-radius: 6px; border: 1px solid rgba(255,255,255,.06);
  background: transparent; color: rgba(255,255,255,.45); cursor: pointer; font-size: .8rem; transition: all .2s;
}
.detail-add-form button:hover { background: rgba(74,158,255,.1); color: var(--vp-c-brand-1); }
.detail-footer { display: flex; align-items: center; justify-content: space-between; margin-top: .5rem; padding-top: .5rem; border-top: 1px solid rgba(255,255,255,.04); }
.storage-badge { font-size: .7rem; color: rgba(255,255,255,.3); }
.storage-badge.saved { color: #00b894; }
.detail-btn {
  padding: .2rem .6rem; border-radius: 6px; border: 1px solid rgba(255,255,255,.06);
  background: transparent; color: rgba(255,255,255,.45); cursor: pointer; font-size: .75rem; transition: all .2s;
}
.detail-btn:hover { color: var(--vp-c-text-1); border-color: rgba(255,255,255,.15); }

.empty { text-align: center; color: rgba(255,255,255,.3); padding: 2rem; }
</style>
