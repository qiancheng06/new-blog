<template>
  <div class="progress-dashboard">
    <div class="status-tabs">
      <button
        v-for="s in statuses"
        :key="s.key"
        :class="['tab', { active: statusFilter === s.key }]"
        @click="statusFilter = s.key"
      >
        {{ s.label }}
        <span class="count">{{ statusCounts[s.key] || 0 }}</span>
      </button>
    </div>

    <div class="project-grid">
      <div
        v-for="p in filteredProjects"
        :key="p.name"
        class="project-card"
        :class="[p.status, p.priority]"
      >
        <div class="card-top">
          <span class="status-badge" :style="{ background: statusColors[p.status] }">
            {{ statusLabels[p.status] }}
          </span>
          <span class="priority-badge">{{ priorityLabels[p.priority] }}</span>
        </div>

        <h3 class="project-name">{{ p.name }}</h3>

        <div class="progress-bar-wrap">
          <div class="progress-bar" :style="{ width: p.progress + '%' }">
            <div class="progress-glow" />
          </div>
          <span class="progress-text">{{ p.completedTasks }}/{{ p.totalTasks }}</span>
        </div>

        <div class="tags">
          <span v-for="tag in p.tags" :key="tag" class="tag">{{ tag }}</span>
        </div>

        <a v-if="p.repo" :href="p.repo" target="_blank" class="repo-link">
          {{ p.repo.replace('https://github.com/', '') }}
        </a>

        <div v-if="p.sections.length > 0">
          <div v-for="(s, si) in p.sections" :key="si" class="task-section">
            <div class="task-section-title">{{ s.name }}</div>
            <div class="task-list">
              <div v-for="t in s.tasks" :key="t.text" :class="['task', { done: t.done }]">
                <span class="task-check">{{ t.done ? '✓' : '○' }}</span>
                <span class="task-text">{{ t.text }}</span>
              </div>
            </div>
          </div>
        </div>
        <div v-else class="task-list">
          <div v-for="t in p.tasks" :key="t.text" :class="['task', { done: t.done }]">
            <span class="task-check">{{ t.done ? '✓' : '○' }}</span>
            <span class="task-text">{{ t.text }}</span>
          </div>
        </div>
      </div>
    </div>

    <p v-if="filteredProjects.length === 0" class="empty">无匹配项目</p>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

interface TaskItem {
  text: string
  done: boolean
  section?: string
}

interface TaskSection {
  name: string
  tasks: TaskItem[]
}

interface Project {
  name: string
  status: string
  priority: string
  tags: string[]
  repo: string
  totalTasks: number
  completedTasks: number
  progress: number
  sections: TaskSection[]
  tasks: TaskItem[]
}

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

const projectFiles = computed<Project[]>(() => {
  const result: Project[] = []
  for (const [path, raw] of Object.entries(modules)) {
    const fm = parseFrontmatter(raw as string)
    const items: { type: string; text: string; done?: boolean; section?: string }[] = []
    let currentSection = ''
    for (const line of (raw as string).split('\n')) {
      const sm = line.match(/^##\s+(.+)/)
      if (sm) { currentSection = sm[1].trim(); items.push({ type: 'section', text: currentSection }); continue }
      const tm = line.match(/^-\s+\[([ x])\]\s+(.+)/)
      if (tm) items.push({ type: 'task', text: tm[2].trim(), done: tm[1] === 'x', section: currentSection })
    }
    const taskItems = items.filter(i => i.type === 'task') as TaskItem[]
    const sections: TaskSection[] = []
    items.forEach(item => {
      if (item.type === 'section') { sections.push({ name: item.text, tasks: [] }); return }
      if (item.type === 'task' && sections.length > 0) sections[sections.length - 1].tasks.push(item as TaskItem)
    })
    const total = taskItems.length
    const done = taskItems.filter(t => t.done).length
    result.push({
      name: fm.name || path.split('/').pop()?.replace('.md', '') || '',
      status: fm.status || 'planning',
      priority: fm.priority || 'medium',
      tags: fm.tags || [],
      repo: fm.repo || '',
      totalTasks: total,
      completedTasks: done,
      progress: total > 0 ? Math.round((done / total) * 100) : 0,
      sections,
      tasks: taskItems,
    })
  }
  return result.sort((a, b) => {
    const order: Record<string, number> = { high: 1, medium: 2, low: 3 }
    return (order[a.priority] || 9) - (order[b.priority] || 9)
  })
})

const statusFilter = ref('all')

const statuses = computed(() => {
  const keys = ['all', 'in-progress', 'planning', 'paused', 'done']
  return keys.map(k => ({ key: k, label: statusLabels[k] }))
})

const statusLabels: Record<string, string> = {
  all: '全部',
  'in-progress': '进行中',
  planning: '规划中',
  paused: '暂停',
  done: '已完成',
}

const statusColors: Record<string, string> = {
  'in-progress': '#4a9eff',
  planning: '#fdcb6e',
  paused: '#636e72',
  done: '#00b894',
}

const priorityLabels: Record<string, string> = {
  high: '高优先',
  medium: '中优先',
  low: '低优先',
}

const filteredProjects = computed(() =>
  statusFilter.value === 'all'
    ? projectFiles.value
    : projectFiles.value.filter(p => p.status === statusFilter.value)
)

const statusCounts = computed(() => {
  const counts: Record<string, number> = { all: projectFiles.value.length }
  for (const p of projectFiles.value) {
    counts[p.status] = (counts[p.status] || 0) + 1
  }
  return counts
})
</script>

<style scoped>
.progress-dashboard {
  margin: 1rem 0;
}

.status-tabs {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1.5rem;
  flex-wrap: wrap;
}

.tab {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.45rem 1rem;
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 8px;
  background: rgba(255,255,255,0.03);
  color: rgba(255,255,255,0.6);
  cursor: pointer;
  font-size: 0.85rem;
  transition: all 0.2s;
}

.tab:hover {
  background: rgba(255,255,255,0.06);
  color: rgba(255,255,255,0.85);
}

.tab.active {
  background: rgba(74,158,255,0.15);
  border-color: rgba(74,158,255,0.3);
  color: #4a9eff;
}

.count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.4rem;
  height: 1.4rem;
  padding: 0 0.3rem;
  border-radius: 10px;
  background: rgba(255,255,255,0.06);
  font-size: 0.75rem;
  font-weight: 600;
}

