import { Database } from 'bun:sqlite';
import { logger } from '../../../utils/logger.js';
import { SettingsDefaultsManager } from '../../../shared/SettingsDefaultsManager.js';
import { USER_SETTINGS_PATH } from '../../../shared/paths.js';

/**
 * DailyReportGenerator — 用户工作日报生成器(日报)。
 *
 * 与周报(ReportGenerator)同源、但**刻意做简**:只取某一天 user×project 的
 * 工时与工作内容,用 Qwen(阿里云 DashScope,OpenAI 兼容接口)提炼出一份
 * **简短**的中文日报(今日工作概述 → 今日重点工作),要点罗列、说明从简。
 * Qwen 凭证读 env DASHSCOPE_API_KEY,settings.json 兜底;未配置或失败则退回
 * 确定性简版(只汇总、不臆造)。只读源表,不改采集链路。
 */

const DAY_MS = 86400000;
const DASHSCOPE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
const AI_TIMEOUT_MS = 90000;
// 日报送入 AI 的项目数上限(单日通常项目不多,留足余量)。
const MAX_PROJECTS_IN_PROMPT = 10;
// AI 工作时间不足该阈值的项目(连同其任务)在日报里直接忽略,滤掉琐碎噪音。
const MIN_PROJECT_MS = 10 * 60000; // 10 分钟

export interface DailyReportStats {
  totalMs: number;
  projects: number;
  prompts: number;
  obs: number;
  summaries: number;
  sessions: number;
}

export interface GeneratedDailyReport {
  user_label: string;
  report_date: string;  // 本地日期 YYYY-MM-DD
  markdown: string;
  stats: DailyReportStats;
  model: string;        // AI 段所用模型;纯拼装为空串
  generated_at_epoch: number;
}

interface ProjectAgg { project: string; prompts: number; total_ms: number; }
interface ObsRow { project: string; type: string; title: string | null; subtitle: string | null; narrative: string | null; }
interface SummaryRow { project: string; completed: string | null; learned: string | null; }

/** 单项目当日聚合。 */
interface ProjectDigest {
  project: string;
  totalMs: number;
  completed: string[];
  learned: string[];
  observations: Array<{ type: string; title: string }>;
}

/** 给定真实 epoch,返回其所在**本地**日期 'YYYY-MM-DD'。 */
export function dayOf(epochMs: number, tzOffsetMs: number): string {
  const dt = new Date(epochMs + tzOffsetMs);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

/** ms → 中文耗时 "X 小时 Y 分"。 */
function fmtDuration(ms: number): string {
  if (!ms || ms <= 0) return '0 分钟';
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins} 分钟`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h} 小时` : `${h} 小时 ${m} 分`;
}

/** 把多行结构化文本切成去重后的要点(过滤空行/列表符号)。 */
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

function clip(s: string, n: number): string {
  const t = s.trim().replace(/\s+/g, ' ');
  return t.length > n ? t.slice(0, n) + '…' : t;
}

/** 将生成的日报 UPSERT 进 daily_reports(按 user_label+report_date 唯一)。 */
export function upsertDailyReport(db: Database, report: GeneratedDailyReport): void {
  db.prepare(`
    INSERT INTO daily_reports (user_label, report_date, markdown, stats, model, generated_at_epoch)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_label, report_date) DO UPDATE SET
      markdown = excluded.markdown, stats = excluded.stats,
      model = excluded.model, generated_at_epoch = excluded.generated_at_epoch
  `).run(report.user_label, report.report_date, report.markdown,
    JSON.stringify(report.stats), report.model, report.generated_at_epoch);
}

export class DailyReportGenerator {
  constructor(private db: Database) {}

  async generate(userLabel: string, reportDate: string, tzOffsetMs: number, model: string): Promise<GeneratedDailyReport> {
    const [y, m, d] = reportDate.split('-').map(Number);
    const wallStart = Date.UTC(y, m - 1, d);
    const start = wallStart - tzOffsetMs; // 真实 epoch 区间 [start, end)
    const end = wallStart + DAY_MS - tzOffsetMs;
    const user = userLabel || 'unknown';

    // ── 聚合(只读) ──────────────────────────────────────────────────
    const projAgg = this.db.prepare(`
      SELECT s.project AS project, COUNT(*) AS prompts,
             COALESCE(SUM(CASE WHEN up.completed_at_epoch IS NOT NULL
               THEN (up.completed_at_epoch - up.created_at_epoch + COALESCE(up.think_time_ms, 0))
               ELSE 0 END), 0) AS total_ms
      FROM user_prompts up
      JOIN sdk_sessions s ON s.content_session_id = up.content_session_id
      WHERE up.created_at_epoch >= ? AND up.created_at_epoch < ?
        AND COALESCE(NULLIF(s.user_label, ''), 'unknown') = ? COLLATE NOCASE
      GROUP BY s.project ORDER BY total_ms DESC
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
             ss.completed AS completed, ss.learned AS learned
      FROM session_summaries ss
      WHERE ss.created_at_epoch >= ? AND ss.created_at_epoch < ?
        AND COALESCE(NULLIF(ss.user_label, ''), 'unknown') = ? COLLATE NOCASE
      ORDER BY ss.created_at_epoch ASC
    `).all(start, end, user) as SummaryRow[];

    const totalMs = projAgg.reduce((s, p) => s + p.total_ms, 0);
    const prompts = projAgg.reduce((s, p) => s + p.prompts, 0);
    const projects = new Set<string>([...projAgg.map(p => p.project), ...obsRows.map(o => o.project), ...summRows.map(s => s.project)]);
    const stats: DailyReportStats = {
      totalMs, projects: projects.size || (sessRow?.projects ?? 0),
      prompts, obs: obsRows.length, summaries: summRows.length, sessions: sessRow?.sessions ?? 0,
    };

    const digests = this.digestByProject(projAgg, obsRows, summRows);

    // 正文:① 有内容 → AI 提炼简短日报;② 失败/无 Key → 确定性简版。
    const aiBody = await this.synthesize(user, reportDate, stats, digests, model);
    const body = aiBody ?? this.fallbackBody(stats, digests);
    const markdown = this.assemble(user, reportDate, stats, body);

    return {
      user_label: user, report_date: reportDate, markdown, stats,
      model: aiBody ? model : '', generated_at_epoch: Date.now(),
    };
  }

