<template>
  <a v-if="link" :href="link" class="knowledge-card" :class="[category]">
    <div class="card-top">
      <span class="category-badge">{{ categoryLabel }}</span>
      <span class="count-badge" v-if="count">{{ count }} 项</span>
    </div>
    <h3>{{ title }}</h3>
    <p>{{ description }}</p>
    <ul v-if="items" class="card-items">
      <li v-for="item in items" :key="item.text">
        <a :href="item.link">{{ item.text }}</a>
      </li>
    </ul>
    <div v-if="tags" class="tags">
      <span v-for="tag in tags" :key="tag" class="tag">{{ tag }}</span>
    </div>
  </a>
  <div v-else class="knowledge-card" :class="[category]">
    <div class="card-top">
      <span class="category-badge">{{ categoryLabel }}</span>
      <span class="count-badge" v-if="count">{{ count }} 项</span>
    </div>
    <h3>{{ title }}</h3>
    <p>{{ description }}</p>
    <ul v-if="items" class="card-items">
      <li v-for="item in items" :key="item.text">
        <a :href="item.link">{{ item.text }}</a>
      </li>
    </ul>
    <div v-if="tags" class="tags">
      <span v-for="tag in tags" :key="tag" class="tag">{{ tag }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const categoryLabels: Record<string, string> = {
  resource: '资源库',
  tech: '技术手册',
  skill: '技能树',
  inbox: '收件箱',
  wiki: '知识精炼',
}

const props = defineProps<{
  title: string
  description: string
  category?: string
  tags?: string[]
  link?: string
  count?: number
  items?: { text: string; link: string }[]
}>()

const categoryLabel = computed(() =>
  props.category ? categoryLabels[props.category] || props.category : ''
)
</script>

<style scoped>
.knowledge-card {
  display: block;
  padding: 1.25rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  transition: all 0.25s ease;
  background: var(--vp-c-bg);
  text-decoration: none;
  color: inherit;
  position: relative;
  overflow: hidden;
}

.knowledge-card:hover {
  border-color: transparent;
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0,0,0,0.1);
}

.knowledge-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  opacity: 0;
  transition: opacity 0.25s;
}

.knowledge-card:hover::before {
  opacity: 1;
}

/* category colors */
.knowledge-card.resource::before { background: linear-gradient(90deg, #4a9eff, #6c5ce7); }
.knowledge-card.tech::before { background: linear-gradient(90deg, #00b894, #00cec9); }
.knowledge-card.skill::before { background: linear-gradient(90deg, #e17055, #fd79a8); }
.knowledge-card.inbox::before { background: linear-gradient(90deg, #fdcb6e, #e17055); }
.knowledge-card.wiki::before { background: linear-gradient(90deg, #6c5ce7, #a29bfe); }

.card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.75rem;
}

.category-badge {
  font-size: 0.75rem;
  font-weight: 600;
  padding: 0.15rem 0.6rem;
  border-radius: 4px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.resource .category-badge { background: #eef5ff; color: #4a9eff; }
.tech .category-badge { background: #e6faf5; color: #00b894; }
.skill .category-badge { background: #fef0ef; color: #e17055; }
.inbox .category-badge { background: #fef9e7; color: #f39c12; }
.wiki .category-badge { background: #f0edff; color: #6c5ce7; }

.count-badge {
  font-size: 0.75rem;
  color: var(--vp-c-text-2);
  background: var(--vp-c-bg-soft);
  padding: 0.1rem 0.5rem;
  border-radius: 10px;
}

.knowledge-card h3 {
  margin: 0 0 0.4rem;
  font-size: 1.1rem;
  color: var(--vp-c-text-1);
}

.knowledge-card p {
  margin: 0 0 0.75rem;
  color: var(--vp-c-text-2);
  font-size: 0.9rem;
  line-height: 1.5;
}

.card-items {
  list-style: none;
  padding: 0;
  margin: 0 0 0.75rem;
}

.card-items li {
  padding: 0.2rem 0;
  font-size: 0.88rem;
}

.card-items li a {
  color: var(--vp-c-brand-1);
  text-decoration: none;
}

.card-items li a:hover {
  text-decoration: underline;
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.tag {
  display: inline-block;
  padding: 0.15rem 0.5rem;
  background: var(--vp-c-brand-soft);
  color: var(--vp-c-brand-1);
  border-radius: 4px;
  font-size: 0.78rem;
}
</style>