.tab.active .count {
  background: rgba(74,158,255,0.2);
}

.project-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 1rem;
}

.project-card {
  background: #1a1b2e;
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 12px;
  padding: 1.25rem;
  transition: all 0.3s ease;
  position: relative;
  overflow: hidden;
}

.project-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  opacity: 0;
  transition: opacity 0.3s;
}

.project-card:hover {
  border-color: rgba(255,255,255,0.12);
  transform: translateY(-2px);
  box-shadow: 0 8px 32px rgba(0,0,0,0.3), 0 0 0 1px rgba(74,158,255,0.1);
}

.project-card:hover::before {
  opacity: 1;
}

.project-card.in-progress::before { background: linear-gradient(90deg, #4a9eff, #7c3aed); }
.project-card.planning::before { background: linear-gradient(90deg, #fdcb6e, #e17055); }
.project-card.paused::before { background: linear-gradient(90deg, #636e72, #b2bec3); }
.project-card.done::before { background: linear-gradient(90deg, #00b894, #00cec9); }

.card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.75rem;
}

.status-badge {
  font-size: 0.7rem;
  font-weight: 600;
  padding: 0.15rem 0.55rem;
  border-radius: 4px;
  color: #fff;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.priority-badge {
  font-size: 0.7rem;
  color: rgba(255,255,255,0.35);
  padding: 0.15rem 0.4rem;
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 4px;
}

.project-name {
  font-size: 1.15rem;
  font-weight: 700;
  color: #fff;
  margin: 0 0 0.75rem;
  letter-spacing: -0.01em;
}

.progress-bar-wrap {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin-bottom: 0.75rem;
}

.progress-bar {
  flex: 1;
  height: 6px;
  border-radius: 3px;
  background: rgba(255,255,255,0.06);
  position: relative;
  overflow: hidden;
}

.project-card.in-progress .progress-bar { background: linear-gradient(90deg, #4a9eff, #7c3aed); }
.project-card.planning .progress-bar { background: linear-gradient(90deg, #fdcb6e, #e17055); }
.project-card.paused .progress-bar { background: #636e72; }
.project-card.done .progress-bar { background: linear-gradient(90deg, #00b894, #00cec9); }

.progress-glow {
  position: absolute;
  top: 0;
  right: 0;
  width: 20px;
  height: 100%;
  background: rgba(255,255,255,0.3);
  filter: blur(3px);
}

.progress-text {
  font-size: 0.8rem;
  color: rgba(255,255,255,0.45);
  white-space: nowrap;
  min-width: 3em;
  text-align: right;
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin-bottom: 0.6rem;
}

.tag {
  font-size: 0.72rem;
  padding: 0.15rem 0.5rem;
  border-radius: 4px;
  background: rgba(74,158,255,0.1);
  color: rgba(74,158,255,0.8);
  border: 1px solid rgba(74,158,255,0.15);
}

.repo-link {
  display: inline-block;
  font-size: 0.78rem;
  color: rgba(255,255,255,0.35);
  margin-bottom: 0.75rem;
  text-decoration: none;
  transition: color 0.2s;
}

.repo-link:hover {
  color: #4a9eff;
}

.task-section {
  border-top: 1px solid rgba(255,255,255,0.06);
  padding-top: 0.5rem;
  margin-top: 0.5rem;
}

.task-section:first-child {
  border-top: none;
  padding-top: 0;
  margin-top: 0;
}

.task-section-title {
  font-size: 0.72rem;
  font-weight: 600;
  color: rgba(255,255,255,0.4);
  margin-bottom: 0.25rem;
  letter-spacing: 0.3px;
  text-transform: uppercase;
}

.task-list {
  padding-top: 0;
}

.task {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.2rem 0;
  font-size: 0.82rem;
  color: rgba(255,255,255,0.55);
}

.task.done {
  color: rgba(255,255,255,0.3);
  text-decoration: line-through;
}

.task-check {
  flex-shrink: 0;
  width: 1rem;
  text-align: center;
  font-size: 0.75rem;
}

.task.done .task-check {
  color: #00b894;
}

.task-text {
  line-height: 1.4;
}

.empty {
  text-align: center;
  color: rgba(255,255,255,0.3);
  padding: 2rem;
}
</style>
