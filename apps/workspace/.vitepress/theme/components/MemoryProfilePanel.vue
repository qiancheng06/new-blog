<template>
  <div class="memory-panel-root">
    <button v-if="!open" class="memory-fab" type="button" title="Memory profile" @click="toggle">
      <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 3a7 7 0 0 0-7 7c0 4.5 7 11 7 11s7-6.5 7-11a7 7 0 0 0-7-7Z" />
        <circle cx="12" cy="10" r="2.5" />
      </svg>
    </button>

    <section v-else class="memory-panel" aria-label="Memory profile">
      <header class="memory-header">
        <div>
          <div class="memory-title">Memory</div>
          <div class="memory-subtitle">{{ subtitle }}</div>
        </div>
        <div class="memory-actions">
          <button class="icon-button" type="button" title="Refresh memory" :disabled="loading" @click="load">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3">
              <path d="M21 12a9 9 0 0 1-15.6 6" />
              <path d="M3 12a9 9 0 0 1 15.6-6" />
              <path d="M3 18h5v-5" />
              <path d="M21 6h-5v5" />
            </svg>
          </button>
          <button class="icon-button" type="button" title="Close memory" @click="toggle">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </header>

      <div class="memory-stats">
        <div><span>{{ stats.profile }}</span><small>Profile</small></div>
        <div><span>{{ stats.topics }}</span><small>Topics</small></div>
        <div><span>{{ stats.timelineEvents }}</span><small>Timeline</small></div>
      </div>

      <div class="memory-body">
        <form class="memory-correction" @submit.prevent="submitCorrection">
          <input v-model="correctionKey" class="memory-input" placeholder="profile key" />
          <textarea v-model="correctionValue" class="memory-textarea" rows="2" placeholder="corrected value" />
          <input v-model="correctionReason" class="memory-input" placeholder="reason, optional" />
          <button class="memory-submit" type="submit" :disabled="saving || !correctionKey.trim()">Apply correction</button>
          <div v-if="saveMessage" class="memory-save">{{ saveMessage }}</div>
        </form>

        <div v-if="loading" class="memory-state">Loading memory...</div>
        <div v-else-if="error" class="memory-state error">{{ error }}</div>
        <div v-else-if="profile.length === 0" class="memory-state">No profile memory yet.</div>
        <div v-else class="memory-list">
          <article v-for="item in profile" :key="item.id" class="memory-item">
            <button class="memory-key" type="button" @click="useProfileKey(item.key)">{{ item.key }}</button>
            <div class="memory-value">{{ formatValue(item.value) }}</div>
            <div class="memory-meta">
              <span>{{ formatDate(item.updated_at) }}</span>
              <span v-if="item.source_event_id">source linked</span>
              <span v-else>no source</span>
            </div>
          </article>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { getPersonaJson, postPersonaJson } from '../api/personaApi'

interface MemoryStats {
  topics: number
  profile: number
  timelineEvents: number
}

interface ProfileRow {
  id: string
  key: string
  value: string
  source_event_id: string | null
  updated_at: string
}

interface MemoryProfileResponse {
  items: ProfileRow[]
  limit: number
  offset: number
}

interface StatusResponse {
  memory?: Partial<MemoryStats>
}

const open = ref(false)
const loading = ref(false)
const error = ref('')
const saving = ref(false)
const saveMessage = ref('')
const correctionKey = ref('')
const correctionValue = ref('')
const correctionReason = ref('')
const profile = ref<ProfileRow[]>([])
const stats = ref<MemoryStats>({ topics: 0, profile: 0, timelineEvents: 0 })

const subtitle = computed(() => {
  if (error.value) return 'offline'
  if (loading.value) return 'refreshing'
  return 'read-only profile'
})

async function toggle() {
  open.value = !open.value
  if (open.value && profile.value.length === 0 && !loading.value) await load()
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const [status, memory] = await Promise.all([
      getPersonaJson<StatusResponse>('/api/status'),
      getPersonaJson<MemoryProfileResponse>('/api/memory/profile?limit=8&offset=0'),
    ])
    stats.value = {
      topics: Number(status.memory?.topics ?? 0),
      profile: Number(status.memory?.profile ?? memory.items.length),
      timelineEvents: Number(status.memory?.timelineEvents ?? 0),
    }
    profile.value = memory.items
  } catch {
    error.value = 'Persona API offline. Start npm.cmd run dev:backend:mock or dev:backend.'
  } finally {
    loading.value = false
  }
}

async function submitCorrection() {
  const key = correctionKey.value.trim()
  if (!key || saving.value) return

  saving.value = true
  saveMessage.value = ''
  try {
    await postPersonaJson('/api/memory/profile/corrections', {
      key,
      value: parseCorrectionValue(correctionValue.value),
      reason: correctionReason.value.trim() || undefined,
    })
    saveMessage.value = 'Correction recorded as a memory governance event.'
    correctionValue.value = ''
    correctionReason.value = ''
    await load()
  } catch {
    saveMessage.value = 'Correction failed. Check Persona API status.'
  } finally {
    saving.value = false
  }
}

