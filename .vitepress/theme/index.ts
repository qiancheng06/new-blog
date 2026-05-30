import DefaultTheme from 'vitepress/theme'
import Layout from './Layout.vue'
import CalendarTodo from './components/CalendarTodo.vue'
import KnowledgeCard from './components/KnowledgeCard.vue'
import ProgressDashboard from './components/ProgressDashboard.vue'
import './custom.css'

export default {
  extends: DefaultTheme,
  Layout,
  enhanceApp({ app }) {
    app.component('CalendarTodo', CalendarTodo)
    app.component('KnowledgeCard', KnowledgeCard)
    app.component('ProgressDashboard', ProgressDashboard)
  },
}
