<template>
  <DefaultLayout>
    <template #layout-bottom>
      <ChatWidget />
    </template>
  </DefaultLayout>
</template>

<script setup lang="ts">
import DefaultTheme from 'vitepress/theme'
import ChatWidget from './components/ChatWidget.vue'

const { Layout: DefaultLayout } = DefaultTheme
</script>
