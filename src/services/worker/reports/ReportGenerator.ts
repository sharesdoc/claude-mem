import { Database } from 'bun:sqlite';
import { logger } from '../../../utils/logger.js';

/**
 * ReportGenerator — 用户工作周报生成器 (B-周报设计文档 §5.4)。
 *
 * 混合生成:先用数据库数据聚合出本周 user×project 的工时与工作内容,再用
 * Qwen(阿里云 DashScope,OpenAI 兼容接口)把原始数据**提炼**成一份有重点、
 * 限篇幅的中文周报正文(总体概述 → 按工时罗列任务 → 项目详述 → 下周建议 →
 * 经验教训)。Qwen 凭证直接读环境变量 DASHSCOPE_API_KEY;未配置或调用失败则
 * 退回确定性简版(只汇总,不臆造)。本生成器只读源表,不改采集链路。
 */

const DAY_MS = 86400000;
const DASHSCOPE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
const AI_TIMEOUT_MS = 90000;
const MAX_PROJECTS_IN_PROMPT = 8;
// 工作任务里只体现"值得一提"的项目:本周耗时 > 1 小时,且有具体工作内容。
const MIN_PROJECT_MS = 60 * 60 * 1000;

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

interface ProjectAgg { project: string; prompts: number; total_ms: number; }
interface ObsRow { project: string; type: string; title: string | null; subtitle: string | null; narrative: string | null; }
interface SummaryRow { project: string; request: string | null; completed: string | null; learned: string | null; investigated: string | null; next_steps: string | null; }

/** 单项目本周聚合(供拼装、AI 提示、降级共用)。 */
interface ProjectDigest {
  project: string;
  totalMs: number;
  completed: string[];
  learned: string[];
  observations: Array<{ type: string; title: string }>;
}

