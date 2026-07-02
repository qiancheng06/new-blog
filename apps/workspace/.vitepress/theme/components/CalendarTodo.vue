<template>
  <div class="calendar-todo">
    <div class="calendar-header">
      <button @click="prevMonth">&lt;</button>
      <h3>{{ year }} 年 {{ month }} 月</h3>
      <button @click="nextMonth">&gt;</button>
    </div>

    <table class="calendar-grid">
      <thead>
        <tr>
          <th v-for="day in weekDays" :key="day">{{ day }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(week, wi) in weeks" :key="wi">
          <td
            v-for="(day, di) in week"
            :key="di"
            :class="{
              'is-today': day.isToday,
              'has-tasks': day.tasks.length > 0,
              'is-selected': day.date === selectedDate,
              'is-other-month': !day.isCurrentMonth,
            }"
            @click="selectDate(day.date)"
          >
            <span class="day-num">{{ day.num }}</span>
            <div v-if="day.tasks.length > 0" class="task-dots">
              <span class="dot" />
            </div>
          </td>
        </tr>
      </tbody>
    </table>

    <div class="selected-tasks">
      <h4>{{ selectedDate || '请选择日期' }}</h4>
      <ul v-if="selectedTasks.length > 0">
        <li v-for="(task, i) in selectedTasks" :key="i" :class="{ done: task.done }">
          <input type="checkbox" :checked="task.done" disabled />
          {{ task.text }}
        </li>
      </ul>
      <p v-else class="no-tasks">当日无待办</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

interface TodoTask {
  text: string
  done: boolean
  date: string
}

const weekDays = ['一', '二', '三', '四', '五', '六', '日']

const now = new Date()
const year = ref(now.getFullYear())
const month = ref(now.getMonth() + 1)
const selectedDate = ref('')
const selectedTasks = ref<TodoTask[]>([])

const allTasks = ref<TodoTask[]>([])

function getDaysInMonth(y: number, m: number) {
  return new Date(y, m, 0).getDate()
}

function getFirstDayOfMonth(y: number, m: number) {
  const day = new Date(y, m - 1, 1).getDay()
  return day === 0 ? 6 : day - 1
}

const weeks = computed(() => {
  const days: number[] = []
  const totalDays = getDaysInMonth(year.value, month.value)
  for (let i = 1; i <= totalDays; i++) days.push(i)

  const firstDay = getFirstDayOfMonth(year.value, month.value)
  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  const cells: { num: number; isToday: boolean; isCurrentMonth: boolean; date: string; tasks: TodoTask[] }[] = []

  for (let i = 0; i < firstDay; i++) {
    cells.push({ num: 0, isToday: false, isCurrentMonth: false, date: '', tasks: [] })
  }

  for (const d of days) {
    const dateStr = `${year.value}-${String(month.value).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    cells.push({
      num: d,
      isToday: dateStr === todayStr,
      isCurrentMonth: true,
      date: dateStr,
      tasks: allTasks.value.filter((t) => t.date === dateStr),
    })
  }

  while (cells.length % 7 !== 0) {
    cells.push({ num: 0, isToday: false, isCurrentMonth: false, date: '', tasks: [] })
  }

  const result = []
  for (let i = 0; i < cells.length; i += 7) {
    result.push(cells.slice(i, i + 7))
  }
  return result
})

function prevMonth() {
  if (month.value === 1) {
    month.value = 12
    year.value--
  } else {
    month.value--
  }
}

function nextMonth() {
  if (month.value === 12) {
    month.value = 1
    year.value++
  } else {
    month.value++
  }
}

function selectDate(date: string) {
  selectedDate.value = date
  selectedTasks.value = allTasks.value.filter((t) => t.date === date)
}
</script>

<style scoped>
.calendar-todo {
  --border-color: var(--vp-c-divider);
  --text-color: var(--vp-c-text-1);
  --text-muted: var(--vp-c-text-2);
  --brand-color: var(--vp-c-brand-1);
}

.calendar-header {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  margin-bottom: 1rem;
}

.calendar-header button {
  background: none;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 0.25rem 0.75rem;
  cursor: pointer;
  font-size: 1rem;
  color: var(--text-color);
}

.calendar-header button:hover {
  background: var(--vp-c-bg-soft);
}

.calendar-grid {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}

.calendar-grid th {
  padding: 0.5rem;
  text-align: center;
  color: var(--text-muted);
  font-weight: 500;
  font-size: 0.85rem;
}

.calendar-grid td {
  padding: 0.5rem;
  text-align: center;
  cursor: pointer;
  border: 1px solid var(--border-color);
  vertical-align: top;
  height: 60px;
  position: relative;
}

.calendar-grid td:hover {
  background: var(--vp-c-bg-soft);
}

.calendar-grid td.is-today .day-num {
  background: var(--brand-color);
  color: white;
  border-radius: 50%;
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.calendar-grid td.has-tasks .dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  background: var(--brand-color);
  border-radius: 50%;
  position: absolute;
  bottom: 4px;
  left: 50%;
  transform: translateX(-50%);
}

.calendar-grid td.is-selected {
  background: var(--vp-c-brand-soft);
  outline: 2px solid var(--brand-color);
  outline-offset: -2px;
}

.calendar-grid td.is-other-month {
  color: var(--text-muted);
  opacity: 0.4;
}

.selected-tasks {
  margin-top: 1rem;
  padding: 1rem;
  border: 1px solid var(--border-color);
  border-radius: 8px;
}

.selected-tasks h4 {
  margin: 0 0 0.5rem;
  font-size: 1rem;
}

.selected-tasks ul {
  list-style: none;
  padding: 0;
  margin: 0;
}

.selected-tasks li {
  padding: 0.25rem 0;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.selected-tasks li.done {
  text-decoration: line-through;
  color: var(--text-muted);
}

.no-tasks {
  color: var(--text-muted);
  font-size: 0.9rem;
}

.task-dots {
  position: relative;
}
</style>
