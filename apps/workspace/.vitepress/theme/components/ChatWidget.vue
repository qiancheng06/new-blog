<template>
  <div class="chat-widget">
    <Transition name="fab">
      <button v-if="!isOpen" class="chat-fab" @click="open" title="和 Companion 聊聊">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        <span v-if="online" class="fab-pulse" />
      </button>
    </Transition>

    <Transition name="panel">
      <div v-if="isOpen" class="chat-panel">
        <div class="chat-header">
          <div class="chat-avatar">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M8 14s1.5 2 4 2 4-2 4-2" />
              <line x1="9" y1="9" x2="9.01" y2="9" />
              <line x1="15" y1="9" x2="15.01" y2="9" />
            </svg>
          </div>
          <div class="chat-header-text">
            <span class="chat-title">Companion</span>
            <span class="chat-subtitle">认知陪伴</span>
          </div>
          <div class="chat-header-actions">
            <span class="chat-status" :class="online ? 'online' : 'offline'">
              <span class="dot" />
              {{ online ? '在线' : '离线' }}
            </span>
            <button class="chat-close" @click="close" title="关闭">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        <div class="chat-messages" ref="messagesEl">
          <div v-if="messages.length === 0" class="chat-welcome">
            <div class="welcome-icon">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="url(#wg)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <defs><linearGradient id="wg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#4a9eff" /><stop offset="100%" stop-color="#7c3aed" /></linearGradient></defs>
                <circle cx="12" cy="12" r="10" />
                <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                <line x1="9" y1="9" x2="9.01" y2="9" />
                <line x1="15" y1="9" x2="15.01" y2="9" />
              </svg>
            </div>
            <div class="welcome-title">有什么想法？</div>
            <div class="welcome-sub">输入任何内容，Companion 会回应</div>
            <div class="welcome-hints">
              <button class="hint-chip" @click="useHint('今天我该做什么？')">今天我该做什么？</button>
              <button class="hint-chip" @click="useHint('帮我理清思路')">帮我理清思路</button>
              <button class="hint-chip" @click="useHint('随便聊聊')">随便聊聊</button>
            </div>
          </div>

          <div v-for="(msg, i) in messages" :key="i" class="msg" :class="msg.role">
            <div v-if="msg.role === 'assistant'" class="msg-avatar">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M8 14s1.5 2 4 2 4-2 4-2" />
              </svg>
            </div>
            <div class="msg-content">
              <div class="msg-bubble" v-html="renderMarkdown(msg.text)" />
              <div class="msg-time">{{ msg.time }}</div>
            </div>
          </div>

          <div v-if="loading" class="msg assistant">
            <div class="msg-avatar">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M8 14s1.5 2 4 2 4-2 4-2" />
              </svg>
            </div>
            <div class="msg-content">
              <div class="msg-bubble typing-bubble">
                <div class="typing-dots"><span /><span /><span /></div>
              </div>
            </div>
          </div>
        </div>

        <div class="chat-input-wrap">
          <textarea
            ref="inputEl"
            v-model="input"
            class="chat-input"
            rows="1"
            placeholder="说点什么…"
            @keydown="onKeydown"
            @input="autoResize"
          />
          <button class="chat-send" :disabled="!input.trim() || loading" @click="send">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick, onMounted } from 'vue'
import { personaUrl } from '../api/personaApi'

interface ChatMessage {
  role: 'user' | 'assistant'
  text: string
  time: string
}

const API_URL = personaUrl('/api/chat')
const HEALTH_URL = personaUrl('/health')

const isOpen = ref(false)
const input = ref('')
const messages = ref<ChatMessage[]>([])
const loading = ref(false)
const online = ref(false)
const messagesEl = ref<HTMLElement>()
const inputEl = ref<HTMLTextAreaElement>()

function open() {
  isOpen.value = true
  nextTick(() => inputEl.value?.focus())
}

function close() {
  isOpen.value = false
}

function formatTime(d: Date): string {
  return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0')
}

function scrollBottom() {
  nextTick(() => {
    if (messagesEl.value) messagesEl.value.scrollTop = messagesEl.value.scrollHeight
  })
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    if (input.value.trim() && !loading.value) send()
  }
}

function autoResize() {
  const el = inputEl.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 100) + 'px'
}

function useHint(text: string) {
  input.value = text
  nextTick(() => {
    autoResize()
    inputEl.value?.focus()
  })
}

function renderMarkdown(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>')
}

async function send() {
  const text = input.value.trim()
  if (!text || loading.value) return

  input.value = ''
  if (inputEl.value) inputEl.value.style.height = 'auto'
  messages.value.push({ role: 'user', text, time: formatTime(new Date()) })
  scrollBottom()

  loading.value = true

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, page: location.pathname }),
    })
    const data = await res.json()
    messages.value.push({
      role: 'assistant',
      text: data.reply || '嗯，我在的。',
      time: formatTime(new Date()),
    })
  } catch {
    messages.value.push({
      role: 'assistant',
      text: '连接失败，请确认后端运行中 (npm run dev:backend)',
      time: formatTime(new Date()),
    })
  } finally {
    loading.value = false
    scrollBottom()
    nextTick(() => inputEl.value?.focus())
  }
}

