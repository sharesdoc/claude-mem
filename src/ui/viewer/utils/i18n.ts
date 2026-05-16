export type Locale = 'en' | 'zh';

export const LOCALES: Locale[] = ['en', 'zh'];
const STORAGE_KEY = 'claude-mem.locale';
const DEFAULT_LOCALE: Locale = 'en';

type Dict = Record<string, string>;

export const translations: Record<Locale, Dict> = {
  en: {
    'header.docs': 'Documentation',
    'header.followX': 'Follow us on X',
    'header.discord': 'Join our Discord community',
    'header.allProjects': 'All Projects',
    'header.showWelcome': 'Show welcome card',
    'header.settings': 'Settings',
    'header.languageLabel': 'Language',
    'header.viewAll': 'Show All',
    'header.viewPrompts': 'Prompts',

    'theme.light': 'Theme: Light (click for Dark)',
    'theme.dark': 'Theme: Dark (click for System)',
    'theme.system': 'Theme: System (click for Light)',

    'sidebar.title': 'Projects',
    'sidebar.allProjectsTip': 'Show items from all projects',
    'sidebar.empty': 'No projects yet',
    'sidebar.observations': 'observations',
    'sidebar.summaries': 'summaries',
    'sidebar.prompts': 'prompts',
    'sidebar.resize': 'Resize project sidebar',

    'feed.empty': 'No items to display',
    'feed.loading': 'Loading more...',
    'feed.noMore': 'No more items to load',

    'card.untitled': 'Untitled',
    'card.facts': 'facts',
    'card.narrative': 'narrative',
    'card.merged': 'merged →',
    'card.mergedTip': 'Merged into',
    'card.readPrefix': 'read:',
    'card.modifiedPrefix': 'modified:',

    'summary.session': 'Session Summary',
    'summary.investigated': 'Investigated',
    'summary.learned': 'Learned',
    'summary.completed': 'Completed',
    'summary.nextSteps': 'Next Steps',
    'summary.sessionId': 'Session #',

    'prompt.title': 'Prompt',
    'prompt.copy': 'Copy prompt',
    'prompt.copied': 'Copied',
    'prompt.copiedMsg': 'Prompt is copied!',

    'welcome.title': 'Welcome to claude-mem',
    'welcome.tagline': 'Persistent memory for Claude Code.',
    'welcome.feat.streamTitle': 'Live feed',
    'welcome.feat.streamDesc': 'Observations, summaries, and prompts stream in live.',
    'welcome.feat.tuneTitle': 'Tune it',
    'welcome.feat.tuneDesc': 'The gear in the top-right tunes memory injection.',
    'welcome.feat.recallTitle': 'Recall it',
    'welcome.feat.recallDesc': 'Ask Claude or run /mem-search to find past work.',
    'welcome.howItWorks': 'How it works',
    'welcome.docs': 'Read the docs',
    'welcome.close': 'Close (Esc)',
    'welcome.closeAria': 'Close welcome',

    'logs.refresh': 'Refresh logs',
    'logs.scrollBottom': 'Scroll to bottom',
    'logs.clear': 'Clear logs',
    'logs.close': 'Close console',
    'logs.confirmClear': 'Are you sure you want to clear all logs?',
    'logs.selectAll': 'Select all',
    'logs.selectNone': 'Select none',
    'logs.sessionFilter': 'Show only session alignment logs',
    'logs.unknownError': 'Unknown error',
    'logs.consoleTab': 'Console',
    'logs.autoRefresh': 'Auto-refresh',
    'logs.quickLabel': 'Quick:',
    'logs.levelsLabel': 'Levels:',
    'logs.componentsLabel': 'Components:',
    'logs.alignmentChip': '🔗 Alignment',

    'settings.title': 'Settings',
    'settings.save': 'Save',
    'settings.saving': 'Saving...',
    'settings.saved': 'Saved',
    'settings.close': 'Close (Esc)',
    'settings.source': 'Source:',
    'settings.project': 'Project:',
    'settings.sectionLoading': 'Loading',
    'settings.sectionLoadingDesc': 'How many observations to inject',
    'settings.sectionDisplay': 'Display',
    'settings.sectionDisplayDesc': 'What to show in context tables',
    'settings.sectionAdvanced': 'Advanced',
    'settings.errorPreview': 'Error loading preview:',

    'console.toggle': 'Toggle Console',

    'common.scrollTop': 'Back to top',
  },
  zh: {
    'header.docs': '文档',
    'header.followX': '在 X 关注我们',
    'header.discord': '加入 Discord 社区',
    'header.allProjects': '全部项目',
    'header.showWelcome': '显示欢迎卡片',
    'header.settings': '设置',
    'header.languageLabel': '语言',
    'header.viewAll': '显示所有',
    'header.viewPrompts': '提示词',

    'theme.light': '主题：浅色（点击切换深色）',
    'theme.dark': '主题：深色（点击切换跟随系统）',
    'theme.system': '主题：跟随系统（点击切换浅色）',

    'sidebar.title': '项目',
    'sidebar.allProjectsTip': '显示全部项目的条目',
    'sidebar.empty': '还没有项目',
    'sidebar.observations': '观察',
    'sidebar.summaries': '总结',
    'sidebar.prompts': '提示词',
    'sidebar.resize': '调整项目侧栏宽度',

    'feed.empty': '暂无内容',
    'feed.loading': '正在加载更多……',
    'feed.noMore': '没有更多内容',

    'card.untitled': '无标题',
    'card.facts': '事实',
    'card.narrative': '叙述',
    'card.merged': '合并 →',
    'card.mergedTip': '已合并至',
    'card.readPrefix': '读取：',
    'card.modifiedPrefix': '修改：',

    'summary.session': '会话总结',
    'summary.investigated': '调查',
    'summary.learned': '学到',
    'summary.completed': '完成',
    'summary.nextSteps': '下一步',
    'summary.sessionId': '会话 #',

    'prompt.title': '提示词',
    'prompt.copy': '复制提示词',
    'prompt.copied': '已复制',
    'prompt.copiedMsg': '提示词已复制！',

    'welcome.title': '欢迎使用 claude-mem',
    'welcome.tagline': 'Claude Code 的持久化记忆系统。',
    'welcome.feat.streamTitle': '实时流',
    'welcome.feat.streamDesc': '观察、总结与提示词会实时流入。',
    'welcome.feat.tuneTitle': '调优',
    'welcome.feat.tuneDesc': '右上角齿轮可调整记忆注入参数。',
    'welcome.feat.recallTitle': '检索',
    'welcome.feat.recallDesc': '直接问 Claude 或运行 /mem-search 查询过往。',
    'welcome.howItWorks': '工作原理',
    'welcome.docs': '阅读文档',
    'welcome.close': '关闭 (Esc)',
    'welcome.closeAria': '关闭欢迎卡片',

    'logs.refresh': '刷新日志',
    'logs.scrollBottom': '滚到底部',
    'logs.clear': '清空日志',
    'logs.close': '关闭控制台',
    'logs.confirmClear': '确定清空所有日志吗？',
    'logs.selectAll': '全选',
    'logs.selectNone': '全不选',
    'logs.sessionFilter': '只看会话对齐日志',
    'logs.unknownError': '未知错误',
    'logs.consoleTab': '控制台',
    'logs.autoRefresh': '自动刷新',
    'logs.quickLabel': '快速筛选：',
    'logs.levelsLabel': '级别：',
    'logs.componentsLabel': '组件：',
    'logs.alignmentChip': '🔗 会话对齐',

    'settings.title': '设置',
    'settings.save': '保存',
    'settings.saving': '保存中……',
    'settings.saved': '已保存',
    'settings.close': '关闭 (Esc)',
    'settings.source': '来源：',
    'settings.project': '项目：',
    'settings.sectionLoading': '加载',
    'settings.sectionLoadingDesc': '注入多少条观察',
    'settings.sectionDisplay': '显示',
    'settings.sectionDisplayDesc': '上下文表格中显示哪些内容',
    'settings.sectionAdvanced': '高级',
    'settings.errorPreview': '加载预览失败：',

    'console.toggle': '切换控制台',

    'common.scrollTop': '回到顶部',
  },
};

export function getStoredLocale(): Locale {
  if (typeof window === 'undefined') return DEFAULT_LOCALE;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'en' || stored === 'zh') return stored;
  } catch {
    /* localStorage unavailable */
  }
  return DEFAULT_LOCALE;
}

export function setStoredLocale(locale: Locale): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    /* ignore */
  }
}

export function translate(locale: Locale, key: string): string {
  return translations[locale]?.[key] ?? translations.en[key] ?? key;
}
