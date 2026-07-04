<template>
  <DefaultLayout>
    <template #layout-bottom>
      <MemoryProfilePanel />
      <ChatWidget />
    </template>
  </DefaultLayout>
</template>

<script setup lang="ts">
import DefaultTheme from 'vitepress/theme'
import ChatWidget from './components/ChatWidget.vue'
import MemoryProfilePanel from './components/MemoryProfilePanel.vue'

const { Layout: DefaultLayout } = DefaultTheme
</script>
