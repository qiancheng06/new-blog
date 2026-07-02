import { defineConfig } from 'vitepress'
import { config as loadEnv } from 'dotenv'
import { resolve } from 'path'

loadEnv({ path: resolve(process.cwd(), '.env') })
const vaultPath = process.env.OBSIDIAN_VAULT_PATH || '../../../../../../OneDrive/obsidian/obsidian'

export default defineConfig({
  title: '个人工作台',
  description: '个人知识管理 · 项目跟踪 · 待办日历',
  lang: 'zh-CN',

  appearance: true,
  lastUpdated: false,
  cleanUrls: false,
  ignoreDeadLinks: true,

  srcDir: vaultPath,
  srcExclude: ['node_modules/**', '.vitepress/**', 'knowledge/inbox/**', 'raw/**', 'wiki/**', 'CLAUDE.md'],

  themeConfig: {
    nav: [
      { text: '首页', link: '/' },
      { text: '知识库', link: '/knowledge/' },
      { text: '项目', link: '/projects/' },
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
              items: [
                { text: '数据集索引', link: 'datasets' },
                { text: '工具推荐', link: 'tools' },
                { text: '书单', link: 'reading-list' },
                { text: 'ROS 学习资源', link: 'ros-resources' },
              ],
            },
            {
              text: '技术手册',
              base: '/knowledge/tech-manual/',
              items: [
                { text: '概览', link: '' },
                { text: 'Git 速查', link: 'git-cheatsheet' },
                { text: 'Docker 命令', link: 'docker-commands' },
                { text: '排错日志', link: 'troubleshooting' },
                { text: 'ROS 速查', link: 'ros' },
                { text: 'YOLOv8 速查', link: 'yolo' },
                { text: 'OpenCV 速查', link: 'opencv' },
                { text: 'Pure Pursuit', link: 'pure-pursuit' },
                { text: 'MATLAB 速查', link: 'matlab' },
                { text: 'C51 单片机', link: 'c51' },
                { text: 'ESP32 速查', link: 'esp32' },
                { text: '5G 基础', link: '5g' },
              ],
            },
            {
              text: '技能树',
              base: '/knowledge/skill-tree/',
              items: [
                { text: '概览', link: '' },
                { text: '嵌入式', link: 'embedded' },
                { text: '计算机视觉', link: 'computer-vision' },
                { text: 'Web 开发', link: 'web-dev' },
                { text: 'ROS', link: 'ros' },
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
      '/projects/': [
        {
          text: '项目进度',
          items: [
            { text: '总览', link: '/projects/' },
          ],
        },
      ],
      // SIDEBAR:BLOG
      '/blog/': [
        { text: '文章列表', link: '/blog/' },
        { text: '标签索引', link: '/blog/tags' },
        {
          text: '博客搭建',
          collapsed: false,
          items: [
            { text: '造一个零依赖的仪表盘：为什么不用框架', link: '/blog/dashboard-zero-dependency' },
            { text: '从零搭建个人工作台：VitePress + Obsidian 双核架构', link: '/blog/personal-workspace-architecture' },
            { text: '项目进度系统的进化：从 .md 到交互看板', link: '/blog/project-progress-evolution' },
            { text: '内嵌数据同步链路：当 Markdown 遇上自动化流水线', link: '/blog/sync-pipeline' },
          ],
        },
        {
          text: '智能车',
          collapsed: false,
          items: [
            { text: 'Pure Pursuit 从理论到实车：一次控制算法的落地之旅', link: '/blog/pure-pursuit-practice' },
            { text: '智能车赛道初体验', link: '/blog/汽车' },
          ],
        },
      ],
// /SIDEBAR:BLOG
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/qiancheng06/new-blog' },
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