function useProfileKey(key: string) {
  correctionKey.value = key
}

function parseCorrectionValue(value: string): unknown {
  const trimmed = value.trim()
  if (!trimmed) return ''
  try {
    return JSON.parse(trimmed) as unknown
  } catch {
    return trimmed
  }
}

function formatValue(value: string): string {
  try {
    const parsed = JSON.parse(value) as unknown
    if (Array.isArray(parsed)) return parsed.join(', ')
    if (parsed && typeof parsed === 'object') return JSON.stringify(parsed)
    return String(parsed)
  } catch {
    return value
  }
}

function formatDate(value: string): string {
  if (!value) return 'unknown'
  return value.replace('T', ' ').replace(/\.\d+Z$/, '')
}
</script>

<style scoped>
.memory-panel-root {
  position: fixed;
  right: 24px;
  bottom: 92px;
  z-index: 99;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'PingFang SC', 'Microsoft YaHei', sans-serif;
}

.memory-fab {
  width: 48px;
  height: 48px;
  border-radius: 14px;
  border: 1px solid rgba(22, 163, 74, 0.28);
  background: rgba(18, 31, 27, 0.92);
  color: #7dd3a7;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.32);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.memory-panel {
  width: 360px;
  max-height: 520px;
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(18, 22, 30, 0.96);
  color: rgba(255, 255, 255, 0.88);
  box-shadow: 0 18px 54px rgba(0, 0, 0, 0.44);
  overflow: hidden;
}

.memory-header {
  padding: 14px 16px;
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.memory-title {
  font-size: 0.92rem;
  font-weight: 700;
}

.memory-subtitle {
  margin-top: 2px;
  font-size: 0.7rem;
  color: rgba(255, 255, 255, 0.48);
}

.memory-actions {
  display: flex;
  gap: 8px;
}

.icon-button {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.04);
  color: rgba(255, 255, 255, 0.68);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.icon-button:disabled {
  cursor: wait;
  opacity: 0.45;
}

.memory-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1px;
  background: rgba(255, 255, 255, 0.06);
}

.memory-stats div {
  padding: 10px 8px;
  background: rgba(255, 255, 255, 0.03);
  text-align: center;
}

.memory-stats span {
  display: block;
  font-size: 1rem;
  font-weight: 700;
}

.memory-stats small {
  display: block;
  margin-top: 2px;
  color: rgba(255, 255, 255, 0.46);
  font-size: 0.64rem;
}

.memory-body {
  max-height: 430px;
  overflow-y: auto;
}

.memory-correction {
  padding: 12px 10px 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.memory-input,
.memory-textarea {
  width: 100%;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.045);
  color: rgba(255, 255, 255, 0.86);
  padding: 8px 10px;
  font: inherit;
  font-size: 0.76rem;
  outline: none;
  box-sizing: border-box;
}

.memory-textarea {
  resize: vertical;
  min-height: 58px;
  max-height: 120px;
}

.memory-submit {
  height: 32px;
  border-radius: 8px;
  border: 1px solid rgba(125, 211, 167, 0.25);
  background: rgba(22, 163, 74, 0.18);
  color: #a7f3d0;
  cursor: pointer;
  font-weight: 650;
  font-size: 0.74rem;
}

.memory-submit:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.memory-save {
  color: rgba(255, 255, 255, 0.52);
  font-size: 0.68rem;
  line-height: 1.35;
}

.memory-state {
  padding: 28px 18px;
  color: rgba(255, 255, 255, 0.55);
  font-size: 0.82rem;
  line-height: 1.5;
}

.memory-state.error {
  color: #fca5a5;
}

.memory-list {
  padding: 10px;
}

.memory-item {
  padding: 10px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.045);
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.memory-item + .memory-item {
  margin-top: 8px;
}

.memory-key {
  appearance: none;
  border: 0;
  padding: 0;
  background: transparent;
  font-size: 0.76rem;
  font-weight: 700;
  color: #93c5fd;
  overflow-wrap: anywhere;
  cursor: pointer;
  text-align: left;
}

.memory-value {
  margin-top: 5px;
  font-size: 0.8rem;
  line-height: 1.45;
  color: rgba(255, 255, 255, 0.82);
  overflow-wrap: anywhere;
}

.memory-meta {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-top: 8px;
  font-size: 0.64rem;
  color: rgba(255, 255, 255, 0.38);
}

@media (max-width: 480px) {
  .memory-panel-root {
    right: 12px;
    bottom: 76px;
  }

  .memory-panel {
    width: calc(100vw - 24px);
  }
}
</style>