onMounted(async () => {
  try {
    const r = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(3000) })
    online.value = r.ok
  } catch {
    online.value = false
  }
})
</script>

<style scoped>
.chat-widget {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 100;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'PingFang SC', 'Microsoft YaHei', sans-serif;
}

/* ── FAB button ── */
.chat-fab {
  position: relative;
  width: 54px;
  height: 54px;
  border-radius: 16px;
  border: 1px solid rgba(74, 158, 255, 0.2);
  cursor: pointer;
  background: linear-gradient(135deg, rgba(74, 158, 255, 0.15), rgba(124, 58, 237, 0.15));
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  color: #4a9eff;
  font-size: 1.4rem;
  box-shadow: 0 4px 24px rgba(74, 158, 255, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.06);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  display: flex;
  align-items: center;
  justify-content: center;
}
.chat-fab:hover {
  transform: translateY(-2px) scale(1.05);
  box-shadow: 0 8px 32px rgba(74, 158, 255, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.1);
  border-color: rgba(74, 158, 255, 0.35);
  background: linear-gradient(135deg, rgba(74, 158, 255, 0.22), rgba(124, 58, 237, 0.22));
}
.chat-fab:active { transform: scale(0.95); }

.fab-pulse {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #00b894;
  box-shadow: 0 0 8px rgba(0, 184, 148, 0.6);
  animation: fab-pulse 2s ease-in-out infinite;
}
@keyframes fab-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.6; transform: scale(0.8); }
}

/* ── Panel ── */
.chat-panel {
  position: fixed;
  bottom: 24px;
  right: 24px;
  width: 400px;
  height: 560px;
  background: rgba(26, 27, 46, 0.95);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 20px;
  box-shadow: 0 16px 64px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.03) inset;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* ── Header ── */
.chat-header {
  padding: 16px 18px;
  display: flex;
  align-items: center;
  gap: 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  flex-shrink: 0;
  background: rgba(255, 255, 255, 0.02);
}
.chat-avatar {
  width: 36px;
  height: 36px;
  border-radius: 12px;
  background: linear-gradient(135deg, rgba(74, 158, 255, 0.2), rgba(124, 58, 237, 0.2));
  border: 1px solid rgba(74, 158, 255, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #4a9eff;
  flex-shrink: 0;
}
.chat-header-text {
  flex: 1;
  min-width: 0;
}
.chat-title {
  font-size: 0.9rem;
  font-weight: 700;
  color: #fff;
  display: block;
  line-height: 1.2;
}
.chat-subtitle {
  font-size: 0.68rem;
  color: rgba(255, 255, 255, 0.35);
  display: block;
  margin-top: 1px;
}
.chat-header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}
.chat-status {
  font-size: 0.68rem;
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 3px 8px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.04);
}
.chat-status.online { color: #00b894; }
.chat-status.offline { color: rgba(255, 255, 255, 0.3); }
.chat-status .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}
.chat-status.online .dot {
  background: #00b894;
  box-shadow: 0 0 6px rgba(0, 184, 148, 0.5);
  animation: status-pulse 2s ease-in-out infinite;
}
.chat-status.offline .dot { background: rgba(255, 255, 255, 0.2); }
@keyframes status-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

.chat-close {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  border: none;
  background: rgba(255, 255, 255, 0.04);
  color: rgba(255, 255, 255, 0.4);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}
.chat-close:hover {
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.8);
}

/* ── Messages ── */
.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.06) transparent;
}
.chat-messages::-webkit-scrollbar { width: 4px; }
.chat-messages::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.08); border-radius: 2px; }
.chat-messages::-webkit-scrollbar-track { background: transparent; }

/* ── Welcome ── */
.chat-welcome {
  text-align: center;
  padding: 2.5rem 1.5rem 2rem;
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
}
.welcome-icon {
  width: 64px;
  height: 64px;
  border-radius: 20px;
  background: linear-gradient(135deg, rgba(74, 158, 255, 0.08), rgba(124, 58, 237, 0.08));
  border: 1px solid rgba(74, 158, 255, 0.12);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 8px;
}
.welcome-title {
  font-size: 1.05rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.85);
}
.welcome-sub {
  font-size: 0.78rem;
  color: rgba(255, 255, 255, 0.35);
  margin-bottom: 12px;
}
.welcome-hints {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: center;
}
.hint-chip {
  font-size: 0.75rem;
  padding: 5px 12px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.03);
  color: rgba(255, 255, 255, 0.5);
  cursor: pointer;
  transition: all 0.2s;
}
.hint-chip:hover {
  background: rgba(74, 158, 255, 0.1);
  border-color: rgba(74, 158, 255, 0.25);
  color: #4a9eff;
}

