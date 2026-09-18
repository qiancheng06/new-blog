"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Archive,
  Bell,
  BookOpen,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Command,
  FileText,
  Filter,
  FolderKanban,
  GripVertical,
  Home,
  Inbox,
  Layers3,
  ListFilter,
  Menu,
  MessageCircle,
  Moon,
  MoreHorizontal,
  PanelRight,
  Plus,
  Search,
  Send,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Tags,
  UserRound,
  X,
} from "lucide-react";

type Theme = "dark" | "light";
type PanelKey = "left" | "right";

const navItems = [
  ["总览", Home],
  ["专注", Layers3],
  ["项目", FolderKanban],
  ["日历", CalendarDays],
  ["知识库", BookOpen],
] as const;

const utilityItems = [
  ["收件箱", Inbox, "8"],
  ["行动", Check, "14"],
  ["等待中", Bell, "3"],
  ["归档", Archive, ""],
] as const;

const recallItems = [
  ["相关笔记", BookOpen],
  ["待办事项", Check],
  ["项目上下文", FolderKanban],
  ["近期记忆", Layers3],
] as const;

export default function WorkspaceDemo() {
  const pathname = usePathname();
  const router = useRouter();
  const [theme, setTheme] = useState<Theme>("dark");
  const [leftWidth, setLeftWidth] = useState(220);
  const [rightWidth, setRightWidth] = useState(340);
  const [activeNav, setActiveNav] = useState(() => navFromPath(pathname));
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([
    { from: "assistant", text: "早上好，我已经了解你当前工作区的情况。" },
    { from: "user", text: "今天我应该先看什么？" },
    { from: "assistant", text: "建议先准备 11:00 的进度同步，然后在 14:00 前完成研究评审。" },
  ]);
  const [contextOpen, setContextOpen] = useState(false);
  const [selectedRecall, setSelectedRecall] = useState<string | null>(null);
  const [assistantMobileOpen, setAssistantMobileOpen] = useState(false);

  function navigateTo(label: string) {
    setActiveNav(label);
    router.push(pathForNav(label));
  }

  function resizePanel(panel: PanelKey, event: React.PointerEvent<HTMLDivElement>) {
    const startX = event.clientX;
    const startWidth = panel === "left" ? leftWidth : rightWidth;
    event.currentTarget.setPointerCapture(event.pointerId);
    const onMove = (moveEvent: PointerEvent) => {
      const delta = moveEvent.clientX - startX;
      if (panel === "left") setLeftWidth(Math.min(320, Math.max(168, startWidth + delta)));
      else setRightWidth(Math.min(440, Math.max(292, startWidth - delta)));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  function resizePanelByKey(panel: PanelKey, event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const delta = event.key === "ArrowRight" ? 12 : -12;
    if (panel === "left") setLeftWidth((width) => Math.min(320, Math.max(168, width + delta)));
    else setRightWidth((width) => Math.min(440, Math.max(292, width - delta)));
  }

  function sendMessage() {
    const trimmed = message.trim();
    if (!trimmed) return;
    setMessages((current) => [...current, { from: "user", text: trimmed }]);
    setMessage("");
    window.setTimeout(() => setMessages((current) => [...current, { from: "assistant", text: "好的，我会把相关的工作区内容带入这次对话。" }]), 360);
  }

  return (
    <main className={`demo-shell theme-${theme}`} style={{ "--left-width": `${leftWidth}px`, "--right-width": `${rightWidth}px` } as React.CSSProperties}>
      <aside className="sidebar left-sidebar" aria-label="主导航">
        <div className="brand-mark"><span className="brand-dot" /> <span>PERSONA<br />WORKSPACE</span></div>
        <div className="sidebar-scroll">
          <nav className="nav-group">
            {navItems.map(([label, Icon]) => <button key={label} className={`nav-item ${activeNav === label ? "active" : ""}`} onClick={() => navigateTo(label)}><Icon size={18} strokeWidth={1.7} /><span>{label}</span></button>)}
          </nav>
          <div className="nav-divider" />
          <nav className="nav-group">
            {utilityItems.map(([label, Icon, count]) => <button key={label} className={`nav-item ${activeNav === label ? "active" : ""}`} onClick={() => navigateTo(label)}><Icon size={18} strokeWidth={1.7} /><span>{label}</span>{count && <span className="nav-count">{count}</span>}</button>)}
          </nav>
          <div className="nav-divider" />
          <nav className="nav-group">
            <button className={`nav-item ${activeNav === "标签" ? "active" : ""}`} onClick={() => navigateTo("标签")}><Tags size={18} strokeWidth={1.7} /><span>标签</span></button>
            <button className={`nav-item ${activeNav === "设置" ? "active" : ""}`} onClick={() => navigateTo("设置")}><Settings size={18} strokeWidth={1.7} /><span>设置</span></button>
          </nav>
        </div>
        <div className="profile-card"><div className="avatar">林</div><div><strong>林默</strong><span>个人工作区</span></div><ChevronDown size={16} /></div>
      </aside>
      <div className="resize-handle left-handle" role="separator" tabIndex={0} aria-label="调整左侧栏宽度" onPointerDown={(event) => resizePanel("left", event)} onKeyDown={(event) => resizePanelByKey("left", event)}><GripVertical size={16} /></div>

      <section className="workspace-content">
        <header className="topbar">
          <button className="mobile-menu" aria-label="打开菜单"><Menu size={19} /></button>
          <div className="command-bar"><Search size={17} /><span>搜索工作区...</span><kbd><Command size={12} /> K</kbd></div>
          <div className="topbar-actions"><button className="icon-button notification-button" aria-label="通知"><Bell size={18} /></button><button className="icon-button" aria-label="切换日夜模式" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>{theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}</button><button className="icon-button mobile-assistant-button" aria-label="打开 Companion" onClick={() => setAssistantMobileOpen(true)}><MessageCircle size={18} /></button><div className="mini-avatar">林</div></div>
        </header>
        <div className="workspace-scroll">
          {activeNav === "总览" ? <HomeContent /> : <WorkspaceModulePage page={activeNav} />}
        </div>
      </section>
      <div className="resize-handle right-handle" role="separator" tabIndex={0} aria-label="调整 AI 侧栏宽度" onPointerDown={(event) => resizePanel("right", event)} onKeyDown={(event) => resizePanelByKey("right", event)}><GripVertical size={16} /></div>

      <button className={`mobile-scrim ${assistantMobileOpen ? "visible" : ""}`} aria-label="关闭 Companion" onClick={() => setAssistantMobileOpen(false)} />
      <aside className={`assistant-sidebar ${assistantMobileOpen ? "mobile-open" : ""}`} aria-label="Companion 助手">
        <div className="assistant-header"><div><p className="eyebrow">COMPANION</p><h2>上下文助手</h2></div><button className="icon-button" aria-label="收起助手" onClick={() => setAssistantMobileOpen(false)}><PanelRight size={18} /></button></div>
        <div className="assistant-context"><span className="context-pulse" /> 当前工作区 <ChevronDown size={14} /></div>
        <div className="conversation" aria-live="polite">{messages.map((item, index) => <div key={`${item.from}-${index}`} className={`message ${item.from}`}><div className="message-label">{item.from === "assistant" ? <><Sparkles size={13} /> Companion</> : <><UserRound size={13} /> 你</>}<time>{index === 0 ? "10:32" : "10:33"}</time></div><p>{item.text}</p></div>)}</div>
        <div className="assistant-footer">
          <div className="recall-heading"><span>召回上下文</span><span className="source-count">4 个来源</span></div>
          <div className="recall-grid">{recallItems.map(([label, Icon]) => <button key={label} className={`recall-button ${selectedRecall === label ? "selected" : ""}`} onClick={() => setSelectedRecall(selectedRecall === label ? null : label)}><Icon size={15} /><span>{label}</span></button>)}</div>
          <div className="composer"><textarea value={message} onChange={(event) => setMessage(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); sendMessage(); } }} placeholder="询问与当前工作区有关的内容..." aria-label="询问 Companion" rows={2} /><button className="send-button" onClick={sendMessage} aria-label="发送消息"><Send size={17} /></button></div>
          <div className="context-status"><span className="status-dot blue" /> 上下文可用 {selectedRecall ? `· ${selectedRecall}` : "· 4 个来源"}<button className="context-toggle" onClick={() => setContextOpen(!contextOpen)} aria-expanded={contextOpen} aria-label="展开相关上下文">{contextOpen ? <X size={14} /> : <ChevronDown size={14} />}</button></div>
          {contextOpen && <div className="context-drawer"><div><BookOpen size={14} /> 相关笔记 <span>2</span></div><div><Check size={14} /> 待办事项 <span>5</span></div><div><FolderKanban size={14} /> 项目上下文 <span>1</span></div></div>}
        </div>
      </aside>
    </main>
  );
}

