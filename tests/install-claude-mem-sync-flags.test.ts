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
const SKILL = readFileSync('skills/install-claude-mem/SKILL.md', 'utf-8');

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
    expect(SCRIPT).toContain("CLAUDE_MEM_SYNC_AUTH_MODE = 'apikey'");
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

  it('health checks have total timeouts so hung workers cannot block reinstall', () => {
    expect(SCRIPT).toContain('--connect-timeout 2 --max-time 3 "http://127.0.0.1:${port}/api/health"');
    expect(SCRIPT).toContain('--connect-timeout 1 --max-time 2');
  });

  it('worker stop can find a stuck listener by port on macOS/Linux', () => {
    expect(SCRIPT).toContain('find_pid_listening_on_port()');
    expect(SCRIPT).toContain('lsof -tiTCP:"${port}" -sTCP:LISTEN');
    expect(SCRIPT).toContain('fuser "${port}/tcp"');
  });

  it('worker stop uses Windows netstat and taskkill under Git Bash/MSYS', () => {
    expect(SCRIPT).toContain('is_windows_shell()');
    expect(SCRIPT).toContain('MINGW*|MSYS*|CYGWIN*');
    expect(SCRIPT).toContain('netstat -ano');
    expect(SCRIPT).toContain('taskkill //PID "$pid" //T //F');
  });

  it('tree-sitter binary injection maps Windows to the upstream asset names', () => {
    expect(SCRIPT).toContain('MINGW*|MSYS*|CYGWIN*) TS_OS="windows"');
    expect(SCRIPT).toContain('i386|i686) TS_ARCH="x86"');
    expect(SCRIPT).toContain('ts_exe="tree-sitter.exe"');
    expect(SCRIPT).toContain('gunzip -c "$LOCAL_TS_BINARY_GZ" > "$ts_dir/$ts_exe"');
  });

  it('install skill stays aligned with the root installer entrypoints', () => {
    expect(SKILL).toContain('薄封装');
    expect(SKILL).toContain('./install-claude-mem -i claude --role server');
    expect(SKILL).toContain('./install-claude-mem -i claude --role client');
    expect(SKILL).toContain('./install-claude-mem -r claude');
    expect(SKILL).toContain('bash ./install-claude-mem');
    expect(SKILL).toContain('worker.pid');
    expect(SKILL).not.toContain('/Users/johnson/wks/ai/plugins/claude-mem');
  });
});