  private digestByProject(projAgg: ProjectAgg[], obsRows: ObsRow[], summRows: SummaryRow[]): ProjectDigest[] {
    const names = new Set<string>([...projAgg.map(p => p.project), ...obsRows.map(o => o.project), ...summRows.map(s => s.project)]);
    const timeOf = new Map(projAgg.map(p => [p.project, p.total_ms]));
    return Array.from(names).map(project => {
      const ss = summRows.filter(s => s.project === project);
      const os = obsRows.filter(o => o.project === project);
      return {
        project,
        totalMs: timeOf.get(project) ?? 0,
        completed: toBullets(ss.map(s => s.completed), 10),
        learned: toBullets(ss.map(s => s.learned), 4),
        observations: os.slice(0, 6).map(o => ({ type: o.type, title: (o.title || o.subtitle || o.narrative || '').trim() })).filter(o => o.title),
      };
    })
    // 日报只罗列“值得一提”的项目:① AI 工时 ≥ 10 分钟(连同其任务,不足者直接忽略);
    // ② 且有具体工作内容(总结/收获/观察记录)。按耗时从多到少排序。
    .filter(d => d.totalMs >= MIN_PROJECT_MS && (d.completed.length > 0 || d.learned.length > 0 || d.observations.length > 0))
    .sort((a, b) => b.totalMs - a.totalMs);
  }

  /** 标题 + 概览统计表(确定性、事实)+ 正文(AI 或降级)。 */
  private assemble(user: string, reportDate: string, stats: DailyReportStats, body: string): string {
    const overview = [
      `# 日报 · ${user} · ${reportDate}`,
      '',
      `> 数据来源:claude-mem · 日期:${reportDate}`,
      '',
      '## 概览',
      '',
      '| 总AI时长 | 项目 | 任务(提示词) | 观察 | 总结 | 会话 |',
      '| --- | --- | --- | --- | --- | --- |',
      `| ${fmtDuration(stats.totalMs)} | ${stats.projects} | ${stats.prompts} | ${stats.obs} | ${stats.summaries} | ${stats.sessions} |`,
      '',
    ].join('\n');
    return `${overview}\n${body.trim()}\n`;
  }

  /** 降级:确定性简版正文(只汇总,不臆造)。 */
  private fallbackBody(stats: DailyReportStats, digests: ProjectDigest[]): string {
    const top = digests.slice(0, 8);
    const topNames = top.slice(0, 3).map(d => d.project.split('/').pop() || d.project);
    const L: string[] = [];
    L.push('## 一、今日工作概述');
    L.push('');
    L.push(`今日在 ${stats.projects} 个项目上累计投入约 ${fmtDuration(stats.totalMs)},完成 ${stats.prompts} 项任务,产出 ${stats.obs} 条工作记录与 ${stats.summaries} 篇会话总结。` +
      (topNames.length ? `主要精力集中在 ${topNames.join('、')} 等项目。` : '') +
      '（未启用 AI 提炼,以下为系统自动汇总,仅供参考。）');
    L.push('');
    L.push('## 二、今日重点工作');
    L.push('');
    if (top.length === 0) { L.push('_今日无可汇总的工作记录。_'); L.push(''); }
    for (const d of top) {
      L.push(`### 项目 ${d.project}  ·  耗时 ${fmtDuration(d.totalMs)}`);
      L.push('');
      for (const c of d.completed.slice(0, 6)) L.push(`- ${clip(c, 80)}`);
      if (d.completed.length === 0) {
        for (const o of d.observations.slice(0, 4)) L.push(`- ${clip(o.title, 80)}`);
      }
      L.push('');
    }
    return L.join('\n');
  }