const navPaths: Record<string, string> = {
  总览: "/",
  专注: "/focus",
  项目: "/projects",
  日历: "/calendar",
  知识库: "/knowledge",
  收件箱: "/inbox",
  行动: "/actions",
  等待中: "/waiting",
  归档: "/archive",
  标签: "/tags",
  设置: "/settings",
};

function pathForNav(label: string) { return navPaths[label] ?? "/"; }
function navFromPath(pathname: string | null) { return Object.entries(navPaths).find(([, path]) => path === pathname)?.[0] ?? "总览"; }

function HomeContent() {
  return <>
    <div className="page-heading"><div className="title-line"><h1>今日</h1><span className="heading-date">2025 年 5 月 14 日 · 星期三</span></div><div className="heading-actions"><button className="quiet-button"><CalendarDays size={15} /> 今天</button><button className="icon-button" aria-label="更多操作"><MoreHorizontal size={18} /></button></div></div>
    <section className="context-banner"><div className="context-kicker"><Sparkles size={15} /> 当前上下文</div><div className="context-main"><div><h2>个人工作区</h2><p>今天需要的内容，集中在一个清晰的视野里。</p></div><button className="outline-button">切换上下文 <ChevronDown size={15} /></button></div></section>
    <div className="section-heading"><div><p className="eyebrow">此刻</p><h2>需要你关注的事情</h2></div><button className="text-button">查看全部 <ChevronRight size={15} /></button></div>
    <div className="attention-grid">
      <article className="feature-card priority-card"><div className="card-topline"><span className="status-label"><span className="status-dot blue" /> 首要事项</span><MoreHorizontal size={17} /></div><h3>审阅第二季度预算方案</h3><p>整理叙事逻辑，并在项目同步前确认关键决策。</p><div className="card-meta"><span><FolderKanban size={14} /> 财务规划</span><span>1 小时</span></div><button className="primary-button">打开任务 <ChevronRight size={16} /></button></article>
      <article className="feature-card session-card"><div className="card-topline"><span className="status-label"><span className="status-dot green" /> 当前工作段</span><span className="session-state">已就绪</span></div><h3>深度工作</h3><p>下一段计划在 10:30 开始。</p><div className="session-time">75:00</div><div className="progress-track"><span style={{ width: "42%" }} /></div><div className="card-bottom"><span>今日计划已完成 42%</span><button className="quiet-button">开始 <ChevronRight size={15} /></button></div></article>
    </div>
    <div className="module-grid">
      <article className="module-card"><div className="module-title"><div><p className="eyebrow">今天</p><h3>行动计划</h3></div><button className="text-button">编辑 <ChevronRight size={14} /></button></div><ul className="task-list"><li><span className="check checked"><Check size={12} /></span><span>审阅第二季度预算方案</span><time>1h</time></li><li><span className="check" /><span>整理用户研究结论</span><time>2h</time></li><li><span className="check" /><span>更新产品路线图</span><time>1.5h</time></li><li><span className="check checked"><Check size={12} /></span><span>团队晨会</span><time>30m</time></li></ul><button className="module-link">查看完整日程 <ChevronRight size={15} /></button></article>
      <article className="module-card"><div className="module-title"><div><p className="eyebrow">项目</p><h3>正在推进</h3></div><button className="text-button">查看全部 <ChevronRight size={14} /></button></div><div className="project-list"><ProjectRow name="产品体验重构" progress="68%" /><ProjectRow name="第二季度规划" progress="42%" /><ProjectRow name="品牌内容计划" progress="25%" /><ProjectRow name="数据平台" progress="12%" /></div><button className="module-link"><Plus size={15} /> 新建项目</button></article>
      <article className="module-card calendar-card"><div className="module-title"><div><p className="eyebrow">日历</p><h3>即将开始</h3></div><button className="icon-button" aria-label="日历选项"><MoreHorizontal size={17} /></button></div><div className="calendar-header"><button aria-label="上个月"><ChevronLeft size={16} /></button><strong>2025 年 5 月</strong><button aria-label="下个月"><ChevronRight size={16} /></button></div><div className="calendar-week"><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span><span>日</span></div><div className="calendar-days">{[28,29,30,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25].map((day, index) => <span key={`${day}-${index}`} className={day === 14 && index === 16 ? "today" : index < 3 ? "muted-day" : ""}>{day}</span>)}</div><div className="event-row"><span className="event-dot" /> <span>10:00</span><strong>设计同步</strong><time>45m</time></div><button className="module-link">打开日历 <ChevronRight size={15} /></button></article>
    </div>
    <article className="activity-module"><div className="module-title"><div><p className="eyebrow">近期活动</p><h3>安静但清晰的进展轨迹</h3></div><button className="text-button">时间线视图 <ChevronRight size={14} /></button></div><div className="activity-list"><ActivityRow time="09:15" icon={<Layers3 size={15} />} label="开始工作段" detail="深度工作" /><ActivityRow time="08:45" icon={<Check size={15} />} label="已经完成" detail="团队晨会" /><ActivityRow time="08:30" icon={<CalendarDays size={15} />} label="日程已更新" detail="项目进度同步" /></div></article>
  </>;
}

