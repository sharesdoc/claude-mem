import { Database } from 'bun:sqlite';
import { logger } from '../../../utils/logger.js';

/**
 * ReportGenerator — 用户工作周报生成器 (B-周报设计文档 §5.4)。
 *
 * 混合生成:先用数据库数据确定性拼装中文 Markdown(项目/工作内容/成果/时间),
 * 再用 Qwen(阿里云 DashScope,OpenAI 兼容接口)补一段"本周综合分析"。
 * Qwen 凭证直接读环境变量 DASHSCOPE_API_KEY;未配置或调用失败则省略 AI 段、
 * 整份周报仍可生成(降级)。本生成器只读源表,不改采集链路。
 */

const DAY_MS = 86400000;
const DASHSCOPE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
const AI_TIMEOUT_MS = 30000;

/** 周报列表/卡片用的摘要统计。 */
export interface ReportStats {
  totalMs: number;
  projects: number;
  prompts: number;
  obs: number;
  summaries: number;
  sessions: number;
}

export interface GeneratedReport {
  user_label: string;
  week_start: string;   // 周一本地日期 YYYY-MM-DD
  week_end: string;     // 周日本地日期 YYYY-MM-DD
  markdown: string;
  stats: ReportStats;
  model: string;        // AI 段所用模型;纯拼装为空串
  generated_at_epoch: number;
}

interface ProjectAgg {
  project: string;
  prompts: number;
  total_ms: number;
}
interface ObsRow {
  project: string; type: string; title: string | null;
  subtitle: string | null; narrative: string | null;
}
interface SummaryRow {
  project: string; request: string | null; completed: string | null;
  learned: string | null; investigated: string | null; next_steps: string | null;
}

/**
 * 给定某真实 epoch,返回其所在 ISO 周(周一起)的周一**本地**日期 'YYYY-MM-DD'。
 * 与 DataRoutes.historyWeeks 的周切分口径一致。scheduler/route 共用。
 */
export function weekMondayOf(epochMs: number, tzOffsetMs: number): string {
  const shifted = new Date(epochMs + tzOffsetMs);
  const wd = shifted.getUTCDay(); // 0=Sun..6=Sat
  const dayStartWall = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate());
  const monday = dayStartWall - (wd === 0 ? 6 : wd - 1) * DAY_MS;
  const dt = new Date(monday);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

/** ms → 中文耗时 "Xh Ym"。 */
function fmtDuration(ms: number): string {
  if (!ms || ms <= 0) return '0 分钟';
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins} 分钟`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h} 小时` : `${h} 小时 ${m} 分`;
}

/** 把多行结构化文本切成去重后的要点数组(过滤空行/占位)。 */
function toBullets(values: Array<string | null | undefined>, max: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    if (!v) continue;
    for (const rawLine of String(v).split(/\r?\n/)) {
      const line = rawLine.replace(/^[\s\-*•·\d.、)]+/, '').trim();
      if (line.length < 2) continue;
      const key = line.slice(0, 80);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(line);
      if (out.length >= max) return out;
    }
  }
  return out;
}

/** 将生成的周报 UPSERT 进 weekly_reports(按 user_label+week_start 唯一)。 */
export function upsertWeeklyReport(db: Database, report: GeneratedReport): void {
  db.prepare(`
    INSERT INTO weekly_reports (user_label, week_start, week_end, markdown, stats, model, generated_at_epoch)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_label, week_start) DO UPDATE SET
      week_end = excluded.week_end, markdown = excluded.markdown, stats = excluded.stats,
      model = excluded.model, generated_at_epoch = excluded.generated_at_epoch
  `).run(report.user_label, report.week_start, report.week_end, report.markdown,
    JSON.stringify(report.stats), report.model, report.generated_at_epoch);
}

export class ReportGenerator {
  constructor(private db: Database) {}

