/**
 * mdToHtml — 最小化、零依赖的 Markdown → HTML 渲染(供周报/日报整页 HTML 共用)。
 *
 * 支持:#..###### 标题、GFM 表格、-/* 与 1. 列表、> 引用、--- 分隔线、段落,
 * 以及行内 `code`、**bold**、[text](url)。足够覆盖本项目生成的报告正文。
 */

/** HTML-escape text (used inside generated report HTML). */
export function htmlEscape(s: string): string {
  return s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
}

/**
 * Only http(s)/mailto and same-origin relative URLs are allowed as link hrefs.
 * Anything else (javascript:, data:, vbscript:, …) is rejected so a crafted
 * `[x](javascript:…)` in report content cannot become a clickable XSS vector.
 * `url` is the already-HTML-escaped capture; entity-encoded scheme tricks
 * (e.g. `&#106;avascript:`) fail this whitelist too and render as plain text.
 */
function isSafeHref(url: string): boolean {
  return /^(?:https?:|mailto:|\/|#|\.\.?\/)/i.test(url.trim());
}

/** Inline Markdown → HTML: escape, then `code`, **bold**, [text](url). */
export function mdInline(s: string): string {
  let t = htmlEscape(s);
  t = t.replace(/`([^`]+)`/g, (_m, c: string) => `<code>${c}</code>`);
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // Unsafe-scheme links degrade to plain text (the link label), never an <a>.
  t = t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, text: string, url: string) =>
    isSafeHref(url) ? `<a href="${url}" target="_blank" rel="noreferrer">${text}</a>` : text);
  return t;
}

/**
 * Minimal self-contained Markdown → HTML for reports (no external dep).
 * Supports: #..###### headings, GFM tables, -/* and 1. lists, > blockquotes,
 * --- rules, paragraphs, and inline code/bold/links. Sufficient for our reports.
 */
export function mdToHtml(md: string): string {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let listType: 'ul' | 'ol' | null = null;
  let para: string[] = [];
  const closeList = () => { if (listType) { out.push(`</${listType}>`); listType = null; } };
  const flushPara = () => { if (para.length) { out.push(`<p>${mdInline(para.join(' '))}</p>`); para = []; } };

  const parseRow = (r: string): string[] =>
    r.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());

  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t === '') { flushPara(); closeList(); continue; }

    const h = t.match(/^(#{1,6})\s+(.*)$/);
    if (h) { flushPara(); closeList(); const lvl = h[1].length; out.push(`<h${lvl}>${mdInline(h[2])}</h${lvl}>`); continue; }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) { flushPara(); closeList(); out.push('<hr/>'); continue; }

    if (t.startsWith('>')) { flushPara(); closeList(); out.push(`<blockquote>${mdInline(t.replace(/^>\s?/, ''))}</blockquote>`); continue; }

    // GFM table: header row followed by a |---|---| separator row
    const next = (lines[i + 1] ?? '').trim();
    if (t.startsWith('|') && /^\|?[\s:|-]+\|?$/.test(next) && next.includes('-')) {
      flushPara(); closeList();
      const headers = parseRow(t);
      i += 1; // consume separator
      let tbl = '<table><thead><tr>' + headers.map(c => `<th>${mdInline(c)}</th>`).join('') + '</tr></thead><tbody>';
      while (i + 1 < lines.length && lines[i + 1].trim().startsWith('|')) {
        i += 1;
        tbl += '<tr>' + parseRow(lines[i].trim()).map(c => `<td>${mdInline(c)}</td>`).join('') + '</tr>';
      }
      tbl += '</tbody></table>';
      out.push(tbl);
      continue;
    }

    const ul = t.match(/^[-*]\s+(.*)$/);
    if (ul) { flushPara(); if (listType !== 'ul') { closeList(); out.push('<ul>'); listType = 'ul'; } out.push(`<li>${mdInline(ul[1])}</li>`); continue; }

    const ol = t.match(/^\d+\.\s+(.*)$/);
    if (ol) { flushPara(); if (listType !== 'ol') { closeList(); out.push('<ol>'); listType = 'ol'; } out.push(`<li>${mdInline(ol[1])}</li>`); continue; }

    closeList();
    para.push(t);
  }
  flushPara(); closeList();
  return out.join('\n');
}
