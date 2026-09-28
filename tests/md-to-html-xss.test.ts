import { describe, it, expect } from 'bun:test';

import { mdInline, mdToHtml } from '../src/services/worker/reports/mdToHtml.js';

/**
 * Security regression for R-001: report Markdown is AI-synthesized from
 * observation content (which can be attacker-influenced, e.g. via synced
 * observations in server mode). A crafted `[x](javascript:…)` link must never
 * become a clickable XSS vector in the rendered `/report` / `/daily-report`
 * pages. Only http(s)/mailto and same-origin relative hrefs are allowed;
 * everything else degrades to the plain link label.
 */
describe('mdToHtml link href sanitization (R-001)', () => {
  const unsafe = [
    '[click](javascript:alert(1))',
    '[click](JaVaScRiPt:alert(1))',
    '[x](data:text/html,<script>alert(1)</script>)',
    '[x](vbscript:msgbox(1))',
  ];

  for (const md of unsafe) {
    it(`rejects unsafe scheme: ${md}`, () => {
      const html = mdInline(md);
      expect(html.toLowerCase()).not.toContain('href="javascript');
      expect(html.toLowerCase()).not.toContain('href="data:');
      expect(html.toLowerCase()).not.toContain('href="vbscript');
      // No anchor is emitted at all; the label survives as plain text.
      expect(html).not.toContain('<a ');
    });
  }

  it('keeps the link label as text when the scheme is unsafe', () => {
    // Paren-free payload so the label is recovered exactly (parens in a URL are
    // truncated by the markdown link regex, but never produce an <a>).
    expect(mdInline('[hello](javascript:alert1)')).toBe('hello');
  });

  it('allows https / mailto / relative / anchor hrefs', () => {
    expect(mdInline('[a](https://example.com)')).toContain('href="https://example.com"');
    expect(mdInline('[a](http://example.com)')).toContain('href="http://example.com"');
    expect(mdInline('[m](mailto:a@b.com)')).toContain('href="mailto:a@b.com"');
    expect(mdInline('[r](/report?user=x)')).toContain('href="/report?user=x"');
    expect(mdInline('[h](#sec)')).toContain('href="#sec"');
  });

  it('still HTML-escapes the surrounding text', () => {
    const html = mdInline('a <b> & "c" [ok](https://x.com)');
    expect(html).toContain('&lt;b&gt;');
    expect(html).toContain('&amp;');
    expect(html).toContain('href="https://x.com"');
  });

  it('renders a safe link inside a full markdown block', () => {
    const out = mdToHtml('- see [docs](https://docs.example.com)\n- bad [x](javascript:alert(1))');
    expect(out).toContain('href="https://docs.example.com"');
    expect(out.toLowerCase()).not.toContain('javascript:');
  });
});