/** 给定真实 epoch,返回其所在 ISO 周(周一起)的周一**本地**日期 'YYYY-MM-DD'。 */
export function weekMondayOf(epochMs: number, tzOffsetMs: number): string {
  const shifted = new Date(epochMs + tzOffsetMs);
  const wd = shifted.getUTCDay();
  const dayStartWall = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate());
  const monday = dayStartWall - (wd === 0 ? 6 : wd - 1) * DAY_MS;
  const dt = new Date(monday);
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

  async generate(userLabel: string, weekStart: string, tzOffsetMs: number, model: string): Promise<GeneratedReport> {
    const [y, m, d] = weekStart.split('-').map(Number);
    const wallStart = Date.UTC(y, m - 1, d);
    const start = wallStart - tzOffsetMs; // 真实 epoch 区间 [start, end)
    const end = wallStart + 7 * DAY_MS - tzOffsetMs;
    const weekEnd = this.fmtYMD(wallStart + 6 * DAY_MS);
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
      totalMs, projects: projects.size || (sessRow?.projects ?? 0),
      prompts, obs: obsRows.length, summaries: summRows.length, sessions: sessRow?.sessions ?? 0,
    };

    const digests = this.digestByProject(projAgg, obsRows, summRows);

    // ── 正文:优先 AI 提炼,失败/无 Key 退回确定性简版 ────────────────
    const aiBody = await this.synthesize(user, weekStart, weekEnd, stats, digests, model);
    const body = aiBody ?? this.fallbackBody(stats, digests);
    const markdown = this.assemble(user, weekStart, weekEnd, stats, body);

    return {
      user_label: user, week_start: weekStart, week_end: weekEnd, markdown, stats,
      model: aiBody ? model : '', generated_at_epoch: Date.now(),
    };
  }

  private fmtYMD(wallMs: number): string {
    const dt = new Date(wallMs);
    return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
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
        completed: toBullets(ss.map(s => s.completed), 12),
        learned: toBullets(ss.map(s => s.learned), 6),
        observations: os.slice(0, 6).map(o => ({ type: o.type, title: (o.title || o.subtitle || o.narrative || '').trim() })).filter(o => o.title),
      };
    })
    // 排除:本周耗时 ≤ 1 小时、或没有具体工作内容(无总结/收获/观察)的项目。
    .filter(d => d.totalMs > MIN_PROJECT_MS && (d.completed.length > 0 || d.learned.length > 0 || d.observations.length > 0))
    .sort((a, b) => b.totalMs - a.totalMs);
  }

  /** 标题 + 概览统计表(确定性、事实)+ 正文(AI 或降级)。 */
  private assemble(user: string, weekStart: string, weekEnd: string, stats: ReportStats, body: string): string {
    const overview = [
      `# 周报 · ${user} · ${weekStart} ~ ${weekEnd}`,
      '',
      `> 数据来源:claude-mem · 周期:${weekStart}(周一) ~ ${weekEnd}(周日)`,
      '',
      '## 概览',
      '',
      // 日均 AI 时长按一周 5 个工作日计(与 History 周表的 AVG/DAY 口径一致)。
      '| 总AI时长 | 日均AI时长 | 项目 | 任务(提示词) | 观察 | 总结 | 会话 |',
      '| --- | --- | --- | --- | --- | --- | --- |',
      `| ${fmtDuration(stats.totalMs)} | ${fmtDuration(Math.round(stats.totalMs / 5))} | ${stats.projects} | ${stats.prompts} | ${stats.obs} | ${stats.summaries} | ${stats.sessions} |`,
      '',
    ].join('\n');
    return `${overview}\n${body.trim()}\n`;
  }

  /** 降级:确定性简版正文(只汇总,不臆造下周建议/经验教训)。 */
  private fallbackBody(stats: ReportStats, digests: ProjectDigest[]): string {
    const top = digests.filter(d => d.completed.length || d.totalMs > 0).slice(0, 6);
    const topNames = top.slice(0, 3).map(d => d.project.split('/').pop() || d.project);
    const L: string[] = [];
    L.push('## 一、本周总体概述');
    L.push('');
    L.push(`本周在 ${stats.projects} 个项目上累计投入约 ${fmtDuration(stats.totalMs)},完成 ${stats.prompts} 项任务,产出 ${stats.obs} 条工作记录与 ${stats.summaries} 篇会话总结。` +
      (topNames.length ? `主要精力集中在 ${topNames.join('、')} 等项目。` : '') +
      '（未启用 AI 提炼,以下为系统自动汇总,仅供参考。）');
    L.push('');
    L.push('## 二、本周工作任务');
    L.push('');
    if (top.length === 0) { L.push('_本周无可汇总的工作记录。_'); L.push(''); }
    for (const d of top) {
      L.push(`### 项目 ${d.project}  ·  耗时 ${fmtDuration(d.totalMs)}`);
      L.push('');
      for (const c of d.completed.slice(0, 10)) L.push(`- ${clip(c, 100)}`);
      if (d.completed.length === 0) L.push('- （本周该项目无会话总结记录）');
      L.push('');
    }
    return L.join('\n');
  }

  /**
   * 用 Qwen 把原始数据提炼成结构化、限篇幅的周报正文(一~五)。
   * 读 env DASHSCOPE_API_KEY,缺失或任何失败/超时 → 返回 null(降级)。
   */
  private async synthesize(user: string, weekStart: string, weekEnd: string, stats: ReportStats, digests: ProjectDigest[], model: string): Promise<string | null> {
    const apiKey = (process.env.DASHSCOPE_API_KEY ?? '').trim();
    if (!apiKey) return null;
    if (digests.length === 0) return null; // 过滤后无值得一提的项目
    if (stats.prompts === 0 && stats.obs === 0 && stats.summaries === 0) return null;

    const projectBlocks = digests.slice(0, MAX_PROJECTS_IN_PROMPT).map(d => {
      const lines = [`【${d.project}】 耗时 ${fmtDuration(d.totalMs)}`];
      if (d.completed.length) lines.push('完成:' + d.completed.slice(0, 10).map(c => clip(c, 160)).join(' | '));
      if (d.learned.length) lines.push('收获:' + d.learned.slice(0, 5).map(c => clip(c, 120)).join(' | '));
      if (d.observations.length) lines.push('记录:' + d.observations.map(o => `[${o.type}]${clip(o.title, 40)}`).join('; '));
      return lines.join('\n');
    }).join('\n\n');

    const facts =
      `用户:${user}\n周期:${weekStart} ~ ${weekEnd}\n` +
      `总AI耗时:${fmtDuration(stats.totalMs)};项目数:${stats.projects};任务数:${stats.prompts};观察:${stats.obs};总结:${stats.summaries};会话:${stats.sessions}\n\n` +
      `各项目(已按耗时从多到少排序):\n${projectBlocks}`;

    const instruction =
      '你是工程团队的技术主管。请依据某员工本周的真实工作数据,撰写一份**简洁、有重点、面向汇报**的中文周报正文。' +
      '严格遵守下面的结构与篇幅,只依据所给数据、不要编造、不要包含未提供的信息,不要输出一级标题(#),直接从"## 一、"开始。\n\n' +
      '【语言要求·重要】整份周报必须使用**简体中文**撰写。源数据中的工作记录可能是英文,请用中文**转述其含义**,绝不要直接照抄英文句子。' +
      '仅在以下情形保留原文:专有名词、产品/项目名称、人名、文件路径、代码标识符(函数/字段/类名)、命令、环境变量、commit 号等;其余内容(动词、说明、连接词、句子)一律用中文。\n\n' +
      '## 一、本周总体概述\n用**一段话(200~300字)**概括:本周主要做了什么、解决了什么问题、取得了什么成果、整体进展如何。要有结论、有重点,像写给主管看的开篇综述。\n\n' +
      '## 二、本周工作任务\n按项目分组,**按投入工时从多到少排列**(重点项目在前、多写;次要项目少写或合并)。' +
      '每个项目用三级标题,格式严格为 `### 项目 <完整项目路径> · 耗时X`。其中 `<完整项目路径>` 必须**逐字照抄**数据中给出的项目标识(通常是绝对路径,它就是该项目的唯一 ID),' +
      '**严禁简写、缩写、翻译或用"项目名"之类占位词**;`耗时X` 用数据中该项目的耗时。\n' +
      '在每个项目标题下,用要点(`- `)分条描述该项目本周完成的工作。**每条要点要说清四件事:完成了什么任务、用了什么方法、解决了什么问题、达到了什么效果**(2~4 句,精炼专业)。' +
      '关键工作要点不要遗漏,但也不要堆砌流水账;**单个项目的任务要点最多不超过 10 条**,次要的合并或省略。\n\n' +
      '## 三、下周工作建议\n给出 3~5 条可执行的建议(基于本周进展与遗留)。\n\n' +
      '## 四、本周经验与教训\n总结 2~4 条本周的经验或值得改进之处。\n\n' +
      '全文要精炼克制,重点突出,避免冗长。\n' +
      '【输出前请自查】务必确保:① 四个章节(一、二、三、四)齐全,且**没有**多余章节(如"项目详述");' +
      '② "本周工作任务"下每个项目标题严格为 `### 项目 <完整项目路径> · 耗时X`;' +
      '③ 单个项目的任务要点不超过 10 条;④ 全文简体中文(仅专有名词/路径/代码/命令/commit 保留原文);' +
      '⑤ 直接输出 Markdown 正文,不要用三个反引号代码块把整篇包起来。\n\n数据如下:\n\n' + facts;

    const sys = '你是严谨的技术主管,只依据给定数据撰写工作周报。全文必须使用简体中文,把英文工作记录转述为中文(仅保留专有名词/名称/路径/代码标识/命令/commit);语言精炼、重点突出、严格控制篇幅,绝不臆造。';

    let body = await this.callQwen(apiKey, model, [
      { role: 'system', content: sys },
      { role: 'user', content: instruction },
    ]);
    if (!body) return null;

    // ── 生成后自检:核查是否符合结构/格式要求;有问题就带着问题让模型修正,最多 2 轮 ──
    let issues = this.validateBody(body);
    for (let attempt = 0; issues.length > 0 && attempt < 2; attempt++) {
      logger.info('WORKER', 'Weekly report self-check found issues, repairing', { attempt: attempt + 1, issues });
      const repair =
        '你上一版周报正文存在以下不符合要求的问题,请**逐一修正**,在保持内容真实、不新增未提供信息的前提下,' +
        '严格按要求重新输出**完整正文**(从"## 一、"开始,不要任何解释,不要用代码块包裹):\n\n问题清单:\n' +
        issues.map((s, i) => `${i + 1}. ${s}`).join('\n') + '\n\n上一版正文:\n' + body;
      const fixed = await this.callQwen(apiKey, model, [
        { role: 'system', content: sys },
        { role: 'user', content: repair },
      ]);
      if (!fixed) break;
      body = fixed;
      issues = this.validateBody(body);
    }
    if (issues.length) logger.warn('WORKER', 'Weekly report still has issues after repair attempts', { issues });
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
        body: JSON.stringify({ model, messages, stream: false, temperature: 0.4, max_tokens: 6000 }),
        signal: controller.signal,
      });
      if (!resp.ok) { logger.warn('WORKER', 'DashScope non-2xx', { status: resp.status }); return null; }
      const data = await resp.json() as { choices?: Array<{ message?: { content?: string } }> };
      const content = data.choices?.[0]?.message?.content?.trim();
      return content && content.length > 0 ? content : null;
    } catch (err) {
      logger.warn('WORKER', 'DashScope call failed', { error: err instanceof Error ? err.message : String(err) });
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  /** 核查 AI 周报正文是否符合结构/格式/篇幅要求,返回问题清单(空数组=合格)。 */
  private validateBody(body: string): string[] {
    const issues: string[] = [];
    if (!/##\s*一/.test(body)) issues.push('缺少"## 一、本周总体概述"章节');
    if (!/##\s*二/.test(body)) issues.push('缺少"## 二、本周工作任务"章节');
    if (!/##\s*三/.test(body)) issues.push('缺少"## 三、下周工作建议"章节');
    if (!/##\s*四/.test(body)) issues.push('缺少"## 四、本周经验与教训"章节');
    if (/##\s*五/.test(body) || body.includes('项目详述')) issues.push('包含多余章节(如"项目详述"或第五章),请删除,只保留一~四');
    if (body.includes('数据未提供') || body.includes('未提供具体')) issues.push('出现"数据未提供"之类占位——这类没有具体内容的项目应直接省略,不要写进周报');
    if (/```/.test(body)) issues.push('整篇被代码块(三个反引号)包裹了,请直接输出 Markdown 正文');

    // 取"## 二"到"## 三"之间作为本周工作任务段,逐项目校验
    const m = body.match(/##\s*二[\s\S]*?(?=\n##\s*三|$)/);
    const sec2 = m ? m[0] : '';
    const blocks = sec2.split(/\n(?=###\s)/).slice(1);
    if (blocks.length === 0) issues.push('"本周工作任务"下没有列出任何项目');
    for (const blk of blocks) {
      const head = (blk.match(/^###\s.*/) || [''])[0].trim();
      if (!/^###\s*项目\s+\S/.test(head)) issues.push(`项目标题格式不符,应为"### 项目 <完整项目路径> · 耗时X":${head}`);
      else if (!head.includes('耗时')) issues.push(`项目标题缺少耗时信息:${head}`);
      const bullets = (blk.match(/^-\s/gm) || []).length;
      if (bullets === 0) issues.push(`项目标题"${head}"下没有任务要点`);
      if (bullets > 10) issues.push(`项目"${head}"任务要点超过10条(当前${bullets}条),请精简到10条以内`);
    }
    return issues;
  }
}