function PageHeading({ kicker, title, description, action }: { kicker: string; title: string; description: string; action?: React.ReactNode }) {
  return <div className="page-heading compact-page-heading"><div><p className="eyebrow">{kicker}</p><h1>{title}</h1><p className="heading-subtitle">{description}</p></div>{action ?? <button className="quiet-button"><Plus size={15} /> 新建</button>}</div>;
}

function WorkspaceModulePage({ page }: { page: string }) {
  if (page === "日历") return <CalendarContent />;
  if (page === "知识库") return <KnowledgeContent />;
  if (page === "项目") return <ProjectsContent />;
  if (page === "专注") return <FocusContent />;
  if (page === "设置") return <SettingsContent />;
  if (page === "标签") return <TagsContent />;
  return <UtilityContent page={page} />;
}

function CalendarContent() {
  return <>
    <PageHeading kicker="工作区 / 日历" title="日历" description="把重要的会议和工作段放在同一个节奏里。" action={<div className="heading-actions"><button className="quiet-button"><CalendarDays size={15} /> 今天</button><button className="primary-button page-action"><Plus size={15} /> 新事件</button></div>} />
    <div className="page-toolbar"><div className="segmented-control"><button className="active">月</button><button>周</button><button>日</button></div><button className="outline-button"><Filter size={14} /> 过滤</button></div>
    <div className="calendar-page-grid"><article className="module-card calendar-large-card"><div className="module-title"><div><p className="eyebrow">2025 年 5 月</p><h3>五月日程</h3></div><div className="calendar-navigation"><button className="icon-button" aria-label="上个月"><ChevronLeft size={16} /></button><button className="icon-button" aria-label="下个月"><ChevronRight size={16} /></button></div></div><div className="large-calendar"><div className="calendar-week"><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span><span>日</span></div><div className="calendar-days">{[28,29,30,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,1].map((day, index) => <span key={`${day}-${index}`} className={day === 14 && index === 16 ? "today" : index < 3 || index > 33 ? "muted-day" : ""}>{day}</span>)}</div></div></article><article className="module-card agenda-card"><div className="module-title"><div><p className="eyebrow">今天 · 5 月 14 日</p><h3>接下来</h3></div><button className="text-button">全部 <ChevronRight size={14} /></button></div><AgendaRow time="10:00" title="设计同步" meta="45 分钟 · 会议室 A" tone="blue" /><AgendaRow time="11:00" title="利益相关者更新" meta="30 分钟 · 线上" tone="blue" /><AgendaRow time="14:00" title="研究评审" meta="60 分钟 · 研究室" tone="muted" /><AgendaRow time="15:30" title="与 Alex 1:1" meta="30 分钟 · 线上" tone="muted" /><button className="module-link"><Plus size={15} /> 添加日程</button></article></div>
    <article className="activity-module calendar-note"><div className="module-title"><div><p className="eyebrow">工作节奏</p><h3>本周安排得很平衡</h3></div><span className="status-label"><span className="status-dot green" /> 负荷适中</span></div><div className="rhythm-bars"><i style={{height:"42%"}} /><i style={{height:"68%"}} /><i style={{height:"54%"}} /><i style={{height:"82%"}} /><i style={{height:"60%"}} /><i style={{height:"30%"}} /><i style={{height:"18%"}} /></div></article>
  </>;
}