  /**
   * DashScope Key 解析:env `DASHSCOPE_API_KEY` 优先;缺失则回退 settings.json。
   * 两者皆空 → 返回 ''(AI 段禁用)。
   */
  private resolveApiKey(): string {
    const envKey = (process.env.DASHSCOPE_API_KEY ?? '').trim();
    if (envKey) return envKey;
    try {
      return (SettingsDefaultsManager.loadFromFile(USER_SETTINGS_PATH).DASHSCOPE_API_KEY ?? '').trim();
    } catch { return ''; }
  }

  /**
   * 用 Qwen 把当日数据提炼成**简短**的日报正文(两章:概述 + 重点工作)。
   * 缺 Key / 无内容 / 失败超时 → 返回 null(降级)。
   */
  private async synthesize(user: string, reportDate: string, stats: DailyReportStats, digests: ProjectDigest[], model: string): Promise<string | null> {
    const apiKey = this.resolveApiKey();
    if (!apiKey) return null;
    if (digests.length === 0) return null;
    if (stats.obs === 0 && stats.summaries === 0) return null;

    const projectBlocks = digests.slice(0, MAX_PROJECTS_IN_PROMPT).map(d => {
      const lines = [`【${d.project}】 耗时 ${fmtDuration(d.totalMs)}`];
      if (d.completed.length) lines.push('完成:' + d.completed.slice(0, 8).map(c => clip(c, 140)).join(' | '));
      if (d.learned.length) lines.push('收获:' + d.learned.slice(0, 4).map(c => clip(c, 100)).join(' | '));
      if (d.observations.length) lines.push('记录:' + d.observations.map(o => `[${o.type}]${clip(o.title, 36)}`).join('; '));
      return lines.join('\n');
    }).join('\n\n');

    const facts =
      `用户:${user}\n日期:${reportDate}\n` +
      `总AI耗时:${fmtDuration(stats.totalMs)};项目数:${stats.projects};任务数:${stats.prompts};观察:${stats.obs};总结:${stats.summaries};会话:${stats.sessions}\n\n` +
      `各项目(已剔除 AI 工时不足 10 分钟的琐碎项目,按耗时从多到少排序):\n${projectBlocks}`;

    const instruction =
      '你是工程团队的技术主管。请依据某员工**今天**的真实工作数据,撰写一份**简短、罗列重点**的中文日报正文。' +
      '只依据所给数据、不要编造、不要包含未提供的信息,不要输出一级标题(#),直接从"## 一、"开始,严格两章、无多余章节。\n\n' +
      '【语言要求】整份日报使用**简体中文**;源数据中的英文工作记录请用中文**转述其含义**,绝不照抄英文整句。' +
      '仅专有名词、项目/产品名称、文件路径、代码标识符、命令、commit 号等保留原文。\n\n' +
      '## 一、今日工作概述\n用**一段话(80~150字)**概括今天主要做了什么、解决了什么问题。简要即可,不要长篇。\n\n' +
      '## 二、今日重点工作\n按项目分组、**按耗时从多到少**排列。每个项目用三级标题,格式严格为 `### 项目 <完整项目路径> · 耗时X`' +
      '(`<完整项目路径>`逐字照抄数据中的项目标识,作为唯一 ID,严禁简写/翻译/占位)。其下用要点(`- `)**简要**罗列今天该项目完成的重点工作,' +
      '**每条一句话讲清做了什么**(精炼,不要展开成段落),**单个项目要点不超过 6 条**,次要的合并或省略。' +
      '数据中给出的项目(已剔除工时不足 10 分钟者)都应出现,不要再提及任何琐碎或一带而过的工作。\n\n' +
      '全文务必简短克制,只罗列重点,避免冗长。直接输出 Markdown 正文,不要用三个反引号代码块把整篇包起来。\n\n数据如下:\n\n' + facts;

    const sys = '你是严谨的技术主管,只依据给定数据撰写**简短**的工作日报。全文简体中文,把英文工作记录转述为中文(仅保留专有名词/路径/代码/命令/commit);要点罗列、说明从简,绝不臆造。';

    const body = await this.callQwen(apiKey, model, [
      { role: 'system', content: sys },
      { role: 'user', content: instruction },
    ]);
    if (body) logger.info('WORKER', 'Daily report synthesized', { user, date: reportDate, projects: digests.length });
    return body;
  }

  /** 调用 Qwen/DashScope chat/completions;失败/超时返回 null。 */
  private async callQwen(apiKey: string, model: string, messages: Array<{ role: string; content: string }>): Promise<string | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
    try {
      const resp = await fetch(DASHSCOPE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, messages, stream: false, temperature: 0.4, max_tokens: 8192 }),
        signal: controller.signal,
      });
      if (!resp.ok) { logger.warn('WORKER', 'DashScope non-2xx (daily)', { status: resp.status }); return null; }
      const data = await resp.json() as { choices?: Array<{ message?: { content?: string } }> };
      const content = data.choices?.[0]?.message?.content?.trim();
      return content && content.length > 0 ? content : null;
    } catch (err) {
      logger.warn('WORKER', 'DashScope call failed (daily)', { error: err instanceof Error ? err.message : String(err) });
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}
