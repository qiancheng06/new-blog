import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'My Knowledge Base',
  description: '个人知识库 · 博客 · 待办管理',
  lang: 'zh-CN',

  lastUpdated: true,
  cleanUrls: true,

  srcDir: '../../OneDrive/obsidian/obsidian',
  srcExclude: ['knowledge/inbox/**'],

  themeConfig: {
    nav: [
      { text: '首页', link: '/' },
      { text: '知识库', link: '/knowledge/' },
      { text: '待办', link: '/todo/' },
      { text: '博客', link: '/blog/' },
    ],

    sidebar: {
      '/knowledge/': [
        {
          text: '知识库',
          items: [
            { text: '概览', link: '/knowledge/' },
            {
              text: '资源库',
              base: '/knowledge/resource-library/',
              collapsed: true,
              items: [
                { text: '数据集索引', link: 'datasets' },
                { text: '工具推荐', link: 'tools' },
                { text: '书单', link: 'reading-list' },
              ],
            },
            {
              text: '技术手册',
              base: '/knowledge/tech-manual/',
              collapsed: true,
              items: [
                { text: 'Git 速查', link: 'git-cheatsheet' },
                { text: 'Docker 命令', link: 'docker-commands' },
                { text: '排错日志', link: 'troubleshooting' },
              ],
            },
            {
              text: '技能树',
              base: '/knowledge/skill-tree/',
              collapsed: true,
              items: [
                { text: '嵌入式', link: 'embedded' },
                { text: '计算机视觉', link: 'computer-vision' },
                { text: 'Web 开发', link: 'web-dev' },
              ],
            },
          ],
        },
      ],
      '/todo/': [
        {
          text: '待办事项',
          items: [
            { text: '日历视图', link: '/todo/' },
          ],
        },
      ],
      '/blog/': [
        {
          text: '博客',
          items: [
            { text: '文章列表', link: '/blog/' },
          ],
        },
      ],
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/your-username/my-blog' },
    ],

    footer: {
      message: '基于 VitePress 构建 · Obsidian 编辑',
      copyright: 'Copyright © 2026',
    },

    search: {
      provider: 'local',
    },
  },
})