  /**
   * 生成某用户某周的周报。
   * @param userLabel 目标用户(已 COALESCE 归一;'unknown' 表示空标签用户)
   * @param weekStart 周一本地日期 'YYYY-MM-DD'
   * @param tzOffsetMs 浏览器/本地时区偏移(分钟*60000),用于把本地周边界换算为真实 epoch
   * @param model     AI 段使用的 Qwen 模型名(如 qwen-plus)
   */
  async generate(userLabel: string, weekStart: string, tzOffsetMs: number, model: string): Promise<GeneratedReport> {
    const [y, m, d] = weekStart.split('-').map(Number);
    const wallStart = Date.UTC(y, m - 1, d);
    const wallEnd = wallStart + 7 * DAY_MS;
    const start = wallStart - tzOffsetMs; // 真实 epoch 区间 [start, end)
    const end = wallEnd - tzOffsetMs;
    const weekEnd = this.fmtYMD(wallStart + 6 * DAY_MS);

    const user = userLabel || 'unknown';

    // ── 聚合(只读) ──────────────────────────────────────────────────
    const projAgg = this.db.prepare(`
      SELECT s.project AS project,
             COUNT(*) AS prompts,
             COALESCE(SUM(CASE WHEN up.completed_at_epoch IS NOT NULL
               THEN (up.completed_at_epoch - up.created_at_epoch + COALESCE(up.think_time_ms, 0))
               ELSE 0 END), 0) AS total_ms
      FROM user_prompts up
      JOIN sdk_sessions s ON s.content_session_id = up.content_session_id
      WHERE up.created_at_epoch >= ? AND up.created_at_epoch < ?
        AND COALESCE(NULLIF(s.user_label, ''), 'unknown') = ? COLLATE NOCASE
      GROUP BY s.project
      ORDER BY total_ms DESC
    `).all(start, end, user) as ProjectAgg[];

    const sessRow = this.db.prepare(`
      SELECT COUNT(*) AS sessions, COUNT(DISTINCT s.project) AS projects
      FROM sdk_sessions s
      WHERE s.started_at_epoch >= ? AND s.started_at_epoch < ?
        AND COALESCE(NULLIF(s.user_label, ''), 'unknown') = ? COLLATE NOCASE
    `).get(start, end, user) as { sessions: number; projects: number } | undefined;

    const obsRows = this.db.prepare(`
      SELECT COALESCE(NULLIF(o.merged_into_project, ''), o.project) AS project,
             o.type AS type, o.title AS title, o.subtitle AS subtitle, o.narrative AS narrative
      FROM observations o
      WHERE o.created_at_epoch >= ? AND o.created_at_epoch < ?
        AND COALESCE(NULLIF(o.user_label, ''), 'unknown') = ? COLLATE NOCASE
      ORDER BY o.created_at_epoch ASC
    `).all(start, end, user) as ObsRow[];

    const summRows = this.db.prepare(`
      SELECT COALESCE(NULLIF(ss.merged_into_project, ''), ss.project) AS project,
             ss.request AS request, ss.completed AS completed, ss.learned AS learned,
             ss.investigated AS investigated, ss.next_steps AS next_steps
      FROM session_summaries ss
      WHERE ss.created_at_epoch >= ? AND ss.created_at_epoch < ?
        AND COALESCE(NULLIF(ss.user_label, ''), 'unknown') = ? COLLATE NOCASE
      ORDER BY ss.created_at_epoch ASC
    `).all(start, end, user) as SummaryRow[];

    const totalMs = projAgg.reduce((s, p) => s + p.total_ms, 0);
    const prompts = projAgg.reduce((s, p) => s + p.prompts, 0);
    const projects = new Set<string>([...projAgg.map(p => p.project), ...obsRows.map(o => o.project), ...summRows.map(s => s.project)]);
    const stats: ReportStats = {
      totalMs,
      projects: projects.size || (sessRow?.projects ?? 0),
      prompts,
      obs: obsRows.length,
      summaries: summRows.length,
      sessions: sessRow?.sessions ?? 0,
    };

    // ── 确定性拼装 Markdown ─────────────────────────────────────────
    const highlights = await this.synthesizeHighlights(user, weekStart, weekEnd, stats, projAgg, summRows, obsRows, model);
    const markdown = this.buildMarkdown(user, weekStart, weekEnd, stats, projAgg, obsRows, summRows, highlights);

    return {
      user_label: user,
      week_start: weekStart,
      week_end: weekEnd,
      markdown,
      stats,
      model: highlights ? model : '',
      generated_at_epoch: Date.now(),
    };
  }

  private fmtYMD(wallMs: number): string {
    const dt = new Date(wallMs);
    return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
  }

  /** 把每个项目的工作内容/成果/关键记录组织成结构化对象,供拼装与 AI 提示复用。 */
  private byProject(projAgg: ProjectAgg[], obsRows: ObsRow[], summRows: SummaryRow[]) {
    const names = new Set<string>([...projAgg.map(p => p.project), ...obsRows.map(o => o.project), ...summRows.map(s => s.project)]);
    const timeOf = new Map(projAgg.map(p => [p.project, p.total_ms]));
    return Array.from(names)
      .map(project => {
        const ss = summRows.filter(s => s.project === project);
        const os = obsRows.filter(o => o.project === project);
        return {
          project,
          totalMs: timeOf.get(project) ?? 0,
          completed: toBullets(ss.map(s => s.completed), 8),
          learned: toBullets(ss.map(s => s.learned), 6),
          observations: os.slice(0, 8).map(o => ({ type: o.type, title: (o.title || o.subtitle || o.narrative || '').trim() })).filter(o => o.title),
          nextSteps: toBullets(ss.map(s => s.next_steps), 5),
        };
      })
      .sort((a, b) => b.totalMs - a.totalMs);
  }

