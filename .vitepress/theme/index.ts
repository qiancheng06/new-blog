import DefaultTheme from 'vitepress/theme'
import CalendarTodo from './components/CalendarTodo.vue'
import KnowledgeCard from './components/KnowledgeCard.vue'
import './styles/custom.css'

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('CalendarTodo', CalendarTodo)
    app.component('KnowledgeCard', KnowledgeCard)
  },
}