function AgendaRow({ time, title, meta, tone }: { time: string; title: string; meta: string; tone: "blue" | "muted" }) { return <div className="agenda-row"><span className={`agenda-dot ${tone}`} /><time>{time}</time><div><strong>{title}</strong><span>{meta}</span></div><ChevronRight size={15} /></div>; }

function KnowledgeContent() {
  return <>
    <PageHeading kicker="工作区 / 知识库" title="知识库" description="把重要的决定、资料和上下文留在随时可用的地方。" action={<button className="primary-button page-action"><Plus size={15} /> 新建笔记</button>} />
    <div className="knowledge-toolbar"><label className="inline-search"><Search size={16} /><input aria-label="搜索知识库" placeholder="搜索笔记、项目和标签..." /></label><div className="segmented-control"><button className="active">全部</button><button>最近</button><button>已收藏</button></div></div>
    <div className="knowledge-layout"><article className="module-card knowledge-feature"><div className="card-topline"><span className="status-label"><span className="status-dot blue" /> 固定内容</span><button className="icon-button" aria-label="更多操作"><MoreHorizontal size={17} /></button></div><div className="knowledge-feature-icon"><BookOpen size={20} /></div><h3>产品愿景与决策原则</h3><p>用于校准产品方向的长期上下文，最近一次更新于 5 月 10 日。</p><div className="card-meta"><span>产品体验重构</span><span>8 个引用</span></div><button className="module-link">打开笔记 <ChevronRight size={15} /></button></article><div className="knowledge-list"><div className="list-heading"><div><p className="eyebrow">近期更新</p><h3>最近的笔记</h3></div><button className="text-button">查看全部 <ChevronRight size={14} /></button></div>{[["用户访谈 · 关键洞察","5 月 13 日","研究"],["第二季度策略提纲","5 月 12 日","规划"],["设计原则 v2","5 月 11 日","设计"],["团队协作约定","5 月 9 日","团队"]].map(([title,date,tag]) => <div className="knowledge-row" key={title}><span className="knowledge-row-icon"><FileText size={15} /></span><div><strong>{title}</strong><span>{tag}</span></div><time>{date}</time><ChevronRight size={15} /></div>)}</div></div>
    <div className="knowledge-categories"><div className="list-heading"><div><p className="eyebrow">分类</p><h3>按主题浏览</h3></div><button className="text-button">管理分类 <ChevronRight size={14} /></button></div><div className="category-grid"><CategoryCard title="产品与研究" count="24" icon={<Layers3 size={17} />} /><CategoryCard title="项目资料" count="18" icon={<FolderKanban size={17} />} /><CategoryCard title="团队与流程" count="12" icon={<CheckCircle2 size={17} />} /><CategoryCard title="灵感收藏" count="9" icon={<Sparkles size={17} />} /></div></div>
  </>;
}

