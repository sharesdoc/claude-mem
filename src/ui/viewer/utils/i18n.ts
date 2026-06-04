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
    'header.dateFilter': 'Date',
    'header.dateFilterTip': 'Filter to a specific day',
    'header.dateFilterClear': 'Clear',
    'header.dateFilterClearTip': 'Clear date filter',
    'header.dateFilterToday': 'Today',
    'header.dateFilterYesterday': 'Yesterday',
    'header.dateFilterDayBefore': 'Day before',

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
    'sidebar.alias': 'Alias',
    'sidebar.fullId': 'Full ID',
    'sidebar.lastActive': 'Last active',
    'sidebar.lastActiveNever': 'No activity yet',
    'sidebar.manage': 'Manage',
    'sidebar.manageTip': 'Select projects to delete',
    'sidebar.exitSelect': 'Exit selection',
    'sidebar.selectAll': 'Select all',
    'sidebar.deselectAll': 'Deselect all',
    'sidebar.deleteSelected': 'Delete selected',
    'sidebar.deleteSelectedTip': 'Permanently delete the selected projects and ALL their observations, summaries, prompts and sessions',
    'sidebar.deleting': 'Deleting…',
    'sidebar.deleteConfirm': 'Permanently delete {count} project(s) and ALL their data?\n\nThis cannot be undone.',
    'sidebar.deleteSuccess': 'Deleted {count} project(s)',
    'sidebar.deleteSkipped': 'Skipped {count}: project is in use by an AI session',
    'sidebar.deleteError': 'Delete failed: {error}',
    'sidebar.inUseChip': 'in use',
    'sidebar.inUseTip': 'Currently in use by an AI session — cannot be deleted right now.',
    'sidebar.selectCheckbox': 'Select this project',
    'sidebar.userGroupTip': 'Click to expand/collapse projects for this user',
    'sidebar.unknownUser': 'unknown',

    'feed.empty': 'No items to display',
    'feed.loading': 'Loading more...',
    'feed.noMore': 'No more items to load',

    'header.stats': 'Analytics',
    'header.statsTitle': 'View statistical analytics',

    'stats.title': 'Analytics',
    'stats.allProjects': 'All Projects',
    'stats.singleProject': 'Project',
    'stats.totalObservations': 'Total Observations',
    'stats.totalPrompts': 'Total Prompts',
    'stats.totalSummaries': 'Total Summaries',
    'stats.totalSessions': 'Total Sessions',
    'stats.totalTokens': 'Discovery Tokens',
    'stats.tokensSaved': 'Tokens Saved',
    'stats.dailyPromptsByUser': 'Daily Prompts by User',
    'stats.dailyObsByUser': 'Daily Observations by User',
    'stats.dailySummariesByUser': 'Daily Summaries by User',
    'stats.dailyPrompts': 'Daily Prompts',
    'stats.dailyObs': 'Daily Observations',
    'stats.dailySummaries': 'Daily Summaries',
    'stats.promptsByProject': 'Prompts by Project',
    'stats.userSummary': 'User Summary',
    'stats.user': 'User',
    'stats.prompts': 'Prompts',
    'stats.observations': 'Obs',
    'stats.summaries': 'Summaries',
    'stats.lastActive': 'Last Active',
    'stats.loading': 'Loading analytics...',
    'stats.error': 'Failed to load analytics',
    'stats.retry': 'Retry',
    'stats.noData': 'No analytics data available',
    'stats.never': '-',

    'card.untitled': 'Untitled',
    'card.facts': 'facts',
    'card.narrative': 'narrative',
    'card.merged': 'merged →',
    'card.mergedTip': 'Merged into',
    'card.readPrefix': 'read:',
    'card.modifiedPrefix': 'modified:',
    'card.userNameTip': 'OS user that produced this row',
    'card.userLabelTip': 'Sync identity (server-mode label)',

    'user.selectorLabel': 'User',
    'user.selectorTip': 'Filter all views to a single user',
    'user.all': 'All users',
    'user.placeholder': 'Select a user…',

    'sync.statusConnecting': 'Sync: connecting…',
    'sync.statusOk': 'Sync: up to date',
    'sync.statusBehind': 'Sync: {n} pending',
    'sync.statusError': 'Sync: error (see logs)',
    'sync.statusDisabled': 'Sync: disabled',

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
    'prompt.delete': 'Delete prompt',

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
    'header.dateFilter': '日期',
    'header.dateFilterTip': '筛选某一天的数据',
    'header.dateFilterClear': '清除',
    'header.dateFilterClearTip': '清除日期筛选',
    'header.dateFilterToday': '今天',
    'header.dateFilterYesterday': '昨天',
    'header.dateFilterDayBefore': '前天',

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
    'sidebar.alias': '别名',
    'sidebar.fullId': '完整 ID',
    'sidebar.lastActive': '最近活动',
    'sidebar.lastActiveNever': '暂无活动',
    'sidebar.manage': '管理',
    'sidebar.manageTip': '选择要删除的项目',
    'sidebar.exitSelect': '退出选择',
    'sidebar.selectAll': '全选',
    'sidebar.deselectAll': '取消全选',
    'sidebar.deleteSelected': '删除所选',
    'sidebar.deleteSelectedTip': '永久删除所选项目及其全部观察、总结、提示词与会话记录',
    'sidebar.deleting': '删除中……',
    'sidebar.deleteConfirm': '永久删除 {count} 个项目及其全部数据？\n\n此操作不可撤销。',
    'sidebar.deleteSuccess': '已删除 {count} 个项目',
    'sidebar.deleteSkipped': '跳过 {count} 个：项目正被 AI 会话使用',
    'sidebar.deleteError': '删除失败：{error}',
    'sidebar.inUseChip': '使用中',
    'sidebar.inUseTip': '该项目正被 AI 会话使用，暂时无法删除。',
    'sidebar.selectCheckbox': '选择该项目',
    'sidebar.userGroupTip': '点击展开/收起该用户的项目',
    'sidebar.unknownUser': '未知',

    'feed.empty': '暂无内容',
    'feed.loading': '正在加载更多……',
    'feed.noMore': '没有更多内容',

    'header.stats': '统计分析',
    'header.statsTitle': '查看统计分析',

    'stats.title': '统计分析',
    'stats.allProjects': '所有项目',
    'stats.singleProject': '项目',
    'stats.totalObservations': '总观察数',
    'stats.totalPrompts': '总提示词数',
    'stats.totalSummaries': '总会话总结数',
    'stats.totalSessions': '总会话数',
    'stats.totalTokens': '发现 Token',
    'stats.tokensSaved': '节省 Token',
    'stats.dailyPromptsByUser': '各用户每日提示词输入量',
    'stats.dailyObsByUser': '各用户每日观察量',
    'stats.dailySummariesByUser': '各用户每日总结量',
    'stats.dailyPrompts': '每日提示词输入量',
    'stats.dailyObs': '每日观察量',
    'stats.dailySummaries': '每日总结量',
    'stats.promptsByProject': '各项目提示词输入量',
    'stats.userSummary': '用户汇总',
    'stats.user': '用户',
    'stats.prompts': '提示词',
    'stats.observations': '观察',
    'stats.summaries': '总结',
    'stats.lastActive': '最后活跃',
    'stats.loading': '加载统计数据中...',
    'stats.error': '加载统计数据失败',
    'stats.retry': '重试',
    'stats.noData': '暂无统计数据',
    'stats.never': '-',

    'card.untitled': '无标题',
    'card.facts': '事实',
    'card.narrative': '叙述',
    'card.merged': '合并 →',
    'card.mergedTip': '已合并至',
    'card.readPrefix': '读取：',
    'card.modifiedPrefix': '修改：',
    'card.userNameTip': '操作系统用户',
    'card.userLabelTip': '同步身份（服务端识别标签）',

    'user.selectorLabel': '用户',
    'user.selectorTip': '按用户筛选所有视图',
    'user.all': '全部用户',
    'user.placeholder': '选择用户…',

    'sync.statusConnecting': '同步：连接中…',
    'sync.statusOk': '同步：已同步',
    'sync.statusBehind': '同步：待推送 {n} 条',
    'sync.statusError': '同步：出错（见日志）',
    'sync.statusDisabled': '同步：已停用',

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
    'prompt.delete': '删除提示词',

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

/**
 * Look up a translation, optionally substituting `{name}` placeholders.
 *
 * Placeholder syntax is intentionally tiny: `{var}` is replaced by
 * `String(vars.var)`. Missing keys fall back to English, then to the raw key
 * so untranslated UI is at worst readable.
 */
export function translate(
  locale: Locale,
  key: string,
  vars?: Record<string, string | number>
): string {
  const template = translations[locale]?.[key] ?? translations.en[key] ?? key;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : `{${name}}`
  );
}
