import { describe, it, expect } from 'bun:test';
import { readFileSync } from 'fs';

/**
 * T-26 — verify that the install script wires --role / --upstream /
 * --label / --api-key into apply_sync_settings.
 *
 * We don't actually invoke the installer (it touches real
 * ~/.claude/...). Instead we grep the script for the contract:
 *  - help text mentions every new flag
 *  - main() parses each flag
 *  - apply_sync_settings writes the expected settings keys
 */

const SCRIPT = readFileSync('install-claude-mem', 'utf-8');

describe('install-claude-mem T-26 sync flags', () => {
  it('parses --role, --upstream, --label, --api-key in main()', () => {
    expect(SCRIPT).toMatch(/--role\)\s+sync_role=/);
    expect(SCRIPT).toMatch(/--upstream\)\s+sync_upstream=/);
    expect(SCRIPT).toMatch(/--label\)\s+sync_label=/);
    expect(SCRIPT).toMatch(/--api-key\)\s+sync_api_key=/);
  });

  it('apply_sync_settings writes the canonical settings keys', () => {
    expect(SCRIPT).toContain('CLAUDE_MEM_NODE_ROLE');
    expect(SCRIPT).toContain('CLAUDE_MEM_SYNC_UPSTREAM_URL');
    expect(SCRIPT).toContain('CLAUDE_MEM_USER_LABEL');
    expect(SCRIPT).toContain('CLAUDE_MEM_SYNC_API_KEY');
    expect(SCRIPT).toContain("env.CLAUDE_MEM_SYNC_AUTH_MODE = 'apikey'");
  });

  it('server mode auto-sets BIND_HOST to 0.0.0.0', () => {
    expect(SCRIPT).toMatch(/CLAUDE_MEM_SERVER_BIND_HOST\s*=\s*'0\.0\.0\.0'/);
  });

  it('client mode defaults --label to whoami', () => {
    expect(SCRIPT).toMatch(/sync_label="\$\(whoami\)"/);
  });

  it('help text documents every new flag', () => {
    expect(SCRIPT).toMatch(/--role.*client.*server/);
    expect(SCRIPT).toMatch(/--upstream\s+<URL>/);
    expect(SCRIPT).toMatch(/--label\s+<NAME>/);
    expect(SCRIPT).toMatch(/--api-key\s+<KEY>/);
  });
});