function CategoryCard({ title, count, icon }: { title: string; count: string; icon: React.ReactNode }) { return <button className="category-card"><span>{icon}</span><strong>{title}</strong><small>{count} 篇</small><ChevronRight size={15} /></button>; }

function ProjectsContent() {
  return <>
    <PageHeading kicker="工作区 / 项目" title="项目" description="看见每个项目正在发生什么，以及下一步应该推进什么。" action={<button className="primary-button page-action"><Plus size={15} /> 新建项目</button>} />
    <div className="page-toolbar"><div className="segmented-control"><button className="active">全部项目</button><button>进行中</button><button>已归档</button></div><button className="outline-button"><ListFilter size={14} /> 排序：最近更新</button></div>
    <div className="project-board">{[["产品体验重构","重新梳理核心流程与导航结构。","68%","8 个任务","本周更新","blue"],["第二季度规划","明确下阶段目标、范围和资源。","42%","12 个任务","昨天更新","green"],["品牌内容计划","整理品牌表达与内容发布节奏。","25%","6 个任务","5 月 9 日更新","muted"]].map(([title,desc,progress,tasks,date,tone]) => <article className="project-board-card" key={title}><div className="card-topline"><span className="status-label"><span className={`status-dot ${tone === "green" ? "green" : "blue"}`} /> {tone === "muted" ? "待启动" : "进行中"}</span><button className="icon-button" aria-label={`${title} 更多操作`}><MoreHorizontal size={17} /></button></div><h3>{title}</h3><p>{desc}</p><div className="project-progress-label"><span>完成度</span><strong>{progress}</strong></div><div className="progress-track"><span style={{width: progress}} /></div><div className="project-board-meta"><span>{tasks}</span><span>{date}</span></div><button className="module-link">查看项目 <ChevronRight size={15} /></button></article>)}</div>
  </>;
}

