<template>
  <Layout>
    <template #home-features-after>
      <div class="home-progress">
        <h2 class="home-progress-title">🚀 项目进度</h2>
        <ProgressDashboard />
      </div>
    </template>
  </Layout>
</template>

<script setup>
import DefaultTheme from 'vitepress/theme'
import ProgressDashboard from './components/ProgressDashboard.vue'

const { Layout } = DefaultTheme
</script>

<style scoped>
.home-progress {
  max-width: 1152px;
  margin: 0 auto;
  padding: 2rem 24px;
}
.home-progress-title {
  font-size: 1.3rem;
  font-weight: 700;
  margin-bottom: .2rem;
  color: var(--vp-c-text-1);
}
@media (min-width: 768px) {
  .home-progress { padding: 2rem 48px; }
}
@media (min-width: 960px) {
  .home-progress { padding: 2rem 64px; }
}
</style>
