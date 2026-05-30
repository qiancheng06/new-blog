<template>
  <div class="knowledge-card">
    <h3>{{ title }}</h3>
    <p>{{ description }}</p>
    <div v-if="tags" class="tags">
      <span v-for="tag in tags" :key="tag" class="tag">{{ tag }}</span>
    </div>
    <a v-if="link" :href="link" class="read-more">阅读更多 →</a>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  title: string
  description: string
  tags?: string[]
  link?: string
}>()
</script>

<style scoped>
.knowledge-card {
  padding: 1.25rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  transition: border-color 0.2s;
}

.knowledge-card:hover {
  border-color: var(--vp-c-brand-1);
}

.knowledge-card h3 {
  margin: 0 0 0.5rem;
  font-size: 1.1rem;
}

.knowledge-card p {
  margin: 0 0 0.75rem;
  color: var(--vp-c-text-2);
  font-size: 0.9rem;
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-bottom: 0.75rem;
}

.tag {
  display: inline-block;
  padding: 0.15rem 0.5rem;
  background: var(--vp-c-brand-soft);
  color: var(--vp-c-brand-1);
  border-radius: 4px;
  font-size: 0.8rem;
}

.read-more {
  font-size: 0.9rem;
  color: var(--vp-c-brand-1);
  text-decoration: none;
}

.read-more:hover {
  text-decoration: underline;
}
</style>