function FocusContent() {
  return <>
    <PageHeading kicker="工作区 / 专注" title="专注" description="给真正重要的事情留出一段不被打扰的时间。" action={<button className="primary-button page-action"><Sparkles size={15} /> 开始专注</button>} />
    <div className="focus-layout"><article className="module-card focus-timer-card"><div className="card-topline"><span className="status-label"><span className="status-dot green" /> 当前工作段</span><span className="session-state">已就绪</span></div><h2>深度工作</h2><p>下一段计划在 10:30 开始，预计持续 75 分钟。</p><div className="focus-timer">75:00</div><div className="progress-track"><span style={{width:"42%"}} /></div><div className="card-bottom"><span>今日已完成 42%</span><button className="primary-button">开始 <ChevronRight size={15} /></button></div></article><article className="module-card"><div className="module-title"><div><p className="eyebrow">今天</p><h3>专注安排</h3></div><button className="text-button">编辑 <ChevronRight size={14} /></button></div><FocusRow time="09:00 – 10:15" title="深度工作" state="已完成" /><FocusRow time="10:30 – 11:45" title="深度工作" state="即将开始" /><FocusRow time="14:00 – 14:30" title="行政处理" state="待安排" /></article></div><article className="activity-module"><div className="module-title"><div><p className="eyebrow">专注记录</p><h3>最近 7 天</h3></div><span className="status-label">平均每天 2h 15m</span></div><div className="rhythm-bars"><i style={{height:"38%"}} /><i style={{height:"56%"}} /><i style={{height:"74%"}} /><i style={{height:"48%"}} /><i style={{height:"86%"}} /><i style={{height:"64%"}} /><i style={{height:"78%"}} /></div></article>
  </>;
}

function FocusRow({ time, title, state }: { time: string; title: string; state: string }) { return <div className="focus-row"><span className="status-dot blue" /><div><strong>{title}</strong><span>{time}</span></div><small>{state}</small></div>; }