  private buildMarkdown(
    user: string, weekStart: string, weekEnd: string, stats: ReportStats,
    projAgg: ProjectAgg[], obsRows: ObsRow[], summRows: SummaryRow[], highlights: string | null,
  ): string {
    const projects = this.byProject(projAgg, obsRows, summRows);
    const L: string[] = [];
    L.push(`# 周报 · ${user} · ${weekStart} ~ ${weekEnd}`);
    L.push('');
    L.push(`> 数据来源:claude-mem · 周期:${weekStart}(周一) ~ ${weekEnd}(周日)`);
    L.push('');

    L.push('## 一、概览');
    L.push('');
    L.push('| 指标 | 数值 |');
    L.push('| --- | --- |');
    L.push(`| 总 AI 处理时间 | ${fmtDuration(stats.totalMs)} |`);
    L.push(`| 涉及项目 | ${stats.projects} 个 |`);
    L.push(`| 提示词(任务) | ${stats.prompts} |`);
    L.push(`| 观察记录 | ${stats.obs} |`);
    L.push(`| 会话总结 | ${stats.summaries} |`);
    L.push(`| 会话数 | ${stats.sessions} |`);
    L.push('');

    L.push('## 二、本周综合分析');
    L.push('');
    L.push(highlights ? highlights.trim() : '_(未启用 AI 综合分析或暂不可用,以下为确定性汇总。)_');
    L.push('');

    L.push('## 三、按项目');
    L.push('');
    if (projects.length === 0) {
      L.push('_本周无项目活动记录。_');
      L.push('');
    }
    for (const p of projects) {
      L.push(`### ${p.project}  ·  耗时 ${fmtDuration(p.totalMs)}`);
      L.push('');
      if (p.completed.length) {
        L.push('**工作内容**');
        L.push('');
        for (const c of p.completed) L.push(`- ${c}`);
        L.push('');
      }
      if (p.learned.length) {
        L.push('**成果与发现**');
        L.push('');
        for (const c of p.learned) L.push(`- ${c}`);
        L.push('');
      }
      if (p.observations.length) {
        L.push('**关键记录**');
        L.push('');
        for (const o of p.observations) L.push(`- \`${o.type}\` ${o.title}`);
        L.push('');
      }
    }

    const allLearned = toBullets(summRows.map(s => s.learned), 12);
    if (allLearned.length) {
      L.push('## 四、学习与发现');
      L.push('');
      for (const c of allLearned) L.push(`- ${c}`);
      L.push('');
    }

    const allNext = toBullets(summRows.map(s => s.next_steps), 10);
    if (allNext.length) {
      L.push('## 五、下一步');
      L.push('');
      for (const c of allNext) L.push(`- ${c}`);
      L.push('');
    }

    return L.join('\n');
  }

  /**
   * 可选 AI 综合分析(Qwen / DashScope)。读 env DASHSCOPE_API_KEY,
   * 缺失或任何失败/超时 → 返回 null(降级,周报照常输出确定性部分)。
   */
  private async synthesizeHighlights(
    user: string, weekStart: string, weekEnd: string, stats: ReportStats,
    projAgg: ProjectAgg[], summRows: SummaryRow[], obsRows: ObsRow[], model: string,
  ): Promise<string | null> {
    const apiKey = (process.env.DASHSCOPE_API_KEY ?? '').trim();
    if (!apiKey) return null;
    if (stats.prompts === 0 && stats.obs === 0 && stats.summaries === 0) return null;

    const projects = this.byProject(projAgg, obsRows, summRows);
    const facts = [
      `用户:${user}`,
      `周期:${weekStart} ~ ${weekEnd}`,
      `总AI处理时间:${fmtDuration(stats.totalMs)};项目数:${stats.projects};提示词:${stats.prompts};观察:${stats.obs};总结:${stats.summaries}`,
      '各项目:',
      ...projects.slice(0, 8).map(p =>
        `- ${p.project}(耗时${fmtDuration(p.totalMs)}):` +
        (p.completed.slice(0, 4).join(';') || '无总结') +
        (p.learned.length ? ` | 收获:${p.learned.slice(0, 2).join(';')}` : '')),
    ].join('\n');

    const userPrompt =
      '你是工程团队的技术主管,请根据以下某员工本周的真实工作数据,写一段简洁、专业、面向汇报的"本周综合分析",' +
      '用中文 Markdown,150~300 字,突出:做了哪些重要工作、主要成果、时间精力分布、值得关注的点。' +
      '不要罗列原始数据,不要编造未提供的信息,不要使用一级标题。\n\n数据:\n' + facts;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
    try {
      const resp = await fetch(DASHSCOPE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: '你是严谨的技术主管,只依据给定数据撰写工作周报分析,不臆造。' },
            { role: 'user', content: userPrompt },
          ],
          stream: false,
          temperature: 0.4,
        }),
        signal: controller.signal,
      });
      if (!resp.ok) {
        logger.warn('WORKER', 'DashScope non-2xx, skip AI highlights', { status: resp.status });
        return null;
      }
      const data = await resp.json() as { choices?: Array<{ message?: { content?: string } }> };
      const content = data.choices?.[0]?.message?.content?.trim();
      return content && content.length > 0 ? content : null;
    } catch (err) {
      logger.warn('WORKER', 'DashScope call failed, skip AI highlights', {
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}