/* ── Message bubbles ── */
.msg {
  display: flex;
  gap: 8px;
  max-width: 88%;
}
.msg.user { align-self: flex-end; flex-direction: row-reverse; }
.msg.assistant { align-self: flex-start; }

.msg-avatar {
  width: 26px;
  height: 26px;
  border-radius: 8px;
  background: rgba(74, 158, 255, 0.12);
  border: 1px solid rgba(74, 158, 255, 0.15);
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(74, 158, 255, 0.7);
  flex-shrink: 0;
  margin-top: 2px;
}

.msg-content {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.msg.user .msg-content { align-items: flex-end; }

.msg-bubble {
  padding: 10px 14px;
  border-radius: 14px;
  font-size: 0.84rem;
  line-height: 1.55;
  word-break: break-word;
}
.msg-bubble :deep(code) {
  background: rgba(0, 0, 0, 0.2);
  padding: 0.1em 0.35em;
  border-radius: 3px;
  font-size: 0.82em;
  font-family: 'SF Mono', 'Fira Code', monospace;
}
.msg-bubble :deep(strong) { color: rgba(255, 255, 255, 0.95); }

.msg.user .msg-bubble {
  background: linear-gradient(135deg, #4a9eff, #7c3aed);
  color: #fff;
  border-bottom-right-radius: 4px;
  box-shadow: 0 2px 12px rgba(74, 158, 255, 0.25);
}
.msg.assistant .msg-bubble {
  background: rgba(255, 255, 255, 0.05);
  color: rgba(255, 255, 255, 0.85);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-bottom-left-radius: 4px;
}

.msg-time {
  font-size: 0.62rem;
  color: rgba(255, 255, 255, 0.2);
  margin-top: 4px;
  padding: 0 4px;
}
.msg.user .msg-time { text-align: right; }

/* ── Typing indicator ── */
.typing-bubble {
  padding: 12px 16px !important;
}
.typing-dots {
  display: flex;
  gap: 5px;
  align-items: center;
}
.typing-dots span {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: rgba(74, 158, 255, 0.5);
  animation: typing 1.4s ease-in-out infinite;
}
.typing-dots span:nth-child(2) { animation-delay: 0.15s; }
.typing-dots span:nth-child(3) { animation-delay: 0.3s; }
@keyframes typing {
  0%, 100% { opacity: 0.3; transform: translateY(0); }
  50% { opacity: 1; transform: translateY(-3px); }
}

/* ── Input area ── */
.chat-input-wrap {
  padding: 12px 16px 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  flex-shrink: 0;
  display: flex;
  gap: 10px;
  align-items: flex-end;
  background: rgba(255, 255, 255, 0.01);
}
.chat-input {
  flex: 1;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 10px 14px;
  font-size: 0.84rem;
  color: rgba(255, 255, 255, 0.85);
  outline: none;
  resize: none;
  max-height: 100px;
  min-height: 40px;
  font-family: inherit;
  line-height: 1.45;
  transition: border-color 0.2s, box-shadow 0.2s;
}
.chat-input:focus {
  border-color: rgba(74, 158, 255, 0.35);
  box-shadow: 0 0 0 3px rgba(74, 158, 255, 0.08);
}
.chat-input::placeholder { color: rgba(255, 255, 255, 0.25); }

.chat-send {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  border: none;
  cursor: pointer;
  background: linear-gradient(135deg, #4a9eff, #7c3aed);
  color: #fff;
  flex-shrink: 0;
  transition: all 0.25s;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 12px rgba(74, 158, 255, 0.25);
}
.chat-send:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 18px rgba(74, 158, 255, 0.4);
}
.chat-send:active:not(:disabled) { transform: scale(0.92); }
.chat-send:disabled {
  opacity: 0.3;
  cursor: not-allowed;
  box-shadow: none;
}

/* ── Transitions ── */
.fab-enter-active { animation: fab-in 0.3s cubic-bezier(0.34, 1.56, 0.64, 1); }
.fab-leave-active { animation: fab-in 0.2s ease reverse; }
@keyframes fab-in {
  from { opacity: 0; transform: scale(0.6); }
  to { opacity: 1; transform: scale(1); }
}

.panel-enter-active { animation: panel-in 0.35s cubic-bezier(0.16, 1, 0.3, 1); }
.panel-leave-active { animation: panel-in 0.2s ease reverse; }
@keyframes panel-in {
  from { opacity: 0; transform: translateY(16px) scale(0.96); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

/* ── Responsive ── */
@media (max-width: 480px) {
  .chat-panel {
    width: calc(100vw - 24px);
    right: 12px;
    bottom: 12px;
    height: 70vh;
    border-radius: 16px;
  }
  .chat-widget { bottom: 12px; right: 12px; }
}
</style>