function UtilityContent({ page }: { page: string }) {
  const copy: [string, string, string] = ({ 收件箱: ["收件箱", "8 条内容等待处理", "把外部输入先收进来，再决定下一步。"], 行动: ["行动", "14 个下一步行动", "只保留可以被执行和推进的事情。"], 等待中: ["等待中", "3 个等待事项", "追踪依赖他人的事情，避免它们悄悄消失。"], 归档: ["归档", "最近归档的内容", "已完成的内容留在这里，随时可以被找回。"] }[page] ?? [page, "工作区内容", "这里会集中显示与当前工作区相关的内容。"]) as [string, string, string];
  return <><PageHeading kicker={`工作区 / ${copy[0]}`} title={copy[0]} description={copy[2]} action={<button className="primary-button page-action"><Plus size={15} /> 新建</button>} /><section className="utility-summary"><div><p className="eyebrow">当前状态</p><h2>{copy[1]}</h2></div><span className="status-label"><span className="status-dot blue" /> 工作区已同步</span></section><div className="utility-list">{["审阅第二季度预算方案","整理用户研究结论","更新产品路线图","团队晨会"].map((item,index) => <div className="utility-row" key={item}><span className="check" /> <div><strong>{item}</strong><span>{index % 2 === 0 ? "来自个人工作区" : "来自产品体验重构"}</span></div><time>{index + 1} 小时前</time><ChevronRight size={15} /></div>)}</div></>;
}

function TagsContent() { return <><PageHeading kicker="工作区 / 标签" title="标签" description="用轻量的标签组织跨项目的上下文。" action={<button className="primary-button page-action"><Plus size={15} /> 新建标签</button>} /><div className="tag-cloud">{[["研究","12"],["规划","9"],["设计","8"],["会议","6"],["重要","5"],["灵感","4"],["团队","3"]].map(([tag,count]) => <button key={tag} className="tag-chip"><span className="status-dot blue" />{tag}<small>{count}</small></button>)}</div><article className="module-card tagged-content"><div className="module-title"><div><p className="eyebrow">最近使用</p><h3>带标签的内容</h3></div><button className="outline-button"><Filter size={14} /> 过滤</button></div><div className="knowledge-row"><span className="knowledge-row-icon"><FileText size={15} /></span><div><strong>用户访谈 · 关键洞察</strong><span>#研究 · #重要</span></div><time>昨天</time><ChevronRight size={15} /></div><div className="knowledge-row"><span className="knowledge-row-icon"><FolderKanban size={15} /></span><div><strong>第二季度策略提纲</strong><span>#规划</span></div><time>5 月 12 日</time><ChevronRight size={15} /></div></article></>; }

function SettingsContent() { return <><PageHeading kicker="工作区 / 设置" title="设置" description="调整工作区的外观、行为和 Companion 的默认方式。" action={<button className="outline-button"><SlidersHorizontal size={14} /> 恢复默认</button>} /><div className="settings-grid"><article className="module-card settings-card"><div className="module-title"><div><p className="eyebrow">外观</p><h3>界面偏好</h3></div></div><SettingRow title="日夜模式" detail="跟随当前工作区的显示方式" control={<div className="segmented-control"><button className="active">深色</button><button>浅色</button></div>} /><SettingRow title="紧凑布局" detail="减少卡片间距，显示更多内容" control={<span className="fake-switch on"><i /></span>} /><SettingRow title="动效" detail="保留必要的状态反馈" control={<span className="fake-switch on"><i /></span>} /></article><article className="module-card settings-card"><div className="module-title"><div><p className="eyebrow">Companion</p><h3>助手偏好</h3></div></div><SettingRow title="主动提示" detail="在发现冲突或下一步时提醒我" control={<span className="fake-switch on"><i /></span>} /><SettingRow title="上下文范围" detail="默认使用当前工作区内容" control={<button className="outline-button">当前工作区 <ChevronDown size={14} /></button>} /><SettingRow title="快捷键" detail="打开 Companion" control={<kbd>⌘ K</kbd>} /></article></div></>; }

function SettingRow({ title, detail, control }: { title: string; detail: string; control: React.ReactNode }) { return <div className="setting-row"><div><strong>{title}</strong><span>{detail}</span></div>{control}</div>; }

function ProjectRow({ name, progress }: { name: string; progress: string }) { return <div className="project-row"><span className="project-icon"><FolderKanban size={14} /></span><span>{name}</span><span className="mini-progress"><i style={{ width: progress }} /></span><b>{progress}</b></div>; }
function ActivityRow({ time, icon, label, detail }: { time: string; icon: React.ReactNode; label: string; detail: string }) { return <div className="activity-row"><time>{time}</time><span className="activity-icon">{icon}</span><span>{label}</span><strong>{detail}</strong></div>; }
